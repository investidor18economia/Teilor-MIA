/**
 * PATCH 7.6A — Alternative Request Contextual Interceptor
 *
 * Verifica que ALTERNATIVE_REQUEST com âncora ativa entra no contextual path.
 *
 * Causa raiz corrigida:
 *   O PATCH 6.3 interceptava apenas REFINEMENT. PATCH 7.5 criou ALTERNATIVE_REQUEST
 *   como turn type independente, mas o interceptor não foi atualizado.
 *   Queries com > 14 chars (ex: "quem quase ganhou?") caíam em mode=search.
 *
 * Correção (PATCH 7.6A):
 *   O interceptor PATCH 6.3 passa a incluir ALTERNATIVE_REQUEST:
 *     (turnType === "REFINEMENT" || turnType === "ALTERNATIVE_REQUEST")
 *
 * Grupos:
 *   1 — Caso principal: "quem quase ganhou?" com âncora
 *   2 — Casos equivalentes (outras formulações > 14 chars)
 *   3 — Guardrails: sem âncora não força contextual
 *   4 — Regressões: REFINEMENT, OBJECTION, EXPLANATION_REQUEST, FOLLOW_UP
 *   5 — Ranking resolution após entrada no contextual path
 *   6 — Confirmação que ALTERNATIVE_REQUEST_LOST não ocorre
 *
 * Usage: node scripts/test-mia-alternative-contextual-interceptor.js
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
// Helpers
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

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
const P2     = { product_name: "Poco F6",            price: "R$ 1.899", finalScoreEngineScore: 819 };
const P3     = { product_name: "Moto Edge 50 Neo",   price: "R$ 1.599", finalScoreEngineScore: 793 };
const P4     = { product_name: "Redmi Note 13 Pro",  price: "R$ 1.399", finalScoreEngineScore: 761 };
const P5     = { product_name: "Moto G85",           price: "R$ 1.099", finalScoreEngineScore: 724 };

const SNAP5 = buildRankingSnapshot([WINNER, P2, P3, P4, P5], WINNER);

const SESSION_WITH_ANCHOR = {
  lastBestProduct: WINNER,
  lastProductMentioned: WINNER.product_name,
  lastRankingSnapshot: SNAP5,
};

// ─────────────────────────────────────────────────────────────
// Core simulation: mirrors the interceptor logic from the handler.
//
// Reproduces EXACTLY the PATCH 6.3 / PATCH 7.6A interceptor block
// (pages/api/chat-gpt4o.js, ~L25347) so we can verify its behavior
// without running the full HTTP handler.
// ─────────────────────────────────────────────────────────────

function simLooksLikeAmbiguousFollowUp(raw = "") {
  const q = raw.toLowerCase().trim();
  if (!q || q.length <= 14) return true;
  if (/^(esse|essa|isso|aquele|aquela|ele|ela)\b/.test(q)) return true;
  if (/^(sim|nao|ok|blz|beleza|pode|vai)$/.test(q)) return true;
  return false;
}

/**
 * Simulates the full interceptor pipeline for a given query.
 *
 * Returns the state of routingDecision and contextResolution AFTER
 * the interceptor block, so we can assert on shouldSkipProductSearch,
 * allowNewSearch, and the final routing mode.
 */
