/**
 * Supabase client for cross-device sync (design.md §2.x). Deliberately the opposite
 * of `EnvironmentBadge`'s fail-loud check: sync is an optional layer on top of a local-
 * first app, so a missing URL/key degrades to `null` rather than throwing. Every caller
 * in `src/sync/` treats a `null` client as "sync unavailable" and no-ops, which is also
 * exactly the right behavior for local dev and tests that never configure it.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null
