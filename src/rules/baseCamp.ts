/**
 * Base Camp board — pure functions, no I/O (design.md §3, §5; rulebook p.69, p.72, p.86).
 *
 * The Base Camp board is entirely dry-wipe: Stash, the Renown track, Storage and the
 * campaign notes all vanish with a wipe, which is exactly the loss this app exists to
 * insure against. So everything here is about recording and checking what the board says,
 * not about driving play.
 *
 * The one genuinely stateful rule is Secure Storage. It is a punch-out space that only
 * exists while the party is paying for an Inn (p.86): staying at an Inn punches it out,
 * camping in the wilderness fills it back in — and anything left in it then "must be
 * added to an Adventurer's inventory, sold, or discarded". That transition can strand
 * items, so it's worth catching before the player loses track of them.
 */

import type { StoredItem } from '../store/campaign/projection'

/** Renown cannot exceed 12 or drop below zero (p.72). */
export const RENOWN_MIN = 0
export const RENOWN_MAX = 12

/** Cost per Adventurer to stay at an Inn, which is what unlocks Secure Storage (p.86). */
export const INN_COST_PER_ADVENTURER = 2

export function clampRenown(value: number): number {
  return Math.min(RENOWN_MAX, Math.max(RENOWN_MIN, value))
}

/** What a night at the Inn costs this party (p.86). */
export function innCost(adventurerCount: number): number {
  return Math.max(0, adventurerCount) * INN_COST_PER_ADVENTURER
}

/**
 * The four windows in which Renown may be spent (p.72), as reference for the UI. The
 * app doesn't police *when* a spend happens — it can't see the table — so this exists to
 * tell the player what their Renown is for, not to gate anything.
 */
export const RENOWN_SPEND_WINDOWS = [
  { when: 'Start of a game', effect: 'Shuffle in one random Novice card per Renown spent' },
  { when: 'Before a Persuade roll', effect: 'Add one automatic hit per Renown spent' },
  { when: 'Market Phase', effect: 'Buy one item of any value per Renown spent (cost paid as normal)' },
  { when: 'Inn, in the Rest Phase', effect: 'One Renown per roll, to adjust it by up to 2 either way' },
] as const

export interface StorageSummary {
  /** Items in the open storage area. */
  open: StoredItem[]
  /** Items in the punch-out Secure Storage space. */
  secure: StoredItem[]
  /**
   * Items sitting in Secure Storage while the space is filled in — i.e. the party is no
   * longer paying for an Inn. The rules say these must be moved to an inventory, sold or
   * discarded (p.86), so they are stranded until the player resolves them.
   */
  stranded: StoredItem[]
  total: number
}

export function summarizeStorage(
  storage: StoredItem[],
  secureStorageUnlocked: boolean,
): StorageSummary {
  const open = storage.filter((s) => !s.secure)
  const secure = storage.filter((s) => s.secure)
  return {
    open,
    secure,
    stranded: secureStorageUnlocked ? [] : secure,
    total: storage.length,
  }
}

export interface CampIssue {
  severity: 'warning'
  kind: 'secure-storage-stranded' | 'renown-at-cap'
  message: string
}

/**
 * Things worth telling the player about the current board state. All warnings — the
 * board is theirs, and the app records rather than forbids.
 */
export function campIssues(input: {
  storage: StoredItem[]
  secureStorageUnlocked: boolean
  renown: number
}): CampIssue[] {
  const issues: CampIssue[] = []
  const { stranded } = summarizeStorage(input.storage, input.secureStorageUnlocked)
  if (stranded.length > 0) {
    issues.push({
      severity: 'warning',
      kind: 'secure-storage-stranded',
      message: `${stranded.length} item(s) are in Secure Storage but the space is filled in — they must go to an inventory, be sold, or be discarded (p.86)`,
    })
  }
  if (input.renown >= RENOWN_MAX) {
    issues.push({
      severity: 'warning',
      kind: 'renown-at-cap',
      message: `Renown is at its cap of ${RENOWN_MAX} — further gains are lost, so it's worth spending`,
    })
  }
  return issues
}
