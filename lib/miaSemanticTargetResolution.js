/**
 * PATCH 4.1I.3 — Semantic Target Resolution
 *
 * Resolves who or what the user's message refers to (MIA, product, prior answer, etc.).
 * MIA owns the intelligence; this layer only resolves reference — never verbalizes.
 */

import { SOCIAL_INTENT_FAMILIES } from "./miaSocialIntentTaxonomy.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";

export const SEMANTIC_TARGET_RESOLUTION_VERSION = "4.1I.3.V.2.2";

/** Minimum conversational context required before inferring MIA/product target on short social turns. */
export function hasSufficientSocialTargetContext(conversationMessages = [], productCtx = {}) {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  if (messages.length === 0) return false;
  if (productCtx.hasRecentMiaGreeting) return true;
  if (productCtx.hasConversationProductDiscussion) return true;
  if (productCtx.hasRecentAssistantReply && messages.length >= 2) return true;
  return messages.length >= 2;
}

export const SEMANTIC_TARGETS = Object.freeze({
  MIA: "mia",
  USER: "user",
  PRODUCT: "product",
  BRAND: "brand",
  PREVIOUS_ANSWER: "previous_answer",
  CONVERSATION: "conversation",
  SITUATION: "situation",
  EXTERNAL_ENTITY: "external_entity",
  UNKNOWN: "unknown",
});

const PRODUCT_ENTITY_PATTERN =
  /\b(galaxy|iphone|samsung|motorola|xiaomi|redmi|dell|lenovo|notebook|celular|smartphone|aparelho|produto|modelo|televis\w+|mouse|placa\s+de\s+v[ií]deo|a55|a54|s23|s24|moto\s+edge)\b/i;

const PRODUCT_DEMONSTRATIVE =
  /\b(esse|essa|este|esta|ele|ela|isso|aquilo|dele|dela|desse|dessa|aparelho|produto)\b/i;

const MIA_ADDRESS =
  /\b(mia|voce|você|vc|contigo|contigo|pra voce|pra você|de voce|de você|te)\b/i;

const AESTHETIC_PREDICATE =
  /\b(lind\w*|bonit\w*|fei\w*|inteligent\w*|espert\w*|elegante|premium|visual|design|charmos\w*|gostei\s+de\s+voce|gostei\s+de\s+você|gostei\s+de\s+vc)\b/i;

const RESPONSE_APPROVAL_PATTERN =
  /\b(gostei\s+da\s+resposta|boa\s+resposta|resposta\s+(?:foi\s+)?(?:otim\w*|boa|show|massa)|mandou\s+bem\s+na\s+resposta|(?:essa|sua)\s+resposta\s+ficou\s+(?:otim\w*|boa|show|massa|clar\w*)|resposta\s+ficou\s+(?:otim\w*|boa|show|massa|clar\w*))\b/i;

const SHORT_RESPONSE_APPROVAL_PATTERN =
  /^(muito\s+boa|boa\s+demais|otim\w*|show|massa|top)$/i;

const CONVERSATION_APPRECIATION_PATTERN =
  /\b(gostei\s+(?:dessa|da)\s+conversa|curti\s+(?:o|a)\s+conversa|boa\s+conversa|estou\s+gostando\s+da\s+conversa|legal\s+conversar)\b/i;

const TARGET_CORRECTION_PATTERN =
  /\b(estou\s+falando\s+do|eu\s+estava\s+falando\s+do|na\s+verdade\s+[eé]\s+o|quis\s+dizer\s+o|me\s+referia\s+ao|falo\s+do\s+celular|falo\s+da\s+traseira)\b/i;

const PRONOUN_ONLY_AESTHETIC =
  /^(ele|ela|isso)\s+(?:[eé]\s+)?(lind\w*|bonit\w*|fei\w*)$/i;

