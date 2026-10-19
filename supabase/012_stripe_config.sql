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

select 'stripe config ready' as status;
