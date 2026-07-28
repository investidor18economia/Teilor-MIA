select
  (public.mia_temporal_series_products(30)->'summary'->>'distinct_products') is not null as has_summary,
  jsonb_array_length(coalesce(public.mia_temporal_series_products(30)->'ranking', '[]'::jsonb)) >= 0 as has_ranking;
