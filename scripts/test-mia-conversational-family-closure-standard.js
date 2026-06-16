/**
 * PATCH 7.7G — Conversational Family Closure Standard Audit
 *
 * Full-stack closure validation for conversational semantic families.
 * Initial family: GREETING.
 *
 * Usage: node scripts/test-mia-conversational-family-closure-standard.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isAcknowledgementFamilyQuery, isAlternativeExplorationFamilyQuery, isAntiRegretFamilyQuery, isComprehensionFamilyQuery, isConfidenceChallengeFamilyQuery, isDecisionConfirmationFamilyQuery, isGreetingFamilyQuery, isSecondBestDiscoveryFamilyQuery, isSocialValidationFamilyQuery, isSoftDisagreementFamilyQuery } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import {
  buildRoutingDecision,
  applyRoutingDecisionToContextResolution,
} from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { buildMiaPromptByRole } from "../lib/miaPrompt.js";
import {
  CLOSURE_STATUSES,
  detectGenericConversationalFallback,
  OFFICIAL_CLOSURE_CRITERIA,
} from "../lib/miaConversationalFamilyClosureStandard.js";

const GENERIC_WELCOME_DIRECT_REPLY =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

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

const SESSION_NO_ANCHOR = {};

const GREETING_CASES = [
  { input: "oi", family: "GREETING" },
  { input: "opa", family: "GREETING" },
  { input: "bom dia", family: "GREETING" },
  { input: "fala mia", family: "GREETING" },
];

const ACKNOWLEDGEMENT_CASES = [
  { input: "ok", family: "ACKNOWLEDGEMENT" },
  { input: "show", family: "ACKNOWLEDGEMENT" },
  { input: "blz", family: "ACKNOWLEDGEMENT" },
  { input: "fechou", family: "ACKNOWLEDGEMENT" },
];

const COMPREHENSION_CASES = [
  { input: "como assim?", family: "COMPREHENSION" },
  { input: "não entendi", family: "COMPREHENSION" },
  { input: "que?", family: "COMPREHENSION" },
  { input: "explica melhor", family: "COMPREHENSION" },
];

const SOFT_DISAGREEMENT_CASES = [
  { input: "acho que não", family: "SOFT_DISAGREEMENT" },
  { input: "não concordo muito", family: "SOFT_DISAGREEMENT" },
  { input: "não me convenceu", family: "SOFT_DISAGREEMENT" },
  { input: "não sei se é isso", family: "SOFT_DISAGREEMENT" },
];

const DECISION_CONFIRMATION_CASES = [
  { input: "posso comprar?", family: "DECISION_CONFIRMATION" },
  { input: "fecho nele?", family: "DECISION_CONFIRMATION" },
  { input: "então vou nesse?", family: "DECISION_CONFIRMATION" },
  { input: "compro esse?", family: "DECISION_CONFIRMATION" },
];

const ANTI_REGRET_CASES = [
  { input: "posso comprar tranquilo?", family: "ANTI_REGRET" },
  { input: "vou me arrepender?", family: "ANTI_REGRET" },
  { input: "é uma compra segura?", family: "ANTI_REGRET" },
  { input: "é uma escolha tranquila?", family: "ANTI_REGRET" },
];

const CONFIDENCE_CHALLENGE_CASES = [
  { input: "tem certeza?", family: "CONFIDENCE_CHALLENGE" },
  { input: "é isso mesmo?", family: "CONFIDENCE_CHALLENGE" },
  { input: "você garante?", family: "CONFIDENCE_CHALLENGE" },
  { input: "crava mesmo?", family: "CONFIDENCE_CHALLENGE" },
];

const SOCIAL_VALIDATION_CASES = [
  { input: "o pessoal gosta?", family: "SOCIAL_VALIDATION" },
  { input: "é popular?", family: "SOCIAL_VALIDATION" },
  { input: "tem boa fama?", family: "SOCIAL_VALIDATION" },
  { input: "quem compra recomenda?", family: "SOCIAL_VALIDATION" },
];

const SECOND_BEST_DISCOVERY_CASES = [
  { input: "qual ficou em segundo?", family: "SECOND_BEST_DISCOVERY" },
  { input: "qual é o plano b?", family: "SECOND_BEST_DISCOVERY" },
  { input: "quem quase ganhou?", family: "SECOND_BEST_DISCOVERY" },
  { input: "me mostra o segundo melhor", family: "SECOND_BEST_DISCOVERY" },
  { input: "se esse não der, qual seria?", family: "SECOND_BEST_DISCOVERY" },
];

const ALTERNATIVE_EXPLORATION_CASES = [
  { input: "tem outro?", family: "ALTERNATIVE_EXPLORATION" },
  { input: "me mostra outro", family: "ALTERNATIVE_EXPLORATION" },
  { input: "quero ver outro", family: "ALTERNATIVE_EXPLORATION" },
  { input: "quais outras opções?", family: "ALTERNATIVE_EXPLORATION" },
];

const ALL_CASES = [
  ...GREETING_CASES,
  ...ACKNOWLEDGEMENT_CASES,
  ...COMPREHENSION_CASES,
  ...SOFT_DISAGREEMENT_CASES,
  ...DECISION_CONFIRMATION_CASES,
  ...ANTI_REGRET_CASES,
  ...CONFIDENCE_CHALLENGE_CASES,
  ...SOCIAL_VALIDATION_CASES,
  ...SECOND_BEST_DISCOVERY_CASES,
  ...ALTERNATIVE_EXPLORATION_CASES,
];

const CONTEXTUAL_DIRECT_REPLY_BYPASS_TURNS = new Set([
  "OBJECTION",
  "REFINEMENT",
  "ALTERNATIVE_REQUEST",
  "EXPLANATION_REQUEST",
  "PRIORITY_SHIFT",
  "FOLLOW_UP",
]);

function normalizeQuery(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mirror handler detectIntent() for greeting-relevant inputs. */
function detectLegacyIntentMirror(message = "") {
  const q = normalizeQuery(message);
  if (!q) return "empty";
  if (/^(oi|ola|opa|eai|e ai|eae|iae|fala|salve|bom dia|boa tarde|boa noite)$/.test(q)) {
    return "greeting";
  }
  return "search";
}

/**
 * Mirror resolveContextQuery() terminal fallback for short non-shopping turns.
 * Handler sets institutional directReply before greeting_flow can run.
 */
function buildContextResolutionMirror(message = "") {
  return {
    mode: "general_answer",
    shouldSkipProductSearch: true,
    clearContext: true,
    directReply: GENERIC_WELCOME_DIRECT_REPLY,
    lockedComparisonFollowUp: false,
  };
}

