// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RulesReference from './RulesReference.vue'

/**
 * Mounted against the real bundled packs, because the point of this screen is
 * that the transcribed Reference sections are reachable and honestly rendered.
 */

const mountRules = () => mount(RulesReference)

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('RulesReference', () => {
  it('opens on the whole index with a section tab per reference kind', () => {
    const text = mountRules().text()
    expect(text).toContain('Icons & traits (75)')
    expect(text).toContain('Skills (43)')
    expect(text).toContain('Resources (15)')
  })

  it('narrows to the matching entry as you search', async () => {
    const wrapper = mountRules()
    await wrapper.find('input[type="search"]').setValue('cumbersome')
    const titles = wrapper.findAll('h3').map((h) => h.text())
    expect(titles[0]).toBe('Cumbersome')
    expect(titles.length).toBeLessThan(20)
  })

  it('renders an unidentified icon as a marked chip, not as rules text', async () => {
    const wrapper = mountRules()
    await wrapper.find('input[type="search"]').setValue('healing')
    // The source writes the unresolved glyph as "[icon: spell-action symbol]";
    // it must not reach the player looking like prose.
    expect(wrapper.text()).not.toContain('[icon:')
    const chip = wrapper.findAll('span').find((s) => s.attributes('title')?.startsWith('Unidentified icon'))
    expect(chip).toBeDefined()
    expect(chip!.text()).toContain('spell-action')
  })

  it('says how many entries still carry an unconfirmed glyph', () => {
    expect(mountRules().text()).toMatch(/\d+ entries still contain an unidentified icon/)
  })

  it('jumps to the glossary when a trait chip is clicked', async () => {
    const wrapper = mountRules()
    await wrapper.find('input[type="search"]').setValue('sharp')
    // Find an entry that cross-links to a trait and follow the link.
    const chip = wrapper.findAll('button').find((b) => b.text() === 'Sharp')
    expect(chip, 'expected a cross-link to the Sharp trait').toBeDefined()
    await chip!.trigger('click')
    expect((wrapper.find('input[type="search"]').element as HTMLInputElement).value).toBe('Sharp')
    expect(wrapper.findAll('h3')[0].text()).toBe('Sharp')
  })

  it('pages long lists instead of rendering the whole book at once', async () => {
    const wrapper = mountRules()
    expect(wrapper.findAll('h3').length).toBeLessThanOrEqual(60)
    const more = wrapper.findAll('button').find((b) => b.text().startsWith('Show more'))
    expect(more).toBeDefined()
    await more!.trigger('click')
    expect(wrapper.findAll('h3').length).toBeGreaterThan(60)
  })

  it('says so plainly when nothing matches', async () => {
    const wrapper = mountRules()
    await wrapper.find('input[type="search"]').setValue('zzzznotathing')
    expect(wrapper.text()).toContain('Nothing matches')
    expect(wrapper.findAll('h3')).toHaveLength(0)
  })
})
