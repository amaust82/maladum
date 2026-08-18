/**
 * Reference index over the loaded content library (design.md §5, Rules tab).
 *
 * The core pack's v2 Reference sections — 75 icon/trait definitions, 43 skills
 * across 10 categories, 4 magic schools of 5 levels each, a 273-row price list,
 * the Item Notes appendix and the crafting resources — are the thing you actually
 * reach for mid-game ("what does Cumbersome do again?"). This module flattens all
 * of them into one searchable list so the screen is presentation over a tested
 * index rather than six bespoke filters.
 *
 * Two things it deliberately does NOT do:
 *
 *   - **It doesn't resolve `[icon: …]` markers.** Those are the transcription's
 *     honest "couldn't identify this glyph" notes. `splitIconMarkers()` separates
 *     them so a screen can render them as visibly-unresolved chips instead of
 *     letting them read as rules text — but nothing here guesses what they mean.
 *   - **It doesn't invent cross-links.** `traitsIn()` only matches trait names
 *     that are actually defined in `library.abilities`, so an item note naming
 *     something the glossary has never heard of stays plain text.
 *
 * Pure — no I/O, no Vue.
 */

import type { ContentLibrary } from './loader'
import { buyPriceOf, sellPriceOf, type ItemDef } from './schema'

export type ReferenceKind = 'ability' | 'skill' | 'spell' | 'item' | 'itemLore' | 'resource'

export interface ReferenceEntry {
  /** Stable within a kind; `${kind}:${key}` is unique across the index. */
  key: string
  kind: ReferenceKind
  title: string
  /** Where this entry sits — its category, school, or item type. */
  group?: string
  /** One-line summary shown next to the title (price, rank, level). */
  subtitle?: string
  /** Full rules text, `[icon: …]` markers intact. */
  body: string
  /** Trait names from the glossary that this entry's text refers to. */
  traits: string[]
}

export const REFERENCE_KINDS: ReferenceKind[] = [
  'ability',
  'skill',
  'spell',
  'item',
  'itemLore',
  'resource',
]

/** Plural labels for the section tabs, in the order players are likeliest to want them. */
export const KIND_LABELS: Record<ReferenceKind, string> = {
  ability: 'Icons & traits',
  skill: 'Skills',
  spell: 'Spells',
  item: 'Equipment',
  itemLore: 'Item notes',
  resource: 'Resources',
}

/**
 * Split text into plain runs and unresolved icon markers.
 *
 * The transcription writes an unidentified glyph as `[icon: dice showing 2 and 3]`.
 * Rendering that inline as prose quietly presents a gap as rules text, so the
 * screen shows the marker as a chip. Returned in document order; a text with no
 * markers yields a single `plain` segment.
 */
export function splitIconMarkers(text: string): { type: 'plain' | 'icon'; text: string }[] {
  const segments: { type: 'plain' | 'icon'; text: string }[] = []
  const pattern = /\[icon:\s*([^\]]*)\]/g
  let last = 0
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    if (m.index > last) segments.push({ type: 'plain', text: text.slice(last, m.index) })
    segments.push({ type: 'icon', text: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ type: 'plain', text: text.slice(last) })
  return segments.length ? segments : [{ type: 'plain', text: '' }]
}

/** How many entries across the packs still carry an unresolved icon marker. */
export function unresolvedIconCount(entries: ReferenceEntry[]): number {
  return entries.filter((e) => splitIconMarkers(e.body).some((s) => s.type === 'icon')).length
}

/**
 * Trait names from the glossary that `text` mentions, longest name first so
 * "Rough Ground X" wins over a bare "Rough Ground" if both are defined.
 *
 * Matching is whole-word and case-sensitive, because the glossary names are
 * capitalized in the source and lowercasing would match ordinary prose ("a sharp
 * turn" is not the Sharp trait).
 */
export function traitsIn(text: string, abilityNames: Iterable<string>): string[] {
  const found: string[] = []
  const names = [...abilityNames].sort((a, b) => b.length - a.length)
  for (const name of names) {
    // Skip glossary entries whose "name" is a symbol rather than a word ("+X dice").
    if (!/^[A-Za-z]/.test(name)) continue
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (pattern.test(text) && !found.includes(name)) found.push(name)
  }
  return found
}

