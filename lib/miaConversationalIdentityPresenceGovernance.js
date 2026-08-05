/**
 * PATCH 5.8.8 — Conversational Identity Presence Governance (Classe F)
 *
 * Ensures MIA identity remains consistent in LLM verbalization paths.
 * Does NOT alter personality policy or decision engine.
 * Enriches LLM instructions and applies post-LLM identity anchoring.
 */

import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import {
  MIA_IDENTITY,
  IDENTITY_QUERY_KIND,
  buildGovernedIdentityReply,
  resolveIdentityQueryKind,
  propagateIdentityQueryContractFields,
  isGenericStaySocialInvite,
} from "./miaPersonalityGovernance.js";
import { pickRhythmGovernedVariant } from "./miaConversationalRhythmGovernance.js";

export const CONVERSATIONAL_IDENTITY_PRESENCE_VERSION = "5.8.8.3";

export const IDENTITY_PRESENCE_MODE = Object.freeze({
  IMPLICIT: "implicit",
  ANCHORED: "anchored",
  EXPLICIT: "explicit",
  META_TRANSPARENT: "meta_transparent",
});

export const IDENTITY_ANCHOR_STRENGTH = Object.freeze({
  LIGHT: "light",
  MODERATE: "moderate",
  STRONG: "strong",
});

const MIA_IDENTITY_MARKER =
  /\b(mia|teilor|assistente.{0,30}compras|assistente inteligente)\b/i;

const GENERIC_AI_MARKER =
  /\b(sou uma ia|sou um assistente virtual|intelig[eê]ncia artificial gen[eé]rica|como assistente de ia|modelo de linguagem)\b/i;

const CHATGPT_CLAIM =
  /\b(sou (?:o |a )?chat\s*gpt|sou chatgpt|powered by openai|desenvolvid[oa] pela openai)\b/i;

const MISSING_IDENTITY_GENERIC =
  /^(claro\.?|entendi\.?|pode falar\.?|sem problema\.?|tudo certo\.?|ok\.?)$/i;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countUserTurns(conversationMessages = []) {
  return (Array.isArray(conversationMessages) ? conversationMessages : []).filter(
    (m) => m?.role === "user"
  ).length;
}

function resolveIdentityPresenceMode(contract = {}, recognition = {}, identityKind = null) {
  if (identityKind) return IDENTITY_PRESENCE_MODE.META_TRANSPARENT;
  if (contract.identityMode || recognition.interactionMode === MIA_INTERACTION_MODES.IDENTITY) {
    return IDENTITY_PRESENCE_MODE.EXPLICIT;
  }
  if (contract.identityVisibility === "explicit_when_relevant") {
    return IDENTITY_PRESENCE_MODE.EXPLICIT;
  }
  if (countUserTurns(contract.conversationMessages) <= 1 && recognition.primaryIntent === "greeting") {
    return IDENTITY_PRESENCE_MODE.ANCHORED;
  }
  return IDENTITY_PRESENCE_MODE.IMPLICIT;
}

function resolveAnchorStrength(mode, identityKind) {
  if (identityKind) return IDENTITY_ANCHOR_STRENGTH.STRONG;
  if (mode === IDENTITY_PRESENCE_MODE.EXPLICIT || mode === IDENTITY_PRESENCE_MODE.META_TRANSPARENT) {
    return IDENTITY_ANCHOR_STRENGTH.STRONG;
  }
  if (mode === IDENTITY_PRESENCE_MODE.ANCHORED) return IDENTITY_ANCHOR_STRENGTH.MODERATE;
  return IDENTITY_ANCHOR_STRENGTH.LIGHT;
}

function requiresLlmIdentityAnchor(contract = {}, mode = IDENTITY_PRESENCE_MODE.IMPLICIT, identityKind = null) {
  if (identityKind) return true;
  if (mode === IDENTITY_PRESENCE_MODE.EXPLICIT || mode === IDENTITY_PRESENCE_MODE.META_TRANSPARENT) {
    return true;
  }
  if (contract.expectedHumanBehavior === "answer_meta") return true;
  return false;
}

