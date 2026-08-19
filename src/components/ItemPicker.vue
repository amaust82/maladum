<script setup lang="ts">
/**
 * Searchable/filterable item picker — mirrors how the physical item deck is actually
 * worked (scan by name/type/trait), not a long alphabetic dropdown. Icons are
 * best-effort trait pictograms; see `src/content/abilityIcons.ts` for the matching
 * logic and the `VITE_SHOW_ITEM_ICONS` disable switch (`public/icons/SOURCE.md` has
 * the provenance/licensing note).
 */
import { computed, ref, watch } from 'vue'
import { useContentStore } from '../stores/content'
import { iconsForNotes, SHOW_ITEM_ICONS } from '../content/abilityIcons'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ select: [itemId: string]; close: [] }>()

const content = useContentStore()
const query = ref('')
const typeFilter = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      query.value = ''
      typeFilter.value = ''
    }
  },
)

const abilityNames = computed(() => [...content.library.abilities.keys()])

const allItems = computed(() => [...content.library.items.values()].sort((a, b) => a.name.localeCompare(b.name)))

const types = computed(() => {
  const set = new Set<string>()
  for (const item of allItems.value) if (item.type) set.add(item.type)
  return [...set].sort()
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return allItems.value.filter((item) => {
    if (typeFilter.value && item.type !== typeFilter.value) return false
    if (!q) return true
    return (
      item.name.toLowerCase().includes(q) ||
      (item.notes ?? '').toLowerCase().includes(q) ||
      (item.type ?? '').toLowerCase().includes(q)
    )
  })
})

const iconsFor = (item: { notes?: string | null }) => iconsForNotes(item.notes, abilityNames.value)

function pick(itemId: string) {
  emit('select', itemId)
  emit('close')
}

function hideOnError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-16"
    @click.self="emit('close')"
  >
    <div class="flex max-h-[80vh] w-full max-w-lg flex-col rounded border border-neutral-700 bg-neutral-900 shadow-xl">
      <div class="flex items-center gap-2 border-b border-neutral-800 p-3">
        <input
          v-model="query"
          autofocus
          type="text"
          placeholder="Search items…"
          class="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm"
        />
        <select
          v-model="typeFilter"
          class="shrink-0 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs"
        >
          <option value="">All types</option>
          <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
        </select>
        <button class="shrink-0 text-xs opacity-60 hover:underline" @click="emit('close')">Close</button>
      </div>

      <ul class="overflow-y-auto p-2">
        <li v-for="item in filtered" :key="item.id">
          <button
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-800"
            @click="pick(item.id)"
          >
            <span class="min-w-0 flex-1 truncate">
              {{ item.name }}
              <span v-if="item.type" class="ml-1 text-xs opacity-50">({{ item.type }})</span>
            </span>
            <span v-if="SHOW_ITEM_ICONS" class="flex shrink-0 gap-1">
              <img
                v-for="src in iconsFor(item)"
                :key="src"
                :src="src"
                alt=""
                class="h-4 w-4"
                @error="hideOnError"
              />
            </span>
          </button>
        </li>
        <li v-if="!filtered.length" class="px-2 py-4 text-center text-xs opacity-50">No items match.</li>
      </ul>
    </div>
  </div>
</template>
