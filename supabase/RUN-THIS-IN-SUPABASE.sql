-- =====================================================================
-- ELUNA MIND — THE WHOLE DATABASE, IN ONE PASTE
--
-- Paste this into Supabase → SQL Editor and press Run. That is the only
-- database step there is.
--
-- Safe on a brand new project and safe on the one you are already using:
-- every statement checks before it acts, so running this twice changes
-- nothing the second time. If you are unsure whether a migration went
-- through, run this again rather than guessing.
--
-- NOTICE lines are normal and can be ignored — they are Postgres saying
-- "that already existed, skipping". Only a line starting with ERROR
-- matters. If you see one, stop and send me the whole line.
--
-- When it finishes you should see a single table with 15 rows, every one
-- of them saying "yes".
-- =====================================================================



-- =====================================================================
-- 000_base.sql
-- =====================================================================

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


-- =====================================================================
-- 001_foundation.sql
-- =====================================================================

-- ElunaMind foundation migration. Run on STAGING first, then production. Safe to re-run.
-- Check column names against the real `profiles` table before running.

-- 1) profiles: Stripe linkage
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);

-- 2) Auto-create profile on signup (replaces the browser-side upsert that reset plans to 'free')
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, plan) values (new.id, new.email, 'free')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- 3) Lock profiles: users may only READ their own row. Only the service role (server + webhook) writes.
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
-- NOTE: drop any existing insert/update policies on profiles in the dashboard, otherwise users can self-upgrade.

-- 4) Atomic daily usage counter (server only)
create table if not exists public.usage_daily (
  user_id uuid not null, day date not null default current_date, kind text not null,
  count int not null default 0, primary key (user_id, day, kind)
);
alter table public.usage_daily enable row level security;

create or replace function public.consume_usage(p_user uuid, p_kind text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into usage_daily (user_id, day, kind, count) values (p_user, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = usage_daily.count + 1
  where usage_daily.count < p_limit
  returning count into c;
  return c is not null;
end; $$;

create or replace function public.refund_usage(p_user uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  update usage_daily set count = greatest(count - 1, 0)
  where user_id = p_user and day = current_date and kind = p_kind;
$$;
revoke all on function public.consume_usage(uuid, text, int) from public, anon, authenticated;
revoke all on function public.refund_usage(uuid, text) from public, anon, authenticated;

-- 5) Stripe webhook idempotency
create table if not exists public.stripe_events (
  id text primary key, type text, created_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;


-- =====================================================================
-- 002_chat_and_notes.sql
-- =====================================================================

-- Chat system + notes history. Run AFTER 001_foundation.sql. Safe to re-run.
-- All access goes through the server (service role), so RLS is enabled with NO policies.

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chats_user_updated_idx on public.chats (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_chat_idx on public.chat_messages (chat_id, created_at);

create table if not exists public.notes_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists notes_history_user_idx on public.notes_history (user_id, created_at desc);

alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notes_history enable row level security;


-- =====================================================================
-- 003_admin.sql
-- =====================================================================

-- =====================================================================
-- ELUNA MIND — ADMIN SYSTEM
-- Run AFTER 001_foundation.sql and 002_chat_and_notes.sql. Safe to re-run.
-- Every table here is server-only: RLS is on with no policies, so only the
-- service role (your API routes) can read or write them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Who is an admin, and who is blocked
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists blocked_reason text;
alter table public.profiles add column if not exists admin_note text;
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- 'user' | 'admin'  /  'active' | 'blocked'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user','admin'));
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('active','blocked'));

create index if not exists profiles_role_idx on public.profiles (role) where role = 'admin';
create index if not exists profiles_created_idx on public.profiles (created_at desc);

-- ---------------------------------------------------------------------
-- 2) Settings the admin can change without a deploy
--    One row per key, value is JSON. Code holds the defaults; a row here wins.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------------
-- 3) Blog
-- ---------------------------------------------------------------------
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  content text not null default '',
  cover_url text,
  tags text[] not null default '{}',
  status text not null default 'draft',
  author_name text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_posts drop constraint if exists blog_posts_status_check;
alter table public.blog_posts add constraint blog_posts_status_check check (status in ('draft','published'));
create index if not exists blog_published_idx on public.blog_posts (published_at desc) where status = 'published';
alter table public.blog_posts enable row level security;

-- ---------------------------------------------------------------------
-- 4) Audit log — every admin action is written here
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit (
  id bigserial primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_time_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;

-- ---------------------------------------------------------------------
-- 5) Analytics helpers
-- ---------------------------------------------------------------------

-- Later migrations change what these two functions return, so a re-run of this
-- file would hit "cannot change return type of existing function": `create or
-- replace` can swap a function's body but never its output columns. Dropping
-- first makes this file safe to run again at any point, in any order.
drop function if exists public.admin_overview();

-- Headline numbers for the admin dashboard.
create or replace function public.admin_overview()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'users_total',      (select count(*) from profiles),
    'users_premium',    (select count(*) from profiles where plan = 'premium'),
    'users_blocked',    (select count(*) from profiles where status = 'blocked'),
    'users_new_today',  (select count(*) from profiles where created_at >= current_date),
    'users_new_7d',     (select count(*) from profiles where created_at >= current_date - 6),
    'active_today',     (select count(distinct user_id) from usage_daily where day = current_date),
    'active_7d',        (select count(distinct user_id) from usage_daily where day >= current_date - 6),
    'uses_today',       (select coalesce(sum(count),0) from usage_daily where day = current_date),
    'uses_7d',          (select coalesce(sum(count),0) from usage_daily where day >= current_date - 6),
    'uses_total',       (select coalesce(sum(count),0) from usage_daily),
    'chats_total',      (select count(*) from chats),
    'messages_total',   (select count(*) from chat_messages),
    'notes_total',      (select count(*) from notes_history),
    'posts_published',  (select count(*) from blog_posts where status = 'published')
  );
$$;

-- Daily totals for the last N days, one row per day (missing days come back as 0).
create or replace function public.admin_daily_series(p_days int default 14)
returns table (day date, uses bigint, active_users bigint, signups bigint)
language sql security definer set search_path = public stable as $$
  with days as (
    select generate_series(current_date - (p_days - 1), current_date, '1 day')::date as day
  )
  select d.day,
         coalesce((select sum(u.count) from usage_daily u where u.day = d.day), 0)::bigint,
         coalesce((select count(distinct u.user_id) from usage_daily u where u.day = d.day), 0)::bigint,
         coalesce((select count(*) from profiles p where p.created_at::date = d.day), 0)::bigint
  from days d order by d.day;
