/**
 * Campaign chronicle — pure functions, no I/O (design.md §5, Log tab).
 *
 * Turns the raw event log into a readable timeline. This is the feature the
 * event-sourced store was chosen for (design §2.3): "why does Syrio have 4 Health?" is
 * answerable by scrolling the log, and the party's saga falls out of the same data with
 * no extra model.
 *
 * Three things worth knowing about how it's built:
 *
 * - **Names come from the log, not the content packs.** An `ADVENTURER_ADDED` event
 *   carries its own `displayName`, so the chronicle stays readable even for a campaign
 *   whose packs are missing or have moved on. Item names take an optional resolver and
 *   fall back to the raw id rather than rendering nothing.
 * - **Order is log position, not timestamps.** Only a few events carry an `at` (the
 *   per-row insert time isn't loaded back), so entries are sequenced by position — which
 *   is chronological by construction — and a date is shown only where the event has one.
 * - **Unknown events are never silently dropped.** A new event type nobody has written a
 *   sentence for still appears, labelled with its type. A log that quietly omits things
 *   is worse than one that reads awkwardly.
 */

import type { CampaignEvent, QuestOutcome } from '../store/campaign/events'
import type { PartyState } from '../store/campaign/projection'

export interface ChronicleEntry {
  /** Position in the log, oldest = 0. Stable regardless of display order. */
  seq: number
  /** The event's discriminator, for filtering and styling. */
  kind: CampaignEvent['t']
  text: string
  /** The Adventurer this entry concerns, when it concerns one. */
  advId?: string
  partyId?: string
  /** Only present on events that carry their own timestamp. */
  at?: number
  /** Quest number this entry falls under — 0 before the first quest was recorded. */
  chapter: number
}

