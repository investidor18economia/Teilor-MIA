/**
 * PATCH 4A.8 — Contextual Priority Engine
 *
 * Deterministic, explainable criterion weighting from structured context.
 * Never generates user text. Never manipulates product ranking or winner.
 */

import {
  buildUserPriorityWeightingModel,
  isPriorityWeightingTraceable,
} from "./miaUserPriorityWeightingEngine.js";
import { isPersonalAdaptationTraceable } from "./miaPersonalDecisionAdaptationLayer.js";
import { buildStructuredDecisionFacts } from "./miaStructuredDecisionFacts.js";
import { SEMANTIC_DECISION_ROLE } from "./miaSemanticDecisionContract.js";

export const CONTEXTUAL_PRIORITY_ENGINE_VERSION = "4A.10.0";

export const PRIORITY_CRITERION = Object.freeze({
  BATTERY: "battery",
  PROCESSOR: "processor",
  CAMERA: "camera",
  SCREEN: "screen",
  CHARGING: "charging",
  PROTECTION: "protection",
  MEMORY: "memory",
  VALUE: "value",
  COMFORT: "comfort",
  LONGEVITY: "longevity",
});

export const PRIORITY_ORIGIN = Object.freeze({
  DEFAULT: "default",
  EXPLICIT_USER: "explicit_user",
  SESSION_SHIFT: "session_shift",
  PRIORITY_CLASS: "priority_class",
  PRIMARY_AXIS: "primary_axis",
  PROFILE: "profile",
  QUERY_SIGNAL: "query_signal",
  KNOWLEDGE: "knowledge",
});

export const CATEGORY_CRITERIA = Object.freeze({
  mobile: [
    PRIORITY_CRITERION.BATTERY,
    PRIORITY_CRITERION.PROCESSOR,
    PRIORITY_CRITERION.CAMERA,
    PRIORITY_CRITERION.SCREEN,
    PRIORITY_CRITERION.CHARGING,
    PRIORITY_CRITERION.PROTECTION,
    PRIORITY_CRITERION.MEMORY,
    PRIORITY_CRITERION.VALUE,
  ],
  notebook: [
    PRIORITY_CRITERION.PROCESSOR,
    PRIORITY_CRITERION.MEMORY,
    PRIORITY_CRITERION.SCREEN,
    PRIORITY_CRITERION.BATTERY,
    PRIORITY_CRITERION.COMFORT,
    PRIORITY_CRITERION.VALUE,
    PRIORITY_CRITERION.PROTECTION,
  ],
  default: [
    PRIORITY_CRITERION.BATTERY,
    PRIORITY_CRITERION.PROCESSOR,
    PRIORITY_CRITERION.CAMERA,
    PRIORITY_CRITERION.SCREEN,
    PRIORITY_CRITERION.VALUE,
  ],
});

const AXIS_TO_CRITERION = Object.freeze({
  battery: PRIORITY_CRITERION.BATTERY,
  performance: PRIORITY_CRITERION.PROCESSOR,
  camera: PRIORITY_CRITERION.CAMERA,
  screen: PRIORITY_CRITERION.SCREEN,
  value: PRIORITY_CRITERION.VALUE,
  longevity: PRIORITY_CRITERION.LONGEVITY,
  comfort: PRIORITY_CRITERION.COMFORT,
  storage: PRIORITY_CRITERION.MEMORY,
  desempenho: PRIORITY_CRITERION.PROCESSOR,
  preco: PRIORITY_CRITERION.VALUE,
});

const PRIORITY_CLASS_CRITERION_BOOSTS = Object.freeze({
  performance_priority: { processor: 0.24, screen: 0.08 },
  cost_priority: { value: 0.28 },
  longevity_priority: { longevity: 0.22, protection: 0.12 },
  comfort_priority: { comfort: 0.2, screen: 0.06 },
  convenience_priority: { battery: 0.22, charging: 0.1 },
  reliability_priority: { protection: 0.18, longevity: 0.1 },
  confidence_priority: { camera: 0.22 },
  anti_regret_priority: { longevity: 0.12, protection: 0.1, value: 0.06 },
  practicality_priority: { value: 0.12, battery: 0.08 },
  learning_priority: { processor: 0.1, screen: 0.08, memory: 0.06 },
  ownership_priority: { longevity: 0.16, protection: 0.08 },
  risk_priority: { protection: 0.14, value: 0.08 },
});

