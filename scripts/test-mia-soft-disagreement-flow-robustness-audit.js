/**
 * PATCH 7.9X-G.1 — SOFT_DISAGREEMENT Flow Robustness Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge/Contract → Routing → Response Path → User perception.
 * Does NOT modify production behavior unless a microfix is explicitly approved post-audit.
 *
 * Usage: node scripts/test-mia-soft-disagreement-flow-robustness-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isSoftDisagreementFamilyQuery,
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
    label: "discordância direta suave",
    phrases: [
      "não concordo muito",
      "não sei se concordo",
      "não concordei totalmente",
      "não estou tão convencido",
      "não estou convencido disso",
      "não estou comprando muito essa ideia",
      "não comprei muito essa ideia",
    ],
  },
  {
    id: "B",
    label: "resistência emocional",
    phrases: [
      "estou com um pé atrás",
      "ainda estou meio desconfiado",
      "não senti firmeza",
      "fiquei na dúvida",
      "não me passou confiança",
      "tô meio desconfiado",
      "continuo meio na dúvida",
    ],
  },
  {
    id: "C",
    label: "baixa persuasão",
    phrases: [
      "não me convenceu",
      "não me convenceu muito",
      "não me ganhou",
      "não me ganhou ainda",
      "não bateu comigo",
      "não pegou muito pra mim",
      "não bateu muito comigo",
    ],
  },
  {
    id: "D",
    label: "ceticismo leve",
    phrases: [
      "não achei tão forte assim",
      "não parece tudo isso",
      "achei meio fraco",
      "esperava algo melhor",
      "não achei tão convincente",
      "parece meio forçado",
    ],
  },
  {
    id: "E",
    label: "rejeição parcial",
    phrases: [
      "faz sentido mas não me convenceu",
      "entendo mas ainda não sei",
      "até faz sentido mas fiquei na dúvida",
      "não sei se compro essa ideia",
      "até entendi mas não me ganhou",
      "faz sentido, mas não bateu comigo",
    ],
  },
  {
    id: "F",
    label: "linguagem coloquial",
    phrases: [
      "sei lá viu",
      "tô meio assim ainda",
      "não curti muito não",
      "não me desceu muito bem",
      "não bateu ainda",
      "tô meio dividido",
      "hmm não sei",
    ],
  },
  {
    id: "G",
    label: "frases compostas",
    phrases: [
      "entendi, mas não me convenceu",
      "beleza, mas fiquei com um pé atrás",
      "faz sentido, mas não senti firmeza",
      "gostei dele, mas não me ganhou",
      "acho que vou nele, mas não bateu totalmente",
      "ok, mas ainda não estou convencido",
    ],
  },
];

const NEGATIVE_GUARDS = [
  { group: "CC", input: "você tem certeza?" },
  { group: "CC", input: "ainda recomenda esse?" },
  { group: "CC", input: "você manteria essa recomendação?" },
  { group: "SV", input: "a galera recomenda?" },
  { group: "SV", input: "o povo fala bem?" },
  { group: "SV", input: "quem comprou gostou?" },
  { group: "AR", input: "tenho medo de errar" },
  { group: "AR", input: "não quero me arrepender" },
  { group: "AR", input: "tô cabreiro" },
  { group: "AR", input: "é muito dinheiro pra mim" },
  { group: "DC", input: "vou nele" },
  { group: "DC", input: "acho que fechou" },
  { group: "DC", input: "então é esse" },
  { group: "AE", input: "tem outro?" },
  { group: "AE", input: "mostra alternativas" },
  { group: "AE", input: "quero ver opções" },
  { group: "SBD", input: "qual ficou em segundo?" },
  { group: "SBD", input: "plano B?" },
  { group: "SBD", input: "backup?" },
  { group: "CC2", input: "quero gastar menos" },
  { group: "CC2", input: "agora câmera importa mais" },
  { group: "CC2", input: "vou usar mais para fotos" },
  { group: "COMP", input: "entendi" },
  { group: "COMP", input: "agora fez sentido" },
  { group: "COMP", input: "saquei o raciocínio" },
  { group: "ACK", input: "ok" },
  { group: "ACK", input: "blz" },
  { group: "ACK", input: "pode seguir" },
  { group: "GREET", input: "oi" },
  { group: "GREET", input: "bom dia" },
  { group: "GREET", input: "salve" },
];

function buildIdealSoftDisagreementPreview(hasAnchor) {
  if (hasAnchor) {
    return "Justo. Mantendo Produto Recomendado Atual como referência, posso revisar o ponto que não te convenceu.";
  }
  return "Justo. Me diz qual ponto não te convenceu que eu reviso contigo.";
}

function hasSoftDisagreementRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "soft_disagreement" ||
    routingDecision.responsePathHint === "soft_disagreement_reply" ||
    routingDecision.responsePathHint === "soft_disagreement_anchored"
  );
}

function simulateFullStack(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";
  const legacyContextAction = "search";

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
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
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

  const idealTurn = hasActiveAnchor
    ? cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION
    : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL;

  const routerPass =
    !!cognitiveTurn.signals?.isSoftDisagreement &&
    isSoftDisagreementFamilyQuery(message) &&
    idealTurn &&
    cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  const routingPass =
    !openedNewSearch &&
    hasSoftDisagreementRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const handlerSoftDisagreementGate =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isSoftDisagreement === true ||
      isSoftDisagreementFamilyQuery(message) ||
      hasSoftDisagreementRoutingHold(routingDecision)
    );

  const bridgeIntent = bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent;
  const contractPass =
    routingPass &&
    handlerSoftDisagreementGate &&
    guardResult.contextAction !== "search";

  let responsePathFinal = "unknown";
  let finalResponsePreview = "";
  let genericFallbackDetected = false;
  let effectiveIntent = bridgeIntent;

  if (openedNewSearch) {
    responsePathFinal = "default_product_search";
    finalResponsePreview = "(busca comercial — sem acolhimento de resistência leve)";
  } else if (handlerSoftDisagreementGate) {
    responsePathFinal = "soft_disagreement_flow";
    effectiveIntent = "soft_disagreement";
    finalResponsePreview = buildIdealSoftDisagreementPreview(hasActiveAnchor);
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else if (!hasActiveAnchor && !openedNewSearch) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = GENERIC_WELCOME_DIRECT_REPLY;
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else if (
    hasActiveAnchor &&
    guardResult.contextAction === "decision" &&
    !hasSoftDisagreementRoutingHold(routingDecision)
  ) {
    responsePathFinal = "decision_context_branch";
    finalResponsePreview =
      "Resposta via branch decision/context_question — explicação genérica, sem soft_disagreement_flow.";
  } else {
    responsePathFinal =
      routingDecision.responsePathHint || routingDecision.mode || "unknown";
    finalResponsePreview = `(path=${responsePathFinal})`;
  }

  const responsePathPass = responsePathFinal === "soft_disagreement_flow";
  const finalResponsePass =
    responsePathPass && !genericFallbackDetected && handlerSoftDisagreementGate;

  const userPerception = assessUserPerception({
    responsePathFinal,
    finalResponsePreview,
    genericFallbackDetected,
    handlerSoftDisagreementGate,
    hasActiveAnchor,
    routerPass,
    routingPass,
  });

  const leaks = classifyLeaks({
    routerPass,
    idealTurn,
    routingPass,
    contractPass,
    responsePathPass,
    finalResponsePass,
    handlerSoftDisagreementGate,
    clearNewSearch,
    routingDecision,
    guardResult,
    bridgeIntent,
    bridgeAudit,
    openedNewSearch,
    cognitiveTurn,
    hasActiveAnchor,
    userPerception,
  });

  return {
    classification: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      detectorMatch: isSoftDisagreementFamilyQuery(message),
      decisionExplanationSubtype: cognitiveTurn.signals?.decisionExplanation?.subtype || null,
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
      handlerSoftDisagreementGate,
      effectiveIntent,
      responsePathFinal,
      finalResponsePreview,
      genericFallbackDetected,
    },
    layers: {
      routerPass,
      routingPass,
      contractPass,
      responsePathPass,
      finalResponsePass,
    },
    userPerception,
    leaks,
  };
}

function assessUserPerception(ctx) {
  if (ctx.responsePathFinal === "soft_disagreement_flow" && !ctx.genericFallbackDetected) {
    return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
  }
  if (ctx.responsePathFinal === "decision_context_branch" && ctx.routerPass) {
    return "PARCIAL";
  }
  if (ctx.genericFallbackDetected || ctx.responsePathFinal === "default_product_search") {
    return "NÃO";
  }
  if (!ctx.routerPass) {
    return "NÃO";
  }
  return "PARCIAL";
}

function classifyLeaks(ctx) {
  const leaks = [];
  if (!ctx.routerPass) {
    if (!ctx.cognitiveTurn.signals?.isSoftDisagreement) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: "SOFT_DISAGREEMENT não reconhecido — resistência leve não capturada",
      });
    } else if (!ctx.idealTurn) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: `turnType=${ctx.cognitiveTurn.turnType} — esperado OBJECTION (anchored) ou CONVERSATIONAL (cold)`,
      });
    } else {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: "detector/family mismatch apesar de sinal parcial",
      });
    }
  }
  if (ctx.routerPass && !ctx.routingPass) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `Router OK mas routing act=${ctx.routingDecision.conversationAct || ctx.routingDecision.mode} hint=${ctx.routingDecision.responsePathHint}`,
    });
  }
  if (
    ctx.routerPass &&
    ctx.bridgeAudit.active &&
    ctx.guardResult.contextAction === "decision" &&
    !hasSoftDisagreementRoutingHold(ctx.routingDecision)
  ) {
    leaks.push({
      type: "BRIDGE_LEAK",
      detail: "OBJECTION→decision intercepta antes do hold soft_disagreement (context_question precedence)",
    });
  }
  if (ctx.routingPass && !ctx.contractPass) {
    leaks.push({
      type: "CONTRACT_LEAK",
      detail: `Bridge intent=${ctx.bridgeIntent} contextAction=${ctx.guardResult.contextAction} handlerGate=${ctx.handlerSoftDisagreementGate}`,
    });
  }
  if (ctx.routerPass && ctx.handlerSoftDisagreementGate && !ctx.responsePathPass) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `Handler gate true mas path=${ctx.responsePathFinal}`,
    });
  }
  if (ctx.routerPass && !ctx.handlerSoftDisagreementGate && ctx.clearNewSearch) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: "clearNewCommercialSearch bloqueia soft_disagreement_flow apesar de isSoftDisagreement=true",
    });
  }
  if (ctx.responsePathPass && !ctx.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION_LEAK",
      detail: "Fluxo correto mas resposta genérica ou fallback institucional",
    });
  }
  if (
    ctx.routerPass &&
    ctx.routingPass &&
    ctx.finalResponsePass &&
    ctx.userPerception === "NÃO"
  ) {
    leaks.push({
      type: "USER_PERCEPTION_LEAK",
      detail: "Stack técnico passou mas percepção não acolhe resistência leve",
    });
  }
  if (
    ctx.routerPass &&
    !ctx.routingPass &&
    ctx.responsePathPass &&
    ctx.hasActiveAnchor
  ) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: "Handler bypass: soft_disagreement_flow ativo sem conversationAct=soft_disagreement (autoridade routing ausente)",
    });
  }
  return leaks;
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function printFlowMap() {
  console.log("── FASE 1 — Mapa do fluxo SOFT_DISAGREEMENT ──\n");
  console.log("1. Classificação (lib/miaCognitiveRouter.js PATCH 7.9X-G / 7.9X-SD.2)");
  console.log("   • detectsSoftDisagreementSignal / detectsNaturalSoftDisagreementSignal");
  console.log("   • buildTurnSignals → signals.isSoftDisagreement");
  console.log("   • resolveTurnTypeFromSignals step 2.8 → CONVERSATIONAL (cold) | OBJECTION (anchored)");
  console.log("   • Export: isSoftDisagreementFamilyQuery()\n");
  console.log("2. Transporte de sinais");
  console.log("   • classifyMiaTurn → cognitiveTurn.signals.isSoftDisagreement");
  console.log("   • buildRoutingDecision via cognitiveRoutingSignal.isSoftDisagreement");
  console.log("   • Handler via isSoftDisagreement + family query + routing hold\n");
  console.log("3. Bridge / Contract (lib/miaCognitiveBridge.js)");
  console.log("   • OBJECTION ancorado → contextAction=decision (legacy compat)");
  console.log("   • Sem intent dedicado soft_disagreement no bridge — handler promove via sinal/router hold\n");
  console.log("4. Routing (lib/miaRoutingDecisionContract.js PATCH 7.7P)");
  console.log("   • Hold soft_disagreement em ~591 — DEPOIS de context_question/decision (~418)");
  console.log("   • conversationAct=soft_disagreement | hint soft_disagreement_reply/_anchored");
  console.log("   • Exige !hasClearNewCommercialSearch (espelha CC, diferente de SV)\n");
  console.log("5. Response Path (pages/api/chat-gpt4o.js PATCH 7.7Q)");
  console.log("   • Gate: !clearNewSearch && (isSoftDisagreement | family query | routing hold)");
  console.log("   • intent=soft_disagreement → buildMiaSystemPromptByRole(soft_disagreement_reply)\n");
  console.log("6. Resposta final (lib/miaPrompt.js role soft_disagreement_reply)");
  console.log("   • Cold: pede qual ponto não convenceu");
  console.log("   • Anchored: acolhe resistência + revisa ponto sem empurrar winner\n");
}

function evaluatePositive(group, phrase, hasActiveAnchor) {
  return {
    kind: "positive",
    group: group.id,
    groupLabel: group.label,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ...simulateFullStack(phrase, hasActiveAnchor),
  };
}

function evaluateNegative(spec) {
  const trace = simulateFullStack(spec.input, true);
  const leaked =
    trace.classification.isSoftDisagreement ||
    isSoftDisagreementFamilyQuery(spec.input) ||
    trace.response.responsePathFinal === "soft_disagreement_flow";
  return {
    kind: "negative",
    group: spec.group,
    input: spec.input,
    context: "anchored",
    leaked,
    dominantTurn: trace.classification.turnType,
    dominantAct: trace.routing.conversationAct,
    ...trace,
  };
}

printFlowMap();

console.log("PATCH 7.9X-G.1 — SOFT_DISAGREEMENT Flow Robustness Audit (AUDIT ONLY)\n");
console.log("HTTP usage: false | SerpAPI risk: false | Production changes: NONE\n");

const positiveRecords = [];
for (const group of POSITIVE_GROUPS) {
  for (const phrase of group.phrases) {
    positiveRecords.push(evaluatePositive(group, phrase, false));
    positiveRecords.push(evaluatePositive(group, phrase, true));
  }
}

const negativeRecords = NEGATIVE_GUARDS.map(evaluateNegative);

const posTotal = positiveRecords.length;
const posRouter = positiveRecords.filter((r) => r.layers.routerPass).length;
const posRouting = positiveRecords.filter((r) => r.layers.routingPass).length;
const posContract = positiveRecords.filter((r) => r.layers.contractPass).length;
const posResponse = positiveRecords.filter((r) => r.layers.responsePathPass).length;
const posFinal = positiveRecords.filter((r) => r.layers.finalResponsePass).length;
const posSim = positiveRecords.filter((r) => r.userPerception === "SIM").length;
const posPartial = positiveRecords.filter((r) => r.userPerception === "PARCIAL").length;
const posNo = positiveRecords.filter((r) => r.userPerception === "NÃO").length;

const negLeaks = negativeRecords.filter((r) => r.leaked).length;

console.log("── FASE 2 — Amostra de leaks (router OK, downstream falhou) ──\n");
for (const r of positiveRecords.filter((x) => x.layers.routerPass && !x.layers.finalResponsePass).slice(0, 8)) {
  console.log(`[${r.group}/${r.context}] "${r.input}"`);
  console.log(`  ROUTING: act=${r.routing.conversationAct} hint=${r.routing.responsePathHint} clear=${r.routing.clearNewSearch}`);
  console.log(`  CONTRACT: bridge=${r.bridge.toIntent} contextAction=${r.bridge.contextAction}`);
  console.log(`  PATH: ${r.response.responsePathFinal} effectiveIntent=${r.response.effectiveIntent}`);
  console.log(`  LEAKS: ${r.leaks.map((l) => l.type).join(", ")}`);
  console.log("");
}

console.log(`── FASE 3 — Suite positiva (${posTotal} cenários) ──\n`);
console.log("Grupo | Ctx | Frase | Rtr | Rtg | Ctr | Path | Final | Perc");
console.log("-".repeat(110));
for (const r of positiveRecords) {
  const mark = (ok) => (ok ? "✓" : "✗");
  console.log(
    `${r.group} | ${r.context.padEnd(7)} | ${r.input.slice(0, 28).padEnd(28)} | ${mark(r.layers.routerPass)} | ${mark(r.layers.routingPass)} | ${mark(r.layers.contractPass)} | ${mark(r.layers.responsePathPass)} | ${mark(r.layers.finalResponsePass)} | ${r.userPerception}`
  );
}

console.log(`\n── FASE 3b — Guardas negativas (${negativeRecords.length} cenários, anchored) ──\n`);
for (const r of negativeRecords) {
  console.log(`  ${r.leaked ? "✗ LEAK" : "✓ OK"} [${r.group}] "${r.input}" → ${r.dominantTurn}/${r.dominantAct || "-"}`);
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
console.log(`Negativos leak SD:${negLeaks}/${negativeRecords.length}`);

console.log("\n── Por contexto (router / routing / full stack) ──\n");
for (const ctx of ["cold", "anchored"]) {
  const rows = positiveRecords.filter((r) => r.context === ctx);
  const rPass = rows.filter((r) => r.layers.routerPass).length;
  const rtPass = rows.filter((r) => r.layers.routingPass).length;
  const fPass = rows.filter((r) => r.layers.finalResponsePass).length;
  console.log(
    `  ${ctx.padEnd(8)}: router ${rPass}/${rows.length} (${pct(rPass, rows.length)}%) | routing ${rtPass}/${rows.length} (${pct(rtPass, rows.length)}%) | full ${fPass}/${rows.length} (${pct(fPass, rows.length)}%)`
  );
}

console.log("\n── Por grupo (router / routing / full stack) ──\n");
for (const group of POSITIVE_GROUPS) {
  const rows = positiveRecords.filter((r) => r.group === group.id);
  const rPass = rows.filter((r) => r.layers.routerPass).length;
  const rtPass = rows.filter((r) => r.layers.routingPass).length;
  const fPass = rows.filter((r) => r.layers.finalResponsePass).length;
  console.log(
    `  Grupo ${group.id} (${group.label}): router ${rPass}/${rows.length} (${pct(rPass, rows.length)}%) | routing ${rtPass}/${rows.length} (${pct(rtPass, rows.length)}%) | full ${fPass}/${rows.length} (${pct(fPass, rows.length)}%)`
  );
}

const leakCounts = {};
for (const r of positiveRecords) {
  for (const leak of r.leaks) {
    leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
  }
}

console.log("\n── Vazamentos por tipo (positivos) ──\n");
if (Object.keys(leakCounts).length === 0) {
  console.log("  (nenhum)");
} else {
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

const uniquePatterns = new Map();
for (const r of positiveRecords) {
  for (const leak of r.leaks) {
    const key = `${leak.type}::${leak.detail}`;
    if (!uniquePatterns.has(key)) uniquePatterns.set(key, []);
    uniquePatterns.get(key).push(`[${r.context}] "${r.input}"`);
  }
}

console.log("\n── Causa raiz (padrões únicos) ──\n");
for (const [key, examples] of uniquePatterns.entries()) {
  const [type, detail] = key.split("::");
  console.log(`  ${type}`);
  console.log(`    ${detail}`);
  console.log(`    Frequência: ${examples.length} | Ex.: ${examples.slice(0, 2).join("; ")}`);
  console.log("");
}

console.log("── Veredito ──\n");
const routerScore = (posRouter / posTotal) * 100;
const routingScore = (posRouting / posTotal) * 100;
const fullScore = (posFinal / posTotal) * 100;
const negClean = negLeaks === 0;

const routingRobust = routingScore >= 90;
const fullRobust = fullScore >= 90 && negClean;

if (routerScore >= 90 && routingRobust && fullRobust) {
  console.log("A) SOFT_DISAGREEMENT FULL STACK ROBUST");
} else {
  console.log("B) SOFT_DISAGREEMENT POSSUI GAP FULL STACK");
  if (routerScore >= 90 && !routingRobust) {
    console.log(
      `   Router robusto (${pct(posRouter, posTotal)}%) mas Routing hold ${pct(posRouting, posTotal)}% — handler pode compensar (${pct(posResponse, posTotal)}% path).`
    );
  }
  if (routerScore < 90) {
    console.log(`   Router ${pct(posRouter, posTotal)}% — gaps de vocabulário ou colisão upstream.`);
  }
  if (!fullRobust) {
    console.log(`   Resposta final ${pct(posFinal, posTotal)}% | negativos leak ${negLeaks}.`);
  }
}

console.log("\n── Recomendação (audit-only) ──\n");
if (routingRobust && fullRobust) {
  console.log("Próximo patch sugerido: PATCH 7.9X-H.1 — Comprehension Flow Robustness Audit");
} else if (routerScore >= 90 && !routingRobust && fullScore >= 90) {
  console.log("PATCH 7.9X-G.2 — Soft Disagreement Routing Hold Authority");
  console.log("  Mover hold soft_disagreement ANTES de context_question/decision (~418), espelhar 7.9X-E.3 / 7.8O.");
  console.log("  Opcional: isSoftDisagreementFamilyQuery guard em miaRoutingSafety.js para contextAction=decision.");
} else if (routerScore >= 90 && fullScore < 90) {
  console.log("Investigar camada dominante nos leaks acima (response path / verbalization).");
} else {
  console.log("Priorizar Router/colision audit antes de flow patches downstream.");
}

console.log("\nPATCH 7.9X-G.1 audit COMPLETE — AUDIT ONLY\n");
process.exit(negClean && routingRobust && fullRobust ? 0 : 1);
