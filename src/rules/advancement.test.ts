import { describe, it, expect } from 'vitest'
import {
  rankFromXp,
  currentXpRow,
  xpRequirementForRow,
  earnsXp,
  levelUpReward,
  maxClassSkillLevel,
  canMarkClassSkill,
  effectiveSkillLevel,
  maxSpellLevel,
  canLearnSpell,
  type XpTrack,
} from './advancement'

const track: XpTrack = { rows: [3, 4, 4, 3, 2] } // 16 total, mirrors Syrio's xp max

describe('rankFromXp (p.80)', () => {
  it('is 0 for an empty track and 1 while filling row 1', () => {
    expect(rankFromXp(0, track)).toBe(0)
    expect(rankFromXp(1, track)).toBe(1)
    expect(rankFromXp(3, track)).toBe(1) // row 1 full, row 2 not started
  })
  it('counts rows with at least one filled space', () => {
    expect(rankFromXp(4, track)).toBe(2) // one space into row 2
    expect(rankFromXp(7, track)).toBe(2) // row 2 full
    expect(rankFromXp(8, track)).toBe(3)
    expect(rankFromXp(16, track)).toBe(5) // full track
  })
})

describe('currentXpRow (p.81)', () => {
  it('reports the row holding the next empty space', () => {
    expect(currentXpRow(0, track)).toBe(1)
    expect(currentXpRow(2, track)).toBe(1)
    expect(currentXpRow(3, track)).toBe(2)
    expect(currentXpRow(7, track)).toBe(3)
  })
  it('reports one past the last row when the track is full', () => {
    expect(currentXpRow(16, track)).toBe(6)
  })
})

describe('xpRequirementForRow (p.80)', () => {
  it('maps rows to their requirement', () => {
    expect(xpRequirementForRow(1, 5)).toBe('survive-and-escape')
    expect(xpRequirementForRow(2, 5)).toBe('survive-and-escape')
    expect(xpRequirementForRow(3, 5)).toBe('survive-and-primary-objective')
    expect(xpRequirementForRow(4, 5)).toBe('survive-and-primary-objective')
    expect(xpRequirementForRow(5, 5)).toBe('special-feat')
    expect(xpRequirementForRow(6, 5)).toBe('track-full')
  })
})

describe('earnsXp (p.80)', () => {
  const survivedEscaped = { survived: true, escaped: true, primaryObjectiveComplete: false }
  it('rows 1-2: needs survive + escape', () => {
    expect(earnsXp(1, 5, survivedEscaped)).toBe(true)
    expect(earnsXp(1, 5, { ...survivedEscaped, escaped: false })).toBe(false)
    expect(earnsXp(2, 5, { survived: false, escaped: true, primaryObjectiveComplete: true })).toBe(false)
  })
  it('rows 3-4: needs survive + primary objective', () => {
    expect(earnsXp(3, 5, { survived: true, escaped: false, primaryObjectiveComplete: true })).toBe(true)
    expect(earnsXp(4, 5, { survived: true, escaped: true, primaryObjectiveComplete: false })).toBe(false)
  })
  it('row 5: needs a survived special feat', () => {
    expect(earnsXp(5, 5, { survived: true, escaped: true, primaryObjectiveComplete: true })).toBe(false)
    expect(earnsXp(5, 5, { survived: true, escaped: true, primaryObjectiveComplete: true, feat: true })).toBe(true)
    expect(earnsXp(5, 5, { survived: false, escaped: true, primaryObjectiveComplete: true, feat: true })).toBe(false)
  })
})

describe('levelUpReward (p.81)', () => {
  it('grants the correct count and stat pool per row', () => {
    expect(levelUpReward(1)).toEqual({ count: 1, pool: 'health-magic-skill' })
    expect(levelUpReward(2)).toEqual({ count: 1, pool: 'health-magic-skill' })
    expect(levelUpReward(3)).toEqual({ count: 2, pool: 'health-magic-skill' })
    expect(levelUpReward(4)).toEqual({ count: 2, pool: 'any' })
    expect(levelUpReward(5)).toEqual({ count: 2, pool: 'any' })
  })
  it('returns null for rows a board does not have', () => {
    expect(levelUpReward(6)).toBeNull()
    expect(levelUpReward(0)).toBeNull()
  })
})

describe('skill & spell caps (p.80)', () => {
  it('caps Class-board skill marks at rank', () => {
    expect(maxClassSkillLevel(3)).toBe(3)
    expect(canMarkClassSkill(0, 1)).toBe(true)
    expect(canMarkClassSkill(1, 1)).toBe(false) // rank 1 → one space only
    expect(canMarkClassSkill(2, 3)).toBe(true)
    expect(canMarkClassSkill(3, 3)).toBe(false)
  })
  it('character-board marks stack on top of the rank-capped class marks', () => {
    // rank 1: class capped at 1, but 2 char-board marks stack → level 3
    expect(effectiveSkillLevel(2, 1)).toBe(3)
  })
  it('caps learnable spell level at rank', () => {
    expect(maxSpellLevel(2)).toBe(2)
    expect(canLearnSpell(2, 2)).toBe(true)
    expect(canLearnSpell(3, 2)).toBe(false)
    expect(canLearnSpell(1, 5)).toBe(true)
  })
})
