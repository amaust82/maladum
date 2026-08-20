import { describe, it, expect } from 'vitest'
import { buildChronicle, chronicleToMarkdown, filterByAdventurer, storySoFar } from './chronicle'
import type { CampaignEvent } from '../store/campaign/events'
import type { PartyState } from '../store/campaign/projection'

const created: CampaignEvent = {
  t: 'CAMPAIGN_CREATED',
  id: 'c1',
  name: 'The Long Dark',
  contentPacks: [],
  createdAt: 1000,
}
const partyAdded: CampaignEvent = { t: 'PARTY_ADDED', partyId: 'p1', name: 'The Party' }
const syrio: CampaignEvent = {
  t: 'ADVENTURER_ADDED',
  partyId: 'p1',
  advId: 'a1',
  characterId: 'syrio',
  classId: 'assassin',
  displayName: 'Syrio',
}

const text = (events: CampaignEvent[]) => buildChronicle(events).map((e) => e.text)

describe('buildChronicle', () => {
  it('reads as a timeline, oldest first', () => {
    expect(text([created, partyAdded, syrio])).toEqual([
      'Campaign "The Long Dark" begun',
      'Party "The Party" formed',
      'Syrio joined the party',
    ])
  })

  it('learns names from the log itself, not the content packs', () => {
    // A campaign whose packs are missing or have moved on still reads properly.
    const events: CampaignEvent[] = [syrio, { t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'escaped' }]
    expect(text(events)[1]).toBe('Syrio gained 1 Experience (escaped)')
  })

  it('falls back to the id for an Adventurer it never saw join', () => {
    expect(text([{ t: 'RANK_SET', advId: 'ghost', rank: 2 }])).toEqual(['ghost is rank 2'])
  })

  it('resolves item names through the supplied resolver, and falls back to the id', () => {
    const events: CampaignEvent[] = [
      syrio,
      { t: 'ITEM_ACQUIRED', advId: 'a1', item: { itemId: 'dagger' }, via: 'bought' },
    ]
    const named = buildChronicle(events, { itemName: () => 'Dagger' })
    expect(named[1].text).toContain('Dagger')
    expect(buildChronicle(events)[1].text).toContain('dagger')
  })

  it('numbers quests as chapters and files later entries under them', () => {
    const events: CampaignEvent[] = [
      syrio,
      { t: 'QUEST_RECORDED', partyId: 'p1', name: 'Of Coin and Glory', outcome: 'primary-complete', renownGained: 2, guildersGained: 40, at: 5 },
      { t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'survived' },
    ]
    const entries = buildChronicle(events)
    expect(entries[0].chapter).toBe(0)
    expect(entries[1].text).toContain('Quest 1: "Of Coin and Glory" — primary objective completed')
    expect(entries[1].text).toContain('2 Renown, 40 Guilders')
    expect(entries[2].chapter).toBe(1)
  })

  it('tells the story of an Adventurer left behind', () => {
    const events: CampaignEvent[] = [
      syrio,
      {
        t: 'ESCAPE_RESOLVED',
        advId: 'a1',
        roll: 3,
        counters: ['wounded'],
        consequence: 'equipment-lost',
        questsMissed: 0,
        equipmentLost: true,
      },
    ]
    expect(text(events)[1]).toBe(
      'Syrio was left behind — rolled 3, equipment lost (all equipment lost)',
    )
  })

  it('pluralises counts rather than writing "1 quests"', () => {
    const one = text([syrio, { t: 'ABSENCE_SET', advId: 'a1', quests: 1 }])[1]
    const two = text([syrio, { t: 'ABSENCE_SET', advId: 'a1', quests: 2 }])[1]
    expect(one).toContain('1 quest')
    expect(one).not.toContain('1 quests')
    expect(two).toContain('2 quests')
  })

  it('signs Stash and Renown deltas so a loss reads as a loss', () => {
    const events: CampaignEvent[] = [
      { t: 'STASH_CHANGED', partyId: 'p1', amount: -8, reason: 'Party upkeep' },
      { t: 'RENOWN_CHANGED', partyId: 'p1', amount: 3, source: 'objective' },
    ]
    expect(text(events)).toEqual([
      'Stash -8 Guilders (Party upkeep)',
      'Renown +3 (objective)',
    ])
  })

  it('shows an event type it has no sentence for, rather than dropping it', () => {
    // A log that silently omits events would defeat the point of keeping one.
    const odd = { t: 'SOMETHING_NEW', advId: 'a1' } as unknown as CampaignEvent
    const entries = buildChronicle([odd])
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('SOMETHING_NEW')
  })

  it('carries timestamps only where the event actually has one', () => {
    const entries = buildChronicle([created, partyAdded])
    expect(entries[0].at).toBe(1000)
    expect(entries[1].at).toBeUndefined()
  })

  it('covers every event type in the union with a real sentence', () => {
    // Guards the default branch: if a new event type is added without a sentence, the
    // chronicle would render its raw discriminator, which this catches.
    const samples: CampaignEvent[] = [
      created,
      { t: 'CAMPAIGN_RENAMED', name: 'X' },
      { t: 'CONTENT_PACKS_CHANGED', contentPacks: [], at: 1 },
      partyAdded,
      syrio,
      { t: 'ADVENTURER_REMOVED', partyId: 'p1', advId: 'a1' },
      { t: 'RENOWN_CHANGED', partyId: 'p1', amount: 1, source: 's' },
      { t: 'RENOWN_SET', partyId: 'p1', amount: 1 },
      { t: 'STASH_CHANGED', partyId: 'p1', amount: 1 },
      { t: 'STASH_SET', partyId: 'p1', amount: 1 },
      { t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'survived' },
      { t: 'XP_SET', advId: 'a1', filled: 3 },
      { t: 'ITEM_ACQUIRED', advId: 'a1', item: { itemId: 'i' }, via: 'found' },
      { t: 'ITEM_REMOVED', advId: 'a1', item: { itemId: 'i' } },
      { t: 'ARMOUR_EQUIPPED', advId: 'a1', item: { itemId: 'i' } },
      { t: 'ARMOUR_REMOVED', advId: 'a1', item: { itemId: 'i' } },
      { t: 'GRANT_COVERED_SET', advId: 'a1', grant: 'g', covered: true },
      { t: 'SKILL_MARKS_SET', advId: 'a1', skill: 's', source: 'class', marks: 1 },
      { t: 'SPELL_LEARNED', advId: 'a1', spell: 's' },
      { t: 'SPELL_UNLEARNED', advId: 'a1', spell: 's' },
      { t: 'STAT_INCREASE_SET', advId: 'a1', stat: 'health', increase: 1 },
      { t: 'RANK_SET', advId: 'a1', rank: 1 },
      { t: 'ITEM_STORED', partyId: 'p1', item: { itemId: 'i' }, secure: false },
      { t: 'ITEM_UNSTORED', partyId: 'p1', item: { itemId: 'i' } },
      { t: 'SECURE_STORAGE_SET', partyId: 'p1', unlocked: true },
      { t: 'CAMP_NOTES_SET', partyId: 'p1', notes: 'n' },
      { t: 'QUEST_RECORDED', partyId: 'p1', name: 'q', outcome: 'failed', at: 1 },
      {
        t: 'ESCAPE_RESOLVED',
        advId: 'a1',
        roll: 1,
        counters: [],
        consequence: 'permanent-death',
        questsMissed: 0,
        equipmentLost: true,
      },
      { t: 'ABSENCE_SET', advId: 'a1', quests: 1 },
      { t: 'ALIVE_SET', advId: 'a1', alive: false },
    ]
    for (const entry of buildChronicle(samples)) {
      expect(entry.text, `no sentence for ${entry.kind}`).not.toBe(entry.kind)
    }
  })
})

