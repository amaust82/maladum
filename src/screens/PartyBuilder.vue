<script setup lang="ts">
/**
 * Party builder (design.md §4 Phase 1 item 2, §5).
 *
 * The screen's real job is honesty about content. Placeholder boards are hidden
 * behind an explicit opt-in; partially-transcribed boards are selectable but
 * badged, and the Guilder total shows as "at least N" whenever a cost is unknown,
 * because the alternative — treating a missing cost as zero — produces a number
 * that looks like an answer and isn't. See `rules/partyBuilder.ts`.
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import ReadinessBadge from '../components/ReadinessBadge.vue'
import ItemPicker from '../components/ItemPicker.vue'
import { draftMemberFrom, partyCreationEvents, validateDraft } from '../services/partyService'
import {
  describePartyIssue,
  MAX_QUEST_ROSTER,
  RECOMMENDED_EQUIPMENT_ALLOWANCE,
  RECOMMENDED_PARTY_BUDGET,
} from '../rules/partyBuilder'

const props = defineProps<{ campaignId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()
const router = useRouter()

interface Row {
  id: string
  characterId: string
  classId: string
  displayName: string
}

const partyName = ref('The Party')
const budget = ref<number | null>(null)
const equipmentSpend = ref<number | null>(null)
const rows = reactive<Row[]>([])
const saving = ref(false)
const error = ref<string | null>(null)

let nextRow = 0
function addRow() {
  nextRow += 1
  rows.push({
    id: `a${nextRow}`,
    characterId: content.adventurers[0]?.id ?? '',
    // Deliberately unset: pairing a Class board with an Adventurer is a real
    // decision at the table, and pre-picking the alphabetically-first Class
    // would quietly make it for the player.
    classId: '',
    displayName: '',
  })
}
const removeRow = (id: string) => rows.splice(rows.findIndex((r) => r.id === id), 1)

/**
 * Starting equipment goes to the party pool, not any one Adventurer — divvying it
 * out is a mission-setup step (Adam, 2026-08-19), so this screen only collects it.
 */
const startingItems = ref<string[]>([])
const itemPickerOpen = ref(false)
const addStartingItem = (itemId: string) => startingItems.value.push(itemId)
const removeStartingItem = (index: number) => startingItems.value.splice(index, 1)
const itemName = (itemId: string) => content.library.items.get(itemId)?.name ?? itemId

const members = computed(() => rows.map((r) => draftMemberFrom(content.library, r)))
const draft = computed(() => ({
  name: partyName.value.trim() || 'The Party',
  members: members.value,
  budget: budget.value,
  equipmentSpend: equipmentSpend.value,
  startingItems: startingItems.value,
}))
const validation = computed(() => validateDraft(draft.value, content.library))

/** Per-row warnings, so a gap is shown on the card it belongs to as well as in the summary. */
const rowIssues = (id: string) =>
  validation.value.issues.filter((i) => 'memberId' in i && i.memberId === id)
const generalIssues = computed(() => validation.value.issues.filter((i) => !('memberId' in i)))

const costLabel = computed(() => {
  const { known, exact, unknown } = validation.value.cost
  return exact
    ? `${known} Guilders`
    : `at least ${known} Guilders · ${unknown.length} unknown cost(s)`
})

