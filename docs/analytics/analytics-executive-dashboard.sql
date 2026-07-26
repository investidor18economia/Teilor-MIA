-- PATCH 4.1 — Executive Dashboard (MIA public events · production scope)
-- Canonical metrics: docs/analytics/EXECUTIVE_METRICS.md
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Executive snapshot (reference day = latest UTC day with visitor activity)
-- Query 2 — Daily evolution (all days, ordered desc)

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Executive snapshot
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

  -- DAU / WAU / MAU — Visitors
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

  -- DAU / WAU / MAU — Users
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

  -- New / returning / anonymous visitors (reference day)
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

  -- Authenticated users (login marco) + auth rate
  (select count(*) from auth_users_ref) as authenticated_users,
  round(
    (select count(*)::numeric from auth_users_ref)
    / nullif((select count(*) from active_visitors_ref), 0),
    4
  ) as taxa_autenticacao,

  -- Sessions & conversations (reference day)
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
  ) as conversas_unicas,

  -- Event volume (reference day)
  (
    select count(*)
    from qualifying_events qe
    cross join ref
    where qe.activity_day = ref.ref_day
      and qe.event_name = 'session_started'
  ) as eventos_session_started,
  (
    select count(*)
    from qualifying_events qe
    cross join ref
    where qe.activity_day = ref.ref_day
      and qe.event_name = 'mia_question_sent'
  ) as eventos_perguntas,
  (
    select count(*)
    from qualifying_events qe
    cross join ref
    where qe.activity_day = ref.ref_day
      and qe.event_name = 'mia_recommendation_shown'
  ) as eventos_recomendacoes,
  (
    select count(*)
    from qualifying_events qe
    cross join ref
    where qe.activity_day = ref.ref_day
      and qe.event_name = 'offer_click'
  ) as eventos_cliques_oferta,
  (
    select count(*)
    from qualifying_events qe
    cross join ref
    where qe.activity_day = ref.ref_day
      and qe.event_name = 'favorite_created'
  ) as eventos_favoritos,
  (
    select count(*)
    from qualifying_events qe
    cross join ref
    where qe.activity_day = ref.ref_day
      and qe.event_name = 'price_alert_created'
  ) as eventos_alertas_preco,

  -- Lifetime totals (production scope · all qualifying history)
  (
    select count(distinct visitor_id)
    from qualifying_events
    where visitor_id is not null
  ) as total_visitantes_historico,
  (
    select count(distinct user_id)
    from qualifying_events
    where user_id is not null
  ) as total_usuarios_historico

from ref;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Daily evolution (executive metrics per UTC day)
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
),
daily_ops as (
  select
    activity_day,
    count(distinct session_id) filter (where session_id is not null) as sessoes_unicas,
    count(distinct conversation_id) filter (where conversation_id is not null) as conversas_unicas,
    count(*) filter (where event_name = 'mia_question_sent') as eventos_perguntas,
    count(*) filter (where event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
    count(*) filter (where event_name = 'offer_click') as eventos_cliques_oferta
  from qualifying_events
  group by activity_day
)
select
  dv.activity_day as dia,
  dv.dau_visitors,
  coalesce(du.dau_users, 0) as dau_users,
  dv.new_visitors,
  dv.dau_visitors - dv.new_visitors as returning_visitors,
  dv.anonymous_visitors,
  coalesce(du.authenticated_users, 0) as authenticated_users,
  round(
    coalesce(du.authenticated_users, 0)::numeric / nullif(dv.dau_visitors, 0),
    4
  ) as taxa_autenticacao,
  dop.sessoes_unicas,
  dop.conversas_unicas,
  dop.eventos_perguntas,
  dop.eventos_recomendacoes,
  dop.eventos_cliques_oferta
from daily_visitors dv
left join daily_users du on du.activity_day = dv.activity_day
left join daily_ops dop on dop.activity_day = dv.activity_day
order by dv.activity_day desc;
