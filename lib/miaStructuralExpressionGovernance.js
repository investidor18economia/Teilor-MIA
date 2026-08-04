/**
 * PATCH 5.8.8 — Structural Expression Governance (Classe D)
 *
 * Governs behavioral anti-repetition in long conversations.
 * Does NOT decide intent or alter personality/rhythm/humanization modules.
 * Complements rhythm by tracking structural behavior archetypes.
 */

import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import {
  classifyExpressionStructure,
  classifyExpressionOpener,
  classifyLengthBucket,
  fingerprintExpression,
  pickRhythmGovernedVariant,
  scanRecentExpressionHistory,
} from "./miaConversationalRhythmGovernance.js";
import { EMOTIONAL_CATEGORY } from "./miaSocialHumanizationGovernance.js";

export const STRUCTURAL_EXPRESSION_VERSION = "5.8.8";

export const STRUCTURAL_FATIGUE = Object.freeze({
  FRESH: "fresh",
  MODERATE: "moderate",
  HIGH: "high",
  EXHAUSTED: "exhausted",
});

export const BEHAVIOR_ARCHETYPE = Object.freeze({
  MICRO_ACK: "micro_ack",
  CONFIRM_LOOP: "confirm_loop",
  EMPATHY_OPENER: "empathy_opener",
  RECIPROCAL_EXCHANGE: "reciprocal_exchange",
  LISTENER_INVITE: "listener_invite",
  QUESTION_PROMPT: "question_prompt",
  STATEMENT: "statement",
  GREETING: "greeting",
  FAREWELL: "farewell",
});

const HISTORY_WINDOW = 12;
const ARCHETYPE_SHIFT_POOLS = Object.freeze({
  [BEHAVIOR_ARCHETYPE.CONFIRM_LOOP]: [
    "Faz sentido.",
    "Combinado — entendi.",
    "Certo — acompanhei.",
    "Beleza — seguimos.",
    "Show — entendi o ponto.",
  ],
  [BEHAVIOR_ARCHETYPE.MICRO_ACK]: [
    "Certo.",
    "Combinado.",
    "Entendido.",
    "Beleza.",
    "Ok — seguimos.",
  ],
  [BEHAVIOR_ARCHETYPE.EMPATHY_OPENER]: [
    "Compreendo — isso pesa.",
    "Imagino — não é simples.",
    "Entendo — situação difícil.",
    "Faz sentido se sentir assim.",
  ],
  [BEHAVIOR_ARCHETYPE.RECIPROCAL_EXCHANGE]: [
    "Por aqui, tudo certo — e você?",
    "Tranquilo por aqui! E contigo?",
    "Indo bem — como você está?",
    "Tudo bem por aqui. E aí?",
  ],
  [BEHAVIOR_ARCHETYPE.LISTENER_INVITE]: [
    "Pode continuar — estou ouvindo.",
    "Me conta — acompanho com calma.",
    "Claro — pode desabafar.",
    "Estou aqui — manda ver.",
  ],
});

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAssistantTurn(msg = {}) {
  return msg?.role === "assistant" || msg?.role === "model" || msg?.role === "mia";
}

function messageText(msg = {}) {
  return String(msg?.content || msg?.text || msg?.message || "").trim();
}

export function classifyBehaviorArchetype(text = "", contract = {}) {
  const fp = fingerprintExpression(text);
  const structure = fp.structure;
  const opener = fp.opener;
  const n = normalizeText(text);

  if (structure === "greeting" || opener === "greeting") return BEHAVIOR_ARCHETYPE.GREETING;
  if (contract.farewellMode || /\b(tchau|at[eé]|flw|falou)\b/i.test(n)) {
    return BEHAVIOR_ARCHETYPE.FAREWELL;
  }
  if (structure === "micro_ack") return BEHAVIOR_ARCHETYPE.MICRO_ACK;
  if (structure === "confirmation" || opener === "entendi" || opener === "claro") {
    return BEHAVIOR_ARCHETYPE.CONFIRM_LOOP;
  }
  if (structure === "empathy" || opener === "empatia") return BEHAVIOR_ARCHETYPE.EMPATHY_OPENER;
  if (/\b(por aqui|tudo certo|tranquilo|e voc[eê]|e contigo)\b/i.test(n)) {
    return BEHAVIOR_ARCHETYPE.RECIPROCAL_EXCHANGE;
  }
  if (/\b(ouvindo|acompanh|pode falar|pode continuar|me conta)\b/i.test(n)) {
    return BEHAVIOR_ARCHETYPE.LISTENER_INVITE;
  }
  if (structure === "question") return BEHAVIOR_ARCHETYPE.QUESTION_PROMPT;
  return BEHAVIOR_ARCHETYPE.STATEMENT;
}

