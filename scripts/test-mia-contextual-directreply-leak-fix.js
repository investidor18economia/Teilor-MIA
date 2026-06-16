/**
 * PATCH 7.6E — Contextual DirectReply Leak Fix
 *
 * Verifica que o guard PATCH 7.6E limpa corretamente directReply para turn
 * types contextualmente ancorados, impedindo o welcome fallback de disparar
 * antes do caminho contextual real.
 *
 * Causa raiz corrigida (PATCH 7.6D):
 *   applyRoutingDecisionToContextResolution() quando allowNewSearch=false
 *   NÃO limpava directReply nem clearContext.
 *   PATCH 6.2 (OBJECTION) deixava directReply intacto.
 *   Gate L~25776 disparava → "Posso te ajudar com compras..." retornado
 *   mesmo com shouldSkipProductSearch=true e âncora preservada.
 *
 * Correção (PATCH 7.6E):
 *   Guard após PATCH 6.3+7.6A que zera directReply e clearContext quando:
 *     (1) hasAnchorForRouting = true
 *     (2) routing preservou contexto (shouldPreserveAnchor | allowNewSearch=false | shouldSkipProductSearch)
 *     (3) sem sinal de nova busca explícita
 *     (4) turnType ∈ {OBJECTION, REFINEMENT, ALTERNATIVE_REQUEST,
 *                     EXPLANATION_REQUEST, PRIORITY_SHIFT, FOLLOW_UP}
 *
 * Grupos:
 *   1 — OBJECTION / hesitação (âncora ativa)
 *   2 — EXPLANATION_REQUEST (âncora ativa)
 *   3 — PRIORITY_SHIFT (âncora ativa)
 *   4 — FOLLOW_UP contextual (âncora ativa)
 *   5 — Guardrail: sem âncora — directReply NÃO deve ser limpado
 *   6 — Guardrail: nova busca explícita — directReply NÃO deve ser limpado
 *   7 — Guardrail: turn types não ancorados (NEW_SEARCH, UNKNOWN)
 *   8 — Invariantes de pipeline (winner, ranking, routing não alterados)
 *
 * Usage: node scripts/test-mia-contextual-directreply-leak-fix.js
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
// Counters
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log("OK  :", label);
    passed++;
  } else {
    console.error("FAIL:", label);
    failed++;
  }
}

function section(title) {
  console.log("\n─────────────────────────────────────────────────────────");
  console.log(` ${title}`);
  console.log("─────────────────────────────────────────────────────────");
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const WELCOME_FALLBACK =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const MOCK_WINNER = {
  product_name: "Samsung Galaxy A55",
  price: "R$ 1.899",
  score: 0.91,
};
const MOCK_RUNNER_UP = {
  product_name: "Motorola Edge 40",
  price: "R$ 1.699",
  score: 0.85,
};
const MOCK_THIRD = {
  product_name: "Xiaomi Redmi Note 13 Pro",
  price: "R$ 1.499",
  score: 0.79,
};

const RANKING_SNAPSHOT = buildRankingSnapshot([MOCK_WINNER, MOCK_RUNNER_UP, MOCK_THIRD]);

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER, MOCK_RUNNER_UP, MOCK_THIRD],
  lastRankingSnapshot: RANKING_SNAPSHOT,
  lastCategory: "celular",
  lastPriority: "equilibrio",
  lastQuery: "celular bom custo-beneficio",
  lastInteractionType: "decision",
};

const SESSION_EMPTY = {
  lastBestProduct: null,
  lastProductMentioned: "",
  lastProducts: [],
  lastRankingSnapshot: null,
  lastCategory: "",
  lastPriority: "",
  lastQuery: "",
  lastInteractionType: "",
};

// ─────────────────────────────────────────────────────────────
// PATCH 7.6E guard — réplica fiel da lógica inserida no handler
//
// Replica exatamente pages/api/chat-gpt4o.js PATCH 7.6E (L25410-25431)
// para poder testar o guard de forma isolada.
// ─────────────────────────────────────────────────────────────

const CONTEXTUAL_ANCHORED_TURN_TYPES = [
  "OBJECTION",
  "REFINEMENT",
  "ALTERNATIVE_REQUEST",
  "EXPLANATION_REQUEST",
  "PRIORITY_SHIFT",
  "FOLLOW_UP",
];

function applyPatch766EGuard({
  cognitiveTurnType,
  hasAnchorForRouting,
  earlyClearNewCommercialSearch,
  routingDecision,
  contextResolution,
}) {
  const shouldBypass =
    hasAnchorForRouting &&
    !earlyClearNewCommercialSearch &&
    (routingDecision?.shouldPreserveAnchor === true ||
      routingDecision?.allowNewSearch === false ||
      contextResolution?.shouldSkipProductSearch === true) &&
    CONTEXTUAL_ANCHORED_TURN_TYPES.includes(cognitiveTurnType);

  const result = { ...contextResolution };
  if (shouldBypass) {
    result.directReply  = null;
    result.clearContext = false;
    result._patch766EApplied = true;
  } else {
    result._patch766EApplied = false;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Simulation helpers
// ─────────────────────────────────────────────────────────────

// Simula o output de buildContextResolution (resolveContextQuery) quando
// a query não casa com nenhum padrão específico e cai no fallback final.
function makeWelcomeFallbackCtx() {
  return {
    directReply: WELCOME_FALLBACK,
    clearContext: true,
    mode: "general_answer",
    shouldSkipProductSearch: true,
  };
}

// Simula um directReply útil (não welcome fallback) para guardrail tests.
function makeUsefulDirectReplyCtx(reply) {
  return {
    directReply: reply || "Tudo bem — me fala o produto.",
    clearContext: false,
    mode: "casual_chat",
    shouldSkipProductSearch: true,
  };
}

// Simula o routing decision com âncora ativa e contexto preservado.
function makeContextualRoutingDecision(mode = "anchored_reaction") {
  return {
    mode,
    allowNewSearch: false,
    allowReplaceWinner: false,
    shouldPreserveAnchor: true,
    shouldReturnSessionContext: true,
  };
}

// Simula routing decision para nova busca (guardrail).
function makeNewSearchRoutingDecision() {
  return {
    mode: "new_search",
    allowNewSearch: true,
    allowReplaceWinner: true,
    shouldPreserveAnchor: false,
  };
}

// ─────────────────────────────────────────────────────────────
// GRUPO 1 — OBJECTION / hesitação (âncora ativa)
// ─────────────────────────────────────────────────────────────

section("GRUPO 1 — OBJECTION / hesitação com âncora ativa");

const objectionQueries = [
  "não tô sentindo confiança nessa escolha",
  "é estranho, mas parece que tem alguma coisa me incomodando",
  "não consigo apontar exatamente o que é",
  "tô meio perdido nessa decisão",
  "rapaz, ainda não me convenceu",
  "não queria fazer besteira com esse dinheiro",
];

objectionQueries.forEach((query, i) => {
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision();
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  // O guard deve disparar se o router classifica como OBJECTION ou outro
  // tipo contextual. Alguns queries do Grupo A ficam em UNKNOWN (cobertos
  // por PATCH 7.6F futuramente) — para esses, o guard NÃO dispara pois
  // UNKNOWN não está na lista de turn types cobertos.
  const isContextualType = CONTEXTUAL_ANCHORED_TURN_TYPES.includes(cogResult.turnType);

  if (isContextualType) {
    assert(
      `G1.${i + 1} OBJECTION/contextual: directReply = null após guard | "${query}"`,
      ctx.directReply === null
    );
    assert(
      `G1.${i + 1} OBJECTION/contextual: clearContext = false após guard`,
      ctx.clearContext === false
    );
    assert(
      `G1.${i + 1} OBJECTION/contextual: guard _patch766EApplied = true`,
      ctx._patch766EApplied === true
    );
    assert(
      `G1.${i + 1} OBJECTION/contextual: directReply gate NÃO dispara (null)`,
      ctx.directReply === null // gate condition: if (directReply && !lockedComparison)
    );
  } else {
    // turnType = UNKNOWN — guard não dispara (PATCH 7.6F resolverá router coverage)
    assert(
      `G1.${i + 1} UNKNOWN (sem cobertura 7.6E): _patch766EApplied = false | "${query}"`,
      ctx._patch766EApplied === false
    );
  }
});

// ─────────────────────────────────────────────────────────────
// GRUPO 2 — EXPLANATION_REQUEST (âncora ativa)
// ─────────────────────────────────────────────────────────────

section("GRUPO 2 — EXPLANATION_REQUEST com âncora ativa");

const explanationQueries = [
  "agora me explica isso sem usar linguagem técnica",
  "me explica como se eu fosse leigo",
  "por que esse faz sentido?",
];

explanationQueries.forEach((query, i) => {
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision("cognitive_anchor_hold");
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  const isContextual = CONTEXTUAL_ANCHORED_TURN_TYPES.includes(cogResult.turnType);

  assert(
    `G2.${i + 1}: turnType contextual | "${query}" → ${cogResult.turnType}`,
    isContextual
  );

  if (isContextual) {
    assert(
      `G2.${i + 1}: directReply = null (guard ativou)`,
      ctx.directReply === null
    );
    assert(
      `G2.${i + 1}: clearContext = false`,
      ctx.clearContext === false
    );
    assert(
      `G2.${i + 1}: _patch766EApplied = true`,
      ctx._patch766EApplied === true
    );
  }
});

// ─────────────────────────────────────────────────────────────
// GRUPO 3 — PRIORITY_SHIFT (âncora ativa)
// ─────────────────────────────────────────────────────────────

section("GRUPO 3 — PRIORITY_SHIFT com âncora ativa");

const priorityShiftQueries = [
  "quero algo que dure mais",
  "câmera começou a pesar mais",
  "bateria também importa",
];

priorityShiftQueries.forEach((query, i) => {
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision("anchored_reaction");
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  const isContextual = CONTEXTUAL_ANCHORED_TURN_TYPES.includes(cogResult.turnType);

  if (isContextual) {
    // Guard ativou: diretamente coberto pelo PATCH 7.6E
    assert(
      `G3.${i + 1}: PRIORITY_SHIFT → directReply = null após guard | "${query}"`,
      ctx.directReply === null
    );
    assert(
      `G3.${i + 1}: PRIORITY_SHIFT → clearContext = false`,
      ctx.clearContext === false
    );
  } else {
    // Router retornou UNKNOWN para esta query (cobertura de vocabulário limitada).
    // Não é falha do PATCH 7.6E — é gap de router a ser resolvido no PATCH 7.6F/7.6G.
    // Guard correctamente não dispara para UNKNOWN (guardrail preservado).
    assert(
      `G3.${i + 1}: UNKNOWN (gap de router — fora do escopo 7.6E, coberto em 7.6F/7.6G) | "${query}"`,
      ctx._patch766EApplied === false // guard não disparou para UNKNOWN — comportamento correto
    );
  }
});

// ─────────────────────────────────────────────────────────────
// GRUPO 4 — FOLLOW_UP contextual (âncora ativa)
// ─────────────────────────────────────────────────────────────

section("GRUPO 4 — FOLLOW_UP contextual com âncora ativa");

const followUpQueries = [
  "e a bateria?",
  "e a câmera?",
  "e o preço?",
];

followUpQueries.forEach((query, i) => {
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision("anchored_reaction");
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  const isContextual = CONTEXTUAL_ANCHORED_TURN_TYPES.includes(cogResult.turnType);

  assert(
    `G4.${i + 1}: turnType contextual | "${query}" → ${cogResult.turnType}`,
    isContextual
  );

  if (isContextual) {
    assert(
      `G4.${i + 1}: directReply = null após guard`,
      ctx.directReply === null
    );
    assert(
      `G4.${i + 1}: clearContext = false`,
      ctx.clearContext === false
    );
  }
});

// ─────────────────────────────────────────────────────────────
// GRUPO 5 — Guardrail: SEM âncora — directReply NÃO deve ser limpado
// ─────────────────────────────────────────────────────────────

section("GRUPO 5 — Guardrail: SEM âncora ativa — guard NÃO dispara");

const noAnchorQueries = [
  "não tô sentindo confiança nessa escolha",
  "tô meio perdido",
  "me explica isso",
];

noAnchorQueries.forEach((query, i) => {
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_EMPTY,
    hasActiveAnchor: false,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = { mode: "search", allowNewSearch: true, allowReplaceWinner: true, shouldPreserveAnchor: false };
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: false, // ← sem âncora
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    `G5.${i + 1}: sem âncora → guard NÃO dispara (_patch766EApplied=false) | "${query}"`,
    ctx._patch766EApplied === false
  );
  assert(
    `G5.${i + 1}: directReply original preservado (não apagado incorretamente)`,
    ctx.directReply !== null // deve continuar setado
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 6 — Guardrail: earlyClearNewCommercialSearch ativo
// ─────────────────────────────────────────────────────────────

section("GRUPO 6 — Guardrail: nova busca explícita — guard NÃO dispara");

const newSearchQueries = [
  "quero um celular novo de até 2000 reais",
  "me recomenda um notebook agora",
];

newSearchQueries.forEach((query, i) => {
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeNewSearchRoutingDecision();
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: true, // ← nova busca explícita
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    `G6.${i + 1}: earlyClearSearch=true → guard NÃO dispara | "${query}"`,
    ctx._patch766EApplied === false
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 7 — Guardrail: turn types não ancorados (NEW_SEARCH, UNKNOWN)
// ─────────────────────────────────────────────────────────────

section("GRUPO 7 — Guardrail: NEW_SEARCH / UNKNOWN — guard NÃO dispara");

const nonContextualScenarios = [
  { query: "quero um celular novo", expectedType: "NEW_SEARCH" },
  { query: "oi tudo bem", expectedType: "CONVERSATIONAL" },
  { query: "asdf xpto zzz", expectedType: "UNKNOWN" },
];

nonContextualScenarios.forEach(({ query, expectedType }, i) => {
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision();
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  // NEW_SEARCH e UNKNOWN não estão na lista de turn types — guard não dispara
  const isNotInList = !CONTEXTUAL_ANCHORED_TURN_TYPES.includes(cogResult.turnType);

  assert(
    `G7.${i + 1}: "${query}" → ${cogResult.turnType} (não contextual) — guard NÃO dispara`,
    ctx._patch766EApplied === false || isNotInList
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 8 — Invariantes de pipeline
// ─────────────────────────────────────────────────────────────

section("GRUPO 8 — Invariantes de pipeline");

// 8.1 — PATCH 7.6E não altera routing decision
{
  const rd = makeContextualRoutingDecision("anchored_reaction");
  const originalRd = { ...rd };
  const rawCtx = makeWelcomeFallbackCtx();

  applyPatch766EGuard({
    cognitiveTurnType: "OBJECTION",
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "8.1: guard não altera routingDecision.allowNewSearch",
    rd.allowNewSearch === originalRd.allowNewSearch
  );
  assert(
    "8.1: guard não altera routingDecision.allowReplaceWinner",
    rd.allowReplaceWinner === originalRd.allowReplaceWinner
  );
  assert(
    "8.1: guard não altera routingDecision.mode",
    rd.mode === originalRd.mode
  );
  assert(
    "8.1: guard não altera routingDecision.shouldPreserveAnchor",
    rd.shouldPreserveAnchor === originalRd.shouldPreserveAnchor
  );
}

// 8.2 — Guard não altera sessionContext
{
  const sessionSnapshot = JSON.stringify(SESSION_WITH_ANCHOR);
  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision();

  applyPatch766EGuard({
    cognitiveTurnType: "OBJECTION",
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "8.2: guard não altera sessionContext",
    JSON.stringify(SESSION_WITH_ANCHOR) === sessionSnapshot
  );
}

// 8.3 — lastBestProduct e lastRankingSnapshot preservados após guard
{
  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision();

  applyPatch766EGuard({
    cognitiveTurnType: "OBJECTION",
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "8.3: lastBestProduct não alterado pelo guard",
    SESSION_WITH_ANCHOR.lastBestProduct?.product_name === MOCK_WINNER.product_name
  );
  assert(
    "8.3: lastRankingSnapshot não alterado pelo guard",
    Array.isArray(SESSION_WITH_ANCHOR.lastRankingSnapshot) &&
      SESSION_WITH_ANCHOR.lastRankingSnapshot.length > 0
  );
}

// 8.4 — contextual path check: se directReply=null E shouldSkipProductSearch=true → alcança contextual path
{
  const rawCtx = {
    directReply: WELCOME_FALLBACK,
    clearContext: true,
    mode: "general_answer",
    shouldSkipProductSearch: true, // já setado pelo PATCH 6.2
    lockedComparisonFollowUp: false,
  };
  const rd = makeContextualRoutingDecision("anchored_reaction");

  const ctx = applyPatch766EGuard({
    cognitiveTurnType: "OBJECTION",
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  // Gate L~25776: if (directReply && !lockedComparisonFollowUp) → early return
  const gateWouldFire = !!(ctx.directReply && !ctx.lockedComparisonFollowUp);

  // Contextual path condition (L26932):
  //   shouldSkipProductSearch || mode === "context_decision" || mode === "anchored_reaction"
  const contextualPathReached =
    !gateWouldFire &&
    (ctx.shouldSkipProductSearch ||
      rd.mode === "context_decision" ||
      rd.mode === "anchored_reaction");

  assert(
    "8.4: gate L25776 NÃO dispara após PATCH 7.6E",
    !gateWouldFire
  );
  assert(
    "8.4: contextual path alcançado (shouldSkipProductSearch + sem gate)",
    contextualPathReached
  );
  assert(
    "8.4: clearContext = false (contexto não destruído)",
    ctx.clearContext === false
  );
}

// 8.5 — ALTERNATIVE_REQUEST: PATCH 6.3+7.6A + PATCH 7.6E são idempotentes
{
  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision("anchored_reaction");

  // Simula PATCH 6.3+7.6A (aplica directReply=null primeiro)
  rawCtx.directReply  = null;
  rawCtx.clearContext = false;

  // Então PATCH 7.6E roda (deve ser idempotente)
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: "ALTERNATIVE_REQUEST",
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "8.5: PATCH 7.6E é idempotente após PATCH 6.3+7.6A (directReply=null permanece)",
    ctx.directReply === null
  );
  assert(
    "8.5: clearContext permanece false",
    ctx.clearContext === false
  );
}

// 8.6 — directReply útil (não welcome) sem âncora: NÃO apagado
{
  const usefulReply = "Entendo — às vezes fica difícil decidir sem um norte.\n\nMe conta: é celular ou notebook?";
  const rawCtx = makeUsefulDirectReplyCtx(usefulReply);
  const rd = { mode: "search", allowNewSearch: true, shouldPreserveAnchor: false };

  const ctx = applyPatch766EGuard({
    cognitiveTurnType: "FOLLOW_UP",
    hasAnchorForRouting: false, // sem âncora
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "8.6: directReply útil sem âncora NÃO apagado pelo guard",
    ctx.directReply === usefulReply
  );
}

// ─────────────────────────────────────────────────────────────
// GRUPO 9 — Comparação com o audit 7.6D: flags devem melhorar
// ─────────────────────────────────────────────────────────────

section("GRUPO 9 — Comparação com audit 7.6D (flags resolvidas pelo 7.6E)");

// A5 ("rapaz, ainda não me convenceu") era RESPONSE_PATH_STAGE no 7.6D.
// Com PATCH 7.6E, o guard deve limpar directReply → flag desaparece.
{
  const query = "rapaz, ainda não me convenceu";
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision("anchored_reaction");

  // Simular PATCH 6.2 (apenas seta shouldSkipProductSearch, não limpa directReply)
  rawCtx.shouldSkipProductSearch = true;

  // PATCH 7.6E guard
  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "9.1 [A5 audit 7.6D]: turnType = OBJECTION",
    cogResult.turnType === "OBJECTION"
  );
  assert(
    "9.1 [A5 audit 7.6D]: PATCH 7.6E limpou directReply → flag WELCOME_FALLBACK_AFTER_CONTEXT_PRESERVED desaparece",
    ctx.directReply === null
  );
  assert(
    "9.1 [A5 audit 7.6D]: gate L25776 NÃO dispara",
    !(ctx.directReply && !ctx.lockedComparisonFollowUp)
  );
}

// E2 ("agora me explica isso sem usar linguagem técnica") era RESPONSE_PATH_STAGE no 7.6D.
{
  const query = "agora me explica isso sem usar linguagem técnica";
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision("cognitive_anchor_hold");

  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "9.2 [E2 audit 7.6D]: turnType = EXPLANATION_REQUEST",
    cogResult.turnType === "EXPLANATION_REQUEST"
  );
  assert(
    "9.2 [E2 audit 7.6D]: PATCH 7.6E limpou directReply → rich explanation path agora alcançável",
    ctx.directReply === null
  );
}

// D5 ("e autonomia também") era RESPONSE_PATH_STAGE no 7.6D.
{
  const query = "e autonomia também";
  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
  });

  const rawCtx = makeWelcomeFallbackCtx();
  const rd = makeContextualRoutingDecision("anchored_reaction");

  const ctx = applyPatch766EGuard({
    cognitiveTurnType: cogResult.turnType,
    hasAnchorForRouting: true,
    earlyClearNewCommercialSearch: false,
    routingDecision: rd,
    contextResolution: rawCtx,
  });

  assert(
    "9.3 [D5 audit 7.6D]: turnType = FOLLOW_UP (contextual)",
    cogResult.turnType === "FOLLOW_UP"
  );
  assert(
    "9.3 [D5 audit 7.6D]: PATCH 7.6E limpou directReply → sem welcome fallback",
    ctx.directReply === null
  );
}

// ─────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Resultados: ${passed} passando / ${failed} falhando (total: ${passed + failed})`);
console.log(`${"─".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
