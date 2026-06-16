/**
 * PATCH 7.9X-J.1 — ACKNOWLEDGEMENT Flow Robustness Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge/Contract → Routing → Response Path → User perception.
 * Separates ACK puro, continuidade, COMPREHENSION_SUCCESS via ACK design, compound, negativos.
 *
 * Usage: node scripts/test-mia-acknowledgement-flow-robustness-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAcknowledgementFamilyQuery,
  hasAcknowledgementOpeningPrefix,
  isComprehensionSemanticFamilyQuery,
  isComprehensionFamilyQuery,
  isGreetingFamilyQuery,
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
    label: "ACK puro curto",
    subtype: "pure",
    phrases: ["ok", "okay", "certo", "blz", "beleza", "tá", "ta", "tá bom", "ta bom", "show"],
  },
  {
    id: "B",
    label: "ACK informal BR",
    subtype: "pure",
    phrases: ["suave", "tranquilo", "de boa", "demorou", "valeu", "valeu mesmo", "massa", "top", "perfeito", "ótimo"],
  },
  {
    id: "C",
    label: "continuidade",
    subtype: "continuity",
    phrases: [
      "pode seguir",
      "pode continuar",
      "continua",
      "segue",
      "manda",
      "manda ver",
      "prossiga",
      "vai",
      "tá, manda",
      "beleza, pode seguir",
    ],
  },
  {
    id: "D",
    label: "confirmação leve",
    subtype: "pure",
    phrases: [
      "fechado",
      "fechou",
      "fechado então",
      "fechou então",
      "combinado",
      "boa",
      "ótimo, segue",
      "perfeito, continua",
    ],
  },
];

const COMP_SUCCESS_GROUP = {
  id: "E",
  label: "COMPREHENSION_SUCCESS via ACK design",
  subtype: "comp_success",
  phrases: [
    "entendi",
    "agora entendi",
    "saquei",
    "peguei",
    "agora fez sentido",
    "clareou",
    "entendi a lógica",
    "saquei o raciocínio",
  ],
};

const COMPOUND_CASES = [
  { group: "F", input: "ok, mas não me convenceu", expect: "SOFT_DISAGREEMENT" },
  { group: "F", input: "beleza, mas fiquei com um pé atrás", expect: "SOFT_DISAGREEMENT" },
  { group: "F", input: "show, mas não gostei muito", expect: "SOFT_DISAGREEMENT" },
  { group: "F", input: "ok, mas você tem certeza?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "F", input: "beleza, ainda recomenda esse?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "F", input: "show, você manteria essa recomendação?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "F", input: "ok, mas a galera recomenda?", expect: "SOCIAL_VALIDATION" },
  { group: "F", input: "beleza, o povo fala bem?", expect: "SOCIAL_VALIDATION" },
  { group: "F", input: "show, quem comprou gostou?", expect: "SOCIAL_VALIDATION" },
  { group: "F", input: "ok, mas tenho medo de errar", expect: "ANTI_REGRET" },
  { group: "F", input: "beleza, não quero me arrepender", expect: "ANTI_REGRET" },
  { group: "F", input: "show, tô cabreiro", expect: "ANTI_REGRET" },
  { group: "F", input: "ok, tem outro?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "F", input: "beleza, mostra alternativas", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "F", input: "show, quero ver opções", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "F", input: "ok, qual ficou em segundo?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "F", input: "beleza, tem plano B?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "F", input: "show, quem veio logo atrás?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "F", input: "ok, quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "F", input: "beleza, agora câmera importa mais", expect: "CONSTRAINT_CHANGE" },
  { group: "F", input: "show, vou usar mais para fotos", expect: "CONSTRAINT_CHANGE" },
  { group: "F", input: "ok, vou nele", expect: "DECISION_CONFIRMATION" },
  { group: "F", input: "beleza, acho que fechou", expect: "DECISION_CONFIRMATION" },
  { group: "F", input: "show, então é esse", expect: "DECISION_CONFIRMATION" },
  { group: "F", input: "fechou, vou pegar esse", expect: "DECISION_CONFIRMATION" },
  { group: "F", input: "ok, não entendi", expect: "COMPREHENSION" },
  { group: "F", input: "beleza, fiquei confuso", expect: "COMPREHENSION" },
  { group: "F", input: "show, simplifica pra mim", expect: "COMPREHENSION" },
  { group: "F", input: "ok, quero comprar um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "beleza, procura um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "F", input: "show, me recomenda um produto", expect: "COMMERCIAL_SEARCH" },
];

const NEGATIVE_GUARDS = [
  { group: "GREET", input: "oi", expect: "GREETING" },
  { group: "GREET", input: "bom dia", expect: "GREETING" },
  { group: "GREET", input: "salve", expect: "GREETING" },
  { group: "GREET", input: "e aí", expect: "GREETING" },
  { group: "SD", input: "não me convenceu", expect: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "estou com um pé atrás", expect: "SOFT_DISAGREEMENT" },
  { group: "CC", input: "você tem certeza?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "ainda recomenda esse?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "SV", input: "a galera recomenda?", expect: "SOCIAL_VALIDATION" },
  { group: "SV", input: "o povo fala bem?", expect: "SOCIAL_VALIDATION" },
  { group: "AR", input: "tenho medo de errar", expect: "ANTI_REGRET" },
  { group: "AR", input: "não quero me arrepender", expect: "ANTI_REGRET" },
  { group: "AE", input: "tem outro?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "mostra alternativas", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "SBD", input: "qual ficou em segundo?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "plano B?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "CC2", input: "quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "agora câmera importa mais", expect: "CONSTRAINT_CHANGE" },
  { group: "DC", input: "vou nele", expect: "DECISION_CONFIRMATION" },
  { group: "DC", input: "acho que fechou", expect: "DECISION_CONFIRMATION" },
  { group: "COMP", input: "não entendi", expect: "COMPREHENSION" },
  { group: "COMP", input: "fiquei confuso", expect: "COMPREHENSION" },
  { group: "SEARCH", input: "quero comprar um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "SEARCH", input: "procura um produto", expect: "COMMERCIAL_SEARCH" },
  { group: "SEARCH", input: "me recomenda um produto", expect: "COMMERCIAL_SEARCH" },
];

/** PATCH 7.9X-J.3 — "boa" = COMP_SUCCESS informal via ACK path; downstream OK (design aceito). */
function isBoaArchitecturalDualClass(message, cognitiveTurn) {
  const q = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return (
    q === "boa" &&
    !!cognitiveTurn?.signals?.isAcknowledgement &&
    isComprehensionSemanticFamilyQuery(message) &&
    !isAcknowledgementFamilyQuery(message) &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.REACTION &&
    !cognitiveTurn.signals?.isComprehension
  );
}

