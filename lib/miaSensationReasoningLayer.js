/**
 * PATCH 9.2S — Sensation Reasoning Layer
 *
 * Ponte universal Impact → Consequence → Sensation → Decision Meaning.
 * Não verbaliza marketing; deriva percepção humana rastreável a token/consequência.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { inferSemanticFamilyFromText } from "./miaSemanticFamilyAllocationEngine.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";

export const SENSATION_REASONING_VERSION = "9.2S.1";

export const PERCEPTION_CLASSES = Object.freeze([
  "confidence",
  "friction",
  "comfort",
  "predictability",
  "convenience",
  "ownership",
  "adaptation",
  "reliability",
  "regret_risk",
]);

const GENERIC_CONSEQUENCE_PATTERN =
  /ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|renúncia percept[ií]vel|combina com o perfil de uso descrito/i;

const CONSEQUENCE_SENSATION_RULES = Object.freeze([
  {
    perceptionClass: "convenience",
    pattern: /bateria|autonomia|recarga|tomada|durar o dia|ansiedade com recarga/i,
    sensation: "menos necessidade de interromper o uso para procurar energia",
  },
  {
    perceptionClass: "confidence",
    pattern: /registrar|foto|fotos|momentos|segunda chance|situações rápidas|vídeo|video|gravar/i,
    sensation: "menos preocupação em perder registros que não dá para refazer",
  },
  {
    perceptionClass: "adaptation",
    pattern: /fluidez|fluida|60\s*hz|hz|navegação|painel|tela.*rápida|transições/i,
    sensation: "quem já usa telas mais fluidas pode notar diferença no gesto do dia a dia",
  },
  {
    perceptionClass: "predictability",
    pattern: /ecossistema|previsibilidade|ios|android|atualiza|apps|consolidado/i,
    sensation: "a rotina digital fica mais previsível entre apps, backups e atualizações",
  },
  {
    perceptionClass: "reliability",
    pattern: /limite|pesado|desempenho|multitarefa|travar|folga quando o uso/i,
    sensation: "menos sensação de o equipamento chegar ao limite no meio do que você já faz",
  },
  {
    perceptionClass: "ownership",
    pattern: /longevidade|permanecer|vários anos|anos como dispositivo|troca necessária/i,
    sensation: "menos pressa para trocar cedo só porque o uso diário começou a limitar",
  },
  {
    perceptionClass: "friction",
    pattern: /portabil|transportar|peso|mochila|ocupa|bancada|encaixe/i,
    sensation: "usar fora do contexto ideal exige mais planejamento do que alternativas mais leves",
  },
  {
    perceptionClass: "comfort",
    pattern: /conforto|ergonom|sessões longas|horas sentado|home office/i,
    sensation: "sessões prolongadas cansam menos quando o apoio acompanha o uso",
  },
  {
    perceptionClass: "regret_risk",
    pattern: /preço|preco|custo|barato|caro|orçamento|retorno pelo que você vai gastar/i,
    sensation: "o risco de arrependimento cai quando o uso cobre o que a busca realmente pede",
  },
  {
    perceptionClass: "convenience",
    pattern: /folga para o uso|capacidade|limite cedo demais|uso previsto/i,
    sensation: "o uso deixa de ficar no limite antes do que você esperava no dia a dia",
  },
]);

const AUDIENCE_CONTEXT_RULES = Object.freeze([
  {
    perceptionClass: "convenience",
    match: ({ primaryAxis, query }) =>
      primaryAxis === "battery" || /\b(bateria|autonomia|tomada|recarga)\b/i.test(query),
    audienceFit: "para quem passa muitas horas longe de tomadas",
  },
  {
    perceptionClass: "confidence",
    match: ({ primaryAxis, query }) =>
      primaryAxis === "camera" || /\b(foto|fotos|câmera|camera|vídeo|video|registrar)\b/i.test(query),
    audienceFit: "para quem registra momentos que não dá para repetir",
  },
  {
    perceptionClass: "adaptation",
    match: ({ primaryAxis, query }) =>
      primaryAxis === "screen" || /\b(tela|hz|120|fluid|fluidez)\b/i.test(query),
    audienceFit: "para quem já está acostumado com telas mais fluidas",
  },
  {
    perceptionClass: "ownership",
    match: ({ query }) => /\b(longevo|longevidade|anos|durar|manter)\b/i.test(query),
    audienceFit: "para quem pretende manter o aparelho por vários anos",
  },
  {
    perceptionClass: "regret_risk",
    match: ({ query, hasBudget }) =>
      hasBudget || /\b(barato|custo|beneficio|benefício|orçamento|ate\s*\d|\d\s*k)\b/i.test(query),
    audienceFit: "para quem não quer pagar por algo que não encaixa no uso real",
  },
  {
    perceptionClass: "reliability",
    match: ({ primaryAxis, query }) =>
      primaryAxis === "performance" || /\b(desempenho|gamer|trabalho pesado|multitarefa)\b/i.test(query),
    audienceFit: "para quem abre várias tarefas sem querer sentir o aparelho no limite",
  },
  {
    perceptionClass: "comfort",
    match: ({ query, category }) =>
      /cadeira|ergonom|home office|notebook/i.test(query) || category === "cadeira",
    audienceFit: "para quem passa muitas horas seguidas na mesa",
  },
  {
    perceptionClass: "friction",
    match: ({ query }) => /\b(levar|transportar|portátil|portatil|mochila|viajar)\b/i.test(query),
    audienceFit: "para quem precisa transportar com frequência",
  },
  {
    perceptionClass: "predictability",
    match: ({ query }) => /\b(ios|android|ecossistema|apple|samsung)\b/i.test(query),
    audienceFit: "para quem já vive dentro de um ecossistema e quer previsibilidade",
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

function capitalizeLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toUpperCase() + body.slice(1);
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

function collectConsequenceEntries(input = {}) {
  const structuredFacts = input.structuredFacts || {};
  const entries = [];
  const push = (text, meta = {}) => {
    const body = cleanText(text);
    if (!body || body.length < 12) return;
    if (GENERIC_CONSEQUENCE_PATTERN.test(body) || isGenericInsightBody(body)) return;
    entries.push({
      text: body,
      token: cleanText(meta.token || ""),
      field: cleanText(meta.field || ""),
      type: cleanText(meta.type || "strength"),
      sourceFamily:
        meta.sourceFamily ||
        inferSemanticFamilyFromText(body, {
          token: meta.token,
          primaryAxis: input.primaryAxis,
          type: meta.type,
        }),
    });
  };

  for (const text of structuredFacts.strengthConsequences || []) {
    push(text, { field: "strengths", type: "strength" });
  }
  for (const text of structuredFacts.weaknessConsequences || []) {
    push(text, { field: "weaknesses", type: "weakness" });
  }
  for (const text of structuredFacts.idealForConsequences || []) {
    push(text, { field: "ideal_for", type: "ideal_for" });
  }
  for (const text of structuredFacts.microConsequences || []) {
    push(text, { field: "micro", type: "micro" });
  }
  for (const text of structuredFacts.noteConsequences || []) {
    push(text, { field: "notes", type: "note" });
  }

  const pool = input.semanticCandidateData?.pool || [];
  for (const item of pool) {
    if (!item?.text) continue;
    push(item.text, {
      token: item.token,
      field: item.field,
      type: item.type,
      sourceFamily: item.family,
    });
  }

  const reasoning = input.reasoning || {};
  if (reasoning.impact) push(reasoning.impact, { field: "reasoning", type: "impact" });
  if (reasoning.consequence) push(reasoning.consequence, { field: "reasoning", type: "consequence" });

  return entries;
}

function deriveSensationFromConsequence(entry = {}, context = {}) {
  const consequence = cleanText(entry.text);
  if (!consequence) return null;

  const rule = CONSEQUENCE_SENSATION_RULES.find((item) => item.pattern.test(consequence));
  if (!rule) return null;

  const audienceRule = AUDIENCE_CONTEXT_RULES.find(
    (item) =>
      item.perceptionClass === rule.perceptionClass &&
      item.match({
        primaryAxis: context.primaryAxis || "",
        query: context.query || "",
        category: context.category || "",
        hasBudget: context.hasBudget === true,
      })
  );

  let confidence = 0.55;
  if (audienceRule) confidence += 0.25;
  if (entry.token) confidence += 0.1;
  if (context.primaryAxis && rule.perceptionClass === "reliability" && context.primaryAxis === "performance") {
    confidence += 0.05;
  }

  return {
    sourceFamily: entry.sourceFamily || "unknown",
    sourceToken: entry.token || "",
    consequence,
    sensation: rule.sensation,
    perceptionClass: rule.perceptionClass,
    audienceFit: audienceRule?.audienceFit || "",
    confidence: Math.min(confidence, 0.98),
    trace: {
      token: entry.token || null,
      consequence,
      sensation: rule.sensation,
      perceptionClass: rule.perceptionClass,
    },
  };
}

function scoreSensationForContext(sensation = {}, context = {}) {
  let score = Number(sensation.confidence || 0) * 100;
  if (sensation.audienceFit) score += 20;
  if (context.primaryAxis === "battery" && sensation.perceptionClass === "convenience") score += 15;
  if (context.primaryAxis === "camera" && sensation.perceptionClass === "confidence") score += 15;
  if (context.primaryAxis === "screen" && sensation.perceptionClass === "adaptation") score += 15;
  if (context.primaryAxis === "value" && sensation.perceptionClass === "regret_risk") score += 12;
  if (context.querySignals?.priceSensitive && sensation.perceptionClass === "regret_risk") score += 10;
  if (context.querySignals?.rushed && sensation.sensation?.length < 120) score += 6;
  return score;
}

/**
 * @param {{
 *   winner?: string,
 *   context?: Record<string, unknown>,
 *   structuredFacts?: Record<string, unknown>|null,
 *   consequences?: Array<Record<string, unknown>>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   reasoning?: Record<string, unknown>,
 *   semanticCandidateData?: { pool?: Array<Record<string, unknown>> },
 *   query?: string,
 *   primaryAxis?: string,
 *   category?: string,
 *   querySignals?: Record<string, unknown>,
 * }} input
 */
