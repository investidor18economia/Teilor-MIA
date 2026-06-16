/**
 * PATCH 8.0B — Informal Language Normalization Audit
 *
 * Usage: node scripts/test-mia-informal-language-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAcknowledgementFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isGreetingFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { applyInformalLanguageNormalization } from "../lib/miaInformalLanguageNormalization.js";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
};

const FAMILY_EXPECTATIONS = {
  GREETING: {
    turnType: MIA_TURN_TYPES.CONVERSATIONAL,
    familyQuery: isGreetingFamilyQuery,
    act: "greeting",
  },
  ACKNOWLEDGEMENT: {
    turnType: MIA_TURN_TYPES.REACTION,
    familyQuery: isAcknowledgementFamilyQuery,
    act: "acknowledgement",
  },
  REACTION: {
    turnType: MIA_TURN_TYPES.REACTION,
    familyQuery: null,
    act: null,
    requiresAnchor: true,
  },
  SOFT_DISAGREEMENT: {
    turnTypeCold: MIA_TURN_TYPES.CONVERSATIONAL,
    turnTypeAnchored: MIA_TURN_TYPES.OBJECTION,
    familyQuery: isSoftDisagreementFamilyQuery,
    act: "soft_disagreement",
  },
  CONFIDENCE_CHALLENGE: {
    turnTypeAnchored: MIA_TURN_TYPES.EXPLANATION_REQUEST,
    turnTypeCold: MIA_TURN_TYPES.CONVERSATIONAL,
    familyQuery: isConfidenceChallengeFamilyQuery,
    act: "confidence_challenge",
  },
  ANTI_REGRET: {
    turnTypeCold: MIA_TURN_TYPES.CONVERSATIONAL,
    turnTypeAnchored: MIA_TURN_TYPES.OBJECTION,
    familyQuery: isAntiRegretFamilyQuery,
    act: "anti_regret",
  },
};

const ORIGINAL_CASES = [
  { family: "GREETING", input: "koe" },
  { family: "GREETING", input: "eae" },
  { family: "GREETING", input: "fala ai" },
  { family: "GREETING", input: "fala mano" },
  { family: "GREETING", input: "salve" },
  { family: "GREETING", input: "qual a boa" },
  { family: "GREETING", input: "qual a fita" },
  { family: "GREETING", input: "qual o papo" },
  { family: "GREETING", input: "que que pega" },
  { family: "GREETING", input: "fala tu" },
  { family: "GREETING", input: "fala comigo" },
  { family: "GREETING", input: "opa mano" },
  { family: "GREETING", input: "opa chefia" },
  { family: "ACKNOWLEDGEMENT", input: "to ligado" },
  { family: "ACKNOWLEDGEMENT", input: "ta ligado" },
  { family: "ACKNOWLEDGEMENT", input: "saquei" },
  { family: "ACKNOWLEDGEMENT", input: "entendi" },
  { family: "ACKNOWLEDGEMENT", input: "blz" },
  { family: "ACKNOWLEDGEMENT", input: "beleza" },
  { family: "ACKNOWLEDGEMENT", input: "fechou" },
  { family: "ACKNOWLEDGEMENT", input: "show" },
  { family: "ACKNOWLEDGEMENT", input: "show de bola" },
  { family: "ACKNOWLEDGEMENT", input: "tmj" },
  { family: "ACKNOWLEDGEMENT", input: "demoro" },
  { family: "ACKNOWLEDGEMENT", input: "justo" },
  { family: "ACKNOWLEDGEMENT", input: "justíssimo" },
  { family: "REACTION", input: "slk", anchored: true },
  { family: "REACTION", input: "vish", anchored: true },
  { family: "REACTION", input: "eita", anchored: true },
  { family: "REACTION", input: "caraca", anchored: true },
  { family: "REACTION", input: "nossa", anchored: true },
  { family: "REACTION", input: "rapaz", anchored: true },
  { family: "REACTION", input: "oxe", anchored: true },
  { family: "REACTION", input: "uai", anchored: true },
  { family: "REACTION", input: "doidera", anchored: true },
  { family: "REACTION", input: "loucura", anchored: true },
  { family: "REACTION", input: "pesado", anchored: true },
  { family: "REACTION", input: "sinistro", anchored: true },
  { family: "SOFT_DISAGREEMENT", input: "sei nao" },
  { family: "SOFT_DISAGREEMENT", input: "sei lá" },
  { family: "SOFT_DISAGREEMENT", input: "to achando nao" },
  { family: "SOFT_DISAGREEMENT", input: "nao curti muito" },
  { family: "SOFT_DISAGREEMENT", input: "nao bateu" },
  { family: "SOFT_DISAGREEMENT", input: "nao me convenceu" },
  { family: "SOFT_DISAGREEMENT", input: "estranho isso ai" },
  { family: "CONFIDENCE_CHALLENGE", input: "tem certeza?", anchored: true },
  { family: "CONFIDENCE_CHALLENGE", input: "tu iria nesse?", anchored: true },
  { family: "CONFIDENCE_CHALLENGE", input: "bancaria essa?", anchored: true },
  { family: "CONFIDENCE_CHALLENGE", input: "sustenta isso?", anchored: true },
  { family: "CONFIDENCE_CHALLENGE", input: "continua valendo?", anchored: true },
  { family: "ANTI_REGRET", input: "nao quero me ferrar" },
  { family: "ANTI_REGRET", input: "nao quero fazer besteira" },
  { family: "ANTI_REGRET", input: "nao quero dor de cabeça" },
  { family: "ANTI_REGRET", input: "quero evitar problema" },
  { family: "ANTI_REGRET", input: "nao quero errar" },
];

const VARIANT_CASES = [
  { family: "GREETING", input: "coe" },
  { family: "GREETING", input: "koé" },
  { family: "GREETING", input: "coé" },
  { family: "GREETING", input: "koe mano" },
  { family: "GREETING", input: "qual a fita ai" },
  { family: "GREETING", input: "q fita" },
  { family: "GREETING", input: "q boa" },
  { family: "ACKNOWLEDGEMENT", input: "tlgd" },
  { family: "ACKNOWLEDGEMENT", input: "tlgd ne" },
  { family: "ACKNOWLEDGEMENT", input: "blz entao" },
  { family: "ACKNOWLEDGEMENT", input: "suave" },
  { family: "ACKNOWLEDGEMENT", input: "tranquilo" },
  { family: "ACKNOWLEDGEMENT", input: "de boa" },
  { family: "REACTION", input: "seloko", anchored: true },
  { family: "REACTION", input: "ce loko", anchored: true },
  { family: "REACTION", input: "c loko", anchored: true },
  { family: "GREETING", input: "bora" },
  { family: "ACKNOWLEDGEMENT", input: "partiu" },
];

function simulatePipeline(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : {};
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: hasActiveAnchor,
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
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: true },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isAcknowledgement: cognitiveTurn.signals?.isAcknowledgement,
      isGreeting: cognitiveTurn.signals?.isGreeting,
      isSoftDisagreement: cognitiveTurn.signals?.isSoftDisagreement,
      isAntiRegret: cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: cognitiveTurn.signals?.isConfidenceChallenge,
      isReaction: cognitiveTurn.signals?.isReaction,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  return { cognitiveTurn, routingDecision };
}

function evaluateCase(spec) {
  const anchored = spec.anchored === true || spec.family === "CONFIDENCE_CHALLENGE";
  const hasAnchor = anchored;
  const pipeline = simulatePipeline(spec.input, hasAnchor);
  const exp = FAMILY_EXPECTATIONS[spec.family];
  const failures = [];
  const normalized = applyInformalLanguageNormalization(spec.input);

  const expectedTurnType =
    spec.family === "SOFT_DISAGREEMENT" || spec.family === "ANTI_REGRET"
      ? (hasAnchor ? exp.turnTypeAnchored : exp.turnTypeCold)
      : spec.family === "CONFIDENCE_CHALLENGE"
        ? (hasAnchor ? exp.turnTypeAnchored : exp.turnTypeCold)
        : exp.turnType;

  if (pipeline.cognitiveTurn.turnType !== expectedTurnType) {
    failures.push(`turnType=${pipeline.cognitiveTurn.turnType} expected=${expectedTurnType}`);
  }

  if (exp.familyQuery && !exp.familyQuery(spec.input)) {
    failures.push("familyQuery=false");
  }

  if (exp.act && pipeline.routingDecision.conversationAct !== exp.act) {
    failures.push(`act=${pipeline.routingDecision.conversationAct} expected=${exp.act}`);
  }

  if (pipeline.routingDecision.allowNewSearch) {
    failures.push("new_search_leak");
  }

  if (hasAnchor && pipeline.routingDecision.shouldPreserveAnchor !== true) {
    failures.push("anchor_not_preserved");
  }

  if (spec.family === "REACTION" && !pipeline.cognitiveTurn.signals?.isReaction) {
    failures.push("reaction_signal=false");
  }

  return { ok: failures.length === 0, failures, normalized: normalized.text, pipeline };
}

function runSuite(label, cases) {
  let pass = 0;
  let fail = 0;
  console.log(`\n── ${label} ──\n`);
  for (const spec of cases) {
    const result = evaluateCase(spec);
    const ctx = spec.anchored || spec.family === "CONFIDENCE_CHALLENGE" ? "anchored" : "cold";
    if (result.ok) {
      pass += 1;
      console.log(`✓ [${ctx}] "${spec.input}" → "${result.normalized}"`);
    } else {
      fail += 1;
      console.log(`✗ [${ctx}] "${spec.input}" → ${result.failures.join("; ")} | norm="${result.normalized}"`);
    }
  }
  return { pass, fail };
}

console.log("PATCH 8.0B — Informal Language Normalization Audit");
console.log("\nCausa raiz (baseline): Router/pré-processamento — gírias não canonicalizadas antes da classificação.\n");

const original = runSuite("Cenários originais", ORIGINAL_CASES);
const variants = runSuite("Variantes (Regra 18)", VARIANT_CASES);
const totalPass = original.pass + variants.pass;
const totalFail = original.fail + variants.fail;

console.log(`\nResultado: ${totalPass}/${totalPass + totalFail} (${((totalPass / (totalPass + totalFail)) * 100).toFixed(1)}%)`);
console.log(`Cenários auditados: ${ORIGINAL_CASES.length + VARIANT_CASES.length}`);
console.log(`Variantes testadas: ${VARIANT_CASES.length}`);

process.exit(totalFail > 0 ? 1 : 0);