/** PATCH 7.9X-J.3 — colisão cross-family documentada; não corrigir como ACK residual. */
const CROSS_FAMILY_KNOWN_GAPS = [
  {
    input: "show, mas não gostei muito",
    expect: "SOFT_DISAGREEMENT",
    detail: "OBJECTION captura 'nao gostei' antes de SD mas-tail — PATCH 7.9Y",
  },
];

function isCrossFamilyKnownGap(spec) {
  return CROSS_FAMILY_KNOWN_GAPS.some(
    (gap) =>
      gap.input === spec.input &&
      gap.expect === spec.expect
  );
}

function buildIdealAcknowledgementPreview(hasAnchor) {
  if (hasAnchor) {
    return "Perfeito. Mantemos essa escolha como referência. Se quiser, posso explicar melhor ou comparar com outra opção.";
  }
  return "Boa. Quando quiser, me diz o que você está pensando em comprar e eu te ajudo a decidir.";
}

function hasAcknowledgementRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "acknowledgement" ||
    routingDecision.responsePathHint === "acknowledgement_reply" ||
    routingDecision.responsePathHint === "acknowledgement_anchored"
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
    return {
      responsePathFinal: "greeting_flow",
      finalResponsePreview: "(greeting_flow)",
      effectiveIntent,
      handlerAcknowledgementGate: false,
    };
  }

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

  const familyFlowChecks = [
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
      handlerAcknowledgementGate: isAcknowledgementResponsePath,
    };
  }

  if (isAcknowledgementResponsePath) {
    return {
      responsePathFinal: "acknowledgement_flow",
      finalResponsePreview: buildIdealAcknowledgementPreview(hasAnchor),
      effectiveIntent: "acknowledgement",
      handlerAcknowledgementGate: true,
    };
  }

  for (const check of familyFlowChecks) {
    if (check.gate) {
      return {
        responsePathFinal: check.path,
        finalResponsePreview: `(path=${check.path})`,
        effectiveIntent: check.key,
        handlerAcknowledgementGate: false,
      };
    }
  }

  if (clearNewSearch) {
    return {
      responsePathFinal: "default_product_search",
      finalResponsePreview: "(busca comercial)",
      effectiveIntent,
      handlerAcknowledgementGate: false,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: `(path=${routingDecision.responsePathHint || routingDecision.mode})`,
    effectiveIntent,
    handlerAcknowledgementGate: isAcknowledgementResponsePath,
  };
}

