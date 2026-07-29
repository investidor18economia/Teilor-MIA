/**
 * PATCH C.3 — Executive Insight Builder (C.3.0).
 * Pipeline: collect → analyze → evaluate rules → deduplicate → narrative.
 * Consumes Executive Views only — no SQL · no Supabase · no fetch · no LLM.
 */

import {
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_MODULE_IDS,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_INSIGHT_CATALOG_VERSION,
  EXECUTIVE_INSIGHT_RULES,
  EXECUTIVE_INSIGHT_PRIORITIES,
  EXECUTIVE_INSIGHT_PRIORITY_RANK,
  EXECUTIVE_INSIGHT_EMPTY_MESSAGES,
  EXECUTIVE_INSIGHT_CONFIDENCE_THRESHOLDS,
  EXECUTIVE_INSIGHT_CONFIDENCE_RANK,
  EXECUTIVE_INSIGHT_CATEGORY_LABELS,
} from "./miaExecutiveInsightCatalog.js";
import {
  collectExecutiveSummaryInput,
  isModuleAvailable,
  isModulePartial,
} from "./miaExecutiveSummaryBuilder.js";
import { generateExecutiveAnalysisSummary } from "./miaExecutiveSummaryBuilder.js";

export const MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION = "C.3.0";

const POSITIVE_BADGE_IDS = new Set(["excellent", "growing", "evolving", "stable", "healthy", "accelerating"]);

/**
 * @typedef {Record<string, Record<string, unknown>|null>} ExecutiveModuleViews
 */

/**
 * @typedef {Object} ExecutiveStructuredInsight
 * @property {string} insight_id
 * @property {string} category
 * @property {string} category_label
 * @property {string} priority
 * @property {string} title
 * @property {string} description
 * @property {string[]} modules_involved
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 * @property {string[]} limitations
 * @property {string} rule_ref
 * @property {string} dedup_group
 */

/**
 * @param {string} moduleId
 * @param {string} fieldPath
 * @param {unknown} value
 * @param {string} ruleRef
 */