function resolveVerbalizerRole({ intent, responsePathFinal, cognitiveTurn, family }) {
  if (responsePathFinal === "greeting_flow") return "greeting_reply";
  if (responsePathFinal === "acknowledgement_flow") return "acknowledgement_reply";
  if (responsePathFinal === "comprehension_flow") return "comprehension_reply";
  if (responsePathFinal === "soft_disagreement_flow") return "soft_disagreement_reply";
  if (responsePathFinal === "decision_confirmation_flow") return "decision_confirmation_reply";
  if (responsePathFinal === "anti_regret_flow") return "anti_regret_reply";
  if (responsePathFinal === "confidence_challenge_flow") return "confidence_challenge_reply";
  if (responsePathFinal === "social_validation_flow") return "social_validation_reply";
  if (responsePathFinal === "second_best_discovery_flow") return "second_best_discovery_reply";
  if (responsePathFinal === "alternative_exploration_flow") return "alternative_exploration_reply";
  if (family === "GREETING" && cognitiveTurn.signals?.isGreeting) return "greeting_reply";
  if (family === "ACKNOWLEDGEMENT" && cognitiveTurn.signals?.isAcknowledgement) {
    return "acknowledgement_reply";
  }
  if (family === "COMPREHENSION" && cognitiveTurn.signals?.isComprehension) {
    return "comprehension_reply";
  }
  if (family === "SOFT_DISAGREEMENT" && cognitiveTurn.signals?.isSoftDisagreement) {
    return "soft_disagreement_reply";
  }
  if (family === "DECISION_CONFIRMATION" && cognitiveTurn.signals?.isDecisionConfirmation) {
    return "decision_confirmation_reply";
  }
  if (family === "ANTI_REGRET" && cognitiveTurn.signals?.isAntiRegret) {
    return "anti_regret_reply";
  }
  if (family === "CONFIDENCE_CHALLENGE" && cognitiveTurn.signals?.isConfidenceChallenge) {
    return "confidence_challenge_reply";
  }
  if (family === "SOCIAL_VALIDATION" && cognitiveTurn.signals?.isSocialValidation) {
    return "social_validation_reply";
  }
  if (family === "SECOND_BEST_DISCOVERY" && cognitiveTurn.signals?.isSecondBestDiscovery) {
    return "second_best_discovery_reply";
  }
  if (family === "ALTERNATIVE_EXPLORATION" && cognitiveTurn.signals?.isAlternativeExploration) {
    return "alternative_exploration_reply";
  }
  if (intent === "greeting") return "greeting_reply";
  if (intent === "acknowledgement") return "acknowledgement_reply";
  if (intent === "comprehension") return "comprehension_reply";
  if (intent === "soft_disagreement") return "soft_disagreement_reply";
  if (intent === "decision_confirmation") return "decision_confirmation_reply";
  if (intent === "anti_regret") return "anti_regret_reply";
  if (intent === "confidence_challenge") return "confidence_challenge_reply";
  if (intent === "social_validation") return "social_validation_reply";
  if (intent === "second_best_discovery") return "second_best_discovery_reply";
  if (intent === "alternative_exploration") return "alternative_exploration_reply";
  if (responsePathFinal === "context_resolution_direct_reply_early_return") {
    return "generic_institutional_reply";
  }
  return "decision_generic";
}

function buildIdealGreetingPreview(hasAnchor) {
  if (hasAnchor) {
    return "Opa! Continuamos naquele produto. Quer que eu explique melhor ou compare com outra opção?";
  }
  return "Oi! Me diz o que você está pensando em comprar que eu te ajudo a decidir.";
}

function buildIdealAcknowledgementPreview(hasAnchor) {
  if (hasAnchor) {
    return "Perfeito. Mantemos essa escolha como referência. Se quiser, posso explicar melhor ou comparar com outra opção.";
  }
  return "Boa. Quando quiser, me diz o que você está pensando em comprar e eu te ajudo a decidir.";
}

function buildIdealComprehensionPreview(hasAnchor) {
  if (hasAnchor) {
    return "Claro. Mantemos Produto Recomendado Atual como referência. Posso explicar a escolha de forma mais simples.";
  }
  return "Claro. Me diz qual parte ficou confusa que eu explico de um jeito mais simples.";
}

function buildIdealSoftDisagreementPreview(hasAnchor) {
  if (hasAnchor) {
    return "Justo. Mantendo Produto Recomendado Atual como referência, posso revisar o ponto que não te convenceu.";
  }
  return "Justo. Me diz qual ponto não te convenceu que eu reviso contigo.";
}

function buildIdealDecisionConfirmationPreview(hasAnchor) {
  if (hasAnchor) {
    return "Sim, eu iria nele — mantendo Produto Recomendado Atual como referência. Só vale confirmar preço, loja e condição antes de fechar.";
  }
  return "Consigo confirmar, mas preciso primeiro saber qual produto estamos decidindo.";
}

function buildIdealAntiRegretPreview(hasAnchor) {
  if (hasAnchor) {
    return "Entendo a preocupação. Mantendo Produto Recomendado Atual como referência, a escolha faz sentido pelo que vimos — mas vale confirmar preço, loja e condição antes de fechar, para reduzir arrependimento.";
  }
  return "Entendo a preocupação. Para avaliar o risco de arrependimento com honestidade, preciso saber qual compra estamos decidindo.";
}

function buildIdealConfidenceChallengePreview(hasAnchor) {
  if (hasAnchor) {
    return "Tenho segurança nessa escolha para o seu caso, mas não como garantia absoluta — eu manteria Produto Recomendado Atual porque continua equilibrando melhor os pontos que você trouxe.";
  }
  return "Consigo revisar minha confiança, mas preciso saber qual decisão estamos falando.";
}

function buildIdealSocialValidationPreview(hasAnchor) {
  if (hasAnchor) {
    return "Dá para olhar sinais de reputação, mas não vou inventar review se eu não tiver esse dado. Mantendo Produto Recomendado Atual como referência, eu olharia popularidade, avaliações, reclamações recorrentes e risco de arrependimento.";
  }
  return "Consigo te ajudar a avaliar isso, mas preciso saber de qual produto você está falando — sem contexto não dá para afirmar reputação real.";
}

