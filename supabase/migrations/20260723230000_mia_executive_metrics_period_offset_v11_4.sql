-- PATCH 11.4 — Executive metrics period offset (backward compatible: p_offset_days default 0)
-- Enables previous-window comparison: offset=N*days for Nth prior window of equal length.

begin;

-- Platform
create or replace function public.mia_executive_metrics_platform(p_days integer default 30, p_offset_days integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'denominator', 'days',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'total_sessions', coalesce((select count(distinct session_id)::bigint from scoped where session_id is not null and event_name = 'session_started'), 0),
    'unique_visitors', coalesce((select count(distinct visitor_id)::bigint from scoped where visitor_id is not null), 0),
    'conversations', coalesce((select count(distinct conversation_id)::bigint from scoped where conversation_id is not null), 0),
    'questions', coalesce((select count(*)::bigint from scoped where event_name = 'mia_question_sent'), 0)
  );
$$;

-- Conversation
create or replace function public.mia_executive_metrics_conversation(p_days integer default 30, p_offset_days integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object(
    'grain', 'event', 'denominator', 'conversation_events', 'window_days', p_days, 'offset_days', coalesce(p_offset_days, 0),
    'questions_sent', coalesce((select count(*)::bigint from scoped where event_name = 'mia_question_sent'), 0),
    'recommendations_shown', coalesce((select count(*)::bigint from scoped where event_name = 'mia_recommendation_shown'), 0),
    'conversations_with_questions', coalesce((select count(distinct conversation_id)::bigint from scoped where conversation_id is not null and event_name = 'mia_question_sent'), 0)
  );
$$;

-- Recommendation
create or replace function public.mia_executive_metrics_recommendation(p_days integer default 30, p_offset_days integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  decisions as (select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_decision'),
  acceptance as (select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_acceptance_signal'),
  rejection as (select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_rejection_signal'),
  runner_up as (
    select count(*)::bigint as c from scoped
    where event_name = 'mia_recommendation_decision'
      and coalesce(metadata->>'runner_up_product_family', metadata->>'has_runner_up', '') <> ''
  )
  select jsonb_build_object(
    'grain', 'rolling_window', 'denominator', 'signal_events', 'window_days', p_days, 'offset_days', coalesce(p_offset_days, 0),
    'recommendations_generated', (select c from decisions),
    'acceptance_signals', (select c from acceptance),
    'rejection_signals', (select c from rejection),
    'recommendation_acceptance_rate', case when (select c from acceptance) + (select c from rejection) = 0 then null
      else round((select c from acceptance)::numeric / ((select c from acceptance) + (select c from rejection)), 4) end,
    'rejection_rate', case when (select c from acceptance) + (select c from rejection) = 0 then null
      else round((select c from rejection)::numeric / ((select c from acceptance) + (select c from rejection)), 4) end,
    'runner_up_usage', (select c from runner_up)
  );
$$;

-- Commerce, alerts, price_intelligence, savings, anti_regret, user_value: same window filter
create or replace function public.mia_executive_metrics_commerce(p_days integer default 30, p_offset_days integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped as (
    select * from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object('grain','rolling_window','denominator','days','window_days',p_days,'offset_days',coalesce(p_offset_days,0),
    'offer_sets_generated', coalesce((select count(*)::bigint from scoped where event_name = 'mia_offer_set'), 0),
    'offers_returned', coalesce((select sum(greatest(coalesce(nullif(metadata->>'offer_count','')::int,0),0))::bigint from scoped where event_name = 'mia_offer_set'), 0),
    'providers_used', coalesce((select count(distinct metadata->>'winner_provider_id')::bigint from scoped where event_name = 'mia_offer_set' and coalesce(metadata->>'winner_provider_id','') <> ''), 0),
    'favorite_count', coalesce((select count(*)::bigint from scoped where event_name = 'favorite_created'), 0),
    'offer_clicks', coalesce((select count(*)::bigint from scoped where event_name = 'offer_click'), 0));
$$;

create or replace function public.mia_executive_metrics_alerts(p_days integer default 30, p_offset_days integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped as (
    select * from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object('grain','rolling_window','denominator','days','window_days',p_days,'offset_days',coalesce(p_offset_days,0),
    'alerts_created', coalesce((select count(*)::bigint from scoped where event_name = 'price_alert_created' or (event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'CREATED')), 0),
    'alerts_active', coalesce((select count(distinct metadata->>'alert_id')::bigint from scoped where event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'ACTIVE' and coalesce(metadata->>'alert_id','') <> ''), 0),
    'target_reached', coalesce((select count(distinct metadata->>'alert_id')::bigint from scoped where event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'TARGET_REACHED' and coalesce(metadata->>'alert_id','') <> ''), 0),
    'notifications_sent', coalesce((select count(*)::bigint from scoped where event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'NOTIFICATION_SENT'), 0));
$$;

grant execute on function public.mia_executive_metrics_platform(integer, integer) to service_role;
grant execute on function public.mia_executive_metrics_conversation(integer, integer) to service_role;
grant execute on function public.mia_executive_metrics_recommendation(integer, integer) to service_role;
grant execute on function public.mia_executive_metrics_commerce(integer, integer) to service_role;
grant execute on function public.mia_executive_metrics_alerts(integer, integer) to service_role;

commit;
