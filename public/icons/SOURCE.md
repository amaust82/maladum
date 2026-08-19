# Icon provenance

These trait/ability pictograms are pulled from
[xinix/maladum](https://github.com/xinix/maladum) (MIT-licensed code), a fan reference
app whose author was directly asked by Battle Systems to build it (per that repo's
README). The icons themselves depict Maladum's own iconography —
**"Maladum and all associated characters, names, places and things ™ and © Battle
Systems Ltd 2024. All rights belong to Battle Systems"** (same README) — so the MIT
license covers that repo's code, not necessarily redistribution of these images on
their own.

**Adam's call (2026-08-19):** pull them in now since this app doesn't support public
access yet. Before that changes, either strip this folder (see below) or get explicit
sign-off from Battle Systems.

## To disable

- **UI only, keep the files:** set `VITE_SHOW_ITEM_ICONS=false` as a build env var
  (Cloudflare Pages → project → Settings → Environment variables) and rebuild. Every
  icon lookup in `src/content/abilityIcons.ts` becomes a no-op; the app falls back to
  text-only, same as an item with no matched trait icon today.
- **Fully remove them from what's served:** delete this directory (`public/icons/`)
  and redeploy. Nothing in the app requires it to exist — `iconsForItem()` just
  returns `[]` for every item if the files are gone, same as the flag being off.
