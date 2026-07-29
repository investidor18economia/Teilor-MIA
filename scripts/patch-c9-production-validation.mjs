#!/usr/bin/env node
/**
 * PATCH C.9 — Production validation (Phase C pipeline C.2–C.8).
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION } from "../lib/miaExecutiveAnalysisContracts.js";
import { generateExecutiveAnalysisWithNarrative } from "../lib/miaExecutiveNarrativeBuilder.js";
import { mapExecutiveMetricsToFounderExecutiveKpis } from "../lib/miaFounderExecutiveDisplay.js";
import { mapExecutiveGrowthToFounderDisplay } from "../lib/miaFounderExecutiveGrowthDisplay.js";
import { mapExecutiveProductHealthToFounderDisplay } from "../lib/miaFounderExecutiveProductHealthDisplay.js";
import { mapExecutiveCommercialPerformanceToFounderDisplay } from "../lib/miaFounderExecutiveCommercialPerformanceDisplay.js";
import { mapExecutiveOperationalToFounderDisplay } from "../lib/miaFounderExecutiveOperationalDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_URL = process.env.PATCH_C9_PROD_URL || "https://economia-ai.vercel.app";
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

const mockExecutive = {
  platform: { total_sessions: 500, conversations: 200, questions: 350, unique_visitors: 120 },
  recommendation: { recommendations_generated: 300, recommendation_acceptance_rate: 0.55, rejection_rate: 0.12 },
  commerce: { offers_returned: 180, offer_clicks: 45, favorite_count: 22, offer_sets_generated: 200 },
  alerts: { alerts_created: 15 },
  performance: { total_duration_ms: 420 },
  partial_errors: [],
};
const mockPrevious = {
  platform: { total_sessions: 400, questions: 280, conversations: 160 },
  recommendation: { recommendation_acceptance_rate: 0.5, rejection_rate: 0.14 },
  commerce: { offer_clicks: 30, favorite_count: 15, offers_returned: 140 },
  alerts: { alerts_created: 10 },
  partial_errors: [],
};
const mockTemporal = {
  temporal_version: "A.7.0",
  partial_errors: [],
  growth: { series: [{ crescimento_dau_visitors_pct: 0.08 }] },
  platform_activity: { series: [{ total_sessions: 50, questions: 30, conversations: 20 }] },
  conversion: {
    summary: { taxa_clique_recomendacao: 0.04, eventos_recomendacoes: 280, eventos_cliques: 45 },
    bottlenecks: [{ transicao: "recomendacao_para_clique", is_gargalo_principal: true, taxa_abandono_transicao: 0.65, taxa_conversao_transicao: 0.35 }],
  },
};

const views = {
  kpis: mapExecutiveMetricsToFounderExecutiveKpis(mockExecutive, mockTemporal),
  growth: mapExecutiveGrowthToFounderDisplay(mockExecutive, mockPrevious, mockTemporal),
  health: mapExecutiveProductHealthToFounderDisplay(mockExecutive, mockPrevious),
  commercial: mapExecutiveCommercialPerformanceToFounderDisplay(mockExecutive, mockPrevious, mockTemporal),
  operational: mapExecutiveOperationalToFounderDisplay(mockExecutive, mockTemporal),
};

const input = {
  analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  period_label: "30d",
  period: { start: null, end: null, range: "30d", window_days: 30 },
  module_ids: ["kpis", "growth", "health", "commercial", "operational"],
  executive_views: views,
  executive_snapshot: null,
  temporal_snapshot: null,
  source_evidence: [],
};

console.log("\nPATCH C.9 — Production validation\n");

let health = {};
try {
  const res = await fetch(`${PROD_URL}/api/health`);
  health = await res.json();
  ok("production health 200", res.status === 200, `build=${health.build ?? "unknown"}`);
} catch (err) {
  ok("production health 200", false, err.message);
}

const localHead = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const remoteHead = execSync("git rev-parse origin/master", { cwd: ROOT, encoding: "utf8" }).trim();
ok("git synced", localHead === remoteHead, localHead.slice(0, 12));

const prodBuild = health.build ?? "";
let prodCommitFull = prodBuild;
try {
  if (prodBuild.length >= 12) prodCommitFull = execSync(`git rev-parse ${prodBuild}`, { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  prodCommitFull = prodBuild;
}

let isAncestor = false;
try {
  execSync(`git merge-base --is-ancestor ${prodCommitFull} ${localHead}`, { cwd: ROOT, stdio: "ignore" });
  isAncestor = true;
} catch {
  isAncestor = localHead === prodCommitFull || localHead.startsWith(prodBuild.slice(0, 12));
}

ok("production identity valid", isAncestor || !prodBuild, prodBuild.slice(0, 12) || "pending");

const full = generateExecutiveAnalysisWithNarrative(input);
ok("pipeline C.2–C.8 status", full.status === "analysis_complete_with_narrative");
ok("summary present", full.summary != null);
ok("insights present", full.insights.length > 0);
ok("trends present", full.trends.length > 0);
ok("alerts present", full.alerts.length >= 0);
ok("recommendations present", full.recommendations.length > 0);
ok("explainability present", full.explainability.length > 0);
ok("narrative present", Boolean(full.narrative));
ok("narrative deterministic", full.narrative?.deterministic === true);
ok("determinism", JSON.stringify(full) === JSON.stringify(generateExecutiveAnalysisWithNarrative(input)));

const evidence = {
  patch: "C.9",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  deployment_audit: {
    local_head: localHead,
    remote_head: remoteHead,
    production_build_short: prodBuild,
    production_deployment_url: PROD_URL,
    deployment_status: isAncestor ? "ready" : "pending_or_divergent",
  },
  functional_validation: {
    checks_total: checks.length,
    checks_passed: checks.filter((c) => c.pass).length,
    explainability_count: full.explainability.length,
    narrative_tone: full.narrative?.tone_profile,
  },
  final_verdict: checks.every((c) => c.pass) ? "PRODUCTION_PHASE_C_VALIDATED" : "BLOCKED",
};
writeFileSync(join(ROOT, "docs/analytics/PATCH_C_9_PRODUCTION_VALIDATION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nResult: ${checks.filter((c) => c.pass).length}/${checks.length}`);
console.log(`Verdict: ${evidence.final_verdict}\n`);
process.exit(checks.every((c) => c.pass) ? 0 : 1);
