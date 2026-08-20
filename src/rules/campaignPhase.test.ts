import { describe, it, expect } from 'vitest'
import {
  advancementTasks,
  escapeTasks,
  marketSummary,
  PHASES,
  restOptions,
  type QuestReport,
} from './campaignPhase'
import type { AdventurerState, PartyState } from '../store/campaign/projection'
import type { AdventurerDef } from '../content/schema'

const adventurer = (over: Partial<AdventurerState> = {}): AdventurerState => ({
  id: 'a1',
  characterId: 'syrio',
  classId: 'assassin',
  displayName: 'Syrio',
  xpFilled: 0,
  inventory: [],
  armour: [],
  coveredGrants: [],
  skillMarks: {},
  spells: [],
  statIncreases: {},
  rank: 1,
  alive: true,
  questsMissed: 0,
  ...over,
})

const party = (over: Partial<PartyState> = {}): PartyState => ({
  id: 'p1',
  name: 'The Party',
  renown: 0,
  stash: 100,
  adventurers: [adventurer()],
  storage: [],
  secureStorageUnlocked: false,
  notes: '',
  quests: [],
  ...over,
})

const report = (over: Partial<QuestReport> = {}): QuestReport => ({
  name: 'Of Coin and Glory',
  outcome: 'primary-complete',
  tookPart: ['a1'],
  leftBehind: [],
  ...over,
})

describe('PHASES', () => {
  it('runs Escape → Advancement → Market → Rest (p.78–86)', () => {
    expect([...PHASES]).toEqual(['escape', 'advancement', 'market', 'rest'])
  })
})

describe('escapeTasks', () => {
  it('is empty when everyone got out — the phase is skippable (p.78)', () => {
    expect(escapeTasks(party(), report(), new Map())).toEqual([])
  })

  it('lists only the Adventurers left on the gaming area', () => {
    const p = party({
      adventurers: [adventurer(), adventurer({ id: 'a2', displayName: 'Ariah' })],
    })
    const tasks = escapeTasks(p, report({ leftBehind: ['a2'] }), new Map())
    expect(tasks.map((t) => t.advId)).toEqual(['a2'])
  })

  it('skips the already-dead, who have nothing left to resolve', () => {
    const p = party({ adventurers: [adventurer({ alive: false })] })
    expect(escapeTasks(p, report({ leftBehind: ['a1'] }), new Map())).toEqual([])
  })

  it('carries rank through, since it sets the ransom on a roll of 5 (p.79)', () => {
    const p = party({ adventurers: [adventurer({ rank: 3 })] })
    expect(escapeTasks(p, report({ leftBehind: ['a1'] }), new Map())[0].rank).toBe(3)
  })
})

describe('advancementTasks', () => {
  it('awards Experience for surviving and escaping on rows 1–2 (p.80)', () => {
    const [task] = advancementTasks(party(), report({ outcome: 'failed' }), new Map())
    expect(task).toMatchObject({ row: 1, requirement: 'survive-and-escape', earnsExperience: true })
  })

  it('needs the primary objective on rows 3–4, and says so when it is missing', () => {
    const p = party({ adventurers: [adventurer({ rank: 3 })] })
    const [task] = advancementTasks(p, report({ outcome: 'partial' }), new Map())
    expect(task.earnsExperience).toBe(false)
    expect(task.blockedBy).toContain('primary objective')

    const [ok] = advancementTasks(p, report({ outcome: 'primary-complete' }), new Map())
    expect(ok.earnsExperience).toBe(true)
  })

  it('gives nothing to an Adventurer left for dead (p.80)', () => {
    const [task] = advancementTasks(party(), report({ leftBehind: ['a1'] }), new Map())
    expect(task.earnsExperience).toBe(false)
    expect(task.blockedBy).toContain('Left for Dead')
  })

  it('gives nothing to someone who sat the quest out', () => {
    const [task] = advancementTasks(party(), report({ tookPart: [] }), new Map())
    expect(task.earnsExperience).toBe(false)
    expect(task.blockedBy).toContain("Didn't take part")
  })

  it('says row 5 needs an agreed feat rather than pretending to judge one', () => {
    const p = party({ adventurers: [adventurer({ rank: 5 })] })
    const [task] = advancementTasks(p, report(), new Map())
    expect(task.requirement).toBe('special-feat')
    expect(task.blockedBy).toContain('special feat')
  })

  it('reports the requirement as unknown when rank was never recorded', () => {
    // Rank comes from the Experience row layout, which isn't transcribed. Guessing
    // rank 1 here would hand out Experience the rules might not allow.
    const p = party({ adventurers: [adventurer({ rank: null })] })
    const [task] = advancementTasks(p, report(), new Map())
    expect(task).toMatchObject({ row: null, requirement: null, earnsExperience: null })
    expect(task.blockedBy).toContain('Rank not recorded')
  })

  it('leaves out the dead', () => {
    const p = party({ adventurers: [adventurer({ alive: false })] })
    expect(advancementTasks(p, report(), new Map())).toEqual([])
  })
})

