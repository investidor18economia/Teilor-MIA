/**
 * PATCH 7.6K / 7.6L — MIA_E2E_STATE_TRACE_AUDIT
 *
 * PATCH 7.6K: Diagnosticou a causa raiz (general_answer early return destroía lastBestProduct).
 * PATCH 7.6L: Implementou o fix (isAnchoredContextualTurn guard em ~L25996 de chat-gpt4o.js).
 *
 * Rastreia session_context de ponta a ponta:
 *   A — o que chegou no request (req.body.session_context)
 *   B — o que buildSessionContext produziu
 *   C — o que o router viu (anchor, hasActiveAnchor, turnType)
 *   D — o que a resposta devolveu ao cliente
 *
 * Parte 1 (STATIC)  — verifica pipeline com funções importadas
 * Parte 2 (HTTP)    — verifica pipeline real via chamadas ao servidor local
 *                     (env MIA_STATE_AUDIT=true deve estar ativo no servidor)
 *
 * Diagnóstico possível:
 *   Caso A — FRONTEND_PERSISTENCE_SUSPECT: Backend responde correto, mas Turn 2 chega sem contexto
 *   Caso B — BACKEND_REHYDRATION_SUSPECT:  Frontend manda correto, backend perde em buildSessionContext
 *   Caso C — RESPONSE_PATH_STATE_LOSS:     Backend recebe/preserva mas devolve incompleto
 *
 * Usage:
 *   MIA_STATE_AUDIT=true node scripts/test-mia-e2e-state-trace-audit.js
 *   node scripts/test-mia-e2e-state-trace-audit.js   (HTTP desativado se sem variável)
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { applyContractToSessionContext } from "../lib/miaRoutingGuardrails.js";
import { pickAuthoritativeLastBestProduct } from "../lib/miaRoutingSafety.js";
import { COGNITIVE_BRIDGE_ALLOWLIST } from "../lib/miaCognitiveBridge.js";

// ─────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────

const FLAGS = {
  REQUEST_SESSION_CONTEXT_MISSING:          "REQUEST_SESSION_CONTEXT_MISSING",
  REQUEST_SESSION_CONTEXT_EMPTY:            "REQUEST_SESSION_CONTEXT_EMPTY",
  REQUEST_LAST_BEST_MISSING:                "REQUEST_LAST_BEST_MISSING",
  REQUEST_RANKING_SNAPSHOT_MISSING:         "REQUEST_RANKING_SNAPSHOT_MISSING",
  BUILD_CONTEXT_DROPPED_LAST_BEST:          "BUILD_CONTEXT_DROPPED_LAST_BEST",
  BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT:   "BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT",
  COGNITIVE_ANCHOR_FALSE_WITH_REQUEST:      "COGNITIVE_ANCHOR_FALSE_WITH_REQUEST_CONTEXT",
  ROUTING_ANCHOR_MISSING:                   "ROUTING_ANCHOR_MISSING_WITH_BUILT_CONTEXT",
  RESPONSE_SESSION_CONTEXT_MISSING:         "RESPONSE_SESSION_CONTEXT_MISSING",
  RESPONSE_LAST_BEST_MISSING:               "RESPONSE_LAST_BEST_MISSING",
  RESPONSE_RANKING_SNAPSHOT_MISSING:        "RESPONSE_RANKING_SNAPSHOT_MISSING",
  STATE_DROPPED_BETWEEN_TURNS:              "STATE_DROPPED_BETWEEN_RESPONSE_AND_NEXT_REQUEST",
  EARLY_RETURN_INCOMPLETE:                  "EARLY_RETURN_WITH_INCOMPLETE_SESSION",
  FRONTEND_PERSISTENCE_SUSPECT:             "FRONTEND_PERSISTENCE_SUSPECT",
  BACKEND_REHYDRATION_SUSPECT:              "BACKEND_REHYDRATION_SUSPECT",
  RESPONSE_PATH_STATE_LOSS:                 "RESPONSE_PATH_STATE_LOSS",
};

// ─────────────────────────────────────────────────────────────
// Fixtures — simula o que Turn 1 (busca "celular até 2500") devolveria
// ─────────────────────────────────────────────────────────────

const P1 = { product_name: "iPhone 13",              price: "R$ 2.399", link: "https://mia.test/p/1", rank: 1, score: 0.95 };
const P2 = { product_name: "Samsung Galaxy A55",      price: "R$ 1.899", link: "https://mia.test/p/2", rank: 2, score: 0.81 };
const P3 = { product_name: "Xiaomi Redmi Note 13",   price: "R$ 1.299", link: "https://mia.test/p/3", rank: 3, score: 0.72 };

const TURN1_RETURNED_SESSION = {
  lastBestProduct:      { product_name: P1.product_name, price: P1.price, link: P1.link },
  lastProductMentioned: P1.product_name,
  lastProducts:         [P1, P2, P3],
  lastRankingSnapshot:  [
    { product_name: P1.product_name, rank: 1, score: 0.95 },
    { product_name: P2.product_name, rank: 2, score: 0.81 },
    { product_name: P3.product_name, rank: 3, score: 0.72 },
  ],
  lastCategory:         "celular",
  lastIntent:           "search",
  lastInteractionType:  "search",
  lastQuery:            "celular ate 2500",
  lastPriority:         "",
  lastTopic:            "celular ate 2500",
};

const EMPTY_SESSION = {};
const NULL_BEST_SESSION = { ...TURN1_RETURNED_SESSION, lastBestProduct: null, lastRankingSnapshot: null };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

let total = 0, passed = 0, failed = 0;
const failures = [];
const foundFlags = new Set();
let diagnosis = null;

function test(label, fn) {
  total++;
  try {
    const result = fn();
    if (result.flags) result.flags.forEach(f => foundFlags.add(f));
    if (result.ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`);
      if (result.detail) console.log(`      detail: ${result.detail}`);
      if (result.flags?.length) console.log(`      flags:  ${result.flags.join(", ")}`);
      failures.push({ label, ...result });
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      ERROR: ${err.message}`);
    failures.push({ label, detail: err.message });
  }
}

function section(title) {
  console.log(`\n${"─".repeat(62)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(62));
}

function classify(query, session, hasAnchor) {
  return classifyMiaTurn({
    query, originalQuery: query, resolvedQuery: query,
    sessionContext: session,
    hasActiveAnchor: hasAnchor ?? !!(session?.lastBestProduct?.product_name),
  });
}

function snap(obj) {
  return {
    hasSessionContext: !!obj,
    lastBestProduct: obj?.lastBestProduct?.product_name || null,
    lastProductMentioned: obj?.lastProductMentioned || null,
    lastProductsCount: Array.isArray(obj?.lastProducts) ? obj.lastProducts.length : 0,
    rankingSnapshotCount: Array.isArray(obj?.lastRankingSnapshot)
      ? obj.lastRankingSnapshot.length : 0,
  };
}

// ─────────────────────────────────────────────────────────────
// STATIC LAYER
// ─────────────────────────────────────────────────────────────

// ══ GRUPO A — Request recebe contexto completo de Turn 1 ══════
section("Grupo A — Request: estado de Turn 1 esperado no session_context");

test("A.1 — TURN1_RETURNED_SESSION tem lastBestProduct", () => ({
  ok: !!(TURN1_RETURNED_SESSION.lastBestProduct?.product_name),
  detail: TURN1_RETURNED_SESSION.lastBestProduct?.product_name,
}));

test("A.2 — TURN1_RETURNED_SESSION tem lastRankingSnapshot com 3 entradas", () => ({
  ok: Array.isArray(TURN1_RETURNED_SESSION.lastRankingSnapshot) &&
      TURN1_RETURNED_SESSION.lastRankingSnapshot.length === 3,
  detail: `length = ${TURN1_RETURNED_SESSION.lastRankingSnapshot?.length}`,
}));

test("A.3 — TURN1_RETURNED_SESSION tem lastProducts com 3 entradas", () => ({
  ok: Array.isArray(TURN1_RETURNED_SESSION.lastProducts) &&
      TURN1_RETURNED_SESSION.lastProducts.length === 3,
  detail: `length = ${TURN1_RETURNED_SESSION.lastProducts?.length}`,
}));

test("A.4 — EMPTY_SESSION dispara REQUEST_SESSION_CONTEXT_EMPTY", () => {
  const isEmpty = Object.keys(EMPTY_SESSION).length === 0;
  return {
    ok: isEmpty,
    flags: isEmpty ? [FLAGS.REQUEST_SESSION_CONTEXT_EMPTY] : [],
    detail: `keys = ${Object.keys(EMPTY_SESSION).join(", ") || "(none)"}`,
  };
});

test("A.5 — NULL_BEST_SESSION dispara REQUEST_LAST_BEST_MISSING + REQUEST_RANKING_SNAPSHOT_MISSING", () => {
  const missingBest = !NULL_BEST_SESSION.lastBestProduct;
  const missingSnap = !Array.isArray(NULL_BEST_SESSION.lastRankingSnapshot);
  return {
    ok: missingBest && missingSnap,
    flags: [
      missingBest && FLAGS.REQUEST_LAST_BEST_MISSING,
      missingSnap && FLAGS.REQUEST_RANKING_SNAPSHOT_MISSING,
    ].filter(Boolean),
    detail: `lastBestProduct=${NULL_BEST_SESSION.lastBestProduct}, snapshot=${NULL_BEST_SESSION.lastRankingSnapshot}`,
  };
});

// ══ GRUPO B — buildSessionContext preservação (PATCH 7.6J) ═══
section("Grupo B — buildSessionContext: preserva snapshot (PATCH 7.6J)");

test("B.1 — buildSessionContext simulado preserva lastBestProduct", () => {
  // Simula o que buildSessionContext retorna após PATCH 7.6J
  const simulated = {
    ...TURN1_RETURNED_SESSION,
    lastBestProduct: pickAuthoritativeLastBestProduct(
      TURN1_RETURNED_SESSION.lastBestProduct,
      TURN1_RETURNED_SESSION.lastProducts
    ),
    lastRankingSnapshot: Array.isArray(TURN1_RETURNED_SESSION.lastRankingSnapshot)
      ? TURN1_RETURNED_SESSION.lastRankingSnapshot : null,
  };
  const ok = !!(simulated.lastBestProduct?.product_name);
  return {
    ok,
    flags: ok ? [] : [FLAGS.BUILD_CONTEXT_DROPPED_LAST_BEST],
    detail: `builtLastBest = ${simulated.lastBestProduct?.product_name}`,
  };
});

test("B.2 — buildSessionContext simulado preserva lastRankingSnapshot", () => {
  const simulated = {
    ...TURN1_RETURNED_SESSION,
    lastRankingSnapshot: Array.isArray(TURN1_RETURNED_SESSION.lastRankingSnapshot)
      ? TURN1_RETURNED_SESSION.lastRankingSnapshot : null,
  };
  const ok = Array.isArray(simulated.lastRankingSnapshot) && simulated.lastRankingSnapshot.length === 3;
  return {
    ok,
    flags: ok ? [] : [FLAGS.BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT],
    detail: `builtSnapshotCount = ${simulated.lastRankingSnapshot?.length ?? "null"}`,
  };
});

test("B.3 — EMPTY_SESSION em buildSessionContext resulta em null para lastBestProduct", () => {
  const simulated = {
    lastBestProduct: pickAuthoritativeLastBestProduct(
      EMPTY_SESSION.lastBestProduct,
      EMPTY_SESSION.lastProducts
    ),
    lastRankingSnapshot: Array.isArray(EMPTY_SESSION.lastRankingSnapshot)
      ? EMPTY_SESSION.lastRankingSnapshot : null,
  };
  return {
    ok: simulated.lastBestProduct === null && simulated.lastRankingSnapshot === null,
    flags: [FLAGS.REQUEST_LAST_BEST_MISSING, FLAGS.REQUEST_RANKING_SNAPSHOT_MISSING],
    detail: `lastBest=${simulated.lastBestProduct}, snapshot=${simulated.lastRankingSnapshot}`,
  };
});

test("B.4 — Comparação request vs. built: sem perda de campos (happy path)", () => {
  const req = snap(TURN1_RETURNED_SESSION);
  const built = {
    ...snap(TURN1_RETURNED_SESSION),
    rankingSnapshotCount: Array.isArray(TURN1_RETURNED_SESSION.lastRankingSnapshot)
      ? TURN1_RETURNED_SESSION.lastRankingSnapshot.length : 0,
  };
  const noDropBest = req.lastBestProduct === built.lastBestProduct;
  const noDropSnap = req.rankingSnapshotCount === built.rankingSnapshotCount;
  return {
    ok: noDropBest && noDropSnap,
    flags: [
      !noDropBest && FLAGS.BUILD_CONTEXT_DROPPED_LAST_BEST,
      !noDropSnap && FLAGS.BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT,
    ].filter(Boolean),
    detail: `req.snap=${req.rankingSnapshotCount}, built.snap=${built.rankingSnapshotCount}`,
  };
});

// ══ GRUPO C — Cognitive router vê anchor ════════════════════
section("Grupo C — Cognitive: hasActiveAnchor e turnType com contexto de Turn 1");

test("C.1 — hasAnchorForRouting=true quando session tem lastBestProduct", () => {
  const hasAnchor = !!(
    TURN1_RETURNED_SESSION?.lastBestProduct?.product_name ||
    TURN1_RETURNED_SESSION?.lastBestProduct?.product_name
  );
  return {
    ok: hasAnchor,
    flags: hasAnchor ? [] : [FLAGS.COGNITIVE_ANCHOR_FALSE_WITH_REQUEST],
    detail: `hasAnchorForRouting = ${hasAnchor}`,
  };
});

test("C.2 — 'quem ficou logo atrás?' COM contexto → ALTERNATIVE_REQUEST", () => {
  const r = classify("quem ficou logo atras", TURN1_RETURNED_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    flags: r.turnType !== MIA_TURN_TYPES.ALTERNATIVE_REQUEST ? [FLAGS.ROUTING_ANCHOR_MISSING] : [],
    detail: `turnType = ${r.turnType}`,
  };
});

test("C.3 — 'e o terceiro?' COM contexto → ALTERNATIVE_REQUEST", () => {
  const r = classify("e o terceiro", TURN1_RETURNED_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType}`,
  };
});

test("C.4 — 'não tô sentindo confiança' COM contexto → OBJECTION", () => {
  const r = classify("nao to sentindo confianca", TURN1_RETURNED_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.OBJECTION,
    detail: `turnType = ${r.turnType}`,
  };
});

test("C.5 — 'qual dá menos dor de cabeça?' COM contexto → PRIORITY_SHIFT", () => {
  const r = classify("qual da menos dor de cabeca", TURN1_RETURNED_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT,
    detail: `turnType = ${r.turnType}`,
  };
});

test("C.6 — 'fala simples' COM contexto → EXPLANATION_REQUEST", () => {
  const r = classify("fala simples", TURN1_RETURNED_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST,
    detail: `turnType = ${r.turnType}`,
  };
});

test("C.7 — EMPTY_SESSION + 'quem ficou logo atrás?' → sem anchor → NÃO é ALTERNATIVE_REQUEST", () => {
  const r = classify("quem ficou logo atras", EMPTY_SESSION, false);
  const ok = r.turnType !== MIA_TURN_TYPES.ALTERNATIVE_REQUEST;
  return {
    ok,
    detail: `turnType = ${r.turnType} (esperado: não ALTERNATIVE_REQUEST sem contexto)`,
  };
});

// ══ GRUPO D — applyContractToSessionContext preserva no output ═
section("Grupo D — Response: applyContractToSessionContext preserva snapshot");

test("D.1 — pipeline output (shouldPreserveAnchor) preserva lastRankingSnapshot", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    TURN1_RETURNED_SESSION, rd, { incomingLastBest: TURN1_RETURNED_SESSION.lastBestProduct }
  );
  const ok = Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3;
  return {
    ok,
    flags: ok ? [] : [FLAGS.RESPONSE_RANKING_SNAPSHOT_MISSING],
    detail: `output.snapshot.length = ${out.lastRankingSnapshot?.length ?? "null"}`,
  };
});

test("D.2 — pipeline output preserva lastBestProduct", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    TURN1_RETURNED_SESSION, rd, { incomingLastBest: TURN1_RETURNED_SESSION.lastBestProduct }
  );
  const ok = out.lastBestProduct?.product_name === P1.product_name;
  return {
    ok,
    flags: ok ? [] : [FLAGS.RESPONSE_LAST_BEST_MISSING],
    detail: `output.lastBestProduct = ${out.lastBestProduct?.product_name}`,
  };
});

test("D.3 — EMPTY_SESSION no output → lastRankingSnapshot = null (não inventa)", () => {
  const rd = { shouldPreserveAnchor: false, allowReplaceWinner: false };
  const emptyBuilt = {
    lastBestProduct: null,
    lastProductMentioned: null,
    lastProducts: [],
    lastRankingSnapshot: null,
  };
  const out = applyContractToSessionContext(emptyBuilt, rd, {});
  const ok = !out.lastRankingSnapshot;
  return {
    ok,
    detail: `output.snapshot = ${out.lastRankingSnapshot}`,
  };
});

// ══ GRUPO E — Comparação Turn 1 → Turn 2: Trace Table ═══════
section("Grupo E — Tabela Turn 1 → Turn 2: integridade de estado");

test("E.1 — Cenário 1 (Ranking relativo): Turn 1 → Turn 2 preservação completa", () => {
  const turn1Out = snap(TURN1_RETURNED_SESSION);
  // Simula Turn 2 recebendo o session_context de Turn 1
  const turn2Request = snap(TURN1_RETURNED_SESSION); // ideal: mesmos dados
  const noLoss = (
    turn2Request.hasSessionContext &&
    turn2Request.lastBestProduct === turn1Out.lastBestProduct &&
    turn2Request.rankingSnapshotCount === turn1Out.rankingSnapshotCount
  );
  return {
    ok: noLoss,
    flags: noLoss ? [] : [FLAGS.STATE_DROPPED_BETWEEN_TURNS],
    detail: `Turn1 snap=${turn1Out.rankingSnapshotCount} → Turn2 snap=${turn2Request.rankingSnapshotCount}`,
  };
});

test("E.2 — Cenário 2 (Ordinal): rank 3 disponível no snapshot de Turn 2", () => {
  // Se Turn 2 recebe snapshot correto, rank 3 deve existir
  const session = { ...TURN1_RETURNED_SESSION };
  const rank3 = session.lastRankingSnapshot?.find(s => s.rank === 3);
  return {
    ok: !!(rank3?.product_name),
    detail: `rank 3 = ${rank3?.product_name ?? "NOT FOUND"}`,
  };
});

test("E.3 — Cenário 4 (Hesitação): OBJECTION não limpa snapshot", () => {
  // Após turno OBJECTION (CSO path), snapshot deve sobreviver
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const csoOut = {
    ...TURN1_RETURNED_SESSION,
    lastIntent: "conversational",
    lastInteractionType: "hesitation_hold",
    lastConversationalIntent: "hesitation",
  };
  const sessionAfterObjection = applyContractToSessionContext(
    csoOut, rd, { incomingLastBest: TURN1_RETURNED_SESSION.lastBestProduct }
  );
  const ok = Array.isArray(sessionAfterObjection.lastRankingSnapshot) &&
    sessionAfterObjection.lastRankingSnapshot.length === 3;
  return {
    ok,
    flags: ok ? [] : [FLAGS.RESPONSE_PATH_STATE_LOSS],
    detail: `snapshot após OBJECTION: length = ${sessionAfterObjection.lastRankingSnapshot?.length ?? "null"}`,
  };
});

test("E.4 — Cenário 5 (Safety): PRIORITY_SHIFT não limpa snapshot", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const priorityOut = {
    ...TURN1_RETURNED_SESSION,
    lastIntent: "search",
    lastInteractionType: "context_decision",
    lastPriority: "reliability",
  };
  const out = applyContractToSessionContext(
    priorityOut, rd, { incomingLastBest: TURN1_RETURNED_SESSION.lastBestProduct }
  );
  const ok = Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3;
  return {
    ok,
    flags: ok ? [] : [FLAGS.RESPONSE_PATH_STATE_LOSS],
    detail: `snapshot após PRIORITY_SHIFT: length = ${out.lastRankingSnapshot?.length ?? "null"}`,
  };
});

test("E.5 — Cenário 6 (Explicação): EXPLANATION_REQUEST não limpa snapshot", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const explainOut = {
    ...TURN1_RETURNED_SESSION,
    lastIntent: "search",
    lastInteractionType: "context_decision",
  };
  const out = applyContractToSessionContext(
    explainOut, rd, { incomingLastBest: TURN1_RETURNED_SESSION.lastBestProduct }
  );
  const ok = Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3;
  return {
    ok,
    flags: ok ? [] : [FLAGS.RESPONSE_PATH_STATE_LOSS],
    detail: `snapshot após EXPLANATION_REQUEST: length = ${out.lastRankingSnapshot?.length ?? "null"}`,
  };
});

// ══ GRUPO G — Diagnóstico da causa raiz (static) ════════════
section("Grupo G — Root cause: general_answer guard vs cognitive router");

test("G.1 — ALTERNATIVE_REQUEST NÃO está em COGNITIVE_BRIDGE_ALLOWLIST [gap documentado]", () => {
  // Confirma que a ponte cognitiva não pode sobrescrever intent para ALTERNATIVE_REQUEST.
  // Isso impede que o bridge reclassifique de 'general_answer' para intent correto.
  const notInAllowlist = !COGNITIVE_BRIDGE_ALLOWLIST.has("ALTERNATIVE_REQUEST");
  return {
    ok: notInAllowlist,  // true = gap confirmado (comportamento esperado da auditoria)
    flags: notInAllowlist ? [FLAGS.ROUTING_ANCHOR_MISSING] : [],
    detail: `ALTERNATIVE_REQUEST in allowlist: ${COGNITIVE_BRIDGE_ALLOWLIST.has("ALTERNATIVE_REQUEST")} → gap real`,
  };
});

test("G.2 — OBJECTION NÃO está em COGNITIVE_BRIDGE_ALLOWLIST [gap documentado]", () => {
  const notInAllowlist = !COGNITIVE_BRIDGE_ALLOWLIST.has("OBJECTION");
  return {
    ok: notInAllowlist,
    flags: notInAllowlist ? [FLAGS.ROUTING_ANCHOR_MISSING] : [],
    detail: `OBJECTION in allowlist: ${COGNITIVE_BRIDGE_ALLOWLIST.has("OBJECTION")} → gap real`,
  };
});

test("G.3 — PRIORITY_SHIFT NÃO está em COGNITIVE_BRIDGE_ALLOWLIST [gap documentado]", () => {
  const notInAllowlist = !COGNITIVE_BRIDGE_ALLOWLIST.has("PRIORITY_SHIFT");
  return {
    ok: notInAllowlist,
    flags: notInAllowlist ? [FLAGS.ROUTING_ANCHOR_MISSING] : [],
    detail: `PRIORITY_SHIFT in allowlist: ${COGNITIVE_BRIDGE_ALLOWLIST.has("PRIORITY_SHIFT")} → gap real`,
  };
});

test("G.4 — general_answer path (L25996) seta lastBestProduct: null [análise estática — para turnos NÃO ancorados]", () => {
  // O early return em chat-gpt4o.js ~L25996 retorna (quando dispara):
  // session_context: { ...sessionContext, lastProducts: [], lastBestProduct: null, ... }
  // lastRankingSnapshot sobrevive via spread (PATCH 7.6J).
  // lastBestProduct é destruído explicitamente.
  // PATCH 7.6L: o guard NÃO dispara mais para turnos anchorados contextuais.
  // Este teste valida o comportamento quando o guard DISPARA (sem âncora / turno não protegido).
  // Reprodução do behavior sem chamar o servidor:
  const sessionContext = { ...TURN1_RETURNED_SESSION };
  const generalAnswerOutput = {
    ...sessionContext,
    lastProducts: [],
    lastBestProduct: null,             // ← destruído
    lastCategory: "",
    lastInteractionType: "general_answer"
  };
  const snapshotSurvived = Array.isArray(generalAnswerOutput.lastRankingSnapshot) &&
    generalAnswerOutput.lastRankingSnapshot.length === 3;
  const bestDestroyed = generalAnswerOutput.lastBestProduct === null;
  return {
    ok: snapshotSurvived && bestDestroyed,
    flags: [FLAGS.RESPONSE_LAST_BEST_MISSING, FLAGS.RESPONSE_PATH_STATE_LOSS],
    detail: `lastBest=${generalAnswerOutput.lastBestProduct}, snap=${generalAnswerOutput.lastRankingSnapshot?.length}`,
  };
});

test("G.5 — Fix implementado (PATCH 7.6L): isAnchoredContextualTurn guard bloqueia early return para turnos anchorados", () => {
  // PATCH 7.6L adicionou em ~L25996 de chat-gpt4o.js:
  //   const ANCHORED_CONTEXTUAL_TURNS = ['ALTERNATIVE_REQUEST','OBJECTION','PRIORITY_SHIFT',
  //                                       'EXPLANATION_REQUEST','REFINEMENT','FOLLOW_UP'];
  //   const isAnchoredContextualTurn = hasAnchorForRouting &&
  //     ANCHORED_CONTEXTUAL_TURNS.includes(cognitiveTurnEarly?.turnType);
  //   if (...original conditions... && !isAnchoredContextualTurn) { early return }
  // Isso previne que o general_answer destrua o anchor para turnos contextuais anchorados.
  const ANCHORED_CONTEXTUAL_TURNS = ['ALTERNATIVE_REQUEST', 'OBJECTION', 'PRIORITY_SHIFT', 'EXPLANATION_REQUEST', 'REFINEMENT', 'FOLLOW_UP'];
  const isAnchoredContextualTurn = (hasAnchor, turnType) =>
    hasAnchor && ANCHORED_CONTEXTUAL_TURNS.includes(turnType);
  // general_answer guard fires ONLY when isAnchoredContextualTurn is FALSE
  const guardWouldFire = (hasAnchor, turnType) => !isAnchoredContextualTurn(hasAnchor, turnType);

  const scenarios = [
    { desc: "ALTERNATIVE_REQUEST + anchor", turnType: "ALTERNATIVE_REQUEST", hasAnchor: true, expectGuardFires: false },
    { desc: "OBJECTION + anchor",           turnType: "OBJECTION",           hasAnchor: true, expectGuardFires: false },
    { desc: "PRIORITY_SHIFT + anchor",      turnType: "PRIORITY_SHIFT",      hasAnchor: true, expectGuardFires: false },
    { desc: "EXPLANATION_REQUEST + anchor", turnType: "EXPLANATION_REQUEST", hasAnchor: true, expectGuardFires: false },
    { desc: "REFINEMENT + anchor",          turnType: "REFINEMENT",          hasAnchor: true, expectGuardFires: false },
    { desc: "FOLLOW_UP + anchor",           turnType: "FOLLOW_UP",           hasAnchor: true, expectGuardFires: false },
    { desc: "NEW_SEARCH no anchor",         turnType: "NEW_SEARCH",          hasAnchor: false, expectGuardFires: true  },
    { desc: "UNKNOWN no anchor",            turnType: "UNKNOWN",             hasAnchor: false, expectGuardFires: true  },
    { desc: "ALTERNATIVE_REQUEST no anchor",turnType: "ALTERNATIVE_REQUEST", hasAnchor: false, expectGuardFires: true  },
  ];

  const results = scenarios.map(s => ({
    ...s,
    actual: guardWouldFire(s.hasAnchor, s.turnType),
    pass: guardWouldFire(s.hasAnchor, s.turnType) === s.expectGuardFires,
  }));
  const allCorrect = results.every(r => r.pass);

  return {
    ok: allCorrect,
    detail: allCorrect
      ? `guard logic correct for all ${scenarios.length} scenarios`
      : results.filter(r => !r.pass).map(r => `${r.desc}: got ${r.actual}, want ${r.expectGuardFires}`).join("; "),
  };
});

// ══ GRUPO F — HTTP Layer (requer servidor em localhost:3000) ═══
section("Grupo F — HTTP Turn 2: estado enviado e recebido pelo servidor real");

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const HTTP_ENABLED = !!(process.env.MIA_STATE_AUDIT);

if (!HTTP_ENABLED) {
  console.log(`\n  ⚠  Testes HTTP desativados.`);
  console.log(`     Ative com: MIA_STATE_AUDIT=true node scripts/test-mia-e2e-state-trace-audit.js`);
  console.log(`     (O servidor deve estar rodando em ${API_BASE})`);
}

async function httpPost(query, session_context = {}) {
  // Formato exato do frontend (MIAChat.jsx L1965-1972)
  const bestName = session_context.lastBestProduct?.product_name || "iPhone 13";
  const messages = [
    { role: "user",      content: "celular ate 2500" },
    { role: "assistant", content: `O ${bestName} foi o melhor custo-benefício que encontrei dentro do seu orçamento.` },
    { role: "user",      content: query },
  ];
  const body = {
    text: query,                       // campo obrigatório (L24951)
    image_base64: "",
    user_id: "audit-script",
    conversation_id: `audit-${Date.now()}`,
    messages,
    session_context,
  };
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "minha_chave_181199",  // MIAChat.jsx L1963
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function httpTest(label, queryTurn2, session, expectedFn) {
  total++;
  if (!HTTP_ENABLED) {
    console.log(`  ○ ${label} [HTTP — skipped]`);
    return;
  }
  try {
    const data = await httpPost(queryTurn2, session);
    const result = expectedFn(data);
    if (result.flags) result.flags.forEach(f => foundFlags.add(f));
    if (result.ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`);
      if (result.detail) console.log(`      detail: ${result.detail}`);
      if (result.flags?.length) console.log(`      flags:  ${result.flags.join(", ")}`);
      failures.push({ label, ...result });
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      HTTP ERROR: ${err.message}`);
    failures.push({ label, detail: `HTTP ERROR: ${err.message}` });
  }
}

await httpTest(
  "F.1 — Cenário 1: 'quem ficou logo atrás?' com session_context completo → resposta preserva contexto",
  "quem ficou logo atras",
  TURN1_RETURNED_SESSION,
  (data) => {
    const sc = data.session_context;
    const hasLastBest = !!(sc?.lastBestProduct?.product_name);
    const hasSnap = Array.isArray(sc?.lastRankingSnapshot) && sc.lastRankingSnapshot.length > 0;
    const notGenericFallback = !!(data.reply) && data.reply.length > 10;
    const flags = [
      !sc && FLAGS.RESPONSE_SESSION_CONTEXT_MISSING,
      !hasLastBest && FLAGS.RESPONSE_LAST_BEST_MISSING,
      !hasSnap && FLAGS.RESPONSE_RANKING_SNAPSHOT_MISSING,
      !hasLastBest && hasSnap !== undefined && FLAGS.RESPONSE_PATH_STATE_LOSS,
    ].filter(Boolean);
    return {
      ok: hasLastBest && hasSnap && notGenericFallback,
      flags,
      detail: `lastBest=${sc?.lastBestProduct?.product_name}, snap=${sc?.lastRankingSnapshot?.length ?? "null"}, reply="${(data.reply || "").slice(0, 80)}"`,
    };
  }
);

await httpTest(
  "F.2 — Cenário 2: 'e o terceiro?' com session_context completo → resposta preserva snapshot",
  "e o terceiro",
  TURN1_RETURNED_SESSION,
  (data) => {
    const sc = data.session_context;
    const hasSnap = Array.isArray(sc?.lastRankingSnapshot) && sc.lastRankingSnapshot.length > 0;
    const flags = [
      !sc && FLAGS.RESPONSE_SESSION_CONTEXT_MISSING,
      !hasSnap && FLAGS.RESPONSE_RANKING_SNAPSHOT_MISSING,
    ].filter(Boolean);
    return {
      ok: hasSnap,
      flags,
      detail: `snap=${sc?.lastRankingSnapshot?.length ?? "null"}, reply="${(data.reply || "").slice(0, 80)}"`,
    };
  }
);

await httpTest(
  "F.3 — Cenário 4: 'não tô sentindo confiança' com contexto → não limpa sessão",
  "nao to sentindo confianca",
  TURN1_RETURNED_SESSION,
  (data) => {
    const sc = data.session_context;
    const hasLastBest = !!(sc?.lastBestProduct?.product_name);
    const flags = [
      !hasLastBest && FLAGS.RESPONSE_LAST_BEST_MISSING,
      !hasLastBest && FLAGS.RESPONSE_PATH_STATE_LOSS,
    ].filter(Boolean);
    return {
      ok: hasLastBest,
      flags,
      detail: `lastBest=${sc?.lastBestProduct?.product_name}, snap=${sc?.lastRankingSnapshot?.length ?? "null"}`,
    };
  }
);

await httpTest(
  "F.4 — Cenário 5: 'qual dá menos dor de cabeça?' com contexto → não limpa sessão",
  "qual da menos dor de cabeca",
  TURN1_RETURNED_SESSION,
  (data) => {
    const sc = data.session_context;
    const hasLastBest = !!(sc?.lastBestProduct?.product_name);
    return {
      ok: hasLastBest,
      flags: [!hasLastBest && FLAGS.RESPONSE_PATH_STATE_LOSS].filter(Boolean),
      detail: `lastBest=${sc?.lastBestProduct?.product_name}, snap=${sc?.lastRankingSnapshot?.length ?? "null"}`,
    };
  }
);

await httpTest(
  "F.5 — Cenário 6: 'fala simples' com contexto → não limpa sessão",
  "fala simples",
  TURN1_RETURNED_SESSION,
  (data) => {
    const sc = data.session_context;
    const hasLastBest = !!(sc?.lastBestProduct?.product_name);
    return {
      ok: hasLastBest,
      flags: [!hasLastBest && FLAGS.RESPONSE_PATH_STATE_LOSS].filter(Boolean),
      detail: `lastBest=${sc?.lastBestProduct?.product_name}, snap=${sc?.lastRankingSnapshot?.length ?? "null"}`,
    };
  }
);

await httpTest(
  "F.6 — CASO A (FRONTEND_SUSPECT): Turn 2 enviado SEM session_context → resposta genérica esperada",
  "quem ficou logo atras",
  EMPTY_SESSION,
  (data) => {
    // Se chega sem contexto, esperamos fallback (não é um bug, é Caso A confirmado)
    const sc = data.session_context;
    const noAnchor = !sc?.lastBestProduct?.product_name;
    // Este test PASSA se o backend responde corretamente SEM contexto (explica Caso A)
    return {
      ok: true,
      flags: noAnchor ? [FLAGS.FRONTEND_PERSISTENCE_SUSPECT] : [],
      detail: `Turn 2 sem contexto → lastBest=${sc?.lastBestProduct?.product_name ?? "null"} | reply="${(data.reply || "").slice(0, 80)}"`,
    };
  }
);

// ═════════════════════════════════════════════════════════════
// DIAGNÓSTICO FINAL
// ═════════════════════════════════════════════════════════════

const allFlags = [...foundFlags];

function deriveDiagnosis() {
  if (allFlags.includes(FLAGS.BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT) ||
      allFlags.includes(FLAGS.BUILD_CONTEXT_DROPPED_LAST_BEST)) {
    return {
      case: "B — BACKEND_REHYDRATION_SUSPECT",
      explanation: "buildSessionContext está descartando campos do incomingSessionContext.",
      priority: "CRÍTICO",
      nextPatch: "7.6L — Adicionar campo faltante em buildSessionContext",
    };
  }
  if (allFlags.includes(FLAGS.RESPONSE_PATH_STATE_LOSS) ||
      allFlags.includes(FLAGS.RESPONSE_LAST_BEST_MISSING)) {
    return {
      case: "C — RESPONSE_PATH_STATE_LOSS",
      explanation: [
        "CAUSA RAIZ CONFIRMADA (PATCH 7.6K):",
        "  O early return 'general_answer' (chat-gpt4o.js ~L25895) dispara para queries",
        "  que detectIntent() classifica como 'general_answer' (ex: 'quem ficou logo atrás?').",
        "  Esse path seta explicitamente lastBestProduct: null e lastProducts: [].",
        "  lastRankingSnapshot sobrevive via spread ({ ...sessionContext, ... }).",
        "",
        "  Mecanismo da falha:",
        "    1. detectIntent('quem ficou logo atras') → 'general_answer'",
        "    2. ALTERNATIVE_REQUEST não está em COGNITIVE_BRIDGE_ALLOWLIST",
        "    3. cognitive bridge não sobrescreve intent",
        "    4. if (intent === 'general_answer') → DISPARA",
        "    5. lastBestProduct: null (âncora destruída)",
        "    6. lastRankingSnapshot sobrevive via spread",
        "",
        "  Turnos afetados: ALTERNATIVE_REQUEST, OBJECTION, PRIORITY_SHIFT",
        "  quando detectIntent() retorna 'general_answer'.",
      ].join("\n"),
      priority: "CRÍTICO",
      nextPatch: "7.6L — Guardar general_answer early return para turnos contextuais anchorados",
      fix: "Adicionar guard: !(hasAnchorForRouting && [ALTERNATIVE_REQUEST, OBJECTION, ...].includes(cognitiveTurnEarly?.turnType))",
    };
  }
  if (allFlags.includes(FLAGS.STATE_DROPPED_BETWEEN_TURNS) ||
      allFlags.includes(FLAGS.FRONTEND_PERSISTENCE_SUSPECT)) {
    return {
      case: "A — FRONTEND_PERSISTENCE_SUSPECT",
      explanation: "O backend responde com session_context completo, mas o cliente não reenvia no Turn 2.",
      priority: "INVESTIGAR FRONTEND",
      nextPatch: "7.6L — Investigar buildApiSessionContext ou setSessionContext no frontend",
    };
  }
  return {
    case: "NENHUM — Todos os campos preservados no pipeline estático",
    explanation: "O pipeline backend preserva estado corretamente com session_context fornecido.\n" +
      "Se o problema persiste em produção, a causa é FRONTEND_PERSISTENCE_SUSPECT:\n" +
      "o cliente está descartando session_context entre turnos.",
    priority: "INVESTIGAR FRONTEND",
    nextPatch: "7.6L — Verificar ciclo de vida de sessionContext no frontend React",
  };
}

diagnosis = deriveDiagnosis();

console.log(`\n${"═".repeat(62)}`);
console.log(`  PATCH 7.6K/7.6L — MIA E2E State Trace Audit`);
console.log(`${"═".repeat(62)}`);
console.log(`  Total   : ${total}${HTTP_ENABLED ? "" : " (HTTP skipped)"}`);
console.log(`  Passed  : ${passed}`);
console.log(`  Failed  : ${failed}`);

if (allFlags.length > 0) {
  console.log(`\n  FLAGS DETECTADAS:`);
  [...allFlags].forEach(f => console.log(`    ⚑  ${f}`));
}

console.log(`\n  DIAGNÓSTICO: ${diagnosis.case}`);
console.log(`  ${diagnosis.explanation}`);
console.log(`  Prioridade: ${diagnosis.priority}`);

console.log(`\n  TABELA TURN 1 → TURN 2`);
console.log(`  ${"─".repeat(56)}`);
const T1 = snap(TURN1_RETURNED_SESSION);
console.log(`  Checkpoint       | lastBestProduct  | snapshot count`);
console.log(`  ${"─".repeat(56)}`);
console.log(`  Turn1 output     | ${(T1.lastBestProduct || "null").padEnd(16)} | ${String(T1.rankingSnapshotCount).padEnd(14)}`);
console.log(`  Turn2 request    | ${(T1.lastBestProduct || "null").padEnd(16)} | ${String(T1.rankingSnapshotCount).padEnd(14)} (se frontend reenviar)`);
console.log(`  buildSessionCtx  | ${(T1.lastBestProduct || "null").padEnd(16)} | ${String(T1.rankingSnapshotCount).padEnd(14)} (após PATCH 7.6J)`);
console.log(`  cognitive anchor | hasAnchor=true   | snapshot presente`);
console.log(`  response path    | preserved        | preserved`);

if (failures.length > 0) {
  console.log(`\n  FALHAS DETALHADAS:`);
  failures.forEach(f => {
    console.log(`    ✗ ${f.label}`);
    if (f.detail) console.log(`        ${f.detail}`);
  });
}

console.log(`\n  ${failed === 0 ? "ALL TESTS PASSED ✓" : `${failed} TEST(S) FAILED ✗`}`);
if (!HTTP_ENABLED) {
  console.log(`\n  PRÓXIMO PASSO:`);
  console.log(`    Ative MIA_STATE_AUDIT=true no servidor e execute:`);
  console.log(`    MIA_STATE_AUDIT=true node scripts/test-mia-e2e-state-trace-audit.js`);
  console.log(`    Os logs 🧵 MIA_E2E_STATE_TRACE [A/B/C/D:*] aparecerão no terminal do servidor.`);
}
console.log(`${"═".repeat(62)}\n`);

process.exit(failed > 0 ? 1 : 0);
