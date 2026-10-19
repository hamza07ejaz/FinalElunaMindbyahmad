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
