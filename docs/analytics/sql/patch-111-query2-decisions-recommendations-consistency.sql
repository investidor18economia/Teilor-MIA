-- PATCH 11.1 — Q2 Consistency: decisions vs recommendations shown (30d)
with scoped as (
  select *
  from analytics_events e
  where e.created_at >= now() - interval '30 days'
    and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
)
select
  (select count(*) from scoped where event_name = 'mia_recommendation_decision')::bigint as decisions,
  (select count(*) from scoped where event_name = 'mia_recommendation_shown')::bigint as recommendations_shown;
