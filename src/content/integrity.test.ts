import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parsePack, type ContentPack } from './schema'

/**
 * Cross-reference integrity for the Class board data (`core.json`), transcribed by
 * hand from the physical components.
 *
 * These checks exist because the Class boards are the one part of the dataset with
 * no machine-readable source anywhere — not in the rulebook PDF, not in the fan
 * spreadsheets. A typo in a skill name can't be caught by re-reading the source, so
 * it has to be caught by the data disagreeing with itself.
 *
 * Every assertion below is a *closure* check: the class boards and the rulebook
 * reference sections were transcribed independently, so where they overlap they must
 * agree exactly, in both directions. A name that resolves one way but leaves an
 * orphan the other way is the signature of a missed or misspelled entry.
 *
 * **What these checks do NOT catch**, verified by mutating the data and re-running:
 * a *misspelled* skill name is caught, and so is a wrong `boardCopies` marker or a
 * half-missing pairing — but a skill wheel entry **dropped entirely** from one board
 * is not. Every skill appears on at least two boards (Reflexes on 11), so the orphan
 * check only fires if a skill vanishes from all of them. Boards carry 6–10 skills with
 * no fixed slot count, so there's no arithmetic to catch an off-by-one either. That
 * gap is irreducible without a second independent source, and is recorded here so
 * nobody reads a green suite as proof the wheels are complete.
 */

function loadCore(): ContentPack {
  const url = new URL('../../content/core.json', import.meta.url)
  return parsePack(JSON.parse(readFileSync(fileURLToPath(url), 'utf-8')))
}

const core = loadCore()

/** Every skill defined in the rulebook Reference section, by name. */
const referenceSkills = new Set(core.skills.flatMap((c) => c.skills.map((s) => s.name)))
/** Every spell name across all four schools and five levels. */
const spellNames = new Set(
  core.spells.flatMap((school) => school.levels.flatMap((l) => l.spells.map((s) => s.name))),
)
const abilityNames = new Set(core.abilities.map((a) => a.name))
const classesByName = new Map(core.classes.map((c) => [c.name ?? c.id, c]))

describe('class skill wheels vs. the rulebook skill reference', () => {
  it('names only skills the reference section defines', () => {
    const unresolved = core.classes.flatMap((c) =>
      c.skills.filter((s) => !referenceSkills.has(s.name)).map((s) => `${c.name}: ${s.name}`),
    )
    expect(unresolved).toEqual([])
  })

  it('leaves no reference skill unreachable from any class board', () => {
    // The other direction, and the more interesting one: a skill in the rulebook that
    // no board grants would mean a skill wheel entry was missed during transcription.
    const used = new Set(core.classes.flatMap((c) => c.skills.map((s) => s.name)))
    const orphans = [...referenceSkills].filter((name) => !used.has(name))
    expect(orphans).toEqual([])
  })

  it('caps every skill slot within the 1–3 level range the boards print', () => {
    for (const klass of core.classes) {
      for (const skill of klass.skills) {
        expect(skill.levelCap, `${klass.name}: ${skill.name}`).toBeGreaterThanOrEqual(1)
        expect(skill.levelCap, `${klass.name}: ${skill.name}`).toBeLessThanOrEqual(3)
      }
    }
  })

  it('never lists the same skill twice on one board', () => {
    for (const klass of core.classes) {
      const names = klass.skills.map((s) => s.name)
      expect(new Set(names).size, `${klass.name} repeats a skill`).toBe(names.length)
    }
  })

  it('keeps every board within the observed 6–10 skill range', () => {
    // Not a rule from the book — a transcription smell test. Boards cluster at 6–8;
    // Curator's 10 is the one outlier and is pinned here so that if it was a
    // transcription artefact, changing it trips a test instead of passing silently.
    for (const klass of core.classes) {
      if (klass.id === 'mentor') continue
      expect(klass.skills.length, `${klass.name}`).toBeGreaterThanOrEqual(6)
      expect(klass.skills.length, `${klass.name}`).toBeLessThanOrEqual(10)
    }
    expect(classesByName.get('Curator')!.skills).toHaveLength(10)
  })
})

