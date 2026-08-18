// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import PartyBuilder from './PartyBuilder.vue'
import { useContentStore } from '../stores/content'

/**
 * The readiness model only earns its keep if it reaches the screen, so this
 * mounts the real builder against the real bundled seed content — 20 Adventurer
 * and 25 Class boards whose names and Guilder costs are transcribed but whose
 * stat blocks and skill wheels mostly aren't.
 */

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

const mountBuilder = () =>
  mount(PartyBuilder, {
    props: { campaignId: 'c1' },
    global: { plugins: [router] },
  })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('PartyBuilder against the seed content', () => {
  it('offers every transcribed board — nothing in core v2 is a hidden stand-in', () => {
    const wrapper = mountBuilder()
    const options = wrapper.findAll('option').map((o) => o.text())
    expect(options).toContain('Syrio')
    expect(options).toContain('Assassin')
    expect(useContentStore().hiddenCount).toBe(0)
    // With nothing hidden, the opt-in toggle isn't shown at all.
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('badges a partially-transcribed board instead of presenting it as complete', async () => {
    // Most Adventurer boards are transcribed now, so this picks one that isn't.
    const wrapper = mountBuilder()
    await wrapper.findAll('select')[0].setValue('moranna')
    expect(wrapper.text()).toContain('Unverified')
    expect(wrapper.text()).toContain('armourSlots')
  })

  it('does not badge a fully transcribed Adventurer board as unverified', async () => {
    const wrapper = mountBuilder()
    await wrapper.findAll('select')[0].setValue('ariah')
    await wrapper.findAll('select')[1].setValue('barbarian')
    // Both boards are complete, so no gap list should reach the card at all.
    expect(wrapper.text()).not.toContain('Unverified')
  })

  it('names the gap on the card for the one Class board still untranscribed', async () => {
    // Most Class boards are transcribed now, so this picks the one that isn't —
    // the badge has to keep telling the truth about Mentor while its neighbours
    // are complete.
    const wrapper = mountBuilder()
    await wrapper.findAll('select')[1].setValue('mentor')
    expect(wrapper.text()).toContain('skills')
  })

  it('does not badge a fully transcribed Class board as unverified', async () => {
    const wrapper = mountBuilder()
    await wrapper.findAll('select')[1].setValue('barbarian')
    // Ariah (the default Adventurer) is still partial, so "Unverified" appears for
    // her — what must not appear is a gap list naming the Class board's fields.
    expect(wrapper.text()).not.toContain('spellSchools')
  })

  it('totals a real Guilder cost exactly once both boards are chosen', async () => {
    const wrapper = mountBuilder()
    const [character, klass] = wrapper.findAll('select')
    await character.setValue('syrio')
    await klass.setValue('barbarian')
    // Syrio 64 + Barbarian 7, both off the calculator spreadsheet — an exact
    // figure, so it must NOT be hedged as a lower bound.
    expect(wrapper.text()).toContain('71 Guilders')
    expect(wrapper.text()).not.toContain('at least')
  })

  it('blocks saving until a Class board is chosen', async () => {
    const wrapper = mountBuilder()
    const save = wrapper.findAll('button').find((b) => b.text() === 'Create party')!
    expect(save.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Choose a Class board')
  })

  it('enables saving once the draft is legal', async () => {
    const wrapper = mountBuilder()
    await wrapper.findAll('select')[1].setValue('barbarian')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Create party')!
    expect(save.attributes('disabled')).toBeUndefined()
  })
})
