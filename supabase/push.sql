-- Task alerts. Run once in the Supabase SQL editor.
-- Additive only: it creates two tables and one scheduled job, and touches
-- nothing that already exists.

create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null,
  p256dh     text not null,
  auth       text not null,
  tz         text not null default 'America/Cancun',
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "own push subs" on public.push_subs;
create policy "own push subs" on public.push_subs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Which reminders were already announced. No policies: only the function
-- (service role) reads or writes it.
create table if not exists public.push_sent (
  user_id uuid not null,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;

-- From 30 Oct 2026 Supabase no longer grants Data API access to a new table in
-- "public" on its own, so each one says who may reach it. (Tables that already
-- exist keep what they had; this matters when this file is run on a new
-- project or a rebuilt database.) push_subs is read and written by the signed-in
-- user, within the row policy above; push_sent only by the function.
grant select, insert, update, delete on public.push_subs to authenticated;
grant select, insert, update, delete on public.push_subs to service_role;
grant select, insert, update, delete on public.push_sent to service_role;

-- Once a minute, call the function. <ANON_KEY> and <CRON_SECRET> are filled
-- in when this is run; they are not stored in the repository.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- select cron.schedule('stoic-push', '* * * * *', $$
--   select net.http_post(
--     url := 'https://qupukwwpebnawbtdbibs.supabase.co/functions/v1/stoic-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <ANON_KEY>',
--       'x-cron-secret', '<CRON_SECRET>')
--   );
-- $$);
