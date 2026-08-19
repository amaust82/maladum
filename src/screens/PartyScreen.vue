<script setup lang="ts">
/**
 * Party tab (design.md §5) — the roster the party builder produced. Each name links
 * through to that Adventurer's character sheet, which is where the durable record of
 * their board lives.
 *
 * Also the home of the **party sheet export**: a Markdown snapshot of every board as it
 * stands right now. Under the between-sessions framing the app is insurance against a
 * wiped dry-wipe board, and insurance you can't get anything out of isn't worth much —
 * this is the copy you can print or paste somewhere the app isn't.
 */
import { computed, ref } from 'vue'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import ReadinessBadge from '../components/ReadinessBadge.vue'
import { adventurerReadiness, classReadiness } from '../content/readiness'
import { buildCharacterSheet } from '../rules/characterSheet'
import { partySheetMarkdown } from '../rules/partySheet'

defineProps<{ campaignId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()

/** Re-attach the content each Adventurer was built from, so gaps stay visible on the roster. */
const showSheet = ref(false)
const copied = ref(false)

/** The whole party as printable Markdown — the restore path for a wiped board. */
const partySheets = computed(() =>
  campaigns.parties.map((party) => ({
    id: party.id,
    markdown: partySheetMarkdown({
      party,
      sheets: party.adventurers.map((a) =>
        buildCharacterSheet({
          state: a,
          character: content.library.adventurers.get(a.characterId),
          klass: content.library.classes.get(a.classId),
          spellSchools: content.library.spells.values(),
          items: content.library.items,
          atCreation: party.quests.length === 0,
        }),
      ),
      itemName: (id) => content.library.items.get(id)?.name ?? id,
    }),
  })),
)

/** Parties are separated by a horizontal rule so one paste covers the whole campaign. */
const SHEET_SEPARATOR = `
---

`

const allMarkdown = computed(() =>
  partySheets.value.map((p) => p.markdown).join(SHEET_SEPARATOR),
)

async function copySheet() {
  try {
    await navigator.clipboard.writeText(allMarkdown.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard permission can be denied; the textarea is always selectable.
    copied.value = false
  }
}

const roster = computed(() =>
  campaigns.parties.map((party) => ({
    ...party,
    members: party.adventurers.map((a) => {
      const character = content.library.adventurers.get(a.characterId)
      const klass = content.library.classes.get(a.classId)
      return {
        ...a,
        characterName: character?.name ?? a.characterId,
        className: klass?.name ?? a.classId,
        characterReadiness: character ? adventurerReadiness(character) : null,
        classReadiness: klass ? classReadiness(klass) : null,
        maxXp: character?.stats?.xp.max ?? null,
      }
    }),
  })),
)
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-medium">Parties</h2>
      <div class="flex items-center gap-2">
        <button
          v-if="campaigns.parties.length"
          class="rounded border border-neutral-700 px-2 py-1.5 text-xs"
          @click="showSheet = !showSheet"
        >
          {{ showSheet ? 'Hide' : 'Party sheet' }}
        </button>
        <button
          v-if="showSheet"
          class="rounded border border-neutral-700 px-2 py-1.5 text-xs"
          @click="copySheet"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <RouterLink
          :to="`/c/${campaignId}/party/new`"
          class="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium"
        >
          Build a party
        </RouterLink>
      </div>
    </div>

    <div v-if="showSheet" class="mb-5">
      <p class="mb-1 text-xs opacity-60">
        Every board as it stands right now — print it, or keep it somewhere the app isn't.
        This is what you'd rebuild a wiped dashboard from.
      </p>
      <textarea
        :value="allMarkdown"
        readonly
        rows="14"
        class="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 font-mono text-xs text-neutral-100"
      />
    </div>

    <p v-if="!roster.length" class="text-sm opacity-60">
      No party yet. Build one to start the campaign.
    </p>

    <section v-for="party in roster" :key="party.id" class="mb-6">
      <h3 class="mb-2 text-sm uppercase tracking-wider opacity-60">
        {{ party.name }} · {{ party.stash }} Guilders · Renown {{ party.renown }}/12
      </h3>
      <ul class="space-y-2">
        <li
          v-for="m in party.members"
          :key="m.id"
          class="rounded border border-neutral-800 bg-neutral-900/60 p-3"
        >
          <div class="flex items-baseline justify-between gap-2">
            <RouterLink
              :to="`/c/${campaignId}/adventurer/${m.id}`"
              class="font-medium hover:underline"
            >
              {{ m.displayName }}
            </RouterLink>
            <span class="text-xs opacity-60">
              XP {{ m.xpFilled }}<template v-if="m.maxXp">/{{ m.maxXp }}</template>
            </span>
          </div>
          <p class="text-xs opacity-60">{{ m.characterName }} · {{ m.className }}</p>
          <div class="mt-2 flex flex-wrap gap-1">
            <ReadinessBadge v-if="m.characterReadiness" :readiness="m.characterReadiness" />
            <ReadinessBadge v-if="m.classReadiness" :readiness="m.classReadiness" />
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