async function save() {
  if (!validation.value.ok) return
  saving.value = true
  error.value = null
  try {
    const partyId = `p${Date.now().toString(36)}`
    await campaigns.commit(partyCreationEvents(content.library, partyId, draft.value))
    await router.push(`/c/${props.campaignId}/party`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

addRow()
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <h2 class="mb-4 text-lg font-medium">Build a party</h2>

    <div class="mb-5 grid gap-3 sm:grid-cols-2">
      <label class="text-xs opacity-70">
        Party name
        <input
          v-model="partyName"
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>
      <label class="text-xs opacity-70">
        Agreed budget in Guilders (optional)
        <input
          v-model.number="budget"
          type="number"
          min="0"
          :placeholder="`blank to skip · rulebook suggests ${RECOMMENDED_PARTY_BUDGET}`"
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>
      <label class="text-xs opacity-70 sm:col-span-2">
        Spent on starting equipment
        <input
          v-model.number="equipmentSpend"
          type="number"
          min="0"
          :placeholder="`comes out of the same budget · rulebook suggests about ${RECOMMENDED_EQUIPMENT_ALLOWANCE}`"
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
        <span class="mt-1 block opacity-60">
          Equipment is bought from the same purse as the boards (p.68). At rank 1 nothing
          costing more than 10 Guilders can be bought.
        </span>
      </label>
      <div class="text-xs opacity-70 sm:col-span-2">
        Starting equipment
        <span class="opacity-60">— goes to the party, divvied out at mission setup</span>
        <ul v-if="startingItems.length" class="mt-1 space-y-1">
          <li
            v-for="(itemId, i) in startingItems"
            :key="i"
            class="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1"
          >
            <span>{{ itemName(itemId) }}</span>
            <button class="ml-auto text-rose-400 hover:underline" @click="removeStartingItem(i)">
              Remove
            </button>
          </li>
        </ul>
        <button
          class="mt-1 rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
          @click="itemPickerOpen = true"
        >
          + Add item…
        </button>
        <ItemPicker :open="itemPickerOpen" @select="addStartingItem" @close="itemPickerOpen = false" />
      </div>
    </div>

    <div class="mb-5 rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
      <label v-if="content.hiddenCount || content.showPlaceholders" class="flex items-center gap-2">
        <input v-model="content.showPlaceholders" type="checkbox" />
        <span>
          Show placeholder boards
          <span class="opacity-60">
            — structural stand-ins, not real game data<template v-if="!content.showPlaceholders && content.hiddenCount">
              ({{ content.hiddenCount }} hidden)</template>
          </span>
        </span>
      </label>
      <p v-if="!content.adventurers.length" class="text-amber-300">
        No usable Adventurer boards are installed — check the content packs under Rules.
      </p>
      <p v-else-if="!content.classes.length" class="text-amber-300">
        No usable Class boards are installed, so a party can't be completed yet: every Adventurer
        needs one.
      </p>
      <p v-else class="opacity-70">
        {{ content.adventurers.length }} Adventurer and {{ content.classes.length }} Class boards
        are installed<template v-if="content.unverifiedCount">, {{ content.unverifiedCount }} of
        them not fully transcribed — those cards name the fields still missing</template>.
      </p>
    </div>

    <ul class="space-y-3">
      <li
        v-for="row in rows"
        :key="row.id"
        class="rounded border border-neutral-800 bg-neutral-900/60 p-3"
      >
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="text-xs opacity-70">
            Adventurer
            <select
              v-model="row.characterId"
              class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            >
              <option v-for="o in content.adventurers" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </label>
          <label class="text-xs opacity-70">
            Class
            <select
              v-model="row.classId"
              class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            >
              <option value="">— choose —</option>
              <option v-for="o in content.classes" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </label>
          <label class="text-xs opacity-70">
            Name (optional)
            <input
              v-model="row.displayName"
              class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            />
          </label>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <ReadinessBadge
            v-for="o in content.allAdventurers.filter((a) => a.id === row.characterId)"
            :key="o.id"
            :readiness="o.readiness"
          />
          <ReadinessBadge
            v-for="o in content.allClasses.filter((c) => c.id === row.classId)"
            :key="o.id"
            :readiness="o.readiness"
          />
          <button class="ml-auto text-xs text-rose-400 hover:underline" @click="removeRow(row.id)">
            Remove
          </button>
        </div>

        <ul class="mt-2 space-y-0.5 text-xs">
          <li
            v-for="issue in rowIssues(row.id)"
            :key="issue.kind"
            :class="issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'"
          >
            {{ describePartyIssue(issue) }}
          </li>
        </ul>
      </li>
    </ul>

    <button
      class="mt-3 rounded border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
      @click="addRow"
    >
      Add Adventurer<template v-if="rows.length > MAX_QUEST_ROSTER"> ({{ rows.length }}, {{ MAX_QUEST_ROSTER }} per quest)</template>
    </button>

    <section class="mt-6 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <p class="text-sm">Party cost: <strong>{{ costLabel }}</strong></p>
      <p v-if="validation.cost.equipment" class="mt-0.5 text-xs opacity-60">
        {{ validation.cost.boards }} on boards + {{ validation.cost.equipment }} on equipment
      </p>
      <p v-if="validation.stash !== null" class="mt-1 text-xs">
        Left over: <strong>{{ validation.stash }} Guilders</strong>
        <span class="opacity-60"> — this becomes your opening Stash on the Base Camp board</span>
      </p>
      <ul class="mt-2 space-y-0.5 text-xs">
        <li
          v-for="issue in generalIssues"
          :key="issue.kind"
          :class="issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'"
        >
          {{ describePartyIssue(issue) }}
        </li>
      </ul>
    </section>

    <p v-if="error" class="mt-4 rounded border border-rose-800 bg-rose-950/50 p-3 text-xs text-rose-300">
      {{ error }}
    </p>

    <div class="mt-6 flex gap-3">
      <button
        class="rounded bg-amber-700 px-4 py-2 text-sm font-medium disabled:opacity-40"
        :disabled="!validation.ok || saving"
        @click="save"
      >
        Create party
      </button>
      <RouterLink :to="`/c/${campaignId}/party`" class="px-4 py-2 text-sm opacity-70 hover:underline">
        Cancel
      </RouterLink>
    </div>
  </main>
</template>
