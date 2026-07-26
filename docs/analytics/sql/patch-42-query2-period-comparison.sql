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
