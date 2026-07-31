#!/usr/bin/env node
/**
 * PATCH 5.1 — Static egress inventory (read-only analysis)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHAT = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
const CATALOG = readFileSync(join(ROOT, "lib/miaResponsePathCatalog.js"), "utf8");
const MIA_CHAT = readFileSync(join(ROOT, "pages/api/mia-chat.js"), "utf8");

function lineOf(index) {
  return CHAT.slice(0, index).split("\n").length;
}

function findCalls(fnName) {
  const re = new RegExp(`\\b${fnName}\\s*\\(`, "g");
  const hits = [];
  let m;
  while ((m = re.exec(CHAT)) !== null) {
    hits.push({ line: lineOf(m.index), fn: fnName });
  }
  return hits;
}

function extractResponsePathLiterals() {
  const paths = new Set();
  const re = /responsePath:\s*[`'"]([^`'"]+)[`'"]|responsePath:\s*`([^`]+)`|"response_path":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(CHAT)) !== null) {
    const p = m[1] || m[2] || m[3];
    if (p && !p.includes("${")) paths.add(p);
  }
  const re2 = /sendRuntimeResponse\([\s\S]{0,400}?,\s*[`'"]([^`'"]+)[`'"]/g;
  while ((m = re2.exec(CHAT)) !== null) paths.add(m[1]);
  const re3 = /respondWithContract\([\s\S]{0,600}?,\s*[`'"]([^`'"]+)[`'"]/g;
  while ((m = re3.exec(CHAT)) !== null) paths.add(m[1]);
  return [...paths].sort();
}

function extractCatalogPaths() {
  const paths = new Set();
  for (const re of [
    /const SOCIAL_FLOW_PATHS = \[([\s\S]*?)\];/,
    /const CLARIFICATION_PATHS = \[([\s\S]*?)\];/,
    /const COMMERCIAL_PATHS = \[([\s\S]*?)\];/,
    /export const EMITTED_FUNCTIONAL_RESPONSE_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/,
  ]) {
    const block = CATALOG.match(re)?.[1] || "";
    for (const m of block.matchAll(/"([^"]+)"/g)) paths.add(m[1]);
  }
  return [...paths].sort();
}

function extractLegacyFlowBlocks() {
  const blocks = [];
  const re = /if \(intent === "([^"]+)"\)[\s\S]{0,80}?\n[\s\S]{0,2500}?sendLegacySocialDirectResponse/g;
  let m;
  while ((m = re.exec(CHAT)) !== null) {
    blocks.push({ intent: m[1], line: lineOf(m.index) });
  }
  return blocks;
}

function countPattern(pat) {
  return (CHAT.match(pat) || []).length;
}

const sendRuntimeCalls = findCalls("sendRuntimeResponse").filter((h) => h.line !== 26824);
const legacyCalls = findCalls("sendLegacySocialDirectResponse").filter((h) => h.line !== 27366);
const respondCalls = findCalls("respondWithContract").filter((h) => h.line !== 27395);
const finalizeCalls = findCalls("finalizeHumanConversationReply");
const directRes = {
  res_status_json: countPattern(/res\.status\(\d+\)\.json\(/g),
  res_json: countPattern(/[^.]\sres\.json\(/g),
  res_send: countPattern(/res\.status\([^)]+\)\.send\(/g),
  res_end: countPattern(/res\.status\(\d+\)\.end\(/g),
};

const emittedPaths = extractCatalogPaths();
const literalPaths = extractResponsePathLiterals();
const unlisted = literalPaths.filter((p) => !emittedPaths.includes(p));

const inventory = {
  patch: "5.1",
  generated_at: new Date().toISOString(),
  files: {
    chat_gpt4o_lines: CHAT.split("\n").length,
    mia_chat_lines: MIA_CHAT.split("\n").length,
  },
  http_egress_functions: {
    sendHttpRuntimeResponse: { defined_line: findCalls("sendHttpRuntimeResponse").find((h) => h.line < 26800)?.line },
    sendRuntimeResponse: { defined_line: 26824, call_sites: sendRuntimeCalls.length, calls: sendRuntimeCalls },
    sendLegacySocialDirectResponse: {
      defined_line: 27366,
      call_sites: legacyCalls.length,
      calls: legacyCalls,
      note: "LLM + guardMiaReplyForTone only; claims finalization in trace without finalizeHumanConversationReply",
    },
    respondWithContract: {
      defined_line: 27395,
      call_sites: respondCalls.length,
      calls: respondCalls,
      note: "Commercial/context; tone guard + first answer contract; NOT finalizeHumanConversationReply",
    },
    finalizeHumanConversationReply: {
      call_sites_in_chat: finalizeCalls.length,
      calls: finalizeCalls,
      note: "Only 3 call sites in chat-gpt4o.js",
    },
  },
  direct_http_in_chat_gpt4o: directRes,
  mia_chat_perimeter: {
    upstream: "forwardChatRequestToCore → /api/chat-gpt4o",
    egress_points: [
      "OPTIONS res.status(204).end()",
      "429 res.status(429).json(rate limit)",
      "502 res.status(502).json(upstream error)",
      "res.status(sanitized.status).send(bodyText)",
      "sendPublicApiError / sendPublicApiOriginRejected",
    ],
  },
  runtime_dispatch_modes: [
    "__sendRuntimeTechnicalResponse",
    "__sendRuntimePreCognitiveFunctionalResponse",
    "__sendRuntimeCommercialDegradedResponse",
    "__sendRuntimeGovernedResponse",
  ],
  legacy_intent_blocks: extractLegacyFlowBlocks(),
  catalog: {
    emitted_functional_paths_count: emittedPaths.length,
    emitted_paths: emittedPaths,
    literal_paths_in_handler_count: literalPaths.length,
    literals_not_in_catalog: unlisted,
  },
  classification: {
    governed_social_with_finalize: [
      "runGovernedSocialIntentFlow → finalizeHumanConversationReply → sendRuntimeResponse",
      "runNonCommercialAuthorityFastBranch → finalizeNonCommercialReply → sendRuntimeResponse",
      "general_answer empty → finalizeHumanConversationReply → sendRuntimeResponse",
    ],
    legacy_social_bypass: legacyCalls.map((c) => `line ${c.line}`),
    clarification_bypass: ["needs_clarification → sendRuntimeResponse (line ~30150)"],
    direct_reply_bypass: ["contextResolution.directReply → respondWithContract (line ~30192)"],
    commercial_egress: "respondWithContract → sendRuntimeResponse (majority of commercial paths)",
  },
};

const outDir = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-51");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "STATIC_EGRESS_INVENTORY.json");
writeFileSync(outPath, JSON.stringify(inventory, null, 2));
console.log("Wrote", outPath);
console.log(JSON.stringify({
  sendRuntime: sendRuntimeCalls.length,
  legacy: legacyCalls.length,
  respondWithContract: respondCalls.length,
  finalize: finalizeCalls.length,
  catalog_paths: emittedPaths.length,
  legacy_intents: inventory.legacy_intent_blocks.length,
}, null, 2));
