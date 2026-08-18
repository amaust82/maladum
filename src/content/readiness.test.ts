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
    expect(adventurerReadiness(adventurer())).toEqual({
      grade: 'ready',
      missing: [],
      unverified: [],
      verified: undefined,
    })
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
    // core.json marks every board with `_placeholder: [...field names]` — an array, not `true`.
    const r = adventurerReadiness(
      adventurer({ cost: null, _placeholder: ['cost'] } as Partial<AdventurerDef>),
    )
    expect(r.grade).toBe('partial')
  })

  it('holds back a board whose untranscribed fields the app does not itself need', () => {
    // Every required field is present, but the pack says the stat block is unknown:
    // that is not "ready", and calling it ready would hide a real gap.
    const r = adventurerReadiness(
      adventurer({ stats: null, _placeholder: ['stats'] } as Partial<AdventurerDef>),
    )
    expect(r).toMatchObject({ grade: 'partial', missing: [], unverified: ['stats'] })
    expect(describeReadiness(r)).toContain('stats')
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

  it("classifies Syrio as partial — his stat block and cost are real, his species isn't", () => {
    const syrio = library.adventurers.get('syrio')
    expect(syrio).toBeDefined()
    const r = adventurerReadiness(syrio!)
    expect(r.grade).toBe('partial')
    expect(r.missing).toContain('species')
    expect(r.missing).not.toContain('cost')
    expect(r.verified).toMatch(/Deluxe rulebook/)
  })

  it('grades every Adventurer partial — real names and costs, untranscribed boards', () => {
    const grades = new Set(
      [...library.adventurers.values()].map((a) => adventurerReadiness(a).grade),
    )
    expect(grades).toEqual(new Set(['partial']))
  })

  it('grades the transcribed Class boards ready — the first content in the pack to get there', () => {
    // The skill wheels were transcribed from the physical boards, so these boards
    // are complete: nothing required is missing and the pack flags nothing unverified.
    const graded = [...library.classes.values()].map((k) => [k.id, classReadiness(k)] as const)
    const ready = graded.filter(([, r]) => r.grade === 'ready').map(([id]) => id)
    expect(ready.length).toBe(library.classes.size - 1)
    expect(ready).toContain('assassin')
  })

  it('still grades the one untranscribed Class board partial, naming its gaps', () => {
    // Mentor is the only board not yet transcribed. It must not be quietly rounded
    // up to "ready" just because every board around it is.
    const r = classReadiness(library.classes.get('mentor')!)
    expect(r.grade).toBe('partial')
    expect(r.unverified).toContain('skills')
  })

  it('has no fully ready board yet — the content gap is real, not hidden', () => {
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
      describeReadiness({ grade: 'ready', missing: [], unverified: [] }),
      describeReadiness({ grade: 'partial', missing: ['cost'], unverified: [] }),
      describeReadiness({ grade: 'placeholder', missing: [], unverified: [] }),
    ]
    expect(new Set(lines).size).toBe(3)
    expect(lines[1]).toContain('cost')
  })
})
