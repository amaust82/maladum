// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import PartyScreen from './PartyScreen.vue'
import { useCampaignStore } from '../stores/campaigns'

/**
 * The roster itself is thin, so these focus on the party-sheet export — the restore path
 * when the app is the only surviving copy of a wiped board. What matters is that it
 * carries the marks you'd otherwise have to re-derive by hand.
 */

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

async function openCampaign() {
  const campaigns = useCampaignStore()
  const id = await campaigns.create('The Long Dark')
  await campaigns.open(id)
  await campaigns.commit([
    { t: 'PARTY_ADDED', partyId: 'p1', name: 'The Party' },
    {
      t: 'ADVENTURER_ADDED',
      partyId: 'p1',
      advId: 'a1',
      characterId: 'syrio',
      classId: 'assassin',
      displayName: 'Syrio',
      // Syrio's real xpRows are [5, 4, 4, 3] (transcribed 2026-08-19); 6 XP fills row 1
      // and starts row 2, which derives to rank 2 — RANK_SET no longer has any effect
      // once a board's Experience rows are known, so this replaces it.
      startingXp: 6,
    },
    { t: 'SKILL_MARKS_SET', advId: 'a1', skill: 'Reflexes', source: 'class', marks: 2 },
    { t: 'STASH_SET', partyId: 'p1', amount: 120 },
  ])
  return { campaigns, id }
}

const mountParty = (campaignId: string) =>
  mount(PartyScreen, { props: { campaignId }, global: { plugins: [router] } })

const sheetButton = (w: ReturnType<typeof mountParty>) =>
  w.findAll('button').find((b) => b.text() === 'Party sheet')!

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('PartyScreen', () => {
  it('lists the roster with each name linking to its sheet', async () => {
    const { id } = await openCampaign()
    const wrapper = mountParty(id)
    expect(wrapper.text()).toContain('Syrio')
    const link = wrapper.findAll('a').find((a) => a.text() === 'Syrio')!
    expect(link.attributes('href')).toContain('/adventurer/a1')
  })

  it('hides the party sheet until asked for', async () => {
    const { id } = await openCampaign()
    expect(mountParty(id).find('textarea').exists()).toBe(false)
  })

  it('exports every board as it stands, with marks split per board', async () => {
    const { id } = await openCampaign()
    const wrapper = mountParty(id)
    await sheetButton(wrapper).trigger('click')
    await flushPromises()
    const value = (wrapper.find('textarea').element as HTMLTextAreaElement).value
    expect(value).toContain('# The Party')
    expect(value).toContain('**Stash:** 120 Guilders')
    expect(value).toContain('## Syrio')
    expect(value).toContain('**Rank:** 2')
    // The per-board split is the part you can't re-derive from a total.
    expect(value).toContain('Reflexes')
    expect(value).toContain('Class 2')
  })

  it('resolves item names rather than printing raw ids', async () => {
    const { campaigns, id } = await openCampaign()
    await campaigns.commit([
      { t: 'ITEM_ACQUIRED', advId: 'a1', item: { itemId: 'dagger' }, via: 'bought' },
    ])
    const wrapper = mountParty(id)
    await sheetButton(wrapper).trigger('click')
    await flushPromises()
    const value = (wrapper.find('textarea').element as HTMLTextAreaElement).value
    expect(value).toContain('**Inventory:** Dagger')
  })

  it('offers no sheet button when there is no party to export', async () => {
    const campaigns = useCampaignStore()
    const id = await campaigns.create('Empty')
    await campaigns.open(id)
    const wrapper = mountParty(id)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Party sheet')).toBe(false)
  })
})
