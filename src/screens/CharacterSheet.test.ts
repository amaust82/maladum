// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import CharacterSheet from './CharacterSheet.vue'
import { useCampaignStore } from '../stores/campaigns'

/**
 * The sheet's whole reason to exist is surviving a wiped board, so these tests are
 * round-trips: make an edit, and assert it reached the campaign state that gets
 * persisted — not merely that a DOM node changed.
 */

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

async function openCampaignWithAdventurer() {
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
      startingXp: 3,
    },
  ])
  return { campaigns, id }
}

const mountSheet = (campaignId: string) =>
  mount(CharacterSheet, {
    props: { campaignId, advId: 'a1' },
    global: { plugins: [router] },
  })

const adventurer = (campaigns: ReturnType<typeof useCampaignStore>) =>
  campaigns.parties[0].adventurers[0]

/**
 * Let a fire-and-forget commit finish. The sheet's handlers don't await — they're DOM
 * events — and the write goes through IndexedDB, which settles on a macrotask, so
 * `flushPromises` alone returns too early.
 */
async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('CharacterSheet', () => {
  it('shows the boards it was built from', async () => {
    const { campaigns, id } = await openCampaignWithAdventurer()
    expect(campaigns.parties).toHaveLength(1)
    const text = mountSheet(id).text()
    expect(text).toContain('Syrio')
    expect(text).toContain('Assassin')
  })

  it('renders the Class wheel with the board’s own per-slot caps', async () => {
    const { id } = await openCampaignWithAdventurer()
    const text = mountSheet(id).text()
    // The Assassin board carries these, and prints Malacyte Mastery at cap 1.
    expect(text).toContain('Reflexes')
    expect(text).toContain('Malacyte Mastery')
  })

  it('records a Class-board skill mark so it survives a wiped board', async () => {
    const { campaigns, id } = await openCampaignWithAdventurer()
    const wrapper = mountSheet(id)
    const row = wrapper.findAll('tbody tr').find((r) => r.text().includes('Acrobatics'))!
    // Acrobatics is on the Assassin wheel but not on Syrio's character board, so the
    // row renders a single input — the Class one. A dash stands where the other would be.
    const inputs = row.findAll('input')
    expect(inputs).toHaveLength(1)
    const classInput = inputs[0]
    await classInput.setValue('2')
    await classInput.trigger('change')
    await settle()
    expect(adventurer(campaigns).skillMarks.Acrobatics).toEqual({ character: 0, class: 2 })
  })

  it('keeps character-board and Class-board marks apart, never summed', async () => {
    const { campaigns, id } = await openCampaignWithAdventurer()
    const wrapper = mountSheet(id)
    // Syrio's character board grants Reflexes, and the Assassin wheel carries it too —
    // the only skill here with an input on both sides.
    const row = wrapper.findAll('tbody tr').find((r) => r.text().includes('Reflexes'))!
    expect(row.findAll('input')).toHaveLength(2)
    const [charInput, classInput] = row.findAll('input')
    await charInput.setValue('1')
    await charInput.trigger('change')
    await settle()
    await classInput.setValue('2')
    await classInput.trigger('change')
    await settle()
    expect(adventurer(campaigns).skillMarks.Reflexes).toEqual({ character: 1, class: 2 })
  })

  it('records a learned spell but not a board-granted one', async () => {
    const { campaigns, id } = await openCampaignWithAdventurer()
    const wrapper = mountSheet(id)
    const select = wrapper.find('select')
    await select.setValue('Healing')
    await settle()
    expect(adventurer(campaigns).spells).toEqual(['Healing'])
    // Board grants stay out of stored state — they're derived from the packs.
    expect(adventurer(campaigns).spells).not.toContain('Scramble')
  })

  it('removes a learned spell again', async () => {
    const { campaigns, id } = await openCampaignWithAdventurer()
    const wrapper = mountSheet(id)
    await wrapper.find('select').setValue('Healing')
    await settle()
    const remove = wrapper.findAll('button').find((b) => b.text() === 'Remove')!
    await remove.trigger('click')
    await settle()
    expect(adventurer(campaigns).spells).toEqual([])
  })

  it('records a permanent stat increase from levelling', async () => {
    const { campaigns, id } = await openCampaignWithAdventurer()
    const wrapper = mountSheet(id)
    const healthInput = wrapper
      .findAll('li')
      .find((li) => li.text().startsWith('health'))!
      .find('input')
    await healthInput.setValue('2')
    await healthInput.trigger('change')
    await settle()
    expect(adventurer(campaigns).statIncreases.health).toBe(2)
  })

  it('lets rank be typed in, because this board has no transcribed Experience rows', async () => {
    const { campaigns, id } = await openCampaignWithAdventurer()
    const wrapper = mountSheet(id)
    expect(wrapper.text()).toContain("row layout isn't transcribed")
    const rankInput = wrapper.findAll('input[type="number"]')[1]
    expect(rankInput.attributes('disabled')).toBeUndefined()
    await rankInput.setValue('3')
    await rankInput.trigger('change')
    await settle()
    expect(adventurer(campaigns).rank).toBe(3)
  })

  it('warns when marks and Experience disagree — the half-entered restore case', async () => {
    const { id } = await openCampaignWithAdventurer()
    const wrapper = mountSheet(id)
    // startingXp is 3 with no marks recorded yet, so the invariant is already unmet.
    expect(wrapper.text()).toContain('each Experience buys one mark')
  })

  it('says so plainly for an id that is not in the campaign', async () => {
    const { id } = await openCampaignWithAdventurer()
    const wrapper = mount(CharacterSheet, {
      props: { campaignId: id, advId: 'nobody' },
      global: { plugins: [router] },
    })
    expect(wrapper.text()).toContain('No Adventurer with that id')
  })
})
