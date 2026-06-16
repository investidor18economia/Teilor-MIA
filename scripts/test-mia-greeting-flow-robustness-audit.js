/**
 * PATCH 7.9X-I.1 — GREETING Flow Robustness Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge/Contract → Routing → Response Path → User perception.
 * Separates pure GREETING vs greeting+embedded intent vs negative collisions.
 *
 * Usage: node scripts/test-mia-greeting-flow-robustness-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isGreetingFamilyQuery,
  hasGreetingOpeningPrefix,
  isAcknowledgementFamilyQuery,
  isComprehensionFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isAntiRegretFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isConstraintChangeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
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

const CONTEXTUAL_DIRECT_REPLY_BYPASS_TURNS = new Set([
  "OBJECTION",
  "EXPLANATION_REQUEST",
  "FOLLOW_UP",
  "ALTERNATIVE_REQUEST",
  "PRIORITY_SHIFT",
  "COMPARISON",
  "REFINEMENT",
]);

const PURE_GROUPS = [
  {
    id: "A",
    label: "greeting puro direto",
    phrases: ["oi", "oii", "olá", "ola", "hey", "hello", "alô", "alo"],
  },
  {
    id: "B",
    label: "greeting informal BR",
    phrases: ["e aí", "eai", "fala", "fala aí", "salve", "opa", "chega mais", "bora?"],
  },
  {
    id: "C",
    label: "período do dia",
    phrases: [
      "bom dia",
      "boa tarde",
      "boa noite",
      "boa madrugada",
      "bom dia mia",
      "boa tarde, mia",
    ],
  },
  {
    id: "D",
    label: "chamada da MIA",
    phrases: [
      "mia",
      "mia?",
      "oi mia",
      "fala mia",
      "ei mia",
      "cadê você?",
      "alguém aí?",
      "você tá aí?",
    ],
  },
  {
    id: "E",
    label: "abertura conversacional",
    phrases: [
      "tudo bem?",
      "como vai?",
      "tudo certo por aí?",
      "posso perguntar uma coisa?",
      "posso tirar uma dúvida?",
      "deixa eu te perguntar uma coisa",
      "bora conversar?",
    ],
  },
];

const COMPOUND_COMMERCIAL = [
  { group: "F", input: "oi, quero comprar um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "bom dia, me ajuda com uma compra?", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "salve, preciso escolher uma opção", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "e aí, qual vale mais a pena?", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "opa, quero comparar dois produtos", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "fala mia, tô em dúvida entre opções", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "oi, quero um produto até 2000", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "bom dia, procura uma opção boa", expect: "COMMERCIAL_SEARCH" },
];

const COMPOUND_FAMILY = [
  { group: "G", input: "oi, tem outro?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "G", input: "salve, qual ficou em segundo?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "G", input: "bom dia, tenho medo de errar", expect: "ANTI_REGRET" },
  { group: "G", input: "e aí, a galera recomenda?", expect: "SOCIAL_VALIDATION" },
  { group: "G", input: "opa, você tem certeza?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "G", input: "fala mia, quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "G", input: "oi, não entendi", expect: "COMPREHENSION" },
  { group: "G", input: "salve, não me convenceu", expect: "SOFT_DISAGREEMENT" },
];

const NEGATIVE_GUARDS = [
  { group: "ACK", input: "ok", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "blz", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "beleza", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "show", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "pode seguir", expect: "ACKNOWLEDGEMENT" },
  { group: "COMP", input: "entendi", expect: "COMPREHENSION" },
  { group: "COMP", input: "agora fez sentido", expect: "COMPREHENSION" },
  { group: "COMP", input: "saquei o raciocínio", expect: "COMPREHENSION" },
  { group: "COMP", input: "não entendi", expect: "COMPREHENSION" },
  { group: "COMP", input: "fiquei confuso", expect: "COMPREHENSION" },
  { group: "DC", input: "vou nele", expect: "DECISION_CONFIRMATION" },
  { group: "DC", input: "acho que fechou", expect: "DECISION_CONFIRMATION" },
  { group: "DC", input: "então é esse", expect: "DECISION_CONFIRMATION" },
  { group: "SD", input: "não me convenceu", expect: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "estou com um pé atrás", expect: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "não curti muito", expect: "SOFT_DISAGREEMENT" },
  { group: "CC", input: "você tem certeza?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "ainda recomenda esse?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "você manteria essa recomendação?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "SV", input: "a galera recomenda?", expect: "SOCIAL_VALIDATION" },
  { group: "SV", input: "o povo fala bem?", expect: "SOCIAL_VALIDATION" },
  { group: "SV", input: "quem comprou gostou?", expect: "SOCIAL_VALIDATION" },
  { group: "AR", input: "tenho medo de errar", expect: "ANTI_REGRET" },
  { group: "AR", input: "não quero me arrepender", expect: "ANTI_REGRET" },
  { group: "AR", input: "tô cabreiro", expect: "ANTI_REGRET" },
  { group: "AE", input: "tem outro?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "mostra alternativas", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "quero ver opções", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "SBD", input: "qual ficou em segundo?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "plano B?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "backup?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "CC2", input: "quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "agora câmera importa mais", expect: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "vou usar mais para fotos", expect: "CONSTRAINT_CHANGE" },
  { group: "SEARCH", input: "quero comprar um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "SEARCH", input: "procura um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "SEARCH", input: "me recomenda um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "SEARCH", input: "quero outro produto", expect: "COMMERCIAL_SEARCH" },
];

function normalizeQuery(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLegacyIntentMirror(message = "") {
  const q = normalizeQuery(message);
  if (!q) return "empty";
  if (/^(oi|ola|opa|eai|e ai|eae|iae|fala|salve|bom dia|boa tarde|boa noite)$/.test(q)) {
    return "greeting";
  }
  return "search";
}

function buildContextResolutionMirror() {
  return {
    mode: "general_answer",
    shouldSkipProductSearch: true,
    clearContext: true,
    directReply: GENERIC_WELCOME_DIRECT_REPLY,
    lockedComparisonFollowUp: false,
  };
}

function buildIdealGreetingPreview(hasAnchor) {
  if (hasAnchor) {
    return "Opa! Continuamos naquele produto. Quer que eu explique melhor ou compare com outra opção?";
  }
  return "Oi! Me diz o que você está pensando em comprar que eu te ajudo a decidir.";
}

function hasGreetingRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "greeting" ||
    routingDecision.responsePathHint === "greeting_open" ||
    routingDecision.responsePathHint === "greeting_anchored"
  );
}

function simulateHandlerResponsePath({
  message,
  hasAnchor,
  intent,
  contextResolution,
  cognitiveTurn,
  routingDecision,
  clearNewSearch,
}) {
  let ctx = { ...contextResolution };
  applyRoutingDecisionToContextResolution(routingDecision, ctx);

  let directReply = ctx.directReply;
  let effectiveIntent = intent;

  const shouldBypassDirectReplyForContextualTurn =
    hasAnchor &&
    !clearNewSearch &&
    CONTEXTUAL_DIRECT_REPLY_BYPASS_TURNS.has(cognitiveTurn.turnType);

  if (shouldBypassDirectReplyForContextualTurn) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false };
  }

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

  const familyFlowChecks = [
    {
      key: "acknowledgement",
      gate:
        !clearNewSearch &&
        (
          cognitiveTurn.signals?.isAcknowledgement === true ||
          isAcknowledgementFamilyQuery(message) ||
          routingDecision.conversationAct === "acknowledgement"
        ),
      path: "acknowledgement_flow",
    },
    {
      key: "comprehension",
      gate:
        !clearNewSearch &&
        (
          cognitiveTurn.signals?.isComprehension === true ||
          isComprehensionFamilyQuery(message) ||
          routingDecision.conversationAct === "comprehension"
        ),
      path: "comprehension_flow",
    },
    {
      key: "soft_disagreement",
      gate:
        !clearNewSearch &&
        (
          cognitiveTurn.signals?.isSoftDisagreement === true ||
          isSoftDisagreementFamilyQuery(message) ||
          routingDecision.conversationAct === "soft_disagreement"
        ),
      path: "soft_disagreement_flow",
    },
    {
      key: "confidence_challenge",
      gate:
        !clearNewSearch &&
        (
          cognitiveTurn.signals?.isConfidenceChallenge === true ||
          isConfidenceChallengeFamilyQuery(message) ||
          routingDecision.conversationAct === "confidence_challenge"
        ),
      path: "confidence_challenge_flow",
    },
    {
      key: "social_validation",
      gate:
        cognitiveTurn.signals?.isSocialValidation === true ||
        isSocialValidationFamilyQuery(message) ||
        routingDecision.conversationAct === "social_validation",
      path: "social_validation_flow",
    },
    {
      key: "anti_regret",
      gate:
        !clearNewSearch &&
        (
          cognitiveTurn.signals?.isAntiRegret === true ||
          isAntiRegretFamilyQuery(message) ||
          routingDecision.conversationAct === "anti_regret"
        ),
      path: "anti_regret_flow",
    },
    {
      key: "constraint_change",
      gate:
        cognitiveTurn.signals?.isConstraintChange === true ||
        isConstraintChangeFamilyQuery(message) ||
        routingDecision.conversationAct === "constraint_change",
      path: "constraint_change_flow",
    },
    {
      key: "second_best_discovery",
      gate:
        cognitiveTurn.signals?.isSecondBestDiscovery === true ||
        isSecondBestDiscoveryFamilyQuery(message) ||
        routingDecision.conversationAct === "second_best_discovery",
      path: "second_best_discovery_flow",
    },
    {
      key: "alternative_exploration",
      gate:
        cognitiveTurn.signals?.isAlternativeExploration === true ||
        isAlternativeExplorationFamilyQuery(message) ||
        routingDecision.conversationAct === "alternative_exploration",
      path: "alternative_exploration_flow",
    },
    {
      key: "decision_confirmation",
      gate:
        !clearNewSearch &&
        (
          cognitiveTurn.signals?.isDecisionConfirmation === true ||
          isDecisionConfirmationFamilyQuery(message) ||
          routingDecision.conversationAct === "decision_confirmation"
        ),
      path: "decision_confirmation_flow",
    },
  ];

  if (directReply && !ctx.lockedComparisonFollowUp) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: directReply,
      effectiveIntent,
      handlerGreetingGate: isGreetingResponsePath,
    };
  }

  if (effectiveIntent === "greeting" && isGreetingResponsePath) {
    return {
      responsePathFinal: "greeting_flow",
      finalResponsePreview: buildIdealGreetingPreview(hasAnchor),
      effectiveIntent: "greeting",
      handlerGreetingGate: true,
    };
  }

  for (const check of familyFlowChecks) {
    if (check.gate) {
      return {
        responsePathFinal: check.path,
        finalResponsePreview: `(path=${check.path})`,
        effectiveIntent: check.key,
        handlerGreetingGate: false,
      };
    }
  }

  if (clearNewSearch) {
    return {
      responsePathFinal: "default_product_search",
      finalResponsePreview: "(busca comercial)",
      effectiveIntent,
      handlerGreetingGate: false,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: `(path=${routingDecision.responsePathHint || routingDecision.mode})`,
    effectiveIntent,
    handlerGreetingGate: isGreetingResponsePath,
  };
}

function matchesExpectedFamily(expected, message, cognitiveTurn, routingDecision, response, clearNewSearch) {
  switch (expected) {
    case "COMMERCIAL_SEARCH":
      return (
        clearNewSearch ||
        response.responsePathFinal === "default_product_search" ||
        response.responsePathFinal === "context_resolution_direct_reply_early_return" ||
        response.responsePathFinal === "context_hold" ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.REFINEMENT ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.COMPARISON ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.UNKNOWN
      );
    case "ACKNOWLEDGEMENT":
      return (
        !!cognitiveTurn.signals?.isAcknowledgement ||
        isAcknowledgementFamilyQuery(message) ||
        response.responsePathFinal === "acknowledgement_flow"
      );
    case "COMPREHENSION":
      return (
        !!cognitiveTurn.signals?.isComprehension ||
        isComprehensionFamilyQuery(message) ||
        response.responsePathFinal === "comprehension_flow"
      );
    case "SOFT_DISAGREEMENT":
      return (
        !!cognitiveTurn.signals?.isSoftDisagreement ||
        isSoftDisagreementFamilyQuery(message) ||
        response.responsePathFinal === "soft_disagreement_flow"
      );
    case "CONFIDENCE_CHALLENGE":
      return (
        !!cognitiveTurn.signals?.isConfidenceChallenge ||
        isConfidenceChallengeFamilyQuery(message) ||
        response.responsePathFinal === "confidence_challenge_flow"
      );
    case "SOCIAL_VALIDATION":
      return (
        !!cognitiveTurn.signals?.isSocialValidation ||
        isSocialValidationFamilyQuery(message) ||
        response.responsePathFinal === "social_validation_flow"
      );
    case "ANTI_REGRET":
      return (
        !!cognitiveTurn.signals?.isAntiRegret ||
        isAntiRegretFamilyQuery(message) ||
        response.responsePathFinal === "anti_regret_flow"
      );
    case "ALTERNATIVE_EXPLORATION":
      return (
        !!cognitiveTurn.signals?.isAlternativeExploration ||
        isAlternativeExplorationFamilyQuery(message) ||
        response.responsePathFinal === "alternative_exploration_flow"
      );
    case "SECOND_BEST_DISCOVERY":
      return (
        !!cognitiveTurn.signals?.isSecondBestDiscovery ||
        isSecondBestDiscoveryFamilyQuery(message) ||
        response.responsePathFinal === "second_best_discovery_flow"
      );
    case "CONSTRAINT_CHANGE":
      return (
        !!cognitiveTurn.signals?.isConstraintChange ||
        isConstraintChangeFamilyQuery(message) ||
        routingDecision.conversationAct === "constraint_change" ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT
      );
    case "DECISION_CONFIRMATION":
      return (
        !!cognitiveTurn.signals?.isDecisionConfirmation ||
        isDecisionConfirmationFamilyQuery(message) ||
        response.responsePathFinal === "decision_confirmation_flow"
      );
    default:
      return false;
  }
}

function simulateFullStack(message, hasActiveAnchor, kind = "pure") {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = detectLegacyIntentMirror(message);
  const legacyContextAction = legacyIntent === "greeting" ? "conversation" : "search";
  const contextResolution = buildContextResolutionMirror();

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
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
    contextResolution,
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
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
    routingDecision.allowNewSearch === true ||
    (routingDecision.mode === "search" && routingDecision.allowNewSearch === true);

  const response = simulateHandlerResponsePath({
    message,
    hasAnchor: hasActiveAnchor,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextResolution,
    cognitiveTurn,
    routingDecision,
    clearNewSearch,
  });

  const bridgeIntent = bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent;

  const routerPassPure =
    !!cognitiveTurn.signals?.isGreeting &&
    isGreetingFamilyQuery(message) &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL &&
    cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  const routingPassPure =
    !openedNewSearch &&
    hasGreetingRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const handlerGreetingGate = response.handlerGreetingGate;

  const contractPassPure =
    routingPassPure &&
    handlerGreetingGate &&
    response.responsePathFinal === "greeting_flow";

  const responsePathPassPure = response.responsePathFinal === "greeting_flow";
  const genericFallbackDetected = detectGenericConversationalFallback(
    response.finalResponsePreview
  );
  const finalResponsePassPure =
    responsePathPassPure &&
    !genericFallbackDetected &&
    handlerGreetingGate;

  const userPerceptionPure = assessUserPerception({
    kind: "pure",
    responsePathFinal: response.responsePathFinal,
    genericFallbackDetected,
    hasActiveAnchor,
    routerPass: routerPassPure,
    finalResponsePass: finalResponsePassPure,
  });

  const layers =
    kind === "pure"
      ? {
          routerPass: routerPassPure,
          routingPass: routingPassPure,
          contractPass: contractPassPure,
          responsePathPass: responsePathPassPure,
          finalResponsePass: finalResponsePassPure,
        }
      : null;

  return {
    kind,
    classification: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      greetingFamily: isGreetingFamilyQuery(message),
      greetingPrefix: hasGreetingOpeningPrefix(message),
      reasons: cognitiveTurn.reasons || [],
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
      reasons: routingDecision.reasons,
      clearNewSearch,
      openedNewSearch,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    },
    response: {
      handlerGreetingGate,
      effectiveIntent: response.effectiveIntent,
      responsePathFinal: response.responsePathFinal,
      finalResponsePreview: response.finalResponsePreview,
      genericFallbackDetected,
      expectedPath: "greeting_flow",
    },
    layers,
    userPerception: userPerceptionPure,
    leaks: [],
    cognitiveTurn,
    routingDecision,
    clearNewSearch,
    openedNewSearch,
    bridgeIntent,
    guardResult,
    bridgeAudit,
    responseSim: response,
  };
}

function assessUserPerception(ctx) {
  if (ctx.kind === "pure") {
    if (ctx.finalResponsePass && !ctx.genericFallbackDetected) {
      return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
    }
    if (ctx.genericFallbackDetected || ctx.responsePathFinal === "context_resolution_direct_reply_early_return") {
      return "NÃO";
    }
    if (ctx.routerPass && ctx.responsePathFinal === "greeting_flow") {
      return "PARCIAL";
    }
    return "NÃO";
  }
  return "SIM";
}

function classifyPureLeaks(trace) {
  const leaks = [];

  if (!trace.layers.routerPass) {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: `isGreeting=${trace.classification.isGreeting} turnType=${trace.classification.turnType}`,
    });
  }

  if (trace.layers.routerPass && !trace.layers.routingPass) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `act=${trace.routing.conversationAct} hint=${trace.routing.responsePathHint}`,
    });
  }

  if (trace.layers.routingPass && !trace.layers.contractPass) {
    leaks.push({
      type: "CONTRACT_LEAK",
      detail: `Bridge intent=${trace.bridge.toIntent} contextAction=${trace.bridge.contextAction} path=${trace.response.responsePathFinal}`,
    });
  }

  if (
    trace.layers.routerPass &&
    trace.response.handlerGreetingGate &&
    !trace.layers.responsePathPass
  ) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `gate true mas path=${trace.response.responsePathFinal}`,
    });
  }

  if (
    trace.response.responsePathFinal === "context_resolution_direct_reply_early_return"
  ) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: "directReply institucional precede greeting_flow (PATCH 7.7H bypass ausente ou insuficiente)",
    });
  }

  if (trace.layers.responsePathPass && !trace.layers.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION_LEAK",
      detail: "greeting_flow ativo mas resposta genérica/institucional",
    });
  }

  if (trace.layers.routerPass && trace.layers.finalResponsePass && trace.userPerception === "NÃO") {
    leaks.push({
      type: "USER_PERCEPTION_LEAK",
      detail: "Stack técnico passou mas percepção não reflete abertura natural",
    });
  }

  return leaks;
}

function evaluatePure(group, phrase, hasActiveAnchor) {
  const trace = simulateFullStack(phrase, hasActiveAnchor, "pure");
  trace.leaks = classifyPureLeaks(trace);
  return {
    kind: "pure",
    group: group.id,
    groupLabel: group.label,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ...trace,
  };
}

function evaluateCompound(spec, hasActiveAnchor) {
  const trace = simulateFullStack(spec.input, hasActiveAnchor, "compound");
  const greetingSwallowed =
    trace.response.responsePathFinal === "greeting_flow" &&
    trace.classification.isGreeting &&
    isGreetingFamilyQuery(spec.input);
  const dominantOk = matchesExpectedFamily(
    spec.expect,
    spec.input,
    trace.cognitiveTurn,
    trace.routingDecision,
    trace.responseSim,
    trace.clearNewSearch
  );
  const prefixOk = hasGreetingOpeningPrefix(spec.input);
  const ok = !greetingSwallowed && prefixOk && dominantOk;
  const leaks = [];

  if (greetingSwallowed) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: "Greeting composto engoliu intenção principal → greeting_flow",
    });
  } else if (dominantOk) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: `Greeting composto preservou ${spec.expect} — greeting_flow não exigido`,
    });
  } else {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: `Esperado ${spec.expect}, got turn=${trace.classification.turnType} path=${trace.response.responsePathFinal}`,
    });
  }

  return {
    kind: "compound",
    ...spec,
    context: hasActiveAnchor ? "anchored" : "cold",
    ok,
    dominantOk,
    greetingSwallowed,
    prefixOk,
    ...trace,
    leaks,
    layers: {
      routerPass: !greetingSwallowed,
      routingPass: !greetingSwallowed,
      contractPass: dominantOk,
      responsePathPass: dominantOk,
      finalResponsePass: ok,
    },
    userPerception: ok ? "SIM" : greetingSwallowed ? "NÃO" : "PARCIAL",
  };
}

function evaluateNegative(spec) {
  const trace = simulateFullStack(spec.input, true, "negative");
  const falseGreeting =
    trace.response.responsePathFinal === "greeting_flow" ||
    (trace.classification.isGreeting &&
      isGreetingFamilyQuery(spec.input) &&
      trace.routing.conversationAct === "greeting");
  const dominantOk = matchesExpectedFamily(
    spec.expect,
    spec.input,
    trace.cognitiveTurn,
    trace.routingDecision,
    trace.responseSim,
    trace.clearNewSearch
  );
  const comprehensionSuccessViaAck =
    spec.expect === "COMPREHENSION" &&
    (
      trace.cognitiveTurn.signals?.isAcknowledgement ||
      trace.response.responsePathFinal === "acknowledgement_flow" ||
      trace.routing.conversationAct === "acknowledgement"
    );
  const ok = !falseGreeting;
  const leaks = [];

  if (falseGreeting) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `Negativo virou greeting: act=${trace.routing.conversationAct} path=${trace.response.responsePathFinal}`,
    });
  } else if (comprehensionSuccessViaAck) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: "COMPREHENSION_SUCCESS usa acknowledgement — não é GREETING",
    });
  } else if (dominantOk) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: `${spec.expect} preservado — não virou GREETING`,
    });
  } else if (!dominantOk) {
    leaks.push({
      type: "TEST_EXPECTATION_LEAK",
      detail: `Neighbor guard: esperado ${spec.expect}, got path=${trace.response.responsePathFinal} (não é leak GREETING)`,
    });
  }

  return {
    kind: "negative",
    ...spec,
    context: "anchored",
    ok,
    falseGreeting,
    dominantOk,
    ...trace,
    leaks,
    layers: {
      routerPass: !falseGreeting,
      routingPass: !falseGreeting,
      contractPass: !falseGreeting,
      responsePathPass: !falseGreeting,
      finalResponsePass: ok,
    },
    userPerception: ok ? "SIM" : "NÃO",
    dominantOk,
  };
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function summarizeSubset(records) {
  return {
    total: records.length,
    router: records.filter((r) => r.layers?.routerPass).length,
    routing: records.filter((r) => r.layers?.routingPass).length,
    contract: records.filter((r) => r.layers?.contractPass).length,
    response: records.filter((r) => r.layers?.responsePathPass).length,
    final: records.filter((r) => r.layers?.finalResponsePass).length,
    sim: records.filter((r) => r.userPerception === "SIM").length,
    partial: records.filter((r) => r.userPerception === "PARCIAL").length,
    no: records.filter((r) => r.userPerception === "NÃO").length,
  };
}

function printFlowMap() {
  console.log("── FASE 1 — Mapa do fluxo GREETING ──\n");
  console.log("1. Classificação (lib/miaCognitiveRouter.js PATCH 7.7H / 7.9X-I)");
  console.log("   • detectsNaturalGreetingSignal → signals.isGreeting");
  console.log("   • hasStrongNonGreetingIntent bloqueia greeting em compostos");
  console.log("   • resolveTurnType → CONVERSATIONAL (cold e anchored)");
  console.log("   • Export: isGreetingFamilyQuery(), hasGreetingOpeningPrefix()\n");
  console.log("2. Bridge / Contract");
  console.log("   • CONVERSATIONAL puro → legacy intent pode ser greeting ou search");
  console.log("   • Compostos: intenção dominante vence (não greeting_flow)\n");
  console.log("3. Routing (lib/miaRoutingDecisionContract.js PATCH 7.7H)");
  console.log("   • greeting hold (~624): conversationAct=greeting");
  console.log("   • hint greeting_open (cold) | greeting_anchored (anchor)");
  console.log("   • allowNewSearch=false\n");
  console.log("4. Response Path (pages/api/chat-gpt4o.js PATCH 7.7H)");
  console.log("   • isGreeting | family query | routing hold → limpa directReply");
  console.log("   • intent=greeting → greeting_flow\n");
  console.log("5. Resposta final (lib/miaPrompt.js role greeting_reply)");
  console.log("   • Cold: abertura natural + convite para continuar");
  console.log("   • Anchored: continuidade com produto ancorado\n");
}

printFlowMap();

console.log("PATCH 7.9X-I.1 — GREETING Flow Robustness Audit (AUDIT ONLY)\n");
console.log("HTTP usage: false | SerpAPI risk: false | Production changes: NONE\n");

const pureRecords = [];
for (const group of PURE_GROUPS) {
  for (const phrase of group.phrases) {
    pureRecords.push(evaluatePure(group, phrase, false));
    pureRecords.push(evaluatePure(group, phrase, true));
  }
}

const compoundCommercialRecords = COMPOUND_COMMERCIAL.flatMap((spec) => [
  evaluateCompound(spec, false),
  evaluateCompound(spec, true),
]);
const compoundFamilyRecords = COMPOUND_FAMILY.flatMap((spec) => [
  evaluateCompound(spec, false),
  evaluateCompound(spec, true),
]);
const compoundRecords = [...compoundCommercialRecords, ...compoundFamilyRecords];
const negativeRecords = NEGATIVE_GUARDS.map(evaluateNegative);

const pureStats = summarizeSubset(pureRecords);
const compoundStats = summarizeSubset(compoundRecords);
const negativeStats = summarizeSubset(negativeRecords);

const posTotal = pureRecords.length;
const posRouter = pureStats.router;
const posRouting = pureStats.routing;
const posContract = pureStats.contract;
const posResponse = pureStats.response;
const posFinal = pureStats.final;
const posSim = pureStats.sim;
const posPartial = pureStats.partial;
const posNo = pureStats.no;

const compoundOk = compoundRecords.filter((r) => r.ok).length;
const compoundLeaks = compoundRecords.length - compoundOk;
const negLeaks = negativeRecords.filter((r) => !r.ok).length;

console.log("── FASE 2 — Amostra de leaks (router OK, downstream falhou) ──\n");
for (const r of pureRecords.filter((x) => x.layers?.routerPass && !x.layers?.finalResponsePass).slice(0, 8)) {
  console.log(`[pure/${r.group}/${r.context}] "${r.input}"`);
  console.log(`  ROUTING: act=${r.routing.conversationAct} hint=${r.routing.responsePathHint}`);
  console.log(`  PATH: ${r.response.responsePathFinal}`);
  console.log(
    `  LEAKS: ${r.leaks.filter((l) => l.type !== "ARCHITECTURAL_DESIGN_ACCEPTED").map((l) => l.type).join(", ")}`
  );
  console.log("");
}

console.log(`── FASE 3 — Suite greeting puro (${posTotal} cenários) ──\n`);
console.log("Grp | Ctx | Frase | Rtr | Rtg | Ctr | Path | Final | Perc");
console.log("-".repeat(100));
for (const r of pureRecords) {
  const mark = (ok) => (ok ? "✓" : "✗");
  console.log(
    `${r.group} | ${r.context.padEnd(7)} | ${r.input.slice(0, 24).padEnd(24)} | ${mark(r.layers.routerPass)} | ${mark(r.layers.routingPass)} | ${mark(r.layers.contractPass)} | ${mark(r.layers.responsePathPass)} | ${mark(r.layers.finalResponsePass)} | ${r.userPerception}`
  );
}

console.log(`\n── FASE 3b — Greeting composto (${compoundRecords.length} cenários) ──\n`);
for (const r of compoundRecords) {
  console.log(
    `  ${r.ok ? "✓ OK" : "✗ LEAK"} [${r.group}/${r.context}] "${r.input}" → expect=${r.expect} path=${r.response.responsePathFinal}`
  );
}

console.log(`\n── FASE 3c — Negativos / colisões (${negativeRecords.length} cenários, anchored) ──\n`);
for (const r of negativeRecords) {
  console.log(
    `  ${r.ok ? "✓ OK" : "✗ LEAK"} [${r.group}] "${r.input}" → ${r.classification.turnType}/${r.routing.conversationAct}/${r.response.responsePathFinal}`
  );
}

console.log("\n── FASE 4 — Taxa por camada (greeting puro) ──\n");
console.log(`Cenários greeting puro: ${posTotal}`);
console.log(`Router:           ${posRouter}/${posTotal} (${pct(posRouter, posTotal)}%)`);
console.log(`Routing:          ${posRouting}/${posTotal} (${pct(posRouting, posTotal)}%)`);
console.log(`Bridge/Contract:  ${posContract}/${posTotal} (${pct(posContract, posTotal)}%)`);
console.log(`Response Path:    ${posResponse}/${posTotal} (${pct(posResponse, posTotal)}%)`);
console.log(`Resposta Final:   ${posFinal}/${posTotal} (${pct(posFinal, posTotal)}%)`);
console.log(`Percepção SIM:    ${posSim}/${posTotal} (${pct(posSim, posTotal)}%)`);
console.log(`Percepção PARCIAL:${posPartial}/${posTotal} (${pct(posPartial, posTotal)}%)`);
console.log(`Percepção NÃO:    ${posNo}/${posTotal} (${pct(posNo, posTotal)}%)`);

console.log("\n── Métrica separada: greeting composto ──\n");
console.log(`  Preservação intenção: ${compoundOk}/${compoundRecords.length} (${pct(compoundOk, compoundRecords.length)}%)`);
console.log(`  Greeting swallow leaks: ${compoundLeaks}`);

console.log("\n── Métrica separada: negativos / colisões ──\n");
console.log(`  Clean (não virou GREETING): ${negativeRecords.length - negLeaks}/${negativeRecords.length} (${pct(negativeRecords.length - negLeaks, negativeRecords.length)}%)`);
console.log(`  False greeting leaks: ${negLeaks}`);

console.log("\n── Por contexto (puro: router / routing / full) ──\n");
for (const ctx of ["cold", "anchored"]) {
  const subset = pureRecords.filter((r) => r.context === ctx);
  const s = summarizeSubset(subset);
  console.log(
    `  ${ctx.padEnd(8)}: router ${s.router}/${s.total} (${pct(s.router, s.total)}%) | routing ${s.routing}/${s.total} (${pct(s.routing, s.total)}%) | full ${s.final}/${s.total} (${pct(s.final, s.total)}%)`
  );
}

const leakCounts = {};
for (const r of [...pureRecords, ...compoundRecords, ...negativeRecords]) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
  }
}

console.log("\n── Vazamentos por tipo ──\n");
if (Object.keys(leakCounts).length === 0) {
  console.log("  (nenhum leak real — apenas design aceito)");
} else {
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

const uniquePatterns = new Map();
for (const r of pureRecords) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    const key = `${leak.type}::${leak.detail}`;
    if (!uniquePatterns.has(key)) uniquePatterns.set(key, []);
    uniquePatterns.get(key).push(`[${r.context}] "${r.input}"`);
  }
}

console.log("\n── Causa raiz (padrões únicos — greeting puro) ──\n");
if (uniquePatterns.size === 0) {
  console.log("  (nenhum padrão de leak estrutural)");
} else {
  for (const [key, examples] of uniquePatterns.entries()) {
    const [type, detail] = key.split("::");
    console.log(`  ${type}`);
    console.log(`    ${detail}`);
    console.log(`    Frequência: ${examples.length} | Ex.: ${examples.slice(0, 2).join("; ")}`);
    console.log("");
  }
}

console.log("── Veredito ──\n");
const routerScore = (posRouter / posTotal) * 100;
const routingScore = (posRouting / posTotal) * 100;
const fullScore = (posFinal / posTotal) * 100;
const compoundClean = compoundLeaks === 0;
const negClean = negLeaks === 0;

const routingRobust = routingScore >= 90;
const fullRobust = fullScore >= 90 && compoundClean && negClean;

if (routerScore >= 90 && routingRobust && fullRobust) {
  console.log("A) GREETING FULL STACK ROBUST");
} else {
  console.log("B) GREETING POSSUI GAP FULL STACK");
  if (routerScore >= 90 && !routingRobust) {
    console.log(`   Router ${pct(posRouter, posTotal)}% mas Routing ${pct(posRouting, posTotal)}%.`);
  }
  if (fullScore < 90) {
    console.log(`   Resposta final puro ${pct(posFinal, posTotal)}%.`);
  }
  if (!compoundClean) {
    console.log(`   Greeting composto engoliu intenção em ${compoundLeaks} caso(s).`);
  }
  if (!negClean) {
    console.log(`   Negativos com false greeting: ${negLeaks}.`);
  }
}

console.log("\n── Recomendação (audit-only) ──\n");
if (fullRobust && routingRobust) {
  console.log("Próximo patch sugerido: PATCH 7.9X-J.1 — Acknowledgement Flow Robustness Audit");
} else if (routerScore >= 90 && !routingRobust && fullScore >= 90) {
  console.log("PATCH 7.9X-I.2 — Greeting Routing Hold Authority (se intercept genérico preceder hold)");
} else if (
  pureRecords.some(
    (r) =>
      r.response.responsePathFinal === "context_resolution_direct_reply_early_return" &&
      r.layers?.routerPass
  )
) {
  console.log("Investigar RESPONSE_PATH: directReply institucional precede greeting_flow em cold.");
} else if (routerScore < 90) {
  console.log("PATCH 7.9X-I.x — Greeting Residual Vocabulary (Router) antes de routing patches.");
} else {
  console.log("Seguir camada dominante nos leaks acima.");
}

console.log("\nPATCH 7.9X-I.1 audit COMPLETE — AUDIT ONLY\n");
process.exit(fullRobust && routingRobust && negClean ? 0 : 1);
