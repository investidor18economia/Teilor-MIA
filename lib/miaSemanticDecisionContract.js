/**
 * PATCH 4A.1 — Semantic Decision Contract
 *
 * Agnostic structured representation of evidence, implication, priority and caveat.
 * Intelligence lives here — not in final user-facing phrases.
 */

export const SEMANTIC_DECISION_CONTRACT_VERSION = "4A.1.0";

export const SEMANTIC_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  UNKNOWN: "unknown",
});

export const SEMANTIC_DIRECTION = Object.freeze({
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  MIXED: "mixed",
  UNKNOWN: "unknown",
});

export const SEMANTIC_INTENSITY = Object.freeze({
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
});

export const SEMANTIC_EVIDENCE_TYPE = Object.freeze({
  FACTUAL: "factual",
  INTERPRETIVE: "interpretive",
  COMMERCIAL: "commercial",
  COMPARATIVE: "comparative",
  ABSENCE: "absence",
  RISK: "risk",
  FALLBACK: "fallback",
});

export const SEMANTIC_EVIDENCE_SOURCE = Object.freeze({
  DATA_LAYER: "data_layer",
  COMMERCIAL: "commercial",
  ROUTING: "routing",
  SESSION: "session",
  FALLBACK: "fallback",
  UNKNOWN: "unknown",
});

export const SEMANTIC_PRIORITY_RELEVANCE = Object.freeze({
  PRIMARY: "primary",
  SECONDARY: "secondary",
  TERTIARY: "tertiary",
  CONTEXTUAL: "contextual",
  IRRELEVANT: "irrelevant",
});

export const SEMANTIC_DECISION_ROLE = Object.freeze({
  PRIMARY_GAIN: "primary_gain",
  SECONDARY_GAIN: "secondary_gain",
  TRADEOFF: "tradeoff",
  CAVEAT: "caveat",
  DIFFERENTIATOR: "differentiator",
  TIE_BREAKER: "tie_breaker",
  SUPPORTING_EVIDENCE: "supporting_evidence",
  RISK: "risk",
  UNCERTAINTY: "uncertainty",
});

export const SEMANTIC_CAVEAT_TYPE = Object.freeze({
  LIMITATION: "limitation",
  CONDITIONAL_VALUE: "conditional_value",
  LOW_CONFIDENCE: "low_confidence",
  PARTIAL_COVERAGE: "partial_coverage",
  COMPETITOR_ADVANTAGE: "competitor_advantage",
  MARGINAL_DIFFERENCE: "marginal_difference",
  PROFILE_DEPENDENT: "profile_dependent",
  COMMERCIAL_RISK: "commercial_risk",
  MISSING_EVIDENCE: "missing_evidence",
});

export const SEMANTIC_CONDITIONALITY = Object.freeze({
  UNIVERSAL: "universal",
  PRIORITY_DEPENDENT: "priority_dependent",
  USE_CASE_DEPENDENT: "use_case_dependent",
  COMPARISON_DEPENDENT: "comparison_dependent",
  CONTEXT_DEPENDENT: "context_dependent",
});

let _idCounter = 0;

export function createSemanticId(prefix = "sem") {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}

export function resetSemanticIdCounterForTests() {
  _idCounter = 0;
}

/**
 * @typedef {Object} SemanticEvidence
 * @property {string} id
 * @property {string} type
 * @property {string} source
 * @property {string} dimension
 * @property {string|null} sourceToken
 * @property {string|null} rawValue
 * @property {string|null} interpretedText
 * @property {string} confidence
 * @property {string|null} productName
 * @property {string|null} category
 * @property {string|null} producerLayer
 * @property {boolean} available
 */

/**
 * @typedef {Object} SemanticImplication
 * @property {string} id
 * @property {string[]} evidenceIds
 * @property {string} effectKey
 * @property {string} effectKind
 * @property {string} scope
 * @property {string} direction
 * @property {string} intensity
 * @property {string} confidence
 * @property {string} conditionality
 * @property {string|null} producerLayer
 * @property {string|null} interpretedSourceText
 */

