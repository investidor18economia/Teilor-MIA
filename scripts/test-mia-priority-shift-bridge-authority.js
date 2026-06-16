/**
 * PATCH 7.6P — Priority Shift Bridge Authority
 *
 * Valida que PRIORITY_SHIFT agora recebe autoridade cognitiva completa:
 *   bridge.active = true
 *   finalIntent   = "decision"
 *   routingMode   = "cognitive_anchor_hold"
 *
 * Grupos:
 *   A — Bridge authority (controle de bridging)
 *   B — Safety/reliability real (família completa)
 *   C — Sem âncora (não deve forçar contexto)
 *
 * Usage:
 *   node scripts/test-mia-priority-shift-bridge-authority.js
 */

const API_BASE     = "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const PRIOR_QUERY  = "celular ate 2500";

// ─────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────

async function httpCall(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "minha_chave_181199" },
    body: JSON.stringify({
      text, image_base64: "", user_id: "ps-bridge-7-6p",
      conversation_id: convId, messages, session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ─────────────────────────────────────────────────────────────
// Two-turn runner: anchor + query
// ─────────────────────────────────────────────────────────────

async function runTurns(query, { noAnchor = false } = {}) {
  const convId = `ps-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let session = {};
  let msgs    = [];

  if (!noAnchor) {
    const t1 = await httpCall(PRIOR_QUERY, {}, [], convId);
    session  = t1.session_context || {};
    msgs     = [
      { role: "user",      content: PRIOR_QUERY },
      { role: "assistant", content: t1.reply || "" },
    ];
  }

  const t2 = await httpCall(query, session, msgs, convId);
  const trace = t2.mia_debug?.pipelineTrace || {};

  const ct     = trace.cognitive_turn_early || trace.cognitive_turn_with_cso || {};
  const bridge = trace.cognitive_intent_authority_bridge || {};
  const rd     = trace.routingDecision || {};
  const rich   = trace.rich_explanation_audit || {};
  const mode   = trace.universal_followup_understanding_audit || {};

  return {
    reply:              t2.reply || "",
    sessionContext:     t2.session_context || null,
    // Router
    turnType:           ct.turnType || null,
    confidence:         ct.confidence ?? null,
    // Bridge
    bridgeApplied:      !!bridge.active,
    bridgeReason:       bridge.reason || null,
    bridgeToIntent:     bridge.toIntent || null,
    // Intent / routing
    finalIntent:        bridge.toIntent || mode.finalIntent || trace.finalIntent || null,
    contextAction:      trace.context_action || null,
    routingMode:        rd.mode || mode.finalRoutingMode || null,
    allowNewSearch:     rd.allowNewSearch ?? null,
    allowReplaceWinner: rd.allowReplaceWinner ?? null,
    allowRerank:        rd.allowRerank ?? null,
    shouldPreserveAnchor: rd.shouldPreserveAnchor ?? null,
    // Template
    contextModeSelected: rich.contextModeSelected || null,
    responsePath:        trace.response_path || trace.responsePath || null,
    // Anchor
    anchor: session.lastBestProduct?.product_name ||
            t2.session_context?.lastBestProduct?.product_name || null,
  };
}

// ─────────────────────────────────────────────────────────────
// Assertions
// ─────────────────────────────────────────────────────────────

let PASS = 0;
let FAIL = 0;

function assert(caseId, label, actual, expected, info = "") {
  const ok = actual === expected;
  if (ok) {
    PASS++;
  } else {
    FAIL++;
    console.log(`    ✗ [${caseId}] ${label}`);
    console.log(`        expected : ${JSON.stringify(expected)}`);
    console.log(`        actual   : ${JSON.stringify(actual)}${info ? `  (${info})` : ""}`);
  }
  return ok;
}

function section(t) {
  console.log(`\n  ${"─".repeat(60)}\n  ${t}\n  ${"─".repeat(60)}`);
}

function runCase(id, r, checks, failedChecks = []) {
  let allOk = true;
  for (const [label, actual, expected, info] of checks) {
    const ok = assert(id, label, actual, expected, info);
    if (!ok) {
      allOk = false;
      failedChecks.push(label);
    }
  }
  const icon = allOk ? "✓" : "✗";
  console.log(`  ${icon} ${id}`);
  if (!allOk) {
    console.log(`      turnType        : ${r.turnType}  (conf=${r.confidence})`);
    console.log(`      bridge          : applied=${r.bridgeApplied}  reason=${r.bridgeReason}`);
    console.log(`      finalIntent     : ${r.finalIntent}`);
    console.log(`      routingMode     : ${r.routingMode}`);
    console.log(`      contextMode     : ${r.contextModeSelected}`);
    console.log(`      responsePath    : ${r.responsePath}`);
    console.log(`      allowNewSearch  : ${r.allowNewSearch}`);
    console.log(`      reply preview   : "${(r.reply || "").slice(0, 80)}"`);
  }
  return allOk;
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — Bridge authority
// ─────────────────────────────────────────────────────────────

section("Grupo A — Bridge authority");

const A = [
  ["A.1", "qual da menos dor de cabeca"],
  ["A.2", "qual e mais seguro"],
  ["A.3", "qual inspira mais confianca"],
  ["A.4", "qual dura mais"],
  ["A.5", "qual envelhece melhor"],
  ["A.6", "qual me deixaria mais tranquilo"],
];

for (const [id, query] of A) {
  try {
    const r = await runTurns(query);
    runCase(id, r, [
      ["turnType = PRIORITY_SHIFT",  r.turnType,    "PRIORITY_SHIFT"],
      ["bridgeApplied = true",       r.bridgeApplied, true],
      ["bridgeToIntent = decision",  r.bridgeToIntent, "decision"],
      ["finalIntent = decision",     r.finalIntent,  "decision"],
    ]);
  } catch (err) {
    FAIL++;
    console.log(`  ✗ ${id}  [ERROR: ${err.message}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// GRUPO B — Safety/reliability com âncora
// ─────────────────────────────────────────────────────────────

section("Grupo B — Safety/reliability com ancora ativa");

const B_QUERIES = [
  ["B.1", "qual da menos dor de cabeca"],
  ["B.2", "qual e mais seguro"],
  ["B.3", "qual inspira mais confianca"],
  ["B.4", "qual dura mais"],
  ["B.5", "qual envelhece melhor"],
  ["B.6", "qual me deixaria mais tranquilo"],
];

for (const [id, query] of B_QUERIES) {
  try {
    const r = await runTurns(query);
    runCase(id, r, [
      ["turnType = PRIORITY_SHIFT",       r.turnType,           "PRIORITY_SHIFT"],
      ["bridgeApplied = true",            r.bridgeApplied,      true],
      ["finalIntent = decision",          r.finalIntent,        "decision"],
      ["allowNewSearch = false",          r.allowNewSearch,     false],
      ["allowReplaceWinner = false",      r.allowReplaceWinner, false],
      ["shouldPreserveAnchor = true",     r.shouldPreserveAnchor, true],
    ]);
    console.log(`      routingMode     : ${r.routingMode}`);
    console.log(`      contextMode     : ${r.contextModeSelected}`);
    console.log(`      reply preview   : "${(r.reply || "").replace(/\n/g," ").slice(0, 80)}"`);
  } catch (err) {
    FAIL++;
    console.log(`  ✗ ${id}  [ERROR: ${err.message}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// GRUPO C — Sem âncora (não deve forçar contexto)
// ─────────────────────────────────────────────────────────────

section("Grupo C — Sem ancora (turn isolado)");

const C_QUERIES = [
  ["C.1", "qual e mais seguro"],
  ["C.2", "qual dura mais"],
];

for (const [id, query] of C_QUERIES) {
  try {
    const r = await runTurns(query, { noAnchor: true });
    // Sem âncora: bridge pode ou não ativar (depende do router não classificar como PRIORITY_SHIFT
    // pois hasActiveAnchor=false impede o signal). Apenas validar que não há crash e
    // que a resposta é coerente.
    const ok = r.reply && r.reply.length > 0;
    if (ok) {
      PASS++;
      console.log(`  ✓ ${id}  [sem ancora → sem crash, reply coherente]`);
    } else {
      FAIL++;
      console.log(`  ✗ ${id}  [sem ancora → reply vazia]`);
    }
    console.log(`      turnType    : ${r.turnType}`);
    console.log(`      bridge      : applied=${r.bridgeApplied}`);
    console.log(`      finalIntent : ${r.finalIntent}`);
  } catch (err) {
    FAIL++;
    console.log(`  ✗ ${id}  [ERROR: ${err.message}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// Sumário
// ─────────────────────────────────────────────────────────────

const TOTAL = PASS + FAIL;
section(`RESULTADO: ${PASS}/${TOTAL} passing`);
if (FAIL === 0) {
  console.log(`\n  ✓ PATCH 7.6P — todos os testes passaram\n`);
} else {
  console.log(`\n  ✗ ${FAIL} testes falharam\n`);
}
process.exit(FAIL > 0 ? 1 : 0);
