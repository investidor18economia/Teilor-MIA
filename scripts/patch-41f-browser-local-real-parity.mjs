#!/usr/bin/env node
/**
 * PATCH 4.1F — LOCAL × REAL browser parity (semantic)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UI_SCENARIOS,
  classifyParity,
  detectLocalBaseUrl,
  writeJson,
} from "./patch-41f-browser-e2e-scenarios.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOCAL_EVIDENCE = path.join(
  ROOT,
  "docs/conversational/audits/phase-4/evidence/PATCH_4_1F_LOCAL_BROWSER_E2E_EVIDENCE.json"
);
const PRODUCTION_EVIDENCE = path.join(
  ROOT,
  "docs/conversational/audits/phase-4/evidence/PATCH_4_1F_PRODUCTION_BROWSER_E2E_EVIDENCE.json"
);
const OUT = path.join(
  ROOT,
  "docs/conversational/audits/phase-4/evidence/PATCH_4_1F_LOCAL_REAL_BROWSER_PARITY_EVIDENCE.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (!fs.existsSync(LOCAL_EVIDENCE) || !fs.existsSync(PRODUCTION_EVIDENCE)) {
  console.error("Missing LOCAL or PRODUCTION browser evidence. Run both validations first.");
  process.exit(1);
}

const localEvidence = readJson(LOCAL_EVIDENCE);
const productionEvidence = readJson(PRODUCTION_EVIDENCE);
const localFlows = new Map((localEvidence.flows || []).map((flow) => [flow.id, flow]));
const productionFlows = new Map((productionEvidence.flows || []).map((flow) => [flow.id, flow]));

const comparisons = UI_SCENARIOS.map((scenario) => {
  const local = localFlows.get(scenario.id);
  const real = productionFlows.get(scenario.id);
  const parity = classifyParity(local?.reply_preview || "", real?.reply_preview || "", scenario.expectations || {});
  return {
    id: scenario.id,
    label: scenario.label,
    local_reply_preview: local?.reply_preview || "",
    production_reply_preview: real?.reply_preview || "",
    ...parity,
  };
});

const longLocal = (localEvidence.flows || []).find((flow) => flow.label === "long-conversation-10-turns");
const longReal = (productionEvidence.flows || []).find((flow) => flow.label === "long-conversation-10-turns");
const longParity = {
  local_turns: longLocal?.trace?.length || 0,
  production_turns: longReal?.trace?.length || 0,
  equivalent: (longLocal?.trace?.length || 0) >= 10 && (longReal?.trace?.length || 0) >= 10,
};

const passed = comparisons.filter((entry) => entry.equivalent).length;
const evidence = {
  patch: "4.1F",
  phase: "local_real_browser_parity",
  status: passed === comparisons.length && longParity.equivalent ? "APPROVED" : "REJECTED",
  local_base_url: localEvidence.base_url,
  production_base_url: productionEvidence.base_url,
  local_commit: localEvidence.commit,
  production_deploy_build: productionEvidence.deploy_build,
  finished_at: new Date().toISOString(),
  comparisons,
  long_conversation: longParity,
  summary: {
    scenarios_total: comparisons.length,
    scenarios_equivalent: passed,
    scenarios_failed: comparisons.length - passed,
  },
};

writeJson(OUT, evidence);
console.log(`PATCH 4.1F browser parity: ${passed}/${comparisons.length} scenarios equivalent`);
console.log(`Long conversation parity: ${longParity.equivalent ? "PASS" : "FAIL"}`);
console.log(`Evidence: ${OUT}`);
process.exit(passed === comparisons.length && longParity.equivalent ? 0 : 1);
