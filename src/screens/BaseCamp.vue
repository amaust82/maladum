<script setup lang="ts">
/**
 * Camp tab — the Base Camp board (design.md §5; rulebook p.69, p.72, p.86).
 *
 * Every value on this board is dry-wipe: Stash, the Renown track, Storage and the
 * campaign notes all vanish with a wipe. So this screen is built to the same bar as the
 * character sheet — could you restore the board from it? — which is why each value is
 * directly settable rather than only reachable through a campaign phase.
 *
 * Renown is rendered as the physical 0–12 track rather than a number box, because that's
 * what the player is copying from, and clicking the track is faster and less error-prone
 * than typing when you're reading pips off cardboard.
 */
import { computed, ref, watch } from 'vue'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import ItemPicker from '../components/ItemPicker.vue'
import { campIssues, innCost, RENOWN_MAX, RENOWN_SPEND_WINDOWS, summarizeStorage } from '../rules/baseCamp'

defineProps<{ campaignId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()

/** One Base Camp board per party (design §3 — Stash and Renown are party-level). */
const parties = computed(() => campaigns.parties)

const notesDraft = ref<Record<string, string>>({})
watch(
  parties,
  (list) => {
    for (const party of list) {
      if (notesDraft.value[party.id] === undefined) notesDraft.value[party.id] = party.notes
    }
  },
  { immediate: true, deep: true },
)

const renownTrack = Array.from({ length: RENOWN_MAX + 1 }, (_, i) => i)

const storageFor = (partyId: string) => {
  const party = parties.value.find((p) => p.id === partyId)!
  return summarizeStorage(party.storage, party.secureStorageUnlocked)
}

const issuesFor = (partyId: string) => {
  const party = parties.value.find((p) => p.id === partyId)!
  return campIssues({
    storage: party.storage,
    secureStorageUnlocked: party.secureStorageUnlocked,
    renown: party.renown,
  })
}

const itemName = (itemId: string) => content.library.items.get(itemId)?.name ?? itemId

const setStash = (partyId: string, amount: number) =>
  campaigns.commit([{ t: 'STASH_SET', partyId, amount }])
const setRenown = (partyId: string, amount: number) =>
  campaigns.commit([{ t: 'RENOWN_SET', partyId, amount }])
const setSecure = (partyId: string, unlocked: boolean) =>
  campaigns.commit([{ t: 'SECURE_STORAGE_SET', partyId, unlocked }])
const saveNotes = (partyId: string) =>
  campaigns.commit([{ t: 'CAMP_NOTES_SET', partyId, notes: notesDraft.value[partyId] ?? '' }])
const unstore = (partyId: string, itemId: string, instanceId?: string) =>
  campaigns.commit([{ t: 'ITEM_UNSTORED', partyId, item: { itemId, instanceId } }])

/** Which party the store picker is open for, and whether it's adding to Secure Storage. */
const storePickerFor = ref<string | null>(null)
const storePickerSecure = ref(false)
function openStorePicker(partyId: string, secure: boolean) {
  storePickerFor.value = partyId
  storePickerSecure.value = secure
}
function storePicked(itemId: string) {
  const partyId = storePickerFor.value
  if (!partyId) return
  campaigns.commit([{ t: 'ITEM_STORED', partyId, item: { itemId }, secure: storePickerSecure.value }])
}

/**
 * Between missions the party owns its gear, not individual Adventurers (a thematic
 * call, not a transcribed rule — see STATUS.md). Assigning a stored item to whoever's
 * going on the next quest is the hand-off back the other way from
 * `CharacterSheet.vue`'s "Move to party": one commit, so it never appears to vanish
 * between the two events.
 */
const assignPick = ref<Record<string, string>>({})
function assign(partyId: string, entryKey: string, itemId: string, instanceId: string | undefined) {
  const advId = assignPick.value[entryKey]
  if (!advId) return
  campaigns.commit([
    { t: 'ITEM_UNSTORED', partyId, item: { itemId, instanceId } },
    { t: 'ITEM_ACQUIRED', advId, item: { itemId, instanceId }, via: 'assigned' },
  ])
  delete assignPick.value[entryKey]
}

const num = (e: Event) => Number((e.target as HTMLInputElement).value)
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <h2 class="mb-1 text-lg font-medium">Base Camp</h2>
    <p class="mb-4 text-xs opacity-60">
      Everything on this board is dry-wipe, so it's recorded here in full. Set any value
      directly — you shouldn't have to replay a campaign to restore a board.
    </p>

    <p v-if="!parties.length" class="text-sm opacity-70">
      No parties yet. Build one from the Party tab and its Base Camp board appears here.
    </p>

    <section
      v-for="party in parties"
      :key="party.id"
      class="mb-6 rounded border border-neutral-800 bg-neutral-900/40 p-3"
    >
      <h3 class="mb-3 text-sm uppercase tracking-wider opacity-60">{{ party.name }}</h3>

      <ul v-if="issuesFor(party.id).length" class="mb-3 space-y-1 rounded border border-amber-800 bg-amber-950/30 p-2 text-xs">
        <li v-for="issue in issuesFor(party.id)" :key="issue.kind" class="text-amber-200">
          {{ issue.message }}
        </li>
      </ul>

      <!-- Stash -->
      <div class="mb-4 grid gap-3 sm:grid-cols-2">
        <label class="text-xs opacity-70">
          Stash (Guilders)
          <input
            type="number"
            min="0"
            :value="party.stash"
            class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            @change="setStash(party.id, num($event))"
          />
        </label>
        <div class="text-xs opacity-70">
          A night at the Inn
          <p class="mt-1 rounded border border-neutral-800 px-2 py-1.5 text-sm text-neutral-100">
            {{ innCost(party.adventurers.length) }} Guilders
            <span class="opacity-60">for {{ party.adventurers.length }} Adventurer(s)</span>
          </p>
        </div>
      </div>

      <!-- Renown -->
      <div class="mb-4">
        <p class="mb-1 text-xs opacity-70">Renown {{ party.renown }}/{{ RENOWN_MAX }}</p>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="n in renownTrack"
            :key="n"
            class="h-6 w-6 rounded border text-[11px]"
            :class="
              n <= party.renown && n > 0
                ? 'border-amber-500 bg-amber-700/40 text-amber-200'
                : 'border-neutral-700 opacity-50'
            "
            :title="n === 0 ? 'Clear the track' : `Set Renown to ${n}`"
            @click="setRenown(party.id, n)"
          >
            {{ n }}
          </button>
        </div>
        <details class="mt-2 text-xs opacity-70">
          <summary class="cursor-pointer">What Renown can be spent on</summary>
          <ul class="mt-1 space-y-0.5 pl-4">
            <li v-for="w in RENOWN_SPEND_WINDOWS" :key="w.when">
              <strong>{{ w.when }}:</strong> {{ w.effect }}
            </li>
          </ul>
        </details>
      </div>

      <!-- Storage -->
      <div class="mb-4">
        <div class="mb-1 flex items-center justify-between gap-2">
          <p class="text-xs opacity-70">Storage ({{ storageFor(party.id).total }})</p>
          <label class="flex items-center gap-1.5 text-xs opacity-70">
            <input
              type="checkbox"
              :checked="party.secureStorageUnlocked"
              @change="setSecure(party.id, ($event.target as HTMLInputElement).checked)"
            />
            Secure Storage punched out (paying for an Inn)
          </label>
        </div>

        <ul class="space-y-1 text-xs">
          <li
            v-for="(entry, i) in party.storage"
            :key="i"
            class="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1"
            :class="entry.secure && !party.secureStorageUnlocked ? 'border-amber-800' : ''"
          >
            <span>{{ itemName(entry.item.itemId) }}</span>
            <span v-if="entry.secure" class="rounded border border-neutral-700 px-1 opacity-60">
              secure
            </span>
            <span
              v-if="entry.secure && !party.secureStorageUnlocked"
              class="text-amber-300"
            >
              stranded
            </span>
            <select
              v-model="assignPick[party.id + ':' + i]"
              class="ml-auto rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-100"
            >
              <option value="">assign to…</option>
              <option v-for="a in party.adventurers" :key="a.id" :value="a.id">{{ a.displayName }}</option>
            </select>
            <button
              class="opacity-70 hover:underline disabled:opacity-30"
              :disabled="!assignPick[party.id + ':' + i]"
              @click="assign(party.id, party.id + ':' + i, entry.item.itemId, entry.item.instanceId)"
            >
              Assign
            </button>
            <button
              class="text-rose-400 hover:underline"
              @click="unstore(party.id, entry.item.itemId, entry.item.instanceId)"
            >
              Remove
            </button>
          </li>
        </ul>
        <p v-if="!party.storage.length" class="text-xs opacity-50">Nothing stored.</p>

        <div class="mt-2 flex flex-wrap gap-2">
          <button
            class="rounded border border-neutral-700 px-2 py-1.5 text-xs hover:bg-neutral-800"
            @click="openStorePicker(party.id, false)"
          >
            + Add to storage
          </button>
          <button
            class="rounded border border-neutral-700 px-2 py-1.5 text-xs hover:bg-neutral-800 disabled:opacity-40"
            :disabled="!party.secureStorageUnlocked"
            :title="party.secureStorageUnlocked ? '' : 'Secure Storage is only available while paying for an Inn'"
            @click="openStorePicker(party.id, true)"
          >
            + Add to secure storage
          </button>
        </div>
        <ItemPicker
          :open="storePickerFor === party.id"
          @select="storePicked"
          @close="storePickerFor = null"
        />
      </div>

      <!-- Notes -->
      <label class="block text-xs opacity-70">
        Campaign notes
        <textarea
          v-model="notesDraft[party.id]"
          rows="3"
          placeholder="Objective bonuses earned, injuries costing a game, anything else the board carried"
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
          @blur="saveNotes(party.id)"
        />
      </label>
    </section>
  </main>
</template>
