/**
 * PATCH 7.6S-AUDIT — OBJECTION Bridge Authority Audit
 *
 * Auditoria estática/unitária — NÃO altera produção.
 * Simula a ordem real do handler:
 *   Router → Bridge → clear_new_commercial_search → PATCH 6.2 → buildRoutingDecision ②
 *
 * Usage: node scripts/test-mia-objection-bridge-authority-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  COGNITIVE_BRIDGE_ALLOWLIST,
  COGNITIVE_TO_LEGACY_INTENT_MAP,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";

// ─────────────────────────────────────────────────────────────
// Fixtures — genéricos, sem hardcode de produto específico
// ─────────────────────────────────────────────────────────────

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
  lastCategory: "eletronicos",
};

const SCENARIOS = [
  {
    id: "S.1",
    query: "nao quero fazer besteira",
    expectedFamily: "purchase_anxiety",
  },
  {
    id: "S.2",
    query: "nao sei se gostei",
    expectedFamily: "not_convinced",
  },
  {
    id: "S.3",
    query: "algo me incomoda",
    expectedFamily: "lack_confidence",
  },
  {
    id: "S.4",
    query: "tenho medo de me arrepender",
    expectedFamily: "purchase_anxiety",
  },
  {
    id: "S.5",
    query: "qual seria seu medo nessa compra",
    expectedFamily: "risk_probe",
  },
];

// Legacy worst-case quando bridge não aplica (observado em produção)
const LEGACY_INTENT = "search";
const LEGACY_CONTEXT_ACTION = "search";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function extractSubtype(cognitiveTurn) {
  const reasons = cognitiveTurn?.reasons || [];
  const sig = cognitiveTurn?.signals || {};

  if (sig.projectiveRisk?.detected) return sig.projectiveRisk.subtype;
  if (sig.hesitationReaction?.detected) return sig.hesitationReaction.subtype;

  for (const r of reasons) {
    if (r.startsWith("hesitation_subtype:")) return r.split(":").slice(1).join(":");
    if (r.startsWith("projective_risk_subtype:")) return r.split(":").slice(1).join(":");
  }
  if (sig.isObjection) return "objection_explicit";
  return null;
}

function simulatePipeline(query) {
  const sessionContext = SESSION_WITH_ANCHOR;
  const hasActiveAnchor = true;

  const cognitiveTurn = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: LEGACY_INTENT,
    contextAction: LEGACY_CONTEXT_ACTION,
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, LEGACY_INTENT);

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query,
    resolvedQuery: query,
    hasAnchor: hasActiveAnchor,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const patch62WouldApply =
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION &&
    hasActiveAnchor &&
    !clearNewSearch;

  const contextResolution = {
    mode: "general_answer",
    shouldSkipProductSearch: false,
    directReply: null,
    clearContext: false,
  };

  if (clearNewSearch) {
    contextResolution.shouldSkipProductSearch = false;
    contextResolution.mode = "direct";
  } else if (patch62WouldApply) {
    contextResolution.shouldSkipProductSearch = true;
  }

  const finalIntent = bridgeAudit.active ? bridgeAudit.toIntent : LEGACY_INTENT;

  const routingDecision = buildRoutingDecision({
    userMessage: query,
    resolvedQuery: query,
    contextResolution,
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: finalIntent,
    contextAction: LEGACY_CONTEXT_ACTION,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      isComparisonContextFollowUp: false,
      isComparisonFollowUpLocked: false,
      wantsNew: false,
    },
  });

  const flags = [];
  const inAllowlist = COGNITIVE_BRIDGE_ALLOWLIST.has(cognitiveTurn.turnType);

  if (!inAllowlist) flags.push("OBJECTION_NOT_IN_BRIDGE_ALLOWLIST");
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION && !bridgeAudit.active) {
    flags.push("OBJECTION_WITH_ANCHOR_BRIDGE_SKIPPED");
  }
  if (routingDecision.allowNewSearch) flags.push("OBJECTION_ALLOWED_NEW_SEARCH");
  if (routingDecision.allowReplaceWinner) flags.push("OBJECTION_ALLOWED_REPLACE_WINNER");
  if (!routingDecision.shouldPreserveAnchor) flags.push("OBJECTION_DROPPED_ANCHOR");
  if (clearNewSearch && cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION) {
    flags.push("CLEAR_NEW_SEARCH_OVERRIDES_OBJECTION");
  }
  if (!patch62WouldApply && cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION) {
    flags.push("PATCH_6_2_OBJECTION_INTERCEPTOR_SKIPPED");
  }
  if (routingDecision.mode === "new_search") flags.push("ROUTING_STAGE_LEAK");
  if (
    bridgeAudit.reason === "turn_type_not_in_allowlist" &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION
  ) {
    flags.push("BRIDGE_STAGE_LEAK");
  }
  if (
    routingDecision.mode === "search" ||
    routingDecision.mode === "default_product_search"
  ) {
    flags.push("CONTEXT_ACTION_STAGE_LEAK");
  }

  let leakStage = "NONE";
  if (cognitiveTurn.turnType !== MIA_TURN_TYPES.OBJECTION) {
    leakStage = "ROUTER_STAGE";
  } else if (!bridgeAudit.active) {
    leakStage = clearNewSearch ? "ROUTING_STAGE" : "BRIDGE_STAGE";
  }
  if (routingDecision.mode === "new_search" && clearNewSearch) {
    leakStage = "ROUTING_STAGE";
  } else if (
    routingDecision.mode === "search" ||
    (routingDecision.allowNewSearch && !clearNewSearch)
  ) {
    leakStage = "ROUTING_STAGE";
  } else if (routingDecision.mode === "context_hold" && !patch62WouldApply) {
    leakStage = "ROUTING_STAGE";
  }

  const winnerWouldBePreserved =
    routingDecision.shouldPreserveAnchor === true &&
    routingDecision.allowReplaceWinner === false;

  return {
    query,
    expectedFamily: null,
    turnType: cognitiveTurn.turnType,
    subtype: extractSubtype(cognitiveTurn),
    confidence: cognitiveTurn.confidence,
    hasActiveAnchor,
    bridgeApplied: !!bridgeAudit.active,
    bridgeReason: bridgeAudit.reason || bridgeResult.reason,
    finalIntent,
    contextAction: LEGACY_CONTEXT_ACTION,
    routingMode: routingDecision.mode,
    allowNewSearch: routingDecision.allowNewSearch,
    allowReplaceWinner: routingDecision.allowReplaceWinner,
    allowRerank: routingDecision.allowRerank,
    shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    responsePathHint: routingDecision.responsePathHint,
    winnerWouldBePreserved,
    clearNewSearch,
    patch62WouldApply,
    patch62WouldFixRd1: patch62WouldApply,
    rebuildOverwritesPatch62: patch62WouldApply && routingDecision.mode !== "context_hold",
    leakStage,
    flags,
    routingReasons: routingDecision.reasons || [],
    inBridgeAllowlist: inAllowlist,
    mappedIntentIfBridged: COGNITIVE_TO_LEGACY_INTENT_MAP.OBJECTION ?? "(not mapped)",
  };
}

// ─────────────────────────────────────────────────────────────
// Run audit
// ─────────────────────────────────────────────────────────────

console.log("\n  PATCH 7.6S-AUDIT — OBJECTION Bridge Authority Audit");
console.log("  Modo: estático/unitário | Cenários: 5 | Produção: não alterada\n");

const results = SCENARIOS.map((s) => {
  const r = simulatePipeline(s.query);
  r.expectedFamily = s.expectedFamily;
  r.id = s.id;
  return r;
});

function pad(s, n) {
  return String(s ?? "—").padEnd(n);
}

console.log("  ── Tabela por cenário ─────────────────────────────────────────────────");
console.log(
  `  ${pad("ID", 4)} ${pad("Query", 34)} ${pad("TurnType", 12)} ${pad("Subtype", 18)} ` +
  `${pad("Bridge", 7)} ${pad("ClearNS", 8)} ${pad("P62", 4)} ${pad("Routing", 14)} ` +
  `${pad("NewSrch", 8)} ${pad("PresAnch", 9)} LeakStage`
);
console.log(`  ${"─".repeat(130)}`);

for (const r of results) {
  console.log(
    `  ${pad(r.id, 4)} ${pad(r.query.slice(0, 32), 34)} ${pad(r.turnType, 12)} ${pad(r.subtype, 18)} ` +
    `${pad(r.bridgeApplied ? "✓" : "✗", 7)} ${pad(r.clearNewSearch ? "YES" : "no", 8)} ` +
    `${pad(r.patch62WouldApply ? "✓" : "✗", 4)} ${pad(r.routingMode, 14)} ` +
    `${pad(r.allowNewSearch, 8)} ${pad(r.shouldPreserveAnchor, 9)} ${r.leakStage}`
  );
}

console.log("\n  ── Detalhe por cenário ────────────────────────────────────────────────");

for (const r of results) {
  console.log(`\n  ${r.id} "${r.query}"`);
  console.log(`      expectedFamily       : ${r.expectedFamily}`);
  console.log(`      turnType / subtype   : ${r.turnType} / ${r.subtype}`);
  console.log(`      confidence           : ${r.confidence}`);
  console.log(`      bridgeApplied        : ${r.bridgeApplied} (${r.bridgeReason})`);
  console.log(`      inBridgeAllowlist    : ${r.inBridgeAllowlist}`);
  console.log(`      finalIntent          : ${r.finalIntent}`);
  console.log(`      clearNewSearch       : ${r.clearNewSearch}`);
  console.log(`      patch62WouldApply    : ${r.patch62WouldApply}`);
  console.log(`      routingMode          : ${r.routingMode}`);
  console.log(`      allowNewSearch       : ${r.allowNewSearch}`);
  console.log(`      allowReplaceWinner   : ${r.allowReplaceWinner}`);
  console.log(`      shouldPreserveAnchor : ${r.shouldPreserveAnchor}`);
  console.log(`      responsePathHint     : ${r.responsePathHint}`);
  console.log(`      winnerPreserved      : ${r.winnerWouldBePreserved}`);
  console.log(`      routingReasons       : ${r.routingReasons.join(" | ") || "—"}`);
  console.log(`      leakStage            : ${r.leakStage}`);
  console.log(`      flags                : ${r.flags.join(", ") || "—"}`);
}

// ─────────────────────────────────────────────────────────────
// Static handler inspection (read-only findings)
// ─────────────────────────────────────────────────────────────

console.log("\n  ── Inspeção estática do handler (read-only) ───────────────────────────");
console.log("  lib/miaCognitiveBridge.js:59-61 — OBJECTION fora da COGNITIVE_BRIDGE_ALLOWLIST");
console.log("  lib/miaCognitiveBridge.js:168 — guardContextAction só cobre EXPLANATION/VALUE/PRIORITY_SHIFT");
console.log("  lib/miaRoutingSafety.js:74 — EXPLICIT_SEARCH_VERB_PATTERN inclui 'quero' sem guard de negação");
console.log("  pages/api/chat-gpt4o.js:25364 — earlyClearNewCommercialSearch computado antes do PATCH 6.2");
console.log("  pages/api/chat-gpt4o.js:25435 — PATCH 6.2 bloqueado quando earlyClearNewCommercialSearch=true");
console.log("  pages/api/chat-gpt4o.js:26262 — buildRoutingDecision ② reconstrói routingDecision após PATCH 6.2");

console.log("\n  ── Respostas às 8 perguntas do audit ────────────────────────────────");
console.log("  1. OBJECTION entra na bridge allowlist? NÃO (linha ~59 miaCognitiveBridge.js)");
console.log("  2. OBJECTION deveria receber autoridade com anchor? SIM → intent legacy 'decision'");
console.log("  3. Se mapeado para decision → routingMode esperado: context_decision ou context_hold");
console.log("  4. Handler tem interceptor PATCH 6.2? SIM (chat-gpt4o.js ~25435)");
console.log("  5. PATCH 6.2 roda DEPOIS de clear_new_search, mas é DESABILITADO se flag=true");
console.log("  6. clear_new_commercial_search sobrescreve OBJECTION? SIM quando 'quero' dispara falso positivo");
console.log("  7. Problema principal: ordem dos interceptors + rebuild ② + ausência na bridge");
console.log("  8. Menor patch seguro: Opção C — patches separados (bridge + handler guard)");

console.log("\n  ── Diagnóstico consolidado ────────────────────────────────────────────");

const leaked = results.filter((r) => !r.winnerWouldBePreserved || r.allowNewSearch);
const clearOverride = results.filter((r) => r.flags.includes("CLEAR_NEW_SEARCH_OVERRIDES_OBJECTION"));

console.log(`  Cenários com leak de routing : ${leaked.length}/${results.length}`);
console.log(`  Cenários com clear_new_search override : ${clearOverride.length}/${results.length}`);
console.log(`  Bridge allowlist inclui OBJECTION : ${COGNITIVE_BRIDGE_ALLOWLIST.has("OBJECTION")}`);
console.log(`  OBJECTION mapeado em COGNITIVE_TO_LEGACY_INTENT_MAP : ${!!COGNITIVE_TO_LEGACY_INTENT_MAP.OBJECTION}`);

console.log("\n  CAUSA RAIZ:");
console.log("  OBJECTION é classificado corretamente no Router, mas:");
console.log("  (A) não entra na Cognitive Bridge → legacy intent=search permanece;");
console.log("  (B) PATCH 6.2 (handler) roda ANTES do rebuild ② e é bypassado quando");
console.log("      resolveClearNewCommercialSearchForRouting detecta 'quero' (falso positivo);");
console.log("  (C) buildRoutingDecision ② reconstrói routingDecision e pode emitir new_search");
console.log("      via hasClearNewCommercialSearch antes de qualquer proteção OBJECTION.");

console.log("\n  PRÓXIMO PATCH RECOMENDADO: Opção C (patches separados)");
console.log("  7.6S-B: Adicionar OBJECTION → decision na bridge + guard contextAction");
console.log("  7.6S-C: Negar 'quero' em frases de purchase_anxiety + mover PATCH 6.2 pós-rebuild ②");

const passing = results.filter((r) => r.winnerWouldBePreserved && !r.allowNewSearch).length;
const failing = results.length - passing;

console.log("\n  ── Resultado ──────────────────────────────────────────────────────────");
console.log(`  Total cenários : ${results.length}`);
console.log(`  Passing (anchor preservada, sem new_search simulado) : ${passing}`);
console.log(`  Failing (leak detectado) : ${failing}`);
console.log(`  Recomendação final : Opção C\n`);

process.exit(0);
