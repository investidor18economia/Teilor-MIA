-- PATCH A.6 — Conversion RPC smoke test
select
  (mia_temporal_series_conversion(30, 0)->'summary') is not null as has_summary,
  (mia_temporal_series_conversion(30, 0)->'funnel_stages') is not null as has_funnel,
  (mia_temporal_series_conversion(30, 0)->'bottlenecks') is not null as has_bottlenecks,
  (mia_temporal_series_conversion(30, 0)->'daily') is not null as has_daily;