/**
 * @typedef {Object} SemanticPriority
 * @property {string} targetId
 * @property {string} targetKind
 * @property {string} relevance
 * @property {string|null} reasonCode
 * @property {string|null} reasonText
 * @property {string|null} confidence
 */

/**
 * @typedef {Object} SemanticCaveat
 * @property {string} id
 * @property {string} type
 * @property {string[]} evidenceIds
 * @property {string|null} relatedImplicationId
 * @property {string} severity
 * @property {string} conditionality
 * @property {string|null} conditionCode
 * @property {string} confidence
 */

/**
 * @typedef {Object} SemanticLegacySurface
 * @property {string|null} compactedText
 * @property {boolean} isPrimaryTruth
 * @property {string} adapterVersion
 */

/**
 * @typedef {Object} SemanticDecisionUnit
 * @property {string} schemaVersion
 * @property {string} id
 * @property {SemanticEvidence} evidence
 * @property {SemanticImplication} implication
 * @property {SemanticPriority|null} priority
 * @property {SemanticCaveat|null} caveat
 * @property {string} decisionRole
 * @property {SemanticLegacySurface|null} legacy
 */

const CONFIDENCE_SET = new Set(Object.values(SEMANTIC_CONFIDENCE));
const DIRECTION_SET = new Set(Object.values(SEMANTIC_DIRECTION));
const INTENSITY_SET = new Set(Object.values(SEMANTIC_INTENSITY));
const EVIDENCE_TYPE_SET = new Set(Object.values(SEMANTIC_EVIDENCE_TYPE));
const EVIDENCE_SOURCE_SET = new Set(Object.values(SEMANTIC_EVIDENCE_SOURCE));
const PRIORITY_RELEVANCE_SET = new Set(Object.values(SEMANTIC_PRIORITY_RELEVANCE));
const DECISION_ROLE_SET = new Set(Object.values(SEMANTIC_DECISION_ROLE));
const CAVEAT_TYPE_SET = new Set(Object.values(SEMANTIC_CAVEAT_TYPE));
const CONDITIONALITY_SET = new Set(Object.values(SEMANTIC_CONDITIONALITY));

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickConfidence(value, fallback = SEMANTIC_CONFIDENCE.MEDIUM) {
  const key = cleanText(value).toLowerCase();
  return CONFIDENCE_SET.has(key) ? key : fallback;
}

export function createSemanticEvidence(input = {}) {
  const id = input.id || createSemanticId("ev");
  const type = EVIDENCE_TYPE_SET.has(input.type) ? input.type : SEMANTIC_EVIDENCE_TYPE.INTERPRETIVE;
  const source = EVIDENCE_SOURCE_SET.has(input.source)
    ? input.source
    : SEMANTIC_EVIDENCE_SOURCE.UNKNOWN;

  return {
    id,
    type,
    source,
    dimension: cleanText(input.dimension || "generic"),
    sourceToken: input.sourceToken ? cleanText(input.sourceToken) : null,
    rawValue: input.rawValue != null ? cleanText(String(input.rawValue)) : null,
    interpretedText: input.interpretedText ? cleanText(input.interpretedText) : null,
    confidence: pickConfidence(input.confidence, SEMANTIC_CONFIDENCE.MEDIUM),
    productName: input.productName ? cleanText(input.productName) : null,
    category: input.category ? cleanText(input.category) : null,
    producerLayer: input.producerLayer ? cleanText(input.producerLayer) : null,
    available: input.available !== false,
  };
}

export function createSemanticImplication(input = {}) {
  const id = input.id || createSemanticId("imp");
  const evidenceIds = Array.isArray(input.evidenceIds)
    ? input.evidenceIds.filter(Boolean)
    : input.evidenceId
      ? [input.evidenceId]
      : [];

  return {
    id,
    evidenceIds,
    effectKey: cleanText(input.effectKey || "unspecified_effect"),
    effectKind: cleanText(input.effectKind || "general"),
    scope: cleanText(input.scope || "general_use"),
    direction: DIRECTION_SET.has(input.direction) ? input.direction : SEMANTIC_DIRECTION.UNKNOWN,
    intensity: INTENSITY_SET.has(input.intensity) ? input.intensity : SEMANTIC_INTENSITY.MODERATE,
    confidence: pickConfidence(input.confidence, SEMANTIC_CONFIDENCE.MEDIUM),
    conditionality: CONDITIONALITY_SET.has(input.conditionality)
      ? input.conditionality
      : SEMANTIC_CONDITIONALITY.UNIVERSAL,
    producerLayer: input.producerLayer ? cleanText(input.producerLayer) : null,
    interpretedSourceText: input.interpretedSourceText
      ? cleanText(input.interpretedSourceText)
      : null,
  };
}