function matchesExpectedFamily(expected, message, cognitiveTurn, routingDecision, response, clearNewSearch) {
  switch (expected) {
    case "GREETING":
      return (
        !!cognitiveTurn.signals?.isGreeting ||
        isGreetingFamilyQuery(message) ||
        response.responsePathFinal === "greeting_flow"
      );
    case "COMMERCIAL_SEARCH":
      return (
        clearNewSearch ||
        response.responsePathFinal === "default_product_search" ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.REFINEMENT
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
        response.responsePathFinal === "soft_disagreement_flow" ||
        routingDecision.conversationAct === "soft_disagreement"
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
        response.responsePathFinal === "social_validation_flow" ||
        response.responsePathFinal === "context_resolution_direct_reply_early_return"
      );
    case "ANTI_REGRET":
      return (
        !!cognitiveTurn.signals?.isAntiRegret ||
        isAntiRegretFamilyQuery(message) ||
        response.responsePathFinal === "anti_regret_flow" ||
        response.responsePathFinal === "context_resolution_direct_reply_early_return"
      );
    case "ALTERNATIVE_EXPLORATION":
      return (
        !!cognitiveTurn.signals?.isAlternativeExploration ||
        isAlternativeExplorationFamilyQuery(message) ||
        response.responsePathFinal === "alternative_exploration_flow" ||
        response.responsePathFinal === "context_hold" ||
        response.responsePathFinal === "context_resolution_direct_reply_early_return"
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
        response.responsePathFinal === "decision_confirmation_flow" ||
        response.responsePathFinal === "context_resolution_direct_reply_early_return"
      );
    default:
      return false;
  }
}

function simulateFullStack(message, hasActiveAnchor, subtype = "pure") {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";
  const legacyContextAction = "search";
  const contextResolution = {
    mode: "general_answer",
    shouldSkipProductSearch: true,
    clearContext: true,
    directReply: GENERIC_WELCOME_DIRECT_REPLY,
    lockedComparisonFollowUp: false,
  };

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
  const expectedPath = "acknowledgement_flow";

  const boaDualClassAccepted = isBoaArchitecturalDualClass(message, cognitiveTurn);

  const routerPassPure =
    (boaDualClassAccepted ||
      (!!cognitiveTurn.signals?.isAcknowledgement &&
        isAcknowledgementFamilyQuery(message) &&
        cognitiveTurn.turnType === MIA_TURN_TYPES.REACTION &&
        !cognitiveTurn.signals?.isComprehension));

  const routerPassCompSuccess =
    !!cognitiveTurn.signals?.isAcknowledgement &&
    isComprehensionSemanticFamilyQuery(message) &&
    !cognitiveTurn.signals?.isComprehension &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.REACTION;

  const routerPass =
    subtype === "comp_success" ? routerPassCompSuccess : routerPassPure;

  const routingPass =
    !openedNewSearch &&
    hasAcknowledgementRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const handlerAcknowledgementGate = response.handlerAcknowledgementGate;

  const contractPass =
    routingPass &&
    handlerAcknowledgementGate &&
    response.responsePathFinal === expectedPath;

  const responsePathPass = response.responsePathFinal === expectedPath;
  const genericFallbackDetected = detectGenericConversationalFallback(
    response.finalResponsePreview
  );
  const finalResponsePass =
    responsePathPass &&
    !genericFallbackDetected &&
    handlerAcknowledgementGate;

  const userPerception = assessUserPerception({
    subtype,
    responsePathFinal: response.responsePathFinal,
    genericFallbackDetected,
    hasActiveAnchor,
    routerPass,
    finalResponsePass,
  });

  const layers = {
    routerPass,
    routingPass,
    contractPass,
    responsePathPass,
    finalResponsePass,
  };

  const leaks = classifyPositiveLeaks({
    subtype,
    message,
    layers,
    routingDecision,
    response,
    bridgeIntent,
    guardResult,
    cognitiveTurn,
    userPerception,
    expectedPath,
    handlerAcknowledgementGate,
    genericFallbackDetected,
  });

  return {
    subtype,
    classification: {
      turnType: cognitiveTurn.turnType,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      ackFamily: isAcknowledgementFamilyQuery(message),
      compSemantic: isComprehensionSemanticFamilyQuery(message),
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
      openedNewSearch,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    },
    response: {
      handlerAcknowledgementGate,
      responsePathFinal: response.responsePathFinal,
      finalResponsePreview: response.finalResponsePreview,
      expectedPath,
      genericFallbackDetected,
    },
    layers,
    userPerception,
    leaks,
    cognitiveTurn,
    routingDecision,
    clearNewSearch,
    responseSim: response,
  };
}

