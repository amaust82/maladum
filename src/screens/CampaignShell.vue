<script setup lang="ts">
/**
 * The open-campaign frame: header, content-compatibility banner, and the bottom
 * tab bar from design.md §5. Two of the five tabs are placeholders until their
 * phases land — they are shown disabled rather than hidden so the shape of the
 * finished app is visible.
 */
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCampaignStore } from '../stores/campaigns'
import { describeManifestIssue } from '../content/manifest'

const props = defineProps<{ campaignId: string }>()
const campaigns = useCampaignStore()
const route = useRoute()

const load = () => campaigns.open(props.campaignId)
onMounted(load)
watch(() => props.campaignId, load)

const tabs = [
  { label: 'Party', to: 'party', enabled: true },
  { label: 'Camp', to: 'camp', enabled: true },
  { label: 'Play', to: 'play', enabled: false },
  { label: 'Log', to: 'log', enabled: false },
  { label: 'Rules', to: 'rules', enabled: true },
]

const isActive = (to: string) => route.path.startsWith(`/c/${props.campaignId}/${to}`)
</script>

<template>
  <div class="min-h-screen pb-20">
    <header class="border-b border-neutral-800 px-4 py-3">
      <RouterLink to="/" class="text-xs opacity-60 hover:underline">← Campaigns</RouterLink>
      <h1 class="text-xl font-medium">{{ campaigns.state.name || '…' }}</h1>
    </header>

    <section
      v-if="campaigns.manifestIssues.length"
      class="border-b px-4 py-3 text-xs"
      :class="campaigns.compatible ? 'border-amber-800 bg-amber-950/40' : 'border-rose-800 bg-rose-950/40'"
    >
      <p class="mb-1 font-medium">
        {{ campaigns.compatible ? 'Content has changed since this campaign started' : 'Content is missing or incompatible' }}
      </p>
      <ul class="space-y-0.5 opacity-90">
        <li v-for="issue in campaigns.manifestIssues" :key="issue.kind + issue.packId">
          {{ describeManifestIssue(issue) }}
        </li>
      </ul>
      <button
        class="mt-2 rounded border border-current px-2 py-1 hover:bg-white/5"
        @click="campaigns.acceptContentPacks('accepted from the campaign screen')"
      >
        Use the installed content from here on
      </button>
    </section>

    <RouterView />

    <nav class="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-neutral-800 bg-neutral-950">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.enabled ? `/c/${campaignId}/${tab.to}` : ''"
        class="py-3 text-center text-xs"
        :class="[
          tab.enabled ? 'hover:bg-neutral-900' : 'pointer-events-none opacity-30',
          isActive(tab.to) ? 'text-amber-400' : 'opacity-70',
        ]"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
  </div>
</template>
