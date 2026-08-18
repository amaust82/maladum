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
 * Adventurers that may go on any one quest — NOT a limit on party size.
 *
 * The citation gap previously noted here is resolved, and it resolved against what
 * this module used to enforce. Rulebook p.68: *"A party can contain any number of
 * Adventurers. However, unless stated otherwise you may only take up to four of them
 * into battle for each quest."* Setup on p.20 says the same from the other side —
 * "choose up to four Adventurers from their party to take part in the quest".
 *
 * So a 5-Adventurer party is legal and normal; picking a roster is a per-quest
 * decision, not a party-creation one. Exceeding four here is worth *mentioning*, never
 * blocking.
 */
export const MAX_QUEST_ROSTER = 4

/** Recommended starting budget for boards *and* starting equipment (p.68). */
export const RECOMMENDED_PARTY_BUDGET = 350

/** Of that budget, the amount p.68 suggests holding back for starting equipment. */
export const RECOMMENDED_EQUIPMENT_ALLOWANCE = 50

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
   * Agreed starting budget in Guilders. `null`/omitted = don't check a budget.
   *
   * There is no fixed value in the rules: p.68 says players "agree on a maximum
   * budget in advance" and *recommends* around 350 (see `RECOMMENDED_PARTY_BUDGET`).
   * So this stays player input, with the recommendation offered rather than assumed.
   */
  budget?: number | null
  /**
   * Guilders spent on starting equipment.
   *
   * This is **inside** the same budget as the boards, not on top of it — p.68: the
   * agreed budget "will be spent on these Adventurers *and on their starting
   * equipment*", with around 50 of it suggested for equipment. Getting this wrong
   * understates what a party costs, which is the whole point of the check.
   */
  equipmentSpend?: number | null
}

export interface CostSummary {
  /** Guilders accounted for — board costs that are known, plus starting equipment. */
  known: number
  /** The board half of `known`, so the UI can show what equipment is leaving room for. */
  boards: number
  /** Guilders spent on starting equipment (p.68 — part of the same budget). */
  equipment: number
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
  /** More Adventurers than can go on one quest. Legal to own — a roster note, not an error. */
  | { severity: 'warning'; kind: 'over-quest-roster'; size: number; max: number }
  | { severity: 'error'; kind: 'class-not-chosen'; memberId: string }
  /** Two members share one physical board — impossible at the table, not a rules clause. */
  | { severity: 'error'; kind: 'duplicate-character-board'; characterId: string }
  | { severity: 'error'; kind: 'over-budget'; cost: number; budget: number }
  /** A budget was given but some board costs are unknown, so it can't be checked. */
  | { severity: 'warning'; kind: 'budget-unverifiable'; known: number; budget: number; unknown: string[] }
  /** This member's cost is incomplete — surfaced per-member so the UI can badge the card. */
  | { severity: 'warning'; kind: 'incomplete-cost'; memberId: string; fields: string[] }
  /**
   * The chosen Classes can't all be seated on the physical double-sided boards at once
   * (design.md §2.4). A **warning**, not an error: the inventory is transcribed data, and
   * transcribed data must never deny a party the player has physically built.
   */
  | {
      severity: 'warning'
      kind: 'boards-unavailable'
      /** Class display names, not ids — this issue exists to be read by a player. */
      overSubscribed: { name: string; picked: number; copies: number }[]
      conflicting: string[]
    }

export interface PartyValidation {
  /** No errors. Warnings do not block — an honest gap isn't an illegal party. */
  ok: boolean
  issues: PartyIssue[]
  cost: CostSummary
  /** Unspent budget, which becomes the party's opening Stash (p.68). `null` if unknowable. */
  stash: number | null
}

/**
 * Sum what the party costs against the agreed budget: known board costs plus starting
 * equipment (p.68 — both come out of the same purse), tracking which board costs the
 * content couldn't supply.
 */
export function summarizeCost(members: DraftMember[], equipmentSpend = 0): CostSummary {
  let boards = 0
  const unknown: string[] = []
  for (const m of members) {
    if (m.characterCost === null) unknown.push(`${m.id}:characterCost`)
    else boards += m.characterCost
    // A member with no class chosen has no class cost to be missing — that's a
    // separate error, not a content gap.
    if (m.classId === '') continue
    if (m.classCost === null) unknown.push(`${m.id}:classCost`)
    else boards += m.classCost
  }
  const equipment = Math.max(0, equipmentSpend)
  return {
    known: boards + equipment,
    boards,
    equipment,
    unknown,
    exact: unknown.length === 0,
  }
}

/**
 * Guilders left over once the party is paid for. Rulebook p.68: *"Any of your budget
 * left unused is added to the Stash on your Base Camp board."*
 *
 * `null` when the budget is unset or some board cost is unknown — an unknown cost makes
 * the remainder unknowable, and a Stash figure that's quietly wrong is worse than none.
 */
export function stashRemainder(cost: CostSummary, budget: number | null | undefined): number | null {
  if (budget === null || budget === undefined || !cost.exact) return null
  return Math.max(0, budget - cost.known)
}

/** XP spaces a fresh Adventurer starts with — the board's default fill (design §4 Phase 1). */
export function defaultStartingXp(
  stats: { xp: { default: number } } | null | undefined,
): number | null {
  return stats ? stats.xp.default : null
}

/** Validate a draft party. Errors block saving; warnings are shown and allowed. */
export function validateParty(draft: PartyDraft): PartyValidation {
  const issues: PartyIssue[] = []
  const cost = summarizeCost(draft.members, draft.equipmentSpend ?? 0)

  if (draft.members.length === 0) {
    issues.push({ severity: 'error', kind: 'party-empty' })
  }
  if (draft.members.length > MAX_QUEST_ROSTER) {
    issues.push({
      severity: 'warning',
      kind: 'over-quest-roster',
      size: draft.members.length,
      max: MAX_QUEST_ROSTER,
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

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    cost,
    stash: stashRemainder(cost, budget),
  }
}

/** Human-readable one-liner for a validation issue. */
export function describePartyIssue(issue: PartyIssue): string {
  switch (issue.kind) {
    case 'party-empty':
      return 'A party needs at least one Adventurer'
    case 'over-quest-roster':
      return `${issue.size} Adventurers — legal to keep, but only ${issue.max} can go on any one quest`
    case 'class-not-chosen':
      return 'Choose a Class board for this Adventurer'
    case 'duplicate-character-board':
      return `Two Adventurers are using the "${issue.characterId}" board — you only have one`
    case 'over-budget':
      return `Costs ${issue.cost} Guilders including starting equipment, budget is ${issue.budget}`
    case 'budget-unverifiable':
      return `At least ${issue.known} of ${issue.budget} Guilders — ${issue.unknown.length} cost(s) unknown, so this can't be checked`
    case 'incomplete-cost':
      return `Unknown ${issue.fields.join(' and ')} — this Adventurer's cost isn't in the content pack`
    case 'boards-unavailable': {
      const over = issue.overSubscribed.map(
        (o) =>
          `${o.picked} × ${o.name}, but ${o.name} is printed on ${o.copies} board${o.copies === 1 ? '' : 's'}`,
      )
      const clash = issue.conflicting.length
        ? [`${issue.conflicting.join(', ')} can't all be used at once — they share boards`]
        : []
      return `Class boards won't stretch: ${[...over, ...clash].join('; ')}`
    }
  }
}
