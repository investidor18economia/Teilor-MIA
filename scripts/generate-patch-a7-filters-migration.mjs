#!/usr/bin/env node
/**
 * Generate PATCH A.7 migration by extending existing RPC signatures.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const EXTRA_PARAMS =
  "p_start_date date default null, p_end_date date default null, p_category text default null, p_product_id text default null";

function extendSignature(m) {
  if (m.includes("p_start_date")) return m;
  return m.replace(/\)$/, `, ${EXTRA_PARAMS})`);
}

const WINDOW_BOUNDS = `  with window_bounds as (
    select
      w.start_ts,
      w.end_ts,
      w.window_mode,
      w.reference_days,
      w.reference_days as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days
    from public.mia_analytics_resolve_window(p_days, p_offset_days, p_start_date, p_end_date) w
  )`;

const DIM_FILTER = `
      and (p_category is null or e.category = p_category)
      and (p_product_id is null or e.product_id = p_product_id)`;

function patchTemporal(content, fnName) {
  let s = content;
  const sigRe = new RegExp(`function public\\.${fnName}\\([^)]*\\)`, "i");
  s = s.replace(sigRe, extendSignature);
  s = s.replace(
    /with window_bounds as \([\s\S]*?\),\s*production_events as \(/m,
    `${WINDOW_BOUNDS},\n  production_events as (`
  );
  s = s.replace(/(and public\.mia_analytics_production_scope\([^)]+\))/g, `$1${DIM_FILTER}`);
  return s;
}

function patchExecutive(content, fnName) {
  let s = content;
  const sigRe = new RegExp(`function public\\.${fnName}\\([^)]*\\)`, "i");
  s = s.replace(sigRe, extendSignature);
  s = s.replace(
    /where e\.created_at >= now\(\) - make_interval\(days => greatest\(p_days, 1\) \+ greatest\(coalesce\(p_offset_days, 0\), 0\)\)\)\s*\n\s*and e\.created_at < now\(\) - make_interval\(days => greatest\(coalesce\(p_offset_days, 0\), 0\)\)\)/g,
    `cross join public.mia_analytics_resolve_window(p_days, p_offset_days, p_start_date, p_end_date) wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts`
  );
  s = s.replace(/(and public\.mia_analytics_production_scope\([^)]+\))/g, `$1${DIM_FILTER}`);
  return s;
}

function extractFunctionBlock(content, fnName) {
  const marker = `create or replace function public.${fnName}`;
  const fnStart = content.indexOf(marker);
  if (fnStart < 0) throw new Error(`Missing function ${fnName}`);
  const fnEnd = content.indexOf("\n$$;", fnStart);
  return content.slice(fnStart, fnEnd + 5);
}

let out = `-- PATCH A.7 — Advanced Filters (window + category + product_id)
-- Generated from canonical RPC migrations

begin;

create or replace function public.mia_analytics_resolve_window(
  p_days integer default 30,
  p_offset_days integer default 0,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  start_ts timestamptz,
  end_ts timestamptz,
  window_mode text,
  reference_days integer
)
language sql
stable
as $$
  select
    case
      when p_start_date is not null and p_end_date is not null then
        (p_start_date::timestamp at time zone 'UTC')
      else
        now() - make_interval(days => greatest(coalesce(p_days, 30), 1) + greatest(coalesce(p_offset_days, 0), 0))
    end,
    case
      when p_start_date is not null and p_end_date is not null then
        ((p_end_date + 1)::timestamp at time zone 'UTC')
      else
        now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
    end,
    case when p_start_date is not null and p_end_date is not null then 'custom_range' else 'rolling_window' end,
    case
      when p_start_date is not null and p_end_date is not null then greatest(1, (p_end_date - p_start_date + 1))::integer
      else greatest(coalesce(p_days, 30), 1)
    end;
$$;

`;

const temporalFiles = [
  ["20260728160000_mia_temporal_series_api_v1.sql", ["mia_temporal_series_growth", "mia_temporal_series_platform_activity"]],
  ["20260728210000_mia_temporal_series_products_categories_v1.sql", ["mia_temporal_series_products", "mia_temporal_series_categories"]],
  ["20260728220000_mia_temporal_series_conversion_v1.sql", ["mia_temporal_series_conversion"]],
];

for (const [file, fns] of temporalFiles) {
  const content = readFileSync(join(ROOT, "supabase/migrations", file), "utf8");
  for (const fn of fns) {
    out += `\n${patchTemporal(extractFunctionBlock(content, fn), fn)};\n`;
  }
}

const execFiles = [
  "20260723230000_mia_executive_metrics_period_offset_v11_4.sql",
  "20260723240000_mia_executive_metrics_period_offset_complement_v11_4.sql",
];

for (const file of execFiles) {
  const content = readFileSync(join(ROOT, "supabase/migrations", file), "utf8");
  const fnMatches = [...content.matchAll(/create or replace function public\.(mia_executive_metrics_\w+)/g)];
  for (const m of fnMatches) {
    const fn = m[1];
    out += `\n${patchExecutive(extractFunctionBlock(content, fn), fn)};\n`;
  }
}

out += "\ncommit;\n";

const outPath = join(ROOT, "supabase/migrations/20260728230000_mia_founder_advanced_filters_v1.sql");
writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${out.length} bytes)`);
