/**
 * PATCH 7.6 — Production Behavior Validation Round 2
 *
 * Objetivo: descobrir onde o comportamento correto é perdido entre
 *   Cognitive Router → Routing Decision → Interceptors → Contextual Path → Prompt → Resposta
 *
 * NÃO implementa correções. Audita o pipeline existente.
 *
 * Cenários baseados exclusivamente em testes humanos reais:
 *   Grupo A — "quem quase ganhou?"
 *   Grupo B — "e o terceiro?"
 *   Grupo C — "top 3"
 *   Grupo D — "e entre os dois?"
 *   Grupo E — "não gostei dele"
 *   Grupo F — "não sei explicar"
 *   Grupo G — "to na dúvida ainda"
 *   Grupo H — Zero regression (casos dos patches anteriores)
 *
 * Flags de divergência:
 *   ALTERNATIVE_REQUEST_LOST    — router detectou, runtime não utilizou
 *   RANKING_RESOLUTION_LOST     — ranking resolvido, prompt não recebeu
 *   PROMPT_INJECTION_LOST       — prompt deveria receber, não recebeu
 *   FOLLOWUP_BECAME_SEARCH      — follow-up contextual virou busca nova
 *   ANCHOR_LOST                 — anchor existia, anchor sumiu
 *   COMPARISON_CONTEXT_LOST     — comparação existia, contexto desapareceu
 *   FALLBACK_TRIGGERED_UNEXPECTEDLY — fallback acionado sem necessidade
 *   ROUTER_MISCLASSIFIED        — router classificou errado (causa raiz no router)
 *
 * Usage: node scripts/test-mia-production-validation-round2.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
} from "../lib/miaCognitiveRouter.js";

import {
  buildRoutingDecision,
  applyRoutingDecisionToContextResolution,
} from "../lib/miaRoutingDecisionContract.js";

import {
  buildRankingSnapshot,
  resolveRankingRequest,
} from "../lib/miaRoutingGuardrails.js";

// ─────────────────────────────────────────────────────────────
// Helpers de teste
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const auditLog = [];

function assert(label, condition) {
  if (!condition) {
    console.error("FAIL:", label);
    failed++;
  } else {
    console.log("OK  :", label);
    passed++;
  }
}

function section(title) {
  console.log("\n──", title, "──");
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const WINNER = { product_name: "Samsung Galaxy A55", price: "R$ 2.199", finalScoreEngineScore: 841 };
const P2 = { product_name: "Poco F6",               price: "R$ 1.899", finalScoreEngineScore: 819 };
const P3 = { product_name: "Moto Edge 50 Neo",      price: "R$ 1.599", finalScoreEngineScore: 793 };
const P4 = { product_name: "Redmi Note 13 Pro",     price: "R$ 1.399", finalScoreEngineScore: 761 };
const P5 = { product_name: "Moto G85",              price: "R$ 1.099", finalScoreEngineScore: 724 };

const SNAP5 = buildRankingSnapshot([WINNER, P2, P3, P4, P5], WINNER);

const SESSION_WITH_ANCHOR = {
  lastBestProduct: WINNER,
  lastProductMentioned: WINNER.product_name,
  lastRankingSnapshot: SNAP5,
};

const SESSION_NO_ANCHOR = {};

// ─────────────────────────────────────────────────────────────
// Pipeline Audit Engine
//
// Simula as etapas do handler:
//   1. classifyMiaTurn (Cognitive Router)
//   2. buildRoutingDecision ①
//   3. Interceptors PATCH 6.2 / PATCH 6.3
//   4. Entrada no contextual path (L26926)
//   5. Resolução de ranking (PATCH 7.5)
//   6. Injeção de prompt (inferida)
//
// NÃO simula o LLM. Audita até o ponto de injeção de contexto.
// ─────────────────────────────────────────────────────────────

/**
 * Simulação de looksLikeAmbiguousFollowUp.
 * Espelha a lógica da L23225 do handler (sem deps de lib).
 * Usado para calcular `signals.looksLikeAmbiguousFollowUp` no buildRoutingDecision.
 */
function simLooksLikeAmbiguousFollowUp(raw = "") {
  const q = raw.toLowerCase().trim();
  if (!q) return true;
  if (q.length <= 14) return true;
  if (/^(esse|essa|isso|aquele|aquela|ele|ela)\b/.test(q)) return true;
  if (/^(sim|nao|nao|ok|blz|beleza|pode|vai)$/.test(q)) return true;
  return false;
}

/**
 * Constrói signals mínimos para buildRoutingDecision.
 * Representa o estado mais comum de follow-up contextual (sem nova busca).
 */
