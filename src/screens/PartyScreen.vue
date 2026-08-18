<script setup lang="ts">
/**
 * Party tab (design.md §5) — the roster the party builder produced. Each name links
 * through to that Adventurer's character sheet, which is where the durable record of
 * their board lives.
 */
import { computed } from 'vue'
import { useCampaignStore } from '../stores/campaigns'
import { useContentStore } from '../stores/content'
import ReadinessBadge from '../components/ReadinessBadge.vue'
import { adventurerReadiness, classReadiness } from '../content/readiness'

defineProps<{ campaignId: string }>()

const campaigns = useCampaignStore()
const content = useContentStore()

/** Re-attach the content each Adventurer was built from, so gaps stay visible on the roster. */
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
      <RouterLink
        :to="`/c/${campaignId}/party/new`"
        class="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium"
      >
        Build a party
      </RouterLink>
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
