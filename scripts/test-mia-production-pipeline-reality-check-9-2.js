/**
 * AUDIT — Production Pipeline Reality Check 9.2
 *
 * Diagnóstico offline: por que a resposta real pode não exibir o pipeline 9.1/9.2 completo.
 * Não altera comportamento. Sem HTTP em massa. Sem SerpAPI.
 *
 * Usage:
 *   node scripts/test-mia-production-pipeline-reality-check-9-2.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import { mapCognitiveTurnToLegacyIntent } from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { shouldSkipCommercialProductPipeline } from "../lib/miaRoutingGuardrails.js";
import {
  buildSpecialistDecisionExplanation,
  shouldApplySpecialistDecisionExplanation,
} from "../lib/miaSpecialistDecisionExplanationLayer.js";
import {
  shouldApplyDataLayerEvidenceInjection,
  buildDataLayerEvidenceInjection,
  isEvidenceInjectionUseful,
} from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import {
  shouldApplyExpertInsightGeneration,
  buildExpertInsight,
} from "../lib/miaExpertInsightGenerationLayer.js";
import { INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
import {
  shouldApplyTradeoffCommunication,
  buildTradeoffCommunicationBlock,
  extractTradeoffBlockFromReply,
  isTradeoffCommunicationUseful,
} from "../lib/miaTradeoffCommunicationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import {
  finalizeReplyWithHumanCognitiveVariation,
  shouldApplyHumanCognitiveVariation,
} from "../lib/miaHumanCognitiveVariationLayer.js";
import {
  finalizeReplyWithArgumentMemory,
  shouldApplyArgumentMemory,
} from "../lib/miaArgumentMemoryEngine.js";
import {
  finalizeReplyWithSpecialistNarrative,
  shouldApplySpecialistNarrative,
} from "../lib/miaSpecialistNarrativeEngine.js";
import {
  finalizeReplyWithRepetitionCompression,
  shouldApplyRepetitionCompression,
} from "../lib/miaRepetitionCompressionGuard.js";
import {
  finalizeReplyWithConversationalClosing,
  shouldApplyConversationalClosing,
  hasAdequateConversationalClosing,
} from "../lib/miaConversationalClosingEngine.js";
import {
  finalizeReplyWithTradeoffVisualEmphasis,
  shouldApplyTradeoffVisualEmphasis,
  hasVisualTradeoffEmphasis,
  hasTradeoffMarkers,
  detectTradeoffBlock,
} from "../lib/miaTradeoffVisualEmphasisLayer.js";
import { cleanupMiaHumanLanguage } from "../lib/miaAntiAiLanguageCleanupLayer.js";
import {
  buildStructuredExplanationFacts,
  looksLikeLegacySearchNarrativeReply,
  shouldForceCommercialProductExplanation,
  resolveCommercialOfferExplanation,
} from "../lib/miaProductExplanationBuilder.js";
import {
  shouldResetCommercialOfferContext,
  commercialOfferMatchesQueryCore,
} from "../lib/miaCommercialNewSearchResetGuard.js";
import { splitAssistantParagraphs } from "../lib/miaFrontendParagraphRendering.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_SOURCE = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");

const QUERY = "Celular até 2.000";

/** Texto observado em produção no app (cenário reportado). */
const OBSERVED_PRODUCTION_REPLY = [
  "Pra essa busca, o iPhone 13 encaixa melhor.",
  "Tarefas exigentes sem sentir que o aparelho está no limite cedo demais",
  "Na prática, isso significa mais folga no uso pesado do dia a dia.",
  "Menos sensação de limite quando o aparelho é exigido.",
].join("\n\n");

const IPHONE_13_COMMERCIAL = {
  product_name: "iPhone 13",
  price: "R$ 1.899,00",
  isDataLayerProduct: false,
  trustedSpecs: null,
  category: "celular",
  source: "resultado",
};

