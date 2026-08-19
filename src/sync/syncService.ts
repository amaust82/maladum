/**
 * Cross-device sync (design.md §2.x). Additive on top of the local Dexie log — every
 * function here is best-effort and safe to call fire-and-forget: it no-ops when sync
 * isn't configured or the device is signed out, and swallows network failures rather
 * than throwing into the caller. Local play must work identically whether or not any
 * of this ever succeeds.
 *
 * `seq` is an event's zero-based position in the campaign's local log at push time.
 * The `(campaign_id, seq)` unique constraint in Supabase makes Postgres the ordering
 * arbiter: a conflicting push means another device got there first, so we pull its
 * events in, then re-push our own pending ones at the new, higher seq range. That's a
 * deliberate simplification — bulk-appended by whichever push wins the race, not
 * perfectly interleaved by wall-clock time — acceptable for a single-user tool with a
 * mostly additive event log. See the design doc for the tradeoff.
 *
 * `syncCampaign` pushes before it pulls, on purpose: `pushedCount` only means "the
 * first N local events are confirmed synced" while it equals the local event count.
 * Pulling first (appending someone else's events after an already-outstanding local
 * pending tail) would break that invariant and misalign the next push's accounting —
 * so any device with unsynced local history always flushes it first.
 */

import type { MaladumDB } from '../db/database'
import {
  appendEvents,
  createCampaign as putCampaignRow,
  getCampaign,
  getSyncState,
  loadEvents,
  setSyncState,
} from '../db/repository'
import type { CampaignEvent } from '../store/campaign/events'
import { campaignReducer, emptyCampaign } from '../store/campaign/projection'
import { getSession } from './authService'
import { supabase } from './supabaseClient'

/**
 * Fold a log into the read-model row (mirrors `campaignService.metaFromState` /
 * `projectCampaign`, reimplemented here rather than imported to avoid a circular
 * dependency — `campaignService` calls into this module, not the other way round).
 */
function metaFromEvents(events: CampaignEvent[], updatedAt: number) {
  const state = events.reduce(campaignReducer, emptyCampaign())
  if (state.id === null) throw new Error('Campaign log has no CAMPAIGN_CREATED event')
  return {
    id: state.id,
    name: state.name,
    createdAt: state.createdAt,
    updatedAt,
    contentPacks: state.contentPacks,
  }
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const session = await getSession()
  return session?.user.id ?? null
}

async function refreshReadModel(db: MaladumDB, campaignId: string): Promise<void> {
  const allEvents = await loadEvents(db, campaignId)
  await putCampaignRow(db, metaFromEvents(allEvents, Date.now()))
}

/** Push every local event this device hasn't pushed yet. No-op if sync unavailable/signed out. */
export async function pushPending(db: MaladumDB, campaignId: string): Promise<void> {
  const owner = await currentUserId()
  if (!owner || !supabase) return

  const events = await loadEvents(db, campaignId)
  const pushedCount = await getSyncState(db, campaignId)
  const pending = events.slice(pushedCount)
  if (pending.length === 0) return

  const meta = await getCampaign(db, campaignId)
  if (!meta) return

  const { error: campaignError } = await supabase
    .from('campaigns')
    .upsert({ id: campaignId, owner, name: meta.name })
  if (campaignError) throw campaignError

  const insertAt = async (base: number) => {
    const rows = pending.map((event, i) => ({
      campaign_id: campaignId,
      seq: base + i,
      payload: event,
    }))
    return supabase!.from('events').insert(rows)
  }

  const { error } = await insertAt(pushedCount)
  if (!error) {
    await setSyncState(db, campaignId, pushedCount + pending.length)
    return
  }
  if (error.code !== '23505') throw error

  // Another device claimed some of these seq numbers first: pull its events in, then
  // retry with the SAME in-memory `pending` list at the new base — never re-slice the
  // local log here, since it now has our still-unpushed tail sitting before whatever
  // pullNew just appended, and slicing by count would grab the wrong events.
  await pullNew(db, campaignId)
  const newBase = await getSyncState(db, campaignId)
  const { error: retryError } = await insertAt(newBase)
  if (retryError) throw retryError
  await setSyncState(db, campaignId, newBase + pending.length)
}

/** Pull any events at or after our last-confirmed-synced point that we don't have locally yet. */
export async function pullNew(db: MaladumDB, campaignId: string): Promise<void> {
  const owner = await currentUserId()
  if (!owner || !supabase) return

  const pushedCount = await getSyncState(db, campaignId)
  const { data, error } = await supabase
    .from('events')
    .select('seq, payload')
    .eq('campaign_id', campaignId)
    .gte('seq', pushedCount)
    .order('seq', { ascending: true })
  if (error) throw error
  if (!data || data.length === 0) return

  const newEvents = data.map((row) => row.payload as CampaignEvent)
  await appendEvents(db, campaignId, newEvents)
  await refreshReadModel(db, campaignId)
  await setSyncState(db, campaignId, pushedCount + newEvents.length)
}

/** Flush anything pending, then pull whatever's new. Errors are swallowed — best-effort only. */
export async function syncCampaign(db: MaladumDB, campaignId: string): Promise<void> {
  try {
    await pushPending(db, campaignId)
    await pullNew(db, campaignId)
  } catch {
    // Offline or a transient failure — the next commit/open retries.
  }
}

export interface RemoteCampaignSummary {
  id: string
  name: string
}

/**
 * Campaigns this account has pushed from *some* device, for the "open it on my
 * phone" case: a device that has never seen a campaign locally has no local row to
 * hang a sync trigger off, so it needs a way to discover what exists remotely before
 * `pullNew` (aka `downloadCampaign`) can bring it down.
 */
export async function listRemoteCampaigns(): Promise<RemoteCampaignSummary[]> {
  const owner = await currentUserId()
  if (!owner || !supabase) return []
  const { data, error } = await supabase.from('campaigns').select('id, name').eq('owner', owner)
  if (error) throw error
  return (data ?? []) as RemoteCampaignSummary[]
}

/** Pull a campaign's full log down to a device that has never seen it locally before. */
export async function downloadCampaign(db: MaladumDB, campaignId: string): Promise<void> {
  await pullNew(db, campaignId)
}
