/**
 * PATCH 9.2T — Human Sensation Reasoning Layer
 *
 * Consequence → Sensation → Human Experience Model.
 * Modela convivência, adaptação, ownership, arrependimento e uso prolongado —
 * sem copy, sem templates e sem hardcode por categoria.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";

export const HUMAN_SENSATION_REASONING_VERSION = "9.2T.1";

export const EXPERIENCE_CLASSES = Object.freeze([
  "comfort",
  "friction",
  "adaptation",
  "ownership",
  "predictability",
  "reliability",
  "maintenance",
  "regret_risk",
  "confidence",
  "satisfaction",
  "long_term_use",
]);

const GENERIC_CONSEQUENCE_PATTERN =
  /ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|renúncia percept[ií]vel|combina com o perfil de uso descrito/i;

const PERCEPTION_EXPERIENCE_RULES = Object.freeze([
  {
    perceptionClass: "friction",
    experienceClass: "friction",
    experience: "convivência com atrito recorrente no uso fora do contexto ideal",
    contextMatch: ({ query }) => /\b(levar|transportar|portátil|portatil|mochila|viajar)\b/i.test(query),
    contextWeight: 14,
  },
  {
    perceptionClass: "friction",
    experienceClass: "friction",
    pattern: /fluidez|60\s*hz|hz|fluida|transições/i,
    experience: "gesto diário com menor fluidez perceptível até a rotina se ajustar",
    contextMatch: ({ primaryAxis }) => primaryAxis === "screen",
    contextWeight: 16,
  },
  {
    perceptionClass: "friction",
    experienceClass: "friction",
    pattern: /recarga|carregar|tomada|interromper/i,
    experience: "rotina marcada por interrupções para recuperar energia",
    contextMatch: ({ primaryAxis }) => primaryAxis === "battery",
    contextWeight: 16,
  },
  {
    perceptionClass: "friction",
    experienceClass: "friction",
    pattern: /ocupa|bancada|peso|transport/i,
    experience: "uso exige mais planejamento de espaço ou deslocamento",
    contextWeight: 10,
  },
  {
    perceptionClass: "comfort",
    experienceClass: "comfort",
    experience: "convivência com menos esforço físico ou operacional recorrente",
    contextMatch: ({ query }) => /ergonom|home office|horas|sessões/i.test(query),
    contextWeight: 14,
  },
  {
    perceptionClass: "comfort",
    experienceClass: "comfort",
    pattern: /autonomia|bateria|durar o dia|interromper/i,
    experience: "dia a dia com menos interrupções por necessidade de recarga",
    contextMatch: ({ primaryAxis }) => primaryAxis === "battery",
    contextWeight: 15,
  },
  {
    perceptionClass: "comfort",
    experienceClass: "comfort",
    pattern: /ecossistema|previsível|apps|backups/i,
    experience: "rotina digital com menos atrito entre tarefas e serviços",
    contextWeight: 11,
  },
  {
    perceptionClass: "adaptation",
    experienceClass: "adaptation",
    experience: "período de ajuste ao gesto, layout ou ritmo antes da rotina estabilizar",
    contextMatch: ({ primaryAxis }) => primaryAxis === "screen",
    contextWeight: 15,
  },
  {
    perceptionClass: "adaptation",
    experienceClass: "adaptation",
    pattern: /ios|android|ecossistema|trocar de/i,
    experience: "curva de adaptação ao ecossistema ou interface escolhida",
    contextWeight: 12,
  },
  {
    perceptionClass: "adaptation",
    experienceClass: "adaptation",
    pattern: /menor|compacto|tela pequena|layout/i,
    experience: "ajuste inicial ao formato ou disposição do equipamento",
    contextWeight: 10,
  },
  {
    perceptionClass: "ownership",
    experienceClass: "ownership",
    experience: "relação prolongada com o item sem pressa de troca antecipada",
    contextMatch: ({ query }) => /\b(longevo|longevidade|anos|durar|manter)\b/i.test(query),
    contextWeight: 16,
  },
  {
    perceptionClass: "ownership",
    experienceClass: "ownership",
    pattern: /longevidade|vários anos|permanecer|suporte/i,
    experience: "viver com a escolha como aparelho principal por um ciclo longo",
    contextWeight: 13,
  },
  {
    perceptionClass: "ownership",
    experienceClass: "ownership",
    pattern: /ecossistema|estável|consolidado/i,
    experience: "convivência estável dentro de um ecossistema já conhecido",
    contextWeight: 11,
  },
  {
    perceptionClass: "predictability",
    experienceClass: "predictability",
    experience: "rotina com comportamento previsível entre atualizações e apps",
    contextMatch: ({ query }) => /\b(ios|android|ecossistema|apple|samsung)\b/i.test(query),
    contextWeight: 13,
  },
  {
    perceptionClass: "reliability",
    experienceClass: "reliability",
    experience: "uso contínuo sem sensação frequente de limite no meio das tarefas",
    contextMatch: ({ primaryAxis }) => primaryAxis === "performance",
    contextWeight: 15,
  },
  {
    perceptionClass: "reliability",
    experienceClass: "reliability",
    pattern: /travar|limite|multitarefa|pesado/i,
    experience: "confiança de que o equipamento acompanha picos de exigência",
    contextWeight: 12,
  },
  {
    perceptionClass: "convenience",
    experienceClass: "comfort",
    experience: "convivência com menos microinterrupções no fluxo do dia",
    contextMatch: ({ primaryAxis }) => primaryAxis === "battery",
    contextWeight: 14,
  },
  {
    perceptionClass: "convenience",
    experienceClass: "comfort",
    pattern: /folga|capacidade|limite cedo/i,
    experience: "uso diário longe do limite antes do previsto",
    contextWeight: 10,
  },
  {
    perceptionClass: "confidence",
    experienceClass: "confidence",
    experience: "tranquilidade em registrar momentos que não dá para repetir",
    contextMatch: ({ primaryAxis, query }) =>
      primaryAxis === "camera" || /\b(foto|fotos|câmera|camera|vídeo|video|registrar)\b/i.test(query),
    contextWeight: 22,
  },
  {
    perceptionClass: "confidence",
    experienceClass: "confidence",
    pattern: /foto|fotos|registrar|momentos|vídeo|video/i,
    experience: "menos tensão em situações que exigem captura rápida",
    contextWeight: 13,
  },
  {
    perceptionClass: "regret_risk",
    experienceClass: "regret_risk",
    experience: "risco de arrependimento quando o uso real não cobre o que a busca pediu",
    contextMatch: ({ querySignals, hasBudget }) =>
      querySignals?.priceSensitive === true || hasBudget,
    contextWeight: 15,
  },
  {
    perceptionClass: "regret_risk",
    experienceClass: "regret_risk",
    pattern: /preço|custo|barato|caro|orçamento|retorno/i,
    experience: "decisão sensível ao encaixe entre gasto e uso efetivo",
    contextWeight: 12,
  },
]);

const SACRIFICE_EXPERIENCE_RULES = Object.freeze([
  {
    pattern: /60\s*hz|fluidez|fluida|hz/i,
    experienceClass: "friction",
    experience: "convivência com menor fluidez perceptível no gesto cotidiano",
  },
  {
    pattern: /bateria|autonomia|recarga/i,
    experienceClass: "regret_risk",
    experience: "risco de frustração quando o dia exige mais energia que o previsto",
  },
  {
    pattern: /câmera|camera|foto|fotos/i,
    experienceClass: "regret_risk",
    experience: "risco de arrependimento em registros importantes",
  },
  {
    pattern: /peso|portátil|transport/i,
    experienceClass: "friction",
    experience: "esforço recorrente ao transportar ou reposicionar",
  },
  {
    pattern: /preço|caro|custo/i,
    experienceClass: "regret_risk",
    experience: "pressão para justificar o gasto no uso real",
  },
  {
    pattern: /limpeza|manuten|filtro|peça/i,
    experienceClass: "maintenance",
    experience: "rotina periódica de cuidado para manter desempenho",
  },
]);

const LONG_TERM_RULES = Object.freeze([
  {
    pattern: /longevidade|anos|suporte|atualiza|permanecer/i,
    experienceClass: "long_term_use",
    experience: "tendência de satisfação prolongada enquanto o suporte e o uso acompanham",
  },
  {
    pattern: /desgaste|troca cedo|limitar cedo/i,
    experienceClass: "long_term_use",
    experience: "tendência de frustração futura se o uso ultrapassar a folga inicial",
  },
  {
    pattern: /confiável|consistente|estável/i,
    experienceClass: "satisfaction",
    experience: "tendência de satisfação estável após os primeiros meses de uso",
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

function overlapsExisting(text = "", existing = []) {
  const key = normalizeKey(text);
  if (!key || key.length < 18) return false;
  return existing.some((block) => {
    const prev = normalizeKey(block);
    if (!prev) return false;
    return prev.includes(key) || key.includes(prev);
  });
}

function resolveExperienceRule(sensation = {}, context = {}) {
  const perceptionClass = cleanText(sensation.perceptionClass || "");
  const consequence = cleanText(sensation.consequence || "");
  const sensationText = cleanText(sensation.sensation || "");

  const candidates = PERCEPTION_EXPERIENCE_RULES.filter(
    (rule) => rule.perceptionClass === perceptionClass
  );

  let best = null;
  let bestScore = 0;

  for (const rule of candidates) {
    let score = 8;
    if (rule.pattern && !(rule.pattern.test(consequence) || rule.pattern.test(sensationText))) {
      continue;
    }
    if (rule.contextMatch?.(context)) score += Number(rule.contextWeight || 10);
    if (sensation.sourceToken) score += 6;
    if (sensation.audienceFit) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }

  if (!best && candidates.length) {
    best = candidates.find((rule) => !rule.pattern) || candidates[0];
    bestScore = 10;
  }

  return best ? { rule: best, score: bestScore } : null;
}

function deriveExperienceFromSensation(sensation = {}, context = {}) {
  if (!sensation?.sensation || !sensation?.consequence) return null;
  if (GENERIC_CONSEQUENCE_PATTERN.test(sensation.consequence)) return null;
  if (isGenericInsightBody(sensation.consequence)) return null;

  const resolved = resolveExperienceRule(sensation, context);
  if (!resolved?.rule) return null;

  const { rule, score } = resolved;
  let confidence = Math.min(0.98, Number(sensation.confidence || 0.55) + score / 100);
  if (rule.contextMatch?.(context)) confidence += 0.08;
  if (context.primaryAxis && rule.contextMatch?.(context)) confidence += 0.05;

  return {
    experienceClass: rule.experienceClass,
    sourceFamily: sensation.sourceFamily || "unknown",
    sourceToken: sensation.sourceToken || "",
    sourceConsequence: sensation.consequence,
    sensation: sensation.sensation,
    experience: rule.experience,
    perceptionClass: sensation.perceptionClass || "",
    audienceFit: sensation.audienceFit || "",
    confidence: Math.min(confidence, 0.99),
    contextApplied: Boolean(rule.contextMatch?.(context)),
    trace: {
      token: sensation.sourceToken || sensation.trace?.token || null,
      consequence: sensation.consequence,
      sensation: sensation.sensation,
      experience: rule.experience,
      experienceClass: rule.experienceClass,
    },
    contextScore: score + (sensation.contextScore || 0),
  };
}

function deriveExperienceFromSacrifice(sacrifice = {}, context = {}) {
  const text = cleanText(typeof sacrifice === "string" ? sacrifice : sacrifice.text || "");
  if (!text || text.length < 6) return null;

  const rule = SACRIFICE_EXPERIENCE_RULES.find((entry) => entry.pattern.test(text));
  if (!rule) return null;

  let confidence = 0.52;
  if (context.primaryAxis === "screen" && rule.experienceClass === "friction") confidence += 0.2;
  if (context.primaryAxis === "battery" && /bateria|autonomia/i.test(text)) confidence += 0.2;
  if (context.primaryAxis === "camera" && /câmera|camera|foto/i.test(text)) confidence += 0.2;
  if (context.querySignals?.priceSensitive && rule.experienceClass === "regret_risk") confidence += 0.1;

  return {
    experienceClass: rule.experienceClass,
    sourceFamily: sacrifice.token || sacrifice.field || "tradeoff_sacrifice",
    sourceToken: cleanText(sacrifice.token || ""),
    sourceConsequence: text,
    sensation: text,
    experience: rule.experience,
    perceptionClass: rule.experienceClass,
    audienceFit: "",
    confidence: Math.min(confidence, 0.92),
    contextApplied: confidence > 0.6,
    trace: {
      token: sacrifice.token || null,
      consequence: text,
      sensation: text,
      experience: rule.experience,
      experienceClass: rule.experienceClass,
    },
    contextScore: confidence * 100,
    derivedFrom: "tradeoff_sacrifice",
  };
}

function deriveLongTermExperience(sensation = {}, context = {}) {
  const haystack = `${sensation.consequence || ""} ${sensation.sensation || ""}`;
  const rule = LONG_TERM_RULES.find((entry) => entry.pattern.test(haystack));
  if (!rule) return null;

  return {
    experienceClass: rule.experienceClass,
    sourceFamily: sensation.sourceFamily || "long_term",
    sourceToken: sensation.sourceToken || "",
    sourceConsequence: sensation.consequence,
    sensation: sensation.sensation,
    experience: rule.experience,
    perceptionClass: sensation.perceptionClass || "",
    audienceFit: sensation.audienceFit || "",
    confidence: Math.min(0.9, Number(sensation.confidence || 0.5) + 0.15),
    contextApplied: /\b(longevo|longevidade|anos|durar)\b/i.test(context.query || ""),
    trace: {
      token: sensation.sourceToken || null,
      consequence: sensation.consequence,
      sensation: sensation.sensation,
      experience: rule.experience,
      experienceClass: rule.experienceClass,
    },
    contextScore: (sensation.contextScore || 0) + 8,
    derivedFrom: "long_term_projection",
  };
}

function scoreExperienceForContext(experience = {}, context = {}) {
  let score = Number(experience.contextScore || 0);
  if (experience.contextApplied) score += 18;
  if (experience.audienceFit) score += 12;
  if (context.primaryAxis === "camera" && experience.experienceClass === "confidence") score += 28;
  if (context.primaryAxis === "battery" && experience.experienceClass === "comfort") score += 18;
  if (context.primaryAxis === "camera" && experience.experienceClass === "comfort") score -= 12;
  if (context.primaryAxis === "screen" && experience.experienceClass === "friction") score += 10;
  if (context.primaryAxis === "longevity" && experience.experienceClass === "long_term_use") score += 12;
  if (context.primaryAxis === "value" && experience.experienceClass === "regret_risk") score += 10;
  if (context.querySignals?.priceSensitive && experience.experienceClass === "regret_risk") score += 8;
  return score;
}

/**
 * @param {{
 *   winner?: string,
 *   context?: Record<string, unknown>,
 *   sensations?: Array<Record<string, unknown>>,
 *   consequences?: Array<Record<string, unknown>>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   reasoning?: Record<string, unknown>,
 *   structuredFacts?: Record<string, unknown>,
 *   semanticCandidateData?: Record<string, unknown>,
 *   query?: string,
 *   primaryAxis?: string,
 *   category?: string,
 *   querySignals?: Record<string, unknown>,
 *   sensationBridge?: { sensations?: Array<Record<string, unknown>> },
 * }} input
 */
