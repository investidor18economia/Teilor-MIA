/**
 * PATCH 4A.2 — Structured Decision Facts
 *
 * Transforms SemanticDecisionUnit[] into hierarchical decision intelligence.
 * Legacy string fields are derived via explicit adapter — never source of truth.
 */

import {
  SEMANTIC_DECISION_CONTRACT_VERSION,
  SEMANTIC_DECISION_ROLE,
  SEMANTIC_DIRECTION,
  buildSemanticDecisionTrace,
  validateSemanticDecisionUnit,
} from "./miaSemanticDecisionContract.js";
import { LEGACY_ADAPTER_VERSION } from "./miaSemanticDecisionLegacyAdapter.js";

export const STRUCTURED_DECISION_FACTS_VERSION = "4A.2.0";
export const STRUCTURED_DECISION_LEGACY_ADAPTER_VERSION = "4A.2.0-legacy";

export const DECISION_HIERARCHY_LAYER = Object.freeze({
  PRIMARY_GAIN: "primary_gain",
  SECONDARY_GAIN: "secondary_gain",
  TRADEOFF: "tradeoff",
  CAVEAT: "caveat",
  SUPPORTING: "supporting_argument",
  TIE_BREAKER: "tie_breaker",
  RISK: "risk",
  UNCERTAINTY: "uncertainty",
});

