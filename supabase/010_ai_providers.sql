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

select 'ai providers ready' as status;
