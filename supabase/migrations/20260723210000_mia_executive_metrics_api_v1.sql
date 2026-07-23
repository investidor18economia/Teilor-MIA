-- PATCH 11.1 — Executive Metrics API (read-only RPC functions)
-- Aggregates only — no PII, no individual events exposed via API layer.

begin;

create or replace function public.mia_analytics_production_scope(
  p_category text,
  p_event_name text,
  p_metadata jsonb
)
returns boolean
language sql
immutable
as $$
  select not (
    coalesce(p_category, '') in ('price_alert_email_test', 'price_alert_e2e_test')
    or coalesce(p_event_name, '') like 'price_drop_email_test_%'
    or coalesce(p_event_name, '') like 'price_drop_email_e2e_%'
    or (
      coalesce(p_event_name, '') = 'session_started'
      and coalesce(p_metadata->>'user_agent', '') = 'test-agent'
    )
    or coalesce(p_category, '') like '%_test'
  );
$$;

create or replace function public.mia_executive_metrics_platform(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'denominator', 'days',
    'window_days', p_days,
    'total_sessions', coalesce((
      select count(distinct session_id)::bigint
      from scoped
      where session_id is not null and event_name = 'session_started'
    ), 0),
    'unique_visitors', coalesce((
      select count(distinct visitor_id)::bigint
      from scoped
      where visitor_id is not null
    ), 0),
    'conversations', coalesce((
      select count(distinct conversation_id)::bigint
      from scoped
      where conversation_id is not null
    ), 0),
    'questions', coalesce((
      select count(*)::bigint
      from scoped
      where event_name = 'mia_question_sent'
    ), 0)
  );
$$;

create or replace function public.mia_executive_metrics_conversation(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'denominator', 'days',
    'window_days', p_days,
    'questions_sent', coalesce((select count(*)::bigint from scoped where event_name = 'mia_question_sent'), 0),
    'recommendations_shown', coalesce((select count(*)::bigint from scoped where event_name = 'mia_recommendation_shown'), 0),
    'conversations_with_questions', coalesce((
      select count(distinct conversation_id)::bigint
      from scoped
      where conversation_id is not null and event_name = 'mia_question_sent'
    ), 0)
  );
$$;

