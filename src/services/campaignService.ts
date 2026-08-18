/**
 * Campaign management (design.md §2.2 application services, §4 Phase 1 item 1):
 * create / list / duplicate / delete, plus opening a campaign into a live event
 * store. Export/import already lives in `db/exportImport.ts` and is re-exported
 * here so callers have one place to look.
 *
 * Everything a campaign *is* lives in its event log. The Dexie `campaigns` row is
 * a read-model: enough to draw the picker without replaying anything. That means
 * every write goes "append event(s), then refresh the read-model", never the other
 * way round, and `metaFromState` is the single function that derives one from the
 * other — see `src/content/manifest.ts` for why the pack manifest follows the same
 * rule.
 */

import type { MaladumDB, CampaignMeta } from '../db/database'
import {
  appendEvents,
  createCampaign as putCampaignRow,
  deleteCampaign as deleteCampaignRow,
  getCampaign,
  listCampaigns as listCampaignRows,
  loadEvents,
} from '../db/repository'
import { createEventStore, type EventStore } from '../store/eventStore'
import { campaignReducer, emptyCampaign, type CampaignState } from '../store/campaign/projection'
import type { CampaignEvent } from '../store/campaign/events'
import type { ContentLibrary } from '../content/loader'
import {
  compareManifests,
  manifestFrom,
  type ManifestIssue,
  type PackRef,
} from '../content/manifest'

export { exportCampaign, importCampaign } from '../db/exportImport'

/** Id generator, injectable so tests get deterministic ids. */
export type IdFactory = () => string

const defaultIds: IdFactory = () =>
  // crypto.randomUUID is available in every browser this PWA targets, and in Node 19+.
  globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 10)}`

export interface CampaignServiceDeps {
  db: MaladumDB
  newId?: IdFactory
  now?: () => number
}

/** Derive the Dexie read-model row from a projected campaign state. */
export function metaFromState(state: CampaignState, updatedAt: number): CampaignMeta {
  if (state.id === null) throw new Error('Campaign log has no CAMPAIGN_CREATED event')
  return {
    id: state.id,
    name: state.name,
    createdAt: state.createdAt,
    updatedAt,
    contentPacks: state.contentPacks,
  }
}

/** Fold a log into campaign state (pure convenience wrapper). */
export function projectCampaign(events: CampaignEvent[]): CampaignState {
  return events.reduce(campaignReducer, emptyCampaign())
}

/**
 * Rewrite a copied event log so it belongs to a new campaign (pure).
 *
 * Only identity is rewritten: the copy keeps the whole original history, including
 * which content packs it was built against, because that history is what makes it
 * a faithful duplicate rather than a lookalike.
 */
export function duplicateEvents(
  events: CampaignEvent[],
  newId: string,
  newName: string,
): CampaignEvent[] {
  return events.map((e) => (e.t === 'CAMPAIGN_CREATED' ? { ...e, id: newId, name: newName } : e))
}

export interface CreateCampaignInput {
  name: string
  /** Manifest source — the library the campaign is being built against. */
  library: ContentLibrary
}

export interface CampaignSummary extends CampaignMeta {
  /** How the recorded manifest compares to the content installed right now. */
  manifestIssues: ManifestIssue[]
}

export function createCampaignService({
  db,
  newId = defaultIds,
  now = Date.now,
}: CampaignServiceDeps) {
  return {
    /**
     * Create a campaign: one `CAMPAIGN_CREATED` event carrying the pack manifest,
     * plus the read-model row derived from it.
     */
    async create(input: CreateCampaignInput): Promise<string> {
      const id = newId()
      const createdAt = now()
      const event: CampaignEvent = {
        t: 'CAMPAIGN_CREATED',
        id,
        name: input.name,
        contentPacks: manifestFrom(input.library),
        createdAt,
      }
      await putCampaignRow(db, metaFromState(projectCampaign([event]), createdAt))
      await appendEvents(db, id, [event], createdAt)
      return id
    },

    /** Campaigns for the picker, newest activity first, each with its compatibility report. */
    async list(library: ContentLibrary): Promise<CampaignSummary[]> {
      const available = manifestFrom(library)
      const rows = await listCampaignRows(db)
      return rows.map((row) => ({
        ...row,
        manifestIssues: compareManifests(row.contentPacks, available),
      }))
    },

    async get(campaignId: string): Promise<CampaignMeta | undefined> {
      return getCampaign(db, campaignId)
    },

    /**
     * Copy a campaign under a new id and name. The copy gets its own log; the
     * original is untouched, so duplicating before a risky Campaign Phase is a
     * cheap save-game.
     */
    async duplicate(campaignId: string, name?: string): Promise<string> {
      const source = await getCampaign(db, campaignId)
      if (!source) throw new Error(`Campaign not found: ${campaignId}`)
      const events = await loadEvents(db, campaignId)
      const id = newId()
      const copyName = name ?? `${source.name} (copy)`
      const at = now()
      const copied = duplicateEvents(events, id, copyName)
      await putCampaignRow(db, metaFromState(projectCampaign(copied), at))
      await appendEvents(db, id, copied, at)
      return id
    },

    /** Delete a campaign and its whole log. Irreversible — the UI must confirm. */
    async remove(campaignId: string): Promise<void> {
      await deleteCampaignRow(db, campaignId)
    },

    async rename(campaignId: string, name: string): Promise<void> {
      await this.commit(campaignId, [{ t: 'CAMPAIGN_RENAMED', name }])
    },

    /**
     * Open a campaign into a live event store hydrated from its log, alongside the
     * compatibility report against the content installed right now.
     */
    async open(
      campaignId: string,
      library: ContentLibrary,
    ): Promise<{
      store: EventStore<CampaignState, CampaignEvent>
      manifestIssues: ManifestIssue[]
    }> {
      const events = await loadEvents(db, campaignId)
      if (events.length === 0) throw new Error(`Campaign not found: ${campaignId}`)
      const store = createEventStore<CampaignState, CampaignEvent>({
        reducer: campaignReducer,
        initialState: emptyCampaign(),
      })
      store.hydrate(events)
      return {
        store,
        manifestIssues: compareManifests(store.state.contentPacks, manifestFrom(library)),
      }
    },

    /**
     * Append events and refresh the read-model row from the resulting projection.
     * The log is read back so the row can never drift from it — cheap at campaign
     * scale, and `eventStore`'s snapshotting is there for when it isn't.
     */
    async commit(campaignId: string, events: CampaignEvent[]): Promise<CampaignState> {
      const at = now()
      await appendEvents(db, campaignId, events, at)
      const state = projectCampaign(await loadEvents(db, campaignId))
      await putCampaignRow(db, metaFromState(state, at))
      return state
    },

    /**
     * Record that the player accepted the currently installed content packs for this
     * campaign, clearing a compatibility warning without rewriting history.
     */
    async acceptContentPacks(
      campaignId: string,
      library: ContentLibrary,
      reason?: string,
    ): Promise<PackRef[]> {
      const contentPacks = manifestFrom(library)
      await this.commit(campaignId, [
        { t: 'CONTENT_PACKS_CHANGED', contentPacks, at: now(), reason },
      ])
      return contentPacks
    },
  }
}

export type CampaignService = ReturnType<typeof createCampaignService>
