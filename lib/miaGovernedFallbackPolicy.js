/**
 * PATCH 4.1I.3 — Governed Fallback Policy
 *
 * Contract-aware fallback selection. Preserves intent, target and interaction mode.
 * MIA owns the intelligence; fallbacks only verbalize governed decisions.
 */

import { RESPONSE_DEPTH } from "./miaHumanConversationExperience.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import { SOCIAL_INTENT_FAMILIES } from "./miaSocialIntentTaxonomy.js";
import {
  GOVERNED_SOCIAL_ROUTING_KEYS,
  isCommercialFallbackBlocked,
  isEntityOpinionFallbackAllowed,
} from "./miaSemanticAuthority.js";
import { SEMANTIC_TARGETS } from "./miaSemanticTargetResolution.js";
import { buildBriefOfficialIdentityReply } from "./miaCompanyKnowledge.js";
import { SOCIAL_DISTANCE } from "./miaSocialResponsePerception.js";

export const GOVERNED_FALLBACK_POLICY_VERSION = "4.1I.3";

export const FALLBACK_FAMILIES = Object.freeze({
  SOCIAL: "social",
  GRATITUDE: "gratitude",
  COMPLIMENT: "compliment",
  PRAISE: "praise",
  IRONY_REPAIR: "irony_repair",
  HUMOR: "humor",
  CONVERSATION: "conversation",
  EMOTIONAL: "emotional",
  CLARIFICATION: "clarification",
  PRODUCT_AESTHETIC: "product_aesthetic",
  COMMERCIAL: "commercial",
  AMBIGUOUS_REFERENCE: "ambiguous_reference",
  TECHNICAL: "technical",
});

const FALLBACK_POOLS = Object.freeze({
  [FALLBACK_FAMILIES.COMPLIMENT]: [
    "Obrigada!",
    "Valeu pelo elogio!",
    "Que gentil — obrigada.",
  ],
  [FALLBACK_FAMILIES.PRAISE]: [
    "Fico feliz em ter ajudado!",
    "Que bom — obrigada pelo reconhecimento.",
    "Imagina, fico contente em ajudar.",
  ],
  [FALLBACK_FAMILIES.GRATITUDE]: ["Imagina.", "Por nada!", "Disponha."],
  [FALLBACK_FAMILIES.IRONY_REPAIR]: [
    "Ah, entendi — foi no tom.",
    "Beleza, pego a ironia.",
    "Entendi — valeu por avisar.",
  ],
  [FALLBACK_FAMILIES.HUMOR]: ["Hehe!", "Boa.", "Entendi."],
  [FALLBACK_FAMILIES.CONVERSATION]: [
    "Claro — podemos conversar.",
    "Sem problema, fico por aqui no papo.",
    "Beleza — pode falar à vontade.",
  ],
  [FALLBACK_FAMILIES.EMOTIONAL]: ["Puxado.", "Dia pesado mesmo.", "Compreendo."],
  [FALLBACK_FAMILIES.PRODUCT_AESTHETIC]: [
    "O visual dele realmente chama atenção.",
    "Ele tem um design bem marcante.",
    "Estética pesa diferente para cada pessoa.",
  ],
  [FALLBACK_FAMILIES.AMBIGUOUS_REFERENCE]: [
    "Entendi — você fala disso ou de outra coisa?",
    "Me diz rapidinho a que você se refere.",
  ],
  [FALLBACK_FAMILIES.CLARIFICATION]: [
    "Me explica um pouco melhor o que você quis dizer.",
    "Pode detalhar um pouco?",
  ],
});

