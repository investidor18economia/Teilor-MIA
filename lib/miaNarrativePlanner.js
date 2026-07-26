/**
 * PATCH 4A.4 — Category-Agnostic Narrative Planner
 *
 * Organizes StructuredDecisionFacts into a NarrativePlan.
 * Does not create intelligence, decide winners, or generate text.
 */

import { DECISION_HIERARCHY_LAYER } from "./miaStructuredDecisionFacts.js";
import { validateStructuredDecisionFacts } from "./miaStructuredDecisionFacts.js";

export const NARRATIVE_PLANNER_VERSION = "4A.4.0";

export const NARRATIVE_CLOSING_TYPE = Object.freeze({
  RECOMMENDATION: "recommendation",
  CLARIFICATION: "clarification",
  CONFIDENCE: "confidence",
  NEUTRAL: "neutral",
  EXPLORATORY: "exploratory",
});

export const NARRATIVE_SECTION_TYPE = Object.freeze({
  PRIMARY_NARRATIVE: "primary_narrative",
  SUPPORTING_ARGUMENT: "supporting_argument",
  TRADEOFF: "tradeoff",
  CAVEAT: "caveat",
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function legacyTextFromUnit(unit) {
  if (!unit) return "";
  return cleanText(
    unit.implication?.interpretedSourceText ||
      unit.evidence?.interpretedText ||
      unit.legacy?.compactedText ||
      ""
  );
}

function planElementFromStructured(entry, sectionType) {
  if (!entry?.unit) return null;
  return {
    sectionType,
    hierarchyRank: entry.hierarchyRank,
    unitId: entry.unitId,
    effectKey: entry.effectKey || null,
    decisionRole: entry.decisionRole || null,
    layer:
      sectionType === NARRATIVE_SECTION_TYPE.PRIMARY_NARRATIVE
        ? DECISION_HIERARCHY_LAYER.PRIMARY_GAIN
        : sectionType === NARRATIVE_SECTION_TYPE.SUPPORTING_ARGUMENT
          ? DECISION_HIERARCHY_LAYER.SECONDARY_GAIN
          : sectionType === NARRATIVE_SECTION_TYPE.TRADEOFF
            ? DECISION_HIERARCHY_LAYER.TRADEOFF
            : DECISION_HIERARCHY_LAYER.CAVEAT,
    legacyText: legacyTextFromUnit(entry.unit),
    unit: entry.unit,
  };
}

function dedupePlanElementsByEffect(elements = []) {
  const seen = new Set();
  const output = [];
  for (const element of elements) {
    if (!element) continue;
    const key = element.effectKey || element.unitId || element.legacyText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(element);
  }
  return output;
}

/**
 * @param {Record<string, unknown>} structuredFacts
 * @param {{
 *   hasWinner?: boolean,
 *   needsClarification?: boolean,
 *   isExploratory?: boolean,
 *   responsePath?: string,
 * }} [context]
 */
export function resolveRecommendedClosing(structuredFacts = null, context = {}) {
  if (context.needsClarification) {
    return { type: NARRATIVE_CLOSING_TYPE.CLARIFICATION, reason: "needs_clarification" };
  }
  if (structuredFacts && !structuredFacts.primaryGain) {
    return { type: NARRATIVE_CLOSING_TYPE.CLARIFICATION, reason: "missing_primary_gain" };
  }
  if (context.isExploratory || context.responsePath === "discovery") {
    return { type: NARRATIVE_CLOSING_TYPE.EXPLORATORY, reason: "exploratory_query" };
  }
  if (
    context.hasWinner !== false &&
    structuredFacts?.tradeoffs?.length &&
    structuredFacts?.primaryGain
  ) {
    return {
      type: NARRATIVE_CLOSING_TYPE.CONFIDENCE,
      reason: "structured_recommendation_with_tradeoffs",
    };
  }
  if (context.hasWinner !== false && structuredFacts?.primaryGain) {
    return { type: NARRATIVE_CLOSING_TYPE.RECOMMENDATION, reason: "structured_recommendation" };
  }
  return { type: NARRATIVE_CLOSING_TYPE.NEUTRAL, reason: "default" };
}

/**
 * @param {ReturnType<import("./miaStructuredDecisionFacts.js").buildStructuredDecisionFacts>|null} structuredFacts
 * @param {Record<string, unknown>} [context]
 */
export function buildNarrativePlan(structuredFacts = null, context = {}) {
  if (!structuredFacts?.hierarchy?.length) {
    return {
      schemaVersion: NARRATIVE_PLANNER_VERSION,
      structuredFactsVersion: structuredFacts?.schemaVersion || null,
      primaryNarrative: null,
      supportingArguments: [],
      tradeoffs: [],
      caveats: [],
      sections: [],
      recommendedClosing: resolveRecommendedClosing(structuredFacts, context),
      legacy: { gains: [], sacrifices: [], caveats: [], isPrimaryTruth: false },
      trace: { sectionCount: 0, closingType: resolveRecommendedClosing(structuredFacts, context).type },
      meta: { categoryAgnostic: true, builtFromStructuredFacts: false },
    };
  }

  const primaryNarrative = structuredFacts.primaryGain
    ? planElementFromStructured(structuredFacts.primaryGain, NARRATIVE_SECTION_TYPE.PRIMARY_NARRATIVE)
    : null;

  const supportingArguments = dedupePlanElementsByEffect(
    (structuredFacts.secondaryGains || [])
      .map((entry) => planElementFromStructured(entry, NARRATIVE_SECTION_TYPE.SUPPORTING_ARGUMENT))
      .filter(Boolean)
  );

  const tradeoffs = dedupePlanElementsByEffect(
    (structuredFacts.tradeoffs || [])
      .map((entry) => planElementFromStructured(entry, NARRATIVE_SECTION_TYPE.TRADEOFF))
      .filter(Boolean)
  );

  const caveats = dedupePlanElementsByEffect(
    (structuredFacts.caveats || [])
      .map((entry) => planElementFromStructured(entry, NARRATIVE_SECTION_TYPE.CAVEAT))
      .filter(Boolean)
  );

  const sections = dedupePlanElementsByEffect([
    primaryNarrative,
    ...supportingArguments,
    ...tradeoffs,
    ...caveats,
  ])
    .filter(Boolean)
    .sort((a, b) => a.hierarchyRank - b.hierarchyRank);

  const gains = [
    primaryNarrative?.legacyText,
    ...supportingArguments.map((entry) => entry.legacyText),
  ].filter(Boolean);

  const sacrifices = tradeoffs.map((entry) => entry.legacyText).filter(Boolean);
  const caveatTexts = caveats.map((entry) => entry.legacyText).filter(Boolean);
  const recommendedClosing = resolveRecommendedClosing(structuredFacts, context);

  return {
    schemaVersion: NARRATIVE_PLANNER_VERSION,
    structuredFactsVersion: structuredFacts.schemaVersion,
    primaryNarrative,
    supportingArguments,
    tradeoffs,
    caveats,
    sections,
    recommendedClosing,
    legacy: {
      gains,
      sacrifices,
      caveats: caveatTexts,
      isPrimaryTruth: false,
    },
    trace: {
      sectionCount: sections.length,
      closingType: recommendedClosing.type,
      hierarchyRanks: sections.map((entry) => entry.hierarchyRank),
      effectKeys: sections.map((entry) => entry.effectKey).filter(Boolean),
    },
    meta: {
      categoryAgnostic: true,
      builtFromStructuredFacts: true,
      unitCount: structuredFacts.semanticUnits?.length || 0,
    },
  };
}

export function validateNarrativePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") {
    return { valid: false, errors: ["narrative_plan_missing"] };
  }
  if (plan.schemaVersion !== NARRATIVE_PLANNER_VERSION) {
    errors.push("schema_version_mismatch");
  }
  if (plan.legacy?.isPrimaryTruth === true) {
    errors.push("legacy_marked_as_primary_truth");
  }
  if (!Array.isArray(plan.sections)) {
    errors.push("sections_missing");
  }
  if (plan.primaryNarrative && plan.sections[0]?.unitId !== plan.primaryNarrative.unitId) {
    errors.push("primary_not_first_in_sections");
  }
  const tradeoffKeys = new Set((plan.tradeoffs || []).map((entry) => entry.effectKey || entry.unitId));
  if (tradeoffKeys.size !== (plan.tradeoffs || []).length) {
    errors.push("duplicate_tradeoffs");
  }
  let lastRank = 0;
  for (const section of plan.sections || []) {
    if (section.hierarchyRank < lastRank) {
      errors.push("section_order_violation");
      break;
    }
    lastRank = section.hierarchyRank;
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Ordered gain/sacrifice strings for legacy consumers — plan-driven, not self-built.
 * @param {ReturnType<typeof buildNarrativePlan>|null} plan
 */
export function narrativePlanToOrderedLegacyStrings(plan = null) {
  if (!plan?.legacy) {
    return { gains: [], sacrifices: [], caveats: [] };
  }
  return {
    gains: [...(plan.legacy.gains || [])],
    sacrifices: [...(plan.legacy.sacrifices || [])],
    caveats: [...(plan.legacy.caveats || [])],
  };
}

/**
 * Verbalization order contract for downstream verbalizer (PATCH 4A.5).
 * @param {ReturnType<typeof buildNarrativePlan>|null} plan
 */
export function narrativePlanToVerbalizationOrder(plan = null) {
  if (!plan?.sections?.length) return null;
  const order = ["opening"];
  for (const section of plan.sections) {
    switch (section.sectionType) {
      case NARRATIVE_SECTION_TYPE.PRIMARY_NARRATIVE:
        order.push("mainConsequence");
        break;
      case NARRATIVE_SECTION_TYPE.SUPPORTING_ARGUMENT:
        order.push("supportingArgument");
        break;
      case NARRATIVE_SECTION_TYPE.TRADEOFF:
        order.push("tradeoffHonest");
        break;
      case NARRATIVE_SECTION_TYPE.CAVEAT:
        order.push("caveat");
        break;
      default:
        break;
    }
  }
  if (plan.recommendedClosing?.type) {
    order.push(`closing:${plan.recommendedClosing.type}`);
  }
  return [...new Set(order)];
}

export function narrativePlanToTrace(plan = null) {
  if (!plan) return null;
  return {
    version: plan.schemaVersion || NARRATIVE_PLANNER_VERSION,
    sectionCount: plan.sections?.length || 0,
    closingType: plan.recommendedClosing?.type || null,
    primaryEffectKey: plan.primaryNarrative?.effectKey || null,
    tradeoffCount: plan.tradeoffs?.length || 0,
    caveatCount: plan.caveats?.length || 0,
    legacyIsPrimaryTruth: plan.legacy?.isPrimaryTruth === true,
  };
}

/**
 * @param {ReturnType<typeof buildNarrativePlan>|null} plan
 * @param {ReturnType<import("./miaStructuredDecisionFacts.js").buildStructuredDecisionFacts>|null} structuredFacts
 */
export function buildNarrativePlanFromStructuredFacts(structuredFacts = null, context = {}) {
  const validation = structuredFacts ? validateStructuredDecisionFacts(structuredFacts) : { valid: false };
  if (!validation.valid) {
    return buildNarrativePlan(null, context);
  }
  return buildNarrativePlan(structuredFacts, context);
}

export function hasNarrativePlan(value) {
  return !!value?.sections?.length && value?.schemaVersion === NARRATIVE_PLANNER_VERSION;
}
