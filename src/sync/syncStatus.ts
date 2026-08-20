/**
 * Visible sync status (design.md §2.x follow-up, 2026-08-20). Every sync call used to
 * be genuinely silent — no success feedback, and a swallowed failure looked identical
 * to nothing happening at all. This is a small reactive singleton `pushPending`/
 * `pullNew` update directly, so any component can show real status without needing to
 * be the one that called them (most sync calls are fire-and-forget from
 * `campaignService.ts`, not from a component at all).
 */

import { reactive } from 'vue'

export type SyncPhase = 'idle' | 'syncing'

export interface SyncStatus {
  phase: SyncPhase
  /** When a sync last completed without error, successfully or as a confirmed no-op. */
  lastSyncedAt: number | null
  /** Message from the most recent failed attempt; cleared on the next success. */
  error: string | null
}

export const syncStatus: SyncStatus = reactive({
  phase: 'idle',
  lastSyncedAt: null,
  error: null,
})

export function markSyncStart(): void {
  syncStatus.phase = 'syncing'
}

export function markSyncSuccess(): void {
  syncStatus.phase = 'idle'
  syncStatus.lastSyncedAt = Date.now()
  syncStatus.error = null
}

export function markSyncError(message: string): void {
  syncStatus.phase = 'idle'
  syncStatus.error = message
}
