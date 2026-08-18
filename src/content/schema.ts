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
  stats: StatKeys,
  innateAbilities: z.array(z.string()).optional(),
  armourSlots: z.number().nullable().optional(),
  hasDenizenSide: z.boolean().nullable().optional(),
})
export type AdventurerDef = z.infer<typeof AdventurerDef>

export const SkillDef = z.looseObject({
  id: z.string(),
  maxLevel: z.number().optional(),
})

export const ClassDef = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  cost: z.number().nullable().optional(),
  skills: z.array(SkillDef).default([]),
  innateAbility: z.string().nullable().optional(),
  spellSchools: z.array(z.string()).default([]),
})
export type ClassDef = z.infer<typeof ClassDef>

/** Physical tokens use letter sizes (XS…XL); the design sketch used a number. Accept both. */
export const ItemSize = z.union([z.string(), z.number()])

export const ItemDef = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  size: ItemSize.optional(),
  rarity: Rarity.optional(),
  buyPrice: z.number().optional(),
  sellPrice: z.number().optional(),
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

export const SpellDef = z.looseObject({
  id: z.string(),
  school: z.string().optional(),
  level: z.number().optional(),
  text: z.string().optional(),
})

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
  craftingResources: z.array(CraftingResourceDef).default([]),
  adventurers: z.array(AdventurerDef).default([]),
  classes: z.array(ClassDef).default([]),
  items: z.array(ItemDef).default([]),
  spells: z.array(SpellDef).default([]),
  adversaries: z.array(AdversaryDef).default([]),
  quests: z.array(QuestDef).default([]),
  recipes: z.array(RecipeDef).default([]),
})
export type ContentPack = z.infer<typeof ContentPack>

/** Parse + validate a single raw pack. Throws a ZodError on mismatch. */
export function parsePack(raw: unknown): ContentPack {
  return ContentPack.parse(raw)
}
