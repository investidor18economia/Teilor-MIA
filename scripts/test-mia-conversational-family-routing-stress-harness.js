/**
 * PATCH 7.9Z.2 — Conversational family routing in stress harness validation
 *
 * Ensures ACK, CC, and other conversational families route like dedicated flow audits.
 *
 * Usage: node scripts/test-mia-conversational-family-routing-stress-harness.js
 */

import {
  classifyMiaTurn,
  isAcknowledgementFamilyQuery,
  isAntiRegretFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isComprehensionFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isConstraintChangeFamilyQuery,
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

const GROUPS = {
  A: {
    family: "ACKNOWLEDGEMENT",
    path: "acknowledgement_flow",
    act: "acknowledgement",
    phrases: [
      "gostei",
      "curti",
      "gostei desse",
      "gostei dele",
      "show",
      "beleza",
      "ok",
      "fechado então",
    ],
  },
  B: {
    family: "CONFIDENCE_CHALLENGE",
    path: "confidence_challenge_flow",
    act: "confidence_challenge",
    phrases: [
      "continua recomendando?",
      "você continua recomendando?",
      "voce continua recomendando?",
      "ainda recomenda esse?",
      "você manteria?",
      "voce manteria?",
      "ainda acha esse melhor?",
      "sustenta essa escolha?",
      "você compraria mesmo?",
    ],
  },
  C: {
    family: "MIXED",
    phrases: [
      { msg: "tenho medo de errar", family: "ANTI_REGRET", act: "anti_regret" },
      { msg: "o povo fala bem?", family: "SOCIAL_VALIDATION", act: "social_validation" },
      { msg: "não me convenceu", family: "SOFT_DISAGREEMENT", act: "soft_disagreement" },
      { msg: "não entendi", family: "COMPREHENSION", act: "comprehension" },
      { msg: "quero gastar menos", family: "CONSTRAINT_CHANGE", act: "constraint_change" },
      { msg: "tem outro?", family: "ALTERNATIVE_EXPLORATION", act: "alternative_exploration" },
      { msg: "qual ficou em segundo?", family: "SECOND_BEST_DISCOVERY", act: "second_best_discovery" },
    ],
  },
  D: {
    family: "NEW_SEARCH",
    mustOpenSearch: true,
    phrases: [
      "quero comprar um notebook",
      "procura uma TV",
      "me recomenda um mouse",
      "quero outro produto",
      "começa do zero",
    ],
  },
};

function familyDetector(msg) {
  if (isAcknowledgementFamilyQuery(msg)) return "ACKNOWLEDGEMENT";
  if (isConfidenceChallengeFamilyQuery(msg)) return "CONFIDENCE_CHALLENGE";
  if (isAntiRegretFamilyQuery(msg)) return "ANTI_REGRET";
  if (isSocialValidationFamilyQuery(msg)) return "SOCIAL_VALIDATION";
  if (isSoftDisagreementFamilyQuery(msg)) return "SOFT_DISAGREEMENT";
  if (isComprehensionFamilyQuery(msg)) return "COMPREHENSION";
  if (isConstraintChangeFamilyQuery(msg)) return "CONSTRAINT_CHANGE";
  if (isAlternativeExplorationFamilyQuery(msg)) return "ALTERNATIVE_EXPLORATION";
  if (isSecondBestDiscoveryFamilyQuery(msg)) return "SECOND_BEST_DISCOVERY";
  return null;
}

function simulate(message) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "search",
    contextAction: "search",
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: true,
    looksLikeShortPriorityFollowUp: false,
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
    sessionContext: SESSION,
    incomingSessionContext: SESSION,
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: true,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
    },
    signals: { hasClearNewCommercialSearch: clearNewSearch },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    (routingDecision.allowNewSearch === true &&
      routingDecision.mode !== "context_hold" &&
      routingDecision.mode !== "conversational");

  return { cognitiveTurn, routingDecision, clearNewSearch, openedNewSearch, detectedFamily: familyDetector(message) };
}

function evaluateAckOrCc(message, spec) {
  const r = simulate(message);
  const leaks = [];

  if (r.openedNewSearch) leaks.push("OPENED_NEW_SEARCH");
  if (r.clearNewSearch) leaks.push("CLEAR_NEW_COMMERCIAL_SEARCH");
  if (r.routingDecision.shouldPreserveAnchor !== true) leaks.push("ANCHOR_NOT_PRESERVED");
  if (r.routingDecision.allowReplaceWinner === true) leaks.push("WINNER_REPLACE_ALLOWED");
  if (r.routingDecision.conversationAct !== spec.act) {
    leaks.push(`ACT=${r.routingDecision.conversationAct}`);
  }
  if (!r.cognitiveTurn.signals?.[`is${spec.family === "ACKNOWLEDGEMENT" ? "Acknowledgement" : "ConfidenceChallenge"}`] &&
      !familyDetector(message)) {
    leaks.push("ROUTER_SIGNAL_MISSING");
  }

  return { ok: leaks.length === 0, leaks, ...r };
}

function evaluateMixed(item) {
  const r = simulate(item.msg);
  const leaks = [];
  if (r.openedNewSearch) leaks.push("OPENED_NEW_SEARCH");
  if (r.routingDecision.shouldPreserveAnchor !== true) leaks.push("ANCHOR_NOT_PRESERVED");
  if (r.routingDecision.conversationAct !== item.act) leaks.push(`ACT=${r.routingDecision.conversationAct}`);
  return { ok: leaks.length === 0, leaks, msg: item.msg, ...r };
}

function evaluateNewSearch(message) {
  const r = simulate(message);
  const leaks = [];
  if (!r.openedNewSearch && !r.clearNewSearch) leaks.push("NEW_SEARCH_NOT_OPENED");
  return { ok: leaks.length === 0, leaks, msg: message, ...r };
}

