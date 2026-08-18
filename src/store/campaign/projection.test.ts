import { describe, it, expect } from 'vitest'
import { createEventStore } from '../eventStore'
import { campaignReducer, emptyCampaign, type CampaignState } from './projection'
import type { CampaignEvent } from './events'

const newCampaignStore = () =>
  createEventStore<CampaignState, CampaignEvent>({
    reducer: campaignReducer,
    initialState: emptyCampaign(),
  })

// A small campaign scaffold used across several tests.
function seeded() {
  const s = newCampaignStore()
  s.append({
    t: 'CAMPAIGN_CREATED',
    id: 'c1',
    name: 'The Descent',
    contentPacks: [{ id: 'core', version: 1 }],
    createdAt: 1_700_000_000,
  })
  s.append({ t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' })
  s.append({
    t: 'ADVENTURER_ADDED',
    partyId: 'p1',
    advId: 'a1',
    characterId: 'syrio',
    classId: 'ranger',
    displayName: 'Syrio',
  })
  return s
}

describe('campaignReducer via the event store', () => {
  it('builds up campaign → party → adventurer', () => {
    const s = seeded()
    const st = s.state
    expect(st.id).toBe('c1')
    expect(st.name).toBe('The Descent')
    expect(st.parties).toHaveLength(1)
    expect(st.parties[0].adventurers[0].displayName).toBe('Syrio')
  })

  it('ignores duplicate party and adventurer ids', () => {
    const s = seeded()
    s.append({ t: 'PARTY_ADDED', partyId: 'p1', name: 'Dup' })
    s.append({
      t: 'ADVENTURER_ADDED',
      partyId: 'p1',
      advId: 'a1',
      characterId: 'x',
      classId: 'y',
      displayName: 'Dup',
    })
    expect(s.state.parties).toHaveLength(1)
    expect(s.state.parties[0].adventurers).toHaveLength(1)
    expect(s.state.parties[0].name).toBe('Wardens') // original wins
  })

  it('accumulates XP and inventory on the adventurer', () => {
    const s = seeded()
    s.append({ t: 'XP_GAINED', advId: 'a1', amount: 2, reason: 'objective' })
    s.append({ t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'escaped' })
    s.append({ t: 'ITEM_ACQUIRED', advId: 'a1', item: { itemId: 'short-bow' }, via: 'bought' })
    const adv = s.state.parties[0].adventurers[0]
    expect(adv.xpFilled).toBe(3)
    expect(adv.inventory).toEqual([{ itemId: 'short-bow' }])
  })

  it('clamps renown to 0..12 (p.72)', () => {
    const s = seeded()
    s.append({ t: 'RENOWN_CHANGED', partyId: 'p1', amount: 20, source: 'quest' })
    expect(s.state.parties[0].renown).toBe(12)
    s.append({ t: 'RENOWN_CHANGED', partyId: 'p1', amount: -100, source: 'event' })
    expect(s.state.parties[0].renown).toBe(0)
  })

  it('applies stash deltas (positive and negative)', () => {
    const s = seeded()
    s.append({ t: 'STASH_CHANGED', partyId: 'p1', amount: 50, reason: 'reward' })
    s.append({ t: 'STASH_CHANGED', partyId: 'p1', amount: -30, reason: 'upkeep' })
    expect(s.state.parties[0].stash).toBe(20)
  })

  it('undo reverts a projected mutation', () => {
    const s = seeded()
    s.append({ t: 'RENOWN_CHANGED', partyId: 'p1', amount: 5, source: 'quest' })
    expect(s.state.parties[0].renown).toBe(5)
    s.undo()
    expect(s.state.parties[0].renown).toBe(0)
  })

  it('does not mutate prior state objects (immutability)', () => {
    const s = seeded()
    const before = s.state
    const partyBefore = before.parties[0]
    s.append({ t: 'RENOWN_CHANGED', partyId: 'p1', amount: 5, source: 'quest' })
    // Old references are unchanged; the store produced new objects.
    expect(partyBefore.renown).toBe(0)
    expect(s.state).not.toBe(before)
    expect(s.state.parties[0]).not.toBe(partyBefore)
  })

  it('unknown party/adventurer ids pass through without error', () => {
    const s = seeded()
    s.append({ t: 'RENOWN_CHANGED', partyId: 'ghost', amount: 5, source: 'x' })
    s.append({ t: 'XP_GAINED', advId: 'ghost', amount: 5, reason: 'other' })
    expect(s.state.parties[0].renown).toBe(0)
    expect(s.state.parties[0].adventurers[0].xpFilled).toBe(0)
  })
})
