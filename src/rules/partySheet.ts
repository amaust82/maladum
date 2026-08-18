/**
 * Party sheet export — pure functions, no I/O (design.md §5).
 *
 * Renders the *current state* of a party as Markdown: every board, every mark, the Base
 * Camp board. Where the campaign log answers "how did we get here", this answers "what
 * do the boards say right now" — which is the one you need when a dry-wipe board has been
 * wiped and you're rebuilding it.
 *
 * That makes this the app's restore path, so two properties matter more than prettiness:
 *
 * - **Completeness over brevity.** Anything you'd have to re-derive by hand is printed,
 *   including the marks-per-board split that the rules depend on (p.80).
 * - **Gaps stay visible.** An unknown rank prints as "not recorded", never as 1. The whole
 *   point of the honest-gap rule is that it survives to the paper copy too.
 */

import type { PartyState } from '../store/campaign/projection'
import type { CharacterSheet } from './characterSheet'
import { summarizeStorage } from './baseCamp'

export interface PartySheetInput {
  party: PartyState
  /** One built sheet per Adventurer, in roster order. */
  sheets: CharacterSheet[]
  /** Resolve an item id to its printed name. */
  itemName?: (itemId: string) => string
}

const line = (label: string, value: string | number) => `- **${label}:** ${value}`

function statLine(sheet: CharacterSheet): string {
  if (!sheet.stats) return line('Statistics', 'not transcribed for this board')
  const parts = sheet.stats.map(
    (s) => `${s.key} ${s.current}/${s.max}${s.increase ? ` (${s.base}+${s.increase})` : ''}`,
  )
  return line('Statistics', parts.join(' · '))
}

function skillLines(sheet: CharacterSheet): string[] {
  const marked = sheet.skills.filter((s) => s.marks.character > 0 || s.marks.class > 0)
  if (marked.length === 0) return ['- **Skills:** none marked']
  return [
    '- **Skills** (character + Class marks, kept apart — they cap differently):',
    ...marked.map((s) => {
      const bits = [
        s.marks.character ? `character ${s.marks.character}` : null,
        s.marks.class ? `Class ${s.marks.class}` : null,
      ].filter(Boolean)
      const covered = s.coveredByArmour ? ', covered by armour' : ''
      const capped = s.marksTotal > s.level ? `, capped from ${s.marksTotal}` : ''
      return `  - ${s.name} — level ${s.level} (${bits.join(' + ')}${capped}${covered})`
    }),
  ]
}

function spellLines(sheet: CharacterSheet): string[] {
  if (sheet.spells.length === 0) return ['- **Spells:** none']
  return [
    '- **Spells:**',
    ...sheet.spells.map((s) => {
      const where = s.school ? `${s.school} L${s.level ?? '?'}` : 'unknown school'
      return `  - ${s.name} — ${where}, ${s.source.replace('-', ' ')}`
    }),
  ]
}

/**
 * Render one party as a self-contained Markdown sheet.
 *
 * `sheets` is passed in already built rather than composed here, so this stays a pure
 * formatter and the caller keeps ownership of content lookup.
 */
export function partySheetMarkdown(input: PartySheetInput): string {
  const { party, sheets } = input
  const item = (id: string) => input.itemName?.(id) ?? id
  const storage = summarizeStorage(party.storage, party.secureStorageUnlocked)

  const out: string[] = [`# ${party.name}`, '']

  out.push('## Base Camp', '')
  out.push(line('Stash', `${party.stash} Guilders`))
  out.push(line('Renown', `${party.renown}/12`))
  out.push(
    line(
      'Secure Storage',
      party.secureStorageUnlocked ? 'punched out (paying for an Inn)' : 'filled in',
    ),
  )
  if (storage.total > 0) {
    out.push('- **Storage:**')
    for (const entry of party.storage) {
      const flags = [
        entry.secure ? 'secure' : null,
        entry.secure && !party.secureStorageUnlocked ? '**stranded**' : null,
      ].filter(Boolean)
      out.push(`  - ${item(entry.item.itemId)}${flags.length ? ` (${flags.join(', ')})` : ''}`)
    }
  } else {
    out.push(line('Storage', 'empty'))
  }
  if (party.notes.trim()) {
    out.push('', '### Campaign notes', '', party.notes.trim())
  }

  for (const sheet of sheets) {
    out.push('', `## ${sheet.displayName}`, '')
    if (sheet.species) out.push(line('Species', sheet.species))
    out.push(line('Rank', sheet.rank === null ? 'not recorded' : String(sheet.rank)))
    out.push(
      line(
        'Experience',
        `${sheet.xpFilled}${sheet.xpMax ? ` / ${sheet.xpMax}` : ''} spaces filled`,
      ),
    )
    out.push(statLine(sheet))
    out.push(...skillLines(sheet))
    out.push(...spellLines(sheet))

    if (sheet.grants.length > 0) {
      out.push('- **Granted by the boards:**')
      for (const grant of sheet.grants) {
        const detail = grant.detail ? ` ${grant.detail}` : ''
        const covered = grant.covered ? ' — covered by armour' : ''
        out.push(`  - ${grant.label}${detail} (${grant.from} board)${covered}`)
      }
    }

    const carried = sheet.inventory.map((i) => item(i.itemId))
    out.push(line('Inventory', carried.length ? carried.join(', ') : 'empty'))
    const worn = sheet.armour.map((i) => item(i.itemId))
    out.push(
      line(
        'Armour slots',
        `${worn.length ? worn.join(', ') : 'empty'}${sheet.armourSlots !== null ? ` (of ${sheet.armourSlots})` : ''}`,
      ),
    )
  }

  if (party.quests.length > 0) {
    out.push('', '## Quests played', '')
    party.quests.forEach((q, i) => {
      const rewards = [
        q.renownGained ? `${q.renownGained} Renown` : null,
        q.guildersGained ? `${q.guildersGained} Guilders` : null,
      ].filter(Boolean)
      out.push(
        `${i + 1}. ${q.name} — ${q.outcome.replace('-', ' ')}${rewards.length ? ` (${rewards.join(', ')})` : ''}`,
      )
    })
  }

  return `${out.join('\n').trim()}\n`
}