$$;

-- Which tools are actually being used, over the last N days.
create or replace function public.admin_feature_usage(p_days int default 30)
returns table (kind text, uses bigint, users bigint)
language sql security definer set search_path = public stable as $$
  select kind, sum(count)::bigint, count(distinct user_id)::bigint
  from usage_daily
  where day >= current_date - (p_days - 1)
  group by kind order by 2 desc;
$$;

drop function if exists public.admin_user_list(text, text, text, text, int, int);

-- One page of users with their lifetime and today's usage, searchable and sortable.
create or replace function public.admin_user_list(
  p_search text default '',
  p_plan   text default 'all',     -- all | free | premium
  p_status text default 'all',     -- all | active | blocked
  p_sort   text default 'recent',  -- recent | usage | email
  p_limit  int default 25,
  p_offset int default 0
)
returns table (
  id uuid, email text, plan text, role text, status text,
  created_at timestamptz, last_seen_at timestamptz,
  uses_total bigint, uses_today bigint, chats bigint, notes bigint, total_count bigint
)
language sql security definer set search_path = public stable as $$
  with base as (
    select p.* from profiles p
    where (p_search = '' or p.email ilike '%' || p_search || '%')
      and (p_plan = 'all' or p.plan = p_plan)
      and (p_status = 'all' or p.status = p_status)
  ), counted as (
    select b.*,
      coalesce((select sum(u.count) from usage_daily u where u.user_id = b.id), 0)::bigint as uses_total,
      coalesce((select sum(u.count) from usage_daily u where u.user_id = b.id and u.day = current_date), 0)::bigint as uses_today,
      coalesce((select count(*) from chats c where c.user_id = b.id), 0)::bigint as chats,
      coalesce((select count(*) from notes_history n where n.user_id = b.id), 0)::bigint as notes
    from base b
  )
  select c.id, c.email, c.plan, c.role, c.status, c.created_at, c.last_seen_at,
         c.uses_total, c.uses_today, c.chats, c.notes,
         (select count(*) from base)::bigint as total_count
  from counted c
  order by
    case when p_sort = 'usage' then c.uses_total end desc nulls last,
    case when p_sort = 'email' then c.email end asc nulls last,
    case when p_sort not in ('usage','email') then c.created_at end desc nulls last
  limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
$$;

-- Everything the admin needs about one user.
create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = p_user),
    'usage_today', (select coalesce(jsonb_object_agg(kind, count), '{}'::jsonb)
                    from usage_daily where user_id = p_user and day = current_date),
    'usage_total', (select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb)
                    from (select kind, sum(count) as total from usage_daily
                          where user_id = p_user group by kind) t),
    'last_14_days', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'uses', uses) order by day), '[]'::jsonb)
                     from (select day, sum(count) as uses from usage_daily
                           where user_id = p_user and day >= current_date - 13
                           group by day) d),
    'chats', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'title', c.title, 'updated_at', c.updated_at,
                'messages', (select count(*) from chat_messages m where m.chat_id = c.id)
              ) order by c.updated_at desc), '[]'::jsonb)
              from (select * from chats where user_id = p_user order by updated_at desc limit 20) c),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', n.id, 'title', n.title, 'created_at', n.created_at
              ) order by n.created_at desc), '[]'::jsonb)
              from (select * from notes_history where user_id = p_user order by created_at desc limit 20) n)
  );
$$;

revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_daily_series(int) from public, anon, authenticated;
revoke all on function public.admin_feature_usage(int) from public, anon, authenticated;
revoke all on function public.admin_user_list(text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.admin_user_detail(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Make yourself the admin — put YOUR signup email here and run it
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'you@example.com';


-- =====================================================================
-- 004_fixes.sql
-- =====================================================================

-- =====================================================================
-- FIX: let the server run the helper functions again.
-- Run this in Supabase -> SQL Editor. Safe to run more than once.
--
-- Why this is needed: the earlier files revoked EXECUTE from PUBLIC to keep
-- browsers out, and that also removed the permission the server key relies on.
-- The symptom is every AI tool saying "daily limit reached" on the first try.
-- =====================================================================

grant execute on function public.consume_usage(uuid, text, int) to service_role;
grant execute on function public.refund_usage(uuid, text)        to service_role;

grant execute on function public.admin_overview()                                  to service_role;
grant execute on function public.admin_daily_series(int)                           to service_role;
grant execute on function public.admin_feature_usage(int)                          to service_role;
grant execute on function public.admin_user_list(text, text, text, text, int, int) to service_role;
grant execute on function public.admin_user_detail(uuid)                           to service_role;

-- browsers still get nothing
revoke execute on function public.consume_usage(uuid, text, int) from anon, authenticated;
revoke execute on function public.refund_usage(uuid, text)       from anon, authenticated;

-- ---------------------------------------------------------------------
-- Health check — every line should read OK.
-- ---------------------------------------------------------------------
select 'consume_usage function' as item,
       case when exists (select 1 from pg_proc where proname='consume_usage') then 'OK' else 'MISSING -> run 001_foundation.sql' end as status
union all select 'usage_daily table',
       case when exists (select 1 from information_schema.tables where table_name='usage_daily') then 'OK' else 'MISSING -> run 001_foundation.sql' end
union all select 'chats table',
       case when exists (select 1 from information_schema.tables where table_name='chats') then 'OK' else 'MISSING -> run 002_chat_and_notes.sql' end
union all select 'profiles.role column',
       case when exists (select 1 from information_schema.columns where table_name='profiles' and column_name='role') then 'OK' else 'MISSING -> run 003_admin.sql' end
union all select 'server may run consume_usage',
       case when has_function_privilege('service_role','public.consume_usage(uuid,text,int)','EXECUTE') then 'OK' else 'STILL BLOCKED' end
union all select 'browsers may NOT run it',
       case when has_function_privilege('anon','public.consume_usage(uuid,text,int)','EXECUTE') then 'PROBLEM: anon can call it' else 'OK' end
union all select 'admin accounts',
       coalesce((select string_agg(email, ', ') from public.profiles where role='admin'), 'NONE — nobody is an admin yet');


-- =====================================================================
-- 006_uploads.sql
-- =====================================================================

-- =====================================================================
-- FILE AND IMAGE UPLOADS
-- Run after the earlier migrations. Safe to run more than once.
-- =====================================================================

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  kind text not null default 'document',          -- document | image | audio
  storage_path text not null,
  extracted_text text,
  pages int,
  status text not null default 'processing',      -- processing | ready | failed
  error text,
  created_at timestamptz not null default now()
);
create index if not exists uploads_user_idx on public.uploads (user_id, created_at desc);
alter table public.uploads enable row level security;   -- server-only, no policies

-- Let a chat message point at the file it was asked about.
alter table public.chat_messages add column if not exists upload_id uuid references public.uploads(id) on delete set null;

-- ---------------------------------------------------------------------
-- Private storage bucket. Files are only ever read by the server.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 26214400)   -- 25 MB ceiling
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Browsers get no direct access to the bucket; only the server key can touch it.
drop policy if exists "uploads owner read" on storage.objects;
drop policy if exists "uploads owner write" on storage.objects;