function simulateInterceptorPipeline(query, {
  hasAnchor = true,
  sessionContext = SESSION_WITH_ANCHOR,
  earlyClearNewCommercialSearch = false,
} = {}) {
  // Step 1: Cognitive Router
  const cogResult = classifyMiaTurn({
    originalQuery: query,
    hasActiveAnchor: hasAnchor,
    lastBestProduct: sessionContext?.lastBestProduct ?? null,
    sessionContext,
    contextResolution: {},
    detectedIntent: "search",
  });

  // Step 2: buildRoutingDecision (without cognitiveRoutingSignal — mirrors handler ①)
  const signals = {
    hasClearNewCommercialSearch: earlyClearNewCommercialSearch,
    isContextDecisionOnOriginal: false,
    isProductReferenceOnOriginal: false,
    looksLikeAmbiguousFollowUp: simLooksLikeAmbiguousFollowUp(query),
    looksLikeShortPriorityFollowUp: false,
    isExplicitComparison: false,
    hasComparisonProducts: false,
    isComparisonContextFollowUp: false,
    isComparisonFollowUpLocked: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    newBudgetInOriginalMessage: false,
    newCategoryInOriginalMessage: false,
    priorityChangeReopen: false,
    lockedComparisonFollowUp: false,
  };

  const contextResolution = {
    shouldSkipProductSearch: false,
    directReply: null,
    clearContext: false,
    mode: null,
  };

  const routingDecision = buildRoutingDecision({
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
    cognitiveRoutingSignal: null,
  });
  applyRoutingDecisionToContextResolution(routingDecision, contextResolution);

  const routingModeBeforeInterceptor = routingDecision.mode;

  // Step 3: PATCH 6.2 — OBJECTION interceptor
  if (cogResult.turnType === "OBJECTION" && hasAnchor && !earlyClearNewCommercialSearch) {
    routingDecision.allowNewSearch      = false;
    routingDecision.allowReplaceWinner  = false;
    routingDecision.shouldPreserveAnchor = true;
    applyRoutingDecisionToContextResolution(routingDecision, contextResolution);
  }

  // Step 4: PATCH 6.3 + PATCH 7.6A — REFINEMENT / ALTERNATIVE_REQUEST interceptor
  if (
    (cogResult.turnType === "REFINEMENT" ||
     cogResult.turnType === "ALTERNATIVE_REQUEST") &&
    hasAnchor &&
    !earlyClearNewCommercialSearch
  ) {
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

  // Step 5: Contextual path entry check (mirrors handler L26926)
  const entersContextualPath =
    !!contextResolution.shouldSkipProductSearch ||
    routingDecision.mode === "context_decision"  ||
    routingDecision.mode === "anchored_reaction";

  // Step 6: Ranking resolution (PATCH 7.5 — only reachable from contextual path)
  const isAlternativeRequest = cogResult.turnType === "ALTERNATIVE_REQUEST" && hasAnchor;
  const altRequestSignals = cogResult.signals?.alternativeRequest ?? null;
  let rankingResolution = null;
  if (entersContextualPath && isAlternativeRequest && altRequestSignals) {
    rankingResolution = resolveRankingRequest(
      sessionContext?.lastRankingSnapshot ?? null,
      altRequestSignals
    );
  }

  return {
    turnType:                    cogResult.turnType,
    signals:                     cogResult.signals,
    routingModeBeforeInterceptor,
    routingModeAfter:            routingDecision.mode,
    shouldSkipProductSearch:     !!contextResolution.shouldSkipProductSearch,
    allowNewSearch:              !!routingDecision.allowNewSearch,
    allowReplaceWinner:          !!routingDecision.allowReplaceWinner,
    shouldPreserveAnchor:        !!routingDecision.shouldPreserveAnchor,
    contextResolutionMode:       contextResolution.mode,
    entersContextualPath,
    isAlternativeRequest,
    rankingResolution,
    promptInjectionReachable:    entersContextualPath && isAlternativeRequest && !!rankingResolution,
  };
}

// ─────────────────────────────────────────────────────────────
// Grupo 1 — Caso principal: "quem quase ganhou?"
// ─────────────────────────────────────────────────────────────

section("Grupo 1 — Caso principal: quem quase ganhou?");

{
  const r = simulateInterceptorPipeline("quem quase ganhou?");

  assert(
    "1.1: router detecta ALTERNATIVE_REQUEST",
    r.turnType === "ALTERNATIVE_REQUEST"
  );
  assert(
    "1.2: requestedRank=2 nos sinais",
    r.signals?.alternativeRequest?.requestedRank === 2
  );
  assert(
    "1.3: shouldSkipProductSearch = true (interceptor ativo)",
    r.shouldSkipProductSearch === true
  );
  assert(
    "1.4: allowNewSearch = false (winner preservado)",
    r.allowNewSearch === false
  );
  assert(
    "1.5: allowReplaceWinner = false",
    r.allowReplaceWinner === false
  );
  assert(
    "1.6: shouldPreserveAnchor = true",
    r.shouldPreserveAnchor === true
  );
  assert(
    "1.7: entra no contextual path",
    r.entersContextualPath === true
  );
  assert(
    "1.8: isAlternativeRequest = true",
    r.isAlternativeRequest === true
  );
  assert(
    "1.9: rankingResolution presente (rank 2)",
    r.rankingResolution?.type === "single_rank" &&
    r.rankingResolution?.rank === 2 &&
    r.rankingResolution?.product?.product_name === P2.product_name
  );
  assert(
    "1.10: prompt injection reachable",
    r.promptInjectionReachable === true
  );
  assert(
    "1.11: ALTERNATIVE_REQUEST_LOST NÃO ocorre",
    r.entersContextualPath && r.turnType === "ALTERNATIVE_REQUEST"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 2 — Casos equivalentes (queries > 14 chars com âncora)
// ─────────────────────────────────────────────────────────────

section("Grupo 2 — Casos equivalentes (formulações longas)");

const EQUIVALENT_CASES = [
  { query: "qual o plano B?",              expectedRank: 2,    expectedTopN: null },
  { query: "qual foi o segundo colocado?", expectedRank: 2,    expectedTopN: null },
  { query: "qual era a segunda opção?",    expectedRank: 2,    expectedTopN: null },
  { query: "quem veio depois dele?",       expectedRank: 2,    expectedTopN: null },
  { query: "qual seria o segundo lugar?",  expectedRank: 2,    expectedTopN: null },
];

for (const { query, expectedRank, expectedTopN } of EQUIVALENT_CASES) {
  const r = simulateInterceptorPipeline(query);

  assert(
    `2: "${query}" → ALTERNATIVE_REQUEST`,
    r.turnType === "ALTERNATIVE_REQUEST"
  );
  assert(
    `2: "${query}" → interceptor ativo (shouldSkipProductSearch)`,
    r.shouldSkipProductSearch === true
  );
  assert(
    `2: "${query}" → entra no contextual path`,
    r.entersContextualPath === true
  );
  assert(
    `2: "${query}" → rankingResolution presente`,
    r.rankingResolution !== null && r.rankingResolution?.type !== "not_available"
  );
  if (expectedRank) {
    assert(
      `2: "${query}" → resolves rank ${expectedRank}`,
      r.rankingResolution?.rank === expectedRank
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Grupo 3 — Guardrails: sem âncora não força contextual
// ─────────────────────────────────────────────────────────────

section("Grupo 3 — Guardrails: sem âncora");

{
  const r = simulateInterceptorPipeline("quem quase ganhou?", {
    hasAnchor: false,
    sessionContext: {},
  });

  // Without anchor the cognitive router's guard blocks ALTERNATIVE_REQUEST detection
  assert(
    "3.1: sem âncora — router NÃO detecta ALTERNATIVE_REQUEST",
    r.turnType !== "ALTERNATIVE_REQUEST"
  );
  assert(
    "3.2: sem âncora — interceptor NÃO ativado (shouldSkipProductSearch = false)",
    r.shouldSkipProductSearch === false
  );
  assert(
    "3.3: sem âncora — não força contextual path indevidamente",
    r.entersContextualPath === false
  );
  assert(
    "3.4: sem âncora — allowNewSearch permanece livre",
    r.allowNewSearch === true
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 4 — Guardrail: earlyClearNewCommercialSearch bloqueia interceptor
// ─────────────────────────────────────────────────────────────

section("Grupo 4 — Guardrail: nova busca explícita bloqueia interceptor");

{
  // Simula: "quero um celular novo de até 2000" (com âncora)
  // earlyClearNewCommercialSearch = true → interceptor NÃO deve ativar
  const r = simulateInterceptorPipeline("qual o plano B?", {
    hasAnchor: true,
    sessionContext: SESSION_WITH_ANCHOR,
    earlyClearNewCommercialSearch: true,
  });

  assert(
    "4.1: com nova busca explícita — interceptor NÃO ativado",
    r.shouldSkipProductSearch === false
  );
  assert(
    "4.2: allowNewSearch permanece true (usuário quer nova busca)",
    r.allowNewSearch === true
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 5 — Regressões: outros turnTypes não afetados
// ─────────────────────────────────────────────────────────────

section("Grupo 5 — Regressões: OBJECTION, REFINEMENT, EXPLANATION_REQUEST, FOLLOW_UP");

{
  // OBJECTION — PATCH 6.2 continua funcionando
  const objection = simulateInterceptorPipeline("acho caro");
  assert(
    "5.1: OBJECTION → router detecta",
    objection.turnType === "OBJECTION"
  );
  assert(
    "5.2: OBJECTION → entra no contextual path (via PATCH 6.2)",
    objection.entersContextualPath === true
  );
  assert(
    "5.3: OBJECTION → allowNewSearch = false",
    objection.allowNewSearch === false
  );

  // REFINEMENT — PATCH 6.3 continua funcionando
  const refinement = simulateInterceptorPipeline("tem algum mais barato?");
  assert(
    "5.4: REFINEMENT → router detecta",
    refinement.turnType === "REFINEMENT"
  );
  assert(
    "5.5: REFINEMENT → interceptor ativo",
    refinement.shouldSkipProductSearch === true
  );
  assert(
    "5.6: REFINEMENT → entra no contextual path",
    refinement.entersContextualPath === true
  );
  assert(
    "5.7: REFINEMENT → allowNewSearch = false",
    refinement.allowNewSearch === false
  );

  // EXPLANATION_REQUEST — PATCH 5.6F + cognitive_anchor_hold
  const explanation = simulateInterceptorPipeline("por que você recomendou esse?");
  assert(
    "5.8: EXPLANATION_REQUEST → router detecta",
    explanation.turnType === "EXPLANATION_REQUEST"
  );

  // FOLLOW_UP genérico (query curta)
  const followup = simulateInterceptorPipeline("e a bateria?");
  assert(
    "5.9: FOLLOW_UP → router detecta",
    followup.turnType === "FOLLOW_UP"
  );
  assert(
    "5.10: FOLLOW_UP → entra no contextual path (anchored_reaction por query curta)",
    followup.entersContextualPath === true
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 6 — Ranking resolution end-to-end após interceptor
// ─────────────────────────────────────────────────────────────

section("Grupo 6 — Ranking resolution end-to-end após interceptor ativo");

{
  // Runner-up (rank 2)
  const runnerUp = simulateInterceptorPipeline("quem quase ganhou?");
  assert(
    "6.1: rank 2 resolves to Poco F6",
    runnerUp.rankingResolution?.product?.product_name === P2.product_name
  );
  assert(
    "6.2: rank 2 isWinner = false",
    runnerUp.rankingResolution?.product?.isWinner === false
  );

  // Top-N (query curta — entra via anchored_reaction safety net)
  const top3 = simulateInterceptorPipeline("top 3");
  assert(
    "6.3: top 3 → entra no contextual path",
    top3.entersContextualPath === true
  );
  assert(
    "6.4: top 3 → rankingResolution type = top_n",
    top3.rankingResolution?.type === "top_n"
  );
  assert(
    "6.5: top 3 → 3 itens retornados",
    top3.rankingResolution?.items?.length === 3
  );
  assert(
    "6.6: top 3 → primeiro item é o winner",
    top3.rankingResolution?.items?.[0]?.isWinner === true
  );
  assert(
    "6.7: top 3 → segundo item é Poco F6",
    top3.rankingResolution?.items?.[1]?.product_name === P2.product_name
  );
  assert(
    "6.8: top 3 → terceiro item é Moto Edge 50 Neo",
    top3.rankingResolution?.items?.[2]?.product_name === P3.product_name
  );

  // Rank indisponível
  const rank10 = simulateInterceptorPipeline("quem quase ganhou?");
  const notAvail = resolveRankingRequest(SNAP5, { requestedRank: 10 });
  assert(
    "6.9: rank 10 fora do snapshot → not_available",
    notAvail.type === "not_available" && notAvail.reason === "rank_out_of_bounds"
  );

  // Sem snapshot
  const noSnap = simulateInterceptorPipeline("quem quase ganhou?", {
    hasAnchor: true,
    sessionContext: { lastBestProduct: WINNER }, // sem lastRankingSnapshot
  });
  assert(
    "6.10: com âncora mas sem snapshot → rankingResolution type = not_available",
    noSnap.rankingResolution?.type === "not_available"
  );
  assert(
    "6.11: sem snapshot — ainda entra no contextual path (interceptor preserva contexto)",
    noSnap.entersContextualPath === true
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 7 — Verificação que ALTERNATIVE_REQUEST_LOST não ocorre
// ─────────────────────────────────────────────────────────────

section("Grupo 7 — ALTERNATIVE_REQUEST_LOST não ocorre mais (PATCH 7.6A)");

const LONG_ALT_QUERIES = [
  "quem quase ganhou?",
  "qual o plano B?",
  "qual foi o segundo colocado?",
  "qual era a segunda opção?",
  "quem veio depois dele?",
  "qual seria o segundo lugar?",
];

for (const query of LONG_ALT_QUERIES) {
  const r = simulateInterceptorPipeline(query);

  const altRequestLost =
    r.turnType === "ALTERNATIVE_REQUEST" && !r.entersContextualPath;

  assert(
    `7: "${query}" — ALTERNATIVE_REQUEST_LOST = false (interceptor ativo)`,
    !altRequestLost
  );
  assert(
    `7: "${query}" — ALTERNATIVE_REQUEST_CONTEXTUAL_INTERCEPTED = true`,
    r.turnType === "ALTERNATIVE_REQUEST" && r.entersContextualPath
  );
}

// ─────────────────────────────────────────────────────────────
// Final
// ─────────────────────────────────────────────────────────────

console.log(`\n\nResultados: ${passed} passando / ${failed} falhando (total: ${passed + failed})\n`);

if (failed > 0) process.exit(1);