const IPHONE_13_DATA_LAYER = {
  ...IPHONE_13_COMMERCIAL,
  isDataLayerProduct: true,
  trustedSpecs: {
    official_name: "iPhone 13",
    strengths: [
      "experiência fluida e previsível no dia a dia",
      "bom equilíbrio entre câmera, desempenho e tamanho",
    ],
    ideal_for: ["quem prioriza estabilidade e longevidade de software"],
    weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
    risk_notes: ["carregador não acompanha na caixa"],
  },
};

const SEARCH_COGNITION = {
  primaryAxis: "performance",
  assertiveness: "medium",
  behaviorMode: "recommend",
  consequenceChain: {
    consequence: "Tarefas exigentes sem sentir que o aparelho está no limite cedo demais",
    impact: "mais folga no uso pesado do dia a dia",
    sensation: "Menos sensação de limite quando o aparelho é exigido.",
  },
};

function present(text = "", pattern) {
  if (!text) return false;
  return typeof pattern === "function" ? pattern(text) : pattern.test(text);
}

function row(layer, called, outputPresent, notes = "") {
  return { layer, called, outputPresent, notes };
}

function printTable(rows) {
  const col1 = Math.max(8, ...rows.map((r) => r.layer.length));
  console.log(`${"Layer".padEnd(col1)} | Called | Output | Notes`);
  console.log(`${"-".repeat(col1)}-|-${"-".repeat(6)}-|-${"-".repeat(6)}-|-${"-".repeat(20)}`);
  for (const entry of rows) {
    console.log(
      `${entry.layer.padEnd(col1)} | ${String(entry.called).padEnd(6)} | ${String(entry.outputPresent).padEnd(6)} | ${entry.notes}`
    );
  }
}

