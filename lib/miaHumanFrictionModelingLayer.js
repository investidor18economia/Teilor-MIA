/**
 * PATCH 9.2U — Human Friction Modeling Layer
 *
 * Experience → Friction: modela atritos, incômodos e incompatibilidades contextuais
 * de forma universal e rastreável — sem copy, templates ou hardcode por categoria.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";

export const HUMAN_FRICTION_MODELING_VERSION = "9.2U.1";

export const FRICTION_CLASSES = Object.freeze([
  "adaptation_friction",
  "usage_friction",
  "maintenance_friction",
  "performance_friction",
  "convenience_friction",
  "ownership_friction",
  "expectation_friction",
  "workflow_friction",
  "learning_friction",
  "regret_friction",
]);

const GENERIC_CONSEQUENCE_PATTERN =
  /ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|renúncia percept[ií]vel|combina com o perfil de uso descrito/i;

const EXPERIENCE_FRICTION_MAP = Object.freeze({
  friction: { frictionClass: "usage_friction", baseSeverity: 0.62 },
  adaptation: { frictionClass: "adaptation_friction", baseSeverity: 0.58 },
  regret_risk: { frictionClass: "regret_friction", baseSeverity: 0.6 },
  maintenance: { frictionClass: "maintenance_friction", baseSeverity: 0.55 },
  ownership: { frictionClass: "ownership_friction", baseSeverity: 0.5 },
});

const FRICTION_DERIVATION_RULES = Object.freeze([
  {
    frictionClass: "adaptation_friction",
    pattern: /fluidez|60\s*hz|hz|gesto|layout|ios|android|ecossistema|interface|adapta/i,
    friction: "esforço de adaptação a hábitos ou gestos diferentes do que já se usa",
  },
  {
    frictionClass: "usage_friction",
    pattern: /fluidez|fluida|60\s*hz|peso|pesado|ergonom|cansaço|incômodo|incomodo/i,
    friction: "incômodo recorrente durante o uso contínuo",
  },
  {
    frictionClass: "usage_friction",
    pattern: /ocupa|bancada|espaço|espaco|peso|transport/i,
    friction: "uso exige mais planejamento de espaço ou deslocamento",
  },
  {
    frictionClass: "performance_friction",
    pattern: /limite|equipamento|tarefas|multitarefa|desempenho/i,
    friction: "sensação de limite quando o uso exige mais do previsto",
  },
  {
    frictionClass: "convenience_friction",
    pattern: /bateria|autonomia|recarga|tomada|interromper|carregar|espera/i,
    friction: "interrupções ou esperas que quebram o fluxo do dia",
  },
  {
    frictionClass: "performance_friction",
    pattern: /limite|travar|multitarefa|pesado|desempenho|lento|engasg/i,
    friction: "sensação de limite ou lentidão quando o uso exige mais",
  },
  {
    frictionClass: "ownership_friction",
    pattern: /longevidade|suporte|troca|manter|anos|desgaste|durabil/i,
    friction: "pressão ou custo de manter a escolha ao longo da posse",
  },
  {
    frictionClass: "maintenance_friction",
    pattern: /limpeza|manuten|filtro|peça|conserv|higien/i,
    friction: "esforço recorrente de manutenção para manter o desempenho",
  },
  {
    frictionClass: "expectation_friction",
    pattern: /preço|caro|custo|premium|marketing|anúncio|anuncio/i,
    friction: "risco de expectativa mais alta que o uso real entrega",
  },
  {
    frictionClass: "workflow_friction",
    pattern: /apps|ecossistema|integração|integracao|fluxo|multitarefa|trabalho/i,
    friction: "atrito no encaixe com a rotina digital ou de trabalho",
  },
  {
    frictionClass: "learning_friction",
    pattern: /complexo|aprender|configurar|setup|menu|interface/i,
    friction: "curva de aprendizado antes do uso fluir naturalmente",
  },
  {
    frictionClass: "regret_friction",
    pattern: /arrepend|risco|fraco|limitad|abre mão|sacrif|renúncia|renuncia/i,
    friction: "tendência a questionar a escolha quando a prioridade não é atendida",
  },
]);

const PRIORITY_FRICTION_ALIGNMENT = Object.freeze([
  {
    primaryAxis: "camera",
    pattern: /câmera|camera|foto|fotos|registrar|vídeo|video/i,
    frictionClass: "regret_friction",
    relevanceBoost: 0.35,
  },
  {
    primaryAxis: "battery",
    pattern: /bateria|autonomia|recarga|tomada/i,
    frictionClass: "convenience_friction",
    relevanceBoost: 0.35,
  },
  {
    primaryAxis: "screen",
    pattern: /tela|hz|60|120|fluidez|fluida/i,
    frictionClass: "usage_friction",
    relevanceBoost: 0.32,
  },
  {
    primaryAxis: "performance",
    pattern: /desempenho|travar|limite|multitarefa|gamer|pesado/i,
    frictionClass: "performance_friction",
    relevanceBoost: 0.32,
  },
  {
    primaryAxis: "value",
    pattern: /preço|preco|custo|caro|barato|orçamento/i,
    frictionClass: "expectation_friction",
    relevanceBoost: 0.28,
  },
  {
    primaryAxis: "longevity",
    pattern: /longevo|longevidade|anos|suporte|troca/i,
    frictionClass: "ownership_friction",
    relevanceBoost: 0.3,
  },
  {
    primaryAxis: "comfort",
    pattern: /ergonom|peso|cansaço|cansaco|horas|conforto/i,
    frictionClass: "usage_friction",
    relevanceBoost: 0.28,
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

function resolveFrictionRule(haystack = "") {
  return FRICTION_DERIVATION_RULES.find((rule) => rule.pattern.test(haystack)) || null;
}

/**
 * Calcula relevância contextual do atrito — nem todo incômodo importa igual.
 * @param {Record<string, unknown>} friction
 * @param {Record<string, unknown>} context
 */
