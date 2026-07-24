# Supabase Migrations — Teilor / MIA

Official SQL migrations for PostgreSQL (Supabase).

## Apply order

1. `20260719153000_analytics_events_storage_schema_v1.sql`
2. `20260719153001_analytics_events_storage_security_v1.sql`
3. `20260721153002_analytics_events_visitor_id.sql`
4. `20260721153003_analytics_events_conversation_id.sql`
5. Subsequent migrations in timestamp order

## Documentation

- [docs/analytics/ANALYTICS_SCHEMA.md](../docs/analytics/ANALYTICS_SCHEMA.md)
- [docs/infrastructure/SUPABASE_MIGRATIONS.md](../docs/infrastructure/SUPABASE_MIGRATIONS.md)

## Preflight

Run `docs/analytics/analytics-events-schema-preflight.sql` before applying analytics migrations on existing environments.
