/**
 * PATCH C.7 — Executive Confidence Builder (C.7.0).
 * Consolidates confidence from evidence quality, module convergence, inherited confidence.
 * No SQL · no Supabase · no fetch · no LLM.
 */

import {
  EXECUTIVE_CONFIDENCE_LEVELS,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_CONFIDENCE_BUILDER_VERSION,
} from "./miaExecutiveExplainabilityCatalog.js";

export { MIA_EXECUTIVE_CONFIDENCE_BUILDER_VERSION };

const CONFIDENCE_RANK = Object.freeze({
  high: 3,
  moderate: 2,
  low: 1,
  insufficient_data: 0,
});

/**
 * @param {string} level
 */
export function rankExecutiveConfidenceLevel(level) {
  return CONFIDENCE_RANK[level] ?? 0;
}

/**
 * @param {string[]} levels
 */
export function minExecutiveConfidenceLevel(levels) {
  if (!levels.length) return "insufficient_data";
  const minRank = Math.min(...levels.map((l) => rankExecutiveConfidenceLevel(l)));
  if (minRank >= 3) return "high";
  if (minRank >= 2) return "moderate";
  if (minRank >= 1) return "low";
  return "insufficient_data";
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 */
export function assessEvidenceQuality(evidence = []) {
  if (!evidence.length) {
    return { score: 0, factors: ["Nenhuma evidência rastreável disponível."] };
  }

  const modules = new Set(evidence.map((e) => e.module_id).filter(Boolean));
  const ruleRefs = new Set(evidence.map((e) => e.rule_ref).filter(Boolean));
  const withSnapshot = evidence.filter((e) => e.value_snapshot != null).length;

  const factors = [];
  if (evidence.length >= 3) factors.push(`${evidence.length} evidências rastreáveis.`);
  else factors.push(`${evidence.length} evidência(s) rastreável(is).`);

  if (modules.size >= 2) factors.push(`Convergência entre ${modules.size} módulos.`);
  if (ruleRefs.size >= 1) factors.push(`${ruleRefs.size} regra(s) aplicada(s).`);
  if (withSnapshot > 0) factors.push(`${withSnapshot} snapshot(s) de valor disponível(is).`);

  let score = Math.min(1, evidence.length / 5);
  if (modules.size >= 2) score += 0.15;
  if (withSnapshot >= evidence.length * 0.5) score += 0.1;

  return { score: Math.min(1, score), factors };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} inherited
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @param {string[]} extraFactors
 */
export function deriveExplainabilityConfidence(inherited, evidence = [], extraFactors = []) {
  const quality = assessEvidenceQuality(evidence);
  const inheritedLevel = inherited?.level ?? "insufficient_data";
  const inheritedRank = rankExecutiveConfidenceLevel(inheritedLevel);

  let derivedLevel = inheritedLevel;
  if (quality.score < 0.2 && inheritedRank > 0) {
    derivedLevel = "low";
  } else if (quality.score < 0.4 && inheritedRank >= 2) {
    derivedLevel = minExecutiveConfidenceLevel([inheritedLevel, "moderate"]);
  }

  const factors = [
    ...(inherited?.factors ?? []),
    ...quality.factors,
    ...extraFactors,
  ].filter(Boolean);

  const limitations = [...new Set([...(inherited?.limitations ?? []), ...(quality.score < 0.3 ? ["Evidência limitada para explicação completa."] : [])])];

  return {
    level: derivedLevel,
    factors: [...new Set(factors)],
    limitations,
    modules_available: inherited?.modules_available ?? null,
    modules_total: inherited?.modules_total ?? null,
  };
}

/**
 * @param {Array<{ confidence: import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence, limitations?: string[] }>} records
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} envelope
 */
export function consolidateExplainabilityConfidence(records = [], envelope = {}) {
  const levels = records.map((r) => r.confidence?.level).filter(Boolean);
  if (envelope?.level) levels.push(envelope.level);

  const combinedLevel = minExecutiveConfidenceLevel(levels.length ? levels : ["insufficient_data"]);

  const allFactors = [
    ...(envelope?.factors ?? []),
    ...records.flatMap((r) => r.confidence?.factors ?? []),
  ];

  const allLimitations = [
    ...(envelope?.limitations ?? []),
    ...records.flatMap((r) => r.limitations ?? []),
    ...records.flatMap((r) => r.confidence?.limitations ?? []),
  ];

  return {
    level: combinedLevel,
    factors: [...new Set(allFactors)].slice(0, 20),
    limitations: [...new Set(allLimitations)],
    modules_available: envelope?.modules_available ?? null,
    modules_total: envelope?.modules_total ?? null,
  };
}

/**
 * @param {string} level
 */
export function isValidExecutiveConfidenceLevel(level) {
  return EXECUTIVE_CONFIDENCE_LEVELS.includes(level);
}
