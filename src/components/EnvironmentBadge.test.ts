// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * The badge's whole job is to stop a real campaign being recorded on the wrong origin,
 * so the case that matters most is the *misconfigured* one: a staging deploy whose env
 * var is missing must still be flagged, because that's the failure that silently loses
 * data. Each case re-imports the component, since the env is read at module scope.
 */

async function badgeWith(value: string | undefined) {
  if (value === undefined) vi.stubEnv('VITE_APP_ENV', undefined as unknown as string)
  else vi.stubEnv('VITE_APP_ENV', value)
  vi.resetModules()
  const { default: Badge } = await import('./EnvironmentBadge.vue')
  return mount(Badge)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('EnvironmentBadge', () => {
  it('renders nothing on production', async () => {
    expect((await badgeWith('production')).find('div').exists()).toBe(false)
  })

  it('flags a staging deploy by name', async () => {
    const wrapper = await badgeWith('staging')
    expect(wrapper.find('div').exists()).toBe(true)
    expect(wrapper.text()).toContain('staging')
  })

  it('still flags a deploy whose env var is empty', async () => {
    // The dangerous case. `vite build` sets MODE=production for staging too, so falling
    // back to MODE would hide the badge on exactly the site that most needs one.
    const wrapper = await badgeWith('')
    expect(wrapper.find('div').exists()).toBe(true)
    expect(wrapper.text()).toContain('unset')
  })

  it('treats whitespace as unset rather than as an environment name', async () => {
    const wrapper = await badgeWith('   ')
    expect(wrapper.find('div').exists()).toBe(true)
    expect(wrapper.text()).toContain('unset')
  })

  it('explains the consequence in its tooltip, not just the environment name', async () => {
    const wrapper = await badgeWith('staging')
    expect(wrapper.find('div').attributes('title')).toContain('will not appear there')
  })

  it('never intercepts clicks meant for the app underneath', async () => {
    const wrapper = await badgeWith('staging')
    expect(wrapper.find('div').classes()).toContain('pointer-events-none')
  })
})
