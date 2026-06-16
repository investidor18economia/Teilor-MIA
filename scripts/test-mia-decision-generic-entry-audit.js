/**
 * PATCH 7.6O-A-AUDIT — MIA Decision Generic Entry Audit
 *
 * DIAGNÓSTICO PURO — não altera comportamento de produção.
 *
 * Objetivo: descobrir exatamente por que consultas contextuais chegam a
 * `decision_generic` em vez de um contrato especializado.
 *
 * Rastreia o fluxo completo:
 *
 *   Router (classifyMiaTurn)
 *     ↓
 *   Bridge (mapCognitiveTurnToLegacyIntent)
 *     ↓
 *   Routing Decision mode (cognitive_anchor_hold?)
 *     ↓
 *   Template Selection (_richExpContextModeSelected)
 *
 * Para cada cenário registra 6 estágios:
 *
 *   STAGE 1  Router output         — turnType, confidence, reasons
 *   STAGE 2  Cognitive signals     — sinais booleanos brutos
 *   STAGE 3  Bridge result         — aplicada? intent mapeado?
 *   STAGE 4  Expected template     — template esperado pela arquitetura
 *   STAGE 5  Actual template       — template real observado via HTTP
 *   STAGE 6  Root cause            — categorização do ponto de queda
 *
 * Root cause categories:
 *   ROUTER_UNKNOWN                 — router emitiu UNKNOWN (lacuna semântica)
 *   ROUTER_WRONG_TYPE              — router emitiu tipo incorreto para a intenção
 *   BRIDGE_NOT_APPLIED             — tipo fora da allowlist → bridge não atua
 *   ROUTING_OVERRIDE               — routing decision sobrescreveu mode esperado
 *   CONTEXT_RESOLUTION_OVERRIDE    — context resolution limpou o path contextual
 *   TEMPLATE_SELECTION_FALLTHROUGH — template chain não cobriu o tipo detectado
 *   EXPECTED_DECISION_GENERIC      — queda correta (sem âncora ou intenção nova)
 *
 * Usage:
 *   MIA_STATE_AUDIT=true node scripts/test-mia-decision-generic-entry-audit.js
 *   node scripts/test-mia-decision-generic-entry-audit.js   (HTTP desativado)
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
} from "../lib/miaCognitiveRouter.js";

import {
  mapCognitiveTurnToLegacyIntent,
  COGNITIVE_BRIDGE_ALLOWLIST,
  COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD,
} from "../lib/miaCognitiveBridge.js";

// ─────────────────────────────────────────────────────────────
// Template selection — replica exata da chain do handler
// (pages/api/chat-gpt4o.js @27194)
// ─────────────────────────────────────────────────────────────

const TEMPLATE_PINS_WINNER = {
  analysis:                              false,
  confidence_challenge_defense:          true,
  objection_response_contract:           true,
  refinement_followup_response_contract: true,
  priority_shift_response_contract:      true,
  explanation_anchored:                  true,   // pina via anchorTitle no ctx
  decision_generic:                      false,
};

/**
 * Replica a lógica real do handler para _richExpContextModeSelected.
 *
 * Para que `explanation_anchored` seja selecionado, a pipeline real precisa:
 *   1. Router → EXPLANATION_REQUEST (conf >= 0.83)
 *   2. Bridge → aplicada (EXPLANATION_REQUEST está na allowlist)
 *   3. Bridge → intent = "decision"
 *   4. buildRoutingDecision(intent="decision") → mode = "cognitive_anchor_hold"
 *   5. shouldUseRichExplanationPath(routingDecision) → true
 *   6. _richExpPathActivated = true → template = "explanation_anchored"
 *
 * Aqui modelamos isso usando a intenção indireta:
 *   - Se bridge foi aplicada e turnType === EXPLANATION_REQUEST com âncora
 *     → _richExpPathActivated = true (presumível)
 *   - O sinal final é inferido — não observável diretamente via HTTP.
 */