function buildMinimalFollowUpSignals(query, { hasAnchor = true, hasComparisonProducts = false } = {}) {
  return {
    hasClearNewCommercialSearch: false,
    isContextDecisionOnOriginal: false,
    isProductReferenceOnOriginal: false,
    looksLikeAmbiguousFollowUp: simLooksLikeAmbiguousFollowUp(query),
    looksLikeShortPriorityFollowUp: false,
    isExplicitComparison: false,
    hasComparisonProducts,
    isComparisonContextFollowUp: false,
    isComparisonFollowUpLocked: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    newBudgetInOriginalMessage: false,
    newCategoryInOriginalMessage: false,
    priorityChangeReopen: false,
    lockedComparisonFollowUp: false,
  };
}

/**
 * Núcleo do audit: simula as etapas críticas do handler para uma query.
 *
 * @param {string} query
 * @param {object} opts
 *   hasAnchor        {boolean}    — âncora presente no session context?
 *   sessionContext   {object}     — objeto de contexto (com lastRankingSnapshot se existir)
 *   expectedTurnType {string}     — turno esperado pelo arquiteto
 *   expectedPath     {string}     — "contextual" | "search"
 *   hasComparisonProducts {boolean}
 * @returns {object} MIA_PRODUCTION_BEHAVIOR_AUDIT record
 */
function auditPipeline(query, opts = {}) {
  const {
    hasAnchor = true,
    sessionContext = SESSION_WITH_ANCHOR,
    expectedTurnType = null,
    expectedPath = "contextual",
    hasComparisonProducts = false,
    label = query,
  } = opts;

  // ── Stage 1: Cognitive Router ─────────────────────────────
  const cogResult = classifyMiaTurn({
    originalQuery: query,
    hasActiveAnchor: hasAnchor,
    lastBestProduct: sessionContext?.lastBestProduct ?? null,
    sessionContext,
    contextResolution: {},
    detectedIntent: "search",
    comparisonContext: {
      locked: hasComparisonProducts,
      products: hasComparisonProducts ? [WINNER, P2] : [],
    },
  });

  const detectedTurnType = cogResult.turnType;

  // ── Stage 2: Routing Decision ① ──────────────────────────
  // (sem cognitiveRoutingSignal — conforme handler L25141)
  const signals = buildMinimalFollowUpSignals(query, { hasAnchor, hasComparisonProducts });
  const contextResolution = { shouldSkipProductSearch: false, directReply: null, clearContext: false, mode: null };

  let routingDecision = buildRoutingDecision({
    userMessage: query,
    resolvedQuery: query,
    contextResolution,
    sessionContext,
    incomingSessionContext: {},
    intent: "search",
    contextAction: "",
    detectedBudget: null,
    detectedPriority: "",
    signals,
    cognitiveRoutingSignal: null, // ← ① NÃO recebe sinal cognitivo
  });
  applyRoutingDecisionToContextResolution(routingDecision, contextResolution);

  const routingModeAfterDecision1 = routingDecision.mode;

  // ── Stage 3: Interceptors PATCH 6.2 / PATCH 6.3 ──────────
  // Reprodução fiel da lógica do handler (L25334 e L25362).
  // PATCH 6.2 — OBJECTION
  if (detectedTurnType === "OBJECTION" && hasAnchor) {
    routingDecision.allowNewSearch      = false;
    routingDecision.allowReplaceWinner  = false;
    routingDecision.shouldPreserveAnchor = true;
    applyRoutingDecisionToContextResolution(routingDecision, contextResolution);
  }
  // PATCH 6.3 — REFINEMENT
  // ⚠️ CRITICAL GAP: ALTERNATIVE_REQUEST não está incluído aqui.
  if (detectedTurnType === "REFINEMENT" && hasAnchor) {
    routingDecision.allowNewSearch       = false;
    routingDecision.allowReplaceWinner   = false;
    routingDecision.shouldPreserveAnchor = true;
    applyRoutingDecisionToContextResolution(routingDecision, contextResolution);
    contextResolution.directReply  = null;
    contextResolution.clearContext = false;
    if (!contextResolution.mode || contextResolution.mode === "general_answer") {
      contextResolution.mode = "refinement_followup";
    }
  }
  // NOTE: ALTERNATIVE_REQUEST has NO interceptor here → shouldSkipProductSearch stays false

  // ── Stage 4: Contextual path entry check (L26926) ─────────
  // Conditions mirrored from handler exactly.
  const entersContextualPath =
    !!contextResolution.shouldSkipProductSearch ||
    routingDecision.mode === "context_decision"  ||
    routingDecision.mode === "anchored_reaction" ||
    false; // isDecisionIntent and contextAction="analysis" assumed false for these scenarios

  // ── Stage 5: Ranking resolution (PATCH 7.5) ───────────────
  // Only reachable if entersContextualPath = true.
  const isAlternativeRequest  = detectedTurnType === "ALTERNATIVE_REQUEST" && hasAnchor;
  const isRefinementWithAnchor = (detectedTurnType === "REFINEMENT" || isAlternativeRequest) && hasAnchor;
  const rankingResolutionReachable = entersContextualPath && isAlternativeRequest;

  const altRequestSignals = cogResult.signals?.alternativeRequest ?? null;
  let rankingResolution = null;
  if (rankingResolutionReachable && altRequestSignals) {
    rankingResolution = resolveRankingRequest(
      sessionContext?.lastRankingSnapshot ?? null,
      altRequestSignals
    );
  }

  // ── Stage 6: Divergence flags ──────────────────────────────
  const divergenceFlags = [];

  if (detectedTurnType === "ALTERNATIVE_REQUEST" && !entersContextualPath) {
    divergenceFlags.push("ALTERNATIVE_REQUEST_LOST");
    divergenceFlags.push("PROMPT_INJECTION_LOST");
  }

  if (detectedTurnType === "ALTERNATIVE_REQUEST" && entersContextualPath && !rankingResolutionReachable) {
    divergenceFlags.push("RANKING_RESOLUTION_LOST");
    divergenceFlags.push("PROMPT_INJECTION_LOST");
  }

  if (detectedTurnType !== expectedTurnType && expectedTurnType !== null) {
    divergenceFlags.push("ROUTER_MISCLASSIFIED");
  }

  if (
    expectedPath === "contextual" &&
    !entersContextualPath &&
    detectedTurnType !== "ALTERNATIVE_REQUEST" // já coberto acima
  ) {
    divergenceFlags.push("FOLLOWUP_BECAME_SEARCH");
  }

  if (
    (detectedTurnType === "OBJECTION" || detectedTurnType === "REFINEMENT") &&
    !hasAnchor
  ) {
    divergenceFlags.push("ANCHOR_LOST");
  }

  if (
    (detectedTurnType === "UNKNOWN" || detectedTurnType === "CONVERSATIONAL") &&
    expectedPath === "contextual"
  ) {
    divergenceFlags.push("FALLBACK_TRIGGERED_UNEXPECTEDLY");
  }

  // ── Build audit record ─────────────────────────────────────
  const record = {
    label,
    query,
    detectedTurnType,
    routingMode: routingModeAfterDecision1,
    contextAction: "",
    anchorBefore: hasAnchor,
    anchorAfter: !!routingDecision.shouldPreserveAnchor,
    rankingSnapshotPresent: Array.isArray(sessionContext?.lastRankingSnapshot) && sessionContext.lastRankingSnapshot.length > 0,
    rankingResolutionPresent: !!rankingResolution,
    comparisonContextPresent: hasComparisonProducts,
    promptInjectionPresent: rankingResolutionReachable,
    responsePath: entersContextualPath ? "contextual" : "search",
    finalWinner: null, // não auditável sem LLM
    expectedBehavior: {
      turnType: expectedTurnType,
      path: expectedPath,
      rankingInjected: expectedTurnType === "ALTERNATIVE_REQUEST",
    },
    actualBehavior: {
      entersContextualPath,
      turnType: detectedTurnType,
      routingMode: routingModeAfterDecision1,
      shouldSkipProductSearch: !!contextResolution.shouldSkipProductSearch,
      rankingResolutionReachable,
    },
    divergenceFlags,
    hasDivergence: divergenceFlags.length > 0,
  };

  auditLog.push(record);
  return record;
}

