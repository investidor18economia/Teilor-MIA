/**
 * PATCH C.8 — Executive Narrative Catalog (C.8.0).
 * Section structure, highlights, reading time, required keys.
 * No runtime behavior · no LLM · no fetch.
 */

export const MIA_EXECUTIVE_NARRATIVE_CATALOG_VERSION = "C.8.0";

export const EXECUTIVE_NARRATIVE_REQUIRED_KEYS = Object.freeze([
  "id",
  "summary",
  "executive_message",
  "sections",
  "highlights",
  "priorities",
  "confidence_summary",
  "limitation_summary",
  "evidence_summary",
  "tone_profile",
  "reading_time",
  "deterministic",
  "meta",
]);

export const EXECUTIVE_NARRATIVE_SECTION_IDS = Object.freeze([
  "executive_summary",
  "attention_first",
  "positive_points",
  "attention_points",
  "recommendations",
  "confidence",
  "limitations",
]);

export const EXECUTIVE_NARRATIVE_SECTION_TITLES = Object.freeze({
  executive_summary: "Resumo Executivo",
  attention_first: "O que merece atenção primeiro",
  positive_points: "Pontos positivos",
  attention_points: "Pontos de atenção",
  recommendations: "Recomendações",
  confidence: "Confiança da análise",
  limitations: "Limitações",
});

export const EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES = Object.freeze({
  PRIMARY_RISK: "primary_risk",
  PRIMARY_OPPORTUNITY: "primary_opportunity",
  PRIMARY_CHANGE: "primary_change",
  PRIMARY_RECOMMENDATION: "primary_recommendation",
});

export const EXECUTIVE_NARRATIVE_READING_TIME = Object.freeze({
  words_per_minute: 200,
  min_minutes: 1,
  section_complexity_factor: 0.25,
});

export const EXECUTIVE_NARRATIVE_MESSAGE_TEMPLATES = Object.freeze({
  executive: "{opener} ({period_label}): {headline}",
  consultative: "{opener} ({period_label}). {headline}",
  informative: "{opener} — {period_label}. {headline}",
  warning: "{opener} ({period_label}): {headline}",
  positive: "{opener} ({period_label}): {headline}",
  neutral: "{opener} ({period_label}). {headline}",
});

export const EXECUTIVE_NARRATIVE_CONFIDENCE_TEMPLATES = Object.freeze({
  high: "Confiança alta ({level}). {modules} módulo(s) disponível(is). {factor_count} fator(es) de confiança registrado(s).",
  moderate: "Confiança moderada ({level}). {modules} módulo(s) disponível(is). {factor_count} fator(es) considerado(s).",
  low: "Confiança baixa ({level}). {modules} módulo(s) disponível(is). Interpretação com cautela recomendada.",
  insufficient_data: "Confiança insuficiente ({level}). Dados limitados para conclusões robustas.",
});

export const EXECUTIVE_NARRATIVE_EVIDENCE_TEMPLATE =
  "{count} evidência(s) rastreável(is) em {module_count} módulo(s). {metric_count} métrica(s) referenciada(s).";

export const EXECUTIVE_NARRATIVE_LIMITATION_TEMPLATE =
  "{count} limitação(ões) registrada(s): {preview}";

export const EXECUTIVE_NARRATIVE_EMPTY_MESSAGES = Object.freeze({
  no_analysis: "Nenhum elemento de análise disponível para humanização.",
  no_highlights: "Nenhum destaque elegível com suporte suficiente.",
  no_limitations: "Nenhuma limitação adicional registrada.",
});

export const EXECUTIVE_NARRATIVE_ANTI_PATTERNS = Object.freeze([
  "storytelling",
  "opinion",
  "invented_phrase",
  "priority_change",
  "metric_change",
  "confidence_change",
]);
