<script setup lang="ts">
/**
 * Log tab — the campaign chronicle (design.md §5).
 *
 * Reverse-chronological timeline generated from the event log, filterable by Adventurer,
 * exportable as Markdown. This is the screen the event-sourced store was chosen for
 * (design §2.3): the saga falls out of the same data the projection is built from, with
 * no extra model to maintain.
 *
 * The Markdown export is also the app's plain-text escape hatch. Under the
 * between-sessions framing the app is insurance against a wiped board, and insurance you
 * can't get anything out of isn't worth much — this is the copy you can paste, print or
 * keep somewhere the app isn't.
 */
import { computed, ref } from 'vue'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import { buildChronicle, chronicleToMarkdown, filterByAdventurer } from '../rules/chronicle'

defineProps<{ campaignId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()

const filter = ref('')
const copied = ref(false)

const everyone = computed(() =>
  campaigns.parties.flatMap((p) => p.adventurers.map((a) => ({ id: a.id, name: a.displayName }))),
)

const chronicle = computed(() =>
  buildChronicle(campaigns.log, {
    itemName: (id) => content.library.items.get(id)?.name ?? id,
  }),
)

const shown = computed(() => {
  const entries = filter.value ? filterByAdventurer(chronicle.value, filter.value) : chronicle.value
  // Newest first on screen; the chronicle itself stays oldest-first so chapters make sense.
  return [...entries].reverse()
})

const markdown = computed(() => chronicleToMarkdown(campaigns.state.name, chronicle.value))

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(markdown.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard access can be denied; the textarea below is always there to select from.
    copied.value = false
  }
}

const showRaw = ref(false)

const formatDate = (at: number) => new Date(at).toLocaleDateString()
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-medium">Campaign log</h2>
      <span class="text-xs opacity-60">{{ chronicle.length }} entries</span>
    </div>

    <div class="mb-4 flex flex-wrap gap-2">
      <select
        v-model="filter"
        class="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100"
      >
        <option value="">Everything</option>
        <option v-for="a in everyone" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <button
        class="rounded border border-neutral-700 px-2 py-1.5 text-xs"
        @click="showRaw = !showRaw"
      >
        {{ showRaw ? 'Hide' : 'Export as' }} Markdown
      </button>
      <button v-if="showRaw" class="rounded border border-neutral-700 px-2 py-1.5 text-xs" @click="copyMarkdown">
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </div>

    <textarea
      v-if="showRaw"
      :value="markdown"
      readonly
      rows="12"
      class="mb-4 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 font-mono text-xs text-neutral-100"
    />

    <p v-if="!shown.length" class="text-sm opacity-70">
      Nothing logged yet. Play a quest and record it from the Play tab.
    </p>

    <ol class="space-y-1">
      <li
        v-for="entry in shown"
        :key="entry.seq"
        class="flex flex-wrap items-baseline gap-2 rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1.5 text-xs"
        :class="entry.kind === 'QUEST_RECORDED' ? 'border-amber-800' : ''"
      >
        <span v-if="entry.chapter" class="opacity-40">Q{{ entry.chapter }}</span>
        <span :class="entry.kind === 'QUEST_RECORDED' ? 'font-medium text-amber-200' : ''">
          {{ entry.text }}
        </span>
        <span v-if="entry.at" class="ml-auto opacity-40">{{ formatDate(entry.at) }}</span>
      </li>
    </ol>
  </main>
</template>
