/**
 * PATCH C.1 — Executive Analyst architecture definition (C.1.0).
 * Pipeline, layers, responsibilities, prohibitions — no runtime behavior.
 */

import {
  EXECUTIVE_ANALYSIS_MODULE_IDS,
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
} from "./miaExecutiveAnalysisContracts.js";

export const MIA_EXECUTIVE_ANALYSIS_ARCHITECTURE_VERSION = "C.1.0";

export const EXECUTIVE_ANALYST_PIPELINE = Object.freeze([
  {
    id: "executive_metrics",
    label: "Executive Metrics",
    responsibility: "Official facts from APIs/RPCs (Baseline A + B contracts)",
    forbidden: ["interpretation", "natural_language", "UI formatting"],
  },
  {
    id: "executive_views",
    label: "Executive Views",
    responsibility: "Prepared display views from Baseline B mappers (B.2–B.6)",
    forbidden: ["new_aggregations", "LLM", "SQL"],
    bridge: "FounderExecutiveModuleViewsContext",
  },
  {
    id: "executive_analysis",
    label: "Executive Analysis Layer",
    responsibility: "Deterministic interpretation of views — insights, trends, alerts (future C.2+)",
    forbidden: ["fetch", "SQL", "Supabase", "LLM", "invented_metrics"],
  },
  {
    id: "executive_narrative",
    label: "Executive Narrative Layer",
    responsibility: "Organize facts + interpretation into structured narrative slots",
    forbidden: ["LLM", "new_facts", "causal_claims_without_evidence"],
  },
  {
    id: "llm_verbalizer",
    label: "LLM Verbalizer",
    responsibility: "Natural language phrasing of pre-computed narrative only",
    forbidden: ["source_of_truth", "metric_calculation", "threshold_decisions"],
  },
]);

export const EXECUTIVE_ANALYST_LAYER_IDS = Object.freeze(
  EXECUTIVE_ANALYST_PIPELINE.map((layer) => layer.id)
);

export const EXECUTIVE_ANALYST_PROHIBITIONS = Object.freeze([
  "invent_causality",
  "invent_revenue",
  "invent_purchase",
  "create_trends_without_evidence",
  "extrapolate_statistics",
  "hide_missing_data",
  "transform_hypothesis_into_fact",
  "consult_arbitrary_data",
  "bypass_official_apis",
  "recalculate_baseline_b_mappers",
  "llm_as_source_of_truth",
]);

export const EXECUTIVE_ANALYST_ALLOWED_SOURCES = Object.freeze([
  "GET /api/executive-metrics",
  "GET /api/temporal-metrics",
  "Baseline B executive_views (B.2–B.6)",
  "FounderExecutiveModuleViewsContext",
  "miaFounderExecutive*Display.js outputs",
  "miaFounderExecutive*Catalog.js thresholds",
]);

export const EXECUTIVE_ANALYST_BASELINE_B_INTEGRATION = Object.freeze({
  baseline_doc: "docs/analytics/FOUNDER_COCKPIT_BASELINE_B.md",
  module_views_context: "components/founder-cockpit/FounderExecutiveModuleViewsContext.jsx",
  module_ids: EXECUTIVE_ANALYSIS_MODULE_IDS,
  contracts_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  preserves: [
    "A.2.0 cockpit display",
    "A.7.0 temporal/filters",
    "A.8.0 charts",
    "11.1.0 executive API",
    "B.2.0–B.8.0 executive catalogs/displays",
  ],
});

export const EXECUTIVE_ANALYST_PHASE_C_ROADMAP = Object.freeze([
  { patch: "C.1", title: "Arquitetura da Analista Executiva", scope: "contracts, pipeline, docs" },
  { patch: "C.2", title: "TBD — Analysis engine foundation", scope: "deterministic interpretation" },
  { patch: "C.3", title: "TBD — Insights & trends", scope: "ExecutiveInsight, ExecutiveTrend" },
  { patch: "C.4", title: "TBD — Alerts & recommendations", scope: "ExecutiveAlert, ExecutiveRecommendation" },
  { patch: "C.5", title: "TBD — Narrative assembly", scope: "Executive Narrative Layer" },
  { patch: "C.6", title: "TBD — LLM verbalizer integration", scope: "language only" },
  { patch: "C.7", title: "TBD — Cockpit analyst UI", scope: "presentation" },
  { patch: "C.8", title: "TBD — Polimento analista", scope: "UX" },
  { patch: "C.9", title: "TBD — Auditoria final Fase C", scope: "closure" },
]);

export const EXECUTIVE_ANALYST_LEGACY_BOUNDARY = Object.freeze({
  patch_11_4: "Deterministic insights via miaExecutiveInsightsEngine.js — Baseline A",
  patch_b_7: "Deterministic executive summary via miaFounderExecutiveSummaryDisplay.js — Baseline B",
  phase_c: "New analyst pipeline — builds on Baseline B views, does not modify 11.4/B.7 in C.1",
});