export interface ChronicleContext {
  /** Resolve an item id to its name; falls back to the id when absent. */
  itemName?: (itemId: string) => string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Shared with `storySoFar` below, so the two views never disagree on wording. */
export const outcomeLabel = (outcome: QuestOutcome): string =>
  outcome === 'primary-complete'
    ? 'primary objective completed'
    : outcome === 'partial'
      ? 'partly completed'
      : 'failed'

/**
 * Build the chronicle. Returns entries **oldest first** — the screen reverses for
 * display, but keeping the natural order here makes `seq` and `chapter` obvious.
 */
export function buildChronicle(
  events: CampaignEvent[],
  ctx: ChronicleContext = {},
): ChronicleEntry[] {
  const names = new Map<string, string>()
  const item = (id: string) => ctx.itemName?.(id) ?? id
  const who = (advId: string) => names.get(advId) ?? advId
  let chapter = 0

  const entries: ChronicleEntry[] = []
  events.forEach((event, seq) => {
    // Learn names as they appear, so later entries can use them.
    if (event.t === 'ADVENTURER_ADDED') names.set(event.advId, event.displayName)

    const base = { seq, kind: event.t, chapter }
    const push = (text: string, extra: Partial<ChronicleEntry> = {}) =>
      entries.push({ ...base, text, ...extra })

    switch (event.t) {
      case 'CAMPAIGN_CREATED':
        push(`Campaign "${event.name}" begun`, { at: event.createdAt })
        break
      case 'CAMPAIGN_RENAMED':
        push(`Campaign renamed to "${event.name}"`)
        break
      case 'CONTENT_PACKS_CHANGED':
        push(
          `Content packs changed to ${event.contentPacks.map((p) => `${p.name} v${p.version}`).join(', ')}${event.reason ? ` — ${event.reason}` : ''}`,
          { at: event.at },
        )
        break
      case 'PARTY_ADDED':
        push(`Party "${event.name}" formed`, { partyId: event.partyId })
        break
      case 'ADVENTURER_ADDED':
        push(`${event.displayName} joined the party`, {
          advId: event.advId,
          partyId: event.partyId,
        })
        break
      case 'ADVENTURER_REMOVED':
        push(`${who(event.advId)} left the party`, { advId: event.advId, partyId: event.partyId })
        break
      case 'QUEST_RECORDED': {
        chapter += 1
        const outcome = outcomeLabel(event.outcome)
        const rewards = [
          // Renown is uncountable — "2 Renowns" reads wrong.
          event.renownGained ? `${event.renownGained} Renown` : null,
          event.guildersGained ? `${plural(event.guildersGained, 'Guilder')}` : null,
        ].filter(Boolean)
        entries.push({
          seq,
          kind: event.t,
          chapter,
          partyId: event.partyId,
          at: event.at,
          text: `Quest ${chapter}: "${event.name}" — ${outcome}${rewards.length ? ` (${rewards.join(', ')})` : ''}`,
        })
        break
      }
      case 'ESCAPE_RESOLVED': {
        const fate = event.consequence.replace(/-/g, ' ')
        const extras = [
          event.equipmentLost ? 'all equipment lost' : null,
          event.questsMissed ? `misses ${plural(event.questsMissed, 'quest')}` : null,
        ].filter(Boolean)
        push(
          `${who(event.advId)} was left behind — rolled ${event.roll}, ${fate}${extras.length ? ` (${extras.join(', ')})` : ''}`,
          { advId: event.advId },
        )
        break
      }
      case 'ALIVE_SET':
        push(`${who(event.advId)} ${event.alive ? 'returned to the party' : 'died'}`, {
          advId: event.advId,
        })
        break
      case 'ABSENCE_SET':
        push(
          event.quests > 0
            ? `${who(event.advId)} will miss ${plural(event.quests, 'quest')}`
            : `${who(event.advId)} is fit to fight again`,
          { advId: event.advId },
        )
        break
      case 'XP_GAINED':
        push(`${who(event.advId)} gained ${plural(event.amount, 'Experience')} (${event.reason})`, {
          advId: event.advId,
        })
        break
      case 'XP_SET':
        push(`${who(event.advId)}'s Experience set to ${event.filled}`, { advId: event.advId })
        break
      case 'SKILL_MARKS_SET':
        push(
          `${who(event.advId)} marked ${event.skill} to ${event.marks} on the ${event.source} board`,
          { advId: event.advId },
        )
        break
      case 'SPELL_LEARNED':
        push(`${who(event.advId)} learned ${event.spell}`, { advId: event.advId })
        break
      case 'SPELL_UNLEARNED':
        push(`${who(event.advId)} unlearned ${event.spell}`, { advId: event.advId })
        break
      case 'STAT_INCREASE_SET':
        push(`${who(event.advId)}'s ${event.stat} increased by ${event.increase}`, {
          advId: event.advId,
        })
        break
      case 'RANK_SET':
        push(
          event.rank === null
            ? `${who(event.advId)}'s rank cleared`
            : `${who(event.advId)} is rank ${event.rank}`,
          { advId: event.advId },
        )
        break
      case 'ITEM_ACQUIRED':
        push(`${who(event.advId)} acquired ${item(event.item.itemId)} (${event.via})`, {
          advId: event.advId,
        })
        break
      case 'ITEM_REMOVED':
        push(`${who(event.advId)} gave up ${item(event.item.itemId)}`, { advId: event.advId })
        break
      case 'ARMOUR_EQUIPPED':
        push(`${who(event.advId)} donned ${item(event.item.itemId)}`, { advId: event.advId })
        break
      case 'ARMOUR_REMOVED':
        push(`${who(event.advId)} removed ${item(event.item.itemId)}`, { advId: event.advId })
        break
      case 'GRANT_COVERED_SET':
        push(
          `${who(event.advId)}'s ${event.grant} ${event.covered ? 'covered by armour' : 'uncovered'}`,
          { advId: event.advId },
        )
        break
      case 'RENOWN_CHANGED':
        push(
          `Renown ${event.amount >= 0 ? '+' : ''}${event.amount} (${event.source})`,
          { partyId: event.partyId },
        )
        break
      case 'RENOWN_SET':
        push(`Renown set to ${event.amount}`, { partyId: event.partyId })
        break
      case 'STASH_CHANGED':
        push(
          `Stash ${event.amount >= 0 ? '+' : ''}${event.amount} Guilders${event.reason ? ` (${event.reason})` : ''}`,
          { partyId: event.partyId },
        )
        break
      case 'STASH_SET':
        push(
          `Stash set to ${event.amount} Guilders${event.reason ? ` (${event.reason})` : ''}`,
          { partyId: event.partyId },
        )
        break
      case 'ITEM_STORED':
        push(
          `${item(event.item.itemId)} put into ${event.secure ? 'Secure Storage' : 'storage'}`,
          { partyId: event.partyId },
        )
        break
      case 'ITEM_UNSTORED':
        push(`${item(event.item.itemId)} taken out of storage`, { partyId: event.partyId })
        break
      case 'SECURE_STORAGE_SET':
        push(
          event.unlocked
            ? 'Secure Storage punched out — the party paid for an Inn'
            : 'Secure Storage filled back in',
          { partyId: event.partyId },
        )
        break
      case 'CAMP_NOTES_SET':
        push('Campaign notes updated', { partyId: event.partyId })
        break
      default: {
        // No sentence written for this type yet. Show it rather than dropping it —
        // a chronicle that silently omits events is worse than one that reads oddly.
        const unknown = event as { t: string }
        entries.push({ seq, kind: unknown.t as CampaignEvent['t'], chapter, text: unknown.t })
      }
    }
  })

  return entries
}

/** Entries concerning one Adventurer — "show me everything Syrio has ever done". */
export function filterByAdventurer(entries: ChronicleEntry[], advId: string): ChronicleEntry[] {
  return entries.filter((e) => e.advId === advId)
}

export interface StoryEntry {
  /** 1-based, in play order — the same numbering the full chronicle's chapters use. */
  chapter: number
  name: string
  outcome: QuestOutcome
  outcomeLabel: string
  at: number
  renownGained: number
  guildersGained: number
}

/**
 * One line per quest — "which quests were done and what happened," distinct from the
 * full chronicle's every-event detail. Adam, 2026-08-20: the Log tab's full timeline
 * is "almost too detailed" for a quick recap; this reads straight off `PartyState.quests`
 * (already collected at the end of each Campaign Phase wizard run), so it needs no new
 * event type or state — just a shorter way of looking at what's already there.
 */
export function storySoFar(party: PartyState): StoryEntry[] {
  return party.quests.map((q, i) => ({
    chapter: i + 1,
    name: q.name,
    outcome: q.outcome,
    outcomeLabel: outcomeLabel(q.outcome),
    at: q.at,
    renownGained: q.renownGained,
    guildersGained: q.guildersGained,
  }))
}

/**
 * Render the chronicle as Markdown, newest last so it reads as a story.
 *
 * This is also the app's plain-text escape hatch: if the app is the only surviving copy
 * of a wiped board, this is what you can print, paste or keep.
 */
export function chronicleToMarkdown(campaignName: string, entries: ChronicleEntry[]): string {
  const lines = [`# ${campaignName || 'Campaign'}`, '']
  let chapter = -1
  for (const entry of entries) {
    if (entry.chapter !== chapter) {
      chapter = entry.chapter
      lines.push('', chapter === 0 ? '## Before the first quest' : `## Quest ${chapter}`, '')
    }
    lines.push(`- ${entry.text}`)
  }
  return `${lines.join('\n').trim()}\n`
}
