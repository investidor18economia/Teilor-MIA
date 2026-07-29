/**
 * PATCH C.4 — Executive Trend rules (C.4.0).
 * Deterministic classification — no LLM · no fetch.
 */

import {
  EXECUTIVE_TREND_DIRECTIONS,
  EXECUTIVE_TREND_TYPES,
  EXECUTIVE_TREND_STATUSES,
  EXECUTIVE_TREND_MAGNITUDES,
  EXECUTIVE_TREND_SEMANTICS,
  EXECUTIVE_TREND_CONFIDENCE_LEVELS,
  EXECUTIVE_TREND_MAGNITUDE_THRESHOLDS_PCT,
  EXECUTIVE_TREND_MAGNITUDE_THRESHOLDS_RATE,
  EXECUTIVE_TREND_CONFIRMED_MIN_PCT,
  EXECUTIVE_TREND_CONFIRMED_MIN_RATE_DELTA,
  EXECUTIVE_TREND_MIN_OBSERVATIONS_PERSISTENCE,
  EXECUTIVE_TREND_MAGNITUDE_LABELS,
  EXECUTIVE_TREND_INTERPRETATION_TEMPLATES,
  EXECUTIVE_TREND_CAUSALITY_BLOCKLIST,
} from "./miaExecutiveTrendCatalog.js";

export function classifyTrendDirectionFromDelta(value, threshold = EXECUTIVE_TREND_CONFIRMED_MIN_PCT) {
  if (value == null || !Number.isFinite(Number(value))) return EXECUTIVE_TREND_DIRECTIONS.UNKNOWN;
  const n = Number(value);
  if (Math.abs(n) < threshold) return EXECUTIVE_TREND_DIRECTIONS.STABLE;
  return n > 0 ? EXECUTIVE_TREND_DIRECTIONS.UP : EXECUTIVE_TREND_DIRECTIONS.DOWN;
}

export function normalizeViewDirection(direction) {
  if (direction === "up" || direction === "down" || direction === "stable") return direction;
  if (direction === "accelerating") return EXECUTIVE_TREND_DIRECTIONS.UP;
  if (direction === "decelerating") return EXECUTIVE_TREND_DIRECTIONS.DOWN;
  return EXECUTIVE_TREND_DIRECTIONS.UNKNOWN;
}

export function classifyTrendMagnitude(absValue, kind = "pct") {
  if (absValue == null || !Number.isFinite(Number(absValue))) {
    return EXECUTIVE_TREND_MAGNITUDES.UNKNOWN;
  }
  const n = Math.abs(Number(absValue));
  const thresholds =
    kind === "rate_delta"
      ? EXECUTIVE_TREND_MAGNITUDE_THRESHOLDS_RATE
      : EXECUTIVE_TREND_MAGNITUDE_THRESHOLDS_PCT;

  if (n < thresholds.negligible) return EXECUTIVE_TREND_MAGNITUDES.NEGLIGIBLE;
  if (n < thresholds.small) return EXECUTIVE_TREND_MAGNITUDES.SMALL;
  if (n < thresholds.moderate) return EXECUTIVE_TREND_MAGNITUDES.MODERATE;
  return EXECUTIVE_TREND_MAGNITUDES.STRONG;
}

export function classifyTrendType(direction, semantics, status, acceleration = null) {
  if (status === EXECUTIVE_TREND_STATUSES.INSUFFICIENT) {
    return EXECUTIVE_TREND_TYPES.INSUFFICIENT_DATA;
  }
  if (status === EXECUTIVE_TREND_STATUSES.PRELIMINARY) {
    return EXECUTIVE_TREND_TYPES.PRELIMINARY_SIGNAL;
  }
  if (acceleration === "accelerating") return EXECUTIVE_TREND_TYPES.ACCELERATION;
  if (acceleration === "decelerating") return EXECUTIVE_TREND_TYPES.DECELERATION;

  if (direction === EXECUTIVE_TREND_DIRECTIONS.STABLE) return EXECUTIVE_TREND_TYPES.STABILITY;
  if (direction === EXECUTIVE_TREND_DIRECTIONS.UP) return EXECUTIVE_TREND_TYPES.GROWTH;
  if (direction === EXECUTIVE_TREND_DIRECTIONS.DOWN) return EXECUTIVE_TREND_TYPES.DECLINE;
  return EXECUTIVE_TREND_TYPES.INSUFFICIENT_DATA;
}

