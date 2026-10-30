-- =====================================================================
-- 016 — Plans as data
--
-- Until now there were exactly two tiers and they were written into the
-- code: a `Plan` type of 'free' | 'premium', and every tool's limits
-- stored as a pair, freePerDay and premiumPerDay. Adding a third tier
-- meant editing the shape of every limit, the guard, the pricing page
-- and the webhook — which is not something an owner can do from an
-- admin panel.
--
-- Tiers are rows now. A plan carries what it costs, what it is called,
-- what it says on the pricing page, which Stripe price it is bought
-- with, and how many of each tool it allows per day.
--
-- The two existing plans are seeded with exactly the limits the code
-- used before, so the day this ships nothing behaves differently.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.plans (
  -- A slug, because profiles.plan already stores 'free' and 'premium' and
  -- those rows must keep working without touching a single account.
  slug text primary key,

  name text not null,
  blurb text not null default '',

  -- Shown on the pricing page. Deliberately text: "$15.99", "PKR 2,500",
  -- "Free forever" and "Contact us" are all things a plan costs, and only
  -- Stripe's own number is ever charged.
  price_label text not null default '',
  period_label text not null default '',

  -- Empty for a free plan. A plan with no price cannot be bought.
  stripe_price_id text not null default '',

  -- Extra selling points, beyond the tools the limits already imply.
  features jsonb not null default '[]'::jsonb,

  -- tool slug -> uses per day. 0 means the tool is not in this plan.
  -- A tool missing from the map is treated as 0, so adding a tool to the
  -- app does not silently hand it to every tier.
  limits jsonb not null default '{}'::jsonb,

  -- What a new account gets, and what a cancelled subscription falls back
  -- to. Exactly one plan should have this.
  is_default boolean not null default false,

  sort int not null default 0,
  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_visible_idx on public.plans (sort) where enabled;

-- Server-only, like every other table here.
alter table public.plans enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where tablename = 'plans') then
    execute (
      select string_agg(format('drop policy if exists %I on public.plans;', policyname), ' ')
      from pg_policies where tablename = 'plans'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Seed the two plans that already exist.
--
-- The numbers are the ones that were in lib/plans.ts, so an account on
-- 'free' today gets precisely what it got yesterday. Only inserted when
-- missing: re-running this must never overwrite limits an owner has
-- since edited.
-- ---------------------------------------------------------------------
insert into public.plans (slug, name, blurb, price_label, period_label, limits, is_default, sort, enabled)
values (
  'free', 'Free', 'Enough to study with every day, without a card.', 'Free', 'forever',
  jsonb_build_object(
    'upload', 3, 'transcript', 1, 'translate', 3, 'chat', 15, 'notes', 2,
    'qna', 1, 'studyPlan', 2, 'career', 3,
    -- The tools that were premiumOnly are simply absent from this plan now,
    -- which is the same thing said without a second flag.
    'flashcards', 0, 'test', 0, 'visualMap', 0, 'presentation', 0,
    'grammar', 0, 'paraphrase', 0, 'citations', 0, 'humanize', 0
  ),
  true, 0, true
)
on conflict (slug) do nothing;

insert into public.plans (slug, name, blurb, price_label, period_label, limits, is_default, sort, enabled)
values (
  'premium', 'Premium', 'For exam weeks and heavy study days.', '$15.99', 'per month, cancel any time',
  jsonb_build_object(
    'upload', 40, 'transcript', 20, 'translate', 80, 'chat', 300, 'notes', 100,
    'qna', 100, 'studyPlan', 40, 'career', 40,
    'flashcards', 60, 'test', 30, 'visualMap', 40, 'presentation', 20,
    'grammar', 100, 'paraphrase', 100, 'citations', 60, 'humanize', 80
  ),
  false, 1, true
)
on conflict (slug) do nothing;

-- Carry across the single Stripe price that was configured before, so the
-- existing checkout keeps working without anyone re-entering it.
update public.plans p
   set stripe_price_id = c.price_id
  from public.stripe_config c
 where p.slug = 'premium'
   and p.stripe_price_id = ''
   and coalesce(c.price_id, '') <> '';

-- ---------------------------------------------------------------------
-- profiles.plan now points at a plan row.
--
-- Not a foreign key: deleting a plan must not delete the accounts on it,
-- and an account whose plan was removed should fall back to the default
-- rather than vanish. The application resolves it, and treats anything
-- unknown as the default plan.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_plan_check;

/*
 * Exactly one default.
 *
 * Two defaults and new accounts land on whichever row the database
 * happens to return first, which is the kind of bug that looks like
 * random people getting a free upgrade.
 */
create unique index if not exists plans_one_default_idx
  on public.plans ((is_default)) where is_default;

-- ---------------------------------------------------------------------
-- Conversions remember which plan was bought.
--
-- The purchase event reported to GA4 carried a fixed item called "premium",
-- so revenue could not be told apart by tier — which is most of the point of
-- having tiers. The slug is not personal data, so it is safe to pass to a
-- marketing tag; nothing else about the sale is.
-- ---------------------------------------------------------------------
alter table public.conversions add column if not exists plan text not null default '';

drop function if exists public.claim_conversion(uuid);

create function public.claim_conversion(p_user uuid)
returns table (id text, amount_total bigint, currency text, plan text)
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
  returning c.id, c.amount_total, c.currency, c.plan;
$$;

revoke all on function public.claim_conversion(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The admin user list learns about plans.
--
-- It used to ask `plan = 'premium'` and `plan <> 'premium'`, which means an
-- account on a third tier counted as free in the filter and in the "on trial"
-- flag. Both now ask the plans table instead: paid is anything that is not the
-- default plan, whatever it is called.
--
-- p_plan accepts 'all', 'free', 'paid', 'trial', or an exact plan slug, so the
-- filter keeps working as more plans are added.
-- ---------------------------------------------------------------------
drop function if exists public.admin_user_list(text, text, text, text, int, int);

create function public.admin_user_list(
  p_search text default '',
  p_plan   text default 'all',     -- all | free | paid | trial | <plan slug>
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
  with free_slug as (
    -- The free plan, by definition the default one. Falls back to the literal
    -- 'free' so this still behaves if no plan is marked default.
    select coalesce((select slug from plans where is_default limit 1), 'free') as slug
  ), base as (
    select p.*,
           (p.plan is not distinct from (select slug from free_slug)
             and p.trial_ends_at is not null and p.trial_ends_at > now()) as on_trial,
           (p.plan is distinct from (select slug from free_slug)) as paid
    from profiles p
    where (p_search = '' or p.email ilike '%' || p_search || '%')
      and (p_status = 'all' or p.status = p_status)
  ), filtered as (
    select * from base
    where p_plan = 'all'
       or (p_plan in ('paid', 'premium') and paid)
       or (p_plan = 'trial' and on_trial)
       or (p_plan = 'free'  and not paid and not on_trial)
       -- An exact slug, for an owner looking at one tier.
       or (p_plan not in ('all','paid','premium','trial','free') and plan = p_plan)
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

revoke all on function public.admin_user_list(text, text, text, text, int, int) from public, anon, authenticated;

select 'plans ready' as status;