export function createSemanticPriority(input = {}) {
  if (!input.targetId) return null;

  return {
    targetId: cleanText(input.targetId),
    targetKind: cleanText(input.targetKind || "implication"),
    relevance: PRIORITY_RELEVANCE_SET.has(input.relevance)
      ? input.relevance
      : SEMANTIC_PRIORITY_RELEVANCE.SECONDARY,
    reasonCode: input.reasonCode ? cleanText(input.reasonCode) : null,
    reasonText: input.reasonText ? cleanText(input.reasonText) : null,
    confidence: pickConfidence(input.confidence, SEMANTIC_CONFIDENCE.MEDIUM),
  };
}

export function createSemanticCaveat(input = {}) {
  const id = input.id || createSemanticId("cav");
  const evidenceIds = Array.isArray(input.evidenceIds) ? input.evidenceIds.filter(Boolean) : [];

  return {
    id,
    type: CAVEAT_TYPE_SET.has(input.type) ? input.type : SEMANTIC_CAVEAT_TYPE.LIMITATION,
    evidenceIds,
    relatedImplicationId: input.relatedImplicationId
      ? cleanText(input.relatedImplicationId)
      : null,
    severity: INTENSITY_SET.has(input.severity) ? input.severity : SEMANTIC_INTENSITY.MODERATE,
    conditionality: CONDITIONALITY_SET.has(input.conditionality)
      ? input.conditionality
      : SEMANTIC_CONDITIONALITY.CONTEXT_DEPENDENT,
    conditionCode: input.conditionCode ? cleanText(input.conditionCode) : null,
    confidence: pickConfidence(input.confidence, SEMANTIC_CONFIDENCE.MEDIUM),
  };
}

export function createSemanticLegacySurface(input = {}) {
  return {
    compactedText: input.compactedText ? cleanText(input.compactedText) : null,
    isPrimaryTruth: false,
    adapterVersion: "4A.1.0-legacy",
  };
}

export function createSemanticDecisionUnit(input = {}) {
  if (!input.evidence || !input.implication) {
    throw new Error("SemanticDecisionUnit requires evidence and implication");
  }

  const evidence =
    input.evidence.id && input.evidence.dimension
      ? input.evidence
      : createSemanticEvidence(input.evidence);
  const implication =
    input.implication.id && input.implication.effectKey
      ? input.implication
      : createSemanticImplication({
          ...input.implication,
          evidenceIds: input.implication.evidenceIds || [evidence.id],
        });

  if (!implication.evidenceIds.includes(evidence.id)) {
    implication.evidenceIds = [...implication.evidenceIds, evidence.id];
  }

  const unit = {
    schemaVersion: SEMANTIC_DECISION_CONTRACT_VERSION,
    id: input.id || createSemanticId("sdu"),
    evidence,
    implication,
    priority: input.priority ? createSemanticPriority(input.priority) : null,
    caveat: input.caveat ? createSemanticCaveat(input.caveat) : null,
    decisionRole: DECISION_ROLE_SET.has(input.decisionRole)
      ? input.decisionRole
      : SEMANTIC_DECISION_ROLE.SECONDARY_GAIN,
    legacy: input.legacy ? createSemanticLegacySurface(input.legacy) : null,
  };

  return unit;
}

export function validateSemanticEvidence(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== "object") {
    return { valid: false, errors: ["evidence_missing"] };
  }
  if (!evidence.id) errors.push("evidence_id_missing");
  if (!EVIDENCE_TYPE_SET.has(evidence.type)) errors.push("evidence_type_invalid");
  if (!EVIDENCE_SOURCE_SET.has(evidence.source)) errors.push("evidence_source_invalid");
  if (!cleanText(evidence.dimension)) errors.push("evidence_dimension_missing");
  if (!CONFIDENCE_SET.has(evidence.confidence)) errors.push("evidence_confidence_invalid");
  return { valid: errors.length === 0, errors };
}

