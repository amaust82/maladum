<script setup lang="ts">
import { loadBundledPacks, errorsOnly, describeIssue } from './content/loader'

const buildTime = new Date().toISOString()
const env = import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE

// Smoke check until Phase 1 screens exist: prove the bundled packs load in the
// browser build, and shout if any of them is broken.
const { library, issues } = loadBundledPacks()
const contentErrors = errorsOnly(issues).map(describeIssue)
</script>

<template>
  <main class="shell">
    <h1>Maladum</h1>
    <p class="tagline">Campaign Companion</p>
    <p class="status">Scaffold online. Deployment pipeline live.</p>
    <p class="meta">
      content: {{ library.packs.length }} packs ·
      {{ library.items.size }} items ·
      {{ library.recipes.size }} recipes ·
      {{ library.craftingResources.size }} resources
    </p>
    <ul v-if="contentErrors.length" class="errors">
      <li v-for="err in contentErrors" :key="err">{{ err }}</li>
    </ul>
    <p class="meta">env: {{ env }} · built {{ buildTime }}</p>
  </main>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.5rem;
}
h1 {
  font-size: 3rem;
  margin: 0;
  letter-spacing: 0.1em;
}
.tagline {
  margin: 0;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.9rem;
}
.status {
  margin-top: 1.5rem;
  font-weight: 600;
}
.meta {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  opacity: 0.55;
}
.errors {
  margin: 0;
  padding: 0;
  list-style: none;
  color: #ff6b6b;
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
}
</style>
