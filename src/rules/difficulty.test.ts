import { describe, it, expect } from 'vitest'
import {
  itemPartyValue,
  partyValue,
  difficultyCards,
  difficultyFor,
  type AdventurerValueInput,
} from './difficulty'

describe('itemPartyValue', () => {
  it('bought/found items count at buy price', () => {
    expect(itemPartyValue({ buyPrice: 5 })).toBe(5)
  })
  it('crafted items count at double sell price (p.85)', () => {
    expect(itemPartyValue({ crafted: true, sellPrice: 4 })).toBe(8)
  })
  it('treats missing prices as zero', () => {
    expect(itemPartyValue({})).toBe(0)
    expect(itemPartyValue({ crafted: true })).toBe(0)
  })
})

describe('partyValue', () => {
  it('sums character + class cost with no rank bonus at rank 1', () => {
    const adv: AdventurerValueInput = { characterCost: 30, classCost: 20, rank: 1 }
    expect(partyValue([adv])).toBe(50)
  })

  it('adds 10 per rank beyond the first (p.72)', () => {
    const adv: AdventurerValueInput = { characterCost: 30, classCost: 20, rank: 3 }
    // 30 + 20 + 10*(3-1) = 70
    expect(partyValue([adv])).toBe(70)
  })

  it('adds carried equipment, crafted at double sell price', () => {
    const adv: AdventurerValueInput = {
      characterCost: 30,
      classCost: 20,
      rank: 2,
      equipment: [{ buyPrice: 15 }, { crafted: true, sellPrice: 10 }],
    }
    // 30 + 20 + 10*(2-1) + 15 + (10*2) = 95
    expect(partyValue([adv])).toBe(95)
  })

  it('sums across all parties (flattened)', () => {
    const advs: AdventurerValueInput[] = [
      { characterCost: 30, classCost: 20, rank: 1 },
      { characterCost: 40, classCost: 25, rank: 2 },
    ]
    // 50 + (40+25+10) = 125
    expect(partyValue(advs)).toBe(125)
  })

  it('empty party is worth zero', () => {
    expect(partyValue([])).toBe(0)
  })
})

describe('difficultyCards (Deluxe p.72 table)', () => {
  // Each band's inclusive upper bound and the value just past it.
  const cases: Array<[number, number, number]> = [
    [0, 5, 0],
    [300, 5, 0],
    [301, 4, 0],
    [400, 4, 0],
    [401, 3, 0],
    [500, 3, 0],
    [501, 2, 1],
    [600, 2, 1],
    [601, 1, 2],
    [700, 1, 2],
    [701, 0, 3],
    [875, 0, 3],
    [876, 0, 4],
    [1050, 0, 4],
    [1051, 0, 5],
    [1300, 0, 5],
    [1301, 0, 6],
    [1550, 0, 6],
    [1551, 0, 7],
    [1900, 0, 7],
    [1901, 0, 8],
    [2250, 0, 8],
    [2251, 0, 10],
    [99999, 0, 10],
  ]
  for (const [value, novice, veteran] of cases) {
    it(`value ${value} → ${novice} novice / ${veteran} veteran`, () => {
      expect(difficultyCards(value)).toEqual({ novice, veteran })
    })
  }

  it('matches the design §2.2 worked example: 605 → 2 Veteran', () => {
    expect(difficultyCards(605).veteran).toBe(2)
  })
})

describe('difficultyFor', () => {
  it('computes value and card counts together', () => {
    const advs: AdventurerValueInput[] = [
      { characterCost: 200, classCost: 100, rank: 4 }, // 300 + 30 = 330
      { characterCost: 200, classCost: 100, rank: 1 }, // 300
    ]
    // total 630 → band 601-700 → 1 novice / 2 veteran
    expect(difficultyFor(advs)).toEqual({ value: 630, novice: 1, veteran: 2 })
  })
})
