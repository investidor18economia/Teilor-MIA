/**
 * PATCH 5.8.1 — Correction Continuity & Factual Contrast Governance
 *
 * Preserves correction chain across turns and recognizes factual contrast fragments
 * without phrase-specific hardcodes. MIA owns the intelligence.
 */

import { SOCIAL_INTENT_FAMILIES } from "./miaSocialIntentTaxonomy.js";

export const CORRECTION_CONTINUITY_VERSION = "5.8.1";

/** Correction-request verb morphology — not phrase authority. */
const CORRECTION_REQUEST_VERB =
  /\b(corr(?:ig|ij)\w*|arrum\w*|consert\w*|rev(?:[êe]|is)\w*|ajust\w*|retific\w*)\b/;

/** Prior-turn challenge markers (structural families). */
const PRIOR_CHALLENGE_MARKERS =
  /\b(n[aã]o\s+entend\w*|voce\s+nao\s+entend|você\s+não\s+entend|entendeu\s+errad\w*|(?:voce|você|vc)\s+err\w*|(?:est[aá]|ta)\s+errad\w*|(?:isso|essa|esse)\s+(?:resposta\s+)?(?:est[aá]|ta)\s+errad\w*|(?:dado|informa[cç][aã]o)\s+errad\w*|nao\s+est[aá]\s+certo|não\s+está\s+certo|ficou\s+(?:ruim|p[eé]ssim\w*|seco)|est[aá]\s+errad\w*|citou\s+est[aá]\s+errad\w*)\b/;

const PRIOR_INSULT_WITH_ERROR =
  /\b(idiot\w*|burr\w*|inutil\w*|imbecil\w*)\b.{0,40}\b(err\w*|errad\w*)\b|\b(err\w*|errad\w*)\b.{0,40}\b(idiot\w*|burr\w*|inutil\w*)\b/;

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
  return normalizeText(text).replace(
    /\s+(mano|mina|cara|bro|parceir\w*|amig\w*|vei|mlk|gente|z[eé]|tipo)\s*$/i,
    ""
  ).trim();
}

function tokenCount(text = "") {
  const q = normalizeText(text);
  if (!q) return 0;
  return q.split(/\s+/).filter(Boolean).length;
}

