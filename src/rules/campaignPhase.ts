/**
 * The after-game loop — pure functions, no I/O (design.md §4, §5; rulebook p.78–87).
 *
 * Four phases in fixed order: **Escape → Advancement → Market → Rest**. This module
 * doesn't re-implement any of their arithmetic — `escape.ts`, `advancement.ts`,
 * `market.ts`, `upkeep.ts` and `baseCamp.ts` already own that. What it adds is the part
 * that only makes sense across them: who each phase applies to, what it needs from the
 * player, and what it still owes.
 *
 * Under the between-sessions framing this is the app's most valuable moment — it's when
 * a session's outcome gets written down, and the wipe that follows stops mattering.
 *
 * Two things it deliberately does not do:
 *
 * - **It never rolls.** Escape and Rest both call for a physical Magic Die; the player
 *   reports what they rolled and the app resolves the consequence (design principle #2).
 * - **It never advances state on its own.** Each phase reports what is outstanding and
 *   the screen commits events. A wizard that quietly applied rules would be unauditable,
 *   which defeats the point of an event log.
 */

import type { AdventurerState, PartyState } from '../store/campaign/projection'
import type { QuestOutcome } from '../store/campaign/events'
import { earnsXp, xpRequirementForRow, type XpRequirement } from './advancement'
import { adventurerUpkeep } from './upkeep'
import { innCost } from './baseCamp'

export const PHASES = ['escape', 'advancement', 'market', 'rest'] as const
export type Phase = (typeof PHASES)[number]

export const PHASE_LABELS: Record<Phase, string> = {
  escape: 'Escape',
  advancement: 'Advancement',
  market: 'Market',
  rest: 'Rest',
}

/** Rulebook page each phase is described on, so the screen can cite rather than paraphrase. */
export const PHASE_PAGES: Record<Phase, number> = {
  escape: 78,
  advancement: 80,
  market: 82,
  rest: 86,
}

/** What the player reports about the quest just played. */
export interface QuestReport {
  name: string
  outcome: QuestOutcome
  /** Adventurer ids that took part. Upkeep charges +1 for these (p.83). */
  tookPart: string[]
  /** Adventurer ids still on the gaming area at the end — the Escape Phase deals with these. */
  leftBehind: string[]
  renownGained?: number
  guildersGained?: number
}

export interface EscapeTask {
  advId: string
  displayName: string
  /** Rank sets the ransom on a roll of 5 (p.79); null when it hasn't been recorded. */
  rank: number | null
}

/**
 * Who the Escape Phase applies to. "If your Adventurers all made it out you can skip this
 * phase" (p.78), so an empty list means the phase is genuinely done, not merely untouched.
 */
export function escapeTasks(party: PartyState, report: QuestReport): EscapeTask[] {
  return party.adventurers
    .filter((a) => a.alive && report.leftBehind.includes(a.id))
    .map((a) => ({ advId: a.id, displayName: a.displayName, rank: a.rank }))
}

export interface AdvancementTask {
  advId: string
  displayName: string
  /** The Experience row being filled, derived from rank; null when rank is unknown. */
  row: number | null
  requirement: XpRequirement | null
  /** True when the quest outcome satisfies that row's requirement (p.80). */
  earnsExperience: boolean | null
  /** Why not, in the player's terms — null when they do earn it or it can't be told. */
  blockedBy: string | null
}

/**
 * Total Experience rows a board has. Not transcribed (`AdventurerDef.xpRows`), and the
 * rulebook's own tracks run to five (p.81 notes some boards have fewer), so five is the
 * ceiling used when working from rank alone.
 */
const MAX_XP_ROWS = 5

/**
 * What each Adventurer stands to gain in the Advancement Phase.
 *
 * The row being filled should come from the Experience track's row layout, which isn't
 * transcribed — so this works from the recorded rank instead. That is exact except when
 * the current row happens to be exactly full, in which case the next Experience opens the
 * following row. The screen says so rather than presenting it as certain.
 */
