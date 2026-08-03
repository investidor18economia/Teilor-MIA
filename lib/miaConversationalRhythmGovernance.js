/**
 * PATCH 5.8.4 — Conversational Rhythm Governance
 *
 * Governs cadence, natural variation and anti-repetition for the active conversation.
 * Does NOT decide intent, write fixed responses, alter personality or continuity.
 * Informs the pipeline HOW to express at this moment.
 */

import { hashSeed, pickHumanizedVariant } from "./miaVerbalizerHumanization.js";
import { RESPONSE_DEPTH } from "./miaHumanConversationExperience.js";

export const CONVERSATIONAL_RHYTHM_VERSION = "5.8.7";

export const CONVERSATION_RHYTHM = Object.freeze({
  OPENING: "opening",
  STEADY: "steady",
  RAPID_EXCHANGE: "rapid_exchange",
  CLOSING: "closing",
});

export const RESPONSE_CADENCE = Object.freeze({
  MICRO: "micro",
  BRIEF: "brief",
  NATURAL: "natural",
  EXPANSIVE: "expansive",
});

export const VARIATION_PRESSURE = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

export const REPLY_DENSITY = Object.freeze({
  MINIMAL: "minimal",
  LIGHT: "light",
  BALANCED: "balanced",
  RICH: "rich",
});

const HISTORY_WINDOW = 10;
const COOLDOWN_TURNS = 4;
const RECIPROCAL_STRUCTURE_PATTERN =
  /\b(por aqui|tudo certo|tudo tranquilo|tudo bem|indo bem|tranquilo por aqui)\b/i;

const OPENER_CLASSES = [
  { pattern: /^(entendi|entendo)\b/i, label: "entendi" },
  { pattern: /^(compreendo|compreendo)\b/i, label: "compreendo" },
  { pattern: /^(claro|sem problema|beleza)\b/i, label: "claro" },
  { pattern: /^(pode falar|fico por aqui|estou por aqui)\b/i, label: "pode_falar" },
  { pattern: /^(tudo|por aqui|indo bem|tranquilo)\b/i, label: "tudo" },
  { pattern: /\b(por aqui|tudo certo|tudo tranquilo)\b/i, label: "reciprocal_structure" },
  { pattern: /^(lembro|voltando|retomando)\b/i, label: "retomada" },
  { pattern: /^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|salve)\b/i, label: "greeting" },
  { pattern: /^(show|boa|massa|perfeito|certo|ok|combinado)\b/i, label: "confirmacao" },
  { pattern: /^(puxado|dia pesado|imagino|que bom)\b/i, label: "empatia" },
  { pattern: /^(sou a mia|sou mia)\b/i, label: "meta" },
];

const CLOSING_CLASSES = [
  { pattern: /estou por aqui|fico por aqui|pode falar comigo|pode continuar\b/i, label: "availability" },
  { pattern: /\?\s*$/i, label: "question" },
  { pattern: /por nada|imagina|disponha|de nada\b/i, label: "gratitude" },
];

const FATIGUED_ACK_PATTERN =
  /^(entendi|entendo|compreendo|claro|beleza|certo|ok|show|sem problema|pode falar)\b/i;

