/**
 * PATCH 7.9Z.1 — Conversational Continuity Fix validation
 *
 * Validates ANCHORED_SHORT_FOLLOW_UP: short post-anchor follow-ups must not
 * open new search or drop anchor/winner. Real new-search phrases must still pass.
 *
 * Usage: node scripts/test-mia-conversational-continuity-fix.js
 */

import { classifyMiaTurn, isAnchoredShortFollowUpQuery, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";

const WINNER = "Product Alpha 35";
const SESSION = {
  lastBestProduct: { product_name: WINNER, price: "R$ 2.399" },
  lastRankingSnapshot: [{ product_name: WINNER, rank: 1 }],
  budgetMax: 2500,
};

function simulate(message, { hasAnchor = true } = {}) {
  const sessionContext = hasAnchor ? SESSION : {};
  const anchoredShortFollowUp = isAnchoredShortFollowUpQuery(message, { hasActiveAnchor: hasAnchor });

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor: hasAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor,
    looksLikeShortPriorityFollowUp: anchoredShortFollowUp,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: false },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: hasAnchor,
      isAnchoredShortFollowUp: anchoredShortFollowUp,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isAnchoredShortFollowUp: anchoredShortFollowUp,
      looksLikeShortPriorityFollowUp: anchoredShortFollowUp,
      looksLikeAmbiguousFollowUp: false,
      isExplicitComparison: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" || routingDecision.allowNewSearch === true;

  return {
    message,
    anchoredShortFollowUp,
    turnType: cognitiveTurn.turnType,
    clearNewSearch,
    openedNewSearch,
    mode: routingDecision.mode,
    shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    allowReplaceWinner: routingDecision.allowReplaceWinner,
    responsePathHint: routingDecision.responsePathHint,
  };
}

const GROUPS = {
  A: [
    "qual recomenda?",
    "qual você recomenda?",
    "qual voce recomenda?",
    "qual você iria?",
    "qual voce iria?",
    "me indica?",
    "qual vale mais?",
    "qual é melhor?",
    "qual e melhor?",
    "melhor ir nele?",
    "você iria em qual?",
    "voce iria em qual?",
    "entre esses, qual?",
    "me fala qual?",
    "qual ficou melhor?",
  ],
  B: [
    "e bateria?",
    "e câmera?",
    "e camera?",
    "e desempenho?",
    "e conforto?",
    "e autonomia?",
    "e durabilidade?",
    "e custo-benefício?",
    "e custo beneficio?",
    "e o preço?",
    "e preco?",
    "e a bateria?",
    "e o desempenho?",
  ],
  C: [
    "e para jogos?",
    "e para jogar?",
    "e para trabalhar?",
    "e para trabalho?",
    "e para estudar?",
    "e para fotos?",
    "e para foto?",
    "e para uso pesado?",
    "e pra viagem?",
  ],
  D: [
    "e se eu quiser mais autonomia?",
    "e se câmera importar mais?",
    "e se camera importar mais?",
    "e esse?",
    "e essa?",
    "vale a pena?",
    "qual desses?",
  ],
  E: [
    "quero comprar um notebook",
    "procura uma TV",
    "me recomenda um mouse",
    "quero outro produto",
    "esquece esse, quero outro tipo",
    "começa do zero",
    "agora quero uma cadeira",
    "muda para notebook",
  ],
  F: [
    "tenho medo de errar",
    "você tem certeza?",
    "voce tem certeza?",
    "a galera recomenda?",
    "não me convenceu",
    "nao me convenceu",
    "tem outro?",
    "qual ficou em segundo?",
    "entendi",
    "ok",
  ],
  G: [
    "qual recomenda",
    "me indica",
    "e bateria",
    "qual vale",
    "melhor ir nele",
    "voce iria em qual",
    "e desempenho",
    "e conforto",
    "e para jogos",
    "e para trabalhar",
    "e o preco",
    "qual voce escolheria",
    "qual voce prefere",
    "qual compensa",
    "qual ficou melhor",
    "e autonomia",
    "e durabilidade",
    "e para fotos",
    "e pra viagem",
    "e esse",
  ],
};

