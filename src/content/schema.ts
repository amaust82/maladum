import { z } from 'zod'

/**
 * Zod schema for a Maladum content pack (design.md §2.4 + §3.1).
 *
 * This schema is reconciled against the four seed packs in `content/*.json`,
 * which are the richer, internally-consistent side of a few naming divergences
 * from the design doc's inline JSON sketch:
 *   - crafting resources carry `symbol` (design §3.1 sketched `icon`), plus
 *     `rarity`/`buyCost`/`notes` from the crafting spreadsheet source.
 *   - items use `sellPrice` and a string `size` ("XS"…"XL"); crafted-only stubs
 *     legitimately have no `buyPrice` (they can't be bought — design §0.3/§3.1).
 *   - core.json's price list uses `buyCost` (the spreadsheet's column name) while
 *     the crafting packs use `buyPrice`. Both are accepted; read them through
 *     `buyPriceOf()` rather than reaching for either field directly.
 *
 * schemaVersion 2 (core.json) adds five top-level entity arrays that did not
 * exist when the design doc's inline sketch was written — `companions`, `skills`,
 * `abilities`, `itemLore`, `difficultyTable` — and reshapes `spells` from a flat
 * list into the rulebook's own school → level → spell nesting. v1 packs stay
 * valid: every new array defaults to empty.
 *
 * Every entity is a *loose* object: unknown keys (annotations like `_note`,
 * `_placeholder`, `_verified`, provenance `source`) are preserved, not rejected,
 * so hand-authored seed data keeps its notes through a parse round-trip.
 */

export const Rarity = z.enum(['common', 'uncommon', 'rare', 'exclusive', 'special'])
export type Rarity = z.infer<typeof Rarity>

/** One stat row on a character/class board: filled-by-default + potential max. */
export const StatBlock = z.object({
  default: z.number(),
  max: z.number(),
})

export const CraftingResourceDef = z.looseObject({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  rarity: Rarity,
  /** null = not purchasable (e.g. Necrotic Fluids, found only in play). */
  buyCost: z.number().nullable().optional(),
  notes: z.string().optional(),
})
export type CraftingResourceDef = z.infer<typeof CraftingResourceDef>

const StatKeys = z.object({
  health: StatBlock,
  skill: StatBlock,
  magic: StatBlock,
  actions: StatBlock,
  xp: StatBlock,
})

export const AdventurerDef = z.looseObject({
  id: z.string(),
  name: z.string(),
  species: z.string().nullable().optional(),
  /** Hire cost in Guilders; null on placeholder/untranscribed entries. */
  cost: z.number().nullable().optional(),
  classId: z.string().nullable().optional(),
  /**
   * Full stat block, or `null` when the board hasn't been transcribed. Only
   * Syrio's is real so far (rulebook worked example) — the other 19 boards carry
   * a verified name+cost and a `null` stat block rather than invented numbers.
   */
  stats: StatKeys.nullable().optional(),
  innateAbilities: z.array(z.string()).optional(),
  armourSlots: z.number().nullable().optional(),
  hasDenizenSide: z.boolean().nullable().optional(),
})
export type AdventurerDef = z.infer<typeof AdventurerDef>

/** A class board's reference to a skill it grants — see `SkillCategoryDef` for the skill itself. */
export const ClassSkillRef = z.looseObject({
  id: z.string(),
  maxLevel: z.number().optional(),
})

export const ClassDef = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  cost: z.number().nullable().optional(),
  skills: z.array(ClassSkillRef).default([]),
  innateAbility: z.string().nullable().optional(),
  spellSchools: z.array(z.string()).default([]),
})
export type ClassDef = z.infer<typeof ClassDef>

/**
 * A price as printed. Usually a number, but the price list genuinely contains
 * variable prices — "4D6" (roll for it), "X" (depends on the item), "*" (see the
 * item's own rules) — and `null` where the column is blank. Parse it with
 * `numericPrice()`, which yields `null` for anything that isn't a fixed figure,
 * and show the raw value when you need to tell the player what the board says.
 */
