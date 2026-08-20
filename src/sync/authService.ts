/**
 * Thin wrapper around Supabase auth (magic-link email — no password to manage).
 * Every function is a safe no-op when `supabase` is null (sync not configured), so
 * callers never need to branch on whether sync is available.
 */

import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export const syncAvailable = supabase !== null

export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) return
  // Without this, Supabase falls back to the project's configured Auth "Site URL"
  // (default: http://localhost:3000) regardless of where the request came from —
  // the magic link would point at localhost instead of wherever the player actually
  // is. The target origin still has to be in the project's Auth → URL Configuration
  // → Redirect URLs allow-list, or Supabase ignores this and falls back anyway.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + '/' },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** Returns an unsubscribe function; a no-op unsubscribe when sync isn't configured. */
export function onAuthStateChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}
