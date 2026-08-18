import { describe, it, expect } from 'vitest'
import {
  campIssues,
  clampRenown,
  innCost,
  RENOWN_MAX,
  RENOWN_SPEND_WINDOWS,
  summarizeStorage,
} from './baseCamp'
import type { StoredItem } from '../store/campaign/projection'

const stored = (itemId: string, secure = false): StoredItem => ({ item: { itemId }, secure })

describe('clampRenown', () => {
  it('holds the track between 0 and 12 (p.72)', () => {
    expect(clampRenown(-3)).toBe(0)
    expect(clampRenown(7)).toBe(7)
    expect(clampRenown(20)).toBe(RENOWN_MAX)
  })
})

describe('innCost', () => {
  it('charges 2 Guilders per Adventurer (p.86)', () => {
    expect(innCost(4)).toBe(8)
    expect(innCost(1)).toBe(2)
  })

  it('is free for nobody, and never negative', () => {
    expect(innCost(0)).toBe(0)
    expect(innCost(-2)).toBe(0)
  })
})

describe('summarizeStorage', () => {
  const storage = [stored('rope'), stored('relic', true), stored('potion', true)]

  it('splits open storage from the Secure Storage punch-out', () => {
    const s = summarizeStorage(storage, true)
    expect(s.open.map((i) => i.item.itemId)).toEqual(['rope'])
    expect(s.secure.map((i) => i.item.itemId)).toEqual(['relic', 'potion'])
    expect(s.total).toBe(3)
  })

  it('strands secure items once the space is filled back in (p.86)', () => {
    // Camping in the wilderness after an Inn: "any equipment stored in this area must be
    // added to an Adventurer's inventory, sold, or discarded."
    const s = summarizeStorage(storage, false)
    expect(s.stranded.map((i) => i.item.itemId)).toEqual(['relic', 'potion'])
  })

  it('strands nothing while the Inn is paid for', () => {
    expect(summarizeStorage(storage, true).stranded).toEqual([])
  })

  it('handles an empty board', () => {
    expect(summarizeStorage([], false)).toMatchObject({ open: [], secure: [], stranded: [], total: 0 })
  })
})

describe('campIssues', () => {
  it('warns about stranded Secure Storage, naming how many', () => {
    const issues = campIssues({
      storage: [stored('relic', true)],
      secureStorageUnlocked: false,
      renown: 0,
    })
    expect(issues.map((i) => i.kind)).toEqual(['secure-storage-stranded'])
    expect(issues[0].message).toContain('1 item')
  })

  it('stays quiet when secure items have a secure place to be', () => {
    const issues = campIssues({
      storage: [stored('relic', true)],
      secureStorageUnlocked: true,
      renown: 4,
    })
    expect(issues).toEqual([])
  })

  it('mentions Renown sitting at the cap, where further gains are wasted', () => {
    const issues = campIssues({ storage: [], secureStorageUnlocked: false, renown: RENOWN_MAX })
    expect(issues.map((i) => i.kind)).toEqual(['renown-at-cap'])
  })

  it('never blocks — the board belongs to the player', () => {
    const issues = campIssues({
      storage: [stored('relic', true)],
      secureStorageUnlocked: false,
      renown: RENOWN_MAX,
    })
    expect(issues.every((i) => i.severity === 'warning')).toBe(true)
    expect(issues).toHaveLength(2)
  })
})

describe('RENOWN_SPEND_WINDOWS', () => {
  it('lists the four windows p.72 gives', () => {
    expect(RENOWN_SPEND_WINDOWS).toHaveLength(4)
    const text = RENOWN_SPEND_WINDOWS.map((w) => `${w.when} ${w.effect}`).join(' ')
    expect(text).toContain('Novice')
    expect(text).toContain('Persuade')
    expect(text).toContain('Market')
    expect(text).toContain('Inn')
  })
})
