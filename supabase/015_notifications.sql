-- =====================================================================
-- 015 — Notifications
--
-- One table for both audiences. A row addressed to a user belongs to
-- that user; a row with no user is for whoever is staffing the admin
-- panel, and is marked read by the first admin who deals with it.
--
-- Two tables would mean two of everything — queries, APIs, bells — to
-- hold the same four fields, and the only real difference is who the
-- row is for.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),

  -- Null means "for admins". A real id means that one person.
  user_id uuid references auth.users(id) on delete cascade,

  kind text not null,              -- upload | support | billing | trial | system | signup | error
  title text not null,
  body text not null default '',
  href text not null default '',   -- where clicking it should go

  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The bell asks "how many unread for me" on every page, so that is the
-- query worth an index. Partial, because read rows are never counted.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

create index if not exists notifications_admin_unread_idx
  on public.notifications (created_at desc) where user_id is null and read_at is null;

create index if not exists notifications_recent_idx
  on public.notifications (user_id, created_at desc);

-- Server-only, like every other table here.
alter table public.notifications enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where tablename = 'notifications') then
    execute (
      select string_agg(format('drop policy if exists %I on public.notifications;', policyname), ' ')
      from pg_policies where tablename = 'notifications'
    );
  end if;
end $$;

/*
 * Keep the table from growing without limit.
 *
 * Nobody opens a notification from six weeks ago, and an unbounded log on a
 * free database eventually becomes the reason something else stops working.
 * Read rows go after a month, unread ones are kept longer because they were
 * never seen.
 */
create or replace function public.prune_notifications()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.notifications
   where (read_at is not null and created_at < now() - interval '30 days')
      or (read_at is null and created_at < now() - interval '120 days');
$$;

revoke all on function public.prune_notifications() from public, anon, authenticated;

/*
 * Tell the admins when somebody signs up.
 *
 * Extends the trigger that already creates the profile row, rather than
 * adding a second trigger on the same table or asking the application to
 * notice. Accounts are created by Supabase Auth — through the email form,
 * through Google, and through the dashboard — and only the database sees
 * all three.
 *
 * The profile insert comes first and the notification is wrapped, because a
 * signup must not fail over a note about it: a visitor who cannot create an
 * account is a far worse outcome than an admin who does not hear about one.
 */
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, plan) values (new.id, new.email, 'free')
  on conflict (id) do nothing;

  begin
    insert into public.notifications (user_id, kind, title, body, href)
    values (null, 'signup', 'New account', coalesce(new.email, 'no email'), '/admin/users');
  exception when others then
    null;  -- the table may not exist yet on a part-migrated database
  end;

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

select 'notifications ready' as status;
