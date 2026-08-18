import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parsePack, type ContentPack } from './schema'

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
      expect(parsed.schemaVersion).toBe(1)
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