export function calculateFrictionRelevance(friction = {}, context = {}) {
  const primaryAxis = cleanText(context.primaryAxis || "");
  const query = cleanText(context.query || "");
  const querySignals = context.querySignals || {};
  let relevance = Number(friction.baseRelevance || 0.45);
  const haystack = `${friction.sourceConsequence || ""} ${friction.sourceExperience || ""} ${friction.friction || ""}`;

  for (const alignment of PRIORITY_FRICTION_ALIGNMENT) {
    if (alignment.frictionClass !== friction.frictionClass) continue;
    if (primaryAxis === alignment.primaryAxis) relevance += alignment.relevanceBoost;
    if (alignment.pattern.test(haystack) || alignment.pattern.test(query)) relevance += 0.12;
  }

  if (querySignals.technical && friction.frictionClass === "performance_friction") relevance += 0.15;
  if (querySignals.priceSensitive && friction.frictionClass === "expectation_friction") relevance += 0.12;
  if (
    (primaryAxis === "screen" || /\b(gamer|jogo|jogos|120|hz|fluidez)\b/i.test(query)) &&
    (friction.frictionClass === "usage_friction" || friction.frictionClass === "adaptation_friction")
  ) {
    relevance += 0.22;
  }
  if (
    primaryAxis === "battery" &&
    (friction.frictionClass === "usage_friction" || friction.frictionClass === "adaptation_friction")
  ) {
    relevance -= 0.18;
  }
  if (/\b(gamer|jogo|jogos|fps)\b/i.test(query) && /hz|fluidez|desempenho/i.test(haystack)) {
    relevance += friction.frictionClass === "usage_friction" ? 0.25 : 0.08;
  }
  if (/\b(levar|transportar|mochila|viajar)\b/i.test(query) && friction.frictionClass === "usage_friction") {
    relevance += 0.18;
  }
  if (context.hasBudget && friction.frictionClass === "expectation_friction") relevance += 0.1;

  const severity = Number(friction.severity || 0.5);
  if (severity >= 0.7 && relevance < 0.55) relevance += 0.08;

  return clamp01(relevance);
}

