/**
 * Content pack loader (design.md §2.4).
 *
 * Packs are validated with Zod, merged by id into a single lookup library, and
 * checked for cross-pack referential integrity. Nothing here throws on bad
 * content: loading always returns a library plus a list of issues, so the app
 * can boot with the good packs and surface the broken ones instead of dying at
 * startup with a stack trace.
 *
 * Merge order is deterministic — `core` first, then expansions alphabetically —
 * so a later pack overriding a core id does so predictably (last wins, recorded
 * as a warning). The resulting `packs` manifest is what a save file records so a
 * content update can't silently corrupt a campaign.
 */

import { ContentPack, type AdventurerDef, type ClassDef, type CraftingResourceDef, type ItemDef, type RecipeDef } from './schema'

/** Schema version this build understands. Packs above this are refused. */
export const SUPPORTED_SCHEMA_VERSION = 1

/** The core pack's id — always merged first so expansions layer on top. */
const CORE_PACK_ID = 'core'

export type IssueSeverity = 'error' | 'warning'

export type LoadIssue =
  | { severity: 'error'; kind: 'invalid-pack'; source: string; message: string }
  | { severity: 'error'; kind: 'unsupported-schema-version'; source: string; packId: string; schemaVersion: number }
  | { severity: 'error'; kind: 'duplicate-pack'; source: string; packId: string }
  | { severity: 'warning'; kind: 'duplicate-id'; packId: string; entity: EntityKind; id: string; previousPackId: string }
  | { severity: 'error'; kind: 'unresolved-item'; packId: string; itemId: string }
  | { severity: 'error'; kind: 'unresolved-resource'; packId: string; itemId: string; resourceId: string }

export type EntityKind =
  | 'craftingResources'
  | 'adventurers'
  | 'classes'
  | 'items'
  | 'spells'
  | 'adversaries'
  | 'quests'
  | 'recipes'

/** What a save file records: which packs, at which version, a campaign was built against. */
export interface PackManifestEntry {
  id: string
  name: string
  schemaVersion: number
}

export interface ContentLibrary {
  /** Packs that merged successfully, in merge order. */
  packs: PackManifestEntry[]
  craftingResources: Map<string, CraftingResourceDef>
  adventurers: Map<string, AdventurerDef>
  classes: Map<string, ClassDef>
  items: Map<string, ItemDef>
  spells: Map<string, unknown>
  adversaries: Map<string, unknown>
  quests: Map<string, unknown>
  /** Recipes keyed by the item they craft (design §3.1: one recipe per item). */
  recipes: Map<string, RecipeDef>
  /** `"<entity>:<id>"` → id of the pack the winning definition came from. */
  provenance: Map<string, string>
}

export interface LoadResult {
  library: ContentLibrary
  issues: LoadIssue[]
}

const ENTITY_KINDS: EntityKind[] = [
  'craftingResources',
  'adventurers',
  'classes',
  'items',
  'spells',
  'adversaries',
  'quests',
]

function emptyLibrary(): ContentLibrary {
  return {
    packs: [],
    craftingResources: new Map(),
    adventurers: new Map(),
    classes: new Map(),
    items: new Map(),
    spells: new Map(),
    adversaries: new Map(),
    quests: new Map(),
    recipes: new Map(),
    provenance: new Map(),
  }
}

/**
 * Sort raw pack sources so `core` merges first and the rest follow a stable
 * alphabetical order. Source keys are file paths or bare pack names.
 */
export function mergeOrder(sources: string[]): string[] {
  return [...sources].sort((a, b) => {
    const aCore = isCoreSource(a)
    const bCore = isCoreSource(b)
    if (aCore !== bCore) return aCore ? -1 : 1
    return a.localeCompare(b)
  })
}

function isCoreSource(source: string): boolean {
  const base = source.split('/').pop() ?? source
  return base.replace(/\.json$/, '') === CORE_PACK_ID
}

/**
 * Parse, merge, and integrity-check raw pack data keyed by source (file path or
 * pack name — used only for error reporting and merge ordering).
 */
