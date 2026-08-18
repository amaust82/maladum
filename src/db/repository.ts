/**
 * Campaign repository — the thin async boundary between the pure event store and
 * Dexie (design.md §2.2 "Application services"). No projection logic lives here;
 * callers fold loaded events through `campaignReducer` themselves.
 */

import type { MaladumDB, CampaignMeta } from './database'
import type { CampaignEvent } from '../store/campaign/events'

export async function createCampaign(db: MaladumDB, meta: CampaignMeta): Promise<void> {
  await db.campaigns.put(meta)
}

export async function listCampaigns(db: MaladumDB): Promise<CampaignMeta[]> {
  // Newest activity first — handy for the "Continue" affordance on the picker.
  const all = await db.campaigns.toArray()
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getCampaign(db: MaladumDB, campaignId: string): Promise<CampaignMeta | undefined> {
  return db.campaigns.get(campaignId)
}

/** Append one or more events and bump the campaign's `updatedAt`, atomically. */
export async function appendEvents(
  db: MaladumDB,
  campaignId: string,
  events: CampaignEvent[],
  at: number = Date.now(),
): Promise<void> {
  if (events.length === 0) return
  await db.transaction('rw', db.campaigns, db.events, async () => {
    await db.events.bulkAdd(events.map((event) => ({ campaignId, event })))
    const meta = await db.campaigns.get(campaignId)
    if (meta) await db.campaigns.put({ ...meta, updatedAt: at })
  })
}

/** Load a campaign's full event log in append order. */
export async function loadEvents(db: MaladumDB, campaignId: string): Promise<CampaignEvent[]> {
  const rows = await db.events.where('campaignId').equals(campaignId).sortBy('id')
  return rows.map((r) => r.event)
}

/** Delete a campaign and its entire event log. */
export async function deleteCampaign(db: MaladumDB, campaignId: string): Promise<void> {
  await db.transaction('rw', db.campaigns, db.events, async () => {
    await db.events.where('campaignId').equals(campaignId).delete()
    await db.campaigns.delete(campaignId)
  })
}
