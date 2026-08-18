import { describe, it, expect } from 'vitest'
import { buildCharacterSheet, rankFor, type SheetInput } from './characterSheet'
import type { AdventurerDef, ClassDef } from '../content/schema'
import type { AdventurerState } from '../store/campaign/projection'
import { loadBundledPacks } from '../content/loader'

const stats = {
  health: { default: 4, max: 6 },
  skill: { default: 1, max: 4 },
  magic: { default: 1, max: 4 },
  actions: { default: 2, max: 2 },
  xp: { default: 3, max: 16 },
}

const character = (over: Partial<AdventurerDef> = {}): AdventurerDef =>
  ({ id: 'c', name: 'C', species: 'Human', stats, boardGrants: [], ...over }) as AdventurerDef

const klass = (over: Partial<ClassDef> = {}): ClassDef =>
  ({
    id: 'k',
    name: 'K',
    skills: [],
    spellSchools: [],
    statBonuses: [],
    grantedSpells: [],
    grantedAbilities: [],
    pairedWith: [],
    ...over,
  }) as unknown as ClassDef

const state = (over: Partial<AdventurerState> = {}): AdventurerState => ({
  id: 'a1',
  characterId: 'c',
  classId: 'k',
  displayName: 'Someone',
  xpFilled: 0,
  inventory: [],
  skillMarks: {},
  spells: [],
  statIncreases: {},
  rank: null,
  ...over,
})

const sheet = (input: Partial<SheetInput> = {}) =>
  buildCharacterSheet({
    state: state(),
    character: character(),
    klass: klass(),
    ...input,
  })

const kinds = (s: ReturnType<typeof sheet>) => s.issues.map((i) => i.kind)

describe('rankFor', () => {
  it('derives rank from the Experience rows when the board supplies them', () => {
    const c = character({ xpRows: [3, 4, 4, 3, 2] })
    // Rows are cumulative: 3 fills row 1; 7 exactly fills rows 1–2; the 8th space
    // opens row 3, which is what makes them rank 3.
    expect(rankFor(state({ xpFilled: 3 }), c)).toEqual({ rank: 1, derived: true })
    expect(rankFor(state({ xpFilled: 7 }), c)).toEqual({ rank: 2, derived: true })
    expect(rankFor(state({ xpFilled: 8 }), c)).toEqual({ rank: 3, derived: true })
    expect(rankFor(state({ xpFilled: 16 }), c)).toEqual({ rank: 5, derived: true })
  })

  it('falls back to the recorded rank when rows are untranscribed', () => {
    expect(rankFor(state({ rank: 3, xpFilled: 9 }), character())).toEqual({
      rank: 3,
      derived: false,
    })
  })

  it('returns null rather than assuming rank 1 when nothing is known', () => {
    // A rank silently defaulting to 1 would compute every cap it gates against a
    // number nobody verified.
    expect(rankFor(state({ xpFilled: 9 }), character())).toEqual({ rank: null, derived: false })
  })
})

describe('skill marks from the two boards', () => {
  const withSkill = {
    character: character({
      boardGrants: [{ type: 'skill', name: 'Ambush', default: 1, max: 2 }],
    }),
    klass: klass({ skills: [{ name: 'Ambush', levelCap: 3 }] }),
  }

  it('never merges the two boards into one number', () => {
    const s = buildCharacterSheet({
      ...withSkill,
      state: state({ rank: 1, skillMarks: { Ambush: { character: 2, class: 1 } }, xpFilled: 3 }),
    })
    const row = s.skills.find((r) => r.name === 'Ambush')!
    expect(row.marks).toEqual({ character: 2, class: 1 })
    expect(row.level).toBe(3)
  })

  it('lets character-board marks exceed rank — p.80 exempts them', () => {
    // "Spaces marked on your character board are not restricted in this way and apply
    // in addition to those on your Class board, even if the total exceeds your rank."
    const s = buildCharacterSheet({
      ...withSkill,
      state: state({ rank: 1, skillMarks: { Ambush: { character: 2, class: 1 } }, xpFilled: 3 }),
    })
    expect(kinds(s)).not.toContain('class-marks-over-rank')
    expect(kinds(s)).not.toContain('character-marks-over-cap')
  })

  it('caps Class-board marks at the rank and reports going over', () => {
    const s = buildCharacterSheet({
      ...withSkill,
      state: state({ rank: 1, skillMarks: { Ambush: { character: 0, class: 2 } }, xpFilled: 2 }),
    })
    expect(kinds(s)).toContain('class-marks-over-rank')
  })

  it('reports headroom against whichever of rank and board cap binds first', () => {
    const atRank1 = buildCharacterSheet({
      ...withSkill,
      state: state({ rank: 1, xpFilled: 0 }),
    }).skills.find((r) => r.name === 'Ambush')!
    expect(atRank1.classHeadroom).toBe(1) // rank binds

    const atRank5 = buildCharacterSheet({
      ...withSkill,
      state: state({ rank: 5, xpFilled: 0 }),
    }).skills.find((r) => r.name === 'Ambush')!
    expect(atRank5.classHeadroom).toBe(3) // the board's cap of 3 binds
  })

  it('leaves headroom unknown rather than guessing when rank is unknown', () => {
    const row = buildCharacterSheet({ ...withSkill, state: state() }).skills.find(
      (r) => r.name === 'Ambush',
    )!
    expect(row.rankCap).toBeNull()
    expect(kinds(buildCharacterSheet({ ...withSkill, state: state() }))).toContain('rank-unknown')
  })

  it('keeps showing a marked skill the boards no longer carry', () => {
    // A content correction must not make an existing mark vanish from the sheet.
    const s = sheet({ state: state({ skillMarks: { Ghost: { character: 0, class: 1 } }, xpFilled: 1 }) })
    expect(s.skills.map((r) => r.name)).toContain('Ghost')
  })
})

