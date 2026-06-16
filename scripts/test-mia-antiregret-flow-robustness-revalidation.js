/**
 * PATCH 7.9X-D.4.1 — ANTI_REGRET Flow Robustness Revalidation (AUDIT ONLY)
 *
 * Revalidates full stack after patches 7.9X-CC, E, F, G, H, I, J.
 * Does NOT modify production behavior.
 *
 * Usage: node scripts/test-mia-antiregret-flow-robustness-revalidation.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isConstraintChangeFamilyQuery,
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
import {
  buildRoutingDecision,
  applyRoutingDecisionToContextResolution,
} from "../lib/miaRoutingDecisionContract.js";
import {
  resolveClearNewCommercialSearchForRouting,
  isNegativeNonCommercialDesire,
} from "../lib/miaRoutingSafety.js";
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
    label: "medo explícito",
    phrases: [
      "tenho medo de errar",
      "não quero me arrepender",
      "tenho receio de escolher errado",
      "estou inseguro com essa compra",
      "tenho medo de escolher errado",
      "não quero fazer besteira",
      "não quero errar nessa compra",
      "medo de errar nessa escolha",
    ],
  },
  {
    id: "B",
    label: "pressão financeira implícita",
    phrases: [
      "é muito dinheiro pra mim",
      "não quero jogar dinheiro fora",
      "se eu errar vai doer",
      "essa compra pesa bastante",
      "não quero gastar errado",
      "me dá insegurança gastar isso",
      "tenho receio de investir errado",
      "essa escolha me preocupa",
    ],
  },
  {
    id: "C",
    label: "linguagem coloquial",
    phrases: [
      "tô cabreiro",
      "tô com receio",
      "tô meio inseguro",
      "tô com medo de fazer besteira",
      "tô inseguro nessa",
      "tô meio receoso",
      "tô apreensivo com essa compra",
      "tô meio cabreiro com isso",
    ],
  },
  {
    id: "D",
    label: "evitar problema futuro",
    phrases: [
      "quero evitar dor de cabeça",
      "quero ficar tranquilo depois",
      "não quero me incomodar depois",
      "quero comprar sem preocupação",
      "quero uma escolha tranquila",
      "quero evitar problema depois",
      "quero comprar uma vez só",
      "quero decidir com calma",
    ],
  },
  {
    id: "E",
    label: "questionamento emocional",
    phrases: [
      "será que vou me arrepender",
      "acho que vou me arrepender",
      "posso comprar tranquilo",
      "é seguro ir nesse",
      "acha que vou me arrepender?",
      "dá pra comprar sem medo?",
      "não vou me arrepender depois?",
      "posso ficar sossegado?",
    ],
  },
];

const COMPOUND_GROUP = {
  id: "F",
  label: "compostos",
  phrases: [
    "acho que vou nele mas tenho medo de errar",
    "faz sentido mas ainda tenho receio",
    "acho que gostei dele mas estou inseguro",
    "gostei mas não quero me arrepender",
    "acho que vou nele, mas tenho medo de errar",
    "parece ser esse, mas tô inseguro",
    "vou nesse, mas não quero me arrepender",
    "fechou nele, mas tô com receio",
  ],
};

const COLLISION_GUARDS = [
  { group: "SV", input: "quem comprou se arrepende", expect: "SOCIAL_VALIDATION" },
  { group: "SV", input: "o pessoal costuma se arrepender", expect: "SOCIAL_VALIDATION" },
  { group: "SV", input: "a galera gosta dele", expect: "SOCIAL_VALIDATION" },
  { group: "CC", input: "você tem certeza", expect: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "continua recomendando", expect: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "mantém ele como vencedor", expect: "CONFIDENCE_CHALLENGE" },
  { group: "SD", input: "não me convenceu", expect: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "estou com pé atrás", expect: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "não gostei muito", expect: "SOFT_DISAGREEMENT" },
  { group: "CC2", input: "ficou caro pra mim quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "pesou no bolso", expect: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "quero algo mais barato", expect: "CONSTRAINT_CHANGE" },
  { group: "DC", input: "vou nele", expect: "DECISION_CONFIRMATION" },
  { group: "DC", input: "acho que fechei", expect: "DECISION_CONFIRMATION" },
  { group: "DC", input: "já decidi", expect: "DECISION_CONFIRMATION" },
  { group: "ACK", input: "ok", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "fechou", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "show", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "entendi continua", expect: "ACKNOWLEDGEMENT" },
  { group: "GREET", input: "oi", expect: "GREETING" },
  { group: "GREET", input: "salve", expect: "GREETING" },
  { group: "GREET", input: "bom dia", expect: "GREETING" },
  { group: "GREET", input: "mia você está aí", expect: "GREETING" },
];

function buildOpenAntiRegretPreview() {
  return "Entendo a preocupação. Para avaliar o risco de arrependimento com honestidade, preciso saber qual compra estamos decidindo.";
}

function buildAnchoredAntiRegretPreview() {
  return "Entendo a preocupação. Mantendo Produto Recomendado Atual como referência, a escolha faz sentido pelo que vimos — mas vale confirmar preço, loja e condição antes de fechar, para reduzir arrependimento.";
}

function hasAntiRegretRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "anti_regret" ||
    routingDecision.responsePathHint === "anti_regret_reply" ||
    routingDecision.responsePathHint === "anti_regret_anchored"
  );
}

function idealAntiRegretTurn(hasActiveAnchor) {
  return hasActiveAnchor ? MIA_TURN_TYPES.OBJECTION : MIA_TURN_TYPES.CONVERSATIONAL;
}

function matchesExpectedNeighbor(expected, message, cognitiveTurn, routingDecision, responsePathFinal) {
  switch (expected) {
    case "SOCIAL_VALIDATION":
      return (
        !!cognitiveTurn.signals?.isSocialValidation ||
        isSocialValidationFamilyQuery(message) ||
        routingDecision.conversationAct === "social_validation" ||
        responsePathFinal === "social_validation_flow"
      );
    case "CONFIDENCE_CHALLENGE":
      return (
        !!cognitiveTurn.signals?.isConfidenceChallenge ||
        isConfidenceChallengeFamilyQuery(message) ||
        routingDecision.conversationAct === "confidence_challenge" ||
        responsePathFinal === "confidence_challenge_flow"
      );
    case "SOFT_DISAGREEMENT":
      return (
        !!cognitiveTurn.signals?.isSoftDisagreement ||
        isSoftDisagreementFamilyQuery(message) ||
        routingDecision.conversationAct === "soft_disagreement" ||
        responsePathFinal === "soft_disagreement_flow"
      );
    case "CONSTRAINT_CHANGE":
      return (
        !!cognitiveTurn.signals?.isConstraintChange ||
        isConstraintChangeFamilyQuery(message) ||
        routingDecision.conversationAct === "constraint_change" ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT ||
        responsePathFinal === "constraint_change_flow"
      );
    case "DECISION_CONFIRMATION":
      return (
        !!cognitiveTurn.signals?.isDecisionConfirmation ||
        isDecisionConfirmationFamilyQuery(message) ||
        routingDecision.conversationAct === "decision_confirmation" ||
        responsePathFinal === "decision_confirmation_flow"
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
        responsePathFinal === "greeting_flow"
      );
    default:
      return false;
  }
}

function simulateFullStack(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";
  const legacyContextAction = "search";
  const contextResolution = {
    mode: "general_answer",
    shouldSkipProductSearch: false,
    directReply: GENERIC_WELCOME_DIRECT_REPLY,
    clearContext: !hasActiveAnchor,
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
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
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

  const bridgeIntent = bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent;

  const idealTurn = idealAntiRegretTurn(hasActiveAnchor);

  const routerPass =
    !!cognitiveTurn.signals?.isAntiRegret &&
    isAntiRegretFamilyQuery(message) &&
    cognitiveTurn.turnType === idealTurn &&
    cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  const routingPass =
    !openedNewSearch &&
    hasAntiRegretRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const bridgePass =
    bridgeAudit.active &&
    bridgeIntent === "anti_regret" &&
    guardResult.contextAction === "anti_regret";

  const contractPass = routingPass && bridgePass;

  const handlerAntiRegretGate =
    !clearNewSearch &&
    (cognitiveTurn.signals?.isAntiRegret === true ||
      isAntiRegretFamilyQuery(message) ||
      hasAntiRegretRoutingHold(routingDecision));

  let responsePathFinal = "unknown";
  let finalResponsePreview = "";
  let genericFallbackDetected = false;

  if (openedNewSearch) {
    responsePathFinal = "default_product_search";
    finalResponsePreview = "(busca comercial)";
  } else if (handlerAntiRegretGate && hasAntiRegretRoutingHold(routingDecision)) {
    responsePathFinal = "anti_regret_flow";
    finalResponsePreview = hasActiveAnchor
      ? buildAnchoredAntiRegretPreview()
      : buildOpenAntiRegretPreview();
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else if (
    hasActiveAnchor &&
    guardResult.contextAction === "decision" &&
    routingDecision.conversationAct === "context_question"
  ) {
    responsePathFinal = "decision_context_branch";
    finalResponsePreview = "Resposta via branch decision/context_question.";
  } else if (!hasActiveAnchor && !openedNewSearch) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = GENERIC_WELCOME_DIRECT_REPLY;
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else {
    responsePathFinal =
      routingDecision.responsePathHint?.replace(/_reply$|_anchored$/, "_flow") ||
      `${routingDecision.conversationAct || routingDecision.mode}_path`;
    finalResponsePreview = `(path=${responsePathFinal})`;
  }

  const responsePathPass = responsePathFinal === "anti_regret_flow";
  const finalResponsePass =
    responsePathPass && !genericFallbackDetected && handlerAntiRegretGate;

  const userPerception = assessUserPerception({
    responsePathFinal,
    genericFallbackDetected,
    hasActiveAnchor,
    routerPass,
    finalResponsePass,
  });

  const layers = {
    routerPass,
    routingPass,
    bridgePass,
    contractPass,
    responsePathPass,
    finalResponsePass,
  };

  const leaks = classifyPositiveLeaks({
    layers,
    routingDecision,
    guardResult,
    bridgeIntent,
    clearNewSearch,
    handlerAntiRegretGate,
    responsePathFinal,
    genericFallbackDetected,
    cognitiveTurn,
    userPerception,
  });

  return {
    classification: {
      turnType: cognitiveTurn.turnType,
      idealTurn,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      familyQuery: isAntiRegretFamilyQuery(message),
      negativeNonCommercial: isNegativeNonCommercialDesire(message),
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
      handlerAntiRegretGate,
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
  if (ctx.genericFallbackDetected || ctx.responsePathFinal === "default_product_search") {
    return "NÃO";
  }
  if (ctx.responsePathFinal === "anti_regret_flow" && ctx.routerPass) {
    return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
  }
  return "NÃO";
}

function classifyPositiveLeaks(ctx) {
  const leaks = [];

  if (!ctx.layers.routerPass) {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: `isAntiRegret=${!!ctx.cognitiveTurn?.signals?.isAntiRegret} turn=${ctx.cognitiveTurn?.turnType}`,
    });
  }
  if (ctx.layers.routerPass && !ctx.layers.routingPass) {
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
  if (ctx.layers.bridgePass && !ctx.layers.contractPass && ctx.layers.routingPass) {
    leaks.push({ type: "CONTRACT_LEAK", detail: "Bridge/routing desalinhados" });
  }
  if (ctx.layers.routerPass && ctx.handlerAntiRegretGate && !ctx.layers.responsePathPass) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `gate true mas path=${ctx.responsePathFinal}`,
    });
  }
  if (ctx.layers.responsePathPass && !ctx.layers.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION_LEAK",
      detail: "anti_regret_flow ativo mas resposta genérica",
    });
  }
  if (ctx.layers.routerPass && ctx.layers.finalResponsePass && ctx.userPerception === "NÃO") {
    leaks.push({
      type: "USER_PERCEPTION_LEAK",
      detail: "Stack passou mas percepção não reflete redução de risco",
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
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ...trace,
  };
}

function evaluateCompound(phrase, hasActiveAnchor) {
  const trace = simulateFullStack(phrase, hasActiveAnchor);
  const arDominant =
    !!trace.cognitiveTurn.signals?.isAntiRegret &&
    isAntiRegretFamilyQuery(phrase) &&
    !trace.cognitiveTurn.signals?.isDecisionConfirmation;
  const ok = arDominant && trace.layers.finalResponsePass;
  const leaks = [];

  if (!arDominant) {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: "Composto não preservou ANTI_REGRET dominante",
    });
  } else if (ok) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: "Composto preservou frame pessoal de arrependimento",
    });
  } else {
    for (const leak of trace.leaks) leaks.push(leak);
  }

  return {
    kind: "compound",
    group: COMPOUND_GROUP.id,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ok,
    arDominant,
    ...trace,
    leaks,
    layers: {
      ...trace.layers,
      finalResponsePass: ok,
    },
    userPerception: ok ? (hasActiveAnchor ? "SIM" : "PARCIAL") : trace.userPerception,
  };
}

function evaluateCollision(spec, hasActiveAnchor) {
  const trace = simulateFullStack(spec.input, hasActiveAnchor);
  const falseAr =
    trace.response.responsePathFinal === "anti_regret_flow" &&
    !!trace.cognitiveTurn.signals?.isAntiRegret &&
    isAntiRegretFamilyQuery(spec.input);
  const neighborOk = matchesExpectedNeighbor(
    spec.expect,
    spec.input,
    trace.cognitiveTurn,
    trace.routingDecision,
    trace.response.responsePathFinal
  );
  const ok = !falseAr && neighborOk;
  const leaks = [];

  if (falseAr) {
    leaks.push({
      type: "ROUTER_LEAK",
      detail: `Colisão engoliu ${spec.expect} → anti_regret_flow`,
    });
  } else if (neighborOk) {
    leaks.push({
      type: "ARCHITECTURAL_DESIGN_ACCEPTED",
      detail: `${spec.expect} preservado — anti_regret não dominante`,
    });
  } else {
    leaks.push({
      type: "TEST_EXPECTATION_LEAK",
      detail: `Esperado ${spec.expect}, path=${trace.response.responsePathFinal}`,
    });
  }

  return {
    kind: "collision",
    ...spec,
    context: hasActiveAnchor ? "anchored" : "cold",
    ok,
    falseAr,
    neighborOk,
    ...trace,
    leaks,
    layers: {
      routerPass: !falseAr,
      routingPass: !falseAr,
      bridgePass: !falseAr,
      contractPass: ok,
      responsePathPass: !falseAr,
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
  console.log("── FASE 1 — Mapa real do fluxo ANTI_REGRET (pós D.2–D.4) ──\n");
  console.log("1. Router (lib/miaCognitiveRouter.js)");
  console.log("   • detectsAntiRegretSignal / detectsNaturalAntiRegretSignal");
  console.log("   • hasPersonalAntiRegretDominantFrame (compostos)");
  console.log("   • turnType: CONVERSATIONAL (cold) | OBJECTION (anchored)");
  console.log("   • Export: isAntiRegretFamilyQuery()\n");
  console.log("2. Bridge (lib/miaCognitiveBridge.js PATCH 7.9X-D.3)");
  console.log("   • OBJECTION + isAntiRegret → intent/contextAction=anti_regret\n");
  console.log("3. Routing (lib/miaRoutingDecisionContract.js PATCH 7.9X-D.2)");
  console.log("   • applyAntiRegretRoutingHoldIfEligible ANTES de contextAction=decision");
  console.log("   • conversationAct=anti_regret | hint anti_regret_reply/anchored\n");
  console.log("4. Response Path (pages/api/chat-gpt4o.js PATCH 7.8H)");
  console.log("   • Gate: !clearNewCommercialSearch + isAntiRegret | family | hold");
  console.log("   • anti_regret_flow → role anti_regret_reply\n");
  console.log("5. Resposta final");
  console.log("   • Cold: acolhe medo + pede contexto");
  console.log("   • Anchored: reafirma winner + ressalvas honestas\n");
}

printFlowMap();

console.log("PATCH 7.9X-D.4.1 — ANTI_REGRET Flow Robustness Revalidation (AUDIT ONLY)\n");
console.log("HTTP usage: false | Production changes: NONE\n");

const positiveRecords = [];
for (const group of POSITIVE_GROUPS) {
  for (const phrase of group.phrases) {
    positiveRecords.push(evaluatePositive(group, phrase, false));
    positiveRecords.push(evaluatePositive(group, phrase, true));
  }
}

const compoundRecords = COMPOUND_GROUP.phrases.flatMap((phrase) => [
  evaluateCompound(phrase, false),
  evaluateCompound(phrase, true),
]);

const collisionRecords = COLLISION_GUARDS.flatMap((spec) => [
  evaluateCollision(spec, false),
  evaluateCollision(spec, true),
]);

const posStats = summarize(positiveRecords);
const compoundStats = summarize(compoundRecords);
const collisionStats = summarize(collisionRecords);

console.log(`── FASE 2 — Suite positiva (${posStats.total} cenários) ──\n`);
console.log("Grp | Ctx | Frase | Rtr | Rtg | Brg | Ctr | Path | Final | Perc");
console.log("-".repeat(110));
for (const r of positiveRecords) {
  const m = (ok) => (ok ? "✓" : "✗");
  console.log(
    `${r.group} | ${r.context.padEnd(7)} | ${r.input.slice(0, 28).padEnd(28)} | ${m(r.layers.routerPass)} | ${m(r.layers.routingPass)} | ${m(r.layers.bridgePass)} | ${m(r.layers.contractPass)} | ${m(r.layers.responsePathPass)} | ${m(r.layers.finalResponsePass)} | ${r.userPerception}`
  );
}

console.log(`\n── FASE 3 — Compostos (${compoundRecords.length} cenários) ──\n`);
for (const r of compoundRecords) {
  console.log(
    `  ${r.ok ? "✓ OK" : "✗ LEAK"} [${r.context}] "${r.input}" → path=${r.response.responsePathFinal}`
  );
}

console.log(`\n── FASE 4 — Colisões (${collisionRecords.length} cenários) ──\n`);
for (const r of collisionRecords) {
  console.log(
    `  ${r.ok ? "✓ OK" : "✗ LEAK"} [${r.group}/${r.context}] "${r.input}" → expect=${r.expect} path=${r.response.responsePathFinal}`
  );
}

console.log("\n── FASE 5 — Taxa por camada (positivos) ──\n");
console.log(`Cenários positivos: ${posStats.total}`);
console.log(`Router:           ${posStats.router}/${posStats.total} (${pct(posStats.router, posStats.total)}%)`);
console.log(`Routing:          ${posStats.routing}/${posStats.total} (${pct(posStats.routing, posStats.total)}%)`);
console.log(`Bridge:           ${posStats.bridge}/${posStats.total} (${pct(posStats.bridge, posStats.total)}%)`);
console.log(`Contract:         ${posStats.contract}/${posStats.total} (${pct(posStats.contract, posStats.total)}%)`);
console.log(`Response Path:    ${posStats.response}/${posStats.total} (${pct(posStats.response, posStats.total)}%)`);
console.log(`Resposta Final:   ${posStats.final}/${posStats.total} (${pct(posStats.final, posStats.total)}%)`);
console.log(`Percepção SIM:    ${posStats.sim}/${posStats.total} (${pct(posStats.sim, posStats.total)}%)`);
console.log(`Percepção PARCIAL:${posStats.partial}/${posStats.total} (${pct(posStats.partial, posStats.total)}%)`);
console.log(`Percepção NÃO:    ${posStats.no}/${posStats.total} (${pct(posStats.no, posStats.total)}%)`);

console.log("\n── Métricas por grupo (positivos) ──\n");
for (const group of POSITIVE_GROUPS) {
  const rows = positiveRecords.filter((r) => r.group === group.id);
  const s = summarize(rows);
  console.log(
    `  Grupo ${group.id} (${group.label}): router ${s.router}/${s.total} | full ${s.final}/${s.total}`
  );
}

console.log("\n── Compostos ──\n");
console.log(
  `  Preservação AR: ${compoundRecords.filter((r) => r.ok).length}/${compoundRecords.length} (${pct(compoundRecords.filter((r) => r.ok).length, compoundRecords.length)}%)`
);

console.log("\n── Colisões ──\n");
console.log(
  `  Clean: ${collisionRecords.filter((r) => r.ok).length}/${collisionRecords.length} (${pct(collisionRecords.filter((r) => r.ok).length, collisionRecords.length)}%)`
);

const leakCounts = {};
for (const r of [...positiveRecords, ...compoundRecords, ...collisionRecords]) {
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
for (const r of [...positiveRecords, ...compoundRecords, ...collisionRecords]) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    const key = `${leak.type}::${leak.detail}`;
    if (!uniquePatterns.has(key)) uniquePatterns.set(key, []);
    uniquePatterns.get(key).push(`[${r.context}] "${r.input}"`);
  }
}

console.log("\n── Causa raiz (padrões únicos) ──\n");
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
  compoundRecords.every((r) => r.ok) &&
  collisionRecords.every((r) => r.ok);

if (fullRobust) {
  console.log("A) ANTI_REGRET FULL STACK ROBUST");
} else {
  console.log("B) ANTI_REGRET POSSUI GAP FULL STACK");
  if (posStats.final < posStats.total) {
    console.log(`   Positivos full stack: ${posStats.final}/${posStats.total}`);
  }
  const compoundFails = compoundRecords.filter((r) => !r.ok).length;
  if (compoundFails) console.log(`   Compostos: ${compoundFails} leak(s)`);
  const collisionFails = collisionRecords.filter((r) => !r.ok).length;
  if (collisionFails) console.log(`   Colisões: ${collisionFails} leak(s)`);
}

console.log("\n── Recomendação ──\n");
if (fullRobust) {
  console.log("Próximo patch: PATCH 7.9X-CC.1 — Constraint Change Flow Robustness Audit");
} else {
  console.log("Seguir camada dominante nos leaks acima — patch corretivo dedicado por camada.");
}

console.log("\nPATCH 7.9X-D.4.1 revalidation COMPLETE — AUDIT ONLY\n");
process.exit(fullRobust ? 0 : 1);
