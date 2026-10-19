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

select 'errors and billing ready' as status;
