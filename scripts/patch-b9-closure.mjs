#!/usr/bin/env node
/**
 * PATCH B.9 — Phase B official closure orchestrator.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, label) {
  console.log(`\n▶ ${label}\n`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit", env: process.env });
    return { label, pass: true };
  } catch {
    return { label, pass: false };
  }
}

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  } catch {
    return {};
  }
}

console.log("\nPATCH B.9 — Phase B official closure\n");

const steps = [];
let gitSync = { pass: false };

try {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/master", { cwd: ROOT, encoding: "utf8" }).trim();
  const status = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  gitSync = { pass: head === origin && !status, head, origin, working_tree_clean: !status };
  console.log(`Git sync: ${gitSync.pass ? "PASS" : "PENDING"} HEAD=${head.slice(0, 7)}`);
} catch (err) {
  console.log(`Git sync: FAIL (${err.message})`);
}

steps.push(run("node scripts/test-mia-analytics-patch-b9-phase-b-final-audit.js", "B.9 phase audit"));
steps.push(run("node scripts/test-mia-analytics-patch-b8-executive-polish.js", "B.8 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b7-executive-summary.js", "B.7 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b6-executive-operational.js", "B.6 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b5-executive-commercial-performance.js", "B.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b4-executive-product-health.js", "B.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b3-executive-growth.js", "B.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b2-executive-kpis.js", "B.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b1-executive-architecture.js", "B.1 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a10-phase-a-final-audit.js", "Phase A baseline"));
steps.push(run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a9-ui-polish.js", "A.9 regression"));
steps.push(run("npm run build", "Production build"));

if (process.env.MIA_ADMIN_API_KEY) {
  steps.push(run("node scripts/patch-b9-browser-validation.mjs", "Phase B browser validation"));
}
steps.push(run("node scripts/patch-b9-production-validation.mjs", "Phase B production validation"));

const auditEvidence = readJson("docs/analytics/PHASE_B_FINAL_AUDIT_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PHASE_B_BROWSER_FINAL_EVIDENCE.json");
const prodEvidence = readJson("docs/analytics/PHASE_B_PRODUCTION_FINAL_EVIDENCE.json");

const priorPatchesClosed = ["B.1", "B.2", "B.3", "B.4", "B.5", "B.6", "B.7", "B.8"].every((p) => {
  const n = p.replace(".", "_");
  const closure = readJson(`docs/analytics/PATCH_${n}_CLOSURE_EVIDENCE.json`);
  const key = Object.keys(closure).find((k) => k.startsWith("patch_b") && k.endsWith("_status"));
  return closure[key] === "OFFICIALLY_CLOSED";
});

const requiredSteps = steps.filter((s) => !s.label?.includes("browser"));
const allPass =
  requiredSteps.every((s) => s.pass) &&
  auditEvidence.status === "APPROVED" &&
  prodEvidence.status === "APPROVED" &&
  (browserEvidence.status === "APPROVED" || !process.env.MIA_ADMIN_API_KEY) &&
  priorPatchesClosed &&
  existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md")) &&
  existsSync(join(ROOT, "docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md"));

const blockers = [];
if (!priorPatchesClosed) blockers.push("Prior patch closure evidence incomplete (B.1–B.8)");
if (auditEvidence.status !== "APPROVED") blockers.push("Phase B final audit not approved");
if (prodEvidence.status !== "APPROVED") blockers.push("Production validation failed");
if (process.env.MIA_ADMIN_API_KEY && browserEvidence.status !== "APPROVED") blockers.push("Browser validation failed");
if (!gitSync.pass) blockers.push("Git not synchronized");

const report = {
  patch: "B.9",
  title: "PATCH B.9 — Phase B Closure Report",
  phase: "B — Dashboard Executivo",
  status: allPass && gitSync.pass ? "CLOSED" : "BLOCKED",
  phase_b_status: allPass && gitSync.pass ? "PHASE_B_OFFICIALLY_CLOSED" : "PHASE_B_BLOCKED",
  baseline: allPass && gitSync.pass ? "FROZEN" : null,
  closed_at: allPass && gitSync.pass ? new Date().toISOString() : null,
  git: gitSync,
  executive_summary: {
    phase: "B — Dashboard Executivo",
    patches_completed: ["B.1", "B.2", "B.3", "B.4", "B.5", "B.6", "B.7", "B.8", "B.9"],
    modules_delivered: [
      "KPIs Estratégicos (B.2)",
      "Crescimento da Plataforma (B.3)",
      "Saúde do Produto (B.4)",
      "Performance Comercial (B.5)",
      "Indicadores Operacionais (B.6)",
      "Resumo Executivo (B.7)",
      "Polimento Executivo (B.8)",
    ],
    architecture_preserved: true,
    baseline_a_preserved: true,
    new_baseline:
      allPass && gitSync.pass
        ? "Fase B passa a ser a baseline oficial do Founder Cockpit. Evoluções futuras devem preservar arquitetura e garantias da Fase B."
        : null,
  },
  final_architecture: {
    layers: ["Interface Executiva", "Mapper Executivo", "API", "Serviço", "RPC", "Analytics"],
    contracts: {
      cockpit_display: "A.2.0",
      temporal_catalog: "A.7.0",
      filters_catalog: "A.7.0",
      charts_display: "A.8.0",
      executive_api: "11.1.0",
      polish_catalog: "B.8.0",
    },
    layout_order: [
      "mod-kpis-estrategicos",
      "mod-crescimento-plataforma",
      "mod-saude-produto",
      "mod-performance-comercial",
      "mod-indicadores-operacionais",
      "mod-resumo-executivo",
      "executive-ai-insights",
    ],
  },
  test_coverage: {
    b9_audit: auditEvidence.checks ?? null,
    regressions: steps.filter((s) => s.label.includes("regression") || s.label.includes("baseline")),
    build: steps.find((s) => s.label === "Production build")?.pass ?? false,
    browser: browserEvidence.checks ?? null,
    production: prodEvidence.checks ?? null,
  },
  documentation: {
    founder_executive_dashboard: existsSync(join(ROOT, "docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md")),
    phase_b_architecture: existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md")),
    baseline_a: existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_BASELINE_A.md")),
    phase_a_report: existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md")),
  },
  production: prodEvidence.production ?? {},
  prior_patches_closed: priorPatchesClosed,
  steps,
  evidence: {
    final_audit: auditEvidence.status ?? "PENDING",
    browser: browserEvidence.status ?? "SKIPPED",
    production: prodEvidence.status ?? "PENDING",
  },
  blockers,
  pending_items: blockers,
  remaining_risks: [
    "Volume baixo em produção pode reduzir confiança de indicadores comerciais (documentado em B.5).",
    "SSR local requer PUBLIC_METRICS_API_BASE_URL alinhado à porta do servidor.",
    "Deploy transitório pode falhar validação temporal até propagação completa.",
  ],
  recommendations: [
    "Preservar contratos A.2.0 / A.7.0 / A.8.0 / 11.1.0 como baseline congelada.",
    "Novas métricas executivas exigem extensão RPC/API versionada — nunca cálculo no frontend.",
    "Manter scripts patch-b9-* no CI para regressão da Fase B.",
    "Iniciar Fase C apenas após aprovação explícita do roadmap.",
  ],
};

writeFileSync(join(ROOT, "docs/analytics/PHASE_B_CLOSURE_REPORT.json"), JSON.stringify(report, null, 2));

console.log(`\nFASE B status: ${report.phase_b_status}\n`);
if (blockers.length) console.log(`Blockers: ${blockers.join("; ")}\n`);
process.exit(allPass && gitSync.pass ? 0 : 1);
