import { describe, it, expect } from 'vitest'
import { serializeExport, parseExport, EXPORT_FORMAT_VERSION } from './exportImport'
import type { CampaignMeta } from './database'
import type { CampaignEvent } from '../store/campaign/events'

const meta: CampaignMeta = {
  id: 'c1',
  name: 'The Descent',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_500,
  contentPacks: [{ id: 'core', name: 'Core', version: 1, schemaVersion: 1 }],
}

const events: CampaignEvent[] = [
  { t: 'CAMPAIGN_CREATED', id: 'c1', name: 'The Descent', contentPacks: [{ id: 'core', name: 'Core', version: 1, schemaVersion: 1 }], createdAt: 1_700_000_000 },
  { t: 'PARTY_ADDED', partyId: 'p1', name: 'Wardens' },
  { t: 'RENOWN_CHANGED', partyId: 'p1', amount: 3, source: 'quest' },
]

describe('export/import serialization', () => {
  it('round-trips a campaign through JSON', () => {
    const json = serializeExport(meta, events)
    const parsed = parseExport(json)
    expect(parsed.formatVersion).toBe(EXPORT_FORMAT_VERSION)
    expect(parsed.campaign).toEqual(meta)
    expect(parsed.events).toEqual(events)
  })

  it('rejects malformed JSON', () => {
    expect(() => parseExport('{ not json')).toThrow()
  })

  it('rejects a wrong format version', () => {
    const bad = JSON.stringify({ formatVersion: 99, campaign: meta, events })
    expect(() => parseExport(bad)).toThrow()
  })

  it('rejects an unknown event type', () => {
    const bad = JSON.stringify({
      formatVersion: EXPORT_FORMAT_VERSION,
      campaign: meta,
      events: [{ t: 'NONSENSE', foo: 1 }],
    })
    expect(() => parseExport(bad)).toThrow()
  })

  it('rejects an event missing required fields', () => {
    const bad = JSON.stringify({
      formatVersion: EXPORT_FORMAT_VERSION,
      campaign: meta,
      events: [{ t: 'PARTY_ADDED', partyId: 'p1' }], // missing name
    })
    expect(() => parseExport(bad)).toThrow()
  })
})
