/**
 * PATCH 9.2V — Ownership Experience Layer
 *
 * Experience + Friction → Ownership: modela como a decisão envelhece na posse.
 * Sem copy, templates ou hardcode por categoria.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";

export const OWNERSHIP_EXPERIENCE_VERSION = "9.2V.1";

export const OWNERSHIP_CLASSES = Object.freeze([
  "long_term_satisfaction",
  "future_friction",
  "adaptation_over_time",
  "reliability_over_time",
  "maintenance_burden",
  "value_retention",
  "replacement_pressure",
  "regret_accumulation",
  "confidence_over_time",
  "usage_stability",
]);

export const TIME_HORIZONS = Object.freeze(["short_term", "medium_term", "long_term"]);

const GENERIC_CONSEQUENCE_PATTERN =
  /ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|renúncia percept[ií]vel|combina com o perfil de uso descrito/i;

const FRICTION_OWNERSHIP_MAP = Object.freeze({
  adaptation_friction: {
    ownershipClass: "adaptation_over_time",
    ownershipMeaning: "curva inicial de adaptação antes da rotina estabilizar",
    timeHorizon: "short_term",
    satisfactionSignal: 0.45,
    regretSignal: 0.35,
    durabilitySignal: 0.5,
  },
  usage_friction: {
    ownershipClass: "future_friction",
    ownershipMeaning: "atrito que tende a reaparecer no uso repetido",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.4,
    regretSignal: 0.55,
    durabilitySignal: 0.45,
  },
  convenience_friction: {
    ownershipClass: "future_friction",
    ownershipMeaning: "interrupções que podem pesar mais com o tempo",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.42,
    regretSignal: 0.5,
    durabilitySignal: 0.48,
  },
  performance_friction: {
    ownershipClass: "replacement_pressure",
    ownershipMeaning: "pressão de troca quando o uso exige mais do que a folga inicial",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.38,
    regretSignal: 0.58,
    durabilitySignal: 0.4,
  },
  ownership_friction: {
    ownershipClass: "replacement_pressure",
    ownershipMeaning: "custo ou esforço de manter a escolha ao longo da posse",
    timeHorizon: "long_term",
    satisfactionSignal: 0.35,
    regretSignal: 0.6,
    durabilitySignal: 0.35,
  },
  maintenance_friction: {
    ownershipClass: "maintenance_burden",
    ownershipMeaning: "esforço recorrente de cuidado para manter desempenho",
    timeHorizon: "long_term",
    satisfactionSignal: 0.4,
    regretSignal: 0.52,
    durabilitySignal: 0.42,
  },
  expectation_friction: {
    ownershipClass: "regret_accumulation",
    ownershipMeaning: "risco de expectativa e realidade divergirem com o uso",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.32,
    regretSignal: 0.72,
    durabilitySignal: 0.38,
  },
  regret_friction: {
    ownershipClass: "regret_accumulation",
    ownershipMeaning: "arrependimento que tende a crescer se a prioridade não fechar",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.3,
    regretSignal: 0.78,
    durabilitySignal: 0.35,
  },
  workflow_friction: {
    ownershipClass: "usage_stability",
    ownershipMeaning: "estabilidade operacional depende de encaixe contínuo no fluxo",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.48,
    regretSignal: 0.45,
    durabilitySignal: 0.52,
  },
  learning_friction: {
    ownershipClass: "adaptation_over_time",
    ownershipMeaning: "aprendizado inicial antes do uso fluir sem atrito",
    timeHorizon: "short_term",
    satisfactionSignal: 0.46,
    regretSignal: 0.38,
    durabilitySignal: 0.5,
  },
});

const EXPERIENCE_OWNERSHIP_RULES = Object.freeze([
  {
    experienceClass: "long_term_use",
    ownershipClass: "long_term_satisfaction",
    ownershipMeaning: "tendência de satisfação prolongada enquanto o uso acompanha",
    timeHorizon: "long_term",
    satisfactionSignal: 0.82,
    regretSignal: 0.2,
    durabilitySignal: 0.85,
    pattern: /longevidade|anos|suporte|permanecer|satisfa/i,
  },
  {
    experienceClass: "ownership",
    ownershipClass: "long_term_satisfaction",
    ownershipMeaning: "relação prolongada sem pressa de troca antecipada",
    timeHorizon: "long_term",
    satisfactionSignal: 0.78,
    regretSignal: 0.22,
    durabilitySignal: 0.8,
    pattern: /longevidade|permanecer|vários anos|troca/i,
  },
  {
    experienceClass: "satisfaction",
    ownershipClass: "long_term_satisfaction",
    ownershipMeaning: "escolha tende a continuar fazendo sentido após os primeiros meses",
    timeHorizon: "long_term",
    satisfactionSignal: 0.75,
    regretSignal: 0.25,
    durabilitySignal: 0.78,
    pattern: /consistente|estável|estavel|satisf/i,
  },
  {
    experienceClass: "predictability",
    ownershipClass: "usage_stability",
    ownershipMeaning: "rotina previsível no uso repetido",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.7,
    regretSignal: 0.28,
    durabilitySignal: 0.72,
    pattern: /previsível|previsivel|ecossistema|apps|rotina/i,
  },
  {
    experienceClass: "reliability",
    ownershipClass: "reliability_over_time",
    ownershipMeaning: "confiança de que o uso segue estável sem falhas recorrentes",
    timeHorizon: "long_term",
    satisfactionSignal: 0.74,
    regretSignal: 0.24,
    durabilitySignal: 0.76,
    pattern: /limite|confiança|confianca|estável|estavel|reliab/i,
  },
  {
    experienceClass: "confidence",
    ownershipClass: "confidence_over_time",
    ownershipMeaning: "tranquilidade que tende a se manter em situações repetidas",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.68,
    regretSignal: 0.3,
    durabilitySignal: 0.65,
    pattern: /registrar|momentos|foto|fotos|tranquil/i,
  },
  {
    experienceClass: "regret_risk",
    ownershipClass: "value_retention",
    ownershipMeaning: "valor percebido precisa se sustentar para evitar arrependimento tardio",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.42,
    regretSignal: 0.65,
    durabilitySignal: 0.45,
    pattern: /preço|preco|custo|orçamento|arrepend/i,
  },
  {
    experienceClass: "adaptation",
    ownershipClass: "adaptation_over_time",
    ownershipMeaning: "ajuste gradual antes da experiência estabilizar",
    timeHorizon: "short_term",
    satisfactionSignal: 0.5,
    regretSignal: 0.4,
    durabilitySignal: 0.55,
    pattern: /adapta|gesto|layout|habito|hábito|fluidez|hz/i,
  },
  {
    experienceClass: "friction",
    ownershipClass: "future_friction",
    ownershipMeaning: "incômodo que pode persistir ou amplificar com o tempo",
    timeHorizon: "medium_term",
    satisfactionSignal: 0.38,
    regretSignal: 0.58,
    durabilitySignal: 0.42,
    pattern: /atrito|incômodo|incomodo|planejamento|esforço|esforco/i,
  },
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
}

function clamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function buildOwnershipEntry({
  ownershipClass,
  ownershipMeaning,
  timeHorizon,
  sourceFamily,
  sourceToken,
  sourceConsequence,
  sourceExperience,
  sourceFriction,
  sensation,
  satisfactionSignal,
  regretSignal,
  durabilitySignal,
  context,
  derivedFrom = "experience",
}) {
  if (!ownershipClass || !ownershipMeaning || !sourceConsequence) return null;
  if (GENERIC_CONSEQUENCE_PATTERN.test(sourceConsequence)) return null;
  if (isGenericInsightBody(sourceConsequence)) return null;
  if (!TIME_HORIZONS.includes(timeHorizon)) return null;

  const entry = {
    ownershipClass,
    sourceFamily: sourceFamily || "unknown",
    sourceToken: sourceToken || "",
    sourceConsequence: cleanText(sourceConsequence),
    sourceExperience: cleanText(sourceExperience),
    sourceFriction: cleanText(sourceFriction),
    sensation: cleanText(sensation),
    ownershipMeaning: cleanText(ownershipMeaning),
    timeHorizon,
    durabilitySignal: clamp01(durabilitySignal),
    satisfactionSignal: clamp01(satisfactionSignal),
    regretSignal: clamp01(regretSignal),
    derivedFrom,
    trace: {
      token: sourceToken || null,
      consequence: cleanText(sourceConsequence),
      sensation: cleanText(sensation),
      experience: cleanText(sourceExperience),
      friction: cleanText(sourceFriction),
      ownership: cleanText(ownershipMeaning),
      ownershipClass,
      timeHorizon,
    },
  };

  entry.contextualRelevance = calculateOwnershipRelevance(entry, context);
  entry.confidence = clamp01(
    0.45 + entry.durabilitySignal * 0.2 + entry.contextualRelevance * 0.35
  );
  entry.contextScore = entry.contextualRelevance * 100 + entry.confidence * 25;
  entry.contextApplied = entry.contextualRelevance >= 0.55;
  return entry;
}

/**
 * @param {Record<string, unknown>} ownership
 * @param {Record<string, unknown>} context
 */
