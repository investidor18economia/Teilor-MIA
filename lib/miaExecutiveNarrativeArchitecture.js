/**
 * PATCH C.1 — Executive Narrative architecture (C.1.0).
 * Separates Facts → Interpretation → Summary → Natural Language.
 * No narrative generation behavior in C.1.
 */

import { EXECUTIVE_NARRATIVE_STAGES } from "./miaExecutiveAnalysisContracts.js";

export const MIA_EXECUTIVE_NARRATIVE_ARCHITECTURE_VERSION = "C.1.0";

export const EXECUTIVE_NARRATIVE_PIPELINE = Object.freeze([
  {
    stage: "fact",
    label: "Fatos",
    responsibility: "Immutable values traced to official metrics/views",
    inputs: ["executive_metrics", "executive_views"],
    outputs: ["ExecutiveEvidence[]"],
    forbidden: ["interpretation", "summary_language", "LLM"],
  },
  {
    stage: "interpretation",
    label: "Interpretação",
    responsibility: "Deterministic rules applied to facts (thresholds, comparisons)",
    inputs: ["ExecutiveEvidence[]", "catalog thresholds"],
    outputs: ["ExecutiveInsight[]", "ExecutiveTrend[]", "ExecutiveAlert[]"],
    forbidden: ["new_facts", "LLM", "causal_claims_without_evidence"],
  },
  {
    stage: "summary",
    label: "Resumo",
    responsibility: "Structured synthesis of interpretations (headline, priorities, risks)",
    inputs: ["ExecutiveInsight[]", "ExecutiveTrend[]", "ExecutiveAlert[]"],
    outputs: ["ExecutiveSummary"],
    forbidden: ["LLM", "invented_metrics", "merging_with_verbalization"],
  },
  {
    stage: "verbalization",
    label: "Linguagem Natural",
    responsibility: "LLM phrasing of summary + slots — never creates conclusions",
    inputs: ["ExecutiveSummary", "ExecutiveAnalysisOutput"],
    outputs: ["natural_language_text"],
    forbidden: ["source_of_truth", "metric_changes", "hidden_limitations"],
  },
]);

export const EXECUTIVE_NARRATIVE_STAGE_ORDER = Object.freeze([...EXECUTIVE_NARRATIVE_STAGES]);

export const EXECUTIVE_NARRATIVE_EXPLAINABILITY_CHECKLIST = Object.freeze([
  "quais_dados_originaram_esta_conclusao",
  "quais_modulos_participaram",
  "quais_regras_foram_utilizadas",
  "qual_periodo_foi_analisado",
  "quais_limitacoes_existem",
]);

export const EXECUTIVE_NARRATIVE_ANTI_PATTERNS = Object.freeze([
  "mixing_fact_and_interpretation_in_same_field",
  "llm_generating_numbers",
  "summary_without_evidence",
  "verbalization_before_summary",
  "hiding_insufficient_data",
]);