const PRODUCT_AESTHETIC_PATTERN =
  /\b(esse|essa|este|esta|ele|ela|aparelho|produto|celular|design|tela|câmera|camera)\b.{0,30}\b(lind\w*|bonit\w*|fei\w*)\b|\b(lind\w*|bonit\w*)\b.{0,30}\b(esse|essa|design|tela|aparelho|produto|celular)\b/i;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(text = "") {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function scanConversationForProductContext(conversationMessages = [], sessionContext = {}) {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  const recent = messages.slice(-8);
  let hasConversationProductDiscussion = false;
  let hasCommercialContext = false;
  let lastProductMention = null;
  let hasRecentMiaGreeting = false;
  let hasRecentAssistantReply = false;

  for (const msg of recent) {
    const content = normalizeText(msg?.content || "");
    if (!content) continue;

    if (msg?.role === "assistant" && content.length > 20) {
      hasRecentAssistantReply = true;
    }

    if (msg?.role === "user") {
      if (/^(oi|ol[aá]|opa|eae|oi,?\s*mia)\b/.test(content)) {
        hasRecentMiaGreeting = true;
      }
      if (PRODUCT_ENTITY_PATTERN.test(content) || PRODUCT_DEMONSTRATIVE.test(content)) {
        hasConversationProductDiscussion = true;
        const match = content.match(PRODUCT_ENTITY_PATTERN);
        if (match?.[0]) lastProductMention = match[0];
      }
      if (
        /\b(recomend\w*|compar\w*|compensa|vale\s+a\s+pena|quanto\s+custa|preco|preço|compr\w*|celular|notebook)\b/.test(
          content
        )
      ) {
        hasCommercialContext = true;
      }
    }

    if (msg?.role === "assistant") {
      if (PRODUCT_ENTITY_PATTERN.test(content)) {
        hasConversationProductDiscussion = true;
        const match = content.match(PRODUCT_ENTITY_PATTERN);
        if (match?.[0]) lastProductMention = match[0];
      }
      if (/\b(recomend\w*|compar\w*|ganha|abre\s+m[aã]o|orçamento|faixa\s+de\s+preço)\b/.test(content)) {
        hasCommercialContext = true;
      }
    }
  }

  const sessionProduct =
    sessionContext?.lastBestProduct?.product_name ||
    sessionContext?.activeProduct?.product_name ||
    sessionContext?.lastProductName ||
    null;

  const hasSessionProductAnchor = !!sessionProduct;
  if (sessionProduct && hasConversationProductDiscussion) {
    lastProductMention = lastProductMention || sessionProduct;
  }

  return {
    hasConversationProductDiscussion,
    hasSessionProductAnchor,
    hasRecentProductDiscussion: hasConversationProductDiscussion,
    hasCommercialContext,
    lastProductMention: lastProductMention || (hasConversationProductDiscussion ? sessionProduct : null),
    hasRecentMiaGreeting,
    hasRecentAssistantReply,
    hasProduct: hasConversationProductDiscussion || hasSessionProductAnchor,
  };
}

function resolveFromTaxonomySignals(recognition = {}) {
  const signals = recognition.socialIntentSignals || [];
  const primary = recognition.primarySocialIntent || "";

  if (
    signals.some((s) =>
      ["mia_target", "compliment_to_mia", "praise_to_mia", "flirt_to_mia"].includes(s)
    )
  ) {
    return {
      target: SEMANTIC_TARGETS.MIA,
      confidence: 0.92,
      reasonCodes: ["taxonomy_mia_target_signal"],
    };
  }

  if (
    primary === SOCIAL_INTENT_FAMILIES.GRATITUDE ||
    primary === SOCIAL_INTENT_FAMILIES.PRAISE ||
    (primary === SOCIAL_INTENT_FAMILIES.COMPLIMENT && MIA_ADDRESS.test(normalizeText(recognition.resolvedQuery || "")))
  ) {
    return {
      target: SEMANTIC_TARGETS.MIA,
      confidence: 0.85,
      reasonCodes: ["taxonomy_social_family_mia"],
    };
  }

  if (
    primary === SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST ||
    primary === SOCIAL_INTENT_FAMILIES.SMALL_TALK ||
    primary === SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT
  ) {
    return {
      target: SEMANTIC_TARGETS.CONVERSATION,
      confidence: 0.82,
      reasonCodes: ["taxonomy_conversation_family"],
    };
  }

  if (
    [SOCIAL_INTENT_FAMILIES.IRONY, SOCIAL_INTENT_FAMILIES.SARCASM, SOCIAL_INTENT_FAMILIES.JOKE, SOCIAL_INTENT_FAMILIES.HUMOR, SOCIAL_INTENT_FAMILIES.CORRECTION, SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR].includes(
      primary
    )
  ) {
    return {
      target: SEMANTIC_TARGETS.CONVERSATION,
      confidence: 0.8,
      reasonCodes: ["taxonomy_repair_or_play_family"],
    };
  }

  if (primary === SOCIAL_INTENT_FAMILIES.APPROVAL) {
    return {
      target: SEMANTIC_TARGETS.PREVIOUS_ANSWER,
      confidence: 0.78,
      reasonCodes: ["taxonomy_approval_family"],
    };
  }

  return null;
}

/**
 * Resolve semantic target for the current turn.
 *
 * @param {object} input
 * @param {string} input.message
 * @param {object} [input.recognition]
 * @param {object[]} [input.conversationMessages]
 * @param {object} [input.sessionContext]
 * @returns {{ target: string, confidence: number, reasonCodes: string[], productReference?: string|null }}
 */
export function resolveSemanticTarget(input = {}) {
  const message = String(input.message || input.recognition?.resolvedQuery || "").trim();
  const recognition = input.recognition || {};
  const conversationMessages = input.conversationMessages || [];
  const sessionContext = input.sessionContext || {};
  const normalized = normalizeText(message);
  const productCtx = scanConversationForProductContext(conversationMessages, sessionContext);

  const resolution = resolveSemanticTargetCore({
    message,
    recognition,
    conversationMessages,
    sessionContext,
    normalized,
    productCtx,
  });

  return { ...resolution, productContext: productCtx };
}

function resolveSemanticTargetCore({
  message,
  recognition,
  conversationMessages,
  normalized,
  productCtx,
}) {

  if (!normalized) {
    return {
      target: SEMANTIC_TARGETS.UNKNOWN,
      confidence: 0,
      reasonCodes: ["empty_message"],
    };
  }

  const taxonomyHint = resolveFromTaxonomySignals(recognition);
  const primary = recognition.primarySocialIntent || "";
  const signals = recognition.socialIntentSignals || [];

  const shortAestheticOnly = /^(lind\w*|bonit\w*|fei\w*|legal|top|show|massa)$/i.test(message.trim());
  const shortAestheticPhrase =
    /^(lind\w*|bonit\w*|fei\w*)\s+(demais|mesmo|d+|dmr|pra\s+caramba)$/i.test(message.trim()) ||
    /^(top|show|massa)\s+(demais|mesmo)$/i.test(message.trim());

  const miaTaxonomyTarget =
    taxonomyHint?.target === SEMANTIC_TARGETS.MIA ||
    signals.some((s) =>
      ["mia_target", "compliment_to_mia", "praise_to_mia", "flirt_to_mia"].includes(s)
    );

  if (shortAestheticOnly || shortAestheticPhrase) {
    if (
      productCtx.hasRecentMiaGreeting &&
      miaTaxonomyTarget &&
      !productCtx.hasConversationProductDiscussion
    ) {
      return {
        target: SEMANTIC_TARGETS.MIA,
        confidence: 0.88,
        reasonCodes: ["short_aesthetic_mia_greeting_context"],
      };
    }
  }

  if (
    (shortAestheticOnly || shortAestheticPhrase) &&
    productCtx.hasConversationProductDiscussion &&
    !MIA_ADDRESS.test(normalized)
  ) {
    return {
      target: SEMANTIC_TARGETS.PRODUCT,
      confidence: 0.86,
      reasonCodes: ["short_aesthetic_with_product_context"],
      productReference: productCtx.lastProductMention,
    };
  }

  if (shortAestheticOnly) {
    if (productCtx.hasConversationProductDiscussion && productCtx.hasCommercialContext) {
      return {
        target: SEMANTIC_TARGETS.PRODUCT,
        confidence: 0.84,
        reasonCodes: ["short_aesthetic_product_context"],
        productReference: productCtx.lastProductMention,
      };
    }
    if (productCtx.hasConversationProductDiscussion) {
      return {
        target: SEMANTIC_TARGETS.PRODUCT,
        confidence: 0.78,
        reasonCodes: ["short_aesthetic_recent_product_discussion"],
        productReference: productCtx.lastProductMention,
      };
    }
    if (
      productCtx.hasRecentMiaGreeting &&
      !productCtx.hasCommercialContext &&
      hasSufficientSocialTargetContext(conversationMessages, productCtx)
    ) {
      return {
        target: SEMANTIC_TARGETS.MIA,
        confidence: 0.8,
        reasonCodes: ["short_aesthetic_mia_greeting_context"],
      };
    }
    if (!hasSufficientSocialTargetContext(conversationMessages, productCtx)) {
      return {
        target: SEMANTIC_TARGETS.UNKNOWN,
        confidence: 0.38,
        reasonCodes: ["insufficient_context_for_target"],
        productReference: productCtx.lastProductMention,
      };
    }
    if (!productCtx.hasCommercialContext && miaTaxonomyTarget) {
      return {
        target: SEMANTIC_TARGETS.MIA,
        confidence: 0.72,
        reasonCodes: ["short_aesthetic_no_commercial_context"],
      };
    }
    return {
      target: SEMANTIC_TARGETS.UNKNOWN,
      confidence: 0.45,
      reasonCodes: ["short_aesthetic_ambiguous"],
      productReference: productCtx.lastProductMention,
    };
  }

  if (RESPONSE_APPROVAL_PATTERN.test(normalized)) {
    return {
      target: SEMANTIC_TARGETS.PREVIOUS_ANSWER,
      confidence: 0.9,
      reasonCodes: ["explicit_response_approval"],
    };
  }

  if (
    SHORT_RESPONSE_APPROVAL_PATTERN.test(message.trim()) &&
    productCtx.hasRecentAssistantReply &&
    !productCtx.hasRecentProductDiscussion &&
    !MIA_ADDRESS.test(normalized)
  ) {
    return {
      target: SEMANTIC_TARGETS.PREVIOUS_ANSWER,
      confidence: 0.82,
      reasonCodes: ["short_response_approval_with_context"],
    };
  }

  if (CONVERSATION_APPRECIATION_PATTERN.test(normalized)) {
    return {
      target: SEMANTIC_TARGETS.CONVERSATION,
      confidence: 0.88,
      reasonCodes: ["conversation_appreciation"],
    };
  }

  if (
    TARGET_CORRECTION_PATTERN.test(normalized) &&
    (productCtx.hasRecentProductDiscussion || PRODUCT_ENTITY_PATTERN.test(normalized))
  ) {
    return {
      target: SEMANTIC_TARGETS.PRODUCT,
      confidence: 0.84,
      reasonCodes: ["target_correction_to_product"],
      productReference: productCtx.lastProductMention,
    };
  }

  if (PRONOUN_ONLY_AESTHETIC.test(message.trim()) && !productCtx.hasRecentProductDiscussion) {
    return {
      target: SEMANTIC_TARGETS.UNKNOWN,
      confidence: 0.72,
      reasonCodes: ["pronoun_aesthetic_without_context"],
    };
  }

  if (PRODUCT_AESTHETIC_PATTERN.test(normalized) && !MIA_ADDRESS.test(normalized)) {
    return {
      target: SEMANTIC_TARGETS.PRODUCT,
      confidence: 0.9,
      reasonCodes: ["explicit_product_aesthetic_predicate"],
      productReference: productCtx.lastProductMention,
    };
  }

  if (PRODUCT_ENTITY_PATTERN.test(normalized) && AESTHETIC_PREDICATE.test(normalized) && !MIA_ADDRESS.test(normalized)) {
    return {
      target: SEMANTIC_TARGETS.PRODUCT,
      confidence: 0.88,
      reasonCodes: ["explicit_product_entity_aesthetic"],
      productReference: normalized.match(PRODUCT_ENTITY_PATTERN)?.[0] || productCtx.lastProductMention,
    };
  }

  if (
    /\b(gostei|curti|amei)\b/.test(normalized) &&
    PRODUCT_DEMONSTRATIVE.test(normalized) &&
    !MIA_ADDRESS.test(normalized) &&
    !/\bconversa\b/.test(normalized)
  ) {
    return {
      target: SEMANTIC_TARGETS.PRODUCT,
      confidence: 0.86,
      reasonCodes: ["product_liking_demonstrative"],
      productReference: productCtx.lastProductMention,
    };
  }

  if (
    /\b(gostei|curti|amei)\b/.test(normalized) &&
    (MIA_ADDRESS.test(normalized) || /\b(de\s+voce|de\s+você|de\s+vc)\b/.test(normalized))
  ) {
    return {
      target: SEMANTIC_TARGETS.MIA,
      confidence: 0.9,
      reasonCodes: ["mia_liking_explicit"],
    };
  }

  if (MIA_ADDRESS.test(normalized) && AESTHETIC_PREDICATE.test(normalized) && !PRODUCT_DEMONSTRATIVE.test(normalized)) {
    return {
      target: SEMANTIC_TARGETS.MIA,
      confidence: 0.9,
      reasonCodes: ["mia_address_aesthetic_predicate"],
    };
  }

  if (MIA_ADDRESS.test(normalized) && !PRODUCT_DEMONSTRATIVE.test(normalized)) {
    if (
      [SOCIAL_INTENT_FAMILIES.COMPLIMENT, SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.GRATITUDE, SOCIAL_INTENT_FAMILIES.AFFECTION, SOCIAL_INTENT_FAMILIES.FLIRT].includes(
        primary
      ) ||
      signals.some((s) => String(s).includes("mia"))
    ) {
      return {
        target: SEMANTIC_TARGETS.MIA,
        confidence: 0.87,
        reasonCodes: ["mia_address_social_family"],
      };
    }
  }

  if (taxonomyHint && !(shortAestheticOnly && productCtx.hasRecentProductDiscussion && taxonomyHint.target === SEMANTIC_TARGETS.MIA)) {
    if (
      taxonomyHint.target === SEMANTIC_TARGETS.MIA &&
      !hasSufficientSocialTargetContext(conversationMessages, productCtx) &&
      (shortAestheticOnly || shortAestheticPhrase)
    ) {
      return {
        target: SEMANTIC_TARGETS.UNKNOWN,
        confidence: 0.38,
        reasonCodes: ["insufficient_context_for_target", "taxonomy_mia_overridden"],
        productReference: productCtx.lastProductMention,
      };
    }
    if (
      taxonomyHint.target === SEMANTIC_TARGETS.MIA &&
      productCtx.hasRecentProductDiscussion &&
      PRODUCT_DEMONSTRATIVE.test(normalized) &&
      !MIA_ADDRESS.test(normalized)
    ) {
      return {
        target: SEMANTIC_TARGETS.PRODUCT,
        confidence: 0.83,
        reasonCodes: ["taxonomy_overridden_by_product_context"],
        productReference: productCtx.lastProductMention,
      };
    }
    return taxonomyHint;
  }

  if (AESTHETIC_PREDICATE.test(normalized) && PRODUCT_DEMONSTRATIVE.test(normalized) && productCtx.hasProduct) {
    return {
      target: SEMANTIC_TARGETS.PRODUCT,
      confidence: 0.78,
      reasonCodes: ["demonstrative_with_product_history"],
      productReference: productCtx.lastProductMention,
    };
  }

  if (
    recognition.interactionMode === MIA_INTERACTION_MODES.COMMERCE &&
    PRODUCT_DEMONSTRATIVE.test(normalized) &&
    tokenCount(normalized) <= 4
  ) {
    return {
      target: SEMANTIC_TARGETS.PRODUCT,
      confidence: 0.7,
      reasonCodes: ["commerce_mode_demonstrative"],
      productReference: productCtx.lastProductMention,
    };
  }

  if (
    [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST, SOCIAL_INTENT_FAMILIES.SMALL_TALK].includes(primary) ||
    recognition.humanObjective === "continue_conversation"
  ) {
    return {
      target: SEMANTIC_TARGETS.CONVERSATION,
      confidence: 0.75,
      reasonCodes: ["conversation_objective"],
    };
  }

  const resolution = {
    target: SEMANTIC_TARGETS.UNKNOWN,
    confidence: 0.35,
    reasonCodes: ["unresolved_target"],
  };
  return resolution;
}

export function semanticTargetToTrace(resolution = null) {
  if (!resolution) return null;
  return {
    version: SEMANTIC_TARGET_RESOLUTION_VERSION,
    target: resolution.target,
    confidence: resolution.confidence,
    reasonCodes: resolution.reasonCodes || [],
    productReference: resolution.productReference || null,
  };
}
