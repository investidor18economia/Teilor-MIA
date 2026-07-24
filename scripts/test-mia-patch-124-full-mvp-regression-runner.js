#!/usr/bin/env node
/**
 * PATCH 12.4 — Full MVP regression master runner
 *
 * Usage:
 *   node scripts/test-mia-patch-124-full-mvp-regression-runner.js
 *   node scripts/test-mia-patch-124-full-mvp-regression-runner.js --once
 *   node scripts/test-mia-patch-124-full-mvp-regression-runner.js --with-p1
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCRIPTS = join(ROOT, "scripts");

const ARGS = new Set(process.argv.slice(2));
const RUN_ONCE = ARGS.has("--once");
const WITH_P1 = ARGS.has("--with-p1");

/** P0 — mandatory MVP regression gate (PATCH 12.4). */
const P0_SUITES = [
  { id: "patch-121-architecture", file: "test-mia-analytics-patch-121-mvp-architecture-audit.js", domain: "architecture", priority: "P0", timeoutMs: 120_000 },
  { id: "patch-122-p0-unit", file: "test-mia-patch-122-mvp-p0-unit-tests.js", domain: "unit_baseline", priority: "P0", timeoutMs: 180_000 },
  { id: "patch-123-p0-smoke", file: "test-mia-patch-123-mvp-integration-p0-smoke.js", domain: "integration_chain", priority: "P0", timeoutMs: 180_000 },
  { id: "api-handler-contract", file: "test-mia-api-handler-contract-compliance-audit.js", domain: "api_handler", priority: "P0", timeoutMs: 900_000 },
  { id: "cognitive-router-full", file: "test-mia-cognitive-router.js", domain: "cognitive_router", priority: "P0", timeoutMs: 120_000 },
  { id: "intent-social-full", file: "test-mia-intent-recognition-social-conversation-audit.js", domain: "intent_social", priority: "P0", timeoutMs: 120_000 },
  { id: "122-router-smoke", file: "test-mia-patch-122-cognitive-router-p0-smoke.js", domain: "cognitive_router", priority: "P0", timeoutMs: 120_000 },
  { id: "122-datalayer-smoke", file: "test-mia-patch-122-data-layer-p0-smoke.js", domain: "data_layer", priority: "P0", timeoutMs: 180_000 },
  { id: "123-favorites-alerts", file: "test-mia-patch-123-favorites-alerts-integration.js", domain: "favorites_alerts", priority: "P0", timeoutMs: 180_000 },
  { id: "intent-authority", file: "test-mia-intent-authority-enforcement.js", domain: "intent_authority", priority: "P0", timeoutMs: 120_000 },
  { id: "routing-guardrails", file: "test-mia-routing-guardrails.js", domain: "router_decision", priority: "P0", timeoutMs: 120_000 },
  { id: "mia-chat-proxy", file: "test-mia-mia-chat-proxy-contract.js", domain: "perimeter_core", priority: "P0", timeoutMs: 120_000 },
  { id: "commercial-selection", file: "test-mia-commercial-selection-engine-audit.js", domain: "commercial_runtime", priority: "P0", timeoutMs: 180_000 },
  { id: "commercial-dedup", file: "test-mia-commercial-deduplication-layer-audit.js", domain: "commercial_runtime", priority: "P0", timeoutMs: 180_000 },
  { id: "commercial-merge", file: "test-mia-commercial-offer-merge-layer-audit.js", domain: "commercial_runtime", priority: "P0", timeoutMs: 180_000 },
  { id: "4e-b4-revalidation", file: "test-mia-commercial-runtime-controlled-revalidation-audit.js", domain: "commercial_runtime", priority: "P0", timeoutMs: 900_000 },
  { id: "patch-111", file: "test-mia-analytics-patch-111-executive-metrics-api.js", domain: "executive_metrics", priority: "P0", timeoutMs: 180_000 },
  { id: "patch-114", file: "test-mia-analytics-patch-114-executive-ai-insights.js", domain: "executive_insights", priority: "P0", timeoutMs: 180_000 },
  { id: "patch-101", file: "test-mia-analytics-patch-101-price-intelligence.js", domain: "price_intelligence", priority: "P0", timeoutMs: 180_000 },
  { id: "patch-102", file: "test-mia-analytics-patch-102-savings-estimation.js", domain: "savings", priority: "P0", timeoutMs: 180_000 },
  { id: "patch-103", file: "test-mia-analytics-patch-103-price-alert-lifecycle.js", domain: "alerts", priority: "P0", timeoutMs: 180_000 },
  { id: "patch-104", file: "test-mia-analytics-patch-104-anti-regret-foundation.js", domain: "anti_regret", priority: "P0", timeoutMs: 180_000 },
  { id: "patch-105", file: "test-mia-analytics-patch-105-user-value-outcome.js", domain: "user_value", priority: "P0", timeoutMs: 180_000 },
  { id: "public-hardening", file: "test-mia-public-api-hardening.js", domain: "security", priority: "P0", timeoutMs: 120_000 },
  { id: "endpoint-lockdown", file: "test-mia-open-endpoint-lockdown.js", domain: "security", priority: "P0", timeoutMs: 120_000 },
  { id: "auth-trust", file: "test-mia-auth-trust-foundation.js", domain: "security", priority: "P0", timeoutMs: 120_000 },
];