export function validateSemanticImplication(implication) {
  const errors = [];
  if (!implication || typeof implication !== "object") {
    return { valid: false, errors: ["implication_missing"] };
  }
  if (!implication.id) errors.push("implication_id_missing");
  if (!Array.isArray(implication.evidenceIds) || implication.evidenceIds.length === 0) {
    errors.push("implication_without_evidence");
  }
  if (!cleanText(implication.effectKey)) errors.push("implication_effect_key_missing");
  if (!DIRECTION_SET.has(implication.direction)) errors.push("implication_direction_invalid");
  if (!CONFIDENCE_SET.has(implication.confidence)) errors.push("implication_confidence_invalid");
  return { valid: errors.length === 0, errors };
}

export function validateSemanticPriority(priority) {
  if (!priority) return { valid: true, errors: [] };
  const errors = [];
  if (!priority.targetId) errors.push("priority_target_missing");
  if (!PRIORITY_RELEVANCE_SET.has(priority.relevance)) errors.push("priority_relevance_invalid");
  if (!CONFIDENCE_SET.has(priority.confidence)) errors.push("priority_confidence_invalid");
  return { valid: errors.length === 0, errors };
}

export function validateSemanticCaveat(caveat) {
  if (!caveat) return { valid: true, errors: [] };
  const errors = [];
  if (!caveat.id) errors.push("caveat_id_missing");
  if (!CAVEAT_TYPE_SET.has(caveat.type)) errors.push("caveat_type_invalid");
  if (!CONFIDENCE_SET.has(caveat.confidence)) errors.push("caveat_confidence_invalid");
  return { valid: errors.length === 0, errors };
}

export function validateSemanticDecisionUnit(unit) {
  const errors = [];
  if (!unit || typeof unit !== "object") {
    return { valid: false, errors: ["unit_missing"] };
  }
  if (unit.schemaVersion !== SEMANTIC_DECISION_CONTRACT_VERSION) {
    errors.push("schema_version_mismatch");
  }
  if (unit.legacy?.isPrimaryTruth === true) {
    errors.push("legacy_marked_as_primary_truth");
  }

  const ev = validateSemanticEvidence(unit.evidence);
  const im = validateSemanticImplication(unit.implication);
  const pr = validateSemanticPriority(unit.priority);
  const ca = validateSemanticCaveat(unit.caveat);

  errors.push(...ev.errors, ...im.errors, ...pr.errors, ...ca.errors);

  if (unit.priority && unit.priority.targetId !== unit.implication.id) {
    errors.push("priority_target_must_reference_implication");
  }

  return { valid: errors.length === 0, errors };
}

export function serializeSemanticDecisionUnit(unit) {
  return JSON.parse(JSON.stringify(unit));
}

export function deserializeSemanticDecisionUnit(raw) {
  if (!raw || typeof raw !== "object") return null;
  return createSemanticDecisionUnit(raw);
}

export function buildSemanticDecisionTrace(units = []) {
  return {
    schemaVersion: SEMANTIC_DECISION_CONTRACT_VERSION,
    unitCount: units.length,
    units: units.map((unit) => ({
      id: unit.id,
      role: unit.decisionRole,
      evidence: {
        id: unit.evidence.id,
        dimension: unit.evidence.dimension,
        source: unit.evidence.source,
        token: unit.evidence.sourceToken,
        confidence: unit.evidence.confidence,
      },
      implication: {
        id: unit.implication.id,
        effectKey: unit.implication.effectKey,
        direction: unit.implication.direction,
        scope: unit.implication.scope,
        confidence: unit.implication.confidence,
      },
      priority: unit.priority
        ? { relevance: unit.priority.relevance, reasonCode: unit.priority.reasonCode }
        : null,
      caveat: unit.caveat ? { type: unit.caveat.type, severity: unit.caveat.severity } : null,
      legacyAdapterUsed: !!unit.legacy?.compactedText,
    })),
  };
}
