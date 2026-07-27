/**
 * PATCH 4A.3 — Contextual Decision Synthesis
 *
 * Unifies Data Layer, commercial, specs, fallback and session recovery into
 * SemanticDecisionUnit → StructuredDecisionFacts before any consumer.
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import {
  buildSemanticDecisionUnitFromPoolItem,
  buildSemanticDecisionUnitFromWeaknessPoolItem,
} from "./miaSemanticDecisionBridge.js";
import { SEMANTIC_DECISION_ROLE } from "./miaSemanticDecisionContract.js";
import { translateDataLayerFieldsToConsequences } from "./miaConsequenceTranslationLayer.js";
import {
  buildNarrativePlanFromStructuredFacts,
  narrativePlanToOrderedLegacyStrings,
  narrativePlanToTrace,
} from "./miaNarrativePlanner.js";
import {
  buildSemanticVerbalizationPayload,
  verbalizationPlanToTrace,
} from "./miaSemanticVerbalizer.js";
import {
  buildVerbalizationStyleGovernancePayload,
  verbalizationStyleGovernanceToTrace,
} from "./miaVerbalizationStyleGovernor.js";
import {
  applyLegacyDecisionFactsAdapter,
  buildStructuredDecisionFacts,
  buildStructuredDecisionFactsFromSession,
  validateStructuredDecisionFacts,
} from "./miaStructuredDecisionFacts.js";

export const CONTEXTUAL_DECISION_SYNTHESIS_VERSION = "4A.3.0";

export const DECISION_FACT_SOURCE = Object.freeze({
  DATA_LAYER: "data_layer",
  COMMERCIAL: "commercial",
  FALLBACK: "fallback",
  SPECS: "specs",
  SESSION: "session",
  MIXED: "mixed",
  EXISTING_STRUCTURED: "existing_structured",
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanList(values = [], limit = 6) {
  const output = [];
  const seen = new Set();
  for (const entry of values) {
    const text = cleanText(entry);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function poolItemFromConsequence(text = "", type = "strength") {
  return {
    text: cleanText(text),
    family: "generic_fit",
    type,
    token: null,
    field: type === "weakness" ? "weaknesses" : "strengths",
  };
}

/**
 * @param {{ gains?: string[], sacrifices?: string[], context?: Record<string, unknown> }} input
 */
export function buildSemanticUnitsFromConsequenceStrings(input = {}) {
  const context = input.context || {};
  const gains = cleanList(input.gains, 4);
  const sacrifices = cleanList(input.sacrifices, 4);

  const gainUnits = gains.map((text, index) =>
    buildSemanticDecisionUnitFromPoolItem(poolItemFromConsequence(text, "strength"), {
      ...context,
      decisionRole: index === 0 ? SEMANTIC_DECISION_ROLE.PRIMARY_GAIN : SEMANTIC_DECISION_ROLE.SECONDARY_GAIN,
    })
  );

  const sacrificeUnits = sacrifices.map((text) =>
    buildSemanticDecisionUnitFromWeaknessPoolItem(poolItemFromConsequence(text, "weakness"), context)
  );

  return { gainUnits, sacrificeUnits };
}

/**
 * @param {{ trustedSpecs?: Record<string, unknown>, context?: Record<string, unknown> }} input
 */
export function buildSemanticUnitsFromTrustedSpecs(input = {}) {
  const specs = input.trustedSpecs || {};
  const context = input.context || {};
  const translated = translateDataLayerFieldsToConsequences(specs);

  const gainStrings = [
    ...cleanList(translated.strengths?.map((item) => item?.consequence || item), 3),
    ...cleanList(translated.idealFor?.map((item) => item?.consequence || item), 2),
  ];

  const sacrificeStrings = [
    ...cleanList(translated.weaknesses?.map((item) => item?.consequence || item), 3),
    ...cleanList(translated.avoidIf?.map((item) => item?.consequence || item), 2),
    ...cleanList(translated.riskNotes?.map((item) => item?.consequence || item), 1),
  ];

  return buildSemanticUnitsFromConsequenceStrings({
    gains: gainStrings,
    sacrifices: sacrificeStrings,
    context: { ...context, sourceOrigin: DECISION_FACT_SOURCE.SPECS },
  });
}

