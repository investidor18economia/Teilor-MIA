/**
 * PATCH C.2 — Executive Summary Builder (C.2.0).
 * Pipeline: collect → organize → structure → narrative.
 * Consumes Executive Views only — no SQL · no Supabase · no fetch · no LLM.
 */

import {
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_MODULE_IDS,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_SUMMARY_CATALOG_VERSION,
  EXECUTIVE_SUMMARY_SECTION_IDS,
  EXECUTIVE_SUMMARY_SECTION_TITLES,
  EXECUTIVE_SUMMARY_MODULE_IDS,
  EXECUTIVE_SUMMARY_EMPTY_MESSAGES,
  EXECUTIVE_SUMMARY_OVERVIEW_TEMPLATES,
  EXECUTIVE_SUMMARY_CONCLUSION_TEMPLATES,
  EXECUTIVE_SUMMARY_HIGHLIGHT_CATALOG,
  EXECUTIVE_SUMMARY_ATTENTION_CATALOG,
  EXECUTIVE_SUMMARY_OVERALL_LABELS,
  EXECUTIVE_SUMMARY_CONFIDENCE_THRESHOLDS,
} from "./miaExecutiveSummaryCatalog.js";

export const MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION = "C.2.0";

const POSITIVE_BADGE_IDS = new Set(["excellent", "growing", "evolving", "stable", "healthy", "accelerating"]);

/**
 * @typedef {Record<string, Record<string, unknown>|null>} ExecutiveModuleViews
 */

/**
 * @typedef {Object} ExecutiveSummarySection
 * @property {string} section_id
 * @property {string} title
 * @property {string} content
 * @property {string[]} module_ids
 * @property {"complete"|"partial"|"insufficient"} status
 * @property {string[]} fact_lines
 */

/**
 * @typedef {Object} ExecutiveStructuredSummary
 * @property {string} summary_id
 * @property {string} builder_version
 * @property {string} contracts_version
 * @property {ExecutiveSummarySection[]} sections
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @property {{ period: import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"], modules_used: string[], limitations: string[] }} meta
 */

/**
 * @typedef {Object} ExecutiveSummaryNarrativeInput
 * @property {string} narrative_version
 * @property {string} stage
 * @property {ExecutiveSummarySection[]} sections
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @property {{ period_label: string|null, modules: string[] }} meta
 */

/**
 * @param {Record<string, unknown>|null|undefined} view
 */
function isModuleAvailable(view) {
  return view != null && view.meta?.status !== "error";
}

/**
 * @param {Record<string, unknown>|null|undefined} view
 */
function isModulePartial(view) {
  return view?.meta?.status === "partial" || (view?.meta?.partial_errors?.length ?? 0) > 0;
}

/**
 * @param {string} moduleId
 * @param {string} fieldPath
 * @param {unknown} value
 * @param {string} ruleRef
 * @returns {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence}
 */