export function buildSensationBridge(input = {}) {
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

  const consequenceEntries = input.consequences?.length
    ? input.consequences
    : collectConsequenceEntries({
        structuredFacts: input.structuredFacts,
        semanticCandidateData: input.semanticCandidateData,
        reasoning: input.reasoning,
        primaryAxis,
      });

  const sensations = [];
  const seenPerception = new Set();

  for (const entry of consequenceEntries) {
    const derived = deriveSensationFromConsequence(entry, ctx);
    if (!derived) continue;
    if (seenPerception.has(derived.perceptionClass)) continue;
    seenPerception.add(derived.perceptionClass);
    sensations.push({
      ...derived,
      contextScore: scoreSensationForContext(derived, ctx),
    });
  }

  sensations.sort((a, b) => b.contextScore - a.contextScore);

  return {
    ok: sensations.length > 0,
    sensations,
    version: SENSATION_REASONING_VERSION,
    winner: cleanText(input.winner || ""),
    context: ctx,
  };
}

/**
 * @param {Array<Record<string, unknown>>} sensations
 * @param {Record<string, unknown>} context
 * @param {string[]} existingParagraphs
 * @param {Set<string>} [usedPerceptionClasses]
 */
export function selectInsightSensation(
  sensations = [],
  context = {},
  existingParagraphs = [],
  usedPerceptionClasses = new Set()
) {
  const ranked = [...(sensations || [])].sort(
    (a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0)
  );

  for (const sensation of ranked) {
    if (usedPerceptionClasses.has(sensation.perceptionClass)) continue;
    if (overlapsExisting(sensation.consequence, existingParagraphs)) continue;
    if (overlapsExisting(sensation.sensation, existingParagraphs)) continue;
    return sensation;
  }

  return ranked[0] || null;
}