function getRecentUserMessages(conversationMessages = [], limit = 4) {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  const userMsgs = [];
  for (let i = messages.length - 1; i >= 0 && userMsgs.length < limit; i -= 1) {
    if (messages[i]?.role === "user") {
      userMsgs.unshift(String(messages[i]?.content || ""));
    }
  }
  return userMsgs;
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

/**
 * Structural factual contrast: asserted value + negation + prior/contrasted value.
 */
export function detectFactualContrastFragment(message = "") {
  const q = stripVocativeParticle(message);
  if (!q) {
    return { detected: false, reasonCode: "empty_message" };
  }

  const parts = q.split(/\s+(?:nao|não)\s+/);
  if (parts.length !== 2) {
    return { detected: false, reasonCode: "no_contrast_structure" };
  }

  const left = parts[0].trim();
  const right = parts[1].trim();
  if (!left || !right) {
    return { detected: false, reasonCode: "incomplete_contrast_pair" };
  }

  const leftTokens = left.split(/\s+/).filter(Boolean).length;
  const rightTokens = right.split(/\s+/).filter(Boolean).length;
  if (leftTokens > 7 || rightTokens > 5) {
    return { detected: false, reasonCode: "contrast_pair_too_long" };
  }

  const hasDigitSignal = /\d/.test(left) || /\d/.test(right);
  const hasContrastVerb = /^(s[aã]o|e[eé]|tem|pesa|mede|faz|cust[ao]|vale|fica|da|dá)\b/.test(left);

  if (!hasDigitSignal && !(hasContrastVerb && leftTokens <= 5)) {
    return { detected: false, reasonCode: "contrast_without_measurable_signal" };
  }

  return {
    detected: true,
    version: CORRECTION_CONTINUITY_VERSION,
    assertedSegment: left,
    contrastedSegment: right,
    requiresFactValidation: true,
    reasonCode: "factual_contrast_detected_from_previous_answer",
  };
}

export function isCorrectionRequestMessage(message = "") {
  const core = stripVocativeParticle(message);
  if (!core) return false;
  if (!CORRECTION_REQUEST_VERB.test(core)) return false;
  if (tokenCount(core) > 6) return false;
  return true;
}

export function detectPriorCorrectionChallenge(conversationMessages = []) {
  const recentUsers = getRecentUserMessages(conversationMessages, 3);
  if (recentUsers.length === 0) {
    return { detected: false, reasonCode: "no_prior_user_turns" };
  }

  const priorUser = recentUsers.length >= 2 ? recentUsers[recentUsers.length - 2] : recentUsers[0];
  const normalized = normalizeText(priorUser);
  if (!normalized) {
    return { detected: false, reasonCode: "empty_prior_user_turn" };
  }

  if (PRIOR_CHALLENGE_MARKERS.test(normalized) || PRIOR_INSULT_WITH_ERROR.test(normalized)) {
    return {
      detected: true,
      version: CORRECTION_CONTINUITY_VERSION,
      challengedTurn: priorUser,
      reasonCode: "correction_chain_preserves_previous_target",
    };
  }

  const lastAssistant = normalizeText(getLastAssistantMessage(conversationMessages));
  if (lastAssistant && /\b(desculpa|revis|corrig|errei|pode\s+ser\s+que|vou\s+verificar)\b/.test(lastAssistant)) {
    return {
      detected: true,
      version: CORRECTION_CONTINUITY_VERSION,
      challengedTurn: priorUser,
      reasonCode: "correction_request_after_assistant_acknowledgment",
    };
  }

  return { detected: false, reasonCode: "no_prior_challenge_detected" };
}

/**
 * Resolve correction continuity for current turn.
 */
export function resolveCorrectionContinuity(
  message = "",
  { conversationMessages = [], sessionContext = {} } = {}
) {
  const factualContrast = detectFactualContrastFragment(message);
  if (factualContrast.detected) {
    const priorChallenge = detectPriorCorrectionChallenge(conversationMessages);
    return {
      version: CORRECTION_CONTINUITY_VERSION,
      active: true,
      kind: "factual_contrast",
      blocksClarification: true,
      requiresFactValidation: true,
      preservePreviousTarget: true,
      primarySocialIntent: SOCIAL_INTENT_FAMILIES.CORRECTION,
      reasonCodes: [
        factualContrast.reasonCode,
        priorChallenge.detected
          ? "correction_request_resolves_active_claim"
          : "user_correction_requires_fact_validation",
      ],
      factualContrast,
      priorChallenge,
    };
  }

  if (isCorrectionRequestMessage(message)) {
    const priorChallenge = detectPriorCorrectionChallenge(conversationMessages);
    if (priorChallenge.detected) {
      return {
        version: CORRECTION_CONTINUITY_VERSION,
        active: true,
        kind: "correction_continuation",
        blocksClarification: true,
        requiresFactValidation: false,
        preservePreviousTarget: true,
        primarySocialIntent: SOCIAL_INTENT_FAMILIES.CORRECTION,
        reasonCodes: [priorChallenge.reasonCode, "correction_request_resolves_active_claim"],
        priorChallenge,
      };
    }

    return {
      version: CORRECTION_CONTINUITY_VERSION,
      active: true,
      kind: "correction_request",
      blocksClarification: true,
      requiresFactValidation: false,
      preservePreviousTarget: !!sessionContext?.lastBestProduct,
      primarySocialIntent: SOCIAL_INTENT_FAMILIES.CORRECTION,
      reasonCodes: ["correction_request_without_anchor_needs_specific_clarification"],
      priorChallenge,
    };
  }

  return {
    version: CORRECTION_CONTINUITY_VERSION,
    active: false,
    blocksClarification: false,
    reasonCodes: [],
  };
}

export function correctionContinuityToTrace(resolution = null) {
  if (!resolution?.active) return null;
  return {
    version: resolution.version,
    kind: resolution.kind,
    blocksClarification: resolution.blocksClarification,
    preservePreviousTarget: resolution.preservePreviousTarget,
    requiresFactValidation: resolution.requiresFactValidation,
    reasonCodes: resolution.reasonCodes,
  };
}
