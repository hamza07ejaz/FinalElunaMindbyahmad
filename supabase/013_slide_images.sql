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

select 'image_config ready' as status;
