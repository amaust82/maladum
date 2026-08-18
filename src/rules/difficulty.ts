/**
 * Quest difficulty — pure functions, no I/O (design.md §2.2, §3).
 *
 * Party value drives how many Novice/Veteran Event Cards are shuffled into the
 * deck. No randomness is involved anywhere here — it is pure arithmetic plus a
 * lookup table transcribed from the Deluxe rulebook p.72.
 */

/** A single carried item's contribution to party value. */
export interface EquipmentValue {
  /**
   * Crafted items count at DOUBLE their sell price toward party value (p.85);
   * bought/found items count at their buy price (p.72). Crafted items have no
   * buy price, so the two fields are mutually exclusive in practice.
   */
  crafted?: boolean
  buyPrice?: number
  sellPrice?: number
}

export interface AdventurerValueInput {
  /** Character-board cost in Guilders. */
  characterCost: number
  /** Class-board cost in Guilders. */
  classCost: number
  /** Current rank (1-based). Adds 10 per rank beyond the first (p.72). */
  rank: number
  /** Equipment currently carried. */
  equipment?: EquipmentValue[]
}

export interface DifficultyResult {
  novice: number
  veteran: number
}

/** Value a single carried item contributes: crafted → sellPrice×2, else buyPrice (p.72, p.85). */
export function itemPartyValue(item: EquipmentValue): number {
  if (item.crafted) return (item.sellPrice ?? 0) * 2
  return item.buyPrice ?? 0
}

/**
 * Total party value in Guilders across ALL parties taking part (p.72):
 *   Σ (character cost + class cost + carried-equipment value) + 10 × (rank − 1)
 * Pass every participating Adventurer flattened across parties.
 */
export function partyValue(adventurers: AdventurerValueInput[]): number {
  return adventurers.reduce((sum, a) => {
    const rankBonus = 10 * Math.max(0, a.rank - 1)
    const equip = (a.equipment ?? []).reduce((s, it) => s + itemPartyValue(it), 0)
    return sum + a.characterCost + a.classCost + equip + rankBonus
  }, 0)
}

/**
 * Novice/Veteran card counts by party value (Deluxe rulebook p.72).
 * Bands are inclusive upper bounds; the final band is 2251+.
 */
const DIFFICULTY_TABLE: ReadonlyArray<{ max: number } & DifficultyResult> = [
  { max: 300, novice: 5, veteran: 0 },
  { max: 400, novice: 4, veteran: 0 },
  { max: 500, novice: 3, veteran: 0 },
  { max: 600, novice: 2, veteran: 1 },
  { max: 700, novice: 1, veteran: 2 },
  { max: 875, novice: 0, veteran: 3 },
  { max: 1050, novice: 0, veteran: 4 },
  { max: 1300, novice: 0, veteran: 5 },
  { max: 1550, novice: 0, veteran: 6 },
  { max: 1900, novice: 0, veteran: 7 },
  { max: 2250, novice: 0, veteran: 8 },
  { max: Infinity, novice: 0, veteran: 10 },
]

/** Look up the Novice/Veteran card counts for a given party value (p.72). */
export function difficultyCards(value: number): DifficultyResult {
  // The final band's bound is Infinity, so `find` always matches; the fallback is defensive.
  const band =
    DIFFICULTY_TABLE.find((b) => value <= b.max) ?? DIFFICULTY_TABLE[DIFFICULTY_TABLE.length - 1]
  return { novice: band.novice, veteran: band.veteran }
}

/** Convenience: compute party value and its card counts in one call. */
export function difficultyFor(
  adventurers: AdventurerValueInput[],
): DifficultyResult & { value: number } {
  const value = partyValue(adventurers)
  return { value, ...difficultyCards(value) }
}
