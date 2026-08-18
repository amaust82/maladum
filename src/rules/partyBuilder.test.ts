import { describe, it, expect } from 'vitest'
import {
  MAX_QUEST_ROSTER,
  RECOMMENDED_PARTY_BUDGET,
  defaultStartingXp,
  describePartyIssue,
  stashRemainder,
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
    expect(summarizeCost([member(), member()])).toEqual({
      known: 100,
      boards: 100,
      equipment: 0,
      unknown: [],
      exact: true,
    })
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
    expect(summarizeCost([])).toEqual({
      known: 0,
      boards: 0,
      equipment: 0,
      unknown: [],
      exact: true,
    })
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

  it('allows a party larger than a quest roster — p.68 puts no cap on party size', () => {
    // "A party can contain any number of Adventurers. However ... you may only take up
    // to four of them into battle for each quest." A fifth Adventurer is legal to own.
    const five = Array.from({ length: 5 }, () => member())
    const result = validateParty({ name: 'Five', members: five })
    expect(result.ok).toBe(true)
    expect(result.issues).toContainEqual({
      severity: 'warning',
      kind: 'over-quest-roster',
      size: 5,
      max: MAX_QUEST_ROSTER,
    })
  })

  it('says nothing about the roster at or below four', () => {
    const four = Array.from({ length: MAX_QUEST_ROSTER }, () => member())
    const result = validateParty({ name: 'Four', members: four })
    expect(result.ok).toBe(true)
    expect(kinds(result.issues)).not.toContain('over-quest-roster')
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
    expect(seen).toContain('over-quest-roster')
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


describe('the starting budget covers equipment too (p.68)', () => {
  const m = (characterCost: number, classCost: number) =>
    member({ characterCost, classCost })

  it('counts starting equipment against the same budget as the boards', () => {
    const cost = summarizeCost([m(30, 20)], 50)
    expect(cost.boards).toBe(50)
    expect(cost.equipment).toBe(50)
    expect(cost.known).toBe(100)
  })

  it('puts a party over budget on equipment alone', () => {
    // Boards fit inside 100; boards + equipment do not. Ignoring equipment — the bug
    // this rule check exists to prevent — would call this party affordable.
    const draft = { name: 'P', members: [m(60, 20)], budget: 100, equipmentSpend: 50 }
    const result = validateParty(draft)
    expect(result.ok).toBe(false)
    expect(kinds(result.issues)).toContain('over-budget')

    const withoutEquipment = validateParty({ ...draft, equipmentSpend: 0 })
    expect(withoutEquipment.ok).toBe(true)
  })

  it('treats an absent equipment spend as zero, not as unknown', () => {
    expect(summarizeCost([m(30, 20)]).equipment).toBe(0)
    expect(summarizeCost([m(30, 20)], 0).known).toBe(50)
  })

  it('ignores a negative equipment spend rather than crediting the party', () => {
    expect(summarizeCost([m(30, 20)], -100).known).toBe(50)
  })

  it('recommends 350 without assuming it', () => {
    expect(RECOMMENDED_PARTY_BUDGET).toBe(350)
    // No budget supplied means no budget check — the rules set no fixed figure.
    const result = validateParty({ name: 'P', members: [m(300, 200)] })
    expect(result.ok).toBe(true)
    expect(kinds(result.issues)).not.toContain('over-budget')
  })
})

describe('stashRemainder (p.68 — unused budget becomes the opening Stash)', () => {
  const cost = (known: number, exact = true) => ({
    known,
    boards: known,
    equipment: 0,
    unknown: exact ? [] : ['a:characterCost'],
    exact,
  })

  it('returns what is left of the budget', () => {
    expect(stashRemainder(cost(280), 350)).toBe(70)
  })

  it('never returns a negative Stash for an over-budget party', () => {
    expect(stashRemainder(cost(400), 350)).toBe(0)
  })

  it('is unknown when no budget was agreed', () => {
    expect(stashRemainder(cost(280), null)).toBeNull()
    expect(stashRemainder(cost(280), undefined)).toBeNull()
  })

  it('is unknown when any board cost is unknown, rather than quietly wrong', () => {
    expect(stashRemainder(cost(280, false), 350)).toBeNull()
  })

  it('is surfaced on the validation result', () => {
    const result = validateParty({
      name: 'P',
      members: [member({ characterCost: 30, classCost: 20 })],
      budget: 350,
      equipmentSpend: 50,
    })
    expect(result.stash).toBe(250)
  })
})