-- =====================================================================
-- 007_trial_roles_support.sql
-- =====================================================================

-- =====================================================================
-- FREE TRIAL, SUB-ADMINS, AND THE SUPPORT INBOX
-- Run after 006_uploads.sql. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Free trial
--    The trial lives on the profile as an end date, so "is this person on
--    Premium right now" is a time comparison and nothing has to expire it.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists trial_ends_at timestamptz;

-- Finding whose trial is ending is the one query this needs to be fast for.
create index if not exists profiles_trial_idx on public.profiles (trial_ends_at)
  where trial_ends_at is not null;

-- ---------------------------------------------------------------------
-- 2) Sub-admins
--    'sub_admin' can answer support, moderate accounts and write blog posts.
--    Only a full 'admin' can change plans, roles, limits, pricing or branding.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user','sub_admin','admin'));

drop index if exists profiles_role_idx;
create index if not exists profiles_staff_idx on public.profiles (role)
  where role in ('admin','sub_admin');

-- ---------------------------------------------------------------------
-- 3) Support tickets
--    Server-only like every other table here: RLS on, no policies, so the
--    API routes (service key) are the only way in and ownership is checked
--    in code on every read.
-- ---------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  subject text not null,
  category text not null default 'other',       -- billing | bug | account | feature | other
  status text not null default 'open',          -- open | answered | closed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reply_at timestamptz not null default now(),
  -- Which side has not read the latest message, so both inboxes can show a dot.
  unread_for_staff boolean not null default true,
  unread_for_user boolean not null default false,
  closed_at timestamptz,
  assigned_to uuid
);
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check
  check (status in ('open','answered','closed'));
alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
  check (category in ('billing','bug','account','feature','other'));

create index if not exists support_user_idx on public.support_tickets (user_id, last_reply_at desc);
create index if not exists support_queue_idx on public.support_tickets (status, last_reply_at desc);
alter table public.support_tickets enable row level security;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author text not null default 'user',          -- user | staff
  author_id uuid,
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.support_messages drop constraint if exists support_messages_author_check;
alter table public.support_messages add constraint support_messages_author_check
  check (author in ('user','staff'));

create index if not exists support_msg_idx on public.support_messages (ticket_id, created_at);
alter table public.support_messages enable row level security;

-- ---------------------------------------------------------------------
-- 4) Analytics: the overview needs to know about trials and open tickets
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'users_total',      (select count(*) from profiles),
    'users_premium',    (select count(*) from profiles where plan = 'premium'),
    'users_trialing',   (select count(*) from profiles
                         where plan <> 'premium' and trial_ends_at is not null and trial_ends_at > now()),
    'trials_started',   (select count(*) from profiles where trial_started_at is not null),
    'users_blocked',    (select count(*) from profiles where status = 'blocked'),
    'users_new_today',  (select count(*) from profiles where created_at >= current_date),
    'users_new_7d',     (select count(*) from profiles where created_at >= current_date - 6),
    'active_today',     (select count(distinct user_id) from usage_daily where day = current_date),
    'active_7d',        (select count(distinct user_id) from usage_daily where day >= current_date - 6),
    'uses_today',       (select coalesce(sum(count),0) from usage_daily where day = current_date),
    'uses_7d',          (select coalesce(sum(count),0) from usage_daily where day >= current_date - 6),
    'uses_total',       (select coalesce(sum(count),0) from usage_daily),
    'chats_total',      (select count(*) from chats),
    'messages_total',   (select count(*) from chat_messages),
    'notes_total',      (select count(*) from notes_history),
    'uploads_total',    (select count(*) from uploads),
    'tickets_open',     (select count(*) from support_tickets where status <> 'closed'),
    'tickets_waiting',  (select count(*) from support_tickets where unread_for_staff and status <> 'closed'),
    'posts_published',  (select count(*) from blog_posts where status = 'published')
  );
$$;

-- The user list gains the trial columns so the admin can see who is trialing.
-- The returned row type changes, and Postgres will not let "create or replace"
-- do that, so the old version has to go first.
drop function if exists public.admin_user_list(text, text, text, text, int, int);

create function public.admin_user_list(
  p_search text default '',
  p_plan   text default 'all',     -- all | free | premium | trial
  p_status text default 'all',     -- all | active | blocked
  p_sort   text default 'recent',  -- recent | usage | email
  p_limit  int default 25,
  p_offset int default 0
)
returns table (
  id uuid, email text, plan text, role text, status text,
  created_at timestamptz, last_seen_at timestamptz,
  trial_ends_at timestamptz, on_trial boolean,
  uses_total bigint, uses_today bigint, chats bigint, notes bigint, total_count bigint
)
language sql security definer set search_path = public stable as $$
  with base as (
    select p.*,
           (p.plan <> 'premium' and p.trial_ends_at is not null and p.trial_ends_at > now()) as on_trial
    from profiles p
    where (p_search = '' or p.email ilike '%' || p_search || '%')
      and (p_status = 'all' or p.status = p_status)
  ), filtered as (
    select * from base
    where p_plan = 'all'
       or (p_plan = 'premium' and plan = 'premium')
       or (p_plan = 'trial'   and on_trial)
       or (p_plan = 'free'    and plan <> 'premium' and not on_trial)
  ), counted as (
    select f.*,
      coalesce((select sum(u.count) from usage_daily u where u.user_id = f.id), 0)::bigint as uses_total,
      coalesce((select sum(u.count) from usage_daily u where u.user_id = f.id and u.day = current_date), 0)::bigint as uses_today,
      coalesce((select count(*) from chats c where c.user_id = f.id), 0)::bigint as chats,
      coalesce((select count(*) from notes_history n where n.user_id = f.id), 0)::bigint as notes
    from filtered f
  )
  select c.id, c.email, c.plan, c.role, c.status, c.created_at, c.last_seen_at,
         c.trial_ends_at, c.on_trial,
         c.uses_total, c.uses_today, c.chats, c.notes,
         (select count(*) from filtered)::bigint as total_count
  from counted c
  order by
    case when p_sort = 'usage' then c.uses_total end desc nulls last,
    case when p_sort = 'email' then c.email end asc nulls last,
    case when p_sort not in ('usage','email') then c.created_at end desc nulls last
  limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
