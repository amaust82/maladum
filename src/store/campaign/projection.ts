/**
 * Campaign projection (design.md §2.3) — a pure fold over CampaignEvent.
 *
 * State is treated as immutable: every reducer branch returns new objects for
 * the parts it changes and shares the rest. This subset of the §3 domain model
 * covers exactly what the thin event slice touches today; extend both together.
 */

import type { PackRef } from '../../content/manifest'
import type { CampaignEvent, Id, ItemRef, LevellableStat } from './events'

/** Marks against one skill, kept per board because the two are capped differently (p.80). */
export interface SkillMarks {
  /** Character-board marks — exempt from the rank cap and stacking on top of `class`. */
  character: number
  /** Class-board marks — may not exceed the Adventurer's rank. */
  class: number
}

export interface AdventurerState {
  id: Id
  characterId: string
  classId: string
  displayName: string
  xpFilled: number
  inventory: ItemRef[]
  /** Skill name → marks per board. Absent key means no marks on either board. */
  skillMarks: Record<string, SkillMarks>
  /**
   * Spells marked on the spell track. Board-granted spells are deliberately NOT here —
   * they're a function of the character and Class boards, so storing them would
   * duplicate the content pack and could drift from it. The sheet merges the two.
   */
  spells: string[]
  /** Permanent increases above the board's default fill, from levelling (p.81). */
  statIncreases: Partial<Record<LevellableStat, number>>
  /**
   * Rank as recorded by the player, for boards whose Experience row layout isn't
   * transcribed. `null` means "derive it" — which currently isn't possible for any
   * board, see `AdventurerDef.xpRows`.
   */
  rank: number | null
}

export interface PartyState {
  id: Id
  name: string
  /** 0..12, hard-clamped (design §3; rulebook p.72). */
  renown: number
  /** Guilders. */
  stash: number
  adventurers: AdventurerState[]
}

export interface CampaignState {
  id: Id | null
  name: string
  /** Manifest currently in force (design §2.4) — see content/manifest.ts for why it lives here. */
  contentPacks: PackRef[]
  /** Every manifest this campaign has been played against, oldest first. */
  contentPackHistory: { packs: PackRef[]; at: number; reason?: string }[]
  createdAt: number
  parties: PartyState[]
}

export const RENOWN_MIN = 0
export const RENOWN_MAX = 12

export function emptyCampaign(): CampaignState {
  return {
    id: null,
    name: '',
    contentPacks: [],
    contentPackHistory: [],
    createdAt: 0,
    parties: [],
  }
}

const clampRenown = (n: number): number => Math.min(RENOWN_MAX, Math.max(RENOWN_MIN, n))

/** Immutably replace the party with `partyId`, applying `fn`; unknown ids pass through unchanged. */
function updateParty(
  state: CampaignState,
  partyId: Id,
  fn: (p: PartyState) => PartyState,
): CampaignState {
  return { ...state, parties: state.parties.map((p) => (p.id === partyId ? fn(p) : p)) }
}

/** Immutably update the adventurer with `advId` wherever it lives; unknown ids pass through. */
function updateAdventurer(
  state: CampaignState,
  advId: Id,
  fn: (a: AdventurerState) => AdventurerState,
): CampaignState {
  return {
    ...state,
    parties: state.parties.map((p) => {
      if (!p.adventurers.some((a) => a.id === advId)) return p
      return { ...p, adventurers: p.adventurers.map((a) => (a.id === advId ? fn(a) : a)) }
    }),
  }
}

export function campaignReducer(state: CampaignState, event: CampaignEvent): CampaignState {
  switch (event.t) {
    case 'CAMPAIGN_CREATED':
      return {
        ...state,
        id: event.id,
        name: event.name,
        contentPacks: event.contentPacks,
        contentPackHistory: [{ packs: event.contentPacks, at: event.createdAt }],
        createdAt: event.createdAt,
      }

    case 'CAMPAIGN_RENAMED':
      return { ...state, name: event.name }

    case 'CONTENT_PACKS_CHANGED':
      return {
        ...state,
        contentPacks: event.contentPacks,
        contentPackHistory: [
          ...state.contentPackHistory,
          { packs: event.contentPacks, at: event.at, reason: event.reason },
        ],
      }

    case 'PARTY_ADDED':
      if (state.parties.some((p) => p.id === event.partyId)) return state
      return {
        ...state,
        parties: [
          ...state.parties,
          { id: event.partyId, name: event.name, renown: 0, stash: 0, adventurers: [] },
        ],
      }

    case 'ADVENTURER_ADDED':
      return updateParty(state, event.partyId, (p) => {
        if (p.adventurers.some((a) => a.id === event.advId)) return p
        return {
          ...p,
          adventurers: [
            ...p.adventurers,
            {
              id: event.advId,
              characterId: event.characterId,
              classId: event.classId,
              displayName: event.displayName,
              xpFilled: event.startingXp ?? 0,
              inventory: [],
              skillMarks: {},
              spells: [],
              statIncreases: {},
              rank: null,
            },
          ],
        }
      })

    case 'ADVENTURER_REMOVED':
      return updateParty(state, event.partyId, (p) => ({
        ...p,
        adventurers: p.adventurers.filter((a) => a.id !== event.advId),
      }))

    case 'RENOWN_CHANGED':
      return updateParty(state, event.partyId, (p) => ({
        ...p,
        renown: clampRenown(p.renown + event.amount),
      }))

    case 'STASH_CHANGED':
      return updateParty(state, event.partyId, (p) => ({ ...p, stash: p.stash + event.amount }))

    case 'XP_GAINED':
      return updateAdventurer(state, event.advId, (a) => ({
        ...a,
        xpFilled: a.xpFilled + event.amount,
      }))

    case 'ITEM_ACQUIRED':
      return updateAdventurer(state, event.advId, (a) => ({
        ...a,
        inventory: [...a.inventory, event.item],
      }))

    case 'XP_SET':
      return updateAdventurer(state, event.advId, (a) => ({
        ...a,
        xpFilled: Math.max(0, event.filled),
      }))

    case 'SKILL_MARKS_SET':
      return updateAdventurer(state, event.advId, (a) => {
        const current = a.skillMarks[event.skill] ?? { character: 0, class: 0 }
        const next = { ...current, [event.source]: Math.max(0, event.marks) }
        const skillMarks = { ...a.skillMarks, [event.skill]: next }
        // Drop the key entirely when nothing is marked, so an untouched skill doesn't
        // linger in the save as a row of zeroes.
        if (next.character === 0 && next.class === 0) delete skillMarks[event.skill]
        return { ...a, skillMarks }
      })

    case 'SPELL_LEARNED':
      return updateAdventurer(state, event.advId, (a) =>
        a.spells.includes(event.spell) ? a : { ...a, spells: [...a.spells, event.spell] },
      )

    case 'SPELL_UNLEARNED':
      return updateAdventurer(state, event.advId, (a) => ({
        ...a,
        spells: a.spells.filter((s) => s !== event.spell),
      }))

    case 'STAT_INCREASE_SET':
      return updateAdventurer(state, event.advId, (a) => {
        const statIncreases = { ...a.statIncreases, [event.stat]: Math.max(0, event.increase) }
        if (statIncreases[event.stat] === 0) delete statIncreases[event.stat]
        return { ...a, statIncreases }
      })

    case 'RANK_SET':
      return updateAdventurer(state, event.advId, (a) => ({
        ...a,
        rank: event.rank === null ? null : Math.max(1, event.rank),
      }))

    default: {
      // Exhaustiveness guard: a new event type must be handled above.
      const _never: never = event
      return _never
    }
  }
}
