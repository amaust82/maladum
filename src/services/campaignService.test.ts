import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { MaladumDB } from '../db/database'
import { createCampaignService, duplicateEvents, projectCampaign } from './campaignService'
import { loadPacks, type ContentLibrary } from '../content/loader'
import { exportCampaign, importCampaign } from '../db/exportImport'
import { loadEvents } from '../db/repository'
import type { CampaignEvent } from '../store/campaign/events'

let db: MaladumDB
let dbCounter = 0
let ids: number
let clock: number

const libraryWith = (packs: Record<string, unknown>): ContentLibrary => loadPacks(packs).library

const coreV1 = libraryWith({
  'core.json': { id: 'core', name: 'Maladum Deluxe (Core)', schemaVersion: 1, version: 1 },
})
const coreV2 = libraryWith({
  'core.json': { id: 'core', name: 'Maladum Deluxe (Core)', schemaVersion: 1, version: 2 },
})

function service() {
  return createCampaignService({
    db,
    newId: () => `c${++ids}`,
    now: () => (clock += 1000),
  })
}

beforeEach(() => {
  db = new MaladumDB(`svc-test-${dbCounter++}`)
  ids = 0
  clock = 1_700_000_000_000
})

describe('create', () => {
  it('writes a CAMPAIGN_CREATED event carrying the pack manifest', async () => {
    const id = await service().create({ name: 'The Descent', library: coreV1 })
    const events = await loadEvents(db, id)
    expect(events).toEqual([
      {
        t: 'CAMPAIGN_CREATED',
        id: 'c1',
        name: 'The Descent',
        contentPacks: [
          { id: 'core', name: 'Maladum Deluxe (Core)', version: 1, schemaVersion: 1 },
        ],
        createdAt: 1_700_000_001_000,
      },
    ])
  })

  it('derives the picker read-model row from the log, manifest included', async () => {
    const svc = service()
    const id = await svc.create({ name: 'The Descent', library: coreV1 })
    const meta = await svc.get(id)
    expect(meta).toMatchObject({ id, name: 'The Descent', contentPacks: coreV1.packs })
    // The row is a projection of the log, so rebuilding it must reproduce it exactly.
    const state = projectCampaign(await loadEvents(db, id))
    expect(state.contentPacks).toEqual(meta!.contentPacks)
  })

  it('records the creation manifest as the first entry of the pack history', async () => {
    const id = await service().create({ name: 'A', library: coreV1 })
    const state = projectCampaign(await loadEvents(db, id))
    expect(state.contentPackHistory).toEqual([
      { packs: coreV1.packs, at: state.createdAt },
    ])
  })
})

describe('list', () => {
  it('returns campaigns newest-activity-first with an empty report when content matches', async () => {
    const svc = service()
    await svc.create({ name: 'First', library: coreV1 })
    const second = await svc.create({ name: 'Second', library: coreV1 })
    const list = await svc.list(coreV1)
    expect(list.map((c) => c.id)).toEqual([second, 'c1'])
    expect(list.every((c) => c.manifestIssues.length === 0)).toBe(true)
  })

  it('flags a campaign whose content pack has been updated underneath it', async () => {
    const svc = service()
    await svc.create({ name: 'Old save', library: coreV1 })
    const [summary] = await svc.list(coreV2)
    expect(summary.manifestIssues).toMatchObject([
      { severity: 'warning', kind: 'pack-upgraded', recorded: 1, available: 2 },
    ])
  })

  it('flags a campaign built against a pack that is no longer installed', async () => {
    const svc = service()
    await svc.create({ name: 'Ale save', library: coreV1 })
    const [summary] = await svc.list(libraryWith({}))
    expect(summary.manifestIssues).toMatchObject([{ severity: 'error', kind: 'pack-missing' }])
  })
})

