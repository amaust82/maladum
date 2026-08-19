import { describe, it, expect } from 'vitest'
import { loadBundledPacks, loadPacks, type ContentLibrary } from '../content/loader'
import {
  adventurerOptions,
  classOptions,
  draftMemberFrom,
  partyCreationEvents,
  validateDraft,
} from './partyService'
import { describePartyIssue } from '../rules/partyBuilder'
import { projectCampaign } from './campaignService'
import type { CampaignEvent } from '../store/campaign/events'

const stats = {
  health: { default: 4, max: 6 },
  skill: { default: 1, max: 4 },
  magic: { default: 1, max: 4 },
  actions: { default: 2, max: 2 },
  xp: { default: 3, max: 16 },
}

const testLibrary = (): ContentLibrary =>
  loadPacks({
    'core.json': {
      id: 'core',
      name: 'Core',
      schemaVersion: 1,
      version: 1,
      adventurers: [
        { id: 'syrio', name: 'Syrio', species: null, cost: null, armourSlots: null, stats },
        { id: 'zed', name: 'Zed', species: 'Human', cost: 35, armourSlots: 2, stats },
        {
          id: '_ph',
          name: 'PLACEHOLDER',
          _placeholder: true,
          species: null,
          cost: null,
          stats,
        },
      ],
      classes: [
        { id: 'warrior', name: 'Warrior', cost: 20 },
        { id: 'mage', name: 'Mage', cost: null },
      ],
    },
  }).library

describe('board options', () => {
  const library = testLibrary()

  it('lists Adventurers alphabetically with a readiness grade each', () => {
    const options = adventurerOptions(library)
    expect(options.map((o) => o.id)).toEqual(['_ph', 'syrio', 'zed'])
    expect(options.map((o) => o.readiness.grade)).toEqual(['placeholder', 'partial', 'ready'])
  })

  it('lists Classes with a readiness grade, falling back to the id for a nameless class', () => {
    const options = classOptions(library)
    expect(options.map((o) => o.id)).toEqual(['mage', 'warrior'])
    expect(options.map((o) => o.readiness.grade)).toEqual(['partial', 'ready'])
  })

  it('grades every bundled Adventurer without throwing on the real seed content', () => {
    const options = adventurerOptions(loadBundledPacks().library)
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((o) => ['ready', 'partial', 'placeholder'].includes(o.readiness.grade))).toBe(
      true,
    )
  })
})

describe('draftMemberFrom', () => {
  const library = testLibrary()

  it('pulls known costs off the boards', () => {
    const m = draftMemberFrom(library, { id: 'm1', characterId: 'zed', classId: 'warrior' })
    expect(m).toMatchObject({ characterCost: 35, classCost: 20, displayName: 'Zed' })
  })

  it('carries an untranscribed cost through as null, not 0', () => {
    const m = draftMemberFrom(library, { id: 'm1', characterId: 'syrio', classId: 'mage' })
    expect(m.characterCost).toBeNull()
    expect(m.classCost).toBeNull()
  })

  it('prefers a player-supplied display name and ignores whitespace-only input', () => {
    const named = draftMemberFrom(library, {
      id: 'm1',
      characterId: 'zed',
      classId: 'warrior',
      displayName: 'Zed the Bold',
    })
    expect(named.displayName).toBe('Zed the Bold')
    const blank = draftMemberFrom(library, {
      id: 'm2',
      characterId: 'zed',
      classId: 'warrior',
      displayName: '   ',
    })
    expect(blank.displayName).toBe('Zed')
  })

  it('returns nulls rather than throwing for an unknown board id', () => {
    const m = draftMemberFrom(library, { id: 'm1', characterId: 'ghost', classId: 'warrior' })
    expect(m).toMatchObject({ characterCost: null, displayName: 'ghost' })
  })

  it('leaves the class cost null when no class has been chosen yet', () => {
    const m = draftMemberFrom(library, { id: 'm1', characterId: 'zed', classId: '' })
    expect(m.classCost).toBeNull()
    expect(validateDraft({ name: 'P', members: [m] }).ok).toBe(false)
  })
})