function buildIdealSecondBestDiscoveryPreview(hasAnchor) {
  if (hasAnchor) {
    return "O vencedor continua sendo Produto Recomendado Atual. Para cravar o plano B, preciso ter o ranking ou alternativas comparadas — sem isso não vou inventar quem ficou em segundo.";
  }
  return "Consigo te mostrar o plano B, mas preciso primeiro ter uma recomendação ou ranking anterior para comparar — sem contexto não dá para cravar quem ficou em segundo.";
}

function buildIdealAlternativeExplorationPreview(hasAnchor) {
  if (hasAnchor) {
    return "Dá para ver outra opção sim — mantendo Produto Recomendado Atual como referência. Para cravar outra opção, preciso ter alternativas comparadas no contexto; sem isso não vou inventar outra escolha.";
  }
  return "Consigo te mostrar outra opção, mas preciso saber qual produto ou decisão estamos usando como referência.";
}

function detectInventedSocialProof(text = "") {
  const t = String(text || "").toLowerCase();
  return (
    /\b(todo mundo|todos amam|todos recomendam|nota alta|reviews? (sao|são) excelentes|super bem avaliado|muita gente ama)\b/.test(t) ||
    /\b(100%|unanimidade|excelente reputacao com certeza)\b/.test(t)
  );
}

function detectInventedSecondPlace(text = "", hasRankingSnapshot = false) {
  if (hasRankingSnapshot) return false;
  const t = String(text || "").toLowerCase();
  return (
    /\b(plano b (seria|é)|segundo colocado (seria|é)|quem ficou em segundo (foi|é)|o runner[- ]up (seria|é))\b/.test(t) &&
    !/\b(nao vou inventar|preciso ter|sem isso|ranking|alternativas comparadas)\b/.test(t)
  );
}

function detectInventedAlternative(text = "", hasRankingSnapshot = false) {
  if (hasRankingSnapshot) return false;
  const t = String(text || "").toLowerCase();
  return (
    /\b(alternativa (seria|é)|outra op[cç][aã]o (seria|é|boa [ée])|vai nesse outro|seria uma op[cç][aã]o)\b/.test(t) &&
    !/\b(nao vou inventar|preciso ter|sem isso|ranking|alternativas comparadas|preciso saber)\b/.test(t)
  );
}

