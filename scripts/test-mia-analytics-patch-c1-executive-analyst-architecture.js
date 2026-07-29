#!/usr/bin/env node
/**
 * PATCH C.1 — Executive Analyst architecture audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS,
  EXECUTIVE_CONFIDENCE_REQUIRED_KEYS,
  EXECUTIVE_EVIDENCE_REQUIRED_KEYS,
  EXECUTIVE_ANALYSIS_MODULE_IDS,
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE,
} from "../lib/miaExecutiveAnalysisContracts.js";
import {
  EXECUTIVE_ANALYST_LAYER_IDS,
  EXECUTIVE_ANALYST_PROHIBITIONS,
  MIA_EXECUTIVE_ANALYSIS_ARCHITECTURE_VERSION,
} from "../lib/miaExecutiveAnalysisArchitecture.js";
import {
  EXECUTIVE_NARRATIVE_STAGE_ORDER,
  MIA_EXECUTIVE_NARRATIVE_ARCHITECTURE_VERSION,
} from "../lib/miaExecutiveNarrativeArchitecture.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH C.1 — Executive Analyst architecture audit\n");

// ── Documentation ────────────────────────────────────────────────────
const archDoc = "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md";
ok("architecture doc exists", existsSync(join(ROOT, archDoc)));
const doc = read(archDoc);
ok("doc mentions Phase C", doc.includes("Fase C"));
ok("doc defines pipeline", doc.includes("Executive Analysis Layer"));
ok("doc defines LLM verbalizer boundary", doc.includes("LLM"));
ok("doc references Baseline B", doc.includes("FOUNDER_COCKPIT_BASELINE_B.md"));
ok("doc references Baseline A", doc.includes("FOUNDER_COCKPIT_BASELINE_A.md"));
ok("doc defines prohibitions", doc.includes("inventar causalidade"));
ok("doc defines roadmap C.1-C.9", doc.includes("C.9"));

// ── Architecture files ───────────────────────────────────────────────
const c1Files = [
  "lib/miaExecutiveAnalysisContracts.js",
  "lib/miaExecutiveAnalysisArchitecture.js",
  "lib/miaExecutiveNarrativeArchitecture.js",
];
for (const f of c1Files) {
  ok(`${f} exists`, existsSync(join(ROOT, f)));
  const src = read(f);
  ok(`${f.split("/").pop()} no supabase`, !/supabase|createClient/.test(src));
  ok(`${f.split("/").pop()} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
  ok(`${f.split("/").pop()} no fetch`, !/\bfetch\s*\(/.test(src));
  ok(`${f.split("/").pop()} no OpenAI/LLM runtime`, !/openai|chat\.completions|verbalizeExecutive/.test(src));
}

// ── No analysis behavior in C.1 ──────────────────────────────────────
const contractsSrc = read("lib/miaExecutiveAnalysisContracts.js");
ok("contracts version C.1.0", contractsSrc.includes('"C.1.0"'));
ok("architecture version C.1.0", read("lib/miaExecutiveAnalysisArchitecture.js").includes('"C.1.0"'));
ok("narrative architecture version C.1.0", read("lib/miaExecutiveNarrativeArchitecture.js").includes('"C.1.0"'));
ok("no analyzeExecutive function", !contractsSrc.includes("function analyze"));
ok("no generateInsights function", !contractsSrc.includes("function generate"));
ok("output template status pending", EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE.status === "pending");

// ── Contract structure ───────────────────────────────────────────────
ok("contracts define module ids", EXECUTIVE_ANALYSIS_MODULE_IDS.length === 5);
ok("pipeline has 5 layers", EXECUTIVE_ANALYST_LAYER_IDS.length === 5);
ok("pipeline includes executive_views", EXECUTIVE_ANALYST_LAYER_IDS.includes("executive_views"));
ok("pipeline includes llm_verbalizer", EXECUTIVE_ANALYST_LAYER_IDS.includes("llm_verbalizer"));
ok("narrative has 4 stages", EXECUTIVE_NARRATIVE_STAGE_ORDER.length === 4);
ok("prohibitions defined", EXECUTIVE_ANALYST_PROHIBITIONS.length >= 10);
ok("output required keys", EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS.length === 10);
ok("confidence required keys", EXECUTIVE_CONFIDENCE_REQUIRED_KEYS.length === 5);
ok("evidence required keys", EXECUTIVE_EVIDENCE_REQUIRED_KEYS.length === 6);
ok("contracts version export", MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION === "C.1.0");
ok("architecture version export", MIA_EXECUTIVE_ANALYSIS_ARCHITECTURE_VERSION === "C.1.0");
ok("narrative version export", MIA_EXECUTIVE_NARRATIVE_ARCHITECTURE_VERSION === "C.1.0");

// ── Baseline B preserved (no C.1 markers in frozen mappers) ──────────
const baselineMappers = [
  "lib/miaFounderExecutiveDisplay.js",
  "lib/miaFounderExecutiveGrowthDisplay.js",
  "lib/miaFounderExecutiveProductHealthDisplay.js",
  "lib/miaFounderExecutiveCommercialPerformanceDisplay.js",
  "lib/miaFounderExecutiveOperationalDisplay.js",
  "lib/miaFounderExecutiveSummaryDisplay.js",
];
for (const f of baselineMappers) {
  const src = read(f);
  ok(`${f.split("/").pop()} unchanged by C.1`, !src.includes("PATCH C.1"));
  ok(`${f.split("/").pop()} version intact`, /B\.[2-7]\.0/.test(src));
}

ok("ModuleViewsContext exists", existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveModuleViewsContext.jsx")));
ok("Baseline B doc exists", existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_BASELINE_B.md")));
ok("Baseline A doc exists", existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_BASELINE_A.md")));

// ── C.1 must NOT create forbidden implementation ───────────────────
const forbiddenC1 = [
  "pages/api/founder/executive-analyst.js",
  "lib/miaExecutiveAnalysisEngine.js",
  "lib/miaExecutiveAnalystLlm.js",
  "components/founder-cockpit/FounderExecutiveAnalystSection.jsx",
];
for (const f of forbiddenC1) {
  ok(`C.1 did not create ${f.split("/").pop()}`, !existsSync(join(ROOT, f)));
}

// ── APIs unchanged ───────────────────────────────────────────────────
for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js", "pages/api/founder/executive-insights.js"]) {
  ok(`${route} no PATCH C.1 marker`, !read(route).includes("PATCH C.1"));
}

// ── Cockpit page unchanged by C.1 ────────────────────────────────────
ok("FounderCockpitPage no C.1 import", !read("components/founder-cockpit/FounderCockpitPage.jsx").includes("ExecutiveAnalyst"));

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass);
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_C_1_ARCHITECTURE_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "C.1",
      title: "PATCH C.1 — Executive Analyst Architecture Evidence",
      status: failed.length === 0 ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      contracts_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
      scope: "Architecture and contracts only — no analysis behavior",
      files_created: c1Files.concat([archDoc]),
      baseline_preserved: { phase_a: true, phase_b: true },
      checks: { total: checks.length, passed, failed: failed.length, items: checks },
    },
    null,
    2
  )
);

process.exit(failed.length ? 1 : 0);