export function classifyTrendStatus(signal) {
  if (!signal.module_available) {
    return { status: EXECUTIVE_TREND_STATUSES.INSUFFICIENT, limitations: ["module_unavailable"] };
  }
  if (!signal.period_compare_available) {
    return { status: EXECUTIVE_TREND_STATUSES.INSUFFICIENT, limitations: ["no_period_compare"] };
  }
  if (signal.low_volume) {
    return { status: EXECUTIVE_TREND_STATUSES.PRELIMINARY, limitations: ["low_volume"] };
  }
  if (signal.direction === EXECUTIVE_TREND_DIRECTIONS.UNKNOWN) {
    return { status: EXECUTIVE_TREND_STATUSES.INSUFFICIENT, limitations: ["direction_unknown"] };
  }

  const minDelta =
    signal.kind === "rate_delta"
      ? EXECUTIVE_TREND_CONFIRMED_MIN_RATE_DELTA
      : EXECUTIVE_TREND_CONFIRMED_MIN_PCT;

  const delta = signal.relative_change ?? signal.absolute_change;

  if (signal.kind === "acceleration") {
    if (signal.acceleration === "unknown" || signal.acceleration == null) {
      return { status: EXECUTIVE_TREND_STATUSES.INSUFFICIENT, limitations: ["acceleration_unknown"] };
    }
    return { status: EXECUTIVE_TREND_STATUSES.CONFIRMED, limitations: signal.partial_module ? ["partial_module"] : [] };
  }

  if (delta == null || !Number.isFinite(Number(delta))) {
    return { status: EXECUTIVE_TREND_STATUSES.INSUFFICIENT, limitations: ["missing_delta"] };
  }
  if (Math.abs(Number(delta)) < minDelta && signal.direction === EXECUTIVE_TREND_DIRECTIONS.STABLE) {
    return { status: EXECUTIVE_TREND_STATUSES.CONFIRMED, limitations: signal.partial_module ? ["partial_module"] : [] };
  }
  if (Math.abs(Number(delta)) < minDelta) {
    return { status: EXECUTIVE_TREND_STATUSES.PRELIMINARY, limitations: ["magnitude_below_confirmed_threshold"] };
  }

  if (signal.observations_count != null && signal.observations_count < 2) {
    return { status: EXECUTIVE_TREND_STATUSES.INSUFFICIENT, limitations: ["insufficient_observations"] };
  }

  return { status: EXECUTIVE_TREND_STATUSES.CONFIRMED, limitations: signal.partial_module ? ["partial_module"] : [] };
}

export function classifyTrendConfidence(status, magnitude, limitations = [], periodCompare = true) {
  const factors = [];
  const lims = [...limitations];

  if (status === EXECUTIVE_TREND_STATUSES.INSUFFICIENT || !periodCompare) {
    return {
      level: EXECUTIVE_TREND_CONFIDENCE_LEVELS.INSUFFICIENT,
      factors: ["Evidência temporal insuficiente."],
      limitations: lims.length ? lims : ["no_period_compare"],
      modules_available: null,
      modules_total: null,
    };
  }

  let level = EXECUTIVE_TREND_CONFIDENCE_LEVELS.MODERATE;
  factors.push("Comparativo de período disponível.");

  if (status === EXECUTIVE_TREND_STATUSES.CONFIRMED) {
    if (
      magnitude === EXECUTIVE_TREND_MAGNITUDES.MODERATE ||
      magnitude === EXECUTIVE_TREND_MAGNITUDES.STRONG
    ) {
      level = EXECUTIVE_TREND_CONFIDENCE_LEVELS.HIGH;
      factors.push("Magnitude relevante para classificação confirmada.");
    }
  } else if (status === EXECUTIVE_TREND_STATUSES.PRELIMINARY) {
    level = EXECUTIVE_TREND_CONFIDENCE_LEVELS.LOW;
    lims.push("Sinal preliminar — tendência não confirmada.");
  }

  if (lims.includes("partial_module")) {
    if (level === EXECUTIVE_TREND_CONFIDENCE_LEVELS.HIGH) level = EXECUTIVE_TREND_CONFIDENCE_LEVELS.MODERATE;
    else if (level === EXECUTIVE_TREND_CONFIDENCE_LEVELS.MODERATE) level = EXECUTIVE_TREND_CONFIDENCE_LEVELS.LOW;
  }

  return { level, factors, limitations: lims, modules_available: null, modules_total: null };
}