describe('duplicate', () => {
  it('copies the whole log under a new id and leaves the original alone', async () => {
    const svc = service()
    const original = await svc.create({ name: 'The Descent', library: coreV1 })
    await svc.commit(original, [{ t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' }])

    const copy = await svc.duplicate(original)
    const copiedEvents = await loadEvents(db, copy)
    const originalEvents = await loadEvents(db, original)

    expect(copiedEvents).toHaveLength(originalEvents.length)
    expect(projectCampaign(copiedEvents)).toMatchObject({
      id: copy,
      name: 'The Descent (copy)',
      parties: [expect.objectContaining({ name: 'Wardens' })],
    })
    expect(projectCampaign(originalEvents)).toMatchObject({ id: original, name: 'The Descent' })
  })

  it('keeps the manifest the original was built against', async () => {
    const svc = service()
    const original = await svc.create({ name: 'A', library: coreV1 })
    const copy = await svc.duplicate(original)
    const meta = await svc.get(copy)
    expect(meta!.contentPacks).toEqual(coreV1.packs)
  })

  it('accepts an explicit name for the copy', async () => {
    const svc = service()
    const original = await svc.create({ name: 'A', library: coreV1 })
    const copy = await svc.duplicate(original, 'Branch B')
    expect((await svc.get(copy))!.name).toBe('Branch B')
  })

  it('rejects duplicating a campaign that does not exist', async () => {
    await expect(service().duplicate('nope')).rejects.toThrow(/not found/)
  })

  it('duplicateEvents rewrites only the creation event (pure)', () => {
    const events: CampaignEvent[] = [
      { t: 'CAMPAIGN_CREATED', id: 'a', name: 'A', contentPacks: [], createdAt: 1 },
      { t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' },
    ]
    const copied = duplicateEvents(events, 'b', 'B')
    expect(copied[0]).toMatchObject({ id: 'b', name: 'B', createdAt: 1 })
    expect(copied[1]).toBe(events[1])
    expect(events[0]).toMatchObject({ id: 'a', name: 'A' })
  })
})

describe('remove', () => {
  it('deletes the campaign and its whole log', async () => {
    const svc = service()
    const id = await svc.create({ name: 'A', library: coreV1 })
    await svc.remove(id)
    expect(await svc.get(id)).toBeUndefined()
    expect(await loadEvents(db, id)).toEqual([])
    expect(await svc.list(coreV1)).toEqual([])
  })

  it('leaves other campaigns untouched', async () => {
    const svc = service()
    const a = await svc.create({ name: 'A', library: coreV1 })
    const b = await svc.create({ name: 'B', library: coreV1 })
    await svc.remove(a)
    expect((await svc.list(coreV1)).map((c) => c.id)).toEqual([b])
  })
})

describe('rename', () => {
  it('appends an event and refreshes the read-model row', async () => {
    const svc = service()
    const id = await svc.create({ name: 'Old', library: coreV1 })
    await svc.rename(id, 'New')
    expect((await svc.get(id))!.name).toBe('New')
    const log = await loadEvents(db, id)
    expect(log[log.length - 1]).toEqual({ t: 'CAMPAIGN_RENAMED', name: 'New' })
  })
})

describe('open', () => {
  it('hydrates an event store whose state matches the log', async () => {
    const svc = service()
    const id = await svc.create({ name: 'A', library: coreV1 })
    await svc.commit(id, [
      { t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' },
      { t: 'STASH_CHANGED', partyId: 'p1', amount: 50 },
    ])
    const { store, manifestIssues } = await svc.open(id, coreV1)
    expect(store.eventCount).toBe(3)
    expect(store.state.parties[0].stash).toBe(50)
    expect(manifestIssues).toEqual([])
  })

  it('supports undo on the opened store without touching what is persisted', async () => {
    const svc = service()
    const id = await svc.create({ name: 'A', library: coreV1 })
    await svc.commit(id, [{ t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' }])
    const { store } = await svc.open(id, coreV1)
    expect(store.undo()).toBe(true)
    expect(store.state.parties).toEqual([])
    expect(await loadEvents(db, id)).toHaveLength(2)
  })

  it('reports the compatibility problem instead of refusing to open', async () => {
    const svc = service()
    const id = await svc.create({ name: 'A', library: coreV1 })
    const { store, manifestIssues } = await svc.open(id, libraryWith({}))
    expect(store.state.name).toBe('A')
    expect(manifestIssues).toMatchObject([{ kind: 'pack-missing' }])
  })

  it('rejects opening a campaign with no log', async () => {
    await expect(service().open('nope', coreV1)).rejects.toThrow(/not found/)
  })
})

describe('acceptContentPacks', () => {
  it('adopts the installed manifest as a new fact, keeping the old one in history', async () => {
    const svc = service()
    const id = await svc.create({ name: 'A', library: coreV1 })
    await svc.acceptContentPacks(id, coreV2, 'core corrections')

    const state = projectCampaign(await loadEvents(db, id))
    expect(state.contentPacks).toEqual(coreV2.packs)
    expect(state.contentPackHistory).toHaveLength(2)
    expect(state.contentPackHistory[0].packs).toEqual(coreV1.packs)
    expect(state.contentPackHistory[1].reason).toBe('core corrections')
  })

  it('clears the compatibility warning on the next list', async () => {
    const svc = service()
    const id = await svc.create({ name: 'A', library: coreV1 })
    expect((await svc.list(coreV2))[0].manifestIssues).toHaveLength(1)
    await svc.acceptContentPacks(id, coreV2)
    expect((await svc.list(coreV2))[0].manifestIssues).toEqual([])
  })
})

describe('export / import interop', () => {
  it('round-trips a campaign as a copy, manifest intact', async () => {
    const svc = service()
    const id = await svc.create({ name: 'The Descent', library: coreV1 })
    await svc.commit(id, [{ t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' }])

    const json = await exportCampaign(db, id)
    const restored = await importCampaign(db, json, { asCopy: { id: 'restored', name: 'Restored' } })

    const list = await svc.list(coreV1)
    expect(list.map((c) => c.id).sort()).toEqual([id, restored].sort())
    expect((await svc.get(restored))!.contentPacks).toEqual(coreV1.packs)
  })
})