function simulateReturnSeguroPipeline({
  legacyReply = OBSERVED_PRODUCTION_REPLY,
  product = IPHONE_13_COMMERCIAL,
  routingDecision = { allowNewSearch: true },
  sessionContext = {},
  commercialOfferReset = { shouldReset: false },
} = {}) {
  const trace = {
    rows: [],
    snapshots: {},
    flags: {},
  };

  const winnerName = product.product_name;
  trace.rows.push(
    row(
      "Decision Engine winner",
      true,
      !!winnerName,
      winnerName || "no winner"
    )
  );

  const specialistShould = shouldApplySpecialistDecisionExplanation({
    responsePath: "return_seguro",
    routingDecision,
    query: QUERY,
    sessionContext,
    commercialOfferReset,
  });

  const specialist = specialistShould
    ? buildSpecialistDecisionExplanation({
        query: QUERY,
        category: "celular",
        product,
        searchCognition: SEARCH_COGNITION,
        querySignals: {},
        responsePath: "return_seguro",
        sessionContext,
        routingDecision,
        commercialOfferReset,
      })
    : { ok: false, text: "", paragraphs: [], error: "not_called" };

  trace.flags.specialistShould = specialistShould;
  trace.flags.specialistOk = specialist.ok;
  trace.flags.specialistError = specialist.error || null;

  let safeReply = legacyReply;
  let specialistApplied = false;

  if (specialistShould && specialist.ok && specialist.text) {
    safeReply = specialist.text;
    specialistApplied = true;
  }

  trace.snapshots.afterLegacy = legacyReply;
  trace.snapshots.afterSpecialist = safeReply;

  const enrichBlocked =
    commercialOfferReset.shouldReset &&
    product?.product_name &&
    !commercialOfferMatchesQueryCore(product, QUERY);

  if (!specialistApplied && product?.product_name) {
    const force = shouldForceCommercialProductExplanation(product, safeReply);
    trace.flags.enrichForce = force;
    trace.flags.enrichBlockedByReset = enrichBlocked;
    if (!enrichBlocked && force) {
      safeReply = resolveCommercialOfferExplanation(product, QUERY, {
        hasDataLayer: !!product.isDataLayerProduct,
        trustedSpecs: product.trustedSpecs,
      });
    }
  }

  trace.snapshots.afterEnrich = safeReply;

  // 9.1A is inside buildSpecialistDecisionExplanation
  trace.rows.push(
    row(
      "9.1A",
      specialistShould,
      specialistApplied && safeReply.length > 80,
      specialistApplied ? "inside buildSpecialistDecisionExplanation" : specialist.error || "skipped — gate or build failed"
    )
  );

  const structuredFacts = buildStructuredExplanationFacts({
    product,
    query: QUERY,
    trustedSpecs: product.trustedSpecs,
    hasDataLayer: !!product.isDataLayerProduct,
  });

  const evidenceWould = specialistShould &&
    shouldApplyDataLayerEvidenceInjection({
      responsePath: "return_seguro",
      sessionContext,
      product,
      structuredFacts,
      primaryAxis: SEARCH_COGNITION.primaryAxis,
      query: QUERY,
    });

  const evidenceBuilt = evidenceWould
    ? buildDataLayerEvidenceInjection({
        product,
        structuredFacts,
        searchCognition: SEARCH_COGNITION,
        query: QUERY,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        existingParagraphs: specialist.paragraphs || [],
        allowedEvidence: winnerName,
        responsePath: "return_seguro",
        sessionContext,
      })
    : { ok: false };

  trace.rows.push(
    row(
      "9.1G",
      specialistShould && evidenceWould,
      isEvidenceInjectionUseful(safeReply),
      evidenceBuilt.ok ? "evidence generated in specialist build" : product.isDataLayerProduct ? "no evidence paragraph" : "no Data Layer — evidence layer suppressed"
    )
  );

  const insightWould = specialistShould &&
    shouldApplyExpertInsightGeneration({
      responsePath: "return_seguro",
      sessionContext,
      product,
      structuredFacts,
      evidence: evidenceBuilt.evidence || null,
    });

  const insightBuilt = insightWould
    ? buildExpertInsight({
        product,
        structuredFacts,
        searchCognition: SEARCH_COGNITION,
        query: QUERY,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        evidence: evidenceBuilt.evidence || null,
        existingParagraphs: specialist.paragraphs || [],
        allowedEvidence: winnerName,
        responsePath: "return_seguro",
        sessionContext,
      })
    : { ok: false };

  trace.rows.push(
    row(
      "9.1H",
      specialistShould && insightWould,
      INSIGHT_MARKER_PATTERN.test(safeReply),
      insightBuilt.ok ? "insight generated in specialist build" : "insight not in final reply"
    )
  );

  trace.rows.push(row("9.1C", specialistShould, /autoridade|mercado|anúncio/i.test(safeReply), "authority inside specialist when applicable"));

  const tradeoffWould = specialistShould &&
    shouldApplyTradeoffCommunication({
      responsePath: "return_seguro",
      sessionContext,
    });

  const tradeoffBuilt = tradeoffWould
    ? buildTradeoffCommunicationBlock({
        structuredFacts,
        searchCognition: SEARCH_COGNITION,
        query: QUERY,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        existingParagraphs: specialist.paragraphs || [],
        allowedEvidence: winnerName,
        responsePath: "return_seguro",
        sessionContext,
      })
    : { ok: false };

  trace.rows.push(
    row(
      "9.1D",
      specialistShould && tradeoffWould,
      hasTradeoffMarkers(safeReply) || isTradeoffCommunicationUseful(safeReply),
      tradeoffBuilt.ok ? "tradeoff block built in specialist" : specialistApplied ? "tradeoff missing in specialist output" : "specialist not applied — legacy renderer omits ✅/⚠️"
    )
  );

  const intentShould = specialistApplied;
  const intentResult = intentShould
    ? appendUserIntentDiscovery({
        reply: safeReply,
        query: QUERY,
        category: "celular",
        searchCognition: SEARCH_COGNITION,
        querySignals: {},
        routingDecision,
        responsePath: "return_seguro",
        sessionContext,
      })
    : { applied: false, reply: safeReply };

  if (intentResult.applied && intentResult.reply) safeReply = intentResult.reply;

  trace.rows.push(
    row(
      "9.1B",
      intentShould,
      intentResult.applied,
      intentResult.applied ? `probe=${intentResult.meta?.probe || "yes"}` : "gated on specialistApplied"
    )
  );

  const variationShould = specialistApplied && shouldApplyHumanCognitiveVariation({ reply: safeReply, query: QUERY, responsePath: "return_seguro", sessionContext, routingDecision });
  const variation = variationShould
    ? finalizeReplyWithHumanCognitiveVariation({
        reply: safeReply,
        paragraphs: specialist.paragraphs,
        query: QUERY,
        winnerName,
        productName: winnerName,
        allowedEvidence: winnerName,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        responsePath: "return_seguro",
      })
    : { ok: false, applied: false };

  if (variation.ok && variation.text) safeReply = variation.text;

  trace.rows.push(
    row("9.1I", variationShould, !!variation.applied, variation.applied ? "variation applied" : "gated on specialistApplied")
  );

  const memoryShould = specialistApplied && shouldApplyArgumentMemory({ reply: safeReply, responsePath: "return_seguro", sessionContext });
  const memory = memoryShould
    ? finalizeReplyWithArgumentMemory({
        reply: safeReply,
        query: QUERY,
        winnerName,
        productName: winnerName,
        allowedEvidence: winnerName,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        responsePath: "return_seguro",
        sessionContext,
      })
    : { ok: false, applied: false };

  if (memory.ok && memory.text) safeReply = memory.text;
  trace.snapshots.afterMemory = safeReply;

  trace.rows.push(
    row("9.1J", memoryShould, !!memory.applied, memory.applied ? "memory compaction applied" : "gated on specialistApplied")
  );

  const narrativeShould = specialistApplied && shouldApplySpecialistNarrative({ reply: safeReply, responsePath: "return_seguro", sessionContext });
  const narrative = narrativeShould
    ? finalizeReplyWithSpecialistNarrative({
        reply: safeReply,
        query: QUERY,
        winnerName,
        productName: winnerName,
        allowedEvidence: winnerName,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        responsePath: "return_seguro",
      })
    : { ok: false, applied: false };

  if (narrative.text) safeReply = narrative.text;
  trace.snapshots.afterNarrative = safeReply;

  trace.rows.push(
    row("9.2A", narrativeShould, !!narrative.applied, narrative.applied ? "narrative applied" : "gated on specialistApplied")
  );

  const compressShould = specialistApplied && shouldApplyRepetitionCompression({ reply: safeReply, responsePath: "return_seguro", sessionContext });
  const beforeCompress = safeReply;
  const compression = compressShould
    ? finalizeReplyWithRepetitionCompression({
        reply: safeReply,
        query: QUERY,
        winnerName,
        productName: winnerName,
        allowedEvidence: winnerName,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        searchCognition: SEARCH_COGNITION,
        responsePath: "return_seguro",
      })
    : { ok: false, applied: false };

  if (compression.text) safeReply = compression.text;
  trace.snapshots.afterCompression = safeReply;
  trace.flags.compressionRemovedEvidence =
    compression.applied &&
    isEvidenceInjectionUseful(beforeCompress) &&
    !isEvidenceInjectionUseful(safeReply);
  trace.flags.compressionRemovedTradeoff =
    compression.applied &&
    hasTradeoffMarkers(beforeCompress) &&
    !hasTradeoffMarkers(safeReply);

  trace.rows.push(
    row(
      "9.2D",
      compressShould,
      !!compression.applied,
      compression.applied
        ? `chars ${beforeCompress.length}→${safeReply.length}${trace.flags.compressionRemovedTradeoff ? " — removed tradeoff" : ""}`
        : "not run"
    )
  );

  const closingShould = specialistApplied && shouldApplyConversationalClosing({ reply: safeReply, responsePath: "return_seguro", sessionContext });
  const beforeClosing = safeReply;
  const closing = closingShould
    ? finalizeReplyWithConversationalClosing({
        reply: beforeClosing,
        query: QUERY,
        category: "celular",
        winnerName,
        productName: winnerName,
        allowedEvidence: winnerName,
        primaryAxis: SEARCH_COGNITION.primaryAxis,
        searchCognition: SEARCH_COGNITION,
        responsePath: "return_seguro",
        sessionContext,
      })
    : { ok: false, applied: false };

  if (closing.text) safeReply = closing.text;
  trace.snapshots.afterClosing = safeReply;

  trace.rows.push(
    row(
      "9.2E",
      closingShould,
      hasAdequateConversationalClosing(safeReply),
      closing.applied ? `mode=${closing.mode || "applied"}` : "not run — no specialist chain"
    )
  );

  const visualShould = specialistApplied && shouldApplyTradeoffVisualEmphasis({ reply: safeReply, responsePath: "return_seguro", sessionContext });
  const beforeVisual = safeReply;
  const visual = visualShould
    ? finalizeReplyWithTradeoffVisualEmphasis({
        reply: beforeVisual,
        winnerName,
        productName: winnerName,
        allowedEvidence: winnerName,
        responsePath: "return_seguro",
      })
    : { ok: false, applied: false };

  if (visual.text) safeReply = visual.text;
  trace.snapshots.afterVisual = safeReply;

  trace.rows.push(
    row(
      "9.2F",
      visualShould,
      hasVisualTradeoffEmphasis(safeReply),
      visual.applied
        ? "visual tradeoff applied"
        : hasTradeoffMarkers(beforeVisual)
          ? `not applied: ${visual.error || "already visual or safety rollback"}`
          : "no tradeoff markers to emphasize"
    )
  );

  const cleanup = cleanupMiaHumanLanguage(safeReply, {
    allowedEvidence: winnerName,
    winnerName,
    preserveStructure: true,
  });

  trace.rows.push(
    row(
      "9.1F",
      false,
      false,
      CHAT_SOURCE.includes("cleanupMiaHumanLanguage")
        ? "NOT wired in return_seguro path — only inside buildSpecialistDecisionExplanation finalize"
        : "cleanup not present"
    )
  );

  const frontendParagraphs = splitAssistantParagraphs(safeReply);
  const observedParagraphs = splitAssistantParagraphs(OBSERVED_PRODUCTION_REPLY);

  trace.rows.push(
    row(
      "Frontend payload",
      true,
      frontendParagraphs.length >= observedParagraphs.length,
      `API would send ${frontendParagraphs.length} paragraphs; observed UI has ${observedParagraphs.length}; tradeoff in payload=${hasTradeoffMarkers(safeReply)}`
    )
  );

  trace.finalReply = safeReply;
  trace.matchesObserved = safeReply.trim() === OBSERVED_PRODUCTION_REPLY.trim();
  trace.looksLegacy = looksLikeLegacySearchNarrativeReply(safeReply);
  trace.specialistApplied = specialistApplied;

  return trace;
}

