<script setup lang="ts">
/**
 * Rules tab — a searchable view of every Reference section in the loaded packs
 * (design.md §5). This is the mid-game lookup screen: "what does Cumbersome do",
 * "what's a Chakri cost", "what's Level 3 Acrobatics".
 *
 * All the logic lives in `content/reference.ts` and is tested there; this file is
 * presentation. Two presentational rules carry real weight:
 *
 *   - `[icon: …]` markers render as visibly-unresolved chips, never as prose. They
 *     are the transcription's honest "couldn't identify this glyph" notes, and
 *     letting them read as rules text would launder a gap into an answer.
 *   - A trait named in an entry's text becomes a button that searches the glossary
 *     for it, but only when the glossary actually defines it.
 */
import { computed, ref } from 'vue'
import { useContentStore } from '../stores/content'
import {
  buildReferenceIndex,
  countsByKind,
  KIND_LABELS,
  REFERENCE_KINDS,
  searchReference,
  splitIconMarkers,
  unresolvedIconCount,
  type ReferenceKind,
} from '../content/reference'

const content = useContentStore()

const index = computed(() => buildReferenceIndex(content.library))
const counts = computed(() => countsByKind(index.value))
const unresolved = computed(() => unresolvedIconCount(index.value))

const query = ref('')
const kind = ref<ReferenceKind | null>(null)

const results = computed(() => searchReference(index.value, query.value, kind.value ?? undefined))

/** Long lists are capped so a blank query doesn't render 400 entries into the DOM. */
const PAGE = 60
const shown = ref(PAGE)
const visible = computed(() => results.value.slice(0, shown.value))
const resetPaging = () => (shown.value = PAGE)

/** Clicking a trait chip jumps to its glossary entry. */
function lookUpTrait(trait: string) {
  kind.value = 'ability'
  query.value = trait
  resetPaging()
}

function selectKind(next: ReferenceKind | null) {
  kind.value = next
  resetPaging()
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <h2 class="mb-3 text-lg font-medium">Rules reference</h2>

    <input
      v-model="query"
      type="search"
      placeholder="Search traits, skills, spells, equipment…"
      class="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
      @input="resetPaging"
    />

    <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
      <button
        class="rounded-full border px-2.5 py-1"
        :class="kind === null ? 'border-amber-500 text-amber-300' : 'border-neutral-700 opacity-70'"
        @click="selectKind(null)"
      >
        All ({{ index.length }})
      </button>
      <button
        v-for="k in REFERENCE_KINDS"
        :key="k"
        class="rounded-full border px-2.5 py-1"
        :class="kind === k ? 'border-amber-500 text-amber-300' : 'border-neutral-700 opacity-70'"
        @click="selectKind(k)"
      >
        {{ KIND_LABELS[k] }} ({{ counts[k] }})
      </button>
    </div>

    <p class="mt-3 text-xs opacity-60">
      {{ results.length }} match<template v-if="results.length !== 1">es</template>.
      <template v-if="unresolved">
        {{ unresolved }} entries still contain an unidentified icon, shown as
        <span class="rounded bg-neutral-800 px-1 text-neutral-400">?&nbsp;marked chips</span> —
        those glyphs weren't confirmed during transcription and haven't been guessed at.
      </template>
    </p>

    <p v-if="!results.length" class="mt-6 text-sm opacity-70">
      Nothing matches “{{ query }}” in this section.
    </p>

    <ul class="mt-4 space-y-2">
      <li
        v-for="entry in visible"
        :key="entry.kind + ':' + entry.key"
        class="rounded border border-neutral-800 bg-neutral-900/60 p-3"
      >
        <div class="flex flex-wrap items-baseline gap-x-2">
          <h3 class="text-sm font-medium">{{ entry.title }}</h3>
          <span v-if="entry.group" class="text-xs opacity-50">{{ entry.group }}</span>
          <span v-if="entry.subtitle" class="ml-auto text-xs opacity-70">{{ entry.subtitle }}</span>
        </div>

        <p v-if="entry.body" class="mt-1.5 whitespace-pre-line text-xs leading-relaxed opacity-90">
          <template v-for="(seg, i) in splitIconMarkers(entry.body)" :key="i">
            <span v-if="seg.type === 'plain'">{{ seg.text }}</span>
            <span
              v-else
              class="mx-0.5 rounded bg-neutral-800 px-1 text-neutral-400"
              :title="'Unidentified icon in the source: ' + seg.text"
              >? {{ seg.text }}</span
            >
          </template>
        </p>

        <div v-if="entry.traits.length" class="mt-2 flex flex-wrap gap-1">
          <button
            v-for="trait in entry.traits"
            :key="trait"
            class="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] opacity-70 hover:opacity-100"
            @click="lookUpTrait(trait)"
          >
            {{ trait }}
          </button>
        </div>
      </li>
    </ul>

    <button
      v-if="visible.length < results.length"
      class="mt-4 w-full rounded border border-neutral-700 py-2 text-sm"
      @click="shown += PAGE"
    >
      Show more ({{ results.length - visible.length }} remaining)
    </button>
  </main>
</template>
