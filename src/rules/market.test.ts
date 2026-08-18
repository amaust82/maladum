import { describe, it, expect } from 'vitest'
import {
  repairCost,
  brokenSellPrice,
  valuablePurchaseCeiling,
  canPurchase,
  adventurersWhoCanBuy,
  extraAnyValuePurchases,
  temporaryHireCost,
  apprenticeHireCost,
  npcPermanentHireCost,
  FREE_ITEM_MAX,
} from './market'

describe('repairCost (p.84)', () => {
  it('is 1 / 3 / 5 by rarity', () => {
    expect(repairCost('common')).toBe(1)
    expect(repairCost('uncommon')).toBe(3)
    expect(repairCost('rare')).toBe(5)
  })
  it('throws for rarities without a defined repair cost', () => {
    expect(() => repairCost('exclusive')).toThrow()
    expect(() => repairCost('special')).toThrow()
  })
})

describe('brokenSellPrice (p.82)', () => {
  it('is half, rounded up', () => {
    expect(brokenSellPrice(4)).toBe(2)
    expect(brokenSellPrice(5)).toBe(3)
    expect(brokenSellPrice(1)).toBe(1)
  })
})

describe('valuable items (p.82)', () => {
  it('ceiling is 10 × rank, unlimited at rank 5', () => {
    expect(valuablePurchaseCeiling(1)).toBe(10)
    expect(valuablePurchaseCeiling(3)).toBe(30)
    expect(valuablePurchaseCeiling(5)).toBe(Infinity)
  })

  it('items up to 10 are always purchasable regardless of rank', () => {
    expect(canPurchase(FREE_ITEM_MAX, 1)).toBe(true)
    expect(canPurchase(10, 1)).toBe(true)
  })

  it('the rulebook example: rank 3 needed for an item costing 21–30', () => {
    expect(canPurchase(30, 3)).toBe(true)
    expect(canPurchase(21, 2)).toBe(false) // rank 2 ceiling is 20
    expect(canPurchase(31, 3)).toBe(false)
  })

  it('rank 5 can buy anything', () => {
    expect(canPurchase(999, 5)).toBe(true)
  })

  it('adventurersWhoCanBuy returns the eligible indices', () => {
    expect(adventurersWhoCanBuy(25, [1, 2, 3, 5])).toEqual([2, 3]) // rank 3 and 5
    expect(adventurersWhoCanBuy(8, [1, 1])).toEqual([0, 1]) // cheap item, all eligible
  })

  it('extra any-value purchases: +1 per rare sold, +1 per Renown spent', () => {
    expect(extraAnyValuePurchases({ rareItemsSold: 2, renownSpent: 1 })).toBe(3)
    expect(extraAnyValuePurchases({})).toBe(0)
  })
})

describe('hiring costs (p.83, p.63)', () => {
  it('temporary hire is a quarter, rounded up', () => {
    expect(temporaryHireCost(40)).toBe(10)
    expect(temporaryHireCost(30)).toBe(8) // 7.5 → 8
    expect(temporaryHireCost(1)).toBe(1)
  })
  it('apprentice hire is a quarter, rounded up', () => {
    expect(apprenticeHireCost(30)).toBe(8)
  })
  it('NPC permanent hire is half of character + class cost, rounded up', () => {
    expect(npcPermanentHireCost(30, 20)).toBe(25)
    expect(npcPermanentHireCost(30, 25)).toBe(28) // 27.5 → 28
  })
})