export function calculateOwnershipRelevance(ownership = {}, context = {}) {
  const query = cleanText(context.query || "");
  const primaryAxis = cleanText(context.primaryAxis || "");
  const querySignals = context.querySignals || {};
  const ownershipClass = cleanText(ownership.ownershipClass || "");
  const satisfaction = Number(ownership.satisfactionSignal || 0.5);
  const regret = Number(ownership.regretSignal || 0.5);
  let relevance = Number(ownership.baseRelevance || 0.48);

  const wantsLongHold = /\b(longevo|longevidade|anos|durar|manter|vários anos|varios anos)\b/i.test(query);
  const wantsFrequentUpgrade = /\b(trocar|troca|upgrade|ano que vem|sempre novo|todo ano)\b/i.test(query);

  if (wantsLongHold) {
    if (ownership.timeHorizon === "long_term") relevance += 0.22;
    if (ownershipClass === "long_term_satisfaction") relevance += 0.18;
    if (ownershipClass === "reliability_over_time") relevance += 0.15;
    if (ownershipClass === "usage_stability") relevance += 0.12;
    if (ownershipClass === "replacement_pressure") relevance -= 0.12;
    relevance += satisfaction * 0.12;
    relevance -= regret * 0.08;
  }

  if (wantsFrequentUpgrade) {
    if (ownershipClass === "replacement_pressure") relevance += 0.2;
    if (ownershipClass === "value_retention") relevance += 0.14;
    if (ownershipClass === "future_friction") relevance += 0.08;
    if (ownershipClass === "long_term_satisfaction") relevance -= 0.15;
    if (ownershipClass === "reliability_over_time") relevance -= 0.08;
    relevance -= satisfaction * 0.1;
    relevance += regret * 0.06;
  }

  if (querySignals.priceSensitive || context.hasBudget) {
    if (ownershipClass === "value_retention") relevance += 0.2;
    if (ownershipClass === "regret_accumulation") relevance += 0.15;
  }

  if (querySignals.avoidRegret || /\b(arrepend|não quero errar|nao quero errar)\b/i.test(query)) {
    if (ownershipClass === "regret_accumulation") relevance += 0.25;
    if (regret >= 0.6) relevance += 0.1;
    if (ownershipClass === "long_term_satisfaction") relevance += 0.08;
  }

  if (querySignals.acceptsTradeoff || /\b(aceito|abro mão|abro mao|tradeoff)\b/i.test(query)) {
    if (ownershipClass === "future_friction") relevance -= 0.08;
    if (ownershipClass === "value_retention") relevance += 0.1;
    if (ownershipClass === "adaptation_over_time") relevance -= 0.06;
  }

  if (primaryAxis === "longevity" && ownership.timeHorizon === "long_term") relevance += 0.15;
  if (primaryAxis === "value" && ownershipClass === "value_retention") relevance += 0.14;
  if (querySignals.technical && ownershipClass === "adaptation_over_time") relevance += 0.08;

  return clamp01(relevance);
}

