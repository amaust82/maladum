import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { buyPriceOf, isVariablePrice, numericPrice, parsePack, sellPriceOf, type ContentPack } from './schema'
import { SUPPORTED_SCHEMA_VERSION } from './loader'

const PACK_FILES = [
  'core',
  'of-ale-and-adventure',
  'the-forbidden-creed',
  'oblivions-maw',
] as const

function loadRaw(name: string): unknown {
  const url = new URL(`../../content/${name}.json`, import.meta.url)
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf-8'))
}

const packs: Record<string, ContentPack> = {}

describe('content pack schema', () => {
  for (const name of PACK_FILES) {
    it(`${name}.json validates against the Zod schema`, () => {
      const parsed = parsePack(loadRaw(name))
      packs[name] = parsed
      expect(parsed.id).toBeTruthy()
      // core is v2 (it added companions/skills/abilities/itemLore/difficultyTable);
      // the crafting expansions are still v1 and must keep parsing unchanged.
      expect(parsed.schemaVersion).toBeLessThanOrEqual(SUPPORTED_SCHEMA_VERSION)
    })
  }
})

describe('referential integrity', () => {
  // Crafting resources live in core.json but are referenced by recipes in every pack.
  function resourceIds(): Set<string> {
    const ids = new Set<string>()
    for (const name of PACK_FILES) {
      const pack = packs[name] ?? parsePack(loadRaw(name))
      packs[name] = pack
      for (const r of pack.craftingResources) ids.add(r.id)
    }
    return ids
  }

  for (const name of PACK_FILES) {
    it(`${name}: every recipe.itemId resolves to an item in the same pack`, () => {
      const pack = packs[name] ?? parsePack(loadRaw(name))
      const itemIds = new Set(pack.items.map((i) => i.id))
      for (const recipe of pack.recipes) {
        expect(itemIds, `recipe itemId "${recipe.itemId}"`).toContain(recipe.itemId)
      }
    })

    it(`${name}: every recipe resource key resolves to a known crafting resource`, () => {
      const known = resourceIds()
      const pack = packs[name] ?? parsePack(loadRaw(name))
      for (const recipe of pack.recipes) {
        for (const resId of Object.keys(recipe.resources)) {
          expect(known, `resource "${resId}" in recipe "${recipe.itemId}"`).toContain(resId)
        }
      }
    })
  }

  it('all ids are unique within each entity array', () => {
    for (const name of PACK_FILES) {
      const pack = packs[name] ?? parsePack(loadRaw(name))
      for (const key of ['craftingResources', 'adventurers', 'classes', 'items'] as const) {
        const ids = pack[key].map((e) => e.id)
        expect(new Set(ids).size, `${name}.${key} has duplicate ids`).toBe(ids.length)
      }
    }
  })
})

describe('core v2 reference sections', () => {
  const core = () => packs['core'] ?? (packs['core'] = parsePack(loadRaw('core')))

  it('keeps the rulebook school → level → spell nesting for all four schools', () => {
    const schools = core().spells
    expect(schools.map((s) => s.name).sort()).toEqual(
      ['Elemental', 'Forbidden', 'Proximate', 'Vicarious'].sort(),
    )
    for (const school of schools) {
      // Every school runs 1–5, Forbidden included.
      expect(school.levels.map((l) => l.level), `${school.name} levels`).toEqual([1, 2, 3, 4, 5])
      for (const lvl of school.levels) {
        expect(lvl.spells.length, `${school.name} L${lvl.level}`).toBeGreaterThan(0)
      }
    }
  })

  it('does not normalize the irregular Townsfolk skill ladders', () => {
    // Bombast has 2 levels and Herbalism/Loremaster/Smithing repeat level 1 —
    // the rulebook says that's intentional for skills that scale by "X".
    const all = core().skills.flatMap((c) => c.skills)
    const ladder = (name: string) =>
      all.find((s) => s.name === name)?.levels.map((l) => l.level)
    expect(ladder('Bombast')).toEqual([1, 2])
    expect(ladder('Herbalism')).toEqual([1, 1, 3])
    expect(ladder('Loremaster')).toEqual([1, 1, 2])
    expect(ladder('Smithing')).toEqual([1, 1, 1])
    // …and those four are the only irregular ones; the rest are a clean 1/2/3.
    const irregular = all.filter(
      (s) => s.levels.map((l) => l.level).join() !== '1,2,3',
    )
    expect(irregular.map((s) => s.name).sort()).toEqual([
      'Bombast',
      'Herbalism',
      'Loremaster',
      'Smithing',
    ])
  })

  it('defines every ability the glossary is keyed by, uniquely', () => {
    const names = core().abilities.map((a) => a.name)
    expect(names.length).toBeGreaterThan(50)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Sharp')
  })

  it('ships a difficulty table whose bands are contiguous and open-ended at the top', () => {
    const bands = core().difficultyTable
    expect(bands).toHaveLength(12)
    expect(bands[0].min).toBe(0)
    expect(bands[bands.length - 1].max).toBeNull()
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].min, `band ${bands[i].band} starts after band ${i}`).toBe(
        bands[i - 1].max! + 1,
      )
    }
  })

  it('names every companion with a cost', () => {
    expect(core().companions).toHaveLength(10)
    for (const c of core().companions) expect(typeof c.cost).toBe('number')
  })
})

describe('price parsing', () => {
  it('reads a variable price as unknown rather than zero', () => {
    expect(numericPrice('4D6')).toBeNull()
    expect(isVariablePrice('4D6')).toBe(true)
    expect(numericPrice(null)).toBeNull()
    expect(isVariablePrice(null)).toBe(false)
  })

  it('reads either spelling of an item buy price', () => {
    const core = packs['core'] ?? (packs['core'] = parsePack(loadRaw('core')))
    const arrows = core.items.find((i) => i.id === 'arrows')!
    expect(buyPriceOf(arrows)).toBe(2)
    expect(sellPriceOf(arrows)).toBe(1)

    const crafted = parsePack(loadRaw('of-ale-and-adventure')).items[0]
    expect(buyPriceOf(crafted)).toBeNull()
    expect(sellPriceOf(crafted)).toBe(2)
  })

  it('leaves no item priced 0 by accident across the whole price list', () => {
    const core = packs['core'] ?? (packs['core'] = parsePack(loadRaw('core')))
    const zeroed = core.items.filter((i) => buyPriceOf(i) === 0 && i.buyCost == null)
    expect(zeroed).toEqual([])
  })
})
