-- =====================================================================
-- READ-ONLY account check. Changes nothing.
-- Use this if /diagnose says "NO ROW FOUND for your user id".
-- =====================================================================

-- Every login and its profile row. profile_id should equal login_id for all.
select u.id as login_id, u.email as login_email,
       p.id as profile_id, p.role, p.plan, p.status,
       case when p.id is null then 'NO PROFILE ROW' else 'ok' end as state
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- Who is an admin right now?
select email, role, plan from public.profiles where role = 'admin';

-- If a login above shows NO PROFILE ROW, create it with this (uncomment first):
-- insert into public.profiles (id, email, plan)
-- select u.id, u.email, 'free' from auth.users u
-- where u.id not in (select id from public.profiles)
-- on conflict (id) do nothing;
