-- PATCH A.3 — Temporal Series API (read-only RPC functions)
-- Canonical metrics: docs/analytics/EXECUTIVE_METRICS.md + GROWTH_DASHBOARD.md
-- Production scope: public.mia_analytics_production_scope()

begin;

create or replace function public.mia_temporal_series_growth(
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
$$;

create or replace function public.mia_temporal_series_platform_activity(
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
  scoped as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
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
$$;

revoke all on function public.mia_temporal_series_growth(integer, integer) from public, anon, authenticated;
revoke all on function public.mia_temporal_series_platform_activity(integer, integer) from public, anon, authenticated;

grant execute on function public.mia_temporal_series_growth(integer, integer) to service_role;
grant execute on function public.mia_temporal_series_platform_activity(integer, integer) to service_role;

commit;
