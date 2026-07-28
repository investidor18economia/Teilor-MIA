-- PATCH A.3.1 — Validate temporal RPC existence and permissions
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('mia_temporal_series_growth', 'mia_temporal_series_platform_activity')
order by p.proname;
