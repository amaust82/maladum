import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { MaladumDB, type CampaignMeta } from './database'
import {
  createCampaign,
  appendEvents,
  loadEvents,
  listCampaigns,
  deleteCampaign,
  getCampaign,
} from './repository'
import { exportCampaign, importCampaign } from './exportImport'
import { createEventStore } from '../store/eventStore'
import { campaignReducer, emptyCampaign, type CampaignState } from '../store/campaign/projection'
import type { CampaignEvent } from '../store/campaign/events'

let db: MaladumDB
let dbCounter = 0

const meta = (id: string, name: string): CampaignMeta => ({
  id,
  name,
  createdAt: 1000,
  updatedAt: 1000,
  contentPacks: [{ id: 'core', version: 1 }],
})

const sampleEvents: CampaignEvent[] = [
  { t: 'CAMPAIGN_CREATED', id: 'c1', name: 'The Descent', contentPacks: [{ id: 'core', version: 1 }], createdAt: 1000 },
  { t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' },
  { t: 'ADVENTURER_ADDED', partyId: 'p1', advId: 'a1', characterId: 'syrio', classId: 'ranger', displayName: 'Syrio' },
  { t: 'XP_GAINED', advId: 'a1', amount: 3, reason: 'objective' },
  { t: 'RENOWN_CHANGED', partyId: 'p1', amount: 5, source: 'quest' },
]

// Each test gets its own uniquely-named database for isolation.
beforeEach(() => {
  db = new MaladumDB(`maladum-test-${dbCounter++}`)
})

function project(events: CampaignEvent[]): CampaignState {
  const store = createEventStore<CampaignState, CampaignEvent>({
    reducer: campaignReducer,
    initialState: emptyCampaign(),
  })
  store.hydrate(events)
  return store.state
}

describe('repository round-trip', () => {
  it('persists events and reloads them in append order', async () => {
    await createCampaign(db, meta('c1', 'The Descent'))
    await appendEvents(db, 'c1', sampleEvents)

    const loaded = await loadEvents(db, 'c1')
    expect(loaded).toEqual(sampleEvents)

    // Folding the reloaded log reproduces the projected state.
    const state = project(loaded)
    expect(state.name).toBe('The Descent')
    expect(state.parties[0].adventurers[0].xpFilled).toBe(3)
    expect(state.parties[0].renown).toBe(5)
  })

  it('appends incrementally across multiple calls, preserving order', async () => {
    await createCampaign(db, meta('c1', 'The Descent'))
    await appendEvents(db, 'c1', sampleEvents.slice(0, 2))
    await appendEvents(db, 'c1', sampleEvents.slice(2))
    expect(await loadEvents(db, 'c1')).toEqual(sampleEvents)
  })

  it('bumps updatedAt on append', async () => {
    await createCampaign(db, meta('c1', 'The Descent'))
    await appendEvents(db, 'c1', sampleEvents, 5000)
    expect((await getCampaign(db, 'c1'))?.updatedAt).toBe(5000)
  })

  it('lists campaigns newest-activity first', async () => {
    await createCampaign(db, meta('c1', 'One'))
    await createCampaign(db, meta('c2', 'Two'))
    await appendEvents(db, 'c1', [sampleEvents[0]], 9000)
    await appendEvents(db, 'c2', [sampleEvents[0]], 3000)
    const list = await listCampaigns(db)
    expect(list.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('keeps campaigns isolated from one another', async () => {
    await createCampaign(db, meta('c1', 'One'))
    await createCampaign(db, meta('c2', 'Two'))
    await appendEvents(db, 'c1', sampleEvents)
    expect(await loadEvents(db, 'c2')).toEqual([])
  })

  it('deletes a campaign and its whole log', async () => {
    await createCampaign(db, meta('c1', 'One'))
    await appendEvents(db, 'c1', sampleEvents)
    await deleteCampaign(db, 'c1')
    expect(await getCampaign(db, 'c1')).toBeUndefined()
    expect(await loadEvents(db, 'c1')).toEqual([])
  })
})

describe('export / import through the DB', () => {
  it('exports a campaign and re-imports it in place', async () => {
    await createCampaign(db, meta('c1', 'The Descent'))
    await appendEvents(db, 'c1', sampleEvents)

    const json = await exportCampaign(db, 'c1')
    await deleteCampaign(db, 'c1')
    expect(await getCampaign(db, 'c1')).toBeUndefined()

    const id = await importCampaign(db, json)
    expect(id).toBe('c1')
    expect(await loadEvents(db, 'c1')).toEqual(sampleEvents)
  })

  it('re-import in place is idempotent (no duplicated events)', async () => {
    await createCampaign(db, meta('c1', 'The Descent'))
    await appendEvents(db, 'c1', sampleEvents)
    const json = await exportCampaign(db, 'c1')
    await importCampaign(db, json)
    expect(await loadEvents(db, 'c1')).toEqual(sampleEvents)
  })

  it('imports as a copy under a new id without touching the original', async () => {
    await createCampaign(db, meta('c1', 'The Descent'))
    await appendEvents(db, 'c1', sampleEvents)
    const json = await exportCampaign(db, 'c1')

    const id = await importCampaign(db, json, { asCopy: { id: 'c2', name: 'The Descent (copy)' } })
    expect(id).toBe('c2')
    expect((await getCampaign(db, 'c2'))?.name).toBe('The Descent (copy)')
    // Original untouched.
    expect(await loadEvents(db, 'c1')).toEqual(sampleEvents)
    expect(await loadEvents(db, 'c2')).toEqual(sampleEvents)
  })

  it('exporting a missing campaign throws', async () => {
    await expect(exportCampaign(db, 'nope')).rejects.toThrow()
  })
})
