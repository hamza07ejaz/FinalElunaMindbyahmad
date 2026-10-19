-- =====================================================================
-- THE PROFILES TABLE
-- Run before 001_foundation.sql. Safe to run more than once.
--
-- Why this file exists: every other migration assumes `profiles` is
-- already there — 001 starts by adding columns to it — but nothing in
-- this folder ever created it. It was made by hand when the project was
-- first set up, which means a fresh Supabase project could not be built
-- from these files at all, and a rebuild would have had to be guessed at.
--
-- `create table if not exists` means this changes nothing on a database
-- that already has the table. It only matters on a new project.
--
-- One row per login. The server writes it; the browser may only read its
-- own row, which is what the policy in 001 enforces.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  -- The same id as the login, so a deleted account takes its data with it.
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  -- free | premium. Everything else about the plan is added by later
  -- migrations; this is the one column the app cannot start without.
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Any login that predates this table, or that was created while the signup
-- trigger was missing, would otherwise have no profile and no way to log in
-- properly. /diagnose reports exactly that as "NO ROW FOUND for your user id".
insert into public.profiles (id, email, plan)
select u.id, u.email, 'free'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

select 'profiles ready' as status;
