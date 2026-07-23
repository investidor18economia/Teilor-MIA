-- PATCH 11.1 — Q4 Consistency: savings vs user_value (30d)
with scoped as (
  select *
  from analytics_events e
  where e.created_at >= now() - interval '30 days'
    and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
)
select
  (select count(*) from scoped where event_name = 'mia_savings_estimation')::bigint as savings_events,
  (select count(*) from scoped where event_name = 'mia_user_value_outcome')::bigint as user_value_events;