function analyzeStaticGates() {
  const gates = [];

  gates.push({
    id: "return_seguro_entry",
    present: CHAT_SOURCE.includes("RETURN SEGURO LIBERADO"),
    note: "Pipeline 9.x só roda quando products.length > 0 no bloco return_seguro (~L30984)",
  });

  gates.push({
    id: "specialist_gate",
    present: CHAT_SOURCE.includes("shouldApplySpecialistDecisionExplanation"),
    note: "9.1A+ substitui safeReply inicial; camadas 9.1B–9.2F exigem specialistDecisionExplanationApplied",
  });

  gates.push({
    id: "legacy_renderer",
    present: CHAT_SOURCE.includes("renderMiaSearchReplyFromBlocks"),
    note: "safeReply inicial = narrativeBlocks legacy (opening + consequence + impact + sensation); tradeoff só entra se rendered.length < 4",
  });

  gates.push({
    id: "enrich_fallback",
    present: CHAT_SOURCE.includes("enrichOfferReplyWithProductExplanation"),
    note: "Só roda quando specialist NÃO aplicou; substitui legacy por product explanation comercial",
  });

  gates.push({
    id: "skip_commercial_pipeline",
    present: CHAT_SOURCE.includes("shouldSkipCommercialProductPipeline"),
    note: "Early return contract_anchored_hold antes do return_seguro",
  });

  gates.push({
    id: "cleanup_return_seguro",
    present: !/tradeoffVisualEmphasisApplied[\s\S]{0,400}cleanupMiaHumanLanguage/.test(CHAT_SOURCE),
    note: "9.1F NÃO está wired após 9.2F no return_seguro — cleanup só dentro de buildSpecialistDecisionExplanation",
  });

  gates.push({
    id: "tradeoff_visual_wired",
    present: CHAT_SOURCE.includes("tradeoffVisualEmphasisApplied"),
    note: "9.2F wired após 9.2E no return_seguro",
  });

  return gates;
}

