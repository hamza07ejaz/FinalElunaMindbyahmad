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

select 'career plans and voice samples ready' as status;
