/**
 * PATCH 9.3B — User Priority Weighting Engine
 *
 * Transforma sinais humanos em pesos de prioridade universais e rastreáveis.
 * Sem copy, templates, hardcode por categoria ou decisão via LLM.
 */

import { extractBudget } from "./miaRoutingSafety.js";

export const USER_PRIORITY_WEIGHTING_VERSION = "9.3B.1";

export const PRIORITY_CLASSES = Object.freeze([
  "performance_priority",
  "cost_priority",
  "longevity_priority",
  "comfort_priority",
  "convenience_priority",
  "reliability_priority",
  "confidence_priority",
  "anti_regret_priority",
  "ownership_priority",
  "practicality_priority",
  "learning_priority",
  "risk_priority",
]);

export const TRADEOFF_SACRIFICE_TYPES = Object.freeze([
  "performance_sacrifice",
  "cost_sacrifice",
  "convenience_sacrifice",
  "longevity_sacrifice",
  "comfort_sacrifice",
  "feature_depth_sacrifice",
  "premium_build_sacrifice",
  "immediate_convenience_sacrifice",
  "efficiency_sacrifice",
]);

const AXIS_TO_PRIORITY = Object.freeze({
  performance: "performance_priority",
  value: "cost_priority",
  longevity: "longevity_priority",
  comfort: "comfort_priority",
  battery: "convenience_priority",
  screen: "performance_priority",
  camera: "confidence_priority",
});

const PRIORITY_SIGNAL_RULES = Object.freeze([
  {
    priorityClass: "cost_priority",
    patterns: [
      /\b(barato|barata|econom|econ[oô]mico|custo.?benef|gastar pouco|preco baixo|preço baixo|orçamento|orcamento|faixa de preço)\b/i,
    ],
    signalKeys: ["priceSensitive"],
    axes: ["value"],
  },
  {
    priorityClass: "performance_priority",
    patterns: [
      /\b(desempenho|performance|potente|gamer|multitarefa|fps|processador|chip|rapido|rápido|fluido)\b/i,
    ],
    signalKeys: ["performanceFocused"],
    axes: ["performance", "screen"],
  },
  {
    priorityClass: "longevity_priority",
    patterns: [
      /\b(longevo|longevidade|durar|vários anos|varios anos|anos de uso|durabilidade|permanecer)\b/i,
    ],
    signalKeys: ["longevityFocused"],
    axes: ["longevity"],
  },
  {
    priorityClass: "anti_regret_priority",
    patterns: [
      /\b(arrepend|não quero errar|nao quero errar|sem arrependimento|evitar erro|decisão segura)\b/i,
    ],
    signalKeys: ["avoidRegret"],
    axes: [],
  },
  {
    priorityClass: "practicality_priority",
    patterns: [
      /\b(simples|pratico|prático|facil|fácil|basico|básico|dia a dia|rotina|whatsapp|funciona)\b/i,
    ],
    signalKeys: ["practicalityFocused"],
    axes: ["value"],
  },
  {
    priorityClass: "comfort_priority",
    patterns: [/\b(conforto|ergon[oô]m|confort[aá]vel|sess[aõ]es longas|postura)\b/i],
    signalKeys: ["comfortFocused"],
    axes: ["comfort"],
  },
  {
    priorityClass: "convenience_priority",
    patterns: [
      /\b(praticidade|conveniente|autonomia|bateria|sem complica|plug and play|rapido de usar)\b/i,
    ],
    signalKeys: ["convenienceFocused"],
    axes: ["battery"],
  },
  {
    priorityClass: "reliability_priority",
    patterns: [
      /\b(confi[aá]vel|confiavel|est[aá]vel|n[aã]o travar|nao travar|robusto|resistente)\b/i,
    ],
    signalKeys: ["reliabilityFocused"],
    axes: [],
  },
  {
    priorityClass: "confidence_priority",
    patterns: [
      /\b(confian[cç]a|certeza|seguran[cç]a|qualidade|foto|fotos|c[aâ]mera|camera|registrar)\b/i,
    ],
    signalKeys: ["confidenceFocused"],
    axes: ["camera"],
  },
  {
    priorityClass: "ownership_priority",
    patterns: [
      /\b(posse|manter|manteria|continuar usando|troco todo ano|posse longa|posse curta)\b/i,
    ],
    signalKeys: ["ownershipFocused", "longHold", "shortHold"],
    axes: ["longevity"],
  },
  {
    priorityClass: "learning_priority",
    patterns: [
      /\b(specs|especifica|especificação|t[eé]cnico|tecnico|detalhe t[eé]cnico|hz|resolu[cç][aã]o|benchmark)\b/i,
    ],
    signalKeys: ["technical"],
    axes: ["performance", "screen"],
  },
  {
    priorityClass: "risk_priority",
    patterns: [/\b(risco|incerteza|medo|inseguro|duvida|dúvida|receio)\b/i],
    signalKeys: ["riskAverse"],
    axes: [],
  },
]);