function deriveOwnershipFromFriction(friction = {}, context = {}) {
  const map = FRICTION_OWNERSHIP_MAP[friction.frictionClass];
  if (!map) return null;

  return buildOwnershipEntry({
    ...map,
    sourceFamily: friction.sourceFamily,
    sourceToken: friction.sourceToken,
    sourceConsequence: friction.sourceConsequence,
    sourceExperience: friction.sourceExperience,
    sourceFriction: friction.friction,
    sensation: friction.sensation,
    context,
    derivedFrom: "friction",
  });
}

function deriveOwnershipFromExperience(experience = {}, context = {}) {
  const haystack = `${experience.sourceConsequence || ""} ${experience.sensation || ""} ${experience.experience || ""}`;
  const rule =
    EXPERIENCE_OWNERSHIP_RULES.find(
      (entry) =>
        entry.experienceClass === experience.experienceClass && entry.pattern.test(haystack)
    ) ||
    EXPERIENCE_OWNERSHIP_RULES.find((entry) => entry.experienceClass === experience.experienceClass);

  if (!rule) return null;

  return buildOwnershipEntry({
    ownershipClass: rule.ownershipClass,
    ownershipMeaning: rule.ownershipMeaning,
    timeHorizon: rule.timeHorizon,
    sourceFamily: experience.sourceFamily,
    sourceToken: experience.sourceToken,
    sourceConsequence: experience.sourceConsequence,
    sourceExperience: experience.experience,
    sourceFriction: "",
    sensation: experience.sensation,
    satisfactionSignal: rule.satisfactionSignal,
    regretSignal: rule.regretSignal,
    durabilitySignal: rule.durabilitySignal,
    context,
    derivedFrom: "experience",
  });
}

