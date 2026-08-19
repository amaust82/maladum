<script setup lang="ts">
/**
 * Character sheet (design.md §5, Phase 1).
 *
 * This screen exists because the physical dashboard is dry-wipe and really does get
 * wiped between sessions. So its job is not to assist during play — it's to be the
 * durable copy of the board, and the bar it's built to is:
 *
 *   > Could you reconstruct every mark on a wiped dashboard from this screen alone?
 *
 * That drives two decisions the layout might otherwise hide:
 *
 * - **Every mark is directly editable, always.** Restoring a wiped board mid-campaign
 *   means typing in what was there; you can't replay six quests of deltas. Edits commit
 *   `*_SET` events, so the log stays a truthful record of what the board said and when.
 * - **Character-board and Class-board skill marks are shown as two separate inputs**,
 *   never one total. Class marks are capped at rank; character marks aren't and stack on
 *   top (p.80). Summing them would lose the distinction the rules depend on.
 *
 * Content-derived values (board grants, spell schools, skill caps) are read from the
 * packs on every render rather than stored, so a transcription fix reaches an existing
 * campaign instead of leaving a stale copy behind.
 */
import { computed, ref } from 'vue'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import { buildCharacterSheet } from '../rules/characterSheet'
import type { LevellableStat, SkillSource } from '../store/campaign/events'
import ItemPicker from '../components/ItemPicker.vue'

