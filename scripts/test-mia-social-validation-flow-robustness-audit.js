/**
 * PATCH 7.9X-F.1 — SOCIAL_VALIDATION Flow Robustness Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge/Contract → Routing → Response Path → User perception.
 * Does NOT modify production behavior unless a microfix is explicitly approved post-audit.
 *
 * Usage: node scripts/test-mia-social-validation-flow-robustness-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isSocialValidationFamilyQuery,
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
    label: "recomendação coletiva",
    phrases: [
      "a galera recomenda?",
      "o pessoal recomenda?",
      "o povo recomenda?",
      "geral recomenda?",
      "muita gente indica?",
      "é uma escolha bem indicada?",
    ],
  },
  {
    id: "B",
    label: "reputação pública",
    phrases: [
      "é bem visto?",
      "tem boa reputação?",
      "falam bem dele?",
      "o povo fala bem?",
      "tem fama boa?",
      "é conhecido por ser confiável?",
    ],
  },
  {
    id: "C",
    label: "experiência de quem usa",
    phrases: [
      "quem comprou gostou?",
      "quem usa gosta?",
      "donos costumam gostar?",
      "quem tem recomenda?",
      "quem comprou se arrepende?",
      "o pessoal que usa reclama?",
    ],
  },
  {
    id: "D",
    label: "reclamações e risco social",
    phrases: [
      "costuma dar problema?",
      "tem muita reclamação?",
      "reclamam muito dele?",
      "dá dor de cabeça para muita gente?",
      "tem algum problema famoso?",
      "tem histórico ruim?",
    ],
  },
  {
    id: "E",
    label: "consenso / maioria",
    phrases: [
      "a maioria aprova?",
      "no geral é aprovado?",
      "o consenso é bom?",
      "geral gosta?",
      "é bem aceito?",
      "costuma agradar?",
    ],
  },
  {
    id: "F",
    label: "validação prática externa",
    phrases: [
      "na prática o pessoal gosta?",
      "fora da ficha técnica ele é aprovado?",
      "no uso real falam bem?",
      "quem usa no dia a dia aprova?",
      "a experiência real é boa?",
      "donos costumam elogiar?",
    ],
  },
  {
    id: "G",
    label: "frases compostas",
    phrases: [
      "entendi, mas a galera recomenda?",
      "beleza, o povo fala bem?",
      "gostei dele, mas quem comprou gostou?",
      "faz sentido, mas tem muita reclamação?",
      "acho que vou nele, mas é bem visto?",
    ],
  },
];

const NEGATIVE_GUARDS = [
  { group: "CC", input: "você tem certeza?" },
  { group: "CC", input: "ainda recomenda esse?" },
  { group: "CC", input: "você manteria essa recomendação?" },
  { group: "AR", input: "tenho medo de errar" },
  { group: "AR", input: "não quero me arrepender" },
  { group: "AR", input: "tô cabreiro" },
  { group: "AR", input: "é muito dinheiro pra mim" },
  { group: "AR", input: "quero evitar dor de cabeça, mas o pessoal gosta?" },
  { group: "SD", input: "não me convenceu" },
  { group: "SD", input: "estou com um pé atrás" },
  { group: "SD", input: "não curti muito" },
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

function buildIdealSocialValidationPreview(hasAnchor) {
  if (hasAnchor) {
    return "Sobre validação externa de Produto Recomendado Atual: não tenho reviews reais agregados aqui, mas pelo perfil técnico e uso típico costuma ser bem aceito — sem inventar nota ou volume de opiniões.";
  }
  return "Consigo falar de reputação e aceitação coletiva, mas preciso saber qual produto ou escolha estamos discutindo.";
}

function hasSocialValidationRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "social_validation" ||
    routingDecision.responsePathHint === "social_validation_reply" ||
    routingDecision.responsePathHint === "social_validation_anchored"
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
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
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
    ? cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
    : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL;

  const routerPass =
    !!cognitiveTurn.signals?.isSocialValidation &&
    isSocialValidationFamilyQuery(message) &&
    idealTurn &&
    cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  const routingPass =
    !openedNewSearch &&
    hasSocialValidationRoutingHold(routingDecision) &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const handlerSocialValidationGate =
    cognitiveTurn.signals?.isSocialValidation === true ||
    isSocialValidationFamilyQuery(message) ||
    hasSocialValidationRoutingHold(routingDecision);

  const bridgeIntent = bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent;
  const contractPass =
    routingPass &&
    handlerSocialValidationGate &&
    guardResult.contextAction !== "search";

  let responsePathFinal = "unknown";
  let finalResponsePreview = "";
  let genericFallbackDetected = false;
  let effectiveIntent = bridgeIntent;

  if (openedNewSearch) {
    responsePathFinal = "default_product_search";
    finalResponsePreview = "(busca comercial — sem validação social)";
  } else if (handlerSocialValidationGate) {
    responsePathFinal = "social_validation_flow";
    effectiveIntent = "social_validation";
    finalResponsePreview = buildIdealSocialValidationPreview(hasActiveAnchor);
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else if (!hasActiveAnchor && !openedNewSearch) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = GENERIC_WELCOME_DIRECT_REPLY;
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else if (
    hasActiveAnchor &&
    guardResult.contextAction === "decision" &&
    routingDecision.conversationAct !== "social_validation"
  ) {
    responsePathFinal = "decision_context_branch";
    finalResponsePreview =
      "Resposta via branch decision/context_question — explicação genérica, sem social_validation_flow.";
  } else {
    responsePathFinal =
      routingDecision.responsePathHint || routingDecision.mode || "unknown";
    finalResponsePreview = `(path=${responsePathFinal})`;
  }

  const responsePathPass = responsePathFinal === "social_validation_flow";
  const finalResponsePass =
    responsePathPass && !genericFallbackDetected && handlerSocialValidationGate;

  const userPerception = assessUserPerception({
    responsePathFinal,
    finalResponsePreview,
    genericFallbackDetected,
    handlerSocialValidationGate,
    hasActiveAnchor,
    routerPass,
  });

  const leaks = classifyLeaks({
    routerPass,
    idealTurn,
    routingPass,
    contractPass,
    responsePathPass,
    finalResponsePass,
    handlerSocialValidationGate,
    clearNewSearch,
    routingDecision,
    guardResult,
    bridgeIntent,
    bridgeAudit,
    openedNewSearch,
    cognitiveTurn,
    hasActiveAnchor,
  });

  return {
    classification: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      detectorMatch: isSocialValidationFamilyQuery(message),
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
      handlerSocialValidationGate,
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
  if (ctx.responsePathFinal === "social_validation_flow" && !ctx.genericFallbackDetected) {
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
    if (!ctx.cognitiveTurn.signals?.isSocialValidation) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: "SOCIAL_VALIDATION não reconhecido — validação externa não capturada",
      });
    } else if (!ctx.idealTurn) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: `turnType=${ctx.cognitiveTurn.turnType} — esperado EXPLANATION_REQUEST (anchored) ou CONVERSATIONAL (cold)`,
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
  if (ctx.routingPass && !ctx.contractPass) {
    leaks.push({
      type: "CONTRACT_LEAK",
      detail: `Bridge intent=${ctx.bridgeIntent} contextAction=${ctx.guardResult.contextAction} handlerGate=${ctx.handlerSocialValidationGate}`,
    });
  }
  if (
    ctx.routerPass &&
    ctx.bridgeAudit.active &&
    ctx.guardResult.contextAction === "decision" &&
    !hasSocialValidationRoutingHold(ctx.routingDecision)
  ) {
    leaks.push({
      type: "BRIDGE_LEAK",
      detail: "EXPLANATION_REQUEST→decision intercepta antes do hold social_validation",
    });
  }
  if (ctx.routerPass && ctx.handlerSocialValidationGate && !ctx.responsePathPass) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `Handler gate true mas path=${ctx.responsePathFinal}`,
    });
  }
  if (ctx.routerPass && !ctx.handlerSocialValidationGate && ctx.clearNewSearch) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: "clearNewCommercialSearch ou gate bloqueia social_validation_flow apesar de isSocialValidation=true",
    });
  }
  if (ctx.responsePathPass && !ctx.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION_LEAK",
      detail: "Fluxo correto mas resposta genérica ou fallback institucional",
    });
  }
  if (ctx.routerPass && ctx.finalResponsePass && ctx.userPerception === "NÃO") {
    leaks.push({
      type: "USER_PERCEPTION_LEAK",
      detail: "Stack técnico passou mas percepção não trata validação externa",
    });
  }
  return leaks;
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function printFlowMap() {
  console.log("── FASE 1 — Mapa do fluxo SOCIAL_VALIDATION ──\n");
  console.log("1. Classificação (lib/miaCognitiveRouter.js)");
  console.log("   • detectsSocialValidationSignal / detectsNaturalSocialValidationSignal (PATCH 7.9X-F)");
  console.log("   • buildTurnSignals → signals.isSocialValidation");
  console.log("   • resolveTurnTypeFromSignals step 2.12 → CONVERSATIONAL (cold) | EXPLANATION_REQUEST (anchored)");
  console.log("   • Export: isSocialValidationFamilyQuery()\n");
  console.log("2. Transporte de sinais");
  console.log("   • classifyMiaTurn → cognitiveTurn.signals.isSocialValidation");
  console.log("   • buildRoutingDecision via cognitiveRoutingSignal.isSocialValidation");
  console.log("   • Handler via isSocialValidation + family query + routing hold\n");
  console.log("3. Bridge / Contract (lib/miaCognitiveBridge.js)");
  console.log("   • EXPLANATION_REQUEST ancorado → contextAction=decision (legacy compat)");
  console.log("   • Não há intent dedicado social_validation no bridge — handler promove via routing hold\n");
  console.log("4. Routing (lib/miaRoutingDecisionContract.js PATCH 7.8O)");
  console.log("   • Hold social_validation ANTES do hold genérico EXPLANATION_REQUEST");
  console.log("   • conversationAct=social_validation | hint social_validation_reply/_anchored");
  console.log("   • Não exige !hasClearNewCommercialSearch (diferente de CC)\n");
  console.log("5. Response Path (pages/api/chat-gpt4o.js PATCH 7.8P)");
  console.log("   • Gate: isSocialValidation | family query | routing hold (sem bloqueio por clearNewSearch)");
  console.log("   • intent=social_validation → buildMiaSystemPromptByRole(social_validation_reply)\n");
  console.log("6. Resposta final (lib/miaPrompt.js role social_validation_reply)");
  console.log("   • Cold: pede contexto + oferece falar de reputação/aceitação");
  console.log("   • Anchored: validação externa proporcional, sem inventar reviews\n");
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
    trace.classification.isSocialValidation ||
    isSocialValidationFamilyQuery(spec.input) ||
    trace.response.responsePathFinal === "social_validation_flow";
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

console.log("PATCH 7.9X-F.1 — SOCIAL_VALIDATION Flow Robustness Audit (AUDIT ONLY)\n");
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

console.log(`── FASE 3 — Suite positiva (${posTotal} cenários = ${posTotal / 2} frases × 2 contextos) ──\n`);
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
console.log(`Negativos leak SV:${negLeaks}/${negativeRecords.length}`);

console.log("\n── Por grupo (router / full stack) ──\n");
for (const group of POSITIVE_GROUPS) {
  const rows = positiveRecords.filter((r) => r.group === group.id);
  const rPass = rows.filter((r) => r.layers.routerPass).length;
  const fPass = rows.filter((r) => r.layers.finalResponsePass).length;
  console.log(
    `  Grupo ${group.id} (${group.label}): router ${rPass}/${rows.length} (${pct(rPass, rows.length)}%) | full ${fPass}/${rows.length} (${pct(fPass, rows.length)}%)`
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
const fullScore = (posFinal / posTotal) * 100;
const negClean = negLeaks === 0;

if (routerScore >= 90 && fullScore >= 90 && negClean) {
  console.log("A) SOCIAL_VALIDATION FULL STACK ROBUST");
} else if (routerScore >= 90 && fullScore < 90) {
  console.log("B) SOCIAL_VALIDATION POSSUI GAP FULL STACK");
  console.log(`   Router robusto (${pct(posRouter, posTotal)}%) mas resposta final ${pct(posFinal, posTotal)}%.`);
} else {
  console.log("B) SOCIAL_VALIDATION POSSUI GAP FULL STACK");
  if (routerScore < 90) {
    console.log(`   Router ${pct(posRouter, posTotal)}% — gaps de vocabulário ou colisão upstream.`);
  }
}

console.log("\n── Recomendação (audit-only) ──\n");
if (fullScore >= 90 && negClean) {
  console.log("Próximo patch sugerido: PATCH 7.9X-G.1 — Soft Disagreement Flow Robustness Audit");
} else if (routerScore >= 90 && fullScore < 90) {
  console.log("Investigar camada dominante nos leaks acima.");
  console.log("Se ROUTING/RESPONSE_PATH: patch dedicado de hold authority (espelhar 7.9X-E.3 se recomenda).");
  console.log("Se ROUTER: patch de expansão residual ou colisão cross-family.");
} else {
  console.log("Priorizar Router/colision audit antes de flow patches downstream.");
}

console.log("\nPATCH 7.9X-F.1 audit COMPLETE — AUDIT ONLY\n");
process.exit(negClean && fullScore >= 90 ? 0 : 1);
