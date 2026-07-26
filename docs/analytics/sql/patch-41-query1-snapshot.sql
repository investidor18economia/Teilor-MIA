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
ref as (
  select ref_day from reference_day
),
active_visitors_ref as (
  select distinct qe.visitor_id
  from qualifying_events qe
  cross join ref
  where qe.visitor_id is not null
    and qe.activity_day = ref.ref_day
),
active_users_ref as (
  select distinct qe.user_id
  from qualifying_events qe
  cross join ref
  where qe.user_id is not null
    and qe.activity_day = ref.ref_day
),
auth_users_ref as (
  select distinct qe.user_id
  from qualifying_events qe
  cross join ref
  where qe.event_name = 'user_authenticated'
    and qe.user_id is not null
    and qe.activity_day = ref.ref_day
)
select
  ref.ref_day as dia_referencia,
  (select count(*) from active_visitors_ref) as dau_visitors,
  (
    select count(distinct qe.visitor_id)
    from qualifying_events qe
    cross join ref
    where qe.visitor_id is not null
      and qe.activity_day between ref.ref_day - 6 and ref.ref_day
  ) as wau_visitors,
  (
    select count(distinct qe.visitor_id)
    from qualifying_events qe
    cross join ref
    where qe.visitor_id is not null
      and qe.activity_day between ref.ref_day - 29 and ref.ref_day
  ) as mau_visitors,
  (select count(*) from active_users_ref) as dau_users,
  (
    select count(distinct qe.user_id)
    from qualifying_events qe
    cross join ref
    where qe.user_id is not null
      and qe.activity_day between ref.ref_day - 6 and ref.ref_day
  ) as wau_users,
  (
    select count(distinct qe.user_id)
    from qualifying_events qe
    cross join ref
    where qe.user_id is not null
      and qe.activity_day between ref.ref_day - 29 and ref.ref_day
  ) as mau_users,
  (
    select count(*)
    from active_visitors_ref av
    join visitor_first_day vfd on vfd.visitor_id = av.visitor_id
    cross join ref
    where vfd.first_active_day = ref.ref_day
  ) as new_visitors,
  (
    select count(*)
    from active_visitors_ref av
    join visitor_first_day vfd on vfd.visitor_id = av.visitor_id
    cross join ref
    where vfd.first_active_day < ref.ref_day
  ) as returning_visitors,
  (
    select count(*)
    from active_visitors_ref av
    where av.visitor_id not in (select visitor_id from authenticated_visitors)
  ) as anonymous_visitors,
  (select count(*) from auth_users_ref) as authenticated_users,
  round(
    (select count(*)::numeric from auth_users_ref)
    / nullif((select count(*) from active_visitors_ref), 0),
    4
  ) as taxa_autenticacao,
  (
    select count(distinct qe.session_id)
    from qualifying_events qe
    cross join ref
    where qe.session_id is not null
      and qe.activity_day = ref.ref_day
  ) as sessoes_unicas,
  (
    select count(distinct qe.conversation_id)
    from qualifying_events qe
    cross join ref
    where qe.conversation_id is not null
      and qe.activity_day = ref.ref_day
  ) as conversas_unicas
from ref;
