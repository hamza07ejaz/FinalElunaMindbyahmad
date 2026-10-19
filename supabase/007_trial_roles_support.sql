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

select 'trial, roles and support ready' as status;
