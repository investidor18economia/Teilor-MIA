/**
 * PATCH C.7 — Executive Explainability Catalog (C.7.0).
 * Analysis types, rule references, narrative stages, required keys.
 * No runtime behavior · no fetch · no LLM · no SQL · no Supabase.
 */

export const MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION = "C.7.0";

export const MIA_EXECUTIVE_CONFIDENCE_BUILDER_VERSION = "C.7.0";

export const EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES = Object.freeze({
  SUMMARY: "summary",
  INSIGHT: "insight",
  TREND: "trend",
  ALERT: "alert",
  RECOMMENDATION: "recommendation",
});

export const EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPE_LIST = Object.freeze([
  EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.SUMMARY,
  EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.INSIGHT,
  EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.TREND,
  EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.ALERT,
  EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.RECOMMENDATION,
]);

export const EXECUTIVE_EXPLAINABILITY_REQUIRED_KEYS = Object.freeze([
  "id",
  "analysis_type",
  "analysis_reference",
  "rule_reference",
  "evidence",
  "confidence",
  "limitations",
  "supporting_modules",
  "supporting_metrics",
  "supporting_alerts",
  "supporting_trends",
  "supporting_insights",
  "supporting_recommendations",
  "deterministic",
  "generated_at",
  "meta",
]);

export const EXECUTIVE_EXPLAINABILITY_RULE_PREFIXES = Object.freeze({
  summary: "summary.",
  insight: "insight.",
  trend: "trend.",
  alert: "alert.",
  recommendation: "recommendation.",
});

export const EXECUTIVE_EXPLAINABILITY_NARRATIVE_PIPELINE = Object.freeze([
  {
    stage: "facts",
    label: "Explainability Facts",
    responsibility: "Immutable evidence and rule references from C.2–C.6 outputs",
    forbidden: ["llm", "invented_justification", "causal_claims_without_evidence"],
  },
  {
    stage: "record",
    label: "Explainability Record",
    responsibility: "Structured ExecutiveExplainability per analysis element",
    forbidden: ["llm", "confidence_override", "evidence_modification"],
  },
  {
    stage: "narrative_structure",
    label: "Narrative Structure",
    responsibility: "Deterministic fact ordering for future verbalizer",
    forbidden: ["llm", "confidence_override", "limitations_override", "rule_override"],
  },
  {
    stage: "llm_verbalizer",
    label: "LLM Verbalizer (future)",
    responsibility: "Natural language phrasing of explainability facts only",
    forbidden: ["source_of_truth", "evidence_changes", "confidence_changes", "rule_changes"],
  },
]);

export const EXECUTIVE_EXPLAINABILITY_LIMITATION_CATALOG = Object.freeze([
  "poucos_dados",
  "modulo_ausente",
  "baixa_cobertura",
  "tendencia_preliminar",
  "confianca_reduzida",
  "snapshot_unico",
  "ausencia_de_historico",
  "sem_comparativo_periodo",
  "evidencia_insuficiente",
]);

export const EXECUTIVE_EXPLAINABILITY_EMPTY_MESSAGES = Object.freeze({
  no_elements: "Nenhum elemento de análise disponível para explicabilidade.",
  no_evidence: "Elemento sem evidências rastreáveis — explicação omitida.",
});

export const EXECUTIVE_EXPLAINABILITY_ANTI_PATTERNS = Object.freeze([
  "porque_a_ia_concluiu",
  "justificativa_generica",
  "causalidade_inexistente",
  "confianca_inventada",
  "regra_inventada",
  "evidencia_inventada",
]);

export const EXECUTIVE_EXPLAINABILITY_BLOCKLIST_PHRASES = Object.freeze([
  "porque a ia concluiu",
  "a ia determinou",
  "inteligência artificial concluiu",
  "modelo concluiu",
]);
