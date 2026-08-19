// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import BaseCamp from './BaseCamp.vue'
import { useCampaignStore } from '../stores/campaigns'

/**
 * Like the character sheet, every test here is a round-trip: the point of the Camp tab
 * is that a wiped Base Camp board can be restored from it, so a rendered value that
 * didn't reach persisted state would be worthless.
 */

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

async function openCampaignWithParty() {
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

const mountCamp = (campaignId: string) =>
  mount(BaseCamp, { props: { campaignId }, global: { plugins: [router] } })

const party = (campaigns: ReturnType<typeof useCampaignStore>) => campaigns.parties[0]

async function settleUntil(done: () => boolean, what: string) {
  for (let i = 0; i < 100; i += 1) {
    await flushPromises()
    if (done()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error(`Timed out waiting for: ${what}`)
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('BaseCamp', () => {
  it('says so plainly when there is no party yet', async () => {
    const campaigns = useCampaignStore()
    const id = await campaigns.create('Empty')
    await campaigns.open(id)
    expect(mountCamp(id).text()).toContain('No parties yet')
  })

  it('shows the board for each party', async () => {
    const { id } = await openCampaignWithParty()
    const text = mountCamp(id).text()
    expect(text).toContain('The Party')
    expect(text).toContain('Renown 0/12')
  })

  it('records the Stash directly, for restoring a wiped board', async () => {
    const { campaigns, id } = await openCampaignWithParty()
    const wrapper = mountCamp(id)
    const stash = wrapper.find('input[type="number"]')
    await stash.setValue('275')
    await stash.trigger('change')
    await settleUntil(() => party(campaigns).stash === 275, 'stash')
    expect(party(campaigns).stash).toBe(275)
  })

  it('sets Renown by clicking the track, clamped to the printed 0–12', async () => {
    const { campaigns, id } = await openCampaignWithParty()
    const wrapper = mountCamp(id)
    const pip = wrapper.findAll('button').find((b) => b.text() === '7')!
    await pip.trigger('click')
    await settleUntil(() => party(campaigns).renown === 7, 'renown')
    expect(party(campaigns).renown).toBe(7)
  })

  it('prices a night at the Inn from the party size (p.86)', async () => {
    const { id } = await openCampaignWithParty()
    // Two Adventurers at 2 Guilders each.
    expect(mountCamp(id).text()).toContain('4 Guilders')
  })

  it('stores an item and takes it out again', async () => {
    const { campaigns, id } = await openCampaignWithParty()
    const wrapper = mountCamp(id)
    await wrapper.find('select').setValue('dagger')
    await wrapper.findAll('button').find((b) => b.text() === 'Store')!.trigger('click')
    await settleUntil(() => party(campaigns).storage.length === 1, 'stored item')
    expect(party(campaigns).storage[0]).toEqual({ item: { itemId: 'dagger' }, secure: false })

    await wrapper.findAll('button').find((b) => b.text() === 'Remove')!.trigger('click')
    await settleUntil(() => party(campaigns).storage.length === 0, 'item removed')
  })

  it('assigns a stored item to a party member — the party owns gear between missions', async () => {
    const { campaigns, id } = await openCampaignWithParty()
    const wrapper = mountCamp(id)
    await wrapper.find('select').setValue('dagger')
    await wrapper.findAll('button').find((b) => b.text() === 'Store')!.trigger('click')
    await settleUntil(() => party(campaigns).storage.length === 1, 'stored item')

    const assignSelect = wrapper
      .findAll('select')
      .find((s) => s.findAll('option').some((o) => o.text() === 'assign to…'))!
    await assignSelect.setValue('a2')
    await wrapper.findAll('button').find((b) => b.text() === 'Assign')!.trigger('click')

    await settleUntil(() => party(campaigns).storage.length === 0, 'unstored')
    const ariah = party(campaigns).adventurers.find((a) => a.id === 'a2')!
    expect(ariah.inventory).toEqual([{ itemId: 'dagger', instanceId: undefined }])
  })

  it('refuses Secure Storage until the Inn is paid for', async () => {
    const { id } = await openCampaignWithParty()
    const wrapper = mountCamp(id)
    await wrapper.find('select').setValue('dagger')
    const secureButton = wrapper.findAll('button').find((b) => b.text() === 'Store securely')!
    expect(secureButton.attributes('disabled')).toBeDefined()
  })

  it('opens Secure Storage when the Inn box is ticked', async () => {
    const { campaigns, id } = await openCampaignWithParty()
    const wrapper = mountCamp(id)
    const box = wrapper.find('input[type="checkbox"]')
    await box.setValue(true)
    await settleUntil(() => party(campaigns).secureStorageUnlocked, 'secure storage')
    await wrapper.find('select').setValue('dagger')
    const secureButton = wrapper.findAll('button').find((b) => b.text() === 'Store securely')!
    expect(secureButton.attributes('disabled')).toBeUndefined()
    await secureButton.trigger('click')
    await settleUntil(() => party(campaigns).storage.length === 1, 'securely stored item')
    expect(party(campaigns).storage[0].secure).toBe(true)
  })

  it('warns that secure items are stranded once the Inn is given up (p.86)', async () => {
    const { campaigns, id } = await openCampaignWithParty()
    await campaigns.commit([
      { t: 'SECURE_STORAGE_SET', partyId: 'p1', unlocked: true },
      { t: 'ITEM_STORED', partyId: 'p1', item: { itemId: 'dagger' }, secure: true },
      { t: 'SECURE_STORAGE_SET', partyId: 'p1', unlocked: false },
    ])
    const text = mountCamp(id).text()
    expect(text).toContain('stranded')
    expect(text).toContain('must go to an inventory')
  })

  it('keeps campaign notes, which are pure dry-wipe loss otherwise', async () => {
    const { campaigns, id } = await openCampaignWithParty()
    const wrapper = mountCamp(id)
    const notes = wrapper.find('textarea')
    await notes.setValue('Beren misses the next quest')
    await notes.trigger('blur')
    await settleUntil(() => party(campaigns).notes !== '', 'notes')
    expect(party(campaigns).notes).toBe('Beren misses the next quest')
  })

  it('names the four windows Renown can be spent in', async () => {
    const { id } = await openCampaignWithParty()
    const text = mountCamp(id).text()
    expect(text).toContain('Persuade')
    expect(text).toContain('Market Phase')
  })
})