export function resolveConversationalIdentityPresence({
  contract = {},
  recognition = {},
  message = "",
  conversationMessages = [],
} = {}) {
  const identityQueryKind = resolveIdentityQueryKind(message, {
    recognition,
    contract: { ...contract, conversationMessages },
  });
  const identityPresenceMode = resolveIdentityPresenceMode(contract, recognition, identityQueryKind);
  const anchorStrength = resolveAnchorStrength(identityPresenceMode, identityQueryKind);
  const llmIdentityAnchorRequired = requiresLlmIdentityAnchor(
    contract,
    identityPresenceMode,
    identityQueryKind
  );

  return {
    version: CONVERSATIONAL_IDENTITY_PRESENCE_VERSION,
    identityPresenceMode,
    identityQueryKind: identityQueryKind || contract.identityQueryKind || null,
    anchorStrength,
    llmIdentityAnchorRequired,
    identityBrand: MIA_IDENTITY.brand,
    identityName: MIA_IDENTITY.name,
    identityRole: MIA_IDENTITY.role,
    identityEssence: MIA_IDENTITY.essence,
    conversationTurn: countUserTurns(conversationMessages) + 1,
  };
}

export function detectIdentityPresenceViolations(text = "", contract = {}) {
  const violations = [];
  const id = contract.conversationalIdentityPresence;
  if (!contract.conversationalIdentityPresenceVersion || !id || !text) return violations;

  const normalized = normalizeText(text);

  if (CHATGPT_CLAIM.test(normalized)) violations.push("chatgpt_identity_claim");
  if (GENERIC_AI_MARKER.test(normalized) && !MIA_IDENTITY_MARKER.test(normalized)) {
    violations.push("generic_ai_identity");
  }

  if (id.llmIdentityAnchorRequired) {
    if (!MIA_IDENTITY_MARKER.test(normalized)) {
      violations.push("missing_mia_identity_anchor");
    }
    if (MISSING_IDENTITY_GENERIC.test(normalized.trim())) {
      violations.push("generic_response_on_identity_query");
    }
    if (isGenericStaySocialInvite(text)) {
      violations.push("identity_query_replaced_by_stay_social");
    }
  }

  if (id.identityQueryKind && id.anchorStrength === IDENTITY_ANCHOR_STRENGTH.STRONG) {
    if (!MIA_IDENTITY_MARKER.test(normalized)) {
      violations.push("identity_query_without_mia_mark");
    }
    if (isGenericStaySocialInvite(text)) {
      violations.push("identity_query_replaced_by_stay_social");
    }
  }

  if (
    contract.conversationalIntentPolicy?.requireIdentityAnchor &&
    id.identityQueryKind &&
    !MIA_IDENTITY_MARKER.test(normalized)
  ) {
    violations.push("meta_response_missing_mia_anchor");
  }

  return violations;
}

function buildIdentityAnchoredReply(contract = {}) {
  const id = contract.conversationalIdentityPresence || {};
  if (id.identityQueryKind) {
    const governed = buildGovernedIdentityReply({
      ...contract,
      identityQueryKind: id.identityQueryKind,
    });
    if (governed && MIA_IDENTITY_MARKER.test(governed)) return governed;
    if (governed && id.anchorStrength === IDENTITY_ANCHOR_STRENGTH.STRONG) {
      return `Sou a ${MIA_IDENTITY.name} — ${governed.charAt(0).toLowerCase()}${governed.slice(1)}`;
    }
    if (governed) return governed;
  }

  const pools = {
    [IDENTITY_PRESENCE_MODE.EXPLICIT]: [
      `Sou a ${MIA_IDENTITY.name} — ${MIA_IDENTITY.role} da ${MIA_IDENTITY.brand}. Estou aqui para conversar e te ajudar nas compras.`,
      `Meu nome é ${MIA_IDENTITY.name}. Sou ${MIA_IDENTITY.role} da ${MIA_IDENTITY.brand} — natural, clara e prestativa.`,
    ],
    [IDENTITY_PRESENCE_MODE.ANCHORED]: [
      `Oi! Sou a ${MIA_IDENTITY.name} — como posso te ajudar?`,
      `Olá! Aqui é a ${MIA_IDENTITY.name} da ${MIA_IDENTITY.brand}.`,
    ],
    [IDENTITY_PRESENCE_MODE.META_TRANSPARENT]: [
      `Sou a ${MIA_IDENTITY.name}, da ${MIA_IDENTITY.brand} — não sou ChatGPT; uso tecnologia própria para te ajudar nas compras.`,
      `Sou a ${MIA_IDENTITY.name} — assistente inteligente de compras da ${MIA_IDENTITY.brand}, feita para conversar de forma natural.`,
    ],
  };

  const mode = id.identityPresenceMode || IDENTITY_PRESENCE_MODE.EXPLICIT;
  const pool = pools[mode] || pools[IDENTITY_PRESENCE_MODE.EXPLICIT];
  return pickRhythmGovernedVariant(pool, contract, `identity-anchor-${mode}`);
}

