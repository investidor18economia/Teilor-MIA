#!/usr/bin/env node
/**
 * PATCH 5.8.8V — Pre-commit: git audit, local tests, double build
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-588v");
mkdirSync(OUT, { recursive: true });

const PATCH588_FILES = [
  "lib/miaHumanWarmthPresenceGovernance.js",
  "lib/miaStructuralExpressionGovernance.js",
  "lib/miaConversationalIdentityPresenceGovernance.js",
  "lib/miaHumanConversationExperience.js",
  "lib/miaSocialConversationBehavior.js",
  "scripts/test-mia-patch-588-human-presence.js",
  "scripts/patch-588-regression-runner.mjs",
  "scripts/patch-588-directed-audit.mjs",
  "scripts/patch-588v-precommit.mjs",
  "scripts/patch-588v-closure.mjs",
  "scripts/test-mia-patch-587-experience-refinement.js",
  "docs/conversational/audits/phase-5/PATCH_5_8_8_REPORT.md",
];

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: "pipe" }).trim();
}

function shOut(cmd) {
  try {
    return { ok: true, output: sh(cmd) };
  } catch (e) {
    return { ok: false, output: String(e.stderr || e.stdout || e.message) };
  }
}

const gitState = {
  branch: sh("git branch --show-current"),
  head: sh("git rev-parse HEAD"),
  originMaster: shOut("git rev-parse origin/master").output || null,
  status: sh("git status --porcelain"),
  log3: sh("git log -3 --oneline"),
  timestamp: new Date().toISOString(),
};

const statusLines = gitState.status.split("\n").filter(Boolean);
const patch588Present = PATCH588_FILES.filter((f) => existsSync(join(ROOT, f)));
const unrelatedModified = statusLines.filter((line) => {
  const file = line.slice(3).trim();
  return !PATCH588_FILES.some((p) => file === p || file.endsWith(p));
});

const diffAudit = {
  expectedFiles: PATCH588_FILES,
  presentFiles: patch588Present,
  missingExpected: PATCH588_FILES.filter((f) => !existsSync(join(ROOT, f))),
  unrelatedModifiedCount: unrelatedModified.length,
  unrelatedModified: unrelatedModified.slice(0, 30),
  secretsScan: statusLines.some((l) => /\.env|credentials|secret/i.test(l)),
};

writeFileSync(join(OUT, "INITIAL_GIT_STATE.json"), JSON.stringify({ gitState, diffAudit }, null, 2));
writeFileSync(join(OUT, "PATCH_588_DIFF_AUDIT.json"), JSON.stringify(diffAudit, null, 2));

console.log("=== PATCH 5.8.8V pre-commit ===");
console.log(`HEAD=${gitState.head} branch=${gitState.branch}`);
console.log(`Patch files present: ${patch588Present.length}/${PATCH588_FILES.length}`);
console.log(`Unrelated modified: ${unrelatedModified.length}`);

const testResults = [];
const suites = [
  { id: "5.8.8", cmd: "node scripts/test-mia-patch-588-human-presence.js" },
  { id: "5.8.7", cmd: "node scripts/test-mia-patch-587-experience-refinement.js" },
  { id: "5.8.6", cmd: "node scripts/patch-586-llm-agnostic-audit.mjs" },
  { id: "5.8.5", cmd: "node scripts/test-mia-patch-585-social-humanization.js" },
  { id: "5.8.4", cmd: "node scripts/test-mia-patch-584-conversational-rhythm.js" },
  { id: "5.8.3", cmd: "node scripts/test-mia-patch-583-social-continuity.js" },
];

let allTestsPass = true;
for (const suite of suites) {
  const r = shOut(suite.cmd);
  testResults.push({ id: suite.id, pass: r.ok, tail: r.output.split("\n").slice(-3).join("\n") });
  console.log(`${r.ok ? "✓" : "✗"} ${suite.id}`);
  if (!r.ok) allTestsPass = false;
}

writeFileSync(join(OUT, "LOCAL_TEST_RESULTS.json"), JSON.stringify({ allTestsPass, testResults }, null, 2));

const buildResults = [];
for (let i = 1; i <= 2; i += 1) {
  if (existsSync(join(ROOT, ".next"))) {
    rmSync(join(ROOT, ".next"), { recursive: true, force: true });
  }
  const r = shOut("npm run build");
  buildResults.push({ run: i, pass: r.ok, exitCode: r.ok ? 0 : 1, tail: r.output.split("\n").slice(-5).join("\n") });
  console.log(`Build ${i}: ${r.ok ? "PASS" : "FAIL"}`);
  if (!r.ok) allTestsPass = false;
}

writeFileSync(join(OUT, "LOCAL_BUILD_RESULTS.json"), JSON.stringify({ buildResults, allGreen: buildResults.every((b) => b.pass) }, null, 2));

const ok = allTestsPass && diffAudit.missingExpected.length === 0 && buildResults.every((b) => b.pass);
console.log(`Pre-commit: ${ok ? "READY" : "BLOCKED"}`);
process.exit(ok ? 0 : 1);
