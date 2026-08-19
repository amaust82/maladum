/**
 * Maps ability/trait names (the `abilities` glossary — the icon glossary,
 * rulebook pp.150–155) to the pictogram files in `public/icons/`. Those files are
 * pulled from a third-party fan project (see `public/icons/SOURCE.md` for
 * provenance, licensing caveat, and how to disable them before this app supports
 * public access).
 *
 * `VITE_SHOW_ITEM_ICONS` is the kill switch: unset/anything but `'false'` shows
 * icons, `'false'` makes every lookup here return nothing without touching a single
 * call site — every consumer already treats "no icon" as a normal, expected case
 * (an unmatched trait looks the same as icons being off).
 */

export const SHOW_ITEM_ICONS = import.meta.env.VITE_SHOW_ITEM_ICONS !== 'false'

/** Filenames (no extension) actually present in `public/icons/` — kept in sync by hand. */
const ICON_FILES = new Set([
  '2_actions', 'ammo_arrow', 'ammo_blade', 'ammo_bullet', 'ammo_dart', 'ammo_shuriken',
  'armour', 'balanced', 'blast', 'bludgeoning', 'bludgeoning_immunity', 'book', 'burning',
  'camouflage', 'channel', 'cleave', 'crafting', 'creature', 'cumbersome', 'curse',
  'darkness', 'defensive_re_roll', 'discard', 'effortless', 'entangling', 'fast',
  'fireball', 'first_strike', 'fly', 'focused_energy', 'forbidden_channel',
  'forceful_melee', 'harpoons', 'hawkeye', 'hazardous', 'hidden_location', 'hit_and_run',
  'immobile', 'immunity', 'indestructible', 'infinite_ammo', 'key', 'lasting', 'light',
  'location_specific', 'loud', 'lull', 'magic', 'magical_armour', 'malacyte_enhancement',
  'malacyte_stability', 'malacytic_conduit', 'master', 'melee', 'melee_re_roll',
  'night_sight', 'otherworldly', 'pack', 'parry', 'piercing', 'plunderer', 'poison',
  'preparation', 'purification', 'quickstrike', 'range_plus_1', 'rank', 're_roll',
  'reach', 'reactive', 'regen_magic', 'regeneration', 'relentless', 'remove_poison',
  'remove_wounded', 'rest', 'restore_action', 'restore_health', 'restore_magic',
  'restore_skill', 'retaliation', 'rope', 'rough_ground', 'scramble', 'sharp',
  'shield_block', 'size', 'stars', 'starting_magic', 'stash', 'terrifying', 'trap',
  'trap_melee', 'unarmed_combat', 'unreliable', 'unsanctioned', 'vampiric', 'vicious',
  'volatile', 'worthy_opponent', 'x_dice',
  // skill_* / spell_* also exist in public/icons/ but aren't item traits — not listed
  // here since nothing in the `abilities` glossary should ever resolve to them.
])

/** Ability names whose normalized form doesn't land on the right icon file by itself. */
const OVERRIDES: Record<string, string> = {
  '+x_dice': 'x_dice',
  ammunition: 'infinite_ammo', // closest single icon; "Ammo N" shorthand has no generic pictogram
  crafting_resource: 'crafting',
  darkness_light: 'light',
  regeneration_peg_type: 'regeneration',
  restoration: 'restore_health',
  vampiric_peg_type: 'vampiric',
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // "Regeneration (peg type)" -> "Regeneration "
    .replace(/[–-]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function iconFor(abilityName: string): string | null {
  const key = normalize(abilityName)
  const candidate = OVERRIDES[key] ?? key
  return ICON_FILES.has(candidate) ? candidate : null
}

/**
 * Icon paths for the trait names that appear (as whole words) in an item's `notes`
 * shorthand — e.g. "Combat 1 Burst, Bludgeoning, Cumbersome" matches Bludgeoning and
 * Cumbersome. Traits with no matching file (or icons disabled) are silently skipped;
 * search/filtering never depends on this.
 */
export function iconsForNotes(notes: string | null | undefined, abilityNames: string[]): string[] {
  if (!SHOW_ITEM_ICONS || !notes) return []
  const found: string[] = []
  for (const name of abilityNames) {
    const icon = iconFor(name)
    if (!icon) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(notes)) found.push(`/icons/${icon}.png`)
  }
  return found
}
