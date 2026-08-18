/**
 * Loaded content library, as app state (design.md §2.2 — `contentService`).
 *
 * Packs are bundled at build time and loading is synchronous, so this store is
 * effectively a memoized `loadBundledPacks()` plus the derived pickers the party
 * builder needs. It also owns the one piece of *user* preference about content:
 * whether placeholder entries are shown at all.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { describeIssue, errorsOnly, loadBundledPacks } from '../content/loader'
import { manifestFrom } from '../content/manifest'
import { adventurerOptions, classOptions } from '../services/partyService'
import { isSelectable } from '../content/readiness'

export const useContentStore = defineStore('content', () => {
  const { library, issues } = loadBundledPacks()

  /**
   * Opt-in switch for the structural stand-ins in `content/core.json`. Off by
   * default: placeholder boards are fake data, and a party built from them would
   * look exactly like a real one on every later screen.
   */
  const showPlaceholders = ref(false)

  const loadErrors = computed(() => errorsOnly(issues).map(describeIssue))
  const loadWarnings = computed(() =>
    issues.filter((i) => i.severity === 'warning').map(describeIssue),
  )

  const allAdventurers = computed(() => adventurerOptions(library))
  const allClasses = computed(() => classOptions(library))

  const adventurers = computed(() =>
    allAdventurers.value.filter((o) => isSelectable(o.readiness, showPlaceholders.value)),
  )
  const classes = computed(() =>
    allClasses.value.filter((o) => isSelectable(o.readiness, showPlaceholders.value)),
  )

  /**
   * Selectable boards that aren't fully transcribed. Distinct from `hiddenCount`:
   * these are usable and shown, they just have gaps the player should know about.
   */
  const unverifiedCount = computed(
    () =>
      adventurers.value.filter((o) => o.readiness.grade !== 'ready').length +
      classes.value.filter((o) => o.readiness.grade !== 'ready').length,
  )

  /** How many boards are hidden right now — shown next to the toggle so the gap is visible. */
  const hiddenCount = computed(
    () =>
      allAdventurers.value.length -
      adventurers.value.length +
      (allClasses.value.length - classes.value.length),
  )

  const manifest = computed(() => manifestFrom(library))

  return {
    library,
    issues,
    loadErrors,
    loadWarnings,
    showPlaceholders,
    allAdventurers,
    allClasses,
    adventurers,
    classes,
    hiddenCount,
    unverifiedCount,
    manifest,
  }
})
