-- =====================================================================
-- FILE AND IMAGE UPLOADS
-- Run after the earlier migrations. Safe to run more than once.
-- =====================================================================

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  kind text not null default 'document',          -- document | image | audio
  storage_path text not null,
  extracted_text text,
  pages int,
  status text not null default 'processing',      -- processing | ready | failed
  error text,
  created_at timestamptz not null default now()
);
create index if not exists uploads_user_idx on public.uploads (user_id, created_at desc);
alter table public.uploads enable row level security;   -- server-only, no policies

-- Let a chat message point at the file it was asked about.
alter table public.chat_messages add column if not exists upload_id uuid references public.uploads(id) on delete set null;

-- ---------------------------------------------------------------------
-- Private storage bucket. Files are only ever read by the server.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 26214400)   -- 25 MB ceiling
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Browsers get no direct access to the bucket; only the server key can touch it.
drop policy if exists "uploads owner read" on storage.objects;
drop policy if exists "uploads owner write" on storage.objects;

select 'uploads ready' as status;
