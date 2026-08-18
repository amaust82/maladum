/**
 * Party upkeep — pure functions, no I/O (design.md §3; Deluxe rulebook p.83, p.62).
 *
 * Paid at the end of each Market Phase. If upkeep isn't paid an Adventurer leaves
 * the party (that consequence is bookkeeping for a service layer, not computed here).
 */

export interface AdventurerUpkeepInput {
  /** Current rank (1-based). */
  rank: number
  /** Took part in the most recent quest → +1 (p.83). */
  playedLastQuest: boolean
  /** Hired during the current Market Phase → exempt from upkeep this phase (p.83). */
  hiredThisPhase?: boolean
}

export interface CompanionUpkeepInput {
  /** Upgrade slot punched out → flat upkeep rises from 1 to 2 (p.62). */
  upgradeSlotPunched: boolean
  /**
   * Hired during the current Market Phase → exempt this phase. The rulebook states
   * the newly-hired exemption for Adventurers (p.83); applying it to Companions
   * hired the same phase follows the same principle. Defaults to false.
   */
  hiredThisPhase?: boolean
}

/** Upkeep for one Adventurer: 1 per rank, +1 if they played the last quest; 0 if newly hired (p.83). */
export function adventurerUpkeep(a: AdventurerUpkeepInput): number {
  if (a.hiredThisPhase) return 0
  return a.rank + (a.playedLastQuest ? 1 : 0)
}

/** Upkeep for one Companion/Apprentice: flat 1, or 2 if the upgrade slot is punched; 0 if newly hired (p.62). */
export function companionUpkeep(c: CompanionUpkeepInput): number {
  if (c.hiredThisPhase) return 0
  return c.upgradeSlotPunched ? 2 : 1
}

/** Total upkeep a party owes this Market Phase across all Adventurers and Companions. */
export function totalUpkeep(input: {
  adventurers: AdventurerUpkeepInput[]
  companions?: CompanionUpkeepInput[]
}): number {
  const adv = input.adventurers.reduce((s, a) => s + adventurerUpkeep(a), 0)
  const comp = (input.companions ?? []).reduce((s, c) => s + companionUpkeep(c), 0)
  return adv + comp
}