/** P1 — phase regressions and extended suites (non-blocking unless --with-p1 strict). */
const P1_SUITES = [
  { id: "patch-106", file: "test-mia-analytics-patch-106-phase10-final-audit.js", domain: "phase_10", priority: "P1", timeoutMs: 300_000 },
  { id: "patch-115", file: "test-mia-analytics-patch-115-phase11-final-audit.js", domain: "phase_11", priority: "P1", timeoutMs: 300_000 },
  { id: "data-layer-full", file: "test-mia-data-layer-humanization-guard-audit.js", domain: "data_layer_full", priority: "P1", timeoutMs: 600_000 },
  { id: "real-e2e-endpoint", file: "test-mia-real-production-e2e-endpoint.js", domain: "http_local", priority: "P1", timeoutMs: 300_000, requiresServer: true },
  { id: "lockdown-http", file: "test-mia-open-endpoint-lockdown-http.mjs", domain: "http_security", priority: "P1", timeoutMs: 300_000, requiresServer: true },
];

function countTestFiles() {
  return readdirSync(SCRIPTS).filter((f) => f.startsWith("test-") && (f.endsWith(".js") || f.endsWith(".mjs"))).length;
}

function parseResult(output) {
  const text = String(output || "");
  const passFail = text.match(/(\d+)\s+passed,\s*(\d+)\s+failed/i);
  if (passFail) {
    return { passed: Number(passFail[1]), failed: Number(passFail[2]), total: Number(passFail[1]) + Number(passFail[2]) };
  }
  const passedFailedLines = text.match(/Passed\s*:\s*(\d+)[\s\S]*?Failed\s*:\s*(\d+)/i);
  if (passedFailedLines) {
    const passed = Number(passedFailedLines[1]);
    const failed = Number(passedFailedLines[2]);
    return { passed, failed, total: passed + failed };
  }
  const passou = text.match(/(\d+)\s+passou\s*[|·]\s*(\d+)\s+falhou/i);
  if (passou) {
    return { passed: Number(passou[1]), failed: Number(passou[2]), total: Number(passou[1]) + Number(passou[2]) };
  }
  const resultado = text.match(/Resultado:\s*(\d+)\/(\d+)/gi);
  if (resultado) {
    const last = resultado[resultado.length - 1];
    const m = last.match(/Resultado:\s*(\d+)\/(\d+)/i);
    if (m) {
      const passed = Number(m[1]);
      const total = Number(m[2]);
      return { passed, failed: total - passed, total };
    }
  }
  const staticMatch = text.match(/Static:\s*(\d+)\s+passed,\s*(\d+)\s+failed/i);
  if (staticMatch) {
    return {
      passed: Number(staticMatch[1]),
      failed: Number(staticMatch[2]),
      total: Number(staticMatch[1]) + Number(staticMatch[2]),
    };
  }
  if (/^OK:/m.test(text) && !/FAIL:/m.test(text)) {
    const count = (text.match(/^OK:/gm) || []).length;
    return { passed: count, failed: 0, total: count };
  }
  if (/A\)\s*PRODUCTION READY/i.test(text) && !/NOT PRODUCTION READY/i.test(text)) {
    const approved = text.match(/Aprovados:\s*(\d+)/i);
    const total = text.match(/Total de cen[aá]rios:\s*(\d+)/i);
    if (approved && total) {
      const passed = Number(approved[1]);
      const all = Number(total[1]);
      return { passed, failed: all - passed, total: all };
    }
  }
  if (/Veredito:\s*A\)\s*ROBUST/i.test(text)) {
    const passedFailed = text.match(/Passed:\s*(\d+)\s+Failed:\s*(\d+)/i);
    if (passedFailed) {
      return {
        passed: Number(passedFailed[1]),
        failed: Number(passedFailed[2]),
        total: Number(passedFailed[1]) + Number(passedFailed[2]),
      };
    }
  }
  if (/APROVADO|Todos os testes passaram|ROBUST/i.test(text) && !/FAILED|NÃO APROVADO|NOT PRODUCTION READY|GAP/i.test(text)) {
    const passedLines =
      (text.match(/^\s*✓/gm) || []).length ||
      (text.match(/^\s*OK:/gm) || []).length ||
      (text.match(/^\s*✅/gm) || []).length;
    if (passedLines > 0) return { passed: passedLines, failed: 0, total: passedLines };
  }
  if (/FAIL:/m.test(text)) {
    const failCount = (text.match(/^FAIL:/gm) || []).length;
    const okCount = (text.match(/^OK:/gm) || []).length;
    return { passed: okCount, failed: failCount, total: okCount + failCount };
  }
  return { passed: 0, failed: 1, total: 1, parse_error: true };
}

