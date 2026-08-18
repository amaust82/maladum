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
 * mounts the real builder against the real bundled seed content — where the only
 * Adventurer with a verified stat block still has no transcribed Guilder cost.
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
  it('hides placeholder boards by default and says how many it hid', () => {
    const wrapper = mountBuilder()
    const options = wrapper.findAll('option').map((o) => o.text())
    expect(options).toContain('Syrio')
    expect(options.some((o) => o.includes('PLACEHOLDER'))).toBe(false)
    expect(wrapper.text()).toContain('hidden')
  })

  it('offers the placeholder boards once the player opts in', async () => {
    const wrapper = mountBuilder()
    useContentStore().showPlaceholders = true
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('option').some((o) => o.text().includes('PLACEHOLDER'))).toBe(true)
  })

  it('badges a partially-transcribed board instead of presenting it as complete', () => {
    const wrapper = mountBuilder()
    expect(wrapper.text()).toContain('Unverified')
    expect(wrapper.text()).toContain('cost')
  })

  it('reports the cost as a lower bound while a board cost is unknown', () => {
    // Syrio's cost is null in core.json, so the total must never read as an exact figure.
    expect(mountBuilder().text()).toContain('at least 0 Guilders')
  })

  it('blocks saving until a Class board is chosen', async () => {
    const wrapper = mountBuilder()
    const save = wrapper.findAll('button').find((b) => b.text() === 'Create party')!
    expect(save.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Choose a Class board')
  })
})
