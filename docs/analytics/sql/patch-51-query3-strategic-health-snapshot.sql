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
reference_day as (
  select max(activity_day) as ref_day
  from qualifying_events
  where visitor_id is not null
),
ref_metrics as (
  select
    r.ref_day,
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
    ) as mau_users,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null
        and qe.activity_day = r.ref_day
        and vfd.first_active_day = r.ref_day
    ) as new_visitors,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id is not null
        and qe.activity_day = r.ref_day
        and vfd.first_active_day < r.ref_day
    ) as returning_visitors
  from qualifying_events qe
  cross join reference_day r
  left join visitor_first_day vfd on vfd.visitor_id = qe.visitor_id
  group by r.ref_day
),
daily_dau as (
  select
    qe.activity_day as dia,
    count(distinct qe.visitor_id) as dau_visitors
  from qualifying_events qe
  where qe.visitor_id is not null
  group by qe.activity_day
),
daily_growth as (
  select
    dia,
    dau_visitors,
    round(
      (dau_visitors - lag(dau_visitors) over (order by dia))::numeric
      / nullif(lag(dau_visitors) over (order by dia), 0),
      4
    ) as crescimento_dau_visitors_pct
  from daily_dau
),
growth_at_ref as (
  select
    dg.dia,
    dg.crescimento_dau_visitors_pct,
    lag(dg.crescimento_dau_visitors_pct) over (order by dg.dia) as crescimento_dau_anterior_pct
  from daily_growth dg
  join reference_day r on r.ref_day = dg.dia
),
growth_7d as (
  select
    round(avg(crescimento_dau_visitors_pct), 4) as media_crescimento_dau_7d_pct
  from daily_growth
  cross join reference_day r
  where dia between r.ref_day - 6 and r.ref_day
),
growth_7d_prev as (
  select
    round(avg(crescimento_dau_visitors_pct), 4) as media_crescimento_dau_7d_anterior_pct
  from daily_growth
  cross join reference_day r
  where dia between r.ref_day - 13 and r.ref_day - 7
),
visitor_cohort_retention_d7 as (
  select
    vfd.first_active_day as cohort_day,
    count(*) as cohort_size,
    count(distinct vfd.visitor_id) filter (
      where exists (
        select 1
        from qualifying_events qe2
        where qe2.visitor_id = vfd.visitor_id
          and qe2.activity_day = vfd.first_active_day + 7
      )
    ) as retained_d7
  from visitor_first_day vfd
  group by vfd.first_active_day
),
mature_d7_cohorts as (
  select
    round(avg(retained_d7::numeric / nullif(cohort_size, 0)), 4) as media_retention_d7_cohorts_maduros_pct,
    count(*) as cohorts_maduros_d7
  from visitor_cohort_retention_d7 vcr
  cross join reference_day r
  where vcr.cohort_day + 7 <= r.ref_day
    and vcr.cohort_day >= r.ref_day - 37
)
select
  rm.ref_day as dia_referencia,
  rm.dau_visitors,
  rm.dau_users,
  rm.wau_visitors,
  rm.wau_users,
  rm.mau_visitors,
  rm.mau_users,
  rm.new_visitors,
  rm.returning_visitors,
  round(rm.dau_visitors::numeric / nullif(rm.mau_visitors, 0), 4) as stickiness_dau_mau_visitors,
  round(rm.dau_users::numeric / nullif(rm.mau_users, 0), 4) as stickiness_dau_mau_users,
  round(rm.new_visitors::numeric / nullif(rm.dau_visitors, 0), 4) as participacao_novos_visitantes,
  round(rm.returning_visitors::numeric / nullif(rm.dau_visitors, 0), 4) as participacao_recorrentes,
  md.media_retention_d7_cohorts_maduros_pct,
  md.cohorts_maduros_d7,
  ga.crescimento_dau_visitors_pct as crescimento_dau_dia_pct,
  round(
    ga.crescimento_dau_visitors_pct - ga.crescimento_dau_anterior_pct,
    4
  ) as aceleracao_crescimento_dau_pct,
  g7.media_crescimento_dau_7d_pct,
  g7p.media_crescimento_dau_7d_anterior_pct,
  round(
    g7.media_crescimento_dau_7d_pct - g7p.media_crescimento_dau_7d_anterior_pct,
    4
  ) as delta_tendencia_crescimento_7d_pct,
  case
    when g7.media_crescimento_dau_7d_pct is null
      or g7p.media_crescimento_dau_7d_anterior_pct is null then null
    when g7.media_crescimento_dau_7d_pct > g7p.media_crescimento_dau_7d_anterior_pct
      then 'acelerando'
    when g7.media_crescimento_dau_7d_pct < g7p.media_crescimento_dau_7d_anterior_pct
      then 'desacelerando'
    else 'estavel'
  end as sinal_tendencia_crescimento
from ref_metrics rm
cross join mature_d7_cohorts md
cross join growth_7d g7
cross join growth_7d_prev g7p
left join growth_at_ref ga on ga.dia = rm.ref_day;