const IGNORE_RULES = Object.freeze([
  { priorityClass: "confidence_priority", patterns: [/\bn[aã]o ligo (para )?(foto|fotos|c[aâ]mera|camera)\b/i] },
  { priorityClass: "performance_priority", patterns: [/\bn[aã]o ligo (para )?(desempenho|performance|fps|jogo)\b/i] },
  { priorityClass: "cost_priority", patterns: [/\bn[aã]o ligo (para )?(pre[cç]o|preco|caro|barato)\b/i] },
  { priorityClass: "comfort_priority", patterns: [/\bn[aã]o ligo (para )?(conforto|ergonom)\b/i] },
  { priorityClass: "convenience_priority", patterns: [/\bn[aã]o ligo (para )?(bateria|autonomia|praticidade)\b/i] },
  { priorityClass: "longevity_priority", patterns: [/\bn[aã]o ligo (para )?(durar|longevidade|anos)\b/i] },
  { priorityClass: "confidence_priority", patterns: [/\b(tanto faz|irrelevante).*(foto|c[aâ]mera|camera)\b/i] },
]);

const TRADEOFF_ACCEPTANCE_RULES = Object.freeze([
  {
    priorityClass: "cost_priority",
    threshold: 0.28,
    accepts: ["performance_sacrifice", "feature_depth_sacrifice", "premium_build_sacrifice"],
  },
  {
    priorityClass: "performance_priority",
    threshold: 0.28,
    accepts: ["cost_sacrifice", "efficiency_sacrifice", "convenience_sacrifice"],
  },
  {
    priorityClass: "longevity_priority",
    threshold: 0.25,
    accepts: ["cost_sacrifice", "immediate_convenience_sacrifice", "feature_depth_sacrifice"],
  },
  {
    priorityClass: "anti_regret_priority",
    threshold: 0.22,
    accepts: ["cost_sacrifice", "performance_sacrifice"],
  },
  {
    priorityClass: "practicality_priority",
    threshold: 0.22,
    accepts: ["feature_depth_sacrifice", "performance_sacrifice", "premium_build_sacrifice"],
  },
  {
    priorityClass: "comfort_priority",
    threshold: 0.22,
    accepts: ["cost_sacrifice", "convenience_sacrifice"],
  },
  {
    priorityClass: "convenience_priority",
    threshold: 0.22,
    accepts: ["cost_sacrifice", "longevity_sacrifice"],
  },
  {
    priorityClass: "reliability_priority",
    threshold: 0.22,
    accepts: ["cost_sacrifice", "immediate_convenience_sacrifice"],
  },
  {
    priorityClass: "learning_priority",
    threshold: 0.2,
    accepts: ["cost_sacrifice", "feature_depth_sacrifice"],
  },
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function countPatternHits(query = "", patterns = []) {
  let hits = 0;
  for (const pattern of patterns) {
    const matches = query.match(new RegExp(pattern.source, pattern.flags + "g"));
    if (matches) hits += matches.length;
  }
  return hits;
}

function resolveEffectiveAxisPriority(primaryAxis = "", query = "", userSignals = {}) {
  const hasCostIntent =
    /\b(barato|barata|econom|custo|preco|preço|orçamento|orcamento|gastar pouco)\b/i.test(query) ||
    userSignals.priceSensitive;
  const hasPracticalityIntent = /\b(simples|facil|fácil|pratico|prático|dia a dia|basico|básico|whatsapp)\b/i.test(
    query
  );
  const hasAntiRegretIntent =
    userSignals.avoidRegret ||
    /\b(arrepend|sem arrependimento|não quero errar|nao quero errar)\b/i.test(query);

  if (primaryAxis === "value") {
    if (hasAntiRegretIntent && !hasCostIntent) return "anti_regret_priority";
    if (hasPracticalityIntent && !hasCostIntent) return "practicality_priority";
    return "cost_priority";
  }

  return AXIS_TO_PRIORITY[primaryAxis] || null;
}

function extractPrioritySignals(input = {}) {
  const query = cleanText(input.query || input.context?.query || "").toLowerCase();
  const userSignals = input.userSignals || input.querySignals || input.context?.querySignals || {};
  const primaryAxis = cleanText(input.primaryAxis || input.context?.primaryAxis || "");
  const budget = input.budget ?? extractBudget(query);
  const traces = [];
  const rawScores = Object.fromEntries(PRIORITY_CLASSES.map((c) => [c, 0]));
  const axisPriority = resolveEffectiveAxisPriority(primaryAxis, query, userSignals);

  for (const rule of PRIORITY_SIGNAL_RULES) {
    let score = 0;
    const patternHits = countPatternHits(query, rule.patterns);
    if (patternHits > 0) {
      score += 0.18 + Math.min(patternHits - 1, 3) * 0.06;
      traces.push({
        priorityClass: rule.priorityClass,
        source: "query",
        matched: rule.patterns.find((p) => p.test(query))?.source || "pattern",
        weight: score,
      });
    }

    for (const key of rule.signalKeys || []) {
      if (userSignals[key]) {
        score += 0.22;
        traces.push({ priorityClass: rule.priorityClass, source: "signal", matched: key, weight: 0.22 });
      }
    }

    if (rule.axes?.includes(primaryAxis)) {
      const axisAligned =
        primaryAxis !== "value" || rule.priorityClass === axisPriority;
      if (axisAligned) {
        score += 0.2;
        traces.push({
          priorityClass: rule.priorityClass,
          source: "axis",
          matched: primaryAxis,
          weight: 0.2,
        });
      }
    }

    if (score > 0) {
      rawScores[rule.priorityClass] += score;
    }
  }

  if (axisPriority) {
    rawScores[axisPriority] += 0.24;
    traces.push({
      priorityClass: axisPriority,
      source: "primary_axis",
      matched: primaryAxis,
      weight: 0.24,
    });
  }

  if (userSignals.avoidRegret) {
    rawScores.anti_regret_priority += 0.28;
    traces.push({
      priorityClass: "anti_regret_priority",
      source: "signal_override",
      matched: "avoidRegret",
      weight: 0.28,
    });
  }

  if (userSignals.priceSensitive && !/\b(arrepend|sem arrependimento)\b/i.test(query)) {
    rawScores.cost_priority += 0.12;
    traces.push({
      priorityClass: "cost_priority",
      source: "signal_override",
      matched: "priceSensitive",
      weight: 0.12,
    });
  }

  if (budget != null) {
    if (userSignals.priceSensitive || budget <= 1500) {
      rawScores.cost_priority += 0.16;
      traces.push({
        priorityClass: "cost_priority",
        source: "budget",
        matched: String(budget),
        weight: 0.16,
      });
    } else if (budget >= 4000 || userSignals.budgetRelaxed) {
      rawScores.performance_priority += 0.08;
      rawScores.longevity_priority += 0.06;
      traces.push({
        priorityClass: "performance_priority",
        source: "budget_relaxed",
        matched: String(budget),
        weight: 0.08,
      });
    }
  }

  const dominance = cleanText(input.reasoning?.dominance || input.searchCognition?.dominance || "");
  if (dominance === "clear" && axisPriority) {
    rawScores[axisPriority] += 0.12;
    traces.push({
      priorityClass: axisPriority,
      source: "dominance",
      matched: dominance,
      weight: 0.12,
    });
  }

  const constraints = Array.isArray(input.constraints) ? input.constraints : [];
  for (const constraint of constraints) {
    const text = cleanText(constraint).toLowerCase();
    for (const rule of PRIORITY_SIGNAL_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        rawScores[rule.priorityClass] += 0.1;
        traces.push({
          priorityClass: rule.priorityClass,
          source: "constraint",
          matched: text.slice(0, 40),
          weight: 0.1,
        });
      }
    }
  }

  return { rawScores, traces, query, primaryAxis, budget, userSignals, axisPriority };
}

/**
 * @param {Record<string, number>} rawScores
 * @param {string[]} ignoredPriorities
 */
export function calculatePriorityWeights(rawScores = {}, ignoredPriorities = []) {
  const adjusted = { ...rawScores };
  for (const ignored of ignoredPriorities) {
    adjusted[ignored] = 0;
  }

  const total = Object.values(adjusted).reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) {
    const fallback = Object.fromEntries(PRIORITY_CLASSES.map((c) => [c, 1 / PRIORITY_CLASSES.length]));
    return fallback;
  }

  const weights = {};
  for (const cls of PRIORITY_CLASSES) {
    weights[cls] = clamp01((adjusted[cls] || 0) / total);
  }
  return weights;
}

