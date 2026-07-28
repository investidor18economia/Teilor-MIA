/**
 * PATCH A.4 — Founder Sessions & Users display mapping (formatting only — no aggregation).
 * All values from GET /api/temporal-metrics (growth + platform_activity groups).
 */

import {
  formatPublicMetricNumber,
  formatPublicMetricRate,
} from "./miaPublicMetricsDisplay.js";
import { formatFounderMetricValue } from "./miaFounderCockpitDisplay.js";

export const FOUNDER_GROWTH_DISPLAY_VERSION = "A.4.0";

export const FOUNDER_GROWTH_TREND_THRESHOLD = 0.02;

/** @param {unknown} pct */
export function classifyTrendDirection(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return "unknown";
  const n = Number(pct);
  if (n > FOUNDER_GROWTH_TREND_THRESHOLD) return "up";
  if (n < -FOUNDER_GROWTH_TREND_THRESHOLD) return "down";
  return "stable";
}

/** @param {unknown} pct */
export function formatTrendDirectionLabel(direction) {
  if (direction === "up") return "Alta";
  if (direction === "down") return "Queda";
  if (direction === "stable") return "Estável";
  return "Indisponível";
}

/**
 * @param {unknown} pct
 */
export function formatTrendPercent(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return "—";
  const formatted = formatPublicMetricRate(pct);
  if (Number(pct) > 0) return `+${formatted}`;
  return formatted;
}

/**
 * @param {string} activityDay
 */
