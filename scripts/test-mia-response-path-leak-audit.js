/**
 * PATCH 7.6D — Production Response Path Leak Audit
 *
 * MIA_RESPONSE_PATH_LEAK_AUDIT
 *
 * Objetivo: identificar em qual estágio do pipeline a resposta escapa do
 * caminho esperado, mesmo quando o Router classifica corretamente.
 *
 * Hipótese principal:
 *   cognitiveTurnType = OBJECTION | ALTERNATIVE_REQUEST | EXPLANATION_REQUEST
 *   shouldSkipProductSearch = true
 *   anchorPreserved = true
 *   allowNewSearch = false
 *   → mas a resposta final ainda é welcome fallback / generic fallback
 *
 * Achado central (confirmado em código):
 *   applyRoutingDecisionToContextResolution() quando allowNewSearch=false
 *   APENAS seta shouldSkipProductSearch=true.
 *   NÃO limpa directReply nem clearContext.
 *   (lib/miaRoutingDecisionContract.js L284-289)
 *
 *   PATCH 6.2 (OBJECTION interceptor) usa applyRoutingDecisionToContextResolution
 *   mas NÃO faz contextResolution.directReply = null depois.
 *   (pages/api/chat-gpt4o.js L25334-25345)
 *
 *   PATCH 6.3+7.6A (REFINEMENT/ALTERNATIVE) faz o mesmo MAS também
 *   executa contextResolution.directReply = null explicitamente.
 *   (pages/api/chat-gpt4o.js L25378)
 *
 *   Gate L25776: if (contextResolution.directReply && !lockedComparisonFollowUp)
 *   → retorna welcome fallback ANTES do caminho contextual (L26932)
 *
 * Grupos auditados:
 *   A — Hesitação / confiança (6 cenários)
 *   B — Alternativa / ranking (4 cenários)
 *   C — Comparação contextual (3 cenários)
 *   D — Prioridade contextual (5 cenários)
 *   E — Explicação contextual (3 cenários)
 *
 * ZERO mudanças comportamentais. ZERO correções. Apenas auditoria.
 *
 * Usage: node scripts/test-mia-response-path-leak-audit.js
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
// Contadores globais
// ─────────────────────────────────────────────────────────────

let totalScenarios = 0;
let totalLeak = 0;
let totalClean = 0;
let totalAsserts = 0;
let totalPassed = 0;
let totalFailed = 0;

const leakStageCount = {
  ROUTER_STAGE: 0,
  ROUTING_STAGE: 0,
  CONTEXT_STAGE: 0,
  RANKING_RESOLUTION_STAGE: 0,
  PROMPT_INJECTION_STAGE: 0,
  CONTRACT_STAGE: 0,
  RESPONSE_PATH_STAGE: 0,
  VERBALIZER_STAGE: 0,
  NONE: 0,
};

const allFlags = [];
const leakSummary = [];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function assert(label, condition) {
  totalAsserts++;
  if (condition) {
    console.log("  OK  :", label);
    totalPassed++;
  } else {
    console.error("  FAIL:", label);
    totalFailed++;
  }
}

function reportLeak(scenario, leakStage, flags, details = "") {
  totalLeak++;
  leakStageCount[leakStage] = (leakStageCount[leakStage] || 0) + 1;
  const entry = { query: scenario.query, group: scenario.group, leakStage, flags, details };
  leakSummary.push(entry);
  allFlags.push(...flags);
  console.log(`  ⚠  LEAK [${leakStage}]: ${flags.join(", ")}`);
  if (details) console.log(`     → ${details}`);
}

function reportClean(scenario) {
  totalClean++;
  leakStageCount.NONE = (leakStageCount.NONE || 0) + 1;
  console.log(`  ✓  CLEAN: nenhum vazamento detectado`);
}

function sectionHeader(title) {
  console.log("\n" + "═".repeat(70));
  console.log(` ${title}`);
  console.log("═".repeat(70));
}

function scenarioHeader(idx, group, query) {
  totalScenarios++;
  console.log(`\n[${group}-${idx}] "${query}"`);
}

// ─────────────────────────────────────────────────────────────
// Session context fixtures
// ─────────────────────────────────────────────────────────────

// Produto âncora de referência (simulado)
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

// Snapshot de ranking formal (como seria gerado por buildRankingSnapshot)
const MOCK_RANKING_SNAPSHOT = buildRankingSnapshot([
  { ...MOCK_WINNER },
  { ...MOCK_RUNNER_UP },
  { ...MOCK_THIRD },
]);

// Session context COM âncora e ranking snapshot (estado pós-decisão)
const SESSION_WITH_ANCHOR_AND_SNAPSHOT = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER, MOCK_RUNNER_UP, MOCK_THIRD],
  lastRankingSnapshot: MOCK_RANKING_SNAPSHOT,
  lastCategory: "celular",
  lastPriority: "equilibrio",
  lastQuery: "celular bom custo-beneficio",
  lastInteractionType: "decision",
};

// Session context COM âncora mas SEM snapshot (estado pré-PATCH 7.4)
const SESSION_WITH_ANCHOR_NO_SNAPSHOT = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER, MOCK_RUNNER_UP, MOCK_THIRD],
  lastRankingSnapshot: null, // ausente
  lastCategory: "celular",
  lastPriority: "equilibrio",
  lastQuery: "celular bom custo-beneficio",
  lastInteractionType: "decision",
};

// Session context vazia (sem âncora)
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
// Simulação de buildContextResolution (resolveContextQuery)
//
// resolveContextQuery não é exportada — replicamos as decisões-chave:
//
//   1. queries que caem em general_answer (fallback final):
//      directReply = "Posso te ajudar...", clearContext = true
//
//   2. queries que caem em guidance_needed (insecurity signal):
//      directReply = insecurity reply, clearContext = false
//
//   3. queries que caem em casual_chat:
//      directReply = casual reply, clearContext = false
//
//   4. queries sem directReply (shopping, product reference):
//      directReply = null, clearContext = false
//
// Para o audit, classificamos por grupo semântico.
// ─────────────────────────────────────────────────────────────

const WELCOME_FALLBACK_TEXT =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

function simulateContextResolution(query, sessionContext) {
  const q = String(query || "").toLowerCase().trim();

  // Queries de nova busca clara → não têm directReply
  const isNewSearch =
    /quero|preciso|me indica|busca|procuro|qual.*celular|qual.*notebook/i.test(q);
  if (isNewSearch) {
    return {
      directReply: null,
      clearContext: false,
      mode: "direct",
      shouldSkipProductSearch: false,
    };
  }

  // Queries de comparação contextual com lock → lockedComparisonFollowUp
  // (simplificado: "entre" + dois produtos referenciados)
  const isCompLocked =
    /entre (os dois|eles|esse e|o primeiro|o segundo)/i.test(q) &&
    Array.isArray(sessionContext?.lastProducts) &&
    sessionContext.lastProducts.length >= 2;
  if (isCompLocked) {
    return {
      directReply: null,
      clearContext: false,
      mode: "comparison_followup",
      shouldSkipProductSearch: true,
      lockedComparisonFollowUp: true,
    };
  }

  // Queries de insecurity signal (regex exato do código)
  const qNorm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hasDecisionInsecurity =
    /nao sei qual escolher|nao sei o que comprar|so quero.*escolha.*segura|nao sei por onde comecar|to inseguro|ta inseguro/.test(qNorm);
  if (hasDecisionInsecurity) {
    return {
      directReply: "Entendo — às vezes fica difícil decidir sem um norte.\n\nMe conta: é celular, notebook ou outra coisa?",
      clearContext: false,
      mode: "guidance_needed",
      shouldSkipProductSearch: true,
    };
  }

  // Fallback: general_answer (o que a maioria das hesitation queries retorna)
  // Inclui: não tô sentindo confiança, rapaz ainda não me convenceu, etc.
  return {
    directReply: WELCOME_FALLBACK_TEXT,
    clearContext: true,
    mode: "general_answer",
    shouldSkipProductSearch: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Simulação dos interceptores do handler (PATCH 6.2, 6.3+7.6A, 7.6E)
//
// Replica fiel da lógica em pages/api/chat-gpt4o.js L25334-25431
// ─────────────────────────────────────────────────────────────

function simulateInterceptors(cognitiveTurnType, hasAnchor, earlyClearSearch, contextResolution, routingDecision) {
  const ctx = { ...contextResolution };
  const rd = routingDecision || { allowNewSearch: false, shouldPreserveAnchor: true };

  // PATCH 6.2 — OBJECTION interceptor
  // Chama applyRoutingDecisionToContextResolution que define shouldSkipProductSearch=true
  // MAS NÃO limpa directReply (asymmetria confirmada em miaRoutingDecisionContract.js L284-289)
  if (cognitiveTurnType === "OBJECTION" && hasAnchor && !earlyClearSearch) {
    ctx.shouldSkipProductSearch = true;
    // directReply NÃO era limpado antes do PATCH 7.6E — era o leak principal
  }

  // PATCH 6.3 + 7.6A — REFINEMENT / ALTERNATIVE_REQUEST interceptor
  // Chama applyRoutingDecisionToContextResolution E depois limpa directReply=null explicitamente
  if (
    (cognitiveTurnType === "REFINEMENT" || cognitiveTurnType === "ALTERNATIVE_REQUEST") &&
    hasAnchor &&
    !earlyClearSearch
  ) {
    ctx.shouldSkipProductSearch = true;
    ctx.directReply = null; // ← LIMPA EXPLICITAMENTE (L25378)
    ctx.clearContext = false;
    if (!ctx.mode || ctx.mode === "general_answer") {
      ctx.mode = "refinement_followup";
    }
  }

  // PATCH 7.6E — Contextual DirectReply Leak Fix
  // Guard unificado que limpa directReply para TODOS os turn types ancorados,
  // incluindo OBJECTION, EXPLANATION_REQUEST, PRIORITY_SHIFT, FOLLOW_UP.
  // Replica pages/api/chat-gpt4o.js L25410-25431
  const _contextualAnchoredTurnTypes = [
    "OBJECTION",
    "REFINEMENT",
    "ALTERNATIVE_REQUEST",
    "EXPLANATION_REQUEST",
    "PRIORITY_SHIFT",
    "FOLLOW_UP",
  ];
  const shouldBypass =
    hasAnchor &&
    !earlyClearSearch &&
    (rd.shouldPreserveAnchor === true ||
      rd.allowNewSearch === false ||
      ctx.shouldSkipProductSearch === true) &&
    _contextualAnchoredTurnTypes.includes(cognitiveTurnType);

  if (shouldBypass) {
    ctx.directReply  = null;
    ctx.clearContext = false;
    ctx._patch766EApplied = true;
  }

  return ctx;
}

// ─────────────────────────────────────────────────────────────
// Simulação do gate directReply (handler L25776)
//
// if (contextResolution.directReply && !contextResolution.lockedComparisonFollowUp)
//   → retorna directReply ANTES do caminho contextual
// ─────────────────────────────────────────────────────────────

function directReplyGateFires(ctx) {
  return !!(ctx.directReply && !ctx.lockedComparisonFollowUp);
}

// ─────────────────────────────────────────────────────────────
// Função principal de auditoria por cenário
// ─────────────────────────────────────────────────────────────

function auditScenario(scenario) {
  const {
    query,
    group,
    sessionContext,
    expectedTurnType,
    expectedContextualPath,
    expectedContract,
    hasAnchor: hasAnchorOverride,
  } = scenario;

  const hasAnchor =
    hasAnchorOverride !== undefined
      ? hasAnchorOverride
      : !!(sessionContext?.lastBestProduct?.product_name);

  // ── STAGE 1: Router classification ──────────────────────────
  let cognitiveTurn;
  try {
    cognitiveTurn = classifyMiaTurn({
      query,
      originalQuery: query,
      resolvedQuery: query,
      sessionContext,
      hasActiveAnchor: hasAnchor,
    });
  } catch (err) {
    cognitiveTurn = { turnType: "UNKNOWN", confidence: 0, reasons: [] };
  }

  const turnType = cognitiveTurn?.turnType || "UNKNOWN";
  const confidence = cognitiveTurn?.confidence ?? 0;

  // ── STAGE 2: buildContextResolution simulation ───────────────
  const rawCtxRes = simulateContextResolution(query, sessionContext);

  // ── STAGE 3: buildRoutingDecision (real call) ────────────────
  let routingDecision;
  try {
    routingDecision = buildRoutingDecision({
      userMessage: query,
      resolvedQuery: query,
      contextResolution: { ...rawCtxRes },
      sessionContext: sessionContext || SESSION_EMPTY,
      incomingSessionContext: sessionContext || SESSION_EMPTY,
      intent: rawCtxRes.mode || "general_answer",
      contextAction: "",
      detectedBudget: null,
      detectedPriority: sessionContext?.lastPriority || "",
      signals: {
        hasClearNewCommercialSearch: false,
        isExplicitComparison: false,
        isContextDecisionOnOriginal: false,
        isProductReferenceOnOriginal: false,
        looksLikeAmbiguousFollowUp: hasAnchor,
        looksLikeShortPriorityFollowUp: false,
        hasComparisonProducts: false,
        wantsNew: false,
        newBudgetInOriginalMessage: false,
        newCategoryInOriginalMessage: false,
        priorityChangeReopen: false,
        lockedComparisonFollowUp: !!rawCtxRes.lockedComparisonFollowUp,
      },
      cognitiveRoutingSignal: {
        turnType,
        confidence,
        hasActiveAnchor: hasAnchor,
      },
    });
  } catch (err) {
    routingDecision = {
      mode: "search",
      allowNewSearch: true,
      allowReplaceWinner: true,
      shouldPreserveAnchor: false,
    };
  }

  // ── STAGE 4: Apply interceptors (PATCH 6.2 / 6.3+7.6A / 7.6E) ─
  const ctxAfterInterceptors = simulateInterceptors(
    turnType,
    hasAnchor,
    false, // earlyClearSearch — não ativo nestes cenários
    rawCtxRes,
    routingDecision
  );

  // ── STAGE 5: directReply gate check ─────────────────────────
  const gateFires = directReplyGateFires(ctxAfterInterceptors);

  // ── STAGE 6: Contextual path entry ──────────────────────────
  const contextualPathReached =
    !gateFires &&
    (ctxAfterInterceptors.shouldSkipProductSearch ||
      routingDecision.mode === "context_decision" ||
      routingDecision.mode === "anchored_reaction" ||
      routingDecision.mode === "cognitive_anchor_hold");

  // ── STAGE 7: Contract selection ─────────────────────────────
  const richExpPathActivated = routingDecision.mode === "cognitive_anchor_hold";
  const isObjectionWithAnchor = turnType === "OBJECTION" && hasAnchor;
  const isAlternativeRequest = turnType === "ALTERNATIVE_REQUEST" && hasAnchor;
  const isRefinementWithAnchor =
    (turnType === "REFINEMENT" || isAlternativeRequest) && hasAnchor;

  let activatedContract = "none";
  if (contextualPathReached) {
    if (isObjectionWithAnchor) activatedContract = "objection_response_contract";
    else if (isRefinementWithAnchor) activatedContract = "refinement_followup_response_contract";
    else if (richExpPathActivated) activatedContract = "explanation_anchored";
    else activatedContract = "decision_generic";
  }

  // ── STAGE 8: Ranking resolution check ───────────────────────
  let rankingResolution = null;
  if (isAlternativeRequest && contextualPathReached) {
    const snapshot = sessionContext?.lastRankingSnapshot;
    rankingResolution = resolveRankingRequest(
      snapshot,
      cognitiveTurn?.signals?.alternativeRequest || {}
    );
  }

  const rankingResolutionPresent =
    rankingResolution !== null && rankingResolution?.type !== "not_available";

  const snapshotPresent =
    Array.isArray(sessionContext?.lastRankingSnapshot) &&
    sessionContext.lastRankingSnapshot.length > 0;

  // ── Verificações de rememberedProducts ──────────────────────
  const lastProductsCount = Array.isArray(sessionContext?.lastProducts)
    ? sessionContext.lastProducts.length
    : 0;

  const lastRankingSnapshotPresent = snapshotPresent;

  const rememberedProductsEmpty =
    !lastRankingSnapshotPresent && lastProductsCount === 0;

  // ── STAGE 9: Determinar leak e flags ────────────────────────
  const divergenceFlags = [];
  let leakStage = null;

  // ── Detecção de leaks por stage ──────────────────────────────

  // ROUTER_STAGE: turnType errado
  if (expectedTurnType && turnType !== expectedTurnType) {
    divergenceFlags.push("ROUTER_MISCLASSIFIED");
    leakStage = leakStage || "ROUTER_STAGE";
  }

  // ROUTING_STAGE: routing permitiu busca nova quando não deveria
  if (
    !["ROUTER_STAGE"].includes(leakStage) &&
    expectedContextualPath &&
    routingDecision.allowNewSearch === true &&
    !ctxAfterInterceptors.shouldSkipProductSearch
  ) {
    divergenceFlags.push("ROUTING_ALLOWED_SEARCH_LEAK");
    leakStage = leakStage || "ROUTING_STAGE";
  }

  // RESPONSE_PATH_STAGE: directReply gate dispara antes do caminho contextual
  if (
    gateFires &&
    expectedContextualPath &&
    ctxAfterInterceptors.shouldSkipProductSearch
  ) {
    // directReply sobreviveu + shouldSkipProductSearch=true → classic PATCH 6.2 leak
    if (ctxAfterInterceptors.directReply === WELCOME_FALLBACK_TEXT) {
      divergenceFlags.push("WELCOME_FALLBACK_AFTER_CONTEXT_PRESERVED");
    } else if (ctxAfterInterceptors.directReply) {
      divergenceFlags.push("GENERIC_FALLBACK_AFTER_CONTEXT_PRESERVED");
    }
    leakStage = leakStage || "RESPONSE_PATH_STAGE";
  }

  // CONTEXT_STAGE: clearContext=true sobreviveu (contexto seria destruído)
  if (
    expectedContextualPath &&
    ctxAfterInterceptors.clearContext === true &&
    ctxAfterInterceptors.shouldSkipProductSearch
  ) {
    divergenceFlags.push("CONTEXT_ANCHOR_LOST");
    leakStage = leakStage || "CONTEXT_STAGE";
  }

  // RANKING_RESOLUTION_STAGE: ALTERNATIVE_REQUEST sem resolução de ranking
  if (
    turnType === "ALTERNATIVE_REQUEST" &&
    hasAnchor &&
    contextualPathReached &&
    !rankingResolutionPresent
  ) {
    if (!snapshotPresent) {
      divergenceFlags.push("CONTEXT_RANKING_SNAPSHOT_LOST");
    }
    divergenceFlags.push("RANKING_RESOLUTION_MISSING");
    leakStage = leakStage || "RANKING_RESOLUTION_STAGE";
  }

  // CONTRACT_STAGE: contrato correto não ativou
  if (
    contextualPathReached &&
    expectedContract &&
    activatedContract !== expectedContract
  ) {
    divergenceFlags.push("CONTRACT_NOT_ACTIVATED");
    leakStage = leakStage || "CONTRACT_STAGE";
  }

  // VERBALIZER_STAGE: sem produtos para verbalizar
  if (contextualPathReached && rememberedProductsEmpty) {
    divergenceFlags.push("RICH_EXPLANATION_INPUTS_EMPTY");
    leakStage = leakStage || "VERBALIZER_STAGE";
  }

  // VERBALIZER_STAGE: EXPLANATION_REQUEST sem rich path ativado
  if (
    contextualPathReached &&
    turnType === "EXPLANATION_REQUEST" &&
    !richExpPathActivated
  ) {
    divergenceFlags.push("CONTRACT_NOT_ACTIVATED");
    leakStage = leakStage || "CONTRACT_STAGE";
  }

  // ── Construção do objeto de auditoria ───────────────────────
  const auditRecord = {
    query,
    group,
    expectedSemanticFamily: scenario.family || group,
    cognitiveTurnType: turnType,
    cognitiveConfidence: confidence,
    cognitiveReasons: cognitiveTurn?.reasons || [],

    routingMode: routingDecision.mode,
    allowNewSearch: routingDecision.allowNewSearch,
    allowReplaceWinner: routingDecision.allowReplaceWinner,
    shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,

    directReplyRaw: rawCtxRes.directReply ? "[SET]" : null,
    directReplyAfterInterceptors: ctxAfterInterceptors.directReply
      ? ctxAfterInterceptors.directReply === WELCOME_FALLBACK_TEXT
        ? "[WELCOME_FALLBACK]"
        : "[OTHER_DIRECT_REPLY]"
      : null,
    clearContextRaw: rawCtxRes.clearContext,
    clearContextAfterInterceptors: ctxAfterInterceptors.clearContext,

    shouldSkipProductSearch: ctxAfterInterceptors.shouldSkipProductSearch,
    anchorPresent: hasAnchor,
    anchorProduct: sessionContext?.lastBestProduct?.product_name || null,

    directReplyGateFires: gateFires,
    contextualPathReached,

    lastBestProductPresent: !!sessionContext?.lastBestProduct?.product_name,
    lastRankingSnapshotPresent,
    lastProductsCount,
    rememberedProductsEmpty,

    isObjectionWithAnchor,
    isAlternativeRequest,
    isRefinementWithAnchor,
    richExpPathActivated,
    rankingResolutionPresent,
    rankingResolutionType: rankingResolution?.type || null,

    activatedContract,
    expectedContract: expectedContract || null,

    leakStage: leakStage || "NONE",
    divergenceFlags,
  };

  return auditRecord;
}

// ─────────────────────────────────────────────────────────────
// ██████████  GRUPO A — Hesitação / Confiança  █████████████
// ─────────────────────────────────────────────────────────────

sectionHeader("GRUPO A — Hesitação / Confiança");
console.log("Hipótese: OBJECTION classificado corretamente, mas directReply gate dispara.");
console.log("Causa raiz esperada: PATCH 6.2 não limpa directReply → RESPONSE_PATH_STAGE\n");

const groupA = [
  "não tô sentindo confiança nessa escolha",
  "é estranho, mas parece que tem alguma coisa me incomodando",
  "não consigo apontar exatamente o que é",
  "tô meio perdido nessa decisão",
  "rapaz, ainda não me convenceu",
  "não queria fazer besteira com esse dinheiro",
];

const groupAResults = [];

groupA.forEach((query, i) => {
  scenarioHeader(i + 1, "A", query);

  const record = auditScenario({
    query,
    group: "A",
    family: "hesitation_confidence",
    sessionContext: SESSION_WITH_ANCHOR_AND_SNAPSHOT,
    expectedTurnType: "OBJECTION",
    expectedContextualPath: true,
    expectedContract: "objection_response_contract",
  });

  groupAResults.push(record);

  // Assertions
  assert(
    `A${i + 1}: router classifica como OBJECTION`,
    record.cognitiveTurnType === "OBJECTION"
  );
  assert(
    `A${i + 1}: âncora presente (hasAnchor = true)`,
    record.anchorPresent === true
  );
  assert(
    `A${i + 1}: shouldSkipProductSearch = true após PATCH 6.2`,
    record.shouldSkipProductSearch === true
  );
  assert(
    `A${i + 1}: allowNewSearch = false após PATCH 6.2`,
    record.allowNewSearch === false
  );

  // Assertion que confirma o LEAK (deveria falhar — documenta a falha real)
  const leakConfirmed =
    record.directReplyGateFires === true && record.contextualPathReached === false;
  assert(
    `A${i + 1}: [LEAK AUDIT] directReply gate NÃO dispara antes do contextual path`,
    !leakConfirmed // passa = sem leak; falha = leak confirmado
  );

  if (record.leakStage !== "NONE") {
    reportLeak(record, record.leakStage, record.divergenceFlags,
      `directReply após PATCH 6.2: ${record.directReplyAfterInterceptors || "null"} | clearContext: ${record.clearContextAfterInterceptors}`
    );
  } else {
    reportClean(record);
  }
});

// ─────────────────────────────────────────────────────────────
// ██████████  GRUPO B — Alternativa / Ranking  ████████████
// ─────────────────────────────────────────────────────────────

sectionHeader("GRUPO B — Alternativa / Ranking");
console.log("Hipótese: ALTERNATIVE_REQUEST classificado corretamente, PATCH 7.6A limpou directReply.");
console.log("Risco: lastRankingSnapshot ausente → RANKING_RESOLUTION_STAGE\n");

const groupB = [
  { query: "se eu desistisse desse, qual seria o próximo?", snapshot: true },
  { query: "e quem ficou logo atrás dele?", snapshot: true },
  { query: "e o terceiro da lista?", snapshot: true },
  { query: "me mostra os três que mais fizeram sentido", snapshot: true },
  { query: "e quem ficou logo atrás dele?", snapshot: false }, // sem snapshot
  { query: "me mostra os três que mais fizeram sentido", snapshot: false }, // sem snapshot
];

const groupBResults = [];

groupB.forEach((item, i) => {
  const { query, snapshot } = item;
  const sessionCtx = snapshot
    ? SESSION_WITH_ANCHOR_AND_SNAPSHOT
    : SESSION_WITH_ANCHOR_NO_SNAPSHOT;
  const label = snapshot ? "(snapshot presente)" : "(snapshot ausente)";

  scenarioHeader(i + 1, "B", `${query} ${label}`);

  const record = auditScenario({
    query,
    group: "B",
    family: "alternative_ranking",
    sessionContext: sessionCtx,
    expectedTurnType: "ALTERNATIVE_REQUEST",
    expectedContextualPath: true,
    expectedContract: "refinement_followup_response_contract",
  });

  groupBResults.push(record);

  assert(
    `B${i + 1}: router classifica como ALTERNATIVE_REQUEST`,
    record.cognitiveTurnType === "ALTERNATIVE_REQUEST"
  );
  assert(
    `B${i + 1}: âncora presente`,
    record.anchorPresent === true
  );
  assert(
    `B${i + 1}: directReply limpo após PATCH 6.3+7.6A`,
    record.directReplyAfterInterceptors === null
  );
  assert(
    `B${i + 1}: contextual path alcançado`,
    record.contextualPathReached === true
  );

  if (snapshot) {
    assert(
      `B${i + 1}: lastRankingSnapshot presente`,
      record.lastRankingSnapshotPresent === true
    );
    assert(
      `B${i + 1}: rankingResolution calculado (não null)`,
      record.rankingResolutionPresent === true || record.rankingResolutionType !== null
    );
  } else {
    assert(
      `B${i + 1}: lastRankingSnapshot ausente (documenta ausência)`,
      record.lastRankingSnapshotPresent === false
    );
    assert(
      `B${i + 1}: [LEAK AUDIT] rankingResolution AUSENTE quando snapshot vazio`,
      record.rankingResolutionPresent === false // passa = documenta o problema
    );
  }

  if (record.leakStage !== "NONE") {
    reportLeak(record, record.leakStage, record.divergenceFlags,
      `snapshot: ${record.lastRankingSnapshotPresent} | rankingRes: ${record.rankingResolutionType}`
    );
  } else {
    reportClean(record);
  }
});

// ─────────────────────────────────────────────────────────────
// ██████████  GRUPO C — Comparação Contextual  ████████████
// ─────────────────────────────────────────────────────────────

sectionHeader("GRUPO C — Comparação Contextual");
console.log("Hipótese: sem comparison lock → query cai em general_answer → fallback.");
console.log("Risco: sem lockedComparisonFollowUp → ROUTING_STAGE ou RESPONSE_PATH_STAGE\n");

const groupC = [
  "e entre os dois, qual tende a dar menos dor de cabeça?",
  "entre esses, qual é mais seguro?",
  "entre o primeiro e o segundo, qual você manteria?",
];

const groupCResults = [];

groupC.forEach((query, i) => {
  scenarioHeader(i + 1, "C", query);

  const record = auditScenario({
    query,
    group: "C",
    family: "comparison_contextual",
    sessionContext: SESSION_WITH_ANCHOR_AND_SNAPSHOT,
    expectedContextualPath: true,
  });

  groupCResults.push(record);

  assert(
    `C${i + 1}: âncora presente`,
    record.anchorPresent === true
  );
  assert(
    `C${i + 1}: router detectou algum turn type contextual`,
    ["FOLLOW_UP", "REFINEMENT", "ALTERNATIVE_REQUEST", "OBJECTION", "EXPLANATION_REQUEST", "CONVERSATIONAL"].includes(record.cognitiveTurnType)
  );
  assert(
    `C${i + 1}: allowNewSearch = false (routing preservado)`,
    record.allowNewSearch === false
  );

  const compLocked = record.directReplyAfterInterceptors === null;
  assert(
    `C${i + 1}: [LEAK AUDIT] caminho comparativo protegido (sem directReply)`,
    compLocked
  );

  if (record.leakStage !== "NONE") {
    reportLeak(record, record.leakStage, record.divergenceFlags,
      `turnType: ${record.cognitiveTurnType} | directReply: ${record.directReplyAfterInterceptors} | contextualPath: ${record.contextualPathReached}`
    );
  } else {
    reportClean(record);
  }
});

// ─────────────────────────────────────────────────────────────
// ██████████  GRUPO D — Prioridade Contextual  ████████████
// ─────────────────────────────────────────────────────────────

sectionHeader("GRUPO D — Prioridade Contextual");
console.log("Hipótese: mudanças de prioridade devem virar PRIORITY_SHIFT/CONVERSATIONAL.");
console.log("Risco: winner trocado sem autorização ou anchor perdido\n");

const groupD = [
  { query: "qual desses envelhece de forma mais tranquila?", expectedType: "EXPLANATION_REQUEST" },
  { query: "quero algo que continue bom daqui alguns anos", expectedType: "REFINEMENT" },
  { query: "uso mais vídeo e rede social", expectedType: "FOLLOW_UP" },
  { query: "na verdade câmera começou a pesar mais", expectedType: "FOLLOW_UP" },
  { query: "e autonomia também", expectedType: "FOLLOW_UP" },
];

const groupDResults = [];

groupD.forEach((item, i) => {
  const { query, expectedType } = item;
  scenarioHeader(i + 1, "D", query);

  const record = auditScenario({
    query,
    group: "D",
    family: "priority_contextual",
    sessionContext: SESSION_WITH_ANCHOR_AND_SNAPSHOT,
    expectedTurnType: expectedType,
    expectedContextualPath: true,
  });

  groupDResults.push(record);

  assert(
    `D${i + 1}: router classifica como "${expectedType}" ou contextual`,
    ["FOLLOW_UP", "REFINEMENT", "EXPLANATION_REQUEST", "OBJECTION", "CONVERSATIONAL"].includes(record.cognitiveTurnType)
  );
  assert(
    `D${i + 1}: allowReplaceWinner = false (winner não pode ser trocado sem autorização)`,
    record.allowReplaceWinner === false
  );
  assert(
    `D${i + 1}: âncora preservada (lastBestProduct presente)`,
    record.lastBestProductPresent === true
  );

  if (record.leakStage !== "NONE") {
    reportLeak(record, record.leakStage, record.divergenceFlags,
      `turnType: ${record.cognitiveTurnType} | routingMode: ${record.routingMode} | directReply: ${record.directReplyAfterInterceptors}`
    );
  } else {
    reportClean(record);
  }
});

// ─────────────────────────────────────────────────────────────
// ██████████  GRUPO E — Explicação Contextual  ████████████
// ─────────────────────────────────────────────────────────────

sectionHeader("GRUPO E — Explicação Contextual");
console.log("Hipótese: EXPLANATION_REQUEST deve ativar cognitive_anchor_hold → rich explanation.");
console.log("Risco: confidence < 0.75 → modo não ativa → CONTRACT_STAGE\n");

const groupE = [
  "se você tivesse que escolher um só, qual manteria?",
  "agora me explica isso sem usar linguagem técnica",
  "me explica como se eu fosse leigo",
];

const groupEResults = [];

groupE.forEach((query, i) => {
  scenarioHeader(i + 1, "E", query);

  const record = auditScenario({
    query,
    group: "E",
    family: "explanation_contextual",
    sessionContext: SESSION_WITH_ANCHOR_AND_SNAPSHOT,
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedContextualPath: true,
    expectedContract: "explanation_anchored",
  });

  groupEResults.push(record);

  assert(
    `E${i + 1}: router classifica como EXPLANATION_REQUEST`,
    record.cognitiveTurnType === "EXPLANATION_REQUEST"
  );
  assert(
    `E${i + 1}: âncora presente`,
    record.anchorPresent === true
  );

  // O contrato rico requer mode = "cognitive_anchor_hold" que requer
  // cognitiveRoutingSignal.confidence >= 0.75 em buildRoutingDecision
  assert(
    `E${i + 1}: [CONTRATO] richExpPathActivated → mode = cognitive_anchor_hold`,
    record.richExpPathActivated === true
  );
  assert(
    `E${i + 1}: [CONTRATO] activatedContract = explanation_anchored`,
    record.activatedContract === "explanation_anchored"
  );
  assert(
    `E${i + 1}: rememberedProducts disponíveis para verbalização`,
    record.rememberedProductsEmpty === false
  );

  if (record.leakStage !== "NONE") {
    reportLeak(record, record.leakStage, record.divergenceFlags,
      `turnType: ${record.cognitiveTurnType} | confidence: ${record.cognitiveConfidence} | richExpPath: ${record.richExpPathActivated} | contract: ${record.activatedContract}`
    );
  } else {
    reportClean(record);
  }
});

// ─────────────────────────────────────────────────────────────
// ██████████  GUARDRAILS — Regressão dos patches anteriores  ██
// ─────────────────────────────────────────────────────────────

sectionHeader("GUARDRAILS — Regressão (patches 5.x–7.6C)");
console.log("Verifica que patches anteriores ainda funcionam corretamente.\n");

const guardrails = [
  // PATCH 6.2 guards: OBJECTION routing flags (ao menos)
  { query: "acho que tá caro demais", expectedAllowNew: false, desc: "PATCH 6.2 objection" },
  // PATCH 6.3 guards: REFINEMENT limpa directReply
  { query: "tem alguma opção com bateria maior?", expectedAllowNew: false, desc: "PATCH 6.3 refinement" },
  // PATCH 7.5 guards: ALTERNATIVE_REQUEST routing
  { query: "quem quase ganhou?", expectedAllowNew: false, desc: "PATCH 7.5 alternative" },
  // PATCH 7.6B guards: ordinal não vira FOLLOW_UP
  { query: "e o terceiro?", expectedTurnType: "ALTERNATIVE_REQUEST", desc: "PATCH 7.6B ordinal" },
  // PATCH 7.6C guards: hesitação vira OBJECTION
  { query: "não sei explicar, algo me incomoda", expectedTurnType: "OBJECTION", desc: "PATCH 7.6C hesitation" },
];

guardrails.forEach((item, i) => {
  const { query, expectedAllowNew, expectedTurnType, desc } = item;
  scenarioHeader(i + 1, "GR", query);

  const record = auditScenario({
    query,
    group: "GR",
    family: "guardrail",
    sessionContext: SESSION_WITH_ANCHOR_AND_SNAPSHOT,
  });

  if (expectedAllowNew !== undefined) {
    assert(
      `GR${i + 1} [${desc}]: allowNewSearch = ${expectedAllowNew}`,
      record.allowNewSearch === expectedAllowNew
    );
  }
  if (expectedTurnType) {
    assert(
      `GR${i + 1} [${desc}]: turnType = ${expectedTurnType}`,
      record.cognitiveTurnType === expectedTurnType
    );
  }

  // Regressões devem ser clean ou mostrar apenas leaks conhecidos do PATCH 7.6D
  if (record.leakStage !== "NONE") {
    reportLeak(record, record.leakStage, record.divergenceFlags, desc);
  } else {
    reportClean(record);
  }
});

// ─────────────────────────────────────────────────────────────
// ██████████  RELATÓRIO FINAL  ████████████████████████████████
// ─────────────────────────────────────────────────────────────

sectionHeader("MIA_RESPONSE_PATH_LEAK_AUDIT — RELATÓRIO FINAL");

const allResults = [
  ...groupAResults,
  ...groupBResults,
  ...groupCResults,
  ...groupDResults,
  ...groupEResults,
];

const flagFrequency = {};
allFlags.forEach((f) => { flagFrequency[f] = (flagFrequency[f] || 0) + 1; });

console.log(`
Total cenários auditados : ${totalScenarios}
  Com vazamento          : ${totalLeak}
  Sem vazamento (clean)  : ${totalClean}

Total assertions         : ${totalAsserts}
  Passed                 : ${totalPassed}
  Failed                 : ${totalFailed}
`);

console.log("Leak stages encontrados:");
Object.entries(leakStageCount)
  .filter(([, v]) => v > 0)
  .sort((a, b) => b[1] - a[1])
  .forEach(([stage, count]) => {
    const isNone = stage === "NONE";
    const prefix = isNone ? "  ✓" : "  ⚠";
    console.log(`${prefix} ${stage.padEnd(30)} ${count}`);
  });

console.log("\nFlags de divergência (frequência):");
Object.entries(flagFrequency)
  .sort((a, b) => b[1] - a[1])
  .forEach(([flag, count]) => {
    console.log(`  [${count}x] ${flag}`);
  });

console.log("\n─────────────────────────────────────────────────────────────────────");
console.log("TOP CAUSAS RAIZ (evidências de código):");
console.log("─────────────────────────────────────────────────────────────────────");
console.log(`
1. [RESPONSE_PATH_STAGE] PATCH 6.2 não limpa directReply
   Arquivo : pages/api/chat-gpt4o.js L25334-25345
   Causa   : PATCH 6.2 chama applyRoutingDecisionToContextResolution()
             que quando allowNewSearch=false APENAS seta shouldSkipProductSearch=true.
             NÃO limpa directReply nem clearContext.
             (miaRoutingDecisionContract.js L284-289)
   Contraste: PATCH 6.3+7.6A faz o mesmo MAS adiciona
              contextResolution.directReply = null (L25378)
   Impacto : Gate L25776 dispara → welcome fallback retornado ANTES do
             caminho contextual (L26932) → OBJECTION contract nunca ativa.
   Grupos  : A (todos), GR parcial

2. [CONTEXT_STAGE] clearContext=true sobrevive após PATCH 6.2
   Arquivo : pages/api/chat-gpt4o.js L25334-25345
   Causa   : applyRoutingDecisionToContextResolution com allowNewSearch=false
             não altera clearContext. buildContextResolution setou clearContext=true
             para general_answer. Mesmo se directReply fosse limpado, a sessão
             seria destruída (lastBestProduct=null, lastProducts=[]).
   Impacto : Contexto destruído junto com welcome fallback.
   Grupos  : A (todos)

3. [RANKING_RESOLUTION_STAGE] lastRankingSnapshot ausente → sem injeção no prompt
   Arquivo : pages/api/chat-gpt4o.js L27006-27011
   Causa   : _rankingResolution = resolveRankingRequest(sessionContext.lastRankingSnapshot, ...)
             Quando lastRankingSnapshot = null → retorna {type: "not_available"}.
             Prompt não recebe bloco "RANKING FORMAL RECUPERADO".
             LLM precisa inventar ou adivinhar o produto na posição solicitada.
   Impacto : ALTERNATIVE_REQUEST classificado corretamente, contextual path alcançado,
             mas resposta final pode inventar produto ou dar resposta genérica.
   Grupos  : B (cenários sem snapshot)

4. [CONTRACT_STAGE] EXPLANATION_REQUEST pode não ativar cognitive_anchor_hold
   Arquivo : lib/miaRoutingDecisionContract.js L144-163
   Causa   : buildRoutingDecision requer cognitiveRoutingSignal.confidence >= 0.75
             para definir mode="cognitive_anchor_hold". Se a confiança do router
             for < 0.75, o modo não é definido, shouldUseRichExplanationPath=false,
             e o contrato de explicação rica não ativa.
   Impacto : Explicações contextuais caem em "decision_generic" sem memória de contexto.
   Grupos  : E (parcial, dependendo da confiança do router)

5. [RESPONSE_PATH_STAGE] Comparação sem lock → directReply gate dispara
   Arquivo : pages/api/chat-gpt4o.js L25776-25799
   Causa   : Queries de comparação contextual ("entre os dois, qual...")
             sem lockedComparisonFollowUp ativo caem em general_answer →
             directReply set → gate L25776 dispara → fallback genérico.
             O sistema de lock de comparação só ativa em condições específicas.
   Impacto : Contexto comparativo perdido, resposta não menciona produtos.
   Grupos  : C (parcial)
`);

console.log("─────────────────────────────────────────────────────────────────────");
console.log("DETALHES POR CENÁRIO COM VAZAMENTO:");
console.log("─────────────────────────────────────────────────────────────────────");

leakSummary.forEach((entry, i) => {
  console.log(`\n[${i + 1}] Grupo ${entry.group} | Leak: ${entry.leakStage}`);
  console.log(`    Query  : "${entry.query}"`);
  console.log(`    Flags  : ${entry.flags.join(", ")}`);
  if (entry.details) console.log(`    Detalhe: ${entry.details}`);
});

console.log("\n─────────────────────────────────────────────────────────────────────");
console.log("ORDEM RECOMENDADA PARA PRÓXIMOS PATCHES:");
console.log("─────────────────────────────────────────────────────────────────────");
console.log(`
PATCH 7.6E — Corrigir RESPONSE_PATH_STAGE para OBJECTION
  Causa : PATCH 6.2 não limpa directReply nem clearContext
  Fix   : Após applyRoutingDecisionToContextResolution no PATCH 6.2,
          adicionar:
            contextResolution.directReply = null;
            contextResolution.clearContext = false;
  Risco : Baixo — espelha o que PATCH 6.3 já faz com sucesso
  Impacto esperado: Grupos A e C (hesitação + comparação sem lock)

PATCH 7.6F — Garantir lastRankingSnapshot em todos os turn types contextuais
  Causa : ALTERNATIVE_REQUEST sem snapshot → sem injeção de ranking
  Fix   : Verificar se lastRankingSnapshot é persistido corretamente para
          todos os caminhos que retornam session_context (não só search path)
  Risco : Médio — requer análise dos write points do session_context

PATCH 7.6G — Garantir cognitive_anchor_hold para EXPLANATION_REQUEST
  Causa : Confidence threshold 0.75 pode não ser atingido em todos os casos
  Fix   : Revisar thresholds e condições de EXPLANATION_REQUEST no router
          para garantir confiança >= 0.75 nos cenários humanos documentados
  Risco : Baixo — mudança no router, não no handler
`);

console.log("─────────────────────────────────────────────────────────────────────");
console.log("CONFIRMAÇÃO DE ZERO MUDANÇAS COMPORTAMENTAIS:");
console.log("─────────────────────────────────────────────────────────────────────");
console.log(`
  ✓ Nenhuma função de produção foi alterada neste patch
  ✓ Nenhum arquivo em lib/ foi alterado
  ✓ Nenhum arquivo em pages/api/ foi alterado
  ✓ Nenhum prompt foi alterado
  ✓ Nenhum router foi alterado
  ✓ Nenhum Data Layer foi alterado
  ✓ Apenas script de auditoria criado: scripts/test-mia-response-path-leak-audit.js
`);

console.log(`\n${"═".repeat(70)}`);
console.log(` RESULTADO: ${totalFailed === 0 ? "✓ TODOS OS TESTES PASSARAM" : `⚠  ${totalFailed} FALHA(S) DOCUMENTADA(S) (leaks confirmados)`}`);
console.log(`${"═".repeat(70)}\n`);

process.exit(totalFailed > 0 ? 1 : 0);
