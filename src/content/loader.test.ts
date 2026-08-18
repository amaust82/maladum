import { describe, it, expect } from 'vitest'
import {
  loadPacks,
  loadBundledPacks,
  mergeOrder,
  errorsOnly,
  describeIssue,
  SUPPORTED_SCHEMA_VERSION,
} from './loader'

/** Minimal valid pack; spread over it to build fixtures. */
function pack(overrides: Record<string, unknown> = {}) {
  return { id: 'test', name: 'Test Pack', schemaVersion: 1, ...overrides }
}

describe('mergeOrder', () => {
  it('puts core first, then the rest alphabetically', () => {
    expect(
      mergeOrder([
        '../../content/of-ale-and-adventure.json',
        '../../content/core.json',
        '../../content/oblivions-maw.json',
      ]),
    ).toEqual([
      '../../content/core.json',
      '../../content/oblivions-maw.json',
      '../../content/of-ale-and-adventure.json',
    ])
  })

  it('recognises a bare pack name as core too', () => {
    expect(mergeOrder(['zeta', 'core', 'alpha'])[0]).toBe('core')
  })
})

describe('loadBundledPacks (the real content/*.json)', () => {
  const { library, issues } = loadBundledPacks()

  it('loads every seed pack with no errors', () => {
    expect(errorsOnly(issues).map(describeIssue)).toEqual([])
    expect(library.packs.map((p) => p.id)).toEqual([
      'core',
      'oblivions-maw',
      'of-ale-and-adventure',
      'the-forbidden-creed',
    ])
  })

  it('indexes core crafting resources', () => {
    // All 15 live in core.json; the expansions define recipes that spend them.
    expect(library.craftingResources.size).toBe(15)
    expect(library.craftingResources.get('wood')?.name).toBe('Wood')
    expect(library.provenance.get('craftingResources:wood')).toBe('core')
  })

  it('resolves every expansion recipe against the merged library', () => {
    expect(library.recipes.size).toBeGreaterThan(60)
    for (const [itemId, recipe] of library.recipes) {
      expect(library.items.has(itemId), `item ${itemId}`).toBe(true)
      for (const resourceId of Object.keys(recipe.resources)) {
        expect(library.craftingResources.has(resourceId), `resource ${resourceId}`).toBe(true)
      }
    }
  })

  it('produces a manifest a save file can record', () => {
    for (const entry of library.packs) {
      expect(entry.name).toBeTruthy()
      // Mixed versions are the normal case: core is v2, the crafting packs v1.
      expect(entry.schemaVersion).toBeLessThanOrEqual(SUPPORTED_SCHEMA_VERSION)
    }
  })
})

describe('merging', () => {
  it('lets a later pack override an earlier id, with a warning', () => {
    const { library, issues } = loadPacks({
      core: pack({ id: 'core', items: [{ id: 'rope', name: 'Rope', sellPrice: 1 }] }),
      expansion: pack({ id: 'expansion', items: [{ id: 'rope', name: 'Better Rope', sellPrice: 3 }] }),
    })
    expect(library.items.get('rope')?.name).toBe('Better Rope')
    expect(library.provenance.get('items:rope')).toBe('expansion')
    expect(issues).toEqual([
      {
        severity: 'warning',
        kind: 'duplicate-id',
        packId: 'expansion',
        entity: 'items',
        id: 'rope',
        previousPackId: 'core',
      },
    ])
  })

  it('warns when two packs define a recipe for the same item', () => {
    const { issues } = loadPacks({
      core: pack({
        id: 'core',
        items: [{ id: 'blade', name: 'Blade', sellPrice: 4 }],
        craftingResources: [{ id: 'steel', name: 'Steel', symbol: 'S', rarity: 'common' }],
        recipes: [{ itemId: 'blade', resources: { steel: 2 } }],
      }),
      expansion: pack({ id: 'expansion', recipes: [{ itemId: 'blade', resources: { steel: 1 } }] }),
    })
    const dupes = issues.filter((i) => i.kind === 'duplicate-id')
    expect(dupes).toHaveLength(1)
    expect(dupes[0]).toMatchObject({ entity: 'recipes', id: 'blade', previousPackId: 'core' })
  })

  it('resolves an expansion recipe against a core resource', () => {
    const { issues } = loadPacks({
      core: pack({
        id: 'core',
        craftingResources: [{ id: 'wood', name: 'Wood', symbol: 'W', rarity: 'common' }],
      }),
      expansion: pack({
        id: 'expansion',
        items: [{ id: 'staff', name: 'Staff', sellPrice: 6 }],
        recipes: [{ itemId: 'staff', resources: { wood: 3 } }],
      }),
    })
    expect(errorsOnly(issues)).toEqual([])
  })
})

