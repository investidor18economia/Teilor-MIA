/**
 * PATCH A.7 — Shared analytics filter normalization (API + RPC param builder).
 */

import {
  MIA_FOUNDER_FILTERS_TIMEZONE,
  MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS,
  MIA_FOUNDER_FILTERS_MAX_PRODUCT_ID_LENGTH,
  MIA_FOUNDER_FILTER_CATEGORY_IDS,
  MIA_FOUNDER_FILTER_PERIOD_PRESETS,
  MIA_FOUNDER_FILTER_LEGACY_DAYS,
} from "./miaFounderFiltersCatalog.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCT_ID_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * @returns {string} YYYY-MM-DD in UTC
 */
export function formatUtcDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {string} isoDate
 */
export function parseUtcDate(isoDate) {
  if (!ISO_DATE_RE.test(isoDate)) return null;
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return isoDate;
}

/**
 * @param {string} start
 * @param {string} end
 */
export function countInclusiveDays(start, end) {
  const s = new Date(`${start}T00:00:00.000Z`);
  const e = new Date(`${end}T00:00:00.000Z`);
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

/**
 * @param {Record<string, unknown>|import("next").ParsedUrlQuery} [query]
 */
export function normalizeFounderFiltersFromQuery(query = {}) {
  const errors = [];
  const warnings = [];
  const today = formatUtcDate();

  let range = String(query.range ?? "").trim().toLowerCase() || null;

  if (!range && query.days != null) {
    const legacyDays = Number.parseInt(String(query.days), 10);
    const preset = MIA_FOUNDER_FILTER_PERIOD_PRESETS.find((p) => p.rollingDays === legacyDays);
    if (preset) {
      range = preset.id;
    } else if (MIA_FOUNDER_FILTER_LEGACY_DAYS.includes(legacyDays)) {
      range = legacyDays === 365 ? "custom" : `${legacyDays}d`;
      if (legacyDays === 365) {
        warnings.push({
          code: "legacy_days_365",
          message: "365 dias mapeado para intervalo personalizado de 365 dias.",
        });
      }
    }
  }

  if (!range) range = "30d";

  const preset = MIA_FOUNDER_FILTER_PERIOD_PRESETS.find((p) => p.id === range);
  if (!preset) {
    errors.push({ field: "range", code: "invalid_range", value: range });
    range = "30d";
  }

  let startDate = null;
  let endDate = null;
  let windowDays = 30;
  let periodMode = "rolling";

  if (range === "today") {
    startDate = today;
    endDate = today;
    windowDays = 1;
    periodMode = "calendar_day";
  } else if (range === "custom") {
    startDate = parseUtcDate(String(query.start ?? query.start_date ?? ""));
    endDate = parseUtcDate(String(query.end ?? query.end_date ?? ""));

    if (!startDate || !endDate) {
      errors.push({ field: "period", code: "custom_dates_required" });
      range = "30d";
      windowDays = 30;
      periodMode = "rolling";
      startDate = null;
      endDate = null;
    } else if (startDate > endDate) {
      errors.push({ field: "period", code: "start_after_end" });
      range = "30d";
      windowDays = 30;
      periodMode = "rolling";
      startDate = null;
      endDate = null;
    } else if (endDate > today) {
      errors.push({ field: "period", code: "future_end_date" });
      range = "30d";
      windowDays = 30;
      periodMode = "rolling";
      startDate = null;
      endDate = null;
    } else {
      const span = countInclusiveDays(startDate, endDate);
      if (span > MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS) {
        errors.push({
          field: "period",
          code: "range_too_long",
          max_days: MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS,
        });
        range = "30d";
        windowDays = 30;
        periodMode = "rolling";
        startDate = null;
        endDate = null;
      } else {
        windowDays = span;
        periodMode = "custom_range";
      }
    }
  } else if (preset?.rollingDays) {
    windowDays = preset.rollingDays;
    periodMode = "rolling";
  }

  let category = String(query.category ?? "").trim().toLowerCase() || null;
  if (category === "" || category === "all") category = null;
  if (category && !MIA_FOUNDER_FILTER_CATEGORY_IDS.includes(category)) {
    errors.push({ field: "category", code: "invalid_category", value: category });
    category = null;
  }

  let productId = String(query.product_id ?? query.product ?? "").trim() || null;
  if (productId) {
    if (productId.length > MIA_FOUNDER_FILTERS_MAX_PRODUCT_ID_LENGTH || !PRODUCT_ID_RE.test(productId)) {
      errors.push({ field: "product_id", code: "invalid_product_id", value: productId.slice(0, 20) });
      productId = null;
    }
  }

  const offsetRaw = Number.parseInt(String(query.offset_days ?? query.offset ?? ""), 10);
  const offsetDays = Number.isFinite(offsetRaw) ? Math.max(0, Math.min(365, offsetRaw)) : 0;

  const isDefault =
    range === "30d" && !category && !productId && periodMode === "rolling" && errors.length === 0;

  return {
    filters_version: "A.7.0",
    timezone: MIA_FOUNDER_FILTERS_TIMEZONE,
    range,
    start_date: startDate,
    end_date: endDate,
    window_days: windowDays,
    period_mode: periodMode,
    category,
    product_id: productId,
    offset_days: offsetDays,
    is_default: isDefault,
    is_applied: !isDefault,
    errors,
    warnings,
    valid: errors.length === 0,
  };
}

/**
 * @param {ReturnType<typeof normalizeFounderFiltersFromQuery>} filters
 */
export function buildAnalyticsFilterRpcParams(filters) {
  return {
    p_days: filters.window_days,
    p_offset_days: filters.offset_days ?? 0,
    p_start_date:
      filters.period_mode === "custom_range" || filters.period_mode === "calendar_day"
        ? filters.start_date
        : null,
    p_end_date:
      filters.period_mode === "custom_range" || filters.period_mode === "calendar_day"
        ? filters.end_date
        : null,
    p_category: filters.category,
    p_product_id: filters.product_id,
  };
}

/**
 * @param {ReturnType<typeof normalizeFounderFiltersFromQuery>} filters
 */
export function buildAnalyticsFilterCacheSuffix(filters) {
  return [
    `r${filters.range}`,
    filters.start_date ? `s${filters.start_date}` : "",
    filters.end_date ? `e${filters.end_date}` : "",
    filters.category ? `c${filters.category}` : "",
    filters.product_id ? `p${filters.product_id}` : "",
  ]
    .filter(Boolean)
    .join(":");
}

/**
 * @param {ReturnType<typeof normalizeFounderFiltersFromQuery>} filters
 */
export function buildFounderFiltersQueryObject(filters) {
  /** @type {Record<string, string>} */
  const query = { range: filters.range };
  if (filters.period_mode === "custom_range") {
    if (filters.start_date) query.start = filters.start_date;
    if (filters.end_date) query.end = filters.end_date;
  }
  if (filters.category) query.category = filters.category;
  if (filters.product_id) query.product_id = filters.product_id;
  return query;
}

/**
 * @param {ReturnType<typeof normalizeFounderFiltersFromQuery>} filters
 */
export function buildFounderFiltersQueryString(filters) {
  return new URLSearchParams(buildFounderFiltersQueryObject(filters)).toString();
}

/**
 * @param {ReturnType<typeof normalizeFounderFiltersFromQuery>} filters
 */
export function buildExecutiveMetricsApiParams(filters) {
  return {
    windowDays: filters.window_days,
    offsetDays: filters.offset_days ?? 0,
    startDate: filters.start_date,
    endDate: filters.end_date,
    category: filters.category,
    productId: filters.product_id,
    periodMode: filters.period_mode,
    range: filters.range,
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function parseAnalyticsFiltersFromHttpQuery(query = {}) {
  const filters = normalizeFounderFiltersFromQuery(query);
  if (!filters.valid) {
    return { ok: false, filters, error: filters.errors[0]?.code ?? "invalid_filters" };
  }
  return { ok: true, filters, error: null };
}