export function formatActivityDayLabel(activityDay) {
  if (!activityDay) return "—";
  try {
    return new Date(`${activityDay}T12:00:00Z`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return String(activityDay);
  }
}

/**
 * @param {{ format?: string, value: unknown, label: string, id: string, hint?: string }} metric
 */
export function formatFounderGrowthMetricValue(metric) {
  return formatFounderMetricValue(metric);
}

/**
 * Join growth + platform rows by activity_day (display only — no sums or derived metrics).
 * @param {Array<Record<string, unknown>>} growthSeries
 * @param {Array<Record<string, unknown>>} platformSeries
 * @param {number} [limit]
 */
export function mergeTemporalDailyRows(growthSeries = [], platformSeries = [], limit = 7) {
  const platformByDay = new Map(
    platformSeries.map((row) => [String(row.activity_day ?? ""), row])
  );
  const merged = [];
  for (const growthRow of growthSeries) {
    const day = String(growthRow.activity_day ?? "");
    if (!day) continue;
    const platformRow = platformByDay.get(day) || {};
    merged.push({
      activity_day: day,
      activity_day_label: formatActivityDayLabel(day),
      dau_visitors: growthRow.dau_visitors,
      wau_visitors: growthRow.wau_visitors,
      mau_visitors: growthRow.mau_visitors,
      new_visitors: growthRow.new_visitors,
      returning_visitors: growthRow.returning_visitors,
      total_sessions: platformRow.total_sessions,
      conversations: platformRow.conversations,
      questions: platformRow.questions,
      recommendations_shown: platformRow.recommendations_shown,
      crescimento_dau_visitors_pct: growthRow.crescimento_dau_visitors_pct,
    });
    if (merged.length >= limit) break;
  }
  return merged;
}

/**
 * @param {Record<string, unknown>|null|undefined} temporal
 * @param {{
 *   snapshotPlatform?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 *   snapshotConversation?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 * }} [context]
 */
export function mapTemporalMetricsToFounderSessionsUsers(temporal, context = {}) {
  const growthSeries = Array.isArray(temporal?.growth?.series) ? temporal.growth.series : [];
  const platformSeries = Array.isArray(temporal?.platform_activity?.series)
    ? temporal.platform_activity.series
    : [];
  const partialErrors = Array.isArray(temporal?.partial_errors) ? temporal.partial_errors : [];
  const hasGrowth = temporal?.growth != null;
  const hasPlatform = temporal?.platform_activity != null;
  const latestGrowth = growthSeries[0] || null;
  const latestPlatform = platformSeries[0] || null;
  const referenceDay = latestGrowth?.activity_day ?? latestPlatform?.activity_day ?? null;

  let status = "success";
  if (!temporal) {
    status = "error";
  } else if (!hasGrowth && !hasPlatform) {
    status = "error";
  } else if (partialErrors.length > 0 || !hasGrowth || !hasPlatform) {
    status = "partial";
  } else if (!growthSeries.length && !platformSeries.length) {
    status = "empty";
  }

  const rollingMetrics = [
    { id: "dau_visitors", label: "DAU visitantes", value: latestGrowth?.dau_visitors, format: "number" },
    { id: "dau_users", label: "DAU usuários", value: latestGrowth?.dau_users, format: "number" },
    { id: "wau_visitors", label: "WAU visitantes", value: latestGrowth?.wau_visitors, format: "number" },
    { id: "wau_users", label: "WAU usuários", value: latestGrowth?.wau_users, format: "number" },
    { id: "mau_visitors", label: "MAU visitantes", value: latestGrowth?.mau_visitors, format: "number" },
    { id: "mau_users", label: "MAU usuários", value: latestGrowth?.mau_users, format: "number" },
  ];

  const audienceMetrics = [
    { id: "new_visitors", label: "Novos visitantes", value: latestGrowth?.new_visitors, format: "number" },
    {
      id: "returning_visitors",
      label: "Visitantes recorrentes",
      value: latestGrowth?.returning_visitors,
      format: "number",
    },
    {
      id: "anonymous_visitors",
      label: "Visitantes anônimos",
      value: latestGrowth?.anonymous_visitors,
      format: "number",
    },
    {
      id: "authenticated_users",
      label: "Usuários autenticados",
      value: latestGrowth?.authenticated_users,
      format: "number",
    },
    {
      id: "taxa_autenticacao",
      label: "Taxa de autenticação",
      value: latestGrowth?.taxa_autenticacao,
      format: "rate",
    },
  ];

  const activityMetrics = [
    {
      id: "total_sessions",
      label: "Sessões (último dia)",
      value: latestPlatform?.total_sessions,
      format: "number",
    },
    {
      id: "conversations",
      label: "Conversas (último dia)",
      value: latestPlatform?.conversations,
      format: "number",
    },
    {
      id: "questions",
      label: "Perguntas (último dia)",
      value: latestPlatform?.questions,
      format: "number",
    },
    {
      id: "recommendations_shown",
      label: "Recomendações exibidas (último dia)",
      value: latestPlatform?.recommendations_shown,
      format: "number",
    },
  ];

  const trends = [
    {
      id: "crescimento_dau",
      label: "Crescimento diário (DAU visitantes)",
      scope: "daily",
      pct: latestGrowth?.crescimento_dau_visitors_pct,
      direction: classifyTrendDirection(latestGrowth?.crescimento_dau_visitors_pct),
    },
    {
      id: "crescimento_wau",
      label: "Crescimento semanal (WAU visitantes)",
      scope: "weekly",
      pct: latestGrowth?.crescimento_wau_visitors_pct,
      direction: classifyTrendDirection(latestGrowth?.crescimento_wau_visitors_pct),
    },
    {
      id: "crescimento_mau",
      label: "Crescimento mensal (MAU visitantes)",
      scope: "monthly",
      pct: latestGrowth?.crescimento_mau_visitors_pct,
      direction: classifyTrendDirection(latestGrowth?.crescimento_mau_visitors_pct),
    },
  ].map((trend) => ({
    ...trend,
    pctFormatted: formatTrendPercent(trend.pct),
    directionLabel: formatTrendDirectionLabel(trend.direction),
  }));

  const recentDays = mergeTemporalDailyRows(growthSeries, platformSeries, 7).map((row) => ({
    ...row,
    dau_visitors_formatted: formatPublicMetricNumber(row.dau_visitors),
    wau_visitors_formatted: formatPublicMetricNumber(row.wau_visitors),
    mau_visitors_formatted: formatPublicMetricNumber(row.mau_visitors),
    total_sessions_formatted: formatPublicMetricNumber(row.total_sessions),
    questions_formatted: formatPublicMetricNumber(row.questions),
    crescimento_dau_formatted: formatTrendPercent(row.crescimento_dau_visitors_pct),
  }));

  const snapshotPlatform = context.snapshotPlatform?.metrics || [];
  const snapshotConversation = context.snapshotConversation?.metrics || [];
  const snapshotReference = [
    ...snapshotPlatform.filter((m) =>
      ["sessions", "visitors", "conversations", "questions"].includes(m.id)
    ),
    ...snapshotConversation.filter((m) => ["recommendations_shown"].includes(m.id)),
  ].map((m) => ({
    ...m,
    source: "executive-metrics snapshot",
    hint: "Total acumulado na janela do período selecionado — distinto da visão diária temporal.",
  }));

  return {
    meta: {
      display_version: FOUNDER_GROWTH_DISPLAY_VERSION,
      temporal_version: temporal?.temporal_version ?? null,
      reference_period_days: temporal?.reference_period_days ?? null,
      computed_at: temporal?.computed_at ?? null,
      reference_day: referenceDay,
      reference_day_label: formatActivityDayLabel(referenceDay),
      status,
      partial_errors: partialErrors,
      groups_loaded: {
        growth: hasGrowth,
        platform_activity: hasPlatform,
      },
    },
    rollingMetrics,
    audienceMetrics,
    activityMetrics,
    trends,
    recentDays,
    snapshotReference,
  };
}

export const FOUNDER_GROWTH_FORBIDDEN_PATTERNS = [
  /visitor_id/i,
  /conversation_id/i,
  /request_id/i,
  /query_text/i,
  /user_email/i,
  /@gmail/i,
];

/**
 * @param {string} text
 */
export function scanFounderGrowthForbiddenContent(text = "") {
  const hits = [];
  for (const pattern of FOUNDER_GROWTH_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) hits.push(String(pattern));
  }
  return hits;
}