const RHYTHM_ACK_ROTATION = Object.freeze([
  "Perfeito.",
  "Faz sentido.",
  "Certo.",
  "Beleza.",
  "Combinado.",
  "Show.",
  "Ok.",
  "Entendido.",
]);

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(text = "") {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function isAssistantTurn(msg = {}) {
  return msg?.role === "assistant" || msg?.role === "model" || msg?.role === "mia";
}

function isUserTurn(msg = {}) {
  return msg?.role === "user" || msg?.role === "human";
}

function messageText(msg = {}) {
  return String(msg?.content || msg?.text || msg?.message || "").trim();
}

export function classifyExpressionOpener(text = "") {
  const raw = String(text || "").trim();
  for (const item of OPENER_CLASSES) {
    if (item.pattern.test(raw)) return item.label;
  }
  const first = normalizeText(raw).split(/\s+/)[0] || "other";
  return first.length <= 12 ? first : "other";
}

export function classifyExpressionStructure(text = "") {
  const n = normalizeText(text);
  const tokens = tokenCount(n);
  if (!n) return "empty";
  if (tokens <= 2 && /^(ok|sim|hm+|certo|beleza|show|valeu|obrigad\w*)$/i.test(n)) return "micro_ack";
  if (/\?\s*$/.test(String(text || "").trim())) return "question";
  if (/^(entendi|compreendo|claro|sem problema|pode falar)/i.test(n)) return "confirmation";
  if (/^(puxado|dia pesado|imagino|entendo —|compreendo —)/i.test(n)) return "empathy";
  if (/^(oi|ol[aá]|bom dia|boa tarde)/i.test(n)) return "greeting";
  if (/^(lembro|voltando|retomando)/i.test(n)) return "resumption";
  if (tokens <= 5) return "short_statement";
  return "statement";
}

export function classifyLengthBucket(text = "") {
  const tokens = tokenCount(text);
  if (tokens <= 3) return "micro";
  if (tokens <= 8) return "short";
  if (tokens <= 15) return "medium";
  return "long";
}

export function classifyClosingClass(text = "") {
  const raw = String(text || "").trim();
  for (const item of CLOSING_CLASSES) {
    if (item.pattern.test(raw)) return item.label;
  }
  return "none";
}

export function fingerprintExpression(text = "") {
  const raw = String(text || "").trim();
  const normalized = normalizeText(raw);
  return {
    normalized,
    opener: classifyExpressionOpener(raw),
    structure: classifyExpressionStructure(raw),
    lengthBucket: classifyLengthBucket(raw),
    closing: classifyClosingClass(raw),
    tokenCount: tokenCount(raw),
  };
}

function readSessionRhythmState(sessionContext = {}) {
  const state = sessionContext.miaRhythmState || {};
  if (state.version && state.version !== CONVERSATIONAL_RHYTHM_VERSION) return {};
  return state;
}

export function scanRecentExpressionHistory(conversationMessages = [], sessionContext = {}) {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  const sessionHistory = readSessionRhythmState(sessionContext).recentExpressions || [];
  const fromMessages = [];

  for (const msg of messages) {
    if (!isAssistantTurn(msg)) continue;
    const text = messageText(msg);
    if (!text) continue;
    fromMessages.push({
      ...fingerprintExpression(text),
      source: "history",
    });
  }

  const merged = [...sessionHistory.slice(-HISTORY_WINDOW), ...fromMessages].slice(-HISTORY_WINDOW);
  return merged;
}

function computeInteractionVelocity(conversationMessages = [], message = "") {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  const recentUser = messages.filter(isUserTurn).slice(-4);
  const shortTurns = recentUser.filter((m) => tokenCount(messageText(m)) <= 3).length;
  const currentShort = tokenCount(message) <= 3;
  if (shortTurns >= 2 || (shortTurns >= 1 && currentShort)) return "rapid";
  return "steady";
}

function buildExpressionCooldowns(recentHistory = []) {
  const cooldowns = {};
  const tail = recentHistory.slice(-COOLDOWN_TURNS);
  for (const item of tail) {
    if (!item?.opener) continue;
    cooldowns[item.opener] = (cooldowns[item.opener] || 0) + 1;
    if (item.normalized) cooldowns[`norm:${item.normalized}`] = (cooldowns[`norm:${item.normalized}`] || 0) + 1;
    if (RECIPROCAL_STRUCTURE_PATTERN.test(item.normalized)) {
      cooldowns.reciprocal_structure = (cooldowns.reciprocal_structure || 0) + 1;
    }
  }
  return cooldowns;
}

function computeVariationPressure(recentHistory = []) {
  if (recentHistory.length < 2) return VARIATION_PRESSURE.LOW;
  const tail = recentHistory.slice(-4);
  let sameOpener = 0;
  let sameStructure = 0;
  for (let i = 1; i < tail.length; i += 1) {
    if (tail[i].opener === tail[i - 1].opener && tail[i].opener !== "other") sameOpener += 1;
    if (tail[i].structure === tail[i - 1].structure) sameStructure += 1;
  }
  const exactDupes = tail.filter(
    (item, idx) => tail.findIndex((x) => x.normalized === item.normalized) !== idx
  ).length;
  if (sameOpener >= 2 || exactDupes >= 2 || sameStructure >= 3) return VARIATION_PRESSURE.HIGH;
  if (sameOpener >= 1 || sameStructure >= 2) return VARIATION_PRESSURE.MEDIUM;
  return VARIATION_PRESSURE.LOW;
}

export function computeRhythmMetrics(recentHistory = []) {
  const history = Array.isArray(recentHistory) ? recentHistory : [];
  if (!history.length) {
    return {
      repetitionRate: 0,
      diversityScore: 1,
      openerDiversity: 1,
      structureDiversity: 1,
      exactDuplicateCount: 0,
      fatigueLevel: 0,
    };
  }

  const openers = history.map((h) => h.opener).filter(Boolean);
  const structures = history.map((h) => h.structure).filter(Boolean);
  const normalized = history.map((h) => h.normalized).filter(Boolean);
  const uniqueOpeners = new Set(openers).size;
  const uniqueStructures = new Set(structures).size;
  const uniqueNormalized = new Set(normalized).size;

  let consecutiveSame = 0;
  for (let i = 1; i < history.length; i += 1) {
    if (history[i].normalized && history[i].normalized === history[i - 1].normalized) {
      consecutiveSame += 1;
    }
  }

  const repetitionRate = history.length
    ? Number((1 - uniqueNormalized / history.length).toFixed(3))
    : 0;
  const diversityScore = history.length
    ? Number(((uniqueOpeners + uniqueStructures) / (history.length * 2)).toFixed(3))
    : 1;

  return {
    repetitionRate,
    diversityScore: Math.min(1, diversityScore),
    openerDiversity: openers.length ? uniqueOpeners / openers.length : 1,
    structureDiversity: structures.length ? uniqueStructures / structures.length : 1,
    exactDuplicateCount: history.length - uniqueNormalized,
    consecutiveSame,
    fatigueLevel: Math.min(1, consecutiveSame / Math.max(1, history.length - 1)),
  };
}

function resolveResponseCadence(message = "", contract = {}, velocity = "steady") {
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  const tokens = tokenCount(message);
  if (contract.shortReactionMode || depth === RESPONSE_DEPTH.MINIMAL || tokens <= 2) {
    return RESPONSE_CADENCE.MICRO;
  }
  if (velocity === "rapid" || tokens <= 4) return RESPONSE_CADENCE.BRIEF;
  if (depth === RESPONSE_DEPTH.SUPPORTIVE) return RESPONSE_CADENCE.EXPANSIVE;
  if (tokens >= 12) return RESPONSE_CADENCE.NATURAL;
  return RESPONSE_CADENCE.BRIEF;
}

function resolveReplyDensity(cadence = RESPONSE_CADENCE.BRIEF, recentHistory = []) {
  const lastBucket = recentHistory[recentHistory.length - 1]?.lengthBucket;
  if (cadence === RESPONSE_CADENCE.MICRO) return REPLY_DENSITY.MINIMAL;
  if (cadence === RESPONSE_CADENCE.EXPANSIVE) return REPLY_DENSITY.RICH;
  if (lastBucket === "micro" || lastBucket === "short") return REPLY_DENSITY.BALANCED;
  if (lastBucket === "long") return REPLY_DENSITY.LIGHT;
  return REPLY_DENSITY.BALANCED;
}

function resolveConversationRhythm(conversationMessages = [], message = "", contract = {}) {
  const n = normalizeText(message);
  if (/\b(tchau|at[eé]|flw|falou|valeu|obrigad\w*|fui)\b/i.test(n) || contract.farewellMode) {
    return CONVERSATION_RHYTHM.CLOSING;
  }
  const userTurns = (Array.isArray(conversationMessages) ? conversationMessages : []).filter(isUserTurn).length;
  if (userTurns <= 1 && /^(oi|ol[aá]|bom dia|boa tarde|opa|salve|hey)\b/i.test(n)) {
    return CONVERSATION_RHYTHM.OPENING;
  }
  if (computeInteractionVelocity(conversationMessages, message) === "rapid") {
    return CONVERSATION_RHYTHM.RAPID_EXCHANGE;
  }
  return CONVERSATION_RHYTHM.STEADY;
}

export function resolveConversationalRhythm({
  message = "",
  conversationMessages = [],
  sessionContext = {},
  contract = {},
} = {}) {
  const recentExpressionHistory = scanRecentExpressionHistory(conversationMessages, sessionContext);
  const expressionCooldowns = buildExpressionCooldowns(recentExpressionHistory);
  const metrics = computeRhythmMetrics(recentExpressionHistory);
  const variationPressure = computeVariationPressure(recentExpressionHistory);
  const interactionVelocity = computeInteractionVelocity(conversationMessages, message);
  const responseCadence = resolveResponseCadence(message, contract, interactionVelocity);
  const replyDensity = resolveReplyDensity(responseCadence, recentExpressionHistory);
  const conversationRhythm = resolveConversationRhythm(conversationMessages, message, contract);
  const turnIndex =
    (Array.isArray(conversationMessages) ? conversationMessages.filter(isUserTurn).length : 0) + 1;

  const avoidExpressions = [];
  const avoidOpeners = [];
  const avoidStructures = [];
  for (const [key, count] of Object.entries(expressionCooldowns)) {
    if (key.startsWith("norm:") && count >= 1) {
      avoidExpressions.push(key.slice(5));
    } else if (count >= 2) {
      avoidOpeners.push(key);
    }
  }
  const lastTwo = recentExpressionHistory.slice(-2);
  if (lastTwo.length === 2 && lastTwo[0].structure === lastTwo[1].structure) {
    avoidStructures.push(lastTwo[1].structure);
  }

  return {
    version: CONVERSATIONAL_RHYTHM_VERSION,
    conversationRhythm,
    responseCadence,
    replyDensity,
    variationPressure,
    interactionVelocity,
    turnIndex,
    recentExpressionHistory,
    expressionCooldowns,
    antiRepetitionState: {
      avoidExpressions,
      avoidOpeners,
      avoidStructures,
      phraseFatigue: metrics.fatigueLevel >= 0.5,
    },
    rhythmMetrics: metrics,
    conversationFreshness:
      metrics.diversityScore >= 0.6 ? "fresh" : metrics.diversityScore >= 0.35 ? "moderate" : "stale",
  };
}

function rhythmSeed(contract = {}, extra = "", variantIndex = 0) {
  const rhythm = contract.conversationalRhythm || {};
  return [
    contract.userMessageForSpecificity || "",
    rhythm.turnIndex || 0,
    rhythm.conversationRhythm || "",
    rhythm.responseCadence || "",
    rhythm.variationPressure || "",
    extra,
    variantIndex,
  ].join("|");
}

export function scoreVariantForRhythm(variant = "", contract = {}) {
  const rhythm = contract.conversationalRhythm || {};
  const history = rhythm.recentExpressionHistory || [];
  const cooldowns = rhythm.expressionCooldowns || {};
  const fp = fingerprintExpression(variant);
  let score = 100;

  if (history.some((h) => h.normalized && h.normalized === fp.normalized)) score -= 90;
  if (cooldowns[`norm:${fp.normalized}`]) score -= 60 * cooldowns[`norm:${fp.normalized}`];
  if (cooldowns[fp.opener]) score -= 35 * cooldowns[fp.opener];
  if (cooldowns.reciprocal_structure && RECIPROCAL_STRUCTURE_PATTERN.test(fp.normalized)) {
    score -= 55 * cooldowns.reciprocal_structure;
  }

  const avoid = rhythm.antiRepetitionState || {};
  if (avoid.avoidOpeners?.includes(fp.opener)) score -= 45;
  if (avoid.avoidStructures?.includes(fp.structure)) score -= 40;
  if (avoid.avoidExpressions?.includes(fp.normalized)) score -= 80;

  const last = history[history.length - 1];
  if (last?.structure === fp.structure) score -= 25;
  if (last?.lengthBucket === fp.lengthBucket) score -= 15;
  if (last?.opener === fp.opener && fp.opener !== "other") score -= 50;

  const targetDensity = rhythm.replyDensity;
  if (targetDensity === REPLY_DENSITY.MINIMAL && fp.lengthBucket === "long") score -= 20;
  if (targetDensity === REPLY_DENSITY.RICH && fp.lengthBucket === "micro") score -= 15;
  if (targetDensity === REPLY_DENSITY.LIGHT && fp.lengthBucket === "long") score -= 10;
  if (targetDensity === REPLY_DENSITY.BALANCED && fp.lengthBucket !== last?.lengthBucket) score += 8;

  if (rhythm.variationPressure === VARIATION_PRESSURE.HIGH) score += fp.normalized !== last?.normalized ? 12 : -20;
  if (rhythm.conversationRhythm === CONVERSATION_RHYTHM.RAPID_EXCHANGE && fp.lengthBucket === "micro") score += 10;

  return score;
}

export function pickRhythmGovernedVariant(variants = [], contract = {}, extraSeed = "") {
  const list = variants.filter(Boolean);
  if (!list.length) return "";
  if (!contract.conversationalRhythmVersion) {
    return pickHumanizedVariant(list, rhythmSeed(contract, extraSeed));
  }

  const scored = list.map((variant, idx) => ({
    variant,
    score: scoreVariantForRhythm(variant, contract) + (hashSeed(rhythmSeed(contract, extraSeed, idx)) % 11),
    idx,
  }));

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const bestScore = scored[0]?.score ?? 0;
  const top = scored.filter((s) => s.score >= bestScore - 5);
  const pick = top[hashSeed(rhythmSeed(contract, extraSeed, "pick")) % top.length];
  return pick?.variant || list[0];
}

export function enrichContractWithConversationalRhythm(
  contract = {},
  {
    message = "",
    conversationMessages = [],
    sessionContext = {},
    recognition = null,
  } = {}
) {
  const rhythm = resolveConversationalRhythm({
    message: message || contract.resolvedQuery || "",
    conversationMessages,
    sessionContext,
    contract,
  });

  return {
    ...contract,
    conversationalRhythmVersion: CONVERSATIONAL_RHYTHM_VERSION,
    conversationalRhythm: rhythm,
    rhythmMetrics: rhythm.rhythmMetrics,
    variationPressure: rhythm.variationPressure,
    responseCadence: rhythm.responseCadence,
    replyDensity: rhythm.replyDensity,
    sessionRhythmPersist: {
      version: CONVERSATIONAL_RHYTHM_VERSION,
      recentExpressions: rhythm.recentExpressionHistory,
      lastCadence: rhythm.responseCadence,
      lastDensity: rhythm.replyDensity,
    },
  };
}

export function conversationalRhythmToVerbalizationInstructions(contract = {}) {
  const rhythm = contract.conversationalRhythm || {};
  if (!contract.conversationalRhythmVersion) return "";

  const avoid = rhythm.antiRepetitionState || {};
  const lines = [
    "Ritmo conversacional governado (obrigatório — variação natural, anti-repetição):",
    `- Ritmo da conversa: ${rhythm.conversationRhythm || "steady"}`,
    `- Cadência deste turno: ${rhythm.responseCadence || "brief"}`,
    `- Densidade de resposta: ${rhythm.replyDensity || "balanced"}`,
    `- Pressão de variação: ${rhythm.variationPressure || "low"}`,
    `- Frescor conversacional: ${rhythm.conversationFreshness || "fresh"}`,
    "- Varie confirmações e aberturas — não repetir a mesma estrutura do turno anterior.",
    "- Evite encadeamento robótico (Entendi / Claro / Pode falar / Sem problema).",
  ];

  if (avoid.avoidOpeners?.length) {
    lines.push(`- Evitar aberturas recentes: ${avoid.avoidOpeners.slice(0, 5).join(", ")}`);
  }
  if (avoid.avoidStructures?.length) {
    lines.push(`- Evitar estruturas recentes: ${avoid.avoidStructures.slice(0, 3).join(", ")}`);
  }
  if (avoid.avoidExpressions?.length) {
    lines.push(`- Não repetir frases recentes equivalentes.`);
  }
  if (rhythm.conversationRhythm === CONVERSATION_RHYTHM.RAPID_EXCHANGE) {
    lines.push("- Troca rápida: respostas curtas e naturais, sem alongar.");
  }
  if (rhythm.replyDensity === REPLY_DENSITY.MINIMAL) {
    lines.push("- Resposta mínima proporcional — sem fechamento artificial.");
  }

  return lines.join("\n");
}

export function detectRhythmViolations(text = "", contract = {}) {
  const violations = [];
  const rhythm = contract.conversationalRhythm;
  if (!rhythm || !text) return violations;

  const fp = fingerprintExpression(text);
  const history = rhythm.recentExpressionHistory || [];

  if (history.some((h) => h.normalized === fp.normalized)) {
    violations.push("exact_expression_repeat");
  }
  const last = history[history.length - 1];
  if (last?.opener === fp.opener && fp.opener !== "other" && rhythm.variationPressure !== VARIATION_PRESSURE.LOW) {
    violations.push("opener_fatigue");
  }
  if (last?.structure === fp.structure && fp.structure === "confirmation" && history.length >= 2) {
    violations.push("confirmation_pattern_fatigue");
  }
  if (
    rhythm.variationPressure === VARIATION_PRESSURE.HIGH &&
    FATIGUED_ACK_PATTERN.test(String(text || "").trim()) &&
    history.slice(-2).some((h) => FATIGUED_ACK_PATTERN.test(h.normalized))
  ) {
    violations.push("ack_chain_fatigue");
  }

  if (
    rhythm.variationPressure === VARIATION_PRESSURE.HIGH &&
    RECIPROCAL_STRUCTURE_PATTERN.test(String(text || "").trim()) &&
    history.slice(-3).some((h) => RECIPROCAL_STRUCTURE_PATTERN.test(h.normalized))
  ) {
    violations.push("reciprocal_structure_fatigue");
  }

  return violations;
}

export function buildRhythmCorrectedAckReply(contract = {}, extraSeed = "rhythm-ack") {
  const candidates = RHYTHM_ACK_ROTATION.filter((v) => {
    const temp = { ...contract, conversationalRhythm: contract.conversationalRhythm };
    return scoreVariantForRhythm(v, temp) > 20;
  });
  const pool = candidates.length ? candidates : RHYTHM_ACK_ROTATION;
  return pickRhythmGovernedVariant(pool, contract, extraSeed);
}

export function applyConversationalRhythmGovernance(text = "", contract = {}) {
  const raw = String(text || "").trim();
  if (!raw || !contract.conversationalRhythmVersion) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const violations = detectRhythmViolations(raw, contract);
  if (!violations.length) {
    return { reply: raw, replaced: false, violations: [] };
  }

  if (violations.some((v) => v.includes("ack") || v.includes("confirmation") || v.includes("opener"))) {
    const corrected = buildRhythmCorrectedAckReply(contract, violations.join("|"));
    if (corrected && normalizeText(corrected) !== normalizeText(raw)) {
      return { reply: corrected, replaced: true, violations };
    }
  }

  return { reply: raw, replaced: false, violations };
}

export function conversationalRhythmToTrace(contract = {}) {
  const rhythm = contract.conversationalRhythm || {};
  return {
    version: CONVERSATIONAL_RHYTHM_VERSION,
    conversationRhythm: rhythm.conversationRhythm,
    responseCadence: rhythm.responseCadence,
    variationPressure: rhythm.variationPressure,
    metrics: rhythm.rhythmMetrics,
    historySize: rhythm.recentExpressionHistory?.length || 0,
  };
}

export { computeRhythmMetrics as measureConversationalRhythm };
