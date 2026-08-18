/**
 * Character sheet composition — pure functions, no I/O (design.md §5; rulebook p.80–81).
 *
 * Turns "what the boards say" (content pack) plus "what the player marked" (campaign
 * state) into the sheet the screen renders. The app's role here is to be a **durable
 * copy of a dry-wipe board**, so the bar this module is built to is:
 *
 *   > Could you reconstruct every mark on a wiped dashboard from this alone?
 *
 * Three rules do most of the work, and all three are easy to get subtly wrong:
 *
 * 1. **Class-board and character-board skill marks never merge into one number.**
 *    Class marks are capped at the Adventurer's rank; character-board marks are exempt
 *    and stack on top, "even if the total exceeds your character's rank" (p.80).
 * 2. **Board grants are derived, never stored.** A spell or skill the boards hand out is
 *    a function of `characterId` + `classId`, so storing it would duplicate the content
 *    pack and could drift from it after a transcription fix. Only player choices persist.
 * 3. **Rank gates what may be marked**, and rank comes from Experience *rows* — which
 *    aren't transcribed yet (`AdventurerDef.xpRows`). Where rows are unknown the sheet
 *    uses the rank the player recorded, and says the caps are unverified rather than
 *    inventing them.
 */

import type { AdventurerDef, ClassDef, SkillCategoryDef, SpellSchoolDef } from '../content/schema'
import type { AdventurerState, SkillMarks } from '../store/campaign/projection'
import type { LevellableStat } from '../store/campaign/events'
import { rankFromXp } from './advancement'

/** Default cap on a Class-board skill when the board doesn't print an override. */
export const DEFAULT_SKILL_LEVEL_CAP = 3

export interface StatRow {
  key: LevellableStat
  /** Filled by default on the board. */
  base: number
  /** Permanent increases the player has marked from levelling. */
  increase: number
  /** base + increase — the value they start a game with. */
  current: number
  /** The board's potential ceiling. */
  max: number
  /** True when no further increase can be marked (p.81). */
  atMax: boolean
}

export interface SkillRow {
  name: string
  /** Marks on each board, kept apart because they cap differently. */
  marks: SkillMarks
  /** Total level in play — the two boards' marks added (p.80). */
  level: number
  /** Ceiling printed on the Class wheel for this skill, if the class carries it. */
  classCap: number | null
  /** Ceiling for character-board marks, from the board grant. */
  characterCap: number | null
  /** Class marks may not exceed rank; `null` when rank is unknown. */
  rankCap: number | null
  /** Class marks the player may still add right now. `null` when rank is unknown. */
  classHeadroom: number | null
  /** True when the class wheel carries this skill at all. */
  onClassBoard: boolean
  /** True when the character board grants it. */
  onCharacterBoard: boolean
  /** Board-granted marks that come free, before any the player added. */
  granted: number
}

export type SpellSource = 'character-board' | 'class-board' | 'learned'

export interface SpellRow {
  name: string
  source: SpellSource
  school: string | null
  level: number | null
  /** True when `level` exceeds the Adventurer's rank — only meaningful for learned spells. */
  overRank: boolean
}

export interface SheetIssue {
  severity: 'error' | 'warning'
  kind:
    | 'class-marks-over-rank'
    | 'class-marks-over-cap'
    | 'character-marks-over-cap'
    | 'spell-over-rank'
    | 'marks-exceed-xp'
    | 'stat-over-max'
    | 'rank-unknown'
  message: string
}

export interface CharacterSheet {
  displayName: string
  species: string | null
  /** `null` when the board's stat block isn't transcribed. */
  stats: StatRow[] | null
  xpFilled: number
  xpMax: number | null
  /** Rank in force: derived from Experience rows when known, else the recorded value. */
  rank: number | null
  rankIsDerived: boolean
  skills: SkillRow[]
  spells: SpellRow[]
  /** Abilities and stat bonuses the boards grant — reference material, nothing to mark. */
  grants: { label: string; detail: string | null; from: 'character' | 'class' }[]
  issues: SheetIssue[]
}

