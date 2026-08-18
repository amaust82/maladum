import { describe, it, expect } from 'vitest'
import { partySheetMarkdown } from './partySheet'
import { buildCharacterSheet } from './characterSheet'
import type { AdventurerState, PartyState } from '../store/campaign/projection'
import type { AdventurerDef, ClassDef } from '../content/schema'

const stats = {
  health: { default: 4, max: 6 },
  skill: { default: 1, max: 4 },
  magic: { default: 1, max: 4 },
  actions: { default: 2, max: 2 },
  xp: { default: 3, max: 16 },
}

const character = (over: Partial<AdventurerDef> = {}): AdventurerDef =>
  ({
    id: 'c',
    name: 'C',
    species: 'Eld',
    stats,
    armourSlots: 2,
    boardGrants: [{ type: 'skill', name: 'Ambush', default: 1, max: 2 }],
    ...over,
  }) as AdventurerDef

const klass = (over: Partial<ClassDef> = {}): ClassDef =>
  ({
    id: 'k',
    name: 'K',
    skills: [{ name: 'Ambush', levelCap: 3 }],
    spellSchools: [],
    statBonuses: [],
    grantedSpells: [],
    grantedAbilities: [],
    pairedWith: [],
    ...over,
  }) as unknown as ClassDef

const advState = (over: Partial<AdventurerState> = {}): AdventurerState => ({
  id: 'a1',
  characterId: 'c',
  classId: 'k',
  displayName: 'Syrio',
  xpFilled: 3,
  inventory: [{ itemId: 'dagger' }],
  armour: [{ itemId: 'leather' }],
  coveredGrants: [],
  skillMarks: { Ambush: { character: 1, class: 2 } },
  spells: [],
  statIncreases: { health: 1 },
  rank: 2,
  alive: true,
  questsMissed: 0,
  ...over,
})

const party = (over: Partial<PartyState> = {}): PartyState => ({
  id: 'p1',
  name: 'The Party',
  renown: 4,
  stash: 120,
  adventurers: [advState()],
  storage: [],
  secureStorageUnlocked: false,
  notes: '',
  quests: [],
  ...over,
})

const render = (p: PartyState, states: AdventurerState[] = p.adventurers) =>
  partySheetMarkdown({
    party: p,
    sheets: states.map((s) =>
      buildCharacterSheet({ state: s, character: character(), klass: klass() }),
    ),
    itemName: (id) => ({ dagger: 'Dagger', leather: 'Leather Armour' })[id] ?? id,
  })

describe('partySheetMarkdown', () => {
  it('leads with the Base Camp board, which is entirely dry-wipe', () => {
    const md = render(party())
    expect(md).toContain('# The Party')
    expect(md).toContain('**Stash:** 120 Guilders')
    expect(md).toContain('**Renown:** 4/12')
  })

  it('prints skill marks per board, never as one total', () => {
    // The split is what the rules depend on (p.80), so a sheet that summed them would
    // be useless for rebuilding a board.
    const md = render(party())
    expect(md).toContain('Ambush — level 3 (character 1 + Class 2)')
  })

  it('shows a rank that was never recorded as such, not as 1', () => {
    const md = render(party({ adventurers: [advState({ rank: null })] }))
    expect(md).toContain('**Rank:** not recorded')
  })

  it('notes when marks were capped at the level-3 ceiling', () => {
    const md = render(
      party({ adventurers: [advState({ skillMarks: { Ambush: { character: 2, class: 3 } } })] }),
    )
    expect(md).toContain('capped from 5')
  })

  it('flags a skill covered by armour, since the level differs from the marks', () => {
    const md = render(party({ adventurers: [advState({ coveredGrants: ['Ambush'] })] }))
    expect(md).toContain('covered by armour')
  })

  it('resolves item names and separates carried from worn', () => {
    const md = render(party())
    expect(md).toContain('**Inventory:** Dagger')
    expect(md).toContain('**Armour slots:** Leather Armour (of 2)')
  })

  it('marks stranded Secure Storage, which is easy to lose track of (p.86)', () => {
    const md = render(
      party({
        storage: [{ item: { itemId: 'dagger' }, secure: true }],
        secureStorageUnlocked: false,
      }),
    )
    expect(md).toContain('Dagger (secure, **stranded**)')
  })

  it('includes campaign notes, which exist nowhere else once a board is wiped', () => {
    const md = render(party({ notes: 'Beren misses the next quest' }))
    expect(md).toContain('### Campaign notes')
    expect(md).toContain('Beren misses the next quest')
  })

  it('lists the quests played', () => {
    const md = render(
      party({
        quests: [
          { name: 'Of Coin and Glory', outcome: 'primary-complete', renownGained: 2, guildersGained: 40, at: 1 },
        ],
      }),
    )
    expect(md).toContain('1. Of Coin and Glory — primary complete (2 Renown, 40 Guilders)')
  })

  it('says statistics are untranscribed rather than printing zeroes', () => {
    const md = partySheetMarkdown({
      party: party(),
      sheets: [
        buildCharacterSheet({
          state: advState(),
          character: character({ stats: null }),
          klass: klass(),
        }),
      ],
    })
    expect(md).toContain('**Statistics:** not transcribed for this board')
  })

  it('handles an empty party without producing a broken document', () => {
    const md = partySheetMarkdown({ party: party({ adventurers: [] }), sheets: [] })
    expect(md).toContain('# The Party')
    expect(md).toContain('**Storage:** empty')
    expect(md.endsWith('\n')).toBe(true)
  })
})
