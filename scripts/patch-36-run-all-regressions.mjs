#!/usr/bin/env node
/**
 * PATCH 3.6 — Run all Phase 3 regression suites
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const suites = [
  "scripts/test-mia-patch-36-general-regression-audit.js",
  "scripts/test-mia-patch-36-mixed-intent-audit.js",
  "scripts/test-mia-patch-36-sequence-h-audit.js",
  "scripts/test-mia-patch-31-commercial-entry-audit.js",
  "scripts/test-mia-patch-32-conversational-continuity-audit.js",
  "scripts/test-mia-patch-33-product-resolution-audit.js",
  "scripts/test-mia-patch-34a-clarification-gates-audit.js",
  "scripts/test-mia-patch-34b-constraint-refinement-audit.js",
  "scripts/test-mia-patch-35a-decision-facts-narrative-audit.js",
  "scripts/test-mia-patch-35b-verbalizer-humanization-audit.js",
  "scripts/test-mia-conversation-polish.js",
  "scripts/test-mia-natural-conversation-and-constraint-refinement.js",
  "scripts/test-mia-patch-122-data-layer-p0-smoke.js",
];

const results = [];
let failed = 0;

for (const script of suites) {
  const r = spawnSync("node", [join(ROOT, script)], { cwd: ROOT, encoding: "utf8" });
  const pass = r.status === 0;
  if (!pass) failed += 1;
  results.push({
    script,
    pass,
    exit_code: r.status,
    output_tail: (r.stdout || r.stderr || "").split("\n").slice(-4).join("\n"),
  });
  console.log(`${pass ? "PASS" : "FAIL"} ${script}`);
}

const evidence = {
  patch: "3.6",
  phase: "regression_runner",
  status: failed === 0 ? "APPROVED" : "REJECTED",
  finished_at: new Date().toISOString(),
  summary: { total: suites.length, passed: suites.length - failed, failed },
  results,
};

const outDir = join(ROOT, "docs/conversational");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "PATCH_3_6_GENERAL_REGRESSION_AUDIT_EVIDENCE.json"),
  JSON.stringify(evidence, null, 2)
);

process.exit(failed > 0 ? 1 : 0);