export function scanStructuralBehaviorHistory(conversationMessages = [], sessionContext = {}) {
  const rhythmHistory = scanRecentExpressionHistory(conversationMessages, sessionContext);
  return rhythmHistory.map((item) => ({
    ...item,
    archetype: classifyBehaviorArchetype(item.normalized || ""),
  }));
}

function computeArchetypeFatigue(history = []) {
  if (!history.length) {
    return { level: STRUCTURAL_FATIGUE.FRESH, repetitionRate: 0, dominantArchetype: null, streak: 0 };
  }

  const archetypes = history.map((h) => h.archetype).filter(Boolean);
  const unique = new Set(archetypes).size;
  const repetitionRate = history.length ? 1 - unique / history.length : 0;

  let streak = 1;
  for (let i = archetypes.length - 2; i >= 0; i -= 1) {
    if (archetypes[i] === archetypes[archetypes.length - 1]) streak += 1;
    else break;
  }

  const dominantArchetype = archetypes[archetypes.length - 1] || null;
  let level = STRUCTURAL_FATIGUE.FRESH;
  if (streak >= 4 || repetitionRate >= 0.65) level = STRUCTURAL_FATIGUE.EXHAUSTED;
  else if (streak >= 3 || repetitionRate >= 0.5) level = STRUCTURAL_FATIGUE.HIGH;
  else if (streak >= 2 || repetitionRate >= 0.35) level = STRUCTURAL_FATIGUE.MODERATE;

  return { level, repetitionRate, dominantArchetype, streak, uniqueArchetypes: unique };
}

function resolveExpressionEnergy(contract = {}, fatigue = {}) {
  const energy = contract.conversationEnergy || contract.humanWarmthPresence?.conversationEnergy;
  if (energy === "rapid") return "rapid";
  if (fatigue.level === STRUCTURAL_FATIGUE.EXHAUSTED) return "recovery";
  if (fatigue.level === STRUCTURAL_FATIGUE.HIGH) return "shift";
  return "steady";
}

function resolveTargetArchetypeShift(dominantArchetype, contract = {}) {
  const category = contract.socialHumanization?.emotionalCategory;
  if (dominantArchetype === BEHAVIOR_ARCHETYPE.CONFIRM_LOOP) {
    if (category === EMOTIONAL_CATEGORY.RECIPROCAL) return BEHAVIOR_ARCHETYPE.RECIPROCAL_EXCHANGE;
    if (contract.expectedHumanBehavior === "stay_social") return BEHAVIOR_ARCHETYPE.LISTENER_INVITE;
    return BEHAVIOR_ARCHETYPE.STATEMENT;
  }
  if (dominantArchetype === BEHAVIOR_ARCHETYPE.MICRO_ACK) return BEHAVIOR_ARCHETYPE.CONFIRM_LOOP;
  if (dominantArchetype === BEHAVIOR_ARCHETYPE.EMPATHY_OPENER) return BEHAVIOR_ARCHETYPE.LISTENER_INVITE;
  if (dominantArchetype === BEHAVIOR_ARCHETYPE.RECIPROCAL_EXCHANGE) return BEHAVIOR_ARCHETYPE.STATEMENT;
  return BEHAVIOR_ARCHETYPE.STATEMENT;
}

export function resolveStructuralExpression({
  contract = {},
  conversationMessages = [],
  sessionContext = {},
} = {}) {
  const history = scanStructuralBehaviorHistory(conversationMessages, sessionContext);
  const fatigue = computeArchetypeFatigue(history);
  const expressionEnergy = resolveExpressionEnergy(contract, fatigue);
  const avoidArchetypes = [];
  const tail = history.slice(-4);
  for (const item of tail) {
    if (item.archetype) avoidArchetypes.push(item.archetype);
  }

  const targetShift =
    fatigue.level >= STRUCTURAL_FATIGUE.HIGH
      ? resolveTargetArchetypeShift(fatigue.dominantArchetype, contract)
      : null;

  return {
    version: STRUCTURAL_EXPRESSION_VERSION,
    structuralFatigue: fatigue.level,
    structuralRepetitionRate: fatigue.repetitionRate,
    dominantArchetype: fatigue.dominantArchetype,
    archetypeStreak: fatigue.streak,
    expressionEnergy,
    avoidArchetypes: [...new Set(avoidArchetypes)],
    targetArchetypeShift: targetShift,
    behaviorHistorySize: history.length,
    conversationCategory:
      contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE ? "commercial" : "social",
  };
}