function deriveOwnershipFromSacrifice(sacrifice = {}, context = {}) {
  const text = cleanText(typeof sacrifice === "string" ? sacrifice : sacrifice.text || "");
  if (!text) return null;

  let rule = null;
  if (/suporte|longevidade|anos/i.test(text)) {
    rule = {
      ownershipClass: "replacement_pressure",
      ownershipMeaning: "suporte limitado pode antecipar pressão de troca",
      timeHorizon: "long_term",
      satisfactionSignal: 0.36,
      regretSignal: 0.62,
      durabilitySignal: 0.34,
    };
  } else if (/preço|caro|custo/i.test(text)) {
    rule = {
      ownershipClass: "value_retention",
      ownershipMeaning: "gasto precisa se justificar ao longo da posse",
      timeHorizon: "medium_term",
      satisfactionSignal: 0.4,
      regretSignal: 0.68,
      durabilitySignal: 0.4,
    };
  } else if (/limite|desempenho|capacidade/i.test(text)) {
    rule = {
      ownershipClass: "replacement_pressure",
      ownershipMeaning: "limite percebido pode gerar vontade de trocar cedo",
      timeHorizon: "medium_term",
      satisfactionSignal: 0.35,
      regretSignal: 0.6,
      durabilitySignal: 0.38,
    };
  }

  if (!rule) return null;

  return buildOwnershipEntry({
    ...rule,
    sourceFamily: sacrifice.token || sacrifice.field || "tradeoff_sacrifice",
    sourceToken: cleanText(sacrifice.token || ""),
    sourceConsequence: text,
    sourceExperience: text,
    sourceFriction: text,
    sensation: text,
    context,
    derivedFrom: "tradeoff_sacrifice",
  });
}

/**
 * @param {{
 *   winner?: string,
 *   context?: Record<string, unknown>,
 *   sensations?: Array<Record<string, unknown>>,
 *   experiences?: Array<Record<string, unknown>>,
 *   frictions?: Array<Record<string, unknown>>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   query?: string,
 *   primaryAxis?: string,
 *   category?: string,
 *   querySignals?: Record<string, unknown>,
 *   humanExperienceModel?: { experiences?: Array<Record<string, unknown>> },
 *   humanFrictionModel?: { frictions?: Array<Record<string, unknown>> },
 * }} input
 */
