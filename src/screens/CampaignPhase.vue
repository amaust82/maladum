<script setup lang="ts">
/**
 * Campaign Phase wizard — the after-game loop (design.md §4, §5; rulebook p.78–87).
 *
 * Under the between-sessions framing this is the app's most valuable screen: it's the
 * five minutes after a session when everything that happened gets written down, before
 * the boards get wiped and the memory of it goes with them.
 *
 * Two rules it holds to, both from design principle #2:
 *
 * - **The app never rolls.** Escape calls for a physical Magic Die; the player rolls it
 *   and types the number in, and the app resolves the consequence.
 * - **Nothing is applied silently.** Each step shows what the rules say is owed and the
 *   player commits it. A wizard that quietly mutated state would leave an event log
 *   nobody could audit, which is the one thing the log exists to prevent.
 */
import { computed, reactive, ref } from 'vue'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import {
  advancementTasks,
  escapeTasks,
  marketSummary,
  PHASE_LABELS,
  PHASE_PAGES,
  PHASES,
  restOptions,
  type Phase,
  type QuestReport,
} from '../rules/campaignPhase'
import { resolveEscape, type EscapeCounter } from '../rules/escape'
import type { QuestOutcome } from '../store/campaign/events'

defineProps<{ campaignId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()

const partyId = ref<string>('')
const party = computed(
  () => campaigns.parties.find((p) => p.id === partyId.value) ?? campaigns.parties[0] ?? null,
)

const step = ref<Phase>('escape')
const recorded = ref(false)

const questName = ref('')
const outcome = ref<QuestOutcome>('primary-complete')
const renownGained = ref<number | null>(null)
const guildersGained = ref<number | null>(null)
const tookPart = reactive<Record<string, boolean>>({})
const leftBehind = reactive<Record<string, boolean>>({})

const report = computed<QuestReport>(() => ({
  name: questName.value.trim() || 'Unnamed quest',
  outcome: outcome.value,
  tookPart: Object.keys(tookPart).filter((id) => tookPart[id]),
  leftBehind: Object.keys(leftBehind).filter((id) => leftBehind[id]),
  renownGained: renownGained.value ?? 0,
  guildersGained: guildersGained.value ?? 0,
}))

const escapes = computed(() =>
  party.value ? escapeTasks(party.value, report.value, content.library.adventurers) : [],
)
const advancement = computed(() =>
  party.value ? advancementTasks(party.value, report.value, content.library.adventurers) : [],
)
const market = computed(() =>
  party.value ? marketSummary(party.value, report.value, content.library.adventurers) : null,
)
const rest = computed(() => (party.value ? restOptions(party.value) : []))

/** Per-Adventurer escape entry: the reported die roll and the counters they carried. */
const escapeRoll = reactive<Record<string, number | null>>({})
const escapeCounters = reactive<Record<string, EscapeCounter[]>>({})

function toggleCounter(advId: string, counter: EscapeCounter) {
  const current = escapeCounters[advId] ?? []
  escapeCounters[advId] = current.includes(counter)
    ? current.filter((c) => c !== counter)
    : [...current, counter]
}

const escapeResult = (advId: string, rank: number | null) => {
  const roll = escapeRoll[advId]
  if (!roll) return null
  return resolveEscape({ roll, counters: escapeCounters[advId] ?? [], rank: rank ?? 1 })
}

async function recordQuest() {
  if (!party.value) return
  await campaigns.commit([
    {
      t: 'QUEST_RECORDED',
      partyId: party.value.id,
      name: report.value.name,
      outcome: report.value.outcome,
      renownGained: report.value.renownGained,
      guildersGained: report.value.guildersGained,
      at: Date.now(),
    },
  ])
  recorded.value = true
}

async function applyEscape(advId: string, rank: number | null) {
  const result = escapeResult(advId, rank)
  if (!result) return
  await campaigns.commit([
    {
      t: 'ESCAPE_RESOLVED',
      advId,
      roll: escapeRoll[advId]!,
      counters: escapeCounters[advId] ?? [],
      consequence: result.consequence,
      questsMissed: result.questsMissed,
      equipmentLost: result.equipmentLost,
    },
  ])
}

const awardXp = (advId: string) =>
  campaigns.commit([{ t: 'XP_GAINED', advId, amount: 1, reason: 'survived' }])

async function payUpkeep() {
  if (!party.value || !market.value) return
  await campaigns.commit([
    {
      t: 'STASH_CHANGED',
      partyId: party.value.id,
      amount: -market.value.known,
      reason: 'Party upkeep',
    },
  ])
}

async function chooseRest(choice: 'inn' | 'wilderness', cost: number, secure: boolean) {
  if (!party.value) return
  const events: Parameters<typeof campaigns.commit>[0] = [
    { t: 'SECURE_STORAGE_SET', partyId: party.value.id, unlocked: secure },
  ]
  if (cost > 0) {
    events.unshift({
      t: 'STASH_CHANGED',
      partyId: party.value.id,
      amount: -cost,
      reason: `Rest: ${choice}`,
    })
  }
  await campaigns.commit(events)
}

const counters: EscapeCounter[] = ['wounded', 'poisoned', 'burning']
const outcomes: { value: QuestOutcome; label: string }[] = [
  { value: 'primary-complete', label: 'Primary objective completed' },
  { value: 'partial', label: 'Partly completed' },
  { value: 'failed', label: 'Failed' },
]
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <h2 class="mb-1 text-lg font-medium">After the game</h2>
    <p class="mb-4 text-xs opacity-60">
      Work through the four campaign phases while the game is fresh. Nothing is applied
      until you commit it, and the app never rolls for you — roll the Magic Die and type
      what you got.
    </p>

    <p v-if="!party" class="text-sm opacity-70">
      No parties yet. Build one from the Party tab first.
    </p>

    <template v-else>
      <!-- The quest just played -->
      <section class="mb-5 rounded border border-neutral-800 bg-neutral-900/40 p-3">
        <h3 class="mb-2 text-sm font-medium">The quest you just played</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-xs opacity-70">
            Quest name
            <input
              v-model="questName"
              placeholder="e.g. Of Coin and Glory"
              class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            />
          </label>
          <label class="text-xs opacity-70">
            Outcome
            <select
              v-model="outcome"
              class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            >
              <option v-for="o in outcomes" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="text-xs opacity-70">
            Renown gained
            <input
              v-model.number="renownGained"
              type="number"
              min="0"
              class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            />
          </label>
          <label class="text-xs opacity-70">
            Guilders gained
            <input
              v-model.number="guildersGained"
              type="number"
              min="0"
              class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            />
          </label>
        </div>

        <table class="mt-3 w-full text-xs">
          <thead class="opacity-50">
            <tr class="text-left">
              <th class="py-1 font-normal">Adventurer</th>
              <th class="w-24 font-normal">Took part</th>
              <th class="w-28 font-normal">Left behind</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in party.adventurers" :key="a.id" class="border-t border-neutral-800/60">
              <td class="py-1.5" :class="a.alive ? '' : 'opacity-40 line-through'">
                {{ a.displayName }}
              </td>
              <td><input v-model="tookPart[a.id]" type="checkbox" :disabled="!a.alive" /></td>
              <td><input v-model="leftBehind[a.id]" type="checkbox" :disabled="!a.alive" /></td>
            </tr>
          </tbody>
        </table>

        <button
          class="mt-3 rounded bg-amber-700 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          :disabled="recorded"
          @click="recordQuest"
        >
          {{ recorded ? 'Quest recorded' : 'Record this quest' }}
        </button>
      </section>

      <!-- Phase tabs -->
      <div class="mb-3 flex flex-wrap gap-1.5 text-xs">
        <button
          v-for="p in PHASES"
          :key="p"
          class="rounded-full border px-2.5 py-1"
          :class="step === p ? 'border-amber-500 text-amber-300' : 'border-neutral-700 opacity-70'"
          @click="step = p"
        >
          {{ PHASE_LABELS[p] }}
        </button>
      </div>

      <section class="rounded border border-neutral-800 bg-neutral-900/40 p-3">
        <h3 class="mb-2 text-sm font-medium">
          {{ PHASE_LABELS[step] }} Phase
          <span class="opacity-50">p.{{ PHASE_PAGES[step] }}</span>
        </h3>

        <!-- Escape -->
        <template v-if="step === 'escape'">
          <p v-if="!escapes.length" class="text-xs opacity-70">
            Everyone made it out — this phase is skipped (p.78).
          </p>
          <ul v-else class="space-y-3">
            <li v-for="task in escapes" :key="task.advId" class="rounded border border-neutral-800 p-2">
              <p class="text-sm">{{ task.displayName }}</p>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <label class="opacity-70">
                  Magic Die roll
                  <input
                    v-model.number="escapeRoll[task.advId]"
                    type="number"
                    min="1"
                    max="6"
                    class="ml-1 w-14 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-neutral-100"
                  />
                </label>
                <button
                  v-for="c in counters"
                  :key="c"
                  class="rounded border px-1.5 py-0.5 capitalize"
                  :class="
                    (escapeCounters[task.advId] ?? []).includes(c)
                      ? 'border-amber-500 text-amber-300'
                      : 'border-neutral-700 opacity-60'
                  "
                  @click="toggleCounter(task.advId, c)"
                >
                  {{ c }}
                </button>
              </div>
              <p
                v-if="escapeResult(task.advId, task.rank)"
                class="mt-2 text-xs"
              >
                Modified roll {{ escapeResult(task.advId, task.rank)!.modifiedRoll }} —
                <strong>{{ escapeResult(task.advId, task.rank)!.consequence.replace(/-/g, ' ') }}</strong>
                <template v-if="escapeResult(task.advId, task.rank)!.ransomCost">
                  · ransom {{ escapeResult(task.advId, task.rank)!.ransomCost }} Guilders
                </template>
              </p>
              <button
                class="mt-2 rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-40"
                :disabled="!escapeRoll[task.advId]"
                @click="applyEscape(task.advId, task.rank)"
              >
                Apply
              </button>
            </li>
          </ul>
        </template>

        <!-- Advancement -->
        <template v-else-if="step === 'advancement'">
          <p class="mb-2 text-xs opacity-60">
            Experience is earned per row of the track (p.80). Rows come from the recorded
            rank, since the boards' row layouts aren't transcribed — check it against the
            board if an Adventurer is close to a row boundary.
          </p>
          <ul class="space-y-1.5">
            <li
              v-for="task in advancement"
              :key="task.advId"
              class="flex flex-wrap items-center gap-2 rounded border border-neutral-800 px-2 py-1.5 text-xs"
            >
              <span>{{ task.displayName }}</span>
              <span v-if="task.row" class="opacity-50">row {{ task.row }}</span>
              <span v-if="task.blockedBy" class="opacity-60">{{ task.blockedBy }}</span>
              <button
                v-if="task.earnsExperience"
                class="ml-auto rounded border border-amber-600 px-2 py-0.5 text-amber-300"
                @click="awardXp(task.advId)"
              >
                +1 Experience
              </button>
              <RouterLink
                :to="`/c/${campaignId}/adventurer/${task.advId}`"
                class="ml-auto opacity-70 hover:underline"
              >
                Open sheet
              </RouterLink>
            </li>
          </ul>
        </template>

        <!-- Market -->
        <template v-else-if="step === 'market'">
          <p class="mb-2 text-xs opacity-60">
            Upkeep is 1 Guilder per rank, plus 1 for taking part in the last quest (p.83).
            Buying and selling happens at the table; record the Stash on the Camp tab.
          </p>
          <ul class="space-y-1 text-xs">
            <li
              v-for="line in market!.lines"
              :key="line.advId"
              class="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1"
            >
              <span>{{ line.displayName }}</span>
              <span v-if="line.playedLastQuest" class="opacity-50">played</span>
              <span class="ml-auto">
                <template v-if="line.cost !== null">{{ line.cost }}g</template>
                <span v-else class="text-amber-300">unknown — rank not recorded</span>
              </span>
            </li>
          </ul>
          <p class="mt-2 text-xs">
            Upkeep due:
            <strong>{{ market!.known }} Guilders</strong>
            <span v-if="!market!.exact" class="text-amber-300">
              at least — {{ market!.unknown.length }} unknown
            </span>
            · Stash {{ party.stash }}
          </p>
          <p v-if="market!.shortfall" class="mt-1 text-xs text-amber-300">
            {{ market!.shortfall }} Guilders short. Anyone you can't pay for leaves the party,
            losing their advancements (p.83).
          </p>
          <button
            class="mt-2 rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-40"
            :disabled="!market!.known"
            @click="payUpkeep"
          >
            Pay {{ market!.known }} Guilders upkeep
          </button>
        </template>

        <!-- Rest -->
        <template v-else>
          <p class="mb-2 text-xs opacity-60">
            Choose where the party spends the night (p.86), then roll the Magic Die on the
            table in the rulebook and apply the result yourself — those outcomes aren't
            transcribed.
          </p>
          <ul class="space-y-2">
            <li v-for="option in rest" :key="option.choice" class="rounded border border-neutral-800 p-2">
              <p class="text-sm capitalize">{{ option.choice }}</p>
              <p class="text-xs opacity-60">{{ option.note }}</p>
              <button
                class="mt-1 rounded border border-neutral-700 px-2 py-1 text-xs"
                @click="chooseRest(option.choice, option.cost, option.secureStorage)"
              >
                Choose {{ option.choice }}
              </button>
            </li>
          </ul>
        </template>
      </section>
    </template>
  </main>
</template>