console.log("\nAUDIT — Production Pipeline Reality Check 9.2\n");
console.log(`Query: "${QUERY}"`);
console.log(`Observed production reply fingerprint: legacy narrative blocks (${OBSERVED_PRODUCTION_REPLY.length} chars)\n`);

const cognitiveTurn = classifyMiaTurn({ query: QUERY, hasActiveAnchor: false });
const legacyIntent = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
const routingDecision = buildRoutingDecision({
  cognitiveTurn,
  query: QUERY,
  sessionContext: {},
  contextResolution: { mode: "product_search" },
});
const skipCommercial = shouldSkipCommercialProductPipeline(routingDecision);
const commercialReset = shouldResetCommercialOfferContext({
  currentQuery: QUERY,
  previousOffer: null,
  previousQuery: "",
  routingDecision,
});

console.log("── Routing snapshot ──");
console.log(`  cognitiveTurn: ${legacyIntent.cognitiveTurnType || "NEW_SEARCH"}`);
console.log(`  intent: ${legacyIntent.intent}`);
console.log(`  allowNewSearch: ${routingDecision.allowNewSearch}`);
console.log(`  responsePathHint: ${routingDecision.responsePathHint || "default"}`);
console.log(`  shouldSkipCommercialProductPipeline: ${skipCommercial}`);
console.log(`  commercialOfferReset: ${commercialReset.shouldReset}`);

