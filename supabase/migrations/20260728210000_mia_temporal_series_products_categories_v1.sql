-- PATCH A.5 — Temporal Series: Products & Categories (PATCH 4.4 canonical SQL)
-- Source: docs/analytics/PRODUCTS_CATEGORIES_DASHBOARD.md

begin;

create or replace function public.mia_temporal_series_products(
  p_days integer default 30,
  p_offset_days integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with window_bounds as (
    select
      greatest(p_days, 1) as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days,
      now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0)) as start_ts,
      now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0)) as end_ts
  ),
  production_events as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  product_events as (
    select
      *,
      (created_at at time zone 'UTC')::date as activity_day
    from production_events
    where event_name in (
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
      and product_name is not null
  ),
  summary_row as (
    select
      count(distinct product_name)::bigint as distinct_products,
      count(*)::bigint as total_aparicoes,
      count(*) filter (where event_name = 'mia_recommendation_shown')::bigint as total_recomendacoes,
      count(*) filter (where event_name = 'offer_click')::bigint as total_cliques,
      count(*) filter (where event_name = 'favorite_created')::bigint as total_favoritos,
      count(*) filter (where event_name = 'price_alert_created')::bigint as total_alertas,
      count(*) filter (
        where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
      )::bigint as sinais_intencao_compra,
      count(distinct visitor_id) filter (where visitor_id is not null)::bigint as visitantes_distintos
    from product_events
  ),
  ranking_rows as (
    select jsonb_build_object(
      'product_label', product_name,
      'product_id', max(product_id) filter (where product_id is not null),
      'product_brand', max(product_brand) filter (where product_brand is not null),
      'total_aparicoes', count(*)::bigint,
      'total_recomendacoes', count(*) filter (where event_name = 'mia_recommendation_shown')::bigint,
      'total_cliques', count(*) filter (where event_name = 'offer_click')::bigint,
      'total_favoritos', count(*) filter (where event_name = 'favorite_created')::bigint,
      'total_alertas', count(*) filter (where event_name = 'price_alert_created')::bigint,
      'sinais_intencao_compra', count(*) filter (
        where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
      )::bigint,
      'visitantes_distintos', count(distinct visitor_id) filter (where visitor_id is not null)::bigint,
      'taxa_clique_recomendacao', round(
        count(*) filter (where event_name = 'offer_click')::numeric
        / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
        4
      )
    ) as row,
    count(*) as sort_aparicoes,
    count(*) filter (where event_name = 'mia_recommendation_shown') as sort_recomendacoes
    from product_events
    group by product_name
    order by sort_aparicoes desc, sort_recomendacoes desc
    limit 20
  ),
  daily_rows as (
    select jsonb_build_object(
      'activity_day', activity_day,
      'product_label', product_name,
      'total_aparicoes', count(*)::bigint,
      'total_recomendacoes', count(*) filter (where event_name = 'mia_recommendation_shown')::bigint,
      'total_cliques', count(*) filter (where event_name = 'offer_click')::bigint,
      'visitantes_distintos', count(distinct visitor_id) filter (where visitor_id is not null)::bigint,
      'taxa_clique_recomendacao', round(
        count(*) filter (where event_name = 'offer_click')::numeric
        / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
        4
      )
    ) as row,
    activity_day,
    count(*) as sort_total
    from product_events
    group by activity_day, product_name
    order by activity_day desc, sort_total desc
    limit 21
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'granularity', 'day',
    'window_days', (select window_days from window_bounds),
    'offset_days', (select offset_days from window_bounds),
    'summary', (
      select jsonb_build_object(
        'distinct_products', coalesce(distinct_products, 0),
        'total_aparicoes', coalesce(total_aparicoes, 0),
        'total_recomendacoes', coalesce(total_recomendacoes, 0),
        'total_cliques', coalesce(total_cliques, 0),
        'total_favoritos', coalesce(total_favoritos, 0),
        'total_alertas', coalesce(total_alertas, 0),
        'sinais_intencao_compra', coalesce(sinais_intencao_compra, 0),
        'visitantes_distintos', coalesce(visitantes_distintos, 0),
        'taxa_clique_recomendacao', round(
          coalesce(total_cliques, 0)::numeric / nullif(coalesce(total_recomendacoes, 0), 0),
          4
        )
      )
      from summary_row
    ),
    'ranking', coalesce((select jsonb_agg(row order by sort_aparicoes desc, sort_recomendacoes desc) from ranking_rows), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(row order by activity_day desc, sort_total desc) from daily_rows), '[]'::jsonb)
  );
$$;