$$;

revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_user_list(text, text, text, text, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Start a trial, atomically.
--    Doing this in one statement means two taps on the button cannot hand
--    out two trials, and a trial that already ran cannot be restarted.
-- ---------------------------------------------------------------------
create or replace function public.start_trial(p_user uuid, p_days int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 7), 90));
  v_row profiles;
begin
  update profiles
     set trial_started_at = now(),
         trial_ends_at    = now() + (v_days || ' days')::interval
   where id = p_user
     and plan <> 'premium'          -- already paying: a trial would be a downgrade
     and trial_started_at is null   -- one per account, ever
     and status = 'active'
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from profiles where id = p_user;
    if v_row.id is null then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    elsif v_row.plan = 'premium' then
      return jsonb_build_object('ok', false, 'reason', 'already_premium');
    elsif v_row.status <> 'active' then
      return jsonb_build_object('ok', false, 'reason', 'blocked');
    else
      return jsonb_build_object('ok', false, 'reason', 'already_used',
                                'trial_ends_at', v_row.trial_ends_at);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'trial_ends_at', v_row.trial_ends_at, 'days', v_days);
end;
$$;

revoke all on function public.start_trial(uuid, int) from public, anon, authenticated;

grant all on table public.support_tickets  to service_role;
grant all on table public.support_messages to service_role;


-- =====================================================================
-- 008_errors_and_billing.sql
-- =====================================================================

-- =====================================================================
-- ERROR MONITORING + STRIPE BILLING STATE
-- Run after 007_trial_roles_support.sql. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Billing state from Stripe
--    The webhook already flips plan; these columns record WHY, so the app
--    can say "trial, 4 days left" or "cancels on the 30th" instead of
--    just "premium".
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists subscription_status text;      -- trialing | active | past_due | canceled | ...
alter table public.profiles add column if not exists card_trial_ends_at timestamptz; -- Stripe's trial end, card on file
alter table public.profiles add column if not exists cancel_at_period_end boolean not null default false;
alter table public.profiles add column if not exists current_period_end timestamptz;

-- ---------------------------------------------------------------------
-- 2) Errors
--    Two tables on purpose: one row per occurrence for the timeline, and
--    one row per distinct problem for the list an admin actually works
--    through. Without the grouping table a single broken route buries
--    everything else.
-- ---------------------------------------------------------------------
create table if not exists public.app_errors (
  id bigserial primary key,
  fingerprint text not null,
  level text not null default 'error',      -- warn | error | fatal
  source text not null default 'server',    -- server | client
  name text,                                -- the error class, e.g. TypeError
  message text not null,
  route text,
  method text,
  status int,
  stack text,
  user_id uuid,
  user_email text,
  user_agent text,
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_time_idx on public.app_errors (created_at desc);
create index if not exists app_errors_group_idx on public.app_errors (fingerprint, created_at desc);
alter table public.app_errors enable row level security;   -- server-only, no policies

create table if not exists public.error_groups (
  fingerprint text primary key,
  level text not null default 'error',
  source text not null default 'server',
  name text,
  message text not null,
  route text,
  occurrences bigint not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open',      -- open | resolved | ignored
  resolved_at timestamptz,
  resolved_by uuid,
  note text
);
alter table public.error_groups drop constraint if exists error_groups_status_check;
alter table public.error_groups add constraint error_groups_status_check
  check (status in ('open','resolved','ignored'));
create index if not exists error_groups_last_idx on public.error_groups (status, last_seen_at desc);
alter table public.error_groups enable row level security;

grant all on table public.app_errors   to service_role;
grant all on table public.error_groups to service_role;
grant usage, select on sequence public.app_errors_id_seq to service_role;

-- ---------------------------------------------------------------------
-- 3) Recording an error
--    One call does both writes. Occurrence rows are sampled per
--    fingerprint so a retry loop cannot write thousands of rows, while
--    the group counter still counts every single one — the number stays
--    honest even when the detail rows are thinned.
-- ---------------------------------------------------------------------
create or replace function public.record_error(
  p_fingerprint text,
  p_level       text default 'error',
  p_source      text default 'server',
  p_name        text default null,
  p_message     text default '',
  p_route       text default null,
  p_method      text default null,
  p_status      int  default null,
  p_stack       text default null,
  p_user        uuid default null,
  p_email       text default null,
  p_agent       text default null,
  p_context     jsonb default null,
  p_sample_secs int  default 20
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_level   text := case when p_level in ('warn','error','fatal') then p_level else 'error' end;
  v_source  text := case when p_source in ('server','client') then p_source else 'server' end;
  v_msg     text := left(coalesce(nullif(trim(p_message), ''), 'Unknown error'), 2000);
  v_stack   text := left(p_stack, 8000);
  v_fp      text := left(coalesce(nullif(trim(p_fingerprint), ''), md5(v_msg)), 200);
  v_last    timestamptz;
  v_wrote   boolean := false;
begin
  -- Upsert the group first: this is the write that must never be skipped.
  insert into error_groups (fingerprint, level, source, name, message, route,
                            occurrences, first_seen_at, last_seen_at, status)
  values (v_fp, v_level, v_source, p_name, v_msg, p_route, 1, now(), now(), 'open')
  on conflict (fingerprint) do update
    set occurrences   = error_groups.occurrences + 1,
        last_seen_at  = now(),
        level         = v_level,
        message       = v_msg,
        route         = coalesce(p_route, error_groups.route),
        -- A problem that comes back was not fixed, so reopen it. An ignored
        -- group stays ignored: that is a decision, not a guess.
        status        = case when error_groups.status = 'resolved' then 'open' else error_groups.status end,
        resolved_at   = case when error_groups.status = 'resolved' then null else error_groups.resolved_at end
  returning (select max(created_at) from app_errors where fingerprint = v_fp) into v_last;

  if v_last is null or v_last < now() - make_interval(secs => greatest(0, p_sample_secs)) then
    insert into app_errors (fingerprint, level, source, name, message, route, method,
                            status, stack, user_id, user_email, user_agent, context)
    values (v_fp, v_level, v_source, p_name, v_msg, p_route, p_method,
            p_status, v_stack, p_user, p_email, left(p_agent, 300), p_context);
    v_wrote := true;
  end if;

  return jsonb_build_object('ok', true, 'fingerprint', v_fp, 'detail_saved', v_wrote);
end;
$$;

-- Keep the table from growing forever. Call it from the admin panel or a cron.
create or replace function public.prune_errors(p_keep_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows bigint; v_groups bigint;
begin
  delete from app_errors where created_at < now() - make_interval(days => greatest(1, p_keep_days));
  get diagnostics v_rows = row_count;
  -- A resolved group nobody has seen for the whole window is finished business.
  delete from error_groups
   where status in ('resolved','ignored')
     and last_seen_at < now() - make_interval(days => greatest(1, p_keep_days));
  get diagnostics v_groups = row_count;
  return jsonb_build_object('occurrences_deleted', v_rows, 'groups_deleted', v_groups);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Everything the dashboard draws, in one round trip
-- ---------------------------------------------------------------------
create or replace function public.admin_error_overview(p_days int default 14)
returns jsonb language sql security definer set search_path = public stable as $$
  with span as (select greatest(1, least(coalesce(p_days, 14), 90)) as d),
  days as (
    select generate_series(current_date - ((select d from span) - 1), current_date, '1 day')::date as day
  ),
  recent as (
    select * from app_errors
    where created_at >= current_date - ((select d from span) - 1)
  )
  select jsonb_build_object(
    'days', (select d from span),
    'total_24h',   (select count(*) from app_errors where created_at >= now() - interval '24 hours'),
    'total_prev_24h', (select count(*) from app_errors
                       where created_at >= now() - interval '48 hours'
                         and created_at <  now() - interval '24 hours'),
    'total_window', (select count(*) from recent),
    'users_hit',   (select count(distinct user_id) from recent where user_id is not null),
    'groups_open', (select count(*) from error_groups where status = 'open'),
    'groups_total',(select count(*) from error_groups),
    'newest',      (select max(created_at) from app_errors),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
                 'day', d.day,
                 'total', coalesce((select count(*) from recent r where r.created_at::date = d.day), 0),
                 'warn',  coalesce((select count(*) from recent r where r.created_at::date = d.day and r.level = 'warn'), 0),
                 'error', coalesce((select count(*) from recent r where r.created_at::date = d.day and r.level = 'error'), 0),
                 'fatal', coalesce((select count(*) from recent r where r.created_at::date = d.day and r.level = 'fatal'), 0)
               ) order by d.day), '[]'::jsonb) from days d),
    'by_level', (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb)
                 from (select level, count(*) as n from recent group by level) t),
    'by_source', (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb)
                  from (select source, count(*) as n from recent group by source) t),
    'top_routes', (select coalesce(jsonb_agg(jsonb_build_object('route', route, 'n', n) order by n desc), '[]'::jsonb)
                   from (select coalesce(route, 'unknown') as route, count(*) as n
                         from recent group by 1 order by 2 desc limit 8) t)
  );
