#!/usr/bin/env node
/**
 * PATCH A.6.1 — Official closure orchestrator.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_A6_PROD_BASE_URL || "https://economia-ai.vercel.app";

function run(cmd, label) {
  console.log(`\n▶ ${label}\n`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit", env: process.env });
    return { label, pass: true };
  } catch {
    return { label, pass: false };
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
  } catch {
    return {};
  }
}

const steps = [];
let gitSync = { pass: false };

console.log("\nPATCH A.6.1 — Official closure\n");

try {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/master", { cwd: ROOT, encoding: "utf8" }).trim();
  const status = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  gitSync = {
    pass: head === origin && !status,
    head,
    origin,
    working_tree_clean: !status,
  };
  console.log(`Git sync: ${gitSync.pass ? "PASS" : "FAIL"} HEAD=${head.slice(0, 7)} origin=${origin.slice(0, 7)}`);
} catch (err) {
  console.log(`Git sync: FAIL (${err.message})`);
}

steps.push({ label: "git synchronized", pass: gitSync.pass });
steps.push(
  run("node scripts/test-mia-analytics-patch-a6-founder-performance-conversion.js", "A.6 unit tests"),
  run("node scripts/test-mia-analytics-patch-a5-founder-products-categories.js", "A.5 regression"),
  run("node scripts/test-mia-analytics-patch-a4-founder-sessions-users.js", "A.4 regression"),
  run("node scripts/test-mia-analytics-patch-a3-temporal-series-api.js", "A.3 regression"),
  run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"),
  run("node scripts/test-mia-analytics-patch-113-founder-executive-cockpit.js", "Founder Cockpit regression"),
  run("node scripts/patch-a6-founder-performance-production-validation.mjs", "Production validation"),
  run("node --env-file=.env.local scripts/patch-a6-browser-validation.mjs", "Browser UI validation")
);

const prodEvidence = readJson("docs/analytics/PATCH_A_6_FOUNDER_PERFORMANCE_CONVERSION_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_A_6_BROWSER_UI_EVIDENCE.json");

const allPass =
  steps.every((s) => s.pass) &&
  prodEvidence.status === "APPROVED" &&
  browserEvidence.status === "APPROVED";

const closure = {
  patch: "A.6.1",
  title: "PATCH A.6 — Official Closure",
  status: allPass ? "CLOSED" : "PENDING",
  closed_at: new Date().toISOString(),
  patch_a6_status: allPass ? "OFFICIALLY_CLOSED" : "PENDING_CLOSURE",
  git: {
    head: gitSync.head,
    origin_master: gitSync.origin,
    synchronized: gitSync.pass,
    working_tree_clean: gitSync.working_tree_clean,
  },
  production: {
    base_url: PROD_BASE,
    build: prodEvidence.production?.build ?? null,
    temporal_version: "A.6.0",
    migration_applied: prodEvidence.checks?.items?.find((c) => c.label === "migration applied")?.pass ?? false,
    rpcs_validated: prodEvidence.checks?.items?.find((c) => c.label === "conversion RPC smoke")?.pass ?? false,
    api_validated: prodEvidence.status === "APPROVED",
  },
  interface_validation: {
    browser_evidence: browserEvidence.status,
    section_id: "mod-performance-conversao",
    screenshots: browserEvidence.screenshots ?? null,
  },
  tests: {
    steps: steps.map((s) => ({ label: s.label, pass: s.pass })),
    all_pass: steps.every((s) => s.pass),
  },
  metrics_added: [
    "eventos_recomendacoes",
    "eventos_cliques",
    "eventos_favoritos",
    "eventos_alertas",
    "taxa_clique_recomendacao",
    "taxa_favoritos_recomendacao",
    "taxa_alertas_recomendacao",
    "conversao_acumulada_visitante",
    "funnel_stages (6 etapas)",
    "bottlenecks (transições + gargalo principal)",
    "daily CTR evolution",
  ],
  next_patch: "A.7 — Filtros Avançados",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_6_1_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));

console.log("\n══════════════════════════════════════");
console.log(`PATCH A.6.1 closure: ${closure.status}`);
console.log(`Evidence: docs/analytics/PATCH_A_6_1_CLOSURE_EVIDENCE.json`);
console.log("══════════════════════════════════════\n");

process.exit(allPass ? 0 : 1);
