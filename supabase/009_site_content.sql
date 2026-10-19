-- =====================================================================
-- EDITABLE SITE CONTENT, LEGAL PAGES, AND THE LANDING BOT'S ANSWERS
-- Run after 008_errors_and_billing.sql. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Legal and other standalone pages
--    Bodies are markdown so an admin can edit them without touching code.
--    `required` marks the pages the site links to in its footer: those can
--    be edited and unpublished, but not deleted out from under the links.
-- ---------------------------------------------------------------------
create table if not exists public.site_pages (
  slug text primary key,
  title text not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  published boolean not null default true,
  required boolean not null default false,
  sort int not null default 100
);
alter table public.site_pages enable row level security;   -- served by the server only
grant all on table public.site_pages to service_role;

-- The four a paid consumer product needs before it can take money.
-- Each ships as a usable skeleton with the gaps marked, never as fake
-- legal text pretending to be reviewed.
insert into public.site_pages (slug, title, required, sort, body) values
  ('privacy', 'Privacy Policy', true, 10, ''),
  ('terms',   'Terms of Service', true, 20, ''),
  ('cookies', 'Cookie Policy', true, 30, ''),
  ('refunds', 'Refund Policy', true, 40, '')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2) The landing bot's answers
--    Tried before any AI call: an answer written here is instant, free and
--    always on message. The AI only picks up what is not covered.
-- ---------------------------------------------------------------------
create table if not exists public.bot_answers (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  -- Space-separated words that should match this answer, beyond the question itself.
  keywords text not null default '',
  -- Shown as a starter chip in the bot when true.
  suggested boolean not null default false,
  enabled boolean not null default true,
  sort int not null default 100,
  uses bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bot_answers_live_idx on public.bot_answers (enabled, sort);
-- Unique on the question so re-running this file tops up the starter set
-- instead of duplicating it. (Without a conflict target, "on conflict do
-- nothing" cannot see a duplicate row at all.)
create unique index if not exists bot_answers_question_key on public.bot_answers (question);
alter table public.bot_answers enable row level security;
grant all on table public.bot_answers to service_role;

-- ---------------------------------------------------------------------
-- 3) What the bot was asked
--    The questions it could NOT answer are the useful ones: they say what
--    the site fails to explain, and each is one click from becoming an answer.
-- ---------------------------------------------------------------------
create table if not exists public.bot_questions (
  id bigserial primary key,
  question text not null,
  matched_id uuid,
  source text not null default 'bot',     -- answers | ai | none
  created_at timestamptz not null default now()
);
create index if not exists bot_questions_time_idx on public.bot_questions (created_at desc);
alter table public.bot_questions enable row level security;
grant all on table public.bot_questions to service_role;
grant usage, select on sequence public.bot_questions_id_seq to service_role;

-- ---------------------------------------------------------------------
-- 4) Starter answers. Deliberately the questions a visitor actually asks
--    before signing up, not a feature list.
-- ---------------------------------------------------------------------
insert into public.bot_answers (question, answer, keywords, suggested, sort) values
  ('Is it free?',
   'Yes. You can create an account and use the tutor, notes, practice questions, the planner and the career guide without paying, and without a card. Each tool shows how many uses you have left that day, and they reset every morning.',
   'free cost price pay card money trial plan', true, 10),
  ('Can it read my own notes?',
   'That is the main thing it does. Upload a PDF, a Word file, lecture slides, a photo of handwritten notes or a lecture recording, and every answer comes from that file instead of from a guess. Recordings get transcribed first.',
   'upload file pdf slides photo notes recording audio material course', true, 20),
  ('Will my university see this as cheating?',
   'Using it to understand a topic, revise, or check your own work is no different from a tutor. Handing in text it wrote as your own writing breaks almost every academic integrity policy, and we do not help anyone hide that AI was used. The tools are built to explain, not to write your essay for you.',
   'cheat cheating plagiarism integrity university college allowed detector caught', true, 30),
  ('What subjects does it handle?',
   'Anything you are studying. It is strongest where there is a method to follow — maths, sciences, economics, law, languages, medicine — because it can show the steps. It writes formulas properly rather than as plain text.',
   'subject subjects maths math science physics chemistry biology law medicine language history', false, 40),
  ('How do I cancel?',
   'From your account page, in one click. It opens the billing page where you cancel yourself — you keep everything until the end of the period you already paid for, and nothing is charged after that.',
   'cancel refund stop unsubscribe billing subscription end', false, 50),
  ('Is my work private?',
   'Your chats, notes and uploaded files belong to your account and are not shared with other users. You can delete any of them, and deleting a file removes both the file and the text taken from it.',
   'privacy private data secure security gdpr delete share', false, 60)
on conflict (question) do nothing;


-- ---------------------------------------------------------------------
-- 5) Counting which written answers actually get used
-- ---------------------------------------------------------------------
create or replace function public.bump_bot_answer(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update bot_answers set uses = uses + 1 where id = p_id;
$$;
revoke all on function public.bump_bot_answer(uuid) from public, anon, authenticated;

select 'site content ready' as status;