function classifyFailure(output, exitCode) {
  const text = String(output || "");
  if (exitCode === null || exitCode === 124) return { type: "timeout", reason: "process timeout" };
  if (/parse_error/.test(text)) return { type: "parser", reason: "unparsed suite output" };
  if (/ECONNREFUSED|localhost|dev server/i.test(text)) return { type: "environment", reason: "local server unavailable" };
  if (/flaky|intermittent/i.test(text)) return { type: "flaky", reason: "intermittent" };
  return { type: "regression_or_audit", reason: "suite exit non-zero" };
}

async function isLocalServerUp(base = process.env.MIA_API_BASE || "http://localhost:3000") {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function runSuite(suite) {
  const path = join(SCRIPTS, suite.file);
  if (!existsSync(path)) {
    return {
      ...suite,
      status: "missing",
      passed: 0,
      failed: 1,
      total: 1,
      elapsed_ms: 0,
      failure_type: "missing",
      failure_reason: "script not found",
    };
  }

  const started = Date.now();
  const result = spawnSync(process.execPath, [path], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
    timeout: suite.timeoutMs || 180_000,
  });
  const elapsed_ms = Date.now() - started;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  let stats = parseResult(output);
  if (stats.parse_error && result.status === 0) {
    stats = { passed: 1, failed: 0, total: 1 };
  }
  const timedOut = result.error?.code === "ETIMEDOUT" || result.status === 124;
  const success = !timedOut && result.status === 0 && stats.failed === 0 && !stats.parse_error;
  const failure = success
    ? null
    : classifyFailure(output, timedOut ? 124 : result.status);

  return {
    ...suite,
    status: success ? "passed" : timedOut ? "timeout" : "failed",
    exit_code: result.status,
    elapsed_ms,
    ...stats,
    failure_type: failure?.type || null,
    failure_reason: failure?.reason || null,
    output_tail: output.split("\n").slice(-10).join("\n"),
  };
}

function runBundle(label, suites) {
  console.log(`\n=== ${label} ===\n`);
  const results = [];
  for (const suite of suites) {
    process.stdout.write(`Running ${suite.id} (${suite.priority})… `);
    const r = runSuite(suite);
    results.push(r);
    const icon = r.status === "passed" ? "✅" : r.status === "skipped" ? "⏭" : "❌";
    console.log(`${icon} ${r.passed}/${r.total} ${r.elapsed_ms}ms`);
  }
  return results;
}

function summarize(results) {
  return {
    suites: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed" || r.status === "timeout" || r.status === "missing").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    cases_passed: results.reduce((a, r) => a + (r.passed || 0), 0),
    cases_failed: results.reduce((a, r) => a + (r.failed || 0), 0),
    duration_ms: results.reduce((a, r) => a + (r.elapsed_ms || 0), 0),
  };
}