export function loadPacks(raws: Record<string, unknown>): LoadResult {
  const library = emptyLibrary()
  const issues: LoadIssue[] = []
  const parsed: { source: string; pack: ContentPack }[] = []
  const seenPackIds = new Set<string>()

  for (const source of mergeOrder(Object.keys(raws))) {
    const result = ContentPack.safeParse(raws[source])
    if (!result.success) {
      issues.push({
        severity: 'error',
        kind: 'invalid-pack',
        source,
        message: result.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; '),
      })
      continue
    }
    const pack = result.data
    if (pack.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
      issues.push({
        severity: 'error',
        kind: 'unsupported-schema-version',
        source,
        packId: pack.id,
        schemaVersion: pack.schemaVersion,
      })
      continue
    }
    if (seenPackIds.has(pack.id)) {
      issues.push({ severity: 'error', kind: 'duplicate-pack', source, packId: pack.id })
      continue
    }
    seenPackIds.add(pack.id)
    parsed.push({ source, pack })
  }

  for (const { pack } of parsed) {
    library.packs.push({ id: pack.id, name: pack.name, schemaVersion: pack.schemaVersion })

    for (const entity of ENTITY_KINDS) {
      const index = library[entity] as Map<string, unknown>
      for (const def of pack[entity]) {
        const id = (def as { id: string }).id
        const key = `${entity}:${id}`
        const previousPackId = library.provenance.get(key)
        if (previousPackId !== undefined) {
          issues.push({
            severity: 'warning',
            kind: 'duplicate-id',
            packId: pack.id,
            entity,
            id,
            previousPackId,
          })
        }
        index.set(id, def)
        library.provenance.set(key, pack.id)
      }
    }

    for (const recipe of pack.recipes) {
      const key = `recipes:${recipe.itemId}`
      const previousPackId = library.provenance.get(key)
      if (previousPackId !== undefined) {
        issues.push({
          severity: 'warning',
          kind: 'duplicate-id',
          packId: pack.id,
          entity: 'recipes',
          id: recipe.itemId,
          previousPackId,
        })
      }
      library.recipes.set(recipe.itemId, recipe)
      library.provenance.set(key, pack.id)
    }
  }

  issues.push(...checkReferences(library))
  return { library, issues }
}

/**
 * Cross-pack referential integrity: every recipe crafts a known item out of
 * known resources. Run after merging, because an expansion's recipe legitimately
 * spends resources defined in `core`.
 */
export function checkReferences(library: ContentLibrary): LoadIssue[] {
  const issues: LoadIssue[] = []
  for (const [itemId, recipe] of library.recipes) {
    const packId = library.provenance.get(`recipes:${itemId}`) ?? '(unknown)'
    if (!library.items.has(recipe.itemId)) {
      issues.push({ severity: 'error', kind: 'unresolved-item', packId, itemId: recipe.itemId })
    }
    for (const resourceId of Object.keys(recipe.resources)) {
      if (!library.craftingResources.has(resourceId)) {
        issues.push({
          severity: 'error',
          kind: 'unresolved-resource',
          packId,
          itemId: recipe.itemId,
          resourceId,
        })
      }
    }
    if (recipe.uniqueResourceId && !library.craftingResources.has(recipe.uniqueResourceId)) {
      issues.push({
        severity: 'error',
        kind: 'unresolved-resource',
        packId,
        itemId: recipe.itemId,
        resourceId: recipe.uniqueResourceId,
      })
    }
  }
  return issues
}

/** The subset of issues that should block using the library. */
export function errorsOnly(issues: LoadIssue[]): LoadIssue[] {
  return issues.filter((i) => i.severity === 'error')
}

/** Human-readable one-liner for an issue — used in tests and any dev-mode UI. */
export function describeIssue(issue: LoadIssue): string {
  switch (issue.kind) {
    case 'invalid-pack':
      return `${issue.source}: failed schema validation — ${issue.message}`
    case 'unsupported-schema-version':
      return `${issue.source}: pack "${issue.packId}" is schemaVersion ${issue.schemaVersion}, this build supports ${SUPPORTED_SCHEMA_VERSION}`
    case 'duplicate-pack':
      return `${issue.source}: pack id "${issue.packId}" was already loaded`
    case 'duplicate-id':
      return `${issue.packId} overrides ${issue.entity} "${issue.id}" from ${issue.previousPackId}`
    case 'unresolved-item':
      return `${issue.packId}: recipe crafts unknown item "${issue.itemId}"`
    case 'unresolved-resource':
      return `${issue.packId}: recipe for "${issue.itemId}" needs unknown resource "${issue.resourceId}"`
  }
}

/**
 * Load every pack bundled in `content/*.json`. Vite inlines these at build time,
 * so this is synchronous and works offline — no fetch, no network dependency.
 */
export function loadBundledPacks(): LoadResult {
  const modules = import.meta.glob('../../content/*.json', { eager: true, import: 'default' })
  return loadPacks(modules as Record<string, unknown>)
}