function hashSeed(seed = "") {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickVariant(pool = [], seed = "") {
  if (!pool.length) return "";
  return pool[hashSeed(seed) % pool.length];
}

function resolveFallbackFamily(contract = {}, targetResolution = {}) {
  const routingKey = contract.governedSocialRoutingKey;
  const primary = contract.primarySocialIntent || "";
  const target = targetResolution?.target || contract.resolvedSemanticTarget;

  if (routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT) {
    return FALLBACK_FAMILIES.COMPLIMENT;
  }
  if (routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.MIA_PRAISE) {
    return FALLBACK_FAMILIES.PRAISE;
  }
  if (routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.MIA_GRATITUDE || primary === SOCIAL_INTENT_FAMILIES.GRATITUDE) {
    return FALLBACK_FAMILIES.GRATITUDE;
  }
  if (routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.RESPONSE_APPROVAL) {
    return FALLBACK_FAMILIES.PRAISE;
  }
  if (routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.IRONY_REPAIR) {
    return FALLBACK_FAMILIES.IRONY_REPAIR;
  }
  if (routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.HUMOR_PLAY) {
    return FALLBACK_FAMILIES.HUMOR;
  }
  if (routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL) {
    return FALLBACK_FAMILIES.CONVERSATION;
  }
  if (
    routingKey === GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION ||
    (target === SEMANTIC_TARGETS.PRODUCT && isEntityOpinionFallbackAllowed(contract, targetResolution))
  ) {
    return FALLBACK_FAMILIES.PRODUCT_AESTHETIC;
  }
  if (target === SEMANTIC_TARGETS.UNKNOWN) {
    return FALLBACK_FAMILIES.AMBIGUOUS_REFERENCE;
  }
  if (contract.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return FALLBACK_FAMILIES.EMOTIONAL;
  }
  if (contract.interactionMode === MIA_INTERACTION_MODES.CLARIFICATION) {
    return FALLBACK_FAMILIES.CLARIFICATION;
  }
  if (primary === SOCIAL_INTENT_FAMILIES.GREETING || contract.socialFamilies?.greeting) {
    return FALLBACK_FAMILIES.SOCIAL;
  }
  if (isCommercialFallbackBlocked(contract)) {
    return FALLBACK_FAMILIES.CONVERSATION;
  }
  return FALLBACK_FAMILIES.SOCIAL;
}

function buildProductAestheticFallback(contract = {}, depth = RESPONSE_DEPTH.BRIEF) {
  const ref = contract.productReference;
  const normalized = String(contract.userMessageForSpecificity || "").toLowerCase();
  if (ref && !/^(esse|essa)$/.test(ref)) {
    const label = ref.charAt(0).toUpperCase() + ref.slice(1);
    if (/\bfei\w*/.test(normalized)) {
      return "Estética pesa diferente para cada pessoa.";
    }
    if (depth === RESPONSE_DEPTH.MINIMAL) {
      return `O ${label} tem um visual bem marcante.`;
    }
    return `O design do ${label} realmente chama atenção. Foi o visual que mais pesou para você?`;
  }
  return pickVariant(FALLBACK_POOLS[FALLBACK_FAMILIES.PRODUCT_AESTHETIC], `${ref}|product`);
}

function buildGreetingFallback(message = "") {
  if (/boa noite/i.test(message)) return "Boa noite!";
  if (/bom dia/i.test(message)) return "Bom dia!";
  if (/boa tarde/i.test(message)) return "Boa tarde!";
  if (/eae|e ai|e aí|opa|oii|oi/i.test(message)) return "Opa!";
  return "Oi!";
}

function buildFarewellFallback(message = "") {
  if (/dormir|descansar/i.test(message)) return "Boa noite — descanse bem.";
  if (/boa noite/i.test(message)) return "Boa noite!";
  return "Até mais!";
}

function buildShortReactionFallback(message = "") {
  const normalized = String(message || "").trim().toLowerCase();
  if (/^kkk+|^haha+|^hehe+|^rs+$/i.test(normalized)) return "Hehe!";
  if (/^boa$/i.test(normalized)) return "Boa!";
  if (/^show$/i.test(normalized)) return "Show!";
  if (/^pois e|^pois é/i.test(normalized)) return "Entendi.";
  if (/^a[ií]\s*sim$/i.test(normalized)) return "Aí sim.";
  if (/^hm+$/i.test(normalized)) return "Hm.";
  if (/^legal$/i.test(normalized)) return "Entendi.";
  return pickVariant(FALLBACK_POOLS[FALLBACK_FAMILIES.HUMOR], normalized);
}

/**
 * Select a governed fallback compatible with the current contract.
 *
 * @param {object} contract
 * @param {object} [options]
 * @param {string} [options.failureReason]
 * @param {string} [options.period]
 * @returns {{ text: string, family: string, functionName: string, reasonCodes: string[] }}
 */
export function selectGovernedFallback(contract = {}, options = {}) {
  const message = contract.userMessageForSpecificity || "";
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  const targetResolution = contract.semanticTargetResolution || {};
  const failureReason = options.failureReason || "unspecified";
  const seed = `${message}|${contract.primarySocialIntent}|${contract.resolvedSemanticTarget}|${failureReason}`;

  if (contract.farewellMode || contract.socialFamilies?.farewell) {
    return {
      text: buildFarewellFallback(message),
      family: FALLBACK_FAMILIES.SOCIAL,
      functionName: "buildFarewellFallback",
      reasonCodes: ["farewell_contract", failureReason],
    };
  }

  if (contract.primaryIntent === "greeting" || contract.socialFamilies?.greeting) {
    return {
      text: buildGreetingFallback(message),
      family: FALLBACK_FAMILIES.SOCIAL,
      functionName: "buildGreetingFallback",
      reasonCodes: ["greeting_contract", failureReason],
    };
  }

  if (
    contract.interactionMode === MIA_INTERACTION_MODES.IDENTITY ||
    contract.identityMode ||
    contract.personalityPolicy?.socialDistance === SOCIAL_DISTANCE.PROFESSIONAL_CLEAR
  ) {
    return {
      text: buildBriefOfficialIdentityReply(message),
      family: FALLBACK_FAMILIES.SOCIAL,
      functionName: "buildBriefOfficialIdentityReply",
      reasonCodes: ["identity_contract", failureReason],
    };
  }

  if (contract.shortReactionMode || contract.socialFamilies?.reaction) {
    return {
      text: buildShortReactionFallback(message),
      family: FALLBACK_FAMILIES.HUMOR,
      functionName: "buildShortReactionFallback",
      reasonCodes: ["short_reaction_contract", failureReason],
    };
  }

  const family = resolveFallbackFamily(contract, targetResolution);

  if (family === FALLBACK_FAMILIES.PRODUCT_AESTHETIC && isEntityOpinionFallbackAllowed(contract, targetResolution)) {
    return {
      text: buildProductAestheticFallback(contract, depth),
      family,
      functionName: "buildProductAestheticFallback",
      reasonCodes: ["product_aesthetic_allowed", failureReason],
    };
  }

  if (isCommercialFallbackBlocked(contract) && family === FALLBACK_FAMILIES.PRODUCT_AESTHETIC) {
    const socialFamily = resolveFallbackFamily({ ...contract, governedSocialRoutingKey: GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL }, targetResolution);
    return {
      text: pickVariant(FALLBACK_POOLS[socialFamily] || FALLBACK_POOLS[FALLBACK_FAMILIES.CONVERSATION], seed),
      family: socialFamily,
      functionName: "selectGovernedFallback",
      reasonCodes: ["blocked_product_aesthetic_on_social", failureReason],
    };
  }

  const pool = FALLBACK_POOLS[family] || FALLBACK_POOLS[FALLBACK_FAMILIES.CONVERSATION];
  return {
    text: pickVariant(pool, seed),
    family,
    functionName: "selectGovernedFallback",
    reasonCodes: ["governed_pool", family, failureReason],
  };
}

export function governedFallbackToTrace(selection = null) {
  if (!selection) return null;
  return {
    version: GOVERNED_FALLBACK_POLICY_VERSION,
    family: selection.family,
    functionName: selection.functionName,
    reasonCodes: selection.reasonCodes || [],
  };
}