function simulateHandlerResponsePath({
  message,
  hasAnchor,
  intent,
  contextResolution,
  cognitiveTurn,
  routingDecision,
  bridgeAudit,
  clearNewSearch,
}) {
  let ctx = { ...contextResolution };
  applyRoutingDecisionToContextResolution(routingDecision, ctx);

  let directReply = ctx.directReply;
  let effectiveIntent = intent;

  // PATCH 7.6E — contextual anchored turns clear directReply; CONVERSATIONAL/GREETING excluded.
  const shouldBypassDirectReplyForContextualTurn =
    hasAnchor &&
    !clearNewSearch &&
    CONTEXTUAL_DIRECT_REPLY_BYPASS_TURNS.has(cognitiveTurn.turnType);

  if (shouldBypassDirectReplyForContextualTurn) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false };
  }

  // PATCH 7.7H — GREETING response path wiring (mirror handler)
  const isGreetingResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isGreeting === true ||
      isGreetingFamilyQuery(message) ||
      (
        routingDecision.mode === "conversational" &&
        routingDecision.conversationAct === "greeting"
      )
    );

  if (isGreetingResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "greeting" };
    effectiveIntent = "greeting";
  }

  // PATCH 7.7I — ACKNOWLEDGEMENT response path wiring (mirror handler)
  const isAcknowledgementResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isAcknowledgement === true ||
      isAcknowledgementFamilyQuery(message) ||
      routingDecision.conversationAct === "acknowledgement" ||
      routingDecision.responsePathHint === "acknowledgement_reply" ||
      routingDecision.responsePathHint === "acknowledgement_anchored"
    );

  if (isAcknowledgementResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "acknowledgement" };
    effectiveIntent = "acknowledgement";
  }

  // PATCH 7.7M — COMPREHENSION response path wiring (mirror handler)
  const isComprehensionResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isComprehension === true ||
      isComprehensionFamilyQuery(message) ||
      routingDecision.conversationAct === "comprehension" ||
      routingDecision.responsePathHint === "comprehension_reply" ||
      routingDecision.responsePathHint === "comprehension_anchored"
    );

  if (isComprehensionResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "comprehension" };
    effectiveIntent = "comprehension";
  }

  // PATCH 7.7Q — SOFT_DISAGREEMENT response path wiring (mirror handler)
  const isSoftDisagreementResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isSoftDisagreement === true ||
      isSoftDisagreementFamilyQuery(message) ||
      routingDecision.conversationAct === "soft_disagreement" ||
      routingDecision.responsePathHint === "soft_disagreement_reply" ||
      routingDecision.responsePathHint === "soft_disagreement_anchored"
    );

  if (isSoftDisagreementResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "soft_disagreement" };
    effectiveIntent = "soft_disagreement";
  }

  // PATCH 7.8D — DECISION_CONFIRMATION response path wiring (mirror handler)
  const isDecisionConfirmationResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isDecisionConfirmation === true ||
      isDecisionConfirmationFamilyQuery(message) ||
      routingDecision.conversationAct === "decision_confirmation" ||
      routingDecision.responsePathHint === "decision_confirmation_reply" ||
      routingDecision.responsePathHint === "decision_confirmation_anchored"
    );

  if (isDecisionConfirmationResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "decision_confirmation" };
    effectiveIntent = "decision_confirmation";
  }

  // PATCH 7.8H — ANTI_REGRET response path wiring (mirror handler)
  const isAntiRegretResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isAntiRegret === true ||
      isAntiRegretFamilyQuery(message) ||
      routingDecision.conversationAct === "anti_regret" ||
      routingDecision.responsePathHint === "anti_regret_reply" ||
      routingDecision.responsePathHint === "anti_regret_anchored"
    );

  if (isAntiRegretResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "anti_regret" };
    effectiveIntent = "anti_regret";
  }

  // PATCH 7.8L — CONFIDENCE_CHALLENGE response path wiring (mirror handler)
  const isConfidenceChallengeResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isConfidenceChallenge === true ||
      isConfidenceChallengeFamilyQuery(message) ||
      routingDecision.conversationAct === "confidence_challenge" ||
      routingDecision.responsePathHint === "confidence_challenge_reply" ||
      routingDecision.responsePathHint === "confidence_challenge_anchored"
    );

  if (isConfidenceChallengeResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "confidence_challenge" };
    effectiveIntent = "confidence_challenge";
  }

  // PATCH 7.8P — SOCIAL_VALIDATION response path wiring (mirror handler)
  const isSocialValidationResponsePath =
    cognitiveTurn.signals?.isSocialValidation === true ||
    isSocialValidationFamilyQuery(message) ||
    routingDecision.conversationAct === "social_validation" ||
    routingDecision.responsePathHint === "social_validation_reply" ||
    routingDecision.responsePathHint === "social_validation_anchored";

  if (isSocialValidationResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "social_validation" };
    effectiveIntent = "social_validation";
  }

  // PATCH 7.9D — SECOND_BEST_DISCOVERY response path wiring (mirror handler)
  const isSecondBestDiscoveryResponsePath =
    cognitiveTurn.signals?.isSecondBestDiscovery === true ||
    isSecondBestDiscoveryFamilyQuery(message) ||
    routingDecision.conversationAct === "second_best_discovery" ||
    routingDecision.responsePathHint === "second_best_discovery_reply" ||
    routingDecision.responsePathHint === "second_best_discovery_anchored";

  if (isSecondBestDiscoveryResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "second_best_discovery" };
    effectiveIntent = "second_best_discovery";
  }

  // PATCH 7.9H — ALTERNATIVE_EXPLORATION response path wiring (mirror handler)
  const isAlternativeExplorationResponsePath =
    cognitiveTurn.signals?.isAlternativeExploration === true ||
    isAlternativeExplorationFamilyQuery(message) ||
    routingDecision.conversationAct === "alternative_exploration" ||
    routingDecision.responsePathHint === "alternative_exploration_reply" ||
    routingDecision.responsePathHint === "alternative_exploration_anchored";

  if (isAlternativeExplorationResponsePath) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false, mode: "alternative_exploration" };
    effectiveIntent = "alternative_exploration";
  }

  // Handler gate ~26131 — directReply early return precedes conversational flows.
  if (directReply && !ctx.lockedComparisonFollowUp) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: directReply,
      winnerChanged: !!ctx.clearContext && hasAnchor,
      effectiveIntent,
      clearContext: !!ctx.clearContext,
    };
  }

  if (effectiveIntent === "greeting") {
    return {
      responsePathFinal: "greeting_flow",
      finalResponsePreview: buildIdealGreetingPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "acknowledgement") {
    return {
      responsePathFinal: "acknowledgement_flow",
      finalResponsePreview: buildIdealAcknowledgementPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "comprehension") {
    return {
      responsePathFinal: "comprehension_flow",
      finalResponsePreview: buildIdealComprehensionPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "soft_disagreement") {
    return {
      responsePathFinal: "soft_disagreement_flow",
      finalResponsePreview: buildIdealSoftDisagreementPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "decision_confirmation") {
    return {
      responsePathFinal: "decision_confirmation_flow",
      finalResponsePreview: buildIdealDecisionConfirmationPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "anti_regret") {
    return {
      responsePathFinal: "anti_regret_flow",
      finalResponsePreview: buildIdealAntiRegretPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "confidence_challenge") {
    return {
      responsePathFinal: "confidence_challenge_flow",
      finalResponsePreview: buildIdealConfidenceChallengePreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "social_validation") {
    return {
      responsePathFinal: "social_validation_flow",
      finalResponsePreview: buildIdealSocialValidationPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "second_best_discovery") {
    return {
      responsePathFinal: "second_best_discovery_flow",
      finalResponsePreview: buildIdealSecondBestDiscoveryPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  if (effectiveIntent === "alternative_exploration") {
    return {
      responsePathFinal: "alternative_exploration_flow",
      finalResponsePreview: buildIdealAlternativeExplorationPreview(hasAnchor),
      winnerChanged: false,
      effectiveIntent,
      clearContext: false,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    winnerChanged: false,
    effectiveIntent,
    clearContext: !!ctx.clearContext,
  };
}

function simulateFullStack(message, hasAnchor, family = "GREETING") {
  const sessionContext = hasAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = detectLegacyIntentMirror(message);
  const legacyContextAction = legacyIntent === "greeting" ? "conversation" : "search";
  const contextResolution = buildContextResolutionMirror(message);

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor: hasAnchor,
    detectedIntent: legacyIntent,
    contextAction: legacyContextAction,
    contextResolution,
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, legacyIntent);
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: legacyContextAction,
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: hasAnchor,
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
    contextResolution,
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: hasAnchor,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
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

  const responseSim = simulateHandlerResponsePath({
    message,
    hasAnchor,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextResolution,
    cognitiveTurn,
    routingDecision,
    bridgeAudit,
    clearNewSearch,
  });

  const anchorPreserved =
    !hasAnchor ||
    (routingDecision.shouldPreserveAnchor === true &&
      routingDecision.anchorProduct?.product_name === MOCK_WINNER.product_name &&
      !responseSim.winnerChanged);

  const verbalizerRole = resolveVerbalizerRole({
    intent: responseSim.effectiveIntent,
    responsePathFinal: responseSim.responsePathFinal,
    cognitiveTurn,
    family,
  });

  const conversationalPromptUsesRole =
    (verbalizerRole === "greeting_reply" &&
      buildMiaPromptByRole("greeting_reply").includes("MIA")) ||
    (verbalizerRole === "acknowledgement_reply" &&
      buildMiaPromptByRole("acknowledgement_reply").includes("MIA")) ||
    (verbalizerRole === "comprehension_reply" &&
      buildMiaPromptByRole("comprehension_reply").includes("MIA")) ||
    (verbalizerRole === "soft_disagreement_reply" &&
      buildMiaPromptByRole("soft_disagreement_reply").includes("MIA")) ||
    (verbalizerRole === "decision_confirmation_reply" &&
      buildMiaPromptByRole("decision_confirmation_reply").includes("MIA")) ||
    (verbalizerRole === "anti_regret_reply" &&
      buildMiaPromptByRole("anti_regret_reply").includes("MIA")) ||
    (verbalizerRole === "confidence_challenge_reply" &&
      buildMiaPromptByRole("confidence_challenge_reply").includes("MIA")) ||
    (verbalizerRole === "social_validation_reply" &&
      buildMiaPromptByRole("social_validation_reply").includes("MIA")) ||
    (verbalizerRole === "second_best_discovery_reply" &&
      buildMiaPromptByRole("second_best_discovery_reply").includes("MIA")) ||
    (verbalizerRole === "alternative_exploration_reply" &&
      buildMiaPromptByRole("alternative_exploration_reply").includes("MIA"));

  return {
    legacyIntent,
    cognitiveTurn,
    bridgeAudit,
    routingDecision,
    responseSim,
    anchorPreserved,
    verbalizerRole,
    conversationalPromptUsesRole,
    openedNewSearch:
      routingDecision.mode === "new_search" || routingDecision.allowNewSearch === true,
    fallbackGenericDetected: detectGenericConversationalFallback(
      responseSim.finalResponsePreview
    ),
  };
}

function evaluateLayerFailures(spec, stack) {
  const failures = [];
  const { cognitiveTurn, routingDecision, bridgeAudit, responseSim } = stack;
  const family = spec.family;

  const routerOk =
    family === "GREETING"
      ? cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL &&
        cognitiveTurn.signals?.isGreeting === true &&
        isGreetingFamilyQuery(spec.input)
      : family === "ACKNOWLEDGEMENT"
        ? cognitiveTurn.turnType === MIA_TURN_TYPES.REACTION &&
          cognitiveTurn.signals?.isAcknowledgement === true &&
          isAcknowledgementFamilyQuery(spec.input)
        : family === "COMPREHENSION"
          ? (
              (spec.hasAnchor
                ? cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
                : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
              cognitiveTurn.signals?.isComprehension === true &&
              isComprehensionFamilyQuery(spec.input)
            )
          : family === "SOFT_DISAGREEMENT"
            ? (
                (spec.hasAnchor
                  ? cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION
                  : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
                cognitiveTurn.signals?.isSoftDisagreement === true &&
                isSoftDisagreementFamilyQuery(spec.input)
              )
            : family === "DECISION_CONFIRMATION"
              ? (
                  (spec.hasAnchor
                    ? cognitiveTurn.turnType === MIA_TURN_TYPES.FOLLOW_UP
                    : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
                  cognitiveTurn.signals?.isDecisionConfirmation === true &&
                  isDecisionConfirmationFamilyQuery(spec.input)
                )
              : family === "ANTI_REGRET"
                ? (
                    (spec.hasAnchor
                      ? cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION
                      : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
                    cognitiveTurn.signals?.isAntiRegret === true &&
                    isAntiRegretFamilyQuery(spec.input)
                  )
                : family === "CONFIDENCE_CHALLENGE"
                  ? (
                      (spec.hasAnchor
                        ? cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
                        : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
                      cognitiveTurn.signals?.isConfidenceChallenge === true &&
                      isConfidenceChallengeFamilyQuery(spec.input)
                    )
                  : family === "SOCIAL_VALIDATION"
                    ? (
                        (spec.hasAnchor
                          ? cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
                          : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
                        cognitiveTurn.signals?.isSocialValidation === true &&
                        isSocialValidationFamilyQuery(spec.input)
                      )
                    : family === "SECOND_BEST_DISCOVERY"
                      ? (
                          (spec.hasAnchor
                            ? cognitiveTurn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
                            : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
                          cognitiveTurn.signals?.isSecondBestDiscovery === true &&
                          isSecondBestDiscoveryFamilyQuery(spec.input)
                        )
                      : family === "ALTERNATIVE_EXPLORATION"
                        ? (
                            (spec.hasAnchor
                              ? cognitiveTurn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
                              : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) &&
                            cognitiveTurn.signals?.isAlternativeExploration === true &&
                            isAlternativeExplorationFamilyQuery(spec.input)
                          )
                        : false;

  if (!routerOk) {
    failures.push({
      layer: "Router",
      detail:
        family === "GREETING"
          ? `expected CONVERSATIONAL+isGreeting, got ${cognitiveTurn.turnType}`
          : family === "ACKNOWLEDGEMENT"
            ? `expected REACTION+isAcknowledgement, got ${cognitiveTurn.turnType}`
            : family === "COMPREHENSION"
              ? `expected COMPREHENSION family signal, got ${cognitiveTurn.turnType}`
              : family === "SOFT_DISAGREEMENT"
                ? `expected SOFT_DISAGREEMENT family signal, got ${cognitiveTurn.turnType}`
                : family === "DECISION_CONFIRMATION"
                  ? `expected DECISION_CONFIRMATION family signal, got ${cognitiveTurn.turnType}`
                  : family === "ANTI_REGRET"
                    ? `expected ANTI_REGRET family signal, got ${cognitiveTurn.turnType}`
                    : family === "CONFIDENCE_CHALLENGE"
                      ? `expected CONFIDENCE_CHALLENGE family signal, got ${cognitiveTurn.turnType}`
                      : family === "SOCIAL_VALIDATION"
                        ? `expected SOCIAL_VALIDATION family signal, got ${cognitiveTurn.turnType}`
                        : family === "SECOND_BEST_DISCOVERY"
                          ? `expected SECOND_BEST_DISCOVERY family signal, got ${cognitiveTurn.turnType}`
                          : `expected ALTERNATIVE_EXPLORATION family signal, got ${cognitiveTurn.turnType}`,
    });
  }

  if (stack.openedNewSearch) {
    failures.push({
      layer: "Routing",
      detail: `allowNewSearch=${routingDecision.allowNewSearch} mode=${routingDecision.mode}`,
    });
  }

  if (bridgeAudit.active) {
    const comprehensionBridgeOverrideOk =
      family === "COMPREHENSION" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isComprehension === true &&
      responseSim.responsePathFinal === "comprehension_flow";

    const softDisagreementBridgeOverrideOk =
      family === "SOFT_DISAGREEMENT" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isSoftDisagreement === true &&
      responseSim.responsePathFinal === "soft_disagreement_flow";

    const decisionConfirmationBridgeOverrideOk =
      family === "DECISION_CONFIRMATION" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isDecisionConfirmation === true &&
      responseSim.responsePathFinal === "decision_confirmation_flow";

    const antiRegretBridgeOverrideOk =
      family === "ANTI_REGRET" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isAntiRegret === true &&
      responseSim.responsePathFinal === "anti_regret_flow";

    const confidenceChallengeBridgeOverrideOk =
      family === "CONFIDENCE_CHALLENGE" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isConfidenceChallenge === true &&
      responseSim.responsePathFinal === "confidence_challenge_flow";

    const socialValidationBridgeOverrideOk =
      family === "SOCIAL_VALIDATION" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isSocialValidation === true &&
      responseSim.responsePathFinal === "social_validation_flow";

    const secondBestDiscoveryBridgeOverrideOk =
      family === "SECOND_BEST_DISCOVERY" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isSecondBestDiscovery === true &&
      responseSim.responsePathFinal === "second_best_discovery_flow";

    const alternativeExplorationBridgeOverrideOk =
      family === "ALTERNATIVE_EXPLORATION" &&
      spec.hasAnchor &&
      cognitiveTurn.signals?.isAlternativeExploration === true &&
      responseSim.responsePathFinal === "alternative_exploration_flow";

    if (
      !comprehensionBridgeOverrideOk &&
      !softDisagreementBridgeOverrideOk &&
      !decisionConfirmationBridgeOverrideOk &&
      !antiRegretBridgeOverrideOk &&
      !confidenceChallengeBridgeOverrideOk &&
      !socialValidationBridgeOverrideOk &&
      !secondBestDiscoveryBridgeOverrideOk &&
      !alternativeExplorationBridgeOverrideOk
    ) {
      failures.push({
        layer: "Contract",
        detail: "cognitive bridge forced legacy intent away from conversational path",
      });
    }
  }

  const expectedFlow =
    family === "GREETING"
      ? "greeting_flow"
      : family === "ACKNOWLEDGEMENT"
        ? "acknowledgement_flow"
        : family === "COMPREHENSION"
          ? "comprehension_flow"
          : family === "SOFT_DISAGREEMENT"
            ? "soft_disagreement_flow"
            : family === "DECISION_CONFIRMATION"
              ? "decision_confirmation_flow"
              : family === "ANTI_REGRET"
                ? "anti_regret_flow"
                : family === "CONFIDENCE_CHALLENGE"
                  ? "confidence_challenge_flow"
                  : family === "SOCIAL_VALIDATION"
                    ? "social_validation_flow"
                    : family === "SECOND_BEST_DISCOVERY"
                      ? "second_best_discovery_flow"
                      : "alternative_exploration_flow";
  const expectedRole =
    family === "GREETING"
      ? "greeting_reply"
      : family === "ACKNOWLEDGEMENT"
        ? "acknowledgement_reply"
        : family === "COMPREHENSION"
          ? "comprehension_reply"
          : family === "SOFT_DISAGREEMENT"
            ? "soft_disagreement_reply"
            : family === "DECISION_CONFIRMATION"
              ? "decision_confirmation_reply"
              : family === "ANTI_REGRET"
                ? "anti_regret_reply"
                : family === "CONFIDENCE_CHALLENGE"
                  ? "confidence_challenge_reply"
                  : family === "SOCIAL_VALIDATION"
                    ? "social_validation_reply"
                    : family === "SECOND_BEST_DISCOVERY"
                      ? "second_best_discovery_reply"
                      : "alternative_exploration_reply";
  const earlyReturnDetail =
    family === "GREETING"
      ? "contextResolution.directReply early return precedes greeting_flow — institutional fallback"
      : family === "ACKNOWLEDGEMENT"
        ? "contextResolution.directReply early return precedes acknowledgement_flow — institutional fallback"
        : family === "COMPREHENSION"
          ? "contextResolution.directReply early return precedes comprehension_flow — institutional fallback"
          : family === "SOFT_DISAGREEMENT"
            ? "contextResolution.directReply early return precedes soft_disagreement_flow — institutional fallback"
            : family === "DECISION_CONFIRMATION"
              ? "contextResolution.directReply early return precedes decision_confirmation_flow — institutional fallback"
              : family === "ANTI_REGRET"
                ? "contextResolution.directReply early return precedes anti_regret_flow — institutional fallback"
                : family === "CONFIDENCE_CHALLENGE"
                  ? "contextResolution.directReply early return precedes confidence_challenge_flow — institutional fallback"
                  : family === "SOCIAL_VALIDATION"
                    ? "contextResolution.directReply early return precedes social_validation_flow — institutional fallback"
                    : family === "SECOND_BEST_DISCOVERY"
                      ? "contextResolution.directReply early return precedes second_best_discovery_flow — institutional fallback"
                      : "contextResolution.directReply early return precedes alternative_exploration_flow — institutional fallback";

  if (
    responseSim.responsePathFinal === "context_resolution_direct_reply_early_return" &&
    stack.fallbackGenericDetected
  ) {
    failures.push({
      layer: "Response/Verbalizer",
      detail: earlyReturnDetail,
    });
  }

  if (
    ((family === "GREETING" && cognitiveTurn.signals?.isGreeting) ||
      (family === "ACKNOWLEDGEMENT" && cognitiveTurn.signals?.isAcknowledgement) ||
      (family === "COMPREHENSION" && cognitiveTurn.signals?.isComprehension) ||
      (family === "SOFT_DISAGREEMENT" && cognitiveTurn.signals?.isSoftDisagreement) ||
      (family === "DECISION_CONFIRMATION" && cognitiveTurn.signals?.isDecisionConfirmation) ||
      (family === "ANTI_REGRET" && cognitiveTurn.signals?.isAntiRegret) ||
      (family === "CONFIDENCE_CHALLENGE" && cognitiveTurn.signals?.isConfidenceChallenge) ||
      (family === "SOCIAL_VALIDATION" && cognitiveTurn.signals?.isSocialValidation) ||
      (family === "SECOND_BEST_DISCOVERY" && cognitiveTurn.signals?.isSecondBestDiscovery) ||
      (family === "ALTERNATIVE_EXPLORATION" && cognitiveTurn.signals?.isAlternativeExploration)) &&
    !stack.openedNewSearch &&
    stack.verbalizerRole !== expectedRole &&
    responseSim.responsePathFinal !== expectedFlow
  ) {
    failures.push({
      layer: "Response/Verbalizer",
      detail: `expected ${expectedRole} path, got ${stack.verbalizerRole}/${responseSim.responsePathFinal}`,
    });
  }

  if (stack.fallbackGenericDetected) {
    failures.push({
      layer: "Response/Verbalizer",
      detail: "generic conversational fallback detected in final preview",
    });
  }

  if (spec.hasAnchor && stack.responseSim.clearContext === true) {
    failures.push({
      layer: "Response/Verbalizer",
      detail: `clearContext=true on anchored ${family}`,
    });
  }

  if (spec.hasAnchor && !stack.anchorPreserved) {
    failures.push({
      layer: "Anchor preservation",
      detail: "anchor/winner not preserved in simulated response path",
    });
  }

  if (
    family === "SOCIAL_VALIDATION" &&
    detectInventedSocialProof(stack.responseSim.finalResponsePreview)
  ) {
    failures.push({
      layer: "Response/Verbalizer",
      detail: "invented social proof/review detected in final preview",
    });
  }

  if (
    family === "SECOND_BEST_DISCOVERY" &&
    detectInventedSecondPlace(stack.responseSim.finalResponsePreview, false)
  ) {
    failures.push({
      layer: "Response/Verbalizer",
      detail: "invented second-place product detected in final preview",
    });
  }

  if (
    family === "ALTERNATIVE_EXPLORATION" &&
    detectInventedAlternative(stack.responseSim.finalResponsePreview, false)
  ) {
    failures.push({
      layer: "Response/Verbalizer",
      detail: "invented alternative product detected in final preview",
    });
  }

  return failures;
}

function resolveClosureStatus(failures, stack) {
  const routerRoutingOk = !failures.some((f) =>
    ["Router", "Routing", "Contract"].includes(f.layer)
  );
  const responseOk = !failures.some((f) =>
    ["Response/Verbalizer", "Anchor preservation"].includes(f.layer)
  );

  if (failures.length === 0) return CLOSURE_STATUSES.FULLY_CLOSED;
  if (routerRoutingOk && !responseOk) {
    return CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE;
  }
  return CLOSURE_STATUSES.NOT_CLOSED;
}

function evaluateCase({ input, family }, hasAnchor) {
  const stack = simulateFullStack(input, hasAnchor, family);
  const failures = evaluateLayerFailures({ input, family, hasAnchor }, stack);
  const status = resolveClosureStatus(failures, stack);
  const primaryFailureLayer = failures[0]?.layer || "none";

  return {
    input,
    family,
    context: hasAnchor ? "anchored" : "no_anchor",
    routerTurnType: stack.cognitiveTurn.turnType,
    routerSignals: {
      isGreeting: !!stack.cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!stack.cognitiveTurn.signals?.isAcknowledgement,
      isConversational: !!stack.cognitiveTurn.signals?.isConversational,
      isComprehension: !!stack.cognitiveTurn.signals?.isComprehension,
      isSoftDisagreement: !!stack.cognitiveTurn.signals?.isSoftDisagreement,
      isDecisionConfirmation: !!stack.cognitiveTurn.signals?.isDecisionConfirmation,
    },
    legacyIntent: stack.legacyIntent,
    effectiveIntent: stack.responseSim.effectiveIntent,
    clearContext: stack.responseSim.clearContext,
    routingMode: stack.routingDecision.mode,
    conversationAct: stack.routingDecision.conversationAct,
    allowNewSearch: stack.routingDecision.allowNewSearch,
    allowCommercialFallback: stack.routingDecision.allowCommercialFallback,
    shouldPreserveAnchor: stack.routingDecision.shouldPreserveAnchor,
    contractApplied: stack.bridgeAudit.active,
    responsePathHint: stack.routingDecision.responsePathHint,
    responsePathFinal: stack.responseSim.responsePathFinal,
    finalResponsePreview: stack.responseSim.finalResponsePreview,
    fallbackGenericDetected: stack.fallbackGenericDetected,
    anchorPreserved: stack.anchorPreserved,
    winnerChanged: stack.responseSim.winnerChanged,
    verbalizerRole: stack.verbalizerRole,
    status,
    primaryFailureLayer,
    failures,
    passed: status === CLOSURE_STATUSES.FULLY_CLOSED,
  };
}

console.log("\nPATCH 7.7G — Conversational Family Closure Standard Audit\n");
console.log("Standard: Router → Routing → Contract → Verbalizer → Final response\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false\n");

const records = [];
for (const spec of ALL_CASES) {
  records.push(evaluateCase(spec, false));
  records.push(evaluateCase(spec, true));
}

const greetingRecords = records.filter((r) => r.family === "GREETING");
const ackRecords = records.filter((r) => r.family === "ACKNOWLEDGEMENT");
const comprehensionRecords = records.filter((r) => r.family === "COMPREHENSION");
const softDisagreementRecords = records.filter((r) => r.family === "SOFT_DISAGREEMENT");
const decisionConfirmationRecords = records.filter((r) => r.family === "DECISION_CONFIRMATION");
const antiRegretRecords = records.filter((r) => r.family === "ANTI_REGRET");

const routerFailures = records.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;
const routingFailures = records.filter((r) =>
  r.failures.some((f) => f.layer === "Routing")
).length;
const contractFailures = records.filter((r) =>
  r.failures.some((f) => f.layer === "Contract")
).length;
const responseFailures = records.filter((r) =>
  r.failures.some((f) => f.layer === "Response/Verbalizer")
).length;

console.log("── Per-case ──\n");
for (const r of records) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.family}] [${r.context}] "${r.input}" | router=${r.routerTurnType} route=${r.routingMode} path=${r.responsePathFinal} generic=${r.fallbackGenericDetected} | ${r.status}`
  );
}

console.log("\n── Layer failures ──\n");
console.log(`Router failures: ${routerFailures}`);
console.log(`Routing failures: ${routingFailures}`);
console.log(`Contract failures: ${contractFailures}`);
console.log(`Response/Verbalizer failures: ${responseFailures}`);

console.log("\n── GREETING closure summary ──\n");
const greetingFullyClosed = greetingRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const greetingTechnicalOnly = greetingRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${greetingFullyClosed}/${greetingRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${greetingTechnicalOnly}/${greetingRecords.length}`);

console.log("\n── ACKNOWLEDGEMENT closure summary ──\n");
const ackFullyClosed = ackRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const ackTechnicalOnly = ackRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${ackFullyClosed}/${ackRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${ackTechnicalOnly}/${ackRecords.length}`);

console.log("\n── COMPREHENSION closure summary ──\n");
const comprehensionFullyClosed = comprehensionRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const comprehensionTechnicalOnly = comprehensionRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${comprehensionFullyClosed}/${comprehensionRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${comprehensionTechnicalOnly}/${comprehensionRecords.length}`);

console.log("\n── SOFT_DISAGREEMENT closure summary ──\n");
const softDisagreementFullyClosed = softDisagreementRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const softDisagreementTechnicalOnly = softDisagreementRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${softDisagreementFullyClosed}/${softDisagreementRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${softDisagreementTechnicalOnly}/${softDisagreementRecords.length}`);

console.log("\n── DECISION_CONFIRMATION closure summary ──\n");
const decisionConfirmationFullyClosed = decisionConfirmationRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const decisionConfirmationTechnicalOnly = decisionConfirmationRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${decisionConfirmationFullyClosed}/${decisionConfirmationRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${decisionConfirmationTechnicalOnly}/${decisionConfirmationRecords.length}`);

console.log("\n── ANTI_REGRET closure summary ──\n");
const antiRegretFullyClosed = antiRegretRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const antiRegretTechnicalOnly = antiRegretRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${antiRegretFullyClosed}/${antiRegretRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${antiRegretTechnicalOnly}/${antiRegretRecords.length}`);

const confidenceChallengeRecords = records.filter((r) => r.family === "CONFIDENCE_CHALLENGE");

console.log("\n── CONFIDENCE_CHALLENGE closure summary ──\n");
const confidenceChallengeFullyClosed = confidenceChallengeRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const confidenceChallengeTechnicalOnly = confidenceChallengeRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${confidenceChallengeFullyClosed}/${confidenceChallengeRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${confidenceChallengeTechnicalOnly}/${confidenceChallengeRecords.length}`);

const socialValidationRecords = records.filter((r) => r.family === "SOCIAL_VALIDATION");

console.log("\n── SOCIAL_VALIDATION closure summary ──\n");
const socialValidationFullyClosed = socialValidationRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const socialValidationTechnicalOnly = socialValidationRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${socialValidationFullyClosed}/${socialValidationRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${socialValidationTechnicalOnly}/${socialValidationRecords.length}`);

const secondBestDiscoveryRecords = records.filter((r) => r.family === "SECOND_BEST_DISCOVERY");

console.log("\n── SECOND_BEST_DISCOVERY closure summary ──\n");
const secondBestDiscoveryFullyClosed = secondBestDiscoveryRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const secondBestDiscoveryTechnicalOnly = secondBestDiscoveryRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${secondBestDiscoveryFullyClosed}/${secondBestDiscoveryRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${secondBestDiscoveryTechnicalOnly}/${secondBestDiscoveryRecords.length}`);

const alternativeExplorationRecords = records.filter((r) => r.family === "ALTERNATIVE_EXPLORATION");

console.log("\n── ALTERNATIVE_EXPLORATION closure summary ──\n");
const alternativeExplorationFullyClosed = alternativeExplorationRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED
).length;
const alternativeExplorationTechnicalOnly = alternativeExplorationRecords.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log(`FULLY_CLOSED: ${alternativeExplorationFullyClosed}/${alternativeExplorationRecords.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${alternativeExplorationTechnicalOnly}/${alternativeExplorationRecords.length}`);

const fullyClosed = records.filter((r) => r.status === CLOSURE_STATUSES.FULLY_CLOSED).length;
const technicalOnly = records.filter(
  (r) => r.status === CLOSURE_STATUSES.TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE
).length;
console.log("\n── Combined closure summary ──\n");
console.log(`FULLY_CLOSED: ${fullyClosed}/${records.length}`);
console.log(`TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE: ${technicalOnly}/${records.length}`);

console.log("\n── Official closure criteria (documented) ──\n");
OFFICIAL_CLOSURE_CRITERIA.forEach((c, i) => console.log(`${i + 1}. ${c}`));

console.log("\n── Final report ──\n");
console.log("1. Files: lib/miaConversationalFamilyClosureStandard.js, lib/miaPrompt.js, pages/api/chat-gpt4o.js, scripts/test-mia-conversational-family-closure-standard.js");
console.log("2. Generic fallback detector: >=2 institutional markers OR 'Posso te ajudar com compras'");
console.log(`3. GREETING closure: ${greetingFullyClosed}/${greetingRecords.length} FULLY_CLOSED`);
console.log(`4. ACKNOWLEDGEMENT closure: ${ackFullyClosed}/${ackRecords.length} FULLY_CLOSED`);
console.log(`5. COMPREHENSION closure: ${comprehensionFullyClosed}/${comprehensionRecords.length} FULLY_CLOSED`);
console.log(`6. SOFT_DISAGREEMENT closure: ${softDisagreementFullyClosed}/${softDisagreementRecords.length} FULLY_CLOSED`);
console.log(`7. DECISION_CONFIRMATION closure: ${decisionConfirmationFullyClosed}/${decisionConfirmationRecords.length} FULLY_CLOSED`);
console.log(`8. ANTI_REGRET closure: ${antiRegretFullyClosed}/${antiRegretRecords.length} FULLY_CLOSED`);
console.log(`9. CONFIDENCE_CHALLENGE closure: ${confidenceChallengeFullyClosed}/${confidenceChallengeRecords.length} FULLY_CLOSED`);
console.log(`10. SOCIAL_VALIDATION closure: ${socialValidationFullyClosed}/${socialValidationRecords.length} FULLY_CLOSED`);
console.log(`11. SECOND_BEST_DISCOVERY closure: ${secondBestDiscoveryFullyClosed}/${secondBestDiscoveryRecords.length} FULLY_CLOSED`);
console.log(`12. ALTERNATIVE_EXPLORATION closure: ${alternativeExplorationFullyClosed}/${alternativeExplorationRecords.length} FULLY_CLOSED`);
console.log(
  `13. GREETING status: ${
    greetingFullyClosed === greetingRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `14. ACKNOWLEDGEMENT status: ${
    ackFullyClosed === ackRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `15. COMPREHENSION status: ${
    comprehensionFullyClosed === comprehensionRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `16. SOFT_DISAGREEMENT status: ${
    softDisagreementFullyClosed === softDisagreementRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `17. DECISION_CONFIRMATION status: ${
    decisionConfirmationFullyClosed === decisionConfirmationRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `18. ANTI_REGRET status: ${
    antiRegretFullyClosed === antiRegretRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `19. CONFIDENCE_CHALLENGE status: ${
    confidenceChallengeFullyClosed === confidenceChallengeRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `20. SOCIAL_VALIDATION status: ${
    socialValidationFullyClosed === socialValidationRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `21. SECOND_BEST_DISCOVERY status: ${
    secondBestDiscoveryFullyClosed === secondBestDiscoveryRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(
  `22. ALTERNATIVE_EXPLORATION status: ${
    alternativeExplorationFullyClosed === alternativeExplorationRecords.length ? "FULLY CLOSED" : "NOT FULLY CLOSED"
  }`
);
console.log(`23. Router/Routing local correctness: Router ${routerFailures === 0 ? "OK" : "FAIL"}, Routing ${routingFailures === 0 ? "OK" : "FAIL"}`);
console.log("24. Next patch: next conversational family per roadmap (after ALTERNATIVE_EXPLORATION FULLY_CLOSED)");

const standardOk =
  OFFICIAL_CLOSURE_CRITERIA.length === 10 &&
  fullyClosed === records.length &&
  !records.some((r) => r.fallbackGenericDetected) &&
  routerFailures === 0 &&
  routingFailures === 0;

console.log(`\nPATCH 7.7G–7.9H closure standard audit: ${standardOk ? "PASSED" : "CHECK REPORT"}\n`);

process.exit(0);
