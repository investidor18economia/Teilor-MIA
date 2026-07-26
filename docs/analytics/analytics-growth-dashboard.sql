-- PATCH 4.2 — Growth Dashboard (MIA public events · production scope)
-- Canonical metrics: docs/analytics/EXECUTIVE_METRICS.md (PATCH 4.1 — reutilização obrigatória)
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Daily growth (DAU + rolling WAU/MAU + new/returning + day-over-day)
-- Query 2 — Period comparison (current vs previous rolling windows)
-- Query 3 — New visitor acquisition by first_active_day

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Daily growth evolution
-- ═══════════════════════════════════════════════════════════════════════════════

with production_events as (
  select *
  from analytics_events
  where not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
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
    lag(dau_visitors) over (order by dia) as dau_visitors_dia_anterior,
    lag(dau_users) over (order by dia) as dau_users_dia_anterior,
    lag(wau_visitors) over (order by dia) as wau_visitors_dia_anterior,
    lag(wau_users) over (order by dia) as wau_users_dia_anterior,
    lag(mau_visitors) over (order by dia) as mau_visitors_dia_anterior,
    lag(mau_users) over (order by dia) as mau_users_dia_anterior
  from daily_base
)
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
  taxa_autenticacao,
  round(
    (dau_visitors - dau_visitors_dia_anterior)::numeric
    / nullif(dau_visitors_dia_anterior, 0),
    4
  ) as crescimento_dau_visitors_pct,
  round(
    (dau_users - dau_users_dia_anterior)::numeric
    / nullif(dau_users_dia_anterior, 0),
    4
  ) as crescimento_dau_users_pct,
  round(
    (wau_visitors - wau_visitors_dia_anterior)::numeric
    / nullif(wau_visitors_dia_anterior, 0),
    4
  ) as crescimento_wau_visitors_pct,
  round(
    (wau_users - wau_users_dia_anterior)::numeric
    / nullif(wau_users_dia_anterior, 0),
    4
  ) as crescimento_wau_users_pct,
  round(
    (mau_visitors - mau_visitors_dia_anterior)::numeric
    / nullif(mau_visitors_dia_anterior, 0),
    4
  ) as crescimento_mau_visitors_pct,
  round(
    (mau_users - mau_users_dia_anterior)::numeric
    / nullif(mau_users_dia_anterior, 0),
    4
  ) as crescimento_mau_users_pct
from daily_growth
order by dia desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Period comparison (reference day = latest UTC day with visitor activity)
-- ═══════════════════════════════════════════════════════════════════════════════

with production_events as (
  select *
  from analytics_events
  where not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
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
reference_day as (
  select max(activity_day) as ref_day
  from qualifying_events
  where visitor_id is not null
),
ref as (
  select ref_day from reference_day
),
metrics_at as (
  select
    r.ref_day as anchor_day,
    'atual'::text as periodo,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null and qe.activity_day = r.ref_day
    ) as dau_visitors,
    count(distinct qe.user_id) filter (
      where qe.user_id is not null and qe.activity_day = r.ref_day
    ) as dau_users,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null
        and qe.activity_day between r.ref_day - 6 and r.ref_day
    ) as wau_visitors,
    count(distinct qe.user_id) filter (
      where qe.user_id is not null
        and qe.activity_day between r.ref_day - 6 and r.ref_day
    ) as wau_users,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null
        and qe.activity_day between r.ref_day - 29 and r.ref_day
    ) as mau_visitors,
    count(distinct qe.user_id) filter (
      where qe.user_id is not null
        and qe.activity_day between r.ref_day - 29 and r.ref_day
    ) as mau_users
  from qualifying_events qe
  cross join ref r
  group by r.ref_day
),
metrics_prev_day as (
  select
    r.ref_day as anchor_day,
    'dia_anterior'::text as periodo,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null and qe.activity_day = r.ref_day - 1
    ) as dau_visitors,
    count(distinct qe.user_id) filter (
      where qe.user_id is not null and qe.activity_day = r.ref_day - 1
    ) as dau_users,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null
        and qe.activity_day between r.ref_day - 7 and r.ref_day - 1
    ) as wau_visitors,
    count(distinct qe.user_id) filter (
      where qe.user_id is not null
        and qe.activity_day between r.ref_day - 7 and r.ref_day - 1
    ) as wau_users,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null
        and qe.activity_day between r.ref_day - 30 and r.ref_day - 1
    ) as mau_visitors,
    count(distinct qe.user_id) filter (
      where qe.user_id is not null
        and qe.activity_day between r.ref_day - 30 and r.ref_day - 1
    ) as mau_users
  from qualifying_events qe
  cross join ref r
  group by r.ref_day
),
combined as (
  select * from metrics_at
  union all
  select * from metrics_prev_day
)
select
  anchor_day as dia_referencia,
  periodo,
  dau_visitors,
  dau_users,
  wau_visitors,
  wau_users,
  mau_visitors,
  mau_users
from combined
order by periodo;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — New visitor acquisition (first_active_day cohorts)
-- ═══════════════════════════════════════════════════════════════════════════════

with production_events as (
  select *
  from analytics_events
  where not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
),
qualifying_events as (
  select
    visitor_id,
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
    and visitor_id is not null
),
visitor_first_day as (
  select
    visitor_id,
    min(activity_day) as first_active_day
  from qualifying_events
  group by visitor_id
),
acquisition_daily as (
  select
    first_active_day as dia,
    count(*) as new_visitors
  from visitor_first_day
  group by first_active_day
)
select
  dia,
  new_visitors,
  sum(new_visitors) over (order by dia rows unbounded preceding) as new_visitors_acumulado
from acquisition_daily
order by dia desc;
