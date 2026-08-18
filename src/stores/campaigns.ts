/**
 * Campaign list + the currently open campaign, as app state (design.md §2.2).
 *
 * The store holds no game rules and no projection logic of its own — it drives
 * `campaignService` and exposes the resulting projection. Every mutation goes
 * through `commit`, so the event log stays the only way campaign state changes.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { db } from '../db/database'
import { requestPersistentStorage } from '../db/storage'
import {
  createCampaignService,
  exportCampaign,
  importCampaign,
  type CampaignSummary,
} from '../services/campaignService'
import type { CampaignEvent } from '../store/campaign/events'
import { emptyCampaign, type CampaignState } from '../store/campaign/projection'
import type { EventStore } from '../store/eventStore'
import { isCompatible, type ManifestIssue } from '../content/manifest'
import { useContentStore } from './content'

export const useCampaignStore = defineStore('campaigns', () => {
  const content = useContentStore()
  const service = createCampaignService({ db })

  const summaries = ref<CampaignSummary[]>([])
  const loading = ref(false)

  /** Non-reactive by design: the event store mutates internally and we re-read it. */
  const eventStore = shallowRef<EventStore<CampaignState, CampaignEvent> | null>(null)
  /** The open campaign's committed event log, oldest first — the Log tab's source. */
  const log = ref<CampaignEvent[]>([])
  const state = ref<CampaignState>(emptyCampaign())
  const manifestIssues = ref<ManifestIssue[]>([])
  const activeId = ref<string | null>(null)

  const compatible = computed(() => isCompatible(manifestIssues.value))
  const parties = computed(() => state.value.parties)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      summaries.value = await service.list(content.library)
    } finally {
      loading.value = false
    }
  }

  async function create(name: string): Promise<string> {
    // First campaign is the moment to ask for durable storage (design §2.1 caveat).
    void requestPersistentStorage()
    const id = await service.create({ name, library: content.library })
    await refresh()
    return id
  }

  async function duplicate(id: string, name?: string): Promise<string> {
    const copy = await service.duplicate(id, name)
    await refresh()
    return copy
  }

  async function remove(id: string): Promise<void> {
    await service.remove(id)
    if (activeId.value === id) close()
    await refresh()
  }

  async function rename(id: string, name: string): Promise<void> {
    await service.rename(id, name)
    if (activeId.value === id) await open(id)
    await refresh()
  }

  async function open(id: string): Promise<void> {
    const opened = await service.open(id, content.library)
    eventStore.value = opened.store
    manifestIssues.value = opened.manifestIssues
    state.value = opened.store.state
    log.value = opened.store.getEvents()
    activeId.value = id
  }

  function close(): void {
    eventStore.value = null
    state.value = emptyCampaign()
    log.value = []
    manifestIssues.value = []
    activeId.value = null
  }

  /** Append events to the open campaign and re-read the projection. */
  async function commit(events: CampaignEvent[]): Promise<void> {
    if (activeId.value === null) throw new Error('No campaign is open')
    state.value = await service.commit(activeId.value, events)
    // Keep the in-memory store (and its undo stack) in step with what was persisted.
    for (const event of events) eventStore.value?.append(event)
    // `eventStore` is a shallowRef and `append` mutates it in place, so the log is
    // republished explicitly rather than read through a computed that would never
    // re-evaluate. The Log tab renders from this.
    log.value = eventStore.value?.getEvents() ?? []
    await refresh()
  }

  /** Adopt the currently installed content packs, clearing a compatibility warning. */
  async function acceptContentPacks(reason?: string): Promise<void> {
    if (activeId.value === null) throw new Error('No campaign is open')
    await service.acceptContentPacks(activeId.value, content.library, reason)
    await open(activeId.value)
    await refresh()
  }

  async function exportToJson(id: string): Promise<string> {
    return exportCampaign(db, id)
  }

  async function importFromJson(json: string, asCopy?: { id: string; name: string }): Promise<string> {
    const id = await importCampaign(db, json, asCopy ? { asCopy } : {})
    await refresh()
    return id
  }

  return {
    summaries,
    loading,
    state,
    parties,
    activeId,
    manifestIssues,
    compatible,
    log,
    refresh,
    create,
    duplicate,
    remove,
    rename,
    open,
    close,
    commit,
    acceptContentPacks,
    exportToJson,
    importFromJson,
  }
})
