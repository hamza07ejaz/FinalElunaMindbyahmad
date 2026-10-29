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

-- 'user' | 'sub_admin' | 'admin'  /  'active' | 'blocked'
--
-- This file used to allow only 'user' and 'admin', because sub-admins did not
-- exist when it was written. Migration 007 added the role and widened the
-- constraint — which was fine going forwards and wrong on the way back: this
-- file runs FIRST, so re-running the whole script on a database that already
-- had a sub-admin failed right here, with "check constraint
-- profiles_role_check is violated by some row" and nothing to say which row or
-- why. The script is meant to be safe to run again at any time, so the
-- earliest statement has to accept every role the app has ever had.
--
-- Anything unrecognised is repaired rather than left to block the migration.
-- A role typed by hand into the SQL editor — 'Admin', ' admin', 'owner' —
-- would otherwise stop the entire script on a healthy installation.
update public.profiles
   set role = case
     when lower(btrim(coalesce(role, ''))) in ('admin','administrator','owner','superadmin') then 'admin'
     when lower(btrim(coalesce(role, ''))) in ('sub_admin','subadmin','sub-admin','staff','moderator') then 'sub_admin'
     else 'user'
   end
 where role is null
    or role not in ('user','sub_admin','admin');

update public.profiles
   set status = case when lower(btrim(coalesce(status, ''))) = 'blocked' then 'blocked' else 'active' end
 where status is null
    or status not in ('active','blocked');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user','sub_admin','admin'));
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

select 'admin schema ready' as status;
