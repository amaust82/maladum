<script setup lang="ts">
/**
 * Compact sign-in/sync status panel for the campaign picker (design.md §2.x). Sync is
 * optional and best-effort — this panel only ever shows account state, never blocks
 * or gates anything else. When `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` aren't
 * configured, `sync.available` is false and the panel says so instead of offering a
 * sign-in that can't work.
 */
import { ref } from 'vue'
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
</script>

<template>
  <div class="text-xs">
    <p v-if="!sync.available" class="opacity-50">Sync not configured — playing offline-only.</p>

    <template v-else-if="sync.signedIn()">
      <button class="opacity-70 hover:underline" @click="open = !open">
        Synced as {{ sync.email }}
      </button>
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