export function advancementTasks(party: PartyState, report: QuestReport): AdvancementTask[] {
  return party.adventurers
    .filter((a) => a.alive)
    .map((a) => {
      const survived = !report.leftBehind.includes(a.id)
      const tookPart = report.tookPart.includes(a.id)
      if (a.rank === null) {
        return {
          advId: a.id,
          displayName: a.displayName,
          row: null,
          requirement: null,
          earnsExperience: null,
          blockedBy: 'Rank not recorded, so the Experience requirement is unknown',
        }
      }
      const row = a.rank
      const requirement = xpRequirementForRow(row, MAX_XP_ROWS)
      if (!tookPart) {
        return {
          advId: a.id,
          displayName: a.displayName,
          row,
          requirement,
          earnsExperience: false,
          blockedBy: "Didn't take part in this quest",
        }
      }
      const earns = earnsXp(row, MAX_XP_ROWS, {
        survived,
        escaped: survived,
        primaryObjectiveComplete: report.outcome === 'primary-complete',
      })
      return {
        advId: a.id,
        displayName: a.displayName,
        row,
        requirement,
        earnsExperience: earns,
        blockedBy: earns ? null : blockedReason(requirement, survived, report.outcome),
      }
    })
}

function blockedReason(
  requirement: XpRequirement,
  survived: boolean,
  outcome: QuestOutcome,
): string {
  if (!survived) return 'Left for Dead — no Experience is gained (p.80)'
  if (requirement === 'survive-and-primary-objective' && outcome !== 'primary-complete') {
    return 'Rows 3–4 need the party to complete the primary objective'
  }
  if (requirement === 'special-feat') return 'Row 5 only advances on an agreed special feat'
  if (requirement === 'track-full') return 'Experience track is full — spend it on a statistic'
  return 'Requirement not met'
}

export interface UpkeepLine {
  advId: string
  displayName: string
  /** Null when rank isn't recorded — upkeep is 1 per rank, so it can't be computed. */
  cost: number | null
  playedLastQuest: boolean
}

export interface MarketSummary {
  lines: UpkeepLine[]
  /** Upkeep the party can actually total up. */
  known: number
  /** Adventurers whose upkeep couldn't be computed, so `known` is a lower bound. */
  unknown: string[]
  exact: boolean
  /** True when the Stash can't cover the known upkeep — they'd have to leave (p.83). */
  shortfall: number
}

/**
 * Party upkeep at the end of the Market Phase (p.83): 1 Guilder per rank, +1 for taking
 * part in the most recent quest. An unrecorded rank makes a line unknowable rather than
 * free — same rule as everywhere else, an unknown never becomes 0.
 */
export function marketSummary(party: PartyState, report: QuestReport): MarketSummary {
  const lines: UpkeepLine[] = party.adventurers
    .filter((a) => a.alive)
    .map((a) => {
      const playedLastQuest = report.tookPart.includes(a.id)
      return {
        advId: a.id,
        displayName: a.displayName,
        cost: a.rank === null ? null : adventurerUpkeep({ rank: a.rank, playedLastQuest }),
        playedLastQuest,
      }
    })
  const known = lines.reduce((n, l) => n + (l.cost ?? 0), 0)
  const unknown = lines.filter((l) => l.cost === null).map((l) => l.displayName)
  return {
    lines,
    known,
    unknown,
    exact: unknown.length === 0,
    shortfall: Math.max(0, known - party.stash),
  }
}

export interface RestOption {
  choice: 'inn' | 'wilderness'
  cost: number
  /** What taking this option does to the Secure Storage punch-out (p.86). */
  secureStorage: boolean
  note: string
}

/** The two lodging choices and what each costs and does (p.86). */
export function restOptions(party: PartyState): RestOption[] {
  const living = party.adventurers.filter((a) => a.alive).length
  return [
    {
      choice: 'inn',
      cost: innCost(living),
      secureStorage: true,
      note: `${innCost(living)} Guilders for ${living} Adventurer(s); punches out Secure Storage`,
    },
    {
      choice: 'wilderness',
      cost: 0,
      secureStorage: false,
      note: 'Free, but Secure Storage is filled back in — anything in it must be moved, sold or discarded',
    },
  ]
}

/** Adventurers who must sit out, with the count decremented as quests are played. */
export function absentAdventurers(party: PartyState): AdventurerState[] {
  return party.adventurers.filter((a) => a.alive && a.questsMissed > 0)
}
