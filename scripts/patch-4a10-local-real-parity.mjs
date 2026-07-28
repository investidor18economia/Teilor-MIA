#!/usr/bin/env node
/**
 * PATCH 4A.10 — Compare LOCAL × REAL multivariate evidence
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const LOCAL = path.join(EVIDENCE_DIR, "PATCH_4A_10_LOCAL_MULTIVARIATE_EVIDENCE.json");
const REAL = path.join(EVIDENCE_DIR, "PATCH_4A_10_PRODUCTION_MULTIVARIATE_EVIDENCE.json");
const OUT = path.join(EVIDENCE_DIR, "PATCH_4A_10_LOCAL_REAL_PARITY_EVIDENCE.json");

function load(path) {
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const local = load(LOCAL);
const real = load(REAL);

if (!local || !real) {
  console.error("Missing LOCAL or REAL evidence files.");
  process.exit(1);
}

const localById = new Map((local.scenarios || []).map((s) => [s.id, s]));
const realById = new Map((real.scenarios || []).map((s) => [s.id, s]));
const allIds = [...new Set([...localById.keys(), ...realById.keys()])];

const comparisons = [];
let parityPass = 0;
for (const id of allIds) {
  const l = localById.get(id);
  const r = realById.get(id);
  const equivalent = !!l && !!r && l.pass === r.pass;
  if (equivalent) parityPass += 1;
  comparisons.push({
    id,
    localPass: l?.pass ?? null,
    realPass: r?.pass ?? null,
    equivalent,
    localDominant: l?.architecture?.dominantCriterion ?? l?.transcript?.[0]?.architecture?.dominantCriterion ?? null,
    realDominant: r?.architecture?.dominantCriterion ?? r?.transcript?.[0]?.architecture?.dominantCriterion ?? null,
  });
}

const payload = {
  patch: "4A.10",
  phase: "local_real_parity",
  status: parityPass === allIds.length ? "APROVADA" : "BLOQUEADA",
  finished_at: new Date().toISOString(),
  summary: {
    total: allIds.length,
    equivalent: parityPass,
    divergent: allIds.length - parityPass,
    localStatus: local.status,
    realStatus: real.status,
    localPassed: local.summary?.passed,
    realPassed: real.summary?.passed,
  },
  comparisons,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`\nPATCH 4A.10 LOCAL × REAL: ${parityPass}/${allIds.length} equivalent`);
console.log(`Evidence: ${OUT}`);
process.exit(parityPass === allIds.length ? 0 : 1);