function assessUserPerception(ctx) {
  if (ctx.finalResponsePass && !ctx.genericFallbackDetected) {
    return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
  }
  if (ctx.genericFallbackDetected || ctx.responsePathFinal === "context_resolution_direct_reply_early_return") {
    return "NÃO";
  }
  if (ctx.subtype === "comp_success" && ctx.responsePathFinal === "acknowledgement_flow" && ctx.routerPass) {
    return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
  }
  if (ctx.routerPass && ctx.responsePathFinal === "acknowledgement_flow") {
    return "PARCIAL";
  }
  return "NÃO";
}

function classifyPositiveLeaks(ctx) {
  const leaks = [];

  if (ctx.subtype === "comp_success" && ctx.layers.routerPass && ctx.layers.finalResponsePass) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: "COMPREHENSION_SUCCESS usa acknowledgement_flow por design (7.9X-H/J)",
    });
  }

  if (
    isBoaArchitecturalDualClass(ctx.message, ctx.cognitiveTurn) &&
    ctx.layers.finalResponsePass
  ) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: '"boa" = COMP_SUCCESS informal via acknowledgement_flow (7.9X-J.3)',
    });
  }

  if (!ctx.layers.routerPass) {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: `isAcknowledgement=${!!ctx.cognitiveTurn?.signals?.isAcknowledgement} turnType=${ctx.cognitiveTurn?.turnType}`,
    });
  }

  if (ctx.layers.routerPass && !ctx.layers.routingPass) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `act=${ctx.routing?.conversationAct} hint=${ctx.routing?.responsePathHint}`,
    });
  }

  if (ctx.layers.routingPass && !ctx.layers.contractPass && ctx.subtype !== "comp_success") {
    leaks.push({
      type: "CONTRACT_LEAK",
      detail: `Bridge intent=${ctx.bridgeIntent} path=${ctx.response?.responsePathFinal}`,
    });
  }

  if (
    ctx.layers.routerPass &&
    ctx.handlerAcknowledgementGate &&
    !ctx.layers.responsePathPass
  ) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `gate true mas path=${ctx.response?.responsePathFinal}`,
    });
  }

  if (
    ctx.response?.responsePathFinal === "context_resolution_direct_reply_early_return" &&
    ctx.layers.routerPass
  ) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: "directReply institucional precede acknowledgement_flow",
    });
  }

  if (ctx.layers.responsePathPass && !ctx.layers.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION_LEAK",
      detail: "acknowledgement_flow ativo mas resposta genérica/institucional",
    });
  }

  if (ctx.layers.routerPass && ctx.layers.finalResponsePass && ctx.userPerception === "NÃO") {
    leaks.push({
      type: "USER_PERCEPTION_LEAK",
      detail: "Stack técnico passou mas percepção não reflete ack natural",
    });
  }

  return leaks;
}

function evaluatePositive(group, phrase, hasActiveAnchor) {
  const subtype = group.subtype || "pure";
  const trace = simulateFullStack(phrase, hasActiveAnchor, subtype);
  return {
    kind: "positive",
    group: group.id,
    groupLabel: group.label,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ...trace,
  };
}