export const Price = z.union([z.number(), z.string()]).nullable().optional()
export type Price = z.infer<typeof Price>

/** Physical tokens use letter sizes (XS…XL); the design sketch used a number. Accept both. */
export const ItemSize = z.union([z.string(), z.number()])

/**
 * A market/loot item. Nearly every field is nullable: the price list has real
 * gaps (16 items with no sell price, one row with no type or rarity at all), and
 * a `null` there is the honest transcription — not a licence to substitute 0.
 */
export const ItemDef = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.string().nullable().optional(),
  size: ItemSize.nullable().optional(),
  rarity: Rarity.nullable().optional(),
  /** Market buy price. `buyCost` is the core price-list spelling; see `buyPriceOf()`. */
  buyPrice: Price,
  buyCost: Price,
  sellPrice: Price,
  /** Rank tier the item unlocks at, as printed ("Rank 1"…"Rank 5"); null on untiered items. */
  rank: z.string().nullable().optional(),
  /**
   * Compressed mechanical shorthand off the price list ("Combat 1 Burst",
   * "Sharp, Ammo"). The trait names in here are defined in full in `abilities`;
   * this is a good hint for a future structured `combatStats`, not final rules text.
   */
  notes: z.string().nullable().optional(),
  craftedOnly: z.boolean().optional(),
  breakable: z.boolean().optional(),
  source: z.string().optional(),
})
export type ItemDef = z.infer<typeof ItemDef>

export const RecipeDef = z.looseObject({
  /** The crafted item this recipe unlocks → resolves to an `items[].id`. */
  itemId: z.string(),
  /** Map of craftingResource id → count required → keys resolve to a `craftingResources[].id`. */
  resources: z.record(z.string(), z.number()),
  isRelic: z.boolean().default(false),
  /** Relics additionally require a unique rare token (design §3.1). */
  uniqueResourceId: z.string().optional(),
})
export type RecipeDef = z.infer<typeof RecipeDef>

/** One spell as printed on the Reference pages (rulebook pp.132–139). */
export const SpellDef = z.looseObject({
  name: z.string(),
  text: z.string().optional(),
  passive: z.boolean().optional(),
})
export type SpellDef = z.infer<typeof SpellDef>

/**
 * A magic school and its levelled spell list, mirroring the rulebook's own
 * nesting (school → level 1–5 → spells) rather than flattening it. Schools have
 * no ids in the source — they are keyed by `name`, which is what the Class boards
 * name them by too.
 */
export const SpellSchoolDef = z.looseObject({
  name: z.string(),
  /** How the school's spells pick their target, as printed above the list. */
  targeting: z.string().optional(),
  levels: z
    .array(
      z.looseObject({
        level: z.number(),
        spells: z.array(SpellDef).default([]),
      }),
    )
    .default([]),
})
export type SpellSchoolDef = z.infer<typeof SpellSchoolDef>

/**
 * One skill and its levels (rulebook pp.140–150).
 *
 * Level structure is deliberately NOT normalized to a uniform 1/2/3: several
 * Townsfolk skills genuinely have two levels (Bombast) or repeated Level-1
 * entries (Herbalism, Loremaster, Smithing) because they scale by "X" instead of
 * unlocking tiers. Reshaping those into a regular ladder would misstate the rules.
 */
export const SkillDef = z.looseObject({
  name: z.string(),
  levels: z
    .array(z.looseObject({ level: z.number(), text: z.string().optional() }))
    .default([]),
})
export type SkillDef = z.infer<typeof SkillDef>

/** A skill category ("Agility Skills"), keyed by name — the source has no ids. */
export const SkillCategoryDef = z.looseObject({
  name: z.string(),
  skills: z.array(SkillDef).default([]),
})
export type SkillCategoryDef = z.infer<typeof SkillCategoryDef>

/**
 * The icon/trait glossary (rulebook pp.150–155) — the central definition of every
 * trait named by `items[].notes`, skill level text and spell text (Sharp, Cleave,
 * Cumbersome, …). Keyed by `name`, which is the form those references use.
 */