export function buildOwnershipExperienceModel(input = {}) {
  const query = cleanText(input.query || input.context?.query || "");
  const primaryAxis = cleanText(input.primaryAxis || input.context?.primaryAxis || "");
  const category = cleanText(input.category || input.context?.category || "");
  const budget = extractBudget(query);
  const ctx = {
    query,
    primaryAxis,
    category,
    hasBudget: budget != null,
    querySignals: input.querySignals || input.context?.querySignals || {},
  };

  const experiences =
    input.experiences || input.humanExperienceModel?.experiences || [];
  const frictions = input.frictions || input.humanFrictionModel?.frictions || [];

  const ownershipExperiences = [];
  const seen = new Set();

  const push = (entry) => {
    if (!entry) return;
    const key = `${entry.ownershipClass}:${normalizeKey(entry.ownershipMeaning).slice(0, 28)}`;
    if (seen.has(key)) return;
    seen.add(key);
    ownershipExperiences.push(entry);
  };

  for (const friction of frictions) {
    push(deriveOwnershipFromFriction(friction, ctx));
  }

  for (const experience of experiences) {
    push(deriveOwnershipFromExperience(experience, ctx));
  }

  const sacrifices = (input.tradeoffs?.sacrifices || []).map((entry) =>
    typeof entry === "string" ? { text: entry } : entry
  );
  for (const sacrifice of sacrifices) {
    push(deriveOwnershipFromSacrifice(sacrifice, ctx));
  }

  ownershipExperiences.sort((a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0));

  return {
    ok: ownershipExperiences.length > 0,
    ownershipExperiences,
    version: OWNERSHIP_EXPERIENCE_VERSION,
    winner: cleanText(input.winner || ""),
    context: ctx,
  };
}

export function isOwnershipTraceable(ownership = {}) {
  return Boolean(
    ownership?.trace?.consequence &&
      ownership?.trace?.sensation &&
      (ownership?.trace?.experience || ownership?.trace?.friction) &&
      ownership?.trace?.ownership &&
      ownership?.trace?.ownershipClass &&
      OWNERSHIP_CLASSES.includes(ownership.trace.ownershipClass) &&
      TIME_HORIZONS.includes(ownership.timeHorizon || "") &&
      !GENERIC_CONSEQUENCE_PATTERN.test(ownership.sourceConsequence || "")
  );
}

export function classifyOwnershipOrigin(ownership = {}) {
  if (!ownership) return "placeholder";
  if (isOwnershipTraceable(ownership)) {
    if (ownership.contextApplied && ownership.contextualRelevance >= 0.7) return "real";
    if (ownership.contextApplied || ownership.contextualRelevance >= 0.5) return "derived";
    return "derived";
  }
  if (ownership.ownershipClass) return "pseudo";
  return "placeholder";
}

/**
 * @param {Array<Record<string, unknown>>} ownershipExperiences
 * @param {Record<string, unknown>} context
 * @param {Record<string, unknown>} [selectedExperience]
 * @param {Record<string, unknown>} [selectedFriction]
 */
export function selectPrimaryOwnership(
  ownershipExperiences = [],
  context = {},
  selectedExperience = null,
  selectedFriction = null
) {
  const ranked = [...(ownershipExperiences || [])].sort(
    (a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0)
  );

  if (selectedFriction?.sourceConsequence) {
    const aligned = ranked.find(
      (entry) => entry.sourceConsequence === selectedFriction.sourceConsequence
    );
    if (aligned) return aligned;
  }

  if (selectedExperience?.sourceConsequence) {
    const aligned = ranked.find(
      (entry) => entry.sourceConsequence === selectedExperience.sourceConsequence
    );
    if (aligned) return aligned;
  }

  return ranked.find((entry) => entry.contextualRelevance >= 0.45) || ranked[0] || null;
}

/**
 * @param {Record<string, unknown>} meaning
 * @param {Record<string, unknown>} ownership
 */
export function enrichDecisionMeaningWithOwnership(meaning = {}, ownership = null) {
  if (!meaning || !ownership || !isOwnershipTraceable(ownership)) return meaning;

  return {
    ...meaning,
    ownershipMeaning: ownership.ownershipMeaning,
    ownershipClass: ownership.ownershipClass,
    timeHorizon: ownership.timeHorizon,
    ownershipRelevance: ownership.contextualRelevance,
    durabilitySignal: ownership.durabilitySignal,
    satisfactionSignal: ownership.satisfactionSignal,
    regretSignal: ownership.regretSignal,
    ownershipContextApplied: ownership.contextApplied === true,
    trace: {
      ...(meaning.trace || {}),
      ownership: ownership.ownershipMeaning,
      ownershipClass: ownership.ownershipClass,
      timeHorizon: ownership.timeHorizon,
    },
  };
}