$$;

create or replace function public.admin_error_groups(
  p_status text default 'open',    -- open | resolved | ignored | all
  p_level  text default 'all',     -- warn | error | fatal | all
  p_source text default 'all',     -- server | client | all
  p_search text default '',
  p_limit  int default 30,
  p_offset int default 0
)
returns table (
  fingerprint text, level text, source text, name text, message text, route text,
  occurrences bigint, first_seen_at timestamptz, last_seen_at timestamptz,
  status text, note text, users_hit bigint, total_count bigint
)
language sql security definer set search_path = public stable as $$
  with base as (
    select g.* from error_groups g
    where (p_status = 'all' or g.status = p_status)
      and (p_level  = 'all' or g.level  = p_level)
      and (p_source = 'all' or g.source = p_source)
      and (p_search = '' or g.message ilike '%' || p_search || '%' or coalesce(g.route,'') ilike '%' || p_search || '%')
  )
  select b.fingerprint, b.level, b.source, b.name, b.message, b.route,
         b.occurrences, b.first_seen_at, b.last_seen_at, b.status, b.note,
         coalesce((select count(distinct e.user_id) from app_errors e
                   where e.fingerprint = b.fingerprint and e.user_id is not null), 0)::bigint as users_hit,
         (select count(*) from base)::bigint as total_count
  from base b
  order by b.last_seen_at desc
  limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
$$;

create or replace function public.admin_error_detail(p_fingerprint text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'group', (select to_jsonb(g) from error_groups g where g.fingerprint = p_fingerprint),
    'users_hit', (select count(distinct user_id) from app_errors
                  where fingerprint = p_fingerprint and user_id is not null),
    'last_14_days', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]'::jsonb)
                     from (select created_at::date as day, count(*) as n from app_errors
                           where fingerprint = p_fingerprint and created_at >= current_date - 13
                           group by 1) d),
    'occurrences', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
                    from (select id, created_at, level, source, route, method, status,
                                 user_email, user_agent, stack, context
                          from app_errors where fingerprint = p_fingerprint
                          order by created_at desc limit 20) e)
  );
$$;

revoke all on function public.record_error(text,text,text,text,text,text,text,int,text,uuid,text,text,jsonb,int) from public, anon, authenticated;
revoke all on function public.prune_errors(int) from public, anon, authenticated;
revoke all on function public.admin_error_overview(int) from public, anon, authenticated;
revoke all on function public.admin_error_groups(text,text,text,text,int,int) from public, anon, authenticated;
revoke all on function public.admin_error_detail(text) from public, anon, authenticated;


-- =====================================================================
-- 009_site_content.sql
-- =====================================================================

-- =====================================================================
-- EDITABLE SITE CONTENT, LEGAL PAGES, AND THE LANDING BOT'S ANSWERS
-- Run after 008_errors_and_billing.sql. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Legal and other standalone pages
--    Bodies are markdown so an admin can edit them without touching code.
--    `required` marks the pages the site links to in its footer: those can
--    be edited and unpublished, but not deleted out from under the links.
-- ---------------------------------------------------------------------
create table if not exists public.site_pages (
  slug text primary key,
  title text not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  published boolean not null default true,
  required boolean not null default false,
  sort int not null default 100
);
alter table public.site_pages enable row level security;   -- served by the server only
grant all on table public.site_pages to service_role;