function buildFrictionEntry({
  frictionClass,
  friction,
  sourceFamily,
  sourceToken,
  sourceConsequence,
  sourceExperience,
  sensation,
  severity,
  context,
  derivedFrom = "experience",
}) {
  const base = {
    frictionClass,
    sourceFamily: sourceFamily || "unknown",
    sourceToken: sourceToken || "",
    sourceConsequence: cleanText(sourceConsequence),
    sourceExperience: cleanText(sourceExperience),
    sensation: cleanText(sensation),
    friction: cleanText(friction),
    severity: clamp01(severity),
    derivedFrom,
    trace: {
      token: sourceToken || null,
      consequence: cleanText(sourceConsequence),
      sensation: cleanText(sensation),
      experience: cleanText(sourceExperience),
      friction: cleanText(friction),
      frictionClass,
    },
  };

  if (!base.friction || !base.sourceConsequence) return null;
  if (GENERIC_CONSEQUENCE_PATTERN.test(base.sourceConsequence)) return null;
  if (isGenericInsightBody(base.sourceConsequence)) return null;

  base.baseRelevance = clamp01(severity * 0.75 + 0.2);
  base.contextualRelevance = calculateFrictionRelevance(base, context);
  base.confidence = clamp01(0.5 + base.severity * 0.25 + base.contextualRelevance * 0.25);
  base.contextScore = base.contextualRelevance * 100 + base.severity * 40 + base.confidence * 20;
  return base;
}

function deriveFrictionFromExperience(experience = {}, context = {}) {
  const haystack = `${experience.sourceConsequence || ""} ${experience.sensation || ""} ${experience.experience || ""}`;
  const rule = resolveFrictionRule(haystack);
  const experienceClass = cleanText(experience.experienceClass || "");
  const map = EXPERIENCE_FRICTION_MAP[experienceClass];

  if (!rule && !map) return null;

  const frictionClass = rule?.frictionClass || map?.frictionClass;
  const friction =
    rule?.friction ||
    (experienceClass === "friction" || experienceClass === "adaptation"
      ? experience.experience
      : null);

  if (!friction) return null;

  return buildFrictionEntry({
    frictionClass,
    friction,
    sourceFamily: experience.sourceFamily,
    sourceToken: experience.sourceToken,
    sourceConsequence: experience.sourceConsequence,
    sourceExperience: experience.experience,
    sensation: experience.sensation,
    severity: map?.baseSeverity || 0.55,
    context,
    derivedFrom: "experience",
  });
}

function deriveFrictionFromSensation(sensation = {}, context = {}) {
  if (sensation.perceptionClass !== "friction" && sensation.perceptionClass !== "adaptation") {
    if (sensation.perceptionClass !== "regret_risk") return null;
  }

  const haystack = `${sensation.consequence || ""} ${sensation.sensation || ""}`;
  const rule = resolveFrictionRule(haystack);
  if (!rule) return null;

  return buildFrictionEntry({
    frictionClass: rule.frictionClass,
    friction: rule.friction,
    sourceFamily: sensation.sourceFamily,
    sourceToken: sensation.sourceToken,
    sourceConsequence: sensation.consequence,
    sourceExperience: sensation.sensation,
    sensation: sensation.sensation,
    severity: sensation.perceptionClass === "friction" ? 0.65 : 0.58,
    context,
    derivedFrom: "sensation",
  });
}

function deriveFrictionFromSacrifice(sacrifice = {}, context = {}) {
  const text = cleanText(typeof sacrifice === "string" ? sacrifice : sacrifice.text || "");
  if (!text || text.length < 6) return null;

  const rule = resolveFrictionRule(text);
  if (!rule) return null;

  return buildFrictionEntry({
    frictionClass: rule.frictionClass,
    friction: rule.friction,
    sourceFamily: sacrifice.token || sacrifice.field || "tradeoff_sacrifice",
    sourceToken: cleanText(sacrifice.token || ""),
    sourceConsequence: text,
    sourceExperience: text,
    sensation: text,
    severity: 0.68,
    context,
    derivedFrom: "tradeoff_sacrifice",
  });
}