describe('partyCreationEvents', () => {
  const library = testLibrary()

  it('auto-fills the default XP spaces from the character board', () => {
    const members = [draftMemberFrom(library, { id: 'a1', characterId: 'syrio', classId: 'mage' })]
    const events = partyCreationEvents(library, 'p1', { name: 'Wardens', members })
    expect(events).toEqual([
      { t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' },
      {
        t: 'ADVENTURER_ADDED',
        partyId: 'p1',
        advId: 'a1',
        characterId: 'syrio',
        classId: 'mage',
        displayName: 'Syrio',
        startingXp: 3,
      },
    ])
  })

  it('projects into a party whose Adventurers already hold their default XP', () => {
    const members = [
      draftMemberFrom(library, { id: 'a1', characterId: 'syrio', classId: 'mage' }),
      draftMemberFrom(library, { id: 'a2', characterId: 'zed', classId: 'warrior' }),
    ]
    const log: CampaignEvent[] = [
      { t: 'CAMPAIGN_CREATED', id: 'c1', name: 'A', contentPacks: [], createdAt: 1 },
      ...partyCreationEvents(library, 'p1', { name: 'Wardens', members }),
    ]
    const state = projectCampaign(log)
    expect(state.parties[0].adventurers.map((a) => [a.id, a.xpFilled])).toEqual([
      ['a1', 3],
      ['a2', 3],
    ])
  })

  it('omits starting XP for a board it has no stat block for, rather than asserting 0', () => {
    // An unknown board has no default XP fill to read. Sending `startingXp: 0`
    // would be a claim about the board; omitting it leaves the projection's own
    // default to stand in, which is a claim about the save instead.
    const members = [draftMemberFrom(library, { id: 'a1', characterId: 'ghost', classId: 'mage' })]
    const [, added] = partyCreationEvents(library, 'p1', { name: 'W', members })
    expect(added).not.toHaveProperty('startingXp')
    expect(added).toMatchObject({ characterId: 'ghost' })
  })

  it('seeds character-board skill marks a board prints as already filled', () => {
    // Real example: Grogmar's board shows Quick Recovery starting at 1/2, not 0/2.
    // A fresh sheet has to match that printed state, the same way startingXp does.
    const grantLibrary = loadPacks({
      'core.json': {
        id: 'core',
        name: 'Core',
        schemaVersion: 1,
        version: 1,
        adventurers: [
          {
            id: 'grunt',
            name: 'Grunt',
            species: null,
            cost: null,
            armourSlots: null,
            stats,
            boardGrants: [{ type: 'skill', name: 'Quick Recovery', default: 1, max: 2 }],
          },
        ],
        classes: [{ id: 'warrior', name: 'Warrior', cost: 20 }],
      },
    }).library
    const members = [draftMemberFrom(grantLibrary, { id: 'a1', characterId: 'grunt', classId: 'warrior' })]
    const events = partyCreationEvents(grantLibrary, 'p1', { name: 'W', members })
    expect(events).toContainEqual({
      t: 'SKILL_MARKS_SET',
      advId: 'a1',
      skill: 'Quick Recovery',
      source: 'character',
      marks: 1,
    })

    const log: CampaignEvent[] = [
      { t: 'CAMPAIGN_CREATED', id: 'c1', name: 'A', contentPacks: [], createdAt: 1 },
      ...events,
    ]
    const state = projectCampaign(log)
    expect(state.parties[0].adventurers[0].skillMarks['Quick Recovery']).toEqual({
      character: 1,
      class: 0,
    })
  })
})

describe('validateDraft against real content gaps', () => {
  const library = testLibrary()

  it('lets a party of partially-transcribed boards through, with warnings naming the gaps', () => {
    const members = [draftMemberFrom(library, { id: 'a1', characterId: 'syrio', classId: 'mage' })]
    const result = validateDraft({ name: 'Wardens', members, budget: 100 })
    expect(result.ok).toBe(true)
    expect(result.cost).toEqual({
      known: 0,
      boards: 0,
      equipment: 0,
      unknown: ['a1:characterCost', 'a1:classCost'],
      exact: false,
    })
    expect(result.issues.map((i) => i.kind)).toEqual(['incomplete-cost', 'budget-unverifiable'])
  })
})

describe('validateDraft against the physical board inventory', () => {
  const { library } = loadBundledPacks()
  const member = (id: string, classId: string) =>
    draftMemberFrom(library, { id, characterId: 'syrio', classId })

  it('skips the board check entirely when no library is supplied', () => {
    const members = [member('a1', 'mentor'), member('a2', 'mentor')]
    const issues = validateDraft({ name: 'P', members }).issues
    expect(issues.some((i) => i.kind === 'boards-unavailable')).toBe(false)
  })

  it('warns, in class names, when a party asks for more copies than exist', () => {
    const members = [member('a1', 'mentor'), member('a2', 'mentor')]
    const result = validateDraft({ name: 'P', members }, library)
    const issue = result.issues.find((i) => i.kind === 'boards-unavailable')
    expect(issue).toBeDefined()
    expect(describePartyIssue(issue!)).toContain('Mentor')
    expect(describePartyIssue(issue!)).not.toContain('mentor,')
  })

  it('warns rather than blocking — transcribed data must not deny a real party', () => {
    // design.md §2.4: the board inventory is transcribed, so if it were wrong, refusing
    // to save would make the app wrong about a party sitting on the table.
    const members = [member('a1', 'mentor'), member('a2', 'mentor')]
    const result = validateDraft({ name: 'P', members }, library)
    expect(result.issues.find((i) => i.kind === 'boards-unavailable')!.severity).toBe('warning')
    // Two Adventurers on the same character board is a separate, real error; use
    // distinct boards so the only complaint left is the class one.
    const distinct = [
      draftMemberFrom(library, { id: 'a1', characterId: 'syrio', classId: 'mentor' }),
      draftMemberFrom(library, { id: 'a2', characterId: 'ariah', classId: 'mentor' }),
    ]
    expect(validateDraft({ name: 'P', members: distinct }, library).ok).toBe(true)
  })

  it('stays quiet for a party that fits', () => {
    const members = [
      draftMemberFrom(library, { id: 'a1', characterId: 'syrio', classId: 'barbarian' }),
      draftMemberFrom(library, { id: 'a2', characterId: 'ariah', classId: 'druid' }),
    ]
    const result = validateDraft({ name: 'P', members }, library)
    expect(result.issues.some((i) => i.kind === 'boards-unavailable')).toBe(false)
  })
})

describe('unspent starting budget becomes the opening Stash (p.68)', () => {
  const { library } = loadBundledPacks()
  const member = () =>
    draftMemberFrom(library, { id: 'a1', characterId: 'syrio', classId: 'barbarian' })

  it('opens the Base Camp Stash with what the party did not spend', () => {
    // Syrio 64 + Barbarian 7 + 50 equipment = 121, from a 350 budget.
    const events = partyCreationEvents(library, 'p1', {
      name: 'P',
      members: [member()],
      budget: 350,
      equipmentSpend: 50,
    })
    expect(events).toContainEqual({
      t: 'STASH_SET',
      partyId: 'p1',
      amount: 229,
      reason: 'Unspent starting budget',
    })
  })

  it('sets no Stash when no budget was agreed — there is no remainder to know', () => {
    const events = partyCreationEvents(library, 'p1', { name: 'P', members: [member()] })
    expect(events.some((e) => e.t === 'STASH_SET')).toBe(false)
  })

  it('sets no Stash when a board cost is unknown, rather than a wrong figure', () => {
    const unknown = { ...member(), characterCost: null }
    const events = partyCreationEvents(library, 'p1', {
      name: 'P',
      members: [unknown],
      budget: 350,
    })
    expect(events.some((e) => e.t === 'STASH_SET')).toBe(false)
  })
})
