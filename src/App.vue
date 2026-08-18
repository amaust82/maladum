<script setup lang="ts">
/**
 * Root shell — routing lives in `router.ts`; every screen is a route component.
 *
 * The environment badge sits here rather than in the campaign shell so it shows on every
 * screen including the campaign picker, which is exactly where you'd pick the wrong site
 * to start a real campaign on.
 */
import EnvironmentBadge from './components/EnvironmentBadge.vue'
</script>

<template>
  <EnvironmentBadge />
  <RouterView />
</template>