describe('class grants vs. the spell and ability references', () => {
  it('grants only spells that exist in a transcribed school', () => {
    const unresolved = core.classes.flatMap((c) =>
      c.grantedSpells.filter((s) => !spellNames.has(s)).map((s) => `${c.name}: ${s}`),
    )
    expect(unresolved).toEqual([])
  })

  it('grants only abilities the icon/trait glossary defines', () => {
    const unresolved = core.classes.flatMap((c) =>
      c.grantedAbilities.filter((a) => !abilityNames.has(a.name)).map((a) => `${c.name}: ${a.name}`),
    )
    expect(unresolved).toEqual([])
  })
})

describe('physical board inventory', () => {
  /**
   * Class boards are double-sided: each physical board carries two classes, so a
   * class's `boardCopies` is how many boards it appears on and `pairedWith` names the
   * class on the reverse of each. The three checks below have to agree, and they were
   * derived from separate parts of the transcription notes — so agreement is evidence,
   * not tautology.
   */
  const withBoards = core.classes.filter((c) => c.boardCopies != null)

  it('covers every class except the untranscribed one', () => {
    const missing = core.classes.filter((c) => c.boardCopies == null).map((c) => c.id)
    expect(missing).toEqual(['mentor'])
  })

  it('pairs classes symmetrically — a board has the same two sides read either way', () => {
    const asymmetric: string[] = []
    for (const klass of withBoards) {
      for (const partner of klass.pairedWith) {
        const other = classesByName.get(partner)
        if (!other) asymmetric.push(`${klass.name} -> unknown class ${partner}`)
        else if (!other.pairedWith.includes(klass.name ?? klass.id)) {
          asymmetric.push(`${klass.name} -> ${partner}, but not back`)
        }
      }
    }
    expect(asymmetric).toEqual([])
  })

  it('gives each class exactly one pairing per physical copy', () => {
    for (const klass of withBoards) {
      expect(klass.pairedWith.length, `${klass.name} boardCopies vs pairings`).toBe(
        klass.boardCopies,
      )
    }
  })

  it('closes the inventory: every board side accounted for exactly once', () => {
    // Two sides per board, so total sides must be even and half of it must equal the
    // number of distinct class pairings. This is the check that caught the Strategist
    // marker typo during transcription.
    const sides = withBoards.reduce((n, c) => n + (c.boardCopies ?? 0), 0)
    const distinctBoards = new Set(
      withBoards.flatMap((c) =>
        c.pairedWith.map((p) => [c.name ?? c.id, p].sort().join(' / ')),
      ),
    )
    expect(sides % 2).toBe(0)
    expect(distinctBoards.size).toBe(sides / 2)
  })

  it('caps how many of one class a party could field, for the rule not yet enforced', () => {
    // The party builder does not yet check that a draft's class picks are physically
    // satisfiable (STATUS.md records this as a known unmodelled constraint). This test
    // pins the data that rule will read, so it can't rot before the rule arrives.
    const sellsword = classesByName.get('Sellsword')!
    expect(sellsword.boardCopies).toBe(5)
    expect(core.classes.every((c) => (c.boardCopies ?? 1) >= 1)).toBe(true)
  })
})