export interface SheetInput {
  state: AdventurerState
  character: AdventurerDef | undefined
  klass: ClassDef | undefined
  /** Reference sections, for resolving a spell's school and level. */
  spellSchools?: Iterable<SpellSchoolDef>
  skillCategories?: Iterable<SkillCategoryDef>
}

/**
 * Rank in force for an Adventurer.
 *
 * Prefers deriving it from the Experience track, which is the rulebook's own definition
 * (p.80: rows with at least one filled space). Falls back to what the player recorded
 * when the board's row layout isn't transcribed, and returns `null` when neither is
 * available — an unknown rank must not silently become 1, or every cap it gates
 * would be computed against a number nobody verified.
 */
export function rankFor(state: AdventurerState, character: AdventurerDef | undefined): {
  rank: number | null
  derived: boolean
} {
  const rows = character?.xpRows
  if (rows && rows.length > 0) {
    return { rank: rankFromXp(state.xpFilled, { rows }), derived: true }
  }
  return { rank: state.rank, derived: false }
}

const STAT_KEYS: LevellableStat[] = ['health', 'skill', 'magic', 'actions']

function statRows(
  character: AdventurerDef | undefined,
  state: AdventurerState,
): StatRow[] | null {
  const stats = character?.stats
  if (!stats) return null
  return STAT_KEYS.map((key) => {
    const base = stats[key].default
    const max = stats[key].max
    const increase = state.statIncreases[key] ?? 0
    return { key, base, increase, current: base + increase, max, atMax: base + increase >= max }
  })
}

/** Marks a board grant supplies for a skill before the player adds any. */
function grantedSkillMarks(character: AdventurerDef | undefined): Map<string, { def: number; max: number }> {
  const out = new Map<string, { def: number; max: number }>()
  for (const grant of character?.boardGrants ?? []) {
    if (grant.type !== 'skill' || !grant.name) continue
    out.set(grant.name, { def: grant.default ?? 0, max: grant.max ?? grant.default ?? 0 })
  }
  return out
}

function spellIndex(schools: Iterable<SpellSchoolDef> | undefined) {
  const index = new Map<string, { school: string; level: number }>()
  for (const school of schools ?? []) {
    for (const lvl of school.levels) {
      for (const spell of lvl.spells) index.set(spell.name, { school: school.name, level: lvl.level })
    }
  }
  return index
}