/**
 * @param {Record<string, number>} weights
 * @param {Record<string, unknown>} context
 */
export function resolveDominantPriority(weights = {}, context = {}) {
  const entries = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) return null;

  const [topClass, topWeight] = entries[0];
  const [, secondWeight] = entries[1] || [null, 0];

  if (secondWeight > 0 && topWeight - secondWeight < 0.04) {
    const axisPriority = context.axisPriority || AXIS_TO_PRIORITY[cleanText(context.primaryAxis || "")];
    if (axisPriority && weights[axisPriority] >= secondWeight) {
      return axisPriority;
    }
    const repetitionWinner = entries.find(([cls]) => {
      const hits = (context.traces || []).filter(
        (t) => t.priorityClass === cls && t.source === "query"
      ).length;
      return hits >= 2;
    });
    if (repetitionWinner) return repetitionWinner[0];
  }

  return topClass;
}

/**
 * @param {Record<string, number>} weights
 * @param {string|null} dominant
 * @param {number} [minWeight=0.12]
 */
export function resolveSecondaryPriorities(weights = {}, dominant = null, minWeight = 0.12) {
  return Object.entries(weights)
    .filter(([cls, w]) => cls !== dominant && w >= minWeight)
    .sort((a, b) => b[1] - a[1])
    .map(([cls]) => cls);
}

