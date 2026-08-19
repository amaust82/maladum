<script setup lang="ts">
/**
 * Home / campaign picker (design.md §5). Create, continue, duplicate, rename,
 * delete, export, import.
 *
 * Each card also carries its content-compatibility report: a campaign built
 * against packs that have since changed says so here, before you open it and
 * start trusting numbers derived from the new data.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import { useSyncStore } from '../stores/sync'
import { describeManifestIssue } from '../content/manifest'
import AccountSync from '../components/AccountSync.vue'

const campaigns = useCampaignStore()
const content = useContentStore()
const sync = useSyncStore()
const router = useRouter()

/** Cloud campaigns this account has pushed from another device but not seen here yet. */
const notYetLocal = computed(() => {
  const localIds = new Set(campaigns.summaries.map((c) => c.id))
  return sync.remoteCampaigns.filter((c) => !localIds.has(c.id))
})

function download(id: string) {
  return guard(async () => {
    await sync.download(id)
    await campaigns.refresh()
  })
}

const newName = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => campaigns.refresh())

const dateOf = (ms: number) => new Date(ms).toLocaleDateString()

async function guard(fn: () => Promise<void>) {
  busy.value = true
  error.value = null
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function create() {
  const name = newName.value.trim()
  if (!name) return
  return guard(async () => {
    const id = await campaigns.create(name)
    newName.value = ''
    await router.push(`/c/${id}/party`)
  })
}

function open(id: string) {
  return router.push(`/c/${id}/party`)
}

function duplicate(id: string) {
  return guard(() => campaigns.duplicate(id).then(() => undefined))
}

function remove(id: string, name: string) {
  // Deleting a log is irreversible and there is no server-side copy — confirm.
  if (!window.confirm(`Delete "${name}" and its entire history? This cannot be undone.`)) return
  return guard(() => campaigns.remove(id))
}

function rename(id: string, current: string) {
  const name = window.prompt('Campaign name', current)?.trim()
  if (!name || name === current) return
  return guard(() => campaigns.rename(id, name))
}

function exportCampaign(id: string, name: string) {
  return guard(async () => {
    const json = await campaigns.exportToJson(id)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.maladum.json`
    a.click()
    URL.revokeObjectURL(url)
  })
}

function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  return guard(async () => {
    await campaigns.importFromJson(await file.text())
    if (fileInput.value) fileInput.value.value = ''
  })
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <header class="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-wide">Maladum</h1>
        <p class="text-xs uppercase tracking-[0.2em] opacity-60">Campaign Companion</p>
      </div>
      <AccountSync class="shrink-0 text-right" />
    </header>

    <ul v-if="content.loadErrors.length" class="mb-6 space-y-1 rounded border border-rose-800 bg-rose-950/50 p-3 text-xs text-rose-300">
      <li v-for="err in content.loadErrors" :key="err">{{ err }}</li>
    </ul>

    <form class="mb-8 flex gap-2" @submit.prevent="create">
      <input
        v-model="newName"
        placeholder="New campaign name"
        class="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        :disabled="busy || !newName.trim()"
        class="rounded bg-amber-700 px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        Create
      </button>
    </form>

    <p v-if="error" class="mb-4 rounded border border-rose-800 bg-rose-950/50 p-3 text-xs text-rose-300">
      {{ error }}
    </p>

    <p v-if="!campaigns.summaries.length && !campaigns.loading" class="mb-8 text-sm opacity-60">
      No campaigns yet. Name one above, or import a backup.
    </p>

    <ul v-if="notYetLocal.length" class="mb-6 space-y-2">
      <li
        v-for="c in notYetLocal"
        :key="c.id"
        class="flex items-center justify-between gap-3 rounded border border-dashed border-neutral-700 bg-neutral-900/30 p-3 text-sm"
      >
        <span>{{ c.name }} <span class="text-xs opacity-55">— synced from another device</span></span>
        <button class="shrink-0 rounded bg-neutral-700 px-3 py-1.5 text-xs font-medium" @click="download(c.id)">
          Download
        </button>
      </li>
    </ul>

    <ul class="space-y-3">
      <li
        v-for="c in campaigns.summaries"
        :key="c.id"
        class="rounded border border-neutral-800 bg-neutral-900/60 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <button class="text-lg font-medium hover:underline" @click="open(c.id)">
              {{ c.name }}
            </button>
            <p class="text-xs opacity-55">
              created {{ dateOf(c.createdAt) }} · last played {{ dateOf(c.updatedAt) }} ·
              {{ c.contentPacks.length }} pack(s)
            </p>
          </div>
          <button
            class="shrink-0 rounded bg-amber-700 px-3 py-1.5 text-sm font-medium"
            @click="open(c.id)"
          >
            Continue
          </button>
        </div>

        <ul v-if="c.manifestIssues.length" class="mt-3 space-y-1 text-xs">
          <li
            v-for="issue in c.manifestIssues"
            :key="issue.kind + issue.packId"
            :class="{
              'text-rose-300': issue.severity === 'error',
              'text-amber-300': issue.severity === 'warning',
              'opacity-55': issue.severity === 'info',
            }"
          >
            {{ describeManifestIssue(issue) }}
          </li>
        </ul>

        <div class="mt-3 flex flex-wrap gap-3 text-xs opacity-70">
          <button class="hover:underline" @click="rename(c.id, c.name)">Rename</button>
          <button class="hover:underline" @click="duplicate(c.id)">Duplicate</button>
          <button class="hover:underline" @click="exportCampaign(c.id, c.name)">Export</button>
          <button class="hover:underline text-rose-400" @click="remove(c.id, c.name)">Delete</button>
        </div>
      </li>
    </ul>

    <footer class="mt-10 border-t border-neutral-800 pt-4 text-xs opacity-60">
      <label class="cursor-pointer hover:underline">
        Import a campaign backup…
        <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="importFile" />
      </label>
      <p class="mt-2">
        Content installed:
        <span v-for="(p, i) in content.manifest" :key="p.id">
          {{ i ? ' · ' : '' }}{{ p.name }} v{{ p.version }}
        </span>
      </p>
    </footer>
  </main>
</template>
