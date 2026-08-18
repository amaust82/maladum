/**
 * Party builder application service (design.md §2.2, §4 Phase 1 item 2).
 *
 * Sits between the content library (which knows what a board says) and the pure
 * party-builder rules (which know what is legal). Its one real responsibility is
 * translating content into the rules layer's vocabulary *without inventing values*:
 * a board with no transcribed Guilder cost becomes `null`, not `0`, and travels
 * that way all the way to the screen.
 */

import type { ContentLibrary } from '../content/loader'
import { adventurerReadiness, classReadiness, type Readiness } from '../content/readiness'
import type { AdventurerDef, ClassDef } from '../content/schema'
import {
  defaultStartingXp,
  validateParty,
  type DraftMember,
  type PartyDraft,
  type PartyValidation,
} from '../rules/partyBuilder'
import type { CampaignEvent } from '../store/campaign/events'

/** A character board as the picker needs it: the definition plus how much to trust it. */
export interface BoardOption<T> {
  id: string
  name: string
  def: T
  readiness: Readiness
}

/** Numbers a `null` cost must not be coerced into. */
const costOf = (def: { cost?: number | null }): number | null => def.cost ?? null

export function adventurerOptions(library: ContentLibrary): BoardOption<AdventurerDef>[] {
  return [...library.adventurers.values()]
    .map((def) => ({
      id: def.id,
      name: def.name,
      def,
      readiness: adventurerReadiness(def),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function classOptions(library: ContentLibrary): BoardOption<ClassDef>[] {
  return [...library.classes.values()]
    .map((def) => ({
      id: def.id,
      name: def.name ?? def.id,
      def,
      readiness: classReadiness(def),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Build a draft member from the content library. Unknown ids yield `null` costs
 * rather than throwing — the validation layer reports them as gaps, which is more
 * useful at a table than an exception.
 */
export function draftMemberFrom(
  library: ContentLibrary,
  input: { id: string; characterId: string; classId: string; displayName?: string },
): DraftMember {
  const character = library.adventurers.get(input.characterId)
  const klass = input.classId === '' ? undefined : library.classes.get(input.classId)
  return {
    id: input.id,
    characterId: input.characterId,
    classId: input.classId,
    displayName: input.displayName?.trim() || character?.name || input.characterId,
    characterCost: character ? costOf(character) : null,
    classCost: klass ? costOf(klass) : null,
  }
}

/** A character board's default XP fill, or `null` when its stat block is untranscribed. */
const startingXpOf = (character: AdventurerDef | undefined): number | null =>
  character ? defaultStartingXp(character.stats) : null

export function validateDraft(draft: PartyDraft): PartyValidation {
  return validateParty(draft)
}

/**
 * Turn a validated draft into the events that create the party (design §2.3 — the
 * log is the source of truth, so party creation is events, not a state write).
 *
 * Starting XP comes from the character board's default fill. A board whose stat
 * block isn't transcribed has no default fill to read, so the event omits the
 * field entirely rather than asserting 0 — the gap is already flagged by the
 * readiness model and doesn't need inventing here.
 */
export function partyCreationEvents(
  library: ContentLibrary,
  partyId: string,
  draft: PartyDraft,
): CampaignEvent[] {
  const events: CampaignEvent[] = [{ t: 'PARTY_ADDED', partyId, name: draft.name }]
  for (const m of draft.members) {
    const character = library.adventurers.get(m.characterId)
    const startingXp = startingXpOf(character)
    events.push({
      t: 'ADVENTURER_ADDED',
      partyId,
      advId: m.id,
      characterId: m.characterId,
      classId: m.classId,
      displayName: m.displayName,
      // An untranscribed board has no default XP fill; the field is omitted rather
      // than sent as 0, so the projection's own default is what shows up.
      ...(startingXp === null ? {} : { startingXp }),
    })
  }
  return events
}