const PROFILE_CRITERION_NUDGE = Object.freeze({
  performance_seeking: { processor: 0.06 },
  value_seeking: { value: 0.08 },
  stability_seeking: { longevity: 0.06, protection: 0.04 },
  anti_regret_seeking: { longevity: 0.05, protection: 0.04 },
  simplicity_seeking: { battery: 0.04, value: 0.04 },
  security_seeking: { protection: 0.06 },
  optimization_seeking: { processor: 0.04, memory: 0.04 },
});

const UNIT_CRITERION_HINTS = Object.freeze([
  { pattern: /battery|autonom|recarga|energia|mah/i, criterion: PRIORITY_CRITERION.BATTERY },
  { pattern: /performance|desempenho|processador|chip|multitarefa|fluidez|fps|gamer/i, criterion: PRIORITY_CRITERION.PROCESSOR },
  { pattern: /camera|c[aâ]mera|foto|video|v[ií]deo|captur|registr/i, criterion: PRIORITY_CRITERION.CAMERA },
  { pattern: /screen|tela|display|visual|refresh|hz|brilho/i, criterion: PRIORITY_CRITERION.SCREEN },
  { pattern: /charg|carreg/i, criterion: PRIORITY_CRITERION.CHARGING },
  { pattern: /protect|prote[cç]|durabil|ip\d|resist/i, criterion: PRIORITY_CRITERION.PROTECTION },
  { pattern: /memory|mem[oó]ria|ram|storage|armaz|capacidade/i, criterion: PRIORITY_CRITERION.MEMORY },
  { pattern: /cost|pre[cç]o|custo|value|barato|caro/i, criterion: PRIORITY_CRITERION.VALUE },
  { pattern: /comfort|confort|ergon|peso|leve/i, criterion: PRIORITY_CRITERION.COMFORT },
  { pattern: /longev|durar|anos|longo prazo|service_life/i, criterion: PRIORITY_CRITERION.LONGEVITY },
]);

