import { describe, it, expect } from 'vitest'
import {
  MAX_PARTY_SIZE,
  defaultStartingXp,
  describePartyIssue,
  summarizeCost,
  validateParty,
  type DraftMember,
} from './partyBuilder'

let seq = 0
const member = (over: Partial<DraftMember> = {}): DraftMember => {
  seq += 1
  return {
    id: `m${seq}`,
    characterId: `char${seq}`,
    classId: `class${seq}`,
    displayName: `Adventurer ${seq}`,
    characterCost: 30,
    classCost: 20,
    ...over,
  }
}

const kinds = (issues: { kind: string }[]) => issues.map((i) => i.kind)

describe('summarizeCost', () => {
  it('sums character and class costs when everything is known', () => {
    expect(summarizeCost([member(), member()])).toEqual({ known: 100, unknown: [], exact: true })
  })

  it('never substitutes 0 for an unknown cost — it reports the gap and stays a lower bound', () => {
    const m = member({ id: 'syrio', characterCost: null })
    const cost = summarizeCost([m])
    expect(cost.known).toBe(20)
    expect(cost.unknown).toEqual(['syrio:characterCost'])
    expect(cost.exact).toBe(false)
  })

  it('tracks a missing class cost separately from a missing character cost', () => {
    const cost = summarizeCost([member({ id: 'a', characterCost: null, classCost: null })])
    expect(cost.unknown).toEqual(['a:characterCost', 'a:classCost'])
    expect(cost.known).toBe(0)
  })

  it('does not count a class cost for a member with no class chosen', () => {
    const cost = summarizeCost([member({ id: 'a', classId: '', classCost: null })])
    expect(cost.unknown).toEqual([])
    expect(cost.exact).toBe(true)
    expect(cost.known).toBe(30)
  })

  it('is 0 and exact for an empty party', () => {
    expect(summarizeCost([])).toEqual({ known: 0, unknown: [], exact: true })
  })
})

describe('defaultStartingXp', () => {
  it("uses the character board's default XP fill", () => {
    // Syrio's verified stat block (core.json): xp default 3, max 16.
    expect(defaultStartingXp({ xp: { default: 3 } })).toBe(3)
  })
})

describe('validateParty', () => {
  it('accepts a legal party with no issues', () => {
    const result = validateParty({ name: 'Wardens', members: [member(), member()] })
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('rejects an empty party', () => {
    const result = validateParty({ name: 'Nobody', members: [] })
    expect(result.ok).toBe(false)
    expect(kinds(result.issues)).toEqual(['party-empty'])
  })

  it(`allows exactly ${MAX_PARTY_SIZE} Adventurers and rejects a fifth`, () => {
    const four = Array.from({ length: MAX_PARTY_SIZE }, () => member())
    expect(validateParty({ name: 'Four', members: four }).ok).toBe(true)

    const five = [...four, member()]
    const result = validateParty({ name: 'Five', members: five })
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      severity: 'error',
      kind: 'party-too-large',
      size: 5,
      max: MAX_PARTY_SIZE,
    })
  })

  it('requires a Class board for every member', () => {
    const result = validateParty({ name: 'P', members: [member({ id: 'a', classId: '' })] })
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      severity: 'error',
      kind: 'class-not-chosen',
      memberId: 'a',
    })
  })

  it('rejects two members sharing one physical character board, reporting it once', () => {
    const result = validateParty({
      name: 'P',
      members: [
        member({ characterId: 'syrio' }),
        member({ characterId: 'syrio' }),
        member({ characterId: 'syrio' }),
      ],
    })
    expect(result.issues.filter((i) => i.kind === 'duplicate-character-board')).toHaveLength(1)
    expect(result.ok).toBe(false)
  })

  it('rejects a party that exceeds a supplied budget', () => {
    const result = validateParty({ name: 'P', members: [member(), member()], budget: 80 })
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      severity: 'error',
      kind: 'over-budget',
      cost: 100,
      budget: 80,
    })
  })

  it('does not check a budget that was not supplied', () => {
    const result = validateParty({ name: 'P', members: [member()] })
    expect(kinds(result.issues)).not.toContain('over-budget')
    expect(kinds(result.issues)).not.toContain('budget-unverifiable')
  })

  it('warns instead of passing when a budget cannot be checked against unknown costs', () => {
    const result = validateParty({
      name: 'P',
      members: [member({ id: 'syrio', characterCost: null })],
      budget: 100,
    })
    expect(result.ok).toBe(true)
    expect(result.issues).toContainEqual({
      severity: 'warning',
      kind: 'budget-unverifiable',
      known: 20,
      budget: 100,
      unknown: ['syrio:characterCost'],
    })
  })

  it('prefers the hard over-budget error to the unverifiable warning', () => {
    const result = validateParty({
      name: 'P',
      members: [member({ characterCost: null }), member()],
      budget: 10,
    })
    expect(kinds(result.issues)).toContain('over-budget')
    expect(kinds(result.issues)).not.toContain('budget-unverifiable')
  })

  it('flags each member whose cost the content pack cannot supply', () => {
    const result = validateParty({
      name: 'P',
      members: [member({ id: 'syrio', characterCost: null, classCost: null }), member()],
    })
    expect(result.issues).toContainEqual({
      severity: 'warning',
      kind: 'incomplete-cost',
      memberId: 'syrio',
      fields: ['characterCost', 'classCost'],
    })
    expect(result.issues.filter((i) => i.kind === 'incomplete-cost')).toHaveLength(1)
  })

  it('treats incomplete content as a warning, not an illegal party', () => {
    const result = validateParty({ name: 'P', members: [member({ characterCost: null })] })
    expect(result.ok).toBe(true)
  })
})

describe('describePartyIssue', () => {
  it('produces a one-liner for every issue kind', () => {
    const result = validateParty({
      name: 'P',
      members: [
        member({ id: 'a', characterId: 'syrio', classId: '' }),
        member({ id: 'b', characterId: 'syrio', characterCost: null }),
        member(),
        member(),
        member(),
      ],
      budget: 10,
    })
    const seen = new Set(result.issues.map((i) => i.kind))
    expect(seen).toContain('party-too-large')
    expect(seen).toContain('class-not-chosen')
    expect(seen).toContain('duplicate-character-board')
    expect(seen).toContain('over-budget')
    expect(seen).toContain('incomplete-cost')
    for (const issue of result.issues) expect(describePartyIssue(issue)).toMatch(/\S/)
    expect(describePartyIssue({ severity: 'error', kind: 'party-empty' })).toMatch(/\S/)
    expect(
      describePartyIssue({
        severity: 'warning',
        kind: 'budget-unverifiable',
        known: 20,
        budget: 100,
        unknown: ['a:characterCost'],
      }),
    ).toContain('20')
  })
})
