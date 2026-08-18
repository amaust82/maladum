/**
 * Export / import a campaign to a single self-contained JSON file
 * (design.md §1 principle #5, §7 data-loss mitigation).
 *
 * The export IS the full event log plus metadata — restoring it replays the same
 * history. Imports are Zod-validated so a corrupted or hand-edited file is rejected
 * with a clear error instead of silently corrupting a campaign.
 */

import { z } from 'zod'
import type { MaladumDB, CampaignMeta } from './database'
import { appendEvents, createCampaign, loadEvents } from './repository'
import { CampaignEventSchema } from '../store/campaign/eventSchema'
import type { CampaignEvent } from '../store/campaign/events'

export const EXPORT_FORMAT_VERSION = 1 as const

const CampaignMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  contentPacks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
      schemaVersion: z.number(),
    }),
  ),
})

export const CampaignExportSchema = z.object({
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  campaign: CampaignMetaSchema,
  events: z.array(CampaignEventSchema),
})
export type CampaignExport = z.infer<typeof CampaignExportSchema>

/** Build the export document (pure — no I/O). */
export function buildExport(campaign: CampaignMeta, events: CampaignEvent[]): CampaignExport {
  return { formatVersion: EXPORT_FORMAT_VERSION, campaign, events }
}

/** Serialize a campaign export to a JSON string (pure). */
export function serializeExport(campaign: CampaignMeta, events: CampaignEvent[]): string {
  return JSON.stringify(buildExport(campaign, events), null, 2)
}

/** Parse + validate an export JSON string. Throws on malformed input or schema mismatch. */
export function parseExport(json: string): CampaignExport {
  const raw: unknown = JSON.parse(json)
  return CampaignExportSchema.parse(raw)
}

/** Read a whole campaign out of the DB as a JSON export string. */
export async function exportCampaign(db: MaladumDB, campaignId: string): Promise<string> {
  const campaign = await db.campaigns.get(campaignId)
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`)
  const events = await loadEvents(db, campaignId)
  return serializeExport(campaign, events)
}

export interface ImportOptions {
  /** Import under a fresh id/name instead of overwriting (default: overwrite in place). */
  asCopy?: { id: string; name: string }
}

/**
 * Import an export JSON into the DB. By default it restores in place (same id);
 * pass `asCopy` to clone it under a new id so importing your own backup doesn't
 * clobber the live campaign. Returns the id of the imported campaign.
 */
export async function importCampaign(
  db: MaladumDB,
  json: string,
  opts: ImportOptions = {},
): Promise<string> {
  const parsed = parseExport(json)
  const id = opts.asCopy?.id ?? parsed.campaign.id
  const name = opts.asCopy?.name ?? parsed.campaign.name
  const now = Date.now()

  await db.transaction('rw', db.campaigns, db.events, async () => {
    // Replace any existing log for this id so a re-import is idempotent.
    await db.events.where('campaignId').equals(id).delete()
    await createCampaign(db, { ...parsed.campaign, id, name, updatedAt: now })
    await appendEvents(db, id, parsed.events, now)
  })
  return id
}
