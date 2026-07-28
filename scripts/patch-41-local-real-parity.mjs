#!/usr/bin/env node
/**
 * PATCH 4.1 — LOCAL × REAL parity for E2E conversation battery
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4/evidence");
const LOCAL_PATH = path.join(EVIDENCE_DIR, "PATCH_4_1_LOCAL_E2E_CONVERSATION_EVIDENCE.json");
const REAL_PATH = path.join(EVIDENCE_DIR, "PATCH_4_1_PRODUCTION_E2E_CONVERSATION_EVIDENCE.json");
const OUT_PATH = path.join(EVIDENCE_DIR, "PATCH_4_1_LOCAL_REAL_PARITY_EVIDENCE.json");

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

console.log("\nPATCH 4.1 — LOCAL × REAL parity\n");

const local = loadJson(LOCAL_PATH);
const real = loadJson(REAL_PATH);
const localById = new Map((local.scenarios || []).map((entry) => [entry.id, entry]));

const comparisons = (real.scenarios || []).map((realEntry) => {
  const localEntry = localById.get(realEntry.id);
  return {
    id: realEntry.id,
    family: realEntry.family,
    profile: realEntry.profile,
    localPass: localEntry?.pass ?? null,
    realPass: realEntry.pass,
    equivalent: !!localEntry && localEntry.pass === realEntry.pass,
  };
});

const equivalent = comparisons.filter((entry) => entry.equivalent).length;
const status = equivalent === comparisons.length ? "APROVADA" : "BLOQUEADA";

let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const payload = {
  patch: "4.1",
  phase: "local_real_parity",
  status,
  commit,
  finished_at: new Date().toISOString(),
  summary: { total: comparisons.length, equivalent, divergent: comparisons.length - equivalent },
  comparisons,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
console.log(`Parity: ${equivalent}/${comparisons.length} — ${status}`);
console.log(`Evidence: ${OUT_PATH}\n`);
if (status !== "APROVADA") process.exit(1);