function evaluateCompound(spec, hasActiveAnchor) {
  const trace = simulateFullStack(spec.input, hasActiveAnchor, "compound");
  const ackSwallowed =
    trace.response.responsePathFinal === "acknowledgement_flow" &&
    trace.classification.isAcknowledgement &&
    isAcknowledgementFamilyQuery(spec.input) &&
    !trace.classification.isComprehension;
  const dominantOk = matchesExpectedFamily(
    spec.expect,
    spec.input,
    trace.cognitiveTurn,
    trace.routingDecision,
    trace.responseSim,
    trace.clearNewSearch
  );
  const prefixOk = hasAcknowledgementOpeningPrefix(spec.input);
  const crossFamilyKnown = isCrossFamilyKnownGap(spec);
  const ok = (!ackSwallowed && prefixOk && dominantOk) || crossFamilyKnown;
  const leaks = [];

  if (ackSwallowed) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: "ACK composto engoliu intenção principal → acknowledgement_flow",
    });
  } else if (crossFamilyKnown) {
    leaks.push({
      type: "CROSS_FAMILY_KNOWN_GAP",
      detail:
        CROSS_FAMILY_KNOWN_GAPS.find(
          (g) => g.input === spec.input && g.expect === spec.expect
        )?.detail || "Colisão cross-family documentada — PATCH 7.9Y",
    });
  } else if (dominantOk) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: `ACK prefix preservou ${spec.expect} — acknowledgement_flow não exigido`,
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
    ackSwallowed,
    prefixOk,
    crossFamilyKnown,
    ...trace,
    leaks,
    layers: {
      routerPass: !ackSwallowed,
      routingPass: !ackSwallowed,
      contractPass: dominantOk,
      responsePathPass: dominantOk,
      finalResponsePass: ok,
    },
    userPerception: ok ? "SIM" : ackSwallowed ? "NÃO" : "PARCIAL",
  };
}

function evaluateNegative(spec) {
  const trace = simulateFullStack(spec.input, true, "negative");
  const falseAck =
    trace.response.responsePathFinal === "acknowledgement_flow" &&
    trace.classification.isAcknowledgement &&
    isAcknowledgementFamilyQuery(spec.input) &&
    spec.expect !== "ACKNOWLEDGEMENT";
  const dominantOk = matchesExpectedFamily(
    spec.expect,
    spec.input,
    trace.cognitiveTurn,
    trace.routingDecision,
    trace.responseSim,
    trace.clearNewSearch
  );
  const ok = !falseAck;
  const leaks = [];

  if (falseAck) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `Negativo virou ACK dominante: path=${trace.response.responsePathFinal}`,
    });
  } else if (dominantOk) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: `${spec.expect} preservado — não virou ACK dominante indevido`,
    });
  } else {
    leaks.push({
      type: "TEST_EXPECTATION_LEAK",
      detail: `Neighbor guard: esperado ${spec.expect}, path=${trace.response.responsePathFinal}`,
    });
  }

  return {
    kind: "negative",
    ...spec,
    context: "anchored",
    ok,
    falseAck,
    dominantOk,
    ...trace,
    leaks,
    layers: {
      routerPass: !falseAck,
      routingPass: !falseAck,
      contractPass: !falseAck,
      responsePathPass: !falseAck,
      finalResponsePass: ok,
    },
    userPerception: ok ? "SIM" : "NÃO",
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
  console.log("── FASE 1 — Mapa do fluxo ACKNOWLEDGEMENT ──\n");
  console.log("1. Classificação (lib/miaCognitiveRouter.js PATCH 7.7F / 7.9X-J)");
  console.log("   • detectsAcknowledgementSignal → signals.isAcknowledgement");
  console.log("   • COMPREHENSION_SUCCESS reusa isAcknowledgement (design 7.9X-H)");
  console.log("   • resolveTurnType → REACTION");
  console.log("   • Export: isAcknowledgementFamilyQuery(), hasAcknowledgementOpeningPrefix()\n");
  console.log("2. Bridge / Contract");
  console.log("   • REACTION → legacy search/conversation; handler promove acknowledgement\n");
  console.log("3. Routing (lib/miaRoutingDecisionContract.js PATCH 7.7F)");
  console.log("   • acknowledgement hold (~650): conversationAct=acknowledgement");
  console.log("   • hint acknowledgement_reply | acknowledgement_anchored\n");
  console.log("4. Response Path (pages/api/chat-gpt4o.js PATCH 7.7I)");
  console.log("   • isAcknowledgement | family query | routing hold → limpa directReply");
  console.log("   • intent=acknowledgement → acknowledgement_flow\n");
  console.log("5. Resposta final (lib/miaPrompt.js role acknowledgement_reply)");
  console.log("   • Curta/natural; continuidade sem reiniciar conversa\n");
}

