/**
 * Concrete campaign event union (design.md §2.3).
 *
 * Deliberately a THIN slice — only the mutations we can project meaningfully
 * today. Grow this union (and the projection reducer) as Phase 1 screens need
 * new events; the event-store core and persistence layer don't change when it does.
 *
 * The discriminator is `t`, matching the design doc's sketch. Every roll-derived
 * event records the value the player REPORTED after a physical roll — the app
 * never generates it (design principle #2).
 */

export type Id = string

export interface ItemRef {
  itemId: string
  /** Distinguishes multiple copies of the same item id in one inventory. */
  instanceId?: string
}

export type XpReason = 'survived' | 'escaped' | 'objective' | 'feat' | 'other'
export type AcquireVia = 'found' | 'bought' | 'reward' | 'crafted'

export type CampaignEvent =
  | {
      t: 'CAMPAIGN_CREATED'
      id: Id
      name: string
      contentPacks: { id: string; version: number }[]
      createdAt: number
    }
  | { t: 'PARTY_ADDED'; partyId: Id; name: string }
  | {
      t: 'ADVENTURER_ADDED'
      partyId: Id
      advId: Id
      characterId: string
      classId: string
      displayName: string
    }
  /** Renown delta (may be negative); projection clamps the total to 0..12 (p.72). */
  | { t: 'RENOWN_CHANGED'; partyId: Id; amount: number; source: string }
  /** Guilder delta on a party's Stash (may be negative). */
  | { t: 'STASH_CHANGED'; partyId: Id; amount: number; reason?: string }
  | { t: 'XP_GAINED'; advId: Id; amount: number; reason: XpReason }
  | { t: 'ITEM_ACQUIRED'; advId: Id; item: ItemRef; via: AcquireVia }

export type CampaignEventType = CampaignEvent['t']