function expectContinuity(result) {
  const leaks = [];
  if (!result.anchoredShortFollowUp) {
    leaks.push("NOT_DETECTED_AS_ANCHORED_SHORT_FOLLOW_UP");
  }
  if (result.clearNewSearch) leaks.push("CLEAR_NEW_COMMERCIAL_SEARCH");
  if (result.openedNewSearch) leaks.push("OPENED_NEW_SEARCH");
  if (result.shouldPreserveAnchor === false) leaks.push("ANCHOR_NOT_PRESERVED");
  if (result.allowReplaceWinner === true) leaks.push("WINNER_REPLACE_ALLOWED");
  if (result.turnType === MIA_TURN_TYPES.NEW_SEARCH) leaks.push("NEW_SEARCH_TURN_TYPE");
  return leaks;
}

function expectNewSearch(result) {
  const leaks = [];
  if (result.anchoredShortFollowUp) leaks.push("FALSE_ANCHORED_SHORT_FOLLOW_UP");
  if (!result.clearNewSearch && !result.openedNewSearch) leaks.push("NEW_SEARCH_NOT_OPENED");
  return leaks;
}

function expectFamilyPreserved(result) {
  const leaks = [];
  if (result.anchoredShortFollowUp) leaks.push("FALSE_ANCHORED_SHORT_FOLLOW_UP");
  return leaks;
}

const results = [];
let total = 0;
let passed = 0;

for (const msg of GROUPS.A) {
  total++;
  const r = simulate(msg);
  const leaks = expectContinuity(r);
  const ok = leaks.length === 0;
  if (ok) passed++;
  results.push({ group: "A", msg, ok, leaks, ...r });
}

for (const msg of GROUPS.B) {
  total++;
  const r = simulate(msg);
  const leaks = expectContinuity(r);
  const ok = leaks.length === 0;
  if (ok) passed++;
  results.push({ group: "B", msg, ok, leaks, ...r });
}

for (const msg of GROUPS.C) {
  total++;
  const r = simulate(msg);
  const leaks = expectContinuity(r);
  const ok = leaks.length === 0;
  if (ok) passed++;
  results.push({ group: "C", msg, ok, leaks, ...r });
}

for (const msg of GROUPS.D) {
  total++;
  const r = simulate(msg);
  const leaks = expectContinuity(r);
  const ok = leaks.length === 0;
  if (ok) passed++;
  results.push({ group: "D", msg, ok, leaks, ...r });
}

for (const msg of GROUPS.E) {
  total++;
  const r = simulate(msg, { hasAnchor: true });
  const leaks = expectNewSearch(r);
  const ok = leaks.length === 0;
  if (ok) passed++;
  results.push({ group: "E", msg, ok, leaks, ...r });
}

for (const msg of GROUPS.F) {
  total++;
  const r = simulate(msg, { hasAnchor: true });
  const leaks = expectFamilyPreserved(r);
  const ok = leaks.length === 0;
  if (ok) passed++;
  results.push({ group: "F", msg, ok, leaks, ...r });
}

for (const msg of GROUPS.G) {
  total++;
  const r = simulate(msg);
  const leaks = expectContinuity(r);
  const ok = leaks.length === 0;
  if (ok) passed++;
  results.push({ group: "G", msg, ok, leaks, ...r });
}

const failed = results.filter((r) => !r.ok);

console.log("PATCH 7.9Z.1 — Conversational Continuity Fix\n");
console.log(`Scenarios: ${total} | Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)\n`);

for (const group of ["A", "B", "C", "D", "E", "F", "G"]) {
  const g = results.filter((r) => r.group === group);
  const gOk = g.filter((r) => r.ok).length;
  console.log(`Group ${group}: ${gOk}/${g.length}`);
}

if (failed.length) {
  console.log("\n── Failures ──\n");
  for (const f of failed.slice(0, 25)) {
    console.log(`[${f.group}] "${f.msg}" → ${f.leaks.join(", ")}`);
  }
  if (failed.length > 25) console.log(`... +${failed.length - 25} more`);
}

const exitCode = passed === total ? 0 : 1;
console.log(
  `\nVeredito: ${exitCode === 0 ? "CONVERSATIONAL CONTINUITY FIX PASS" : "CONVERSATIONAL CONTINUITY FIX GAP"}`
);
process.exit(exitCode);