export function detectStructuralExpressionViolations(text = "", contract = {}) {
  const violations = [];
  const se = contract.structuralExpression;
  if (!contract.structuralExpressionVersion || !se || !text) return violations;

  const archetype = classifyBehaviorArchetype(text, contract);
  const fp = fingerprintExpression(text);

  if (se.avoidArchetypes?.includes(archetype) && se.structuralFatigue >= STRUCTURAL_FATIGUE.MODERATE) {
    violations.push("archetype_repeat");
  }

  const history = contract.conversationalRhythm?.recentExpressionHistory || [];
  if (history.some((h) => h.normalized === fp.normalized)) {
    violations.push("exact_structural_repeat");
  }

  if (
    se.structuralFatigue >= STRUCTURAL_FATIGUE.HIGH &&
    archetype === se.dominantArchetype &&
    se.dominantArchetype !== BEHAVIOR_ARCHETYPE.STATEMENT
  ) {
    violations.push("behavioral_fatigue");
  }

  if (
    se.archetypeStreak >= 3 &&
    (archetype === BEHAVIOR_ARCHETYPE.CONFIRM_LOOP || archetype === BEHAVIOR_ARCHETYPE.MICRO_ACK)
  ) {
    violations.push("ack_chain_structural_fatigue");
  }

  const lastStructure = history[history.length - 1]?.structure;
  if (
    lastStructure === fp.structure &&
    fp.structure === "confirmation" &&
    se.structuralFatigue >= STRUCTURAL_FATIGUE.MODERATE
  ) {
    violations.push("confirmation_structure_loop");
  }

  return violations;
}

function buildStructuralShiftReply(contract = {}, violations = []) {
  const se = contract.structuralExpression || {};
  const shiftTarget =
    se.targetArchetypeShift ||
    (se.dominantArchetype === BEHAVIOR_ARCHETYPE.CONFIRM_LOOP
      ? BEHAVIOR_ARCHETYPE.CONFIRM_LOOP
      : BEHAVIOR_ARCHETYPE.MICRO_ACK);

  const pool =
    ARCHETYPE_SHIFT_POOLS[shiftTarget] ||
    ARCHETYPE_SHIFT_POOLS[BEHAVIOR_ARCHETYPE.CONFIRM_LOOP] ||
    ARCHETYPE_SHIFT_POOLS[BEHAVIOR_ARCHETYPE.MICRO_ACK];

  const filtered = pool.filter((variant) => {
    const arch = classifyBehaviorArchetype(variant, contract);
    return !se.avoidArchetypes?.includes(arch);
  });

  return pickRhythmGovernedVariant(
    filtered.length ? filtered : pool,
    contract,
    `structural-${violations.join("-")}`
  );
}

export function applyStructuralExpressionGovernance(text = "", contract = {}) {
  const raw = String(text || "").trim();
  if (!raw || !contract.structuralExpressionVersion) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const violations = detectStructuralExpressionViolations(raw, contract);
  if (!violations.length) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const corrected = buildStructuralShiftReply(contract, violations);
  if (corrected && normalizeText(corrected) !== normalizeText(raw)) {
    return { reply: corrected, replaced: true, violations };
  }

  return { reply: raw, replaced: false, violations };
}

export function enrichContractWithStructuralExpression(
  contract = {},
  { conversationMessages = [], sessionContext = {} } = {}
) {
  const structural = resolveStructuralExpression({
    contract,
    conversationMessages,
    sessionContext,
  });

  return {
    ...contract,
    structuralExpressionVersion: STRUCTURAL_EXPRESSION_VERSION,
    structuralExpression: structural,
    structuralFatigue: structural.structuralFatigue,
    expressionEnergy: structural.expressionEnergy,
  };
}

export function structuralExpressionToVerbalizationInstructions(contract = {}) {
  const se = contract.structuralExpression;
  if (!contract.structuralExpressionVersion || !se) return "";

  const lines = [
    "Expressão estrutural governada (obrigatório — conversa orgânica, anti-repetição comportamental):",
    `- Fadiga estrutural: ${se.structuralFatigue}`,
    `- Energia expressiva: ${se.expressionEnergy}`,
    `- Taxa de repetição recente: ${(se.structuralRepetitionRate * 100).toFixed(0)}%`,
    "- Varie o comportamento — não repetir confirmações em sequência.",
    "- Alternar entre acolhimento, presença e continuidade natural.",
  ];

  if (se.avoidArchetypes?.length) {
    lines.push(`- Evitar arquétipos recentes: ${se.avoidArchetypes.slice(0, 4).join(", ")}`);
  }
  if (se.targetArchetypeShift) {
    lines.push(`- Preferir mudança para: ${se.targetArchetypeShift}`);
  }
  if (se.structuralFatigue >= STRUCTURAL_FATIGUE.HIGH) {
    lines.push("- Fadiga alta: quebrar padrão — usar estrutura diferente da anterior.");
  }

  return lines.join("\n");
}

export function structuralExpressionToTrace(contract = {}) {
  const se = contract.structuralExpression;
  if (!se) return null;
  return {
    version: STRUCTURAL_EXPRESSION_VERSION,
    structuralFatigue: se.structuralFatigue,
    dominantArchetype: se.dominantArchetype,
    archetypeStreak: se.archetypeStreak,
    expressionEnergy: se.expressionEnergy,
  };
}

export { classifyLengthBucket, classifyBehaviorArchetype as classifyStructuralArchetype };