const HIERARCHY_ROLE_ORDER = Object.freeze([
  SEMANTIC_DECISION_ROLE.PRIMARY_GAIN,
  SEMANTIC_DECISION_ROLE.SECONDARY_GAIN,
  SEMANTIC_DECISION_ROLE.DIFFERENTIATOR,
  SEMANTIC_DECISION_ROLE.TIE_BREAKER,
  SEMANTIC_DECISION_ROLE.SUPPORTING_EVIDENCE,
  SEMANTIC_DECISION_ROLE.TRADEOFF,
  SEMANTIC_DECISION_ROLE.CAVEAT,
  SEMANTIC_DECISION_ROLE.RISK,
  SEMANTIC_DECISION_ROLE.UNCERTAINTY,
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unitKey(unit) {
  const effect = unit?.implication?.effectKey || "unknown";
  const dimension = unit?.evidence?.dimension || "generic";
  return `${dimension}::${effect}`;
}

export function dedupeSemanticUnitsByEffect(units = []) {
  const seen = new Set();
  const output = [];
  for (const unit of units) {
    if (!unit) continue;
    const key = unitKey(unit);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(unit);
  }
  return output;
}

function isTradeoffUnit(unit) {
  if (!unit) return false;
  if (unit.decisionRole === SEMANTIC_DECISION_ROLE.TRADEOFF) return true;
  if (unit.implication?.direction === SEMANTIC_DIRECTION.NEGATIVE) return true;
  return unit.evidence?.type === "comparative" && unit.implication?.direction === SEMANTIC_DIRECTION.NEGATIVE;
}

function isCaveatUnit(unit) {
  if (!unit) return false;
  if (unit.decisionRole === SEMANTIC_DECISION_ROLE.CAVEAT) return true;
  return !!unit.caveat;
}

function isGainUnit(unit) {
  if (!unit || isTradeoffUnit(unit) || isCaveatUnit(unit)) return false;
  const direction = unit.implication?.direction;
  return direction === SEMANTIC_DIRECTION.POSITIVE || direction === SEMANTIC_DIRECTION.NEUTRAL || !direction;
}

function wrapStructuredElement(unit, hierarchyRank, decisionRole) {
  return {
    hierarchyRank,
    decisionRole,
    unitId: unit.id,
    effectKey: unit.implication?.effectKey || null,
    evidenceId: unit.evidence?.id || null,
    implicationId: unit.implication?.id || null,
    confidence: unit.implication?.confidence || unit.evidence?.confidence || null,
    unit,
  };
}

function legacyTextFromUnit(unit) {
  if (!unit) return "";
  return (
    unit.implication?.interpretedSourceText ||
    unit.evidence?.interpretedText ||
    unit.legacy?.compactedText ||
    ""
  );
}

/**
 * @param {import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[]} gainUnits
 * @param {import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[]} sacrificeUnits
 * @param {{ productName?: string, category?: string, primaryAxis?: string }} [context]
 */
export function buildStructuredDecisionFacts(input = {}) {
  const gainUnits = dedupeSemanticUnitsByEffect(Array.isArray(input.gainUnits) ? input.gainUnits : []);
  const sacrificeUnits = dedupeSemanticUnitsByEffect(
    Array.isArray(input.sacrificeUnits) ? input.sacrificeUnits : []
  );
  const caveatUnits = dedupeSemanticUnitsByEffect(
    Array.isArray(input.caveatUnits) ? input.caveatUnits : []
  );

  const validGainUnits = gainUnits.filter((unit) => validateSemanticDecisionUnit(unit).valid);
  const validSacrificeUnits = sacrificeUnits.filter((unit) => validateSemanticDecisionUnit(unit).valid);
  const validCaveatUnits = caveatUnits.filter((unit) => validateSemanticDecisionUnit(unit).valid);

  let primaryCandidate =
    validGainUnits.find((unit) => unit.decisionRole === SEMANTIC_DECISION_ROLE.PRIMARY_GAIN) ||
    validGainUnits.find((unit) => isGainUnit(unit)) ||
    null;

  const secondaryCandidates = validGainUnits.filter(
    (unit) => unit !== primaryCandidate && isGainUnit(unit)
  );

  const tradeoffCandidates = [
    ...validSacrificeUnits,
    ...validGainUnits.filter((unit) => isTradeoffUnit(unit)),
  ].filter((unit, index, list) => list.indexOf(unit) === index);

  const caveatCandidates = [
    ...validCaveatUnits,
    ...validGainUnits.filter((unit) => isCaveatUnit(unit)),
    ...validSacrificeUnits.filter((unit) => isCaveatUnit(unit)),
  ].filter((unit, index, list) => list.indexOf(unit) === index);

  const semanticUnits = dedupeSemanticUnitsByEffect([
    ...validGainUnits,
    ...validSacrificeUnits,
    ...validCaveatUnits,
  ]);

  const hierarchy = [];
  let rank = 1;

  const primaryGain = primaryCandidate
    ? wrapStructuredElement(primaryCandidate, rank++, SEMANTIC_DECISION_ROLE.PRIMARY_GAIN)
    : null;
  if (primaryGain) {
    hierarchy.push({
      rank: primaryGain.hierarchyRank,
      layer: DECISION_HIERARCHY_LAYER.PRIMARY_GAIN,
      unitId: primaryGain.unitId,
      decisionRole: primaryGain.decisionRole,
      effectKey: primaryGain.effectKey,
    });
  }

  const secondaryGains = secondaryCandidates.map((unit) => {
    const element = wrapStructuredElement(unit, rank++, SEMANTIC_DECISION_ROLE.SECONDARY_GAIN);
    hierarchy.push({
      rank: element.hierarchyRank,
      layer: DECISION_HIERARCHY_LAYER.SECONDARY_GAIN,
      unitId: element.unitId,
      decisionRole: element.decisionRole,
      effectKey: element.effectKey,
    });
    return element;
  });

  const tradeoffs = tradeoffCandidates.map((unit) => {
    const element = wrapStructuredElement(unit, rank++, SEMANTIC_DECISION_ROLE.TRADEOFF);
    hierarchy.push({
      rank: element.hierarchyRank,
      layer: DECISION_HIERARCHY_LAYER.TRADEOFF,
      unitId: element.unitId,
      decisionRole: element.decisionRole,
      effectKey: element.effectKey,
    });
    return element;
  });

  const caveats = caveatCandidates.map((unit) => {
    const element = wrapStructuredElement(unit, rank++, SEMANTIC_DECISION_ROLE.CAVEAT);
    hierarchy.push({
      rank: element.hierarchyRank,
      layer: DECISION_HIERARCHY_LAYER.CAVEAT,
      unitId: element.unitId,
      decisionRole: element.decisionRole,
      effectKey: element.effectKey,
    });
    return element;
  });

  const legacyMain = legacyTextFromUnit(primaryGain?.unit);
  const legacyAdvantages = secondaryGains.map((entry) => legacyTextFromUnit(entry.unit)).filter(Boolean);
  const legacySacrifices = tradeoffs.map((entry) => legacyTextFromUnit(entry.unit)).filter(Boolean);

  return {
    schemaVersion: STRUCTURED_DECISION_FACTS_VERSION,
    semanticContractVersion: SEMANTIC_DECISION_CONTRACT_VERSION,
    semanticUnits,
    primaryGain,
    secondaryGains,
    tradeoffs,
    caveats,
    hierarchy,
    legacy: {
      mainConsequence: legacyMain || null,
      advantages: legacyAdvantages,
      sacrifices: legacySacrifices,
      adapterVersion: STRUCTURED_DECISION_LEGACY_ADAPTER_VERSION,
      isPrimaryTruth: false,
    },
    trace: buildSemanticDecisionTrace(semanticUnits),
    meta: {
      productName: input.productName || null,
      category: input.category || null,
      primaryAxis: cleanText(input.primaryAxis || ""),
      unitCount: semanticUnits.length,
    },
  };
}

export function validateStructuredDecisionFacts(facts) {
  const errors = [];
  if (!facts || typeof facts !== "object") {
    return { valid: false, errors: ["structured_facts_missing"] };
  }
  if (facts.schemaVersion !== STRUCTURED_DECISION_FACTS_VERSION) {
    errors.push("schema_version_mismatch");
  }
  if (facts.legacy?.isPrimaryTruth === true) {
    errors.push("legacy_marked_as_primary_truth");
  }
  if (!Array.isArray(facts.semanticUnits)) {
    errors.push("semantic_units_missing");
  }
  if (!Array.isArray(facts.hierarchy)) {
    errors.push("hierarchy_missing");
  }
  if (facts.primaryGain && facts.secondaryGains?.some((entry) => entry.unitId === facts.primaryGain.unitId)) {
    errors.push("primary_gain_duplicated_in_secondary");
  }
  const hierarchyRanks = (facts.hierarchy || []).map((entry) => entry.rank);
  if (new Set(hierarchyRanks).size !== hierarchyRanks.length) {
    errors.push("hierarchy_rank_collision");
  }
  for (let i = 1; i < hierarchyRanks.length; i += 1) {
    if (hierarchyRanks[i] <= hierarchyRanks[i - 1]) {
      errors.push("hierarchy_not_monotonic");
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

export function applyLegacyDecisionFactsAdapter(baseFacts = {}, structured = null) {
  if (!structured?.semanticUnits?.length) {
    return { ...baseFacts, structured: null };
  }

  const legacy = structured.legacy || {};
  return {
    ...baseFacts,
    structured,
    mainConsequence: legacy.mainConsequence || baseFacts.mainConsequence || "",
    advantages:
      legacy.advantages?.length > 0
        ? legacy.advantages
        : baseFacts.advantages || [],
    sacrifices:
      legacy.sacrifices?.length > 0
        ? legacy.sacrifices
        : baseFacts.sacrifices || [],
    semanticUnits: structured.semanticUnits,
    decisionHierarchy: structured.hierarchy,
    primaryGainStructured: structured.primaryGain,
    secondaryGainsStructured: structured.secondaryGains,
    tradeoffsStructured: structured.tradeoffs,
    caveatsStructured: structured.caveats,
  };
}

/**
 * @param {Record<string, unknown>} sessionContext
 * @param {{ semanticUnits?: import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[], gainUnits?: import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[], sacrificeUnits?: import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[] }} [options]
 */
export function buildStructuredDecisionFactsFromSession(sessionContext = {}, options = {}) {
  const gainUnits =
    options.gainUnits ||
    options.semanticUnits ||
    sessionContext.lastSemanticDecisionUnits ||
    sessionContext.semanticUnits ||
    [];
  const sacrificeUnits =
    options.sacrificeUnits || sessionContext.lastSemanticSacrificeUnits || [];

  return buildStructuredDecisionFacts({
    gainUnits,
    sacrificeUnits,
    caveatUnits: options.caveatUnits || sessionContext.lastSemanticCaveatUnits || [],
    productName: sessionContext.lastBestProduct?.product_name || options.productName,
    category: sessionContext.lastCategory || options.category,
    primaryAxis:
      sessionContext.lastAxis ||
      sessionContext.lastPriority ||
      options.primaryAxis ||
      "",
  });
}

export function enrichDecisionFactsWithStructure(baseFacts = {}, input = {}) {
  const structured = buildStructuredDecisionFacts({
    gainUnits: input.gainUnits || input.semanticUnits || baseFacts.semanticUnits || [],
    sacrificeUnits: input.sacrificeUnits || [],
    caveatUnits: input.caveatUnits || [],
    productName: baseFacts.winner?.product_name || input.productName,
    category: baseFacts.category || input.category,
    primaryAxis: baseFacts.primaryAxis || input.primaryAxis,
  });

  if (!structured.semanticUnits.length) {
    return { ...baseFacts, structured: null };
  }

  return applyLegacyDecisionFactsAdapter(baseFacts, structured);
}

export function structuredDecisionFactsToTrace(facts = null) {
  if (!facts?.structured) return null;
  const structured = facts.structured;
  return {
    schemaVersion: structured.schemaVersion,
    unitCount: structured.semanticUnits?.length || 0,
    hierarchyCount: structured.hierarchy?.length || 0,
    primaryEffectKey: structured.primaryGain?.effectKey || null,
    secondaryCount: structured.secondaryGains?.length || 0,
    tradeoffCount: structured.tradeoffs?.length || 0,
    caveatCount: structured.caveats?.length || 0,
    legacyAdapterUsed: !!structured.legacy?.mainConsequence,
    legacyIsPrimaryTruth: structured.legacy?.isPrimaryTruth === true,
  };
}

export function getStructuredPrimaryEffectKey(facts = {}) {
  return facts.structured?.primaryGain?.effectKey || facts.primaryGainStructured?.effectKey || null;
}

export function hasStructuredDecisionFacts(facts = {}) {
  return !!facts.structured?.semanticUnits?.length || !!facts.semanticUnits?.length;
}

export function sortUnitsByDecisionRole(units = []) {
  return [...units].sort((a, b) => {
    const ai = HIERARCHY_ROLE_ORDER.indexOf(a.decisionRole);
    const bi = HIERARCHY_ROLE_ORDER.indexOf(b.decisionRole);
    return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
  });
}
