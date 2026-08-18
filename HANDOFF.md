# Project status & handoff — Maladum Campaign Companion

**Purpose of this file:** the living "where are we" doc. Read this first when picking the
project back up, then `docs/design.md` for the actual design (it stays the source of
truth). Keep the Status and Next-actions sections current as work lands — they're what
makes a dropped session cheap to resume.

## Status — updated 2026-08-17

**Phase 0 (Foundation) is complete.** The app builds, and `npm test` is green:
**151 tests across 12 files**. Working tree is committed; `docs/design.md` remains the
design source of truth and hasn't changed since implementation started.

This section is kept current as work lands, so a lost session costs nothing — read it
first, then "Next actions" at the bottom.

### Phase 0 checklist (design.md §4)

| Item | State | Where |
| --- | --- | --- |
| Vite + Vue 3 + TS + Tailwind scaffold, PWA manifest, dark theme | done | `vite.config.ts`, `src/App.vue` |
| Content pack schema + Zod validators | done | `src/content/schema.ts` |
| Core pack loader (merge, integrity check, manifest) | done | `src/content/loader.ts` |
| Event store, projection engine, snapshotting, undo stack | done | `src/store/` |
| Dexie schema + export/import to a single JSON file | done | `src/db/` |
| Rules engine + tests for every derived value | done | `src/rules/` (difficulty, upkeep, advancement, market, crafting, escape) |

### Loader notes (newest work)

`src/content/loader.ts` never throws. `loadPacks(raws)` / `loadBundledPacks()` return
`{ library, issues }`, so one broken pack doesn't take the app down — it lands in `issues`
and the good packs still load. Details worth knowing before you build on it:

- **Merge order is deterministic**: `core` first, then expansions alphabetically. Later
  packs override earlier ids (last wins) and each override is recorded as a `duplicate-id`
  *warning*, not an error.
- **Issue severities matter.** `errorsOnly(issues)` is the blocking set; overrides are
  warnings by design. `describeIssue()` gives a one-line human-readable form.
- **Cross-pack references resolve after merge** — an expansion recipe legitimately spends
  a resource defined in `core`, so integrity checking can't be per-pack.
- **`library.provenance`** maps `"<entity>:<id>"` → winning pack id, and `library.packs` is
  the manifest a save file records (design §2.4: "a save file records which pack versions
  it was created against"). The event store does **not** record it yet — wiring that in is
  a Phase 1 task, listed below.
- **`SUPPORTED_SCHEMA_VERSION = 1`.** Packs above it are refused with an error rather than
  parsed optimistically.
- Packs are bundled at build time via `import.meta.glob`, so loading is synchronous and
  works offline — no fetch.

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

- **`craftingResources` (15 entries) — real, verified data**, transcribed from the
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

## What's NOT done

Content gaps (unchanged since the original drop — none of them block Phase 1 starting):

1. **Real Adventurer and Class data.** `core.json` still carries only Syrio's verified
   stat block; everything else on him is `null`, and `adventurers[1]`/`classes[0]` are
   structural placeholders flagged `"_placeholder": true`. Getting real data in means
   photographing the physical boards or using Battle Systems' Character Creator
   (rulebook p.94) — the PDF's graphical boards don't text-extract reliably. The party
   builder can be built against the placeholders and will surface exactly which fields
   the real data has to fill.
2. **Item fields are thin.** Crafted-item stubs have `name`, `type`, `size`, `sellPrice`
   — no combat stats (attack dice, damage type), which weren't in the spreadsheet source.
   Fine for crafting bookkeeping; not yet real playable item data.
3. **Companions, Side Quests, quests, spells, NPC AI decision-tree data** have zero seed
   content. Phase 1 per §4 doesn't need any of it to begin.

Open implementation decisions (genuine calls, not oversights):

- **`PouchState` and crafting resources** — does the pouch ledger track crafting resource
  tokens alongside equipment tokens (same physical container) or separately (cleaner data
  model)? See the rules note at the bottom of this file for what physically goes in the
  pouch. Still undecided.
- **Pack manifest in save files** — `library.packs` exists but nothing writes it into a
  campaign's persisted state yet. Decide where it hangs off the event store / Dexie record
  when campaign creation gets built.

## Next actions

Phase 0 is done, so the next session starts on **Phase 1 (design.md §4)**, in this order:

1. **Campaign management** — create/list/duplicate/delete campaigns on top of the existing
   event store and Dexie layer, wiring `library.packs` into each campaign record as it's
   created (see the open decision above). Export/import already exists in `src/db/`.
2. **Party builder** — first real screen, because everything else depends on it having
   data to show. Validates against Guilders, auto-fills default XP spaces. It will run
   into the placeholder Adventurer/Class data above; that's the expected forcing function
   for deciding how the app handles incomplete content.
3. **Character sheet**, then the **Campaign Phase wizard** (Escape → Advancement → Market
   → Rest) — the rules engine already has every calculation these need.

`src/App.vue` is still the scaffold placeholder; it now shows loaded-content counts and
any loader errors as a smoke check, and Phase 1 replaces it with real screens.

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
