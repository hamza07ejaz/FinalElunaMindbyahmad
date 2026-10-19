-- =====================================================================
-- FIX: let the server run the helper functions again.
-- Run this in Supabase -> SQL Editor. Safe to run more than once.
--
-- Why this is needed: the earlier files revoked EXECUTE from PUBLIC to keep
-- browsers out, and that also removed the permission the server key relies on.
-- The symptom is every AI tool saying "daily limit reached" on the first try.
-- =====================================================================

grant execute on function public.consume_usage(uuid, text, int) to service_role;
grant execute on function public.refund_usage(uuid, text)        to service_role;

grant execute on function public.admin_overview()                                  to service_role;
grant execute on function public.admin_daily_series(int)                           to service_role;
grant execute on function public.admin_feature_usage(int)                          to service_role;
grant execute on function public.admin_user_list(text, text, text, text, int, int) to service_role;
grant execute on function public.admin_user_detail(uuid)                           to service_role;

-- browsers still get nothing
revoke execute on function public.consume_usage(uuid, text, int) from anon, authenticated;
revoke execute on function public.refund_usage(uuid, text)       from anon, authenticated;

-- ---------------------------------------------------------------------
-- Health check — every line should read OK.
-- ---------------------------------------------------------------------
select 'consume_usage function' as item,
       case when exists (select 1 from pg_proc where proname='consume_usage') then 'OK' else 'MISSING -> run 001_foundation.sql' end as status
union all select 'usage_daily table',
       case when exists (select 1 from information_schema.tables where table_name='usage_daily') then 'OK' else 'MISSING -> run 001_foundation.sql' end
union all select 'chats table',
       case when exists (select 1 from information_schema.tables where table_name='chats') then 'OK' else 'MISSING -> run 002_chat_and_notes.sql' end
union all select 'profiles.role column',
       case when exists (select 1 from information_schema.columns where table_name='profiles' and column_name='role') then 'OK' else 'MISSING -> run 003_admin.sql' end
union all select 'server may run consume_usage',
       case when has_function_privilege('service_role','public.consume_usage(uuid,text,int)','EXECUTE') then 'OK' else 'STILL BLOCKED' end
union all select 'browsers may NOT run it',
       case when has_function_privilege('anon','public.consume_usage(uuid,text,int)','EXECUTE') then 'PROBLEM: anon can call it' else 'OK' end
union all select 'admin accounts',
       coalesce((select string_agg(email, ', ') from public.profiles where role='admin'), 'NONE — nobody is an admin yet');
