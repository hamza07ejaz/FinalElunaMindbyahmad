-- =====================================================================
-- Run this in Supabase -> SQL Editor to see what is actually going on.
-- It only reads; it changes nothing.
-- =====================================================================

-- 1) Is every piece of the schema in place?
select 'consume_usage function' as item,
       case when exists (select 1 from pg_proc where proname='consume_usage') then 'OK' else 'MISSING -> run 001_foundation.sql' end as status
union all select 'usage_daily table',
       case when exists (select 1 from information_schema.tables where table_name='usage_daily') then 'OK' else 'MISSING -> run 001_foundation.sql' end
union all select 'chats table',
       case when exists (select 1 from information_schema.tables where table_name='chats') then 'OK' else 'MISSING -> run 002_chat_and_notes.sql' end
union all select 'profiles.role column',
       case when exists (select 1 from information_schema.columns where table_name='profiles' and column_name='role') then 'OK' else 'MISSING -> run 003_admin.sql' end
union all select 'server can run consume_usage',
       case when has_function_privilege('service_role','public.consume_usage(uuid,text,int)','EXECUTE') then 'OK' else 'BLOCKED -> run 004_fixes.sql' end;

-- 2) Who is an admin, and what does your own row look like?
select email, role, plan, status, created_at from public.profiles order by created_at desc limit 20;

-- 3) Has anything been counted against you today? (this is what "limit reached" reads)
select p.email, u.kind, u.count, u.day
from public.usage_daily u join public.profiles p on p.id = u.user_id
where u.day >= current_date - 1
order by u.day desc, u.count desc;

-- 4) Has an admin saved any custom limits? (empty = using the built-in defaults)
select key, value from public.app_settings;