export function buildHumanExperienceModel(input = {}) {
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
    input.sensations ||
    input.sensationBridge?.sensations ||
    [];

  const experiences = [];
  const seenClasses = new Set();

  for (const sensation of sensations) {
    const primary = deriveExperienceFromSensation(sensation, ctx);
    if (primary && !seenClasses.has(`${primary.experienceClass}:${normalizeKey(primary.experience).slice(0, 24)}`)) {
      seenClasses.add(`${primary.experienceClass}:${normalizeKey(primary.experience).slice(0, 24)}`);
      experiences.push({
        ...primary,
        contextScore: scoreExperienceForContext(primary, ctx),
      });
    }

    const longTerm = deriveLongTermExperience(sensation, ctx);
    if (
      longTerm &&
      !seenClasses.has(`${longTerm.experienceClass}:${normalizeKey(longTerm.experience).slice(0, 24)}`)
    ) {
      seenClasses.add(`${longTerm.experienceClass}:${normalizeKey(longTerm.experience).slice(0, 24)}`);
      experiences.push({
        ...longTerm,
        contextScore: scoreExperienceForContext(longTerm, ctx),
      });
    }
  }

  const sacrifices = (input.tradeoffs?.sacrifices || []).map((entry) =>
    typeof entry === "string" ? { text: entry } : entry
  );
  for (const sacrifice of sacrifices) {
    const derived = deriveExperienceFromSacrifice(sacrifice, ctx);
    if (
      derived &&
      !seenClasses.has(`${derived.experienceClass}:${normalizeKey(derived.experience).slice(0, 24)}`)
    ) {
      seenClasses.add(`${derived.experienceClass}:${normalizeKey(derived.experience).slice(0, 24)}`);
      experiences.push({
        ...derived,
        contextScore: scoreExperienceForContext(derived, ctx),
      });
    }
  }

  experiences.sort((a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0));

  return {
    ok: experiences.length > 0,
    experiences,
    version: HUMAN_SENSATION_REASONING_VERSION,
    winner: cleanText(input.winner || ""),
    context: ctx,
  };
}

