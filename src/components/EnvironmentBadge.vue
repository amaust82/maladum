<script setup lang="ts">
/**
 * Marks any deployment that isn't production.
 *
 * This exists because the app is **local-first**: IndexedDB is scoped per origin, so
 * `stage-maladum.bgbutler.com` and `maladum.bgbutler.com` hold entirely separate
 * databases. Recording a real session against the wrong one doesn't just misplace it —
 * the data never appears on the other site without a manual export/import. The badge is
 * what stops that happening by accident.
 *
 * **It deliberately fails loud, not quiet.** The check is `VITE_APP_ENV === 'production'`
 * exactly, with no fallback to Vite's `MODE`: `vite build` sets `MODE=production` for
 * every build including staging's, so falling back to it would *hide* the badge on a
 * staging deploy whose env var went missing — silence in precisely the dangerous
 * direction. An unset variable therefore shows a badge saying so, and the worst case is
 * a harmless marker on production rather than an unmarked staging site.
 *
 * A restored regression: the original badge (commit 8944bba) was dropped when `App.vue`
 * became a bare router shell in Phase 1.
 */
const raw = import.meta.env.VITE_APP_ENV as string | undefined
/** Blank and whitespace count as unset — a var that exists but says nothing is not a name. */
const declared = raw?.trim() ? raw.trim() : undefined

/** Production is the only state that renders nothing. Everything else is flagged. */
const isProduction = declared === 'production'

const label = declared ?? `${import.meta.env.MODE} · VITE_APP_ENV unset`
</script>

<template>
  <div
    v-if="!isProduction"
    class="pointer-events-none fixed right-2 top-2 z-50 rounded border border-amber-500/70 bg-amber-950/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-200 shadow"
    :title="`This is not production. Campaign data here is stored separately from the live site and will not appear there.`"
  >
    {{ label }}
  </div>
</template>
