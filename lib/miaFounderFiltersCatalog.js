/**
 * PATCH A.7 — Founder Cockpit advanced filters catalog (Single Source of Truth).
 */

export const MIA_FOUNDER_FILTERS_VERSION = "A.7.0";

/** Official IANA timezone for period boundaries */
export const MIA_FOUNDER_FILTERS_TIMEZONE = "UTC";

/** Maximum inclusive days for custom range */
export const MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS = 365;

/** Maximum product_id length (safe param) */
export const MIA_FOUNDER_FILTERS_MAX_PRODUCT_ID_LENGTH = 128;

/** Official product vertical categories (analytics_events.category) */
export const MIA_FOUNDER_FILTER_CATEGORIES = Object.freeze([
  { id: "smartphones", label: "Smartphones" },
  { id: "notebooks", label: "Notebooks" },
  { id: "tv", label: "TV" },
  { id: "camera", label: "Câmeras" },
  { id: "placa_de_video", label: "Placa de vídeo" },
  { id: "audio", label: "Áudio" },
  { id: "games", label: "Games" },
]);

export const MIA_FOUNDER_FILTER_CATEGORY_IDS = Object.freeze(
  MIA_FOUNDER_FILTER_CATEGORIES.map((c) => c.id)
);

/** Period presets exposed in cockpit UI */
export const MIA_FOUNDER_FILTER_PERIOD_PRESETS = Object.freeze([
  { id: "today", label: "Hoje", rollingDays: 1, mode: "calendar_day" },
  { id: "7d", label: "Últimos 7 dias", rollingDays: 7, mode: "rolling" },
  { id: "30d", label: "Últimos 30 dias", rollingDays: 30, mode: "rolling" },
  { id: "90d", label: "Últimos 90 dias", rollingDays: 90, mode: "rolling" },
  { id: "custom", label: "Personalizado", rollingDays: null, mode: "custom" },
]);

/** Legacy ?days= support (backward compatible) */
export const MIA_FOUNDER_FILTER_LEGACY_DAYS = Object.freeze([7, 30, 90, 365]);

export const MIA_FOUNDER_FILTER_DEFINITIONS = Object.freeze({
  range: {
    id: "range",
    label: "Período",
    type: "preset",
    default: "30d",
    allowed: MIA_FOUNDER_FILTER_PERIOD_PRESETS.map((p) => p.id),
    urlKey: "range",
    legacyUrlKey: "days",
    modules: ["snapshot", "temporal", "sessions", "products", "conversion", "insights"],
  },
  start_date: {
    id: "start_date",
    label: "Data inicial",
    type: "date",
    default: null,
    format: "YYYY-MM-DD",
    timezone: MIA_FOUNDER_FILTERS_TIMEZONE,
    urlKey: "start",
    requiresPreset: "custom",
    modules: ["snapshot", "temporal", "sessions", "products", "conversion", "insights"],
  },
  end_date: {
    id: "end_date",
    label: "Data final",
    type: "date",
    default: null,
    format: "YYYY-MM-DD",
    timezone: MIA_FOUNDER_FILTERS_TIMEZONE,
    urlKey: "end",
    requiresPreset: "custom",
    modules: ["snapshot", "temporal", "sessions", "products", "conversion", "insights"],
  },
  category: {
    id: "category",
    label: "Categoria",
    type: "enum",
    default: null,
    allowed: MIA_FOUNDER_FILTER_CATEGORY_IDS,
    urlKey: "category",
    modules: ["snapshot", "temporal", "sessions", "products", "conversion"],
    unsupportedModules: ["insights"],
    unsupportedReason:
      "Insights executivos agregam visão global — categoria reservada para camada analítica futura.",
  },
  product_id: {
    id: "product_id",
    label: "Produto (ID)",
    type: "string",
    default: null,
    maxLength: MIA_FOUNDER_FILTERS_MAX_PRODUCT_ID_LENGTH,
    pattern: /^[a-zA-Z0-9._-]+$/,
    urlKey: "product_id",
    modules: ["snapshot", "temporal", "products", "conversion"],
    unsupportedModules: ["sessions"],
    unsupportedReason:
      "Sessões e usuários medem alcance agregado — filtro por produto não altera DAU/WAU semântico.",
  },
});

/** Filters deferred — no official instrumentation */
export const MIA_FOUNDER_FILTER_UNAVAILABLE = Object.freeze([
  {
    id: "environment",
    label: "Ambiente (produção / QA)",
    reason:
      "analytics_events não possui coluna environment — escopo produção é fixo via mia_analytics_production_scope().",
  },
  {
    id: "channel",
    label: "Canal / superfície",
    reason: "Sem dimensão canal normalizada nos eventos — offer_store existe mas sem contrato de filtro oficial.",
  },
  {
    id: "product_label",
    label: "Produto por nome",
    reason: "Identificador oficial de filtro é product_id — product_label é apenas exibição.",
  },
]);

/** Module compatibility matrix for UI hints */
export const MIA_FOUNDER_FILTER_MODULE_SUPPORT = Object.freeze({
  snapshot: { period: true, category: true, product_id: true },
  sessions: { period: true, category: true, product_id: false },
  products: { period: true, category: true, product_id: true },
  conversion: { period: true, category: true, product_id: true },
  insights: { period: true, category: false, product_id: false },
});