-- The four a paid consumer product needs before it can take money.
-- Each ships as a usable skeleton with the gaps marked, never as fake
-- legal text pretending to be reviewed.
insert into public.site_pages (slug, title, required, sort, body) values
  ('privacy', 'Privacy Policy', true, 10, ''),
  ('terms',   'Terms of Service', true, 20, ''),
  ('cookies', 'Cookie Policy', true, 30, ''),
  ('refunds', 'Refund Policy', true, 40, '')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2) The landing bot's answers
--    Tried before any AI call: an answer written here is instant, free and
--    always on message. The AI only picks up what is not covered.
-- ---------------------------------------------------------------------
create table if not exists public.bot_answers (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  -- Space-separated words that should match this answer, beyond the question itself.
  keywords text not null default '',
  -- Shown as a starter chip in the bot when true.
  suggested boolean not null default false,
  enabled boolean not null default true,
  sort int not null default 100,
  uses bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bot_answers_live_idx on public.bot_answers (enabled, sort);
-- Unique on the question so re-running this file tops up the starter set
-- instead of duplicating it. (Without a conflict target, "on conflict do
-- nothing" cannot see a duplicate row at all.)
create unique index if not exists bot_answers_question_key on public.bot_answers (question);
alter table public.bot_answers enable row level security;
grant all on table public.bot_answers to service_role;

-- ---------------------------------------------------------------------
-- 3) What the bot was asked
--    The questions it could NOT answer are the useful ones: they say what
--    the site fails to explain, and each is one click from becoming an answer.
-- ---------------------------------------------------------------------
create table if not exists public.bot_questions (
  id bigserial primary key,
  question text not null,
  matched_id uuid,
  source text not null default 'bot',     -- answers | ai | none
  created_at timestamptz not null default now()
);
create index if not exists bot_questions_time_idx on public.bot_questions (created_at desc);
alter table public.bot_questions enable row level security;
grant all on table public.bot_questions to service_role;
grant usage, select on sequence public.bot_questions_id_seq to service_role;

-- ---------------------------------------------------------------------
-- 4) Starter answers. Deliberately the questions a visitor actually asks
--    before signing up, not a feature list.
-- ---------------------------------------------------------------------
insert into public.bot_answers (question, answer, keywords, suggested, sort) values
  ('Is it free?',
   'Yes. You can create an account and use the tutor, notes, practice questions, the planner and the career guide without paying, and without a card. Each tool shows how many uses you have left that day, and they reset every morning.',
   'free cost price pay card money trial plan', true, 10),
  ('Can it read my own notes?',
   'That is the main thing it does. Upload a PDF, a Word file, lecture slides, a photo of handwritten notes or a lecture recording, and every answer comes from that file instead of from a guess. Recordings get transcribed first.',
   'upload file pdf slides photo notes recording audio material course', true, 20),
  ('Will my university see this as cheating?',
   'Using it to understand a topic, revise, or check your own work is no different from a tutor. Handing in text it wrote as your own writing breaks almost every academic integrity policy, and we do not help anyone hide that AI was used. The tools are built to explain, not to write your essay for you.',
   'cheat cheating plagiarism integrity university college allowed detector caught', true, 30),
  ('What subjects does it handle?',
   'Anything you are studying. It is strongest where there is a method to follow — maths, sciences, economics, law, languages, medicine — because it can show the steps. It writes formulas properly rather than as plain text.',
   'subject subjects maths math science physics chemistry biology law medicine language history', false, 40),
  ('How do I cancel?',
   'From your account page, in one click. It opens the billing page where you cancel yourself — you keep everything until the end of the period you already paid for, and nothing is charged after that.',
   'cancel refund stop unsubscribe billing subscription end', false, 50),
  ('Is my work private?',
   'Your chats, notes and uploaded files belong to your account and are not shared with other users. You can delete any of them, and deleting a file removes both the file and the text taken from it.',
   'privacy private data secure security gdpr delete share', false, 60)
on conflict (question) do nothing;


-- ---------------------------------------------------------------------
-- 5) Counting which written answers actually get used
-- ---------------------------------------------------------------------
create or replace function public.bump_bot_answer(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update bot_answers set uses = uses + 1 where id = p_id;
$$;
revoke all on function public.bump_bot_answer(uuid) from public, anon, authenticated;


-- =====================================================================
-- 010_ai_providers.sql
-- =====================================================================

-- =====================================================================
-- AI PROVIDER KEYS, MANAGED FROM THE ADMIN PANEL
-- Run after 009_site_content.sql. Safe to run more than once.
--
-- Why the keys live here rather than only in environment variables:
-- changing a key should not need a redeploy, and more than one key should
-- be usable so a dead or rate-limited key fails over instead of taking the
-- whole app down.
--
-- The table is server-only: RLS is on with no policies, so only the service
-- key reaches it, and the admin API never sends a full key back to a browser.
-- =====================================================================

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  label text not null,                       -- what the admin calls it
  api_key text not null,
  base_url text not null default '',         -- empty = OpenAI itself
  model text not null default 'gpt-4o-mini',
  -- Audio needs its own model name; blank falls back to the env default.
  transcribe_model text not null default '',
  priority int not null default 100,         -- lower is tried first
  enabled boolean not null default true,

  -- health, written by the server whenever a call succeeds or fails
  status text not null default 'unknown',    -- unknown | ok | failed
  last_error text,
  last_checked_at timestamptz,
  last_ok_at timestamptz,

  calls bigint not null default 0,
  failures bigint not null default 0,

  created_at timestamptz not null default now()
);

alter table public.ai_providers drop constraint if exists ai_providers_status_check;
alter table public.ai_providers add constraint ai_providers_status_check
  check (status in ('unknown','ok','failed'));

create index if not exists ai_providers_order_idx on public.ai_providers (enabled, priority, created_at);
alter table public.ai_providers enable row level security;
grant all on table public.ai_providers to service_role;