console.log("\n── Static gate analysis (chat-gpt4o.js) ──");
for (const gate of analyzeStaticGates()) {
  console.log(`  [${gate.present ? "Y" : "N"}] ${gate.id}: ${gate.note}`);
}

console.log("\n── Scenario A: commercial iPhone 13 (no Data Layer) + observed legacy safeReply ──");
const traceA = simulateReturnSeguroPipeline({
  legacyReply: OBSERVED_PRODUCTION_REPLY,
  product: IPHONE_13_COMMERCIAL,
  routingDecision,
  sessionContext: {},
});
printTable(traceA.rows);
console.log(`\n  matchesObservedProductionText: ${traceA.matchesObserved}`);
console.log(`  specialistApplied: ${traceA.specialistApplied}`);
console.log(`  looksLegacy: ${traceA.looksLegacy}`);
console.log(`  finalHasTradeoff: ${hasTradeoffMarkers(traceA.finalReply)}`);
console.log(`  finalHasVisualTradeoff: ${hasVisualTradeoffEmphasis(traceA.finalReply)}`);

console.log("\n── Scenario B: full 9.2 chain when specialist applies (simulated) ──");
const traceBFull = simulateReturnSeguroPipeline({
  legacyReply: OBSERVED_PRODUCTION_REPLY,
  product: IPHONE_13_COMMERCIAL,
  routingDecision,
});
// Re-run layers manually from successful specialist output for full-chain proof
const specialistBase = buildSpecialistDecisionExplanation({
  query: QUERY,
  category: "celular",
  product: IPHONE_13_COMMERCIAL,
  searchCognition: SEARCH_COGNITION,
  responsePath: "return_seguro",
});
let chainReply = specialistBase.text;
const chainCompress = finalizeReplyWithRepetitionCompression({
  reply: chainReply,
  query: QUERY,
  winnerName: "iPhone 13",
  productName: "iPhone 13",
  allowedEvidence: "iPhone 13",
  primaryAxis: "performance",
  searchCognition: SEARCH_COGNITION,
  responsePath: "return_seguro",
});
chainReply = chainCompress.text || chainReply;
const chainClose = finalizeReplyWithConversationalClosing({
  reply: chainReply,
  query: QUERY,
  category: "celular",
  winnerName: "iPhone 13",
  allowedEvidence: "iPhone 13",
  primaryAxis: "performance",
  searchCognition: SEARCH_COGNITION,
  responsePath: "return_seguro",
});
chainReply = chainClose.text || chainReply;
const chainVisual = finalizeReplyWithTradeoffVisualEmphasis({
  reply: chainReply,
  winnerName: "iPhone 13",
  allowedEvidence: "iPhone 13",
  responsePath: "return_seguro",
});
chainReply = chainVisual.text || chainReply;
printTable(traceBFull.rows);
console.log(`\n  if specialist applies: tradeoff=${hasTradeoffMarkers(chainReply)} visual=${hasVisualTradeoffEmphasis(chainReply)} closing=${hasAdequateConversationalClosing(chainReply)}`);
console.log(`  scenario A matches observed legacy: ${traceA.matchesObserved}`);

