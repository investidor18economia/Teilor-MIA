-- PATCH 5.1 — Growth Analytics Estratégico (MIA public events · production scope)
-- Canonical base metrics: docs/analytics/EXECUTIVE_METRICS.md (PATCH 4.1 — reutilização obrigatória)
-- Operational growth dashboard: docs/analytics/analytics-growth-dashboard.sql (PATCH 4.2 — NÃO duplicar)
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Visitor cohort retention (D1 · D7 · D30 by first_active_day)
-- Query 2 — Authenticated user cohort retention (D1 · D7 · D30)
-- Query 3 — Strategic growth health snapshot (reference day)
-- Query 4 — Retention trends · cohort comparison · segment analysis

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Visitor cohort retention by acquisition day
-- Cohort = first_active_day (EXECUTIVE_METRICS §3.5 · same as PATCH 4.2 Query 3)
-- Retained on day N = qualifying activity on cohort_day + N (calendar days UTC)
-- Maturity: retention_dN is NULL when cohort_day + N > reference_day
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
visitor_activity_days as (
  select distinct visitor_id, activity_day
  from qualifying_events
),
reference_day as (
  select max(activity_day) as ref_day
  from qualifying_events
),
cohort_sizes as (
  select
    first_active_day as cohort_day,
    count(*) as cohort_size
  from visitor_first_day
  group by first_active_day
),
retention_d1 as (
  select
    vfd.first_active_day as cohort_day,
    count(distinct vfd.visitor_id) as retained_d1
  from visitor_first_day vfd
  join visitor_activity_days vad
    on vad.visitor_id = vfd.visitor_id
    and vad.activity_day = vfd.first_active_day + 1
  group by vfd.first_active_day
),
retention_d7 as (
  select
    vfd.first_active_day as cohort_day,
    count(distinct vfd.visitor_id) as retained_d7
  from visitor_first_day vfd
  join visitor_activity_days vad
    on vad.visitor_id = vfd.visitor_id
    and vad.activity_day = vfd.first_active_day + 7
  group by vfd.first_active_day
),
retention_d30 as (
  select
    vfd.first_active_day as cohort_day,
    count(distinct vfd.visitor_id) as retained_d30
  from visitor_first_day vfd
  join visitor_activity_days vad
    on vad.visitor_id = vfd.visitor_id
    and vad.activity_day = vfd.first_active_day + 30
  group by vfd.first_active_day
)
select
  cs.cohort_day,
  cs.cohort_size,
  case
    when cs.cohort_day + 1 <= rd.ref_day then coalesce(r1.retained_d1, 0)
  end as retained_d1,
  case
    when cs.cohort_day + 1 <= rd.ref_day
      then round(coalesce(r1.retained_d1, 0)::numeric / nullif(cs.cohort_size, 0), 4)
  end as retention_d1_pct,
  case
    when cs.cohort_day + 7 <= rd.ref_day then coalesce(r7.retained_d7, 0)
  end as retained_d7,
  case
    when cs.cohort_day + 7 <= rd.ref_day
      then round(coalesce(r7.retained_d7, 0)::numeric / nullif(cs.cohort_size, 0), 4)
  end as retention_d7_pct,
  case
    when cs.cohort_day + 30 <= rd.ref_day then coalesce(r30.retained_d30, 0)
  end as retained_d30,
  case
    when cs.cohort_day + 30 <= rd.ref_day
      then round(coalesce(r30.retained_d30, 0)::numeric / nullif(cs.cohort_size, 0), 4)
  end as retention_d30_pct,
  rd.ref_day as dia_referencia
from cohort_sizes cs
cross join reference_day rd
left join retention_d1 r1 on r1.cohort_day = cs.cohort_day
left join retention_d7 r7 on r7.cohort_day = cs.cohort_day
left join retention_d30 r30 on r30.cohort_day = cs.cohort_day
order by cs.cohort_day desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Authenticated user cohort retention
-- Cohort = first qualifying activity day per user_id (EXECUTIVE_METRICS §4.1)
-- Limitation: offer_click omits user_id — subcontagem documentada
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
    user_id,
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
    and user_id is not null
),
user_first_day as (
  select
    user_id,
    min(activity_day) as first_active_day
  from qualifying_events
  group by user_id
),
user_activity_days as (
  select distinct user_id, activity_day
  from qualifying_events
),
reference_day as (
  select max(activity_day) as ref_day
  from qualifying_events
),
cohort_sizes as (
  select
    first_active_day as cohort_day,
    count(*) as cohort_size
  from user_first_day
  group by first_active_day
),
retention_d1 as (
  select
    ufd.first_active_day as cohort_day,
    count(distinct ufd.user_id) as retained_d1
  from user_first_day ufd
  join user_activity_days uad
    on uad.user_id = ufd.user_id
    and uad.activity_day = ufd.first_active_day + 1
  group by ufd.first_active_day
),
retention_d7 as (
  select
    ufd.first_active_day as cohort_day,
    count(distinct ufd.user_id) as retained_d7
  from user_first_day ufd
  join user_activity_days uad
    on uad.user_id = ufd.user_id
    and uad.activity_day = ufd.first_active_day + 7
  group by ufd.first_active_day
),
retention_d30 as (
  select
    ufd.first_active_day as cohort_day,
    count(distinct ufd.user_id) as retained_d30
  from user_first_day ufd
  join user_activity_days uad
    on uad.user_id = ufd.user_id
    and uad.activity_day = ufd.first_active_day + 30
  group by ufd.first_active_day
)
select
  cs.cohort_day,
  cs.cohort_size,
  case
    when cs.cohort_day + 1 <= rd.ref_day then coalesce(r1.retained_d1, 0)
  end as retained_d1,
  case
    when cs.cohort_day + 1 <= rd.ref_day
      then round(coalesce(r1.retained_d1, 0)::numeric / nullif(cs.cohort_size, 0), 4)
  end as retention_d1_pct,
  case
    when cs.cohort_day + 7 <= rd.ref_day then coalesce(r7.retained_d7, 0)
  end as retained_d7,
  case
    when cs.cohort_day + 7 <= rd.ref_day
      then round(coalesce(r7.retained_d7, 0)::numeric / nullif(cs.cohort_size, 0), 4)
  end as retention_d7_pct,
  case
    when cs.cohort_day + 30 <= rd.ref_day then coalesce(r30.retained_d30, 0)
  end as retained_d30,
  case
    when cs.cohort_day + 30 <= rd.ref_day
      then round(coalesce(r30.retained_d30, 0)::numeric / nullif(cs.cohort_size, 0), 4)
  end as retention_d30_pct,
  rd.ref_day as dia_referencia
