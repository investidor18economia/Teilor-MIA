/**
 * PATCH 9.2G — Runtime Specialist Pipeline Wiring Audit
 *
 * Usage:
 *   node scripts/test-mia-runtime-specialist-pipeline-wiring-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildSpecialistDecisionExplanation,
  shouldApplySpecialistDecisionExplanation,
} from "../lib/miaSpecialistDecisionExplanationLayer.js";
import {
  looksLikeLegacySearchNarrativeReply,
  resolveCommercialOfferExplanation,
  shouldForceCommercialProductExplanation,
} from "../lib/miaProductExplanationBuilder.js";
import { isEvidenceInjectionUseful } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
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
  hasTradeoffMarkers,
  hasVisualTradeoffEmphasis,
  shouldApplyTradeoffVisualEmphasis,
} from "../lib/miaTradeoffVisualEmphasisLayer.js";
import {
  shouldApplyDataLayerEvidenceInjection,
  buildDataLayerEvidenceInjection,
} from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import {
  shouldApplyExpertInsightGeneration,
  buildExpertInsight,
} from "../lib/miaExpertInsightGenerationLayer.js";
import {
  shouldApplyTradeoffCommunication,
  buildTradeoffCommunicationBlock,
} from "../lib/miaTradeoffCommunicationLayer.js";
import { buildStructuredExplanationFacts } from "../lib/miaProductExplanationBuilder.js";
import { commercialOfferMatchesQueryCore } from "../lib/miaCommercialNewSearchResetGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_SOURCE = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");

const LEGACY_OBSERVED = [
  "Pra essa busca, o iPhone 13 encaixa melhor.",
  "Tarefas exigentes sem sentir que o aparelho está no limite cedo demais",
  "Na prática, isso significa mais folga no uso pesado do dia a dia.",
  "Menos sensação de limite quando o aparelho é exigido.",
].join("\n\n");

const IPHONE_COMMERCIAL = {
  product_name: "iPhone 13",
  price: "R$ 1.899,00",
  isDataLayerProduct: false,
  trustedSpecs: null,
  category: "celular",
};

const IPHONE_DATA_LAYER = {
  ...IPHONE_COMMERCIAL,
  isDataLayerProduct: true,
  trustedSpecs: {
    official_name: "iPhone 13",
    strengths: ["experiência fluida e previsível no dia a dia"],
    ideal_for: ["quem prioriza estabilidade e longevidade de software"],
    weaknesses: ["tela de 60 Hz pode parecer menos fluida"],
    risk_notes: ["carregador não acompanha na caixa"],
  },
};

const NOTEBOOK = {
  product_name: "Notebook Acer Aspire 5",
  isDataLayerProduct: false,
  category: "notebook",
};

const MONITOR = {
  product_name: "Monitor LG 27 IPS",
  isDataLayerProduct: false,
  category: "monitor",
};

const CHAIR = {
  product_name: "Cadeira Ergonômica Flex",
  isDataLayerProduct: false,
  category: "cadeira",
};

function cognition(axis = "performance") {
  return {
    primaryAxis: axis,
    assertiveness: "medium",
    behaviorMode: "recommend",
    consequenceChain: {
      consequence: "Tarefas exigentes sem sentir que o aparelho está no limite cedo demais",
      impact: "mais folga no uso pesado do dia a dia",
      sensation: "Menos sensação de limite quando o aparelho é exigido.",
    },
  };
}

function normalizeFingerprint(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isSameLegacyReply(reply = "", legacy = "") {
  return normalizeFingerprint(reply) === normalizeFingerprint(legacy);
}

function resolveFinalRendererType({
  specialistApplied,
  commercialEnrichApplied,
  safeReply,
  legacySafeReply,
}) {
  if (specialistApplied && safeReply && !isSameLegacyReply(safeReply, legacySafeReply)) {
    return "specialist";
  }
  if (commercialEnrichApplied) return "legacy_enriched";
  if (looksLikeLegacySearchNarrativeReply(safeReply) || isSameLegacyReply(safeReply, legacySafeReply)) {
    return "legacy";
  }
  return specialistApplied ? "specialist" : "commercial_fallback";
}

function enrichOfferReply(reply, product, query, options = {}) {
  if (!product?.product_name) return reply;
  if (options.resetDecision?.shouldReset && !commercialOfferMatchesQueryCore(product, query)) {
    return reply;
  }
  if (!shouldForceCommercialProductExplanation(product, reply)) return reply;
  return resolveCommercialOfferExplanation(product, query, {
    trustedSpecs: product.trustedSpecs,
    hasDataLayer: !!product.isDataLayerProduct,
  });
}

function simulateCommercialWiring({
  query,
  product,
  legacySafeReply = LEGACY_OBSERVED,
  routingDecision = { allowNewSearch: true },
  sessionContext = {},
  commercialOfferReset = { shouldReset: false },
  forceBuildFailure = false,
}) {
  const rows = [];
  const trace = {
    rows,
    flags: {},
    finalReply: "",
    finalRendererType: "legacy",
  };

  const searchCognition = cognition(
    product?.category === "notebook" ? "performance" : product?.category === "monitor" ? "screen" : "performance"
  );
  const winnerName = product?.product_name || "";
  const hasCommercialWinner = !!winnerName;

  rows.push({
    layer: "Decision Engine",
    attempted: hasCommercialWinner,
    applied: hasCommercialWinner,
    outputPresent: hasCommercialWinner,
    skipReason: hasCommercialWinner ? "" : "no_winner",
  });

  rows.push({
    layer: "Legacy renderer",
    attempted: true,
    applied: true,
    outputPresent: looksLikeLegacySearchNarrativeReply(legacySafeReply),
    skipReason: "",
  });

  let safeReply = legacySafeReply;
  let specialistAttempted = false;
  let specialistOk = false;
  let specialistApplied = false;
  let specialistSkipReason = null;
  let specialistParagraphs = [];
  let commercialEnrichApplied = false;

  if (hasCommercialWinner) {
    specialistAttempted = true;
    const gateAllowed = shouldApplySpecialistDecisionExplanation({
      responsePath: "return_seguro",
      routingDecision,
      sessionContext,
      query,
      commercialOfferReset,
    });

    if (forceBuildFailure) {
      specialistOk = false;
      specialistSkipReason = "build_failed";
    } else {
      const buildInput = {
        query,
        category: product.category || "produto",
        product,
        searchCognition,
        querySignals: {},
        responsePath: "return_seguro",
        sessionContext,
        routingDecision,
        commercialOfferReset,
      };

      const specialist = buildSpecialistDecisionExplanation(buildInput);
      specialistOk = !!specialist.ok;

      if (!specialist.ok || !specialist.text) {
        specialistSkipReason = specialist.error || "build_failed";
      } else if (isSameLegacyReply(specialist.text, legacySafeReply)) {
        specialistSkipReason = "legacy_fingerprint_after_build";
      } else {
        safeReply = specialist.text;
        specialistParagraphs = specialist.paragraphs || [];
        specialistApplied = true;
        specialistSkipReason = gateAllowed ? "" : "applied_bypassing_gate_hold";
      }
    }
  } else {
    specialistSkipReason = "no_winner";
  }

  const structuredFacts = buildStructuredExplanationFacts({
    product: product || {},
    query,
    trustedSpecs: product?.trustedSpecs,
    hasDataLayer: !!product?.isDataLayerProduct,
  });

  rows.push({
    layer: "Specialist 9.1A",
    attempted: specialistAttempted,
    applied: specialistApplied,
    outputPresent: specialistApplied && safeReply.length > 80,
    skipReason: specialistSkipReason || "",
  });

  rows.push({
    layer: "Data Layer Evidence 9.1G",
    attempted: specialistAttempted && shouldApplyDataLayerEvidenceInjection({
      responsePath: "return_seguro",
      product,
      structuredFacts,
      primaryAxis: searchCognition.primaryAxis,
      query,
      sessionContext,
    }),
    applied: specialistApplied && isEvidenceInjectionUseful(safeReply),
    outputPresent: isEvidenceInjectionUseful(safeReply),
    skipReason: product?.isDataLayerProduct ? "" : "no_data_layer",
  });

  rows.push({
    layer: "Expert Insight 9.1H",
    attempted: specialistAttempted && shouldApplyExpertInsightGeneration({
      responsePath: "return_seguro",
      product,
      structuredFacts,
      evidence: null,
      sessionContext,
    }),
    applied: specialistApplied && INSIGHT_MARKER_PATTERN.test(safeReply),
    outputPresent: INSIGHT_MARKER_PATTERN.test(safeReply),
    skipReason: product?.isDataLayerProduct ? "" : "requires_evidence",
  });

  rows.push({
    layer: "Authority 9.1C",
    attempted: specialistAttempted,
    applied: specialistApplied,
    outputPresent: /autoridade|mercado|anúncio/i.test(safeReply),
    skipReason: "",
  });

  rows.push({
    layer: "Tradeoff 9.1D",
    attempted: specialistAttempted && shouldApplyTradeoffCommunication({ responsePath: "return_seguro", sessionContext }),
    applied: specialistApplied && hasTradeoffMarkers(safeReply),
    outputPresent: hasTradeoffMarkers(safeReply),
    skipReason: specialistApplied ? "" : "specialist_not_applied",
  });

  if (hasCommercialWinner && !specialistApplied) {
    const before = safeReply;
    safeReply = enrichOfferReply(safeReply, product, query, { resetDecision: commercialOfferReset });
    commercialEnrichApplied = normalizeFingerprint(safeReply) !== normalizeFingerprint(before);
  }

  let intentApplied = false;
  if (specialistApplied) {
    const intent = appendUserIntentDiscovery({
      reply: safeReply,
      query,
      category: product?.category || "celular",
      searchCognition,
      querySignals: {},
      routingDecision,
      responsePath: "return_seguro",
      sessionContext,
    });
    if (intent.applied && intent.reply) {
      safeReply = intent.reply;
      intentApplied = true;
    }
  }

  rows.push({
    layer: "Intent Discovery 9.1B",
    attempted: specialistApplied,
    applied: intentApplied,
    outputPresent: intentApplied,
    skipReason: specialistApplied ? "" : "specialist_not_applied",
  });

  let variationApplied = false;
  if (specialistApplied && shouldApplyHumanCognitiveVariation({ reply: safeReply, query, responsePath: "return_seguro", sessionContext, routingDecision })) {
    const varied = finalizeReplyWithHumanCognitiveVariation({
      reply: safeReply,
      paragraphs: specialistParagraphs,
      query,
      winnerName,
      productName: winnerName,
      allowedEvidence: winnerName,
      primaryAxis: searchCognition.primaryAxis,
      responsePath: "return_seguro",
    });
    if (varied.ok && varied.text) {
      safeReply = varied.text;
      variationApplied = !!varied.applied;
    }
  }

  rows.push({
    layer: "Cognitive Variation 9.1I",
    attempted: specialistApplied,
    applied: variationApplied,
    outputPresent: variationApplied,
    skipReason: specialistApplied ? "" : "specialist_not_applied",
  });

  let memoryApplied = false;
  if (specialistApplied && shouldApplyArgumentMemory({ reply: safeReply, responsePath: "return_seguro", sessionContext })) {
    const memory = finalizeReplyWithArgumentMemory({
      reply: safeReply,
      query,
      winnerName,
      productName: winnerName,
      allowedEvidence: winnerName,
      primaryAxis: searchCognition.primaryAxis,
      responsePath: "return_seguro",
      sessionContext,
      isFollowUp: !!sessionContext?.lastBestProduct?.product_name && !routingDecision?.allowNewSearch,
      allowNewSearch: !!routingDecision?.allowNewSearch,
    });
    if (memory.ok && memory.text) {
      safeReply = memory.text;
      memoryApplied = !!memory.applied;
    }
  }

  rows.push({
    layer: "Argument Memory 9.1J",
    attempted: specialistApplied,
    applied: memoryApplied,
    outputPresent: memoryApplied,
    skipReason: specialistApplied ? "" : "specialist_not_applied",
  });

  let narrativeApplied = false;
  if (specialistApplied && shouldApplySpecialistNarrative({ reply: safeReply, responsePath: "return_seguro", sessionContext })) {
    const narrative = finalizeReplyWithSpecialistNarrative({
      reply: safeReply,
      query,
      winnerName,
      productName: winnerName,
      allowedEvidence: winnerName,
      primaryAxis: searchCognition.primaryAxis,
      responsePath: "return_seguro",
    });
    if (narrative.text) {
      safeReply = narrative.text;
      narrativeApplied = !!narrative.applied;
    }
  }

  rows.push({
    layer: "Specialist Narrative 9.2A",
    attempted: specialistApplied,
    applied: narrativeApplied,
    outputPresent: narrativeApplied,
    skipReason: specialistApplied ? "" : "specialist_not_applied",
  });

  let compressionApplied = false;
  if (specialistApplied && shouldApplyRepetitionCompression({ reply: safeReply, responsePath: "return_seguro", sessionContext })) {
    const compression = finalizeReplyWithRepetitionCompression({
      reply: safeReply,
      query,
      winnerName,
      productName: winnerName,
      allowedEvidence: winnerName,
      primaryAxis: searchCognition.primaryAxis,
      searchCognition,
      responsePath: "return_seguro",
    });
    if (compression.text) {
      safeReply = compression.text;
      compressionApplied = !!compression.applied;
    }
  }

  rows.push({
    layer: "Repetition Compression 9.2D",
    attempted: specialistApplied,
    applied: compressionApplied,
    outputPresent: compressionApplied || specialistApplied,
    skipReason: compressionApplied ? "" : specialistApplied ? "no_redundancy" : "specialist_not_applied",
  });

  let closingApplied = false;
  if (specialistApplied && shouldApplyConversationalClosing({ reply: safeReply, responsePath: "return_seguro", sessionContext })) {
    const closing = finalizeReplyWithConversationalClosing({
      reply: safeReply,
      query,
      category: product?.category || "celular",
      winnerName,
      productName: winnerName,
      allowedEvidence: winnerName,
      primaryAxis: searchCognition.primaryAxis,
      searchCognition,
      responsePath: "return_seguro",
      sessionContext,
    });
    if (closing.text) {
      safeReply = closing.text;
      closingApplied = !!closing.applied;
    }
  }

  rows.push({
    layer: "Conversational Closing 9.2E",
    attempted: specialistApplied,
    applied: closingApplied,
    outputPresent: hasAdequateConversationalClosing(safeReply),
    skipReason: specialistApplied ? "" : "specialist_not_applied",
  });

  let visualApplied = false;
  if (specialistApplied && shouldApplyTradeoffVisualEmphasis({ reply: safeReply, responsePath: "return_seguro", sessionContext })) {
    const visual = finalizeReplyWithTradeoffVisualEmphasis({
      reply: safeReply,
      winnerName,
      productName: winnerName,
      allowedEvidence: winnerName,
      responsePath: "return_seguro",
    });
    if (visual.text) {
      safeReply = visual.text;
      visualApplied = !!visual.applied;
    }
  }

  rows.push({
    layer: "Tradeoff Visual Emphasis 9.2F",
    attempted: specialistApplied,
    applied: visualApplied,
    outputPresent: hasVisualTradeoffEmphasis(safeReply),
    skipReason: specialistApplied
      ? hasTradeoffMarkers(safeReply)
        ? ""
        : "no_tradeoff_markers"
      : "specialist_not_applied",
  });

  rows.push({
    layer: "Cleanup 9.1F",
    attempted: false,
    applied: false,
    outputPresent: false,
    skipReason: "not_wired_return_seguro_post_9_2F",
  });

  const finalRendererType = resolveFinalRendererType({
    specialistApplied,
    commercialEnrichApplied,
    safeReply,
    legacySafeReply,
  });

  rows.push({
    layer: "Final Renderer",
    attempted: true,
    applied: true,
    outputPresent: finalRendererType === "specialist",
    skipReason: finalRendererType,
  });

  trace.flags = {
    specialistAttempted,
    specialistOk,
    specialistApplied,
    specialistSkipReason,
    commercialEnrichApplied,
    finalRendererType,
    legacyFingerprint: isSameLegacyReply(safeReply, legacySafeReply),
    hasTradeoff: hasTradeoffMarkers(safeReply),
    hasVisualTradeoff: hasVisualTradeoffEmphasis(safeReply),
  };
  trace.finalReply = safeReply;

  return trace;
}

function printTable(rows) {
  const col = Math.max(28, ...rows.map((r) => r.layer.length));
  console.log(
    `${"Layer".padEnd(col)} | Attempted | Applied | Output | Skip Reason`
  );
  console.log(`${"-".repeat(col)}-|-----------|---------|--------|------------`);
  for (const row of rows) {
    console.log(
      `${row.layer.padEnd(col)} | ${String(row.attempted).padEnd(9)} | ${String(row.applied).padEnd(7)} | ${String(row.outputPresent).padEnd(6)} | ${row.skipReason}`
    );
  }
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}${detail ? " — " + detail : ""}`;
    failures.push(msg.trim());
    console.log(msg);
  }
}

function assertSpecialistPipeline(id, trace) {
  assert(`${id}: attempted`, trace.flags.specialistAttempted);
  assert(`${id}: specialist ok`, trace.flags.specialistOk);
  assert(`${id}: applied`, trace.flags.specialistApplied);
  assert(`${id}: finalRenderer=specialist`, trace.flags.finalRendererType === "specialist", trace.flags.finalRendererType);
  assert(`${id}: not legacy fingerprint`, !trace.flags.legacyFingerprint);
  assert(`${id}: tradeoff present`, trace.flags.hasTradeoff);
  assert(`${id}: 9.2F visual`, trace.flags.hasVisualTradeoff);
}

console.log("\nPATCH 9.2G — Runtime Specialist Pipeline Wiring Audit\n");

console.log("── Static wiring checks (chat-gpt4o.js) ──");
assert("wiring: always attempt with winner", CHAT_SOURCE.includes("specialistDecisionExplanationAttempted = true"));
assert("wiring: build without gate-only guard", CHAT_SOURCE.includes("hasCommercialWinner"));
assert("wiring: skip reason debug", CHAT_SOURCE.includes("specialistDecisionExplanationSkipReason"));
assert("wiring: finalRendererType", CHAT_SOURCE.includes("finalRendererType"));
assert("wiring: legacy fingerprint guard", CHAT_SOURCE.includes("legacy_fingerprint_after_build"));

const scenarios = [
  { id: "A", query: "Celular até 2.000", product: IPHONE_COMMERCIAL },
  { id: "B", query: "celular bom até 2k", product: IPHONE_COMMERCIAL },
  { id: "C", query: "qual celular compro com 2000?", product: IPHONE_COMMERCIAL },
  { id: "D", query: "notebook até 3000", product: NOTEBOOK },
  { id: "E", query: "monitor custo benefício", product: MONITOR },
  { id: "F", query: "cadeira boa pra home office", product: CHAIR },
  { id: "C-DL", query: "Celular até 2.000", product: IPHONE_DATA_LAYER },
];

for (const scenario of scenarios) {
  console.log(`\n── Scenario ${scenario.id}: ${scenario.query} ──`);
  const trace = simulateCommercialWiring({ query: scenario.query, product: scenario.product });
  printTable(trace.rows);
  assertSpecialistPipeline(scenario.id, trace);
  if (scenario.product.isDataLayerProduct) {
    assert(`${scenario.id}: evidence when data layer`, isEvidenceInjectionUseful(trace.finalReply));
  }
}

console.log("\n── Scenario G: sem winner válido ──");
const traceG = simulateCommercialWiring({ query: "celular até 2000", product: null });
printTable(traceG.rows);
assert("G: not attempted", !traceG.flags.specialistAttempted);
assert("G: skip no_winner", traceG.flags.specialistSkipReason === "no_winner");
assert("G: final legacy/fallback", traceG.flags.finalRendererType === "legacy" || traceG.flags.finalRendererType === "commercial_fallback");

console.log("\n── Scenario H: build ok false ──");
const traceH = simulateCommercialWiring({
  query: "Celular até 2.000",
  product: IPHONE_COMMERCIAL,
  forceBuildFailure: true,
});
printTable(traceH.rows);
assert("H: attempted", traceH.flags.specialistAttempted);
assert("H: not applied", !traceH.flags.specialistApplied);
assert("H: skip build_failed", traceH.flags.specialistSkipReason === "build_failed");
assert("H: enrich fallback", traceH.flags.commercialEnrichApplied || traceH.flags.finalRendererType === "legacy_enriched" || traceH.flags.finalRendererType === "legacy");

console.log("\n── Scenario I: follow-up com anchor ──");
const traceI = simulateCommercialWiring({
  query: "vale a pena mesmo?",
  product: IPHONE_COMMERCIAL,
  routingDecision: { allowNewSearch: false },
  sessionContext: {
    lastBestProduct: { product_name: "iPhone 13" },
    lastQuery: "celular ate 2000",
  },
});
printTable(traceI.rows);
assert("I: attempted despite gate hold", traceI.flags.specialistAttempted);
assert("I: specialist applied", traceI.flags.specialistApplied);
assert("I: preserves winner", traceI.finalReply.includes("iPhone 13"));

console.log("\n── Scenario J: tradeoff visual ──");
const traceJ = simulateCommercialWiring({ query: "Celular até 2.000", product: IPHONE_COMMERCIAL });
assert("J: ✅ header", /O que voc[eê] ganha/i.test(traceJ.finalReply));
assert("J: ⚠️ header", /O que voc[eê] abre m[aã]o/i.test(traceJ.finalReply));

console.log("\n── Real scenario fingerprint ──");
const traceReal = simulateCommercialWiring({ query: "Celular até 2.000", product: IPHONE_COMMERCIAL });
assert("Real: not observed legacy output", !isSameLegacyReply(traceReal.finalReply, LEGACY_OBSERVED));
assert("Real: finalRenderer specialist", traceReal.flags.finalRendererType === "specialist");

console.log(`\n${"=".repeat(60)}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((entry) => console.log(entry));
}
const verdict = failed === 0 ? "A) ROBUST" : failed <= 3 ? "B) PARTIAL" : "C) FAIL";
console.log(`\nVERDICT: ${verdict}`);
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