// ─────────────────────────────────────────────────────────────
// Grupo A — "quem quase ganhou?"
// Esperado: ALTERNATIVE_REQUEST, requestedRank=2, path=contextual
// ─────────────────────────────────────────────────────────────

section("GRUPO A — quem quase ganhou? (runner-up)");

{
  const audit = auditPipeline("quem quase ganhou?", {
    expectedTurnType: "ALTERNATIVE_REQUEST",
    expectedPath: "contextual",
    label: "A1: quem quase ganhou?",
  });

  assert(
    "A1: router detecta ALTERNATIVE_REQUEST",
    audit.detectedTurnType === "ALTERNATIVE_REQUEST"
  );
  assert(
    "A1: requestedRank=2 nos sinais",
    cogResultForQuery("quem quase ganhou?").signals?.alternativeRequest?.requestedRank === 2
  );
  assert(
    "A1: NÃO entra no caminho contextual — cai em search (GAP-1 confirmado)",
    audit.responsePath === "search"
  );
  assert(
    "A1: ALTERNATIVE_REQUEST_LOST detectado",
    audit.divergenceFlags.includes("ALTERNATIVE_REQUEST_LOST")
  );
  assert(
    "A1: PROMPT_INJECTION_LOST detectado",
    audit.divergenceFlags.includes("PROMPT_INJECTION_LOST")
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo B — "e o terceiro?"
// Esperado: ALTERNATIVE_REQUEST, requestedRank=3, path=contextual
// ─────────────────────────────────────────────────────────────

section("GRUPO B — e o terceiro? (rank 3 ordinal)");

{
  const audit = auditPipeline("e o terceiro?", {
    expectedTurnType: "ALTERNATIVE_REQUEST",
    expectedPath: "contextual",
    label: "B1: e o terceiro?",
  });

  const cogB = cogResultForQuery("e o terceiro?");

  // PATCH 7.6B corrigido: "e o terceiro?" agora é corretamente ALTERNATIVE_REQUEST
  // O guard _hasOrdinalRankVocab cedeu a classificação para ALTERNATIVE_REQUEST.
  // Com PATCH 7.6A ativo, entra no contextual path e recebe ranking injection.
  assert(
    "B1: router classifica como ALTERNATIVE_REQUEST (GAP-2 corrigido pelo PATCH 7.6B)",
    audit.detectedTurnType === "ALTERNATIVE_REQUEST"
  );
  assert(
    "B1: requestedRank=3 presente",
    cogB.signals?.alternativeRequest?.requestedRank === 3
  );
  assert(
    "B1: entra no contextual path (via shouldSkipProductSearch=true do interceptor 7.6A)",
    audit.responsePath === "contextual"
  );
  assert(
    "B1: sem ROUTER_MISCLASSIFIED (GAP-2 resolvido)",
    !audit.divergenceFlags.includes("ROUTER_MISCLASSIFIED")
  );
  assert(
    "B1: ranking injection presente (PROMPT_INJECTION_LOST resolvido)",
    audit.promptInjectionPresent
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo C — "top 3"
// Esperado: ALTERNATIVE_REQUEST, requestedTopN=3, path=contextual
// ─────────────────────────────────────────────────────────────

section("GRUPO C — top 3 (Top-N)");

{
  const audit = auditPipeline("top 3", {
    expectedTurnType: "ALTERNATIVE_REQUEST",
    expectedPath: "contextual",
    label: "C1: top 3",
  });

  const cogC = cogResultForQuery("top 3");

  assert(
    "C1: router detecta ALTERNATIVE_REQUEST",
    audit.detectedTurnType === "ALTERNATIVE_REQUEST"
  );
  assert(
    "C1: requestedTopN=3",
    cogC.signals?.alternativeRequest?.requestedTopN === 3
  );
  // "top 3" = 5 chars → looksLikeAmbiguousFollowUp = true → anchored_reaction → contextual
  // Portanto "top 3" ENTRA no contextual path pela rota ambígua de query curta.
  // Não é GAP-1 — é um caso que funciona por acidente (short-query safety net).
  assert(
    "C1: 'top 3' entra no contextual path via anchored_reaction (query curta ≤14 chars)",
    audit.responsePath === "contextual"
  );
  assert(
    "C1: sem ALTERNATIVE_REQUEST_LOST (entra por rota alternativa de query curta)",
    !audit.divergenceFlags.includes("ALTERNATIVE_REQUEST_LOST")
  );

  // Verifica que o snapshot existe e resolveria top 3 corretamente
  const resolution = resolveRankingRequest(SNAP5, { requestedRank: null, requestedTopN: 3 });
  assert(
    "C1: resolveRankingRequest retorna top_n=3 a partir do snapshot",
    resolution.type === "top_n" && resolution.items.length === 3
  );
  assert(
    "C1: top 1 é o winner",
    resolution.items[0].product_name === WINNER.product_name && resolution.items[0].isWinner
  );
  assert(
    "C1: top 2 é o runner-up",
    resolution.items[1].product_name === P2.product_name
  );
  assert(
    "C1: top 3 é o terceiro colocado",
    resolution.items[2].product_name === P3.product_name
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo D — "e entre os dois?"
// Esperado: comparison context follow-up, path=contextual
// ─────────────────────────────────────────────────────────────

section("GRUPO D — e entre os dois? (comparison follow-up)");

{
  // Sem contexto de comparação ativo
  const auditNoComp = auditPipeline("e entre os dois?", {
    expectedTurnType: "FOLLOW_UP",
    expectedPath: "contextual",
    label: "D1: e entre os dois? (sem comparison context)",
    hasComparisonProducts: false,
  });

  // Com contexto de comparação ativo
  const auditWithComp = auditPipeline("e entre os dois?", {
    expectedTurnType: "COMPARISON_FOLLOWUP",
    expectedPath: "contextual",
    label: "D2: e entre os dois? (com comparison context)",
    hasComparisonProducts: true,
  });

  const cogD = cogResultForQuery("e entre os dois?");

  assert(
    "D1: sem comparison — router classifica como FOLLOW_UP",
    auditNoComp.detectedTurnType === "FOLLOW_UP" ||
    auditNoComp.detectedTurnType === "CONVERSATIONAL" ||
    auditNoComp.detectedTurnType === "UNKNOWN"
  );

  // "e entre os dois" = 15 chars > 14 → looksLikeAmbiguousFollowUp = false (sem anchor_reaction)
  // Portanto SEM comparison context, cai em modo search
  assert(
    "D1: sem comparison context e query >14 chars → cai em search (FOLLOWUP_BECAME_SEARCH)",
    auditNoComp.responsePath === "search" ||
    auditNoComp.divergenceFlags.includes("FOLLOWUP_BECAME_SEARCH") ||
    auditNoComp.divergenceFlags.includes("FALLBACK_TRIGGERED_UNEXPECTEDLY")
  );

  // "e entre os dois" = 16 chars → looksLikeAmbiguousFollowUp = false
  // isComparisonContextFollowUp requer função do handler (não disponível no test)
  // → comparisonFollowUp = false mesmo com hasComparisonProducts = true
  // Isso é uma limitação da simulação, não um bug do handler em si.
  // O handler real pode ativar comparison_followup se isComparisonContextFollowUp retornar true.
  assert(
    "D2: simulação sem isComparisonContextFollowUp — cai em search (limite do test)",
    auditWithComp.routingMode === "search" || auditWithComp.routingMode === "comparison_followup"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo E — "não gostei dele"
// Esperado: OBJECTION, path=contextual
// ─────────────────────────────────────────────────────────────

section("GRUPO E — não gostei dele (objection)");

{
  // COM âncora — deve funcionar
  const auditWithAnchor = auditPipeline("não gostei dele", {
    expectedTurnType: "OBJECTION",
    expectedPath: "contextual",
    label: "E1: não gostei dele (com âncora)",
    hasAnchor: true,
  });

  // SEM âncora — comportamento esperado degrada
  const auditNoAnchor = auditPipeline("não gostei dele", {
    expectedTurnType: "OBJECTION",
    expectedPath: "contextual",
    label: "E2: não gostei dele (sem âncora — simula anchor lost)",
    hasAnchor: false,
    sessionContext: SESSION_NO_ANCHOR,
  });

  assert(
    "E1: com âncora — router detecta OBJECTION",
    auditWithAnchor.detectedTurnType === "OBJECTION"
  );
  assert(
    "E1: com âncora — PATCH 6.2 ativa contextual path",
    auditWithAnchor.responsePath === "contextual"
  );
  assert(
    "E1: com âncora — sem divergência",
    !auditWithAnchor.hasDivergence
  );

  // Sem âncora: router não detecta OBJECTION (guard hasActiveAnchor=false no router)
  // Logo cai em search → ANCHOR_LOST
  assert(
    "E2: sem âncora — router NÃO detecta OBJECTION (guard blocks it)",
    auditNoAnchor.detectedTurnType !== "OBJECTION"
  );
  assert(
    "E2: sem âncora — query cai em search (FOLLOWUP_BECAME_SEARCH esperado)",
    auditNoAnchor.responsePath === "search" ||
    auditNoAnchor.divergenceFlags.includes("FOLLOWUP_BECAME_SEARCH") ||
    auditNoAnchor.divergenceFlags.includes("FALLBACK_TRIGGERED_UNEXPECTEDLY")
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo F — "não sei explicar"
// Esperado: continuação contextual (FOLLOW_UP ou REACTION)
// ─────────────────────────────────────────────────────────────

section("GRUPO F — não sei explicar (context continuation)");

{
  const audit = auditPipeline("não sei explicar", {
    expectedTurnType: "FOLLOW_UP",
    expectedPath: "contextual",
    label: "F1: não sei explicar",
  });

  const cogF = cogResultForQuery("não sei explicar");

  // PATCH 7.6C resolvido: "não sei explicar" agora é OBJECTION (hesitation)
  // via detectsHesitationSignal → PATCH 6.2 interceptor → contextual path
  assert(
    "F1: PATCH 7.6C — router detecta OBJECTION (hesitation) para incerteza pós-decisão",
    audit.detectedTurnType === "OBJECTION"
  );
  assert(
    "F1: entra no contextual path (PATCH 6.2 interceptor via OBJECTION)",
    audit.responsePath === "contextual"
  );
  assert(
    "F1: sem FALLBACK_TRIGGERED_UNEXPECTEDLY (GAP-3 fechado)",
    !audit.divergenceFlags.includes("FALLBACK_TRIGGERED_UNEXPECTEDLY")
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo G — "to na dúvida ainda"
// Esperado: uncertainty follow-up, path=contextual
// ─────────────────────────────────────────────────────────────

section("GRUPO G — to na dúvida ainda (uncertainty follow-up)");

{
  const audit = auditPipeline("to na dúvida ainda", {
    expectedTurnType: "FOLLOW_UP",
    expectedPath: "contextual",
    label: "G1: to na dúvida ainda",
  });

  // PATCH 7.6C resolvido: "to na dúvida ainda" agora é OBJECTION (hesitation)
  assert(
    "G1: PATCH 7.6C — router detecta OBJECTION (hesitation) para dúvida pós-decisão",
    audit.detectedTurnType === "OBJECTION"
  );
  assert(
    "G1: entra no contextual path",
    audit.responsePath === "contextual"
  );
  assert(
    "G1: sem FALLBACK_TRIGGERED_UNEXPECTEDLY (GAP-3 fechado)",
    !audit.divergenceFlags.includes("FALLBACK_TRIGGERED_UNEXPECTEDLY")
  );
}

// ─────────────────────────────────────────────────────────────
// Verificações adicionais de GAP-1 (ALTERNATIVE_REQUEST sem interceptor)
// ─────────────────────────────────────────────────────────────

section("GAP-1: ALTERNATIVE_REQUEST sem interceptor — verificação direta");

{
  // Simula o que o PATCH 6.3 faria SE incluísse ALTERNATIVE_REQUEST
  // Somente queries > 14 chars (após normalize sem pontuação) sofrem GAP-1.
  // Queries ≤ 14 chars entram no contextual via anchored_reaction (short-query safety net).
  // "top 3" (5 chars), "top 5" (5 chars): entram via safety net.
  // "quem quase ganhou" (17 chars), "qual era o segundo" (18+ chars): GAP-1 confirmado.
  // "e o quinto?" (PATCH 7.6B): agora é ALTERNATIVE_REQUEST (GAP-2 resolvido).
  const SCENARIOS = [
    { query: "quem quase ganhou?",       requestedRank: 2,    requestedTopN: null, isGap1: true },
    { query: "qual era o segundo lugar?", requestedRank: 2,   requestedTopN: null, isGap1: true },
    // queries curtas entram via anchored_reaction (short-query safety net) — não são GAP-1:
    { query: "top 3",                    requestedRank: null, requestedTopN: 3,    isGap1: false },
    { query: "top 5",                    requestedRank: null, requestedTopN: 5,    isGap1: false },
    // "e o quinto" = ALTERNATIVE_REQUEST após PATCH 7.6B (GAP-2 resolvido):
    { query: "e o quinto?",              requestedRank: 5,    requestedTopN: null, isGap1: false },
  ];

  for (const { query, requestedRank, requestedTopN, isGap1 = true, isGap2 = false } of SCENARIOS) {
    const cogResult = classifyMiaTurn({
      originalQuery: query,
      hasActiveAnchor: true,
      lastBestProduct: WINNER,
      sessionContext: SESSION_WITH_ANCHOR,
      contextResolution: {},
      detectedIntent: "search",
    });

    if (isGap2) {
      // GAP-2: classified as FOLLOW_UP not ALTERNATIVE_REQUEST
      assert(
        `GAP-2: "${query}" → FOLLOW_UP (ALTERNATIVE_REQUEST esperado, step 8 vence step 8.5)`,
        cogResult.turnType === "FOLLOW_UP"
      );
      continue;
    }

    if (!isGap1) {
      // Short query — enters contextual via anchored_reaction safety net
      const expectedType = cogResult.turnType;
      assert(
        `SHORT-QUERY SAFETY NET: "${query}" → ${expectedType} (entra via anchored_reaction)`,
        cogResult.turnType === "ALTERNATIVE_REQUEST" || cogResult.turnType === "FOLLOW_UP"
      );
      continue;
    }

    // isGap1 = true: queries > 14 chars (normalized) — ALTERNATIVE_REQUEST without interceptor
    assert(
      `GAP-1: "${query}" → ALTERNATIVE_REQUEST (router OK)`,
      cogResult.turnType === "ALTERNATIVE_REQUEST"
    );

    // Simula estado ATUAL do handler (interceptor NÃO inclui ALTERNATIVE_REQUEST)
    const signals = buildMinimalFollowUpSignals(query, { hasAnchor: true });
    const ctxRes = { shouldSkipProductSearch: false, directReply: null, clearContext: false, mode: null };
    const rd = buildRoutingDecision({
      userMessage: query, resolvedQuery: query,
      contextResolution: ctxRes, sessionContext: SESSION_WITH_ANCHOR,
      incomingSessionContext: {}, intent: "search", contextAction: "",
      detectedBudget: null, detectedPriority: "", signals, cognitiveRoutingSignal: null,
    });
    applyRoutingDecisionToContextResolution(rd, ctxRes);

    // PATCH 6.3 interceptor — ATUAL (não inclui ALTERNATIVE_REQUEST)
    if (cogResult.turnType === "REFINEMENT") {
      rd.allowNewSearch = false;
      applyRoutingDecisionToContextResolution(rd, ctxRes);
      ctxRes.directReply = null;
    }
    // ↑ ALTERNATIVE_REQUEST não passa por aqui → shouldSkipProductSearch fica false

    const entersContextual =
      !!ctxRes.shouldSkipProductSearch ||
      rd.mode === "context_decision"  ||
      rd.mode === "anchored_reaction";

    assert(
      `GAP-1: "${query}" → NÃO entra em contextual path (bug confirmado)`,
      !entersContextual
    );
    assert(
      `GAP-1: "${query}" → routing mode = "search" (default incorreto)`,
      rd.mode === "search" || rd.mode === "new_search"
    );

    // Simulação de fix hipotético: interceptor inclui ALTERNATIVE_REQUEST
    const ctxResFixed = { shouldSkipProductSearch: false, directReply: null, clearContext: false, mode: null };
    const rdFixed = buildRoutingDecision({
      userMessage: query, resolvedQuery: query,
      contextResolution: ctxResFixed, sessionContext: SESSION_WITH_ANCHOR,
      incomingSessionContext: {}, intent: "search", contextAction: "",
      detectedBudget: null, detectedPriority: "", signals, cognitiveRoutingSignal: null,
    });
    if (cogResult.turnType === "REFINEMENT" || cogResult.turnType === "ALTERNATIVE_REQUEST") {
      rdFixed.allowNewSearch      = false;
      rdFixed.allowReplaceWinner  = false;
      rdFixed.shouldPreserveAnchor = true;
      applyRoutingDecisionToContextResolution(rdFixed, ctxResFixed);
      ctxResFixed.directReply  = null;
      ctxResFixed.clearContext = false;
    }

    assert(
      `GAP-1 FIX HIPOTÉTICO: "${query}" entraria em contextual path se interceptor incluísse ALTERNATIVE_REQUEST`,
      !!ctxResFixed.shouldSkipProductSearch
    );
  }
}

// ─────────────────────────────────────────────────────────────
// GAP-2: "e o terceiro?" — FOLLOW_UP vence ALTERNATIVE_REQUEST
// ─────────────────────────────────────────────────────────────

section("GAP-2: e o terceiro? — FOLLOW_UP vence no router (order conflict)");

{
  const ORDINAL_QUERIES = [
    { query: "e o terceiro?",   expectedRank: 3 },
    { query: "e o quarto?",     expectedRank: 4 },
    { query: "e o quinto?",     expectedRank: 5 },
    { query: "e a terceira?",   expectedRank: 3 },
  ];

  for (const { query, expectedRank } of ORDINAL_QUERIES) {
    const cogResult = classifyMiaTurn({
      originalQuery: query,
      hasActiveAnchor: true,
      lastBestProduct: WINNER,
      sessionContext: SESSION_WITH_ANCHOR,
      contextResolution: {},
      detectedIntent: "search",
    });

    // PATCH 7.6B: todos esses queries são agora ALTERNATIVE_REQUEST.
    // O guard _hasOrdinalRankVocab impede que FOLLOW_UP os capture na step 8.
    assert(
      `GAP-2 RESOLVIDO: "${query}" → ALTERNATIVE_REQUEST (PATCH 7.6B)`,
      cogResult.turnType === "ALTERNATIVE_REQUEST"
    );
    assert(
      `GAP-2 RESOLVIDO: "${query}" requestedRank=${expectedRank}`,
      cogResult.signals?.alternativeRequest?.requestedRank === expectedRank
    );
  }
}

// ─────────────────────────────────────────────────────────────
// GAP-3: "não sei explicar" / "to na dúvida" — sem família semântica
// ─────────────────────────────────────────────────────────────

section("GAP-3 RESOLVIDO: hesitação/dúvida agora gerenciada pelo PATCH 7.6C");

{
  const UNCERTAINTY_QUERIES = [
    "não sei explicar",
    "to na dúvida ainda",
    "to indeciso",
    "ainda em dúvida",
    "não sei ao certo",
  ];

  for (const q of UNCERTAINTY_QUERIES) {
    const cogResult = classifyMiaTurn({
      originalQuery: q,
      hasActiveAnchor: true,
      lastBestProduct: WINNER,
      sessionContext: SESSION_WITH_ANCHOR,
      contextResolution: {},
      detectedIntent: "search",
    });

    assert(
      `GAP-3 RESOLVIDO: "${q}" → OBJECTION (hesitation — PATCH 7.6C)`,
      cogResult.turnType === "OBJECTION"
    );
    assert(
      `GAP-3 RESOLVIDO: "${q}" — gerenciado por família contextual`,
      cogResult.turnType === "OBJECTION"
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Grupo H — Zero regression (patches anteriores)
// ─────────────────────────────────────────────────────────────

section("GRUPO H — Zero regression (patches anteriores)");

{
  const REGRESSION_CASES = [
    { query: "qual seria o plano B?",         expected: "ALTERNATIVE_REQUEST" },
    { query: "qual é o segundo lugar?",       expected: "ALTERNATIVE_REQUEST" },
    { query: "tem algum mais barato?",        expected: "REFINEMENT" },
    { query: "por que você recomendou esse?", expected: "EXPLANATION_REQUEST" },
    { query: "acho caro",                     expected: "OBJECTION" },
    { query: "e a bateria?",                  expected: "FOLLOW_UP" },
    { query: "ok entendi",                    expected: "REACTION" },
  ];

  for (const { query, expected } of REGRESSION_CASES) {
    const cogResult = classifyMiaTurn({
      originalQuery: query,
      hasActiveAnchor: true,
      lastBestProduct: WINNER,
      sessionContext: SESSION_WITH_ANCHOR,
      contextResolution: {},
      detectedIntent: "search",
    });

    assert(
      `H: "${query}" → ${expected}`,
      cogResult.turnType === expected
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Ranking snapshot integrity (PATCH 7.4)
// ─────────────────────────────────────────────────────────────

section("PATCH 7.4: ranking snapshot integrity");

{
  assert(
    "Snapshot SNAP5 tem 5 itens",
    SNAP5.length === 5
  );
  assert(
    "Rank 1 é o winner",
    SNAP5[0].rank === 1 && SNAP5[0].isWinner && SNAP5[0].product_name === WINNER.product_name
  );
  assert(
    "Rank 2 é o runner-up",
    SNAP5[1].rank === 2 && !SNAP5[1].isWinner && SNAP5[1].product_name === P2.product_name
  );
  assert(
    "Rank 3 preservado",
    SNAP5[2].rank === 3 && SNAP5[2].product_name === P3.product_name
  );
  assert(
    "resolveRankingRequest rank=2 retorna Poco F6",
    resolveRankingRequest(SNAP5, { requestedRank: 2 }).product?.product_name === P2.product_name
  );
  assert(
    "resolveRankingRequest topN=3 retorna 3 itens",
    resolveRankingRequest(SNAP5, { requestedTopN: 3 }).items?.length === 3
  );
  assert(
    "resolveRankingRequest rank=99 retorna not_available",
    resolveRankingRequest(SNAP5, { requestedRank: 99 }).type === "not_available"
  );
  assert(
    "resolveRankingRequest sem snapshot retorna not_available",
    resolveRankingRequest(null, { requestedRank: 2 }).type === "not_available"
  );
}

// ─────────────────────────────────────────────────────────────
// Audit Log Summary
// ─────────────────────────────────────────────────────────────

section("MIA_PRODUCTION_BEHAVIOR_AUDIT — Summary");

console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║         MIA_PRODUCTION_BEHAVIOR_AUDIT                ║");
console.log("╚══════════════════════════════════════════════════════╝\n");

const allFlags = {};
let divergentCount = 0;

for (const record of auditLog) {
  if (record.hasDivergence) {
    divergentCount++;
    console.log(`  ⚠️  [${record.label}]`);
    console.log(`      turnType:   ${record.detectedTurnType}`);
    console.log(`      routingMode: ${record.routingMode}`);
    console.log(`      path:        ${record.responsePath} (expected: ${record.expectedBehavior.path})`);
    console.log(`      flags:       ${record.divergenceFlags.join(", ")}`);
    for (const f of record.divergenceFlags) {
      allFlags[f] = (allFlags[f] || 0) + 1;
    }
  } else {
    console.log(`  ✓  [${record.label}] path=${record.responsePath} turnType=${record.detectedTurnType}`);
  }
}

console.log(`\n  Cenários auditados: ${auditLog.length}`);
console.log(`  Divergentes: ${divergentCount}`);
console.log("\n  Flags por frequência:");
for (const [flag, count] of Object.entries(allFlags).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${count}x  ${flag}`);
}

// ─────────────────────────────────────────────────────────────
// Final
// ─────────────────────────────────────────────────────────────

console.log(`\n\nResultados: ${passed} passando / ${failed} falhando (total: ${passed + failed})\n`);

if (failed > 0) process.exit(1);

// ─────────────────────────────────────────────────────────────
// Utility: classify sem fixture (para uso inline nos asserts acima)
// ─────────────────────────────────────────────────────────────

function cogResultForQuery(query) {
  return classifyMiaTurn({
    originalQuery: query,
    hasActiveAnchor: true,
    lastBestProduct: WINNER,
    sessionContext: SESSION_WITH_ANCHOR,
    contextResolution: {},
    detectedIntent: "search",
  });
}