/**
 * @param {{
 *   structuredDecisionFacts?: Record<string, unknown>|null,
 *   gainUnits?: import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[],
 *   sacrificeUnits?: import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[],
 *   gainStrings?: string[],
 *   sacrificeStrings?: string[],
 *   trustedSpecs?: Record<string, unknown>|null,
 *   sessionContext?: Record<string, unknown>,
 *   productName?: string,
 *   category?: string,
 *   primaryAxis?: string,
 *   sourceOrigin?: string,
 * }} input
 */
export function synthesizeContextualDecisionFacts(input = {}) {
  const context = {
    productName: input.productName || null,
    category: input.category || null,
    primaryAxis: input.primaryAxis || "",
    userPriorityPhrase: input.userPriorityPhrase || "",
  };

  const existing = input.structuredDecisionFacts || input.sessionContext?.lastStructuredDecisionFacts;
  if (existing?.semanticUnits?.length) {
    const validation = validateStructuredDecisionFacts(existing);
    if (validation.valid && existing.legacy?.isPrimaryTruth !== true) {
      return {
        structuredDecisionFacts: existing,
        gainUnits: existing.semanticUnits.filter((unit) => unit.decisionRole !== "tradeoff"),
        sacrificeUnits: existing.tradeoffs?.map((entry) => entry.unit).filter(Boolean) || [],
        sourceOrigin: input.sourceOrigin || DECISION_FACT_SOURCE.EXISTING_STRUCTURED,
        synthesized: false,
      };
    }
  }

  let gainUnits = Array.isArray(input.gainUnits) ? input.gainUnits.filter(Boolean) : [];
  let sacrificeUnits = Array.isArray(input.sacrificeUnits) ? input.sacrificeUnits.filter(Boolean) : [];

  if (!gainUnits.length && !sacrificeUnits.length) {
    const fromStrings = buildSemanticUnitsFromConsequenceStrings({
      gains: input.gainStrings || [],
      sacrifices: input.sacrificeStrings || [],
      context,
    });
    gainUnits = fromStrings.gainUnits;
    sacrificeUnits = fromStrings.sacrificeUnits;
  }

  if ((!gainUnits.length || !sacrificeUnits.length) && input.trustedSpecs) {
    const fromSpecs = buildSemanticUnitsFromTrustedSpecs({
      trustedSpecs: input.trustedSpecs,
      context,
    });
    if (!gainUnits.length) gainUnits = fromSpecs.gainUnits;
    if (!sacrificeUnits.length) sacrificeUnits = fromSpecs.sacrificeUnits;
  }

  if (!gainUnits.length && !sacrificeUnits.length && input.sessionContext) {
    const fromSession = buildStructuredDecisionFactsFromSession(input.sessionContext, context);
    if (fromSession.semanticUnits?.length) {
      return {
        structuredDecisionFacts: fromSession,
        gainUnits: fromSession.semanticUnits,
        sacrificeUnits: fromSession.tradeoffs?.map((entry) => entry.unit).filter(Boolean) || [],
        sourceOrigin: DECISION_FACT_SOURCE.SESSION,
        synthesized: true,
      };
    }
  }

  if (!gainUnits.length && !sacrificeUnits.length) {
    return {
      structuredDecisionFacts: null,
      gainUnits: [],
      sacrificeUnits: [],
      sourceOrigin: input.sourceOrigin || null,
      synthesized: false,
    };
  }

  const structuredDecisionFacts = buildStructuredDecisionFacts({
    gainUnits,
    sacrificeUnits,
    productName: context.productName,
    category: context.category,
    primaryAxis: context.primaryAxis,
  });

  if (!structuredDecisionFacts.semanticUnits.length) {
    return {
      structuredDecisionFacts: null,
      gainUnits,
      sacrificeUnits,
      sourceOrigin: input.sourceOrigin || null,
      synthesized: false,
    };
  }

  if (structuredDecisionFacts.legacy?.isPrimaryTruth === true) {
    structuredDecisionFacts.legacy.isPrimaryTruth = false;
  }

  return {
    structuredDecisionFacts,
    gainUnits,
    sacrificeUnits,
    sourceOrigin: input.sourceOrigin || DECISION_FACT_SOURCE.MIXED,
    synthesized: true,
  };
}

/**
 * Maps structured facts to session legacy fields via adapter (never primary truth).
 * @param {ReturnType<typeof buildStructuredDecisionFacts>|null} structured
 * @param {Record<string, unknown>} fallback
 */