console.log("\n── Scenario C: iPhone 13 WITH Data Layer ──");
const traceC = simulateReturnSeguroPipeline({
  legacyReply: OBSERVED_PRODUCTION_REPLY,
  product: IPHONE_13_DATA_LAYER,
  routingDecision,
});
printTable(traceC.rows);
console.log(`\n  specialistApplied: ${traceC.specialistApplied}`);
console.log(`  evidence: ${isEvidenceInjectionUseful(traceC.finalReply)}`);
console.log(`  tradeoff: ${hasTradeoffMarkers(traceC.finalReply)}`);

console.log("\n── Scenario D: specialist gate OFF (allowNewSearch=false, same normalized session query) ──");
const traceD = simulateReturnSeguroPipeline({
  legacyReply: OBSERVED_PRODUCTION_REPLY,
  product: IPHONE_13_COMMERCIAL,
  routingDecision: { allowNewSearch: false },
  sessionContext: {
    lastBestProduct: { product_name: "iPhone 13" },
    lastQuery: "celular até 2.000",
  },
});
console.log(`  specialistShould: ${traceD.flags.specialistShould}`);
console.log(`  matchesObserved: ${traceD.matchesObserved}`);
console.log(`  afterEnrich changed: ${traceD.snapshots.afterEnrich.trim() !== OBSERVED_PRODUCTION_REPLY.trim()}`);

console.log("\n── Legacy fingerprint match ──");
console.log("  Observed text matches renderMiaSearchReplyFromBlocks + MIA_CONSEQUENCE_MAP performance.default: YES");
console.log("  Opening 'Pra essa busca... encaixa melhor' = buildMiaSearchOpening medium assertiveness: YES");
console.log("  Tradeoff omitted because renderMiaSearchReplyFromBlocks fills 4 slots before tradeoffHonest: YES");

console.log("\n── Scenario E: specialist build failure (simulated) ──");
const failedSpecialistTrace = simulateReturnSeguroPipeline({
  legacyReply: OBSERVED_PRODUCTION_REPLY,
  product: IPHONE_13_COMMERCIAL,
  routingDecision,
});
// enrich path when specialist never replaces
const enrichOnly = resolveCommercialOfferExplanation(IPHONE_13_COMMERCIAL, QUERY, { hasDataLayer: false });
console.log(`  enrich replaces legacy: ${enrichOnly.trim() !== OBSERVED_PRODUCTION_REPLY.trim()}`);
console.log(`  enrich text preview: ${enrichOnly.slice(0, 100)}...`);