export function buildTrendInterpretation(record) {
  const magnitudeLabel = EXECUTIVE_TREND_MAGNITUDE_LABELS[record.magnitude] ?? "indeterminada";
  const periodLabel = record.period?.range ?? record.period_label ?? "período atual";

  let template;
  if (record.trend_type === EXECUTIVE_TREND_TYPES.ACCELERATION) {
    template = EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.acceleration;
  } else if (record.trend_type === EXECUTIVE_TREND_TYPES.DECELERATION) {
    template = EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.deceleration;
  } else if (record.status === EXECUTIVE_TREND_STATUSES.PRELIMINARY) {
    template = EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.preliminary;
  } else if (record.status === EXECUTIVE_TREND_STATUSES.INSUFFICIENT) {
    return EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.insufficient;
  } else if (record.direction === EXECUTIVE_TREND_DIRECTIONS.STABLE) {
    template = EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.confirmed_stable;
  } else if (record.direction === EXECUTIVE_TREND_DIRECTIONS.UP) {
    template = EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.confirmed_up;
  } else if (record.direction === EXECUTIVE_TREND_DIRECTIONS.DOWN) {
    template = EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.confirmed_down;
  } else {
    return EXECUTIVE_TREND_INTERPRETATION_TEMPLATES.insufficient;
  }

  return template
    .replace("{metric_label}", record.metric_label)
    .replace("{magnitude_label}", magnitudeLabel)
    .replace("{period_label}", periodLabel);
}

export function containsCausalLanguage(text) {
  return EXECUTIVE_TREND_CAUSALITY_BLOCKLIST.some((re) => re.test(text));
}

export function blockedTrendTypeResult(type) {
  return {
    trend_type: type,
    status: EXECUTIVE_TREND_STATUSES.INSUFFICIENT,
    direction: EXECUTIVE_TREND_DIRECTIONS.UNKNOWN,
    limitations: [
      `Tipo ${type} requer ${EXECUTIVE_TREND_MIN_OBSERVATIONS_PERSISTENCE}+ observações temporais — Baseline B oferece comparativo de 2 períodos.`,
    ],
  };
}

export function describeExecutiveRelevance(direction, semantics) {
  if (semantics === EXECUTIVE_TREND_SEMANTICS.NEUTRAL) return "relevância executiva neutra";
  if (semantics === EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER) {
    if (direction === EXECUTIVE_TREND_DIRECTIONS.UP) return "alta observada — métrica de maior-is-melhor";
    if (direction === EXECUTIVE_TREND_DIRECTIONS.DOWN) return "queda observada — métrica de maior-is-melhor";
  }
  if (semantics === EXECUTIVE_TREND_SEMANTICS.LOWER_IS_BETTER) {
    if (direction === EXECUTIVE_TREND_DIRECTIONS.DOWN) return "queda observada — métrica de menor-is-melhor";
    if (direction === EXECUTIVE_TREND_DIRECTIONS.UP) return "alta observada — métrica de menor-is-melhor";
  }
  return "relevância executiva registrada no catálogo";
}
