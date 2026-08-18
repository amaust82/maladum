/**
 * Content pack manifest and compatibility checking (design.md §2.4:
 * "a save file records which pack versions it was created against so a content
 * update can't silently corrupt a campaign").
 *
 * WHERE THE MANIFEST LIVES — the Phase 1 decision, recorded here because this is
 * the module that depends on it:
 *
 *   1. The authoritative copy is **inside the event log**, on `CAMPAIGN_CREATED`
 *      (and on any later `CONTENT_PACKS_CHANGED`). The log is the source of truth
 *      and the thing export/import round-trips, so anything not in the log isn't
 *      really saved. Putting it on an event also makes a pack change a *fact with
 *      a timestamp* rather than a mutation: the chronicle can say "quests 1–4 were
 *      played against core v1, quests 5+ against core v2", which is exactly the
 *      question you ask when a number looks wrong.
 *   2. `CampaignMeta.contentPacks` in Dexie is a **denormalized read-model copy**,
 *      projected from the log so the campaign picker can flag an incompatible save
 *      without replaying every event. It is derived, never authoritative — a
 *      rebuild from the log must be able to regenerate it exactly.
 *   3. Nothing here auto-repairs. `compareManifests` reports; the UI shows the
 *      report and the player decides. A campaign built against content that has
 *      since changed is still perfectly playable — the risk is silent drift, and
 *      the fix for silent drift is to stop being silent, not to block the load.
 *
 * `version` (content revision) and `schemaVersion` (pack shape) are compared
 * separately because they mean different things — see `ContentPack` in schema.ts.
 */

import type { ContentLibrary } from './loader'

/** One pack, as recorded in a save file. */
export interface PackRef {
  id: string
  /** Human-readable name, stored so a *missing* pack can still be named in the UI. */
  name: string
  /** Content revision (schema.ts `ContentPack.version`). */
  version: number
  /** Pack shape version (schema.ts `ContentPack.schemaVersion`). */
  schemaVersion: number
}

export type ManifestIssueSeverity = 'error' | 'warning' | 'info'

export type ManifestIssue =
  /** The campaign was built against a pack this build doesn't have at all. */
  | { severity: 'error'; kind: 'pack-missing'; packId: string; packName: string }
  /** The installed pack is an older content revision than the save expects. */
  | { severity: 'error'; kind: 'pack-downgraded'; packId: string; packName: string; recorded: number; available: number }
  /** The installed pack changed shape underneath the save. */
  | { severity: 'error'; kind: 'schema-version-changed'; packId: string; packName: string; recorded: number; available: number }
  /** The installed pack is a newer content revision — usually fine, worth saying. */
  | { severity: 'warning'; kind: 'pack-upgraded'; packId: string; packName: string; recorded: number; available: number }
  /** A pack is installed that the campaign was not built against. */
  | { severity: 'info'; kind: 'pack-added'; packId: string; packName: string }

/** Build the manifest a new campaign should record, from a loaded library. */
export function manifestFrom(library: ContentLibrary): PackRef[] {
  return library.packs.map((p) => ({ ...p }))
}

/**
 * Compare the manifest a campaign recorded against what is installed now.
 *
 * Deterministic order: recorded packs first (in recorded order), then packs that
 * are new to this build. Returns `[]` when the two agree exactly.
 */
export function compareManifests(recorded: PackRef[], available: PackRef[]): ManifestIssue[] {
  const byId = new Map(available.map((p) => [p.id, p]))
  const issues: ManifestIssue[] = []

  for (const want of recorded) {
    const have = byId.get(want.id)
    if (!have) {
      issues.push({
        severity: 'error',
        kind: 'pack-missing',
        packId: want.id,
        packName: want.name,
      })
      continue
    }
    if (have.schemaVersion !== want.schemaVersion) {
      issues.push({
        severity: 'error',
        kind: 'schema-version-changed',
        packId: want.id,
        packName: have.name,
        recorded: want.schemaVersion,
        available: have.schemaVersion,
      })
    }
    if (have.version < want.version) {
      issues.push({
        severity: 'error',
        kind: 'pack-downgraded',
        packId: want.id,
        packName: have.name,
        recorded: want.version,
        available: have.version,
      })
    } else if (have.version > want.version) {
      issues.push({
        severity: 'warning',
        kind: 'pack-upgraded',
        packId: want.id,
        packName: have.name,
        recorded: want.version,
        available: have.version,
      })
    }
  }

  const recordedIds = new Set(recorded.map((p) => p.id))
  for (const have of available) {
    if (!recordedIds.has(have.id)) {
      issues.push({
        severity: 'info',
        kind: 'pack-added',
        packId: have.id,
        packName: have.name,
      })
    }
  }

  return issues
}

/** True when nothing about the content moved in a way that could corrupt the save. */
export function isCompatible(issues: ManifestIssue[]): boolean {
  return !issues.some((i) => i.severity === 'error')
}

/** Human-readable one-liner, for the campaign picker and any dev-mode UI. */
export function describeManifestIssue(issue: ManifestIssue): string {
  switch (issue.kind) {
    case 'pack-missing':
      return `"${issue.packName}" (${issue.packId}) is missing — this campaign was built with it`
    case 'pack-downgraded':
      return `"${issue.packName}" is content v${issue.available}, older than the v${issue.recorded} this campaign was built against`
    case 'schema-version-changed':
      return `"${issue.packName}" changed shape: schemaVersion ${issue.recorded} → ${issue.available}`
    case 'pack-upgraded':
      return `"${issue.packName}" has been updated: content v${issue.recorded} → v${issue.available}`
    case 'pack-added':
      return `"${issue.packName}" is installed but this campaign was not built against it`
  }
}
