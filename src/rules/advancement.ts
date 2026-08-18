/**
 * Advancement — rank, Experience eligibility, level-up, skill/spell caps.
 * Pure functions, no I/O (design.md §3; Deluxe rulebook p.80–81).
 *
 * The Experience track's row layout varies per board, so functions that depend
 * on it take the row structure explicitly rather than assuming one — keeping them
 * pure and correct for any Adventurer.
 */

export interface XpTrack {
  /** Spaces per Experience row, in order (e.g. [3, 4, 4, 3, 2]). Sum = track size. */
  rows: number[]
}

/**
 * Rank = number of Experience rows with at least one filled space (p.80).
 * A real Adventurer always has default spaces filled, so they sit at rank ≥ 1;
 * this returns the raw derived count (0 for a hypothetical empty track).
 */
export function rankFromXp(xpFilled: number, track: XpTrack): number {
  let cumulative = 0
  let rank = 0
  for (const size of track.rows) {
    if (xpFilled > cumulative) rank++
    cumulative += size
  }
  return rank
}

/**
 * 1-based index of the row currently being filled (the row holding the next empty
 * space). Returns `rows.length + 1` when the track is full (extra XP → any stat, p.81).
 */
export function currentXpRow(xpFilled: number, track: XpTrack): number {
  let cumulative = 0
  for (let i = 0; i < track.rows.length; i++) {
    cumulative += track.rows[i]
    if (xpFilled < cumulative) return i + 1
  }
  return track.rows.length + 1
}

export type XpRequirement =
  | 'survive-and-escape'
  | 'survive-and-primary-objective'
  | 'special-feat'
  | 'track-full'

/**
 * What earning XP requires, by the row being filled (p.80):
 *   rows 1–2 → survive + escape; rows 3–4 → survive + party primary objective;
 *   row 5 → special feats only; beyond the last row → track full.
 */
export function xpRequirementForRow(row: number, totalRows: number): XpRequirement {
  if (row > totalRows) return 'track-full'
  if (row <= 2) return 'survive-and-escape'
  if (row <= 4) return 'survive-and-primary-objective'
  return 'special-feat'
}

export interface XpContext {
  /** Survived the quest (Left for Dead → false; they gain no XP, p.80). */
  survived: boolean
  escaped: boolean
  primaryObjectiveComplete: boolean
  /** A special feat was agreed (row 5 / full track only — the app can't detect these). */
  feat?: boolean
}

/** Whether an Adventurer filling `row` earns 1 XP given the quest outcome (p.80). */
export function earnsXp(row: number, totalRows: number, ctx: XpContext): boolean {
  switch (xpRequirementForRow(row, totalRows)) {
    case 'survive-and-escape':
      return ctx.survived && ctx.escaped
    case 'survive-and-primary-objective':
      return ctx.survived && ctx.primaryObjectiveComplete
    case 'special-feat':
    case 'track-full':
      return ctx.survived && !!ctx.feat
  }
}

export interface LevelUpReward {
  /** How many stats may be raised by 1. */
  count: number
  /** Which stats are eligible: Health/Magic/Skill only, or any statistic. */
  pool: 'health-magic-skill' | 'any'
}

/**
 * Stat increases granted for completing a given Experience row (p.81):
 *   1st/2nd → +1 to one of H/M/S · 3rd → +1 to any two of H/M/S ·
 *   4th/5th → +1 to any two statistics. Increases are capped by the board's
 *   potential spaces (applied by the caller, which knows each stat's max).
 *   Returns null for rows a board doesn't have.
 */
export function levelUpReward(row: number): LevelUpReward | null {
  switch (row) {
    case 1:
    case 2:
      return { count: 1, pool: 'health-magic-skill' }
    case 3:
      return { count: 2, pool: 'health-magic-skill' }
    case 4:
    case 5:
      return { count: 2, pool: 'any' }
    default:
      return null
  }
}

// --- Skill & spell caps (p.80) ---

/** Class-board skills may be marked up to a level equal to the character's rank. */
export function maxClassSkillLevel(rank: number): number {
  return rank
}

/** Whether another Class-board space may be marked for a skill at `currentClassMarks`. */
export function canMarkClassSkill(currentClassMarks: number, rank: number): boolean {
  return currentClassMarks < maxClassSkillLevel(rank)
}

/**
 * Effective skill level = Class-board marks (rank-capped) + Character-board marks.
 * Character-board spaces are exempt from the rank cap and stack on top (p.80).
 */
export function effectiveSkillLevel(charBoardMarks: number, classBoardMarks: number): number {
  return charBoardMarks + classBoardMarks
}

/** Spells may be learned up to a level equal to the character's rank (p.80). */
export function maxSpellLevel(rank: number): number {
  return rank
}

export function canLearnSpell(spellLevel: number, rank: number): boolean {
  return spellLevel <= maxSpellLevel(rank)
}