function makeEvidence(moduleId, fieldPath, value, ruleRef) {
  const safePath = fieldPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    evidence_id: `ev_c2_${moduleId}_${safePath}_${ruleRef.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    source: "executive_views",
    module_id: moduleId,
    field_path: fieldPath,
    value_snapshot: value != null ? String(value) : null,
    rule_ref: ruleRef,
  };
}

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
 * @param {ExecutiveModuleViews} views
 */
function extractViewSignals(views) {
  const kpis = views.kpis ?? null;
  const growth = views.growth ?? null;
  const health = views.health ?? null;
  const commercial = views.commercial ?? null;
  const operational = views.operational ?? null;

  const kpiList = Array.isArray(kpis?.kpis) ? kpis.kpis : [];
  const positiveKpis = kpiList.filter((k) => POSITIVE_BADGE_IDS.has(k.badge?.id)).length;
  const attentionKpis = kpiList.filter((k) => k.badge?.id === "attention").length;

  const dauDirection = growth?.trends?.dau?.direction ?? null;
  const growthBadgeId = growth?.narrative?.badge?.id ?? null;
  const growthUp =
    dauDirection === "up" || growthBadgeId === "growing" || growthBadgeId === "accelerating";
  const growthDown =
    dauDirection === "down" || growthBadgeId === "attention" || growthBadgeId === "decelerating";

  const healthLevel = health?.health_index?.level ?? null;
  const healthIndex = health?.health_index?.value ?? null;
  const healthExcellent =
    healthLevel === "excellent" || (healthIndex != null && Number(healthIndex) >= 75);

  const acceptanceIndicator = health?.indicators?.find?.((i) => i.id === "recommendation_acceptance");
  const acceptanceDrop =
    acceptanceIndicator?.periodDelta != null && acceptanceIndicator.periodDelta <= -0.02;

  const volumeConfidence = commercial?.meta?.volume_confidence ?? null;
  const lowVolume = volumeConfidence === "insufficient";
  const commercialTrend = commercial?.indicators?.find?.((i) => i.id === "commercial_trend");
  const commercialUp = commercialTrend?.direction === "up";
  const commercialBottleneck = Boolean(commercial?.funnel?.main_bottleneck?.id);
  const bottleneckId = commercial?.funnel?.main_bottleneck?.id ?? "";
  const advanceIndicator = commercial?.indicators?.find?.((i) => i.id === "offer_advance_rate");
  const commercialAdvanceLow = advanceIndicator?.level === "attention";
  const intentIndicator = commercial?.indicators?.find?.((i) => i.id === "commercial_intent");
  const commercialIntentUp = intentIndicator?.direction === "up";

  const operationalHeadline = operational?.narrative?.headline ?? "";
  const operationalBadgeId = operational?.narrative?.badge?.id ?? null;
  const operationalDegradation =
    operationalBadgeId === "critical" || operationalHeadline.toLowerCase().includes("degradação");
  const operationalStable =
    operationalBadgeId === "stable" ||
    operationalBadgeId === "healthy" ||
    operationalHeadline.toLowerCase().includes("estável");

  const modulesAvailable = EXECUTIVE_SUMMARY_MODULE_IDS.filter((id) =>
    isModuleAvailable(views[id])
  ).length;
  const partialModules = EXECUTIVE_SUMMARY_MODULE_IDS.filter((id) => isModulePartial(views[id])).length;

  const periodCompareCount = [
    growth?.meta?.period_compare_available,
    health?.meta?.period_compare_available,
    commercial?.meta?.period_compare_available,
  ].filter(Boolean).length;

  return {
    views: { kpis, growth, health, commercial, operational },
    kpiList,
    positiveKpis,
    attentionKpis,
    growthUp,
    growthDown,
    healthExcellent,
    acceptanceDrop,
    lowVolume,
    commercialUp,
    commercialBottleneck,
    bottleneckId,
    commercialAdvanceLow,
    commercialIntentUp,
    operationalDegradation,
    operationalStable,
    operationalHeadline,
    modulesAvailable,
    partialModules,
    periodCompareCount,
    growthHeadline: growth?.narrative?.headline ?? "",
    healthHeadline: health?.narrative?.headline ?? "",
    commercialHeadline: commercial?.narrative?.headline ?? "",
    commercialIndex: commercial?.commercial_index?.value ?? null,
    operationalIndex: operational?.operational_index?.value ?? null,
  };
}

/**
 * @param {ReturnType<typeof extractViewSignals>} signals
 * @param {string} when
 */
function signalMatches(signals, when) {
  switch (when) {
    case "growth_up":
      return signals.growthUp;
    case "growth_down":
      return signals.growthDown;
    case "health_excellent":
      return signals.healthExcellent;
    case "kpis_majority_positive":
      return signals.kpiList.length > 0 && signals.positiveKpis > signals.kpiList.length / 2;
    case "commercial_up":
      return signals.commercialUp;
    case "operational_stable":
      return signals.operationalStable && !signals.operationalDegradation;
    case "commercial_intent_up":
      return signals.commercialIntentUp;
    case "operational_degradation":
      return signals.operationalDegradation;
    case "commercial_bottleneck":
      return signals.commercialBottleneck;
    case "low_volume":
      return signals.lowVolume;
    case "health_acceptance_drop":
      return signals.acceptanceDrop;
    case "partial_modules":
      return signals.partialModules > 0;
    case "commercial_advance_low":
      return signals.commercialAdvanceLow;
    default:
      return false;
  }
}

/**
 * @param {ExecutiveModuleViews} views
 */
function computeOverallLabel(views, signals) {
  if (signals.modulesAvailable === 0) return EXECUTIVE_SUMMARY_OVERALL_LABELS.unavailable;

  const scores = [];
  for (const id of EXECUTIVE_SUMMARY_MODULE_IDS) {
    const view = views[id];
    if (!isModuleAvailable(view)) continue;
    if (id === "kpis" && Array.isArray(view.kpis) && view.kpis.length) {
      const positiveRatio = view.kpis.filter((k) => POSITIVE_BADGE_IDS.has(k.badge?.id)).length / view.kpis.length;
      scores.push(positiveRatio);
    } else if (view.health_index?.value != null) {
      scores.push(Number(view.health_index.value) / 100);
    } else if (view.commercial_index?.value != null && view.meta?.volume_confidence !== "insufficient") {
      scores.push(Number(view.commercial_index.value) / 100);
    } else if (view.operational_index?.value != null) {
      scores.push(Number(view.operational_index.value) / 100);
    } else if (view.narrative?.badge?.id === "critical") {
      scores.push(0.15);
    } else if (view.narrative?.badge?.id === "attention") {
      scores.push(0.35);
    } else if (view.narrative?.badge?.id === "growing" || view.narrative?.badge?.id === "accelerating") {
      scores.push(0.85);
    } else if (view.narrative?.badge?.id === "stable" || view.narrative?.badge?.id === "healthy") {
      scores.push(0.65);
    }
  }

  if (signals.operationalDegradation) return EXECUTIVE_SUMMARY_OVERALL_LABELS.critical;

  if (scores.length === 0) return EXECUTIVE_SUMMARY_OVERALL_LABELS.unavailable;

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 0.85) return EXECUTIVE_SUMMARY_OVERALL_LABELS.excellent;
  if (avg >= 0.75) return EXECUTIVE_SUMMARY_OVERALL_LABELS.very_healthy;
  if (avg >= 0.65) return EXECUTIVE_SUMMARY_OVERALL_LABELS.healthy;
  if (avg >= 0.5) return EXECUTIVE_SUMMARY_OVERALL_LABELS.stable;
  if (avg >= 0.35) return EXECUTIVE_SUMMARY_OVERALL_LABELS.attention;
  return EXECUTIVE_SUMMARY_OVERALL_LABELS.critical;
}

/**
 * @param {ReturnType<typeof extractViewSignals>} signals
 */
function classifySummaryConfidence(signals) {
  const limitations = [];
  const factors = [];
  let level = "insufficient_data";

  if (signals.modulesAvailable === 0) {
    limitations.push("Nenhum módulo executivo disponível.");
    return { level, factors, limitations, modules_available: 0, modules_total: EXECUTIVE_SUMMARY_MODULE_IDS.length };
  }

  if (signals.modulesAvailable >= EXECUTIVE_SUMMARY_CONFIDENCE_THRESHOLDS.min_modules_high) {
    level = "high";
    factors.push("Todos os módulos principais disponíveis.");
  } else if (signals.modulesAvailable >= EXECUTIVE_SUMMARY_CONFIDENCE_THRESHOLDS.min_modules_moderate) {
    level = "moderate";
    factors.push("Módulos principais parcialmente disponíveis.");
    limitations.push("Cobertura incompleta de módulos executivos.");
  } else {
    level = "low";
    limitations.push("Poucos módulos executivos disponíveis.");
  }

  if (signals.partialModules > 0) {
    if (level === "high") level = "moderate";
    else if (level === "moderate") level = "low";
    limitations.push(`${signals.partialModules} módulo(s) com dados parciais.`);
  }

  if (signals.lowVolume) {
    if (level === "high") level = "moderate";
    limitations.push("Volume comercial insuficiente no período.");
  }

  if (signals.periodCompareCount === 0 && signals.modulesAvailable >= 2) {
    limitations.push("Comparativo de período indisponível.");
  }

  return {
    level,
    factors,
    limitations,
    modules_available: signals.modulesAvailable,
    modules_total: EXECUTIVE_SUMMARY_MODULE_IDS.length,
  };
}

/**
 * Stage 1 — collect: normalize input views.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function collectExecutiveSummaryInput(input = {}) {
  const executiveViews = input.executive_views ?? {};
  const views = {};
  for (const id of EXECUTIVE_ANALYSIS_MODULE_IDS) {
    views[id] = executiveViews[id] ?? null;
  }
  return {
    analysis_version: input.analysis_version ?? MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    period_label: input.period_label ?? null,
    period: input.period ?? { start: null, end: null, range: null, window_days: null },
    module_ids: input.module_ids?.length ? [...input.module_ids] : [...EXECUTIVE_ANALYSIS_MODULE_IDS],
    views,
    source_evidence: Array.isArray(input.source_evidence) ? [...input.source_evidence] : [],
  };
}

/**
 * Stage 2 — organize: extract signals and candidate facts.
 * @param {ReturnType<typeof collectExecutiveSummaryInput>} collected
 */
export function organizeExecutiveSummaryFacts(collected) {
  const signals = extractViewSignals(collected.views);
  const confidence = classifySummaryConfidence(signals);
  const overallLabel = computeOverallLabel(collected.views, signals);
  const modulesUsed = EXECUTIVE_SUMMARY_MODULE_IDS.filter((id) => isModuleAvailable(collected.views[id]));

  /** @type {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} */
  const evidence = [...collected.source_evidence];

  evidence.push(
    makeEvidence("meta", "modules_available", signals.modulesAvailable, "C.2.collect.modules_available")
  );

  for (const id of modulesUsed) {
    const headline = collected.views[id]?.narrative?.headline;
    if (headline) {
      evidence.push(makeEvidence(id, "narrative.headline", headline, "C.2.collect.module_headline"));
    }
  }

  return {
    signals,
    confidence,
    overallLabel,
    modulesUsed,
    evidence,
  };
}

/**
 * @param {typeof EXECUTIVE_SUMMARY_HIGHLIGHT_CATALOG[number]|typeof EXECUTIVE_SUMMARY_ATTENTION_CATALOG[number]} item
 * @param {ReturnType<typeof extractViewSignals>} signals
 */
function renderCatalogItem(item, signals) {
  switch (item.when) {
    case "growth_up":
    case "growth_down":
      return applyTemplate(item.template, { headline: signals.growthHeadline || "—" });
    case "health_excellent":
      return applyTemplate(item.template, { headline: signals.healthHeadline || "—" });
    case "kpis_majority_positive":
      return applyTemplate(item.template, {
        positive_count: signals.positiveKpis,
        total_count: signals.kpiList.length,
      });
    case "commercial_up":
      return applyTemplate(item.template, { headline: signals.commercialHeadline || "—" });
    case "operational_stable":
    case "operational_degradation":
      return applyTemplate(item.template, { headline: signals.operationalHeadline || "—" });
    case "commercial_bottleneck":
      return applyTemplate(item.template, { bottleneck_id: signals.bottleneckId || "—" });
    case "partial_modules":
      return applyTemplate(item.template, { partial_count: signals.partialModules });
    default:
      return item.template;
  }
}

/**
 * Stage 3 — structure: build fixed 6-section summary.
 * @param {ReturnType<typeof organizeExecutiveSummaryFacts>} organized
 * @param {ReturnType<typeof collectExecutiveSummaryInput>} collected
 */
export function buildExecutiveSummarySections(organized, collected) {
  const { signals, confidence, overallLabel, modulesUsed } = organized;

  const overviewTemplate =
    signals.modulesAvailable === 0
      ? EXECUTIVE_SUMMARY_OVERVIEW_TEMPLATES.no_modules
      : signals.modulesAvailable < EXECUTIVE_SUMMARY_MODULE_IDS.length ||
          signals.partialModules > 0
        ? EXECUTIVE_SUMMARY_OVERVIEW_TEMPLATES.partial_modules
        : EXECUTIVE_SUMMARY_OVERVIEW_TEMPLATES.all_modules;

  const overviewContent = applyTemplate(overviewTemplate, {
    modules_available: signals.modulesAvailable,
    modules_total: EXECUTIVE_SUMMARY_MODULE_IDS.length,
  });

  const headlineParts = modulesUsed
    .map((id) => collected.views[id]?.narrative?.headline)
    .filter(Boolean);
  const overviewFacts = [
    overviewContent,
    ...headlineParts.slice(0, 3).map((h) => `Observação registrada: ${h}`),
  ];

  const highlights = EXECUTIVE_SUMMARY_HIGHLIGHT_CATALOG.filter((item) =>
    signalMatches(signals, item.when)
  )
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map((item) => ({
      text: renderCatalogItem(item, signals),
      module_id: item.module_id,
      rule_ref: item.rule_ref,
      field_path: item.field_path,
    }));

  const attention = EXECUTIVE_SUMMARY_ATTENTION_CATALOG.filter((item) =>
    signalMatches(signals, item.when)
  )
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map((item) => ({
      text: renderCatalogItem(item, signals),
      module_id: item.module_id,
      rule_ref: item.rule_ref,
      field_path: item.field_path,
    }));

  const commercialView = collected.views.commercial;
  let commercialContent;
  let commercialStatus = "insufficient";
  if (isModuleAvailable(commercialView)) {
    const parts = [];
    if (commercialView.narrative?.headline) parts.push(String(commercialView.narrative.headline));
    if (signals.commercialIndex != null) {
      parts.push(`Índice comercial registrado: ${signals.commercialIndex}.`);
    }
    commercialContent = parts.length ? parts.join(" ") : EXECUTIVE_SUMMARY_EMPTY_MESSAGES.module_insufficient;
    commercialStatus = isModulePartial(commercialView) ? "partial" : "complete";
  } else {
    commercialContent = EXECUTIVE_SUMMARY_EMPTY_MESSAGES.module_insufficient;
  }

  const operationalView = collected.views.operational;
  let operationalContent;
  let operationalStatus = "insufficient";
  if (isModuleAvailable(operationalView)) {
    const parts = [];
    if (operationalView.narrative?.headline) parts.push(String(operationalView.narrative.headline));
    if (signals.operationalIndex != null) {
      parts.push(`Índice operacional registrado: ${signals.operationalIndex}.`);
    }
    operationalContent = parts.length ? parts.join(" ") : EXECUTIVE_SUMMARY_EMPTY_MESSAGES.module_insufficient;
    operationalStatus = isModulePartial(operationalView) ? "partial" : "complete";
  } else {
    operationalContent = EXECUTIVE_SUMMARY_EMPTY_MESSAGES.module_insufficient;
  }

  const conclusionTemplate =
    signals.modulesAvailable === 0
      ? EXECUTIVE_SUMMARY_CONCLUSION_TEMPLATES.insufficient
      : confidence.limitations.length > 0
        ? EXECUTIVE_SUMMARY_CONCLUSION_TEMPLATES.partial
        : EXECUTIVE_SUMMARY_CONCLUSION_TEMPLATES.consolidated;

  const conclusionContent = applyTemplate(conclusionTemplate, {
    overall_label: overallLabel,
    module_list: modulesUsed.join(", ") || "nenhum",
    limitations_count: confidence.limitations.length,
  });

  /** @type {ExecutiveSummarySection[]} */
  const sections = [
    {
      section_id: "overview",
      title: EXECUTIVE_SUMMARY_SECTION_TITLES.overview,
      content: overviewContent,
      module_ids: modulesUsed,
      status: signals.modulesAvailable === 0 ? "insufficient" : signals.partialModules > 0 ? "partial" : "complete",
      fact_lines: overviewFacts,
    },
    {
      section_id: "highlights",
      title: EXECUTIVE_SUMMARY_SECTION_TITLES.highlights,
      content: highlights.length
        ? highlights.map((h) => h.text).join(" ")
        : EXECUTIVE_SUMMARY_EMPTY_MESSAGES.no_highlights,
      module_ids: [...new Set(highlights.map((h) => h.module_id))],
      status: highlights.length ? "complete" : signals.modulesAvailable === 0 ? "insufficient" : "partial",
      fact_lines: highlights.map((h) => h.text),
    },
    {
      section_id: "attention",
      title: EXECUTIVE_SUMMARY_SECTION_TITLES.attention,
      content: attention.length
        ? attention.map((a) => a.text).join(" ")
        : EXECUTIVE_SUMMARY_EMPTY_MESSAGES.no_attention,
      module_ids: [...new Set(attention.map((a) => a.module_id))],
      status: attention.length ? "complete" : "complete",
      fact_lines: attention.map((a) => a.text),
    },
    {
      section_id: "commercial",
      title: EXECUTIVE_SUMMARY_SECTION_TITLES.commercial,
      content: commercialContent,
      module_ids: isModuleAvailable(commercialView) ? ["commercial"] : [],
      status: commercialStatus,
      fact_lines: commercialContent.split(/(?<=\.)\s+/).filter(Boolean),
    },
    {
      section_id: "operational",
      title: EXECUTIVE_SUMMARY_SECTION_TITLES.operational,
      content: operationalContent,
      module_ids: isModuleAvailable(operationalView) ? ["operational"] : [],
      status: operationalStatus,
      fact_lines: operationalContent.split(/(?<=\.)\s+/).filter(Boolean),
    },
    {
      section_id: "conclusion",
      title: EXECUTIVE_SUMMARY_SECTION_TITLES.conclusion,
      content: conclusionContent,
      module_ids: modulesUsed,
      status: signals.modulesAvailable === 0 ? "insufficient" : confidence.limitations.length ? "partial" : "complete",
      fact_lines: [conclusionContent],
    },
  ];

  for (const h of highlights) {
    organized.evidence.push(makeEvidence(h.module_id, h.field_path, h.text, h.rule_ref));
  }
  for (const a of attention) {
    organized.evidence.push(makeEvidence(a.module_id, a.field_path, a.text, a.rule_ref));
  }

  return sections;
}

/**
 * Stage 4 — narrative: prepare structured input for Narrative Layer (no LLM).
 * @param {ExecutiveSummarySection[]} sections
 * @param {ReturnType<typeof organizeExecutiveSummaryFacts>} organized
 * @param {ReturnType<typeof collectExecutiveSummaryInput>} collected
 * @returns {ExecutiveSummaryNarrativeInput}
 */
export function buildExecutiveSummaryNarrative(sections, organized, collected) {
  return {
    narrative_version: MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION,
    stage: "summary",
    sections,
    confidence: organized.confidence,
    evidence: organized.evidence,
    meta: {
      period_label: collected.period_label,
      modules: organized.modulesUsed,
    },
  };
}

/**
 * Build full structured summary (collect → organize → structure → narrative).
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 * @returns {{ structured: ExecutiveStructuredSummary, narrative: ExecutiveSummaryNarrativeInput }}
 */
export function buildExecutiveStructuredSummary(input = {}) {
  const collected = collectExecutiveSummaryInput(input);
  const organized = organizeExecutiveSummaryFacts(collected);
  const sections = buildExecutiveSummarySections(organized, collected);
  const narrative = buildExecutiveSummaryNarrative(sections, organized, collected);

  const periodKey =
    collected.period?.range ??
    collected.period?.start ??
    collected.period_label ??
    "unknown_period";

  const structured = {
    summary_id: `exec_summary_c2_${periodKey}_${organized.modulesUsed.join("_") || "none"}`,
    builder_version: MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION,
    contracts_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    sections,
    confidence: organized.confidence,
    evidence: organized.evidence,
    meta: {
      period: collected.period,
      modules_used: organized.modulesUsed,
      limitations: organized.confidence.limitations,
    },
  };

  return { structured, narrative };
}

/**
 * Map structured summary to C.1 ExecutiveSummary contract.
 * @param {ExecutiveStructuredSummary} structured
 */
export function mapStructuredSummaryToExecutiveSummary(structured) {
  const overview = structured.sections.find((s) => s.section_id === "overview");
  const highlights = structured.sections.find((s) => s.section_id === "highlights");
  const attention = structured.sections.find((s) => s.section_id === "attention");

  const bodyParts = structured.sections.map((s) => `${s.title}: ${s.content}`);

  return {
    summary_id: structured.summary_id,
    headline: overview?.content ?? EXECUTIVE_SUMMARY_EMPTY_MESSAGES.no_modules,
    body: bodyParts.join("\n\n"),
    confidence: structured.confidence,
    evidence: structured.evidence,
    priorities: attention?.fact_lines?.slice(0, 3) ?? [],
    opportunities: highlights?.fact_lines?.slice(0, 3) ?? [],
    risks: attention?.fact_lines?.slice(0, 3) ?? [],
  };
}

/**
 * Generate ExecutiveAnalysisOutput with summary only (C.2 scope).
 * Insights, trends, alerts, recommendations remain empty.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisSummary(input = {}) {
  const { structured, narrative } = buildExecutiveStructuredSummary(input);
  const summary = mapStructuredSummaryToExecutiveSummary(structured);

  const status =
    structured.confidence.level === "insufficient_data" ? "insufficient_data" : "summary_ready";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status,
    confidence: structured.confidence,
    evidence: structured.evidence,
    summary,
    insights: [],
    trends: [],
    alerts: [],
    recommendations: [],
    meta: {
      period: structured.meta.period,
      modules: structured.meta.modules_used,
      builder_version: MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION,
      narrative_stage: narrative.stage,
      section_ids: EXECUTIVE_SUMMARY_SECTION_IDS,
      limitations: structured.meta.limitations,
    },
  };
}

/** @deprecated Use buildExecutiveStructuredSummary — alias for pipeline entry. */
export const buildExecutiveSummary = buildExecutiveStructuredSummary;

export {
  EXECUTIVE_SUMMARY_SECTION_IDS,
  EXECUTIVE_SUMMARY_EMPTY_MESSAGES,
  isModuleAvailable,
  isModulePartial,
};