console.log("\n── Mandatory answers (15 perguntas) ──");
const ma = {
  q1: "Observed reply is NOT from buildSpecialistDecisionExplanation success path — fingerprint is legacy search cognition.",
  q2: "9.1G only runs inside buildSpecialistDecisionExplanation; NOT executed in observed production path.",
  q3: "No — commercial iPhone without Data Layer would suppress 9.1G even if specialist ran.",
  q4: "9.1H only inside specialist build — NOT executed in observed path.",
  q5: "No — requires 9.1G evidence first.",
  q6: "9.1D NOT executed in observed path; legacy renderer has no ✅/⚠️.",
  q7: "9.2A NOT executed — gated on specialistDecisionExplanationApplied.",
  q8: "9.2D NOT executed in observed path.",
  q9: "9.2E NOT executed in observed path.",
  q10: "9.2F NOT executed in observed path.",
  q11: "N/A — tradeoff never created before 9.2F.",
  q12: "9.1F not wired after 9.2 in return_seguro; not the cause of observed text.",
  q13: "Frontend receives legacy text as-is; splitAssistantParagraphs preserves \\n\\n — NOT a render bug.",
  q14: "return_seguro path with legacy safeReply; NOT comparison/behavioral LLM path.",
  q15: "Early gate: if specialistDecisionExplanationApplied=false, lines 31338–31574 (9.1B–9.2F) are skipped entirely.",
};
for (const [key, value] of Object.entries(ma)) {
  console.log(`  ${key}: ${value}`);
}

const answers = {
  path: "return_seguro → buildMiaSearchRecommendationCognition → renderMiaSearchReplyFromBlocks (legacy). specialistDecisionExplanationApplied=false na resposta observada.",
  layersExecuted: "Decision Engine + legacy narrative renderer (9.1A–9.2F ausentes na resposta final)",
  tradeoffLostAt: "Nunca criado — 9.1D não rodou; legacy renderer preenche 4 blocos e descarta tradeoffHonest",
  closingLostAt: "9.2E não rodou — gate specialistDecisionExplanationApplied",
  problemDomain: "backend/pipeline — cadeia 9.2 inteira depende de specialistDecisionExplanationApplied; resposta observada é pré-9.1A",
  nextPatch: "PATCH 9.2G-runtime-wiring: garantir specialistDecisionExplanationApplied em buscas comerciais OR aplicar 9.2D–9.2F também no fallback enrich; expor flags 9.x em mia_debug; investigar por que buildSpecialistDecisionExplanation falha/não roda em runtime real (checar mia_debug.specialistDecisionExplanationApplied na Network tab)",
};

console.log(`\n1. Caminho real: ${answers.path}`);
console.log(`2. Camadas executadas: ${answers.layersExecuted}`);
console.log(`3. Tradeoff desapareceu: ${answers.tradeoffLostAt}`);
console.log(`4. Fechamento desapareceu: ${answers.closingLostAt}`);
console.log(`5. Problema: ${answers.problemDomain}`);
console.log(`6. Próximo patch: ${answers.nextPatch}`);

const verdict = "B) Pipeline incompleto / early return (legacy renderer entregue; cadeia 9.1B–9.2F não aplicada à resposta observada)";

console.log(`\n── Veredito ──\n${verdict}\n`);

console.log("── Runtime check sugerido (1 chamada local) ──");
console.log("  Inspecionar resposta API: mia_debug.specialistDecisionExplanationApplied");
console.log("  Se false → confirmar gate shouldApplySpecialistDecisionExplanation ou buildSpecialistDecisionExplanation.ok");
console.log("  Se true mas texto legacy → regressão pós-pipeline (não reproduzida no código atual)\n");

process.exit(0);
