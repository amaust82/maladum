import { describe, it, expect } from 'vitest'
import { adventurerUpkeep, companionUpkeep, totalUpkeep } from './upkeep'

describe('adventurerUpkeep (p.83)', () => {
  it('is 1 per rank when they sat out the last quest', () => {
    expect(adventurerUpkeep({ rank: 3, playedLastQuest: false })).toBe(3)
  })
  it('adds 1 if they took part in the most recent quest', () => {
    expect(adventurerUpkeep({ rank: 3, playedLastQuest: true })).toBe(4)
  })
  it('is 0 for an Adventurer hired this phase (exempt)', () => {
    expect(adventurerUpkeep({ rank: 5, playedLastQuest: true, hiredThisPhase: true })).toBe(0)
  })
  it('rank 1 who played costs 2', () => {
    expect(adventurerUpkeep({ rank: 1, playedLastQuest: true })).toBe(2)
  })
})

describe('companionUpkeep (p.62)', () => {
  it('is a flat 1 by default', () => {
    expect(companionUpkeep({ upgradeSlotPunched: false })).toBe(1)
  })
  it('is 2 when the upgrade slot is punched out', () => {
    expect(companionUpkeep({ upgradeSlotPunched: true })).toBe(2)
  })
  it('is 0 if hired this phase', () => {
    expect(companionUpkeep({ upgradeSlotPunched: true, hiredThisPhase: true })).toBe(0)
  })
})

describe('totalUpkeep', () => {
  it('sums Adventurers and Companions, honoring exemptions', () => {
    const total = totalUpkeep({
      adventurers: [
        { rank: 2, playedLastQuest: true }, // 3
        { rank: 4, playedLastQuest: false }, // 4
        { rank: 1, playedLastQuest: true, hiredThisPhase: true }, // 0 (new hire)
      ],
      companions: [
        { upgradeSlotPunched: false }, // 1
        { upgradeSlotPunched: true }, // 2
      ],
    })
    expect(total).toBe(10)
  })

  it('handles a party with no companions', () => {
    expect(totalUpkeep({ adventurers: [{ rank: 2, playedLastQuest: false }] })).toBe(2)
  })

  it('an empty party owes nothing', () => {
    expect(totalUpkeep({ adventurers: [] })).toBe(0)
  })
})
