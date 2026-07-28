-- PATCH A.7 — filter RPC smoke
select
  (mia_temporal_series_growth(7, 0, null, null, 'smartphones', null)->'series') is not null as has_filters;