create or replace function public.mia_executive_metrics_recommendation(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  decisions as (
    select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_decision'
  ),
  acceptance as (
    select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_acceptance_signal'
  ),
  rejection as (
    select count(*)::bigint as c from scoped where event_name = 'mia_recommendation_rejection_signal'
  ),
  runner_up as (
    select count(*)::bigint as c
    from scoped
    where event_name = 'mia_recommendation_decision'
      and coalesce(metadata->>'runner_up_product_family', metadata->>'has_runner_up', '') <> ''
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'denominator', 'signal_events',
    'window_days', p_days,
    'recommendations_generated', (select c from decisions),
    'acceptance_signals', (select c from acceptance),
    'rejection_signals', (select c from rejection),
    'recommendation_acceptance_rate', case
      when (select c from acceptance) + (select c from rejection) = 0 then null
      else round((select c from acceptance)::numeric / ((select c from acceptance) + (select c from rejection)), 4)
    end,
    'rejection_rate', case
      when (select c from acceptance) + (select c from rejection) = 0 then null
      else round((select c from rejection)::numeric / ((select c from acceptance) + (select c from rejection)), 4)
    end,
    'runner_up_usage', (select c from runner_up)
  );
$$;

create or replace function public.mia_executive_metrics_commerce(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'denominator', 'days',
    'window_days', p_days,
    'offer_sets_generated', coalesce((select count(*)::bigint from scoped where event_name = 'mia_offer_set'), 0),
    'offers_returned', coalesce((
      select sum(greatest(coalesce(nullif(metadata->>'offer_count', '')::int, 0), 0))::bigint
      from scoped
      where event_name = 'mia_offer_set'
    ), 0),
    'providers_used', coalesce((
      select count(distinct metadata->>'winner_provider_id')::bigint
      from scoped
      where event_name = 'mia_offer_set'
        and coalesce(metadata->>'winner_provider_id', '') <> ''
    ), 0),
    'favorite_count', coalesce((select count(*)::bigint from scoped where event_name = 'favorite_created'), 0),
    'offer_clicks', coalesce((select count(*)::bigint from scoped where event_name = 'offer_click'), 0)
  );
$$;

create or replace function public.mia_executive_metrics_alerts(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'denominator', 'days',
    'window_days', p_days,
    'alerts_created', coalesce((
      select count(*)::bigint
      from scoped
      where event_name = 'price_alert_created'
         or (event_name = 'mia_price_alert_lifecycle' and metadata->>'lifecycle_stage' = 'CREATED')
    ), 0),
    'alerts_active', coalesce((
      select count(distinct metadata->>'alert_id')::bigint
      from scoped
      where event_name = 'mia_price_alert_lifecycle'
        and metadata->>'lifecycle_stage' = 'ACTIVE'
        and coalesce(metadata->>'alert_id', '') <> ''
    ), 0),
    'target_reached', coalesce((
      select count(distinct metadata->>'alert_id')::bigint
      from scoped
      where event_name = 'mia_price_alert_lifecycle'
        and metadata->>'lifecycle_stage' = 'TARGET_REACHED'
        and coalesce(metadata->>'alert_id', '') <> ''
    ), 0),
    'notifications_sent', coalesce((
      select count(*)::bigint
      from scoped
      where event_name = 'mia_price_alert_lifecycle'
        and metadata->>'lifecycle_stage' = 'NOTIFICATION_SENT'
    ), 0)
  );
$$;

create or replace function public.mia_executive_metrics_price_intelligence(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and e.event_name = 'mia_price_intelligence'
      and coalesce(e.metadata->>'event_version', '') = '10.1.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  quality_map as (
    select
      case coalesce(metadata->>'price_quality', 'UNKNOWN')
        when 'HIGH' then 4
        when 'MEDIUM' then 3
        when 'LOW' then 2
        when 'INVALID' then 1
        else 0
      end as q_score,
      coalesce(metadata->>'price_confidence', 'UNKNOWN') as confidence
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'price_intelligence_events',
    'window_days', p_days,
    'events', (select count(*)::bigint from scoped),
    'average_price_quality_score', (select round(avg(q_score)::numeric, 2) from quality_map),
    'confidence_distribution', coalesce((
      select jsonb_object_agg(confidence, cnt)
      from (
        select confidence, count(*)::bigint as cnt
        from quality_map
        group by confidence
      ) t
    ), '{}'::jsonb)
  );
$$;

create or replace function public.mia_executive_metrics_savings(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and e.event_name = 'mia_savings_estimation'
      and coalesce(e.metadata->>'event_version', '') = '10.2.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  amounts as (
    select nullif(metadata->>'potential_savings_amount', '')::numeric as amt
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'savings_estimation_events',
    'window_days', p_days,
    'potential_savings_total', coalesce((select round(sum(amt), 2) from amounts where amt is not null and amt > 0), 0),
    'average_potential_savings', coalesce((select round(avg(amt), 2) from amounts where amt is not null and amt > 0), null),
    'opportunities_found', coalesce((select count(*)::bigint from amounts where amt is not null and amt > 0), 0)
  );
$$;

create or replace function public.mia_executive_metrics_anti_regret(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and e.event_name = 'mia_anti_regret_foundation'
      and coalesce(e.metadata->>'event_version', '') = '10.4.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  scores as (
    select
      nullif(metadata->>'anti_regret_score', '')::numeric as score,
      coalesce(metadata->>'anti_regret_confidence', 'UNKNOWN') as confidence
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'anti_regret_events',
    'window_days', p_days,
    'events', (select count(*)::bigint from scoped),
    'average_score', (select round(avg(score)::numeric, 2) from scores where score is not null),
    'confidence_distribution', coalesce((
      select jsonb_object_agg(confidence, cnt)
      from (
        select confidence, count(*)::bigint as cnt
        from scores
        group by confidence
      ) t
    ), '{}'::jsonb)
  );
$$;

create or replace function public.mia_executive_metrics_user_value(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and e.event_name = 'mia_user_value_outcome'
      and coalesce(e.metadata->>'event_version', '') = '10.5.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  scores as (
    select
      nullif(metadata->>'user_value_score', '')::numeric as score,
      coalesce(metadata->>'value_status', 'UNKNOWN') as value_status
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'user_value_outcome_events',
    'window_days', p_days,
    'events', (select count(*)::bigint from scoped),
    'average_user_value', (select round(avg(score)::numeric, 2) from scores where score is not null),
    'value_status_distribution', coalesce((
      select jsonb_object_agg(value_status, cnt)
      from (
        select value_status, count(*)::bigint as cnt
        from scores
        group by value_status
      ) t
    ), '{}'::jsonb),
    'verified_value_amount_count', coalesce((
      select count(*)::bigint
      from scoped
      where nullif(metadata->>'verified_value_amount', '') is not null
    ), 0)
  );
$$;

revoke all on function public.mia_analytics_production_scope(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.mia_analytics_production_scope(text, text, jsonb) to service_role;

revoke all on function public.mia_executive_metrics_platform(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_conversation(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_recommendation(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_commerce(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_alerts(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_price_intelligence(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_savings(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_anti_regret(integer) from public, anon, authenticated;
revoke all on function public.mia_executive_metrics_user_value(integer) from public, anon, authenticated;

grant execute on function public.mia_executive_metrics_platform(integer) to service_role;
grant execute on function public.mia_executive_metrics_conversation(integer) to service_role;
grant execute on function public.mia_executive_metrics_recommendation(integer) to service_role;
grant execute on function public.mia_executive_metrics_commerce(integer) to service_role;
grant execute on function public.mia_executive_metrics_alerts(integer) to service_role;
grant execute on function public.mia_executive_metrics_price_intelligence(integer) to service_role;
grant execute on function public.mia_executive_metrics_savings(integer) to service_role;
grant execute on function public.mia_executive_metrics_anti_regret(integer) to service_role;
grant execute on function public.mia_executive_metrics_user_value(integer) to service_role;

commit;
