/**
 * PATCH C.8 — Executive Narrative Builder (C.8.0).
 * Humanization layer: reorganizes C.2–C.7 output for readable communication.
 * Never alters facts, metrics, priorities, confidence, evidence or limitations.
 * No SQL · no Supabase · no fetch · no LLM.
 */

import {
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_NARRATIVE_CATALOG_VERSION,
  EXECUTIVE_NARRATIVE_SECTION_IDS,
  EXECUTIVE_NARRATIVE_SECTION_TITLES,
  EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES,
  EXECUTIVE_NARRATIVE_READING_TIME,
  EXECUTIVE_NARRATIVE_MESSAGE_TEMPLATES,
  EXECUTIVE_NARRATIVE_CONFIDENCE_TEMPLATES,
  EXECUTIVE_NARRATIVE_EVIDENCE_TEMPLATE,
  EXECUTIVE_NARRATIVE_LIMITATION_TEMPLATE,
  EXECUTIVE_NARRATIVE_EMPTY_MESSAGES,
} from "./miaExecutiveNarrativeCatalog.js";
import {
  EXECUTIVE_TONE_PROFILES,
  EXECUTIVE_TONE_PROFILE_DEFINITIONS,
  EXECUTIVE_TONE_SEVERITY_TRIGGERS,
  EXECUTIVE_TONE_POSITIVE_KEYWORDS,
  EXECUTIVE_TONE_PRIORITY_RANK,
} from "./miaExecutiveToneCatalog.js";
import {
  generateExecutiveAnalysisWithExplainability,
} from "./miaExecutiveExplainabilityBuilder.js";

export const MIA_EXECUTIVE_NARRATIVE_BUILDER_VERSION = "C.8.0";

/**
 * @typedef {Object} ExecutiveNarrativeSection
 * @property {string} section_id
 * @property {string} title
 * @property {string} content
 * @property {number} priority_order
 * @property {string[]} source_refs
 */

/**
 * @typedef {Object} ExecutiveNarrativeHighlight
 * @property {string} type
 * @property {string} title
 * @property {string} body
 * @property {string} source_reference
 * @property {string|null} priority
 */

/**
 * @typedef {Object} ExecutiveNarrative
 * @property {string} id
 * @property {string} summary
 * @property {string} executive_message
 * @property {ExecutiveNarrativeSection[]} sections
 * @property {ExecutiveNarrativeHighlight[]} highlights
 * @property {string[]} priorities
 * @property {string} confidence_summary
 * @property {string} limitation_summary
 * @property {string} evidence_summary
 * @property {string} tone_profile
 * @property {number} reading_time
 * @property {true} deterministic
 * @property {{ builder_version: string, catalog_version: string, tone_version: string, source_analysis_status: string }} meta
 */

/**
 * @param {string} template
 * @param {Record<string, string|number>} vars
 */
function applyTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (text, [key, val]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), String(val)),
    template
  );
}

/**
 * @param {string} text
 */
function countWords(text) {
  return (text ?? "").split(/\s+/).filter(Boolean).length;
}

/**
 * Deterministic tone from analysis signals — never LLM.
 * @param {ReturnType<typeof generateExecutiveAnalysisWithExplainability>} analysis
 */
