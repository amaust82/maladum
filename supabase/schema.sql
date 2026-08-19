-- Cross-device sync schema (docs/design.md §2.x, plan "Supabase-backed cross-device
-- sync"). Run this by hand in the Supabase SQL editor for BOTH projects — maladum
-- (prod) and maladum-staging — since there's no migration tooling wired up here.
--
-- `events.seq` is an event's zero-based position in a campaign's local log at push
-- time. The (campaign_id, seq) unique constraint makes Postgres the ordering arbiter:
-- see src/sync/syncService.ts for how a losing push rebases onto the winner.

create table if not exists campaigns (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  seq bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, seq)
);

alter table campaigns enable row level security;
alter table events enable row level security;

create policy "owner rw campaigns" on campaigns
  for all using (owner = auth.uid()) with check (owner = auth.uid());

create policy "owner rw events" on events
  for all using (campaign_id in (select id from campaigns where owner = auth.uid()))
  with check (campaign_id in (select id from campaigns where owner = auth.uid()));
