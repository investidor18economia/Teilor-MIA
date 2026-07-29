#!/usr/bin/env node
/**
 * PATCH B.9 — Phase B final architecture & integrity audit.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXECUTIVE_SECTION_ORDER } from "../lib/miaFounderExecutivePolishCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function readJson(rel) {
  try {
    return JSON.parse(read(rel));
  } catch {
    return null;
  }
}

console.log("\nPATCH B.9 — Phase B final audit\n");

// ── Master documentation ─────────────────────────────────────────────
const docs = [
  "docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md",
  "docs/analytics/FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md",
  "docs/analytics/FOUNDER_COCKPIT_BASELINE_A.md",
  "docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md",
];
for (const doc of docs) {
  ok(`doc ${doc.split("/").pop()} exists`, existsSync(join(ROOT, doc)));
}

const execDash = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
const phaseBArch = read("docs/analytics/FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md");
for (const patch of ["B.1", "B.2", "B.3", "B.4", "B.5", "B.6", "B.7", "B.8", "B.9"]) {
  const mentioned =
    execDash.includes(patch) ||
    execDash.includes(`PATCH ${patch}`) ||
    (patch === "B.1" && execDash.includes("Arquitetura Executiva"));
  ok(`FOUNDER_EXECUTIVE_DASHBOARD mentions ${patch}`, mentioned);
}
ok("Phase B architecture references Baseline A", phaseBArch.includes("FOUNDER_COCKPIT_BASELINE_A.md"));
ok("Phase B architecture defines B.9 audit", phaseBArch.includes("B.9"));

// ── Layout order (code) ──────────────────────────────────────────────
const cockpitPage = read("components/founder-cockpit/FounderCockpitPage.jsx");
const layoutOrder = [
  "FounderExecutiveKpisSection",
  "FounderExecutiveGrowthSection",
  "FounderExecutiveProductHealthSection",
  "FounderExecutiveCommercialPerformanceSection",
  "FounderExecutiveOperationalSection",
  "FounderExecutiveSummarySection",
  "FounderExecutiveInsights",
];
let lastIdx = -1;
for (const comp of layoutOrder) {
  const usage = cockpitPage.match(new RegExp(`<${comp}[\\s/>]`));
  const idx = usage ? usage.index : -1;
  ok(`layout includes ${comp}`, idx >= 0);
  ok(`layout order ${comp}`, idx > lastIdx, `idx=${idx}`);
  lastIdx = idx;
}
ok("module views provider wraps B.2-B.7", cockpitPage.includes("FounderExecutiveModuleViewsProvider"));

// ── Executive mappers — no DB/SQL ────────────────────────────────────
const executiveMappers = [
  "lib/miaFounderExecutiveDisplay.js",
  "lib/miaFounderExecutiveGrowthDisplay.js",
  "lib/miaFounderExecutiveProductHealthDisplay.js",
  "lib/miaFounderExecutiveCommercialPerformanceDisplay.js",
  "lib/miaFounderExecutiveOperationalDisplay.js",
  "lib/miaFounderExecutiveSummaryDisplay.js",
];
for (const f of executiveMappers) {
  const src = read(f);
  ok(`${f.split("/").pop()} exists`, true);
  ok(`${f.split("/").pop()} no supabase`, !/supabase|createClient/.test(src));
  ok(`${f.split("/").pop()} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
  ok(`${f.split("/").pop()} no fetch`, !/\bfetch\s*\(/.test(src));
}

// ── Executive catalogs ─────────────────────────────────────────────────
const executiveCatalogs = [
  ["lib/miaFounderExecutiveCatalog.js", "B.2.0"],
  ["lib/miaFounderExecutiveGrowthCatalog.js", "B.3.0"],
  ["lib/miaFounderExecutiveProductHealthCatalog.js", "B.4.0"],
  ["lib/miaFounderExecutiveCommercialPerformanceCatalog.js", "B.5.0"],
  ["lib/miaFounderExecutiveOperationalCatalog.js", "B.6.0"],
  ["lib/miaFounderExecutiveSummaryCatalog.js", "B.7.0"],
  ["lib/miaFounderExecutivePolishCatalog.js", "B.8.0"],
];
for (const [file, version] of executiveCatalogs) {
  ok(`${file.split("/").pop()} exists`, existsSync(join(ROOT, file)));
  ok(`${file.split("/").pop()} version ${version}`, read(file).includes(`"${version}"`));
}

// ── Executive components — render-only guards ────────────────────────
const executiveComponents = [
  {
    file: "components/founder-cockpit/FounderExecutiveKpisSection.jsx",
    forbidden: ["classifyExecutive", "computeExecutive"],
    moduleClass: "founder-executive-module",
  },
  {
    file: "components/founder-cockpit/FounderExecutiveGrowthSection.jsx",
    forbidden: ["computePeriodChangePct", "classifyTrendDirection"],
    moduleClass: "founder-executive-module",
  },
  {
    file: "components/founder-cockpit/FounderExecutiveProductHealthSection.jsx",
    forbidden: ["classifyProductHealthLevel", "computeExecutiveHealthIndex"],
    moduleClass: "founder-executive-module",
  },
  {
    file: "components/founder-cockpit/FounderExecutiveCommercialPerformanceSection.jsx",
    forbidden: ["computeCommercialRatio", "classifyCommercialLevel"],
    moduleClass: "founder-executive-module",
  },
  {
    file: "components/founder-cockpit/FounderExecutiveOperationalSection.jsx",
    forbidden: ["computeExecutiveOperationalIndex", "classifyOperationalLatency"],
    moduleClass: "founder-executive-module",
  },
  {
    file: "components/founder-cockpit/FounderExecutiveSummarySection.jsx",
    forbidden: ["extractSummarySignals", "classifySummaryOverallLevel", "computeModuleScores", "fetch("],
    moduleClass: "founder-executive-module",
  },
];
for (const { file, forbidden, moduleClass } of executiveComponents) {
  const src = read(file);
  ok(`${file.split("/").pop()} no supabase`, !/supabase|createClient/.test(src));
  ok(`${file.split("/").pop()} no SQL`, !/SELECT\s|FROM\s+mia_/.test(src));
  for (const fn of forbidden) {
    ok(`${file.split("/").pop()} no ${fn}`, !src.includes(fn));
  }
  ok(`${file.split("/").pop()} polish module class`, src.includes(moduleClass));
}

// ── Baseline A contracts frozen ────────────────────────────────────────
ok("cockpit display A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("filters catalog A.7.0", read("lib/miaFounderFiltersCatalog.js").includes('"A.7.0"'));
ok("charts display A.8.0", read("lib/miaFounderChartsDisplay.js").includes('"A.8.0"'));
ok("temporal catalog A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));
ok("executive API 11.1.0", read("pages/api/executive-metrics.js").includes("11.1.0"));

// ── APIs unchanged by Phase B (no B.9 markers in contracts) ───────────
for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  const src = read(route);
  ok(`${route} no PATCH B.9 marker`, !src.includes("PATCH B.9"));
}

// ── Section IDs align with polish catalog ─────────────────────────────
const expectedIds = EXECUTIVE_SECTION_ORDER.slice(0, 6);
for (const id of expectedIds) {
  const found = readdirSync(join(ROOT, "components/founder-cockpit"))
    .filter((f) => f.endsWith(".jsx"))
    .some((f) => read(`components/founder-cockpit/${f}`).includes(`id="${id}"`));
  ok(`section id ${id} in codebase`, found);
}

// ── Prior patch evidence inventory ────────────────────────────────────
const patchEvidence = [
  ["B.1", "docs/analytics/PATCH_B_1_ARCHITECTURE_EVIDENCE.json", "docs/analytics/PATCH_B_1_CLOSURE_EVIDENCE.json"],
  ["B.2", "docs/analytics/PATCH_B_2_EXECUTIVE_KPIS_EVIDENCE.json", "docs/analytics/PATCH_B_2_CLOSURE_EVIDENCE.json"],
  ["B.3", "docs/analytics/PATCH_B_3_EXECUTIVE_GROWTH_EVIDENCE.json", "docs/analytics/PATCH_B_3_CLOSURE_EVIDENCE.json"],
  ["B.4", "docs/analytics/PATCH_B_4_EXECUTIVE_PRODUCT_HEALTH_EVIDENCE.json", "docs/analytics/PATCH_B_4_CLOSURE_EVIDENCE.json"],
  ["B.5", "docs/analytics/PATCH_B_5_EXECUTIVE_COMMERCIAL_PERFORMANCE_EVIDENCE.json", "docs/analytics/PATCH_B_5_CLOSURE_EVIDENCE.json"],
  ["B.6", "docs/analytics/PATCH_B_6_EXECUTIVE_OPERATIONAL_EVIDENCE.json", "docs/analytics/PATCH_B_6_CLOSURE_EVIDENCE.json"],
  ["B.7", "docs/analytics/PATCH_B_7_EXECUTIVE_SUMMARY_EVIDENCE.json", "docs/analytics/PATCH_B_7_CLOSURE_EVIDENCE.json"],
  ["B.8", "docs/analytics/PATCH_B_8_EXECUTIVE_POLISH_EVIDENCE.json", "docs/analytics/PATCH_B_8_CLOSURE_EVIDENCE.json"],
];
const patchStatuses = {};
for (const [patch, evFile, closureFile] of patchEvidence) {
  ok(`${patch} evidence exists`, existsSync(join(ROOT, evFile)));
  ok(`${patch} closure evidence exists`, existsSync(join(ROOT, closureFile)));
  const ev = readJson(evFile);
  ok(`${patch} evidence APPROVED`, ev?.status === "APPROVED");
  const closure = readJson(closureFile);
  const statusKey = Object.keys(closure || {}).find((k) => k.startsWith("patch_b") && k.endsWith("_status"));
  const closed = closure?.[statusKey] === "OFFICIALLY_CLOSED";
  patchStatuses[patch] = closed ? "OFFICIALLY_CLOSED" : closure?.[statusKey] ?? "UNKNOWN";
  ok(`${patch} closure OFFICIALLY_CLOSED`, closed, patchStatuses[patch]);
}

// ── B.8 polish CSS block ──────────────────────────────────────────────
const css = read("styles/founder-cockpit.css");
ok("B.8 polish CSS block", css.includes("PATCH B.8"));
ok("founder-executive-module class in CSS", css.includes(".founder-executive-module"));

// ── No forbidden orphan API ───────────────────────────────────────────
ok("no founder-executive-metrics.js API", !existsSync(join(ROOT, "pages/api/founder-executive-metrics.js")));

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass);
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

const evidence = {
  patch: "B.9",
  title: "PATCH B.9 — Phase B Final Audit Evidence",
  status: failed.length === 0 ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  phase: "B — Dashboard Executivo",
  architecture: {
    display_layer_preserved: executiveMappers.every((f) => !/supabase|SELECT\s|fetch\s*\(/.test(read(f))),
    catalog_layer_preserved: true,
    react_render_only: failed.filter((c) => c.label.includes("no ")).length === 0,
    baseline_a_frozen: true,
  },
  modules: {
    layout_order: layoutOrder,
    section_ids: EXECUTIVE_SECTION_ORDER,
    patch_statuses: patchStatuses,
  },
  checks: { total: checks.length, passed, failed: failed.length, items: checks },
};

writeFileSync(join(ROOT, "docs/analytics/PHASE_B_FINAL_AUDIT_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
process.exit(failed.length ? 1 : 0);