/** Compose the sheet. Missing content degrades to gaps and issues, never to invented numbers. */
export function buildCharacterSheet(input: SheetInput): CharacterSheet {
  const { state, character, klass } = input
  const { rank, derived } = rankFor(state, character)
  const issues: SheetIssue[] = []

  const granted = grantedSkillMarks(character)
  const classSkills = new Map((klass?.skills ?? []).map((s) => [s.name, s.levelCap ?? DEFAULT_SKILL_LEVEL_CAP]))

  // Every skill either board knows about, plus anything already marked (so a mark can
  // never become invisible just because the content changed under it).
  const names = new Set<string>([...classSkills.keys(), ...granted.keys(), ...Object.keys(state.skillMarks)])

  const skills: SkillRow[] = [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const marks = state.skillMarks[name] ?? { character: 0, class: 0 }
      const classCap = classSkills.has(name) ? classSkills.get(name)! : null
      const grant = granted.get(name)
      const characterCap = grant ? grant.max : null
      const rankCap = rank
      const effectiveClassCap =
        classCap === null ? 0 : rankCap === null ? classCap : Math.min(classCap, rankCap)

      if (rankCap !== null && marks.class > rankCap) {
        issues.push({
          severity: 'warning',
          kind: 'class-marks-over-rank',
          message: `${name}: ${marks.class} Class-board marks above rank ${rankCap}`,
        })
      }
      if (classCap !== null && marks.class > classCap) {
        issues.push({
          severity: 'warning',
          kind: 'class-marks-over-cap',
          message: `${name}: ${marks.class} marks above the board's cap of ${classCap}`,
        })
      }
      if (characterCap !== null && marks.character > characterCap) {
        issues.push({
          severity: 'warning',
          kind: 'character-marks-over-cap',
          message: `${name}: ${marks.character} character-board marks above the board's ${characterCap}`,
        })
      }

      return {
        name,
        marks,
        level: marks.character + marks.class,
        classCap,
        characterCap,
        rankCap,
        classHeadroom: classCap === null ? null : Math.max(0, effectiveClassCap - marks.class),
        onClassBoard: classCap !== null,
        onCharacterBoard: grant !== undefined,
        granted: grant?.def ?? 0,
      }
    })

  const index = spellIndex(input.spellSchools)
  const spells: SpellRow[] = []
  const addSpell = (name: string, source: SpellSource) => {
    const ref = index.get(name) ?? null
    const level = ref?.level ?? null
    const overRank = source === 'learned' && rank !== null && level !== null && level > rank
    if (overRank) {
      issues.push({
        severity: 'warning',
        kind: 'spell-over-rank',
        message: `${name} is level ${level}, above rank ${rank}`,
      })
    }
    spells.push({ name, source, school: ref?.school ?? null, level, overRank })
  }
  for (const grant of character?.boardGrants ?? []) {
    if (grant.type === 'spell' && grant.name) addSpell(grant.name, 'character-board')
  }
  for (const name of klass?.grantedSpells ?? []) addSpell(name, 'class-board')
  for (const name of state.spells) addSpell(name, 'learned')

  const grants: CharacterSheet['grants'] = []
  for (const grant of character?.boardGrants ?? []) {
    if (grant.type === 'ability' && grant.name) {
      grants.push({ label: grant.name, detail: grant.detail ?? null, from: 'character' })
    }
    if (grant.type === 'statBonus' && grant.text) {
      grants.push({ label: grant.text, detail: null, from: 'character' })
    }
  }
  for (const ability of klass?.grantedAbilities ?? []) {
    grants.push({ label: ability.name, detail: ability.detail ?? null, from: 'class' })
  }
  for (const bonus of klass?.statBonuses ?? []) {
    grants.push({ label: bonus, detail: null, from: 'class' })
  }

  const stats = statRows(character, state)
  for (const row of stats ?? []) {
    if (row.current > row.max) {
      issues.push({
        severity: 'warning',
        kind: 'stat-over-max',
        message: `${row.key} is ${row.current}, above the board's potential of ${row.max}`,
      })
    }
  }

  // Earning 1 Experience buys exactly one Skill or Spell mark (p.80), so the two
  // should agree. A mismatch usually means a mark was recorded without its XP, and
  // it's the cheapest way to catch a half-entered restore.
  const totalMarks =
    Object.values(state.skillMarks).reduce((n, m) => n + m.character + m.class, 0) +
    state.spells.length
  if (totalMarks !== state.xpFilled) {
    issues.push({
      severity: 'warning',
      kind: 'marks-exceed-xp',
      message: `${totalMarks} Skill/Spell marks recorded but ${state.xpFilled} Experience filled — each Experience buys one mark`,
    })
  }

  if (rank === null) {
    issues.push({
      severity: 'warning',
      kind: 'rank-unknown',
      message:
        "Rank isn't known: this board's Experience row layout isn't transcribed. Set it here so the Class-skill caps can be checked.",
    })
  }

  return {
    displayName: state.displayName,
    species: character?.species ?? null,
    stats,
    xpFilled: state.xpFilled,
    xpMax: character?.stats?.xp.max ?? null,
    rank,
    rankIsDerived: derived,
    skills,
    spells,
    grants,
    issues,
  }
}
