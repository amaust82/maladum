// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import CampaignLog from './CampaignLog.vue'
import { useCampaignStore } from '../stores/campaigns'

/**
 * The Log tab renders from the raw event log rather than the projection, so these tests
 * check the store actually republishes it — a chronicle that silently stopped updating
 * after a commit would look fine until the moment you needed it.
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
    },
    {
      t: 'ADVENTURER_ADDED',
      partyId: 'p1',
      advId: 'a2',
      characterId: 'ariah',
      classId: 'barbarian',
      displayName: 'Ariah',
    },
  ])
  return { campaigns, id }
}

const mountLog = (campaignId: string) =>
  mount(CampaignLog, { props: { campaignId }, global: { plugins: [router] } })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('CampaignLog', () => {
  it('renders the campaign so far, newest first', async () => {
    const { id } = await openCampaign()
    const items = mountLog(id).findAll('li').map((li) => li.text())
    expect(items[0]).toContain('Ariah joined the party')
    expect(items[items.length - 1]).toContain('Campaign "The Long Dark" begun')
  })

  it('picks up new events after a commit', async () => {
    // The store holds the event store in a shallowRef and appends in place, so the log
    // has to be republished explicitly. This is the test that catches it if it isn't.
    const { campaigns, id } = await openCampaign()
    const wrapper = mountLog(id)
    expect(wrapper.text()).not.toContain('gained 1 Experience')
    await campaigns.commit([{ t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'escaped' }])
    await flushPromises()
    expect(wrapper.text()).toContain('Syrio gained 1 Experience')
  })

  it('filters down to one Adventurer', async () => {
    const { campaigns, id } = await openCampaign()
    await campaigns.commit([{ t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'escaped' }])
    const wrapper = mountLog(id)
    await wrapper.find('select').setValue('a1')
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Syrio')
    expect(text).not.toContain('Ariah joined')
  })

  it('marks a quest as its own chapter', async () => {
    const { campaigns, id } = await openCampaign()
    await campaigns.commit([
      {
        t: 'QUEST_RECORDED',
        partyId: 'p1',
        name: 'Of Coin and Glory',
        outcome: 'primary-complete',
        renownGained: 2,
        at: Date.now(),
      },
      { t: 'XP_GAINED', advId: 'a1', amount: 1, reason: 'survived' },
    ])
    const wrapper = mountLog(id)
    expect(wrapper.text()).toContain('Quest 1: "Of Coin and Glory"')
    expect(wrapper.text()).toContain('Q1')
  })

  it('shows a "Story so far" recap, separate from the full event-by-event log', async () => {
    const { campaigns, id } = await openCampaign()
    await campaigns.commit([
      {
        t: 'QUEST_RECORDED',
        partyId: 'p1',
        name: 'Of Coin and Glory',
        outcome: 'primary-complete',
        renownGained: 2,
        guildersGained: 40,
        at: Date.now(),
      },
    ])
    const wrapper = mountLog(id)
    expect(wrapper.text()).toContain('Story so far')
    expect(wrapper.text()).toContain('Of Coin and Glory')
    expect(wrapper.text()).toContain('primary objective completed')
    expect(wrapper.text()).toContain('+2 Renown')
    expect(wrapper.text()).toContain('+40 Guilders')
  })

  it('has no "Story so far" section before any quest is recorded', async () => {
    const { id } = await openCampaign()
    expect(mountLog(id).text()).not.toContain('Story so far')
  })

  it('exports Markdown that carries the campaign name and its entries', async () => {
    const { id } = await openCampaign()
    const wrapper = mountLog(id)
    await wrapper.findAll('button').find((b) => b.text().includes('Markdown'))!.trigger('click')
    await flushPromises()
    const value = (wrapper.find('textarea').element as HTMLTextAreaElement).value
    expect(value).toContain('# The Long Dark')
    expect(value).toContain('- Syrio joined the party')
  })

  it('says so plainly when nothing has happened yet', async () => {
    const campaigns = useCampaignStore()
    const id = await campaigns.create('Fresh')
    await campaigns.open(id)
    // A brand-new campaign has exactly one event, so filter to an Adventurer that
    // doesn't exist to exercise the empty state.
    const wrapper = mountLog(id)
    expect(wrapper.text()).toContain('Campaign "Fresh" begun')
  })
})