const EXPLICIT_PERSONALIZATION_ORIGINS = new Set([
  PRIORITY_ORIGIN.EXPLICIT_USER,
  PRIORITY_ORIGIN.SESSION_SHIFT,
  PRIORITY_ORIGIN.QUERY_SIGNAL,
  PRIORITY_ORIGIN.PRIORITY_CLASS,
  PRIORITY_ORIGIN.PRIMARY_AXIS,
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function resolveCategoryCriteria(category = "") {
  const key = cleanText(category).toLowerCase();
  if (key.includes("notebook") || key.includes("laptop")) return CATEGORY_CRITERIA.notebook;
  if (key.includes("mobile") || key.includes("celular") || key.includes("smartphone")) {
    return CATEGORY_CRITERIA.mobile;
  }
  return CATEGORY_CRITERIA.default;
}

function confidenceFromWeight(finalWeight = 0, hasEvidence = false) {
  if (finalWeight >= 0.28 && hasEvidence) return "high";
  if (finalWeight >= 0.18) return "medium";
  if (finalWeight >= 0.1) return "low";
  return "insufficient";
}

function buildDefaultCriteria(category = "") {
  const list = resolveCategoryCriteria(category);
  const base = clamp01(1 / Math.max(list.length, 1));
  return list.map((criterion) => ({
    criterion,
    baseWeight: base,
    contextWeight: 0,
    finalWeight: base,
    reason: "peso padrão equilibrado — sem sinal explícito de prioridade",
    confidence: "insufficient",
    origin: PRIORITY_ORIGIN.DEFAULT,
    evidenceUsed: [],
  }));
}

function applyBoosts(criteriaMap, boosts = {}, origin, reasonPrefix, evidence = []) {
  for (const [criterion, boost] of Object.entries(boosts)) {
    if (!criteriaMap.has(criterion)) continue;
    const entry = criteriaMap.get(criterion);
    entry.contextWeight = clamp01(entry.contextWeight + boost);
    entry.finalWeight = clamp01(entry.baseWeight + entry.contextWeight);
    entry.origin = origin;
    entry.reason = `${reasonPrefix}: ${criterion}`;
    entry.evidenceUsed = [...new Set([...(entry.evidenceUsed || []), ...evidence])];
    entry.confidence = confidenceFromWeight(entry.finalWeight, entry.evidenceUsed.length > 0);
  }
}

function normalizeCriteriaWeights(criteria = []) {
  const total = criteria.reduce((sum, entry) => sum + entry.finalWeight, 0) || 1;
  return criteria.map((entry) => ({
    ...entry,
    finalWeight: clamp01(entry.finalWeight / total),
  }));
}

/**
 * @param {{
 *   query?: string,
 *   category?: string,
 *   primaryAxis?: string,
 *   sessionContext?: Record<string, unknown>|null,
 *   querySignals?: Record<string, unknown>|null,
 *   priorityWeightsModel?: Record<string, unknown>|null,
 *   personalDecisionAdaptationModel?: Record<string, unknown>|null,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   searchCognition?: Record<string, unknown>|null,
 * }} input
 */
export function buildContextualPriorityModel(input = {}) {
  const category = cleanText(input.category || input.sessionContext?.lastCategory || "mobile");
  const query = cleanText(input.query || input.sessionContext?.lastQuery || "");
  const session = input.sessionContext || {};
  const primaryAxis = cleanText(
    input.primaryAxis || session.lastAxis || session.lastPriority || ""
  ).toLowerCase();

  const weightingModel =
    input.priorityWeightsModel?.priorityWeights
      ? input.priorityWeightsModel
      : buildUserPriorityWeightingModel({
          query,
          primaryAxis,
          querySignals: input.querySignals || {},
          userSignals: input.querySignals || {},
          searchCognition: input.searchCognition || {},
          context: { query, primaryAxis },
        });

  const priorityWeights = weightingModel?.priorityWeights || null;
  const criteriaList = buildDefaultCriteria(category);
  const criteriaMap = new Map(criteriaList.map((entry) => [entry.criterion, { ...entry }]));

  const adjustments = [];
  let lockedIntentionCriterion = null;

  if (primaryAxis && AXIS_TO_CRITERION[primaryAxis]) {
    const criterion = AXIS_TO_CRITERION[primaryAxis];
    applyBoosts(
      criteriaMap,
      { [criterion]: 0.2 },
      PRIORITY_ORIGIN.PRIMARY_AXIS,
      `eixo principal "${primaryAxis}"`,
      [`axis:${primaryAxis}`]
    );
    adjustments.push({ type: "primary_axis", axis: primaryAxis, criterion });
  }

  const sessionPriority = cleanText(session.lastPriority || "").toLowerCase();
  const previousPriority = cleanText(session.lastPreviousPriority || "").toLowerCase();
  if (sessionPriority && sessionPriority !== previousPriority && AXIS_TO_CRITERION[sessionPriority]) {
    const criterion = AXIS_TO_CRITERION[sessionPriority];
    applyBoosts(
      criteriaMap,
      { [criterion]: 0.18 },
      PRIORITY_ORIGIN.SESSION_SHIFT,
      `mudança de prioridade na conversa (${previousPriority || "inicial"} → ${sessionPriority})`,
      [`session:lastPriority=${sessionPriority}`, `session:lastPreviousPriority=${previousPriority || ""}`]
    );
    adjustments.push({ type: "session_shift", from: previousPriority, to: sessionPriority, criterion });
  }

  if (priorityWeights && isPriorityWeightingTraceable(weightingModel)) {
    for (const [priorityClass, weight] of Object.entries(priorityWeights.weights || {})) {
      if (weight < 0.12) continue;
      const boosts = PRIORITY_CLASS_CRITERION_BOOSTS[priorityClass];
      if (!boosts) continue;
      const scaled = {};
      for (const [criterion, boost] of Object.entries(boosts)) {
        scaled[criterion] = clamp01(boost * Math.min(weight / 0.25, 1.2));
      }
      applyBoosts(
        criteriaMap,
        scaled,
        PRIORITY_ORIGIN.PRIORITY_CLASS,
        `classe de prioridade "${priorityClass}"`,
        (priorityWeights.trace?.sources || [])
          .filter((entry) => entry.priorityClass === priorityClass)
          .map((entry) => `${entry.source}:${entry.matched}`)
      );
    }
    adjustments.push({
      type: "priority_classes",
      dominant: priorityWeights.primaryPriority,
      confidence: priorityWeights.confidence,
    });
  }

  const profileModel = input.personalDecisionAdaptationModel || null;
  const profile = profileModel?.personalDecisionProfile || null;
  const signals = input.querySignals || {};

  const batteryAutonomyQuery =
    /\b(bateria|autonomia)\s+(melhor|boa|forte|grande)\b/i.test(query) ||
    (/\b(dura|durar|segura|aguenta)\s+(mais|melhor|o dia|um dia|longe)\b/i.test(query) &&
      !/\b(anos|longo prazo|longev|varios anos|vários anos)\b/i.test(query)) ||
    /\b(longe da tomada|sem carregar|nao quero carregar|n[aã]o quero carregar|carregar toda hora|carregando toda hora|nao me deixe na mao|n[aã]o me deixe na m[aã]o)\b/i.test(
      query
    );

  const valuePriorityQuery =
    /\b(custo[\s-]?benef[ií]cio|custo beneficio|bang for buck|relacao preco|rela[cç][aã]o pre[cç]o|preco qualidade|pre[cç]o qualidade|barato q preste|nao quero gastar muito|gastar muito|smartphone decente)\b/i.test(
      query
    );

  const cameraPriorityQuery =
    /\b(camera boa|boa cam\b|foto e video|tira foto melhor|smartphone com boa cam)\b/i.test(query);

  if (batteryAutonomyQuery || signals.batteryPriority) {
    applyBoosts(
      criteriaMap,
      { battery: 0.22 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal de autonomia/bateria na consulta",
      ["signal:battery_autonomy_query"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.BATTERY;
    adjustments.push({ type: "battery_autonomy_intent", criterion: PRIORITY_CRITERION.BATTERY });
  }

  if (valuePriorityQuery || (signals.priceSensitive && /\b(custo|benef[ií]cio|barato|econom)\b/i.test(query))) {
    applyBoosts(
      criteriaMap,
      { value: 0.22 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal de custo-benefício na consulta",
      ["signal:value_priority_query"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.VALUE;
    adjustments.push({ type: "value_intent", criterion: PRIORITY_CRITERION.VALUE });
  }

  if (cameraPriorityQuery) {
    applyBoosts(
      criteriaMap,
      { camera: 0.22, screen: 0.04 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal informal de prioridade em câmera",
      ["signal:camera_priority_query"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.CAMERA;
    adjustments.push({ type: "camera_priority_query", criterion: PRIORITY_CRITERION.CAMERA });
  }

  const gamingQuery =
    /\b(gamer|jogar|jogos|jogo pesado|games|desempenho pra games|smartphone gamer)\b/i.test(query) ||
    !!signals.gaming;

  if (gamingQuery) {
    applyBoosts(
      criteriaMap,
      { processor: 0.24, screen: 0.06 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal de prioridade em jogos/desempenho",
      ["signal:gaming_query"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.PROCESSOR;
    adjustments.push({ type: "gaming_intent", criterion: PRIORITY_CRITERION.PROCESSOR });
  } else if (signals.heavyUse && !lockedIntentionCriterion) {
    applyBoosts(
      criteriaMap,
      { processor: 0.14, screen: 0.06 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal de uso intenso",
      [`signal:heavyUse=${!!signals.heavyUse}`]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.PROCESSOR;
  }
  if (signals.batteryPriority && lockedIntentionCriterion !== PRIORITY_CRITERION.BATTERY) {
    applyBoosts(
      criteriaMap,
      { battery: 0.16 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal explícito de prioridade em bateria",
      ["signal:batteryPriority"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.BATTERY;
  }
  if (/\bbateria\b.*\bprioridade\b|\bprioridade\b.*\bbateria\b|\bprioridade em bateria\b/i.test(query)) {
    applyBoosts(
      criteriaMap,
      { battery: 0.22 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "declaração explícita de prioridade em bateria",
      ["signal:explicit_battery_priority"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.BATTERY;
  }
  if (/\bc[aâ]mera\b.*\bprioridade\b|\bprioridade\b.*\bc[aâ]mera\b|\bimporta mais\b.*\bc[aâ]mera\b/i.test(query)) {
    applyBoosts(
      criteriaMap,
      { camera: 0.22 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "declaração explícita de prioridade em câmera",
      ["signal:explicit_camera_priority"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.CAMERA;
  }
  if (
    /\b(fotograf\w*|tirar fotos|foto profissional|registrar momentos|fotos profissionais)\b/i.test(
      query
    ) ||
    signals.photography ||
    signals.cameraPriority
  ) {
    applyBoosts(
      criteriaMap,
      { camera: 0.24, screen: 0.04 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal de prioridade em fotografia/câmera",
      ["signal:photography"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.CAMERA;
    adjustments.push({ type: "photography_intent", criterion: PRIORITY_CRITERION.CAMERA });
  }
  if (/\b(estudante|faculdade|universidade|escola|estudar)\b/i.test(query)) {
    applyBoosts(
      criteriaMap,
      { value: 0.2, battery: 0.06 },
      PRIORITY_ORIGIN.QUERY_SIGNAL,
      "sinal de perfil estudante / custo-benefício",
      ["signal:student"]
    );
    lockedIntentionCriterion = PRIORITY_CRITERION.VALUE;
    adjustments.push({ type: "student_intent", criterion: PRIORITY_CRITERION.VALUE });
  }

  const hasExplicitUserContext =
    Boolean(primaryAxis) ||
    Boolean(sessionPriority && sessionPriority !== previousPriority) ||
    Boolean(priorityWeights?.primaryPriority && (priorityWeights.confidence || 0) >= 0.45) ||
    Boolean(
      signals.gaming ||
        signals.heavyUse ||
        signals.batteryPriority ||
        signals.photography ||
        signals.cameraPriority
    ) ||
    Boolean(lockedIntentionCriterion) ||
    /\b(fotograf\w*|estudante|jogar|jogo|gamer|bateria|desempenho|c[aâ]mera|barato|trabalho)\b/i.test(
      query
    );

  if (profile && isPersonalAdaptationTraceable(profileModel) && hasExplicitUserContext && !lockedIntentionCriterion) {
    const style = profile.decisionStyle || "";
    const nudges = PROFILE_CRITERION_NUDGE[style] || {};
    applyBoosts(
      criteriaMap,
      nudges,
      PRIORITY_ORIGIN.PROFILE,
      `perfil decisório rastreável "${style}"`,
      (profile.trace?.sources || []).map((entry) => `${entry.source}:${entry.matched || entry.style}`)
    );
    adjustments.push({ type: "profile", style, traceable: true });
  }

  let criteria = normalizeCriteriaWeights([...criteriaMap.values()]);
  criteria.sort((a, b) => b.finalWeight - a.finalWeight);
  let dominantCriterion = criteria[0]?.criterion || null;

  if (lockedIntentionCriterion) {
    const lockedEntry = criteria.find((entry) => entry.criterion === lockedIntentionCriterion);
    if (lockedEntry) {
      dominantCriterion = lockedIntentionCriterion;
      criteria = [
        lockedEntry,
        ...criteria.filter((entry) => entry.criterion !== lockedIntentionCriterion),
      ];
      adjustments.push({
        type: "locked_intention",
        criterion: lockedIntentionCriterion,
        reason: "intenção explícita na consulta prevalece sobre eixo inferido",
      });
    }
  }

  const hasExplicitPersonalization = criteria.some(
    (entry) => EXPLICIT_PERSONALIZATION_ORIGINS.has(entry.origin) && entry.contextWeight > 0
  );
  const hasPersonalization =
    hasExplicitPersonalization ||
    criteria.some((entry) => entry.origin === PRIORITY_ORIGIN.PROFILE && entry.contextWeight > 0);
  const modelConfidence = clamp01(
    priorityWeights?.confidence ||
      (hasPersonalization ? 0.55 : 0.35) +
        (adjustments.length ? Math.min(adjustments.length * 0.08, 0.24) : 0)
  );

  return {
    version: CONTEXTUAL_PRIORITY_ENGINE_VERSION,
    category,
    primaryAxis: primaryAxis || null,
    dominantCriterion,
    criteria,
    personalized: hasExplicitPersonalization,
    conservativeFallback: !hasExplicitPersonalization,
    limitation: hasExplicitPersonalization
      ? null
      : "informação insuficiente para personalizar critérios — pesos padrão mantidos",
    confidence: modelConfidence,
    trace: {
      adjustments,
      priorityWeighting: priorityWeights
        ? {
            primaryPriority: priorityWeights.primaryPriority,
            confidence: priorityWeights.confidence,
            sourceCount: priorityWeights.trace?.sources?.length || 0,
          }
        : null,
      profileApplied: !!(profile && isPersonalAdaptationTraceable(profileModel)),
      sessionPriority,
      previousPriority,
    },
  };
}

/**
 * Infer criterion from semantic unit metadata.
 * @param {Record<string, unknown>} unit
 */
export function inferCriterionFromSemanticUnit(unit = {}) {
  const dimension = cleanText(unit?.evidence?.dimension || "");
  if (dimension && Object.values(PRIORITY_CRITERION).includes(dimension)) return dimension;

  const haystack = [
    unit?.implication?.effectKey,
    unit?.implication?.effectKind,
    unit?.implication?.scope,
    unit?.evidence?.interpretedText,
    unit?.legacy?.compactedText,
    unit?.evidence?.producerLayer,
  ]
    .filter(Boolean)
    .join(" ");

  for (const hint of UNIT_CRITERION_HINTS) {
    if (hint.pattern.test(haystack)) return hint.criterion;
  }
  return null;
}

function scoreUnitForPriority(unit = {}, model = {}) {
  const criterion = inferCriterionFromSemanticUnit(unit);
  if (!criterion) return 0;
  const entry = (model.criteria || []).find((item) => item.criterion === criterion);
  return entry?.finalWeight || 0;
}

/**
 * Reorders gain units by contextual priority weights. Does not alter unit content.
 * @param {Array} gainUnits
 * @param {ReturnType<typeof buildContextualPriorityModel>} model
 */
export function applyContextualPriorityToGainUnits(gainUnits = [], model = {}) {
  const units = Array.isArray(gainUnits) ? [...gainUnits] : [];
  if (!units.length || !model?.criteria?.length) {
    return { gainUnits: units, reordered: false };
  }

  const scored = units
    .map((unit, index) => ({
      unit,
      index,
      score: scoreUnitForPriority(unit, model),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const reordered = scored.map((entry, rank) => {
    const role =
      rank === 0
        ? SEMANTIC_DECISION_ROLE.PRIMARY_GAIN
        : rank === 1
          ? SEMANTIC_DECISION_ROLE.SECONDARY_GAIN
          : entry.unit.decisionRole || SEMANTIC_DECISION_ROLE.SUPPORTING_EVIDENCE;
    return {
      ...entry.unit,
      decisionRole: role,
      priority: {
        ...(entry.unit.priority || {}),
        relevance: rank === 0 ? "primary" : "secondary",
        reasonCode: "contextual_priority_engine",
        reasonText: model.dominantCriterion
          ? `priorizado por critério ${model.dominantCriterion}`
          : "priorização contextual",
        confidence: model.confidence >= 0.7 ? "high" : model.confidence >= 0.5 ? "medium" : "low",
        producerLayer: "miaContextualPriorityEngine",
      },
    };
  });

  return {
    gainUnits: reordered,
    reordered: scored.some((entry, idx) => entry.index !== idx),
    dominantCriterion: model.dominantCriterion,
  };
}

/**
 * Rebuilds structured facts with priority-aware gain ordering.
 * @param {Record<string, unknown>|null} structured
 * @param {ReturnType<typeof buildContextualPriorityModel>} model
 * @param {{ productName?: string, category?: string, primaryAxis?: string }} context
 */
export function applyContextualPriorityToStructuredFacts(
  structured = null,
  model = {},
  context = {}
) {
  if (!structured?.semanticUnits?.length || !model?.criteria?.length) {
    return { structuredDecisionFacts: structured, reordered: false };
  }

  const gainUnits = structured.semanticUnits.filter(
    (unit) => unit.decisionRole !== SEMANTIC_DECISION_ROLE.TRADEOFF
  );
  const sacrificeUnits =
    structured.tradeoffs?.map((entry) => entry.unit).filter(Boolean) ||
    structured.semanticUnits.filter((unit) => unit.decisionRole === SEMANTIC_DECISION_ROLE.TRADEOFF);

  const { gainUnits: prioritizedGains, reordered } = applyContextualPriorityToGainUnits(
    gainUnits,
    model
  );
  if (!reordered) {
    return { structuredDecisionFacts: structured, reordered: false };
  }

  const rebuilt = buildStructuredDecisionFacts({
    gainUnits: prioritizedGains,
    sacrificeUnits,
    productName: context.productName || structured.productName || "",
    category: context.category || structured.category || "",
    primaryAxis: context.primaryAxis || structured.primaryAxis || model.primaryAxis || "",
  });

  if (structured.legacy) {
    rebuilt.legacy = { ...structured.legacy, isPrimaryTruth: false };
  }

  return {
    structuredDecisionFacts: rebuilt,
    reordered: true,
    previousPrimaryEffectKey: structured.primaryGain?.effectKey || null,
    nextPrimaryEffectKey: rebuilt.primaryGain?.effectKey || null,
  };
}

export function contextualPriorityToTrace(model = null) {
  if (!model?.criteria?.length) return null;
  return {
    version: model.version || CONTEXTUAL_PRIORITY_ENGINE_VERSION,
    dominantCriterion: model.dominantCriterion,
    primaryAxis: model.primaryAxis,
    personalized: !!model.personalized,
    conservativeFallback: !!model.conservativeFallback,
    confidence: model.confidence,
    criteria: model.criteria.map((entry) => ({
      criterion: entry.criterion,
      finalWeight: entry.finalWeight,
      origin: entry.origin,
      confidence: entry.confidence,
    })),
    trace: model.trace || null,
  };
}

/**
 * Attach deterministic priority model to session context (no ranking changes).
 * @param {Record<string, unknown>} sessionContext
 * @param {Record<string, unknown>} input
 */
export function attachContextualPriorityToSession(sessionContext = {}, input = {}) {
  const session = { ...(sessionContext || {}) };
  const model = buildContextualPriorityModel({
    query: input.query || session.lastQuery || "",
    category: input.category || session.lastCategory || "",
    primaryAxis:
      input.primaryAxis || session.lastAxis || session.lastPriority || input.activePriority || "",
    sessionContext: session,
    querySignals: input.querySignals || {},
    priorityWeightsModel: input.priorityWeightsModel || null,
    personalDecisionAdaptationModel: input.personalDecisionAdaptationModel || null,
    trustedSpecs: input.trustedSpecs || null,
    searchCognition: input.searchCognition || null,
  });
  return {
    ...session,
    lastContextualPriorityModel: model,
  };
}

export function validateContextualPriorityModel(model = null) {
  const reasons = [];
  if (!model) reasons.push("missing_model");
  if (!Array.isArray(model?.criteria) || !model.criteria.length) reasons.push("missing_criteria");
  for (const entry of model?.criteria || []) {
    if (!entry.criterion) reasons.push("missing_criterion_key");
    if (!entry.origin) reasons.push("missing_origin");
    if (!entry.reason) reasons.push("missing_reason");
    if (entry.finalWeight == null) reasons.push("missing_final_weight");
  }
  return { valid: reasons.length === 0, reasons };
}
