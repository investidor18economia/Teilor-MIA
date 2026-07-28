#!/usr/bin/env node
/**
 * PATCH 4A.11 — LOCAL × REAL parity for semantic interpretation audit
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const LOCAL_PATH = path.join(EVIDENCE_DIR, "PATCH_4A_11_LOCAL_SEMANTIC_INTERPRETATION_EVIDENCE.json");
const REAL_PATH = path.join(EVIDENCE_DIR, "PATCH_4A_11_PRODUCTION_SEMANTIC_INTERPRETATION_EVIDENCE.json");
const OUT_PATH = path.join(EVIDENCE_DIR, "PATCH_4A_11_LOCAL_REAL_PARITY_EVIDENCE.json");

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing evidence file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

console.log("\nPATCH 4A.11 — LOCAL × REAL parity\n");

const local = loadJson(LOCAL_PATH);
const real = loadJson(REAL_PATH);

const localById = new Map((local.scenarios || []).map((entry) => [entry.id, entry]));
const comparisons = [];

for (const realEntry of real.scenarios || []) {
  const localEntry = localById.get(realEntry.id);
  const equivalent = !!localEntry && localEntry.pass === realEntry.pass;
  comparisons.push({
    id: realEntry.id,
    family: realEntry.family,
    localPass: localEntry?.pass ?? null,
    realPass: realEntry.pass,
    equivalent,
    localDominant: localEntry?.interpretation?.dominantCriterion ?? null,
    realDominant: realEntry?.interpretation?.dominantCriterion ?? null,
    localClaims: localEntry?.interpretation?.claimCount ?? 0,
    realClaims: realEntry?.interpretation?.claimCount ?? 0,
  });
}

const equivalentCount = comparisons.filter((entry) => entry.equivalent).length;
const status = equivalentCount === comparisons.length ? "APROVADA" : "BLOQUEADA";

let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const payload = {
  patch: "4A.11",
  phase: "local_real_parity",
  status,
  commit,
  finished_at: new Date().toISOString(),
  summary: {
    total: comparisons.length,
    equivalent: equivalentCount,
    divergent: comparisons.length - equivalentCount,
  },
  comparisons,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));

console.log(`Parity: ${equivalentCount}/${comparisons.length} equivalent — ${status}`);
console.log(`Evidence: ${OUT_PATH}\n`);
if (status !== "APROVADA") process.exit(1);
