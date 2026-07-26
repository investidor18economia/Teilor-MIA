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