describe('marketSummary', () => {
  it('charges 1 per rank, +1 for taking part in the last quest (p.83)', () => {
    const p = party({ adventurers: [adventurer({ rank: 2 })] })
    const s = marketSummary(p, report(), new Map())
    expect(s.lines[0].cost).toBe(3)
    expect(s.known).toBe(3)
    expect(s.exact).toBe(true)
  })

  it('drops the +1 for an Adventurer who sat the quest out', () => {
    const p = party({ adventurers: [adventurer({ rank: 2 })] })
    expect(marketSummary(p, report({ tookPart: [] }), new Map()).lines[0].cost).toBe(2)
  })

  it('leaves upkeep unknown rather than free when rank is unrecorded', () => {
    const p = party({ adventurers: [adventurer({ rank: null })] })
    const s = marketSummary(p, report(), new Map())
    expect(s.lines[0].cost).toBeNull()
    expect(s.exact).toBe(false)
    expect(s.unknown).toEqual(['Syrio'])
  })

  it('reports a shortfall when the Stash cannot cover upkeep (p.83)', () => {
    const p = party({ stash: 1, adventurers: [adventurer({ rank: 3 })] })
    expect(marketSummary(p, report(), new Map()).shortfall).toBe(3) // 4 owed, 1 in the Stash
  })

  it('reports no shortfall when the Stash covers it', () => {
    expect(marketSummary(party(), report(), new Map()).shortfall).toBe(0)
  })

  it('does not charge upkeep for the dead', () => {
    const p = party({ adventurers: [adventurer({ alive: false })] })
    expect(marketSummary(p, report(), new Map()).known).toBe(0)
  })
})

describe('restOptions', () => {
  it('prices the Inn per living Adventurer and opens Secure Storage (p.86)', () => {
    const p = party({
      adventurers: [adventurer(), adventurer({ id: 'a2' }), adventurer({ id: 'a3', alive: false })],
    })
    const [inn, wilderness] = restOptions(p)
    expect(inn).toMatchObject({ choice: 'inn', cost: 4, secureStorage: true })
    expect(wilderness).toMatchObject({ choice: 'wilderness', cost: 0, secureStorage: false })
  })

  it('warns that the wilderness closes Secure Storage', () => {
    expect(restOptions(party())[1].note).toContain('moved, sold or discarded')
  })
})

describe('rank derived from a board\'s real xpRows (bug found live 2026-08-20)', () => {
  const withRows = (over: Partial<AdventurerDef> = {}): AdventurerDef =>
    ({
      id: 'syrio',
      name: 'Syrio',
      species: 'Human',
      xpRows: [5, 4, 4, 3],
      boardGrants: [],
      ...over,
    }) as AdventurerDef

  it('escapeTasks derives rank instead of reading the stale stored field', () => {
    const characters = new Map([['syrio', withRows()]])
    // 6 XP fills row 1 and starts row 2 -> rank 2, regardless of the stored `rank: 1`.
    const p = party({ adventurers: [adventurer({ xpFilled: 6, rank: 1 })] })
    const [task] = escapeTasks(p, report({ leftBehind: ['a1'] }), characters)
    expect(task.rank).toBe(2)
  })

  it('advancementTasks derives rank correctly on a board with fewer than 5 rows', () => {
    // Callan's real layout has only 4 rows. Rank derives capped at that board's own
    // row count (never higher, by construction) — filling the whole track lands on
    // its last real row, row 4, not a nonexistent row 5.
    const fourRowBoard = withRows({ xpRows: [4, 3, 4, 2] })
    const characters = new Map([['syrio', fourRowBoard]])
    const p = party({ adventurers: [adventurer({ xpFilled: 13, rank: 1 })] })
    const [task] = advancementTasks(p, report(), characters)
    expect(task.row).toBe(4)
    expect(task.requirement).toBe('survive-and-primary-objective')
  })

  it('marketSummary computes upkeep from the derived rank, not a null/stale stored one', () => {
    const characters = new Map([['syrio', withRows()]])
    const p = party({ adventurers: [adventurer({ xpFilled: 6, rank: null })] })
    const [line] = marketSummary(p, report(), characters).lines
    // Rank 2, took part: 1 per rank + 1 for playing = 3.
    expect(line.cost).toBe(3)
  })
})