function makeEvidence(moduleId, fieldPath, value, ruleRef) {
  const safePath = fieldPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    evidence_id: `ev_c3_${moduleId}_${safePath}_${ruleRef.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
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
function extractInsightSignals(views) {
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
  const commercialDown = commercialTrend?.direction === "down";
  const commercialBottleneck = Boolean(commercial?.funnel?.main_bottleneck?.id);
  const bottleneckId = commercial?.funnel?.main_bottleneck?.id ?? "";

  const operationalHeadline = operational?.narrative?.headline ?? "";
  const operationalBadgeId = operational?.narrative?.badge?.id ?? null;
  const operationalDegradation =
    operationalBadgeId === "critical" || operationalHeadline.toLowerCase().includes("degradação");
  const operationalStable =
    (operationalBadgeId === "stable" ||
      operationalBadgeId === "healthy" ||
      operationalHeadline.toLowerCase().includes("estável")) &&
    !operationalDegradation;

  const modulesAvailable = EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) => isModuleAvailable(views[id])).length;
  const partialModules = EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) => isModulePartial(views[id])).length;

  const kpisMajorityPositive = kpiList.length > 0 && positiveKpis > kpiList.length / 2;

  const crossModuleGrowthAlignment = growthUp && commercialUp && kpisMajorityPositive;
  const crossModuleDecoupling =
    (growthUp && commercialDown) || (growthDown && commercialUp);

  const allModulesStable =
    modulesAvailable === EXECUTIVE_ANALYSIS_MODULE_IDS.length &&
    attentionKpis === 0 &&
    !growthDown &&
    !operationalDegradation &&
    !commercialBottleneck &&
    !acceptanceDrop;

  return {
    views,
    kpiList,
    positiveKpis,
    attentionKpis,
    growthUp,
    growthDown,
    healthExcellent,
    acceptanceDrop,
    lowVolume,
    commercialUp,
    commercialDown,
    commercialBottleneck,
    bottleneckId,
    operationalDegradation,
    operationalStable,
    kpisMajorityPositive,
    crossModuleGrowthAlignment,
    crossModuleDecoupling,
    platformStability: allModulesStable,
    modulesAvailable,
    partialModules,
    growthHeadline: growth?.narrative?.headline ?? "",
    healthHeadline: health?.narrative?.headline ?? "",
    commercialHeadline: commercial?.narrative?.headline ?? "",
    operationalHeadline,
  };
}

/**
 * @param {ReturnType<typeof extractInsightSignals>} signals
 */
function classifyInsightEnvelopeConfidence(signals) {
  const limitations = [];
  const factors = [];
  let level = "insufficient_data";

  if (signals.modulesAvailable === 0) {
    limitations.push(EXECUTIVE_INSIGHT_EMPTY_MESSAGES.insufficient_data);
    return {
      level,
      factors,
      limitations,
      modules_available: 0,
      modules_total: EXECUTIVE_ANALYSIS_MODULE_IDS.length,
    };
  }

  if (signals.modulesAvailable >= EXECUTIVE_INSIGHT_CONFIDENCE_THRESHOLDS.min_modules_for_insights) {
    level = signals.modulesAvailable >= EXECUTIVE_ANALYSIS_MODULE_IDS.length ? "high" : "moderate";
    factors.push(`${signals.modulesAvailable} módulos executivos disponíveis.`);
  } else {
    level = "low";
    limitations.push("Poucos módulos para combinação cross-module.");
  }

  if (signals.partialModules > 0) {
    if (level === "high") level = "moderate";
    limitations.push(`${signals.partialModules} módulo(s) com dados parciais.`);
  }

  if (signals.lowVolume) {
    limitations.push("Volume comercial insuficiente.");
  }

  return {
    level,
    factors,
    limitations,
    modules_available: signals.modulesAvailable,
    modules_total: EXECUTIVE_ANALYSIS_MODULE_IDS.length,
  };
}

/**
 * @param {ReturnType<typeof extractInsightSignals>} signals
 * @param {string} when
 */
function insightRuleMatches(signals, when) {
  switch (when) {
    case "cross_module_growth_alignment":
      return signals.crossModuleGrowthAlignment;
    case "commercial_bottleneck":
      return signals.commercialBottleneck;
    case "operational_degradation":
      return signals.operationalDegradation;
    case "health_acceptance_drop":
      return signals.acceptanceDrop;
    case "growth_up":
      return signals.growthUp;
    case "commercial_up_no_bottleneck":
      return signals.commercialUp && !signals.commercialBottleneck;
    case "health_excellent":
      return signals.healthExcellent;
    case "cross_module_decoupling":
      return signals.crossModuleDecoupling;
    case "operational_stable":
      return signals.operationalStable;
    case "platform_stability":
      return signals.platformStability;
    case "kpis_majority_positive":
      return signals.kpisMajorityPositive;
    case "low_volume":
      return signals.lowVolume;
    default:
      return false;
  }
}

/**
 * @param {ExecutiveModuleViews} views
 * @param {typeof EXECUTIVE_INSIGHT_RULES[number]} rule
 */
function buildRuleEvidence(views, rule, signals) {
  return rule.evidence_fields.map(({ module_id, field_path }) => {
    let value = null;
    if (module_id === "meta") {
      value = signals.modulesAvailable;
    } else {
      const parts = field_path.split(".");
      let cursor = views[module_id];
      for (const part of parts.slice(1)) {
        cursor = cursor?.[part];
      }
      value = cursor ?? null;
    }
    return makeEvidence(module_id, field_path, value, rule.rule_ref);
  });
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} envelope
 * @param {string} minLevel
 */
function meetsMinConfidence(envelope, minLevel) {
  return EXECUTIVE_INSIGHT_CONFIDENCE_RANK[envelope.level] >= EXECUTIVE_INSIGHT_CONFIDENCE_RANK[minLevel];
}

/**
 * @param {ExecutiveModuleViews} views
 * @param {typeof EXECUTIVE_INSIGHT_RULES[number]} rule
 */
function requiredModulesAvailable(views, rule) {
  return rule.required_modules.every((id) => isModuleAvailable(views[id]));
}

/**
 * Stage 1 — collect (reuse C.2 normalizer).
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function collectExecutiveInsightInput(input = {}) {
  return collectExecutiveSummaryInput(input);
}

/**
 * Stage 2 — analyze signals.
 * @param {ReturnType<typeof collectExecutiveInsightInput>} collected
 */
export function analyzeExecutiveInsightSignals(collected) {
  const signals = extractInsightSignals(collected.views);
  const envelopeConfidence = classifyInsightEnvelopeConfidence(signals);
  return { signals, envelopeConfidence, period: collected.period, period_label: collected.period_label };
}

/**
 * Stage 3 — evaluate rules into structured insight candidates.
 * @param {ReturnType<typeof analyzeExecutiveInsightSignals>} analyzed
 * @param {ReturnType<typeof collectExecutiveInsightInput>} collected
 */
export function evaluateExecutiveInsightRules(analyzed, collected) {
  const { signals, envelopeConfidence, period, period_label } = analyzed;
  const candidates = [];

  if (!meetsMinConfidence(envelopeConfidence, "low")) {
    return candidates;
  }

  for (const rule of EXECUTIVE_INSIGHT_RULES) {
    if (!requiredModulesAvailable(collected.views, rule)) continue;
    if (!meetsMinConfidence(envelopeConfidence, rule.min_confidence)) continue;
    if (!insightRuleMatches(signals, rule.when)) continue;

    const evidence = buildRuleEvidence(collected.views, rule, signals);
    const limitations = [...envelopeConfidence.limitations];
    if (isModulePartial(collected.views.commercial) && rule.category === "commercial") {
      limitations.push(EXECUTIVE_INSIGHT_EMPTY_MESSAGES.modules_missing);
    }

    const periodKey = period?.range ?? period_label ?? "unknown";
    const description = applyTemplate(rule.body_template, {
      bottleneck_id: signals.bottleneckId || "—",
      growth_headline: signals.growthHeadline || "—",
      health_headline: signals.healthHeadline || "—",
      operational_headline: signals.operationalHeadline || "—",
      positive_kpis: signals.positiveKpis,
      total_kpis: signals.kpiList.length,
    });

    candidates.push({
      insight_id: `ins_c3_${rule.id}_${periodKey}`,
      category: rule.category,
      category_label: EXECUTIVE_INSIGHT_CATEGORY_LABELS[rule.category] ?? rule.category,
      priority: rule.priority,
      title: rule.title,
      description,
      modules_involved: rule.required_modules.filter((id) => isModuleAvailable(collected.views[id])),
      evidence,
      confidence: {
        level: envelopeConfidence.level,
        factors: [...envelopeConfidence.factors, `Regra: ${rule.rule_ref}`],
        limitations,
        modules_available: envelopeConfidence.modules_available,
        modules_total: envelopeConfidence.modules_total,
      },
      period,
      limitations,
      rule_ref: rule.rule_ref,
      dedup_group: rule.dedup_group,
      rule_priority: rule.rule_priority,
    });
  }

  return candidates;
}

/**
 * Stage 4 — deduplicate by group, keeping highest priority then lowest rule_priority.
 * @param {ExecutiveStructuredInsight[]} candidates
 */
export function deduplicateExecutiveInsights(candidates) {
  /** @type {Map<string, ExecutiveStructuredInsight>} */
  const byGroup = new Map();

  for (const candidate of candidates) {
    const existing = byGroup.get(candidate.dedup_group);
    if (!existing) {
      byGroup.set(candidate.dedup_group, candidate);
      continue;
    }
    const existingRank = EXECUTIVE_INSIGHT_PRIORITY_RANK[existing.priority] ?? 99;
    const candidateRank = EXECUTIVE_INSIGHT_PRIORITY_RANK[candidate.priority] ?? 99;
    if (
      candidateRank < existingRank ||
      (candidateRank === existingRank && candidate.rule_priority < existing.rule_priority)
    ) {
      byGroup.set(candidate.dedup_group, candidate);
    }
  }

  const deduped = [...byGroup.values()];

  /** Title-level dedup for remaining semantic overlap */
  const seenTitles = new Set();
  return deduped
    .filter((item) => {
      const key = item.title.toLowerCase().trim();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .sort((a, b) => {
      const pr =
        (EXECUTIVE_INSIGHT_PRIORITY_RANK[a.priority] ?? 99) -
        (EXECUTIVE_INSIGHT_PRIORITY_RANK[b.priority] ?? 99);
      if (pr !== 0) return pr;
      return a.rule_priority - b.rule_priority;
    });
}

/**
 * Map structured insight to C.1 ExecutiveInsight contract.
 * @param {ExecutiveStructuredInsight} structured
 */
export function mapStructuredInsightToExecutiveInsight(structured) {
  return {
    insight_id: structured.insight_id,
    title: structured.title,
    body: structured.description,
    confidence: structured.confidence,
    evidence: structured.evidence,
    modules_involved: structured.modules_involved,
    stage: "interpretation",
  };
}

/**
 * Stage 5 — narrative input for future verbalizer.
 * @param {ExecutiveStructuredInsight[]} insights
 * @param {ReturnType<typeof analyzeExecutiveInsightSignals>} analyzed
 */
export function buildExecutiveInsightNarrative(insights, analyzed) {
  return {
    narrative_version: MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION,
    stage: "interpretation",
    insights,
    confidence: analyzed.envelopeConfidence,
    meta: {
      period_label: analyzed.period_label,
      categories: [...new Set(insights.map((i) => i.category))],
    },
  };
}

/**
 * Full insight pipeline.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function buildExecutiveStructuredInsights(input = {}) {
  const collected = collectExecutiveInsightInput(input);
  const analyzed = analyzeExecutiveInsightSignals(collected);
  const candidates = evaluateExecutiveInsightRules(analyzed, collected);
  const insights = deduplicateExecutiveInsights(candidates);
  const narrative = buildExecutiveInsightNarrative(insights, analyzed);

  return {
    insights,
    narrative,
    envelopeConfidence: analyzed.envelopeConfidence,
    period: collected.period,
    modules_used: EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) => isModuleAvailable(collected.views[id])),
  };
}

/**
 * Generate ExecutiveAnalysisOutput with insights only (C.3 scope).
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisInsights(input = {}) {
  const { insights, narrative, envelopeConfidence, period, modules_used } =
    buildExecutiveStructuredInsights(input);

  const mappedInsights = insights.map(mapStructuredInsightToExecutiveInsight);
  const allEvidence = insights.flatMap((i) => i.evidence);

  const status =
    envelopeConfidence.level === "insufficient_data"
      ? "insufficient_data"
      : mappedInsights.length > 0
        ? "insights_ready"
        : "no_insights";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status,
    confidence: envelopeConfidence,
    evidence: allEvidence,
    summary: null,
    insights: mappedInsights,
    trends: [],
    alerts: [],
    recommendations: [],
    meta: {
      period,
      modules: modules_used,
      builder_version: MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_INSIGHT_CATALOG_VERSION,
      narrative_stage: narrative.stage,
      insight_records: insights.map(({ rule_priority, dedup_group, ...rest }) => rest),
      limitations: envelopeConfidence.limitations,
      empty_message:
        mappedInsights.length === 0 ? EXECUTIVE_INSIGHT_EMPTY_MESSAGES.no_rules_matched : null,
    },
  };
}

/**
 * Combined C.2 summary + C.3 insights in single ExecutiveAnalysisOutput.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisWithSummaryAndInsights(input = {}) {
  const summaryOutput = generateExecutiveAnalysisSummary(input);
  const insightsOutput = generateExecutiveAnalysisInsights(input);

  const combinedEvidence = [...summaryOutput.evidence, ...insightsOutput.evidence];
  const combinedLimitations = [
    ...new Set([
      ...(summaryOutput.meta?.limitations ?? []),
      ...(insightsOutput.meta?.limitations ?? []),
    ]),
  ];

  let combinedLevel = "insufficient_data";
  const summaryRank = EXECUTIVE_INSIGHT_CONFIDENCE_RANK[summaryOutput.confidence.level] ?? 0;
  const insightRank = EXECUTIVE_INSIGHT_CONFIDENCE_RANK[insightsOutput.confidence.level] ?? 0;
  const minRank = Math.min(summaryRank, insightRank);
  if (minRank >= EXECUTIVE_INSIGHT_CONFIDENCE_RANK.high) combinedLevel = "high";
  else if (minRank >= EXECUTIVE_INSIGHT_CONFIDENCE_RANK.moderate) combinedLevel = "moderate";
  else if (minRank >= EXECUTIVE_INSIGHT_CONFIDENCE_RANK.low) combinedLevel = "low";

  const status =
    summaryOutput.status === "insufficient_data" && insightsOutput.status === "insufficient_data"
      ? "insufficient_data"
      : "analysis_ready";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status,
    confidence: {
      level: combinedLevel,
      factors: [
        ...summaryOutput.confidence.factors,
        ...insightsOutput.confidence.factors.filter((f) => !summaryOutput.confidence.factors.includes(f)),
      ],
      limitations: combinedLimitations,
      modules_available: summaryOutput.confidence.modules_available,
      modules_total: summaryOutput.confidence.modules_total,
    },
    evidence: combinedEvidence,
    summary: summaryOutput.summary,
    insights: insightsOutput.insights,
    trends: [],
    alerts: [],
    recommendations: [],
    meta: {
      period: summaryOutput.meta.period,
      modules: summaryOutput.meta.modules,
      summary_builder_version: summaryOutput.meta.builder_version,
      insight_builder_version: insightsOutput.meta.builder_version,
      insight_records: insightsOutput.meta.insight_records,
      section_ids: summaryOutput.meta.section_ids,
      limitations: combinedLimitations,
      insight_count: insightsOutput.insights.length,
    },
  };
}

export { EXECUTIVE_INSIGHT_EMPTY_MESSAGES, EXECUTIVE_INSIGHT_PRIORITIES };