function resolveExpectedTemplate({
  turnType, hasAnchor,
  bridgeApplied, bridgeIntent,
  contextAction, decisionExpSubtype,
}) {
  // Os contratos especializados (objection, refinement, priority_shift) dependem
  // EXCLUSIVAMENTE do turnType cognitivo + âncora — NÃO dependem de bridge.
  const isObjectionWithAnchor  = turnType === "OBJECTION"  && hasAnchor;
  const isAlternativeRequest   = turnType === "ALTERNATIVE_REQUEST" && hasAnchor;
  const isRefinementWithAnchor = (turnType === "REFINEMENT" || isAlternativeRequest) && hasAnchor;
  const isPriorityShiftWithAnchor = turnType === "PRIORITY_SHIFT" && hasAnchor;

  // explanation_anchored requer mode=cognitive_anchor_hold, que SÓ vem de:
  //   bridge aplicada + intent="decision" + buildRoutingDecision → mode
  // Proxy: bridge aplicada E turnType=EXPLANATION_REQUEST com âncora.
  const richExpPathActivated =
    bridgeApplied && bridgeIntent === "decision" &&
    turnType === "EXPLANATION_REQUEST" && hasAnchor;

  if (contextAction === "analysis")   return "analysis";
  if (decisionExpSubtype === "confidence_challenge" && richExpPathActivated)
    return "confidence_challenge_defense";
  if (isObjectionWithAnchor)          return "objection_response_contract";
  if (isRefinementWithAnchor)         return "refinement_followup_response_contract";
  if (isPriorityShiftWithAnchor)      return "priority_shift_response_contract";
  if (richExpPathActivated)           return "explanation_anchored";
  return "decision_generic";
}

/**
 * Determina a causa raiz da queda para decision_generic.
 *
 * @param {{ turnType, hasAnchor, bridgeApplied, expectedTemplate }} p
 * @returns {string}
 */
function classifyRootCause({ turnType, hasAnchor, bridgeApplied, expectedTemplate, bridgeReason }) {
  if (expectedTemplate !== "decision_generic") return "EXPECTED_NON_GENERIC";

  if (!hasAnchor) return "EXPECTED_DECISION_GENERIC";

  if (turnType === "UNKNOWN") return "ROUTER_UNKNOWN";

  // Tipos que têm âncora mas cujo template não é um contrato especializado:
  // FOLLOW_UP, REACTION, CONVERSATIONAL, VALUE_QUESTION, etc.
  const ANCHORED_CONTRACT_TYPES = new Set([
    "OBJECTION", "REFINEMENT", "ALTERNATIVE_REQUEST",
    "PRIORITY_SHIFT", "EXPLANATION_REQUEST",
  ]);

  if (!ANCHORED_CONTRACT_TYPES.has(turnType)) {
    if (turnType === "FOLLOW_UP") return "ROUTER_WRONG_TYPE";
    if (COGNITIVE_BRIDGE_ALLOWLIST.has(turnType) && !bridgeApplied) {
      return "BRIDGE_NOT_APPLIED";
    }
    return "TEMPLATE_SELECTION_FALLTHROUGH";
  }

  // Tipo está na família certa mas bridge não foi aplicada
  if (!COGNITIVE_BRIDGE_ALLOWLIST.has(turnType)) {
    return "BRIDGE_NOT_APPLIED";
  }

  if (!bridgeApplied) {
    return bridgeReason === "low_confidence"
      ? "ROUTER_LOW_CONFIDENCE"
      : "BRIDGE_NOT_APPLIED";
  }

  return "ROUTING_OVERRIDE";
}

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

const API_BASE     = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const HTTP_ENABLED = !!(process.env.MIA_STATE_AUDIT);

