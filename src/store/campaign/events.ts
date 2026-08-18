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

/** Mirrors `EscapeCounter` in rules/escape.ts; duplicated so events don't import rules. */
export type EscapeCounterName = 'wounded' | 'poisoned' | 'burning'

/** How a quest ended — drives Experience eligibility in the Advancement Phase (p.80). */
export type QuestOutcome = 'primary-complete' | 'partial' | 'failed'
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
  /** Inventory and armour slots (design §3; rulebook p.6, p.14, p.30, p.32). */
  | { t: 'ITEM_REMOVED'; advId: Id; item: ItemRef }
  /**
   * Move an item into an armour slot. Armour's rules "only apply when placed in these
   * slots" (p.6), so where an item sits is a real distinction, not presentation.
   */
  | { t: 'ARMOUR_EQUIPPED'; advId: Id; item: ItemRef }
  | { t: 'ARMOUR_REMOVED'; advId: Id; item: ItemRef }
  /**
   * Record that armour is covering a Skill or ability printed in an armour slot (p.32:
   * "putting armour on may reduce the level of a certain Skill"). The player decides
   * which side to cover, so this can only be recorded, never derived.
   */
  | { t: 'GRANT_COVERED_SET'; advId: Id; grant: string; covered: boolean }
  /**
   * The after-game loop (design §5, Campaign Phase wizard; rulebook p.78–87).
   *
   * This is the moment a session's outcome gets written down, which under the
   * between-sessions framing is the app's single most valuable write.
   */
  | {
      t: 'QUEST_RECORDED'
      partyId: Id
      /** What the quest was called, as the player knows it. */
      name: string
      outcome: QuestOutcome
      /** Rewards claimed for objectives — the quest briefing states them (p.82). */
      renownGained?: number
      guildersGained?: number
      at: number
    }
  /**
   * An Adventurer left behind was resolved with the Left for Dead roll (p.78–79). The
   * `roll` is what the player reported after physically rolling; the app never rolls.
   */
  | {
      t: 'ESCAPE_RESOLVED'
      advId: Id
      roll: number
      counters: EscapeCounterName[]
      consequence: string
      questsMissed: number
      equipmentLost: boolean
      /** Set on a result of 5: whether the ransom was paid, which decides survival. */
      ransomPaid?: boolean
    }
  /** Quests this Adventurer must still sit out (p.78–79). */
  | { t: 'ABSENCE_SET'; advId: Id; quests: number }
  /** Dead for the rest of the campaign, or brought back by a correction. */
  | { t: 'ALIVE_SET'; advId: Id; alive: boolean }

export type CampaignEventType = CampaignEvent['t']
