/**
 * Campaign projection (design.md §2.3) — a pure fold over CampaignEvent.
 *
 * State is treated as immutable: every reducer branch returns new objects for
 * the parts it changes and shares the rest. This subset of the §3 domain model
 * covers exactly what the thin event slice touches today; extend both together.
 */

import type { CampaignEvent, Id, ItemRef } from './events'

export interface AdventurerState {
  id: Id
  characterId: string
  classId: string
  displayName: string
  xpFilled: number
  inventory: ItemRef[]
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
  contentPacks: { id: string; version: number }[]
  createdAt: number
  parties: PartyState[]
}

export const RENOWN_MIN = 0
export const RENOWN_MAX = 12

export function emptyCampaign(): CampaignState {
  return { id: null, name: '', contentPacks: [], createdAt: 0, parties: [] }
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
        createdAt: event.createdAt,
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
              xpFilled: 0,
              inventory: [],
            },
          ],
        }
      })

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

    default: {
      // Exhaustiveness guard: a new event type must be handled above.
      const _never: never = event
      return _never
    }
  }
}
