/**
 * Durable-storage request (design.md §2.1 persistence caveat).
 *
 * Browser-managed IndexedDB can be evicted under storage pressure, especially on
 * iOS. Asking for persistent storage on first campaign creation reduces that risk;
 * it's not a guarantee, so the app still nags for exports after each quest (§7).
 */

/** Request persistent storage. Returns whether storage is now persisted. Safe to call anywhere. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  if (navigator.storage.persisted && (await navigator.storage.persisted())) return true
  return navigator.storage.persist()
}

/** Best-effort read of how much of the storage quota is in use (for an export nag / diagnostics). */
export async function storageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  return navigator.storage.estimate()
}
