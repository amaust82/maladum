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

describe('the bundled packs', () => {
  const { library } = loadBundledPacks()

  /**
   * Every board — 20 Adventurers and 25 Classes — was transcribed from the physical
   * components by 2026-08-19, so the real content now grades `ready` across the board.
   *
   * The grading *logic* for partial and placeholder entities is exercised against
   * synthetic fixtures above, deliberately: it must keep working for future packs and
   * for boards whose transcription is corrected, and it would be untested if it relied
   * on the seed content still having gaps.
   */

  it('grades every Adventurer board ready', () => {
    const notReady = [...library.adventurers.values()]
      .map((a) => [a.id, adventurerReadiness(a)] as const)
      .filter(([, r]) => r.grade !== 'ready')
      .map(([id, r]) => `${id}: ${describeReadiness(r)}`)
    expect(notReady).toEqual([])
    expect(library.adventurers.size).toBe(20)
  })

  it('grades every Class board ready', () => {
    const notReady = [...library.classes.values()]
      .map((k) => [k.id, classReadiness(k)] as const)
      .filter(([, r]) => r.grade !== 'ready')
      .map(([id, r]) => `${id}: ${describeReadiness(r)}`)
    expect(notReady).toEqual([])
    expect(library.classes.size).toBe(25)
  })

  it('carries provenance on the one board with two independent sources', () => {
    // Syrio's stat block was read from the rulebook's p.6 worked example AND off the
    // physical component, and the two agreed on all five stats. That's the only board
    // with a second source, so it's the only evidence available that the transcription
    // method itself is accurate — worth keeping the note attached to it.
    expect(library.adventurers.get('syrio')?._verified).toMatch(/cross-validated twice/)
  })

  it('would report a gap if one reappeared, rather than rounding it up', () => {
    // The seed content has no gaps left to observe, so this proves the path still works
    // by grading a copy of a real board with one field knocked out. If a future
    // transcription correction blanks a field, the badge has to notice.
    const real = library.adventurers.get('syrio')!
    const withGap = { ...real, species: null, _placeholder: ['species'] } as typeof real
    const r = adventurerReadiness(withGap)
    expect(r.grade).toBe('partial')
    expect(describeReadiness(r)).toContain('species')
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

describe('describeReadiness names every untrustworthy field', () => {
  it('includes a flagged field that carries a stand-in value, not just blank ones', () => {
    // core.json's Moranna is the real case: `armourSlots: 2` *and* `armourSlots` listed
    // in `_placeholder`. The 2 is a stand-in, so the badge has to say so — otherwise a
    // number the pack itself distrusts reads as verified.
    const r = adventurerReadiness(
      adventurer({
        species: null,
        armourSlots: 2,
        _placeholder: ['armourSlots'],
      } as Partial<AdventurerDef>),
    )
    expect(r.missing).toEqual(['species'])
    expect(r.unverified).toEqual(['armourSlots'])
    const line = describeReadiness(r)
    expect(line).toContain('species')
    expect(line).toContain('armourSlots')
  })

  it('does not repeat a field that is both missing and flagged', () => {
    const r = adventurerReadiness(
      adventurer({ species: null, _placeholder: ['species'] } as Partial<AdventurerDef>),
    )
    expect(describeReadiness(r)).toBe('Unverified: species')
  })
})
