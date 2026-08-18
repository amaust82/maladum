# Maladum Campaign Companion

Local-first PWA that replaces the dry-wipe campaign board for Maladum (Battle Systems).
Vue 3 + TypeScript + Vite + Tailwind, event-sourced state, Dexie persistence, deployed to
Cloudflare Pages.

## Read these first

1. **`STATUS.md`** — the living "where are we" doc: what's built, open decisions, and the
   concrete next task. Start here every session.
2. **`docs/design.md`** — the design source of truth (architecture §2, domain model §3,
   phased roadmap §4, screen UX §5). It describes the intended system, not current state.

## Working agreement

- **Update `STATUS.md` in the same commit as the work it describes.** Refresh the Status
  date and test count, move finished items in the Phase checklist, and rewrite "Next
  actions" to name the next concrete task. `.githooks/pre-commit` rejects commits that
  touch `src/` or `content/` without it — arm it in a fresh clone with
  `git config core.hooksPath .githooks`.
- **`docs/design.md` is design, not status.** Amend it when a design decision actually
  changes; don't log progress there.
- **Rules code stays pure and tested.** Everything in `src/rules/` is pure functions with
  Vitest coverage and rulebook page citations in the doc comments — every later feature
  trusts those numbers.
- **Don't invent game data.** Unverified content in `content/*.json` is flagged
  (`_placeholder`, `_note`, `source`). An honest gap beats a plausible-looking wrong
  number that quietly becomes canon.

## Commands

- `npm run dev` — dev server
- `npm test` — Vitest (run mode); `npm run test:watch` to iterate
- `npm run build` — `vue-tsc --noEmit` typecheck, then production build
