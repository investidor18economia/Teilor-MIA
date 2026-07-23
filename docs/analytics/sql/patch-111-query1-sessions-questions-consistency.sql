-- PATCH 11.1 — Q1 Consistency: sessions vs questions (30d)
with scoped as (
  select *
  from analytics_events e
  where e.created_at >= now() - interval '30 days'
    and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
)
select
  (select count(distinct session_id) from scoped where event_name = 'session_started' and session_id is not null)::bigint as total_sessions,
  (select count(*) from scoped where event_name = 'mia_question_sent')::bigint as questions;
