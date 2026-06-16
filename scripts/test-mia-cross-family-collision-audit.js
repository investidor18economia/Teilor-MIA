/**
 * PATCH 7.9Y — Cross-Family Collision Audit (AUDIT ONLY)
 *
 * Measures dominant vs secondary intent when multiple conversational families collide.
 * Does NOT modify production behavior.
 *
 * Usage: node scripts/test-mia-cross-family-collision-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isConstraintChangeFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isComprehensionFamilyQuery,
  isAcknowledgementFamilyQuery,
  isGreetingFamilyQuery,
  hasAcknowledgementOpeningPrefix,
} from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { detectGenericConversationalFallback } from "../lib/miaConversationalFamilyClosureStandard.js";

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

const GENERIC_WELCOME_DIRECT_REPLY =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const FAMILY_PATH = {
  ANTI_REGRET: "anti_regret_flow",
  CONSTRAINT_CHANGE: "constraint_change_flow",
  CONFIDENCE_CHALLENGE: "confidence_challenge_flow",
  SOCIAL_VALIDATION: "social_validation_flow",
  SOFT_DISAGREEMENT: "soft_disagreement_flow",
  ALTERNATIVE_EXPLORATION: "alternative_exploration_flow",
  SECOND_BEST_DISCOVERY: "second_best_discovery_flow",
  DECISION_CONFIRMATION: "decision_confirmation_flow",
  COMPREHENSION: "comprehension_flow",
  ACKNOWLEDGEMENT: "acknowledgement_flow",
  GREETING: "greeting_flow",
  COMMERCIAL_SEARCH: "default_product_search",
};

/** group, input, dominant, secondary, acceptable[], lowRealism */
const COLLISION_CASES = [
  // ── A ACK + strong tail ──
  { g: "A", i: "ok, mas não me convenceu", d: "SOFT_DISAGREEMENT", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "beleza, mas fiquei com um pé atrás", d: "SOFT_DISAGREEMENT", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "show, mas não gostei muito", d: "SOFT_DISAGREEMENT", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "fechado, mas você tem certeza?", d: "CONFIDENCE_CHALLENGE", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "certo, mas o povo fala bem?", d: "SOCIAL_VALIDATION", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "perfeito, mas tenho medo de errar", d: "ANTI_REGRET", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "combinado, mas quero gastar menos", d: "CONSTRAINT_CHANGE", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "show, tem outro?", d: "ALTERNATIVE_EXPLORATION", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "ok, qual ficou em segundo?", d: "SECOND_BEST_DISCOVERY", s: "ACKNOWLEDGEMENT" },
  { g: "A", i: "beleza, quero ver alternativas", d: "ALTERNATIVE_EXPLORATION", s: "ACKNOWLEDGEMENT" },

  // ── B COMPREHENSION + strong tail ──
  { g: "B", i: "entendi, mas não me convenceu", d: "SOFT_DISAGREEMENT", s: "COMPREHENSION" },
  { g: "B", i: "faz sentido, mas fiquei com um pé atrás", d: "SOFT_DISAGREEMENT", s: "COMPREHENSION" },
  { g: "B", i: "saquei, mas você tem certeza?", d: "CONFIDENCE_CHALLENGE", s: "COMPREHENSION" },
  { g: "B", i: "entendi, mas tenho medo de errar", d: "ANTI_REGRET", s: "COMPREHENSION" },
  { g: "B", i: "faz sentido, mas não quero me arrepender", d: "ANTI_REGRET", s: "COMPREHENSION" },
  { g: "B", i: "saquei, mas a galera recomenda?", d: "SOCIAL_VALIDATION", s: "COMPREHENSION" },
  { g: "B", i: "entendi, mas quero gastar menos", d: "CONSTRAINT_CHANGE", s: "COMPREHENSION" },
  { g: "B", i: "faz sentido, mas agora câmera importa mais", d: "CONSTRAINT_CHANGE", s: "COMPREHENSION" },
  { g: "B", i: "entendi, tem outro?", d: "ALTERNATIVE_EXPLORATION", s: "COMPREHENSION" },
  { g: "B", i: "saquei, qual ficou em segundo?", d: "SECOND_BEST_DISCOVERY", s: "COMPREHENSION" },

  // ── C DECISION_CONFIRMATION + strong tail ──
  { g: "C", i: "acho que vou nele, mas você tem certeza?", d: "CONFIDENCE_CHALLENGE", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "acho que vou nele, mas tenho medo de errar", d: "ANTI_REGRET", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "acho que vou nele, mas quero gastar menos", d: "CONSTRAINT_CHANGE", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "acho que vou nele, mas a galera recomenda?", d: "SOCIAL_VALIDATION", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "acho que vou nele, mas não me convenceu totalmente", d: "SOFT_DISAGREEMENT", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "vou nele, mas queria gastar menos", d: "CONSTRAINT_CHANGE", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "vou nele, mas ainda tô cabreiro", d: "ANTI_REGRET", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "fechou, mas quero ver uma segunda opção", d: "SECOND_BEST_DISCOVERY", s: "DECISION_CONFIRMATION", a: ["ALTERNATIVE_EXPLORATION"] },
  { g: "C", i: "acho que fechou, mas pensei melhor no orçamento", d: "CONSTRAINT_CHANGE", s: "DECISION_CONFIRMATION" },
  { g: "C", i: "parece que é esse, mas não quero dor de cabeça", d: "ANTI_REGRET", s: "DECISION_CONFIRMATION" },

  // ── D CONSTRAINT_CHANGE + alternative / second ──
  { g: "D", i: "quero gastar menos, tem outro?", d: "ALTERNATIVE_EXPLORATION", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },
  { g: "D", i: "ficou caro, tem uma alternativa?", d: "ALTERNATIVE_EXPLORATION", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },
  { g: "D", i: "tem outro parecido mais barato?", d: "ALTERNATIVE_EXPLORATION", s: "CONSTRAINT_CHANGE" },
  { g: "D", i: "e se eu quiser economizar um pouco?", d: "CONSTRAINT_CHANGE", s: null },
  { g: "D", i: "qual seria a segunda opção se eu gastar menos?", d: "SECOND_BEST_DISCOVERY", s: "CONSTRAINT_CHANGE", a: ["ALTERNATIVE_EXPLORATION", "CONSTRAINT_CHANGE"] },
  { g: "D", i: "qual seria o plano B mais barato?", d: "SECOND_BEST_DISCOVERY", s: "CONSTRAINT_CHANGE", a: ["ALTERNATIVE_EXPLORATION"] },
  { g: "D", i: "qual seria a próxima escolha mais em conta?", d: "SECOND_BEST_DISCOVERY", s: "CONSTRAINT_CHANGE", a: ["ALTERNATIVE_EXPLORATION"] },
  { g: "D", i: "se eu baixar o orçamento, quem fica melhor?", d: "SECOND_BEST_DISCOVERY", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },
  { g: "D", i: "quero algo mais barato, mas sem perder muito", d: "CONSTRAINT_CHANGE", s: null, a: ["ALTERNATIVE_EXPLORATION"] },
  { g: "D", i: "se eu não pegar esse, qual você indicaria?", d: "ALTERNATIVE_EXPLORATION", s: "CONSTRAINT_CHANGE" },
  { g: "D", i: "backup mais barato?", d: "SECOND_BEST_DISCOVERY", s: "CONSTRAINT_CHANGE", a: ["ALTERNATIVE_EXPLORATION"], low: true },

  // ── E ANTI_REGRET + CONSTRAINT / price ──
  { g: "E", i: "quero gastar menos porque tenho medo de errar", d: "ANTI_REGRET", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },
  { g: "E", i: "é muito dinheiro pra mim, não quero errar", d: "ANTI_REGRET", s: "CONSTRAINT_CHANGE" },
  { g: "E", i: "ficou caro e não quero me arrepender", d: "ANTI_REGRET", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },
  { g: "E", i: "quero algo mais barato pra não jogar dinheiro fora", d: "ANTI_REGRET", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },
  { g: "E", i: "gostei dele, mas é muito dinheiro pra mim", d: "ANTI_REGRET", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },
  { g: "E", i: "quero comprar sem preocupação", d: "ANTI_REGRET", s: null },
  { g: "E", i: "quero comprar uma vez só", d: "ANTI_REGRET", s: null },
  { g: "E", i: "se eu errar vai doer, tem opção mais segura?", d: "ANTI_REGRET", s: "ALTERNATIVE_EXPLORATION", a: ["ALTERNATIVE_EXPLORATION"] },
  { g: "E", i: "não quero gastar errado, tem algo mais seguro?", d: "ANTI_REGRET", s: "ALTERNATIVE_EXPLORATION", a: ["ALTERNATIVE_EXPLORATION"] },
  { g: "E", i: "preço pesa, mas tenho medo de escolher errado", d: "ANTI_REGRET", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE"] },

  // ── F ANTI_REGRET + CONFIDENCE_CHALLENGE ──
  { g: "F", i: "tenho medo de errar, você tem certeza?", d: "CONFIDENCE_CHALLENGE", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "F", i: "não quero me arrepender, ainda recomenda?", d: "CONFIDENCE_CHALLENGE", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "F", i: "tô cabreiro, você manteria essa escolha?", d: "CONFIDENCE_CHALLENGE", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "F", i: "será que vou me arrepender ou você sustenta?", d: "CONFIDENCE_CHALLENGE", s: "ANTI_REGRET", a: ["ANTI_REGRET", "ANTI_REGRET"] },
  { g: "F", i: "acho que vou me arrepender, você manteria?", d: "CONFIDENCE_CHALLENGE", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "F", i: "é seguro ir nesse?", d: "ANTI_REGRET", s: null, a: ["CONFIDENCE_CHALLENGE"], hybrid: true },
  { g: "F", i: "posso comprar tranquilo?", d: "ANTI_REGRET", s: null, a: ["CONFIDENCE_CHALLENGE"], hybrid: true },
  { g: "F", i: "acha que vou me arrepender?", d: "ANTI_REGRET", s: null, a: ["CONFIDENCE_CHALLENGE"], hybrid: true },
  { g: "F", i: "você acha que é seguro pra mim?", d: "ANTI_REGRET", s: null, a: ["CONFIDENCE_CHALLENGE"], hybrid: true },
  { g: "F", i: "se fosse você, compraria mesmo?", d: "CONFIDENCE_CHALLENGE", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },

  // ── G SOCIAL_VALIDATION + ANTI_REGRET ──
  { g: "G", i: "quem comprou se arrepende?", d: "SOCIAL_VALIDATION", s: null },
  { g: "G", i: "o pessoal costuma se arrepender?", d: "SOCIAL_VALIDATION", s: null },
  { g: "G", i: "a galera reclama muito?", d: "SOCIAL_VALIDATION", s: null },
  { g: "G", i: "quem tem esse produto passa dor de cabeça?", d: "SOCIAL_VALIDATION", s: null },
  { g: "G", i: "quem comprou gostou ou se arrependeu?", d: "SOCIAL_VALIDATION", s: null },
  { g: "G", i: "quero evitar dor de cabeça, mas o pessoal gosta?", d: "SOCIAL_VALIDATION", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "G", i: "tenho medo de errar, mas a galera recomenda?", d: "SOCIAL_VALIDATION", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "G", i: "será que muita gente se arrepende?", d: "SOCIAL_VALIDATION", s: null },
  { g: "G", i: "o povo fala bem ou dá problema?", d: "SOCIAL_VALIDATION", s: null },
  { g: "G", i: "quem usa no dia a dia aprova?", d: "SOCIAL_VALIDATION", s: null },

  // ── H SOFT_DISAGREEMENT + tail ──
  { g: "H", i: "não me convenceu, você tem certeza?", d: "CONFIDENCE_CHALLENGE", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "não gostei muito, mas você sustenta?", d: "CONFIDENCE_CHALLENGE", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "tô com pé atrás, a galera recomenda?", d: "SOCIAL_VALIDATION", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "não curti muito, quem comprou gostou?", d: "SOCIAL_VALIDATION", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "não me ganhou, mas tenho medo de errar", d: "ANTI_REGRET", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "parece forçado, você compraria?", d: "CONFIDENCE_CHALLENGE", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "não bateu comigo, mas o povo fala bem?", d: "SOCIAL_VALIDATION", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "não estou convencido, mas quero evitar erro", d: "ANTI_REGRET", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },
  { g: "H", i: "não desceu bem, mas é seguro?", d: "ANTI_REGRET", s: "SOFT_DISAGREEMENT", a: ["CONFIDENCE_CHALLENGE", "SOFT_DISAGREEMENT"], hybrid: true },
  { g: "H", i: "não me pegou muito, tem outra opção?", d: "ALTERNATIVE_EXPLORATION", s: "SOFT_DISAGREEMENT", a: ["SOFT_DISAGREEMENT"] },

  // ── I GREETING + strong tail ──
  { g: "I", i: "oi, quero gastar menos", d: "CONSTRAINT_CHANGE", s: "GREETING" },
  { g: "I", i: "bom dia, tenho medo de errar", d: "ANTI_REGRET", s: "GREETING" },
  { g: "I", i: "salve, tem outro?", d: "ALTERNATIVE_EXPLORATION", s: "GREETING" },
  { g: "I", i: "fala mia, você tem certeza?", d: "CONFIDENCE_CHALLENGE", s: "GREETING" },
  { g: "I", i: "e aí, o povo recomenda?", d: "SOCIAL_VALIDATION", s: "GREETING" },
  { g: "I", i: "oi, não me convenceu", d: "SOFT_DISAGREEMENT", s: "GREETING" },
  { g: "I", i: "bom dia, acho que vou nele", d: "DECISION_CONFIRMATION", s: "GREETING" },
  { g: "I", i: "salve, quero ver alternativas", d: "ALTERNATIVE_EXPLORATION", s: "GREETING" },
  { g: "I", i: "mia, me explica de novo", d: "COMPREHENSION", s: "GREETING" },
  { g: "I", i: "você tá aí? quero comprar um produto", d: "COMMERCIAL_SEARCH", s: "GREETING" },

  // ── J COMMERCIAL SEARCH + conversational ──
  { g: "J", i: "quero comprar um produto, mas tenho medo de errar", d: "COMMERCIAL_SEARCH", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "J", i: "procura um notebook, mas quero evitar dor de cabeça", d: "COMMERCIAL_SEARCH", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "J", i: "quero um celular barato, mas que não me arrependa", d: "COMMERCIAL_SEARCH", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "J", i: "me recomenda uma opção, mas você tem certeza?", d: "COMMERCIAL_SEARCH", s: "CONFIDENCE_CHALLENGE", a: ["CONFIDENCE_CHALLENGE"] },
  { g: "J", i: "quero outro produto, mas parecido com esse", d: "COMMERCIAL_SEARCH", s: "ALTERNATIVE_EXPLORATION", a: ["ALTERNATIVE_EXPLORATION"] },
  { g: "J", i: "quero algo mais barato, mas confiável", d: "COMMERCIAL_SEARCH", s: "CONSTRAINT_CHANGE", a: ["CONSTRAINT_CHANGE", "ANTI_REGRET"] },
  { g: "J", i: "quero comprar, mas não sei se vale a pena", d: "COMMERCIAL_SEARCH", s: "ANTI_REGRET", a: ["CONFIDENCE_CHALLENGE", "ANTI_REGRET"] },
  { g: "J", i: "quero comparar, mas estou com receio", d: "COMMERCIAL_SEARCH", s: "ANTI_REGRET", a: ["ANTI_REGRET"] },
  { g: "J", i: "quero uma opção, mas o povo fala bem?", d: "COMMERCIAL_SEARCH", s: "SOCIAL_VALIDATION", a: ["SOCIAL_VALIDATION"] },
  { g: "J", i: "quero uma alternativa, mas segura", d: "COMMERCIAL_SEARCH", s: "ANTI_REGRET", a: ["ALTERNATIVE_EXPLORATION", "ANTI_REGRET"] },
];

function familyFromPath(path) {
  for (const [family, flow] of Object.entries(FAMILY_PATH)) {
    if (path === flow) return family;
  }
  if (path === "context_resolution_direct_reply_early_return") return "GREETING";
  if (path === "decision_context_branch" || path === "context_question_path") return "UNKNOWN";
  return null;
}

function inferDominantFromRouterSignals(signals = {}, turnType = "") {
  if (signals.isAlternativeExploration) return "ALTERNATIVE_EXPLORATION";
  if (signals.isSecondBestDiscovery) return "SECOND_BEST_DISCOVERY";
  if (signals.isAntiRegret) return "ANTI_REGRET";
  if (signals.isConfidenceChallenge) return "CONFIDENCE_CHALLENGE";
  if (signals.isSocialValidation) return "SOCIAL_VALIDATION";
  if (signals.isSoftDisagreement) return "SOFT_DISAGREEMENT";
  if (signals.isConstraintChange) return "CONSTRAINT_CHANGE";
  if (signals.isDecisionConfirmation) return "DECISION_CONFIRMATION";
  if (signals.isComprehension) return "COMPREHENSION";
  if (signals.isAcknowledgement) return "ACKNOWLEDGEMENT";
  if (signals.isGreeting) return "GREETING";
  if (turnType === "NEW_SEARCH") return "COMMERCIAL_SEARCH";
  return null;
}

function activeRouterFamilies(signals = {}) {
  const out = [];
  if (signals.isConstraintChange) out.push("CONSTRAINT_CHANGE");
  if (signals.isAntiRegret) out.push("ANTI_REGRET");
  if (signals.isConfidenceChallenge) out.push("CONFIDENCE_CHALLENGE");
  if (signals.isSocialValidation) out.push("SOCIAL_VALIDATION");
  if (signals.isSoftDisagreement) out.push("SOFT_DISAGREEMENT");
  if (signals.isAlternativeExploration) out.push("ALTERNATIVE_EXPLORATION");
  if (signals.isSecondBestDiscovery) out.push("SECOND_BEST_DISCOVERY");
  if (signals.isDecisionConfirmation) out.push("DECISION_CONFIRMATION");
  if (signals.isComprehension) out.push("COMPREHENSION");
  if (signals.isAcknowledgement) out.push("ACKNOWLEDGEMENT");
  if (signals.isGreeting) out.push("GREETING");
  return out;
}

function detectSecondaryPrefix(message, secondary) {
  if (!secondary) return null;
  switch (secondary) {
    case "ACKNOWLEDGEMENT":
      return hasAcknowledgementOpeningPrefix(message);
    case "GREETING":
      return isGreetingFamilyQuery(message) || /^(oi|ola|salve|bom dia|boa tarde|e ai|fala mia|mia)\b/i.test(message);
    case "COMPREHENSION":
      return isComprehensionSemanticFamilyQuery(message) || /^(entendi|saquei|faz sentido)\b/i.test(message);
    case "DECISION_CONFIRMATION":
      return isDecisionConfirmationFamilyQuery(message) || /\b(vou nele|acho que vou|fechou)\b/i.test(message);
    default:
      return null;
  }
}

function simulateFullStack(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  let directReply = GENERIC_WELCOME_DIRECT_REPLY;
  let clearContext = !hasActiveAnchor;

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, "search");
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: "search",
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
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
    contextResolution: {
      mode: "general_answer",
      shouldSkipProductSearch: false,
      directReply,
      clearContext,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
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

  const openedNewSearch =
    routingDecision.mode === "new_search" || routingDecision.allowNewSearch === true;

  const pathFlags = {
    ANTI_REGRET:
      !clearNewSearch &&
      (!!cognitiveTurn.signals?.isAntiRegret ||
        isAntiRegretFamilyQuery(message) ||
        routingDecision.conversationAct === "anti_regret"),
    DECISION_CONFIRMATION:
      !clearNewSearch &&
      (!!cognitiveTurn.signals?.isDecisionConfirmation ||
        isDecisionConfirmationFamilyQuery(message) ||
        routingDecision.conversationAct === "decision_confirmation"),
    CONFIDENCE_CHALLENGE:
      !clearNewSearch &&
      (!!cognitiveTurn.signals?.isConfidenceChallenge ||
        isConfidenceChallengeFamilyQuery(message) ||
        routingDecision.conversationAct === "confidence_challenge"),
    SOCIAL_VALIDATION:
      !!cognitiveTurn.signals?.isSocialValidation ||
      isSocialValidationFamilyQuery(message) ||
      routingDecision.conversationAct === "social_validation",
    SECOND_BEST_DISCOVERY:
      !!cognitiveTurn.signals?.isSecondBestDiscovery ||
      isSecondBestDiscoveryFamilyQuery(message) ||
      routingDecision.conversationAct === "second_best_discovery",
    ALTERNATIVE_EXPLORATION:
      !!cognitiveTurn.signals?.isAlternativeExploration ||
      isAlternativeExplorationFamilyQuery(message) ||
      routingDecision.conversationAct === "alternative_exploration",
    SOFT_DISAGREEMENT:
      !clearNewSearch &&
      (!!cognitiveTurn.signals?.isSoftDisagreement ||
        isSoftDisagreementFamilyQuery(message) ||
        routingDecision.conversationAct === "soft_disagreement"),
    COMPREHENSION:
      !!cognitiveTurn.signals?.isComprehension ||
      isComprehensionFamilyQuery(message) ||
      routingDecision.conversationAct === "comprehension",
    ACKNOWLEDGEMENT:
      !!cognitiveTurn.signals?.isAcknowledgement ||
      isAcknowledgementFamilyQuery(message) ||
      routingDecision.conversationAct === "acknowledgement",
    GREETING:
      !!cognitiveTurn.signals?.isGreeting ||
      isGreetingFamilyQuery(message) ||
      routingDecision.conversationAct === "greeting",
    CONSTRAINT_CHANGE:
      !clearNewSearch &&
      (!!cognitiveTurn.signals?.isConstraintChange ||
        isConstraintChangeFamilyQuery(message) ||
        routingDecision.conversationAct === "constraint_change"),
  };

  let effectiveIntent = bridgeAudit.active ? bridgeAudit.toIntent : "search";
  let responsePathFinal = "unknown";

  const priority = [
    "ANTI_REGRET",
    "DECISION_CONFIRMATION",
    "CONFIDENCE_CHALLENGE",
    "SOCIAL_VALIDATION",
    "SECOND_BEST_DISCOVERY",
    "ALTERNATIVE_EXPLORATION",
    "SOFT_DISAGREEMENT",
    "COMPREHENSION",
    "ACKNOWLEDGEMENT",
    "GREETING",
    "CONSTRAINT_CHANGE",
  ];

  if (openedNewSearch && !priority.some((family) => pathFlags[family])) {
    responsePathFinal = "default_product_search";
    effectiveIntent = "commercial_search";
  } else {
    for (const family of priority) {
      if (pathFlags[family]) {
        effectiveIntent = family.toLowerCase();
        responsePathFinal = FAMILY_PATH[family] || `${family.toLowerCase()}_path`;
        break;
      }
    }
    if (responsePathFinal === "unknown" && pathFlags.CONSTRAINT_CHANGE) {
      effectiveIntent = "constraint_change";
      responsePathFinal = "constraint_change_flow";
    }
    if (responsePathFinal === "unknown" && directReply) {
      responsePathFinal = "context_resolution_direct_reply_early_return";
    }
  }

  const actualDominant =
    familyFromPath(responsePathFinal) ||
    inferDominantFromRouterSignals(cognitiveTurn.signals, cognitiveTurn.turnType) ||
    (openedNewSearch ? "COMMERCIAL_SEARCH" : activeRouterFamilies(cognitiveTurn.signals)[0] || "UNKNOWN");

  const genericFallbackDetected = detectGenericConversationalFallback(
    responsePathFinal === "context_resolution_direct_reply_early_return" ? directReply : ""
  );

  const anchorPreserved =
    !hasActiveAnchor ||
    (routingDecision.shouldPreserveAnchor === true &&
      routingDecision.allowReplaceWinner === false);

  return {
    cognitiveTurn,
    bridge: {
      active: bridgeAudit.active,
      toIntent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
      contextAction: guardResult.contextAction,
    },
    routing: {
      mode: routingDecision.mode,
      conversationAct: routingDecision.conversationAct,
      responsePathHint: routingDecision.responsePathHint,
      clearNewSearch,
      openedNewSearch,
      allowNewSearch: routingDecision.allowNewSearch,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    },
    response: {
      effectiveIntent,
      responsePathFinal,
      genericFallbackDetected,
    },
    actualDominant,
    routerFamilies: activeRouterFamilies(cognitiveTurn.signals),
    anchorPreserved,
  };
}

function evaluateCollision(spec, hasActiveAnchor) {
  const trace = simulateFullStack(spec.i, hasActiveAnchor);
  const acceptable = [spec.d, ...(spec.a || [])];
  const dominantOk = acceptable.includes(trace.actualDominant);
  const secondaryDetected = detectSecondaryPrefix(spec.i, spec.s);
  const prefixOk = spec.s ? secondaryDetected !== false : true;

  const leaks = [];
  let leakType = null;

  if (spec.low && !dominantOk) {
    leakType = "LOW_REALISM_TEST_CASE";
    leaks.push({ type: leakType, detail: "Frase pouco humana — falha informativa" });
  } else if (spec.hybrid && dominantOk) {
    leaks.push({ type: "ARCHITECTURAL_DESIGN_ACCEPTED", detail: "Híbrido AR/CC aceito empiricamente" });
  } else if (!dominantOk) {
    if (trace.routerFamilies.includes(spec.d) && trace.actualDominant === "UNKNOWN") {
      leakType = "ROUTING_LEAK";
    } else if (trace.routerFamilies.includes(spec.d) && trace.response.responsePathFinal !== FAMILY_PATH[spec.d]) {
      leakType = "RESPONSE_PATH_LEAK";
    } else if (!trace.routerFamilies.includes(spec.d)) {
      leakType = "ROUTER_LEAK";
    } else {
      leakType = "ROUTING_LEAK";
    }
    leaks.push({
      type: leakType,
      detail: `Esperado ${spec.d}, got ${trace.actualDominant} (router: ${trace.routerFamilies.join("+") || "none"}) path=${trace.response.responsePathFinal}`,
    });
  } else {
    leaks.push({ type: "ARCHITECTURAL_DESIGN_ACCEPTED", detail: `Dominante ${spec.d} preservado` });
  }

  if (hasActiveAnchor && !trace.anchorPreserved && dominantOk) {
    leaks.push({ type: "ROUTING_LEAK", detail: "Anchor não preservado com colisão ok" });
  }

  if (trace.response.genericFallbackDetected && dominantOk) {
    leaks.push({ type: "VERBALIZATION_LEAK", detail: "Fallback genérico apesar de família ok" });
  }

  const hardFail = leaks.some(
    (l) =>
      l.type !== "ARCHITECTURAL_DESIGN_ACCEPTED" &&
      l.type !== "LOW_REALISM_TEST_CASE"
  );

  const userPerception = assessPerception({
    dominantOk,
    hardFail,
    hasActiveAnchor,
    trace,
    prefixOk,
  });

  if (dominantOk && userPerception === "NÃO") {
    leaks.push({ type: "USER_PERCEPTION_LEAK", detail: "Família ok mas resposta não reflete intenção" });
  }

  return {
    group: spec.g,
    input: spec.i,
    context: hasActiveAnchor ? "anchored" : "cold",
    expectedDominant: spec.d,
    expectedSecondary: spec.s,
    acceptable,
    lowRealism: !!spec.low,
    hybrid: !!spec.hybrid,
    ok: dominantOk && !hardFail,
    dominantOk,
    prefixOk,
    userPerception,
    leaks,
    ...trace,
  };
}

function assessPerception(ctx) {
  if (!ctx.dominantOk || ctx.hardFail) return "NÃO";
  if (ctx.trace.response.openedNewSearch && ctx.trace.expectedDominant !== "COMMERCIAL_SEARCH") {
    return "NÃO";
  }
  if (ctx.hasActiveAnchor && ctx.trace.response.responsePathFinal.endsWith("_flow")) return "SIM";
  if (ctx.trace.response.responsePathFinal.endsWith("_flow")) return "PARCIAL";
  if (ctx.prefixOk) return "PARCIAL";
  return "PARCIAL";
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function printFlowMap() {
  console.log("── FASE 1 — Mapa geral de colisões ──\n");
  console.log("Prefixos fracos (ACK / GREET / COMP / DC) → secundários");
  console.log("Cauda após 'mas' ou pedido direto → dominante");
  console.log("Handler sim: precedência espelha chat-gpt4o (AR > DC > CC > SV > SBD > AE > SD > ... > CC hold)");
  console.log("Routing Safety: clearNewCommercialSearch pode abrir busca indevida em colisões CC+AE\n");
}

printFlowMap();

console.log("PATCH 7.9Y — Cross-Family Collision Audit (AUDIT ONLY)\n");
console.log("HTTP usage: false | Production changes: NONE\n");

const records = COLLISION_CASES.flatMap((spec) => [
  evaluateCollision(spec, false),
  evaluateCollision(spec, true),
]);

const total = records.length;
const passCount = records.filter((r) => r.ok).length;
const perceptionSim = records.filter((r) => r.userPerception === "SIM").length;
const perceptionPartial = records.filter((r) => r.userPerception === "PARCIAL").length;
const perceptionNo = records.filter((r) => r.userPerception === "NÃO").length;

console.log(`── Suite: ${COLLISION_CASES.length} frases × 2 contextos = ${total} cenários ──\n`);

console.log("── Amostra de falhas ──\n");
for (const r of records.filter((x) => !x.ok).slice(0, 12)) {
  console.log(
    `  ✗ [${r.group}/${r.context}] "${r.input}" → expect=${r.expectedDominant} got=${r.actualDominant} path=${r.response.responsePathFinal}`
  );
}

console.log("\n── Taxa por grupo ──\n");
for (const g of "ABCDEFGHIJ".split("")) {
  const rows = records.filter((r) => r.group === g);
  const ok = rows.filter((r) => r.ok).length;
  console.log(`  Grupo ${g}: ${ok}/${rows.length} (${pct(ok, rows.length)}%)`);
}

const leakCounts = {};
for (const r of records) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
  }
}

