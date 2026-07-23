-- PATCH 11.1 — Q5 Consistency: alerts created vs lifecycle CREATED (30d)
with scoped as (
  select *
  from analytics_events e
  where e.created_at >= now() - interval '30 days'
    and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
)
select
  (select count(*) from scoped where event_name = 'price_alert_created')::bigint as price_alert_created,
  (select count(*) from scoped where event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'CREATED')::bigint as lifecycle_created;
