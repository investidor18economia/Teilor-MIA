/**
 * PATCH 4A.1 — Semantic Decision Bridge
 *
 * Builds structured SemanticDecisionUnits from interpreted pool candidates.
 * Preserves interpreted meaning before any legacy compaction.
 */

import {
  SEMANTIC_CONFIDENCE,
  SEMANTIC_CONDITIONALITY,
  SEMANTIC_DECISION_ROLE,
  SEMANTIC_DIRECTION,
  SEMANTIC_EVIDENCE_SOURCE,
  SEMANTIC_EVIDENCE_TYPE,
  SEMANTIC_INTENSITY,
  SEMANTIC_PRIORITY_RELEVANCE,
  createSemanticDecisionUnit,
  createSemanticEvidence,
  createSemanticImplication,
  createSemanticPriority,
} from "./miaSemanticDecisionContract.js";

const PRODUCER_LAYER = "miaSemanticDecisionBridge";

const FAMILY_IMPLICATION_MAP = Object.freeze({
  camera_video_confidence: {
    effectKey: "consistent_capture_results",
    effectKind: "capture_experience",
    scope: "photo_and_video_use",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  performance_longevity: {
    effectKey: "sustained_daily_performance",
    effectKind: "performance",
    scope: "demanding_daily_use",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  battery_autonomy: {
    effectKey: "extended_off_grid_autonomy",
    effectKind: "autonomy",
    scope: "daily_usage",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  ecosystem_software: {
    effectKey: "predictable_platform_experience",
    effectKind: "platform_experience",
    scope: "daily_ecosystem_use",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  display_smoothness: {
    effectKey: "greater_visual_responsiveness",
    effectKind: "usage_experience",
    scope: "interface_navigation",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  charging_speed: {
    effectKey: "slower_recharge_cycle",
    effectKind: "convenience",
    scope: "recharge_routine",
    direction: SEMANTIC_DIRECTION.NEGATIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  price_value_risk: {
    effectKey: "higher_relative_cost",
    effectKind: "commercial_value",
    scope: "purchase_decision",
    direction: SEMANTIC_DIRECTION.NEGATIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  durability_reliability: {
    effectKey: "extended_service_life",
    effectKind: "durability",
    scope: "long_term_ownership",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  size_capacity: {
    effectKey: "adequate_capacity_for_intended_use",
    effectKind: "capacity",
    scope: "intended_workload",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  maintenance_cleaning: {
    effectKey: "lower_maintenance_burden",
    effectKind: "maintenance",
    scope: "ongoing_care",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  portability: {
    effectKey: "balanced_portability",
    effectKind: "portability",
    scope: "transport_use",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  comfort_usability: {
    effectKey: "improved_usability_comfort",
    effectKind: "usability",
    scope: "extended_use",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.MODERATE,
  },
  generic_fit: {
    effectKey: "profile_aligned_benefit",
    effectKind: "general",
    scope: "general_use",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    intensity: SEMANTIC_INTENSITY.LOW,
  },
});

const TEXT_EFFECT_HINTS = Object.freeze([
  [/fluid|fluidez|navega|responsiv|refresh|hz/i, "greater_visual_responsiveness", "interface_navigation"],
  [/bateria|autonomia|recarga|tomada|durar/i, "extended_off_grid_autonomy", "daily_usage"],
  [/camera|câmera|camara|foto|video|vídeo|gravar/i, "consistent_capture_results", "photo_and_video_use"],
  [/desempenho|performance|limite|pesado|multitarefa/i, "sustained_daily_performance", "demanding_daily_use"],
  [/ecossistema|software|sistema|apps|previsib/i, "predictable_platform_experience", "daily_ecosystem_use"],
  [/preço|preco|custo|caro|barato|valor/i, "higher_relative_cost", "purchase_decision"],
  [/capacidade|volume|litros|storage|interno/i, "adequate_capacity_for_intended_use", "intended_workload"],
  [/limpeza|manuten|filtro/i, "lower_maintenance_burden", "ongoing_care"],
  [/portabil|peso|transport|mochila/i, "balanced_portability", "transport_use"],
  [/ruido|noise|silenc/i, "lower_operating_noise", "ambient_comfort"],
  [/painel|tela|display|screen/i, "improved_display_experience", "viewing_experience"],
]);

const AXIS_PRIORITY_HINTS = Object.freeze({
  battery: { deprioritize: ["display_smoothness", "charging_speed"], reasonCode: "user_prioritizes_battery" },
  screen: { deprioritize: ["battery_autonomy"], reasonCode: "user_prioritizes_display" },
  performance: { deprioritize: ["price_value_risk"], reasonCode: "user_prioritizes_performance" },
  camera: { deprioritize: ["display_smoothness"], reasonCode: "user_prioritizes_camera" },
  value: { deprioritize: ["price_value_risk"], reasonCode: "user_prioritizes_value" },
  storage: { deprioritize: ["size_capacity"], reasonCode: "user_prioritizes_capacity" },
  comfort: { deprioritize: ["portability"], reasonCode: "user_prioritizes_comfort" },
  longevity: { deprioritize: ["price_value_risk"], reasonCode: "user_prioritizes_longevity" },
});

const USER_PRIORITY_PHRASES = Object.freeze([
  ["user_prioritizes_battery", /bateria|autonomia|tomada|recarga|fora de casa|procurando tomada|aguente bastante/i],
  ["user_prioritizes_display", /tela|display|fluid|hz|painel|visual/i],
  ["user_prioritizes_camera", /camera|câmera|camara|foto|video|vídeo|selfie/i],
  ["user_prioritizes_performance", /desempenho|performance|rapido|rápido|pesado|multitarefa|travar/i],
  ["user_prioritizes_value", /barato|preco|preço|orcamento|orçamento|econom/i],
  ["user_prioritizes_capacity", /capacidade|storage|armazen|litros|volume/i],
  ["user_prioritizes_comfort", /conforto|ergonom|silenc|ruido|ruído/i],
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inferEvidenceType(item = {}) {
  if (item.type === "weakness") return SEMANTIC_EVIDENCE_TYPE.COMPARATIVE;
  if (item.type === "routing") return SEMANTIC_EVIDENCE_TYPE.INTERPRETIVE;
  if (item.token) return SEMANTIC_EVIDENCE_TYPE.FACTUAL;
  return SEMANTIC_EVIDENCE_TYPE.INTERPRETIVE;
}

function inferEvidenceSource(item = {}) {
  if (item.type === "routing") return SEMANTIC_EVIDENCE_SOURCE.ROUTING;
  if (item.field === "strengths" || item.field === "weaknesses") {
    return SEMANTIC_EVIDENCE_SOURCE.DATA_LAYER;
  }
  if (item.token) return SEMANTIC_EVIDENCE_SOURCE.DATA_LAYER;
  return SEMANTIC_EVIDENCE_SOURCE.UNKNOWN;
}

function inferImplicationFromText(text = "", family = "generic_fit") {
  const mapped = FAMILY_IMPLICATION_MAP[family];
  if (mapped) return { ...mapped };

  for (const [pattern, effectKey, scope] of TEXT_EFFECT_HINTS) {
    if (pattern.test(text)) {
      return {
        effectKey,
        effectKind: "general",
        scope,
        direction: SEMANTIC_DIRECTION.POSITIVE,
        intensity: SEMANTIC_INTENSITY.MODERATE,
      };
    }
  }

  return { ...FAMILY_IMPLICATION_MAP.generic_fit };
}

export function inferUserPriorityReasonCode(userText = "") {
  const body = cleanText(userText);
  if (!body) return null;
  for (const [code, pattern] of USER_PRIORITY_PHRASES) {
    if (pattern.test(body)) return code;
  }
  return null;
}

export function inferPriorityForImplication(implicationMeta, context = {}) {
  const family = cleanText(context.family || "");
  const primaryAxis = cleanText(context.primaryAxis || "");
  const userPhrase = cleanText(context.userPriorityPhrase || "");
  const reasonFromPhrase = inferUserPriorityReasonCode(userPhrase);
  const axisHint = AXIS_PRIORITY_HINTS[primaryAxis];

  let relevance = SEMANTIC_PRIORITY_RELEVANCE.SECONDARY;
  let reasonCode = reasonFromPhrase || axisHint?.reasonCode || null;
  let conditionality = SEMANTIC_CONDITIONALITY.UNIVERSAL;

  if (axisHint?.deprioritize?.includes(family)) {
    relevance = SEMANTIC_PRIORITY_RELEVANCE.TERTIARY;
    conditionality = SEMANTIC_CONDITIONALITY.PRIORITY_DEPENDENT;
  }

  if (primaryAxis && family.includes(primaryAxis.split("_")[0])) {
    relevance = SEMANTIC_PRIORITY_RELEVANCE.PRIMARY;
  }

  if (context.decisionRole === SEMANTIC_DECISION_ROLE.PRIMARY_GAIN) {
    relevance = SEMANTIC_PRIORITY_RELEVANCE.PRIMARY;
  }

  return createSemanticPriority({
    targetId: context.implicationId,
    targetKind: "implication",
    relevance,
    reasonCode,
    reasonText: userPhrase || null,
    confidence:
      reasonCode || primaryAxis ? SEMANTIC_CONFIDENCE.MEDIUM : SEMANTIC_CONFIDENCE.LOW,
  });
}

/**
 * @param {{ text?: string, family?: string, type?: string, token?: string, field?: string }} item
 * @param {{ primaryAxis?: string, category?: string, productName?: string, userPriorityPhrase?: string, decisionRole?: string }} context
 */
export function buildSemanticDecisionUnitFromPoolItem(item = {}, context = {}) {
  const interpretedText = cleanText(item.text);
  const family = cleanText(item.family || "generic_fit");
  const implicationMeta = inferImplicationFromText(interpretedText, family);

  const evidence = createSemanticEvidence({
    type: inferEvidenceType(item),
    source: inferEvidenceSource(item),
    dimension: family,
    sourceToken: item.token || null,
    rawValue: item.token || null,
    interpretedText,
    confidence: item.token ? SEMANTIC_CONFIDENCE.HIGH : SEMANTIC_CONFIDENCE.MEDIUM,
    productName: context.productName || null,
    category: context.category || null,
    producerLayer: PRODUCER_LAYER,
    available: !!interpretedText,
  });

  const implication = createSemanticImplication({
    evidenceIds: [evidence.id],
    effectKey: implicationMeta.effectKey,
    effectKind: implicationMeta.effectKind,
    scope: implicationMeta.scope,
    direction: implicationMeta.direction,
    intensity: implicationMeta.intensity,
    confidence: evidence.confidence,
    conditionality:
      context.primaryAxis && AXIS_PRIORITY_HINTS[context.primaryAxis]?.deprioritize?.includes(family)
        ? SEMANTIC_CONDITIONALITY.PRIORITY_DEPENDENT
        : SEMANTIC_CONDITIONALITY.UNIVERSAL,
    producerLayer: PRODUCER_LAYER,
    interpretedSourceText: interpretedText,
  });

  const priority = inferPriorityForImplication(implicationMeta, {
    ...context,
    family,
    implicationId: implication.id,
  });

  return createSemanticDecisionUnit({
    evidence,
    implication,
    priority,
    decisionRole: context.decisionRole || SEMANTIC_DECISION_ROLE.SECONDARY_GAIN,
  });
}

/**
 * @param {{ text?: string, family?: string, type?: string, token?: string, field?: string }} item
 * @param {{ primaryAxis?: string, category?: string, productName?: string, userPriorityPhrase?: string }} context
 */
export function buildSemanticDecisionUnitFromWeaknessPoolItem(item = {}, context = {}) {
  const unit = buildSemanticDecisionUnitFromPoolItem(
    { ...item, type: item.type || "weakness" },
    {
      ...context,
      decisionRole: SEMANTIC_DECISION_ROLE.TRADEOFF,
    }
  );

  if (unit?.implication) {
    unit.implication.direction = SEMANTIC_DIRECTION.NEGATIVE;
  }
  unit.decisionRole = SEMANTIC_DECISION_ROLE.TRADEOFF;
  return unit;
}

export function buildSemanticDecisionUnitsFromPoolItems(items = [], context = {}) {
  return items
    .map((item) => buildSemanticDecisionUnitFromPoolItem(item, context))
    .filter(Boolean);
}