create or replace function public.mia_temporal_series_categories(
  p_days integer default 30,
  p_offset_days integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with window_bounds as (
    select
      greatest(p_days, 1) as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days,
      now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0)) as start_ts,
      now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0)) as end_ts
  ),
  production_events as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  category_events as (
    select
      *,
      (created_at at time zone 'UTC')::date as activity_day
    from production_events
    where event_name in (
      'mia_question_sent',
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
      and category is not null
      and category not in (
        'price_alert_email',
        'price_alert_email_test',
        'price_alert_e2e_test'
      )
  ),
  summary_row as (
    select
      count(distinct category)::bigint as distinct_categories,
      count(*) filter (where event_name = 'mia_question_sent')::bigint as total_perguntas,
      count(*) filter (where event_name = 'mia_recommendation_shown')::bigint as total_recomendacoes,
      count(*) filter (where event_name = 'offer_click')::bigint as total_cliques,
      count(*) filter (where event_name = 'favorite_created')::bigint as total_favoritos,
      count(*) filter (where event_name = 'price_alert_created')::bigint as total_alertas,
      count(*)::bigint as total_eventos_categoria,
      count(distinct visitor_id) filter (where visitor_id is not null)::bigint as visitantes_distintos,
      count(*) filter (
        where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
      )::bigint as sinais_intencao_compra
    from category_events
  ),
  ranking_rows as (
    select jsonb_build_object(
      'category', category,
      'total_perguntas', count(*) filter (where event_name = 'mia_question_sent')::bigint,
      'total_recomendacoes', count(*) filter (where event_name = 'mia_recommendation_shown')::bigint,
      'total_cliques', count(*) filter (where event_name = 'offer_click')::bigint,
      'total_favoritos', count(*) filter (where event_name = 'favorite_created')::bigint,
      'total_alertas', count(*) filter (where event_name = 'price_alert_created')::bigint,
      'total_eventos_categoria', count(*)::bigint,
      'visitantes_distintos', count(distinct visitor_id) filter (where visitor_id is not null)::bigint,
      'sinais_intencao_compra', count(*) filter (
        where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
      )::bigint,
      'taxa_conversao_pergunta_recomendacao', round(
        count(*) filter (where event_name = 'mia_recommendation_shown')::numeric
        / nullif(count(*) filter (where event_name = 'mia_question_sent'), 0),
        4
      ),
      'taxa_conversao_recomendacao_clique', round(
        count(*) filter (where event_name = 'offer_click')::numeric
        / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
        4
      ),
      'taxa_intencao_pos_recomendacao', round(
        count(*) filter (
          where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
        )::numeric
        / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
        4
      )
    ) as row,
    count(*) as sort_total,
    count(*) filter (where event_name = 'mia_question_sent') as sort_perguntas
    from category_events
    group by category
    order by sort_total desc, sort_perguntas desc
    limit 20
  ),
  daily_rows as (
    select jsonb_build_object(
      'activity_day', activity_day,
      'category', category,
      'eventos_perguntas', count(*) filter (where event_name = 'mia_question_sent')::bigint,
      'eventos_recomendacoes', count(*) filter (where event_name = 'mia_recommendation_shown')::bigint,
      'eventos_cliques', count(*) filter (where event_name = 'offer_click')::bigint,
      'total_eventos', count(*)::bigint,
      'visitantes_distintos', count(distinct visitor_id) filter (where visitor_id is not null)::bigint
    ) as row,
    activity_day,
    count(*) as sort_total
    from category_events
    group by activity_day, category
    order by activity_day desc, sort_total desc
    limit 21
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'granularity', 'day',
    'window_days', (select window_days from window_bounds),
    'offset_days', (select offset_days from window_bounds),
    'summary', (
      select jsonb_build_object(
        'distinct_categories', coalesce(distinct_categories, 0),
        'total_perguntas', coalesce(total_perguntas, 0),
        'total_recomendacoes', coalesce(total_recomendacoes, 0),
        'total_cliques', coalesce(total_cliques, 0),
        'total_favoritos', coalesce(total_favoritos, 0),
        'total_alertas', coalesce(total_alertas, 0),
        'total_eventos_categoria', coalesce(total_eventos_categoria, 0),
        'visitantes_distintos', coalesce(visitantes_distintos, 0),
        'sinais_intencao_compra', coalesce(sinais_intencao_compra, 0),
        'taxa_conversao_pergunta_recomendacao', round(
          coalesce(total_recomendacoes, 0)::numeric / nullif(coalesce(total_perguntas, 0), 0),
          4
        ),
        'taxa_conversao_recomendacao_clique', round(
          coalesce(total_cliques, 0)::numeric / nullif(coalesce(total_recomendacoes, 0), 0),
          4
        )
      )
      from summary_row
    ),
    'ranking', coalesce((select jsonb_agg(row order by sort_total desc, sort_perguntas desc) from ranking_rows), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(row order by activity_day desc, sort_total desc) from daily_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.mia_temporal_series_products(integer, integer) from public, anon, authenticated;
revoke all on function public.mia_temporal_series_categories(integer, integer) from public, anon, authenticated;

grant execute on function public.mia_temporal_series_products(integer, integer) to service_role;
grant execute on function public.mia_temporal_series_categories(integer, integer) to service_role;

commit;
