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

import type {
  AdventurerDef,
  ClassDef,
  ItemDef,
  SkillCategoryDef,
  SpellSchoolDef,
} from '../content/schema'
import type { AdventurerState, SkillMarks } from '../store/campaign/projection'
import type { ItemRef } from '../store/campaign/events'
import type { LevellableStat } from '../store/campaign/events'
import { rankFromXp } from './advancement'

/** Default cap on a Class-board skill when the board doesn't print an override. */
export const DEFAULT_SKILL_LEVEL_CAP = 3

/**
 * Hard ceiling on any Skill's usable level, however it was reached (p.32, Duplicate
 * Skills): "All Skills have a maximum level of 3." Character-board marks stack on Class
 * marks past the rank cap, so a board can legitimately be *marked* above 3 — the excess
 * simply doesn't do anything in play, which is why `level` and `marksTotal` differ.
 */
export const SKILL_MAX_LEVEL = 3

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
  /** Marks actually on the boards, added together (p.80). May exceed the usable level. */
  marksTotal: number
  /** Usable level in play: `marksTotal` capped at 3 (p.32), and net of armour cover. */
  level: number
  /**
   * True when this skill's character-board marks sit under an armour slot the player has
   * covered — "putting armour on may reduce the level of a certain Skill available to a
   * character, even if they also had it on their Class board" (p.32).
   */
  coveredByArmour: boolean
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
    | 'skill-over-max-level'
    | 'armour-over-slots'
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
  /**
   * Abilities and stat bonuses the boards grant — reference material, nothing to mark.
   * `onArmourSlot` grants are printed in an armour slot, so equipping armour there covers
   * them; `covered` is the player's record of having done so.
   */
  grants: {
    label: string
    detail: string | null
    from: 'character' | 'class'
    onArmourSlot: boolean
    covered: boolean
  }[]
  /** Items carried. Capacity is the physical tray, so it is reported, never enforced. */
  inventory: ItemRef[]
  /** Total token size carried, and how many items had no transcribed size. */
  carried: { sized: number; unsized: number; total: number }
  /** Items in the armour slots, and how many slots the board has. */
  armour: ItemRef[]
  armourSlots: number | null
  issues: SheetIssue[]
}

export interface SheetInput {
  state: AdventurerState
  character: AdventurerDef | undefined
  klass: ClassDef | undefined
  /** Reference sections, for resolving a spell's school and level. */
  spellSchools?: Iterable<SpellSchoolDef>
  skillCategories?: Iterable<SkillCategoryDef>
  /** Item definitions, for the carried-size tally. */
  items?: Map<string, ItemDef>
  /**
   * True before the party's first quest. At creation, a spell up to level 3 may be
   * learned regardless of rank (Adam, 2026-08-19 — a rule he knows, not yet found
   * with a page citation); once play has started, level gates rank as usual. There's
   * no per-spell "learned at creation" marker, so this is the whole-party proxy:
   * `party.quests.length === 0`.
   */
  atCreation?: boolean
}

/**
 * Token size in inventory spaces. p.14: "the size of the token simply represents how much
 * space it takes up in your inventory". The letters are the printed sizes; a number is
 * accepted because the design sketch used one.
 */
const SIZE_SPACES: Record<string, number> = { XS: 1, S: 2, M: 3, L: 4, XL: 5 }

export function itemSpaces(item: ItemDef | undefined): number | null {
  if (!item || item.size === null || item.size === undefined) return null
  if (typeof item.size === 'number') return item.size
  return SIZE_SPACES[item.size] ?? null
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
  const { state, character, klass, atCreation = false } = input
  const { rank, derived } = rankFor(state, character)
  const issues: SheetIssue[] = []

  const granted = grantedSkillMarks(character)
  const coveredGrants = new Set(state.coveredGrants)
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

      // A covered armour slot hides the character-board marks printed on it (p.32).
      const coveredByArmour = coveredGrants.has(name)
      const effectiveCharacter = coveredByArmour ? 0 : marks.character
      const marksTotal = marks.character + marks.class
      const level = Math.min(SKILL_MAX_LEVEL, effectiveCharacter + marks.class)

      if (marksTotal > SKILL_MAX_LEVEL) {
        issues.push({
          severity: 'warning',
          kind: 'skill-over-max-level',
          message: `${name} is marked to ${marksTotal} but no Skill goes above level ${SKILL_MAX_LEVEL} (p.32)`,
        })
      }

      return {
        name,
        marks,
        marksTotal,
        level,
        coveredByArmour,
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
    const exemptAtCreation = atCreation && level !== null && level <= 3
    const overRank =
      source === 'learned' &&
      rank !== null &&
      level !== null &&
      level > rank &&
      !exemptAtCreation
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
    const label = grant.type === 'statBonus' ? grant.text : grant.name
    if (grant.type === 'skill' || !label) continue // skills are rendered in the skill table
    grants.push({
      label,
      detail: grant.detail ?? null,
      from: 'character',
      onArmourSlot: grant.armorSlot === true,
      covered: coveredGrants.has(label),
    })
  }
  for (const ability of klass?.grantedAbilities ?? []) {
    grants.push({
      label: ability.name,
      detail: ability.detail ?? null,
      from: 'class',
      onArmourSlot: false,
      covered: false,
    })
  }
  for (const bonus of klass?.statBonuses ?? []) {
    grants.push({ label: bonus, detail: null, from: 'class', onArmourSlot: false, covered: false })
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
  //
  // A board-granted skill's printed default (`granted`) is free — it isn't bought
  // with Experience, so it's excluded here the same way board-granted spells already
  // are (`state.spells` only ever holds player-*learned* spells, never grants).
  // Only marks ABOVE that default count toward the total.
  const totalMarks =
    Object.entries(state.skillMarks).reduce((n, [name, m]) => {
      const boughtCharacter = Math.max(0, m.character - (granted.get(name)?.def ?? 0))
      return n + boughtCharacter + m.class
    }, 0) + state.spells.length
  if (totalMarks !== state.xpFilled) {
    issues.push({
      severity: 'warning',
      kind: 'marks-exceed-xp',
      message: `${totalMarks} Skill/Spell marks recorded but ${state.xpFilled} Experience filled — each Experience buys one mark`,
    })
  }

  const armourSlots = character?.armourSlots ?? null
  if (armourSlots !== null && state.armour.length > armourSlots) {
    issues.push({
      severity: 'warning',
      kind: 'armour-over-slots',
      message: `${state.armour.length} items in armour slots but this board has ${armourSlots}`,
    })
  }

  // Carrying capacity is the physical tray, not a number the rules state (p.7: "the
  // character cannot carry more than the tray can hold"). So the size is tallied and
  // shown, never checked against an invented limit — and items whose size wasn't
  // transcribed are counted separately rather than treated as weightless.
  let sized = 0
  let unsized = 0
  for (const ref of state.inventory) {
    const spaces = itemSpaces(input.items?.get(ref.itemId))
    if (spaces === null) unsized += 1
    else sized += spaces
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
    inventory: state.inventory,
    carried: { sized, unsized, total: state.inventory.length },
    armour: state.armour,
    armourSlots,
    issues,
  }
}