/**
 * @param {Array<Record<string, unknown>>} experiences
 * @param {Record<string, unknown>} context
 * @param {string[]} existingParagraphs
 * @param {Record<string, unknown>} [selectedSensation]
 */
export function selectInsightExperience(
  experiences = [],
  context = {},
  existingParagraphs = [],
  selectedSensation = null
) {
  const ranked = [...(experiences || [])].sort(
    (a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0)
  );

  if (selectedSensation?.perceptionClass) {
    const aligned = ranked.find(
      (entry) =>
        entry.perceptionClass === selectedSensation.perceptionClass ||
        entry.sourceConsequence === selectedSensation.consequence
    );
    if (
      aligned &&
      !overlapsExisting(aligned.experience, existingParagraphs) &&
      !overlapsExisting(aligned.sensation, existingParagraphs)
    ) {
      return aligned;
    }
  }

  for (const experience of ranked) {
    if (overlapsExisting(experience.experience, existingParagraphs)) continue;
    if (overlapsExisting(experience.sensation, existingParagraphs)) continue;
    return experience;
  }

  return ranked[0] || null;
}

/**
 * @param {Record<string, unknown>} experience
 * @param {Record<string, unknown>} [context]
 */
export function buildDecisionMeaningFromExperience(experience = {}, context = {}) {
  if (!experience?.experience || !experience?.sensation || !experience?.sourceConsequence) {
    return null;
  }

  return {
    perceptionClass: experience.perceptionClass || experience.experienceClass,
    experienceClass: experience.experienceClass,
    sensation: experience.sensation,
    experience: experience.experience,
    consequence: experience.sourceConsequence,
    audienceFit: experience.audienceFit || "",
    sourceToken: experience.sourceToken || "",
    sourceFamily: experience.sourceFamily || "",
    confidence: experience.confidence || 0,
    contextApplied: experience.contextApplied === true,
    trace: experience.trace || null,
    context: {
      primaryAxis: context.primaryAxis || "",
      query: context.query || "",
    },
  };
}

export function isExperienceTraceable(experience = {}) {
  return Boolean(
    experience?.trace?.consequence &&
      experience?.trace?.sensation &&
      experience?.trace?.experience &&
      experience?.trace?.experienceClass &&
      EXPERIENCE_CLASSES.includes(experience.trace.experienceClass) &&
      !GENERIC_CONSEQUENCE_PATTERN.test(experience.sourceConsequence || "")
  );
}

export function classifyExperienceOrigin(experience = {}) {
  if (!experience) return "placeholder";
  if (isExperienceTraceable(experience)) {
    if (experience.contextApplied && experience.audienceFit) return "real";
    if (experience.contextApplied || experience.audienceFit) return "derived";
    return "derived";
  }
  if (experience.experienceClass) return "pseudo";
  return "placeholder";
}

export function findExperienceForSensation(experiences = [], sensation = {}) {
  if (!sensation) return null;
  return (
    (experiences || []).find(
      (entry) =>
        entry.sourceConsequence === sensation.consequence ||
        entry.perceptionClass === sensation.perceptionClass
    ) || null
  );
}
