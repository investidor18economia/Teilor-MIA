#!/usr/bin/env node
/**
 * PATCH A.10 — Phase A architecture & inventory audit.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function scanDir(rel, ext) {
  return readdirSync(join(ROOT, rel), { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => join(rel, d.name).replace(/\\/g, "/"));
}

console.log("\nPATCH A.10 — Phase A architecture audit\n");

// Layer integrity — mappers must not touch DB/SQL
const mapperFiles = [
  "lib/miaFounderCockpitDisplay.js",
  "lib/miaFounderGrowthDisplay.js",
  "lib/miaFounderProductsDisplay.js",
  "lib/miaFounderPerformanceDisplay.js",
  "lib/miaFounderChartsDisplay.js",
  "lib/miaFounderFiltersDisplay.js",
];

for (const f of mapperFiles) {
  const src = read(f);
  ok(`${f} no supabase`, !/supabase|createClient/.test(src));
  ok(`${f} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
}

// Components must not query DB directly
const componentFiles = scanDir("components/founder-cockpit", ".jsx");
for (const f of componentFiles) {
  const src = read(f);
  ok(`${f} no supabase`, !/supabase|createClient/.test(src));
  ok(`${f} no SQL`, !/SELECT\s|FROM\s+mia_/.test(src));
}

// Page layer
const page = read("pages/cockpit-fundador.jsx");
ok("page SSR fetches executive-metrics", page.includes("/api/executive-metrics"));
ok("page uses founder gate", page.includes("requireFounderGate"));
ok("page no supabase", !/supabase/.test(page));

// API routes exist
for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} exists`, existsSync(join(ROOT, route)));
}

// Version contracts frozen
ok("cockpit display A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("filters catalog A.7.0", read("lib/miaFounderFiltersCatalog.js").includes('"A.7.0"'));
ok("charts display A.8.0", read("lib/miaFounderChartsDisplay.js").includes('"A.8.0"'));
ok("temporal catalog A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));

// RPC migrations present
const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
for (const rpc of [
  "mia_temporal_series_growth",
  "mia_temporal_series_platform_activity",
  "mia_temporal_series_products",
  "mia_temporal_series_categories",
  "mia_temporal_series_conversion",
  "mia_analytics_resolve_window",
]) {
  ok(`RPC ${rpc} in migrations`, migrations.some((m) => read(`supabase/migrations/${m}`).includes(rpc)));
}

// Phase A evidence inventory
const phaseEvidence = [
  "docs/analytics/PATCH_11_3_FOUNDER_DASHBOARD_EVIDENCE.json",
  "docs/analytics/PATCH_A_4_FOUNDER_SESSIONS_USERS_EVIDENCE.json",
  "docs/analytics/PATCH_A_5_FOUNDER_PRODUCTS_CATEGORIES_EVIDENCE.json",
  "docs/analytics/PATCH_A_6_FOUNDER_PERFORMANCE_CONVERSION_EVIDENCE.json",
  "docs/analytics/PATCH_A_7_ADVANCED_FILTERS_EVIDENCE.json",
  "docs/analytics/PATCH_A_8_CHARTS_EVIDENCE.json",
  "docs/analytics/PATCH_A_9_UI_POLISH_EVIDENCE.json",
  "docs/analytics/PATCH_A_9_CLOSURE_EVIDENCE.json",
];

for (const ev of phaseEvidence) {
  ok(`evidence ${ev.split("/").pop()}`, existsSync(join(ROOT, ev)));
}

// Master docs
ok("FOUNDER_EXECUTIVE_DASHBOARD.md", existsSync(join(ROOT, "docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md")));
ok("FOUNDER_COCKPIT_DESIGN_SYSTEM.md", existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md")));
ok("EXECUTIVE_METRICS_API.md", existsSync(join(ROOT, "docs/analytics/EXECUTIVE_METRICS_API.md")));
ok("TEMPORAL_METRICS_API.md", existsSync(join(ROOT, "docs/analytics/TEMPORAL_METRICS_API.md")));

// Orphan cleanup — legacy period filter removed
ok("FounderPeriodFilter removed", !existsSync(join(ROOT, "components/founder-cockpit/FounderPeriodFilter.jsx")));

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_A_10_FINAL_AUDIT_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "A.10",
      title: "PATCH A.10 — Final Audit Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      architecture_layers: ["Interface", "Mapper", "API", "Service", "RPC", "Analytics"],
      checks: { total: checks.length, passed, items: checks },
      patches_audited: ["A.1", "A.2", "A.3", "A.4", "A.5", "A.6", "A.7", "A.8", "A.9"],
      master_report: "docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md",
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