describe('bad content is reported, not thrown', () => {
  it('reports a pack that fails schema validation and keeps the good ones', () => {
    const { library, issues } = loadPacks({
      core: pack({ id: 'core' }),
      broken: { id: 'broken', name: 'Broken' }, // no schemaVersion
    })
    expect(library.packs.map((p) => p.id)).toEqual(['core'])
    const errors = errorsOnly(issues)
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe('invalid-pack')
    expect(describeIssue(errors[0])).toContain('schemaVersion')
  })

  it('refuses a pack from a future schema version', () => {
    const { library, issues } = loadPacks({
      future: pack({ id: 'future', schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 }),
    })
    expect(library.packs).toEqual([])
    expect(issues[0]).toMatchObject({ kind: 'unsupported-schema-version', packId: 'future' })
  })

  it('refuses a second pack claiming an already-loaded pack id', () => {
    const { library, issues } = loadPacks({
      a: pack({ id: 'dup', items: [{ id: 'x', name: 'X' }] }),
      b: pack({ id: 'dup', items: [{ id: 'y', name: 'Y' }] }),
    })
    expect(library.packs).toHaveLength(1)
    expect(library.items.has('y')).toBe(false)
    expect(issues[0]).toMatchObject({ kind: 'duplicate-pack', packId: 'dup', source: 'b' })
  })

  it('flags a recipe crafting an unknown item', () => {
    const { issues } = loadPacks({
      core: pack({
        id: 'core',
        craftingResources: [{ id: 'wood', name: 'Wood', symbol: 'W', rarity: 'common' }],
        recipes: [{ itemId: 'ghost-item', resources: { wood: 1 } }],
      }),
    })
    expect(errorsOnly(issues)[0]).toMatchObject({ kind: 'unresolved-item', itemId: 'ghost-item' })
  })

  it('flags a recipe needing an unknown resource, including a relic token', () => {
    const { issues } = loadPacks({
      core: pack({
        id: 'core',
        items: [{ id: 'relic', name: 'Relic', sellPrice: 10 }],
        recipes: [
          { itemId: 'relic', resources: { unobtanium: 1 }, isRelic: true, uniqueResourceId: 'mystery' },
        ],
      }),
    })
    const missing = errorsOnly(issues).map((i) => describeIssue(i))
    expect(missing).toHaveLength(2)
    expect(missing.join(' ')).toContain('unobtanium')
    expect(missing.join(' ')).toContain('mystery')
  })
})

describe('the v2 reference entities', () => {
  const { library } = loadBundledPacks()

  it('keys id-less rulebook sections by name so item notes and boards can resolve them', () => {
    expect(library.abilities.get('Sharp')?.text).toBeTruthy()
    expect(library.skills.get('Agility Skills')?.skills.length).toBeGreaterThan(0)
    expect(library.spells.get('Elemental')?.levels).toHaveLength(5)
    expect(library.itemLore.get('Potions')?.text).toBeTruthy()
  })

  it('indexes companions and the difficulty table off the core pack', () => {
    expect(library.companions.size).toBe(10)
    expect(library.difficultyTable).toHaveLength(12)
    expect(library.provenance.get('difficultyTable:*')).toBe('core')
  })

  it('records provenance for a name-keyed entity the same way as an id-keyed one', () => {
    expect(library.provenance.get('abilities:Sharp')).toBe('core')
    expect(library.provenance.get('adventurers:syrio')).toBe('core')
  })

  it('reports a name collision between packs as an override warning, not silence', () => {
    const { issues } = loadPacks({
      core: { id: 'core', name: 'Core', schemaVersion: 2, abilities: [{ name: 'Sharp', text: 'a' }] },
      later: { id: 'later', name: 'Later', schemaVersion: 2, abilities: [{ name: 'Sharp', text: 'b' }] },
    })
    const override = issues.find((i) => i.kind === 'duplicate-id')
    expect(override).toMatchObject({ severity: 'warning', entity: 'abilities', id: 'Sharp' })
  })

  it('refuses a pack from a future schema version rather than parsing it optimistically', () => {
    const { issues, library: lib } = loadPacks({
      core: { id: 'core', name: 'Core', schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 },
    })
    expect(issues.map((i) => i.kind)).toContain('unsupported-schema-version')
    expect(lib.packs).toEqual([])
  })
})
