import { describe, it, expect } from 'vitest'
import { loadBundledPacks } from './loader'
import {
  buildReferenceIndex,
  countsByKind,
  searchReference,
  splitIconMarkers,
  traitsIn,
  unresolvedIconCount,
  type ReferenceEntry,
} from './reference'

const { library } = loadBundledPacks()
const index = buildReferenceIndex(library)

describe('splitIconMarkers', () => {
  it('separates an unresolved glyph from the prose around it', () => {
    expect(splitIconMarkers('[icon: spell-action symbol]: Restore X Health.')).toEqual([
      { type: 'icon', text: 'spell-action symbol' },
      { type: 'plain', text: ': Restore X Health.' },
    ])
  })

  it('handles several markers and text with none', () => {
    const many = splitIconMarkers('Gain +X [icon: Might] until [icon: end] now')
    expect(many.filter((s) => s.type === 'icon').map((s) => s.text)).toEqual(['Might', 'end'])
    expect(splitIconMarkers('plain text')).toEqual([{ type: 'plain', text: 'plain text' }])
    expect(splitIconMarkers('')).toEqual([{ type: 'plain', text: '' }])
  })

  it('never silently drops the marker text — the gap has to stay visible', () => {
    const round = splitIconMarkers('a [icon: x] b')
      .map((s) => (s.type === 'icon' ? `[icon: ${s.text}]` : s.text))
      .join('')
    expect(round).toBe('a [icon: x] b')
  })
})

describe('traitsIn', () => {
  const names = ['Sharp', 'Cleave', 'Rough Ground X', 'Rough Ground', '+X dice']

  it('matches defined trait names as whole words only', () => {
    expect(traitsIn('This weapon is Sharp.', names)).toEqual(['Sharp'])
    expect(traitsIn('a sharpened stick', names)).toEqual([])
    expect(traitsIn('Sharpshooter', names)).toEqual([])
  })

  it('prefers the longer name when two overlap', () => {
    expect(traitsIn('treat Rough Ground X values as one lower', names)[0]).toBe('Rough Ground X')
  })

  it('ignores glossary entries whose name is a symbol, not a word', () => {
    expect(traitsIn('roll +X dice', names)).toEqual([])
  })

  it('does not invent a link to a trait the glossary has never heard of', () => {
    expect(traitsIn('This item is Fictional.', names)).toEqual([])
  })
})

describe('buildReferenceIndex over the real packs', () => {
  it('indexes every reference section the core pack ships', () => {
    const counts = countsByKind(index)
    expect(counts.ability).toBe(75)
    expect(counts.skill).toBe(43)
    expect(counts.spell).toBeGreaterThan(50)
    expect(counts.itemLore).toBe(15)
    expect(counts.resource).toBe(15)
    // Items span core's price list plus the three crafting expansions.
    expect(counts.item).toBe(library.items.size)
  })

  it('gives every entry a unique key within its kind', () => {
    const keys = index.map((e) => `${e.kind}:${e.key}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('carries a skill’s levels through as one body, irregular ladders included', () => {
    const smithing = index.find((e) => e.kind === 'skill' && e.title === 'Smithing')!
    expect(smithing.group).toContain('Skills')
    // Smithing repeats Level 1 three times in the rulebook; the body keeps all three.
    expect(smithing.body.match(/Level 1\./g)).toHaveLength(3)
    expect(smithing.subtitle).toBe('3 levels')
  })

  it('labels a spell with its school and level', () => {
    const healing = index.find((e) => e.kind === 'spell' && e.title === 'Healing')!
    expect(healing.group).toBe('Proximate')
    expect(healing.subtitle).toContain('Level 1')
  })

  it('shows a variable item price as printed rather than dropping it', () => {
    const variable = index.filter((e) => e.kind === 'item' && e.subtitle?.includes('variable'))
    expect(variable.length).toBeGreaterThan(0)
    expect(variable.some((e) => /\dD6/.test(e.subtitle ?? ''))).toBe(true)
  })

  it('cross-links an item note to the trait the glossary defines', () => {
    const sharpItem = index.find((e) => e.kind === 'item' && e.traits.includes('Sharp'))
    expect(sharpItem, 'no item note mentions a glossary trait').toBeDefined()
    expect(library.abilities.has('Sharp')).toBe(true)
  })

  it('never links an entry to itself', () => {
    for (const e of index) expect(e.traits).not.toContain(e.title)
  })

  it('counts the unresolved icon markers rather than hiding them', () => {
    const unresolved = unresolvedIconCount(index)
    // Known soft spot: a double-digit count of glyphs the transcription couldn't
    // identify. This asserts they're still visible, not that they've been fixed.
    expect(unresolved).toBeGreaterThan(10)
    expect(unresolved).toBeLessThan(index.length)
  })
})

describe('searchReference', () => {
  it('requires every term to match, so a two-word query narrows', () => {
    const one = searchReference(index, 'arrow')
    const two = searchReference(index, 'arrow entangle')
    expect(two.length).toBeLessThan(one.length)
    expect(two.length).toBeGreaterThan(0)
  })

  it('ranks a title match above a body-only match', () => {
    const results = searchReference(index, 'sharp')
    expect(results[0].title).toBe('Sharp')
    expect(results.length).toBeGreaterThan(1)
  })

  it('filters to one kind when asked', () => {
    const spells = searchReference(index, 'healing', 'spell')
    expect(spells.length).toBeGreaterThan(0)
    expect(spells.every((e) => e.kind === 'spell')).toBe(true)
  })

  it('returns the whole pool for an empty query', () => {
    expect(searchReference(index, '   ')).toHaveLength(index.length)
    expect(searchReference(index, '', 'ability')).toHaveLength(75)
  })

  it('returns nothing rather than everything when a term matches nothing', () => {
    expect(searchReference(index, 'sharp zzzznotathing')).toEqual([])
  })

  it('is stable — equal-scoring results keep index order', () => {
    const entries: ReferenceEntry[] = [
      { key: 'a', kind: 'item', title: 'Zeta', body: 'blade', traits: [] },
      { key: 'b', kind: 'item', title: 'Alpha', body: 'blade', traits: [] },
    ]
    expect(searchReference(entries, 'blade').map((e) => e.key)).toEqual(['a', 'b'])
  })
})
