-- PATCH 8.3 — Q1 Offer pipeline funnel
with production_offer_set_events as (
  select *
  from analytics_events
  where event_name = 'mia_offer_set'
    and coalesce(metadata->>'event_version', '') = '8.3.0'
    and not (category in ('offer_set_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_offer_set_events
),
metric_rows as (
  select 'funnel'::text as tipo_analise, 'raw_offers_total'::text as metrica,
    sum(coalesce((metadata->>'raw_offers_count')::numeric, 0)) as valor_absoluto
  from production_offer_set_events
  union all
  select 'funnel', 'normalized_offers_total',
    sum(coalesce((metadata->>'normalized_offers_count')::numeric, 0))
  from production_offer_set_events
  union all
  select 'funnel', 'ranked_offers_total',
    sum(coalesce((metadata->>'ranked_offers_count')::numeric, 0))
  from production_offer_set_events
  union all
  select 'funnel', 'selected_offers_total',
    sum(coalesce((metadata->>'selected_offers_count')::numeric, 0))
  from production_offer_set_events
  union all
  select 'funnel', 'delivered_offers_total',
    sum(coalesce((metadata->>'delivered_offers_count')::numeric, 0))
  from production_offer_set_events
  union all
  select 'funnel', 'removed_duplicate_total',
    sum(coalesce((metadata->>'removed_duplicate_count')::numeric, 0))
  from production_offer_set_events
  union all
  select 'funnel', 'offer_sets_total', count(*)::numeric
  from production_offer_set_events
)
select r.dia_referencia, m.tipo_analise, m.metrica, m.valor_absoluto
from metric_rows m
cross join reference_day r
order by m.metrica;