describe('filterByAdventurer', () => {
  it('shows everything one Adventurer has ever done', () => {
    const events: CampaignEvent[] = [
      syrio,
      { t: 'ADVENTURER_ADDED', partyId: 'p1', advId: 'a2', characterId: 'ariah', classId: 'barbarian', displayName: 'Ariah' },
      { t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'escaped' },
      { t: 'XP_GAINED', advId: 'a2', amount: 1, reason: 'escaped' },
    ]
    const mine = filterByAdventurer(buildChronicle(events), 'a1')
    expect(mine.map((e) => e.text)).toEqual([
      'Syrio joined the party',
      'Syrio gained 1 Experience (escaped)',
    ])
  })
})

describe('chronicleToMarkdown', () => {
  it('groups entries under quest headings', () => {
    const events: CampaignEvent[] = [
      syrio,
      { t: 'QUEST_RECORDED', partyId: 'p1', name: 'Of Coin and Glory', outcome: 'failed', at: 1 },
      { t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'escaped' },
    ]
    const md = chronicleToMarkdown('The Long Dark', buildChronicle(events))
    expect(md).toContain('# The Long Dark')
    expect(md).toContain('## Before the first quest')
    expect(md).toContain('## Quest 1')
    expect(md).toContain('- Syrio gained 1 Experience (escaped)')
    expect(md.endsWith('\n')).toBe(true)
  })

  it('handles a campaign with no events yet', () => {
    expect(chronicleToMarkdown('Empty', [])).toBe('# Empty\n')
  })
})

describe('storySoFar', () => {
  const party = (over: Partial<PartyState> = {}): PartyState => ({
    id: 'p1',
    name: 'The Party',
    renown: 0,
    stash: 0,
    adventurers: [],
    storage: [],
    secureStorageUnlocked: false,
    notes: '',
    quests: [],
    ...over,
  })

  it('is empty before the first quest', () => {
    expect(storySoFar(party())).toEqual([])
  })

  it('numbers quests in play order and labels their outcome the same way the full log does', () => {
    const p = party({
      quests: [
        { name: 'Of Coin and Glory', outcome: 'primary-complete', renownGained: 5, guildersGained: 40, at: 1 },
        { name: 'The Hollow Cairn', outcome: 'partial', renownGained: 2, guildersGained: 15, at: 2 },
        { name: 'A Grim Reckoning', outcome: 'failed', renownGained: 0, guildersGained: 0, at: 3 },
      ],
    })
    expect(storySoFar(p)).toEqual([
      {
        chapter: 1,
        name: 'Of Coin and Glory',
        outcome: 'primary-complete',
        outcomeLabel: 'primary objective completed',
        at: 1,
        renownGained: 5,
        guildersGained: 40,
      },
      {
        chapter: 2,
        name: 'The Hollow Cairn',
        outcome: 'partial',
        outcomeLabel: 'partly completed',
        at: 2,
        renownGained: 2,
        guildersGained: 15,
      },
      {
        chapter: 3,
        name: 'A Grim Reckoning',
        outcome: 'failed',
        outcomeLabel: 'failed',
        at: 3,
        renownGained: 0,
        guildersGained: 0,
      },
    ])
  })
})
