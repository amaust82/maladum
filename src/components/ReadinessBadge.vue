<script setup lang="ts">
/**
 * How incomplete content looks on screen (see `content/readiness.ts` for why it
 * has to look like anything at all). Three grades, three colours, and the missing
 * field names spelled out — a board you can't fully trust never renders the same
 * as one you can.
 */
import { computed } from 'vue'
import { describeReadiness, type Readiness } from '../content/readiness'

const props = defineProps<{ readiness: Readiness }>()

const label = computed(() => describeReadiness(props.readiness))
const tone = computed(
  () =>
    ({
      ready: 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300',
      partial: 'border-amber-700/60 bg-amber-950/60 text-amber-300',
      placeholder: 'border-rose-800/60 bg-rose-950/60 text-rose-300',
    })[props.readiness.grade],
)
</script>

<template>
  <span
    class="inline-block rounded border px-1.5 py-0.5 text-[0.65rem] leading-tight font-medium"
    :class="tone"
    :title="readiness.verified ? `Verified: ${readiness.verified}` : undefined"
  >
    {{ label }}
  </span>
</template>