const props = defineProps<{ campaignId: string; advId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()

const located = computed(() => {
  for (const party of campaigns.parties) {
    const adventurer = party.adventurers.find((a) => a.id === props.advId)
    if (adventurer) return { party, adventurer }
  }
  return null
})

const sheet = computed(() => {
  const found = located.value
  if (!found) return null
  return buildCharacterSheet({
    state: found.adventurer,
    character: content.library.adventurers.get(found.adventurer.characterId),
    klass: content.library.classes.get(found.adventurer.classId),
    spellSchools: content.library.spells.values(),
    items: content.library.items,
  })
})

const boardNames = computed(() => {
  const found = located.value
  if (!found) return { character: '', class: '' }
  return {
    character: content.library.adventurers.get(found.adventurer.characterId)?.name ?? found.adventurer.characterId,
    class: content.library.classes.get(found.adventurer.classId)?.name ?? found.adventurer.classId,
  }
})

const num = (e: Event) => Number((e.target as HTMLInputElement).value)

const setXp = (filled: number) => campaigns.commit([{ t: 'XP_SET', advId: props.advId, filled }])
const setRank = (rank: number | null) =>
  campaigns.commit([{ t: 'RANK_SET', advId: props.advId, rank }])
const setMarks = (skill: string, source: SkillSource, marks: number) =>
  campaigns.commit([{ t: 'SKILL_MARKS_SET', advId: props.advId, skill, source, marks }])
const setStat = (stat: LevellableStat, increase: number) =>
  campaigns.commit([{ t: 'STAT_INCREASE_SET', advId: props.advId, stat, increase }])
const addItem = (itemId: string) =>
  campaigns.commit([{ t: 'ITEM_ACQUIRED', advId: props.advId, item: { itemId }, via: 'found' }])
const dropItem = (itemId: string, instanceId?: string) =>
  campaigns.commit([{ t: 'ITEM_REMOVED', advId: props.advId, item: { itemId, instanceId } }])
/**
 * Between missions the party owns its gear, not individual Adventurers (a thematic
 * call, not a transcribed rule — see STATUS.md) — this is that hand-off, one commit
 * so the item never appears to vanish between the two events.
 */
const moveToParty = (itemId: string, instanceId?: string) => {
  const partyId = located.value?.party.id
  if (!partyId) return
  campaigns.commit([
    { t: 'ITEM_REMOVED', advId: props.advId, item: { itemId, instanceId } },
    { t: 'ITEM_STORED', partyId, item: { itemId, instanceId }, secure: false },
  ])
}
const equip = (itemId: string, instanceId?: string) =>
  campaigns.commit([{ t: 'ARMOUR_EQUIPPED', advId: props.advId, item: { itemId, instanceId } }])
const unequip = (itemId: string, instanceId?: string) =>
  campaigns.commit([{ t: 'ARMOUR_REMOVED', advId: props.advId, item: { itemId, instanceId } }])
const setCovered = (grant: string, covered: boolean) =>
  campaigns.commit([{ t: 'GRANT_COVERED_SET', advId: props.advId, grant, covered }])

const itemName = (itemId: string) => content.library.items.get(itemId)?.name ?? itemId
const itemPickerOpen = ref(false)
function pickItem(itemId: string) {
  addItem(itemId)
}

const learn = (spell: string) =>
  campaigns.commit([{ t: 'SPELL_LEARNED', advId: props.advId, spell }])
const unlearn = (spell: string) =>
  campaigns.commit([{ t: 'SPELL_UNLEARNED', advId: props.advId, spell }])

/** Spells not already known, for the "learn" picker — grouped by school for scanning. */
const learnable = computed(() => {
  const known = new Set(sheet.value?.spells.map((s) => s.name) ?? [])
  const out: { school: string; level: number; name: string }[] = []
  for (const school of content.library.spells.values()) {
    for (const lvl of school.levels) {
      for (const spell of lvl.spells) {
        if (!known.has(spell.name)) out.push({ school: school.name, level: lvl.level, name: spell.name })
      }
    }
  }
  return out
})

const sourceLabel: Record<string, string> = {
  'character-board': 'character board',
  'class-board': 'Class board',
  learned: 'learned',
}
</script>

<template>
  <main v-if="sheet" class="mx-auto max-w-3xl px-4 py-6">
    <RouterLink :to="`/c/${campaignId}/party`" class="text-xs opacity-60 hover:underline">
      ← Party
    </RouterLink>
    <h2 class="mt-1 text-lg font-medium">{{ sheet.displayName }}</h2>
    <p class="text-xs opacity-60">
      {{ boardNames.character }} · {{ boardNames.class }}<template v-if="sheet.species"> · {{ sheet.species }}</template>
    </p>

    <ul v-if="sheet.issues.length" class="mt-4 space-y-1 rounded border border-amber-800 bg-amber-950/30 p-3 text-xs">
      <li v-for="(issue, i) in sheet.issues" :key="i" class="text-amber-200">{{ issue.message }}</li>
    </ul>

    <!-- Experience and rank -->
    <section class="mt-5 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 class="mb-2 text-sm font-medium">Experience</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs opacity-70">
          Spaces filled<template v-if="sheet.xpMax"> (of {{ sheet.xpMax }})</template>
          <input
            type="number"
            min="0"
            :value="sheet.xpFilled"
            class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            @change="setXp(num($event))"
          />
        </label>
        <label class="text-xs opacity-70">
          Rank
          <input
            type="number"
            min="1"
            max="5"
            :value="sheet.rank ?? ''"
            placeholder="not set"
            :disabled="sheet.rankIsDerived"
            class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-50"
            @change="setRank(num($event) || null)"
          />
          <span class="mt-1 block opacity-60">
            <template v-if="sheet.rankIsDerived">Derived from the Experience rows on this board.</template>
            <template v-else
              >This board's Experience row layout isn't transcribed, so rank can't be
              derived — read it off the board.</template
            >
          </span>
        </label>
      </div>
    </section>

    <!-- Statistics -->
    <section v-if="sheet.stats" class="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 class="mb-2 text-sm font-medium">Statistics</h3>
      <p class="mb-2 text-xs opacity-60">
        Board default plus permanent increases from levelling. Pegs during play aren't tracked
        here — the board does that for free.
      </p>
      <ul class="grid gap-2 sm:grid-cols-2">
        <li v-for="row in sheet.stats" :key="row.key" class="flex items-center gap-2 text-xs">
          <span class="w-16 capitalize opacity-70">{{ row.key }}</span>
          <span class="opacity-60">{{ row.base }}</span>
          <span class="opacity-40">+</span>
          <input
            type="number"
            min="0"
            :value="row.increase"
            class="w-14 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-neutral-100"
            @change="setStat(row.key, num($event))"
          />
          <span :class="row.atMax ? 'text-amber-300' : 'opacity-70'">
            = {{ row.current }} / {{ row.max }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Skills -->
    <section class="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 class="mb-1 text-sm font-medium">Skills</h3>
      <p class="mb-2 text-xs opacity-60">
        Two columns because the boards cap differently: Class marks stop at your rank,
        character-board marks don't and stack on top (p.80).
      </p>
      <table class="w-full text-xs">
        <thead class="opacity-50">
          <tr class="text-left">
            <th class="py-1 font-normal">Skill</th>
            <th class="w-24 font-normal">Character</th>
            <th class="w-24 font-normal">Class</th>
            <th class="w-20 font-normal">Level</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sheet.skills" :key="row.name" class="border-t border-neutral-800/60">
            <td class="py-1.5">
              {{ row.name }}
              <span v-if="!row.onClassBoard && !row.onCharacterBoard" class="opacity-50">
                (not on either board)
              </span>
            </td>
            <td>
              <input
                v-if="row.onCharacterBoard || row.marks.character"
                type="number"
                min="0"
                :max="row.characterCap ?? undefined"
                :value="row.marks.character"
                class="w-14 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-neutral-100"
                @change="setMarks(row.name, 'character', num($event))"
              />
              <span v-else class="opacity-30">—</span>
              <span v-if="row.characterCap" class="ml-1 opacity-40">/{{ row.characterCap }}</span>
            </td>
            <td>
              <input
                v-if="row.onClassBoard || row.marks.class"
                type="number"
                min="0"
                :value="row.marks.class"
                class="w-14 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-neutral-100"
                @change="setMarks(row.name, 'class', num($event))"
              />
              <span v-else class="opacity-30">—</span>
              <span v-if="row.classCap" class="ml-1 opacity-40">/{{ row.classCap }}</span>
            </td>
            <td class="font-medium">
              {{ row.level }}
              <span v-if="row.marksTotal > row.level" class="opacity-50">({{ row.marksTotal }} marked)</span>
              <span v-if="row.coveredByArmour" class="ml-1 text-amber-300" title="Covered by armour">▲</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Spells -->
    <section class="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 class="mb-1 text-sm font-medium">Spells</h3>
      <p class="mb-2 text-xs opacity-60">
        Board-granted spells are read from the boards, so only the ones you marked on the
        spell track are recorded here.
      </p>
      <ul class="space-y-1">
        <li
          v-for="spell in sheet.spells"
          :key="spell.source + spell.name"
          class="flex items-center gap-2 text-xs"
        >
          <span>{{ spell.name }}</span>
          <span v-if="spell.school" class="opacity-50">
            {{ spell.school }}<template v-if="spell.level"> L{{ spell.level }}</template>
          </span>
          <span class="rounded border border-neutral-700 px-1 opacity-60">
            {{ sourceLabel[spell.source] }}
          </span>
          <span v-if="spell.overRank" class="text-amber-300">above rank</span>
          <button
            v-if="spell.source === 'learned'"
            class="ml-auto text-rose-400 hover:underline"
            @click="unlearn(spell.name)"
          >
            Remove
          </button>
        </li>
      </ul>
      <label class="mt-3 block text-xs opacity-70">
        Learn a spell
        <select
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
          @change="learn(($event.target as HTMLSelectElement).value)"
        >
          <option value="">— choose —</option>
          <option v-for="s in learnable" :key="s.name" :value="s.name">
            {{ s.name }} — {{ s.school }} L{{ s.level }}
          </option>
        </select>
      </label>
    </section>

    <!-- Inventory -->
    <section class="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 class="mb-1 text-sm font-medium">Inventory</h3>
      <p class="mb-2 text-xs opacity-60">
        {{ sheet.carried.total }} item(s), {{ sheet.carried.sized }} spaces used<template
          v-if="sheet.carried.unsized"
        >
          · {{ sheet.carried.unsized }} with no transcribed size</template
        >. Capacity is the physical tray, so it isn't checked here — the rulebook's limit is
        what actually fits.
      </p>
      <ul class="space-y-1 text-xs">
        <li
          v-for="(ref_, i) in sheet.inventory"
          :key="'inv' + i"
          class="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1"
        >
          <span>{{ itemName(ref_.itemId) }}</span>
          <button class="ml-auto opacity-70 hover:underline" @click="equip(ref_.itemId, ref_.instanceId)">
            To armour slot
          </button>
          <button class="opacity-70 hover:underline" @click="moveToParty(ref_.itemId, ref_.instanceId)">
            Move to party
          </button>
          <button class="text-rose-400 hover:underline" @click="dropItem(ref_.itemId, ref_.instanceId)">
            Remove
          </button>
        </li>
      </ul>
      <p v-if="!sheet.inventory.length" class="text-xs opacity-50">Carrying nothing.</p>
      <button
        class="mt-2 rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
        @click="itemPickerOpen = true"
      >
        + Add item…
      </button>
      <ItemPicker :open="itemPickerOpen" @select="pickItem" @close="itemPickerOpen = false" />
    </section>

    <!-- Armour slots -->
    <section class="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 class="mb-1 text-sm font-medium">
        Armour slots
        <span v-if="sheet.armourSlots !== null" class="opacity-50">
          ({{ sheet.armour.length }}/{{ sheet.armourSlots }})
        </span>
      </h3>
      <p class="mb-2 text-xs opacity-60">
        Armour's rules only apply while it's in a slot (p.6). Slots are punched out of the
        board, so anything printed there is covered — tick it below when that happens.
      </p>
      <ul class="space-y-1 text-xs">
        <li
          v-for="(ref_, i) in sheet.armour"
          :key="'arm' + i"
          class="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1"
        >
          <span>{{ itemName(ref_.itemId) }}</span>
          <button class="ml-auto opacity-70 hover:underline" @click="unequip(ref_.itemId, ref_.instanceId)">
            Back to inventory
          </button>
        </li>
      </ul>
      <p v-if="!sheet.armour.length" class="text-xs opacity-50">Slots empty.</p>
    </section>

    <!-- Board grants -->
    <section v-if="sheet.grants.length" class="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 class="mb-1 text-sm font-medium">Granted by the boards</h3>
      <p class="mb-2 text-xs opacity-60">
        These come with the boards. The ones printed in an armour slot can be covered by
        wearing armour there — tick those, since only you can see which side you covered.
      </p>
      <ul class="space-y-1">
        <li
          v-for="(grant, i) in sheet.grants"
          :key="i"
          class="flex items-center gap-2 text-xs"
          :class="grant.covered ? 'opacity-50' : ''"
        >
          <span :class="grant.covered ? 'line-through' : ''">
            {{ grant.label }}<span v-if="grant.detail" class="opacity-60"> {{ grant.detail }}</span>
          </span>
          <span class="opacity-40">{{ grant.from }}</span>
          <label v-if="grant.onArmourSlot" class="ml-auto flex items-center gap-1 opacity-70">
            <input
              type="checkbox"
              :checked="grant.covered"
              @change="setCovered(grant.label, ($event.target as HTMLInputElement).checked)"
            />
            covered by armour
          </label>
        </li>
      </ul>
    </section>
  </main>

  <main v-else class="mx-auto max-w-3xl px-4 py-6">
    <p class="text-sm opacity-70">No Adventurer with that id in this campaign.</p>
    <RouterLink :to="`/c/${campaignId}/party`" class="text-xs hover:underline">← Party</RouterLink>
  </main>
</template>
