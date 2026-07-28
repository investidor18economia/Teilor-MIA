-- PATCH A.7 — Advanced Filters (window + category + product_id)
-- Generated from canonical RPC migrations

begin;

create or replace function public.mia_analytics_resolve_window(
  p_days integer default 30,
  p_offset_days integer default 0,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  start_ts timestamptz,
  end_ts timestamptz,
  window_mode text,
  reference_days integer
)
language sql
stable
as $$
  select
    case
      when p_start_date is not null and p_end_date is not null then
        (p_start_date::timestamp at time zone 'UTC')
      else
        now() - make_interval(days => greatest(coalesce(p_days, 30), 1) + greatest(coalesce(p_offset_days, 0), 0))
    end,
    case
      when p_start_date is not null and p_end_date is not null then
        ((p_end_date + 1)::timestamp at time zone 'UTC')
      else
        now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
    end,
    case when p_start_date is not null and p_end_date is not null then 'custom_range' else 'rolling_window' end,
    case
      when p_start_date is not null and p_end_date is not null then greatest(1, (p_end_date - p_start_date + 1))::integer
      else greatest(coalesce(p_days, 30), 1)
    end;
$$;


create or replace function public.mia_temporal_series_growth(
  p_days integer default 30,
  p_offset_days integer default 0
, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with window_bounds as (
    select
      w.start_ts,
      w.end_ts,
      w.window_mode,
      w.reference_days,
      w.reference_days as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days
    from public.mia_analytics_resolve_window(p_days, p_offset_days, p_start_date, p_end_date) w
  ),
  production_events as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  qualifying_events as (
    select
      *,
      (created_at at time zone 'UTC')::date as activity_day
    from production_events
    where event_name in (
      'session_started',
      'user_authenticated',
      'mia_question_sent',
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
  ),
  visitor_first_day as (
    select
      visitor_id,
      min(activity_day) as first_active_day
    from qualifying_events
    where visitor_id is not null
    group by visitor_id
  ),
  authenticated_visitors as (
    select distinct visitor_id
    from production_events
    where visitor_id is not null
      and user_id is not null
  ),
  activity_days as (
    select distinct activity_day as dia
    from qualifying_events
    where visitor_id is not null
  ),
  daily_metrics as (
    select
      qe.activity_day as dia,
      count(distinct qe.visitor_id) as dau_visitors,
      count(distinct qe.visitor_id) filter (
        where vfd.first_active_day = qe.activity_day
      ) as new_visitors,
      count(distinct qe.visitor_id) filter (
        where vfd.first_active_day < qe.activity_day
      ) as returning_visitors,
      count(distinct qe.visitor_id) filter (
        where qe.visitor_id not in (select visitor_id from authenticated_visitors)
      ) as anonymous_visitors,
      count(distinct qe.user_id) as dau_users,
      count(distinct qe.user_id) filter (
        where qe.event_name = 'user_authenticated'
      ) as authenticated_users
    from qualifying_events qe
    join visitor_first_day vfd on vfd.visitor_id = qe.visitor_id
    where qe.visitor_id is not null
    group by qe.activity_day
  ),
  rolling_wau as (
    select
      ad.dia,
      count(distinct qe.visitor_id) as wau_visitors,
      count(distinct qe.user_id) as wau_users
    from activity_days ad
    join qualifying_events qe
      on qe.activity_day between ad.dia - 6 and ad.dia
    group by ad.dia
  ),
  rolling_mau as (
    select
      ad.dia,
      count(distinct qe.visitor_id) as mau_visitors,
      count(distinct qe.user_id) as mau_users
    from activity_days ad
    join qualifying_events qe
      on qe.activity_day between ad.dia - 29 and ad.dia
    group by ad.dia
  ),
  daily_base as (
    select
      dm.dia,
      dm.dau_visitors,
      dm.dau_users,
      rw.wau_visitors,
      rw.wau_users,
      rm.mau_visitors,
      rm.mau_users,
      dm.new_visitors,
      dm.returning_visitors,
      dm.anonymous_visitors,
      dm.authenticated_users
    from daily_metrics dm
    join rolling_wau rw on rw.dia = dm.dia
    join rolling_mau rm on rm.dia = dm.dia
  ),
  daily_growth as (
    select
      dia,
      dau_visitors,
      dau_users,
      wau_visitors,
      wau_users,
      mau_visitors,
      mau_users,
      new_visitors,
      returning_visitors,
      anonymous_visitors,
      authenticated_users,
      round(
        authenticated_users::numeric / nullif(dau_visitors, 0),
        4
      ) as taxa_autenticacao,
      lag(dau_visitors) over (order by dia) as dau_visitors_prev,
      lag(dau_users) over (order by dia) as dau_users_prev,
      lag(wau_visitors) over (order by dia) as wau_visitors_prev,
      lag(wau_users) over (order by dia) as wau_users_prev,
      lag(mau_visitors) over (order by dia) as mau_visitors_prev,
      lag(mau_users) over (order by dia) as mau_users_prev
    from daily_base
  ),
  series_rows as (
    select jsonb_build_object(
      'activity_day', dia,
      'dau_visitors', dau_visitors,
      'dau_users', dau_users,
      'wau_visitors', wau_visitors,
      'wau_users', wau_users,
      'mau_visitors', mau_visitors,
      'mau_users', mau_users,
      'new_visitors', new_visitors,
      'returning_visitors', returning_visitors,
      'anonymous_visitors', anonymous_visitors,
      'authenticated_users', authenticated_users,
      'taxa_autenticacao', taxa_autenticacao,
      'crescimento_dau_visitors_pct', round(
        (dau_visitors - dau_visitors_prev)::numeric / nullif(dau_visitors_prev, 0),
        4
      ),
      'crescimento_dau_users_pct', round(
        (dau_users - dau_users_prev)::numeric / nullif(dau_users_prev, 0),
        4
      ),
      'crescimento_wau_visitors_pct', round(
        (wau_visitors - wau_visitors_prev)::numeric / nullif(wau_visitors_prev, 0),
        4
      ),
      'crescimento_wau_users_pct', round(
        (wau_users - wau_users_prev)::numeric / nullif(wau_users_prev, 0),
        4
      ),
      'crescimento_mau_visitors_pct', round(
        (mau_visitors - mau_visitors_prev)::numeric / nullif(mau_visitors_prev, 0),
        4
      ),
      'crescimento_mau_users_pct', round(
        (mau_users - mau_users_prev)::numeric / nullif(mau_users_prev, 0),
        4
      )
    ) as row,
    dia
    from daily_growth
  )
  select jsonb_build_object(
    'grain', 'day',
    'granularity', 'day',
    'window_days', (select window_days from window_bounds),
    'offset_days', (select offset_days from window_bounds),
    'series', coalesce((
      select jsonb_agg(row order by dia desc)
      from series_rows
    ), '[]'::jsonb)
  );
$$;;

create or replace function public.mia_temporal_series_platform_activity(
  p_days integer default 30,
  p_offset_days integer default 0
, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
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
  scoped as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  daily as (
    select
      (created_at at time zone 'UTC')::date as activity_day,
      coalesce(count(distinct session_id) filter (
        where session_id is not null and event_name = 'session_started'
      ), 0)::bigint as total_sessions,
      coalesce(count(distinct conversation_id) filter (
        where conversation_id is not null
      ), 0)::bigint as conversations,
      coalesce(count(*) filter (where event_name = 'mia_question_sent'), 0)::bigint as questions,
      coalesce(count(*) filter (where event_name = 'mia_recommendation_shown'), 0)::bigint as recommendations_shown
    from scoped
    group by (created_at at time zone 'UTC')::date
  ),
  series_rows as (
    select jsonb_build_object(
      'activity_day', activity_day,
      'total_sessions', total_sessions,
      'conversations', conversations,
      'questions', questions,
      'recommendations_shown', recommendations_shown
    ) as row,
    activity_day
    from daily
  )
  select jsonb_build_object(
    'grain', 'day',
    'granularity', 'day',
    'window_days', (select window_days from window_bounds),
    'offset_days', (select offset_days from window_bounds),
    'series', coalesce((
      select jsonb_agg(row order by activity_day desc)
      from series_rows
    ), '[]'::jsonb)
  );
$$;;

create or replace function public.mia_temporal_series_products(
  p_days integer default 30,
  p_offset_days integer default 0
, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with window_bounds as (
    select
      w.start_ts,
      w.end_ts,
      w.window_mode,
      w.reference_days,
      w.reference_days as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days
    from public.mia_analytics_resolve_window(p_days, p_offset_days, p_start_date, p_end_date) w
  ),
  production_events as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
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
$$;;

create or replace function public.mia_temporal_series_categories(
  p_days integer default 30,
  p_offset_days integer default 0
, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with window_bounds as (
    select
      w.start_ts,
      w.end_ts,
      w.window_mode,
      w.reference_days,
      w.reference_days as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days
    from public.mia_analytics_resolve_window(p_days, p_offset_days, p_start_date, p_end_date) w
  ),
  production_events as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
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
$$;;

create or replace function public.mia_temporal_series_conversion(
  p_days integer default 30,
  p_offset_days integer default 0
, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with window_bounds as (
    select
      w.start_ts,
      w.end_ts,
      w.window_mode,
      w.reference_days,
      w.reference_days as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days
    from public.mia_analytics_resolve_window(p_days, p_offset_days, p_start_date, p_end_date) w
  ),
  production_events as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  funnel_events as (
    select
      *,
      (created_at at time zone 'UTC')::date as activity_day
    from production_events
    where event_name in (
      'session_started',
      'mia_question_sent',
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
  ),
  period_summary as (
    select
      count(*) filter (where event_name = 'mia_recommendation_shown')::bigint as eventos_recomendacoes,
      count(*) filter (where event_name = 'offer_click')::bigint as eventos_cliques,
      count(*) filter (where event_name = 'favorite_created')::bigint as eventos_favoritos,
      count(*) filter (where event_name = 'price_alert_created')::bigint as eventos_alertas,
      count(*) filter (where event_name = 'mia_question_sent')::bigint as eventos_perguntas,
      count(distinct visitor_id) filter (where event_name = 'mia_recommendation_shown' and visitor_id is not null)::bigint as visitantes_recomendacao,
      count(distinct visitor_id) filter (where event_name = 'offer_click' and visitor_id is not null)::bigint as visitantes_clique
    from funnel_events
  ),
  reference_day as (
    select max(activity_day) as ref_day
    from funnel_events
    where visitor_id is not null
  ),
  day_events as (
    select fe.*
    from funnel_events fe
    cross join reference_day r
    where fe.activity_day = r.ref_day
  ),
  visitor_milestones as (
    select
      visitor_id,
      min(created_at) filter (where event_name = 'session_started') as t_sessao,
      min(created_at) filter (where event_name = 'mia_question_sent') as t_pergunta,
      min(created_at) filter (where event_name = 'mia_recommendation_shown') as t_recomendacao,
      min(created_at) filter (where event_name = 'offer_click') as t_clique,
      min(created_at) filter (where event_name = 'favorite_created') as t_favorito,
      min(created_at) filter (where event_name = 'price_alert_created') as t_alerta
    from day_events
    where visitor_id is not null
    group by visitor_id
  ),
  visitor_sequential as (
    select
      count(*) filter (where t_sessao is not null) as v1,
      count(*) filter (where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao) as v2,
      count(*) filter (where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta) as v3,
      count(*) filter (where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao) as v4,
      count(*) filter (where t_clique is not null and t_favorito is not null and t_favorito >= t_clique) as v5,
      count(*) filter (where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito) as v6
    from visitor_milestones
  ),
  funnel_rows as (
    select *
    from (
      values
        (1, 'sessoes_iniciadas', 'session_started'),
        (2, 'perguntas_enviadas', 'mia_question_sent'),
        (3, 'recomendacoes_exibidas', 'mia_recommendation_shown'),
        (4, 'cliques_em_oferta', 'offer_click'),
        (5, 'favoritos_criados', 'favorite_created'),
        (6, 'alertas_preco_criados', 'price_alert_created')
    ) as t(ordem, etapa, event_name)
  ),
  reach_volumes as (
    select
      count(distinct visitor_id) filter (where event_name = 'session_started') as visitantes_sessao,
      count(*) filter (where event_name = 'session_started') as eventos_sessao,
      count(distinct visitor_id) filter (where event_name = 'mia_question_sent') as visitantes_pergunta,
      count(*) filter (where event_name = 'mia_question_sent') as eventos_perguntas,
      count(distinct visitor_id) filter (where event_name = 'mia_recommendation_shown') as visitantes_recomendacao,
      count(*) filter (where event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
      count(distinct visitor_id) filter (where event_name = 'offer_click') as visitantes_clique,
      count(*) filter (where event_name = 'offer_click') as eventos_cliques,
      count(distinct visitor_id) filter (where event_name = 'favorite_created') as visitantes_favorito,
      count(*) filter (where event_name = 'favorite_created') as eventos_favoritos,
      count(distinct visitor_id) filter (where event_name = 'price_alert_created') as visitantes_alerta,
      count(*) filter (where event_name = 'price_alert_created') as eventos_alertas
    from day_events
  ),
  funnel_data as (
    select
      fr.ordem,
      fr.etapa,
      fr.event_name,
      case fr.ordem
        when 1 then rv.visitantes_sessao when 2 then rv.visitantes_pergunta when 3 then rv.visitantes_recomendacao
        when 4 then rv.visitantes_clique when 5 then rv.visitantes_favorito when 6 then rv.visitantes_alerta
      end as visitantes,
      case fr.ordem
        when 1 then rv.eventos_sessao when 2 then rv.eventos_perguntas when 3 then rv.eventos_recomendacoes
        when 4 then rv.eventos_cliques when 5 then rv.eventos_favoritos when 6 then rv.eventos_alertas
      end as eventos,
      case fr.ordem
        when 1 then vs.v1 when 2 then vs.v2 when 3 then vs.v3 when 4 then vs.v4 when 5 then vs.v5 when 6 then vs.v6
      end as visitantes_sequenciais
    from funnel_rows fr
    cross join reach_volumes rv
    cross join visitor_sequential vs
  ),
  funnel_rates as (
    select
      fd.*,
      lag(fd.visitantes_sequenciais) over (order by fd.ordem) as visitantes_seq_anterior,
      first_value(fd.visitantes_sequenciais) over (order by fd.ordem) as visitantes_topo
    from funnel_data fd
  ),
  funnel_stages_rows as (
    select jsonb_build_object(
      'ordem', fr.ordem,
      'etapa', fr.etapa,
      'event_name', fr.event_name,
      'visitantes', fr.visitantes,
      'eventos', fr.eventos,
      'visitantes_sequenciais', fr.visitantes_sequenciais,
      'taxa_conversao_visitante', round(fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_seq_anterior, 0), 4),
      'abandono_visitante', round(1 - fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_seq_anterior, 0), 4),
      'conversao_acumulada_visitante', round(fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_topo, 0), 4)
    ) as row,
    fr.ordem
    from funnel_rates fr
  ),
  stage_counts as (
    select
      count(*) filter (where t_sessao is not null) as n_sessao,
      count(*) filter (where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao) as n_pergunta,
      count(*) filter (where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta) as n_recomendacao,
      count(*) filter (where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao) as n_clique,
      count(*) filter (where t_clique is not null and t_favorito is not null and t_favorito >= t_clique) as n_favorito,
      count(*) filter (where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito) as n_alerta
    from visitor_milestones
  ),
  transitions as (
    select * from (
      values
        (1, 'sessao_para_pergunta', 'sessoes_iniciadas', 'perguntas_enviadas'),
        (2, 'pergunta_para_recomendacao', 'perguntas_enviadas', 'recomendacoes_exibidas'),
        (3, 'recomendacao_para_clique', 'recomendacoes_exibidas', 'cliques_em_oferta'),
        (4, 'clique_para_favorito', 'cliques_em_oferta', 'favoritos_criados'),
        (5, 'favorito_para_alerta', 'favoritos_criados', 'alertas_preco_criados')
    ) as t(ordem_transicao, transicao, etapa_origem, etapa_destino)
  ),
  transition_rates as (
    select
      t.ordem_transicao,
      t.transicao,
      t.etapa_origem,
      t.etapa_destino,
      case t.ordem_transicao when 1 then sc.n_sessao when 2 then sc.n_pergunta when 3 then sc.n_recomendacao when 4 then sc.n_clique when 5 then sc.n_favorito end as visitantes_entrada,
      case t.ordem_transicao when 1 then sc.n_pergunta when 2 then sc.n_recomendacao when 3 then sc.n_clique when 4 then sc.n_favorito when 5 then sc.n_alerta end as visitantes_saida,
      round(
        (case t.ordem_transicao when 1 then sc.n_pergunta when 2 then sc.n_recomendacao when 3 then sc.n_clique when 4 then sc.n_favorito when 5 then sc.n_alerta end)::numeric
        / nullif(case t.ordem_transicao when 1 then sc.n_sessao when 2 then sc.n_pergunta when 3 then sc.n_recomendacao when 4 then sc.n_clique when 5 then sc.n_favorito end, 0),
        4
      ) as taxa_conversao_transicao,
      round(
        1 - (case t.ordem_transicao when 1 then sc.n_pergunta when 2 then sc.n_recomendacao when 3 then sc.n_clique when 4 then sc.n_favorito when 5 then sc.n_alerta end)::numeric
        / nullif(case t.ordem_transicao when 1 then sc.n_sessao when 2 then sc.n_pergunta when 3 then sc.n_recomendacao when 4 then sc.n_clique when 5 then sc.n_favorito end, 0),
        4
      ) as taxa_abandono_transicao
    from transitions t
    cross join stage_counts sc
  ),
  bottleneck_rows as (
    select jsonb_build_object(
      'ordem_transicao', tr.ordem_transicao,
      'transicao', tr.transicao,
      'etapa_origem', tr.etapa_origem,
      'etapa_destino', tr.etapa_destino,
      'visitantes_entrada', tr.visitantes_entrada,
      'visitantes_saida', tr.visitantes_saida,
      'taxa_conversao_transicao', tr.taxa_conversao_transicao,
      'taxa_abandono_transicao', tr.taxa_abandono_transicao,
      'is_gargalo_principal', tr.taxa_abandono_transicao = max(tr.taxa_abandono_transicao) over ()
    ) as row,
    tr.ordem_transicao
    from transition_rates tr
  ),
  daily_reach as (
    select
      fe.activity_day as dia,
      count(*) filter (where fe.event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
      count(*) filter (where fe.event_name = 'offer_click') as eventos_cliques,
      count(*) filter (where fe.event_name = 'favorite_created') as eventos_favoritos,
      count(*) filter (where fe.event_name = 'price_alert_created') as eventos_alertas
    from funnel_events fe
    where fe.visitor_id is not null
    group by fe.activity_day
  ),
  daily_rows as (
    select jsonb_build_object(
      'activity_day', dr.dia,
      'eventos_recomendacoes', dr.eventos_recomendacoes,
      'eventos_cliques', dr.eventos_cliques,
      'eventos_favoritos', dr.eventos_favoritos,
      'eventos_alertas', dr.eventos_alertas,
      'taxa_clique_recomendacao', round(dr.eventos_cliques::numeric / nullif(dr.eventos_recomendacoes, 0), 4),
      'taxa_favoritos_recomendacao', round(dr.eventos_favoritos::numeric / nullif(dr.eventos_recomendacoes, 0), 4),
      'taxa_alertas_recomendacao', round(dr.eventos_alertas::numeric / nullif(dr.eventos_recomendacoes, 0), 4)
    ) as row,
    dr.dia
    from daily_reach dr
    order by dr.dia desc
    limit 7
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'granularity', 'day',
    'window_days', (select window_days from window_bounds),
    'offset_days', (select offset_days from window_bounds),
    'reference_day', (select ref_day from reference_day),
    'summary', (
      select jsonb_build_object(
        'eventos_recomendacoes', coalesce(ps.eventos_recomendacoes, 0),
        'eventos_cliques', coalesce(ps.eventos_cliques, 0),
        'eventos_favoritos', coalesce(ps.eventos_favoritos, 0),
        'eventos_alertas', coalesce(ps.eventos_alertas, 0),
        'eventos_perguntas', coalesce(ps.eventos_perguntas, 0),
        'visitantes_recomendacao', coalesce(ps.visitantes_recomendacao, 0),
        'visitantes_clique', coalesce(ps.visitantes_clique, 0),
        'taxa_clique_recomendacao', round(coalesce(ps.eventos_cliques, 0)::numeric / nullif(coalesce(ps.eventos_recomendacoes, 0), 0), 4),
        'taxa_favoritos_recomendacao', round(coalesce(ps.eventos_favoritos, 0)::numeric / nullif(coalesce(ps.eventos_recomendacoes, 0), 0), 4),
        'taxa_alertas_recomendacao', round(coalesce(ps.eventos_alertas, 0)::numeric / nullif(coalesce(ps.eventos_recomendacoes, 0), 0), 4),
        'conversao_acumulada_visitante', (
          select round(vs.v6::numeric / nullif(vs.v1, 0), 4) from visitor_sequential vs
        )
      )
      from period_summary ps
    ),
    'funnel_stages', coalesce((select jsonb_agg(row order by ordem) from funnel_stages_rows), '[]'::jsonb),
    'bottlenecks', coalesce((select jsonb_agg(row order by ordem_transicao) from bottleneck_rows), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(row order by dia desc) from daily_rows), '[]'::jsonb)
  );
$$;;

create or replace function public.mia_executive_metrics_platform(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'denominator', 'days',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'total_sessions', coalesce((select count(distinct session_id)::bigint from scoped where session_id is not null and event_name = 'session_started'), 0),
    'unique_visitors', coalesce((select count(distinct visitor_id)::bigint from scoped where visitor_id is not null), 0),
    'conversations', coalesce((select count(distinct conversation_id)::bigint from scoped where conversation_id is not null), 0),
    'questions', coalesce((select count(*)::bigint from scoped where event_name = 'mia_question_sent'), 0)
  );
$$;;

create or replace function public.mia_executive_metrics_conversation(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  )
  select jsonb_build_object(
    'grain', 'event', 'denominator', 'conversation_events', 'window_days', p_days, 'offset_days', coalesce(p_offset_days, 0),
    'questions_sent', coalesce((select count(*)::bigint from scoped where event_name = 'mia_question_sent'), 0),
    'recommendations_shown', coalesce((select count(*)::bigint from scoped where event_name = 'mia_recommendation_shown'), 0),
    'conversations_with_questions', coalesce((select count(distinct conversation_id)::bigint from scoped where conversation_id is not null and event_name = 'mia_question_sent'), 0)
  );
$$;;

create or replace function public.mia_executive_metrics_recommendation(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  decisions as (select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_decision'),
  acceptance as (select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_acceptance_signal'),
  rejection as (select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_rejection_signal'),
  runner_up as (
    select count(*)::bigint as c from scoped
    where event_name = 'mia_recommendation_decision'
      and coalesce(metadata->>'runner_up_product_family', metadata->>'has_runner_up', '') <> ''
  )
  select jsonb_build_object(
    'grain', 'rolling_window', 'denominator', 'signal_events', 'window_days', p_days, 'offset_days', coalesce(p_offset_days, 0),
    'recommendations_generated', (select c from decisions),
    'acceptance_signals', (select c from acceptance),
    'rejection_signals', (select c from rejection),
    'recommendation_acceptance_rate', case when (select c from acceptance) + (select c from rejection) = 0 then null
      else round((select c from acceptance)::numeric / ((select c from acceptance) + (select c from rejection)), 4) end,
    'rejection_rate', case when (select c from acceptance) + (select c from rejection) = 0 then null
      else round((select c from rejection)::numeric / ((select c from acceptance) + (select c from rejection)), 4) end,
    'runner_up_usage', (select c from runner_up)
  );
$$;;

create or replace function public.mia_executive_metrics_commerce(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped as (
    select * from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  )
  select jsonb_build_object('grain','rolling_window','denominator','days','window_days',p_days,'offset_days',coalesce(p_offset_days,0),
    'offer_sets_generated', coalesce((select count(*)::bigint from scoped where event_name = 'mia_offer_set'), 0),
    'offers_returned', coalesce((select sum(greatest(coalesce(nullif(metadata->>'offer_count','')::int,0),0))::bigint from scoped where event_name = 'mia_offer_set'), 0),
    'providers_used', coalesce((select count(distinct metadata->>'winner_provider_id')::bigint from scoped where event_name = 'mia_offer_set' and coalesce(metadata->>'winner_provider_id','') <> ''), 0),
    'favorite_count', coalesce((select count(*)::bigint from scoped where event_name = 'favorite_created'), 0),
    'offer_clicks', coalesce((select count(*)::bigint from scoped where event_name = 'offer_click'), 0));
$$;;

create or replace function public.mia_executive_metrics_alerts(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped as (
    select * from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  )
  select jsonb_build_object('grain','rolling_window','denominator','days','window_days',p_days,'offset_days',coalesce(p_offset_days,0),
    'alerts_created', coalesce((select count(*)::bigint from scoped where event_name = 'price_alert_created' or (event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'CREATED')), 0),
    'alerts_active', coalesce((select count(distinct metadata->>'alert_id')::bigint from scoped where event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'ACTIVE' and coalesce(metadata->>'alert_id','') <> ''), 0),
    'target_reached', coalesce((select count(distinct metadata->>'alert_id')::bigint from scoped where event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'TARGET_REACHED' and coalesce(metadata->>'alert_id','') <> ''), 0),
    'notifications_sent', coalesce((select count(*)::bigint from scoped where event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'NOTIFICATION_SENT'), 0));
$$;;

create or replace function public.mia_executive_metrics_price_intelligence(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_price_intelligence'
      and coalesce(e.metadata->>'event_version', '') = '10.1.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  quality_map as (
    select
      case coalesce(metadata->>'price_quality', 'UNKNOWN')
        when 'HIGH' then 4
        when 'MEDIUM' then 3
        when 'LOW' then 2
        when 'INVALID' then 1
        else 0
      end as q_score,
      coalesce(metadata->>'price_confidence', 'UNKNOWN') as confidence
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'price_intelligence_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'events', (select count(*)::bigint from scoped),
    'average_price_quality_score', (select round(avg(q_score)::numeric, 2) from quality_map),
    'confidence_distribution', coalesce((
      select jsonb_object_agg(confidence, cnt)
      from (
        select confidence, count(*)::bigint as cnt
        from quality_map
        group by confidence
      ) t
    ), '{}'::jsonb)
  );
$$;;

create or replace function public.mia_executive_metrics_savings(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_savings_estimation'
      and coalesce(e.metadata->>'event_version', '') = '10.2.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  amounts as (
    select nullif(metadata->>'potential_savings_amount', '')::numeric as amt
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'savings_estimation_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'potential_savings_total', coalesce((select round(sum(amt), 2) from amounts where amt is not null and amt > 0), 0),
    'average_potential_savings', coalesce((select round(avg(amt), 2) from amounts where amt is not null and amt > 0), null),
    'opportunities_found', coalesce((select count(*)::bigint from amounts where amt is not null and amt > 0), 0)
  );
$$;;

create or replace function public.mia_executive_metrics_anti_regret(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_anti_regret_foundation'
      and coalesce(e.metadata->>'event_version', '') = '10.4.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  scores as (
    select
      nullif(metadata->>'anti_regret_score', '')::numeric as score,
      coalesce(metadata->>'anti_regret_confidence', 'UNKNOWN') as confidence
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'anti_regret_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'events', (select count(*)::bigint from scoped),
    'average_score', (select round(avg(score)::numeric, 2) from scores where score is not null),
    'confidence_distribution', coalesce((
      select jsonb_object_agg(confidence, cnt)
      from (
        select confidence, count(*)::bigint as cnt
        from scores
        group by confidence
      ) t
    ), '{}'::jsonb)
  );
$$;;

create or replace function public.mia_executive_metrics_user_value(p_days integer default 30, p_offset_days integer default 0, p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_user_value_outcome'
      and coalesce(e.metadata->>'event_version', '') = '10.5.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)
  ),
  scores as (
    select
      nullif(metadata->>'user_value_score', '')::numeric as score,
      coalesce(metadata->>'value_status', 'UNKNOWN') as value_status
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'user_value_outcome_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'events', (select count(*)::bigint from scoped),
    'average_user_value', (select round(avg(score)::numeric, 2) from scores where score is not null),
    'value_status_distribution', coalesce((
      select jsonb_object_agg(value_status, cnt)
      from (
        select value_status, count(*)::bigint as cnt
        from scores
        group by value_status
      ) t
    ), '{}'::jsonb),
    'verified_value_amount_count', coalesce((
      select count(*)::bigint
      from scoped
      where nullif(metadata->>'verified_value_amount', '') is not null
    ), 0)
  );
$$;;

commit;