-- ---------------------------------------------------------------------
-- Health, recorded without a read-modify-write race between two requests
-- ---------------------------------------------------------------------
create or replace function public.ai_provider_ok(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update ai_providers
     set status = 'ok', calls = calls + 1,
         last_ok_at = now(), last_checked_at = now(), last_error = null
   where id = p_id;
$$;

create or replace function public.ai_provider_failed(p_id uuid, p_error text)
returns void language sql security definer set search_path = public as $$
  update ai_providers
     set status = 'failed', failures = failures + 1,
         last_checked_at = now(), last_error = left(p_error, 500)
   where id = p_id;
$$;

revoke all on function public.ai_provider_ok(uuid) from public, anon, authenticated;
revoke all on function public.ai_provider_failed(uuid, text) from public, anon, authenticated;


-- =====================================================================
-- 011_career_and_voice.sql
-- =====================================================================

-- =====================================================================
-- SAVED CAREER PLANS, AND THE WRITING SAMPLE BEHIND "IN MY VOICE"
-- Run after 010_ai_providers.sql. Safe to run more than once.
--
-- Both tables are server-only: RLS is on with no policies, so only the
-- service key reaches them and every read is scoped to one user id by the
-- route that does it. That is the same pattern as the rest of the schema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- career_plans
--
-- A career plan is a long structured answer a student will come back to —
-- a twelve-month roadmap is not something you read once — and the
-- follow-up questions need the plan still on hand to answer against.
-- The plan is stored as jsonb rather than as columns because its shape
-- differs per mode, and the page already normalises whatever it gets.
-- ---------------------------------------------------------------------
create table if not exists public.career_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,                        -- explore | roadmap | reality | income
  role text,                                 -- the career asked about, where there was one
  title text not null,
  plan jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.career_plans drop constraint if exists career_plans_mode_check;
alter table public.career_plans add constraint career_plans_mode_check
  check (mode in ('explore','roadmap','reality','income'));

-- The only query the app makes: this user's plans, newest first.
create index if not exists career_plans_user_idx
  on public.career_plans (user_id, created_at desc);

alter table public.career_plans enable row level security;
grant all on table public.career_plans to service_role;

-- ---------------------------------------------------------------------
-- voice_samples
--
-- One sample per student, so "rewrite this in my voice" does not ask them
-- to paste an old essay every single time. One row per user, replaced on
-- save rather than appended, because only the newest sample is wanted —
-- hence the primary key on user_id and the upsert in the route.
-- ---------------------------------------------------------------------
create table if not exists public.voice_samples (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sample text not null,
  words int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.voice_samples enable row level security;
grant all on table public.voice_samples to service_role;

-- updated_at has to move on every save or "saved 3 weeks ago" is a lie.
create or replace function public.touch_voice_sample()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists voice_samples_touch on public.voice_samples;
create trigger voice_samples_touch
  before update on public.voice_samples
  for each row execute function public.touch_voice_sample();


-- =====================================================================
-- 012_stripe_config.sql
-- =====================================================================

-- =====================================================================
-- STRIPE KEYS, MANAGED FROM THE ADMIN PANEL
-- Run after 011_career_and_voice.sql. Safe to run more than once.
--
-- Same reasoning as the AI keys in 010: swapping a test key for a live
-- one should be a save, not a redeploy, and the person who owns the
-- Stripe account is not always the person who owns the hosting.
--
-- Server-only: RLS is on with no policies, so only the service key
-- reaches this table, and the admin API never sends a secret back to a
-- browser — only a masked preview.
--
-- There is exactly one row, held there by the `one_row` check. Billing
-- configuration is not a list: two rows would mean two answers to "which
-- key takes the payment", and whichever one lost would do so silently.
-- =====================================================================

create table if not exists public.stripe_config (
  id int primary key default 1,
  constraint stripe_config_one_row check (id = 1),

  secret_key text not null default '',          -- sk_live_… or sk_test_…
  publishable_key text not null default '',     -- pk_…, safe to show
  price_id text not null default '',            -- price_… for the Premium plan
  webhook_secret text not null default '',      -- whsec_…, set when the endpoint is created
  webhook_endpoint_id text not null default '', -- we_…, so the endpoint can be replaced later
  webhook_url text not null default '',         -- what the endpoint was pointed at

  -- Switched off, the app falls back to the environment variables and then to
  -- demo checkout. This is the off switch for taking money.
  enabled boolean not null default true,

  -- Health, written whenever the key is tested or used.
  status text not null default 'unknown',       -- unknown | ok | failed
  last_error text,
  last_checked_at timestamptz,
  account_name text not null default '',        -- the Stripe account this key belongs to
  updated_at timestamptz not null default now()
);

alter table public.stripe_config drop constraint if exists stripe_config_status_check;
alter table public.stripe_config add constraint stripe_config_status_check
  check (status in ('unknown','ok','failed'));

-- The single row, created empty so the admin page has something to update.
insert into public.stripe_config (id) values (1) on conflict (id) do nothing;

alter table public.stripe_config enable row level security;
grant all on table public.stripe_config to service_role;

-- updated_at has to move on every save, or "saved 10 minutes ago" is a lie.
create or replace function public.touch_stripe_config()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stripe_config_touch on public.stripe_config;
create trigger stripe_config_touch
  before update on public.stripe_config
  for each row execute function public.touch_stripe_config();


-- =====================================================================
-- 013_slide_images.sql
-- =====================================================================

-- =====================================================================
-- 013 — Pictures on slides
--
-- Holds the stock-photo key and the switches for putting images on
-- presentation slides. One row, like stripe_config, for the same reason:
-- these are credentials, not settings, so they never travel through
-- getSettings() into a page the browser can read.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.image_config (
  id int primary key default 1,
  constraint image_config_one_row check (id = 1),

  -- Pexels. Free, and its licence permits commercial use, which matters
  -- because these decks get submitted and shared.
  stock_key text not null default '',
  stock_provider text not null default 'pexels',

  -- Generating a picture costs money per image, so it is off until someone
  -- decides to pay for it, and capped even then.
  ai_images_enabled boolean not null default false,
  max_images_per_deck int not null default 4,

  status text not null default 'untested',       -- untested | ok | failed
  last_error text,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.image_config (id) values (1) on conflict (id) do nothing;

-- Server-only. RLS on with no policy at all means the publishable key can
-- read nothing here; only the service role, which never reaches a browser.
alter table public.image_config enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where tablename = 'image_config') then
    execute (
      select string_agg(format('drop policy if exists %I on public.image_config;', policyname), ' ')
      from pg_policies where tablename = 'image_config'
    );
  end if;
end $$;

-- A sane cap, whatever gets typed into the admin field.
alter table public.image_config drop constraint if exists image_config_max_sane;
alter table public.image_config add constraint image_config_max_sane
  check (max_images_per_deck between 0 and 12);


-- =====================================================================
-- 014_conversions.sql
-- =====================================================================

-- =====================================================================
-- 014 — Purchase conversions
--
-- One row per confirmed payment, written by the Stripe webhook and read
-- once by the browser so a conversion tag can fire with the real amount.
--
-- Why a table rather than firing the tag on the success page: the success
-- page runs whenever anyone opens that URL. Refreshing it, pressing back,
-- or opening it on a phone would each report another sale. The only thing
-- that knows a payment actually happened is the webhook, and the only way
-- to report it exactly once is to write down that it has been reported.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.conversions (
  -- Stripe's checkout session id. Being the primary key is what makes a
  -- retried webhook harmless: the second insert simply conflicts.
  id text primary key,

  user_id uuid references auth.users(id) on delete cascade,

  -- Minor units, exactly as Stripe reports them. Converting to a decimal
  -- happens once, where it is read, rather than in several places.
  amount_total bigint not null default 0,
  currency text not null default 'usd',

  -- Null until a browser has been handed this conversion to report.
  reported_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists conversions_pending_idx
  on public.conversions (user_id) where reported_at is null;

-- Server-only, like every other table here: RLS on with no policy at all,
-- so the browser key can read nothing and every path goes through the app.
alter table public.conversions enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where tablename = 'conversions') then
    execute (
      select string_agg(format('drop policy if exists %I on public.conversions;', policyname), ' ')
      from pg_policies where tablename = 'conversions'
    );
  end if;
end $$;

/*
 * Hand out one unreported conversion and mark it reported in the same
 * statement.
 *
 * The update and the read cannot be separate queries: two tabs opening the
 * success page at the same moment would both read the row before either
 * wrote, and both would report the sale. Doing it in one statement means
 * the database decides, and the second caller gets nothing.
 */
create or replace function public.claim_conversion(p_user uuid)
returns table (id text, amount_total bigint, currency text)
language sql
security definer
set search_path = public
as $$
  update public.conversions c
     set reported_at = now()
   where c.id = (
     select c2.id from public.conversions c2
      where c2.user_id = p_user and c2.reported_at is null
      order by c2.created_at
      limit 1
      for update skip locked
   )
  returning c.id, c.amount_total, c.currency;
$$;

revoke all on function public.claim_conversion(uuid) from public, anon, authenticated;


-- =====================================================================
-- 015_notifications.sql
-- =====================================================================

-- =====================================================================
-- 015 — Notifications
--
-- One table for both audiences. A row addressed to a user belongs to
-- that user; a row with no user is for whoever is staffing the admin
-- panel, and is marked read by the first admin who deals with it.
--
-- Two tables would mean two of everything — queries, APIs, bells — to
-- hold the same four fields, and the only real difference is who the
-- row is for.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),

  -- Null means "for admins". A real id means that one person.
  user_id uuid references auth.users(id) on delete cascade,

  kind text not null,              -- upload | support | billing | trial | system | signup | error
  title text not null,
  body text not null default '',
  href text not null default '',   -- where clicking it should go

  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The bell asks "how many unread for me" on every page, so that is the
-- query worth an index. Partial, because read rows are never counted.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

create index if not exists notifications_admin_unread_idx
  on public.notifications (created_at desc) where user_id is null and read_at is null;

create index if not exists notifications_recent_idx
  on public.notifications (user_id, created_at desc);

-- Server-only, like every other table here.
alter table public.notifications enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where tablename = 'notifications') then
    execute (
      select string_agg(format('drop policy if exists %I on public.notifications;', policyname), ' ')
      from pg_policies where tablename = 'notifications'
    );
  end if;
