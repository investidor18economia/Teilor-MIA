/**
 * PATCH 7.6B — Ordinal Alternative Request Router Guard
 *
 * Verifica que ordinais explícitos de ranking (terceiro, quarto, quinto…)
 * são classificados como ALTERNATIVE_REQUEST e não como FOLLOW_UP.
 *
 * Causa raiz corrigida:
 *   `_hasAltFollowUpVocab` em `detectsFollowUpSignal` não incluía ordinais ≥ 3.
 *   Queries como "e o terceiro?" eram capturadas na step 8 (FOLLOW_UP) antes
 *   de chegarem à step 8.5 (ALTERNATIVE_REQUEST).
 *
 * Correção (PATCH 7.6B):
 *   `_hasOrdinalRankVocab` adicionado ao guard — cede para ALTERNATIVE_REQUEST
 *   quando a query é curta (≤5 palavras) ou contém vocabulário de contexto de ranking.
 *
 * Grupos:
 *   1 — Ordinais rank 3+ viram ALTERNATIVE_REQUEST
 *   2 — requestedRank correto para cada ordinal
 *   3 — FOLLOW_UP genérico preservado (atributos puros)
 *   4 — Sem falso positivo em frases longas sem contexto de ranking
 *   5 — Ranking resolution end-to-end após correção (com 7.6A ativo)
 *   6 — Regressões: patches anteriores não afetados
 *
 * Usage: node scripts/test-mia-ordinal-alternative-router-guard.js
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

const SESSION = {
  lastBestProduct: WINNER,
  lastProductMentioned: WINNER.product_name,
  lastRankingSnapshot: SNAP5,
};

function classify(query) {
  return classifyMiaTurn({
    originalQuery: query,
    hasActiveAnchor: true,
    lastBestProduct: WINNER,
    sessionContext: SESSION,
    contextResolution: {},
    detectedIntent: "search",
  });
}

function classifyNoAnchor(query) {
  return classifyMiaTurn({
    originalQuery: query,
    hasActiveAnchor: false,
    lastBestProduct: null,
    sessionContext: {},
    contextResolution: {},
    detectedIntent: "search",
  });
}

// ─────────────────────────────────────────────────────────────
// Interceptor pipeline simulation (mirrors 7.6A test helper)
// Used to confirm end-to-end contextual path entry
// ─────────────────────────────────────────────────────────────

function simLooksLikeAmbiguousFollowUp(raw = "") {
  const q = raw.toLowerCase().trim();
  if (!q || q.length <= 14) return true;
  if (/^(esse|essa|isso|aquele|aquela|ele|ela)\b/.test(q)) return true;
  if (/^(sim|nao|ok|blz|beleza|pode|vai)$/.test(q)) return true;
  return false;
}

function simulateFullPipeline(query, { hasAnchor = true, sessionContext = SESSION } = {}) {
  const cogResult = classifyMiaTurn({
    originalQuery: query,
    hasActiveAnchor: hasAnchor,
    lastBestProduct: sessionContext?.lastBestProduct ?? null,
    sessionContext,
    contextResolution: {},
    detectedIntent: "search",
  });

  const signals = {
    hasClearNewCommercialSearch: false,
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

  const ctxRes = { shouldSkipProductSearch: false, directReply: null, clearContext: false, mode: null };
  const rd = buildRoutingDecision({
    userMessage: query, resolvedQuery: query,
    contextResolution: ctxRes, sessionContext,
    incomingSessionContext: {}, intent: "search", contextAction: "",
    detectedBudget: null, detectedPriority: "", signals, cognitiveRoutingSignal: null,
  });
  applyRoutingDecisionToContextResolution(rd, ctxRes);

  // PATCH 6.2 — OBJECTION
  if (cogResult.turnType === "OBJECTION" && hasAnchor) {
    rd.allowNewSearch = false; rd.allowReplaceWinner = false; rd.shouldPreserveAnchor = true;
    applyRoutingDecisionToContextResolution(rd, ctxRes);
  }
  // PATCH 6.3 + PATCH 7.6A — REFINEMENT / ALTERNATIVE_REQUEST
  if ((cogResult.turnType === "REFINEMENT" || cogResult.turnType === "ALTERNATIVE_REQUEST") && hasAnchor) {
    rd.allowNewSearch = false; rd.allowReplaceWinner = false; rd.shouldPreserveAnchor = true;
    applyRoutingDecisionToContextResolution(rd, ctxRes);
    ctxRes.directReply = null; ctxRes.clearContext = false;
    if (!ctxRes.mode || ctxRes.mode === "general_answer") ctxRes.mode = "refinement_followup";
  }

  const entersContextualPath =
    !!ctxRes.shouldSkipProductSearch ||
    rd.mode === "context_decision" ||
    rd.mode === "anchored_reaction";

  const isAltReq = cogResult.turnType === "ALTERNATIVE_REQUEST" && hasAnchor;
  const altSigs  = cogResult.signals?.alternativeRequest ?? null;
  let rankingResolution = null;
  if (entersContextualPath && isAltReq && altSigs) {
    rankingResolution = resolveRankingRequest(sessionContext?.lastRankingSnapshot ?? null, altSigs);
  }

  return {
    turnType: cogResult.turnType,
    altRequestSignals: altSigs,
    entersContextualPath,
    rankingResolution,
  };
}

// ─────────────────────────────────────────────────────────────
// Grupo 1 — Ordinais rank 3+ → ALTERNATIVE_REQUEST
// ─────────────────────────────────────────────────────────────

section("Grupo 1 — Ordinais rank 3+ viram ALTERNATIVE_REQUEST");

const ORDINAL_CASES = [
  { query: "e o terceiro?",          expectedRank: 3 },
  { query: "e a terceira?",          expectedRank: 3 },
  { query: "e o quarto?",            expectedRank: 4 },
  { query: "e a quarta?",            expectedRank: 4 },
  { query: "e o quinto?",            expectedRank: 5 },
  { query: "e a quinta?",            expectedRank: 5 },
  { query: "qual foi o terceiro?",   expectedRank: 3 },
  { query: "qual o quarto?",         expectedRank: 4 },
  { query: "quem ficou em quinto?",  expectedRank: 5 },
  { query: "e o décimo?",            expectedRank: 10 },
];

for (const { query, expectedRank } of ORDINAL_CASES) {
  const r = classify(query);
  assert(
    `1: "${query}" → ALTERNATIVE_REQUEST`,
    r.turnType === "ALTERNATIVE_REQUEST"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 2 — requestedRank correto para cada ordinal
// ─────────────────────────────────────────────────────────────

section("Grupo 2 — requestedRank correto");

const RANK_CASES = [
  { query: "e o terceiro?",         expectedRank: 3  },
  { query: "e a terceira?",         expectedRank: 3  },
  { query: "qual foi o quarto?",    expectedRank: 4  },
  { query: "qual a quinta opção?",  expectedRank: 5  },
  { query: "e o sexto?",            expectedRank: 6  },
  { query: "e o décimo?",           expectedRank: 10 },
];

for (const { query, expectedRank } of RANK_CASES) {
  const r = classify(query);
  assert(
    `2: "${query}" → requestedRank = ${expectedRank}`,
    r.signals?.alternativeRequest?.requestedRank === expectedRank
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 3 — FOLLOW_UP genérico preservado (atributos puros)
// ─────────────────────────────────────────────────────────────

section("Grupo 3 — FOLLOW_UP genérico preservado (atributos puros)");

const FOLLOWUP_CASES = [
  "e a bateria?",
  "e a câmera?",
  "e o preço?",
  "e a tela?",
  "e a garantia?",
  "e o desempenho?",
  "e o armazenamento?",
  "e a autonomia?",
];

for (const query of FOLLOWUP_CASES) {
  const r = classify(query);
  assert(
    `3: "${query}" → FOLLOW_UP (não vira ALTERNATIVE_REQUEST)`,
    r.turnType === "FOLLOW_UP"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 4 — Sem falso positivo em frases longas sem ranking context
// ─────────────────────────────────────────────────────────────

section("Grupo 4 — Sem falso positivo em frases longas");

const LONG_SENTENCES = [
  // Frase longa com ordinal mas sem contexto de ranking → NÃO deve ser ALTERNATIVE_REQUEST
  { query: "estou comprando meu terceiro celular esse ano", isFalsePositive: true },
  { query: "e meu quarto aparelho da marca preferida",     isFalsePositive: true },
  // Frase curta com ordinal → DEVE ser ALTERNATIVE_REQUEST (contexto de ranking implícito)
  { query: "e o terceiro?",                                isFalsePositive: false },
  // Frase com ordinal + contexto de ranking → DEVE ser ALTERNATIVE_REQUEST mesmo sendo longa
  { query: "qual foi o terceiro colocado",                 isFalsePositive: false },
];

for (const { query, isFalsePositive } of LONG_SENTENCES) {
  const r = classify(query);
  if (isFalsePositive) {
    assert(
      `4: "${query}" — NÃO vira ALTERNATIVE_REQUEST (frase longa sem ranking context)`,
      r.turnType !== "ALTERNATIVE_REQUEST"
    );
  } else {
    assert(
      `4: "${query}" → ALTERNATIVE_REQUEST (ordinal com contexto de ranking)`,
      r.turnType === "ALTERNATIVE_REQUEST"
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Grupo 5 — Sem âncora: ordinais não forçam contextual path
// ─────────────────────────────────────────────────────────────

section("Grupo 5 — Sem âncora: guardrail seguro");

{
  const r = classifyNoAnchor("e o terceiro?");
  // Without anchor: detectsAlternativeRequestSignal returns NONE
  // Without anchor: detectsFollowUpSignal also returns false (guard at top)
  assert(
    "5.1: sem âncora — não detecta ALTERNATIVE_REQUEST (guard hasActiveAnchor)",
    r.turnType !== "ALTERNATIVE_REQUEST"
  );
  assert(
    "5.2: sem âncora — não detecta FOLLOW_UP (hasActiveAnchor guard)",
    r.turnType !== "FOLLOW_UP"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 6 — Pipeline end-to-end: 7.6B + 7.6A = ranking injection
// ─────────────────────────────────────────────────────────────

section("Grupo 6 — End-to-end: ordinal → ALTERNATIVE_REQUEST → contextual path → ranking resolution");

const PIPELINE_CASES = [
  { query: "e o terceiro?",         expectedRank: 3, expectedProduct: P3.product_name },
  { query: "e o quarto?",           expectedRank: 4, expectedProduct: P4.product_name },
  { query: "e o quinto?",           expectedRank: 5, expectedProduct: P5.product_name },
  { query: "qual foi o terceiro?",  expectedRank: 3, expectedProduct: P3.product_name },
  { query: "quem ficou em quinto?", expectedRank: 5, expectedProduct: P5.product_name },
];

for (const { query, expectedRank, expectedProduct } of PIPELINE_CASES) {
  const p = simulateFullPipeline(query);

  assert(
    `6: "${query}" → ALTERNATIVE_REQUEST`,
    p.turnType === "ALTERNATIVE_REQUEST"
  );
  assert(
    `6: "${query}" → entra no contextual path`,
    p.entersContextualPath === true
  );
  assert(
    `6: "${query}" → rankingResolution presente`,
    p.rankingResolution !== null
  );
  assert(
    `6: "${query}" → resolves rank ${expectedRank}`,
    p.rankingResolution?.rank === expectedRank
  );
  assert(
    `6: "${query}" → produto correto: ${expectedProduct}`,
    p.rankingResolution?.product?.product_name === expectedProduct
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 7 — Regressões: patches anteriores não afetados
// ─────────────────────────────────────────────────────────────

section("Grupo 7 — Regressões: patches anteriores");

const REGRESSION_CASES = [
  // PATCH 5.x / 6.x turn types
  { query: "acho caro",                     expected: "OBJECTION" },
  { query: "tem algum mais barato?",        expected: "REFINEMENT" },
  { query: "por que você recomendou esse?", expected: "EXPLANATION_REQUEST" },
  { query: "e a bateria?",                  expected: "FOLLOW_UP" },
  { query: "ok entendi",                    expected: "REACTION" },
  // PATCH 7.5 — ALTERNATIVE_REQUEST (runner-up)
  { query: "qual seria o plano B?",         expected: "ALTERNATIVE_REQUEST" },
  { query: "quem quase ganhou?",            expected: "ALTERNATIVE_REQUEST" },
  { query: "qual o segundo lugar?",         expected: "ALTERNATIVE_REQUEST" },
  // Top-N
  { query: "top 3",                         expected: "ALTERNATIVE_REQUEST" },
  { query: "top 5",                         expected: "ALTERNATIVE_REQUEST" },
  // PATCH 7.6B — novas classificações
  { query: "e o terceiro?",                 expected: "ALTERNATIVE_REQUEST" },
  { query: "e o quarto?",                   expected: "ALTERNATIVE_REQUEST" },
  { query: "e o quinto?",                   expected: "ALTERNATIVE_REQUEST" },
];

for (const { query, expected } of REGRESSION_CASES) {
  const r = classify(query);
  assert(
    `7: "${query}" → ${expected}`,
    r.turnType === expected
  );
}

// FOLLOW_UP genérico NÃO deve regredir
const FOLLOWUP_REGRESSION = [
  "e a bateria?",
  "e a câmera?",
  "e o preço?",
  "e a tela?",
];

for (const query of FOLLOWUP_REGRESSION) {
  const r = classify(query);
  assert(
    `7: "${query}" → FOLLOW_UP (sem regressão)`,
    r.turnType === "FOLLOW_UP"
  );
}

// ─────────────────────────────────────────────────────────────
// Final
// ─────────────────────────────────────────────────────────────

console.log(`\n\nResultados: ${passed} passando / ${failed} falhando (total: ${passed + failed})\n`);

if (failed > 0) process.exit(1);
