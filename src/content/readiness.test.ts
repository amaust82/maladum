import { describe, it, expect } from 'vitest'
import {
  adventurerReadiness,
  classReadiness,
  describeReadiness,
  isSelectable,
} from './readiness'
import { loadBundledPacks } from './loader'
import type { AdventurerDef, ClassDef } from './schema'

const stats = {
  health: { default: 4, max: 6 },
  skill: { default: 1, max: 4 },
  magic: { default: 1, max: 4 },
  actions: { default: 2, max: 2 },
  xp: { default: 3, max: 16 },
}

const adventurer = (over: Partial<AdventurerDef> = {}): AdventurerDef =>
  ({ id: 'a', name: 'A', species: 'Human', cost: 30, armourSlots: 2, stats, ...over }) as AdventurerDef

const klass = (over: Partial<ClassDef> = {}): ClassDef =>
  ({ id: 'c', name: 'Warrior', cost: 20, skills: [], spellSchools: [], ...over }) as ClassDef

describe('adventurerReadiness', () => {
  it('grades a fully transcribed board as ready', () => {
    expect(adventurerReadiness(adventurer())).toEqual({ grade: 'ready', missing: [], verified: undefined })
  })

  it('grades a board with unknown fields as partial and names them', () => {
    const r = adventurerReadiness(adventurer({ cost: null, species: null }))
    expect(r.grade).toBe('partial')
    expect(r.missing).toEqual(['species', 'cost'])
  })

  it('treats an absent field the same as an explicit null', () => {
    const def = { id: 'a', name: 'A', stats } as AdventurerDef
    expect(adventurerReadiness(def).missing).toEqual(['species', 'cost', 'armourSlots'])
  })

  it('grades a flagged stand-in as placeholder regardless of what it contains', () => {
    const r = adventurerReadiness(adventurer({ _placeholder: true } as Partial<AdventurerDef>))
    expect(r.grade).toBe('placeholder')
  })

  it('carries the pack _verified provenance note through', () => {
    const r = adventurerReadiness(
      adventurer({ cost: null, _verified: 'Deluxe rulebook, worked example' } as Partial<AdventurerDef>),
    )
    expect(r.verified).toBe('Deluxe rulebook, worked example')
  })

  it('does not treat a field-level _placeholder list as a whole-entity placeholder', () => {
    // core.json marks Syrio with `_placeholder: [...field names]` — an array, not `true`.
    const r = adventurerReadiness(
      adventurer({ cost: null, _placeholder: ['cost'] } as Partial<AdventurerDef>),
    )
    expect(r.grade).toBe('partial')
  })
})

describe('classReadiness', () => {
  it('grades a complete class as ready and an unpriced one as partial', () => {
    expect(classReadiness(klass()).grade).toBe('ready')
    expect(classReadiness(klass({ cost: null })).missing).toEqual(['cost'])
  })
})

describe('the bundled core pack', () => {
  const { library } = loadBundledPacks()

  it("classifies Syrio as partial — his stat block is real, his cost isn't", () => {
    const syrio = library.adventurers.get('syrio')
    expect(syrio).toBeDefined()
    const r = adventurerReadiness(syrio!)
    expect(r.grade).toBe('partial')
    expect(r.missing).toContain('cost')
    expect(r.verified).toMatch(/Deluxe rulebook/)
  })

  it('classifies the flagged stand-ins as placeholders', () => {
    expect(adventurerReadiness(library.adventurers.get('_placeholder-adventurer-2')!).grade).toBe(
      'placeholder',
    )
    expect(classReadiness(library.classes.get('_placeholder-class-1')!).grade).toBe('placeholder')
  })

  it('has no fully ready Adventurer yet — the content gap is real, not hidden', () => {
    const ready = [...library.adventurers.values()].filter(
      (a) => adventurerReadiness(a).grade === 'ready',
    )
    expect(ready).toEqual([])
  })
})

describe('isSelectable', () => {
  it('hides placeholders unless the player opts in, and always allows partial data', () => {
    const placeholder = adventurerReadiness(adventurer({ _placeholder: true } as Partial<AdventurerDef>))
    const partial = adventurerReadiness(adventurer({ cost: null }))
    expect(isSelectable(placeholder, false)).toBe(false)
    expect(isSelectable(placeholder, true)).toBe(true)
    expect(isSelectable(partial, false)).toBe(true)
  })
})

describe('describeReadiness', () => {
  it('produces a distinct one-liner per grade', () => {
    const lines = [
      describeReadiness({ grade: 'ready', missing: [] }),
      describeReadiness({ grade: 'partial', missing: ['cost'] }),
      describeReadiness({ grade: 'placeholder', missing: [] }),
    ]
    expect(new Set(lines).size).toBe(3)
    expect(lines[1]).toContain('cost')
  })
})
