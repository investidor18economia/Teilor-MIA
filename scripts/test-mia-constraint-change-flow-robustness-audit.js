/**
 * PATCH 7.9X-CC.1 — CONSTRAINT_CHANGE Flow Robustness Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge → Routing Safety → Routing → Response Path → Perception.
 * Revalidates after 7.9K / 7.9L / 7.9X-CC and subsequent family patches.
 *
 * Usage: node scripts/test-mia-constraint-change-flow-robustness-audit.js
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

const POSITIVE_GROUPS = [
  {
    id: "A",
    label: "orçamento / preço",
    subtype: "budget",
    phrases: [
      "quero gastar menos",
      "agora quero economizar",
      "pensei melhor e quero gastar menos",
      "ficou caro pra mim",
      "tá puxado",
      "pesou no bolso",
      "passou do que eu queria",
      "preciso baixar o valor",
      "meu orçamento diminuiu",
      "quero algo mais em conta",
    ],
  },
  {
    id: "B",
    label: "prioridade de atributo",
    subtype: "attribute",
    phrases: [
      "câmera virou prioridade",
      "bateria virou prioridade",
      "desempenho virou prioridade",
      "conforto virou prioridade",
      "qualidade virou prioridade",
      "agora câmera pesa mais",
      "agora bateria importa mais",
      "preciso priorizar autonomia",
      "quero priorizar durabilidade",
      "preço virou prioridade",
    ],
  },
  {
    id: "C",
    label: "uso dominante",
    subtype: "use",
    phrases: [
      "vou jogar mais",
      "vou usar mais para fotos",
      "vou usar mais para trabalhar",
      "vou usar mais fora de casa",
      "vou usar mais no dia a dia pesado",
      "meu uso mudou",
      "agora o foco é outro",
      "vou usar de outro jeito",
      "pensei melhor sobre meu uso",
      "preciso considerar outro tipo de uso",
    ],
  },
  {
    id: "D",
    label: "redução de prioridade",
    subtype: "reduction",
    phrases: [
      "câmera não importa tanto",
      "bateria não é tão importante agora",
      "desempenho deixou de ser prioridade",
      "preço não é mais o único critério",
      "posso abrir mão de câmera",
      "posso sacrificar desempenho",
      "não ligo tanto para isso",
      "esse ponto perdeu peso para mim",
    ],
  },
  {
    id: "E",
    label: "recalibração geral",
    subtype: "recalibration",
    phrases: [
      "mudei de ideia",
      "pensei melhor",
      "olhando melhor agora",
      "pensando bem",
      "talvez eu prefira outra coisa",
      "acho que meu foco mudou",
      "minha prioridade mudou",
      "quero recalibrar a escolha",
      "preciso reavaliar com outro critério",
    ],
  },
];

const COMPOUND_DECISION = {
  id: "F",
  label: "compostos com decisão",
  subtype: "compound_decision",
  phrases: [
    "gostei dele, mas quero gastar menos",
    "acho que vou nele, mas câmera virou prioridade",
    "esse parece bom, mas bateria importa mais",
    "gostei da recomendação, mas tá puxado",
    "parece certo, mas meu foco mudou",
    "vou nesse se tiver algo mais em conta",
    "acho que fechou, mas pensei melhor no orçamento",
  ],
};

const COMPOUND_NEIGHBOR = [
  { group: "G", input: "é muito dinheiro pra mim, não quero errar", expect: "ANTI_REGRET" },
  { group: "G", input: "quero gastar menos porque tenho medo de me arrepender", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "gostei dele, mas não quero dor de cabeça", expect: "ANTI_REGRET" },
  { group: "G", input: "quero gastar menos, mas você ainda sustenta essa escolha?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "G", input: "pensei melhor no orçamento, mas você manteria?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "G", input: "quero algo mais barato, mas o povo recomenda?", expect: "SOCIAL_VALIDATION" },
  { group: "G", input: "ficou caro, mas quem comprou gostou?", expect: "SOCIAL_VALIDATION" },
  { group: "G", input: "quero gastar menos, mas não me convenceu", expect: "SOFT_DISAGREEMENT" },
  { group: "G", input: "tá puxado, e ainda não me ganhou", expect: "SOFT_DISAGREEMENT" },
  { group: "G", input: "quero gastar menos, tem outro?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "G", input: "ficou caro, mostra alternativas", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "G", input: "quero algo mais barato, tem uma segunda opção?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "G", input: "se eu gastar menos, quem fica em segundo?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "G", input: "qual seria o plano B se eu baixar o orçamento?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "G", input: "backup mais barato?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "G", input: "vou nele, mas queria gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "acho que fechou, mas preço virou prioridade", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "entendi, mas quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "faz sentido, mas agora bateria importa mais", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "ok, quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "beleza, câmera virou prioridade", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "oi, quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "bom dia, agora bateria importa mais", expect: "CONSTRAINT_CHANGE" },
];

const NEGATIVE_GUARDS = [
  { group: "H", input: "tenho medo de errar", expect: "ANTI_REGRET" },
  { group: "H", input: "não quero me arrepender", expect: "ANTI_REGRET" },
  { group: "H", input: "tô cabreiro", expect: "ANTI_REGRET" },
  { group: "H", input: "é muito dinheiro pra mim", expect: "ANTI_REGRET" },
  { group: "H", input: "você tem certeza?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "H", input: "ainda recomenda esse?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "H", input: "você manteria essa recomendação?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "H", input: "a galera recomenda?", expect: "SOCIAL_VALIDATION" },
  { group: "H", input: "o povo fala bem?", expect: "SOCIAL_VALIDATION" },
  { group: "H", input: "quem comprou gostou?", expect: "SOCIAL_VALIDATION" },
  { group: "H", input: "não me convenceu", expect: "SOFT_DISAGREEMENT" },
  { group: "H", input: "estou com um pé atrás", expect: "SOFT_DISAGREEMENT" },
  { group: "H", input: "não gostei muito", expect: "SOFT_DISAGREEMENT" },
  { group: "H", input: "vou nele", expect: "DECISION_CONFIRMATION" },
  { group: "H", input: "acho que fechou", expect: "DECISION_CONFIRMATION" },
  { group: "H", input: "então é esse", expect: "DECISION_CONFIRMATION" },
  { group: "H", input: "tem outro?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "H", input: "mostra alternativas", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "H", input: "quero ver opções", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "H", input: "qual ficou em segundo?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "H", input: "plano B?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "H", input: "backup?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "H", input: "entendi", expect: "COMPREHENSION" },
  { group: "H", input: "agora fez sentido", expect: "COMPREHENSION" },
  { group: "H", input: "não entendi", expect: "COMPREHENSION" },
  { group: "H", input: "fiquei confuso", expect: "COMPREHENSION" },
  { group: "H", input: "ok", expect: "ACKNOWLEDGEMENT" },
  { group: "H", input: "blz", expect: "ACKNOWLEDGEMENT" },
  { group: "H", input: "show", expect: "ACKNOWLEDGEMENT" },
  { group: "H", input: "pode seguir", expect: "ACKNOWLEDGEMENT" },
  { group: "H", input: "oi", expect: "GREETING" },
  { group: "H", input: "bom dia", expect: "GREETING" },
  { group: "H", input: "salve", expect: "GREETING" },
  { group: "H", input: "quero comprar um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "H", input: "procura um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "H", input: "me recomenda um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "H", input: "quero outro produto", expect: "COMMERCIAL_SEARCH" },
  { group: "H", input: "quero um notebook até 3000", expect: "COMMERCIAL_SEARCH" },
  { group: "H", input: "quero uma TV boa", expect: "COMMERCIAL_SEARCH" },
];

function buildOpenConstraintChangePreview() {
  return "Entendi a mudança de critério. Para recalibrar a recomendação na mesma decisão, preciso saber qual compra ou referência estamos usando.";
}

function buildAnchoredConstraintChangePreview() {
  return "Entendi. Mantendo Produto Recomendado Atual como referência, vamos recalibrar a decisão com esse novo critério — a recomendação pode mudar porque estamos reavaliando com outra prioridade, não porque começamos do zero.";
}

function idealConstraintTurn(hasActiveAnchor) {
  return hasActiveAnchor ? MIA_TURN_TYPES.PRIORITY_SHIFT : MIA_TURN_TYPES.CONVERSATIONAL;
}

function hasConstraintChangeRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "constraint_change" ||
    routingDecision.responsePathHint === "constraint_change_reply" ||
    routingDecision.responsePathHint === "constraint_change_anchored"
  );
}

function normalizeAuditText(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function demonstratesRecalibration(preview = "") {
  const q = normalizeAuditText(preview);
  return (
    /\b(recalibr|reavali|prioridade|criterio|orcamento|mesma decisao|referencia|novo criterio|mudanca de criterio)\b/.test(q)
  );
}

function pathForFamily(expected) {
  const map = {
    ANTI_REGRET: "anti_regret_flow",
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
    CONSTRAINT_CHANGE: "constraint_change_flow",
  };
  return map[expected] || null;
}

function matchesExpectedNeighbor(expected, message, cognitiveTurn, routingDecision, responsePathFinal) {
  switch (expected) {
    case "ANTI_REGRET":
      return (
        !!cognitiveTurn.signals?.isAntiRegret ||
        isAntiRegretFamilyQuery(message) ||
        routingDecision.conversationAct === "anti_regret" ||
        responsePathFinal === "anti_regret_flow"
      );
    case "CONFIDENCE_CHALLENGE":
      return (
        !!cognitiveTurn.signals?.isConfidenceChallenge ||
        isConfidenceChallengeFamilyQuery(message) ||
        routingDecision.conversationAct === "confidence_challenge" ||
        responsePathFinal === "confidence_challenge_flow"
      );
    case "SOCIAL_VALIDATION":
      return (
        !!cognitiveTurn.signals?.isSocialValidation ||
        isSocialValidationFamilyQuery(message) ||
        routingDecision.conversationAct === "social_validation" ||
        responsePathFinal === "social_validation_flow"
      );
    case "SOFT_DISAGREEMENT":
      return (
        !!cognitiveTurn.signals?.isSoftDisagreement ||
        isSoftDisagreementFamilyQuery(message) ||
        routingDecision.conversationAct === "soft_disagreement" ||
        responsePathFinal === "soft_disagreement_flow"
      );
    case "ALTERNATIVE_EXPLORATION":
      return (
        !!cognitiveTurn.signals?.isAlternativeExploration ||
        isAlternativeExplorationFamilyQuery(message) ||
        routingDecision.conversationAct === "alternative_exploration" ||
        responsePathFinal === "alternative_exploration_flow" ||
        responsePathFinal === "context_hold"
      );
    case "SECOND_BEST_DISCOVERY":
      return (
        !!cognitiveTurn.signals?.isSecondBestDiscovery ||
        isSecondBestDiscoveryFamilyQuery(message) ||
        routingDecision.conversationAct === "second_best_discovery" ||
        responsePathFinal === "second_best_discovery_flow"
      );
    case "DECISION_CONFIRMATION":
      return (
        !!cognitiveTurn.signals?.isDecisionConfirmation ||
        isDecisionConfirmationFamilyQuery(message) ||
        routingDecision.conversationAct === "decision_confirmation" ||
        responsePathFinal === "decision_confirmation_flow"
      );
    case "COMPREHENSION":
      return (
        !!cognitiveTurn.signals?.isComprehension ||
        isComprehensionFamilyQuery(message) ||
        isComprehensionSemanticFamilyQuery(message) ||
        routingDecision.conversationAct === "comprehension" ||
        responsePathFinal === "comprehension_flow"
      );
    case "ACKNOWLEDGEMENT":
      return (
        !!cognitiveTurn.signals?.isAcknowledgement ||
        isAcknowledgementFamilyQuery(message) ||
        routingDecision.conversationAct === "acknowledgement" ||
        responsePathFinal === "acknowledgement_flow"
      );
    case "GREETING":
      return (
        !!cognitiveTurn.signals?.isGreeting ||
        isGreetingFamilyQuery(message) ||
        routingDecision.conversationAct === "greeting" ||
        responsePathFinal === "greeting_flow" ||
        responsePathFinal === "context_resolution_direct_reply_early_return"
      );
    case "COMMERCIAL_SEARCH":
      return (
        routingDecision.mode === "new_search" ||
        routingDecision.allowNewSearch === true ||
        responsePathFinal === "default_product_search"
      );
    case "CONSTRAINT_CHANGE":
      return (
        !!cognitiveTurn.signals?.isConstraintChange ||
        isConstraintChangeFamilyQuery(message) ||
        routingDecision.conversationAct === "constraint_change" ||
        responsePathFinal === "constraint_change_flow"
      );
    default:
      return false;
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
    routingDecision.mode === "new_search" ||
    routingDecision.allowNewSearch === true;

  const idealTurn = idealConstraintTurn(hasActiveAnchor);

  const routerPass =
    !!cognitiveTurn.signals?.isConstraintChange &&
    isConstraintChangeFamilyQuery(message) &&
    cognitiveTurn.turnType === idealTurn &&
    cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  const routingSafetyPass = !clearNewSearch;

  const routingPass =
    !openedNewSearch &&
    hasConstraintChangeRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const bridgeIntent = bridgeAudit.active ? bridgeAudit.toIntent : "search";
  const bridgePass =
    !!cognitiveTurn.signals?.isConstraintChange &&
    (bridgeAudit.active || !hasActiveAnchor) &&
    (guardResult.contextAction === "decision" ||
      guardResult.contextAction === "search" ||
      !hasActiveAnchor);

  const contractPass = routingPass && bridgePass;

  const handlerConstraintChangeGate =
    !clearNewSearch &&
    (cognitiveTurn.signals?.isConstraintChange === true ||
      isConstraintChangeFamilyQuery(message) ||
      hasConstraintChangeRoutingHold(routingDecision));

  const isAntiRegretPath =
    !clearNewSearch &&
    (cognitiveTurn.signals?.isAntiRegret ||
      isAntiRegretFamilyQuery(message) ||
      routingDecision.conversationAct === "anti_regret");

  const isDecisionConfirmationPath =
    !clearNewSearch &&
    (cognitiveTurn.signals?.isDecisionConfirmation ||
      isDecisionConfirmationFamilyQuery(message) ||
      routingDecision.conversationAct === "decision_confirmation");

  const isConfidenceChallengePath =
    !clearNewSearch &&
    (cognitiveTurn.signals?.isConfidenceChallenge ||
      isConfidenceChallengeFamilyQuery(message) ||
      routingDecision.conversationAct === "confidence_challenge");

  const isSocialValidationPath =
    cognitiveTurn.signals?.isSocialValidation ||
    isSocialValidationFamilyQuery(message) ||
    routingDecision.conversationAct === "social_validation";

  const isSecondBestPath =
    cognitiveTurn.signals?.isSecondBestDiscovery ||
    isSecondBestDiscoveryFamilyQuery(message) ||
    routingDecision.conversationAct === "second_best_discovery";

  const isAlternativePath =
    cognitiveTurn.signals?.isAlternativeExploration ||
    isAlternativeExplorationFamilyQuery(message) ||
    routingDecision.conversationAct === "alternative_exploration";

  const isSoftDisagreementPath =
    !clearNewSearch &&
    (cognitiveTurn.signals?.isSoftDisagreement ||
      isSoftDisagreementFamilyQuery(message) ||
      routingDecision.conversationAct === "soft_disagreement");

  const isComprehensionPath =
    cognitiveTurn.signals?.isComprehension ||
    isComprehensionFamilyQuery(message) ||
    routingDecision.conversationAct === "comprehension";

  const isAcknowledgementPath =
    cognitiveTurn.signals?.isAcknowledgement ||
    isAcknowledgementFamilyQuery(message) ||
    routingDecision.conversationAct === "acknowledgement";

  const isGreetingPath =
    cognitiveTurn.signals?.isGreeting ||
    isGreetingFamilyQuery(message) ||
    routingDecision.conversationAct === "greeting";

  let effectiveIntent = bridgeIntent;
  let responsePathFinal = "unknown";
  let finalResponsePreview = "";

  if (isAntiRegretPath) {
    effectiveIntent = "anti_regret";
  } else if (isDecisionConfirmationPath) {
    effectiveIntent = "decision_confirmation";
  } else if (isConfidenceChallengePath) {
    effectiveIntent = "confidence_challenge";
  } else if (isSocialValidationPath) {
    effectiveIntent = "social_validation";
  } else if (isSecondBestPath) {
    effectiveIntent = "second_best_discovery";
  } else if (isAlternativePath) {
    effectiveIntent = "alternative_exploration";
  } else if (isSoftDisagreementPath) {
    effectiveIntent = "soft_disagreement";
  } else if (isComprehensionPath) {
    effectiveIntent = "comprehension";
  } else if (isAcknowledgementPath) {
    effectiveIntent = "acknowledgement";
  } else if (isGreetingPath) {
    effectiveIntent = "greeting";
  } else if (handlerConstraintChangeGate && hasConstraintChangeRoutingHold(routingDecision)) {
    effectiveIntent = "constraint_change";
  }

  if (openedNewSearch && effectiveIntent !== "constraint_change") {
    responsePathFinal = "default_product_search";
    finalResponsePreview = "(busca comercial)";
  } else if (effectiveIntent === "constraint_change") {
    directReply = null;
    clearContext = false;
    responsePathFinal = "constraint_change_flow";
    finalResponsePreview = hasActiveAnchor
      ? buildAnchoredConstraintChangePreview()
      : buildOpenConstraintChangePreview();
  } else if (effectiveIntent === "anti_regret") {
    responsePathFinal = "anti_regret_flow";
    finalResponsePreview = "anti_regret_preview";
  } else if (effectiveIntent === "decision_confirmation") {
    responsePathFinal = "decision_confirmation_flow";
    finalResponsePreview = "decision_confirmation_preview";
  } else if (effectiveIntent === "confidence_challenge") {
    responsePathFinal = "confidence_challenge_flow";
    finalResponsePreview = "confidence_challenge_preview";
  } else if (effectiveIntent === "social_validation") {
    responsePathFinal = "social_validation_flow";
    finalResponsePreview = "social_validation_preview";
  } else if (effectiveIntent === "second_best_discovery") {
    responsePathFinal = "second_best_discovery_flow";
    finalResponsePreview = "second_best_discovery_preview";
  } else if (effectiveIntent === "alternative_exploration") {
    responsePathFinal = "alternative_exploration_flow";
    finalResponsePreview = "alternative_exploration_preview";
  } else if (effectiveIntent === "soft_disagreement") {
    responsePathFinal = "soft_disagreement_flow";
    finalResponsePreview = "soft_disagreement_preview";
  } else if (effectiveIntent === "comprehension") {
    responsePathFinal = "comprehension_flow";
    finalResponsePreview = "comprehension_preview";
  } else if (effectiveIntent === "acknowledgement") {
    responsePathFinal = "acknowledgement_flow";
    finalResponsePreview = "acknowledgement_preview";
  } else if (effectiveIntent === "greeting") {
    responsePathFinal = hasActiveAnchor ? "greeting_flow" : "context_resolution_direct_reply_early_return";
    finalResponsePreview = hasActiveAnchor ? "greeting_preview" : GENERIC_WELCOME_DIRECT_REPLY;
  } else if (directReply && clearContext) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = directReply;
  } else {
    responsePathFinal = `${routingDecision.conversationAct || routingDecision.mode}_path`;
    finalResponsePreview = `(path=${responsePathFinal})`;
  }

  const genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  const responsePathPass = responsePathFinal === "constraint_change_flow";
  const finalResponsePass =
    responsePathPass &&
    !genericFallbackDetected &&
    handlerConstraintChangeGate &&
    demonstratesRecalibration(finalResponsePreview);

  const userPerception = assessUserPerception({
    responsePathFinal,
    genericFallbackDetected,
    hasActiveAnchor,
    routerPass,
    finalResponsePass,
    handlerConstraintChangeGate,
  });

  const layers = {
    routerPass,
    routingSafetyPass,
    routingPass,
    bridgePass,
    contractPass,
    responsePathPass,
    finalResponsePass,
  };

  const leaks = classifyPositiveLeaks({
    message,
    layers,
    routingDecision,
    guardResult,
    bridgeIntent,
    clearNewSearch,
    openedNewSearch,
    handlerConstraintChangeGate,
    responsePathFinal,
    genericFallbackDetected,
    cognitiveTurn,
    userPerception,
  });

  return {
    classification: {
      turnType: cognitiveTurn.turnType,
      idealTurn,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      familyQuery: isConstraintChangeFamilyQuery(message),
    },
    bridge: {
      active: bridgeAudit.active,
      toIntent: bridgeIntent,
      contextAction: guardResult.contextAction,
    },
    routing: {
      mode: routingDecision.mode,
      conversationAct: routingDecision.conversationAct,
      responsePathHint: routingDecision.responsePathHint,
      clearNewSearch,
      openedNewSearch,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    },
    response: {
      handlerConstraintChangeGate,
      effectiveIntent,
      responsePathFinal,
      finalResponsePreview,
      genericFallbackDetected,
    },
    layers,
    userPerception,
    leaks,
    cognitiveTurn,
    routingDecision,
    clearNewSearch,
  };
}

function assessUserPerception(ctx) {
  if (ctx.finalResponsePass && !ctx.genericFallbackDetected) {
    return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
  }
  if (ctx.responsePathFinal === "constraint_change_flow" && ctx.routerPass) {
    return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
  }
  if (ctx.genericFallbackDetected || ctx.responsePathFinal === "default_product_search") {
    return "NÃO";
  }
  if (!ctx.routerPass && !ctx.handlerConstraintChangeGate) {
    return "NÃO";
  }
  return "PARCIAL";
}

function classifyPositiveLeaks(ctx) {
  const leaks = [];

  if (ctx.layers.bridgePass && ctx.layers.routingPass && ctx.layers.finalResponsePass) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: "PRIORITY_SHIFT→decision no Bridge; Routing Hold + Handler compensam (7.9K/L)",
    });
  }

  if (!ctx.layers.routerPass) {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: `isConstraintChange=${!!ctx.cognitiveTurn?.signals?.isConstraintChange} turn=${ctx.cognitiveTurn?.turnType}`,
    });
  }
  if (ctx.layers.routerPass && !ctx.layers.routingSafetyPass) {
    leaks.push({
      type: "ROUTING_SAFETY_LEAK",
      detail: `clearNewCommercialSearch=${ctx.clearNewSearch} abriu busca indevida`,
    });
  }
  if (ctx.layers.routerPass && ctx.layers.routingSafetyPass && !ctx.layers.routingPass) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `act=${ctx.routingDecision?.conversationAct} hint=${ctx.routingDecision?.responsePathHint}`,
    });
  }
  if (ctx.layers.routingPass && !ctx.layers.bridgePass) {
    leaks.push({
      type: "BRIDGE_LEAK",
      detail: `intent=${ctx.bridgeIntent} contextAction=${ctx.guardResult?.contextAction}`,
    });
  }
  if (ctx.layers.routingPass && ctx.layers.bridgePass && !ctx.layers.contractPass) {
    leaks.push({ type: "CONTRACT_LEAK", detail: "Bridge/routing desalinhados" });
  }
  if (ctx.layers.routerPass && ctx.handlerConstraintChangeGate && !ctx.layers.responsePathPass) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `gate true mas path=${ctx.responsePathFinal}`,
    });
  }
  if (ctx.layers.responsePathPass && !ctx.layers.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION_LEAK",
      detail: "constraint_change_flow sem recalibração percebida ou fallback genérico",
    });
  }
  if (ctx.layers.routerPass && ctx.layers.finalResponsePass && ctx.userPerception === "NÃO") {
    leaks.push({
      type: "USER_PERCEPTION_LEAK",
      detail: "Stack passou mas usuário não percebe recalibração",
    });
  }
  return leaks;
}

function evaluatePositive(group, phrase, hasActiveAnchor) {
  const trace = simulateFullStack(phrase, hasActiveAnchor);
  return {
    kind: "positive",
    group: group.id,
    groupLabel: group.label,
    subtype: group.subtype,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ...trace,
  };
}

function evaluateCompoundDecision(phrase, hasActiveAnchor) {
  const trace = simulateFullStack(phrase, hasActiveAnchor);
  const ccDominant =
    !!trace.cognitiveTurn.signals?.isConstraintChange &&
    isConstraintChangeFamilyQuery(phrase);
  const ok = ccDominant && trace.layers.finalResponsePass;
  const leaks = ccDominant
    ? trace.leaks.filter((l) => l.type !== "ARCHITECTURAL_DESIGN_ACCEPTED")
    : [{ type: "ROUTER_LEAK", detail: "Composto não preservou CONSTRAINT_CHANGE dominante" }];

  if (ok) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: "Composto com decisão preservou recalibração de critério",
    });
  }

  return {
    kind: "compound_decision",
    group: COMPOUND_DECISION.id,
    subtype: COMPOUND_DECISION.subtype,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ok,
    ccDominant,
    ...trace,
    leaks: [...trace.leaks, ...leaks.filter((l) => l.type === "ROUTER_LEAK")],
    layers: { ...trace.layers, finalResponsePass: ok },
    userPerception: ok ? (hasActiveAnchor ? "SIM" : "PARCIAL") : trace.userPerception,
  };
}

function evaluateCompoundNeighbor(spec, hasActiveAnchor) {
  const trace = simulateFullStack(spec.input, hasActiveAnchor);
  const falseCc =
    trace.response.responsePathFinal === "constraint_change_flow" &&
    !!trace.cognitiveTurn.signals?.isConstraintChange &&
    isConstraintChangeFamilyQuery(spec.input) &&
    spec.expect !== "CONSTRAINT_CHANGE";
  const neighborOk = matchesExpectedNeighbor(
    spec.expect,
    spec.input,
    trace.cognitiveTurn,
    trace.routingDecision,
    trace.response.responsePathFinal
  );
  const ccSwallowed =
    spec.expect !== "CONSTRAINT_CHANGE" &&
    trace.response.responsePathFinal === "constraint_change_flow" &&
    !neighborOk;
  const ok = !falseCc && !ccSwallowed && neighborOk;
  const leaks = [];

  if (ccSwallowed || falseCc) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `CC engoliu ${spec.expect} → constraint_change_flow`,
    });
  } else if (neighborOk) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: `${spec.expect} preservado — CC não dominante`,
    });
  } else {
    leaks.push({
      type: "TEST_EXPECTATION_LEAK",
      detail: `Esperado ${spec.expect}, path=${trace.response.responsePathFinal}`,
    });
  }

  return {
    kind: "compound_neighbor",
    ...spec,
    context: hasActiveAnchor ? "anchored" : "cold",
    ok,
    neighborOk,
    ...trace,
    leaks,
    layers: {
      routerPass: !ccSwallowed,
      routingSafetyPass: !ccSwallowed,
      routingPass: neighborOk,
      bridgePass: neighborOk,
      contractPass: ok,
      responsePathPass: !ccSwallowed || spec.expect === "CONSTRAINT_CHANGE",
      finalResponsePass: ok,
    },
    userPerception: ok ? "SIM" : "NÃO",
  };
}

function evaluateNegative(spec, hasActiveAnchor) {
  const trace = simulateFullStack(spec.input, hasActiveAnchor);
  const falseCc =
    trace.response.responsePathFinal === "constraint_change_flow" &&
    !!trace.cognitiveTurn.signals?.isConstraintChange &&
    isConstraintChangeFamilyQuery(spec.input) &&
    spec.expect !== "CONSTRAINT_CHANGE";
  const neighborOk = matchesExpectedNeighbor(
    spec.expect,
    spec.input,
    trace.cognitiveTurn,
    trace.routingDecision,
    trace.response.responsePathFinal
  );
  const ok =
    spec.expect === "COMMERCIAL_SEARCH"
      ? trace.routing.openedNewSearch || trace.response.responsePathFinal === "default_product_search"
      : !falseCc && neighborOk;
  const leaks = [];

  if (falseCc) {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: `Negativo engoliu por CONSTRAINT_CHANGE: ${spec.expect}`,
    });
  } else if (ok) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: `${spec.expect} preservado`,
    });
  } else {
    leaks.push({
      type: "TEST_EXPECTATION_LEAK",
      detail: `Esperado ${spec.expect}, path=${trace.response.responsePathFinal}`,
    });
  }

  return {
    kind: "negative",
    ...spec,
    context: hasActiveAnchor ? "anchored" : "cold",
    ok,
    falseCc,
    neighborOk,
    ...trace,
    leaks,
    layers: {
      routerPass: !falseCc,
      routingSafetyPass: spec.expect === "COMMERCIAL_SEARCH" ? trace.routing.openedNewSearch : !falseCc,
      routingPass: ok,
      bridgePass: ok,
      contractPass: ok,
      responsePathPass: !falseCc,
      finalResponsePass: ok,
    },
    userPerception: ok ? "SIM" : "NÃO",
  };
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function summarize(records) {
  return {
    total: records.length,
    router: records.filter((r) => r.layers?.routerPass).length,
    routingSafety: records.filter((r) => r.layers?.routingSafetyPass).length,
    routing: records.filter((r) => r.layers?.routingPass).length,
    bridge: records.filter((r) => r.layers?.bridgePass).length,
    contract: records.filter((r) => r.layers?.contractPass).length,
    response: records.filter((r) => r.layers?.responsePathPass).length,
    final: records.filter((r) => r.layers?.finalResponsePass).length,
    sim: records.filter((r) => r.userPerception === "SIM").length,
    partial: records.filter((r) => r.userPerception === "PARCIAL").length,
    no: records.filter((r) => r.userPerception === "NÃO").length,
  };
}

function printFlowMap() {
  console.log("── FASE 1 — Mapa do fluxo CONSTRAINT_CHANGE ──\n");
  console.log("1. Router (lib/miaCognitiveRouter.js — 7.9J / 7.9X-CC)");
  console.log("   • detectsConstraintChangeSignal / detectsNaturalConstraintChangeSignal");
  console.log("   • hasConstraintChangeDominantFrame (compostos / orçamento / prioridade)");
  console.log("   • turnType: PRIORITY_SHIFT (anchored) | CONVERSATIONAL (cold)");
  console.log("   • Export: isConstraintChangeFamilyQuery()\n");
  console.log("2. Bridge (lib/miaCognitiveBridge.js)");
  console.log("   • PRIORITY_SHIFT → contextAction=decision (legacy contract)");
  console.log("   • Routing Hold + Handler compensam — não mapeia constraint_change direto\n");
  console.log("3. Routing Safety (lib/miaRoutingSafety.js)");
  console.log("   • isConstraintChangeFamilyQuery bloqueia clearNewCommercialSearch");
  console.log("   • isNegativeNonCommercialDesire para frames emocionais\n");
  console.log("4. Routing (lib/miaRoutingDecisionContract.js — 7.9K)");
  console.log("   • applyConstraintChangeRoutingHoldIfEligible ANTES de decision intercept");
  console.log("   • conversationAct=constraint_change | hint constraint_change_reply/anchored\n");
  console.log("5. Response Path (pages/api/chat-gpt4o.js — 7.9L)");
  console.log("   • Gate: !clearNewCommercialSearch + isConstraintChange | family | hold");
  console.log("   • constraint_change_flow → role constraint_change_reply\n");
  console.log("6. Resposta final");
  console.log("   • Cold: pede referência + reconhece mudança de critério");
  console.log("   • Anchored: recalibra na mesma decisão, preserva winner\n");
}

printFlowMap();

console.log("PATCH 7.9X-CC.1 — CONSTRAINT_CHANGE Flow Robustness Audit (AUDIT ONLY)\n");
console.log("HTTP usage: false | Production changes: NONE\n");

const positiveRecords = [];
for (const group of POSITIVE_GROUPS) {
  for (const phrase of group.phrases) {
    positiveRecords.push(evaluatePositive(group, phrase, false));
    positiveRecords.push(evaluatePositive(group, phrase, true));
  }
}

const compoundDecisionRecords = COMPOUND_DECISION.phrases.flatMap((phrase) => [
  evaluateCompoundDecision(phrase, false),
  evaluateCompoundDecision(phrase, true),
]);

const compoundNeighborRecords = COMPOUND_NEIGHBOR.flatMap((spec) => [
  evaluateCompoundNeighbor(spec, false),
  evaluateCompoundNeighbor(spec, true),
]);

const negativeRecords = NEGATIVE_GUARDS.flatMap((spec) => [
  evaluateNegative(spec, false),
  evaluateNegative(spec, true),
]);

const posStats = summarize(positiveRecords);
const compoundDecisionStats = summarize(compoundDecisionRecords);
const compoundNeighborStats = summarize(compoundNeighborRecords);
const negativeStats = summarize(negativeRecords);

console.log(`── FASE 2 — Suite positiva (${posStats.total} cenários) ──\n`);
console.log("Grp | Ctx | Frase | Rtr | Safe | Rtg | Brg | Path | Final | Perc");
console.log("-".repeat(115));
for (const r of positiveRecords) {
  const m = (ok) => (ok ? "✓" : "✗");
  console.log(
    `${r.group} | ${r.context.padEnd(7)} | ${r.input.slice(0, 26).padEnd(26)} | ${m(r.layers.routerPass)} | ${m(r.layers.routingSafetyPass)} | ${m(r.layers.routingPass)} | ${m(r.layers.bridgePass)} | ${m(r.layers.responsePathPass)} | ${m(r.layers.finalResponsePass)} | ${r.userPerception}`
  );
}

console.log(`\n── FASE 3 — Compostos decisão (${compoundDecisionRecords.length}) ──\n`);
for (const r of compoundDecisionRecords) {
  console.log(
    `  ${r.ok ? "✓ OK" : "✗ LEAK"} [${r.context}] "${r.input}" → ${r.response.responsePathFinal}`
  );
}

console.log(`\n── FASE 4 — Compostos vizinhos (${compoundNeighborRecords.length}) ──\n`);
for (const r of compoundNeighborRecords) {
  console.log(
    `  ${r.ok ? "✓ OK" : "✗ LEAK"} [${r.context}] "${r.input}" → expect=${r.expect} path=${r.response.responsePathFinal}`
  );
}

console.log(`\n── FASE 5 — Negativos (${negativeRecords.length}) ──\n`);
for (const r of negativeRecords.filter((x) => !x.ok).slice(0, 20)) {
  console.log(
    `  ✗ [${r.group}/${r.context}] "${r.input}" → expect=${r.expect} path=${r.response.responsePathFinal}`
  );
}
console.log(`  Clean: ${negativeRecords.filter((r) => r.ok).length}/${negativeRecords.length}`);

console.log("\n── FASE 6 — Taxa por camada (positivos) ──\n");
console.log(`Cenários positivos: ${posStats.total}`);
console.log(`Router:           ${posStats.router}/${posStats.total} (${pct(posStats.router, posStats.total)}%)`);
console.log(`Routing Safety:   ${posStats.routingSafety}/${posStats.total} (${pct(posStats.routingSafety, posStats.total)}%)`);
console.log(`Routing:          ${posStats.routing}/${posStats.total} (${pct(posStats.routing, posStats.total)}%)`);
console.log(`Bridge:           ${posStats.bridge}/${posStats.total} (${pct(posStats.bridge, posStats.total)}%)`);
console.log(`Contract:         ${posStats.contract}/${posStats.total} (${pct(posStats.contract, posStats.total)}%)`);
console.log(`Response Path:    ${posStats.response}/${posStats.total} (${pct(posStats.response, posStats.total)}%)`);
console.log(`Resposta Final:   ${posStats.final}/${posStats.total} (${pct(posStats.final, posStats.total)}%)`);
console.log(`Percepção SIM:    ${posStats.sim}/${posStats.total} (${pct(posStats.sim, posStats.total)}%)`);
console.log(`Percepção PARCIAL:${posStats.partial}/${posStats.total} (${pct(posStats.partial, posStats.total)}%)`);
console.log(`Percepção NÃO:    ${posStats.no}/${posStats.total} (${pct(posStats.no, posStats.total)}%)`);

console.log("\n── Métricas por subfamília (positivos) ──\n");
for (const subtype of ["budget", "attribute", "use", "reduction", "recalibration"]) {
  const rows = positiveRecords.filter((r) => r.subtype === subtype);
  const s = summarize(rows);
  console.log(
    `  ${subtype}: router ${s.router}/${s.total} | full ${s.final}/${s.total}`
  );
}

console.log("\n── Compostos decisão ──\n");
console.log(
  `  OK: ${compoundDecisionRecords.filter((r) => r.ok).length}/${compoundDecisionRecords.length} (${pct(compoundDecisionRecords.filter((r) => r.ok).length, compoundDecisionRecords.length)}%)`
);

console.log("\n── Compostos vizinhos ──\n");
console.log(
  `  OK: ${compoundNeighborRecords.filter((r) => r.ok).length}/${compoundNeighborRecords.length} (${pct(compoundNeighborRecords.filter((r) => r.ok).length, compoundNeighborRecords.length)}%)`
);

console.log("\n── Negativos / colisões ──\n");
console.log(
  `  Clean: ${negativeRecords.filter((r) => r.ok).length}/${negativeRecords.length} (${pct(negativeRecords.filter((r) => r.ok).length, negativeRecords.length)}%)`
);

const leakCounts = {};
for (const r of [
  ...positiveRecords,
  ...compoundDecisionRecords,
  ...compoundNeighborRecords,
  ...negativeRecords,
]) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
  }
}

console.log("\n── Leaks por tipo ──\n");
if (Object.keys(leakCounts).length === 0) {
  console.log("  (nenhum leak real)");
} else {
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

const uniquePatterns = new Map();
for (const r of positiveRecords) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    const key = `${leak.type}::${leak.detail}`;
    if (!uniquePatterns.has(key)) uniquePatterns.set(key, []);
    uniquePatterns.get(key).push(`[${r.context}] "${r.input}"`);
  }
}

console.log("\n── Causa raiz (padrões únicos — positivos) ──\n");
if (uniquePatterns.size === 0) {
  console.log("  (nenhum padrão de leak estrutural)");
} else {
  for (const [key, examples] of uniquePatterns.entries()) {
    const [type, detail] = key.split("::");
    console.log(`  ${type}: ${detail}`);
    console.log(`    Ex.: ${examples.slice(0, 2).join("; ")}`);
    console.log("");
  }
}

console.log("── Veredito ──\n");
const fullRobust =
  posStats.final === posStats.total &&
  compoundDecisionRecords.every((r) => r.ok) &&
  compoundNeighborRecords.every((r) => r.ok) &&
  negativeRecords.every((r) => r.ok);

if (fullRobust) {
  console.log("A) CONSTRAINT_CHANGE FULL STACK ROBUST");
} else {
  console.log("B) CONSTRAINT_CHANGE POSSUI GAP FULL STACK");
  if (posStats.final < posStats.total) {
    console.log(`   Positivos full stack: ${posStats.final}/${posStats.total}`);
  }
  const cdFails = compoundDecisionRecords.filter((r) => !r.ok).length;
  if (cdFails) console.log(`   Compostos decisão: ${cdFails} leak(s)`);
  const cnFails = compoundNeighborRecords.filter((r) => !r.ok).length;
  if (cnFails) console.log(`   Compostos vizinhos: ${cnFails} leak(s)`);
  const negFails = negativeRecords.filter((r) => !r.ok).length;
  if (negFails) console.log(`   Negativos: ${negFails} leak(s)`);
}

console.log("\n── Recomendação ──\n");
if (fullRobust) {
  console.log("Próximo patch: PATCH 7.9Y — Cross-Family Collision Audit");
} else {
  console.log("Seguir camada dominante nos leaks — patch corretivo dedicado por camada.");
}

console.log("\nPATCH 7.9X-CC.1 audit COMPLETE — AUDIT ONLY\n");
process.exit(fullRobust ? 0 : 1);