function evaluateContinuity(message) {
  const r = simulate(message);
  const leaks = [];
  if (r.openedNewSearch) leaks.push("OPENED_NEW_SEARCH");
  if (r.routingDecision.conversationAct !== "contextual_follow_up") {
    leaks.push(`ACT=${r.routingDecision.conversationAct}`);
  }
  return {
    ok: !r.openedNewSearch && r.routingDecision.conversationAct === "contextual_follow_up",
    leaks,
    msg: message,
    ...r,
  };
}

const EXTRA_MIXED = [
  { msg: "nao quero me arrepender", act: "anti_regret" },
  { msg: "a galera recomenda?", act: "social_validation" },
  { msg: "nao me convenceu", act: "soft_disagreement" },
  { msg: "nao entendi", act: "comprehension" },
  { msg: "agora entendi", act: "acknowledgement", altAct: ["comprehension"] },
  { msg: "quero gastar menos", act: "constraint_change" },
  { msg: "prioriza bateria", act: "constraint_change" },
  { msg: "tem outro?", act: "alternative_exploration" },
  { msg: "qual ficou em segundo?", act: "second_best_discovery" },
  { msg: "plano b?", act: "second_best_discovery" },
  { msg: "vou nele", act: "decision_confirmation" },
  { msg: "qual recomenda?", continuity: true },
  { msg: "e bateria?", continuity: true },
  { msg: "me indica?", continuity: true },
  { msg: "recomenda", continuity: true },
  { msg: "indica um", continuity: true },
  { msg: "qual o melhor?", continuity: true },
  { msg: "detalha melhor", act: "comprehension" },
  { msg: "faz sentido agora", act: "acknowledgement", altAct: ["comprehension"] },
  { msg: "voce sustenta?", act: "confidence_challenge" },
  { msg: "perfeito", act: "acknowledgement" },
  { msg: "captei", act: "acknowledgement", altAct: ["comprehension"] },
  { msg: "show", act: "acknowledgement" },
  { msg: "blz", act: "acknowledgement" },
  { msg: "pode seguir", act: "acknowledgement" },
];

const results = [];
let total = 0;
let passed = 0;

for (const msg of GROUPS.A.phrases) {
  total++;
  const r = evaluateAckOrCc(msg, GROUPS.A);
  if (r.ok) passed++;
  results.push({ group: "A", msg, ...r });
}

for (const msg of GROUPS.B.phrases) {
  total++;
  const r = evaluateAckOrCc(msg, GROUPS.B);
  if (r.ok) passed++;
  results.push({ group: "B", msg, ...r });
}

for (const item of GROUPS.C.phrases) {
  total++;
  const r = evaluateMixed(item);
  if (r.ok) passed++;
  results.push({ group: "C", msg: item.msg, ...r });
}

for (const msg of GROUPS.D.phrases) {
  total++;
  const r = evaluateNewSearch(msg);
  if (r.ok) passed++;
  results.push({ group: "D", msg, ...r });
}

for (const item of EXTRA_MIXED) {
  total++;
  let r;
  if (item.continuity) {
    r = evaluateContinuity(item.msg);
  } else {
    r = evaluateMixed(item);
    if (item.altAct?.includes(r.routingDecision.conversationAct)) {
      r.ok = !r.openedNewSearch && r.routingDecision.shouldPreserveAnchor === true;
      r.leaks = r.ok ? [] : r.leaks;
    }
  }
  if (r.ok) passed++;
  results.push({ group: "E", msg: item.msg, ...r });
}

const extraAck = [
  "massa",
  "top",
  "perfeito",
  "fechou",
  "valeu",
  "demorou",
  "suave",
  "tranquilo",
  "de boa",
  "pode seguir",
  "continua",
  "entendi",
  "saquei",
  "agora entendi",
  "faz sentido",
  "clareou",
];
const extraCc = [
  "você tem certeza?",
  "tem certeza mesmo?",
  "ainda sustenta essa escolha?",
  "você bateria o martelo nisso?",
  "você compraria esse?",
  "se fosse você, compraria?",
  "esse ainda é o melhor mesmo?",
  "continua sendo a escolha mais forte?",
  "você não mudaria a recomendação?",
  "mantém ele como vencedor?",
  "beleza, ainda recomenda esse?",
  "ok, mas você tem certeza?",
];

for (const msg of extraAck) {
  total++;
  const r = evaluateAckOrCc(msg, GROUPS.A);
  if (r.ok) passed++;
  results.push({ group: "A+", msg, ...r });
}

for (const msg of extraCc) {
  total++;
  const r = evaluateAckOrCc(msg, GROUPS.B);
  if (r.ok) passed++;
  results.push({ group: "B+", msg, ...r });
}

const failed = results.filter((r) => !r.ok);

console.log("PATCH 7.9Z.2 — Conversational Family Routing Stress Harness\n");
console.log(`Scenarios: ${total} | Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)\n`);

for (const g of ["A", "B", "C", "D", "E", "A+", "B+"]) {
  const subset = results.filter((r) => r.group === g);
  if (!subset.length) continue;
  console.log(`Group ${g}: ${subset.filter((r) => r.ok).length}/${subset.length}`);
}

if (failed.length) {
  console.log("\n── Failures ──\n");
  for (const f of failed.slice(0, 20)) {
    console.log(`[${f.group}] "${f.msg}" → ${f.leaks.join(", ")}`);
  }
}

const exitCode = passed === total ? 0 : 1;
console.log(
  `\nVeredito: ${exitCode === 0 ? "CONVERSATIONAL FAMILY ROUTING STRESS HARNESS PASS" : "GAP"}`
);
process.exit(exitCode);
