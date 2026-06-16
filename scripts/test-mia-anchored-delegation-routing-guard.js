/**
 * PATCH 7.6U-G — Anchored Delegation Routing Guard
 *
 * Valida que delegação curta com âncora não abre new_search,
 * e que nova intenção comercial continua podendo buscar.
 *
 * Usage: node scripts/test-mia-anchored-delegation-routing-guard.js
 */

import {
  buildRoutingDecision,
  routingDecisionToTrace,
} from "../lib/miaRoutingDecisionContract.js";
import {
  isAnchoredDelegationChoiceRequest,
  resolveClearNewCommercialSearchForRouting,
} from "../lib/miaRoutingSafety.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const MOCK_ANCHOR = { product_name: "Produto Recomendado Atual", price: "R$ 1.899" };
const MOCK_SESSION = { lastBestProduct: MOCK_ANCHOR };

const SHOULD_BLOCK = [
  "escolhe um pra mim",
  "escolhe pra mim",
  "decide pra mim",
  "decide ai",
  "me fala um so",
];

const SHOULD_ALLOW_SEARCH = [
  "escolhe um notebook pra mim",
  "escolhe um celular ate 2000",
  "me mostra opcoes",
  "procura outro",
  "busca outro",
];

function normalize(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractWinner(data) {
  return (
    data?.session_context?.lastBestProduct?.product_name ||
    data?.prices?.[0]?.product_name ||
    ""
  );
}

function buildStaticRoutingDecision(message) {
  const clear = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: true,
  });
  return buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: MOCK_SESSION,
    intent: "search",
    contextAction: "search",
    signals: { hasClearNewCommercialSearch: clear },
  });
}

function openedNewSearchFromTrace(trace = {}, rd = {}) {
  const responsePath = trace.response_path || rd.responsePathHint || rd.mode || "";
  return (
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(responsePath).includes("new_search")
  );
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-g",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

let passed = 0;
let failed = 0;
const failures = [];

function pass(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail = "") {
  failed++;
  const msg = detail ? `${label} — ${detail}` : label;
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
}

console.log("\n  PATCH 7.6U-G — Static routing guard\n");

for (const message of SHOULD_BLOCK) {
  if (!isAnchoredDelegationChoiceRequest(message)) {
    fail(`helper detects block case "${message}"`);
    continue;
  }

  const rd = buildStaticRoutingDecision(message);
  if (rd.mode !== "context_decision" || rd.allowNewSearch !== false) {
    fail(
      `static block "${message}"`,
      `mode=${rd.mode} allowNewSearch=${rd.allowNewSearch}`
    );
    continue;
  }
  pass(`static block "${message}" → context_decision / no search`);
}

for (const message of SHOULD_ALLOW_SEARCH) {
  if (isAnchoredDelegationChoiceRequest(message)) {
    fail(`helper does not block allow case "${message}"`);
    continue;
  }

  const rd = buildStaticRoutingDecision(message);
  if (rd.allowNewSearch === false && rd.mode === "context_decision") {
    fail(
      `static allow "${message}"`,
      `unexpected context_decision block mode=${rd.mode}`
    );
    continue;
  }
  pass(`static allow "${message}" → not blocked (${rd.mode})`);
}

console.log("\n  PATCH 7.6U-G — Production HTTP guard\n");

for (const message of SHOULD_BLOCK) {
  const convId = `u-g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
    const winnerBefore = extractWinner(t1);
    const session = { ...(t1.session_context || {}) };
    const msgs = [
      { role: "user", content: PRIOR_QUERY },
      { role: "assistant", content: t1.reply || "" },
    ];

    const t2 = await httpPost(message, session, msgs, convId);
    const trace = t2.mia_debug?.pipelineTrace || {};
    const rd = trace.routingDecision || routingDecisionToTrace(buildStaticRoutingDecision(message));
    const winnerAfter = extractWinner(t2) || winnerBefore;
    const responsePath = trace.response_path || rd.responsePathHint || rd.mode || "";
    const openedNewSearch = openedNewSearchFromTrace(trace, rd);
    const winnerPreserved =
      !winnerBefore || !winnerAfter || normalize(winnerBefore) === normalize(winnerAfter);
    const anchorPreserved = winnerPreserved && !!winnerAfter;
    const contextualPath = String(responsePath).includes("context_decision");

    const record = {
      message,
      openedNewSearch,
      winnerPreserved,
      anchorPreserved,
      responsePath,
      routingMode: rd.mode,
      allowNewSearch: rd.allowNewSearch,
    };

    if (
      !openedNewSearch &&
      winnerPreserved &&
      anchorPreserved &&
      contextualPath
    ) {
      pass(`prod block "${message}"`);
      console.log(`    ${JSON.stringify(record)}`);
    } else {
      fail(`prod block "${message}"`, JSON.stringify(record));
    }
  } catch (err) {
    fail(`prod block "${message}"`, err.message);
  }
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