export function deriveSessionFieldsFromStructuredFacts(structured = null, fallback = {}) {
  if (!structured?.semanticUnits?.length) {
    return {
      lastMainConsequence: fallback.lastMainConsequence || "",
      lastWinnerAdvantages: fallback.lastWinnerAdvantages || [],
      lastWinnerSacrifices: fallback.lastWinnerSacrifices || [],
      lastTradeoff: fallback.lastTradeoff || "",
      lastDecisionReason: fallback.lastDecisionReason || "",
    };
  }

  const adapted = applyLegacyDecisionFactsAdapter(
    {
      mainConsequence: fallback.lastMainConsequence || "",
      advantages: fallback.lastWinnerAdvantages || [],
      sacrifices: fallback.lastWinnerSacrifices || [],
    },
    structured
  );

  const primaryText =
    adapted.structured?.legacy?.mainConsequence ||
    adapted.mainConsequence ||
    fallback.lastMainConsequence ||
    "";

  return {
    lastMainConsequence: primaryText,
    lastWinnerAdvantages:
      adapted.advantages?.length > 0
        ? adapted.advantages
        : fallback.lastWinnerAdvantages || [],
    lastWinnerSacrifices:
      adapted.sacrifices?.length > 0
        ? adapted.sacrifices
        : fallback.lastWinnerSacrifices || [],
    lastTradeoff:
      adapted.sacrifices?.[0] ||
      fallback.lastTradeoff ||
      "",
    lastDecisionReason:
      primaryText && fallback.lastDecisionReason
        ? fallback.lastDecisionReason
        : primaryText
          ? `Escolhido por ${fallback.primaryAxis || "equilíbrio geral"}: ${primaryText}`
          : fallback.lastDecisionReason || "",
  };
}

/**
 * Final payload for session persistence and downstream consumers.
 */
export function buildContextualDecisionSynthesisPayload(input = {}) {
  const synthesis = synthesizeContextualDecisionFacts(input);
  const structured = synthesis.structuredDecisionFacts;
  const fallback = {
    lastMainConsequence:
      input.searchCognition?.narrativeBlocks?.mainConsequence ||
      input.decisionMemory?.lastMainConsequence ||
      "",
    lastWinnerAdvantages: input.decisionMemory?.lastWinnerAdvantages || [],
    lastWinnerSacrifices: input.decisionMemory?.lastWinnerSacrifices || [],
    lastTradeoff: input.decisionMemory?.lastTradeoff || "",
    lastDecisionReason: input.decisionMemory?.lastDecisionReason || "",
    primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
  };

  const sessionFields = deriveSessionFieldsFromStructuredFacts(structured, fallback);
  const narrativePlan = buildNarrativePlanFromStructuredFacts(structured, {
    hasWinner: !!input.productName || !!input.decisionMemory?.lastBestProduct,
    needsClarification: !!input.needsClarification,
    isExploratory: !!input.isExploratory,
    responsePath: input.responsePath || "",
  });
  const verbalization = buildSemanticVerbalizationPayload(narrativePlan, {
    query: input.query || input.sessionContext?.lastQuery || "",
    productName: input.productName,
    winnerName: input.productName,
    responsePath: input.responsePath || "",
    isExploratory: !!input.isExploratory,
    querySignals: input.querySignals || {},
    safetyAntiregret: !!input.safetyAntiregret,
    isFollowUp: !!input.isFollowUp,
    specificProductLockActive: !!input.specificProductLockActive,
    sessionContext: input.sessionContext || null,
  });
  const styleGovernance = buildVerbalizationStyleGovernancePayload(
    verbalization.verbalizationPlan,
    {
      query: input.query || input.sessionContext?.lastQuery || "",
      sessionContext: input.sessionContext || null,
    }
  );

  return {
    version: CONTEXTUAL_DECISION_SYNTHESIS_VERSION,
    sourceOrigin: synthesis.sourceOrigin,
    synthesized: synthesis.synthesized,
    structuredDecisionFacts: structured,
    narrativePlan,
    verbalizationPlan: verbalization.verbalizationPlan,
    llmVerbalizationContract: verbalization.llmContract,
    verbalizationStyleGovernance: styleGovernance,
    llmStyleContract: styleGovernance.llmStyleContract,
    gainUnits: synthesis.gainUnits,
    sacrificeUnits: synthesis.sacrificeUnits,
    sessionFields,
    legacyIsPrimaryTruth: structured?.legacy?.isPrimaryTruth === true,
  };
}

/**
 * Ensures tradeoff sources always carry structured facts when strings exist.
 * @param {Record<string, unknown>} sources
 * @param {Record<string, unknown>} context
 */