/**
 * @param {string} query
 * @param {Record<string, number>} weights
 * @param {number} [floor=0.04]
 */
export function resolveIgnoredPriorities(query = "", weights = {}, floor = 0.04) {
  const ignored = new Set();

  for (const rule of IGNORE_RULES) {
    if (rule.patterns.some((p) => p.test(query))) {
      ignored.add(rule.priorityClass);
    }
  }

  for (const [cls, w] of Object.entries(weights)) {
    if (w <= floor) ignored.add(cls);
  }

  return [...ignored];
}

/**
 * @param {Record<string, number>} weights
 * @param {string|null} dominant
 */
export function calculateTradeoffAcceptance(weights = {}, dominant = null) {
  const accepted = new Set();
  const trace = [];

  for (const rule of TRADEOFF_ACCEPTANCE_RULES) {
    const w = weights[rule.priorityClass] || 0;
    if (w >= rule.threshold || rule.priorityClass === dominant) {
      for (const sacrifice of rule.accepts) {
        accepted.add(sacrifice);
        trace.push({ priorityClass: rule.priorityClass, sacrifice, weight: w });
      }
    }
  }

  if (dominant && weights[dominant] >= 0.25) {
    const dominantRule = TRADEOFF_ACCEPTANCE_RULES.find((r) => r.priorityClass === dominant);
    if (dominantRule) {
      for (const sacrifice of dominantRule.accepts) accepted.add(sacrifice);
    }
  }

  return {
    acceptedSacrifices: [...accepted],
    trace,
  };
}

