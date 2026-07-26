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
daily_visitors as (
  select
    qe.activity_day,
    count(distinct qe.visitor_id) as dau_visitors,
    count(distinct qe.visitor_id) filter (
      where vfd.first_active_day = qe.activity_day
    ) as new_visitors,
    count(distinct qe.visitor_id) filter (
      where qe.visitor_id not in (select visitor_id from authenticated_visitors)
    ) as anonymous_visitors
  from qualifying_events qe
  join visitor_first_day vfd on vfd.visitor_id = qe.visitor_id
  where qe.visitor_id is not null
  group by qe.activity_day
),
daily_users as (
  select
    activity_day,
    count(distinct user_id) as dau_users,
    count(distinct user_id) filter (where event_name = 'user_authenticated') as authenticated_users
  from qualifying_events
  where user_id is not null
  group by activity_day
)
select
  dv.activity_day as dia,
  dv.dau_visitors,
  coalesce(du.dau_users, 0) as dau_users,
  dv.new_visitors,
  dv.dau_visitors - dv.new_visitors as returning_visitors,
  dv.anonymous_visitors,
  coalesce(du.authenticated_users, 0) as authenticated_users
from daily_visitors dv
left join daily_users du on du.activity_day = dv.activity_day
order by dv.activity_day desc;