export function applyConversationalIdentityPresenceGovernance(text = "", contract = {}) {
  const raw = String(text || "").trim();
  if (!raw || !contract.conversationalIdentityPresenceVersion) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const violations = detectIdentityPresenceViolations(raw, contract);
  if (!violations.length) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const corrected = buildIdentityAnchoredReply(contract);
  if (corrected && normalizeText(corrected) !== normalizeText(raw)) {
    return { reply: corrected, replaced: true, violations };
  }

  return { reply: raw, replaced: false, violations };
}

export function enrichContractWithConversationalIdentityPresence(
  contract = {},
  { recognition = null, message = "", conversationMessages = [] } = {}
) {
  const rec = recognition || {};
  const presence = resolveConversationalIdentityPresence({
    contract: { ...contract, conversationMessages },
    recognition: rec,
    message: message || contract.resolvedQuery || "",
    conversationMessages,
  });

  return propagateIdentityQueryContractFields(
    {
      ...contract,
      conversationalIdentityPresenceVersion: CONVERSATIONAL_IDENTITY_PRESENCE_VERSION,
      conversationalIdentityPresence: presence,
      identityQueryKind: presence.identityQueryKind || contract.identityQueryKind || null,
      llmIdentityAnchorRequired: presence.llmIdentityAnchorRequired,
    },
    presence.identityQueryKind || contract.identityQueryKind || null
  );
}

export function conversationalIdentityPresenceToVerbalizationInstructions(contract = {}) {
  const id = contract.conversationalIdentityPresence;
  if (!contract.conversationalIdentityPresenceVersion || !id) return "";

  const lines = [
    "Identidade conversacional governada (obrigatório — sempre ser reconhecível como MIA):",
    `- Nome: ${MIA_IDENTITY.name}`,
    `- Marca: ${MIA_IDENTITY.brand}`,
    `- Papel: ${MIA_IDENTITY.role}`,
    `- Essência: ${MIA_IDENTITY.essence}`,
    `- Modo de presença: ${id.identityPresenceMode}`,
    `- Força de âncora: ${id.anchorStrength}`,
    "- Nunca se apresentar como ChatGPT, OpenAI ou IA genérica sem marca.",
    "- Manter tom natural, próximo e confiante — não institucional.",
  ];

  if (id.llmIdentityAnchorRequired) {
    lines.push("- OBRIGATÓRIO: mencionar MIA e/ou Teilor de forma natural na resposta.");
  }
  if (id.identityQueryKind === IDENTITY_QUERY_KIND.MODEL_TECH) {
    lines.push("- Esclarecer: não usa ChatGPT; é tecnologia própria da Teilor.");
  }
  if (id.identityQueryKind === IDENTITY_QUERY_KIND.MEMORY) {
    lines.push("- Explicar memória da conversa atual — sem prometer memória permanente.");
  }
  if (id.identityQueryKind === IDENTITY_QUERY_KIND.AI_NATURE) {
    lines.push("- Ser transparente sobre ser IA, mas enfatizar identidade MIA e propósito.");
  }
  if (id.identityQueryKind === IDENTITY_QUERY_KIND.LEARNING) {
    lines.push("- Esclarecer adaptação na sessão vs. aprendizado permanente.");
  }

  return lines.join("\n");
}

export function conversationalIdentityPresenceToTrace(contract = {}) {
  const id = contract.conversationalIdentityPresence;
  if (!id) return null;
  return {
    version: CONVERSATIONAL_IDENTITY_PRESENCE_VERSION,
    identityPresenceMode: id.identityPresenceMode,
    identityQueryKind: id.identityQueryKind,
    anchorStrength: id.anchorStrength,
    llmIdentityAnchorRequired: id.llmIdentityAnchorRequired,
  };
}

export { MIA_IDENTITY_MARKER, detectIdentityPresenceViolations as detectConversationalIdentityViolations };
