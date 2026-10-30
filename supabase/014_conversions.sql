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
-- Dropped first rather than replaced: a later migration adds the plan to what
-- this returns, and Postgres will not let "create or replace" change a
-- function's return type. Without the drop, re-running the whole schema fails
-- here — on the second run only, which is the run nobody tests by hand.
drop function if exists public.claim_conversion(uuid);

create function public.claim_conversion(p_user uuid)
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

select 'conversions ready' as status;
