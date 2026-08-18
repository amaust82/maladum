# Handoff to CLI session — Maladum Campaign Companion

**Purpose of this file:** a self-contained brief for starting implementation. Read
`docs/design.md` first (it's the actual design source of truth); this file just points
at the concrete next actions and the seed data dropped alongside it.

## Status

Design is done. Four rounds of revision are recorded as numbered notes at the top of
`docs/design.md` — framework, physical-vs-digital boundaries, and the four open
questions in §7 are all resolved. Nothing here should require another design
conversation; if something in the seed data or schema doesn't fit while you're building
it, that's expected (see "What's NOT done" below) — fix it in code/data as you go rather
than stopping to ask.

## What's in this drop

```
content/
├── core.json                  # schema-proving seed pack — see caveats below
├── of-ale-and-adventure.json  # 56 crafting recipes + crafted-item stubs
├── the-forbidden-creed.json   # 2 crafting recipes + crafted-item stubs
└── oblivions-maw.json         # 10 crafting recipes + crafted-item stubs (bonus — not owned yet, see below)
```

All four files are valid JSON and internally consistent — every `recipes[].itemId`
resolves to an `items[].id` in the same pack, and every `recipes[].resources` key
resolves to a `craftingResources[].id` in `core.json`. I checked this programmatically,
not just by eye.

### `core.json` — read the caveats before trusting anything in it

This pack has two very different kinds of content in it, and they're marked so you can
tell them apart at a glance:

- **`craftingResources` (14 entries) — real, verified data**, transcribed from the
  "Resource Info" sheet of `Maladum Crafting Sheet Template V4.xlsx` (the fan spreadsheet
  in your `.scratch/resources` folder). Names, symbols, rarity, buy cost.
- **`adventurers[0]` (Syrio) — partially real.** Only the `stats` block (Health/Skill/
  Magic/Actions/XP defaults and maxes) is transcribed from the Deluxe rulebook's own
  worked example in the Adventurer Dashboards section, and I'm confident in those five
  numbers specifically. Everything else on Syrio — species, cost, class, innate
  abilities, armour slots — is `null` and listed in `_placeholder`, because I don't have
  reliable source text for those and didn't want to guess at numbers that look
  authoritative but aren't.
- **Everything else in `core.json`** (`adventurers[1]`, `classes[0]`) is a **structural
  placeholder** — valid shape, fake content, clearly flagged with `"_placeholder": true`
  and a name that says so. It exists only to prove the schema has room for a second
  Adventurer and a Class without changing shape.

**Why I didn't transcribe more:** the character/Class boards are graphical layouts in the
PDF — running them through a text extractor produces jumbled, unreliable text (I hit this
on page 1 and didn't trust it enough to repeat for stat blocks). Getting real Adventurer
and Class data in means either photographing your physical boards and reading off them
directly, or using Battle Systems' own digital Character Creator (mentioned in the
rulebook, p.94) as a source. I didn't want to fabricate plausible-looking Guilder costs
and skill trees and have them quietly become "canon" in your data — better to ship an
honest gap than a wrong number that looks right.

### The three expansion packs — high confidence, narrow scope

These came from a real data source (your crafting spreadsheet), mechanically converted,
not reconstructed from OCR — so confidence is much higher than `core.json`'s placeholder
content. Each item's `source` field says exactly that and flags it for a verification
pass against physical tokens before you'd call it final, since it's fan-transcribed, not
official Battle Systems data.

Scope is narrow on purpose: **crafting recipes and crafted-item stubs only** — no
Adventurers, Classes, or quests for any of the three expansions. That wasn't in the
source data, so it wasn't invented.

**`oblivions-maw.json` exists even though you don't own the expansion yet** — the
spreadsheet had the data, so generating it was nearly free, and it happens to be exactly
the test the design doc recommends in §9: confirm a fourth content pack can drop in with
zero code changes. Treat it as a schema test fixture more than "real" content — delete it
without a second thought if it's more confusing than useful to have sitting there.

## What's NOT done (start here)

1. **The schema itself doesn't exist yet.** These are hand-written JSON files shaped to
   match `docs/design.md` §2.4 and §3.1 — there's no Zod schema validating them, and I
   haven't cross-checked every field name against those sections with a fine-tooth comb.
   Writing the Zod schema and running it against these four files is a good first task —
   it'll surface any mismatches immediately, on real data, before any UI exists to hide
   them.
2. **`rules/` (the pure functions engine) doesn't exist.** Per design doc §9's build
   order, this comes first, before the schema even, and doesn't depend on content packs
   being finished — the derived-values table in §3 has every formula you need
   (difficulty calc, XP/rank, upkeep, escape roll modifiers, crafting fee) with page
   citations back to the Deluxe rulebook if you need to double-check one.
3. **Item fields are thin.** The crafted-item stubs have `name`, `type`, `size`,
   `sellPrice` — nothing about combat stats (attack dice, damage type) since that wasn't
   in the spreadsheet. Fine for proving crafting bookkeeping works; not fine as real
   playable item data yet.
4. **Everything else in the roadmap** (Companions, Side Quests, quests, spells, the NPC
   AI decision tree data) has zero seed content. Not started, not blocking — Phase 1 per
   §4 doesn't need any of it to begin.

## Recommended first few sessions

Straight from `docs/design.md` §9, now with real files to point at:

1. Scaffold the Vue 3 + TypeScript + Vite project per §2.1.
2. Write the Zod schemas for the content-pack shape (§2.4 + §3.1) and validate the four
   `content/*.json` files against them. Fix whichever side (schema or data) is wrong.
3. Build `rules/` as pure functions with Vitest coverage, starting with `difficulty.ts`
   and `upkeep.ts` — they're the simplest (pure arithmetic, no state) and the derived-
   values table in §3 gives you the exact formulas and Deluxe page citations.
4. Build the event store (§2.3) and Dexie persistence layer (§2.4-adjacent, "Persistence
   caveat" in §2.1).
5. Only then start on Phase 1 screens (§4) — party builder first, since it's the thing
   every other screen depends on having real data to show.

## One rules question that came up along the way (not blocking, just FYI)

Adam asked what goes in the token pouch at campaign start. Answer, for whoever reads
this: **all Common-rarity tokens** go in the pouch — not just equipment, but grey Trap
tokens and grey Hidden Location tokens too (rulebook explicitly says they "work in the
same way" as commons). Uncommon and Rare items go in separate zip-lock bags, not the
pouch. Exclusive items are kept apart entirely. The one cross-cutting exception: **large
tokens (bigger than 15mm square) never go in the pouch, regardless of rarity** — they're
set aside and only placed when a quest specifically calls for one. Common-rarity crafting
resources (Wood, Steel, Textiles, Herbs, Fungus, Minerals, Riches — see
`core.json`'s `craftingResources`) follow the same rule as any other common token.
Source: Deluxe rulebook pp.14, 18-19, 71 (equipment types, setup steps, After the Game
reset instructions all say the same thing consistently).

This might matter for the `PouchState` model in design doc §3 — worth deciding whether
the pouch ledger tracks crafting resources alongside equipment tokens (same container in
the physical game) or separately (cleaner data model). Not resolved here; a genuine
implementation-time call.
