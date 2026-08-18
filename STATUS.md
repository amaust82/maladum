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

## Status — updated 2026-08-19 (later)

**Phase 0 is complete; Phase 1 is under way.** Campaign management, the party builder
and the Rules reference are in. `npm run build` is clean and `npm test` is green:
**302 tests across 21 files**.

**Board transcription is essentially done.** Adam read the Class boards (24/25) and then
the Adventurer boards (16/20) straight off the components. Board data is no longer the
project's bottleneck — for the first time, most content grades `ready`.

How it got here: `core.json` became a **substantially real dataset** (schemaVersion 2)
from the rulebook and fan spreadsheets, and then Adam transcribed the boards themselves —
Classes on 2026-08-18/19, Adventurers on 2026-08-19 — closing what this file spent two
sessions calling "the one real content gap".

Outstanding, and flagged rather than guessed at: **Mentor** (Class), and **Callan /
Moranna / Nerinda** (Adventurer), plus **Syrio**, whose stats come from the rulebook's
worked example but whose physical board hasn't been read.

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
| `adventurers` | 20 (7 core + 13 in expansion packs) | **Real for 16 of 20** — stats, species, armour slots and a `boardGrants` track, transcribed from the physical boards. Callan/Moranna/Nerinda outstanding; Syrio has rulebook stats but an unread board |
| `classes` | 25 | **Real for 24 of 25** — skill wheel, stat bonuses, granted spells/abilities, board pairings, transcribed from the physical boards. Mentor outstanding |
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
- **Class skills are referenced by `name`, not `id`** (`ClassSkillRef` = `{ name,
  levelCap }`). Skills have no ids anywhere in the source and the skills reference section
  is already keyed by name, so the boards name them the way the rulebook does. This is what
  the Class transcription initially broke against — the schema had assumed `{ id, maxLevel }`
  from the design doc's sketch, and the doc was the stale side.
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

### Class boards: transcribed (2026-08-19)

Adam transcribed 24 of 25 Class boards straight off the components. Each board carries its
skill wheel (`skills[{ name, levelCap }]`), plus `statBonuses`, `grantedSpells`,
`grantedAbilities`, `spellSlots`, `boardCopies` and `pairedWith`. **Mentor is the only
board still outstanding**, and it stays flagged rather than guessed at.

This is the first content in the project to grade **`ready`** — the party builder now
badges Class boards Complete instead of listing gaps.

**The data checks out against itself**, which matters because the boards have no
machine-readable source anywhere — a typo can't be caught by re-reading the source, only
by the data disagreeing with itself. `src/content/integrity.test.ts` asserts, and all pass:

- all 43 skill names resolve to the rulebook skill reference, **and** all 43 reference
  skills are used by some board (no orphans either direction);
- every `grantedSpells` / `grantedAbilities` entry resolves to a transcribed spell/ability;
- `pairedWith` is symmetric, `boardCopies` equals the pairing count, and the inventory
  closes exactly — 40 sides ÷ 2 = 20 = the number of distinct pairings.

**What those tests do NOT catch** (verified by mutating the data and re-running, not
assumed): a skill wheel entry *dropped entirely* from one board. Every skill appears on at
least two boards, so the orphan check only fires if a skill vanishes from all of them, and
boards carry 6–10 skills with no fixed slot count, so there's no arithmetic to catch an
off-by-one. Irreducible without a second source — don't read a green suite as proof the
wheels are complete.

**One thing worth a second look:** Curator has 10 skills where every other board has 6–8.
Possibly real, possibly a transcription artefact. It's pinned by a test so that changing it
is a deliberate act rather than a silent edit.

**Open question for Adam:** `innateAbility` (singular) is `null` on every class that still
carries the key and absent on the rest, while `grantedAbilities` (array) holds the real
data. It looks superseded — but it's still in the schema, with a comment, rather than
deleted on a guess.

### Adventurer boards: transcribed (2026-08-19)

16 of 20 boards read off the components: real `stats`, `species`, `armourSlots`,
`hasDenizenSide`, plus a **`boardGrants`** track — what the character board hands out on
top of whatever Class it's paired with. Four boards outstanding (Callan, Moranna, Nerinda,
Syrio), still flagged.

