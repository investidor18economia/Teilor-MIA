/**
 * PATCH 7.9X — Semantic Robustness Audit (AUDIT ONLY)
 *
 * Measures whether conversational families understand human intent
 * or only match phrase shapes from original closure audits.
 *
 * Usage: node scripts/test-mia-semantic-robustness-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isDecisionConfirmationFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isConstraintChangeFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isGreetingFamilyQuery,
  isAcknowledgementFamilyQuery,
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

const ROBUSTNESS_FAMILIES = [
  {
    id: "GREETING",
    fullyClosed: true,
    signalKey: "isGreeting",
    detector: isGreetingFamilyQuery,
    conversationAct: "greeting",
    responseFlow: "greeting_flow",
    responseHints: ["greeting_reply", "greeting_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    phrases: [
      "oii",
      "e aí",
      "eai",
      "fala aí",
      "boa madrugada",
      "mia",
      "ei mia",
      "cadê você",
      "alguém aí?",
      "chega mais",
      "bora conversar?",
      "posso perguntar uma coisa?",
      "tudo certo por aí?",
      "como você tá?",
      "salve mia",
      "oi mia",
    ],
  },
  {
    id: "ACKNOWLEDGEMENT",
    fullyClosed: true,
    signalKey: "isAcknowledgement",
    detector: isAcknowledgementFamilyQuery,
    conversationAct: "acknowledgement",
    responseFlow: "acknowledgement_flow",
    responseHints: ["acknowledgement_reply", "acknowledgement_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.REACTION]),
    anchoredTurnTypes: new Set([MIA_TURN_TYPES.REACTION]),
    phrases: [
      "okay",
      "tá",
      "pode seguir",
      "continua",
      "manda ver",
      "de boa",
      "demorou",
      "valeu mesmo",
      "fechou então",
      "suave",
      "tranquilo",
      "prossiga",
      "ta certo",
      "beleza, pode seguir",
      "ok, continua",
      "tá, manda",
    ],
  },
  {
    id: "DECISION_CONFIRMATION",
    fullyClosed: true,
    signalKey: "isDecisionConfirmation",
    detector: isDecisionConfirmationFamilyQuery,
    conversationAct: "decision_confirmation",
    responseFlow: "decision_confirmation_flow",
    responseHints: ["decision_confirmation_reply", "decision_confirmation_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([
      MIA_TURN_TYPES.FOLLOW_UP,
      MIA_TURN_TYPES.CONTEXT_DECISION,
      MIA_TURN_TYPES.REACTION,
    ]),
    phrases: [
      "acho que vou nele então",
      "acho que vou ficar com esse",
      "esse deve ser o escolhido",
      "tô inclinado a pegar esse",
      "acho que fechou",
      "então esse é o caminho",
      "parece que é esse mesmo",
      "vou seguir nessa escolha",
    ],
  },
  {
    id: "ANTI_REGRET",
    fullyClosed: true,
    signalKey: "isAntiRegret",
    detector: isAntiRegretFamilyQuery,
    conversationAct: "anti_regret",
    responseFlow: "anti_regret_flow",
    responseHints: ["anti_regret_reply", "anti_regret_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([MIA_TURN_TYPES.OBJECTION]),
    phrases: [
      "quero evitar dor de cabeça",
      "não quero errar nessa compra",
      "não quero fazer besteira",
      "não quero escolher mal",
      "quero uma escolha tranquila",
      "quero algo que não me incomode depois",
      "tenho medo de escolher errado",
      "não quero me frustrar depois",
      "é muito dinheiro pra mim",
      "tô cabreiro",
      "tô com receio",
      "não quero jogar dinheiro fora",
      "quero ficar tranquilo depois da compra",
      "será que eu vou me arrepender?",
      "não sei se é seguro ir nesse",
      "acho que vou nele, mas tenho medo de errar",
    ],
  },
  {
    id: "CONFIDENCE_CHALLENGE",
    fullyClosed: true,
    signalKey: "isConfidenceChallenge",
    detector: isConfidenceChallengeFamilyQuery,
    conversationAct: "confidence_challenge",
    responseFlow: "confidence_challenge_flow",
    responseHints: ["confidence_challenge_reply", "confidence_challenge_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([MIA_TURN_TYPES.EXPLANATION_REQUEST]),
    phrases: [
      "você revisaria essa decisão?",
      "isso continua valendo?",
      "não mudou sua opinião?",
      "você manteria essa recomendação?",
      "ainda acha isso?",
      "ainda iria nele?",
      "essa decisão se mantém?",
      "você sustenta essa escolha?",
      "continua achando isso?",
      "ainda recomenda esse?",
      "dá pra confiar nessa escolha?",
      "você compraria mesmo?",
      "não está forçando a barra?",
      "esse ainda é o melhor mesmo?",
      "você bateria o martelo nisso?",
      "pode ir sem medo?",
    ],
  },
  {
    id: "SOCIAL_VALIDATION",
    fullyClosed: true,
    signalKey: "isSocialValidation",
    detector: isSocialValidationFamilyQuery,
    conversationAct: "social_validation",
    responseFlow: "social_validation_flow",
    responseHints: ["social_validation_reply", "social_validation_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([
      MIA_TURN_TYPES.VALUE_QUESTION,
      MIA_TURN_TYPES.EXPLANATION_REQUEST,
    ]),
    phrases: [
      "tem boa fama?",
      "a galera costuma recomendar?",
      "o povo fala bem?",
      "é bem aceito?",
      "costuma agradar quem compra?",
      "quem tem costuma gostar?",
      "tem muita reclamação?",
      "as pessoas aprovam essa escolha?",
      "donos costumam elogiar?",
      "na prática o pessoal gosta?",
      "reclamam muito dele?",
      "a maioria aprova?",
      "quem comprou se arrepende?",
      "é confiável na prática?",
      "geral gosta?",
      "tem boa reputação?",
    ],
  },
  {
    id: "SECOND_BEST_DISCOVERY",
    fullyClosed: true,
    signalKey: "isSecondBestDiscovery",
    detector: isSecondBestDiscoveryFamilyQuery,
    conversationAct: "second_best_discovery",
    responseFlow: "second_best_discovery_flow",
    responseHints: ["second_best_discovery_reply", "second_best_discovery_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([
      MIA_TURN_TYPES.REFINEMENT,
      MIA_TURN_TYPES.FOLLOW_UP,
      MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    ]),
    phrases: [
      "quem veio logo atrás?",
      "qual seria a reserva?",
      "quem ficou por pouco?",
      "qual seria o backup?",
      "quem perdeu por pouco?",
      "se o primeiro sair, qual fica?",
      "quem seria o reserva?",
      "qual é o substituto direto?",
    ],
  },
  {
    id: "ALTERNATIVE_EXPLORATION",
    fullyClosed: true,
    signalKey: "isAlternativeExploration",
    detector: isAlternativeExplorationFamilyQuery,
    conversationAct: "alternative_exploration",
    responseFlow: "alternative_exploration_flow",
    responseHints: ["alternative_exploration_reply", "alternative_exploration_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([
      MIA_TURN_TYPES.OBJECTION,
      MIA_TURN_TYPES.REFINEMENT,
      MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
    ]),
    phrases: [
      "quero abrir um pouco as opções",
      "o que mais existe nessa linha?",
      "tem mais possibilidades?",
      "quero olhar alternativas",
      "quero explorar outras opções",
      "dá pra ver mais caminhos?",
      "não quero decidir sem ver outras opções",
      "me mostra possibilidades parecidas",
    ],
  },
  {
    id: "COMPREHENSION",
    fullyClosed: true,
    signalKey: "isComprehension",
    detector: isComprehensionSemanticFamilyQuery,
    conversationAct: "comprehension",
    responseFlow: "comprehension_flow",
    responseHints: ["comprehension_reply", "comprehension_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL, MIA_TURN_TYPES.REACTION]),
    anchoredTurnTypes: new Set([
      MIA_TURN_TYPES.EXPLANATION_REQUEST,
      MIA_TURN_TYPES.REACTION,
    ]),
    phrases: [
      "agora entendi",
      "agora fez sentido",
      "saquei o raciocínio",
      "entendi a lógica",
      "boa, clareou",
      "agora ficou claro",
      "tá, peguei",
      "ahh entendi",
      "agora caiu a ficha",
      "entendi o motivo",
      "faz sentido mesmo",
      "agora ficou mais claro",
      "agora conectei os pontos",
      "show, saquei",
      "bem explicado",
      "agora entendi o caminho",
    ],
  },
  {
    id: "SOFT_DISAGREEMENT",
    fullyClosed: true,
    signalKey: "isSoftDisagreement",
    detector: isSoftDisagreementFamilyQuery,
    conversationAct: "soft_disagreement",
    responseFlow: "soft_disagreement_flow",
    responseHints: ["soft_disagreement_reply", "soft_disagreement_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([MIA_TURN_TYPES.OBJECTION]),
    phrases: [
      "não me convenceu muito",
      "não sei se concordo",
      "ainda estou com um pé atrás",
      "não achei isso tão forte assim",
      "não estou comprando muito essa ideia",
      "não me passou tanta confiança",
      "continuo meio na dúvida",
      "não bateu muito comigo",
      "não senti firmeza",
      "não me ganhou ainda",
      "achei meio fraco",
      "faz sentido mas ainda tenho dúvida",
      "não curti muito não",
      "não me desceu muito bem",
      "tenho minhas dúvidas",
      "não estou tão convencido",
    ],
  },
  {
    id: "CONSTRAINT_CHANGE",
    fullyClosed: false,
    routingPending: true,
    responsePending: true,
    signalKey: "isConstraintChange",
    detector: isConstraintChangeFamilyQuery,
    conversationAct: "constraint_change",
    responseFlow: "constraint_change_flow",
    responseHints: ["constraint_change_reply", "constraint_change_anchored"],
    coldTurnTypes: new Set([MIA_TURN_TYPES.CONVERSATIONAL]),
    anchoredTurnTypes: new Set([MIA_TURN_TYPES.PRIORITY_SHIFT]),
    phrases: [
      "tá puxado",
      "pesou no bolso",
      "ficou caro pra mim",
      "quero algo mais em conta",
      "pensei melhor e quero gastar menos",
      "câmera virou prioridade",
      "agora bateria importa mais",
      "preciso priorizar autonomia",
      "vou jogar mais",
      "meu uso mudou",
      "agora o foco é outro",
      "câmera não importa tanto",
      "posso sacrificar desempenho",
      "minha prioridade mudou",
      "gostei dele, mas quero gastar menos",
      "parece certo, mas meu foco mudou",
    ],
  },
];

const CROSS_FAMILY_COLLISION_GUARDS = [
  {
    input: "acho que vou nele então, mas tem outro?",
    expectedDominant: "alternative_exploration",
    note: "DECISION_CONFIRMATION tail must not swallow AE",
  },
  {
    input: "quero evitar dor de cabeça, mas o pessoal gosta?",
    expectedDominant: "anti_regret",
    note: "ANTI_REGRET should beat SOCIAL_VALIDATION tail",
  },
  {
    input: "você manteria essa recomendação ou tem plano b?",
    expectedDominant: "second_best_discovery",
    note: "CONFIDENCE_CHALLENGE vs SECOND_BEST_DISCOVERY collision",
  },
  {
    input: "quem compra se arrepende?",
    expectedDominant: "social_validation",
    note: "SOCIAL_VALIDATION vs ANTI_REGRET framing",
  },
  {
    input: "tem outro ou quem ficou em segundo?",
    expectedDominant: "alternative_exploration",
    note: "AE vs SBD — first alternative wins or explicit second",
  },
  {
    input: "quero algo mais barato, tem outro?",
    expectedDominant: "alternative_exploration",
    note: "CONSTRAINT_CHANGE vs AE/price refinement",
  },
  {
    input: "qual seria o backup se eu gastar menos?",
    expectedDominant: "second_best_discovery",
    note: "SBD vs CONSTRAINT_CHANGE",
  },
  {
    input: "a câmera virou prioridade, compara com samsung?",
    expectedDominant: "comparison",
    note: "CONSTRAINT_CHANGE vs explicit comparison",
  },
];

function normalizeQuery(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function classifyRobustness(score) {
  if (score >= 90) return "ROBUST";
  if (score >= 80) return "ACCEPTABLE BUT WATCH";
  if (score >= 60) return "FRAGILE";
  return "VOCABULARY DEPENDENT";
}

function hasRoutingHold(family, routingDecision) {
  const hint = String(routingDecision.responsePathHint || "");
  const baseHold =
    routingDecision.conversationAct === family.conversationAct ||
    hint.startsWith(family.conversationAct) ||
    family.responseHints.some((h) => hint === h || hint.startsWith(h));

  // PATCH 7.9X-H — positive comprehension preserves acknowledgement routing hold
  if (
    family.id === "COMPREHENSION" &&
    routingDecision.conversationAct === "acknowledgement"
  ) {
    return true;
  }

  return baseHold;
}

function simulatePipeline(message, hasActiveAnchor, options = {}) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";
  const legacyContextAction = "search";
  const isExplicitComparison = options.isExplicitComparison ?? false;

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: legacyIntent,
    contextAction: legacyContextAction,
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
    isExplicitComparison,
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
      directReply: GENERIC_WELCOME_DIRECT_REPLY,
      clearContext: !hasActiveAnchor,
    },
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
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    routingDecision.allowNewSearch === true ||
    (routingDecision.mode === "search" && routingDecision.allowNewSearch === true);

  const anchorPreserved =
    !hasActiveAnchor ||
    (routingDecision.shouldPreserveAnchor === true &&
      routingDecision.anchorProduct?.product_name === MOCK_WINNER.product_name);

  const winnerChanged =
    hasActiveAnchor &&
    (routingDecision.allowReplaceWinner === true ||
      (routingDecision.shouldPreserveAnchor === false && !anchorPreserved));

  return {
    cognitiveTurn,
    bridgeAudit,
    guardResult,
    routingDecision,
    openedNewSearch,
    anchorPreserved,
    winnerChanged,
  };
}

function simulateResponsePath(family, pipeline, hasActiveAnchor, message) {
  const { cognitiveTurn, routingDecision, openedNewSearch } = pipeline;

  if (openedNewSearch) {
    return {
      responsePathFinal: "default_product_search",
      genericFallbackDetected: false,
    };
  }

  const signalOn = !!cognitiveTurn.signals?.[family.signalKey];
  const routingHold = hasRoutingHold(family, routingDecision);

  if (
    signalOn ||
    family.detector(message) ||
    routingHold
  ) {
    return {
      responsePathFinal: family.responseFlow,
      genericFallbackDetected: false,
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    genericFallbackDetected: false,
  };
}

function collectActiveFamilies(cognitiveTurn, message) {
  const active = [];
  for (const family of ROBUSTNESS_FAMILIES) {
    if (cognitiveTurn.signals?.[family.signalKey] || family.detector(message)) {
      active.push(family.id);
    }
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.COMPARISON) active.push("COMPARISON");
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH) active.push("NEW_SEARCH");
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION && !active.includes("ANTI_REGRET")) {
    active.push("OBJECTION(partial)");
  }
  return [...new Set(active)];
}

function inferDominantIntent(cognitiveTurn, routingDecision, message) {
  if (routingDecision.conversationAct) return routingDecision.conversationAct;
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.COMPARISON) return "comparison";
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH) return "new_search";

  const order = [
    "greeting",
    "acknowledgement",
    "alternative_exploration",
    "second_best_discovery",
    "constraint_change",
    "anti_regret",
    "confidence_challenge",
    "social_validation",
    "comprehension",
    "soft_disagreement",
    "decision_confirmation",
  ];

  for (const act of order) {
    const family = ROBUSTNESS_FAMILIES.find((f) => f.conversationAct === act);
    if (family && (cognitiveTurn.signals?.[family.signalKey] || family.detector(message))) {
      return act;
    }
  }

  return cognitiveTurn.turnType?.toLowerCase() || "unknown";
}

function evaluateRobustnessCase(family, message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor, {
    isExplicitComparison: /compar|samsung|versus|\bvs\b/i.test(message),
  });
  const responsePath = simulateResponsePath(family, pipeline, hasActiveAnchor, message);
  const signals = pipeline.cognitiveTurn.signals || {};

  const routerPass =
    signals[family.signalKey] === true || family.detector(message) === true;

  const turnOk = hasActiveAnchor
    ? family.anchoredTurnTypes.has(pipeline.cognitiveTurn.turnType) ||
      routerPass
    : family.coldTurnTypes.has(pipeline.cognitiveTurn.turnType) || routerPass;

  const routerIntentionPass = routerPass && turnOk && pipeline.cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  let routingPass = null;
  let contractPass = null;
  let responsePathPass = null;
  let finalResponsePass = null;

  if (family.fullyClosed) {
    routingPass =
      !pipeline.openedNewSearch &&
      (hasActiveAnchor ? pipeline.anchorPreserved && !pipeline.winnerChanged : true) &&
      hasRoutingHold(family, pipeline.routingDecision);

    contractPass =
      routingPass &&
      pipeline.guardResult.contextAction !== "search" &&
      hasRoutingHold(family, pipeline.routingDecision) &&
      (family.id !== "ANTI_REGRET" ||
        (pipeline.bridgeAudit?.toIntent === "anti_regret" &&
          pipeline.guardResult.contextAction === "anti_regret"));

    responsePathPass = responsePath.responsePathFinal === family.responseFlow;
    finalResponsePass =
      responsePathPass && !responsePath.genericFallbackDetected;
  }

  const activeFamilies = collectActiveFamilies(pipeline.cognitiveTurn, message);

  return {
    kind: "robustness",
    family: family.id,
    input: message,
    context: hasActiveAnchor ? "anchored" : "cold",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    activeFamilies,
    routerPass: routerIntentionPass,
    routingPass,
    contractPass,
    responsePathPass,
    finalResponsePass,
    openedNewSearch: pipeline.openedNewSearch,
    anchorPreserved: pipeline.anchorPreserved,
    winnerChanged: pipeline.winnerChanged,
    genericFallbackDetected: responsePath.genericFallbackDetected,
    conversationAct: pipeline.routingDecision.conversationAct || "",
    responsePathFinal: responsePath.responsePathFinal,
    signalDetected: !!signals[family.signalKey],
    detectorMatch: family.detector(message),
    routingPending: !!family.routingPending,
    responsePending: !!family.responsePending,
  };
}

function evaluateCollisionCase(spec) {
  const hasActiveAnchor = true;
  const pipeline = simulatePipeline(spec.input, hasActiveAnchor, {
    isExplicitComparison: /compar|samsung|versus|\bvs\b/i.test(spec.input),
  });
  const dominant = inferDominantIntent(
    pipeline.cognitiveTurn,
    pipeline.routingDecision,
    spec.input
  );
  const activeFamilies = collectActiveFamilies(pipeline.cognitiveTurn, spec.input);
  const collisionDetected = activeFamilies.length > 1;
  const dominantMatches = dominant === spec.expectedDominant;

  return {
    kind: "collision_guard",
    input: spec.input,
    expectedDominant: spec.expectedDominant,
    actualDominant: dominant,
    note: spec.note,
    turnType: pipeline.cognitiveTurn.turnType,
    activeFamilies,
    collisionDetected,
    dominantMatches,
    conversationAct: pipeline.routingDecision.conversationAct || "",
    openedNewSearch: pipeline.openedNewSearch,
  };
}

function summarizeFamily(records, familyId) {
  const rows = records.filter((r) => r.family === familyId);
  const cold = rows.filter((r) => r.context === "cold");
  const anchored = rows.filter((r) => r.context === "anchored");
  const fullyClosed = rows[0]?.routingPending !== true;

  const routerPass = rows.filter((r) => r.routerPass).length;
  const routingPass = fullyClosed ? rows.filter((r) => r.routingPass).length : null;
  const contractPass = fullyClosed ? rows.filter((r) => r.contractPass).length : null;
  const responsePathPass = fullyClosed ? rows.filter((r) => r.responsePathPass).length : null;
  const finalResponsePass = fullyClosed ? rows.filter((r) => r.finalResponsePass).length : null;

  const routerScore = (routerPass / rows.length) * 100;
  const routingScore = fullyClosed ? (routingPass / rows.length) * 100 : null;
  const fullStackScore = fullyClosed ? (finalResponsePass / rows.length) * 100 : null;

  return {
    family: familyId,
    total: rows.length,
    coldTotal: cold.length,
    anchoredTotal: anchored.length,
    coldRouterPass: cold.filter((r) => r.routerPass).length,
    anchoredRouterPass: anchored.filter((r) => r.routerPass).length,
    routerPass,
    routingPass,
    contractPass,
    responsePathPass,
    finalResponsePass,
    newSearchLeaks: rows.filter((r) => r.openedNewSearch).length,
    anchorLoss: rows.filter((r) => r.context === "anchored" && !r.anchorPreserved).length,
    winnerChange: rows.filter((r) => r.winnerChanged).length,
    genericFallbackHits: rows.filter((r) => r.genericFallbackDetected).length,
    routerIntentionScore: routerScore,
    routingBehaviorScore: routingScore,
    fullStackScore,
    classification: classifyRobustness(routerScore),
    failedPhrases: [
      ...new Set(rows.filter((r) => !r.routerPass).map((r) => r.input)),
    ],
    routingPending: rows[0]?.routingPending === true,
    responsePending: rows[0]?.responsePending === true,
  };
}

console.log("\nPATCH 7.9X — Semantic Robustness Audit (AUDIT ONLY)\n");
console.log("Includes post-7.9X-D.4 ANTI_REGRET router expansion B/C and post-7.9X-D.3 bridge contract alignment validation.\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Production files touched: NONE\n");

console.log("── Human context ──\n");
console.log(
  "Este audit mede se a MIA aprendeu a intenção humana ou se apenas decorou a forma das frases usadas nos testes originais."
);
console.log(
  "Cada família usa frases novas, informais e com estrutura diferente das audits de fechamento.\n"
);

console.log("Esta frase representa uma nova intenção humana ou apenas uma nova forma de expressar uma intenção já conhecida?");
console.log("→ Todas as frases deste audit são novas formas de intenções já conhecidas.\n");

const robustnessRecords = [];
for (const family of ROBUSTNESS_FAMILIES) {
  for (const phrase of family.phrases) {
    robustnessRecords.push(evaluateRobustnessCase(family, phrase, false));
    robustnessRecords.push(evaluateRobustnessCase(family, phrase, true));
  }
}

const collisionRecords = CROSS_FAMILY_COLLISION_GUARDS.map(evaluateCollisionCase);

const familySummaries = ROBUSTNESS_FAMILIES.map((f) =>
  summarizeFamily(robustnessRecords, f.id)
);

const totalTests = robustnessRecords.length + collisionRecords.length;
const totalRobustness = robustnessRecords.length;

const overallRouterPass = robustnessRecords.filter((r) => r.routerPass).length;
const closedRecords = robustnessRecords.filter((r) => !r.routingPending);
const overallRoutingPass = closedRecords.filter((r) => r.routingPass).length;
const overallFinalPass = closedRecords.filter((r) => r.finalResponsePass).length;

const coldRecords = robustnessRecords.filter((r) => r.context === "cold");
const anchoredRecords = robustnessRecords.filter((r) => r.context === "anchored");

const overallRouterScore = (overallRouterPass / totalRobustness) * 100;
const overallRoutingScore = (overallRoutingPass / closedRecords.length) * 100;
const overallFullStackScore = (overallFinalPass / closedRecords.length) * 100;

const sortedByRouter = [...familySummaries].sort(
  (a, b) => b.routerIntentionScore - a.routerIntentionScore
);
const mostRobust = sortedByRouter[0];
const mostFragile = sortedByRouter[sortedByRouter.length - 1];

console.log("── Per-family robustness ──\n");
for (const s of familySummaries) {
  const pendingNote = s.routingPending
    ? " | Routing/Response path pending by roadmap"
    : "";
  console.log(
    `  ${s.family}: router=${pct(s.routerPass, s.total)}% (${s.routerPass}/${s.total})` +
      (s.routingBehaviorScore != null
        ? ` | routing=${pct(s.routingPass, s.total)}% | full_stack=${pct(s.finalResponsePass, s.total)}%`
        : "") +
      ` | ${s.classification}${pendingNote}`
  );
}

console.log("\n── Per-case (failures only) ──\n");
for (const r of robustnessRecords.filter((x) => !x.routerPass)) {
  console.log(
    `  ✗ [${r.context}] ${r.family} "${r.input}" → ${r.actualTurnType} | active=[${r.activeFamilies.join(",")}] | signal=${r.signalDetected} detector=${r.detectorMatch} | act=${r.conversationAct} newSearch=${r.openedNewSearch}`
  );
}
if (!robustnessRecords.some((r) => !r.routerPass)) {
  console.log("  (none — all router intention passes)");
}

console.log("\n── Cross-family collision guards ──\n");
for (const r of collisionRecords) {
  console.log(
    `  ${r.dominantMatches ? "✓" : "✗"} "${r.input}" → dominant=${r.actualDominant} (expected=${r.expectedDominant}) | active=[${r.activeFamilies.join(",")}] | turn=${r.turnType} | ${r.note}`
  );
}

console.log("\n── Dependency signals ──\n");
const ccFailures = robustnessRecords.filter(
  (r) => r.family === "CONSTRAINT_CHANGE" && !r.routerPass
);
const aeFailures = robustnessRecords.filter(
  (r) => r.family === "ALTERNATIVE_EXPLORATION" && !r.routerPass
);
console.log(
  `Vocabulary dependency (router failures on new phrases): ${robustnessRecords.filter((r) => !r.routerPass).length}/${totalRobustness}`
);
console.log(
  `Framing dependency (CONSTRAINT_CHANGE without "e se"): ${ccFailures.length} failures on natural-language constraint shifts`
);
console.log(
  `Context dependency (cold router pass): ${coldRecords.filter((r) => r.routerPass).length}/${coldRecords.length} vs anchored ${anchoredRecords.filter((r) => r.routerPass).length}/${anchoredRecords.length}`
);
console.log(
  `Collision guards with multiple active families: ${collisionRecords.filter((r) => r.collisionDetected).length}/${collisionRecords.length}`
);

console.log("\n── Safety metrics ──\n");
console.log(
  `New_search leaks (robustness cases): ${robustnessRecords.filter((r) => r.openedNewSearch).length}/${totalRobustness}`
);
console.log(
  `Anchor loss: ${robustnessRecords.filter((r) => r.context === "anchored" && !r.anchorPreserved).length}`
);
console.log(
  `Winner change: ${robustnessRecords.filter((r) => r.winnerChanged).length}`
);
console.log(
  `Generic fallback hits: ${robustnessRecords.filter((r) => r.genericFallbackDetected).length}`
);

console.log("\n── Overall scores ──\n");
console.log(`Total tests executed: ${totalTests} (${totalRobustness} robustness + ${collisionRecords.length} collision guards)`);
console.log(`router_intention_score: ${pct(overallRouterPass, totalRobustness)}% (${overallRouterPass}/${totalRobustness}) — ${classifyRobustness(overallRouterScore)}`);
console.log(
  `routing_behavior_score (FULLY_CLOSED only): ${pct(overallRoutingPass, closedRecords.length)}% (${overallRoutingPass}/${closedRecords.length}) — ${classifyRobustness(overallRoutingScore)}`
);
console.log(
  `full_stack_score (FULLY_CLOSED only): ${pct(overallFinalPass, closedRecords.length)}% (${overallFinalPass}/${closedRecords.length}) — ${classifyRobustness(overallFullStackScore)}`
);
console.log(`Cold router score: ${pct(coldRecords.filter((r) => r.routerPass).length, coldRecords.length)}%`);
console.log(`Anchored router score: ${pct(anchoredRecords.filter((r) => r.routerPass).length, anchoredRecords.length)}%`);
console.log(`Most robust family: ${mostRobust.family} (${pct(mostRobust.routerPass, mostRobust.total)}%)`);
console.log(`Most fragile family: ${mostFragile.family} (${pct(mostFragile.routerPass, mostFragile.total)}%)`);

console.log("\n── Failed phrases by family ──\n");
for (const s of familySummaries) {
  console.log(
    `  ${s.family}: ${s.failedPhrases.length ? s.failedPhrases.map((p) => `"${p}"`).join(", ") : "(none)"}`
  );
}

console.log("\n── Recommended next patches ──\n");
const recommendations = [];
for (const s of familySummaries) {
  if (s.routerIntentionScore < 90) {
    recommendations.push(`${s.family}-Router — expand semantic families for informal phrasing (${s.classification})`);
  }
  if (s.fullyClosed !== false && s.routingBehaviorScore != null && s.routingBehaviorScore < 90) {
    recommendations.push(`${s.family}-Routing — hold/routing gaps on new phrasing`);
  }
}
if (familySummaries.find((s) => s.family === "CONSTRAINT_CHANGE")?.routingPending) {
  recommendations.push("7.9K — Constraint Change Routing");
  recommendations.push("7.9L — Constraint Change Response Path");
}
if (!recommendations.length) {
  recommendations.push("Monitor production phrasing drift; no urgent patch from this audit.");
}
console.log(recommendations.map((r) => `  • ${r}`).join("\n"));

console.log("\n── Final report checklist ──\n");
console.log("1. Arquivo criado: scripts/test-mia-semantic-robustness-audit.js");
console.log(`2. Testes executados: ${totalTests}`);
console.log(`3. Robustness score geral (router): ${pct(overallRouterPass, totalRobustness)}% — ${classifyRobustness(overallRouterScore)}`);
console.log("4. Score por família: see Per-family robustness above");
console.log(`5. Score cold: ${pct(coldRecords.filter((r) => r.routerPass).length, coldRecords.length)}%`);
console.log(`6. Score anchored: ${pct(anchoredRecords.filter((r) => r.routerPass).length, anchoredRecords.length)}%`);
console.log(`7. Família mais robusta: ${mostRobust.family}`);
console.log(`8. Família mais frágil: ${mostFragile.family}`);
console.log("9. Frases que falharam: see Failed phrases by family");
console.log(`10. Colisões: ${collisionRecords.filter((r) => !r.dominantMatches).length}/${collisionRecords.length} dominant-intent mismatches`);
console.log(`11. Dependência de vocabulário: ${classifyRobustness(overallRouterScore)} at router layer`);
console.log(`12. Dependência de framing: CONSTRAINT_CHANGE natural phrases ${pct(familySummaries.find((s) => s.family === "CONSTRAINT_CHANGE").routerPass, familySummaries.find((s) => s.family === "CONSTRAINT_CHANGE").total)}%`);
console.log(`13. Dependência de contexto: cold ${pct(coldRecords.filter((r) => r.routerPass).length, coldRecords.length)}% vs anchored ${pct(anchoredRecords.filter((r) => r.routerPass).length, anchoredRecords.length)}%`);
console.log(`14. New_search leaks: ${robustnessRecords.filter((r) => r.openedNewSearch).length}`);
console.log(`15. Anchor loss: ${robustnessRecords.filter((r) => r.context === "anchored" && !r.anchorPreserved).length}`);
console.log(`16. Winner change: ${robustnessRecords.filter((r) => r.winnerChanged).length}`);
console.log(`17. Generic fallback: ${robustnessRecords.filter((r) => r.genericFallbackDetected).length}`);
console.log("18–19. Run closure standard + 7.6V separately after this script.");
console.log("20. Próximos patches: see Recommended next patches above");

console.log("\nPATCH 7.9X semantic robustness audit COMPLETE — AUDIT ONLY\n");
