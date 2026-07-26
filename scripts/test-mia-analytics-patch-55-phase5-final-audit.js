#!/usr/bin/env node
/**
 * PATCH 5.5 — Phase 5 final audit (read-only consolidation).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const FINAL_AUDIT = join(ANALYTICS_DIR, "PATCH_5.5_PHASE_5_FINAL_AUDIT.md");
const CHANGELOG = join(ANALYTICS_DIR, "ANALYTICS_CHANGELOG.md");
const DASHBOARDS = join(ANALYTICS_DIR, "DASHBOARDS.md");
const ROADMAP = join(ANALYTICS_DIR, "02_analytics_roadmap.md");

const STRATEGIC_SQL = [
  "analytics-growth-strategic.sql",
  "analytics-conversation-strategic.sql",
  "analytics-conversion-strategic.sql",
  "analytics-buying-intent-strategic.sql",
];

const STRATEGIC_DOCS = [
  "GROWTH_STRATEGIC_ANALYTICS.md",
  "CONVERSATION_STRATEGIC_ANALYTICS.md",
  "CONVERSION_STRATEGIC_ANALYTICS.md",
  "BUYING_INTENT_STRATEGIC_ANALYTICS.md",
];

const PATCH_AUDITS = [
  "PATCH_5.1_GROWTH_STRATEGIC_AUDIT.md",
  "PATCH_5.2_CONVERSATION_STRATEGIC_AUDIT.md",
  "PATCH_5.3_CONVERSION_STRATEGIC_AUDIT.md",
  "PATCH_5.4_BUYING_INTENT_STRATEGIC_AUDIT.md",
];

const SPLIT_FILES = [
  "patch-51-query1-visitor-cohort-retention.sql",
  "patch-51-query2-user-cohort-retention.sql",
  "patch-51-query3-strategic-health-snapshot.sql",
  "patch-51-query4-retention-trends-comparison.sql",
  "patch-52-query1-depth-snapshot.sql",
  "patch-52-query2-depth-distribution.sql",
  "patch-52-query3-recurrence-segments.sql",
  "patch-52-query4-daily-engagement-trends.sql",
  "patch-53-query1-dropoff-bottleneck.sql",
  "patch-53-query2-cohort-funnel.sql",
  "patch-53-query3-segment-modifiers.sql",
  "patch-53-query4-funnel-trend-comparison.sql",
  "patch-54-query1-signal-ranking.sql",
  "patch-54-query2-behavioral-antecedents.sql",
  "patch-54-query3-intent-strength.sql",
  "patch-54-query4-intent-trends-cohort.sql",
];

const NPM_SCRIPTS = [
  "test:mia:analytics:patch-51:growth-strategic",
  "test:mia:analytics:patch-51:prod-validation",
  "test:mia:analytics:patch-52:conversation-strategic",
  "test:mia:analytics:patch-52:prod-validation",
  "test:mia:analytics:patch-53:conversion-strategic",
  "test:mia:analytics:patch-53:prod-validation",
  "test:mia:analytics:patch-54:buying-intent-strategic",
  "test:mia:analytics:patch-54:prod-validation",
  "test:mia:analytics:patch-55:phase5-final-audit",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

console.log("\nPATCH 5.5 — Phase 5 final audit\n");

const audit = read(FINAL_AUDIT);
const changelog = read(CHANGELOG);
const dashboards = read(DASHBOARDS);
const roadmap = read(ROADMAP);
const pkg = read(join(ROOT, "package.json"));

console.log("Final audit document");
assert("PATCH_5.5_PHASE_5_FINAL_AUDIT.md exists", existsSync(FINAL_AUDIT));
assert("Final audit — resumo executivo", /##\s*1\.\s*Resumo executivo/i.test(audit));
assert("Final audit — matriz Fase 4 × Fase 5", /Fase 4.*Fase 5|4\.2.*5\.1/i.test(audit));
assert("Final audit — auditoria arquitetural", /arquitetural/i.test(audit));
assert("Final audit — testes e regressões", /testes|regress/i.test(audit));
assert("Final audit — limitações consolidadas", /limita/i.test(audit));
assert("Final audit — veredito", /veredito/i.test(audit));
assert("Final audit — PATCH 5.0 referenced", /5\.0/i.test(audit));
assert("Final audit — PATCH 5.1–5.4 approved", /5\.1.*5\.4|5\.4/i.test(audit));
assert("Final audit — no deploy required", /deploy|read-only|sem alteração/i.test(audit));

console.log("\nStrategic deliverables (5.1–5.4)");
for (const file of STRATEGIC_SQL) {
  const content = read(join(ANALYTICS_DIR, file));
  assert(`${file} exists`, true);
  assert(`${file} — from analytics_events`, /from\s+analytics_events/i.test(content));
  assert(`${file} — production filter`, /price_alert_email_test/.test(content));
  assert(`${file} — no create table`, !/create\s+table/i.test(content));
  assert(`${file} — no materialized view`, !/materialized\s+view/i.test(content));
}
for (const file of STRATEGIC_DOCS) {
  const content = read(join(ANALYTICS_DIR, file));
  assert(`${file} exists`, true);
  assert(`${file} — delta Fase 4 section`, /NÃO será reimplementado|não será reimplementado/i.test(content));
}
for (const file of PATCH_AUDITS) {
  assert(`${file} exists`, existsSync(join(ANALYTICS_DIR, file)));
}

console.log("\nSplit SQL (16 queries)");
for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  assert(`${file} exists`, existsSync(path));
  const content = read(path);
  assert(`${file} — production filter`, /price_alert_email_test/.test(content));
}

console.log("\nDocumentation sync");
assert("DASHBOARDS.md — Fase 5 estratégica", /Fase 5|Estratégica/i.test(dashboards));
assert("DASHBOARDS.md — growth strategic", /analytics-growth-strategic/.test(dashboards));
assert("DASHBOARDS.md — conversation strategic", /analytics-conversation-strategic/.test(dashboards));
assert("DASHBOARDS.md — conversion strategic", /analytics-conversion-strategic/.test(dashboards));
assert("DASHBOARDS.md — buying intent strategic", /analytics-buying-intent-strategic/.test(dashboards));
assert("CHANGELOG — PATCH 5.5 section", /PATCH 5\.5/i.test(changelog));
assert("CHANGELOG — PATCH 5.1 section", /PATCH 5\.1/i.test(changelog));
assert("ROADMAP — FASE 5 Analytics Estratégico", /FASE 5[\s\S]*Estratégico/i.test(roadmap));
assert("ROADMAP — PATCH 5.5", /PATCH 5\.5/i.test(roadmap));

console.log("\npackage.json scripts");
for (const script of NPM_SCRIPTS) {
  assert(`npm script ${script}`, pkg.includes(`"${script}"`));
}

console.log(`\nResultado: ${passed}/${passed + failed}\n`);
if (failed > 0) process.exit(1);