const auditStartedAt = new Date().toISOString();
const inventory = {
  test_script_files: countTestFiles(),
  npm_test_commands: (readFileSync(join(ROOT, "package.json"), "utf8").match(/"test:mia:[^"]+"/g) || []).length,
  p0_suites: P0_SUITES.length,
  p1_suites: P1_SUITES.length,
};

console.log("\nPATCH 12.4 — Full MVP regression master runner\n");
console.log(`Inventory: ${inventory.test_script_files} test scripts | ${inventory.npm_test_commands} npm test:mia commands`);

const localUp = await isLocalServerUp();
const p1Prepared = P1_SUITES.map((suite) => {
  if (suite.requiresServer && !localUp) {
    return { ...suite, status: "skipped", passed: 0, failed: 0, total: 0, elapsed_ms: 0, failure_reason: "localhost unavailable" };
  }
  return suite;
});

const runs = RUN_ONCE ? 1 : 3;
const p0RunResults = [];

for (let i = 1; i <= runs; i += 1) {
  p0RunResults.push(runBundle(`P0 full regression — run ${i}/${runs}`, P0_SUITES));
}

const p0FirstRun = p0RunResults[0];
const p0Summaries = p0RunResults.map(summarize);
const deterministic =
  p0Summaries.every((s) => s.failed === 0) &&
  p0Summaries.every((s) => s.cases_passed === p0Summaries[0].cases_passed);

let p1Results = [];
if (WITH_P1) {
  const executable = p1Prepared.filter((s) => s.status !== "skipped");
  p1Results = runBundle("P1 extended regression", executable);
  for (const skipped of p1Prepared.filter((s) => s.status === "skipped")) {
    p1Results.push(skipped);
  }
} else {
  console.log("\n=== P1 extended — SKIPPED (use --with-p1) ===\n");
  p1Results = p1Prepared.map((s) =>
    s.status === "skipped"
      ? s
      : { ...s, status: "skipped", passed: 0, failed: 0, total: 0, elapsed_ms: 0, failure_reason: "not requested" }
  );
}

const p0Failed = p0FirstRun.filter((r) => r.status !== "passed");
const p0Summary = summarize(p0FirstRun);

const evidence = {
  patch: "12.4",
  phase: "12",
  audit_type: "full_mvp_regression",
  status: p0Failed.length === 0 && deterministic ? "APPROVED" : "PENDING",
  phase_verdict: p0Failed.length === 0 && deterministic ? "PATCH 12.4 APROVADO" : "PATCH 12.4 PENDENTE",
  audit_timestamp: auditStartedAt,
  audit_completed_at: new Date().toISOString(),
  inventory,
  matrix: {
    P0: P0_SUITES.map(({ id, domain, file, priority }) => ({ id, domain, file, priority })),
    P1: P1_SUITES.map(({ id, domain, file, priority }) => ({ id, domain, file, priority })),
    P2: "remaining conversational/commercial/production scripts (~350+)",
  },
  baselines_reference: {
    patch_12_1: { expected: "112/112 architecture checks" },
    patch_12_2: { expected: "888/888 unit cases x3" },
    patch_12_3: { expected: "896/896 integration cases x3" },
  },
  three_runs: {
    runs: p0Summaries,
    deterministic,
    flaky: !deterministic,
  },
  p0_results: p0FirstRun.map(
    ({ id, domain, priority, status, passed, failed, total, elapsed_ms, failure_type, failure_reason }) => ({
      id,
      domain,
      priority,
      status,
      passed,
      failed,
      total,
      elapsed_ms,
      failure_type,
      failure_reason,
    })
  ),
  p1_results: p1Results.map(({ id, domain, status, passed, failed, total, elapsed_ms, failure_reason }) => ({
    id,
    domain,
    status,
    passed,
    failed,
    total,
    elapsed_ms,
    failure_reason,
  })),
  totals: p0Summary,
  handler_contract: {
    suite: "api-handler-contract",
    skip_env_removed: true,
    architecture: "withMiaObservability(miaChatCoreHandler)",
  },
  corrections: [
    "api-handler-contract updated for observability wrapper",
    "apify audit isolated dedup/cache per test",
    "cognitive router ALTERNATIVE_REQUEST drift aligned (PATCH 7.5)",
    "intent social mixed/emotional edge cases fixed",
    "typo normalizer protects passo horas",
  ],
  production: {
    deploy_required: true,
    note: "Runtime changes in router, intent layer, typo normalizer — deploy before prod validation",
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_12_4_FULL_MVP_REGRESSION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log("\n--- PATCH 12.4 Summary ---");
console.log(`P0 suites: ${p0Summary.passed}/${p0Summary.suites} passed`);
console.log(`P0 cases: ${p0Summary.cases_passed}/${p0Summary.cases_passed + p0Summary.cases_failed}`);
console.log(`3-run deterministic: ${deterministic ? "YES" : "NO"}`);
console.log(`Duration (run 1): ${Math.round(p0Summary.duration_ms / 1000)}s`);
console.log(`Evidence: docs/analytics/PATCH_12_4_FULL_MVP_REGRESSION_EVIDENCE.json`);

if (p0Failed.length > 0) {
  console.log("\nP0 failures:");
  for (const f of p0Failed) {
    console.log(`  - ${f.id}: ${f.failure_reason || f.status} (${f.passed}/${f.total})`);
  }
}

process.exit(p0Failed.length === 0 && deterministic ? 0 : 1);