from cohort_sizes cs
cross join reference_day rd
left join retention_d1 r1 on r1.cohort_day = cs.cohort_day
left join retention_d7 r7 on r7.cohort_day = cs.cohort_day
left join retention_d30 r30 on r30.cohort_day = cs.cohort_day
order by cs.cohort_day desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Strategic growth health snapshot (reference day)
-- Indicators derived from canonical metrics — strategic layer only (Fase 5)
-- Does NOT reproduce PATCH 4.2 daily series or period comparison rows
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Retention trends · cohort comparison · segment retention (D7)
-- Compares two 7-day cohort windows · segments by authentication within D7
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
    user_id,
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
reference_day as (
  select max(activity_day) as ref_day
  from qualifying_events
),
visitor_auth_within_d7 as (
  select
    vfd.visitor_id,
    vfd.first_active_day,
    exists (
      select 1
      from qualifying_events qe
      where qe.visitor_id = vfd.visitor_id
        and qe.user_id is not null
        and qe.activity_day between vfd.first_active_day and vfd.first_active_day + 7
    ) as autenticou_em_d7
  from visitor_first_day vfd
),
cohort_retention_d7 as (
  select
    vfd.first_active_day as cohort_day,
    count(*) as cohort_size,
    count(*) filter (
      where exists (
        select 1
        from qualifying_events qe
        where qe.visitor_id = vfd.visitor_id
          and qe.activity_day = vfd.first_active_day + 7
      )
    ) as retained_d7,
    count(*) filter (where vaw.autenticou_em_d7) as cohort_autenticou_d7,
    count(*) filter (where not vaw.autenticou_em_d7) as cohort_anonimo_d7,
    count(*) filter (
      where vaw.autenticou_em_d7
        and exists (
          select 1
          from qualifying_events qe
          where qe.visitor_id = vfd.visitor_id
            and qe.activity_day = vfd.first_active_day + 7
        )
    ) as retained_d7_autenticou,
    count(*) filter (
      where not vaw.autenticou_em_d7
        and exists (
          select 1
          from qualifying_events qe
          where qe.visitor_id = vfd.visitor_id
            and qe.activity_day = vfd.first_active_day + 7
        )
    ) as retained_d7_anonimo
  from visitor_first_day vfd
  join visitor_auth_within_d7 vaw on vaw.visitor_id = vfd.visitor_id
  group by vfd.first_active_day
),
window_recent as (
  select
    'janela_recente'::text as janela,
    r.ref_day - 13 as cohort_inicio,
    r.ref_day - 7 as cohort_fim
  from reference_day r
),
window_previous as (
  select
    'janela_anterior'::text as janela,
    r.ref_day - 27 as cohort_inicio,
    r.ref_day - 14 as cohort_fim
  from reference_day r
),
aggregated as (
  select
    w.janela,
    w.cohort_inicio,
    w.cohort_fim,
    sum(cr.cohort_size) as total_cohort_size,
    sum(cr.retained_d7) as total_retained_d7,
    round(
      sum(cr.retained_d7)::numeric / nullif(sum(cr.cohort_size), 0),
      4
    ) as retention_d7_agregada_pct,
    sum(cr.cohort_autenticou_d7) as total_autenticou_d7,
    sum(cr.retained_d7_autenticou) as total_retained_d7_autenticou,
    round(
      sum(cr.retained_d7_autenticou)::numeric / nullif(sum(cr.cohort_autenticou_d7), 0),
      4
    ) as retention_d7_segmento_autenticou_pct,
    sum(cr.cohort_anonimo_d7) as total_anonimo_d7,
    sum(cr.retained_d7_anonimo) as total_retained_d7_anonimo,
    round(
      sum(cr.retained_d7_anonimo)::numeric / nullif(sum(cr.cohort_anonimo_d7), 0),
      4
    ) as retention_d7_segmento_anonimo_pct
  from (
    select * from window_recent
    union all
    select * from window_previous
  ) w
  cross join reference_day r
  join cohort_retention_d7 cr
    on cr.cohort_day between w.cohort_inicio and w.cohort_fim
    and cr.cohort_day + 7 <= r.ref_day
  group by w.janela, w.cohort_inicio, w.cohort_fim
)
select
  a.janela,
  a.cohort_inicio,
  a.cohort_fim,
  a.total_cohort_size,
  a.total_retained_d7,
  a.retention_d7_agregada_pct,
  a.total_autenticou_d7,
  a.retention_d7_segmento_autenticou_pct,
  a.total_anonimo_d7,
  a.retention_d7_segmento_anonimo_pct,
  rd.ref_day as dia_referencia,
  round(
    a.retention_d7_agregada_pct - lag(a.retention_d7_agregada_pct) over (order by a.janela desc),
    4
  ) as delta_retention_d7_janelas_pct
from aggregated a
cross join reference_day rd
order by a.janela desc;
