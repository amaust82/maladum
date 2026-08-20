// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import CampaignPhase from './CampaignPhase.vue'
import { useCampaignStore } from '../stores/campaigns'

/**
 * Round-trip tests again: the wizard's value is that a session's outcome ends up
 * persisted before the boards are wiped, so a rendered figure that never reached the
 * campaign state would be worthless.
 */

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

async function openCampaign() {
  const campaigns = useCampaignStore()
  const id = await campaigns.create('Test campaign')
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
      // Syrio's real xpRows are [5, 4, 4, 3] (transcribed 2026-08-19); 6 XP fills
      // row 1 and starts row 2, which derives to rank 2. RANK_SET no longer has any
      // effect once a board's Experience rows are known, so this replaces it.
      startingXp: 6,
    },
    { t: 'STASH_SET', partyId: 'p1', amount: 100 },
  ])
  return { campaigns, id }
}

const mountWizard = (campaignId: string) =>
  mount(CampaignPhase, { props: { campaignId }, global: { plugins: [router] } })

const party = (campaigns: ReturnType<typeof useCampaignStore>) => campaigns.parties[0]

async function settleUntil(done: () => boolean, what: string) {
  for (let i = 0; i < 100; i += 1) {
    await flushPromises()
    if (done()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error(`Timed out waiting for: ${what}`)
}

const button = (w: ReturnType<typeof mountWizard>, text: string) =>
  w.findAll('button').find((b) => b.text().includes(text))!

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('CampaignPhase wizard', () => {
  it('runs the four phases in the rulebook order', async () => {
    const { id } = await openCampaign()
    const text = mountWizard(id).text()
    expect(text).toContain('Escape')
    expect(text).toContain('Advancement')
    expect(text).toContain('Market')
    expect(text).toContain('Rest')
  })

  it('records the quest, adding its Renown and Guilders to the party', async () => {
    const { campaigns, id } = await openCampaign()
    const wrapper = mountWizard(id)
    const [name] = wrapper.findAll('input[type="text"], input:not([type])')
    await name.setValue('Of Coin and Glory')
    const numbers = wrapper.findAll('input[type="number"]')
    await numbers[0].setValue('3') // Renown
    await numbers[1].setValue('40') // Guilders
    await button(wrapper, 'Record this quest').trigger('click')
    await settleUntil(() => party(campaigns).quests.length === 1, 'quest recorded')

    expect(party(campaigns).quests[0]).toMatchObject({
      name: 'Of Coin and Glory',
      outcome: 'primary-complete',
      renownGained: 3,
      guildersGained: 40,
    })
    expect(party(campaigns).renown).toBe(3)
    expect(party(campaigns).stash).toBe(140)
  })

  it('skips the Escape phase when everyone got out (p.78)', async () => {
    const { id } = await openCampaign()
    expect(mountWizard(id).text()).toContain('Everyone made it out')
  })

  it('resolves a Left for Dead roll the player reports, and applies the consequence', async () => {
    const { campaigns, id } = await openCampaign()
    const wrapper = mountWizard(id)
    // Mark Syrio as left behind.
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[1].setValue(true) // "left behind"
    await flushPromises()

    // A reported roll of 2 is "miss the next two quests" (p.79).
    const numberInputs = wrapper.findAll('input[type="number"]')
    const rollInput = numberInputs[numberInputs.length - 1]
    await rollInput.setValue('2')
    await flushPromises()
    expect(wrapper.text()).toContain('miss next two quests')

    await button(wrapper, 'Apply').trigger('click')
    await settleUntil(() => party(campaigns).adventurers[0].questsMissed === 2, 'absence')
    expect(party(campaigns).adventurers[0].alive).toBe(true)
  })

  it('kills an Adventurer outright on a reported roll of 1', async () => {
    const { campaigns, id } = await openCampaign()
    const wrapper = mountWizard(id)
    await wrapper.findAll('input[type="checkbox"]')[1].setValue(true)
    await flushPromises()
    const rolls = wrapper.findAll('input[type="number"]')
    await rolls[rolls.length - 1].setValue('1')
    await flushPromises()
    await button(wrapper, 'Apply').trigger('click')
    await settleUntil(() => !party(campaigns).adventurers[0].alive, 'death')
    expect(party(campaigns).adventurers[0].alive).toBe(false)
  })

  it('awards Experience only where the outcome earns it (p.80)', async () => {
    const { campaigns, id } = await openCampaign()
    const wrapper = mountWizard(id)
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true) // took part
    await flushPromises()
    await button(wrapper, 'Advancement').trigger('click')
    await flushPromises()

    const before = party(campaigns).adventurers[0].xpFilled
    await button(wrapper, '+1 Experience').trigger('click')
    await settleUntil(() => party(campaigns).adventurers[0].xpFilled === before + 1, 'xp')
  })

  it('explains why an Adventurer who sat it out earns nothing', async () => {
    const { id } = await openCampaign()
    const wrapper = mountWizard(id)
    await button(wrapper, 'Advancement').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain("Didn't take part")
  })

  it('totals upkeep and pays it out of the Stash (p.83)', async () => {
    const { campaigns, id } = await openCampaign()
    const wrapper = mountWizard(id)
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true) // took part
    await flushPromises()
    await button(wrapper, 'Market').trigger('click')
    await flushPromises()
    // Rank 2, took part → 3 Guilders.
    expect(wrapper.text()).toContain('Upkeep due:')
    await button(wrapper, 'Pay 3 Guilders').trigger('click')
    await settleUntil(() => party(campaigns).stash === 97, 'upkeep paid')
  })

  it('charges the Inn and opens Secure Storage (p.86)', async () => {
    const { campaigns, id } = await openCampaign()
    const wrapper = mountWizard(id)
    await button(wrapper, 'Rest').trigger('click')
    await flushPromises()
    await button(wrapper, 'Choose inn').trigger('click')
    await settleUntil(() => party(campaigns).secureStorageUnlocked, 'inn chosen')
    // One living Adventurer at 2 Guilders.
    expect(party(campaigns).stash).toBe(98)
  })

  it('closes Secure Storage for a free night in the wilderness', async () => {
    const { campaigns, id } = await openCampaign()
    await campaigns.commit([{ t: 'SECURE_STORAGE_SET', partyId: 'p1', unlocked: true }])
    const wrapper = mountWizard(id)
    await button(wrapper, 'Rest').trigger('click')
    await flushPromises()
    await button(wrapper, 'Choose wilderness').trigger('click')
    await settleUntil(() => !party(campaigns).secureStorageUnlocked, 'wilderness chosen')
    expect(party(campaigns).stash).toBe(100)
  })

  it('says so plainly when there is no party to work with', async () => {
    const campaigns = useCampaignStore()
    const id = await campaigns.create('Empty')
    await campaigns.open(id)
    expect(mountWizard(id).text()).toContain('No parties yet')
  })
})
