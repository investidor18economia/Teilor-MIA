/**
 * PATCH 7.9X-D.1 — ANTI_REGRET Flow Robustness Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge/Contract → Routing → Response Path → User perception.
 * Does NOT modify production behavior.
 *
 * Usage: node scripts/test-mia-antiregret-flow-robustness-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAntiRegretFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
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

const ROBUSTNESS_GROUPS = [
  {
    id: "A",
    label: "medo explícito",
    phrases: [
      "tenho medo de errar",
      "não quero me arrepender",
      "tenho medo de tomar decisão errada",
      "receio de comprar errado",
      "tenho medo de escolher errado",
      "não quero fazer besteira",
      "não quero errar nessa compra",
      "vou me arrepender?",
    ],
  },
  {
    id: "B",
    label: "medo implícito",
    phrases: [
      "é muito dinheiro pra mim",
      "essa escolha me preocupa",
      "não quero gastar errado",
      "estou receoso com essa compra",
      "me dá insegurança gastar isso",
      "fico pensando se vale o risco",
      "tenho receio de investir errado",
      "não quero jogar dinheiro fora",
    ],
  },
  {
    id: "C",
    label: "linguagem coloquial",
    phrases: [
      "tô com receio",
      "tô cabreiro",
      "tô inseguro nessa",
      "tô meio receoso",
      "tô com o pé atrás",
      "tô na dúvida se é seguro",
      "tô apreensivo com essa compra",
      "tô meio cabreiro com isso",
    ],
  },
  {
    id: "D",
    label: "confirmação emocional",
    phrases: [
      "acha que vou me arrepender?",
      "você realmente iria nele?",
      "essa compra é segura?",
      "posso comprar tranquilo?",
      "é uma compra segura?",
      "dá pra comprar sem medo?",
      "não vou me arrepender depois?",
      "posso ficar sossegado?",
    ],
  },
  {
    id: "E",
    label: "frases indiretas",
    phrases: [
      "quero ficar tranquilo depois da compra",
      "quero comprar uma vez só",
      "quero evitar dor de cabeça",
      "quero uma escolha tranquila",
      "quero algo que não me incomode depois",
      "quero evitar problema depois",
      "quero decidir com calma",
      "quero não passar sufoco depois",
    ],
  },
];

function buildOpenAntiRegretPreview() {
  return "Entendo a preocupação. Para avaliar o risco de arrependimento com honestidade, preciso saber qual compra estamos decidindo.";
}

function buildAnchoredAntiRegretPreview() {
  return "Entendo a preocupação. Mantendo Produto Recomendado Atual como referência, a escolha faz sentido pelo que vimos — mas vale confirmar preço, loja e condição antes de fechar, para reduzir arrependimento.";
}

function buildDecisionContextPreview() {
  return "Resposta via branch decision/context_question — explicação contextual genérica, sem fluxo anti_regret dedicado.";
}

function hasAntiRegretRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "anti_regret" ||
    routingDecision.responsePathHint === "anti_regret_reply" ||
    routingDecision.responsePathHint === "anti_regret_anchored"
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
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
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

  const routerPass =
    !!cognitiveTurn.signals?.isAntiRegret &&
    isAntiRegretFamilyQuery(message) &&
    cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  const routingPass =
    !openedNewSearch &&
    hasAntiRegretRoutingHold(routingDecision) &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const bridgeIntent = bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent;
  const contractPass =
    routingPass &&
    guardResult.contextAction !== "search" &&
    bridgeIntent === "anti_regret" &&
    guardResult.contextAction === "anti_regret";

  // Mirror PATCH 7.8H handler gate (chat-gpt4o.js)
  const handlerAntiRegretGate =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isAntiRegret === true ||
      isAntiRegretFamilyQuery(message) ||
      hasAntiRegretRoutingHold(routingDecision)
    );

  let responsePathFinal = "unknown";
  let finalResponsePreview = "";
  let genericFallbackDetected = false;

  if (openedNewSearch) {
    responsePathFinal = "default_product_search";
    finalResponsePreview = "(busca comercial — sem redução de risco emocional)";
  } else if (handlerAntiRegretGate) {
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
    finalResponsePreview = buildDecisionContextPreview();
  } else if (!hasActiveAnchor && !openedNewSearch) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = GENERIC_WELCOME_DIRECT_REPLY;
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else {
    responsePathFinal =
      routingDecision.responsePathHint || routingDecision.mode || "unknown";
    finalResponsePreview = `(path=${responsePathFinal})`;
  }

  const responsePathPass = responsePathFinal === "anti_regret_flow";
  const finalResponsePass =
    responsePathPass && !genericFallbackDetected && handlerAntiRegretGate;

  const userPerception = assessUserPerception({
    responsePathFinal,
    finalResponsePreview,
    genericFallbackDetected,
    handlerAntiRegretGate,
    hasActiveAnchor,
    routerPass,
  });

  const leaks = classifyLeaks({
    routerPass,
    routingPass,
    contractPass,
    responsePathPass,
    finalResponsePass,
    handlerAntiRegretGate,
    clearNewSearch,
    routingDecision,
    guardResult,
    bridgeIntent,
    openedNewSearch,
  });

  return {
    classification: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      detectorMatch: isAntiRegretFamilyQuery(message),
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
      negativeNonCommercial: isNegativeNonCommercialDesire(message),
      openedNewSearch,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    },
    response: {
      handlerAntiRegretGate,
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
  if (ctx.responsePathFinal === "anti_regret_flow" && !ctx.genericFallbackDetected) {
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
    leaks.push({
      type: "ROUTER LEAK",
      detail: "ANTI_REGRET não reconhecido — intenção de redução de risco não capturada",
    });
  }
  if (ctx.routerPass && !ctx.routingPass) {
    leaks.push({
      type: "ROUTING LEAK",
      detail: `Router OK mas routing=${ctx.routingDecision.conversationAct || ctx.routingDecision.mode} (hint=${ctx.routingDecision.responsePathHint})`,
    });
  }
  if (ctx.routingPass && !ctx.contractPass) {
    leaks.push({
      type: "CONTRACT LEAK",
      detail: `Bridge intent=${ctx.bridgeIntent} contextAction=${ctx.guardResult.contextAction}`,
    });
  }
  if (ctx.routerPass && ctx.handlerAntiRegretGate && !ctx.responsePathPass) {
    leaks.push({
      type: "RESPONSE LEAK",
      detail: `Handler gate true mas path=${ctx.responsePathFinal}`,
    });
  }
  if (ctx.routerPass && !ctx.handlerAntiRegretGate && ctx.clearNewSearch) {
    leaks.push({
      type: "RESPONSE LEAK",
      detail: "earlyClearNewCommercialSearch bloqueia anti_regret_flow apesar de isAntiRegret=true",
    });
  }
  if (ctx.responsePathPass && !ctx.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION LEAK",
      detail: "Fluxo correto mas resposta genérica ou fallback institucional",
    });
  }
  if (
    ctx.routerPass &&
    ctx.guardResult.contextAction === "decision" &&
    !hasAntiRegretRoutingHold(ctx.routingDecision)
  ) {
    leaks.push({
      type: "ROUTING LEAK",
      detail: "Bridge OBJECTION→decision intercepta antes do hold anti_regret (context_question)",
    });
  }
  return leaks;
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function printFlowMap() {
  console.log("── FASE 1 — Mapa do fluxo ANTI_REGRET ──\n");
  console.log("1. Classificação (Cognitive Router — lib/miaCognitiveRouter.js)");
  console.log("   • detectsAntiRegretSignal / detectsNaturalAntiRegretSignal (PATCH 7.9X-D)");
  console.log("   • buildTurnSignals → signals.isAntiRegret");
  console.log("   • resolveTurnTypeFromSignals step 2.10 → CONVERSATIONAL (cold) | OBJECTION (anchored)");
  console.log("   • Export: isAntiRegretFamilyQuery()\n");
  console.log("2. Transporte de sinais");
  console.log("   • classifyMiaTurn → cognitiveTurn.signals.isAntiRegret");
  console.log("   • buildRoutingDecision via cognitiveRoutingSignal.isAntiRegret");
  console.log("   • Handler via cognitiveTurnEarly.signals.isAntiRegret + isAntiRegretFamilyQuery()\n");
  console.log("3. Bridge / Contract (lib/miaCognitiveBridge.js)");
  console.log("   • OBJECTION + isAntiRegret → intent/contextAction=anti_regret (PATCH 7.9X-D.3)");
console.log("   • OBJECTION genérico continua → decision quando isAntiRegret=false");
  console.log("   • guardContextActionWithCognitiveBridge preserva decision para OBJECTION ancorado\n");
  console.log("4. Routing (lib/miaRoutingDecisionContract.js PATCH 7.8G)");
  console.log("   • Hold anti_regret: !clearNewCommercialSearch + (isAntiRegret | family query + CONVERSATIONAL/OBJECTION)");
  console.log("   • ⚠ contextAction=decision → context_question (linha ~307) ANTES do hold anti_regret (~542)\n");
  console.log("5. Response Path (pages/api/chat-gpt4o.js PATCH 7.8H)");
  console.log("   • Gate: !earlyClearNewCommercialSearch && (isAntiRegret | family query | routing hold)");
  console.log("   • intent=anti_regret → buildMiaSystemPromptByRole(anti_regret_reply) → anti_regret_flow\n");
  console.log("6. Resposta final (lib/miaPrompt.js role anti_regret_reply)");
  console.log("   • Cold: pede contexto + reduz ansiedade abertamente");
  console.log("   • Anchored: reafirma winner + evidências + ressalvas honestas\n");
}

function evaluateScenario(group, phrase, hasActiveAnchor) {
  const trace = simulateFullStack(phrase, hasActiveAnchor);
  return {
    group: group.id,
    groupLabel: group.label,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ...trace,
  };
}

printFlowMap();

console.log("PATCH 7.9X-D.1 — ANTI_REGRET Flow Robustness Audit (AUDIT ONLY)\n");
console.log("HTTP usage: false | SerpAPI risk: false | Production changes: NONE\n");

const records = [];
for (const group of ROBUSTNESS_GROUPS) {
  for (const phrase of group.phrases) {
    records.push(evaluateScenario(group, phrase, false));
    records.push(evaluateScenario(group, phrase, true));
  }
}

const total = records.length;
const routerOk = records.filter((r) => r.layers.routerPass).length;
const routingOk = records.filter((r) => r.layers.routingPass).length;
const contractOk = records.filter((r) => r.layers.contractPass).length;
const responseOk = records.filter((r) => r.layers.responsePathPass).length;
const finalOk = records.filter((r) => r.layers.finalResponsePass).length;
const perceptionSim = records.filter((r) => r.userPerception === "SIM").length;
const perceptionPartial = records.filter((r) => r.userPerception === "PARCIAL").length;
const perceptionNo = records.filter((r) => r.userPerception === "NÃO").length;

console.log("── FASE 2 — Full stack trace (amostra: falhas de routing com router OK) ──\n");
const routingLeakSamples = records
  .filter((r) => r.layers.routerPass && !r.layers.routingPass)
  .slice(0, 6);

for (const r of routingLeakSamples) {
  console.log(`[${r.group}/${r.context}] "${r.input}"`);
  console.log(`  CLASSIFICATION: turn=${r.classification.turnType} isAntiRegret=${r.classification.isAntiRegret}`);
  console.log(`  ROUTING: act=${r.routing.conversationAct} hint=${r.routing.responsePathHint} clearNewSearch=${r.routing.clearNewSearch}`);
  console.log(`  CONTRACT: bridge=${r.bridge.toIntent} contextAction=${r.bridge.contextAction}`);
  console.log(`  RESPONSE PATH: ${r.response.responsePathFinal} handlerGate=${r.response.handlerAntiRegretGate}`);
  console.log(`  FINAL: ${r.response.finalResponsePreview.slice(0, 90)}...`);
  console.log(`  LEAKS: ${r.leaks.map((l) => l.type).join(", ") || "none"}`);
  console.log("");
}

console.log("── FASE 3 — Robustness suite (40 frases × 2 contextos = 80 cenários) ──\n");
console.log(
  "Grupo | Contexto | Frase | Router | Routing | Contract | Path | Final | Percepção"
);
console.log("-".repeat(120));

for (const r of records) {
  const mark = (ok) => (ok ? "✓" : "✗");
  console.log(
    `${r.group} | ${r.context.padEnd(8)} | ${r.input.slice(0, 32).padEnd(32)} | ${mark(r.layers.routerPass)} | ${mark(r.layers.routingPass)} | ${mark(r.layers.contractPass)} | ${mark(r.layers.responsePathPass)} | ${mark(r.layers.finalResponsePass)} | ${r.userPerception}`
  );
}

console.log("\n── FASE 4 — Taxa de sucesso por camada ──\n");
console.log(`Total cenários: ${total}`);
console.log(`Router:         ${routerOk}/${total} (${pct(routerOk, total)}%)`);
console.log(`Routing:        ${routingOk}/${total} (${pct(routingOk, total)}%)`);
console.log(`Contract:       ${contractOk}/${total} (${pct(contractOk, total)}%)`);
console.log(`Response Path:  ${responseOk}/${total} (${pct(responseOk, total)}%)`);
console.log(`Resposta Final: ${finalOk}/${total} (${pct(finalOk, total)}%)`);
console.log(`Percepção SIM:  ${perceptionSim}/${total} (${pct(perceptionSim, total)}%)`);
console.log(`Percepção PARCIAL: ${perceptionPartial}/${total} (${pct(perceptionPartial, total)}%)`);
console.log(`Percepção NÃO:  ${perceptionNo}/${total} (${pct(perceptionNo, total)}%)`);

console.log("\n── Por grupo (router / full stack) ──\n");
for (const group of ROBUSTNESS_GROUPS) {
  const rows = records.filter((r) => r.group === group.id);
  const rPass = rows.filter((r) => r.layers.routerPass).length;
  const fPass = rows.filter((r) => r.layers.finalResponsePass).length;
  console.log(
    `  Grupo ${group.id} (${group.label}): router ${rPass}/${rows.length} (${pct(rPass, rows.length)}%) | full ${fPass}/${rows.length} (${pct(fPass, rows.length)}%)`
  );
}

const leakCounts = {};
for (const r of records) {
  for (const leak of r.leaks) {
    leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
  }
}

console.log("\n── FASE 4 — Vazamentos por tipo ──\n");
for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count} ocorrências em ${total} cenários`);
}

const uniquePatterns = new Map();
for (const r of records) {
  for (const leak of r.leaks) {
    const key = `${leak.type}::${leak.detail}`;
    if (!uniquePatterns.has(key)) uniquePatterns.set(key, []);
    uniquePatterns.get(key).push(`[${r.context}] "${r.input}"`);
  }
}

console.log("\n── Padrões de vazamento (causa raiz) ──\n");
for (const [key, examples] of uniquePatterns.entries()) {
  const [type, detail] = key.split("::");
  console.log(`  ${type}`);
  console.log(`    Causa: ${detail}`);
  console.log(`    Frequência: ${examples.length} | Ex.: ${examples.slice(0, 2).join("; ")}`);
  console.log("");
}

console.log("── FASE 5 — User perception (amostra negativa) ──\n");
for (const r of records.filter((x) => x.userPerception === "NÃO").slice(0, 8)) {
  console.log(
    `  NÃO — [${r.context}] "${r.input}" → path=${r.response.responsePathFinal} | router=${r.layers.routerPass}`
  );
}

console.log("\n── FASE 6 — Causa raiz documentada ──\n");
console.log("GAP A — Routing precedence (anchored):");
console.log("  Bridge mapeia OBJECTION→contextAction=decision. buildRoutingDecision trata");
console.log("  contextAction=decision em ~L307 ANTES do hold anti_regret (~L542).");
console.log("  Resultado: conversationAct=context_question em vez de anti_regret.\n");
console.log("GAP B — clearNewCommercialSearch (cold, frases com 'quero...'):");
console.log("  resolveClearNewCommercialSearchForRouting marca true para 'quero evitar...',");
console.log("  'quero uma escolha tranquila', etc. Guard emocional cobre só 'não quero...'.");
console.log("  Hold anti_regret exige !clearNewCommercialSearch → cai em explicit_new_search.\n");
console.log("GAP C — Handler gate bloqueado por earlyClearNewCommercialSearch:");
console.log("  Mesmo com isAntiRegret=true, chat-gpt4o.js PATCH 7.8H exige !earlyClearNewCommercialSearch.");
console.log("  Cold 'quero...' perde anti_regret_flow → busca ou welcome genérico.\n");
console.log("GAP D — Vocabulário não expandido (grupos B/C parcial):");
console.log("  Frases implícitas/coloquiais ('tô cabreiro', 'muito dinheiro pra mim') ainda");
console.log("  não passam no Router — gap separado do routing, mas impacta full stack.\n");

console.log("── Veredito ──\n");
const routerScore = (routerOk / total) * 100;
const fullScore = (finalOk / total) * 100;

if (routerScore >= 90 && fullScore >= 90) {
  console.log("ANTI_REGRET FULLY_CLOSED REALMENTE — full stack consistente.");
} else if (routerScore >= 90 && fullScore < 90) {
  console.log("ANTI_REGRET POSSUI GAP FULL STACK");
  console.log(`  Router robusto (${pct(routerOk, total)}%) mas resposta final ${pct(finalOk, total)}%.`);
  console.log("  Classificação ≠ entrega de redução de risco em todas as formas naturais.");
} else {
  console.log("ANTI_REGRET POSSUI GAP FULL STACK (Router + downstream)");
}

console.log("\n── Recomendação (audit-only, sem implementar) ──\n");
console.log("Próximo patch corretivo sugerido: PATCH 7.9X-D.2 — ANTI_REGRET Routing Hold Authority");
console.log("  1. Elevar hold anti_regret ANTES de contextAction=decision quando isAntiRegret=true");
console.log("  2. Estender isNegativeNonCommercialDesire para 'quero evitar/evitar dor de cabeça/escolha tranquila'");
console.log("3. Bridge: exceção OBJECTION+isAntiRegret → intent anti_regret (PATCH 7.9X-D.3 — DONE)");
console.log("4. Expansão Router grupos B/C (medo implícito/coloquial) — PATCH 7.9X-D.4");
console.log("\nPATCH 7.9X-D.1 audit COMPLETE — AUDIT ONLY\n");

process.exit(0);
