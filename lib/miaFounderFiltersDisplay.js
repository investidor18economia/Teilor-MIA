/**
 * PATCH A.7 — Founder filters display mapping (formatting only).
 */

import {
  MIA_FOUNDER_FILTER_CATEGORIES,
  MIA_FOUNDER_FILTER_PERIOD_PRESETS,
  MIA_FOUNDER_FILTER_UNAVAILABLE,
  MIA_FOUNDER_FILTER_MODULE_SUPPORT,
  MIA_FOUNDER_FILTERS_TIMEZONE,
  MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS,
} from "./miaFounderFiltersCatalog.js";
import { formatUtcDate } from "./miaAnalyticsFilterParams.js";

export const FOUNDER_FILTERS_DISPLAY_VERSION = "A.7.0";

/**
 * @param {ReturnType<import("./miaAnalyticsFilterParams.js").normalizeFounderFiltersFromQuery>} filters
 */
export function mapFounderFiltersToDisplay(filters) {
  const preset = MIA_FOUNDER_FILTER_PERIOD_PRESETS.find((p) => p.id === filters.range);
  const categoryOption = MIA_FOUNDER_FILTER_CATEGORIES.find((c) => c.id === filters.category);

  const activeChips = [];
  if (filters.is_applied) {
    activeChips.push({ id: "period", label: formatPeriodSummary(filters) });
    if (filters.category) {
      activeChips.push({ id: "category", label: categoryOption?.label ?? filters.category });
    }
    if (filters.product_id) {
      activeChips.push({ id: "product_id", label: `Produto ${filters.product_id}` });
    }
  }

  const moduleHints = Object.entries(MIA_FOUNDER_FILTER_MODULE_SUPPORT).map(([module, support]) => {
    const limitations = [];
    if (filters.category && !support.category) limitations.push("categoria não aplicada neste módulo");
    if (filters.product_id && !support.product_id) limitations.push("produto não aplicado neste módulo");
    return { module, fully_compatible: limitations.length === 0, limitations };
  });

  return {
    meta: {
      display_version: FOUNDER_FILTERS_DISPLAY_VERSION,
      timezone: MIA_FOUNDER_FILTERS_TIMEZONE,
      max_custom_days: MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS,
      is_default: filters.is_default,
      is_applied: filters.is_applied,
      valid: filters.valid,
      errors: filters.errors,
      warnings: filters.warnings,
    },
    periodPresets: MIA_FOUNDER_FILTER_PERIOD_PRESETS.map((p) => ({
      ...p,
      selected: p.id === filters.range,
    })),
    categoryOptions: [
      { id: "", label: "Todas as categorias" },
      ...MIA_FOUNDER_FILTER_CATEGORIES.map((c) => ({ ...c, selected: c.id === filters.category })),
    ],
    activeChips,
    periodSummary: formatPeriodSummary(filters),
    presetLabel: preset?.label ?? filters.range,
    todayUtc: formatUtcDate(),
    moduleHints,
    unavailableFilters: MIA_FOUNDER_FILTER_UNAVAILABLE,
  };
}

/**
 * @param {ReturnType<import("./miaAnalyticsFilterParams.js").normalizeFounderFiltersFromQuery>} filters
 */
export function formatPeriodSummary(filters) {
  if (filters.period_mode === "calendar_day") {
    return `Hoje (${filters.start_date} UTC)`;
  }
  if (filters.period_mode === "custom_range" && filters.start_date && filters.end_date) {
    return `${filters.start_date} → ${filters.end_date} (${filters.window_days} dias, UTC)`;
  }
  const preset = MIA_FOUNDER_FILTER_PERIOD_PRESETS.find((p) => p.id === filters.range);
  return preset?.label ?? `Últimos ${filters.window_days} dias`;
}

/**
 * @param {string} moduleId
 * @param {ReturnType<import("./miaAnalyticsFilterParams.js").normalizeFounderFiltersFromQuery>} filters
 */
export function getModuleFilterCompatibility(moduleId, filters) {
  const support = MIA_FOUNDER_FILTER_MODULE_SUPPORT[moduleId];
  if (!support) return { compatible: true, limitations: [] };
  const limitations = [];
  if (filters.category && !support.category) limitations.push("category");
  if (filters.product_id && !support.product_id) limitations.push("product_id");
  return { compatible: limitations.length === 0, limitations };
}
