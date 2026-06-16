/**
 * PATCH 7.5 — Alternative Retrieval Governance
 *
 * Tests for:
 *   - detectsAlternativeRequestSignal (via classifyMiaTurn)
 *   - resolveRankingRequest
 *   - ALTERNATIVE_REQUEST turn type classification
 *
 * Groups:
 *   1 — Runner-up detection (rank 2 families)
 *   2 — Explicit ordinal positions (rank 3–5)
 *   3 — Top-N detection
 *   4 — Boundary / edge cases (empty snapshot, out-of-bounds, no request)
 *   5 — Invariants (no recalculation, no mutation, pureness)
 *   6 — Turn type classification (ALTERNATIVE_REQUEST vs REFINEMENT vs FOLLOW_UP)
 *   7 — Preservation of previous patches (zero regression)
 *
 * Usage: node scripts/test-mia-alternative-governance.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
} from "../lib/miaCognitiveRouter.js";

import {
  resolveRankingRequest,
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

function classifyWithAnchor(query) {
  return classifyMiaTurn({
    originalQuery: query,
    hasActiveAnchor: true,
    lastBestProduct: { product_name: "Galaxy S24 FE" },
  });
}

function altSignal(query) {
  return classifyWithAnchor(query).signals?.alternativeRequest;
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const P1 = { product_name: "Galaxy S24 FE",       price: "R$ 2.499", source: "Magalu",  finalScoreEngineScore: 823 };
const P2 = { product_name: "Poco F4 GT",           price: "R$ 1.799", source: "KaBuM",   finalScoreEngineScore: 802 };
const P3 = { product_name: "Motorola Edge 50 Neo", price: "R$ 1.599", source: "Amazon",  finalScoreEngineScore: 775 };
const P4 = { product_name: "Moto G85",             price: "R$ 1.299", source: null,      finalScoreEngineScore: 741 };
const P5 = { product_name: "Redmi Note 13",        price: "R$ 1.099", source: "Amazon",  finalScoreEngineScore: 710 };

const SNAP5 = buildRankingSnapshot([P1, P2, P3, P4, P5], P1);
const SNAP3 = buildRankingSnapshot([P1, P2, P3], P1);
const SNAP1 = buildRankingSnapshot([P1], P1);

// ─────────────────────────────────────────────────────────────
// Grupo 1 — Runner-up detection (rank 2 families)
// ─────────────────────────────────────────────────────────────

section("Grupo 1 — Runner-up (rank 2) detection");

assert(
  "plano B → rank 2 detected",
  altSignal("qual seria o plano B?")?.detected === true &&
    altSignal("qual seria o plano B?")?.requestedRank === 2
);

assert(
  "quem ficou em segundo → rank 2",
  altSignal("quem ficou em segundo?")?.detected === true &&
    altSignal("quem ficou em segundo?")?.requestedRank === 2
);

assert(
  "e depois dele → rank 2",
  altSignal("e depois dele?")?.detected === true &&
    altSignal("e depois dele?")?.requestedRank === 2
);

assert(
  "e depois desse → rank 2",
  altSignal("e depois desse?")?.detected === true &&
    altSignal("e depois desse?")?.requestedRank === 2
);

assert(
  "segunda opção → rank 2",
  altSignal("tem uma segunda opção?")?.detected === true &&
    altSignal("tem uma segunda opção?")?.requestedRank === 2
);

assert(
  "segundo lugar → rank 2",
  altSignal("quem ficou em segundo lugar?")?.detected === true &&
    altSignal("quem ficou em segundo lugar?")?.requestedRank === 2
);

assert(
  "o próximo → rank 2",
  altSignal("e o próximo?")?.detected === true &&
    altSignal("e o próximo?")?.requestedRank === 2
);

assert(
  "se eu não quiser esse → rank 2",
  altSignal("se eu não quiser esse qual seria?")?.detected === true &&
    altSignal("se eu não quiser esse qual seria?")?.requestedRank === 2
);

assert(
  "reserva → rank 2",
  altSignal("tem um reserva?")?.detected === true &&
    altSignal("tem um reserva?")?.requestedRank === 2
);

assert(
  "quase ganhou → rank 2",
  altSignal("quem quase ganhou?")?.detected === true &&
    altSignal("quem quase ganhou?")?.requestedRank === 2
);

// ─────────────────────────────────────────────────────────────
// Grupo 2 — Explicit ordinal positions (rank 3–5)
// ─────────────────────────────────────────────────────────────

section("Grupo 2 — Posições ordinais explícitas (rank 3–5)");

assert(
  "qual o terceiro? → rank 3",
  altSignal("qual o terceiro?")?.detected === true &&
    altSignal("qual o terceiro?")?.requestedRank === 3
);

assert(
  "e o quarto? → rank 4",
  altSignal("e o quarto?")?.detected === true &&
    altSignal("e o quarto?")?.requestedRank === 4
);

assert(
  "quinto lugar → rank 5",
  altSignal("quem ficou em quinto lugar?")?.detected === true &&
    altSignal("quem ficou em quinto lugar?")?.requestedRank === 5
);

assert(
  "terceiro lugar → rank 3",
  altSignal("terceiro lugar?")?.detected === true &&
    altSignal("terceiro lugar?")?.requestedRank === 3
);

assert(
  "e o quinto modelo? → rank 5",
  altSignal("e o quinto modelo?")?.detected === true &&
    altSignal("e o quinto modelo?")?.requestedRank === 5
);

// ─────────────────────────────────────────────────────────────
// Grupo 3 — Top-N detection
// ─────────────────────────────────────────────────────────────

section("Grupo 3 — Top-N");

assert(
  "top 3 → topN 3",
  altSignal("top 3")?.detected === true &&
    altSignal("top 3")?.requestedTopN === 3
);

assert(
  "top 5 → topN 5",
  altSignal("top 5")?.detected === true &&
    altSignal("top 5")?.requestedTopN === 5
);

assert(
  "top 10 → topN 10",
  altSignal("top 10")?.detected === true &&
    altSignal("top 10")?.requestedTopN === 10
);

assert(
  "melhores 3 → topN 3",
  altSignal("quais os melhores 3?")?.detected === true &&
    altSignal("quais os melhores 3?")?.requestedTopN === 3
);

assert(
  "primeiros 5 → topN 5",
  altSignal("primeiros 5")?.detected === true &&
    altSignal("primeiros 5")?.requestedTopN === 5
);

// ─────────────────────────────────────────────────────────────
// Grupo 3B — resolveRankingRequest: single rank retrieval
// ─────────────────────────────────────────────────────────────

section("Grupo 3B — resolveRankingRequest: single rank");

assert(
  "rank 1 → winner (P1)",
  resolveRankingRequest(SNAP5, { requestedRank: 1 }).type === "single_rank" &&
    resolveRankingRequest(SNAP5, { requestedRank: 1 }).product.product_name === "Galaxy S24 FE"
);

assert(
  "rank 2 → P2",
  resolveRankingRequest(SNAP5, { requestedRank: 2 }).product.product_name === "Poco F4 GT"
);

assert(
  "rank 3 → P3",
  resolveRankingRequest(SNAP5, { requestedRank: 3 }).product.product_name === "Motorola Edge 50 Neo"
);

assert(
  "rank 5 → P5",
  resolveRankingRequest(SNAP5, { requestedRank: 5 }).product.product_name === "Redmi Note 13"
);

// ─────────────────────────────────────────────────────────────
// Grupo 3C — resolveRankingRequest: top-N retrieval
// ─────────────────────────────────────────────────────────────

section("Grupo 3C — resolveRankingRequest: top-N");

assert(
  "top 3 retorna 3 itens",
  resolveRankingRequest(SNAP5, { requestedTopN: 3 }).type === "top_n" &&
    resolveRankingRequest(SNAP5, { requestedTopN: 3 }).items.length === 3
);

assert(
  "top 3 — item [0] é winner",
  resolveRankingRequest(SNAP5, { requestedTopN: 3 }).items[0].isWinner === true
);

assert(
  "top 5 — todos os 5 retornados",
  resolveRankingRequest(SNAP5, { requestedTopN: 5 }).items.length === 5
);

assert(
  "top 10 com 5 disponíveis — retorna 5 (sem inventar)",
  resolveRankingRequest(SNAP5, { requestedTopN: 10 }).items.length === 5
);

assert(
  "top 3 com 1 disponível — retorna 1",
  resolveRankingRequest(SNAP1, { requestedTopN: 3 }).items.length === 1
);

assert(
  "top N preserva ordem do ranking",
  (() => {
    const items = resolveRankingRequest(SNAP5, { requestedTopN: 5 }).items;
    return items.map(i => i.rank).join(",") === "1,2,3,4,5";
  })()
);

// ─────────────────────────────────────────────────────────────
// Grupo 4 — Boundary / edge cases
// ─────────────────────────────────────────────────────────────

section("Grupo 4 — Edge cases");

assert(
  "snapshot null → not_available (no_snapshot)",
  resolveRankingRequest(null, { requestedRank: 2 }).type === "not_available" &&
    resolveRankingRequest(null, { requestedRank: 2 }).reason === "no_snapshot"
);

assert(
  "snapshot vazio → not_available (no_snapshot)",
  resolveRankingRequest([], { requestedRank: 2 }).type === "not_available"
);

assert(
  "rank inexistente → not_available (rank_out_of_bounds)",
  resolveRankingRequest(SNAP3, { requestedRank: 10 }).type === "not_available" &&
    resolveRankingRequest(SNAP3, { requestedRank: 10 }).reason === "rank_out_of_bounds"
);

assert(
  "usuário pede rank 5 mas só há 3 → not_available",
  resolveRankingRequest(SNAP3, { requestedRank: 5 }).type === "not_available"
);

assert(
  "sem requestedRank nem requestedTopN → not_available (no_request)",
  resolveRankingRequest(SNAP5, {}).type === "not_available" &&
    resolveRankingRequest(SNAP5, {}).reason === "no_request"
);

assert(
  "request null → not_available",
  resolveRankingRequest(SNAP5, null).type === "not_available"
);

// Sem anchor → sinal não detectado
assert(
  "sem anchor → alternativeRequest.detected = false",
  classifyMiaTurn({ originalQuery: "qual o plano B?", hasActiveAnchor: false })
    .signals?.alternativeRequest?.detected === false
);

// ─────────────────────────────────────────────────────────────
// Grupo 5 — Invariantes
// ─────────────────────────────────────────────────────────────

section("Grupo 5 — Invariantes");

assert(
  "resolveRankingRequest não modifica o snapshot original",
  (() => {
    const snap = buildRankingSnapshot([P1, P2, P3], P1);
    const before = JSON.stringify(snap);
    resolveRankingRequest(snap, { requestedRank: 2 });
    return JSON.stringify(snap) === before;
  })()
);

assert(
  "resolveRankingRequest não reordena o snapshot",
  (() => {
    const result = resolveRankingRequest(SNAP5, { requestedTopN: 5 });
    return result.items[0].rank === 1 && result.items[4].rank === 5;
  })()
);

assert(
  "resolveRankingRequest não recalcula scores (score preservado do snapshot)",
  resolveRankingRequest(SNAP5, { requestedRank: 1 }).product.score === 823
);

assert(
  "winner permanece rank 1 — nunca alterado por resolveRankingRequest",
  resolveRankingRequest(SNAP5, { requestedRank: 2 }).product.isWinner === false
);

assert(
  "resolveRankingRequest é função pura — mesma entrada = mesma saída",
  JSON.stringify(resolveRankingRequest(SNAP5, { requestedRank: 3 })) ===
    JSON.stringify(resolveRankingRequest(SNAP5, { requestedRank: 3 }))
);

assert(
  "detectsAlternativeRequestSignal é determinístico",
  JSON.stringify(altSignal("qual o plano B?")) ===
    JSON.stringify(altSignal("qual o plano B?"))
);

// ─────────────────────────────────────────────────────────────
// Grupo 6 — Turn type classification
// ─────────────────────────────────────────────────────────────

section("Grupo 6 — Turn type classification");

assert(
  "plano B com anchor → ALTERNATIVE_REQUEST",
  classifyWithAnchor("qual seria o plano B?").turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
);

assert(
  "top 3 com anchor → ALTERNATIVE_REQUEST",
  classifyWithAnchor("top 3").turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
);

assert(
  "quem ficou em segundo? → ALTERNATIVE_REQUEST",
  classifyWithAnchor("quem ficou em segundo?").turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
);

assert(
  "e depois dele? → ALTERNATIVE_REQUEST",
  classifyWithAnchor("e depois dele?").turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
);

assert(
  "qual o terceiro? → ALTERNATIVE_REQUEST",
  classifyWithAnchor("qual o terceiro?").turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
);

assert(
  "ALTERNATIVE_REQUEST traz requestedRank no signals",
  classifyWithAnchor("quem ficou em segundo?").signals?.alternativeRequest?.requestedRank === 2
);

assert(
  "ALTERNATIVE_REQUEST traz requestedTopN no signals",
  classifyWithAnchor("top 5").signals?.alternativeRequest?.requestedTopN === 5
);

assert(
  "ALTERNATIVE_REQUEST confidence >= 0.80",
  classifyWithAnchor("qual seria o plano B?").confidence >= 0.80
);

assert(
  "ALTERNATIVE_REQUEST shadowOnly = true",
  classifyWithAnchor("top 3").shadowOnly === true
);

// ─────────────────────────────────────────────────────────────
// Grupo 7 — Preservação dos patches anteriores (zero regressão)
// ─────────────────────────────────────────────────────────────

section("Grupo 7 — Zero regressão patches anteriores");

// PATCH 5.x — EXPLANATION_REQUEST não afetado
assert(
  "por que você recomendou? → EXPLANATION_REQUEST (não ALTERNATIVE_REQUEST)",
  classifyWithAnchor("por que você recomendou esse?").turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
);

// PATCH 6.1 — confidence_challenge não afetado
assert(
  "tem certeza? → EXPLANATION_REQUEST subtype confidence_challenge",
  classifyWithAnchor("tem certeza?").turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
);

// PATCH 6.2 — OBJECTION não afetado
assert(
  "muito caro → OBJECTION",
  classifyWithAnchor("achei muito caro").turnType === MIA_TURN_TYPES.OBJECTION
);

// PATCH 6.3 — REFINEMENT não afetado para refinamentos genéricos
assert(
  "mais barato? → REFINEMENT (não ALTERNATIVE_REQUEST)",
  classifyWithAnchor("tem algo mais barato?").turnType === MIA_TURN_TYPES.REFINEMENT
);

// PATCH 5.8A — PRIORITY_SHIFT não afetado
assert(
  "prefiro bateria → PRIORITY_SHIFT",
  classifyWithAnchor("prefiro bateria").turnType === MIA_TURN_TYPES.PRIORITY_SHIFT
);

// FOLLOW_UP pattern (sem vocabulário de alternativa) → permanece FOLLOW_UP
assert(
  "e a bateria? → FOLLOW_UP (não ALTERNATIVE_REQUEST)",
  classifyWithAnchor("e a bateria?").turnType === MIA_TURN_TYPES.FOLLOW_UP
);

// REACTION não afetada
assert(
  "ok entendi → REACTION",
  classifyWithAnchor("ok, entendi").turnType === MIA_TURN_TYPES.REACTION
);

// buildRankingSnapshot de PATCH 7.4 não afetado
assert(
  "PATCH 7.4: buildRankingSnapshot still works",
  buildRankingSnapshot([P1, P2], P1)[0].isWinner === true &&
    buildRankingSnapshot([P1, P2], P1)[1].isWinner === false
);

// ─────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────

console.log(`\n── RESULT: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
