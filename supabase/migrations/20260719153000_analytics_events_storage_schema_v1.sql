-- PATCH 1.4 — Analytics Storage Schema v1 (base table + indexes)
-- Documentation: docs/analytics/ANALYTICS_SCHEMA.md
-- Safe: CREATE IF NOT EXISTS only — no DROP/TRUNCATE/DELETE

begin;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_id text null,
  user_id uuid null,
  category text null,
  product_name text null,
  product_brand text null,
  product_id text null,
  query_text text null,
  recommendation_name text null,
  offer_store text null,
  offer_price numeric null,
  offer_url text null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Drift guard: table must exist with core columns before additive patches
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'analytics_events'
      and column_name = 'event_name'
  ) then
    raise exception 'analytics_events schema drift: event_name column missing';
  end if;
end $$;

create index if not exists idx_analytics_events_event_name_created_at
  on public.analytics_events (event_name, created_at desc);

create index if not exists idx_analytics_events_created_at
  on public.analytics_events (created_at desc);

create index if not exists idx_analytics_events_session_id
  on public.analytics_events (session_id)
  where session_id is not null;

create index if not exists idx_analytics_events_category
  on public.analytics_events (category)
  where category is not null;

commit;
