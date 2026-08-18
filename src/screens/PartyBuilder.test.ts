// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import PartyBuilder from './PartyBuilder.vue'
import { useContentStore } from '../stores/content'

/**
 * The readiness model only earns its keep if it reaches the screen, so this mounts the
 * real builder against the real bundled content — all 20 Adventurer and 25 Class boards,
 * fully transcribed as of 2026-08-19.
 *
 * That means these tests can no longer prove the screen *reports* a gap, because there
 * are none left in the seed data. That path is covered against synthetic boards in
 * `content/readiness.test.ts`; what's asserted here is the other half — that with
 * complete content the screen stops warning, rather than leaving stale hedging behind.
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

  it('badges nothing as unverified now that every board is transcribed', async () => {
    const wrapper = mountBuilder()
    await wrapper.findAll('select')[0].setValue('ariah')
    await wrapper.findAll('select')[1].setValue('barbarian')
    expect(wrapper.text()).not.toContain('Unverified')
    expect(useContentStore().unverifiedCount).toBe(0)
  })

  it('drops the incomplete-content notice when there is nothing to report', () => {
    // The blurb counts boards with gaps. With none, it must not invent a reassurance
    // or leave a dangling clause behind.
    const text = mountBuilder().text()
    expect(text).toContain('Adventurer and')
    expect(text).not.toContain('not fully transcribed')
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

  it('warns when the chosen Classes will not fit on the physical boards', async () => {
    const wrapper = mountBuilder()
    // Two Adventurers, both Mentor — Mentor is printed on exactly one board.
    await wrapper.findAll('button').find((b) => b.text().startsWith('Add Adventurer'))!.trigger('click')
    const selects = wrapper.findAll('select')
    await selects[0].setValue('syrio')
    await selects[1].setValue('mentor')
    await selects[2].setValue('ariah')
    await selects[3].setValue('mentor')
    expect(wrapper.text()).toContain("Class boards won't stretch")
    expect(wrapper.text()).toContain('Mentor')
  })

  it('still lets the party be saved — a board warning never blocks', async () => {
    const wrapper = mountBuilder()
    await wrapper.findAll('button').find((b) => b.text().startsWith('Add Adventurer'))!.trigger('click')
    const selects = wrapper.findAll('select')
    await selects[0].setValue('syrio')
    await selects[1].setValue('mentor')
    await selects[2].setValue('ariah')
    await selects[3].setValue('mentor')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Create party')!
    expect(save.attributes('disabled')).toBeUndefined()
  })

  it('counts starting equipment against the same budget as the boards', async () => {
    const wrapper = mountBuilder()
    const [character, klass] = wrapper.findAll('select')
    await character.setValue('syrio')   // 64
    await klass.setValue('barbarian')   //  7
    const [budget, equipment] = wrapper.findAll('input[type="number"]')
    await budget.setValue(100)
    await equipment.setValue(50)
    // 64 + 7 + 50 = 121, over the 100 budget. Counting boards alone would call it fine.
    expect(wrapper.text()).toContain('121 Guilders')
    expect(wrapper.text()).toContain('budget is 100')
  })

  it('shows the unspent budget as the opening Stash', async () => {
    const wrapper = mountBuilder()
    const [character, klass] = wrapper.findAll('select')
    await character.setValue('syrio')
    await klass.setValue('barbarian')
    const [budget, equipment] = wrapper.findAll('input[type="number"]')
    await budget.setValue(350)
    await equipment.setValue(50)
    expect(wrapper.text()).toContain('229 Guilders')
    expect(wrapper.text()).toContain('opening Stash')
  })

  it('lets a party grow past four, noting the per-quest roster instead of blocking', async () => {
    const wrapper = mountBuilder()
    const add = () =>
      wrapper.findAll('button').find((b) => b.text().startsWith('Add Adventurer'))!.trigger('click')
    for (let i = 0; i < 4; i += 1) await add()
    expect(wrapper.findAll('select').length / 2).toBeGreaterThan(4)
    expect(wrapper.text()).toContain('only 4 can go on any one quest')
  })

  it('enables saving once the draft is legal', async () => {
    const wrapper = mountBuilder()
    await wrapper.findAll('select')[1].setValue('barbarian')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Create party')!
    expect(save.attributes('disabled')).toBeUndefined()
  })
})