/** Price line for an item, keeping variable prices ("4D6") as printed. */
function priceLine(item: ItemDef): string {
  const raw = (v: unknown) => (v === null || v === undefined ? null : String(v))
  const buy = raw(item.buyPrice ?? item.buyCost)
  const sell = raw(item.sellPrice)
  const parts: string[] = []
  if (buy !== null) parts.push(`buy ${buy}g`)
  else if (item.craftedOnly) parts.push('crafted only')
  if (sell !== null) parts.push(`sell ${sell}g`)
  // A price the app can't do arithmetic on is still worth showing — it just can't
  // be totalled. `buyPriceOf`/`sellPriceOf` are what the market screen must use.
  if (buyPriceOf(item) === null && sellPriceOf(item) === null && parts.length) {
    parts.push('variable')
  }
  return parts.join(' · ')
}

/**
 * Flatten the whole library into one searchable list. Stable order within each
 * kind (as authored in the pack), so the screen doesn't reshuffle between loads.
 */
export function buildReferenceIndex(library: ContentLibrary): ReferenceEntry[] {
  const abilityNames = [...library.abilities.keys()]
  const entries: ReferenceEntry[] = []
  const add = (e: Omit<ReferenceEntry, 'traits'>) =>
    entries.push({ ...e, traits: traitsIn(e.body, abilityNames).filter((t) => t !== e.title) })

  for (const [name, def] of library.abilities) {
    add({ key: name, kind: 'ability', title: name, body: def.text ?? '' })
  }

  for (const [category, def] of library.skills) {
    for (const skill of def.skills) {
      add({
        key: `${category}/${skill.name}`,
        kind: 'skill',
        title: skill.name,
        group: category,
        subtitle: `${skill.levels.length} level${skill.levels.length === 1 ? '' : 's'}`,
        body: skill.levels.map((l) => `Level ${l.level}. ${l.text ?? ''}`).join('\n\n'),
      })
    }
  }

  for (const [school, def] of library.spells) {
    for (const level of def.levels) {
      for (const spell of level.spells) {
        add({
          key: `${school}/${level.level}/${spell.name}`,
          kind: 'spell',
          title: spell.name,
          group: school,
          subtitle: `Level ${level.level}${spell.passive ? ' · passive' : ''}`,
          body: spell.text ?? '',
        })
      }
    }
  }

  for (const [id, item] of library.items) {
    const price = priceLine(item)
    add({
      key: id,
      kind: 'item',
      title: item.name,
      group: item.type ?? 'Other',
      subtitle: [item.rank, item.rarity, price].filter(Boolean).join(' · '),
      body: item.notes ?? '',
    })
  }

  for (const [name, def] of library.itemLore) {
    add({ key: name, kind: 'itemLore', title: name, body: def.text ?? '' })
  }

  for (const [id, res] of library.craftingResources) {
    add({
      key: id,
      kind: 'resource',
      title: res.name,
      subtitle: [res.symbol, res.rarity, res.buyCost == null ? 'not purchasable' : `buy ${res.buyCost}g`]
        .filter(Boolean)
        .join(' · '),
      body: res.notes ?? '',
    })
  }

  return entries
}

/**
 * Search the index. Every whitespace-separated term must match somewhere in the
 * entry (AND, not OR) — with a 273-item price list, an OR search returns most of
 * the book for any two-word query.
 *
 * Ranking: a title match beats a group/subtitle match, which beats a body match.
 * Ties keep index order, so results don't jitter as you type.
 */
export function searchReference(
  entries: ReferenceEntry[],
  query: string,
  kind?: ReferenceKind,
): ReferenceEntry[] {
  const pool = kind ? entries.filter((e) => e.kind === kind) : entries
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return pool

  const scored: { entry: ReferenceEntry; score: number; i: number }[] = []
  pool.forEach((entry, i) => {
    const title = entry.title.toLowerCase()
    const meta = `${entry.group ?? ''} ${entry.subtitle ?? ''}`.toLowerCase()
    const body = entry.body.toLowerCase()
    let best = 0
    for (const term of terms) {
      const where = title.includes(term) ? 3 : meta.includes(term) ? 2 : body.includes(term) ? 1 : 0
      if (where === 0) return // one unmatched term disqualifies the entry
      best = Math.max(best, where)
    }
    scored.push({ entry, score: best, i })
  })

  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.entry)
}

/** Entry counts per kind, for the section tabs. */
export function countsByKind(entries: ReferenceEntry[]): Record<ReferenceKind, number> {
  const counts = Object.fromEntries(REFERENCE_KINDS.map((k) => [k, 0])) as Record<
    ReferenceKind,
    number
  >
  for (const e of entries) counts[e.kind] += 1
  return counts
}
