# Maladum Campaign Companion — Design Document

**Status:** design draft, pre-implementation
**Game:** Maladum (Battle Systems) — grounded in the **Deluxe Maladum Rulebook**
(164pp., supersedes the Dungeons of Enveron starter rulebook v1.01)
**Target:** local-first web app (Vue 3 + TypeScript + Vite), installable as a PWA
**Date:** 2026-08-18 (updated: open questions resolved, content-pack priority and
licensing posture set — see Revision note (4). Design is now ready to hand off to
implementation.)

> **Revision note (1):** this draft was originally written against the Dungeons of Enveron
> starter-set rulebook. You've since replaced that source with the Deluxe rulebook, which
> is materially bigger — it adds a point-buy Character Creator, Companions/Apprentices,
> Crafting & Relics, Side Quests, Hidden Locations, optional GM mode, and full Skill/Spell/
> Icon references. §0.3 below covers what changed and what it means for scope. All page
> citations throughout the doc now refer to the Deluxe rulebook unless noted.
>
> **Revision note (2):** two more calls: no React (framework TBD per your answer — see
> §2.1), and a firm principle that **physical components stay physical.** Dice, Event
> Cards, equipment tokens, and Adventurer/Class board draws are never simulated —
> anywhere the rules called for a physical roll or draw, the app now asks what you rolled
> or drew and does the bookkeeping from there. See the new §1 principle and the reworked
> automation table in §0.1. This app supplements the table, it doesn't replace any part
> of it.
>
> **Revision note (3):** framework is **Vue 3** (§2.1). Separately, a second boundary
> alongside "physical stays physical": **don't make live in-game state a required mirror.**
> Health/Skill/Magic pegs, status counters, and the Dread tracker's pegs already update
> for free in real time — an experienced group doesn't need to also keep a phone in sync
> every hit or every round. New design principle #3 (§1) draws this line, and it cuts the
> live enemy roster and the always-on peg/Dread trackers from Phases 2–3 (§4). What
> survives there is on-demand lookups and calculators — the Adversary Arrival helper, the
> NPC AI walkthrough, the Dread band lookup — each consulted when it earns its keep, not
> kept in sync continuously. Between-game bookkeeping (Phase 1 — XP, Guilders, Renown,
> absences, inventory) is unaffected; that's still squarely the app's job.
>
> **Revision note (4):** the four open questions from §7 are answered — see that section
> for the detail, but in short: content-pack priority is Deluxe core → *Of Ale and
> Adventure* → *The Forbidden Creed* → *Oblivion's Maw* (owned later, schema ready now);
> play is mostly solo, which bumps the NPC AI walkthrough and a batched "resolve this
> round's NPCs" flow up in priority within Phase 3 (§4) and promotes the old "solo-play
> assistant mode" brainstorm item from Tier C to Tier B (§6); the table device varies
> between phone and tablet, so layouts need to be responsive rather than tablet-only; and
> audience is **just you for now** (friends may get access later, and any move toward
> public would come with a check-in with Battle Systems first, not before) — so §8's
> content-privacy posture stays exactly what it was, a "worth doing if this goes public"
> note rather than something to build for today. Real rulebook content can live in the
> repo as normal. Design is done for now; §9 has the concrete next step.
>
> **Revision note (5):** while transcribing the physical Class boards for `content/core.json`
> (skills granted, level caps, innate bonuses, granted spells — see `HANDOFF.md` for the
> full data breakdown), two things surfaced that change this doc:
> 1. **Class boards are physically double-sided and finite**, and this is now real data,
>    not a hypothetical. Each of the 20 double-sided Class boards pairs two specific
>    Classes back-to-back (`classes[].pairedWith`), and some Classes have multiple
>    physical copies (`classes[].boardCopies`, 1–5). This means "can I field three
>    Sellswords and a Prymorist at once" is a real physical constraint the party builder
>    can check, not just a Guilders-cost question — see the updated Phase 1 bullet and the
>    board-availability row in §0.1. `Mentor`, the one Class not yet accounted for in the
>    double-sided set, is suspected to live in *Oblivion's Maw* (unowned) rather than the
>    base 20 boards — the numbers only balance (20 boards × 2 sides = 40 slots) without it.
> 2. **Found the actual party-assembly budget rule** (p.70): default recommended budget is
>    **350 Guilders** for Adventurers + Classes combined (any limit is allowed, agreed with
>    the table), plus a separate **~50 Guilders recommended for starting equipment**;
>    unspent budget goes to the Stash. A party may contain any number of Adventurers total,
>    but only **up to 4** are taken into any single quest. This is now folded into the
>    Phase 1 party builder bullet below instead of being an open question.
> 3. **Two new brainstorm ideas from you, both promoted straight to design**: a
>    reverse/skill-first party composer (§6, Tier A #9), and an AI-assisted party-advisor
>    prompt/data export (§6, Tier B #10) — see those entries for the full shape.

---

## 0. Answering the two open questions

### 0.1 "What does a full digital companion look like?"

The useful ceiling is **not** "the app plays the game." A virtual board with grid,
line-of-sight and pathfinding is a different product — it competes with Tabletop
Simulator, it takes months, and it replaces the thing you actually bought the game for
(3D terrain and miniatures on a table).

The real ceiling is: **the miniatures stay on the table, and the app absorbs every
lookup, every table roll, and every piece of cross-game bookkeeping.**

Concretely, here is everything in Maladum that is mechanically automatable, and my
honest read on whether it's worth building:

Every row below now respects the boundary in design principle #2: the app never
generates a random outcome. Where the original draft had the app "rolling" something,
it now *asks what you rolled* and does the bookkeeping from that input.

| System | What automation looks like | Worth it? |
|---|---|---|
| **Escape Phase — Left for Dead** (p.78–79) | For each downed Adventurer, tell you to roll the Magic Die physically (and how many Wounded/Poisoned/Burning counters will modify it), take the result you report, apply the `-1` per counter and discard them, offer a Blessed re-roll (also physical — you roll, you report), then *persist the consequence* ("misses next 2 quests", "all equipment lost", "pay 5 × rank") | **Yes — highest value in the game.** These results have multi-game consequences everyone forgets. The app's job is entirely the bookkeeping after the roll. |
| **Rest Phase — Inn & Wilderness tables** (p.86–87) | Walk you through the table, prompting for each physical roll (including nested sub-rolls) as you make them, applying per-character effects (start next game Blessed / −1 Health peg / Wounded / Poisoned) and carrying them into the next quest's setup | **Yes.** Nested d6 tables with per-character targeting are exactly the kind of bookkeeping people get wrong by hand; the rolling itself stays entirely physical. |
| **Difficulty calculation** (p.72) | Sum Guilders value of all Adventurers across all parties (Class cost + character cost + buy price of carried equipment + 10 per rank beyond the first), look up the Novice/Veteran card counts | **Yes.** Pure arithmetic, no randomness involved at all — this was never a dice question. Tell the player "shuffle 3 Novice + 1 Veteran into your Event deck," then step back; you shuffle and draw the physical cards. |
| **Adversary Arrival** (p.42–43) | Given the current Dread band, read the band's icon list and tell you exactly what to roll (which dice, how many, for what purpose — combat dice for count, Magic Die for Entry Point, watching for the Revenant Die's "Risen from the Grave" face); take the results you report and tell you where they arrive. A one-line note goes into the quest record for the chronicle; the app does **not** keep an ongoing roster tracking their Health afterward — see principle #3. | **Yes, as a per-arrival lookup.** Happens every round, and the "what do I even roll here" lookup is the tedious part — not the rolling, and not tracking them once they're down. |
| **Dread Tracker** (p.8, 21, 34, 42) | No randomness involved, but it *is* a physical peg board that already updates for free every round — so the app doesn't try to auto-increment or mirror it. Instead it's an on-demand calculator: tell it your current peg count (glance at the board), and it shows the band, that band's arrival list, and whether you've hit Doom. | **Yes, as a lookup — not a live mirror** (principle #3). The value is "what does this band mean," not "count for me." |
| **Event Card count** (p.21, 72) | The difficulty calculation above tells you how many Novice/Veteran cards to shuffle into the physical Event deck before the game. That's the full extent of it. | **Yes, but scoped down from the original draft.** No digital deck, no simulated draws, no card text stored anywhere — the physical Event deck and its cards stay entirely on the table, exactly as printed. |
| **NPC AI Action Chart** (p.41) | The chart is a 6-node decision tree whose inputs (LoS? in reach? already moved? does the NPC's ranged attack roll more dice than its melee?) are all human eyeball judgments about the physical board and the printed stat cards. App asks them in order as yes/no taps and states the resulting action — no dice involved anywhere in this chart. | **Yes — the sweet spot.** It's a decision-tree *navigator* over facts you read off the table, not a simulator of anything. |
| **Enemy roster / peg tracking as a live mirror** | Track every NPC's current Health/Skill/Magic and status counters in the app, kept in sync with a tap every time a hit lands | **No, not as a default.** NPCs already have a physical tracking mechanism (counters/tokens on their board), same as Adventurers' pegs. Requiring a phone tap for every hit *in addition to* moving the physical counter is worse than the dry-wipe board this app is meant to replace — it's double bookkeeping, and it's exactly the tedium principle #3 exists to avoid. Cut from the default build; see the Phase 3 rewrite for what survives (a one-time arrival note, not an ongoing mirror) and where an opt-in detailed mode might still make sense for new players or solo play. |
| **Search token pouch** (p.14, 18–19, 28, 71) | No simulation, ever — the physical draw is the game. The app is a **pouch ledger**: it tracks which tokens have been added to (or removed from) the physical pouch across the campaign, since the rules require that state to persist between games. | **Yes, as a ledger only.** |
| **Random hire pool / board draws** (p.68–69, 82–83) | The rules have you shuffle your physical collection of unused Adventurer, Class, and Companion boards and draw from the top. The app can't and shouldn't replace that shuffle — but across a long campaign, remembering *which boards are already spoken for* (hired, dead, in another party) is real cognitive load. So: the app tracks board availability and tells you which physical boards are eligible to include in the shuffle; you shuffle and draw them yourself. As of the Class-board transcription (Revision note (5)) this is backed by real per-Class `boardCopies` and `pairedWith` data — Class boards are physically double-sided, so a board doing duty as one Class isn't available as its paired Class at the same time. The availability filter now needs to account for that pairing, not just a flat per-Class copy count. | **Yes, as an availability filter — not a randomizer.** |
| **Spell reference** (p.132–139) | Searchable spell list, auto-filtered to what each character actually knows at their current rank | **Yes.** Low effort, high daily use, nothing physical involved. |
| **Board state / LoS / movement** | Virtual grid | **No.** Out of scope. This is where the project dies. |

So "full digital companion" = everything in that table marked **Yes**, deliberately
excluding board state/LoS/movement (too big, replaces the game) and a live enemy-Health
mirror (too tedious, duplicates what physical counters already do for free — see
principle #3). What's left is still a real, finite, achievable product, built almost
entirely from occasional lookups and between-game bookkeeping. It's Phases 1–3 of the
roadmap in §4.

**My recommendation matches your instinct:** campaign bookkeeping is the MVP, the
in-game helper is Phase 2, and the encounter/NPC manager is Phase 3. Build them in that
order, ship each one, and you'll have a usable app after Phase 1 rather than a
half-finished simulator after six months.

### 0.2 "Expansion-ready vs. multiple players — isn't that just save slots?"

They're two unrelated axes, and only one of them is cheap.

**Axis A — content extensibility (option 2).** This is about *where game content lives*.
If Adventurer stats, Class skill trees, item costs, and quest definitions are hardcoded
in components, then adding *Vaults of Terror* or *Nightmares Upon Nightmares* means
editing code in fifty places. If they live in versioned JSON content packs
(`/content/core.json`, `/content/vaults-of-terror.json`) that the app loads and merges at
startup, adding a set is dropping in a file — or letting a user author one.

Cost if you do it from day one: **near zero.** Cost to retrofit later: **painful**, because
by then every screen has assumptions about which fields exist. This is the single
highest-leverage architectural decision in the project. Do it.

**Axis B — multi-player (option 3).** This splits into two very different things that
the original question conflated:

- **Multiple parties in one campaign, on one device.** Maladum explicitly supports this —
  the difficulty calc sums across *all* parties, the Market Phase has a pick-order rule
  for the winner of the last quest, and there's a barter system between players. This is
  *just data modelling*: `Campaign` has many `Party`, `Party` has many `Adventurer`.
  Cost: near zero if modelled up front. **Do this.**
- **Multiple players on different devices, synced.** This is a server, accounts, auth,
  conflict resolution, and an ops burden. It is a genuinely different project.
  **Defer this** — but see §2.3, because the event-sourced store makes it a bolt-on
  later rather than a rewrite.

And **save slots** (multiple independent campaigns, plus export/import to a JSON file)
are a third thing again — that's just "the store has a collection of campaign documents
instead of one." Trivial. Include it in the MVP; it also gives you backup, which matters
a lot when the only copy of a 20-session campaign lives in one browser's IndexedDB.

**Verdict:** build local-first, model `Campaign → Party → Adventurer` from day one, put
all game content in JSON packs, support multiple saved campaigns with export/import, and
skip the server.

### 0.3 What the Deluxe rulebook changes

The core loop is identical — same five campaign systems (Escape, Advancement, Market,
Rest, plus in-game Dread/round structure), same formulas, same page-for-page structure,
just renumbered (Campaigns is now p.76–87, not p.59–67). Nothing in §§1–5 above needed
correcting on the mechanics you already had. What's new is five additional systems, all
of which are official rules (not homebrew), and all of which fit the existing
content-pack + event-store architecture without a redesign:

| New system | Where | What it is | Where it lands in this doc |
|---|---|---|---|
| **Crafting & Relics** | p.84–85 | Artisan's Guild, Market Phase. Discard resource tokens matching an item's recipe (icons, not Guilders) + pay a Guilder fee equal to the item's sell price → get an Exclusive-rarity item that can't be bought or found any other way. Crafted items count at **double their sell price** toward party value for difficulty purposes. Relics are crafted items that additionally require a unique rare resource token. | Folded into the Market Phase step of the Campaign Phase wizard (Phase 1). New `CraftingResource`/`Recipe`/`Relic` entities below. |
| **Companions & Apprentices** | p.61–63 | A new character type — pets, summons, hired specialists — assigned to a "master" Adventurer, don't count toward the 4-Adventurer party limit, have their own small XP track and Health pool (no dashboard, defeated = removed, not revivable), flat upkeep of 1 (2 if their upgrade slot is punched). Apprentices are hired as untrained civilians at ¼ cost and "graduate" into full Adventurers once they fill XP row 1. | New `Companion` entity, party model gains `companions: Companion[]`. Tracked in Phase 1 (party builder, upkeep) and shown on the Party screen. |
| **Character Creation** | p.94–96 | A full point-buy system for building custom Adventurers from scratch — explicit min/max/cost tables for every statistic, XP-rank allocation, and innate abilities, all rolling up into an auto-computed Guilder cost. This is Battle Systems' own system, not fan homebrew. | This changes the calculus on the old Tier C "custom content editor" idea — see the updated brainstorm below. It's now a first-class feature, not a stretch goal. |
| **Side Quests & Hidden Locations** | p.73–75 | Side Quests are cards picked up (often via the Inn in the Rest Phase) that persist across games until completed or discarded, with their own objective and reward. Hidden Locations add optional rooms to a quest map, found via specific terrain triggers. | Side Quests need campaign-level state (`activeSideQuests` on `Party`, resolved like a mini quest log entry). Hidden Locations are quest-authoring content — schema-only, no new engine logic. |
| **Game Master (GM) mode** | p.88 (Advanced Rules) | An entirely optional, non-mechanical layer: one player narrates and manually controls all NPCs/Adversaries instead of using the automated NPC AI chart and Dread-driven arrivals. No dice-table automation is prescribed — it's explicitly "the GM's decision" throughout. | Doesn't add engine work. It does mean Phase 3 (NPC AI walkthrough, automated arrivals) should have a **"GM is running this"** toggle that just hides those automated panels rather than forcing them. Cheap to add, worth doing since it's a real, commonly-used mode. |

**A data source worth noting:** your project folder also has `Maladum Crafting Sheet
Template V4.xlsx` — a fan-made spreadsheet already transcribing ~68 craftable items with
their resource recipes (as short codes like `WT`, `HFF`), sell prices, sizes and rarities,
plus a resource-cost table (Wood 4, Steel 5 … up to Extract of Maladite at 25 and a
Necrotic Fluids entry sourced from *Oblivion's Maw*). It spans content from three
expansions — **Of Ale and Adventure**, **Oblivion's Maw**, and **The Forbidden Creed** —
which answers the open "do you own expansions?" question in §7 at least partially: there's
already a reason to plan for them. This spreadsheet is a genuinely useful seed for the
`content/*.json` crafting recipe data (§3.1) — a one-off script can convert its rows
straight into `RecipeDef` / `CraftingResourceDef` entries rather than hand-transcribing
from the rulebook.

None of this changes the phased roadmap's shape — bookkeeping first, in-game helper
second, encounter/NPC manager third. It does add scope *inside* Phase 1 (Crafting,
Companions/Apprentices, Side Quests all belong in the Campaign Phase wizard and party
model from day one, since they're core rules, not expansion content) and it promotes one
Tier-C brainstorm idea to Tier B. See the domain model (§3), roadmap (§4), and brainstorm
(§6) updates below — each is marked with a **[Deluxe]** tag where it changed.

---

## 1. Product definition

**What it is:** a local-first companion app that replaces the dry-wipe Base Camp board,
character boards and Class boards with a persistent digital record, and progressively
takes over the fiddly at-the-table procedures.

**What it is not:** a rules PDF viewer, a virtual tabletop, or a replacement for owning
the game.

**Design principles**

1. **The table is the source of truth.** The app never blocks play. Every automated value
   is manually overridable — if the app and the table disagree, the table wins and the
   app must accept the correction without complaint.
2. **Physical components stay physical.** This is the line between "supplement" and
   "replace." Dice, Event Cards, equipment tokens, and Adventurer/Class board draws are
   never simulated by the app, full stop — no virtual die, no digital card deck, no
   randomized token pull, no auto-drawn hire pool. Anywhere the rules call for a physical
   roll or a physical draw, the app's job is to (a) tell you what to roll or draw and why,
   and (b) take the result as an input and do the bookkeeping from there. If a feature
   idea ever amounts to "the app generates a random outcome that used to come from a
   physical object," it's out of scope — see the reworked automation table in §0.1 for
   how this plays out system by system.
3. **Reference, not a required mirror.** Don't make the player re-enter state that
   already has a fast, free, physical answer. Health/Skill/Magic pegs, status counters,
   and the Dread tracker's black pegs already update in real time for the cost of moving
   a peg — an experienced player doesn't look at a screen to know their Health, they look
   at the board in front of them. If a feature would require tapping the app every time a
   hit lands or every round ticks over, it fails this test by default: either cut it,
   make it strictly opt-in (clearly labelled, off unless turned on), or reshape it into
   something consulted occasionally rather than kept in sync continuously. This is a
   different failure mode than principle #2 — it's not about randomness, it's about not
   turning "supplement" into "double bookkeeping." See §0.1's revised take on in-game
   tracking and the Phase 2/3 rewrite in §4 for how this plays out.
4. **Thumb-first.** The primary device is a phone or tablet propped next to the terrain,
   used one-handed, often in dim light. Large tap targets, dark theme default, no hover.
5. **Never lose a campaign.** Autosave on every mutation, full undo, and an export button
   that produces a single self-contained JSON file.
6. **Zero setup cost per session.** Opening the app on game night should put you one tap
   from "start next quest" with the whole party state already loaded.
7. **Content is data.** No game rule that varies by expansion is written in TypeScript.

**A test for scope, in one sentence:** campaign state that's touched a handful of times
per session and easily forgotten across the days/weeks between games (XP, Guilders,
Renown, absences, inventory, Side Quests) belongs in the app; in-game state that's
touched every round or every hit and already has a fluid physical mechanism (pegs,
counters, dry-wipe marks) does not, by default.

---

## 2. Architecture

### 2.1 Stack

```
Vue 3 (Composition API) + TypeScript
Vite (build + dev server)
Pinia             — UI/app state
Dexie (IndexedDB) — persistence
Zod               — content pack + save file validation
Tailwind CSS      — styling
vite-plugin-pwa   — installable, offline-capable
Vitest            — unit tests for the rules engine
```

Vue over Angular/Svelte: closest thing to a safe middle ground here. Its docs and learning
curve are gentler than Angular's for the odd occasion you do want to read or tweak a
component, its official tooling (Vite, Pinia, Vue Router) is first-party and well
maintained, and — unlike Angular's DI/module/RxJS ceremony — a Composition API component
reads close to plain TypeScript, which matters when most of this app's value is in the
`rules/` and `store/` layers rather than the views.

Rationale: no backend means no accounts, no hosting cost, no privacy question, and it
works on a table in a basement with no wifi. A PWA installs to the home screen on both
iOS and Android and gets a real app icon, which is most of what "native" buys you here.

**Persistence caveat:** browser-managed IndexedDB *can* be evicted under storage pressure,
especially on iOS. Mitigations: call `navigator.storage.persist()` on first campaign
creation, and nag for an export after every completed quest. Do not treat "it's in
IndexedDB" as durable.

### 2.2 Layering

```
┌─────────────────────────────────────────────┐
│ UI (Vue components, routes, screens)        │
├─────────────────────────────────────────────┤
│ Application services                        │
│  campaignService, phaseService,             │
│  encounterService, contentService           │
├─────────────────────────────────────────────┤
│ Rules engine  ← pure functions, no I/O      │
│  difficulty, xp/rank, upkeep, dread,        │
│  escape/rest tables, npc decision tree      │
├─────────────────────────────────────────────┤
│ Event store (append-only) + projections     │
├─────────────────────────────────────────────┤
│ Dexie / IndexedDB     │  Content packs (JSON)│
└─────────────────────────────────────────────┘
```

The **rules engine is pure and separately testable**. Every function takes state and
returns new state or a computed value; nothing touches the DOM or storage. This is what
makes the app trustworthy — you can unit-test "party value 605 with two rank-3 characters
yields 2 Veteran cards" without rendering anything.

### 2.3 Event-sourced store (the key decision)

Every mutation is recorded as an append-only event:

```ts
type CampaignEvent =
  | { t: 'RENOWN_GAINED';   partyId: Id; amount: number; source: string }
  | { t: 'XP_GAINED';       advId: Id; amount: number; reason: XpReason }
  | { t: 'XP_SPENT';        advId: Id; target: SkillRef | SpellRef | StatRef }
  | { t: 'ITEM_ACQUIRED';   advId: Id | null; itemId: Id; via: 'found'|'bought'|'reward' }
  | { t: 'ADVENTURER_DOWN'; advId: Id; questId: Id }
  | { t: 'ESCAPE_ROLLED';   advId: Id; roll: number; modifiers: number; result: EscapeResult }
  //   roll: the value the player reports after a physical Magic Die roll — never generated by the app
  | { t: 'REST_RESOLVED';   lodging: 'inn'|'wilderness'; rolls: number[]; effects: Effect[] }
  //   rolls: same — physical rolls reported in sequence as the table calls for them
  | { t: 'QUEST_COMPLETED'; questId: Id; objectives: ObjectiveResult[] }
  // ...
```

Current state is a projection (a fold) over the event log. This buys four things for the
price of one:

1. **Undo/redo for free** — critical, because people mistap constantly at a game table.
2. **A campaign chronicle for free** — the event log *is* the story of your campaign.
   Render it as a timeline, and you get the "party saga" feature in §6 with no extra
   data model.
3. **Auditability** — "why does Syrio have 4 Health?" is answerable by scrolling the log.
4. **A sync path later** — event logs merge far more gracefully than mutable documents.
   If you ever do want multi-device, this is the difference between a feature and a
   rewrite.

Cost: modest discipline up front, and you must snapshot the projection periodically so a
200-session campaign doesn't replay 10,000 events on load. Snapshot every 100 events.

### 2.4 Content packs

A pack is one JSON file under `content/`, merged by id at load time and validated with
Zod (`src/content/schema.ts`). `core` merges first, then expansions alphabetically; a
later pack overriding an earlier id wins, and the override is recorded as a warning rather
than a silent replacement.

```jsonc
// content/core.json
{
  "id": "core",
  "name": "Maladum Deluxe (Core)",
  "schemaVersion": 2,          // shape — gates parsing
  "version": 3,                // content revision — bumps when a value is corrected

  // ── Boards ──────────────────────────────────────────────────────────────
  "adventurers": [
    { "id": "syrio", "name": "Syrio", "species": "...", "cost": 64,
      "stats": { "health": { "default": 4, "max": 6 },
                 "skill":  { "default": 1, "max": 4 },
                 "magic":  { "default": 1, "max": 4 },
                 "actions":{ "default": 2, "max": 2 },
                 "xp":     { "default": 3, "max": 16 } },
      "innateAbilities": ["..."], "armourSlots": 2, "hasDenizenSide": true,
      "_placeholder": ["species", "armourSlots"],   // see "Honest gaps" below
      "_verified": "stats: Deluxe rulebook worked example" }
  ],
  "classes": [
    { "id": "assassin", "name": "Assassin", "cost": 13,
      // Skill wheel. Referenced by NAME, not id — skills have no ids in the source.
      // levelCap is how far this board may mark that skill (3 unless it prints less).
      "skills": [ { "name": "Reflexes", "levelCap": 3 },
                  { "name": "Malacyte Mastery", "levelCap": 1 } ],
      "statBonuses": ["+1 Melee Die"],          // board text, deliberately unstructured
      "grantedSpells": ["Strength"],            // → spells[].levels[].spells[].name
      "grantedAbilities": [ { "name": "Scramble", "detail": "2/3" } ],  // → abilities[].name
      "spellSlots": null,                       // spell-track slots; null = no track
      "boardCopies": 2,                         // physical copies — see "board inventory"
      "pairedWith": ["Guardian", "Curator"],    // reverse side of each copy
      "innateAbility": null,                    // appears superseded by grantedAbilities
      "spellSchools": [] }
  ],
  "companions": [ { "id": "astet", "name": "Astet", "cost": 37 } ],

  // ── Market / loot ───────────────────────────────────────────────────────
  "items": [
    { "id": "dagger", "name": "Dagger", "type": "Weapons - Melee", "rank": "Rank 1",
      "rarity": "common", "buyCost": 2, "sellPrice": 1, "notes": "Combat 1",
      "size": "XS", "craftedOnly": false, "breakable": true }
  ],
  "craftingResources": [ { "id": "wood", "name": "Wood", "symbol": "...",
                           "rarity": "common", "buyCost": 2 } ],
  "recipes": [ { "itemId": "...", "resources": { "wood": 1 }, "isRelic": false } ],

  // ── Reference sections (rulebook appendices; no ids in the source) ──────
  "spells": [
    { "name": "Proximate", "targeting": "...",
      "levels": [ { "level": 1, "spells": [ { "name": "Healing", "text": "...",
                                             "passive": false } ] } ] }
  ],
  "skills": [
    { "name": "Agility Skills",
      "skills": [ { "name": "Acrobatics",
                    "levels": [ { "level": 1, "text": "..." } ] } ] }
  ],
  "abilities":  [ { "name": "Sharp", "text": "..." } ],   // the icon/trait glossary
  "itemLore":   [ { "name": "Potions", "text": "..." } ], // the "Item Notes" appendix
  "difficultyTable": [ { "band": 1, "min": 0, "max": 300, "novice": 5, "veteran": 0 } ],

  // ── Play content ────────────────────────────────────────────────────────
  "adversaries": [ { "id": "revenants", "members": ["lamentor","myria","hellfont","rot-troll"],
                     "dreadBoards": [ { "side": "A", "bands": [ /* arrival specs */ ] } ] } ],
  "quests": [ { "id": "...", "dreadStart": 3, "dreadBoard": "revenants/A",
                "objectives": [...], "rewards": {...}, "searchAllocation": {...},
                "keyItems": [...], "cardTypes": ["environment","dungeon","revenants"] } ]
}
```

**Two version numbers, deliberately.** `schemaVersion` describes the *shape* and gates
parsing — a pack above `SUPPORTED_SCHEMA_VERSION` is refused rather than parsed
optimistically. `version` is the *content revision* and bumps when a transcribed value is
corrected. A save records both (§3, `Campaign.contentPacks`), so a content upgrade under
an existing campaign is a warning while a downgrade or shape change is an error. Nothing
auto-repairs: the app reports and the player decides.

**Some reference entities have no ids, and shouldn't be given one.** Spell schools, skill
categories, the icon/trait glossary and the Item Notes appendix are published by the
rulebook as prose sections keyed only by name — and `name` is also how the rest of the
data refers to them (an item's `notes` says "Sharp"; a Class board names its school). They
merge by `name`; everything else merges by `id`. Minting synthetic ids for them would add
a second identifier that nothing in the source uses.

**The reference sections are the definitions everything else points at.** `abilities` in
particular is the single place a trait like Sharp, Cleave or Cumbersome is defined; item
`notes`, skill level text and spell text all name traits from it. Resolving those
references is a lookup, never an inference — a name the glossary doesn't define stays
plain text rather than becoming a broken link.

**Prices are not always numbers.** The market list genuinely contains variable prices
(`"4D6"`, `"X"`, `"*"`) alongside fixed ones and blanks, so a price is
`number | string | null`. Arithmetic goes through `numericPrice()`, which yields `null`
for anything that isn't a fixed figure; screens that merely *display* a price show the raw
value. A variable price must never be coerced to 0, or a free item appears in the market.

#### Honest gaps in a pack

Content is transcribed from physical components and fan-made sources, so a pack has to be
able to say "this part isn't known" without either omitting the entity or inventing a
value. Two annotations do that, and they mean different things:

- `"_placeholder": true` — the **whole entity** is a structural stand-in. Valid shape,
  fake content. Hidden from every picker behind an explicit opt-in.
- `"_placeholder": ["species", "stats"]` — the entity is **real**, but those fields are
  untranscribed. Selectable and usable, badged, with the field names shown.
- `"_verified": "..."` — provenance for the fields that *are* trustworthy.

`src/content/readiness.ts` turns these into a `ready` / `partial` / `placeholder` grade so
every screen agrees on which numbers can be trusted. A field-level list grades `partial`,
never `placeholder`, and holds an entity back from `ready` even when the app doesn't
currently need the missing field — "we haven't checked" is not the same as "it's fine".

The load-bearing consequence, which every feature must preserve: **an unknown number never
becomes 0.** A missing cost travels as `null` from the pack through the rules engine to the
screen, which reports a lower bound ("at least 120 Guilders · 1 unknown cost") rather than
a total that looks exact. A check that can't be performed produces a warning, never a
green tick.

The same principle applies inside transcribed text: where a rulebook glyph couldn't be
identified, the text carries a literal `[icon: dice showing 2 and 3]` marker. Screens
render those as visibly-unresolved chips, never as prose — letting an unconfirmed glyph
read as rules text would launder a gap into an answer.

#### Board data is per-board configuration, not reference data

Which skills a Class board grants, which spells it hands out, and which stats a named
Adventurer starts with are **printed on the physical components** and are not reproduced
anywhere in the rulebook PDF — its Adventurers and Classes sections are lore and portrait
art, and only one example board is shown, to label the layout. So this data can only ever
arrive by transcription from the cardboard, board by board.

**All 45 boards are transcribed** as of 2026-08-19 — 25 Class, 20 Adventurer. Syrio is the
one board with two independent sources (the rulebook's p.6 worked example and a reading of
the component); they agreed on all five stats, which is the only direct evidence available
that the transcription method itself is accurate.

`_placeholder` on each entity remains the authoritative record of what's known, not this
paragraph — it's empty everywhere today, and a correction that blanks a field must set it
again rather than leaving a stale value in place.

Two design consequences, and they outlive the gap that prompted them — which is the point
of writing them down here rather than in STATUS.md:

1. **No feature may assume board data is populated.** A screen reads `_placeholder` (via
   `readiness.ts`) and degrades, rather than branching on which specific boards happen to
   be transcribed today.
2. **The app validates what the player records, not what a board "should" have.** Party
   bookkeeping needs to know what is on the cardboard in front of the player; second-
   guessing it against a transcription would make the app wrong whenever the transcription
   is. Transcribed data drives *display and convenience*, never *permission*.

Transcription proceeds a board at a time: clearing a field name out of `_placeholder` is
the whole migration, and the reverse is just as cheap when a reading turns out to be wrong.

#### Which product a board comes from is a field, not a file

An Adventurer board records its product in `expansion` (`core` or an expansion pack id).
13 of the 20 boards ship in expansions, and that tag — not which pack file the board sits
in — is what an ownership filter should read.

This was tried the other way first: the expansion boards were moved into their own pack
files, which is the obvious reading of §0.2. It was wrong, for a workflow reason worth
recording so it isn't retried. `core.json` is **regenerated wholesale** from the
transcription pipeline and always contains every board, so a file-based split is undone on
the next regeneration — and because expansion packs merge *last*, their now-stale copies
won the merge and silently reverted corrections already made in core. That was observed
for real: a board whose ability grant had been confirmed reverted to the earlier
`UNCONFIRMED` guess.

The general rule this is an instance of: **derived organization must not live somewhere
the generator will overwrite.** Where a fact is maintained by a pipeline, the app reads it
from where the pipeline puts it.

Ownership filtering itself is not built yet — every bundled pack still loads for everyone.
The tag is what makes it a small change when it is.

#### Physical board inventory — enforced as a warning

Class boards are **double-sided**: 25 classes live on 24 physical boards. `boardCopies`
records how many boards a class appears on and `pairedWith` names the class on the reverse
of each, one entry per copy. Sellsword is on 5 boards, Ranger on 3, most on 1–2.

This encodes a real constraint: **a party's Class picks must be simultaneously seatable.**
No party can field more copies of a class than exist, and two Adventurers can't both take
Assassin and Guardian off the same board.

It is **a matching problem, not a per-class count**, and the distinction is not academic.
Assassin and Guardian share a board, so a naive count flags them — but Assassin is *also*
paired with Curator, so the pair is seatable by putting Assassin on the Curator board. The
naive check produces a false alarm on a legal party. `rules/boardAvailability.ts` builds
the inventory from `pairedWith` and solves the assignment with Kuhn's algorithm.

**It reports a warning, never a block** — the same rule as everywhere else here:
transcribed data drives display and convenience, never permission. The inventory is
transcribed from cardboard, and if it were wrong, refusing to save would make the app wrong
about a party physically sitting on the table. For the same reason, ambiguous data resolves
*toward* availability: an asymmetric pairing rounds the board count up, and a class with no
board data is excluded from the check rather than assumed unavailable. A false "you can't
do that" is a worse failure here than a missed warning.

---

## 3. Domain model

```ts
interface Campaign {
  id: Id;
  name: string;
  contentPacks: { id: string; version: number }[];
  parties: Party[];
  questLog: QuestRecord[];
  pouch: PouchState;          // persists between games, per p.59
  achievements: AchievementRecord[];
  createdAt: number;
  events: CampaignEvent[];    // the log
}

interface Party {
  id: Id; name: string; ownerLabel?: string;   // for multi-party at one table
  adventurers: Adventurer[];
  companions: Companion[];      // [Deluxe] p.61-63
  stash: number;               // Guilders
  renown: number;              // 0..12, hard clamped
  baseCampStorage: ItemRef[];
  secureStorageUnlocked: boolean;   // punched out after paying for an Inn
  activeSideQuests: SideQuestRecord[];   // [Deluxe] p.73-75
  notes: string;
}

// [Deluxe] p.61-63 — pets, summons, hired specialists. No dashboard; Health
// is tracked like an NPC's (pool, not pegs). Not left in play / not revivable
// once defeated. Doesn't count toward the 4-Adventurer QUEST ROSTER (p.68 —
// party size itself is unlimited; the 4 is how many go on any one quest).
interface Companion {
  id: Id;
  companionId: string;          // → content pack
  masterId: Id;                 // the Adventurer this Companion accompanies
  kind: 'companion' | 'apprentice';
  health: { current: number; max: number };
  xpFilled: number;
  upgradeSlotPunched: boolean;  // unlocks after XP track fills; +1 upkeep
  upgradeInsertId?: string;
  inventory: ItemRef[];         // small, punch-out sections only
  hireType: 'permanent' | 'temporary';
  // Apprentice-only: once xpFilled completes row 1, "graduate" — the app
  // should prompt to convert this into a full Adventurer (assign Class,
  // wipe XP track) rather than modelling graduation as a separate state.
}

// [Deluxe] p.73-75 — persists across games until completed or discarded.
interface SideQuestRecord {
  id: Id; sideQuestId: string;  // → content pack
  acquiredOnQuest: number;
  status: 'active' | 'completed' | 'discarded';
}

interface Adventurer {
  id: Id;
  characterId: string;          // → content pack
  classId: string;              // → content pack
  displayName: string;

  stats: Record<StatKey, { default: number; current: number; max: number }>;
  //   StatKey = 'health' | 'skill' | 'magic' | 'actions' | 'xp'

  xpFilled: number;             // spaces filled on the XP track
  rank: number;                 // derived: rows with ≥1 filled space
  // SkillId is the skill's *name* ("Acrobatics") — the reference sections carry no
  // ids and the Class boards name skills the same way. See §2.4.
  // Both numbers are stored and MUST NOT be summed into one: Class marks are capped at
  // rank, character-board marks are exempt and stack on top "even if the total exceeds
  // your character's rank" (p.80). Only the caps are derivable, not the marks.
  skills:  Record<SkillId, { charBoard: number; classBoard: number }>;
  // RESOLVED (character sheet, 2026-08-19): `spells` holds ONLY spells the player
  // marked on the spell track. Board grants — `ClassDef.grantedSpells` and character
  // `boardGrants` — are a pure function of characterId/classId, so they are derived at
  // display time, never stored: storing them would duplicate the pack and could drift
  // from it after a transcription fix. The `source` flag lives in the view model.
  // Spell names are globally unique across all four schools, so a name is a valid key.
  spells:  SpellId[];
  spellTrackFilled: number;

  inventory: ItemRef[];         // size-limited, mirrors the physical tray
  armourSlots: (ItemRef | null)[];

  status: {
    absentUntilQuest?: number;    // "misses next N quests" from Escape/Rest
    startNextGame: StatusCounter[]; // Blessed / Wounded / Poisoned carried in
    pegPenalties: Partial<Record<'health'|'skill'|'magic', number>>;
  };

  hireType: 'permanent' | 'temporary';
  recruitedOnQuest: number;
  alive: boolean;
}

interface QuestRecord {
  id: Id; questId: string; playedAt: number;
  parties: Id[];
  partyValueAtStart: number;
  novice: number; veteran: number;      // computed difficulty
  outcome: 'primary-complete' | 'failed' | 'partial';
  objectivesCompleted: string[];
  rounds: number;
  finalDread: number;
  downed: Id[]; escaped: Id[];
  rescueMissionPlayed: boolean;
  renownGained: number; guildersGained: number;
  photos?: BlobRef[];
  notes: string;
}

interface PouchState {
  // rules p.71 (Deluxe): unfound rare/uncommon items stay in the pouch between games
  contents: Record<ItemId, number>;
  addedThisCampaign: ItemId[];
}
```

### 3.1 Crafting content shape [Deluxe]

Crafting isn't Guilder-priced like normal items — it's recipe-priced (resource token
icons) plus a Guilder fee equal to the crafted item's sell price. This needs its own
content-pack shape and its own event:

```ts
// content pack additions
// `symbol` (not `icon`) — matches the crafting spreadsheet the seed data came from.
// `buyCost: null` = found in play only, never purchasable (e.g. Necrotic Fluids).
interface CraftingResourceDef {
  id: string; name: string; symbol: string;
  rarity: Rarity; buyCost?: number | null; notes?: string;
}
interface RecipeDef {
  itemId: string;                          // the crafted item this unlocks
  resources: Partial<Record<CraftingResourceId, number>>;  // e.g. { fungus: 1, minerals: 1 }
  isRelic: boolean;                         // relics additionally need a unique rare token
  uniqueResourceId?: string;                // set when isRelic
}

// event
| { t: 'ITEM_CRAFTED'; advId: Id; itemId: Id; resourcesSpent: ItemRef[]; feeCost: number }
```

Rules engine function `canCraft(recipe, availableResources, stash) → { ok, missing, fee }`
checks the party holds resource tokens covering the recipe (partial icon overflow on a
token is lost, matching the rulebook's Starstrike Flail example) and that Stash covers
the fee. Party-value contribution for a crafted item is `sellPrice × 2` (p.85) — flag this
in the difficulty calculator, since it's the one place a crafted item's value differs
from a bought item's.

### Derived values the rules engine must compute

| Value | Rule | Source (Deluxe) |
|---|---|---|
| `rank` | number of XP rows with ≥1 filled space | p.80 |
| Skill level cap | may only mark Class-board skills up to current rank; char-board spaces are exempt and stack. **Usable level is capped at 3 however it was reached**, and armour covering a slot-printed skill reduces it | p.80, p.32 |
| Carrying capacity | **not a number** — "the character cannot carry more than the tray can hold". Token size is inventory space; capacity is physical, so the app tallies and never enforces | p.7, p.14 |
| Armour slots | punched out of the character board; armour's rules apply only while in a slot, and punching out covers whatever is printed there | p.6, p.30, p.32 |
| Spell level cap | may only learn spells of level ≤ rank | p.80 |
| XP gain eligibility | rows 1–2: survive + escape. rows 3–4: survive + party completed primary objective. row 5: special feats only | p.80 |
| Level-up bonus | row 1: +1 to one of H/M/S · row 2: +1 to one · row 3: +1 to any two · rows 4–5: +1 to any two stats — capped by the board's potential spaces | p.81 |
| Starting budget | Agreed by the players, covering character + Class boards **and starting equipment** from one purse. No fixed figure in the rules: ~350 recommended, of which ~50 for equipment. Unused budget becomes the opening Stash. | p.68 |
| Quest roster | Up to **4** Adventurers per quest. **Party size itself is unlimited** — "a party can contain any number of Adventurers". | p.68, p.20 |
| Party value | Σ (character cost + class cost + buy price of carried equipment) + 10 per rank beyond the first, across **all** parties. Crafted items count at **double sell price**, not buy price. | p.72, p.85 |
| Novice/Veteran cards | lookup table on party value (0–300 → 5/0 … 2251+ → 0/10) | p.72 |
| Upkeep | Adventurers: 1 Guilder per rank, +1 if they took part in the most recent quest; newly hired this phase are exempt. Companions: flat 1 (2 if upgrade slot punched). | p.83 |
| Valuable item cap | each Adventurer may buy one item worth up to 10 × their rank per Market Phase; unlimited items ≤10; +1 unrestricted purchase per rare item sold; +1 per Renown spent | p.82, p.72 |
| Repair cost | common 1 / uncommon 3 / rare 5 | p.84 |
| Temporary hire cost | ¼ normal cost, rounded up (Adventurers & Companions) | p.83 |
| Apprentice hire cost | ¼ normal cost, rounded up; graduates to full Adventurer on completing XP row 1 | p.63 |
| NPC permanent hire | ½ normal cost incl. Class, rounded up | p.83 |
| Renown clamp | 0 ≤ renown ≤ 12 | p.72 |
| Escape roll modifier | −1 per Wounded/Poisoned/Burning counter, then discard them; Blessed allows a re-roll | p.78 |
| Craft fee | pay Guilders equal to the crafted item's **sell** price, plus discard resource tokens matching the recipe (excess icons on a token are wasted) | p.84–85 |
| Character Creation cost | point-buy across Health/Skill/Magic/Actions/XP-rank spaces + up to 3 innate abilities, summed to a hire cost — see the min/max/cost tables on p.94–96 | p.94–96 |

---

## 4. Phased roadmap

### Phase 0 — Foundation (no user-visible features)

- Vite + React + TS + Tailwind scaffold, PWA manifest, dark theme
- Content pack schema + Zod validators + core pack loader
- Event store, projection engine, snapshotting, undo stack
- Dexie schema + export/import to a single JSON file
- Rules engine module with tests for every derived value in the table above

**Do not skip the tests here.** Every later feature trusts these numbers.

### Phase 1 — MVP: Campaign bookkeeping

This is the dry-wipe board replacement. Ship this and stop; it's already useful.

- **Campaign management** — create/list/duplicate/delete campaigns, export/import
- **Party builder** — pick Adventurer + Class boards, auto-fill default XP spaces, assign
  starting skills/spells, validate against Guilders. Default budget **350** for
  Adventurers + Classes combined (p.70), separately-tracked **~50** recommended for
  starting equipment, both editable — any limit is fine, this is just the rulebook's
  suggested default. Any party may hold any number of Adventurers, but the builder should
  flag when more than **4** are marked for a given quest, since that's the hard cap taken
  into play. Two build modes, same underlying data:
  - **Adventurer-first** (classic): pick an Adventurer, then a Class for them, see the
    granted skills/spells populate.
  - **Skill-first** (new, see §6 Tier A #9): pick the skills you want the party to have,
    see which Class/Adventurer combos deliver them, drag characters and skills around to
    mix and match, live cost total throughout.
  Either mode validates against **physical board availability**, not just Guilders — each
  Class has a `boardCopies` count and a `pairedWith` list of the other Class(es) sharing
  its physical board(s) (double-sided, see Revision note (5)). Assigning a Class to a
  character should mark its board (and therefore its paired Class's matching board) as
  in-use, and warn rather than silently allow it if the party composition can't be
  physically assembled from the boards actually in the box — same "reference reality, warn
  don't block" posture as everything else physical-component-related in this doc.
- **Character sheet** — stats with default/potential visualisation matching the physical
  wax-seal rows, skill tree per Class, spell list, inventory with size accounting,
  armour slots
- **Companions & Apprentices [Deluxe]** — hire alongside Adventurers, assign a master,
  track their small XP/Health pool, flag the "upgrade slot punched" state; prompt to
  graduate an Apprentice into a full Adventurer once their first XP row fills
- **Campaign Phase wizard** — a guided four-step flow that runs after every game:
  1. **Escape** — for each downed Adventurer: Rescue Mission or Left for Dead; prompt for
     the physical Magic Die roll (showing the counter-based modifier beforehand), apply
     it, record the consequence, set `absentUntilQuest`
  2. **Advancement** — award XP per the eligibility rules, spend it with live validation
     of rank caps, prompt for level-up stat choices when a row completes
  3. **Market** — collect rewards, buy/sell with valuable-item gating, repair broken
     items, show which physical Adventurer/Class/Companion boards are eligible for the
     hire-pool shuffle (per p.62) so you draw the right ones by hand, craft items at the
     Artisan's Guild [Deluxe] (recipe check against held resources + Guilder fee), pay
     upkeep for Adventurers and Companions with an affordability warning
  4. **Rest** — choose Inn or Wilderness, walk the table prompting for each physical roll
     as you make it, apply per-character carry-over effects, offer any Side Quest cards
     drawn [Deluxe]
- **Base Camp** — Stash, Renown track, storage, secure storage state, notes
- **Side Quest tracker [Deluxe]** — cards held across games until completed or discarded,
  surfaced as a checklist so an active Side Quest is never forgotten between sessions
- **Quest log** — record each game's outcome, rewards, casualties, and notes
- **Pouch ledger** — track what's been added to and removed from the token pouch,
  including crafting resource tokens

### Phase 2 — In-game helper

Used *during* play, on the table — but per principle #3, "used during play" means
*consulted when it earns its keep*, not *kept in sync every round*. Nothing in this phase
requires a tap for every hit or every round tick. Each item below is either a one-time
setup action, an occasional lookup, or a calculator that takes a number you glance at on
a physical board and gives you something back — it never asks you to maintain a running
mirror of state the table already tracks for free.

- **Quest setup screen** — pick a quest, compute the difficulty (party value → Novice/
  Veteran counts), show the setup checklist: Dread board side and starting pegs, key
  items to set aside, search allocation, entry/grave points. One-time, per quest.
- **Dread band lookup** — an on-demand calculator, not a tracker: tell it the peg count
  you can see on your physical Dread tracker, it shows the current band, that band's
  arrival list, and whether you've hit Doom. Nothing to keep in sync — you only open it
  when you actually want the lookup, most often right before the Adversary Phase.
- **Renown spending** — the four spend windows (extra Novice card at start, Persuade
  bonus, valuable purchase, Inn roll adjustment), each deducting correctly. Renown lives
  on the Base Camp dry-wipe track and changes only a handful of times per session, so this
  sits comfortably on the "app-owned" side of the line — same bucket as Stash and XP.
- **Roll-result capture** — a quick-entry prompt wherever a rule calls for a physical die
  roll (Escape, Rest, Adversary Arrival, Renown-adjust Inn roll, etc.). No virtual die is
  ever rendered — the app names what to roll, you roll it on the table, you type the
  result in, the app does the rest. Each use is a single discrete event, not ongoing sync.
- **Spell reference** — filtered to what your party actually knows, at their level.
  Pure read, zero write.

> **Cut from the original draft:** a "round tracker" showing the current phase
> (Dread → Adventurer → Adversary → NPC → Assessment), and a live peg tracker mirroring
> Health/Skill/Magic and status counters. Both would need updating every round or every
> hit to stay useful, which is exactly the double-bookkeeping principle #3 rules out. An
> experienced group doesn't need the app to tell them whose phase it is any more than
> they need it to tell them their own Health total — that's what the physical boards are
> for. The phase sequence and status counter glossary still live in the **Rules** tab
> (§5) as static reference material for anyone still learning it.

### Phase 3 — Encounter / NPC manager

**Priority note (solo play):** you play mostly solo, which means you're personally
resolving every NPC's turn, every round, with no second player to split that load or
cross-check the rules with. That makes the NPC AI walkthrough below less of a "nice
reference" and more of something you'll open constantly — worth building and polishing
early within this phase rather than treating it as equal-weight with the other bullets.

Originally scoped as a live enemy roster with tap-to-damage tracking. Given principle #3,
that's cut — it's the single clearest case of the tedium you flagged: NPCs already have a
physical Health-tracking mechanism, so mirroring it in the app is pure duplicate effort
for no benefit to anyone who already knows the rules. What survives is the part of this
phase that isn't state-mirroring at all — it's lookup and decision support consulted at
the moment you need it, then closed:

- **Adversary Arrival helper** — reads the current Dread band (from the lookup above)
  and tells you exactly what to roll and why (which dice, how many, for what — e.g.
  "roll 1 combat die for Lamentors, then the Magic Die for their Entry Point"); you roll
  physically and report the results; the app tells you where they arrive — including the
  Revenant Die's "Risen from the Grave" face directing you to Grave Points instead — and
  logs a one-line note ("2 Lamentors arrived at Entry Point 3") to that quest's record for
  the campaign chronicle. It does **not** keep an ongoing roster of those NPCs' Health —
  once they're placed, the physical board and their own counters take over, same as any
  other NPC. One decision per arrival, not a running mirror.
- **NPC AI walkthrough** — tap an NPC, answer the decision tree's yes/no questions
  (in LoS? reachable in melee without moving? reachable this turn? does its ranged attack
  roll more dice than its melee?), get the action. This is genuinely a per-activation
  lookup, not a state mirror — you open it, answer four questions about what you see on
  the table, get an answer, close it. Remembers per-NPC-type answers where they're static
  to cut the question count on repeat activations.
- **"GM is running this" toggle [Deluxe]** — GM mode (p.88) is an official optional
  layer where one player manually controls all NPCs/Adversaries instead of using the
  automated arrival and AI-chart tools. A per-session toggle hides both of the above for
  a GM who doesn't want them. Cheap — a visibility flag, not new logic.

> **Cut from the original draft:** the live enemy roster (tap-to-damage cards for every
> NPC on the table) and the automatic "Doom flip" prompt, since it depended on a live
> Dread mirror that no longer exists. Doom's trigger condition is simple enough to live as
> a one-line fact in the Dread band lookup's result ("Doom — flip your Adversary boards")
> rather than needing a standing watcher. Also still cut: a digital Event Card deck
> (auto-shuffle, simulated draws, discard/reshuffle) — physical components stay physical
> (principle #2). The app's full involvement with Event Cards remains the Novice/Veteran
> count from Phase 1's difficulty calculator; it has no opinion about what happens after
> that.
>
> **If you find you want live tracking anyway** — solo play without a co-pilot, or a
> new-player table where the physical pace is already slow enough that a phone tap
> doesn't add friction — that's a real use case, just not the default one. Treat it as an
> explicit, clearly-labelled opt-in "detailed tracking" mode in Phase 4 rather than
> building it into the core loop everyone else has to opt *out* of.

### Phase 4 — Stretch

Pick from §6 based on what you actually miss after playing ten sessions with Phases 1–3.
This is also where an opt-in "detailed live tracking" mode belongs, if you decide you
want it after all — see the note above.

---

## 5. Screen-by-screen UX

**Navigation:** a bottom tab bar (thumb reach), five tabs — Party · Camp · Play · Log ·
Rules.

### Home / Campaign picker
Card per campaign: name, party portrait row, current quest number, Renown, Stash,
last-played date. Big "Continue" on the most recent. Export/import in an overflow menu.

### Party (tab 1)
Horizontally scrolling Adventurer cards, with Companion/Apprentice cards nested under
their master [Deluxe] — smaller, showing just Health and XP fill, tap to expand. Each
Adventurer card front: portrait, name, Class, rank pips, current H/S/M, status badges
(absent, wounded, carry-over effects). Tap to open the full sheet.

**Character sheet** — vertical scroll:
- Stat block rendered as the physical wax-seal rows (filled = solid, potential = outline)
- XP track as a grid of rows, with the current row highlighted and the level-up reward
  for completing it shown inline
- Class skill tree: icon + three level pips, greyed above rank cap, with a "spend XP"
  affordance when XP is unallocated
- Spell list with school colour coding (proximate = blue, vicarious = purple, elemental)
- Inventory as a grid mirroring the physical tray, with size-based occupancy and an
  over-capacity warning
- Armour slots as two distinct drop targets, with the "innate ability disabled while
  wearing armour" note surfaced when relevant

### Camp (tab 2)
The Base Camp board. Stash with a running total and a "can you afford upkeep?" forecast.
Renown as a 0–12 track with a spend menu listing the four legal spend windows. Storage
grid. Secure storage shown as locked/unlocked. Campaign notes. A prominent
**"Run Campaign Phases"** button that launches the four-step wizard.

### Play (tab 3)
Pre-game: quest picker → difficulty readout → setup checklist.
In-game: deliberately sparse, not a dashboard — there's nothing here that needs to stay
open and synced. A short list of on-demand tools: Dread band lookup (type in your peg
count, get the arrival list), Adversary Arrival helper, NPC AI walkthrough, and the
roll-result capture prompt (never a virtual die — just a fast "what did you roll?" entry
point). Each opens as its own focused screen, gives you an answer, and closes — no
persistent peg strip or enemy roster living on screen waiting to be kept in sync. You use
both a phone and a tablet at the table depending on the session, so these focused
single-purpose screens need to hold up responsively at both sizes, portrait or landscape,
rather than being designed around one form factor — a single dense dashboard would have
made that much harder, which is another point in favour of the on-demand-tool shape over
the original live-dashboard one. Design goal is that most sessions barely open this tab
at all once you know the game.

### Log (tab 4)
Reverse-chronological campaign timeline generated from the event log: quests played,
casualties, level-ups, notable rolls, achievements. Filterable by Adventurer ("show me
everything Syrio has ever done"). Export as Markdown or PDF.

### Rules (tab 5)
Spell reference, status counter glossary, phase sequence reminders, the Escape and Rest
tables as browsable references, and a search box.

---

## 6. Brainstorm — what else this app could do

Ranked by (value ÷ effort). The top of this list is where the app stops being "a tracker"
and starts being the reason you'd choose it over a spreadsheet.

### Tier A — high value, low effort. Build these.

1. **Auto-generated campaign chronicle.** The event log rendered as a narrative timeline.
   "Quest 7: The party recovered the Ashen Key. Grogmar fell to a Rot Troll and was left
   for dead, escaping with his wounds — he'll miss the next two quests." Exportable as a
   PDF you'd actually show people. Nearly free given event sourcing, and it's the feature
   people will talk about.
2. **Upkeep & affordability forecaster.** Before you buy that 40-Guilder sword, show
   what upkeep costs at the end of this Market Phase and whether you can still pay it.
   Losing a levelled character because you miscounted Guilders is the worst way to lose
   one.
3. **"Who can buy this?" market gating.** Given an item's cost, show which Adventurers
   are high enough rank to purchase it and how many Renown you'd need to spend. Removes
   a fiddly per-item lookup.
4. **Absence tracker with auto-decrement.** `absentUntilQuest` counts itself down and the
   party builder refuses to field an absent character. This rule is forgotten constantly.
5. **Hire-pool availability filter.** The Market Phase has you shuffle your physical
   collection of unused Adventurer/Class/Companion boards and draw from the top — that
   shuffle stays physical (design principle #2). What the app can do is remember which
   boards are already spoken for across a long campaign (hired, dead, in another party)
   so you're only ever shuffling the ones actually eligible to be drawn.
6. **Party value / difficulty history graph.** Watch your party's power curve across the
   campaign against the Veteran card count. Genuinely interesting, and it tells you when
   the game is about to get harder.
7. **Session photos.** Attach a photo of the table to each quest record. Costs almost
   nothing and makes the log dramatically more fun to revisit.
8. **Achievements.** The rulebook already references a Campaign Log with named
   achievements (e.g. "Blazing Trails"). Model them as data in the content pack, unlock
   them from event-log conditions.
9. **Skill-first party composer [new — added once the Class-board data existed].** The
   normal party builder flow is Adventurer → Class → see what skills you got. This is the
   reverse: pick the skills you actually want in the party ("I want someone with
   Camouflage, someone with Persuasion, someone who can heal") and the app shows every
   Class/Adventurer combination that would deliver them, with a live total cost and the
   ability to drag characters and skills around to mix and match before committing to
   anything. This was genuinely hard to justify before this session — it needs a complete
   Class → skill map to be useful at all — but that map now exists in `core.json`
   (24 of 25 Classes transcribed as of 2026-08-19), which moves this from "interesting
   someday" to "cheap now." It should also be the natural place to surface the physical
   board-availability check (§0.1, Revision note (5)) — if your desired mix needs three
   Sellswords, the picker can tell you whether the box actually has three Sellsword boards
   free before you build around a party you can't physically field.

### Tier B — high value, real effort. Build if the app sticks.

10. **AI-assisted party advisor [new].** For the fuzzy, creative asks a rules engine can't
    answer well — "a party of unexpected heroes, ordinary townsfolk you wouldn't expect,"
    "all magic but nothing too fiddly to play," "give me a classic tank/healer/mage/
    support lineup" — the right tool is a general-purpose AI chat, not bespoke
    recommendation logic baked into this app. Building that logic in-app would mean either
    a narrow set of canned presets or an actual LLM integration, and the latter conflicts
    with local-first/no-backend/no-accounts (§1) for a feature that isn't core to
    bookkeeping. Instead: a **"Copy party-building prompt"** action that assembles your
    natural-language ask together with a compact, curated data export (available
    Adventurers/Classes with costs, granted skills, and current physical board
    availability, scoped to expansions you actually own) onto the clipboard, ready to
    paste into whatever AI chat you already use. Two pieces, generated separately since
    they change at different rates:
    - **Rules Primer** — a short, mostly-static downloadable text/Markdown file covering
      the mechanics an AI needs to reason about a party (the 350/50 Guilders budget rule,
      how Skills/Classes/spend work, the point-buy basics) — written once, refreshed
      occasionally, meant to be attached to an AI conversation a single time rather than
      re-sent with every question.
    - **Party Data Snapshot** — generated fresh each time from your current save: owned
      expansions' Adventurers/Classes/costs/skills and current board availability, kept
      deliberately narrow (no items/spells/crafting unless relevant) so it stays small
      enough to paste comfortably rather than dumping the whole content pack.
    You paste both into your AI tool of choice alongside your own request and get a
    recommendation back in that conversation — this app never calls an AI API or stores a
    key, it just prepares good inputs. Real effort is in curating what belongs in the
    snapshot without it turning into "just attach core.json"; worth prototyping the Rules
    Primer content by hand before automating its generation.
11. **Point-buy Character Creator [Deluxe, promoted from Tier C].** The Deluxe rulebook's
   Character Creation system (p.94–96) is official, fully-specified rules — explicit
   min/max/cost tables for every stat, XP-rank allocation, and innate abilities, rolling
   up to an auto-computed Guilder cost. Since the numbers are exact and already
   transcribed into this doc's derived-values table, this is a straightforward form with
   live cost totalling, not an open-ended editor. It turns "make a character based on
   yourself" from a spreadsheet exercise into a five-step wizard, and every custom
   Adventurer it produces drops straight into the existing party model with no special
   casing. Do this before the general-purpose content editor below — it's scoped, rules
   already did the design work for you.
12. **Quest progression map.** Dungeons of Enveron is a branching narrative campaign.
   A visual node graph of quests completed, paths taken, and what's now available — with
   the branch you *didn't* take greyed out — turns the app into a campaign navigator.
13. **Print/PDF "next game setup sheet."** One page: who's in the party, their current
    stats and gear, the difficulty numbers, the setup checklist. For people who want the
    app between games and paper at the table.
14. **Rules search.** Full-text index over the rulebook so "what happens when Dread hits
    Doom?" is answerable in three seconds. Build the search *engine*; have the user point
    it at their own PDF rather than shipping the text (§8).
15. **Party composition advisor.** Flag gaps — no healer, no ranged attack, nobody who
    can Persuade, everyone rank 1 so you can't buy anything good. Useful for new players.
16. **Multi-party support at one table.** The data model already allows it; the work is
    UI — a party switcher, the Market Phase pick-order rule, and a barter helper.
17. **Campaign branching / "what if" saves.** Snapshot a campaign before a risky quest so
    a TPK doesn't end 20 sessions of investment. Easy given the event log; contentious
    for purists, so make it opt-in and clearly labelled.
18. **Batched solo-NPC resolution [promoted from Tier C — you play mostly solo].** The
    NPC AI walkthrough (Phase 3) is built as one activation at a time; since you're
    resolving *every* NPC's turn yourself each round with no second player to share the
    load, a mode that walks all of a round's NPC activations in one guided sequence — the
    same decision tree, just chained instead of opened individually per NPC — removes a
    real, recurring chunk of friction. Still an on-demand tool consulted when you want it
    (principle #3), just a bigger single session of that tool rather than a live tracker.
    Build after the core walkthrough proves out; this is the natural next iteration on it.

### Tier C — interesting, uncertain payoff. Consider later.

19. **Statistics dashboard.** Kills, rounds per quest, luckiest/unluckiest die roller,
    most-frequent cause of death — built from data the app already has (quest outcomes,
    reported roll results). Deliberately drops "damage taken per Adventurer" from the
    original draft, since that would require per-hit capture and runs straight into
    principle #3; not worth the tedium for a nice-to-have stat.
20. **Custom content editor.** A UI for authoring content packs — homebrew Adventurers,
    Classes, and quests. Turns your users into your content team.
21. **Cross-device sync.** Only if you actually feel the pain. The event log makes it
    tractable; a simple approach is exporting the log to a file in a synced folder rather
    than building a server.
22. **Voice input.** "Syrio takes two damage." Sounds gimmicky, but during play your
    hands are full of miniatures. Web Speech API makes a limited command grammar cheap
    to try.
23. **Timer / pacing.** Track how long each quest and phase takes. Mostly a curiosity,
    but useful if you're trying to fit a game into a weeknight.

### Explicitly out of scope

- Virtual board, grid, line-of-sight, pathfinding
- Full rules adjudication (the app suggests; the players decide)
- Online multiplayer / matchmaking
- Anything requiring an account

---

## 7. Risks and open questions

| Risk | Mitigation |
|---|---|
| **Data loss** — IndexedDB eviction, cleared browser data, lost phone | `navigator.storage.persist()`, export nag after each quest, auto-export to the Downloads folder on a schedule |
| **Content entry is a slog** — hundreds of items, skills, spells to transcribe | Build the schema first, then transcribe incrementally. Ship Phase 1 with only the core-box Adventurers/Classes; items can start as free-text until the data exists. |
| **Scope creep into a virtual tabletop** | The line in §6 "explicitly out of scope" is load-bearing. Revisit it whenever a feature request involves positions. |
| **Rules drift** — Battle Systems errata and v1.02+ | Version the content packs; put rules constants (the difficulty table, upkeep formula) in data, not code, so an errata is a data edit |
| **The app is slower than a dry-wipe pen** | Ruthless tap-count budgeting. Any common action that takes more than two taps is a bug. Time yourself against the physical boards. |
| **Half-built Phase 3 blocks Phase 1 usefulness** | Strict phase gating — Phase 1 ships and gets played with before Phase 2 starts |

**Open questions — resolved:**

- **Expansions:** you currently own/play *Of Ale and Adventure* and *The Forbidden
  Creed*; *Oblivion's Maw* is planned but not owned yet. Content-pack build order:
  Deluxe core first (needed for Phase 1 regardless), then *Of Ale and Adventure*, then
  *The Forbidden Creed*. *Oblivion's Maw* doesn't need content transcribed yet, but the
  schema (§2.4) should already be general enough to accept it later without changes —
  worth a quick sanity check once the schema is drafted: could an `oblivions-maw.json`
  pack be added with zero code changes? If not, the schema needs another pass before
  Phase 0 is "done."
- **Play mode:** mostly solo. This reprioritizes within Phase 3 (§4) — the NPC AI
  walkthrough stops being a nice-to-have and becomes something you'll lean on every
  round, since you're the only one resolving every NPC's turn. Worth pulling the
  Tier-C "solo-play assistant mode" brainstorm idea (a batched "resolve every NPC this
  round" flow built on top of the walkthrough) into Phase 3 proper, or at least Phase 4
  rather than a someday-maybe. Updated in §6 below. The GM-mode toggle still costs
  nothing to include even though you won't personally use it.
- **Device:** both phone and tablet, varies by session. The Play screen (§5) needs to be
  responsive rather than designed around one form factor — the "opens as its own focused
  screen" pattern for each on-demand tool (§4, Phase 2/3) already helps here, since a
  single focused screen is much easier to make work at both sizes than a dashboard would
  have been.
- **Audience:** just you for now. Friends might get access if you play with them; if it
  ever goes properly public, that's a separate decision you'd make later — and you'd talk
  to Battle Systems first before shipping anything with their content in it, not just
  adopt a technical workaround and assume that settles it. Given that, §8's "keep content
  out of the repo" posture is **not** something to build for today — real rulebook
  content (item names, stats, flavour text) can live directly in the content packs as
  transcribed, same as any other personal project. The content-pack architecture (§2.4)
  already keeps game data cleanly separated from code as a byproduct of the
  expansion-readiness decision in §0.2, so nothing is lost by not over-engineering this
  now — if audience ever changes, splitting content out later is a data move, not a
  redesign.

---

## 8. Content and licensing note

Maladum and all its content are © Battle Systems Ltd 2024. For a personal-use app built
from your own copy of the game, transcribing stats into JSON is fine.

If this ever goes public, the design should keep game content **out of the repository**:

- Ship the app with an **empty content pack** and a schema.
- Let users import their own pack, or provide an in-app editor.
- Keep *mechanics* (the phase sequence, the XP formula, the difficulty lookup) in code —
  game mechanics aren't copyrightable — but keep *expression* (card text, quest
  narrative, item names and flavour, artwork) in user-supplied data.

This is the same posture successful companion apps for other systems take, and it costs
you nothing if you design for it from the start. It also happens to be the same
architecture as the expansion-readiness decision in §0.2, so you get it for free.

**Status as of §7:** audience is just you for now, with friends possibly getting access
later — this section is a "revisit if" note, not a current build requirement. Per your
own call, the actual gate on going public isn't a technical one anyway — it's a
conversation with Battle Systems about whether they're fine with it. Worth having that
conversation before this section becomes relevant, not after.

---

## 9. Recommended first commit

```
maladum-companion/
├── src/
│   ├── content/          # pack loader, Zod schemas, merge logic
│   ├── rules/            # PURE functions + tests — build this first
│   │   ├── difficulty.ts    advancement.ts    upkeep.ts
│   │   ├── escape.ts        rest.ts           dread.ts
│   │   └── npcAi.ts
│   ├── store/            # event log, projections, snapshots, undo
│   ├── db/               # Dexie schema, export/import
│   ├── features/         # party/ camp/ play/ log/ rules/
│   └── ui/               # shared components, theme
├── content/
│   ├── core.json                 # start with 2–3 Adventurers and 2 Classes to prove the schema
│   ├── of-ale-and-adventure.json # add once core.json proves the schema out
│   └── the-forbidden-creed.json  # same — you own both, so both are near-term, not stretch
└── docs/
    └── design.md         # this file
```

**Build order:** `rules/` with tests → `content/` schema → `store/` → Phase 1 screens.
Resist starting with screens; the rules engine is the part that has to be right, and
it's the part that's cheapest to get right in isolation.

**Content order (§7):** `core.json` first — Phase 1 needs it regardless and it's what
proves the schema out. Once that's solid, `of-ale-and-adventure.json` and
`the-forbidden-creed.json` next, since you own and play both now. Leave
`oblivions-maw.json` unwritten — you don't own it yet — but once the schema is drafted,
sanity-check that a fourth pack could be dropped in later with zero code changes. If it
can't, that's a schema bug worth fixing while it's still cheap, before real content piles
up on top of it.
