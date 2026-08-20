import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MaladumDB } from '../db/database'
import { appendEvents, createCampaign, getSyncState, loadEvents } from '../db/repository'
import type { CampaignEvent } from '../store/campaign/events'

// Mocked before importing syncService/authService, which both import this module —
// mocking the one shared client module covers both call paths.
vi.mock('./supabaseClient', () => ({ supabase: fakeSupabase }))

interface EventRecord {
  campaign_id: string
  seq: number
  payload: CampaignEvent
}

let campaignsTable: Map<string, { id: string; owner: string; name: string }>
let eventsTable: EventRecord[]
let session: { user: { id: string } } | null

const fakeSupabase = {
  auth: {
    getSession: async () => ({ data: { session } }),
  },
  from(table: string) {
    if (table === 'campaigns') {
      return {
        upsert: async (row: { id: string; owner: string; name: string }) => {
          campaignsTable.set(row.id, row)
          return { error: null }
        },
        select: () => ({
          eq: async (_col: string, owner: string) => ({
            data: [...campaignsTable.values()]
              .filter((c) => c.owner === owner)
              .map((c) => ({ id: c.id, name: c.name })),
            error: null,
          }),
        }),
      }
    }
    if (table === 'events') {
      return {
        insert: async (rows: EventRecord[]) => {
          for (const r of rows) {
            if (eventsTable.some((e) => e.campaign_id === r.campaign_id && e.seq === r.seq)) {
              return { error: { code: '23505', message: 'duplicate key' } }
            }
          }
          eventsTable.push(...rows)
          return { error: null }
        },
        select: () => ({
          eq: (_col: string, campaignId: string) => ({
            gte: (_col2: string, minSeq: number) => ({
              order: async () => ({
                data: eventsTable
                  .filter((e) => e.campaign_id === campaignId && e.seq >= minSeq)
                  .sort((a, b) => a.seq - b.seq)
                  .map((e) => ({ seq: e.seq, payload: e.payload })),
                error: null,
              }),
            }),
          }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  },
}

const { pushPending, pullNew, syncCampaign, listRemoteCampaigns, downloadCampaign } =
  await import('./syncService')

const created = (id: string, name: string): CampaignEvent => ({
  t: 'CAMPAIGN_CREATED',
  id,
  name,
  contentPacks: [{ id: 'core', name: 'Core', version: 1, schemaVersion: 1 }],
  createdAt: 1000,
})

let db: MaladumDB
let dbCounter = 0

beforeEach(() => {
  db = new MaladumDB(`maladum-sync-test-${dbCounter++}`)
  campaignsTable = new Map()
  eventsTable = []
  session = { user: { id: 'user-1' } }
})

async function seedCampaign(database: MaladumDB, id: string, name: string, events: CampaignEvent[]) {
  await createCampaign(database, { id, name, createdAt: 1000, updatedAt: 1000, contentPacks: [] })
  await appendEvents(database, id, events)
}

describe('pushPending', () => {
  it('is a no-op when signed out', async () => {
    session = null
    await seedCampaign(db, 'c1', 'The Descent', [created('c1', 'The Descent')])
    await pushPending(db, 'c1')
    expect(eventsTable).toEqual([])
  })

  it('pushes every local event and records the pushed count', async () => {
    const events = [created('c1', 'The Descent'), { t: 'RENOWN_CHANGED', partyId: 'p1', amount: 3, source: 'quest' } as CampaignEvent]
    await seedCampaign(db, 'c1', 'The Descent', events)

    await pushPending(db, 'c1')

    expect(eventsTable.map((e) => e.seq)).toEqual([0, 1])
    expect(eventsTable.map((e) => e.payload)).toEqual(events)
    expect(campaignsTable.get('c1')).toEqual({ id: 'c1', owner: 'user-1', name: 'The Descent' })
    expect(await getSyncState(db, 'c1')).toBe(2)
  })

  it('only pushes what has not already been pushed', async () => {
    const first = [created('c1', 'The Descent')]
    await seedCampaign(db, 'c1', 'The Descent', first)
    await pushPending(db, 'c1')
    expect(eventsTable).toHaveLength(1)

    await appendEvents(db, 'c1', [{ t: 'RENOWN_CHANGED', partyId: 'p1', amount: 3, source: 'quest' }])
    await pushPending(db, 'c1')
    expect(eventsTable).toHaveLength(2)
    expect(eventsTable[1].seq).toBe(1)
  })
})

describe('pullNew', () => {
  it('merges remote-only events into the local log and read-model', async () => {
    await seedCampaign(db, 'c1', 'The Descent', [created('c1', 'The Descent')])
    await pushPending(db, 'c1')

    // A "second device" pushed a rename remotely.
    eventsTable.push({ campaign_id: 'c1', seq: 1, payload: { t: 'CAMPAIGN_RENAMED', name: 'Renamed' } })

    await pullNew(db, 'c1')

    const local = await loadEvents(db, 'c1')
    expect(local.map((e) => e.t)).toEqual(['CAMPAIGN_CREATED', 'CAMPAIGN_RENAMED'])
    expect(await getSyncState(db, 'c1')).toBe(2)
  })

  it('does nothing when there is nothing new', async () => {
    await seedCampaign(db, 'c1', 'The Descent', [created('c1', 'The Descent')])
    await pushPending(db, 'c1')
    await pullNew(db, 'c1')
    expect(await loadEvents(db, 'c1')).toHaveLength(1)
  })
})

describe('conflict / rebase', () => {
  it('rebases a losing push onto the winner without losing or duplicating events', async () => {
    const base = [created('c1', 'The Descent')]
    const dbA = new MaladumDB('maladum-sync-test-conflict-a')
    await seedCampaign(dbA, 'c1', 'The Descent', base)
    await pushPending(dbA, 'c1') // seq 0 confirmed remotely.

    // Device B has never seen this campaign locally — pulls it down fresh.
    const dbB = new MaladumDB('maladum-sync-test-conflict-b')
    await pullNew(dbB, 'c1')
    expect(await loadEvents(dbB, 'c1')).toEqual(base)

    // Device A adds and pushes an event first.
    const eventA: CampaignEvent = { t: 'RENOWN_CHANGED', partyId: 'p1', amount: 5, source: 'quest' }
    await appendEvents(dbA, 'c1', [eventA])
    await pushPending(dbA, 'c1')
    expect(eventsTable.map((e) => e.seq)).toEqual([0, 1])

    // Device B, offline at the time, generated its own different event and only now syncs.
    const eventB: CampaignEvent = { t: 'RENOWN_CHANGED', partyId: 'p1', amount: 2, source: 'other' }
    await appendEvents(dbB, 'c1', [eventB])
    await pushPending(dbB, 'c1') // collides at seq 1, rebases onto seq 2.

    expect(eventsTable.map((e) => e.seq)).toEqual([0, 1, 2])
    expect(eventsTable.map((e) => e.payload)).toEqual([base[0], eventA, eventB])
    // Both devices' pushed counts land exactly on their own local event count — no
    // future push re-sends or skips anything. dbA hasn't pulled eventB yet (2 local
    // events); dbB now holds all three (its own eventB plus the pulled eventA).
    expect(await getSyncState(dbA, 'c1')).toBe(2)
    expect(await getSyncState(dbB, 'c1')).toBe(3)
    expect(await loadEvents(dbB, 'c1')).toHaveLength(3)

    // A late pull brings device A up to date with B's rebased event.
    await pullNew(dbA, 'c1')
    expect((await loadEvents(dbA, 'c1')).map((e) => e.t)).toEqual([
      'CAMPAIGN_CREATED',
      'RENOWN_CHANGED',
      'RENOWN_CHANGED',
    ])
  })
})

describe('listRemoteCampaigns / downloadCampaign', () => {
  it('lists what this account has pushed and downloads it to a fresh device', async () => {
    await seedCampaign(db, 'c1', 'The Descent', [created('c1', 'The Descent')])
    await pushPending(db, 'c1')

    expect(await listRemoteCampaigns()).toEqual([{ id: 'c1', name: 'The Descent' }])

    const fresh = new MaladumDB('maladum-sync-test-fresh-device')
    await downloadCampaign(fresh, 'c1')
    expect(await loadEvents(fresh, 'c1')).toEqual([created('c1', 'The Descent')])
  })

  it('returns nothing when signed out', async () => {
    session = null
    expect(await listRemoteCampaigns()).toEqual([])
  })
})

describe('syncCampaign', () => {
  it('swallows errors instead of throwing', async () => {
    await seedCampaign(db, 'c1', 'The Descent', [created('c1', 'The Descent')])
    const original = fakeSupabase.from
    fakeSupabase.from = () => {
      throw new Error('network down')
    }
    try {
      await expect(syncCampaign(db, 'c1')).resolves.toBeUndefined()
    } finally {
      fakeSupabase.from = original
    }
    // Never got as far as recording a push.
    expect(await getSyncState(db, 'c1')).toBe(0)
  })
})

describe('syncStatus (visible feedback, 2026-08-20)', () => {
  it('reflects a successful push and a failed one', async () => {
    const { syncStatus } = await import('./syncStatus')
    await seedCampaign(db, 'c1', 'The Descent', [created('c1', 'The Descent')])
    await pushPending(db, 'c1')
    expect(syncStatus.phase).toBe('idle')
    expect(syncStatus.lastSyncedAt).not.toBeNull()
    expect(syncStatus.error).toBeNull()

    const original = fakeSupabase.from
    fakeSupabase.from = () => {
      throw new Error('network down')
    }
    await appendEvents(db, 'c1', [{ t: 'CAMPAIGN_RENAMED', name: 'Renamed' }])
    await expect(pushPending(db, 'c1')).rejects.toThrow('network down')
    expect(syncStatus.error).toBe('network down')
    fakeSupabase.from = original
  })
})