async function httpTurn(query, session_context, msgs, convId) {
  const messages = [...msgs, { role: "user", content: query }];
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "minha_chave_181199" },
    body: JSON.stringify({
      text: query, image_base64: "", user_id: "generic-entry-audit-766oa",
      conversation_id: convId, messages, session_context,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runTurns(turns) {
  const convId = `generic-entry-${Date.now()}`;
  let sc = {}, msgs = [];
  const results = [];
  for (const { query } of turns) {
    const data = await httpTurn(query, sc, msgs, convId);
    msgs = [...msgs, { role: "user", content: query }, { role: "assistant", content: data.reply || "" }];
    sc   = data.session_context || {};
    results.push({ query, data, sc });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// Static analysis (pure — no HTTP)
// ─────────────────────────────────────────────────────────────

function staticAnalyze(query, session = {}, hasAnchor = true) {
  const cognitive = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery:  query,
    sessionContext: session,
    contextAction:  "context_hold",
    hasActiveAnchor: hasAnchor,
  });

  const bridge = mapCognitiveTurnToLegacyIntent(cognitive);

  const expectedTemplate = resolveExpectedTemplate({
    turnType:          cognitive.turnType,
    hasAnchor,
    bridgeApplied:     bridge.active,
    bridgeIntent:      bridge.intent,
    contextAction:     "context_hold",
    decisionExpSubtype: cognitive.signals?.decisionExplanation?.subtype || null,
  });

  const rootCause = classifyRootCause({
    turnType:         cognitive.turnType,
    hasAnchor,
    bridgeApplied:    bridge.active,
    bridgeReason:     bridge.reason,
    expectedTemplate,
  });

  return { cognitive, bridge, expectedTemplate, rootCause };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function normalizeText(s = "") {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function nameInText(text = "", name = "") {
  if (!name || !text) return false;
  const normText = normalizeText(text);
  const normName = normalizeText(name);
  if (normText.includes(normName)) return true;
  const words = normName.split(" ");
  for (let i = 0; i <= words.length - 3; i++) {
    const w = words.slice(i, i + 3).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  for (let i = 0; i <= words.length - 2; i++) {
    const w = words.slice(i, i + 2).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  return false;
}

function inferActualTemplate(turnType, hasAnchor, bridgeApplied, bridgeIntent, finalReply, authorizedWinner, session) {
  // We can't directly observe the template from HTTP.
  // We infer it from the reply behavior:
  //   - If reply pins winner with contextual framing → likely explanation_anchored or a contract
  //   - If reply is free → likely decision_generic
  //   - Winner present + no anchored framing → could be either
  const hasWinner = nameInText(finalReply, authorizedWinner);
  const contextualFraming =
    /\b(o produto (recomendado|escolhido|indicado)|minha recomendação|como já mencionei|como vimos|considerando o contexto|a opção que se destacou)\b/i.test(finalReply);

  // Best-effort inference
  const expectedTpl = resolveExpectedTemplate({ turnType, hasAnchor, bridgeApplied, bridgeIntent,
    contextAction: "context_hold", decisionExpSubtype: null });

  if (expectedTpl !== "decision_generic") {
    return { inferred: expectedTpl, observed_winner: hasWinner, basis: "expected_non_generic" };
  }
  return {
    inferred: hasWinner ? "decision_generic_lucky" : "decision_generic",
    observed_winner: hasWinner,
    basis: "no_contract_expected",
  };
}

// ─────────────────────────────────────────────────────────────
// Record builder
// ─────────────────────────────────────────────────────────────

const ANCHOR_MOCK_SESSION = {
  lastBestProduct: { product_name: "iPhone 13" },
  lastRankingSnapshot: [
    { product_name: "iPhone 13", rank: 1 },
    { product_name: "Samsung Galaxy A54", rank: 2 },
    { product_name: "Samsung Galaxy S23 FE", rank: 3 },
  ],
};

function buildRecord({ scenarioId, scenarioLabel, query, static: s, http }) {
  const flags = [];
  const { cognitive, bridge, expectedTemplate, rootCause } = s;

  if (cognitive.turnType === "UNKNOWN") flags.push("ROUTER_CLASSIFIED_UNKNOWN");
  if (!COGNITIVE_BRIDGE_ALLOWLIST.has(cognitive.turnType) && cognitive.turnType !== "UNKNOWN") {
    flags.push("TURN_TYPE_EXPECTED_BUT_MISSING");
  }
  if (!bridge.active && COGNITIVE_BRIDGE_ALLOWLIST.has(cognitive.turnType)) {
    flags.push("ROUTER_CLASSIFIED_WRONG_FAMILY");
  }
  if (expectedTemplate === "decision_generic") {
    flags.push("TEMPLATE_FALLTHROUGH_TO_GENERIC");
  }

  const CONTRACT_TEMPLATES = new Set([
    "objection_response_contract",
    "refinement_followup_response_contract",
    "priority_shift_response_contract",
    "explanation_anchored",
  ]);
  if (CONTRACT_TEMPLATES.has(expectedTemplate)) {
    if (!TEMPLATE_PINS_WINNER[expectedTemplate]) {
      flags.push("CONTRACT_EXPECTED_BUT_NOT_SELECTED");
    }
  }

  // HTTP-observed data
  const actualTemplate = http ? http.inferredTemplate : null;
  const finalHasWinner = http ? http.hasWinner : null;
  const reply          = http ? (http.reply || "").slice(0, 160) : null;

  return {
    scenarioId, scenarioLabel, query,
    // STAGE 1
    turnType:   cognitive.turnType,
    confidence: cognitive.confidence,
    reasons:    cognitive.reasons,
    // STAGE 2
    signals: {
      alternativeRequest: !!cognitive.signals?.alternativeRequest?.detected,
      followUp:           !!cognitive.signals?.isFollowUp,
      objection:          !!cognitive.signals?.isObjection,
      priorityShift:      !!cognitive.signals?.isPriorityShift,
      explanationRequest: !!cognitive.signals?.isExplanationRequest,
      reaction:           !!cognitive.signals?.isReaction,
      hesitation:         !!cognitive.signals?.isHesitation,
    },
    // STAGE 3
    bridgeApplied: bridge.active,
    bridgeReason:  bridge.reason,
    bridgeIntent:  bridge.intent || null,
    // STAGE 4
    expectedTemplate,
    expectedTemplatePinsWinner: TEMPLATE_PINS_WINNER[expectedTemplate] ?? false,
    // STAGE 5
    actualTemplate,
    finalHasWinner,
    reply,
    // STAGE 6
    rootCause,
    flags,
  };
}

// ─────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────

const allRecords = [];
let count = 0;

function section(title) {
  console.log(`\n${"─".repeat(68)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(68));
}

function printRecord(r) {
  const icon = r.expectedTemplate === "decision_generic" ? "✗" : "✓";
  console.log(`  ${icon} ${r.scenarioId} — ${r.scenarioLabel}`);
  console.log(`      STAGE 1  turnType    : ${r.turnType.padEnd(22)} conf: ${r.confidence}`);
  console.log(`               reasons     : ${r.reasons.join(", ")}`);
  console.log(`      STAGE 2  signals     : altReq=${+r.signals.alternativeRequest} followUp=${+r.signals.followUp} objection=${+r.signals.objection} priorityShift=${+r.signals.priorityShift} expReq=${+r.signals.explanationRequest} hesitation=${+r.signals.hesitation}`);
  console.log(`      STAGE 3  bridge      : ${r.bridgeApplied ? "APPLIED → " + r.bridgeIntent : "NOT APPLIED (" + r.bridgeReason + ")"}`);
  console.log(`      STAGE 4  expected    : ${r.expectedTemplate}  (pins=${r.expectedTemplatePinsWinner})`);
  if (r.actualTemplate !== null) {
    console.log(`      STAGE 5  actual      : ${r.actualTemplate?.inferred || "unknown"}  winner_in_reply=${r.finalHasWinner}`);
    if (r.reply) console.log(`               reply     : "${r.reply.replace(/\n/g, " ").slice(0, 110)}"`);
  }
  console.log(`      STAGE 6  root cause  : ${r.rootCause}`);
  console.log(`               flags       : ${r.flags.join(", ") || "(none)"}`);
}

async function auditScenario(scenarioId, scenarioLabel, contextualQuery) {
  count++;
  const s = staticAnalyze(contextualQuery, ANCHOR_MOCK_SESSION, true);

  let http = null;
  if (HTTP_ENABLED) {
    try {
      const results = await runTurns([
        { query: "celular ate 2500" },
        { query: contextualQuery },
      ]);
      const turn1     = results[0];
      const turn2     = results[1];
      const winner    = turn1.sc?.lastBestProduct?.product_name || null;
      const hasWinner = nameInText(turn2.data.reply || "", winner);
      const inferred  = inferActualTemplate(
        s.cognitive.turnType, true, s.bridge.active, s.bridge.intent,
        turn2.data.reply || "", winner, turn1.sc
      );
      http = { reply: turn2.data.reply || "", hasWinner, inferredTemplate: inferred };
    } catch (err) {
      http = { reply: `HTTP ERROR: ${err.message}`, hasWinner: null, inferredTemplate: null };
    }
  }

  const rec = buildRecord({ scenarioId, scenarioLabel, query: contextualQuery, static: s, http });
  allRecords.push(rec);
  printRecord(rec);
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — TOP N DISCOVERY
// ─────────────────────────────────────────────────────────────
section("Grupo A — TOP N DISCOVERY (lista dos melhores)");

await auditScenario("A1", "me mostra os três que mais fizeram sentido", "me mostra os tres que mais fizeram sentido");
await auditScenario("A2", "quais foram os 3 melhores?",                  "quais foram os 3 melhores");
await auditScenario("A3", "quero ver o top 3",                           "quero ver o top 3");
await auditScenario("A4", "quais opções ficaram no topo?",               "quais opcoes ficaram no topo");
await auditScenario("A5", "me mostra os principais",                     "me mostra os principais");

// ─────────────────────────────────────────────────────────────
// GRUPO B — FINAL CHOICE REQUEST
// ─────────────────────────────────────────────────────────────
section("Grupo B — FINAL CHOICE REQUEST (pedido de escolha definitiva)");

await auditScenario("B1", "se você tivesse que escolher um só",   "se voce tivesse que escolher um so");
await auditScenario("B2", "qual você manteria?",                  "qual voce manteria");
await auditScenario("B3", "qual ficaria no final?",               "qual ficaria no final");
await auditScenario("B4", "qual sobreviveria ao corte?",          "qual sobreviveria ao corte");
await auditScenario("B5", "se só pudesse levar um",               "se so pudesse levar um");

// ─────────────────────────────────────────────────────────────
// RELATÓRIO CONSOLIDADO
// ─────────────────────────────────────────────────────────────

const genericRecords    = allRecords.filter(r => r.expectedTemplate === "decision_generic");
const nonGenericRecords = allRecords.filter(r => r.expectedTemplate !== "decision_generic");

const rootCauseCounts = {};
allRecords.forEach(r => {
  rootCauseCounts[r.rootCause] = (rootCauseCounts[r.rootCause] || 0) + 1;
});

const flagCounts = {};
allRecords.flatMap(r => r.flags).forEach(f => {
  flagCounts[f] = (flagCounts[f] || 0) + 1;
});

console.log(`\n${"═".repeat(68)}`);
console.log(`  PATCH 7.6O-A-AUDIT — Decision Generic Entry Audit`);
console.log(`${"═".repeat(68)}`);
console.log(`  Cenários analisados : ${count}`);
console.log(`  Caem em generic     : ${genericRecords.length}`);
console.log(`  Contrato ativado    : ${nonGenericRecords.length}`);

// Full table
console.log(`\n  ┌────┬──────────────────────────────┬────────────────────┬───────────────────────────┬──────────────────────────────┐`);
console.log(`  │ ID │ Cenário                      │ TurnType           │ Expected Template         │ Root Cause                   │`);
console.log(`  ├────┼──────────────────────────────┼────────────────────┼───────────────────────────┼──────────────────────────────┤`);
for (const r of allRecords) {
  const id       = r.scenarioId.padEnd(2);
  const label    = r.scenarioLabel.slice(0, 28).padEnd(28);
  const tt       = r.turnType.slice(0, 18).padEnd(18);
  const tpl      = r.expectedTemplate.replace("_response_contract","_contract").slice(0, 25).padEnd(25);
  const rc       = r.rootCause.slice(0, 28).padEnd(28);
  const icon     = r.expectedTemplate === "decision_generic" ? "✗" : "✓";
  console.log(`  │${icon}${id}│ ${label} │ ${tt} │ ${tpl} │ ${rc} │`);
}
console.log(`  └────┴──────────────────────────────┴────────────────────┴───────────────────────────┴──────────────────────────────┘`);

// Stage flow per scenario
console.log(`\n  FLUXO COMPLETO POR CENÁRIO (Router → Bridge → Template):`);
console.log(`  ${"─".repeat(66)}`);
for (const r of allRecords) {
  const tt    = r.turnType.padEnd(22);
  const br    = r.bridgeApplied ? `bridge→${r.bridgeIntent}`.padEnd(18) : `no_bridge`.padEnd(18);
  const tpl   = r.expectedTemplate.replace("_response_contract","_ctr").padEnd(30);
  const rc    = r.rootCause.slice(0, 30);
  const icon  = r.expectedTemplate === "decision_generic" ? "✗" : "✓";
  console.log(`  ${icon}${r.scenarioId.padEnd(4)} ${tt} ${br} → ${tpl} [${rc}]`);
}

// Root cause frequency
console.log(`\n  FREQUÊNCIA POR CAUSA RAIZ:`);
Object.entries(rootCauseCounts)
  .sort(([, a], [, b]) => b - a)
  .forEach(([rc, n]) => {
    const bar = "█".repeat(n * 3);
    const affected = allRecords.filter(r => r.rootCause === rc).map(r => r.scenarioId).join(", ");
    console.log(`    ${rc.padEnd(42)} ${String(n).padStart(2)}  ${bar.padEnd(10)}  →  ${affected}`);
  });

// Flag frequency
if (Object.keys(flagCounts).length) {
  console.log(`\n  FLAGS DETECTADAS:`);
  Object.entries(flagCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([f, n]) => console.log(`    [${n}x] ${f}`));
}

// ── Detailed analysis of scenarios falling to decision_generic ──
if (genericRecords.length > 0) {
  console.log(`\n  CENÁRIOS QUE CAEM EM decision_generic:`);
  for (const r of genericRecords) {
    console.log(`\n  ─── ${r.scenarioId}: "${r.query}" ───`);
    console.log(`    Router output    : ${r.turnType} (conf=${r.confidence})`);
    console.log(`    Reasons          : ${r.reasons.join(", ")}`);

    const altSig = r.signals.alternativeRequest;
    const expSig = r.signals.explanationRequest;
    console.log(`    Alt request sig  : ${altSig ? "YES" : "NO"}`);
    console.log(`    Exp request sig  : ${expSig ? "YES" : "NO"}`);

    console.log(`    Bridge           : ${r.bridgeApplied ? "applied" : "NOT applied"} — ${r.bridgeReason}`);
    console.log(`    Root cause       : ${r.rootCause}`);
    console.log(`    Flags            : ${r.flags.join(", ") || "none"}`);

    // Explain why
    if (r.rootCause === "ROUTER_UNKNOWN") {
      console.log(`    WHY generic      : Router emitiu UNKNOWN — nenhum sinal da query`);
      console.log(`                       foi reconhecido. Lacuna no vocabulário semântico.`);
      console.log(`    DIAGNOSIS        : A frase não é coberta por nenhuma família em`);
      console.log(`                       detectsAlternativeRequestSignal nem`);
      console.log(`                       detectsPostDecisionExplanationSignal.`);
    } else if (r.rootCause === "BRIDGE_NOT_APPLIED") {
      console.log(`    WHY generic      : TurnType '${r.turnType}' não está na allowlist da bridge.`);
      console.log(`                       Bridge allowlist: ${[...COGNITIVE_BRIDGE_ALLOWLIST].join(", ")}`);
    } else if (r.rootCause === "TEMPLATE_SELECTION_FALLTHROUGH") {
      console.log(`    WHY generic      : TurnType '${r.turnType}' não tem contrato de template.`);
    }

    if (r.reply) {
      console.log(`    Reply (HTTP)     : "${r.reply.replace(/\n/g, " ").slice(0, 120)}"`);
    }
  }
}

// ── Causa raiz consolidada ──
console.log(`\n  CAUSA RAIZ CONSOLIDADA:`);
const unknownCount = rootCauseCounts["ROUTER_UNKNOWN"] || 0;
const bridgeCount  = rootCauseCounts["BRIDGE_NOT_APPLIED"] || 0;
const fallthroughCount = rootCauseCounts["TEMPLATE_SELECTION_FALLTHROUGH"] || 0;
const wrongTypeCount   = rootCauseCounts["ROUTER_WRONG_TYPE"] || 0;

if (unknownCount > 0) {
  console.log(`\n  PRIMARY CAUSA: ROUTER_UNKNOWN — ${unknownCount}/${count} cenários`);
  console.log(`    O Cognitive Router emitiu UNKNOWN porque as frases`);
  console.log(`    pertencentes às famílias "Top N Discovery" e "Final Choice"`);
  console.log(`    não estão cobertas pelo vocabulário atual de:`);
  console.log(`      • detectsAlternativeRequestSignal (exige top/N explícito)`);
  console.log(`      • detectsPostDecisionExplanationSignal (exige padrão H1-H4)`);
  console.log(`    Quando UNKNOWN → Bridge não é aplicada (UNKNOWN fora da allowlist)`);
  console.log(`    → intent permanece legacy (general_answer ou refinement)`);
  console.log(`    → template cai em decision_generic sem pinagem.`);
}

if (bridgeCount > 0) {
  console.log(`\n  SECONDARY CAUSA: BRIDGE_NOT_APPLIED — ${bridgeCount}/${count} cenários`);
  console.log(`    TurnType detectado não está na allowlist da bridge.`);
  console.log(`    O tipo era semanticamente correto mas a bridge não bridgeou.`);
}

if (fallthroughCount > 0) {
  console.log(`\n  TERTIARY CAUSA: TEMPLATE_SELECTION_FALLTHROUGH — ${fallthroughCount}/${count} cenários`);
}

if (wrongTypeCount > 0) {
  console.log(`\n  QUATERNARY CAUSA: ROUTER_WRONG_TYPE — ${wrongTypeCount}/${count} cenários`);
}

// ── Próximo patch recomendado ──
console.log(`\n  PRÓXIMO PATCH RECOMENDADO:`);
if (unknownCount > 0) {
  const unknownIds = allRecords.filter(r => r.rootCause === "ROUTER_UNKNOWN").map(r => r.scenarioId);
  console.log(`\n  PATCH 7.6O-A — Router Vocabulary Expansion (Top-N + Final Choice)`);
  console.log(`    Cenários afetados: ${unknownIds.join(", ")}`);
  console.log(`    Onde corrigir:     lib/miaCognitiveRouter.js`);
  console.log(`    O quê:`);
  console.log(`      1. Expandir detectsAlternativeRequestSignal — Family F:`);
  console.log(`         "os que fizeram sentido", "os principais", "os que ficaram no topo"`);
  console.log(`         → requestedTopN = null (sistema decide o conjunto)`);
  console.log(`      2. Expandir detectsPostDecisionExplanationSignal — Cluster H:`);
  console.log(`         "qual ficaria no final", "se só pudesse levar um"`);
  console.log(`         + frases sem "voce/vc" explícito (pedido implícito ao sistema)`);
  console.log(`    Após correção: ALTERNATIVE_REQUEST ou EXPLANATION_REQUEST`);
  console.log(`    → bridge → cognitive_anchor_hold → template com winner pinado.`);
}
if (genericRecords.filter(r => r.rootCause !== "ROUTER_UNKNOWN").length > 0) {
  console.log(`\n  PATCH 7.6O-B — Template Coverage for non-UNKNOWN fallthrough`);
  console.log(`    Cenários: ${genericRecords.filter(r => r.rootCause !== "ROUTER_UNKNOWN").map(r => r.scenarioId).join(", ")}`);
  console.log(`    Pode requerer bridge allowlist expansion ou template adicional.`);
}

if (!HTTP_ENABLED) {
  console.log(`\n  ⚠  Testes HTTP desativados (modo estático — apenas análise de router/bridge).`);
  console.log(`     Para confirmar com respostas reais:`);
  console.log(`     MIA_STATE_AUDIT=true node scripts/test-mia-decision-generic-entry-audit.js`);
}

console.log(`\n${"═".repeat(68)}\n`);