end $$;

/*
 * Keep the table from growing without limit.
 *
 * Nobody opens a notification from six weeks ago, and an unbounded log on a
 * free database eventually becomes the reason something else stops working.
 * Read rows go after a month, unread ones are kept longer because they were
 * never seen.
 */
create or replace function public.prune_notifications()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.notifications
   where (read_at is not null and created_at < now() - interval '30 days')
      or (read_at is null and created_at < now() - interval '120 days');
$$;

revoke all on function public.prune_notifications() from public, anon, authenticated;

/*
 * Tell the admins when somebody signs up.
 *
 * Extends the trigger that already creates the profile row, rather than
 * adding a second trigger on the same table or asking the application to
 * notice. Accounts are created by Supabase Auth — through the email form,
 * through Google, and through the dashboard — and only the database sees
 * all three.
 *
 * The profile insert comes first and the notification is wrapped, because a
 * signup must not fail over a note about it: a visitor who cannot create an
 * account is a far worse outcome than an admin who does not hear about one.
 */
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, plan) values (new.id, new.email, 'free')
  on conflict (id) do nothing;

  begin
    insert into public.notifications (user_id, kind, title, body, href)
    values (null, 'signup', 'New account', coalesce(new.email, 'no email'), '/admin/users');
  exception when others then
    null;  -- the table may not exist yet on a part-migrated database
  end;

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();



-- =====================================================================
-- DID IT WORK?
-- Every row below must say "yes". Anything else means that part did not
-- get created, and the feature behind it will be switched off in the app.
-- =====================================================================

select t.thing,
       case when t.present then 'yes' else 'NO — SOMETHING WENT WRONG' end as ok
from (values
  ( 1, 'Accounts',            to_regclass('public.profiles')         is not null),
  ( 2, 'Chat and notes',      to_regclass('public.chats')            is not null),
  ( 3, 'Daily usage limits',  to_regclass('public.usage_daily')      is not null),
  ( 4, 'Admin settings',      to_regclass('public.app_settings')     is not null),
  ( 5, 'File uploads',        to_regclass('public.uploads')          is not null),
  ( 6, 'Uploads storage',     exists (select 1 from storage.buckets where id = 'uploads')),
  ( 7, 'Support tickets',     to_regclass('public.support_tickets')  is not null),
  ( 8, 'Error tracking',      to_regclass('public.app_errors')       is not null),
  ( 9, 'Website content',     to_regclass('public.site_pages')       is not null),
  (10, 'AI keys',             to_regclass('public.ai_providers')     is not null),
  (11, 'Career plans',        to_regclass('public.career_plans')     is not null),
  (12, 'Payment keys',        to_regclass('public.stripe_config')    is not null),
  (13, 'Slide pictures',      to_regclass('public.image_config')      is not null),
  (14, 'Ad conversions',      to_regclass('public.conversions')       is not null),
  (15, 'Notifications',       to_regclass('public.notifications')     is not null)
) as t(n, thing, present)
order by t.n;