export const AbilityDef = z.looseObject({
  name: z.string(),
  text: z.string().optional(),
})
export type AbilityDef = z.infer<typeof AbilityDef>

/** "Item Notes" (rulebook p.156) — rules for specific named items, not generic traits. */
export const ItemLoreDef = z.looseObject({
  name: z.string(),
  text: z.string().optional(),
})
export type ItemLoreDef = z.infer<typeof ItemLoreDef>

/** Companion board: name + hire cost. Abilities live on the physical board, untranscribed. */
export const CompanionDef = z.looseObject({
  id: z.string(),
  name: z.string(),
  cost: z.number().nullable().optional(),
})
export type CompanionDef = z.infer<typeof CompanionDef>

/**
 * One band of the quest-difficulty table (rulebook p.72), shipped as data so
 * `rules/difficulty.ts` can be tested against the pack instead of a hand-copied
 * fixture. `max: null` marks the open-ended final band.
 */
export const DifficultyBandDef = z.looseObject({
  band: z.number(),
  min: z.number(),
  max: z.number().nullable(),
  novice: z.number(),
  veteran: z.number(),
})
export type DifficultyBandDef = z.infer<typeof DifficultyBandDef>

/** Adversary group + its Dread-board arrival specs. Loose — arrival shape not yet finalized. */
export const AdversaryDef = z.looseObject({
  id: z.string(),
  members: z.array(z.string()).optional(),
  dreadBoards: z.array(z.unknown()).optional(),
})

/** Quest authoring shape (design §2.4) is not finalized; kept permissive by intent. */
export const QuestDef = z.looseObject({
  id: z.string(),
})

export const ContentPack = z.looseObject({
  id: z.string(),
  name: z.string(),
  schemaVersion: z.number(),
  /**
   * Content revision of this pack, independent of `schemaVersion`. Correcting a
   * transcribed stat block bumps `version`; changing the pack *shape* bumps
   * `schemaVersion`. A campaign records the versions it was built against
   * (design §2.4), so this is the number that tells a save "your data moved".
   * Defaults to 1 so existing hand-authored packs stay valid.
   */
  version: z.number().default(1),
  craftingResources: z.array(CraftingResourceDef).default([]),
  adventurers: z.array(AdventurerDef).default([]),
  classes: z.array(ClassDef).default([]),
  companions: z.array(CompanionDef).default([]),
  items: z.array(ItemDef).default([]),
  spells: z.array(SpellSchoolDef).default([]),
  skills: z.array(SkillCategoryDef).default([]),
  abilities: z.array(AbilityDef).default([]),
  itemLore: z.array(ItemLoreDef).default([]),
  difficultyTable: z.array(DifficultyBandDef).default([]),
  adversaries: z.array(AdversaryDef).default([]),
  quests: z.array(QuestDef).default([]),
  recipes: z.array(RecipeDef).default([]),
})
export type ContentPack = z.infer<typeof ContentPack>

/** Parse + validate a single raw pack. Throws a ZodError on mismatch. */
export function parsePack(raw: unknown): ContentPack {
  return ContentPack.parse(raw)
}

/**
 * A price as a number, or `null` when there isn't a fixed one — blank, or a
 * variable price like "4D6"/"X"/"*". Never 0: a price the app can't compute with
 * has to stay unknown all the way to the screen, or a free item appears in the
 * market. Callers that want to *show* the price should use the raw field.
 */
export function numericPrice(price: Price): number | null {
  return typeof price === 'number' ? price : null
}

/** True when the pack prints a price the app can't do arithmetic on ("4D6", "X", "*"). */
export function isVariablePrice(price: Price): boolean {
  return typeof price === 'string' && price.trim() !== ''
}

/** An item's buy price, whichever field the source pack spelled it with. */
export function buyPriceOf(item: ItemDef): number | null {
  return numericPrice(item.buyPrice ?? item.buyCost)
}

/** An item's sell price, `null` when blank or variable. */
export function sellPriceOf(item: ItemDef): number | null {
  return numericPrice(item.sellPrice)
}
