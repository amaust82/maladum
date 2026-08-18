/**
 * Escape Phase — "Left for Dead" resolution (design.md §0.1, §3; Deluxe rulebook p.78–79).
 * Pure functions, no I/O.
 *
 * The highest-value system in the game: its results have multi-game consequences
 * everyone forgets. Per design principle #2 the app never rolls — the player rolls
 * the Magic Die physically and reports the value; this maps that reported value
 * (after counter modifiers) to its consequence and the bookkeeping that follows.
 */

/** Counters that each apply −1 to the Escape roll, then are discarded (p.78). */
export type EscapeCounter = 'wounded' | 'poisoned' | 'burning'

export type EscapeConsequence =
  | 'permanent-death' // 1: dead for the rest of the campaign, all equipment lost
  | 'miss-next-two-quests' // 2: recovered but sits out the next two quests
  | 'equipment-lost' // 3: survives, but all equipment is lost to bandits
  | 'miss-next-quest' // 4: survives, sits out the next quest
  | 'ransom' // 5: pay 5 × rank to recover, or treat as permanent death
  | 'full-recovery' // 6: no further effects

export interface EscapeInput {
  /** The value the player reports after physically rolling the Magic Die (1–6). */
  roll: number
  /** Wounded/Poisoned/Burning counters on the Adventurer; each is −1, then discarded (p.78). */
  counters: EscapeCounter[]
  /** Character rank — sets the ransom cost on a result of 5 (p.79). */
  rank: number
}

export interface EscapeResult {
  /** Total roll modifier applied (≤ 0): −1 per counter. */
  modifier: number
  /** Roll after the modifier, clamped to 1–6 (anything ≤ 1 is a 1). */
  modifiedRoll: number
  consequence: EscapeConsequence
  /** Counters removed as part of resolving this roll (all of them, p.78). */
  countersDiscarded: EscapeCounter[]
  /** True on results 1 and 3 — all of the character's equipment is lost. */
  equipmentLost: boolean
  /** Quests this Adventurer must sit out: 2 (result 2), 1 (result 4), else 0. */
  questsMissed: number
  /** Ransom to recover the character on result 5 (5 × rank); 0 otherwise. */
  ransomCost: number
  /** True only on result 1 outright. Result 5 becomes death only if the ransom is unpaid. */
  permanentDeath: boolean
}

const clampRoll = (n: number): number => Math.min(6, Math.max(1, n))

function consequenceFor(modifiedRoll: number): EscapeConsequence {
  switch (modifiedRoll) {
    case 2:
      return 'miss-next-two-quests'
    case 3:
      return 'equipment-lost'
    case 4:
      return 'miss-next-quest'
    case 5:
      return 'ransom'
    case 6:
      return 'full-recovery'
    default:
      return 'permanent-death' // 1 (and any value clamped down to 1)
  }
}

/**
 * Resolve a Left-for-Dead Magic Die roll (p.78–79).
 *
 * On a result of 5 (ransom) the caller decides whether the party pays `ransomCost`;
 * if they cannot or choose not to, the rulebook says treat it as a result of 1
 * (permanent death) — call `ransomUnpaid()` to get that terminal result.
 */
export function resolveEscape(input: EscapeInput): EscapeResult {
  if (!Number.isInteger(input.roll) || input.roll < 1 || input.roll > 6) {
    throw new Error(`Escape roll must be an integer 1–6, got ${input.roll}`)
  }
  const modifier = -input.counters.length
  const modifiedRoll = clampRoll(input.roll + modifier)
  const consequence = consequenceFor(modifiedRoll)
  return {
    modifier,
    modifiedRoll,
    consequence,
    countersDiscarded: [...input.counters],
    equipmentLost: modifiedRoll === 1 || modifiedRoll === 3,
    questsMissed: modifiedRoll === 2 ? 2 : modifiedRoll === 4 ? 1 : 0,
    ransomCost: consequence === 'ransom' ? 5 * input.rank : 0,
    permanentDeath: modifiedRoll === 1,
  }
}

/** The result when a ransom (result 5) goes unpaid: treated as a result of 1 (p.79). */
export function ransomUnpaid(input: Pick<EscapeInput, 'counters'>): EscapeResult {
  return {
    modifier: -input.counters.length,
    modifiedRoll: 1,
    consequence: 'permanent-death',
    countersDiscarded: [...input.counters],
    equipmentLost: true,
    questsMissed: 0,
    ransomCost: 0,
    permanentDeath: true,
  }
}