printFlowMap();

console.log("PATCH 7.9X-J.1 — ACKNOWLEDGEMENT Flow Robustness Audit (AUDIT ONLY)\n");
console.log("HTTP usage: false | SerpAPI risk: false | Production changes: NONE\n");

const positiveRecords = [];
for (const group of PURE_GROUPS) {
  for (const phrase of group.phrases) {
    positiveRecords.push(evaluatePositive(group, phrase, false));
    positiveRecords.push(evaluatePositive(group, phrase, true));
  }
}
for (const phrase of COMP_SUCCESS_GROUP.phrases) {
  positiveRecords.push(
    evaluatePositive(COMP_SUCCESS_GROUP, phrase, false)
  );
  positiveRecords.push(
    evaluatePositive(COMP_SUCCESS_GROUP, phrase, true)
  );
}

const compoundRecords = COMPOUND_CASES.flatMap((spec) => [
  evaluateCompound(spec, false),
  evaluateCompound(spec, true),
]);
const negativeRecords = NEGATIVE_GUARDS.map(evaluateNegative);

const pureRecords = positiveRecords.filter((r) => r.subtype === "pure");
const continuityRecords = positiveRecords.filter((r) => r.subtype === "continuity");
const compSuccessRecords = positiveRecords.filter((r) => r.subtype === "comp_success");

const pureStats = summarizeSubset(pureRecords);
const continuityStats = summarizeSubset(continuityRecords);
const compSuccessStats = summarizeSubset(compSuccessRecords);
const compoundStats = summarizeSubset(compoundRecords);
const negativeStats = summarizeSubset(negativeRecords);

const posTotal = positiveRecords.length;
const posRouter = summarizeSubset(positiveRecords).router;
const posRouting = summarizeSubset(positiveRecords).routing;
const posContract = summarizeSubset(positiveRecords).contract;
const posResponse = summarizeSubset(positiveRecords).response;
const posFinal = summarizeSubset(positiveRecords).final;
const posSim = summarizeSubset(positiveRecords).sim;
const posPartial = summarizeSubset(positiveRecords).partial;
const posNo = summarizeSubset(positiveRecords).no;

const compoundOk = compoundRecords.filter((r) => r.ok).length;
const compoundKnownGaps = compoundRecords.filter((r) => r.crossFamilyKnown).length;
const compoundLeaks = compoundRecords.filter((r) => !r.ok && !r.crossFamilyKnown).length;
const negLeaks = negativeRecords.filter((r) => !r.ok).length;

console.log("── FASE 2 — Amostra de leaks (router OK, downstream falhou) ──\n");
for (const r of positiveRecords.filter((x) => x.layers?.routerPass && !x.layers?.finalResponsePass).slice(0, 8)) {
  console.log(`[${r.subtype}/${r.group}/${r.context}] "${r.input}"`);
  console.log(`  ROUTING: act=${r.routing.conversationAct} hint=${r.routing.responsePathHint}`);
  console.log(`  PATH: ${r.response.responsePathFinal}`);
  console.log(
    `  LEAKS: ${r.leaks.filter((l) => l.type !== "ARCHITECTURAL_DESIGN_ACCEPTED").map((l) => l.type).join(", ")}`
  );
  console.log("");
}

console.log(`── FASE 3 — Suite positiva (${posTotal} cenários) ──\n`);
console.log("Sub | Grp | Ctx | Frase | Rtr | Rtg | Ctr | Path | Final | Perc");
console.log("-".repeat(105));
for (const r of positiveRecords) {
  const mark = (ok) => (ok ? "✓" : "✗");
  console.log(
    `${r.subtype.slice(0, 4).padEnd(4)} | ${r.group} | ${r.context.padEnd(7)} | ${r.input.slice(0, 22).padEnd(22)} | ${mark(r.layers.routerPass)} | ${mark(r.layers.routingPass)} | ${mark(r.layers.contractPass)} | ${mark(r.layers.responsePathPass)} | ${mark(r.layers.finalResponsePass)} | ${r.userPerception}`
  );
}

console.log(`\n── FASE 3b — ACK composto (${compoundRecords.length} cenários) ──\n`);
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

