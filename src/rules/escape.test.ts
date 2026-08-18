import { describe, it, expect } from 'vitest'
import { resolveEscape, ransomUnpaid, type EscapeCounter } from './escape'

const noCounters: EscapeCounter[] = []

describe('resolveEscape — consequence by result (p.79)', () => {
  const cases: Array<[number, string]> = [
    [1, 'permanent-death'],
    [2, 'miss-next-two-quests'],
    [3, 'equipment-lost'],
    [4, 'miss-next-quest'],
    [5, 'ransom'],
    [6, 'full-recovery'],
  ]
  for (const [roll, consequence] of cases) {
    it(`roll ${roll} → ${consequence}`, () => {
      expect(resolveEscape({ roll, counters: noCounters, rank: 1 }).consequence).toBe(consequence)
    })
  }
})

describe('resolveEscape — counter modifiers (p.78)', () => {
  it('applies −1 per counter and discards them all', () => {
    const r = resolveEscape({ roll: 6, counters: ['wounded', 'poisoned'], rank: 2 })
    expect(r.modifier).toBe(-2)
    expect(r.modifiedRoll).toBe(4) // 6 - 2
    expect(r.consequence).toBe('miss-next-quest')
    expect(r.countersDiscarded).toEqual(['wounded', 'poisoned'])
  })

  it('clamps a heavily-penalised roll to 1 (permanent death)', () => {
    const r = resolveEscape({ roll: 2, counters: ['wounded', 'poisoned', 'burning'], rank: 3 })
    expect(r.modifiedRoll).toBe(1)
    expect(r.consequence).toBe('permanent-death')
    expect(r.permanentDeath).toBe(true)
  })
})

describe('resolveEscape — derived effects', () => {
  it('marks equipment lost on results 1 and 3 only', () => {
    expect(resolveEscape({ roll: 1, counters: noCounters, rank: 1 }).equipmentLost).toBe(true)
    expect(resolveEscape({ roll: 3, counters: noCounters, rank: 1 }).equipmentLost).toBe(true)
    expect(resolveEscape({ roll: 6, counters: noCounters, rank: 1 }).equipmentLost).toBe(false)
  })

  it('sets quests missed: 2 on result 2, 1 on result 4, else 0', () => {
    expect(resolveEscape({ roll: 2, counters: noCounters, rank: 1 }).questsMissed).toBe(2)
    expect(resolveEscape({ roll: 4, counters: noCounters, rank: 1 }).questsMissed).toBe(1)
    expect(resolveEscape({ roll: 6, counters: noCounters, rank: 1 }).questsMissed).toBe(0)
  })

  it('computes ransom as 5 × rank on result 5', () => {
    expect(resolveEscape({ roll: 5, counters: noCounters, rank: 3 }).ransomCost).toBe(15)
    expect(resolveEscape({ roll: 5, counters: noCounters, rank: 1 }).ransomCost).toBe(5)
    // non-ransom results have no ransom cost
    expect(resolveEscape({ roll: 6, counters: noCounters, rank: 4 }).ransomCost).toBe(0)
  })
})

describe('resolveEscape — input validation', () => {
  it('rejects out-of-range or non-integer rolls', () => {
    expect(() => resolveEscape({ roll: 0, counters: noCounters, rank: 1 })).toThrow()
    expect(() => resolveEscape({ roll: 7, counters: noCounters, rank: 1 })).toThrow()
    expect(() => resolveEscape({ roll: 2.5, counters: noCounters, rank: 1 })).toThrow()
  })
})

describe('ransomUnpaid (p.79)', () => {
  it('treats an unpaid ransom as a result of 1', () => {
    const r = ransomUnpaid({ counters: ['burning'] })
    expect(r.consequence).toBe('permanent-death')
    expect(r.permanentDeath).toBe(true)
    expect(r.equipmentLost).toBe(true)
    expect(r.countersDiscarded).toEqual(['burning'])
  })
})