/**
 * @param {{
 *   context?: Record<string, unknown>,
 *   userIntent?: Record<string, unknown>,
 *   userSignals?: Record<string, unknown>,
 *   querySignals?: Record<string, unknown>,
 *   query?: string,
 *   budget?: number|null,
 *   constraints?: string[],
 *   reasoning?: Record<string, unknown>,
 *   searchCognition?: Record<string, unknown>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   primaryAxis?: string,
 * }} input
 */
export function buildUserPriorityWeightingModel(input = {}) {
  const query = cleanText(input.query || input.context?.query || "");
  const extracted = extractPrioritySignals({
    ...input,
    query,
    querySignals: input.userSignals || input.querySignals || {},
  });

  const preIgnored = resolveIgnoredPriorities(query, extracted.rawScores, 0);
  let weights = calculatePriorityWeights(extracted.rawScores, preIgnored);
  const dominant = resolveDominantPriority(weights, {
    primaryAxis: extracted.primaryAxis,
    axisPriority: extracted.axisPriority,
    traces: extracted.traces,
  });
  const secondaryPriorities = resolveSecondaryPriorities(weights, dominant);
  const ignoredPriorities = resolveIgnoredPriorities(query, weights);
  weights = calculatePriorityWeights(extracted.rawScores, ignoredPriorities);

  const tradeoffAcceptance = calculateTradeoffAcceptance(weights, dominant);
  const confidence = clamp01(
    0.35 +
      (dominant ? 0.25 : 0) +
      Math.min(Object.values(weights).filter((w) => w >= 0.12).length, 3) * 0.08 +
      Math.min(extracted.traces.length, 8) * 0.02
  );

  const priorityWeights = {
    primaryPriority: dominant,
    secondaryPriorities,
    ignoredPriorities,
    weights,
    tradeoffAcceptance: tradeoffAcceptance.acceptedSacrifices,
    confidence,
    trace: {
      sources: extracted.traces,
      dominantResolution: dominant,
      tradeoffTrace: tradeoffAcceptance.trace,
      budget: extracted.budget,
      primaryAxis: extracted.primaryAxis,
    },
  };

  return {
    ok: Boolean(dominant && confidence >= 0.45),
    priorityWeights,
    version: USER_PRIORITY_WEIGHTING_VERSION,
    context: {
      query,
      primaryAxis: extracted.primaryAxis,
      budget: extracted.budget,
    },
  };
}

export function isPriorityWeightingTraceable(model = {}) {
  const pw = model?.priorityWeights || model;
  return Boolean(
    pw?.primaryPriority &&
      PRIORITY_CLASSES.includes(pw.primaryPriority) &&
      pw.weights &&
      typeof pw.weights[pw.primaryPriority] === "number" &&
      pw.weights[pw.primaryPriority] > 0 &&
      Array.isArray(pw.trace?.sources) &&
      pw.trace.sources.length > 0
  );
}

export function classifyPriorityWeightingOrigin(model = {}) {
  const pw = model?.priorityWeights || model;
  if (!pw?.primaryPriority) return "placeholder";
  if (isPriorityWeightingTraceable(pw)) {
    if (pw.confidence >= 0.7 && pw.trace.sources.length >= 2) return "real";
    return "derived";
  }
  if (pw.weights && Object.values(pw.weights).some((w) => w > 0)) return "pseudo";
  return "placeholder";
}
