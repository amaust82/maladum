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
  const { error } = await supabase.auth.signInWithOtp({ email })
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
