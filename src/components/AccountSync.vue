<script setup lang="ts">
/**
 * Compact sign-in/sync status panel for the campaign picker (design.md §2.x). Sync is
 * optional and best-effort — this panel only ever shows account state, never blocks
 * or gates anything else. When `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` aren't
 * configured, `sync.available` is false and the panel says so instead of offering a
 * sign-in that can't work.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSyncSession, useSyncStore } from '../stores/sync'

const sync = useSyncStore()
useSyncSession()

const emailInput = ref('')
const open = ref(false)

function submit() {
  const address = emailInput.value.trim()
  if (!address) return
  return sync.signIn(address)
}

/** Ticks so "3m ago" keeps advancing without needing another sync to trigger a re-render. */
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 30_000)
})
onUnmounted(() => clearInterval(tick))

const statusText = computed(() => {
  if (sync.status.phase === 'syncing') return 'Syncing…'
  if (sync.status.error) return `Sync failed: ${sync.status.error}`
  if (!sync.status.lastSyncedAt) return 'Not synced yet'
  const seconds = Math.max(0, Math.round((now.value - sync.status.lastSyncedAt) / 1000))
  if (seconds < 60) return 'Synced just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `Synced ${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `Synced ${hours}h ago`
})
</script>

<template>
  <div class="text-xs">
    <p v-if="!sync.available" class="opacity-50">Sync not configured — playing offline-only.</p>

    <template v-else-if="sync.signedIn()">
      <button class="opacity-70 hover:underline" @click="open = !open">
        {{ sync.email }}
      </button>
      <div class="mt-1 flex items-center gap-2">
        <span :class="sync.status.error ? 'text-rose-300' : 'opacity-50'">{{ statusText }}</span>
        <button
          class="opacity-70 hover:underline disabled:opacity-30"
          :disabled="sync.status.phase === 'syncing'"
          @click="sync.syncNow()"
        >
          Sync now
        </button>
      </div>
      <div v-if="open" class="mt-2">
        <button class="opacity-70 hover:underline" @click="sync.signOut()">Sign out</button>
      </div>
    </template>

    <template v-else>
      <button v-if="!open" class="opacity-70 hover:underline" @click="open = true">
        Sign in to sync across devices
      </button>
      <form v-else class="mt-2 flex gap-2" @submit.prevent="submit">
        <input
          v-model="emailInput"
          type="email"
          placeholder="you@example.com"
          class="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
        />
        <button
          type="submit"
          :disabled="sync.busy || !emailInput.trim()"
          class="rounded bg-amber-700 px-3 py-1 font-medium disabled:opacity-40"
        >
          Send link
        </button>
      </form>
      <p v-if="sync.linkSent" class="mt-1 opacity-60">Check your email for a sign-in link.</p>
      <p v-if="sync.error" class="mt-1 text-rose-300">{{ sync.error }}</p>
    </template>
  </div>
</template>
