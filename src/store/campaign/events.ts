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

/**
 * Which board a skill mark sits on. The distinction is load-bearing: Class-board marks
 * are capped at the character's rank, character-board marks are not and stack on top
 * (p.80) — so they can never be summed into a single number.
 */
export type SkillSource = 'character' | 'class'

/** Statistics that levelling can raise (p.81). Experience is the track, not a target. */
export type LevellableStat = 'health' | 'skill' | 'magic' | 'actions'
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
  /**
   * The character sheet's free-edit events (design §5, Character sheet).
   *
   * These are `SET`, not deltas, on purpose. The app's job is to be a durable copy of
   * a dry-wipe board that really does get wiped between sessions, so its primary write
   * is "here is what the board says", not "here is what changed". A player restoring a
   * board mid-campaign types the current marks; they can't replay six quests of deltas.
   * `XP_GAINED` stays for the Advancement Phase, where a delta is the honest description.
   */
  | { t: 'XP_SET'; advId: Id; filled: number; note?: string }
  /** Marks against one skill from one board. Sources stack and are capped separately (p.80). */
  | { t: 'SKILL_MARKS_SET'; advId: Id; skill: string; source: SkillSource; marks: number }
  /** Spells the Adventurer has marked on their spell track — board grants are NOT stored. */
  | { t: 'SPELL_LEARNED'; advId: Id; spell: string }
  | { t: 'SPELL_UNLEARNED'; advId: Id; spell: string }
  /** Permanent stat increases from levelling (p.81), above the board's default fill. */
  | { t: 'STAT_INCREASE_SET'; advId: Id; stat: LevellableStat; increase: number }
  /** Rank typed in directly, for boards whose Experience row layout isn't transcribed. */
  | { t: 'RANK_SET'; advId: Id; rank: number | null }
  /**
   * Base Camp board (design §5, Camp tab; rulebook p.69, p.72, p.86).
   *
   * `*_SET` for the same reason the character sheet uses them: every value here is
   * dry-wipe and the app's job is to hold what the board said, which a player may need
   * to type in wholesale after a wipe. The `*_CHANGED` deltas stay for the campaign
   * phases, where "gained 3 Renown for an objective" is the truthful description.
   */
  | { t: 'STASH_SET'; partyId: Id; amount: number; reason?: string }
  | { t: 'RENOWN_SET'; partyId: Id; amount: number; reason?: string }
  /**
   * Move an item into Base Camp storage. `secure` marks the punch-out Secure Storage
   * space, which only exists while the party is paying for an Inn (p.86).
   */
  | { t: 'ITEM_STORED'; partyId: Id; item: ItemRef; secure: boolean }
  | { t: 'ITEM_UNSTORED'; partyId: Id; item: ItemRef }
  /** Punched out on paying for an Inn, filled back in on camping in the wilderness (p.86). */
  | { t: 'SECURE_STORAGE_SET'; partyId: Id; unlocked: boolean }
  | { t: 'CAMP_NOTES_SET'; partyId: Id; notes: string }

export type CampaignEventType = CampaignEvent['t']
