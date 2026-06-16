/**
 * PATCH 7.9Z.2A — Conversational Stress Residual Cleanup validation
 *
 * Covers residual clusters from 7.9Z.2 without HTTP / SerpAPI.
 * Validates router + routing + contract hold for anchored conversations.
 *
 * Usage: node scripts/test-mia-conversational-stress-residual-cleanup.js
 */

import {
  classifyMiaTurn,
  isAcknowledgementFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isAntiRegretFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isConstraintChangeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isGreetingFamilyQuery,
  isAnchoredShortFollowUpQuery,
  isSecondBestDiscoveryFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";

const SESSION = {
  lastBestProduct: { product_name: "Product Alpha 35", price: "R$ 2.399" },
  lastRankingSnapshot: [{ product_name: "Product Alpha 35", rank: 1 }],
  budgetMax: 2500,
};

const FAMILY_DETECTORS = {
  ACKNOWLEDGEMENT: isAcknowledgementFamilyQuery,
  COMPREHENSION: (m) => isComprehensionFamilyQuery(m) || isComprehensionSemanticFamilyQuery(m),
  CONSTRAINT_CHANGE: isConstraintChangeFamilyQuery,
  CONFIDENCE_CHALLENGE: isConfidenceChallengeFamilyQuery,
  SOCIAL_VALIDATION: isSocialValidationFamilyQuery,
  SOFT_DISAGREEMENT: isSoftDisagreementFamilyQuery,
  ANTI_REGRET: isAntiRegretFamilyQuery,
  DECISION_CONFIRMATION: isDecisionConfirmationFamilyQuery,
  ALTERNATIVE_EXPLORATION: isAlternativeExplorationFamilyQuery,
  SECOND_BEST_DISCOVERY: isSecondBestDiscoveryFamilyQuery,
  GREETING: isGreetingFamilyQuery,
};

function simulate(message, { hasAnchor = true, allowNewSearch = false } = {}) {
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
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
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
    routingDecision.mode === "new_search" ||
    (routingDecision.allowNewSearch === true &&
      routingDecision.mode !== "context_hold" &&
      routingDecision.mode !== "conversational" &&
      routingDecision.mode !== "anchored_reaction");

  return {
    cognitiveTurn,
    routingDecision,
    clearNewSearch,
    openedNewSearch,
    anchoredShortFollowUp,
  };
}

function familyMatches(message, expected, acceptable = []) {
  const detect = (f) => FAMILY_DETECTORS[f]?.(message) === true;
  if (detect(expected)) return true;
  return acceptable.some((f) => detect(f));
}

function evaluateHold(message, spec) {
  const r = simulate(message, spec);
  const leaks = [];

  if (spec.expectFamily && !familyMatches(message, spec.expectFamily, spec.acceptable || [])) {
    leaks.push(`FAMILY expect=${spec.expectFamily}`);
  }
  if (spec.hold && r.openedNewSearch) leaks.push("OPENED_NEW_SEARCH");
  if (spec.hold && r.clearNewSearch) leaks.push("CLEAR_NEW_COMMERCIAL_SEARCH");
  if (spec.hold && r.routingDecision.shouldPreserveAnchor === false) leaks.push("ANCHOR_LOSS");
  if (spec.hold && r.routingDecision.allowReplaceWinner === true) leaks.push("WINNER_LOSS");

  return { ok: leaks.length === 0, leaks, message, ...r };
}

function evaluateNewSearch(message) {
  const r = simulate(message, { hasAnchor: true, allowNewSearch: true });
  const leaks = [];
  if (!r.openedNewSearch && !r.clearNewSearch) leaks.push("NEW_SEARCH_NOT_OPENED");
  return { ok: leaks.length === 0, leaks, message, ...r };
}

const GROUPS = {
  A: [
    ["faz sentido sim", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["faz sentido agora", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["agora faz sentido", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["boa, faz sentido", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["entendi melhor agora", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["agora saquei", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["ok entendi a recalibracao", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["saquei a logica", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["ok agora entendi", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["entendi agora", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["agora sim", { expectFamily: "ACKNOWLEDGEMENT", hold: true }],
    ["beleza, to mais calmo", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["ANTI_REGRET"], hold: true }],
    ["curti, mas ainda tenho duvida", { expectFamily: "SOFT_DISAGREEMENT", hold: true }],
  ],
  B: [
    ["explica melhor o porquê", { expectFamily: "COMPREHENSION", hold: true }],
    ["detalha melhor", { expectFamily: "COMPREHENSION", hold: true }],
    ["me explica melhor esse ponto", { expectFamily: "COMPREHENSION", hold: true }],
    ["aprofunda esse ponto", { expectFamily: "COMPREHENSION", hold: true }],
    ["fala mais desse motivo", { expectFamily: "COMPREHENSION", hold: true }],
    ["simplifica esse ponto", { expectFamily: "COMPREHENSION", hold: true }],
    ["detalha de novo", { expectFamily: "COMPREHENSION", hold: true }],
    ["explica melhor o porque", { expectFamily: "COMPREHENSION", hold: true }],
    ["me explica de novo", { expectFamily: "COMPREHENSION", hold: true }],
    ["pode repetir isso", { expectFamily: "COMPREHENSION", hold: true }],
  ],
  C: [
    ["quero gastar menos, mas sem perder muito", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["quero algo mais barato, mas ainda bom", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["e se eu quiser gastar menos sem abrir mão disso?", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["prioriza bateria", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["agora bateria pesa mais", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["e se câmera importar mais?", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["e se eu quiser mais autonomia?", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["e agora ate 1800", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["agora ate 2000", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["ate 3500 agora", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["baixar o orcamento", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["camera importa menos", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["preciso baixar mais", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["baixei o orcamento na cabeca", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["desempenho importa menos", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
    ["quero algo mais barato", { expectFamily: "CONSTRAINT_CHANGE", hold: true }],
  ],
  D: [
    ["qual vale mais agora?", { hold: true }],
    ["então mantém esse?", { hold: true }],
    ["continua nesse mesmo?", { hold: true }],
    ["ainda é ele?", { hold: true }],
    ["entre os dois, qual fica?", { hold: true }],
    ["ainda é a melhor opção?", { hold: true }],
    ["qual escolher?", { hold: true }],
    ["continua valendo?", { expectFamily: "CONFIDENCE_CHALLENGE", hold: true }],
    ["voce continua recomendando?", { expectFamily: "CONFIDENCE_CHALLENGE", hold: true }],
    ["entao mantem esse?", { expectFamily: "CONFIDENCE_CHALLENGE", acceptable: ["DECISION_CONFIRMATION"], hold: true }],
  ],
  E: [
    ["quero comprar um notebook", { newSearch: true }],
    ["procura uma TV", { newSearch: true }],
    ["me recomenda um mouse", { newSearch: true }],
    ["começa do zero", { newSearch: true }],
    ["esquece esse", { newSearch: true }],
    ["quero outro tipo de produto", { newSearch: true }],
  ],
  F: [
    ["tenho medo de errar", { expectFamily: "ANTI_REGRET", hold: true }],
    ["você tem certeza?", { expectFamily: "CONFIDENCE_CHALLENGE", hold: true }],
    ["a galera recomenda?", { expectFamily: "SOCIAL_VALIDATION", hold: true }],
    ["não me convenceu", { expectFamily: "SOFT_DISAGREEMENT", hold: true }],
    ["tem outro?", { expectFamily: "ALTERNATIVE_EXPLORATION", hold: true }],
    ["qual ficou em segundo?", { expectFamily: "SECOND_BEST_DISCOVERY", hold: true }],
    ["ok", { expectFamily: "ACKNOWLEDGEMENT", hold: true }],
    ["entendi", { expectFamily: "ACKNOWLEDGEMENT", acceptable: ["COMPREHENSION"], hold: true }],
    ["oi", { expectFamily: "GREETING", hold: true }],
    ["o povo fala bem ou da problema?", { expectFamily: "SOCIAL_VALIDATION", hold: true }],
    ["sera que muita gente se arrepende?", { expectFamily: "SOCIAL_VALIDATION", hold: true }],
    ["nao curti", { expectFamily: "SOFT_DISAGREEMENT", hold: true }],
    ["nao, perai", { expectFamily: "SOFT_DISAGREEMENT", hold: true }],
    ["to mais tranquilo", { expectFamily: "ANTI_REGRET", acceptable: ["ACKNOWLEDGEMENT"], hold: true }],
    ["se eu nao pegar esse qual voce indicaria?", { expectFamily: "ALTERNATIVE_EXPLORATION", hold: true }],
    ["voce sustenta?", { expectFamily: "CONFIDENCE_CHALLENGE", hold: true }],
    ["nao, espera", { expectFamily: "SOFT_DISAGREEMENT", hold: true }],
    ["voce sustenta ou eu erro?", { expectFamily: "CONFIDENCE_CHALLENGE", acceptable: ["ANTI_REGRET"], hold: true }],
    ["gostei, mas ainda to na duvida", { expectFamily: "SOFT_DISAGREEMENT", hold: true }],
    ["beleza, continua", { expectFamily: "ACKNOWLEDGEMENT", hold: true }],
    ["show, segue", { expectFamily: "ACKNOWLEDGEMENT", hold: true }],
    ["fala mia", { expectFamily: "GREETING", hold: true }],
    ["bom dia", { expectFamily: "GREETING", hold: true }],
    ["nao me convenceu totalmente", { expectFamily: "SOFT_DISAGREEMENT", hold: true }],
    ["quem ficou em segundo?", { expectFamily: "SECOND_BEST_DISCOVERY", hold: true }],
  ],
};

let total = 0;
let passed = 0;
const failures = [];

console.log("PATCH 7.9Z.2A — Conversational Stress Residual Cleanup\n");

for (const [group, items] of Object.entries(GROUPS)) {
  let gOk = 0;
  for (const [msg, spec] of items) {
    total += 1;
    const result = spec.newSearch ? evaluateNewSearch(msg) : evaluateHold(msg, spec);
    if (result.ok) {
      passed += 1;
      gOk += 1;
    } else {
      failures.push({ group, msg, leaks: result.leaks });
    }
  }
  console.log(`Group ${group}: ${gOk}/${items.length}`);
}

console.log(`\nScenarios: ${total} | Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)\n`);

if (failures.length) {
  console.log("── Failures ──\n");
  for (const f of failures.slice(0, 15)) {
    console.log(`  [${f.group}] "${f.msg}" → ${f.leaks.join(", ")}`);
  }
}

const verdict = passed === total ? "RESIDUAL CLEANUP PASS" : "RESIDUAL CLEANUP GAP";
console.log(`\nVeredito: ${verdict}\n`);
process.exit(passed === total ? 0 : 1);