function derivePriorityMismatchFriction(experiences = [], context = {}) {
  const primaryAxis = cleanText(context.primaryAxis || "");
  const alignment = PRIORITY_FRICTION_ALIGNMENT.find((entry) => entry.primaryAxis === primaryAxis);
  if (!alignment) return null;

  const weakness = (experiences || []).find((entry) =>
    alignment.pattern.test(
      `${entry.sourceConsequence || ""} ${entry.sensation || ""} ${entry.experience || ""}`
    )
  );
  if (!weakness) return null;

  return buildFrictionEntry({
    frictionClass: "regret_friction",
    friction: "tendência a questionar a escolha quando a prioridade dominante não fecha",
    sourceFamily: weakness.sourceFamily,
    sourceToken: weakness.sourceToken,
    sourceConsequence: weakness.sourceConsequence,
    sourceExperience: weakness.experience,
    sensation: weakness.sensation,
    severity: 0.72,
    context,
    derivedFrom: "priority_mismatch",
  });
}

/**
 * @param {{
 *   winner?: string,
 *   context?: Record<string, unknown>,
 *   sensations?: Array<Record<string, unknown>>,
 *   experiences?: Array<Record<string, unknown>>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   reasoning?: Record<string, unknown>,
 *   query?: string,
 *   primaryAxis?: string,
 *   category?: string,
 *   querySignals?: Record<string, unknown>,
 *   sensationBridge?: { sensations?: Array<Record<string, unknown>> },
 *   humanExperienceModel?: { experiences?: Array<Record<string, unknown>> },
 * }} input
 */
export function buildHumanFrictionModel(input = {}) {
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

  const sensations =
    input.sensations || input.sensationBridge?.sensations || [];
  const experiences =
    input.experiences || input.humanExperienceModel?.experiences || [];

  const frictions = [];
  const seen = new Set();

  const push = (entry) => {
    if (!entry) return;
    const key = `${entry.frictionClass}:${normalizeKey(entry.friction).slice(0, 28)}`;
    if (seen.has(key)) return;
    seen.add(key);
    frictions.push(entry);
  };

  for (const experience of experiences) {
    if (experience.experienceClass === "friction" || experience.experienceClass === "adaptation") {
      push(deriveFrictionFromExperience(experience, ctx));
    }
    if (experience.experienceClass === "regret_risk" || experience.experienceClass === "maintenance") {
      push(deriveFrictionFromExperience(experience, ctx));
    }
  }

  for (const sensation of sensations) {
    push(deriveFrictionFromSensation(sensation, ctx));
  }

  const sacrifices = (input.tradeoffs?.sacrifices || []).map((entry) =>
    typeof entry === "string" ? { text: entry } : entry
  );
  for (const sacrifice of sacrifices) {
    push(deriveFrictionFromSacrifice(sacrifice, ctx));
  }

  push(derivePriorityMismatchFriction(experiences, ctx));

  for (const experience of experiences) {
    push(deriveFrictionFromExperience(experience, ctx));
  }

  for (const sensation of sensations) {
    const haystack = `${sensation.consequence || ""} ${sensation.sensation || ""}`;
    const rule = resolveFrictionRule(haystack);
    if (!rule) continue;
    push(
      buildFrictionEntry({
        frictionClass: rule.frictionClass,
        friction: rule.friction,
        sourceFamily: sensation.sourceFamily,
        sourceToken: sensation.sourceToken,
        sourceConsequence: sensation.consequence,
        sourceExperience: sensation.sensation,
        sensation: sensation.sensation,
        severity: 0.52,
        context: ctx,
        derivedFrom: "sensation_fallback",
      })
    );
  }

  frictions.sort((a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0));

  return {
    ok: frictions.length > 0,
    frictions,
    version: HUMAN_FRICTION_MODELING_VERSION,
    winner: cleanText(input.winner || ""),
    context: ctx,
  };
}

