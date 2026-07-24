-- PATCH 1.4 — Analytics Storage Security v1 (RLS + service_role grants)
-- Documentation: docs/analytics/ANALYTICS_SCHEMA.md

begin;

alter table public.analytics_events enable row level security;

-- Block unexpected browser-facing policies (fail closed on drift)
do $$
declare
  pol record;
begin
  for pol in
    select policyname, roles
    from pg_policies
    where schemaname = 'public'
      and tablename = 'analytics_events'
  loop
    if pol.roles && array['anon', 'authenticated', 'public']::name[] then
      raise exception 'unexpected policy % for browser role on analytics_events', pol.policyname;
    end if;
  end loop;
end $$;

grant select, insert on table public.analytics_events to service_role;

commit;
