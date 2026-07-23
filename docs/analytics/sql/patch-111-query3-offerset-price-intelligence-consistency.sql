-- PATCH 11.1 — Q3 Consistency: offer_set vs price_intelligence (30d)
with scoped as (
  select *
  from analytics_events e
  where e.created_at >= now() - interval '30 days'
    and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
)
select
  (select count(*) from scoped where event_name = 'mia_offer_set')::bigint as offer_sets,
  (select count(*) from scoped where event_name = 'mia_price_intelligence')::bigint as price_intelligence;