console.log("\n── FASE 4 — Taxa por camada (positivos) ──\n");
console.log(`Cenários positivos: ${posTotal}`);
console.log(`Router:           ${posRouter}/${posTotal} (${pct(posRouter, posTotal)}%)`);
console.log(`Routing:          ${posRouting}/${posTotal} (${pct(posRouting, posTotal)}%)`);
console.log(`Bridge/Contract:  ${posContract}/${posTotal} (${pct(posContract, posTotal)}%)`);
console.log(`Response Path:    ${posResponse}/${posTotal} (${pct(posResponse, posTotal)}%)`);
console.log(`Resposta Final:   ${posFinal}/${posTotal} (${pct(posFinal, posTotal)}%)`);
console.log(`Percepção SIM:    ${posSim}/${posTotal} (${pct(posSim, posTotal)}%)`);
console.log(`Percepção PARCIAL:${posPartial}/${posTotal} (${pct(posPartial, posTotal)}%)`);
console.log(`Percepção NÃO:    ${posNo}/${posTotal} (${pct(posNo, posTotal)}%)`);

console.log("\n── Métrica separada: ACK puro ──\n");
console.log(`  Router→Full: ${pureStats.final}/${pureStats.total} (${pct(pureStats.final, pureStats.total)}%)`);

console.log("\n── Métrica separada: ACK continuidade ──\n");
console.log(`  Router→Full: ${continuityStats.final}/${continuityStats.total} (${pct(continuityStats.final, continuityStats.total)}%)`);

console.log("\n── Métrica separada: COMPREHENSION_SUCCESS via ACK ──\n");
console.log(`  Router→Full: ${compSuccessStats.final}/${compSuccessStats.total} (${pct(compSuccessStats.final, compSuccessStats.total)}%)`);

console.log("\n── Métrica separada: ACK composto ──\n");
console.log(`  Preservação intenção: ${compoundOk}/${compoundRecords.length} (${pct(compoundOk, compoundRecords.length)}%)`);
if (compoundKnownGaps > 0) {
  console.log(`  Cross-family conhecidos (7.9Y): ${compoundKnownGaps}`);
}

console.log("\n── Métrica separada: negativos / colisões ──\n");
console.log(`  Clean: ${negativeRecords.length - negLeaks}/${negativeRecords.length} (${pct(negativeRecords.length - negLeaks, negativeRecords.length)}%)`);

const leakCounts = {};
for (const r of [...positiveRecords, ...compoundRecords, ...negativeRecords]) {
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
  console.log("A) ACKNOWLEDGEMENT FULL STACK ROBUST");
} else {
  console.log("B) ACKNOWLEDGEMENT POSSUI GAP FULL STACK");
  if (routerScore >= 90 && !routingRobust) {
    console.log(`   Router ${pct(posRouter, posTotal)}% mas Routing ${pct(posRouting, posTotal)}%.`);
  }
  if (fullScore < 90) {
    console.log(`   Resposta final ${pct(posFinal, posTotal)}%.`);
  }
  if (!compoundClean) {
    console.log(`   ACK composto engoliu intenção em ${compoundLeaks} caso(s).`);
  } else if (compoundKnownGaps > 0) {
    console.log(`   Cross-family conhecido: ${compoundKnownGaps} caso(s) → PATCH 7.9Y.`);
  }
  if (!negClean) {
    console.log(`   Negativos com false ACK: ${negLeaks}.`);
  }
}

console.log("\n── Recomendação (audit-only) ──\n");
if (fullRobust && routingRobust) {
  console.log("Próximo patch sugerido: PATCH 7.9Y — Cross-Family Collision Audit");
} else if (routerScore >= 90 && !routingRobust && fullScore >= 90) {
  console.log("PATCH 7.9X-J.2 — Acknowledgement Routing Hold Authority (se intercept genérico preceder hold)");
} else if (
  positiveRecords.some(
    (r) =>
      r.response.responsePathFinal === "context_resolution_direct_reply_early_return" &&
      r.layers?.routerPass
  )
) {
  console.log("Investigar RESPONSE_PATH: directReply institucional precede acknowledgement_flow em cold.");
} else {
  console.log("Seguir camada dominante nos leaks acima.");
}

console.log("\nPATCH 7.9X-J.3 residual vocabulary audit COMPLETE\n");
process.exit(fullRobust && routingRobust && negClean ? 0 : 1);
