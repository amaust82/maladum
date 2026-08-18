# Project status — Maladum Campaign Companion

**Purpose of this file:** the living "where are we" doc. Read this first when picking the
project back up, then `docs/design.md` for the actual design (it stays the source of
truth). Keep the Status and Next-actions sections current as work lands — they're what
makes a dropped session cheap to resume.

**Keeping it current is enforced**, not remembered: `.githooks/pre-commit` rejects a
commit that touches `src/` or `content/` without also touching this file. Arm it once per
clone with `git config core.hooksPath .githooks` (also listed in `README.md`); bypass a
genuine exception — a formatting sweep, a revert — with `git commit --no-verify`.
`CLAUDE.md` states the same rule for agent sessions.

## Status — updated 2026-08-18

**Phase 0 is complete; Phase 1 is under way** — campaign management and the party builder
are in, and the app now has real screens instead of the scaffold. `npm run build` is clean
and `npm test` is green: **232 tests across 18 files**.

`docs/design.md` was amended this session (§2.4 and the `Campaign` interface in §3) to
record where the content pack manifest attaches — see "Resolved this session" below.

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

### Phase 1 checklist (design.md §4)

| Item | State | Where |
| --- | --- | --- |
| Campaign management — create/list/duplicate/delete/rename, export/import | done | `src/services/campaignService.ts`, `src/stores/campaigns.ts`, `src/screens/CampaignPicker.vue` |
| Content pack manifest recorded in saves + compatibility report | done | `src/content/manifest.ts` |
| Party builder — boards, default XP fill, Guilder validation | done | `src/rules/partyBuilder.ts`, `src/services/partyService.ts`, `src/screens/PartyBuilder.vue` |
| Incomplete-content model (how the app surfaces unverified data) | done | `src/content/readiness.ts`, `src/components/ReadinessBadge.vue` |
| Routing + tab shell (Party live, other four stubbed) | done | `src/router.ts`, `src/screens/CampaignShell.vue` |
| Character sheet | not started | — |
| Companions & Apprentices | not started | — |
| Campaign Phase wizard (Escape → Advancement → Market → Rest) | not started | — |
| Base Camp, Side Quest tracker, Quest log, Pouch ledger | not started | — |

### Resolved this session

**1. Where the pack manifest attaches to a save (was an open decision).**
The authoritative copy lives **inside the event log**, on `CAMPAIGN_CREATED`, and a later
change is a new `CONTENT_PACKS_CHANGED` event rather than an edit to the old one. Reasons,
in order of weight:

- The log is the source of truth and the thing export/import round-trips. A manifest kept
  only in the Dexie row would not survive an export, which defeats the point of recording
  it (design §2.4).
- Modelling a pack change as a *new fact with a timestamp* keeps the chronicle able to say
  "quests 1–4 were played against core v1, 5+ against v2" — the exact question you ask
  when an old number looks wrong. `CampaignState.contentPackHistory` holds that.
- `CampaignMeta.contentPacks` in Dexie stays, but strictly as a denormalized read-model so
  the picker can flag an incompatible save without replaying every log. Every write goes
  "append event → re-derive the row" (`campaignService.metaFromState`), so it can't drift.
- Nothing auto-repairs. `compareManifests()` reports and the player decides
  (`acceptContentPacks()` records the choice). The risk being defended against is silent
  drift, and the cure for that is to stop being silent, not to refuse the load.

Packs now carry **two** numbers: `schemaVersion` (shape — gates parsing) and `version`
(content revision — bumps when a transcribed value is corrected). A content upgrade is a
warning; a downgrade or shape change is an error.

**2. How the app surfaces incomplete content (the collision the party builder was
expected to hit).** `src/content/readiness.ts` grades every Adventurer/Class board as
`ready` / `partial` / `placeholder` from the packs' own `_placeholder` and `_verified`
annotations, and that grade drives the UI:

- **placeholder** (whole entity fake) — hidden from every picker behind an explicit
  "show placeholder boards" opt-in, with a count of what's hidden. Fake data must not be
  one careless tap away from looking like a real party.
- **partial** (real data, some fields untranscribed — i.e. Syrio) — selectable, badged
  amber, with the missing field names spelled out on the card.
- The load-bearing rule: **an unknown number never becomes 0.** A missing Guilder cost
  travels as `null` from the pack through `rules/partyBuilder.ts` to the screen, which
  reads "at least 120 Guilders · 1 unknown cost" rather than a total that looks exact. A
  budget that can't be checked produces a warning, never a green tick.

A consequence worth knowing: with the current seed content the only Class board is a
flagged placeholder, so **a party cannot be completed without opting into placeholders**.
That's the honest state of the data, and the builder says so in as many words rather than
letting you build a party out of fiction by accident.

### Loader notes

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
  the manifest a save file records (design §2.4). Campaign creation now writes it into the
  log via `manifestFrom(library)` — see "Resolved this session" above.
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
   builder is built and names exactly which fields the real data has to fill: run it and
   read the amber badges. Until a real Class board is transcribed, completing a party
   requires ticking "show placeholder boards".
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
- **Starting Guilders for a new party** — not transcribed from the rulebook, so the party
  builder takes a budget as optional player input and skips the check when it's blank
  rather than assuming a purse. Fill this in when the number is verified.
- **The 4-Adventurer party limit has no page citation yet.** `MAX_PARTY_SIZE` in
  `src/rules/partyBuilder.ts` is enforced on design §3's say-so; the rulebook page is
  unverified and deliberately not invented in the doc comment.

## Next actions

Phase 1 continues (design.md §4), in this order:

1. **Character sheet** — stats as the physical wax-seal rows (filled vs. potential), XP
   track grid with the level-up reward inline, Class skill tree greyed above the rank cap,
   spell list, inventory with size accounting, armour slots. `src/rules/advancement.ts`
   already computes rank, caps and level-up eligibility; this screen is presentation over
   numbers that are already tested. It will need the projection extended beyond
   `xpFilled`/`inventory` — grow `CampaignState.AdventurerState` and the event union
   together, as `src/store/campaign/events.ts` says.
2. **Base Camp (Camp tab)** — Stash, Renown track, storage, notes. Small, and it unblocks
   the Market step of the wizard.
3. **Campaign Phase wizard** (Escape → Advancement → Market → Rest) — the rules engine has
   every calculation; this is the four-step flow over the top.

Two smaller things left deliberately undone, so they don't get mistaken for oversights:

- The Camp / Play / Log / Rules tabs render disabled in `CampaignShell.vue`. That's on
  purpose — the finished shape is visible without pretending the screens exist.
- `campaignService.commit()` re-reads the whole log to refresh the picker row. Correct and
  cheap at campaign scale; if it ever isn't, the snapshotting in `eventStore.ts` is the
  answer, not a hand-maintained cache.

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
