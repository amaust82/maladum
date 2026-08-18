/**
 * Dexie / IndexedDB schema (design.md §2.4, §2.1).
 *
 * The append-only event log is the source of truth: `events` holds one row per
 * CampaignEvent in insertion order (Dexie's `++id` is monotonic, so ordering by
 * it reproduces append order). `campaigns` holds lightweight metadata for the
 * campaign picker without replaying any log.
 *
 * Persisted snapshots (design §2.3's "snapshot every 100 events") are a load-time
 * optimization deferred until load latency is measured to matter — events are the
 * source of truth, so a snapshots table can be added later without a data migration.
 */

import Dexie, { type Table } from 'dexie'
import type { CampaignEvent } from '../store/campaign/events'

export interface CampaignMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  contentPacks: { id: string; version: number }[]
}

export interface EventRow {
  /** Monotonic autoincrement — insertion order == append order. */
  id?: number
  campaignId: string
  event: CampaignEvent
}

export class MaladumDB extends Dexie {
  campaigns!: Table<CampaignMeta, string>
  events!: Table<EventRow, number>

  constructor(name = 'maladum') {
    super(name)
    this.version(1).stores({
      campaigns: 'id, updatedAt',
      events: '++id, campaignId',
    })
  }
}

/** The app-wide database instance. Tests construct their own MaladumDB with a unique name. */
export const db = new MaladumDB()