console.log("\n── Leaks por tipo (excl. design aceito) ──\n");
for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}

const clusterRoots = new Map();
for (const r of records.filter((x) => !x.ok && !x.lowRealism)) {
  const key = `${r.expectedDominant}→${r.actualDominant}::${r.leaks.find((l) => l.type !== "ARCHITECTURAL_DESIGN_ACCEPTED")?.type || "UNKNOWN"}`;
  if (!clusterRoots.has(key)) clusterRoots.set(key, []);
  clusterRoots.get(key).push(`[${r.context}] "${r.input}"`);
}

console.log("\n── Causa raiz por cluster ──\n");
for (const [key, examples] of [...clusterRoots.entries()].slice(0, 12)) {
  console.log(`  ${key}`);
  console.log(`    Ex.: ${examples.slice(0, 2).join("; ")}`);
  console.log("");
}

console.log("── Matriz de precedência recomendada (empírica) ──\n");
console.log("1. COMMERCIAL_SEARCH explícita (produto/categoria nova)");
console.log("2. ANTI_REGRET — medo pessoal / arrependimento / segurança emocional");
console.log("3. CONFIDENCE_CHALLENGE — teste de firmeza da MIA");
console.log("4. SOCIAL_VALIDATION — foco coletivo (quem comprou, povo fala)");
console.log("5. SOFT_DISAGREEMENT — resistência leve (mas não gostei / não convenceu)");
console.log("6. CONSTRAINT_CHANGE — nova restrição na mesma decisão");
console.log("7. ALTERNATIVE_EXPLORATION — pedido de outra opção");
console.log("8. SECOND_BEST_DISCOVERY — plano B / segundo colocado");
console.log("9. DECISION_CONFIRMATION — confirmação pura sem cauda dominante");
console.log("10. COMPREHENSION / ACK / GREETING — prefixos secundários");
console.log("");
console.log("Gaps empíricos: OBJECTION genérico engole SD; CC+AE cai em search; DC+CC perde CC.");