`boardGrants` is a discriminated union on `type`, and every arm resolves against the
reference section it claims (`integrity.test.ts`):

| type | count | shape | resolves against |
| --- | --- | --- | --- |
| `skill` | 21 | `name` + `default` + `max` | the 43-skill reference |
| `ability` | 9 | `name` + optional `detail` | the icon/trait glossary |
| `spell` | 4 | `name` | transcribed spell names |
| `statBonus` | 2 | `text` | nothing — free board text, like `ClassDef.statBonuses` |

An `armorSlot` flag (11 of 36) marks grants printed on an armour-slot position rather than
the open track. That's board layout, and the character sheet needs it to render faithfully.

Board skill grants **stack on top of the Class wheel and are exempt from the rank cap**
(design §3, p.80) — worth remembering when the character sheet computes what's markable.

**A readiness bug this data exposed and fixed:** Moranna carries `armourSlots: 2` *and*
lists `armourSlots` in `_placeholder` — the 2 is a stand-in, not a reading. The badge used
to show `missing` fields *or* `unverified` ones, so it said "Unverified: species" and
presented that 2 as trustworthy. `describeReadiness` now names the union of both. A field
holding a distrusted value is exactly as unverified as a blank one.

Not blocking: party bookkeeping doesn't need to validate what a board *should* have — it
records what's on the physical board in front of the player.

### Adventurer boards now live in the pack for the product they ship in

13 of the 20 Adventurers are from expansions (`of-ale-and-adventure` 8,
`the-forbidden-creed` 5), not the core box, and they had been staged in `core.json`. They
now live in their own pack files — which is what the pack architecture is *for* (design
§0.2): someone with only the base game must not be shown 13 boards they don't own. Adam
owns both expansions so it was invisible locally, but it gets more expensive to unpick the
more content lands on top.

Those two packs moved to `schemaVersion: 2` and bumped `version` accordingly. No loader
change was needed — merging packs is what it already does.

Placement is **self-checking**: each board keeps its `expansion` field, and
`integrity.test.ts` asserts it matches the pack file the board actually sits in. The two
facts are maintained separately, so agreement between them is evidence rather than
tautology.

**Still missing, and the natural follow-on:** there's no notion of *which expansions you
own*. Everything bundled is loaded, so the split doesn't yet change what a player sees —
it just makes the fix possible without moving content again.

### Known but unmodelled: physical board availability

Class boards are double-sided — 25 classes on 20 boards, so `boardCopies`/`pairedWith`
cap what a party can actually field (Sellsword is on 5 boards, Assassin on 2; you can't
take Assassin and Guardian off the same board). **Recorded and integrity-checked, not
enforced** — Adam's call, 2026-08-19. It's a matching problem rather than a per-class
count, so it deserves its own change rather than a naive filter in the party builder.

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

1. **Four Adventurer boards** — Callan, Moranna, Nerinda (nothing read) and Syrio (rulebook
   stats, board unread). Everything else about them is real.
2. **The Mentor Class board** — the 1 of 25 not yet transcribed.
3. **Expansion ownership** — the packs are split by product now, but nothing lets a player
   say which expansions they own, so all bundled content still loads for everyone.
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
   `src/store/campaign/events.ts` says.

   **The Class board transcription changes the shape of this task.** The skill tree is now
   the best-supported part of the screen, not the worst: each board supplies its skill
   wheel with a real `levelCap` per slot, so "greyed above the rank cap" is a genuine
   computation against real data rather than a mock. Same for the spell list —
   `grantedSpells` names actual transcribed spells with full rules text behind them.

   The Adventurer side is now real too: `stats` gives the wax-seal rows their filled and
   potential marks, and `boardGrants` supplies what the character board itself grants —
   which **stacks on the Class wheel and is exempt from the rank cap** (p.80), so the two
   sources have to be rendered as distinct things, not summed into one number. Four boards
   are still untranscribed, so the sheet must degrade per-board via `readiness.ts` rather
   than assume `stats` is present.

   One design decision to settle when this starts (recorded in design.md §3): does a
   board-granted spell land in the Adventurer's `spells[]`, or stay derived at display
   time? Storing it is simpler to render but costs the log the ability to distinguish
   "granted by the board" from "learned with XP".
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