describe('character board grants vs. the rulebook references', () => {
  /**
   * `boardGrants` is a discriminated union on `type`, and each arm points at a
   * different reference section. Same reasoning as the class checks: the boards have
   * no machine-readable source, so a misspelling can only be caught by the grant
   * failing to resolve against the section it claims to come from.
   */
  const allPacks = ['core', 'of-ale-and-adventure', 'the-forbidden-creed', 'oblivions-maw']
    .map((n) => {
      const url = new URL(`../../content/${n}.json`, import.meta.url)
      return { name: n, pack: parsePack(JSON.parse(readFileSync(fileURLToPath(url), 'utf-8'))) }
    })
  const allAdventurers = allPacks.flatMap(({ pack }) => pack.adventurers)
  const grants = allAdventurers.flatMap((a) => a.boardGrants)

  const targets: Record<string, Set<string>> = {
    skill: referenceSkills,
    ability: abilityNames,
    spell: spellNames,
  }

  it('has grants to check, so the assertions below can actually fail', () => {
    // Guards against the whole suite passing vacuously if `boardGrants` ever stops
    // being parsed (it reaches the schema through a discriminated union, not a
    // looseObject passthrough, so a rename would silently empty this).
    expect(grants.length).toBeGreaterThan(30)
    for (const type of Object.keys(targets)) {
      expect(grants.some((g) => g.type === type), `no ${type} grants found`).toBe(true)
    }
  })

  it('resolves every named grant against the section its type claims', () => {
    const unresolved = allAdventurers.flatMap((a) =>
      a.boardGrants
        .filter((g) => g.type !== 'statBonus')
        .filter((g) => !g.name || !targets[g.type].has(g.name))
        .map((g) => `${a.name}: ${g.type} "${g.name}"`),
    )
    expect(unresolved).toEqual([])
  })

  it('gives each grant the fields its type needs and no contradictory ones', () => {
    for (const adv of allAdventurers) {
      for (const g of adv.boardGrants) {
        const where = `${adv.name}: ${g.type}`
        if (g.type === 'statBonus') {
          // Free board text, so it carries `text` and has nothing to resolve.
          expect(g.text, where).toBeTruthy()
          expect(g.name, where).toBeUndefined()
        } else {
          expect(g.name, where).toBeTruthy()
        }
        if (g.type === 'skill') {
          // A skill grant is marks on a track, so it needs both bounds to render.
          expect(g.default, where).toBeGreaterThanOrEqual(0)
          expect(g.max, where).toBeGreaterThanOrEqual(g.default ?? 0)
        }
      }
    }
  })
})

describe('pack placement', () => {
  /**
   * Each Adventurer board records the product it ships in. It also lives in that
   * product's pack file. Those two facts are maintained separately, so asserting they
   * agree is what stops a board being filed in the wrong pack — which would show a
   * player content they don't own, the exact thing the pack split exists to prevent.
   */
  const packs = ['core', 'of-ale-and-adventure', 'the-forbidden-creed', 'oblivions-maw'].map(
    (n) => {
      const url = new URL(`../../content/${n}.json`, import.meta.url)
      return { id: n, pack: parsePack(JSON.parse(readFileSync(fileURLToPath(url), 'utf-8'))) }
    },
  )

  it('files every Adventurer board in the pack its `expansion` field names', () => {
    const misfiled = packs.flatMap(({ id, pack }) =>
      pack.adventurers
        .filter((a) => (a.expansion ?? 'core') !== id)
        .map((a) => `${a.name} says "${a.expansion}" but sits in ${id}.json`),
    )
    expect(misfiled).toEqual([])
  })

  it('spreads the boards across core and both owned expansions', () => {
    const counts = Object.fromEntries(packs.map(({ id, pack }) => [id, pack.adventurers.length]))
    expect(counts).toMatchObject({
      core: 7,
      'of-ale-and-adventure': 8,
      'the-forbidden-creed': 5,
    })
  })

  it('keeps ids unique across packs, so a merge cannot silently drop a board', () => {
    const ids = packs.flatMap(({ pack }) => pack.adventurers.map((a) => a.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('class transcription provenance', () => {
  it('records where the board data came from, and what was assumed', () => {
    const transcribed = core.classes.filter((c) => (c._placeholder as string[]).length === 0)
    expect(transcribed.length).toBe(core.classes.length - 1)
    for (const klass of transcribed) {
      expect(klass._source, `${klass.name} has no _source`).toMatch(/physical Class board/)
      expect((klass._assumptions as string[]).length, `${klass.name}`).toBeGreaterThan(0)
    }
  })
})
