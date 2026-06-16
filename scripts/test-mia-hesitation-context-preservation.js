/**
 * PATCH 7.6C — Hesitation / Uncertainty Context Preservation
 *
 * Verifica que frases de hesitação/dúvida com âncora ativa NÃO caem em
 * UNKNOWN → fallback, mas são classificadas como OBJECTION e preservam contexto.
 *
 * Causa raiz corrigida:
 *   "não sei explicar", "to na dúvida", "não me convenceu" etc. não tinham
 *   família semântica no router. Caíam em UNKNOWN → mode=search → fallback.
 *
 * Correção (PATCH 7.6C):
 *   Nova função detectsHesitationSignal com 6 famílias semânticas.
 *   Resolvido como OBJECTION no step 4.5 — reutiliza PATCH 6.2 interceptor.
 *   Zero handler changes: allowNewSearch=false, shouldPreserveAnchor=true já ativos.
 *
 * Grupos:
 *   1 — Família A: Dúvida explícita
 *   2 — Família B: Indecisão
 *   3 — Família C: Não saber explicar
 *   4 — Família D: Falta de segurança
 *   5 — Família E: Não convencimento
 *   6 — Família F: Hesitação curta informal (standalone)
 *   7 — Guardrails: frases de nova busca NÃO são hesitação
 *   8 — Pipeline: allowNewSearch=false, shouldPreserveAnchor=true, contextual path
 *   9 — Regressões: patches anteriores sem impacto
 *
 * Usage: node scripts/test-mia-hesitation-context-preservation.js
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

const SNAP3 = buildRankingSnapshot([WINNER, P2, P3], WINNER);

const SESSION = {
  lastBestProduct: WINNER,
  lastProductMentioned: WINNER.product_name,
  lastRankingSnapshot: SNAP3,
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
// Pipeline simulation: mirrors PATCH 6.2 interceptor
// ─────────────────────────────────────────────────────────────

function simLooksLikeAmbiguousFollowUp(raw = "") {
  const q = raw.toLowerCase().trim();
  if (!q || q.length <= 14) return true;
  if (/^(esse|essa|isso|aquele|aquela|ele|ela)\b/.test(q)) return true;
  if (/^(sim|nao|ok|blz|beleza|pode|vai)$/.test(q)) return true;
  return false;
}

function simulatePipeline(query, { hasAnchor = true, sessionContext = SESSION } = {}) {
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

  // PATCH 6.2 — OBJECTION interceptor (handles hesitation resolved as OBJECTION)
  if (cogResult.turnType === "OBJECTION" && hasAnchor) {
    rd.allowNewSearch = false; rd.allowReplaceWinner = false; rd.shouldPreserveAnchor = true;
    applyRoutingDecisionToContextResolution(rd, ctxRes);
  }
  // PATCH 6.3 + 7.6A — REFINEMENT / ALTERNATIVE_REQUEST
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

  return {
    turnType: cogResult.turnType,
    hesitationSignal: cogResult.signals?.hesitationReaction,
    reasons: cogResult.reasons,
    allowNewSearch: !!rd.allowNewSearch,
    allowReplaceWinner: !!rd.allowReplaceWinner,
    shouldPreserveAnchor: !!rd.shouldPreserveAnchor,
    entersContextualPath,
  };
}

// ─────────────────────────────────────────────────────────────
// Grupo 1 — Família A: Dúvida explícita
// ─────────────────────────────────────────────────────────────

section("Grupo 1 — Família A: Dúvida explícita");

const FAMILY_A = [
  "to na dúvida",
  "tô na dúvida",
  "tô na dúvida ainda",
  "to na dúvida ainda",
  "estou em dúvida",
  "continuo em dúvida",
  "fiquei na dúvida",
  "me deixou em dúvida",
  "ainda to em dúvida",
];

for (const q of FAMILY_A) {
  const r = classify(q);
  assert(
    `1: "${q}" → OBJECTION (hesitation)`,
    r.turnType === "OBJECTION"
  );
  assert(
    `1: "${q}" → subtype = hesitation`,
    r.signals?.hesitationReaction?.subtype === "hesitation"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 2 — Família B: Indecisão
// ─────────────────────────────────────────────────────────────

section("Grupo 2 — Família B: Indecisão");

const FAMILY_B = [
  "to indeciso",
  "tô indeciso",
  "estou indeciso",
  "fiquei indeciso",
  "não consigo decidir",
  "não decidi ainda",
  "ainda não decidi",
];

for (const q of FAMILY_B) {
  const r = classify(q);
  assert(
    `2: "${q}" → OBJECTION (indecision)`,
    r.turnType === "OBJECTION"
  );
  assert(
    `2: "${q}" → subtype = indecision`,
    r.signals?.hesitationReaction?.subtype === "indecision"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 3 — Família C: Não saber explicar
// ─────────────────────────────────────────────────────────────

section("Grupo 3 — Família C: Não saber explicar");

const FAMILY_C = [
  "não sei explicar",
  "não sei dizer",
  "não sei bem",
  "não sei direito",
  "não sei ao certo",
  "não sei o que me incomoda",
  "não sei o que falta",
  "não sei o que eu quero",
];

for (const q of FAMILY_C) {
  const r = classify(q);
  assert(
    `3: "${q}" → OBJECTION (not_sure)`,
    r.turnType === "OBJECTION"
  );
  assert(
    `3: "${q}" → subtype = not_sure`,
    r.signals?.hesitationReaction?.subtype === "not_sure"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 4 — Família D: Falta de segurança
// ─────────────────────────────────────────────────────────────

section("Grupo 4 — Família D: Falta de segurança");

const FAMILY_D = [
  "não tô seguro",
  "não estou seguro",
  "não fiquei tranquilo",
  "não me sinto seguro",
  "me deixou inseguro",
  "me sinto inseguro",
  "fiquei inseguro",
];

for (const q of FAMILY_D) {
  const r = classify(q);
  assert(
    `4: "${q}" → OBJECTION (not_sure)`,
    r.turnType === "OBJECTION"
  );
  assert(
    `4: "${q}" → hesitation detected`,
    r.signals?.hesitationReaction?.detected === true
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 5 — Família E: Não convencimento
// ─────────────────────────────────────────────────────────────

section("Grupo 5 — Família E: Não convencimento");

const FAMILY_E = [
  "não me convenceu",
  "ainda não me convenceu",
  "não senti firmeza",
  "não me ganhou",
  "não curti muito",
  "não curti tanto",
];

for (const q of FAMILY_E) {
  const r = classify(q);
  assert(
    `5: "${q}" → OBJECTION (not_convinced)`,
    r.turnType === "OBJECTION"
  );
  assert(
    `5: "${q}" → subtype = not_convinced`,
    r.signals?.hesitationReaction?.subtype === "not_convinced"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 6 — Família F: Hesitação curta informal (com âncora)
// ─────────────────────────────────────────────────────────────

section("Grupo 6 — Família F: Hesitação curta informal (standalone)");

const FAMILY_F_WITH_ANCHOR = [
  "hmm",
  "hmmm",
  "hmmmm",
  "sei lá",
  "sei não",
  "não sei",
  "talvez",
];

for (const q of FAMILY_F_WITH_ANCHOR) {
  const r = classify(q);
  assert(
    `6: "${q}" (com âncora) → OBJECTION (hesitation)`,
    r.turnType === "OBJECTION"
  );
  assert(
    `6: "${q}" (com âncora) → hesitation detected`,
    r.signals?.hesitationReaction?.detected === true
  );
}

// Sem âncora: hesitação curta NÃO deve forçar contexto
for (const q of ["hmm", "sei lá", "talvez", "não sei"]) {
  const r = classifyNoAnchor(q);
  assert(
    `6: "${q}" (SEM âncora) → NÃO é OBJECTION`,
    r.turnType !== "OBJECTION"
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 7 — Guardrails: nova busca NÃO vira hesitação
// ─────────────────────────────────────────────────────────────

section("Grupo 7 — Guardrails: nova busca e comparação NÃO são hesitação");

const GUARDRAIL_CASES = [
  // New search intent — should NOT be hesitation
  "não sei qual celular comprar",
  "não sei qual notebook escolher",
  "não sei o que comprar",
  "não sei o que escolher",
  // Comparison intent — should NOT be hesitation
  "estou em dúvida entre iPhone e Samsung",
];

for (const q of GUARDRAIL_CASES) {
  const r = classify(q);
  assert(
    `7: "${q}" — NÃO é hesitação (guarda de nova busca/comparação)`,
    r.signals?.hesitationReaction?.detected !== true
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 8 — Pipeline: allowNewSearch=false, shouldPreserveAnchor=true
// ─────────────────────────────────────────────────────────────

section("Grupo 8 — Pipeline: routing preserva âncora e bloqueia nova busca");

const PIPELINE_CASES = [
  "não sei explicar",
  "to na dúvida ainda",
  "não me convenceu",
  "to indeciso",
  "não tô seguro",
];

for (const q of PIPELINE_CASES) {
  const p = simulatePipeline(q);

  assert(
    `8: "${q}" → OBJECTION (hesitation routing)`,
    p.turnType === "OBJECTION"
  );
  assert(
    `8: "${q}" → entra no contextual path`,
    p.entersContextualPath === true
  );
  assert(
    `8: "${q}" → allowNewSearch = false`,
    p.allowNewSearch === false
  );
  assert(
    `8: "${q}" → allowReplaceWinner = false`,
    p.allowReplaceWinner === false
  );
  assert(
    `8: "${q}" → shouldPreserveAnchor = true`,
    p.shouldPreserveAnchor === true
  );
}

// Sem âncora: não deve forçar contextual
{
  const p = simulatePipeline("não sei explicar", { hasAnchor: false, sessionContext: {} });
  assert(
    "8: sem âncora — NÃO entra no contextual path (guardrail seguro)",
    p.entersContextualPath === false
  );
  assert(
    "8: sem âncora — allowNewSearch permanece livre",
    p.allowNewSearch === true
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 9 — Regressões: patches anteriores intactos
// ─────────────────────────────────────────────────────────────

section("Grupo 9 — Regressões: patches anteriores");

const REGRESSION_CASES = [
  // PATCH 6.x
  { query: "acho caro",                      expected: "OBJECTION" },
  { query: "pesou no bolso",                  expected: "OBJECTION" },
  { query: "não gostei",                      expected: "OBJECTION" },
  // PATCH 7.5 / 7.6A
  { query: "quem quase ganhou?",              expected: "ALTERNATIVE_REQUEST" },
  { query: "qual o plano B?",                 expected: "ALTERNATIVE_REQUEST" },
  { query: "top 3",                           expected: "ALTERNATIVE_REQUEST" },
  // PATCH 7.6B
  { query: "e o terceiro?",                   expected: "ALTERNATIVE_REQUEST" },
  { query: "e o quarto?",                     expected: "ALTERNATIVE_REQUEST" },
  // Other turn types
  { query: "tem algum mais barato?",          expected: "REFINEMENT" },
  { query: "por que você recomendou esse?",   expected: "EXPLANATION_REQUEST" },
  { query: "e a bateria?",                    expected: "FOLLOW_UP" },
  { query: "ok entendi",                      expected: "REACTION" },
];

for (const { query, expected } of REGRESSION_CASES) {
  const r = classify(query);
  assert(
    `9: "${query}" → ${expected}`,
    r.turnType === expected
  );
}

// ─────────────────────────────────────────────────────────────
// Grupo 10 — FALLBACK_TRIGGERED_UNEXPECTEDLY não ocorre mais
// ─────────────────────────────────────────────────────────────

section("Grupo 10 — FALLBACK_TRIGGERED_UNEXPECTEDLY não ocorre mais (GAP-3 fechado)");

const GAP3_QUERIES = [
  "não sei explicar",
  "to na dúvida ainda",
  "to indeciso",
  "ainda em dúvida",
  "não sei ao certo",
];

for (const q of GAP3_QUERIES) {
  const r = classify(q);
  assert(
    `10: "${q}" — NÃO é UNKNOWN (GAP-3 fechado)`,
    r.turnType !== "UNKNOWN"
  );
  assert(
    `10: "${q}" — NÃO é CONVERSATIONAL (contexto preservado)`,
    r.turnType !== "CONVERSATIONAL"
  );
  assert(
    `10: "${q}" → OBJECTION com hesitation_reaction_detected`,
    r.turnType === "OBJECTION" &&
    r.reasons?.includes("hesitation_reaction_detected")
  );
}

// ─────────────────────────────────────────────────────────────
// Final
// ─────────────────────────────────────────────────────────────

console.log(`\n\nResultados: ${passed} passando / ${failed} falhando (total: ${passed + failed})\n`);

if (failed > 0) process.exit(1);