function attachNarrativePlanOrdering(sources = {}, narrativePlan = null, verbalizationPlan = null) {
  const ordered = verbalizationPlan?.sections?.length
    ? {
        gains: [
          verbalizationPlan.mainMessage?.text,
          ...(verbalizationPlan.supportingMessages || []).map((entry) => entry.text),
        ].filter(Boolean),
        sacrifices: (verbalizationPlan.tradeoffs || []).map((entry) => entry.text).filter(Boolean),
        caveats: (verbalizationPlan.caveats || []).map((entry) => entry.text).filter(Boolean),
      }
    : narrativePlan?.sections?.length
      ? narrativePlanToOrderedLegacyStrings(narrativePlan)
      : { gains: [], sacrifices: [], caveats: [] };

  if (!narrativePlan?.sections?.length && !verbalizationPlan?.sections?.length) {
    return {
      ...sources,
      narrativePlan: narrativePlan || sources.narrativePlan || null,
      verbalizationPlan: verbalizationPlan || sources.verbalizationPlan || null,
    };
  }

  return {
    ...sources,
    narrativePlan,
    verbalizationPlan: verbalizationPlan || sources.verbalizationPlan || null,
    gains: ordered.gains.length ? ordered.gains : sources.gains,
    sacrifices: ordered.sacrifices.length ? ordered.sacrifices : sources.sacrifices,
  };
}

export function finalizeTradeoffSourcesWithSynthesis(sources = {}, context = {}) {
  if (sources.structuredDecisionFacts?.semanticUnits?.length) {
    const narrativePlan =
      sources.narrativePlan ||
      buildNarrativePlanFromStructuredFacts(sources.structuredDecisionFacts, {
        hasWinner: !!context.productName,
        responsePath: context.responsePath || "",
      });
    return attachNarrativePlanOrdering(
      {
        ...sources,
        semanticUnits: sources.semanticUnits || sources.structuredDecisionFacts.semanticUnits,
        semanticSacrificeUnits:
          sources.semanticSacrificeUnits ||
          sources.structuredDecisionFacts.tradeoffs?.map((entry) => entry.unit).filter(Boolean) ||
          [],
      },
      narrativePlan,
      sources.verbalizationPlan ||
        buildSemanticVerbalizationPayload(narrativePlan, context).verbalizationPlan
    );
  }

  const synthesis = synthesizeContextualDecisionFacts({
    gainUnits: sources.semanticUnits || [],
    sacrificeUnits: sources.semanticSacrificeUnits || [],
    gainStrings: sources.gains || [],
    sacrificeStrings: sources.sacrifices || [],
    trustedSpecs: context.trustedSpecs || null,
    productName: context.productName,
    category: context.category,
    primaryAxis: context.primaryAxis || sources.primaryAxis,
    sourceOrigin: context.sourceOrigin,
  });

  if (!synthesis.structuredDecisionFacts) {
    return sources;
  }

  const narrativePlan = buildNarrativePlanFromStructuredFacts(synthesis.structuredDecisionFacts, {
    hasWinner: !!context.productName,
    responsePath: context.responsePath || "",
  });
  const verbalizationPlan = buildSemanticVerbalizationPayload(narrativePlan, context).verbalizationPlan;

  return attachNarrativePlanOrdering(
    {
      ...sources,
      semanticUnits: synthesis.gainUnits,
      semanticSacrificeUnits: synthesis.sacrificeUnits,
      structuredDecisionFacts: synthesis.structuredDecisionFacts,
      synthesisSource: synthesis.sourceOrigin,
    },
    narrativePlan,
    verbalizationPlan
  );
}

export function contextualSynthesisToTrace(payload = null) {
  if (!payload?.structuredDecisionFacts) return null;
  const structured = payload.structuredDecisionFacts;
  return {
    version: payload.version || CONTEXTUAL_DECISION_SYNTHESIS_VERSION,
    sourceOrigin: payload.sourceOrigin || null,
    synthesized: !!payload.synthesized,
    unitCount: structured.semanticUnits?.length || 0,
    primaryEffectKey: structured.primaryGain?.effectKey || null,
    tradeoffCount: structured.tradeoffs?.length || 0,
    legacyIsPrimaryTruth: structured.legacy?.isPrimaryTruth === true,
    narrativePlan: narrativePlanToTrace(payload.narrativePlan),
    verbalizationPlan: verbalizationPlanToTrace(payload.verbalizationPlan),
    verbalizationStyleGovernance: verbalizationStyleGovernanceToTrace(
      payload.verbalizationStyleGovernance
    ),
  };
}
