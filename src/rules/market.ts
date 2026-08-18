/**
 * Market Phase calculators — repair, valuable-item gating, hiring costs.
 * Pure functions, no I/O (design.md §3; Deluxe rulebook p.82–84).
 *
 * These answer "how much?" and "who's allowed?"; the once-per-phase bookkeeping
 * (an Adventurer may make only one valuable purchase per Market Phase) is stateful
 * and lives in the service layer, not here.
 */

import type { Rarity } from '../content/schema'

const REPAIR_COST: Partial<Record<Rarity, number>> = {
  common: 1,
  uncommon: 3,
  rare: 5,
}

/** Cost to repair a broken item at the Artisan's Guild by rarity (p.84). */
export function repairCost(rarity: Rarity): number {
  const cost = REPAIR_COST[rarity]
  if (cost === undefined) throw new Error(`No repair cost defined for rarity: ${rarity}`)
  return cost
}

/** Broken items sell for half their usual price, rounding up (p.82). */
export function brokenSellPrice(sellPrice: number): number {
  return Math.ceil(sellPrice / 2)
}

// --- Valuable items (p.82) ---

/** Items at or below this cost may be bought freely, unrestricted by rank. */
export const FREE_ITEM_MAX = 10

/** Cost ceiling for an Adventurer's single valuable purchase this phase; rank 5 → no limit (p.82). */
export function valuablePurchaseCeiling(rank: number): number {
  return rank >= 5 ? Infinity : rank * 10
}

/**
 * Whether an item of `itemCost` is within reach of an Adventurer of `rank`:
 * items ≤ 10 are always purchasable; above that it must fit their valuable ceiling.
 * (Does not enforce the one-valuable-purchase-per-phase limit — see module note.)
 */
export function canPurchase(itemCost: number, rank: number): boolean {
  return itemCost <= FREE_ITEM_MAX || itemCost <= valuablePurchaseCeiling(rank)
}

/** Indices of the Adventurers (by rank) whose rank permits buying an item of `itemCost`. */
export function adventurersWhoCanBuy(itemCost: number, ranks: number[]): number[] {
  const out: number[] = []
  ranks.forEach((rank, i) => {
    if (canPurchase(itemCost, rank)) out.push(i)
  })
  return out
}

/** Extra any-value purchases unlocked this phase: +1 per rare item sold, +1 per Renown spent (p.82, p.72). */
export function extraAnyValuePurchases(opts: {
  rareItemsSold?: number
  renownSpent?: number
}): number {
  return (opts.rareItemsSold ?? 0) + (opts.renownSpent ?? 0)
}

// --- Hiring (p.83, p.63) ---

/** Temporary hire (Adventurer or Companion): a quarter of normal cost, rounded up (p.83). */
export function temporaryHireCost(baseCost: number): number {
  return Math.ceil(baseCost / 4)
}

/** Apprentice hire: a quarter of normal cost, rounded up (p.63). */
export function apprenticeHireCost(baseCost: number): number {
  return Math.ceil(baseCost / 4)
}

/** Permanently hiring a rescued NPC: half their normal cost incl. Class, rounded up (p.83). */
export function npcPermanentHireCost(characterCost: number, classCost: number): number {
  return Math.ceil((characterCost + classCost) / 2)
}
