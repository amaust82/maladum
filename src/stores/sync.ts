/**
 * Auth/session state for cross-device sync (design.md §2.x). Thin wrapper around
 * `src/sync/authService.ts`, mirroring the shape of `useCampaignStore` — the store
 * holds no sync logic of its own, it just exposes session state reactively.
 */

import { defineStore } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'
import { db } from '../db/database'
import {
  onAuthStateChange,
  signInWithEmail as sendMagicLink,
  signOut as authSignOut,
  syncAvailable,
} from '../sync/authService'
import {
  downloadCampaign,
  listRemoteCampaigns,
  type RemoteCampaignSummary,
} from '../sync/syncService'

export const useSyncStore = defineStore('sync', () => {
  const email = ref<string | null>(null)
  const linkSent = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const remoteCampaigns = ref<RemoteCampaignSummary[]>([])

  const signedIn = () => email.value !== null
  let unsubscribe: (() => void) | null = null

  async function refreshRemote(): Promise<void> {
    remoteCampaigns.value = signedIn() ? await listRemoteCampaigns() : []
  }

  async function download(campaignId: string): Promise<void> {
    await downloadCampaign(db, campaignId)
  }

  function attach(): void {
    unsubscribe = onAuthStateChange((session) => {
      email.value = session?.user.email ?? null
      if (session) {
        linkSent.value = false
        void refreshRemote()
      } else {
        remoteCampaigns.value = []
      }
    })
  }

  function detach(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  async function signIn(address: string): Promise<void> {
    busy.value = true
    error.value = null
    try {
      await sendMagicLink(address)
      linkSent.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
    }
  }

  async function signOut(): Promise<void> {
    await authSignOut()
    linkSent.value = false
  }

  return {
    available: syncAvailable,
    email,
    linkSent,
    busy,
    error,
    remoteCampaigns,
    signedIn,
    attach,
    detach,
    signIn,
    signOut,
    refreshRemote,
    download,
  }
})

/** Call once from a top-level component (e.g. CampaignPicker) to keep session state live. */
export function useSyncSession(): void {
  const store = useSyncStore()
  onMounted(() => store.attach())
  onUnmounted(() => store.detach())
}