export function isFrictionTraceable(friction = {}) {
  return Boolean(
    friction?.trace?.consequence &&
      friction?.trace?.sensation &&
      friction?.trace?.experience &&
      friction?.trace?.friction &&
      friction?.trace?.frictionClass &&
      FRICTION_CLASSES.includes(friction.trace.frictionClass) &&
      !GENERIC_CONSEQUENCE_PATTERN.test(friction.sourceConsequence || "")
  );
}

export function classifyFrictionOrigin(friction = {}) {
  if (!friction) return "placeholder";
  if (isFrictionTraceable(friction)) {
    if (friction.contextualRelevance >= 0.7) return "real";
    if (friction.contextualRelevance >= 0.45) return "derived";
    return "derived";
  }
  if (friction.frictionClass) return "pseudo";
  return "placeholder";
}

/**
 * @param {Array<Record<string, unknown>>} frictions
 * @param {Record<string, unknown>} context
 * @param {Record<string, unknown>} [selectedExperience]
 */
export function selectPrimaryFriction(frictions = [], context = {}, selectedExperience = null) {
  const ranked = [...(frictions || [])].sort(
    (a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0)
  );

  if (selectedExperience?.sourceConsequence) {
    const aligned = ranked.find(
      (entry) => entry.sourceConsequence === selectedExperience.sourceConsequence
    );
    if (aligned) return aligned;
  }

  return ranked.find((entry) => entry.contextualRelevance >= 0.45) || ranked[0] || null;
}

/**
 * Enriquece decision meaning com modelo de atrito — sem alterar verbalização obrigatória.
 * @param {Record<string, unknown>} meaning
 * @param {Record<string, unknown>} friction
 */
export function enrichDecisionMeaningWithFriction(meaning = {}, friction = null) {
  if (!meaning || !friction || !isFrictionTraceable(friction)) return meaning;

  return {
    ...meaning,
    friction: friction.friction,
    frictionClass: friction.frictionClass,
    frictionRelevance: friction.contextualRelevance,
    frictionSeverity: friction.severity,
    frictionContextApplied: friction.contextualRelevance >= 0.55,
    trace: {
      ...(meaning.trace || {}),
      friction: friction.friction,
      frictionClass: friction.frictionClass,
      experience: meaning.trace?.experience || friction.trace?.experience,
    },
  };
}

/**
 * Ajusta seleção de experiência quando atrito contextual é dominante.
 * @param {Array<Record<string, unknown>>} experiences
 * @param {Array<Record<string, unknown>>} frictions
 * @param {Record<string, unknown>} context
 * @param {string[]} existingParagraphs
 * @param {Record<string, unknown>} selectedSensation
 */
export function resolveInsightExperienceWithFriction(
  experiences = [],
  frictions = [],
  context = {},
  existingParagraphs = [],
  selectedSensation = null
) {
  const topFriction = selectPrimaryFriction(frictions, context);
  if (topFriction?.contextualRelevance >= 0.65) {
    const aligned = (experiences || []).find(
      (entry) =>
        entry.sourceConsequence === topFriction.sourceConsequence ||
        entry.sourceToken === topFriction.sourceToken
    );
    if (aligned) return { experience: aligned, friction: topFriction };
  }

  if (selectedSensation?.perceptionClass) {
    const aligned = (experiences || []).find(
      (entry) =>
        entry.perceptionClass === selectedSensation.perceptionClass ||
        entry.sourceConsequence === selectedSensation.consequence
    );
    if (aligned) {
      return {
        experience: aligned,
        friction: selectPrimaryFriction(frictions, context, aligned),
      };
    }
  }

  const experience = (experiences || [])[0] || null;
  return {
    experience,
    friction: experience ? selectPrimaryFriction(frictions, context, experience) : topFriction,
  };
}
