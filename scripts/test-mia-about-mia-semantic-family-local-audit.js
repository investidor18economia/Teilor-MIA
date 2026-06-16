/**
 * PATCH 8.0A — ABOUT_MIA Semantic Family Local Audit
 *
 * Usage: node scripts/test-mia-about-mia-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isAboutMiaFamilyQuery } from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import {
  buildAboutMiaDeterministicFallback,
  isGenericInstitutionalFallbackReply,
  resolvePrimaryAboutMiaSubtopic,
} from "../lib/miaCompanyKnowledge.js";

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

const ORIGINAL_CASES = [
  { input: "Quem é você?", subtopic: "IDENTITY" },
  { input: "O que é a MIA?", subtopic: "IDENTITY" },
  { input: "O que a Teilor faz?", subtopic: "COMPANY" },
  { input: "Como vocês funcionam?", subtopic: "HOW_IT_WORKS" },
  { input: "Vocês recebem comissão?", subtopic: "COMMISSION" },
  { input: "Você favorece alguma loja?", subtopic: "TRUST" },
  { input: "Posso confiar?", subtopic: "TRUST" },
  { input: "Quem criou isso?", subtopic: "CREATOR" },
  { input: "Como vocês ganham dinheiro?", subtopic: "MONETIZATION" },
  { input: "Vocês vendem meus dados?", subtopic: "PRIVACY" },
  { input: "Qual o diferencial da MIA?", subtopic: "DIFFERENTIATOR" },
  { input: "Você é melhor que o ChatGPT?", subtopic: "DIFFERENTIATOR" },
  { input: "Você substitui pesquisa?", subtopic: "LIMITATIONS" },
  { input: "Quais suas limitações?", subtopic: "LIMITATIONS" },
];

const GENERALIZATION_CASES = [
  "quem vcs são?",
  "quem tá por trás disso?",
  "qual a de vocês?",
  "cês ganham quando compro?",
  "vocês puxam sardinha pra alguma loja?",
  "pq confiar nisso?",
  "isso é propaganda?",
  "voce e uma ia?",
  "como vc decide?",
  "as lojas pagam voces?",
  "guardam minhas informações?",
  "tem limitações?",
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
      isAboutMia: cognitiveTurn.signals?.isAboutMia,
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

  const fallback = buildAboutMiaDeterministicFallback(message);

  return {
    cognitiveTurn,
    routingDecision,
    fallback,
    familyQuery: isAboutMiaFamilyQuery(message, { hasActiveAnchor }),
  };
}

function evaluateCase(input, { expectSubtopic = null, anchored = false } = {}) {
  const pipeline = simulatePipeline(input, anchored);
  const failures = [];

  if (pipeline.cognitiveTurn.turnType !== MIA_TURN_TYPES.ABOUT_MIA) {
    failures.push(`router turnType=${pipeline.cognitiveTurn.turnType}`);
  }
  if (!pipeline.cognitiveTurn.signals?.isAboutMia) {
    failures.push("router signal isAboutMia=false");
  }
  if (pipeline.routingDecision.conversationAct !== "about_mia") {
    failures.push(`routing act=${pipeline.routingDecision.conversationAct}`);
  }
  if (pipeline.routingDecision.allowNewSearch) {
    failures.push("routing allowNewSearch leaked");
  }
  if (anchored && pipeline.routingDecision.shouldPreserveAnchor !== true) {
    failures.push("anchor not preserved");
  }
  if (isGenericInstitutionalFallbackReply(pipeline.fallback)) {
    failures.push("deterministic fallback is generic institutional");
  }
  if (expectSubtopic && resolvePrimaryAboutMiaSubtopic(input) !== expectSubtopic) {
    failures.push(`subtopic=${resolvePrimaryAboutMiaSubtopic(input)} expected=${expectSubtopic}`);
  }

  return { ok: failures.length === 0, failures, pipeline };
}

let pass = 0;
let fail = 0;

console.log("PATCH 8.0A — ABOUT_MIA Semantic Family Local Audit\n");

for (const spec of ORIGINAL_CASES) {
  for (const anchored of [false, true]) {
    const label = anchored ? "anchored" : "cold";
    const result = evaluateCase(spec.input, { expectSubtopic: spec.subtopic, anchored });
    if (result.ok) {
      pass += 1;
      console.log(`✓ [${label}] "${spec.input}"`);
    } else {
      fail += 1;
      console.log(`✗ [${label}] "${spec.input}" → ${result.failures.join("; ")}`);
    }
  }
}

console.log("\n── Generalization ──\n");

for (const input of GENERALIZATION_CASES) {
  const result = evaluateCase(input);
  if (result.ok) {
    pass += 1;
    console.log(`✓ "${input}"`);
  } else {
    fail += 1;
    console.log(`✗ "${input}" → ${result.failures.join("; ")}`);
  }
}

const anchoredGuard = simulatePipeline("posso confiar nessa recomendação?", true);
if (anchoredGuard.cognitiveTurn.turnType === MIA_TURN_TYPES.ABOUT_MIA) {
  fail += 1;
  console.log('\n✗ anchored guard failed: "posso confiar nessa recomendação?" must NOT be ABOUT_MIA');
} else {
  pass += 1;
  console.log('\n✓ anchored guard: recommendation trust stays out of ABOUT_MIA');
}

console.log(`\nResult: ${pass}/${pass + fail} (${((pass / (pass + fail)) * 100).toFixed(1)}%)`);
process.exit(fail > 0 ? 1 : 0);
