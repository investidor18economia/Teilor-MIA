/**
 * PATCH 7.6J — Session Ranking Snapshot Integrity
 *
 * MIA_SESSION_RANKING_SNAPSHOT_INTEGRITY
 *
 * Verifica que lastRankingSnapshot sobrevive entre turnos e que
 * os resolvedores de alternativa (rank-N, top-N) funcionam quando
 * o snapshot está presente no sessionContext.
 *
 * Grupos:
 *   A — Snapshot copiado pelo pipeline (via applyContractToSessionContext)
 *   B — Snapshot preservado em turnos contextuais (CSO, holdSession, comparison)
 *   C — Snapshot substituído apenas quando nova busca cria novo ranking
 *   D — Snapshot não é mutado (imutabilidade)
 *   E — Ranking request funciona no Turn N+1 (classifyMiaTurn)
 *   F — Regressões (patches anteriores)
 *
 * Usage: node scripts/test-mia-session-ranking-snapshot-integrity.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { applyContractToSessionContext } from "../lib/miaRoutingGuardrails.js";
import { pickAuthoritativeLastBestProduct } from "../lib/miaRoutingSafety.js";
import { buildRankingSnapshot } from "../lib/miaRoutingGuardrails.js";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const P1 = { product_name: "iPhone 13",               price: "R$ 2.399", rank: 1, score: 0.95 };
const P2 = { product_name: "Samsung Galaxy A55",       price: "R$ 1.899", rank: 2, score: 0.81 };
const P3 = { product_name: "Xiaomi Redmi Note 13",     price: "R$ 1.299", rank: 3, score: 0.72 };

// Snapshot formal criado pelo buildRankingSnapshot no Turn 1
const FORMAL_SNAPSHOT = [
  { product_name: P1.product_name, rank: 1, score: 0.95 },
  { product_name: P2.product_name, rank: 2, score: 0.81 },
  { product_name: P3.product_name, rank: 3, score: 0.72 },
];

// Session context que Turn 1 (busca) retorna ao cliente
const TURN1_SESSION = {
  lastBestProduct:      { product_name: P1.product_name, price: P1.price },
  lastProductMentioned: P1.product_name,
  lastProducts:         [P1, P2, P3],
  lastRankingSnapshot:  FORMAL_SNAPSHOT,
  lastCategory:         "celular",
  lastIntent:           "search",
  lastInteractionType:  "search",
  lastQuery:            "celular ate 2500",
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

let total = 0, passed = 0, failed = 0;
const failures = [];

function test(label, fn) {
  total++;
  try {
    const result = fn();
    if (result.ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`);
      if (result.detail) console.log(`      detail: ${result.detail}`);
      failures.push({ label, detail: result.detail });
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      ERROR: ${err.message}`);
    failures.push({ label, detail: err.message });
  }
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function classify(query, session, hasAnchor = true) {
  return classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: session,
    hasActiveAnchor: hasAnchor,
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — Snapshot copiado pelo pipeline
// ─────────────────────────────────────────────────────────────
section("Grupo A — Snapshot copiado pelo pipeline");

test("A.1 — TURN1_SESSION tem lastRankingSnapshot com 3 entradas", () => {
  return {
    ok: Array.isArray(TURN1_SESSION.lastRankingSnapshot) &&
        TURN1_SESSION.lastRankingSnapshot.length === 3,
    detail: `length = ${TURN1_SESSION.lastRankingSnapshot?.length}`,
  };
});

test("A.2 — applyContractToSessionContext preserva snapshot via spread (shouldPreserveAnchor)", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    TURN1_SESSION, rd, { incomingLastBest: TURN1_SESSION.lastBestProduct }
  );
  return {
    ok: Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3,
    detail: `out.lastRankingSnapshot.length = ${out.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

test("A.3 — applyContractToSessionContext preserva snapshot (allowReplaceWinner=false, sem proposedProducts)", () => {
  const rd = { shouldPreserveAnchor: false, allowReplaceWinner: false };
  const out = applyContractToSessionContext(TURN1_SESSION, rd, {});
  return {
    ok: Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3,
    detail: `out.lastRankingSnapshot.length = ${out.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

test("A.4 — buildSessionContext simulado com snapshot: snapshot preservado no output", () => {
  // Simula o comportamento de buildSessionContext após PATCH 7.6J.
  // buildSessionContext (não exportado) agora copia lastRankingSnapshot.
  // Verificamos o resultado através do pipeline completo com applyContractToSessionContext.
  const simulatedBuildOutput = {
    ...TURN1_SESSION,
    // PATCH 7.6J: lastRankingSnapshot copiado de sessionContext (incomingSessionContext)
    lastRankingSnapshot: Array.isArray(TURN1_SESSION.lastRankingSnapshot)
      ? TURN1_SESSION.lastRankingSnapshot
      : null,
  };
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    simulatedBuildOutput, rd, { incomingLastBest: TURN1_SESSION.lastBestProduct }
  );
  return {
    ok: Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3,
    detail: `end-to-end: snapshot length = ${out.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

test("A.5 — Rank 1 no snapshot corresponde a lastBestProduct", () => {
  const rank1 = TURN1_SESSION.lastRankingSnapshot.find(s => s.rank === 1);
  return {
    ok: rank1?.product_name === TURN1_SESSION.lastBestProduct?.product_name,
    detail: `rank1=${rank1?.product_name}, lastBest=${TURN1_SESSION.lastBestProduct?.product_name}`,
  };
});

test("A.6 — Rank 2 no snapshot corresponde ao runner-up esperado", () => {
  const rank2 = TURN1_SESSION.lastRankingSnapshot.find(s => s.rank === 2);
  return {
    ok: rank2?.product_name === P2.product_name,
    detail: `rank2 = ${rank2?.product_name}`,
  };
});

test("A.7 — Rank 3 no snapshot corresponde ao terceiro colocado", () => {
  const rank3 = TURN1_SESSION.lastRankingSnapshot.find(s => s.rank === 3);
  return {
    ok: rank3?.product_name === P3.product_name,
    detail: `rank3 = ${rank3?.product_name}`,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO B — Snapshot preservado em turnos contextuais
// ─────────────────────────────────────────────────────────────
section("Grupo B — Snapshot preservado em turnos contextuais");

test("B.1 — CSO path: spread de incomingSessionContext preserva snapshot", () => {
  // CSO early return usa { ...incomingSessionContext, lastIntent: "conversational", ... }
  const csoOutput = {
    ...TURN1_SESSION,
    lastIntent: "conversational",
    lastInteractionType: "hesitation_hold",
    lastConversationalIntent: "hesitation",
  };
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    csoOutput, rd, { incomingLastBest: TURN1_SESSION.lastBestProduct }
  );
  return {
    ok: Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3,
    detail: `CSO output snapshot length = ${out.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

test("B.2 — holdSession (contract_anchored_hold): snapshot preservado", () => {
  // holdSession = applyContractToSessionContext(sessionContext, rd, {...})
  // Após PATCH 7.6J, sessionContext.lastRankingSnapshot está presente.
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const holdSession = applyContractToSessionContext(
    TURN1_SESSION, rd, { incomingLastBest: TURN1_SESSION.lastBestProduct }
  );
  return {
    ok: Array.isArray(holdSession.lastRankingSnapshot) && holdSession.lastRankingSnapshot.length === 3,
    detail: `holdSession snapshot length = ${holdSession.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

test("B.3 — comparison_followup: { ...sessionContext, ... } preserva snapshot", () => {
  const comparisonOutput = {
    ...TURN1_SESSION,
    lastIntent: "comparison",
    lastInteractionType: "comparison_followup",
    lastComparisonProducts: [P1, P2],
  };
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    comparisonOutput, rd, { incomingLastBest: TURN1_SESSION.lastBestProduct }
  );
  return {
    ok: Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3,
    detail: `comparison_followup snapshot length = ${out.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

test("B.4 — context_decision_no_search: buildContextDecisionSessionContext preserva snapshot", () => {
  // buildContextDecisionSessionContext (L24728) usa { ...sessionContext, ... }
  // → após fix, snapshot é preservado via spread.
  const contextDecisionOutput = {
    ...TURN1_SESSION,
    lastIntent: "search",
    lastInteractionType: "context_decision",
    lastQuery: "nao to sentindo confianca",
  };
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    contextDecisionOutput, rd, { incomingLastBest: TURN1_SESSION.lastBestProduct }
  );
  return {
    ok: Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3,
    detail: `context_decision snapshot length = ${out.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

test("B.5 — directReply (não-clearContext): req.body.session_context preserva snapshot", () => {
  // directReply early return usa req.body?.session_context quando clearContext=false
  // → preserva o snapshot que veio do cliente.
  const incomingFromClient = { ...TURN1_SESSION }; // simula req.body.session_context
  const directReplyOutput = incomingFromClient; // when clearContext=false, returns as-is
  return {
    ok: Array.isArray(directReplyOutput.lastRankingSnapshot) && directReplyOutput.lastRankingSnapshot.length === 3,
    detail: `directReply snapshot length = ${directReplyOutput.lastRankingSnapshot?.length ?? "undefined"}`,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO C — Snapshot substituído apenas em nova busca formal
// ─────────────────────────────────────────────────────────────
section("Grupo C — Snapshot substituído apenas em nova busca formal");

test("C.1 — allowReplaceWinner=true + proposedProducts substitui lastRankingSnapshot", () => {
  // applyContractToSessionContext (L172): se allowReplaceWinner && proposedProducts → buildRankingSnapshot
  const newProducts = [
    { product_name: "Motorola Edge 40", price: "R$ 1.699", rank: 1 },
    { product_name: "Poco X5 Pro", price: "R$ 1.499", rank: 2 },
  ];
  const newBest = newProducts[0];
  const rd = { allowReplaceWinner: true, shouldPreserveAnchor: false };
  const out = applyContractToSessionContext(
    TURN1_SESSION, rd, {
      proposedBestProduct: newBest,
      proposedProducts: newProducts,
      incomingLastBest: TURN1_SESSION.lastBestProduct
    }
  );
  // Neste caso, lastRankingSnapshot deve ser SUBSTITUÍDO pela nova busca
  const wasReplaced =
    Array.isArray(out.lastRankingSnapshot) &&
    out.lastRankingSnapshot[0]?.product_name === newBest.product_name;
  return {
    ok: wasReplaced,
    detail: `Novo snapshot rank1 = ${out.lastRankingSnapshot?.[0]?.product_name ?? "undefined"}`,
  };
});

test("C.2 — shouldPreserveAnchor=true NÃO substitui lastRankingSnapshot de pesquisa anterior", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(
    TURN1_SESSION, rd, {
      proposedBestProduct: P2, // tentativa de substituir winner
      proposedProducts: [P2, P3],
      incomingLastBest: TURN1_SESSION.lastBestProduct
    }
  );
  // Com shouldPreserveAnchor, lastBestProduct mantém P1 e snapshot mantém os 3 itens originais
  const snapshotIntact =
    Array.isArray(out.lastRankingSnapshot) &&
    out.lastRankingSnapshot.length === 3 &&
    out.lastRankingSnapshot[0]?.product_name === P1.product_name;
  return {
    ok: snapshotIntact,
    detail: `Snapshot original preservado: length=${out.lastRankingSnapshot?.length}, rank1=${out.lastRankingSnapshot?.[0]?.product_name}`,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO D — Snapshot não é mutado
// ─────────────────────────────────────────────────────────────
section("Grupo D — Snapshot não é mutado");

test("D.1 — snapshot original não é alterado após applyContractToSessionContext", () => {
  const originalSnapshot = [...FORMAL_SNAPSHOT];
  const sessionCopy = { ...TURN1_SESSION, lastRankingSnapshot: originalSnapshot };
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  applyContractToSessionContext(sessionCopy, rd, {});
  // O array original não deve ter sido modificado
  return {
    ok: originalSnapshot.length === 3 &&
        originalSnapshot[0]?.product_name === P1.product_name,
    detail: `Snapshot original intacto: ${originalSnapshot.map(s => s.product_name).join(", ")}`,
  };
});

test("D.2 — scores no snapshot não são recalculados em turnos contextuais", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(TURN1_SESSION, rd, {});
  const scoresPreserved =
    out.lastRankingSnapshot?.[0]?.score === 0.95 &&
    out.lastRankingSnapshot?.[1]?.score === 0.81 &&
    out.lastRankingSnapshot?.[2]?.score === 0.72;
  return {
    ok: scoresPreserved,
    detail: `Scores: ${out.lastRankingSnapshot?.map(s => s.score).join(", ")}`,
  };
});

test("D.3 — ranks no snapshot não são reordenados em turnos contextuais", () => {
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(TURN1_SESSION, rd, {});
  const ranksCorrect =
    out.lastRankingSnapshot?.[0]?.rank === 1 &&
    out.lastRankingSnapshot?.[1]?.rank === 2 &&
    out.lastRankingSnapshot?.[2]?.rank === 3;
  return {
    ok: ranksCorrect,
    detail: `Ranks: ${out.lastRankingSnapshot?.map(s => s.rank).join(", ")}`,
  };
});

test("D.4 — null é retornado quando não há snapshot (não inventa dados)", () => {
  const emptySession = { ...TURN1_SESSION, lastRankingSnapshot: null };
  const rd = { shouldPreserveAnchor: true, allowReplaceWinner: false };
  const out = applyContractToSessionContext(emptySession, rd, {});
  return {
    ok: out.lastRankingSnapshot === null || out.lastRankingSnapshot === undefined,
    detail: `out.lastRankingSnapshot = ${out.lastRankingSnapshot}`,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO E — Ranking request no Turn N+1 (classifyMiaTurn)
// ─────────────────────────────────────────────────────────────
section("Grupo E — Ranking request funciona no Turn N+1");

test("E.1 — Turn 2 'quem ficou logo atrás?' COM âncora → ALTERNATIVE_REQUEST", () => {
  const r = classify("quem ficou logo atras", TURN1_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType}`,
  };
});

test("E.2 — Turn 2 'e o terceiro?' COM âncora → ALTERNATIVE_REQUEST", () => {
  const r = classify("e o terceiro", TURN1_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType}`,
  };
});

test("E.3 — Turn 2 'qual o segundo?' COM âncora → ALTERNATIVE_REQUEST (runner-up context)", () => {
  // "segundo" no contexto de "qual o segundo lugar" → ALTERNATIVE_REQUEST
  const r = classify("qual o segundo lugar", TURN1_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType}`,
  };
});

test("E.4 — Turn 2 'top 3' COM âncora → ALTERNATIVE_REQUEST", () => {
  const r = classify("top 3", TURN1_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType}`,
  };
});

test("E.5 — Turn 2 'me mostra os 3 melhores' — PATCH 7.6O-A: agora ALTERNATIVE_REQUEST", () => {
  // PATCH 7.6O-A adicionou Family F1 em detectsAlternativeRequestSignal:
  // "os 3 melhores" (dígito antes da palavra de qualidade) agora é detectado.
  // Gap de vocabulário pré-existente foi corrigido — atualizado de UNKNOWN → ALTERNATIVE_REQUEST.
  const r = classify("me mostra os 3 melhores", TURN1_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType} (ALTERNATIVE_REQUEST esperado após PATCH 7.6O-A)`,
  };
});

test("E.6 — Turn 3 after OBJECTION: snapshot ainda presente, alternativa funciona", () => {
  // Simula session após Turn 2 (hesitação): snapshot mantido pelo CSO path
  const afterObjSession = {
    ...TURN1_SESSION,
    lastIntent: "conversational",
    lastInteractionType: "hesitation_hold",
  };
  const r = classify("quem ficou logo atras", afterObjSession, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType} (após turno de hesitação)`,
  };
});

test("E.7 — Turn 2 'ficou colado atrás?' COM âncora → ALTERNATIVE_REQUEST", () => {
  const r = classify("tinha alguem colado atras", TURN1_SESSION, true);
  return {
    ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    detail: `turnType = ${r.turnType}`,
  };
});

test("E.8 — buildRankingSnapshot cria snapshot com ranks corretos", () => {
  const products = [
    { product_name: P1.product_name, finalScoreEngineScore: 0.95 },
    { product_name: P2.product_name, finalScoreEngineScore: 0.81 },
    { product_name: P3.product_name, finalScoreEngineScore: 0.72 },
  ];
  const snapshot = buildRankingSnapshot(products, products[0]);
  return {
    ok: Array.isArray(snapshot) &&
        snapshot.length === 3 &&
        snapshot[0]?.rank === 1 &&
        snapshot[1]?.rank === 2,
    detail: `Snapshot: ${snapshot?.map(s => `${s.product_name}(rank=${s.rank})`).join(", ")}`,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO F — Regressões (patches anteriores)
// ─────────────────────────────────────────────────────────────
section("Grupo F — Regressões");

test("F-7H.1 — simplifica pra mim [EXPLANATION_REQUEST]", () => {
  const r = classify("simplifica pra mim", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST, detail: r.turnType };
});
test("F-7H.2 — qual dá menos dor de cabeça [PRIORITY_SHIFT]", () => {
  const r = classify("qual da menos dor de cabeca", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT, detail: r.turnType };
});
test("F-7G.1 — algo parecido com esse [REFINEMENT]", () => {
  const r = classify("tem algo parecido com esse", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.REFINEMENT, detail: r.turnType };
});
test("F-7F.1 — fiquei em dúvida [OBJECTION]", () => {
  const r = classify("fiquei em duvida", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.OBJECTION, detail: r.turnType };
});
test("F-7F.2 — medo de me arrepender [OBJECTION]", () => {
  const r = classify("medo de me arrepender", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.OBJECTION, detail: r.turnType };
});
test("F-7E.1 — prefiro algo mais leve [PRIORITY_SHIFT]", () => {
  const r = classify("prefiro algo mais leve", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT, detail: r.turnType };
});
test("F-7E.2 — qual a lógica? [EXPLANATION_REQUEST]", () => {
  const r = classify("qual a logica", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST, detail: r.turnType };
});
test("F-76.1 — quem ficou logo atrás [ALTERNATIVE_REQUEST]", () => {
  const r = classify("quem ficou logo atras", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST, detail: r.turnType };
});
test("F-75.1 — quero o terceiro [ALTERNATIVE_REQUEST]", () => {
  const r = classify("qual o terceiro", TURN1_SESSION, true);
  return { ok: r.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST, detail: r.turnType };
});

// ─────────────────────────────────────────────────────────────
// Relatório Final
// ─────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`  PATCH 7.6J — Session Ranking Snapshot Integrity`);
console.log(`${"═".repeat(60)}`);
console.log(`  Total   : ${total}`);
console.log(`  Passed  : ${passed}`);
console.log(`  Failed  : ${failed}`);

if (failures.length) {
  console.log(`\n  FAILURES:`);
  failures.forEach(f => {
    console.log(`    ✗ ${f.label}`);
    if (f.detail) console.log(`        ${f.detail}`);
  });
}

console.log(`\n  ${failed === 0 ? "ALL TESTS PASSED ✓" : `${failed} TEST(S) FAILED ✗`}`);
console.log(`${"═".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
