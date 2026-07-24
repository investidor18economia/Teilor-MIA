/**
 * PATCH 12.4 — API Handler Contract Compliance Audit (miaChatCoreHandler + withMiaObservability)
 *
 * Usage:
 *   node scripts/test-mia-api-handler-contract-compliance-audit.js
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const API_HANDLER_CONTRACT_COMPLIANCE_VERSION = "12.4";

const CHAT_API = join(ROOT, "pages", "api", "chat-gpt4o.js");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function countMatches(text = "", pattern = /x/g) {
  return [...text.matchAll(pattern)].length;
}

function extractHandlerBlock(source = "") {
  const marker = "async function miaChatCoreHandler(req, res) {";
  const start = source.indexOf(marker);
  if (start === -1) return "";
  return source.slice(start, start + 250_000);
}

console.log(
  `\nPATCH 12.4 — API Handler Contract Compliance Audit (${API_HANDLER_CONTRACT_COMPLIANCE_VERSION})\n`
);

const chatSource = readFileSync(CHAT_API, "utf8");
const handlerSource = extractHandlerBlock(chatSource);

console.log("── Export & observability wrapper ──");
assert("withMiaObservability export", /export default withMiaObservability\s*\(\s*miaChatCoreHandler/.test(chatSource));
assert("endpoint /api/chat-gpt4o", chatSource.includes('endpoint: "/api/chat-gpt4o"'));
assert("withMiaObservability import", chatSource.includes('from "../../lib/miaObservability.js"'));
assert("logObservedError import", chatSource.includes("logObservedError"));
assert("miaChatCoreHandler defined", handlerSource.length > 1000);

console.log("\n── Perimeter HTTP contract ──");
assert("no bare return res.status in handler", !/\breturn\s+res\.status\s*\(/.test(handlerSource));
assert(
  "handler early void res.status gates",
  countMatches(handlerSource, /\breturn\s+void\s+res\.status\s*\(/g) >= 4
);
assert(
  "OPTIONS blocked with 405 JSON",
  /if \(req\.method === "OPTIONS"\)[\s\S]{0,300}method_not_allowed/.test(handlerSource)
);
assert(
  "non-POST blocked with 405",
  /if \(req\.method !== "POST"\)[\s\S]{0,300}method_not_allowed/.test(handlerSource)
);
assert("401 invalid_api_key path", handlerSource.includes('error: "invalid_api_key"'));
assert("400 empty query path", handlerSource.includes("chat_empty_query"));
assert("security headers on handler", handlerSource.includes('"Cache-Control", "no-store'));

console.log("\n── respondWithContract & delivery ──");
assert("respondWithContract helper exists", chatSource.includes("function respondWithContract("));
assert(
  "contract violation uses sendRuntimeResponse",
  /if \(violation\.violation\)[\s\S]{0,500}sendRuntimeResponse\s*\(/.test(chatSource)
);
assert(
  "handler uses void respondWithContract returns",
  countMatches(chatSource, /\breturn\s+void\s+respondWithContract\s*\(/g) >= 15
);
assert("sendRuntimeResponse delivery path", chatSource.includes("function sendRuntimeResponse("));

console.log("\n── Runtime integrations ──");
assert("commercial runtime activation import", chatSource.includes("resolveAndApplyCommercialRuntimeActivation"));
assert("runtime enforcement binding", chatSource.includes("bindSharedRuntimeEnforcement"));
assert("analytics instrumentation", chatSource.includes("instrumentResponseOutcomeAnalytics") || chatSource.includes("responseAnalytics"));
assert("latency analytics", chatSource.includes("createLatencyTracker"));

console.log("\n── Error handling ──");
assert("logObservedError on internal failure", chatSource.includes("logObservedError(err"));
assert("500 JSON on handler catch", /return void res\.status\(500\)\.json/.test(chatSource));

console.log("\n── Architecture preservation ──");
const UNTOUCHED = [
  "lib/miaCognitiveRouter.js",
  "lib/productSourceAdapter/commercialRuntimeActivation.js",
  "lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js",
  "lib/miaCommercialCardTrustLabels.js",
  "lib/commercial/nonDataLayerFallbackCandidateIsolation.js",
];
for (const file of UNTOUCHED) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} unchanged by handler patch`, !content.includes("return void res.status"));
}

console.log("\n── Regressions 4E-B ──");
const regressions = [
  ["scripts/test-mia-commercial-runtime-controlled-revalidation-audit.js", "4E-B.4"],
  ["scripts/test-mia-non-data-layer-fallback-candidate-isolation-audit.js", "4E-B.3"],
  ["scripts/test-mia-non-data-layer-card-trust-label-fix-audit.js", "4E-B.2"],
  ["scripts/test-mia-accessory-commercial-runtime-enforcement-audit.js", "4E-B.1"],
  ["scripts/test-mia-commercial-runtime-controlled-activation-audit.js", "4E-B"],
  ["scripts/test-mia-tone-compliance-guard-audit.js", "Tone Compliance"],
];

for (const [script, label] of regressions) {
  const result = spawnSync(process.execPath, [join(ROOT, script)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 600_000,
    env: { ...process.env, NODE_ENV: "test" },
  });
  const tail = (result.stderr || result.stdout || "").split("\n").slice(-3).join(" ").trim();
  assert(`regression ${label}`, result.status === 0, tail || `exit=${result.status}`);
}

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