console.log("\n── Frases baixa realismo ──\n");
for (const r of records.filter((x) => x.lowRealism)) {
  console.log(`  ${r.input} → ${r.ok ? "OK" : "FAIL"} (${r.actualDominant})`);
}

console.log("\n── Métricas globais ──\n");
console.log(`Dominância correta: ${passCount}/${total} (${pct(passCount, total)}%)`);
console.log(`Percepção SIM: ${perceptionSim}/${total} (${pct(perceptionSim, total)}%)`);
console.log(`Percepção PARCIAL: ${perceptionPartial}/${total} (${pct(perceptionPartial, total)}%)`);
console.log(`Percepção NÃO: ${perceptionNo}/${total} (${pct(perceptionNo, total)}%)`);

console.log("\n── Veredito ──\n");
const robustThreshold = 0.9;
if (passCount / total >= robustThreshold) {
  console.log("A) CROSS-FAMILY COLLISIONS MOSTLY ROBUST — gaps residuais documentados");
} else {
  console.log("B) CROSS-FAMILY COLLISIONS POSSUEM GAPS ESTRUTURAIS");
  console.log(`   Taxa dominância: ${pct(passCount, total)}% (meta ≥90%)`);
}

console.log("\n── Próximo patch recomendado ──\n");
if (passCount / total >= robustThreshold) {
  console.log("PATCH 7.9Z — Conversational Stress Test (15+ mensagens)");
} else {
  console.log("PATCH 7.9Y.1 — Cross-Family Collision Resolution (Router mas-tail / OBJECTION×SD / CC×AE)");
}

console.log("\nPATCH 7.9Y audit COMPLETE — AUDIT ONLY\n");
process.exit(passCount / total >= robustThreshold ? 0 : 1);
