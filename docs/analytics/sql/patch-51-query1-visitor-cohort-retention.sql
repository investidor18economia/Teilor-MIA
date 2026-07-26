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
