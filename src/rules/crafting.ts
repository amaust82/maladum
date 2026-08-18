/**
 * Crafting & Relics — the Artisan's Guild (design.md §3.1; Deluxe rulebook p.84–85).
 * Pure functions, no I/O.
 *
 * Crafting is recipe-priced (resource token icons) plus a Guilder fee equal to the
 * crafted item's sell price. Crafted items count at DOUBLE their sell price toward
 * party value for difficulty (p.85) — the one place a crafted item's value differs
 * from a bought item's.
 */

import type { RecipeDef } from '../content/schema'

/** The Guilder fee to craft an item equals its sell price (p.84). */
export function craftFee(sellPrice: number): number {
  return sellPrice
}

/** A crafted item's contribution to party value: double its sell price (p.85). */
export function craftedItemPartyValue(sellPrice: number): number {
  return sellPrice * 2
}

export interface CraftCheck {
  /** True when the party holds every required resource AND can pay the fee. */
  ok: boolean
  /** Guilder fee (= sell price). */
  fee: number
  /** resourceId → shortfall count; empty when all resources are covered. */
  missing: Record<string, number>
  /** Whether the Stash covers the fee. */
  affordable: boolean
}

/**
 * Check whether an item can be crafted (p.84–85). `available` is a map of
 * resourceId → count of matching tokens the party holds.
 *
 * Note: the rulebook's "overflow icons on a discarded token are wasted" nuance
 * operates at token granularity; this model treats resources as unit counts, so
 * it verifies coverage per resource and leaves per-token overflow to the physical
 * discard the player performs.
 */
export function canCraft(
  recipe: Pick<RecipeDef, 'resources'>,
  available: Record<string, number>,
  sellPrice: number,
  stash: number,
): CraftCheck {
  const missing: Record<string, number> = {}
  for (const [resId, need] of Object.entries(recipe.resources)) {
    const have = available[resId] ?? 0
    if (have < need) missing[resId] = need - have
  }
  const fee = craftFee(sellPrice)
  const affordable = stash >= fee
  const hasResources = Object.keys(missing).length === 0
  return { ok: hasResources && affordable, fee, missing, affordable }
}
