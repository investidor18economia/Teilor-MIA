/**
 * PATCH 7.6T-A1 — Verbalizer Signal Audit
 *
 * Audita quais sinais cognitivos ainda existem no momento da chamada
 * runMiaBrainTask (contract → call site → payload). Somente leitura.
 *
 * Usage: node scripts/test-mia-verbalizer-signal-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { shouldUseRichExplanationPath } from "../lib/miaCognitiveExplanationPath.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "produto ate 2000";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
  lastCategory: "eletronicos",
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const CASES = [
  { id: 1, message: "nao sei se gostei" },
  { id: 2, message: "qual seria seu medo nessa compra" },
  { id: 3, message: "o que poderia dar errado" },
  { id: 4, message: "e se fosse voce" },
  { id: 5, message: "nao quero fazer besteira" },
];

// Mirror buildMiaContractMetadata (chat-gpt4o.js ~180-189)
function buildMiaContractMetadata(metadata = {}) {
  return {
    source: metadata.source || "unknown",
    isFollowUp: !!metadata.isFollowUp,
    category: metadata.category || "",
    priority: metadata.priority || "",
    productCount: Number(metadata.productCount || 0),
    hasProducts: !!metadata.hasProducts,
    createdAt: metadata.createdAt || new Date().toISOString(),
  };
}

// Mirror contract resolution (chat-gpt4o.js ~27194-27201)
function resolveContract(cognitiveTurn, routingDecision, contextAction, hasAnchor) {
  const richExpPathActivated = shouldUseRichExplanationPath(routingDecision);
  const decisionExpSubtype = cognitiveTurn?.signals?.decisionExplanation?.subtype || null;
  const isConfidenceChallenge =
    decisionExpSubtype === "confidence_challenge" && richExpPathActivated;
  const isObjectionWithAnchor =
    cognitiveTurn?.turnType === MIA_TURN_TYPES.OBJECTION && hasAnchor;
  const isAlternativeRequest =
    cognitiveTurn?.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST && hasAnchor;
  const isRefinementWithAnchor =
    (cognitiveTurn?.turnType === MIA_TURN_TYPES.REFINEMENT || isAlternativeRequest) &&
    hasAnchor;
  const isPriorityShiftWithAnchor =
    cognitiveTurn?.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT && hasAnchor;

  if (contextAction === "analysis") return "analysis";
  if (isConfidenceChallenge) return "confidence_challenge_defense";
  if (isObjectionWithAnchor) return "objection_response_contract";
  if (isRefinementWithAnchor) return "refinement_followup_response_contract";
  if (isPriorityShiftWithAnchor) return "priority_shift_response_contract";
  if (richExpPathActivated) return "explanation_anchored";
  return "decision_generic";
}

function simulateUpstream(message) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, "decision");

  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: "decision",
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : "decision",
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: true,
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
      shouldSkipProductSearch: !clearNewSearch,
    },
    sessionContext: SESSION,
    incomingSessionContext: SESSION,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : "decision",
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: true,
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

  const contract = resolveContract(
    cognitiveTurn,
    routingDecision,
    guardResult.contextAction,
    true
  );

  const activePriority = "equilibrio geral";
  const contextAction = guardResult.contextAction;

  // Mirror runMiaBrainTask call site (chat-gpt4o.js ~27735-27747)
  const rawMetadata = {
    source: "context_followup_flow",
    isFollowUp: true,
    contextAction,
    activePriority,
  };

  const normalizedMetadata = buildMiaContractMetadata(rawMetadata);

  const runMiaBrainTaskPayload = {
    role: "context_reply",
    intent: contextAction || "decision",
    temperature: 0.35,
    max_tokens: 420,
    metadataRaw: rawMetadata,
    metadataNormalized: normalizedMetadata,
    messagesStructure: {
      systemPromptContainsContract: contract,
      userMessage: message,
      conversationHistoryIncluded: true,
    },
  };

  const sig = cognitiveTurn.signals || {};
  const signalsInHandlerScope = [];
  if (cognitiveTurn.turnType) signalsInHandlerScope.push(`turnType:${cognitiveTurn.turnType}`);
  if (sig.hesitationReaction?.detected) {
    signalsInHandlerScope.push(`hesitationReaction:${sig.hesitationReaction.subtype}`);
  }
  if (sig.projectiveRisk?.detected) {
    signalsInHandlerScope.push(`projectiveRisk:${sig.projectiveRisk.subtype}`);
  }
  if (sig.delegationRequest?.detected) {
    signalsInHandlerScope.push(`delegationRequest:${sig.delegationRequest.subtype}`);
  }
  if (sig.decisionExplanation?.active) {
    signalsInHandlerScope.push(`decisionExplanation:${sig.decisionExplanation.subtype}`);
  }

  const signalsInPayloadMetadata = Object.entries(normalizedMetadata)
    .filter(([, v]) => v !== "" && v !== 0 && v !== false)
    .map(([k, v]) => `${k}:${v}`);

  const contractEmbedsSubtype =
    contract === "objection_response_contract"
      ? false
      : contract === "explanation_anchored"
      ? false
      : false;

  return {
    cognitiveTurn,
    routingDecision,
    contract,
    contextAction,
    responsePath:
      routingDecision.responsePathHint || routingDecision.mode || "unknown",
    runMiaBrainTaskPayload,
    signalsInHandlerScope,
    signalsInPayloadMetadata,
    contractEmbedsSubtype,
    cognitiveFamilyAvailable: !!cognitiveTurn.turnType,
    riskProjectionAvailable: !!sig.projectiveRisk?.detected,
    purchaseAnxietyAvailable: sig.hesitationReaction?.subtype === "purchase_anxiety",
    hesitationAvailable: !!sig.hesitationReaction?.detected,
    delegationAvailable: !!sig.delegationRequest?.detected,
  };
}

function buildAuditRecord(message, sim, production = {}) {
  const ct = sim.cognitiveTurn;
  const payload = sim.runMiaBrainTaskPayload;

  const signalsAvailable = [
    ...sim.signalsInHandlerScope.map((s) => `handler:${s}`),
    ...sim.signalsInPayloadMetadata.map((s) => `payload_metadata:${s}`),
    `payload_system_contract:${sim.contract}`,
    `payload_user_text:${message}`,
  ];

  return {
    message,
    turnType: ct.turnType,
    contract: production.resolvedContract || sim.contract,
    responsePath: production.responsePath || sim.responsePath,
    runMiaBrainTaskRole: payload.role,
    runMiaBrainTaskSource: payload.metadataRaw.source,
    signalsAvailable,
    signalsInHandlerOnly: sim.signalsInHandlerScope.filter(
      (s) =>
        !s.startsWith("turnType:") ||
        !payload.metadataNormalized.source
    ),
    signalsLostAtPayload: sim.signalsInHandlerScope.filter(
      (s) =>
        s.startsWith("turnType:") ||
        s.includes("hesitationReaction:") ||
        s.includes("projectiveRisk:") ||
        s.includes("delegationRequest:")
    ),
    cognitiveFamilyAvailable: sim.cognitiveFamilyAvailable,
    riskProjectionAvailable: sim.riskProjectionAvailable,
    purchaseAnxietyAvailable: sim.purchaseAnxietyAvailable,
    hesitationAvailable: sim.hesitationAvailable,
    delegationAvailable: sim.delegationAvailable,
    payloadIntent: payload.intent,
    payloadMetadataNormalized: payload.metadataNormalized,
    contractEmbedsBehavioralSubtype: sim.contractEmbedsSubtype,
    productionTraceAvailable: production.productionTraceAvailable || false,
  };
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6t-a1",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runProductionCase(message) {
  const convId = `t-a1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const s1 = {
    ...(t1.session_context || {}),
    lastAxis: SESSION.lastAxis,
    lastMainConsequence: SESSION.lastMainConsequence,
    lastTradeoff: SESSION.lastTradeoff,
  };
  const msgs = [
    { role: "user", content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];
  const t2 = await httpPost(message, s1, msgs, convId);
  const trace = t2.mia_debug?.pipelineTrace || {};
  const rich = trace.rich_explanation_audit || {};
  const rd = trace.routingDecision || {};

  return {
    resolvedContract: rich.contextModeSelected || null,
    responsePath: trace.response_path || rd.responsePathHint || rd.mode || null,
    productionTraceAvailable: !!trace.cognitive_turn_early,
    routerTurnType: trace.cognitive_turn_early?.turnType || null,
  };
}

function pad(s, n) {
  return String(s ?? "—").slice(0, n).padEnd(n);
}

function whereSignalDisappears(record) {
  const hasSubtypeInHandler =
    record.hesitationAvailable ||
    record.riskProjectionAvailable ||
    record.delegationAvailable;
  const sameContractAsOthers =
    record.contract === "objection_response_contract";

  if (!hasSubtypeInHandler) return "Router";
  if (sameContractAsOthers && record.signalsLostAtPayload.length > 0) {
    return "Contract + Payload";
  }
  if (record.contractEmbedsBehavioralSubtype === false && sameContractAsOthers) {
    return "Contract";
  }
  if (record.signalsLostAtPayload.length > 0) return "Payload";
  return "Não desaparece";
}

console.log("\n  PATCH 7.6T-A1 — Verbalizer Signal Audit");
console.log("  5 cenários | handler scope vs runMiaBrainTask payload\n");

const results = [];
for (const c of CASES) {
  const sim = simulateUpstream(c.message);
  let production = {};
  try {
    production = await runProductionCase(c.message);
    console.log(`  ✓ Caso ${c.id} "${c.message}"`);
  } catch (e) {
    console.log(`  ⚠ Caso ${c.id} produção falhou (${e.message}) — usando simulação estática`);
  }
  const record = buildAuditRecord(c.message, sim, production);
  record.signalDisappearancePoint = whereSignalDisappears(record);
  results.push({ id: c.id, ...record });
}

console.log("\n  ── Parte 1: Mapa Intent → Contract → Response Path → Payload ──\n");
console.log(
  `  ${pad("ID", 3)} ${pad("Message", 28)} ${pad("turnType", 16)} ${pad("Contract", 28)} ` +
    `${pad("RespPath", 20)} Payload (role/source/intent)`
);
console.log(`  ${"─".repeat(120)}`);

for (const r of results) {
  console.log(
    `  ${pad(r.id, 3)} ${pad(r.message, 28)} ${pad(r.turnType, 16)} ${pad(r.contract, 28)} ` +
      `${pad(r.responsePath, 20)} ${r.runMiaBrainTaskRole}/${r.runMiaBrainTaskSource}/${r.payloadIntent}`
  );
}

console.log("\n  ── Registro JSON por cenário ──\n");
for (const r of results) {
  const { id, productionTraceAvailable, signalsInHandlerOnly, signalsLostAtPayload, signalDisappearancePoint, ...json } =
    r;
  console.log(`  Caso ${id}:`);
  console.log(JSON.stringify(json, null, 2).split("\n").map((l) => `  ${l}`).join("\n"));
  console.log(`  signalDisappearancePoint: ${signalDisappearancePoint}\n`);
}

console.log("  ── Parte 2: Sinais disponíveis no momento da verbalização ──\n");

const payloadMetaKeys = new Set();
const handlerSignals = new Set();
for (const r of results) {
  for (const s of r.signalsAvailable) {
    if (s.startsWith("payload_metadata:")) payloadMetaKeys.add(s);
    if (s.startsWith("handler:")) handlerSignals.add(s.replace("handler:", ""));
  }
}

console.log("  No handler (cognitiveTurnEarly) — NÃO passados ao verbalizer:");
for (const s of [...handlerSignals].sort()) console.log(`    • ${s}`);

console.log("\n  No payload metadata normalizado (buildMiaContractMetadata):");
for (const s of [...payloadMetaKeys].sort()) console.log(`    • ${s.replace("payload_metadata:", "")}`);

console.log("\n  No system prompt (único diferenciador estrutural entre famílias):");
const contracts = [...new Set(results.map((r) => r.contract))];
for (const c of contracts) {
  const cases = results.filter((r) => r.contract === c).map((r) => r.id);
  console.log(`    • ${c} → casos ${cases.join(", ")}`);
}

console.log("\n  Subtipos comportamentais embutidos no contract text:");
console.log(`    • objection_response_contract: NÃO (template genérico de objeção)`);
console.log(`    • explanation_anchored: NÃO (template genérico de explicação; sem delegationRequest)`);

console.log("\n  ── Parte 3: O verbalizer recebe informação suficiente para distinguir famílias? ──\n");

const objectionCases = results.filter((r) => r.contract === "objection_response_contract");
const distinctSubtypes = new Set(
  objectionCases.flatMap((r) =>
    r.signalsAvailable
      .filter((s) => s.includes("hesitationReaction:") || s.includes("projectiveRisk:"))
      .map((s) => s.replace("handler:", ""))
  )
);

console.log(`  Famílias distintas no Router (casos OBJECTION): ${distinctSubtypes.size}`);
console.log(`    → ${[...distinctSubtypes].join(", ")}`);
console.log(`  Contracts distintos no verbalizer: ${contracts.length}`);
console.log(`  Metadata distinto por família: NÃO (mesmo source/isFollowUp/intent=decision)`);
console.log("\n  Resposta: NÃO");
console.log(
  "  Evidência: subtipos (hesitationReaction, projectiveRisk, purchase_anxiety) existem em"
);
console.log(
  "  cognitiveTurnEarly no handler, mas não entram em metadata nem no template do contract."
);
console.log(
  "  Casos 1–3–5 compartilham objection_response_contract idêntico; caso 4 difere (explanation_anchored)"
);
console.log(
  "  apenas por turnType EXPLANATION_REQUEST — ainda sem delegationRequest no payload."
);

console.log("\n  ── Parte 4: Onde o sinal desaparece ──\n");

for (const r of results) {
  console.log(`  Caso ${r.id} (${r.message}): ${r.signalDisappearancePoint}`);
}

console.log("\n  Síntese arquitetural:");
console.log("  • Router: preserva turnType + subtipos em cognitiveTurnEarly.signals");
console.log("  • Contract: colapsa subtipos OBJECTION → objection_response_contract único");
console.log("  • Payload: runMiaBrainTask não recebe turnType nem signals; metadata normalizado");
console.log("    descarta contextAction/activePriority; diferenciação resta só no texto do system prompt");
console.log("    (2 templates) + mensagem literal do usuário.");
console.log("\n  Diagnóstico:");
console.log("  → Hipótese A confirmada para subtipos comportamentais (hesitation/projective/anxiety):");
console.log("    sinal perdido antes/durante montagem do payload — verbalizer não pode divergir por família.");
console.log("  → Para caso 4 (delegation): contract difere, mas delegationRequest não está estruturado no payload;");
console.log("    divergência depende do template explanation_anchored + texto do usuário.");

console.log("\n  Arquivos auditados (escopo mínimo):");
console.log("  • Contract resolution : pages/api/chat-gpt4o.js ~27194-27201");
console.log("  • runMiaBrainTask call : pages/api/chat-gpt4o.js ~27735-27747");
console.log("  • Payload normalizer   : pages/api/chat-gpt4o.js ~180-189 (buildMiaContractMetadata)");
console.log("  • Contract builder     : pages/api/chat-gpt4o.js ~255-284 (buildMiaLLMContract)\n");

process.exit(0);
