/**
 * Content readiness (design.md §8, and the seed-pack caveats in STATUS.md).
 *
 * The seed packs deliberately contain three different grades of content, and the
 * app has to tell them apart rather than pretend they're equal:
 *
 *   - **ready** — every field the app needs to compute with is present.
 *   - **partial** — real, verified data, but some fields the app needs are still
 *     unknown (Syrio: verified stat block, unknown Guilder cost). Usable, but any
 *     number derived from a missing field must be reported as *unknown*, never
 *     silently as 0.
 *   - **placeholder** — the whole entity is a structural stand-in, flagged in the
 *     data with `"_placeholder": true`. Valid shape, fake content.
 *
 * `_placeholder` carries two different meanings in the packs and they must not be
 * conflated: `true` means the whole entity is fake, while an **array of field
 * names** means the entity is real but those particular fields aren't transcribed
 * (every board in core v2 is the latter — real name and Guilder cost off the
 * calculator spreadsheet, `null` stat block until someone photographs the board).
 * A field-level list therefore grades `partial`, never `placeholder`.
 *
 * Why classify here instead of at each call site: the honest-gap rule from
 * CLAUDE.md only holds if "we don't know this" is a first-class value that
 * propagates. This module turns the packs' hand-authored `_placeholder` /
 * `_verified` annotations into that value, once, so every screen agrees on which
 * numbers are trustworthy and no screen has to re-guess.
 *
 * Pure — no I/O, no Vue. Tested alongside the rules engine.
 */

import type { AdventurerDef, ClassDef } from './schema'

export type ReadinessGrade = 'ready' | 'partial' | 'placeholder'

export interface Readiness {
  grade: ReadinessGrade
  /** Field names the app needs but the pack doesn't supply, in declaration order. */
  missing: string[]
  /** Fields the pack flags as untranscribed, whether or not the app needs them. */
  unverified: string[]
  /** Provenance note from the pack's `_verified` annotation, if any. */
  verified?: string
}

/** Fields the party builder and difficulty calculator need from a character board. */
const ADVENTURER_REQUIRED = ['species', 'cost', 'armourSlots'] as const
/** Fields the party builder needs from a class board. */
const CLASS_REQUIRED = ['name', 'cost'] as const

/** True when the pack itself flags the WHOLE entity as a structural stand-in. */
function isFlaggedPlaceholder(def: object): boolean {
  return (def as { _placeholder?: unknown })._placeholder === true
}

/**
 * Field names the pack flags as untranscribed. These aren't necessarily fields
 * the app needs (`missing`), but they're the honest answer to "is this board
 * fully known?", so they hold a board back from `ready`.
 */
function unverifiedFields(def: object): string[] {
  const flag = (def as { _placeholder?: unknown })._placeholder
  return Array.isArray(flag) ? flag.filter((f): f is string => typeof f === 'string') : []
}

function verifiedNote(def: object): string | undefined {
  const note = (def as { _verified?: unknown })._verified
  return typeof note === 'string' ? note : undefined
}

/** A field counts as supplied only if it is neither `null` nor `undefined`. */
function missingFields(def: object, required: readonly string[]): string[] {
  const record = def as Record<string, unknown>
  return required.filter((f) => record[f] === null || record[f] === undefined)
}

function grade(def: object, required: readonly string[]): Readiness {
  const verified = verifiedNote(def)
  if (isFlaggedPlaceholder(def)) {
    // A flagged placeholder's fields aren't worth enumerating — nothing on it is real.
    return { grade: 'placeholder', missing: [...required], unverified: [], verified }
  }
  const missing = missingFields(def, required)
  const unverified = unverifiedFields(def)
  const complete = missing.length === 0 && unverified.length === 0
  return { grade: complete ? 'ready' : 'partial', missing, unverified, verified }
}

export function adventurerReadiness(def: AdventurerDef): Readiness {
  return grade(def, ADVENTURER_REQUIRED)
}

export function classReadiness(def: ClassDef): Readiness {
  return grade(def, CLASS_REQUIRED)
}

/** Placeholder content is hidden from pickers unless the player opts in. */
export function isSelectable(readiness: Readiness, allowPlaceholders: boolean): boolean {
  return readiness.grade !== 'placeholder' || allowPlaceholders
}

/** Short human-readable explanation for a badge or tooltip. */
export function describeReadiness(readiness: Readiness): string {
  switch (readiness.grade) {
    case 'ready':
      return 'Complete'
    case 'partial': {
      // Prefer the fields the app actually needs; fall back to the pack's own
      // untranscribed list so a board that's merely incomplete still says why.
      const fields = readiness.missing.length ? readiness.missing : readiness.unverified
      return `Unverified: ${fields.join(', ')}`
    }
    case 'placeholder':
      return 'Placeholder — not real game data'
  }
}
