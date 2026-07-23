-- PATCH 8.1 — Commercial Search Analytics (read-only · analytics_events)
-- Event: mia_commercial_search (server-side INSERT)
-- Delta: observa pipeline de busca comercial — não substitui data_layer_resolution (6.4) nem reliability (7.x)
-- Production filter: docs/analytics/analytics-production-scope.sql + commercial_search_test exclusion

\i docs/analytics/sql/patch-81-query1-search-volume.sql
\i docs/analytics/sql/patch-81-query2-query-extraction.sql
\i docs/analytics/sql/patch-81-query3-search-paths.sql
\i docs/analytics/sql/patch-81-query4-search-results.sql
\i docs/analytics/sql/patch-81-query5-correlation-diagnostic.sql
