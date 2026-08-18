/**
 * Party builder rules — pure functions, no I/O (design.md §2.2, §4 Phase 1).
 *
 * Two jobs: check a draft party is legal, and total up what it costs in Guilders.
 *
 * The interesting part is the cost total. The seed content packs don't yet carry
 * a Guilder cost for every character/class board (see `content/readiness.ts`), and
 * the tempting shortcut — treat a missing cost as 0 — produces a total that looks
 * authoritative and is wrong. So a cost here is `number | null`, and the summary
 * reports what is known plus which boards it couldn't account for. A total with
 * unknowns is a LOWER BOUND, and `exact` says so. Screens must not round that away.
 *
 * Party value for quest difficulty is a different (and larger) calculation that
 * also counts carried equipment and rank — see `rules/difficulty.ts` (p.72, p.85).
 * This module only covers what the builder itself needs at party-creation time.
 */

/**
 * Maximum Adventurers in one party.
 *
 * Citation gap: design.md §3 states the 4-Adventurer party limit (it's the reason
 * Companions are called out as not counting toward it), but I haven't verified the
 * rulebook page for it, so none is cited here rather than inventing one.
 */
export const MAX_PARTY_SIZE = 4

export interface DraftMember {
  /** Draft-local id, unique within the draft. */
  id: string
  /** Character board → content pack `adventurers[].id`. */
  characterId: string
  /** Class board → content pack `classes[].id`. Empty string = not chosen yet. */
  classId: string
  displayName: string
  /** Character-board hire cost in Guilders; `null` when the pack doesn't know it. */
  characterCost: number | null
  /** Class-board cost in Guilders; `null` when the pack doesn't know it. */
  classCost: number | null
}

export interface PartyDraft {
  name: string
  members: DraftMember[]
  /**
   * Starting Guilders to validate against, if the player supplied one.
   * `null`/omitted = don't validate a budget. The app does not assume a starting
   * purse — that number isn't transcribed from the rulebook yet.
   */
  budget?: number | null
}

export interface CostSummary {
  /** Guilders accounted for by boards whose cost is known. */
  known: number
  /**
   * Boards whose cost the content pack doesn't supply, as `"<memberId>:<field>"`.
   * While this is non-empty, `known` is a lower bound, not the answer.
   */
  unknown: string[]
  /** True when every contributing cost was known, i.e. `known` is the real total. */
  exact: boolean
}

export type PartyIssue =
  | { severity: 'error'; kind: 'party-empty' }
  | { severity: 'error'; kind: 'party-too-large'; size: number; max: number }
  | { severity: 'error'; kind: 'class-not-chosen'; memberId: string }
  /** Two members share one physical board — impossible at the table, not a rules clause. */
  | { severity: 'error'; kind: 'duplicate-character-board'; characterId: string }
  | { severity: 'error'; kind: 'over-budget'; cost: number; budget: number }
  /** A budget was given but some board costs are unknown, so it can't be checked. */
  | { severity: 'warning'; kind: 'budget-unverifiable'; known: number; budget: number; unknown: string[] }
  /** This member's cost is incomplete — surfaced per-member so the UI can badge the card. */
  | { severity: 'warning'; kind: 'incomplete-cost'; memberId: string; fields: string[] }

export interface PartyValidation {
  /** No errors. Warnings do not block — an honest gap isn't an illegal party. */
  ok: boolean
  issues: PartyIssue[]
  cost: CostSummary
}

/** Sum the known board costs, tracking which ones the content couldn't supply. */
export function summarizeCost(members: DraftMember[]): CostSummary {
  let known = 0
  const unknown: string[] = []
  for (const m of members) {
    if (m.characterCost === null) unknown.push(`${m.id}:characterCost`)
    else known += m.characterCost
    // A member with no class chosen has no class cost to be missing — that's a
    // separate error, not a content gap.
    if (m.classId === '') continue
    if (m.classCost === null) unknown.push(`${m.id}:classCost`)
    else known += m.classCost
  }
  return { known, unknown, exact: unknown.length === 0 }
}

/** XP spaces a fresh Adventurer starts with — the board's default fill (design §4 Phase 1). */
export function defaultStartingXp(stats: { xp: { default: number } }): number {
  return stats.xp.default
}

/** Validate a draft party. Errors block saving; warnings are shown and allowed. */
export function validateParty(draft: PartyDraft): PartyValidation {
  const issues: PartyIssue[] = []
  const cost = summarizeCost(draft.members)

  if (draft.members.length === 0) {
    issues.push({ severity: 'error', kind: 'party-empty' })
  }
  if (draft.members.length > MAX_PARTY_SIZE) {
    issues.push({
      severity: 'error',
      kind: 'party-too-large',
      size: draft.members.length,
      max: MAX_PARTY_SIZE,
    })
  }

  const seenBoards = new Set<string>()
  const reportedDuplicates = new Set<string>()
  for (const m of draft.members) {
    if (m.classId === '') {
      issues.push({ severity: 'error', kind: 'class-not-chosen', memberId: m.id })
    }
    if (seenBoards.has(m.characterId) && !reportedDuplicates.has(m.characterId)) {
      issues.push({
        severity: 'error',
        kind: 'duplicate-character-board',
        characterId: m.characterId,
      })
      reportedDuplicates.add(m.characterId)
    }
    seenBoards.add(m.characterId)

    const fields = cost.unknown
      .filter((u) => u.startsWith(`${m.id}:`))
      .map((u) => u.slice(m.id.length + 1))
    if (fields.length > 0) {
      issues.push({ severity: 'warning', kind: 'incomplete-cost', memberId: m.id, fields })
    }
  }

  const budget = draft.budget ?? null
  if (budget !== null) {
    if (cost.known > budget) {
      issues.push({ severity: 'error', kind: 'over-budget', cost: cost.known, budget })
    } else if (!cost.exact) {
      // Under budget on the known costs, but the unknowns could push it over —
      // say that rather than showing a green tick we can't justify.
      issues.push({
        severity: 'warning',
        kind: 'budget-unverifiable',
        known: cost.known,
        budget,
        unknown: cost.unknown,
      })
    }
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues, cost }
}

/** Human-readable one-liner for a validation issue. */
export function describePartyIssue(issue: PartyIssue): string {
  switch (issue.kind) {
    case 'party-empty':
      return 'A party needs at least one Adventurer'
    case 'party-too-large':
      return `${issue.size} Adventurers — a party holds at most ${issue.max}`
    case 'class-not-chosen':
      return 'Choose a Class board for this Adventurer'
    case 'duplicate-character-board':
      return `Two Adventurers are using the "${issue.characterId}" board — you only have one`
    case 'over-budget':
      return `Costs ${issue.cost} Guilders, budget is ${issue.budget}`
    case 'budget-unverifiable':
      return `At least ${issue.known} of ${issue.budget} Guilders — ${issue.unknown.length} cost(s) unknown, so this can't be checked`
    case 'incomplete-cost':
      return `Unknown ${issue.fields.join(' and ')} — this Adventurer's cost isn't in the content pack`
  }
}
