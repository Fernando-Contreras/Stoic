-- Stoic Block: the time measured on the blocked sites.
-- Run once in the Supabase SQL editor. Additive only: it creates one table and
-- touches nothing that already exists.
--
-- One row per (person, day, site, browser). Each browser (Chrome, Edge) writes
-- only its own row, so two of them never overwrite each other; whoever reads it
-- adds the rows up. The extension writes here INSTEAD of into Stoic's own record
-- of the day (stoic_data), which every device edits and where a second writer
-- would get overwritten. The app reads this table and turns it into Procrastination
-- entries itself.

create table if not exists public.procrastination_time (
  user_id    uuid        not null default auth.uid(),
  day        date        not null,                      -- the Stoic day (Cancún by default)
  site       text        not null,                      -- e.g. netflix.com
  device     text        not null,                      -- one id per browser install
  seconds    integer     not null check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, site, device)
);

alter table public.procrastination_time enable row level security;
drop policy if exists "own time" on public.procrastination_time;
create policy "own time" on public.procrastination_time
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- From 30 Oct 2026 Supabase no longer grants Data API access to a new table on
-- its own, so each role says what it may do.
revoke all on public.procrastination_time from anon;
grant select, insert, update, delete on public.procrastination_time to authenticated;
grant select, insert, update, delete on public.procrastination_time to service_role;