describe('spells', () => {
  const { library } = loadBundledPacks()
  const schools = [...library.spells.values()]

  it('derives board-granted spells rather than storing them', () => {
    const s = buildCharacterSheet({
      state: state(),
      character: character({ boardGrants: [{ type: 'spell', name: 'Curse' }] }),
      klass: klass({ grantedSpells: ['Healing'] }),
      spellSchools: schools,
    })
    expect(s.spells.map((sp) => [sp.name, sp.source])).toEqual([
      ['Curse', 'character-board'],
      ['Healing', 'class-board'],
    ])
    // Nothing was stored on the Adventurer to produce those two.
    expect(state().spells).toEqual([])
  })

  it('resolves a spell to its school and level from the reference', () => {
    const s = buildCharacterSheet({
      state: state({ spells: ['Healing'], xpFilled: 1 }),
      character: character(),
      klass: klass(),
      spellSchools: schools,
    })
    expect(s.spells[0]).toMatchObject({ name: 'Healing', school: 'Proximate', level: 1 })
  })

  it('flags a learned spell above the rank, but not a board-granted one', () => {
    const overRank = buildCharacterSheet({
      state: state({ rank: 1, spells: ['Malacyte Shield'], xpFilled: 1 }),
      character: character(),
      klass: klass(),
      spellSchools: schools,
    })
    expect(kinds(overRank)).toContain('spell-over-rank')

    // The same spell granted by a board is not a rules breach — the board says so.
    const granted = buildCharacterSheet({
      state: state({ rank: 1 }),
      character: character({ boardGrants: [{ type: 'spell', name: 'Malacyte Shield' }] }),
      klass: klass(),
      spellSchools: schools,
    })
    expect(kinds(granted)).not.toContain('spell-over-rank')
  })
})

describe('stats', () => {
  it('adds level-up increases on top of the board default, capped by potential', () => {
    const s = sheet({ state: state({ statIncreases: { health: 2 } }) })
    const health = s.stats!.find((r) => r.key === 'health')!
    expect(health).toMatchObject({ base: 4, increase: 2, current: 6, max: 6, atMax: true })
  })

  it('flags an increase beyond the board potential', () => {
    expect(kinds(sheet({ state: state({ statIncreases: { actions: 3 } }) }))).toContain(
      'stat-over-max',
    )
  })

  it('reports no stats at all when the board is untranscribed, rather than zeroes', () => {
    expect(sheet({ character: character({ stats: null }) }).stats).toBeNull()
  })
})

describe('the Experience/marks invariant (p.80)', () => {
  it('accepts a sheet where every Experience bought exactly one mark', () => {
    const s = sheet({
      state: state({ xpFilled: 3, skillMarks: { A: { character: 1, class: 1 } }, spells: ['Healing'] }),
    })
    expect(kinds(s)).not.toContain('marks-exceed-xp')
  })

  it('flags a half-entered restore where marks and Experience disagree', () => {
    const s = sheet({ state: state({ xpFilled: 5, skillMarks: { A: { character: 1, class: 1 } } }) })
    expect(kinds(s)).toContain('marks-exceed-xp')
  })
})

describe('against real boards', () => {
  const { library } = loadBundledPacks()

  it('builds a sheet for every Adventurer/Class pairing without throwing', () => {
    const klasses = [...library.classes.values()]
    for (const char of library.adventurers.values()) {
      const k = klasses[0]
      const s = buildCharacterSheet({
        state: state({ characterId: char.id, classId: k.id }),
        character: char,
        klass: k,
        spellSchools: library.spells.values(),
      })
      expect(s.displayName, char.id).toBeTruthy()
      expect(s.stats, char.id).not.toBeNull()
    }
  })

  it('reports rank as unknown for every board, since no xpRows are transcribed', () => {
    const char = library.adventurers.get('syrio')!
    const s = buildCharacterSheet({
      state: state(),
      character: char,
      klass: library.classes.get('barbarian')!,
    })
    expect(s.rank).toBeNull()
    expect(s.rankIsDerived).toBe(false)
    expect(kinds(s)).toContain('rank-unknown')
  })

  it('surfaces the class wheel with its real per-slot caps', () => {
    const s = buildCharacterSheet({
      state: state({ rank: 3 }),
      character: library.adventurers.get('syrio')!,
      klass: library.classes.get('assassin')!,
    })
    const malacyte = s.skills.find((r) => r.name === 'Malacyte Mastery')!
    // The Assassin board prints this one at cap 1, not the usual 3.
    expect(malacyte.classCap).toBe(1)
    expect(malacyte.classHeadroom).toBe(1)
    const reflexes = s.skills.find((r) => r.name === 'Reflexes')!
    expect(reflexes.classCap).toBe(3)
  })
})
