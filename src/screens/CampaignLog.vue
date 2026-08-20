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
import { buildChronicle, chronicleToMarkdown, filterByAdventurer, storySoFar } from '../rules/chronicle'

defineProps<{ campaignId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()

const filter = ref('')
const copied = ref(false)

/** One line per quest per party — the recap, distinct from the full event-by-event log below. */
const stories = computed(() =>
  campaigns.parties
    .map((party) => ({ party, entries: storySoFar(party) }))
    .filter((s) => s.entries.length),
)

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

    <section v-if="stories.length" class="mb-6">
      <h3 class="mb-2 text-sm font-medium opacity-80">Story so far</h3>
      <div v-for="s in stories" :key="s.party.id" class="mb-3">
        <p v-if="stories.length > 1" class="mb-1 text-xs font-medium opacity-60">{{ s.party.name }}</p>
        <ol class="space-y-1">
          <li
            v-for="e in s.entries"
            :key="e.chapter"
            class="flex flex-wrap items-baseline gap-2 rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1.5 text-sm"
          >
            <span class="opacity-40">Q{{ e.chapter }}</span>
            <span class="font-medium">{{ e.name }}</span>
            <span class="opacity-70">— {{ e.outcomeLabel }}</span>
            <span v-if="e.renownGained || e.guildersGained" class="opacity-50">
              ({{ [e.renownGained ? `+${e.renownGained} Renown` : null, e.guildersGained ? `+${e.guildersGained} Guilders` : null].filter(Boolean).join(', ') }})
            </span>
            <span class="ml-auto opacity-40">{{ formatDate(e.at) }}</span>
          </li>
        </ol>
      </div>
    </section>

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
