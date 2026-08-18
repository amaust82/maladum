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

## Status — updated 2026-08-18 (second session)

**Phase 0 is complete; Phase 1 is under way.** Campaign management, the party builder
and the Rules reference are in. `npm run build` is clean and `npm test` is green:
**278 tests across 20 files**.

The headline change this session is content, not code: `core.json` was replaced with a
**substantially real dataset** (schemaVersion 2), and the schema/loader/readiness layers
were extended to carry it. See "The content pack got real" below — most of the caveats
that used to live in this file are no longer true.

This section is kept current as work lands, so a lost session costs nothing — read it
first, then "Next actions" at the bottom.

### Phase 0 checklist (design.md §4)

| Item | State | Where |
| --- | --- | --- |
| Vite + Vue 3 + TS + Tailwind scaffold, PWA manifest, dark theme | done | `vite.config.ts`, `src/App.vue` |
| Content pack schema + Zod validators | done (v2) | `src/content/schema.ts` |
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
| Routing + tab shell (Party + Rules live, other three stubbed) | done | `src/router.ts`, `src/screens/CampaignShell.vue` |
| Rules reference — searchable traits/skills/spells/equipment | done | `src/content/reference.ts`, `src/screens/RulesReference.vue` |
| Character sheet | not started | — |
| Companions & Apprentices | not started | — |
| Campaign Phase wizard (Escape → Advancement → Market → Rest) | not started | — |
| Base Camp, Side Quest tracker, Quest log, Pouch ledger | not started | — |

## The content pack got real (schemaVersion 2)

`content/core.json` went from a schema proof to a mostly-real dataset, merged from three
sources: the Deluxe rulebook's Reference sections (transcribed from **rendered page
images** — the text extractor mangles those multi-column tables; rendering them at 200dpi
and reading the images does not), a fan-made calculator spreadsheet
(`Maladum_calculator_v0.4.4.xlsx`), and the rulebook's own worked example.

| Key | Count | Confidence |
| --- | --- | --- |
| `craftingResources` | 15 | Real — crafting spreadsheet |
| `adventurers` | 20 | **Name + cost real for all 20.** Stat block real for Syrio only. Species, innate abilities, armour slots: untranscribed everywhere |
| `classes` | 25 | **Name + cost real.** Skills, innate ability, spell schools: untranscribed (see the one real gap, below) |
| `companions` | 10 | Name + cost real; the four named ones cross-check against the rulebook's Companions section |
| `items` | 273 | Real — name, rank, rarity, buy/sell cost, type, and a `notes` shorthand that names real traits |
| `spells` | 4 schools × levels 1–5 | Real — rulebook pp.132–139 |
| `skills` | 10 categories, 43 skills | Real — rulebook pp.140–150 |
| `abilities` | 75 | Real — the icon/trait glossary, pp.150–155. The central definition for every trait `items[].notes` and skill/spell text refers to |
| `itemLore` | 15 | Real — the separate "Item Notes" appendix, p.156 |
| `difficultyTable` | 12 bands | Real — and it **independently confirms** `rules/difficulty.ts`, see below |

### What that changed in the code

- **`schemaVersion` 1 → 2** (`SUPPORTED_SCHEMA_VERSION` in `loader.ts`). v2 adds five
  top-level arrays (`companions`, `skills`, `abilities`, `itemLore`, `difficultyTable`)
  and reshapes `spells` from a flat list into the rulebook's own school → level → spell
  nesting. **The three crafting expansions are still v1 and load unchanged** — every new
  array defaults to empty, which is the compatibility story the design doc asked for.