/**
 * @param {Record<string, unknown>} sensation
 * @param {Record<string, unknown>} [context]
 */
export function buildDecisionMeaningFromSensation(sensation = {}, context = {}) {
  if (!sensation?.sensation || !sensation?.consequence) {
    return null;
  }

  return {
    perceptionClass: sensation.perceptionClass,
    sensation: sensation.sensation,
    consequence: sensation.consequence,
    audienceFit: sensation.audienceFit || "",
    sourceToken: sensation.sourceToken || "",
    sourceFamily: sensation.sourceFamily || "",
    confidence: sensation.confidence || 0,
    trace: sensation.trace || null,
    context: {
      primaryAxis: context.primaryAxis || "",
      query: context.query || "",
    },
  };
}

/**
 * Composição mínima a partir de slots derivados — sem pool de frases fixas.
 * @param {ReturnType<typeof buildDecisionMeaningFromSensation>} meaning
 */
export function verbalizeInsightFromDecisionMeaning(meaning = {}) {
  const humanSlot = cleanText(meaning.experience || meaning.sensation || "");
  if (!humanSlot) return "";

  if (meaning.audienceFit) {
    return capitalizeLead(
      `${meaning.audienceFit}, ${humanSlot} costuma pesar mais do que parece na comparação.`
    );
  }

  const consequenceLead = (meaning.consequence || "")
    .replace(/[.!?]+$/, "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");

  const frame = meaning.experience ? "Na convivência diária" : "Na prática";

  return capitalizeLead(
    `${frame}, ${humanSlot} costuma pesar mais do que parece quando ${consequenceLead.toLowerCase()}.`
  );
}

export function isSensationInsightTraceable(meaning = {}) {
  const hasHumanChain = Boolean(meaning?.experience && meaning?.trace?.experience);
  return Boolean(
    meaning?.trace?.consequence &&
      meaning?.trace?.sensation &&
      (meaning?.trace?.perceptionClass || meaning?.trace?.experienceClass) &&
      !GENERIC_CONSEQUENCE_PATTERN.test(meaning.consequence) &&
      (hasHumanChain || meaning?.trace?.perceptionClass)
  );
}

export function classifyInsightOrigin(meaning = {}) {
  if (!meaning) return "placeholder";
  if (isSensationInsightTraceable(meaning)) {
    if (meaning.audienceFit) return "real";
    return "derived";
  }
  if (meaning.perceptionClass) return "pseudo";
  return "placeholder";
}
