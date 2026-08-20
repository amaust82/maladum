// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

let signInWithOtpCalls: unknown[]

const fakeSupabase = {
  auth: {
    signInWithOtp: async (arg: unknown) => {
      signInWithOtpCalls.push(arg)
      return { error: null }
    },
  },
}

vi.mock('./supabaseClient', () => ({ supabase: fakeSupabase }))

const { signInWithEmail } = await import('./authService')

beforeEach(() => {
  signInWithOtpCalls = []
})

describe('signInWithEmail', () => {
  it('redirects the magic link to wherever the player actually is, not the Supabase default', async () => {
    // Without emailRedirectTo, Supabase falls back to the project's configured
    // Auth "Site URL" (default: http://localhost:3000) regardless of the caller's
    // origin — this is exactly the bug Adam hit.
    await signInWithEmail('adam@example.com')
    expect(signInWithOtpCalls).toEqual([
      {
        email: 'adam@example.com',
        options: { emailRedirectTo: `${window.location.origin}/` },
      },
    ])
  })
})