- **Some reference entities have no ids** and never will: spell schools, skill categories,
  the glossary and the Item Notes appendix are keyed by `name` in the loader
  (`NamedEntityKind`), because `name` is also how everything else refers to them (an
  item's `notes` says "Sharp"; a Class board names its school). Overrides and provenance
  work identically for them.
- **Prices can be variable.** The price list genuinely contains `4D6`, `X` and `*`
  alongside numbers and blanks, so `ItemDef` prices are `number | string | null` and
  arithmetic goes through `numericPrice()`/`buyPriceOf()`/`sellPriceOf()`, which return
  `null` — never 0 — for anything that isn't a fixed figure. A screen that wants to *show*
  the price reads the raw field. This is the same honest-gap rule as everywhere else: an
  unknown price must not become a free item in the market.
- **`_placeholder` now means two different things** and `readiness.ts` distinguishes them:
  `true` = the whole entity is fake (nothing in core v2 is, any more); an **array of field
  names** = the entity is real but those fields are untranscribed. A field list grades
  `partial`, never `placeholder`, and holds a board back from `ready` even when the app
  doesn't itself need the missing field — `Readiness.unverified` carries them.
- **A board's stat block can be `null`**, so `defaultStartingXp()` returns `number | null`
  and `partyCreationEvents` **omits** `startingXp` rather than sending 0. Sending 0 would
  be a claim about the board; omitting it leaves the projection's own default, which is a
  claim about the save.
- **`rules/difficulty.ts` is now cross-validated against the pack.** Its table was
  transcribed from rulebook prose; `core.json.difficultyTable` came from the spreadsheet.
  Two independent transcriptions of p.72, and they agree on every band boundary — the test
  in `difficulty.test.ts` asserts both sides of every cutover, so if either is ever
  miskeyed it fails loudly instead of drifting.

### The party builder is a real screen now

With 20 Adventurers and 25 Classes carrying real Guilder costs, the builder no longer
needs the placeholder opt-in to complete a party, and the toggle hides itself when there's
nothing to hide. Two consequences worth knowing:

- **Every board still grades `partial`** — the names and costs are real, the stat blocks
  and skill wheels aren't — so every card names the fields its board is missing. Nothing
  in the seed content grades `ready`, and the tests assert that rather than papering over
  it.
- **The Class dropdown starts unset on purpose.** Pairing a Class board with an Adventurer
  is a real decision at the table; pre-selecting the alphabetically-first Class would
  quietly make it for the player.

### The Rules tab (new)

`src/content/reference.ts` flattens all six reference sections into one searchable index
(`buildReferenceIndex`), and `RulesReference.vue` is presentation over it. The parts that
carry weight beyond "it searches":

- **`[icon: …]` markers render as visibly-unresolved chips, never as prose.** Those are
  the transcription's honest "couldn't identify this glyph" notes; letting them read as
  rules text would launder a gap into an answer. The screen also states how many entries
  still contain one, so the gap is countable rather than lurking.
- **Trait cross-links are resolved, not guessed.** An item note saying "Sharp, Ammo"
  becomes a button to the glossary entry — but only for names `library.abilities` actually
  defines. Matching is whole-word and case-sensitive, so "a sharpened stick" doesn't link.
- Search ANDs its terms (an OR search over a 273-item price list returns most of the book
  for any two-word query) and ranks title > group/subtitle > body, stable within a score.

### The one real content gap left: Class → skill/spell mapping

Which of the 43 skills a Class board grants, which school(s) a Magus draws from, which
innate abilities Syrio starts with. **This is not in the PDF** — it was checked page by
page: the Adventurer Dashboards page shows one example board to label the layout, and the
Adventurers/Classes sections (pp.114–129) are lore and portrait art only. The other 19
Adventurer boards and 24 Class boards exist only as physical cardboard. Paths, if picked
up later (decided with Adam 2026-08-18: **skipped for now**): photograph the 45 boards and
transcribe from photos; check for a Battle Systems digital companion tool; check a fan
wiki, with the same fan-source caveat as the spreadsheet.

Not blocking: party bookkeeping doesn't need to validate which skills a Class *should*
have — it records what's on the physical board in front of the player.

### Known soft spots (be aware, not blocking)

- **Unresolved `[icon: …]` markers** in spell/skill/ability text — a double-digit count,
  concentrated in a recurring "free-action" vs "spell-action" glyph pair that's worth
  resolving first since it affects the most entries. The Rules tab counts them for you.
- **`items[].notes` is compressed shorthand**, not full rules text (`"Combat (2,3,2),
  Re-Roll"`). A good hint for a future structured `combatStats`, not the final shape.
- Everything except the three rulebook Reference sections is **fan-sourced** (the
  calculator and crafting spreadsheets). Good enough to build and test against; spot-check
  against physical components before treating buy/sell costs as gospel.
- **Icon art** (the actual glyph images) is extractable from the PDF — each icon is its own
  raster object — but needs per-icon soft-mask compositing for clean transparency.
  Deferred (Adam's call, 2026-08-18); the UI uses text labels.

### Resolved earlier (design decisions that still hold)

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

Core v2 superseded the consequence this section originally recorded — a party used to be
uncompletable without opting into placeholder boards, because the only Class was fake.
Every board now has a real name and cost, so nothing is hidden and the opt-in doesn't
appear. The grading model itself is unchanged and still load-bearing: see "`_placeholder`
now means two different things" above for how a field-level list feeds it.

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

## Content packs

```
content/
├── core.json                  # schemaVersion 2 — see "The content pack got real" above
├── of-ale-and-adventure.json  # 56 crafting recipes + crafted-item stubs (v1)
├── the-forbidden-creed.json   # 2 crafting recipes + crafted-item stubs (v1)
└── oblivions-maw.json         # 10 crafting recipes + crafted-item stubs (v1, not owned)
```

Referential integrity is checked programmatically, not by eye: every `recipes[].itemId`
resolves to an `items[].id` in its own pack, every `recipes[].resources` key resolves to a
`craftingResources[].id` in `core.json`, and every id-keyed array is duplicate-free. A few
real duplicate item *names* in the source (Fungus is both a resource and a Restoratives
item; Chakri is both a weapon and armour; Studded Leather Armour has two rank tiers) are
disambiguated by `id` suffix while `name` stays exactly as sourced.

`oblivions-maw.json` is for an expansion nobody owns yet — it's the design doc §9 test
that a fourth pack drops in with zero code changes. Treat it as a fixture; deleting it
costs nothing.

### The three expansion packs — high confidence, narrow scope

Mechanically converted from the crafting spreadsheet, not reconstructed from OCR. Scope is
crafting recipes and crafted-item stubs only — no Adventurers, Classes or quests, because
that wasn't in the source and wasn't invented. Crafted stubs have `name`/`type`/`size`/
`sellPrice` and no combat stats: fine for crafting bookkeeping, not yet playable item data.

## What's NOT done

Content gaps:

1. **Class → skill/spell/ability mapping** — the one real gap, see above.
2. **Adventurer stat blocks** — 19 of 20 boards carry a real name and cost with a `null`
   stat block. Same fix as (1): photograph the physical boards.
3. **Adversaries, quests and Side Quests have zero seed content** (`adversaries: []`,
   `quests: []`). Not blocking Phase 1.
4. **Companion abilities** — names and costs only; the ability text is on the boards.

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
   already computes rank, caps and level-up eligibility, and the Rules tab's reference
   index (`content/reference.ts`) is the source for the skill/spell text it displays. It
   needs the projection extended beyond `xpFilled`/`inventory` — grow
   `CampaignState.AdventurerState` and the event union together, as
   `src/store/campaign/events.ts` says. Note the sheet will hit the untranscribed stat
   blocks head-on: 19 of 20 boards have `stats: null`, so it needs a way for the player to
   type their own board's numbers in — which is arguably the right answer anyway, and
   would close the content gap from the app instead of from a photo session.
2. **Base Camp (Camp tab)** — Stash, Renown track, storage, notes. Small, and it unblocks
   the Market step of the wizard. The 273-item price list is real now, so a Market screen
   has something to sell.
3. **Campaign Phase wizard** (Escape → Advancement → Market → Rest) — the rules engine has
   every calculation; this is the four-step flow over the top.

Two smaller things left deliberately undone, so they don't get mistaken for oversights:

- The Camp / Play / Log tabs render disabled in `CampaignShell.vue`. That's on purpose —
  the finished shape is visible without pretending the screens exist.
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
