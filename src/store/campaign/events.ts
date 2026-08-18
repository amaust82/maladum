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

import type { PackRef } from '../../content/manifest'

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
      /**
       * The content pack manifest this campaign was built against (design §2.4).
       * It lives on the event because the log is the source of truth — see the
       * placement rationale in `src/content/manifest.ts`.
       */
      contentPacks: PackRef[]
      createdAt: number
    }
  | { t: 'CAMPAIGN_RENAMED'; name: string }
  /**
   * The player accepted a different set of content packs mid-campaign (a pack was
   * updated, added, or removed). Recorded as a new fact rather than editing the
   * creation event, so the log still says what each quest was played against.
   */
  | { t: 'CONTENT_PACKS_CHANGED'; contentPacks: PackRef[]; at: number; reason?: string }
  | { t: 'PARTY_ADDED'; partyId: Id; name: string }
  | {
      t: 'ADVENTURER_ADDED'
      partyId: Id
      advId: Id
      characterId: string
      classId: string
      displayName: string
      /**
       * XP spaces pre-filled from the character board's `stats.xp.default`
       * (design §4 Phase 1: "auto-fill default XP spaces"). Carried on the event
       * because the projection must stay content-free; omitted means 0.
       */
      startingXp?: number
    }
  /** Undo the addition of an Adventurer while building a party (not a death — see p.78). */
  | { t: 'ADVENTURER_REMOVED'; partyId: Id; advId: Id }
  /** Renown delta (may be negative); projection clamps the total to 0..12 (p.72). */
  | { t: 'RENOWN_CHANGED'; partyId: Id; amount: number; source: string }
  /** Guilder delta on a party's Stash (may be negative). */
  | { t: 'STASH_CHANGED'; partyId: Id; amount: number; reason?: string }
  | { t: 'XP_GAINED'; advId: Id; amount: number; reason: XpReason }
  | { t: 'ITEM_ACQUIRED'; advId: Id; item: ItemRef; via: AcquireVia }

export type CampaignEventType = CampaignEvent['t']