export function selectExecutiveToneProfile(analysis) {
  const alerts = analysis.alerts ?? [];
  const recommendations = analysis.recommendations ?? [];
  const insights = analysis.insights ?? [];
  const recRecords = analysis.meta?.recommendation_records ?? [];

  const hasP0 = recommendations.some((r) => r.priority === "P0") ||
    recRecords.some((r) => r.priority === "P0");
  const hasCriticalAlert = alerts.some((a) =>
    EXECUTIVE_TONE_SEVERITY_TRIGGERS.includes(String(a.severity).toLowerCase())
  );

  if (hasP0 || hasCriticalAlert) {
    return EXECUTIVE_TONE_PROFILES.WARNING;
  }

  const insightText = insights.map((i) => `${i.title} ${i.body}`.toLowerCase()).join(" ");
  const hasPositive = EXECUTIVE_TONE_POSITIVE_KEYWORDS.some((kw) => insightText.includes(kw)) ||
    recommendations.some((r) => String(r.headline).toLowerCase().includes("expand"));

  if (hasPositive && alerts.length === 0) {
    return EXECUTIVE_TONE_PROFILES.POSITIVE;
  }

  if (alerts.length === 0 && recommendations.length === 0) {
    return EXECUTIVE_TONE_PROFILES.NEUTRAL;
  }

  if (recommendations.length > 0 && !hasCriticalAlert) {
    return EXECUTIVE_TONE_PROFILES.CONSULTATIVE;
  }

  if (insights.length >= 3) {
    return EXECUTIVE_TONE_PROFILES.INFORMATIVE;
  }

  return EXECUTIVE_TONE_PROFILES.EXECUTIVE;
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 */
export function buildConfidenceSummary(confidence) {
  const level = confidence?.level ?? "insufficient_data";
  const template =
    EXECUTIVE_NARRATIVE_CONFIDENCE_TEMPLATES[level] ??
    EXECUTIVE_NARRATIVE_CONFIDENCE_TEMPLATES.insufficient_data;

  return applyTemplate(template, {
    level,
    modules: confidence?.modules_available ?? 0,
    factor_count: (confidence?.factors ?? []).length,
  });
}

/**
 * @param {string[]} limitations
 */
export function buildLimitationSummary(limitations = []) {
  if (!limitations.length) return EXECUTIVE_NARRATIVE_EMPTY_MESSAGES.no_limitations;
  const preview = limitations.slice(0, 3).join("; ");
  return applyTemplate(EXECUTIVE_NARRATIVE_LIMITATION_TEMPLATE, {
    count: limitations.length,
    preview,
  });
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @param {import("./miaExecutiveExplainabilityBuilder.js").ExecutiveExplainability[]} explainability
 */
export function buildEvidenceSummary(evidence = [], explainability = []) {
  const modules = new Set([
    ...evidence.map((e) => e.module_id),
    ...explainability.flatMap((x) => x.supporting_modules ?? []),
  ].filter(Boolean));

  const metrics = new Set([
    ...evidence.map((e) => e.field_path),
    ...explainability.flatMap((x) => x.supporting_metrics ?? []),
  ].filter(Boolean));

  return applyTemplate(EXECUTIVE_NARRATIVE_EVIDENCE_TEMPLATE, {
    count: evidence.length,
    module_count: modules.size,
    metric_count: metrics.size,
  });
}

/**
 * @param {ReturnType<typeof generateExecutiveAnalysisWithExplainability>} analysis
 */
function buildPrioritiesList(analysis) {
  const items = [];

  for (const rec of analysis.recommendations ?? []) {
    if (rec.priority) {
      items.push({ priority: rec.priority, label: rec.headline, ref: rec.recommendation_id });
    }
  }

  for (const alert of analysis.alerts ?? []) {
    items.push({
      priority: alert.severity === "critical" ? "P0" : alert.severity === "high" ? "P1" : "P2",
      label: alert.message,
      ref: alert.alert_id,
    });
  }

  return items
    .sort((a, b) => (EXECUTIVE_TONE_PRIORITY_RANK[a.priority] ?? 99) - (EXECUTIVE_TONE_PRIORITY_RANK[b.priority] ?? 99))
    .map((item) => `${item.priority}: ${item.label}`);
}

/**
 * @param {ReturnType<typeof generateExecutiveAnalysisWithExplainability>} analysis
 */
function buildHighlights(analysis) {
  /** @type {ExecutiveNarrativeHighlight[]} */
  const highlights = [];

  const alerts = analysis.alerts ?? [];
  const recommendations = analysis.recommendations ?? [];
  const trends = analysis.trends ?? [];
  const insights = analysis.insights ?? [];

  const topAlert = [...alerts].sort((a, b) => {
    const rank = { critical: 0, high: 1, moderate: 2, informational: 3 };
    return (rank[a.severity] ?? 99) - (rank[b.severity] ?? 99);
  })[0];

  if (topAlert) {
    highlights.push({
      type: EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES.PRIMARY_RISK,
      title: "Principal risco",
      body: topAlert.message,
      source_reference: topAlert.alert_id,
      priority: topAlert.severity === "critical" ? "P0" : topAlert.severity === "high" ? "P1" : "P2",
    });
  }

  const expandRec = recommendations.find((r) =>
    String(r.headline).toLowerCase().includes("expand") ||
    String(r.rationale).toLowerCase().includes("expand")
  );
  const positiveInsight = insights.find((i) =>
    EXECUTIVE_TONE_POSITIVE_KEYWORDS.some((kw) => `${i.title} ${i.body}`.toLowerCase().includes(kw))
  );

  if (expandRec) {
    highlights.push({
      type: EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES.PRIMARY_OPPORTUNITY,
      title: "Principal oportunidade",
      body: expandRec.rationale || expandRec.headline,
      source_reference: expandRec.recommendation_id,
      priority: expandRec.priority,
    });
  } else if (positiveInsight) {
    highlights.push({
      type: EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES.PRIMARY_OPPORTUNITY,
      title: "Principal oportunidade",
      body: positiveInsight.body || positiveInsight.title,
      source_reference: positiveInsight.insight_id,
      priority: null,
    });
  }

  const topTrend = trends.find((t) => t.direction === "up" || t.direction === "down") ?? trends[0];
  if (topTrend) {
    highlights.push({
      type: EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES.PRIMARY_CHANGE,
      title: "Principal mudança",
      body: `${topTrend.metric_label}: direção ${topTrend.direction}${topTrend.change_pct != null ? ` (${topTrend.change_pct}%)` : ""}`,
      source_reference: topTrend.trend_id,
      priority: null,
    });
  }

  const topRec = [...recommendations].sort((a, b) => {
    const ra = EXECUTIVE_TONE_PRIORITY_RANK[a.priority] ?? 99;
    const rb = EXECUTIVE_TONE_PRIORITY_RANK[b.priority] ?? 99;
    return ra - rb;
  })[0];

  if (topRec) {
    highlights.push({
      type: EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES.PRIMARY_RECOMMENDATION,
      title: "Principal recomendação",
      body: topRec.rationale || topRec.headline,
      source_reference: topRec.recommendation_id,
      priority: topRec.priority,
    });
  }

  return highlights;
}

/**
 * @param {ReturnType<typeof generateExecutiveAnalysisWithExplainability>} analysis
 * @param {string} toneProfile
 * @param {string|null} periodLabel
 */
function buildNarrativeSections(analysis, toneProfile, periodLabel) {
  /** @type {ExecutiveNarrativeSection[]} */
  const sections = [];

  const summary = analysis.summary;
  if (summary) {
    sections.push({
      section_id: "executive_summary",
      title: EXECUTIVE_NARRATIVE_SECTION_TITLES.executive_summary,
      content: `${summary.headline}\n\n${summary.body}`.trim(),
      priority_order: 1,
      source_refs: [summary.summary_id],
    });
  }

  const attentionItems = [];
  for (const rec of analysis.recommendations ?? []) {
    if (["P0", "P1"].includes(rec.priority ?? "")) {
      attentionItems.push(`[${rec.priority}] ${rec.headline}: ${rec.rationale}`);
    }
  }
  for (const alert of analysis.alerts ?? []) {
    if (EXECUTIVE_TONE_SEVERITY_TRIGGERS.includes(String(alert.severity).toLowerCase())) {
      attentionItems.push(`[${alert.severity}] ${alert.message}`);
    }
  }

  sections.push({
    section_id: "attention_first",
    title: EXECUTIVE_NARRATIVE_SECTION_TITLES.attention_first,
    content: attentionItems.length ? attentionItems.join("\n") : "Nenhum item crítico identificado neste período.",
    priority_order: 2,
    source_refs: [
      ...(analysis.recommendations ?? []).filter((r) => ["P0", "P1"].includes(r.priority ?? "")).map((r) => r.recommendation_id),
      ...(analysis.alerts ?? []).map((a) => a.alert_id),
    ],
  });

  const positiveLines = [
    ...(summary?.opportunities ?? []),
    ...(analysis.insights ?? [])
      .filter((i) => EXECUTIVE_TONE_POSITIVE_KEYWORDS.some((kw) => `${i.title} ${i.body}`.toLowerCase().includes(kw)))
      .map((i) => i.title),
  ];

  sections.push({
    section_id: "positive_points",
    title: EXECUTIVE_NARRATIVE_SECTION_TITLES.positive_points,
    content: positiveLines.length ? positiveLines.join("\n") : "Nenhum ponto positivo destacado com evidência suficiente.",
    priority_order: 3,
    source_refs: (analysis.insights ?? []).map((i) => i.insight_id),
  });

  const attentionLines = [
    ...(summary?.risks ?? []),
    ...(analysis.alerts ?? []).map((a) => a.message),
    ...(analysis.trends ?? []).filter((t) => t.direction === "down").map((t) => `${t.metric_label}: ${t.direction}`),
  ];

  sections.push({
    section_id: "attention_points",
    title: EXECUTIVE_NARRATIVE_SECTION_TITLES.attention_points,
    content: attentionLines.length ? attentionLines.join("\n") : "Nenhum ponto de atenção adicional registrado.",
    priority_order: 4,
    source_refs: [
      ...(analysis.alerts ?? []).map((a) => a.alert_id),
      ...(analysis.trends ?? []).map((t) => t.trend_id),
    ],
  });

  const recLines = (analysis.recommendations ?? []).map(
    (r) => `[${r.priority ?? "—"}] ${r.headline}\n${r.rationale}`
  );

  sections.push({
    section_id: "recommendations",
    title: EXECUTIVE_NARRATIVE_SECTION_TITLES.recommendations,
    content: recLines.length ? recLines.join("\n\n") : "Nenhuma recomendação registrada para este período.",
    priority_order: 5,
    source_refs: (analysis.recommendations ?? []).map((r) => r.recommendation_id),
  });

  const confidenceSummary = buildConfidenceSummary(analysis.confidence);
  sections.push({
    section_id: "confidence",
    title: EXECUTIVE_NARRATIVE_SECTION_TITLES.confidence,
    content: confidenceSummary,
    priority_order: 6,
    source_refs: [],
  });

  const limitationSummary = buildLimitationSummary(analysis.confidence?.limitations ?? []);
  sections.push({
    section_id: "limitations",
    title: EXECUTIVE_NARRATIVE_SECTION_TITLES.limitations,
    content: limitationSummary,
    priority_order: 7,
    source_refs: [],
  });

  return sections.filter((s) => EXECUTIVE_NARRATIVE_SECTION_IDS.includes(s.section_id));
}

/**
 * @param {ExecutiveNarrativeSection[]} sections
 * @param {string} executiveMessage
 */
export function calculateReadingTime(sections, executiveMessage = "") {
  const allText = [executiveMessage, ...sections.map((s) => s.content)].join(" ");
  const words = countWords(allText);
  const baseMinutes = Math.ceil(words / EXECUTIVE_NARRATIVE_READING_TIME.words_per_minute);
  const complexityBonus = Math.ceil(sections.length * EXECUTIVE_NARRATIVE_READING_TIME.section_complexity_factor);
  return Math.max(
    EXECUTIVE_NARRATIVE_READING_TIME.min_minutes,
    baseMinutes + complexityBonus
  );
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function buildExecutiveStructuredNarrative(input = {}) {
  const analysis = generateExecutiveAnalysisWithExplainability(input);
  const periodLabel = input.period_label ?? input.period?.range ?? "período";
  const toneProfile = selectExecutiveToneProfile(analysis);
  const toneDef = EXECUTIVE_TONE_PROFILE_DEFINITIONS[toneProfile];

  const headline = analysis.summary?.headline ?? "Análise executiva disponível.";
  const messageTemplate =
    EXECUTIVE_NARRATIVE_MESSAGE_TEMPLATES[toneProfile] ??
    EXECUTIVE_NARRATIVE_MESSAGE_TEMPLATES.executive;

  const executiveMessage = applyTemplate(messageTemplate, {
    opener: toneDef.message_opener,
    period_label: periodLabel,
    headline,
  });

  const sections = buildNarrativeSections(analysis, toneProfile, periodLabel);
  const highlights = buildHighlights(analysis);
  const priorities = buildPrioritiesList(analysis);
  const confidenceSummary = buildConfidenceSummary(analysis.confidence);
  const limitationSummary = buildLimitationSummary(analysis.confidence?.limitations ?? []);
  const evidenceSummary = buildEvidenceSummary(analysis.evidence ?? [], analysis.explainability ?? []);
  const readingTime = calculateReadingTime(sections, executiveMessage);

  const narrativeId = `nar_c8_${periodLabel}_${toneProfile}`.replace(/[^a-zA-Z0-9._-]/g, "_");

  /** @type {ExecutiveNarrative} */
  const narrative = {
    id: narrativeId,
    summary: analysis.summary?.body ?? headline,
    executive_message: executiveMessage,
    sections,
    highlights,
    priorities,
    confidence_summary: confidenceSummary,
    limitation_summary: limitationSummary,
    evidence_summary: evidenceSummary,
    tone_profile: toneProfile,
    reading_time: readingTime,
    deterministic: true,
    meta: {
      builder_version: MIA_EXECUTIVE_NARRATIVE_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_NARRATIVE_CATALOG_VERSION,
      tone_version: "C.8.0",
      source_analysis_status: analysis.status,
    },
  };

  return { narrative, analysis };
}

/**
 * Narrative-only output (C.8 scope).
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveNarrative(input = {}) {
  const { narrative, analysis } = buildExecutiveStructuredNarrative(input);

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status: narrative.highlights.length || narrative.sections.length ? "narrative_ready" : "no_narrative",
    confidence: analysis.confidence,
    evidence: analysis.evidence,
    summary: null,
    insights: [],
    trends: [],
    alerts: [],
    recommendations: [],
    explainability: [],
    narrative,
    meta: {
      period: analysis.meta?.period ?? input.period,
      modules: analysis.meta?.modules ?? [],
      builder_version: MIA_EXECUTIVE_NARRATIVE_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_NARRATIVE_CATALOG_VERSION,
      narrative_record: narrative,
      empty_message:
        narrative.sections.length === 0 ? EXECUTIVE_NARRATIVE_EMPTY_MESSAGES.no_analysis : null,
    },
  };
}

/**
 * Full C.2–C.8 output.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisWithNarrative(input = {}) {
  const { narrative, analysis } = buildExecutiveStructuredNarrative(input);

  return {
    ...analysis,
    status: "analysis_complete_with_narrative",
    narrative,
    meta: {
      ...analysis.meta,
      narrative_builder_version: MIA_EXECUTIVE_NARRATIVE_BUILDER_VERSION,
      narrative_record: narrative,
      tone_profile: narrative.tone_profile,
      reading_time: narrative.reading_time,
    },
  };
}

export { EXECUTIVE_NARRATIVE_EMPTY_MESSAGES };
