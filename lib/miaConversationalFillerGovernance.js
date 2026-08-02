/**
 * PATCH 5.7V.3.1 — Conversational Filler Governance
 *
 * Structural classification of minimal reactions inside an active commercial thread.
 * Preserves commercial anchors; blocks cold clarification when context suffices.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { MIA_INTERACTION_MODES, detectActiveCommercialAsk } from "./miaIntentRecognitionLayer.js";
import { detectTopicSwitch, hasActiveCommercialThread } from "./miaCommercialFollowUpContinuity.js";

export const FILLER_GOVERNANCE_VERSION = "5.7V.3.1";

export const FILLER_TYPES = Object.freeze({
  NEUTRAL: "neutral",
  NEGATIVE: "negative",
  EXIT: "exit",
  UNCERTAINTY: "uncertainty",
  NONE: "none",
});

/** Informal vocative particle at message tail — structural, not filler authority. */
const VOCATIVE_SUFFIX_PATTERN =
  /\s+(mano|mina|cara|bro|parceir\w*|amig\w*|vei|mlk|gente|z[eé]|tipo)\s*$/i;

/** Monosyllabic / minimal negation without new commercial ask. */
const NEGATIVE_MONOSYLLABLE_PATTERN = /^(nao|não|nem)(?:\s+(quero|preciso|obrigad\w*|vlw|valeu))?\s*$/;

/** Open-question cues in prior assistant turn (structural, not phrase-specific). */
const ASSISTANT_OPEN_QUESTION_PATTERN =
  /\?(?:\s*$)|\b(posso saber|o que voce|o que você|me conta|me diz|gostaria que|quer que eu|prefere|qual parte|por que voce|por que você|porque voce|porque você|te levou|te incomoda|nao encaixou|não encaixou|explicasse|explicar)\b/;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVocativeParticle(text = "") {
  return normalizeText(text).replace(VOCATIVE_SUFFIX_PATTERN, "").trim();
}

function tokenCount(text = "") {
  const q = normalizeText(text);
  if (!q) return 0;
  return q.split(/\s+/).filter(Boolean).length;
}

function getLastAssistantMessage(conversationMessages = []) {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") {
      return String(messages[i]?.content || "");
    }
  }
  return "";
}

function assistantAskedOpenQuestion(lastAssistantMessage = "") {
  const q = normalizeText(lastAssistantMessage);
  if (!q) return false;
  return ASSISTANT_OPEN_QUESTION_PATTERN.test(q);
}

/**
 * Interjection morphology — repetitions and minimal backchannels, not attribute lists.
 */
function hasInterjectionMorphology(core = "") {
  const q = normalizeText(core);
  if (!q) return false;
  if (/^(hm+|hum+|hmm+|ah+|oh+|uh+|eh+|kkk+|rs+|haha+|hehe+)$/.test(q)) return true;
  if (/^(ok|okay|ta|ne|pois|blz|beleza|entendi|saquei|captei|show|massa|top|legal|verdade|claro|sim|aham|uhum|pera|perai)$/.test(q)) {
    return true;
  }
  return false;
}

/** Minimal exit / pause signals — structural, not phrase authority. */
const EXIT_FILLER_CORE_PATTERN =
  /^(deixa|esquece|ja foi|já foi|nao quero mais|não quero mais|deixa quieto|deixa queto|para|para com isso|para com issu)$/;

function isExitFillerCore(core = "") {
  const q = normalizeText(core);
  if (!q) return false;
  if (EXIT_FILLER_CORE_PATTERN.test(q)) return true;
  if (detectTopicSwitch(q)) return true;
  return false;
}

function isMinimalNonCommercialFragment(core = "") {
  const q = normalizeText(core);
  if (!q) return false;
  if (detectActiveCommercialAsk(q)) return false;
  if (tokenCount(q) > 3) return false;
  return hasInterjectionMorphology(q) || (tokenCount(q) === 1 && q.length <= 14);
}

/**
 * Classify filler inside or outside commercial thread.
 */
export function classifyConversationalFiller(
  message = "",
  {
    conversationMessages = [],
    sessionContext = {},
    hasActiveAnchor = false,
  } = {}
) {
  const raw = normalizeText(message);
  if (!raw) {
    return {
      version: FILLER_GOVERNANCE_VERSION,
      type: FILLER_TYPES.NONE,
      detected: false,
      preserveCommercialAnchor: false,
      blocksClarification: false,
      reasonCode: "empty_message",
    };
  }

  const core = stripVocativeParticle(raw);

  if (detectTopicSwitch(message) || isExitFillerCore(core)) {
    return {
      version: FILLER_GOVERNANCE_VERSION,
      type: FILLER_TYPES.EXIT,
      detected: true,
      preserveCommercialAnchor: false,
      blocksClarification: true,
      clearsCommercialThread: true,
      reasonCode: "explicit_topic_exit_clears_commercial_thread",
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    };
  }

  const commercialThreadActive =
    hasActiveAnchor || hasActiveCommercialThread(sessionContext || {});

  const lastAssistant = getLastAssistantMessage(conversationMessages);

  if (NEGATIVE_MONOSYLLABLE_PATTERN.test(core)) {
    const pendingQuestion = assistantAskedOpenQuestion(lastAssistant);
    if (pendingQuestion || commercialThreadActive) {
      return {
        version: FILLER_GOVERNANCE_VERSION,
        type: FILLER_TYPES.NEGATIVE,
        detected: true,
        preserveCommercialAnchor: commercialThreadActive,
        blocksClarification: true,
        pendingQuestionResponse: pendingQuestion,
        reasonCode: pendingQuestion
          ? "negative_filler_resolved_from_pending_question"
          : "filler_does_not_clear_commercial_anchor",
        interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      };
    }
  }

  if (commercialThreadActive && isMinimalNonCommercialFragment(core)) {
    return {
      version: FILLER_GOVERNANCE_VERSION,
      type: FILLER_TYPES.NEUTRAL,
      detected: true,
      preserveCommercialAnchor: true,
      blocksClarification: true,
      reasonCode: "neutral_filler_preserves_active_commercial_thread",
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    };
  }

  if (/^(hm+|hum+|hmm+|nao sei|não sei|sei la|seila|talvez)$/.test(core) && commercialThreadActive) {
    return {
      version: FILLER_GOVERNANCE_VERSION,
      type: FILLER_TYPES.UNCERTAINTY,
      detected: true,
      preserveCommercialAnchor: true,
      blocksClarification: true,
      reasonCode: "filler_does_not_clear_commercial_anchor",
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    };
  }

  return {
    version: FILLER_GOVERNANCE_VERSION,
    type: FILLER_TYPES.NONE,
    detected: false,
    preserveCommercialAnchor: false,
    blocksClarification: false,
    reasonCode: "not_classified_filler",
  };
}

export function resolveConversationalFillerInCommercialContext(options = {}) {
  return classifyConversationalFiller(options.message || "", options);
}

export function fillerGovernanceToTrace(filler = null) {
  if (!filler?.detected) return null;
  return {
    version: filler.version,
    type: filler.type,
    preserveCommercialAnchor: filler.preserveCommercialAnchor,
    blocksClarification: filler.blocksClarification,
    reasonCode: filler.reasonCode,
  };
}
