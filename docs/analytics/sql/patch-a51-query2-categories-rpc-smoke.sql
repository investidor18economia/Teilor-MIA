select
  (public.mia_temporal_series_categories(30)->'summary'->>'distinct_categories') is not null as has_summary,
  jsonb_array_length(coalesce(public.mia_temporal_series_categories(30)->'ranking', '[]'::jsonb)) >= 0 as has_ranking;
