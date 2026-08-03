/**
 * PATCH 5.8.1.1 — Fact Validation Governance
 *
 * Separates user_claim from validated_fact. Blocks automatic adoption of
 * user-asserted corrections before authoritative validation.
 */

import { collectDecisionFactsFromSession } from "./miaDecisionFactsNarrative.js";
import {
  resolveCorrectionContinuity,
  CORRECTION_CONTINUITY_VERSION,
} from "./miaCorrectionContinuityGovernance.js";
import { pickHumanizedVariant, hashSeed } from "./miaVerbalizerHumanization.js";
import { RESPONSE_DEPTH } from "./miaHumanConversationExperience.js";

export const FACT_VALIDATION_GOVERNANCE_VERSION = "5.8.1.1";

export const FACT_VALIDATION_STATES = Object.freeze({
  NONE: "none",
  PENDING: "pending_validation",
  CONFIRMED: "confirmed_claim",
  REJECTED: "rejected_claim",
  NOT_VERIFIABLE: "not_verifiable",
});

const PENDING_VALIDATION_REPLY = Object.freeze({
  warm_light: [
    (c) => {
      const a = c.factValidation?.userClaim?.assertedLabel || "esse dado";
      const b = c.factValidation?.userClaim?.contrastedLabel || "o anterior";
      return `Entendi — você diz ${a} e não ${b}. Só assumo isso depois de validar.`;
    },
  ],
  warm_balanced: [
    (c) => {
      const a = c.factValidation?.userClaim?.assertedLabel || "esse dado";
      const b = c.factValidation?.userClaim?.contrastedLabel || "o anterior";
      return `Entendi. Você está dizendo que ${a}, não ${b}. Vou considerar essa correção apenas após validar a informação.`;
    },
    (c) => {
      const a = c.factValidation?.userClaim?.assertedLabel || "esse ponto";
      return `Compreendo a correção sobre ${a}. Antes de assumir esse dado como verdadeiro, preciso confirmá-lo.`;
    },
  ],
  warm_reserved: [
    (c) => {
      const a = c.factValidation?.userClaim?.assertedLabel || "esse dado";
      const b = c.factValidation?.userClaim?.contrastedLabel || "o valor anterior";
      return `Entendido — você indica ${a} em vez de ${b}. Preciso validar antes de adotar essa informação.`;
    },
  ],
});

const CONFIRMED_CLAIM_REPLY = Object.freeze({
  warm_light: [
    (c) => {
      const a = c.factValidation?.userClaim?.assertedLabel || "esse dado";
      return `Boa — revisei e ${a} confere melhor.`;
    },
  ],
  warm_balanced: [
    (c) => {
      const a = c.factValidation?.userClaim?.assertedLabel || "esse dado";
      return `Você tem razão — revisei a informação e ${a} confere.`;
    },
  ],
  warm_reserved: [
    (c) => {
      const a = c.factValidation?.userClaim?.assertedLabel || "a informação corrigida";
      return `Revisei a fonte disponível: ${a} está correto.`;
    },
  ],
});

const NOT_VERIFIABLE_REPLY = Object.freeze({
  warm_balanced: [
    () =>
      "Entendi a correção, mas não consigo confirmar esse dado com a informação que tenho agora.",
    () =>
      "Registrei o que você apontou, porém não tenho base confiável para validar esse detalhe neste momento.",
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

function warmthKey(contract = {}) {
  const w = contract.personalityPolicy?.warmth || "warm_balanced";
  if (w === "warm_light") return "warm_light";
  if (w === "warm_reserved") return "warm_reserved";
  return "warm_balanced";
}

function seedFromContract(contract = {}, extra = "") {
  return [
    contract.userMessageForSpecificity || "",
    contract.factValidation?.state || "",
    contract.factValidation?.userClaim?.asserted || "",
    extra,
  ].join("|");
}

function extractMeasurableTokens(text = "") {
  const normalized = normalizeText(text);
  const tokens = new Set();
  for (const match of normalized.match(/\d+[\d.,%]*/g) || []) {
    tokens.add(match.replace(",", "."));
  }
  for (const word of normalized.split(/\s+/).filter(Boolean)) {
    if (word.length >= 2 && word.length <= 24) tokens.add(word);
  }
  return [...tokens];
}

function buildClaimLabels(asserted = "", contrasted = "") {
  const a = String(asserted || "").trim();
  const b = String(contrasted || "").trim();
  return {
    asserted: a,
    contrasted: b,
    assertedLabel: a || "esse dado",
    contrastedLabel: b || "o valor anterior",
  };
}

function collectAuthoritativeCorpus(sessionContext = {}, conversationMessages = []) {
  const parts = [];
  const facts = collectDecisionFactsFromSession(sessionContext || {});
  if (facts) {
    parts.push(JSON.stringify(facts));
  }
  if (sessionContext?.lastBestProduct) {
    parts.push(JSON.stringify(sessionContext.lastBestProduct));
  }
  if (Array.isArray(sessionContext?.lastProducts)) {
    parts.push(JSON.stringify(sessionContext.lastProducts));
  }
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") {
      parts.push(String(messages[i]?.content || ""));
      break;
    }
  }
  return normalizeText(parts.join(" "));
}

function tokenPresentInText(token = "", text = "") {
  const t = normalizeText(token);
  const corpus = normalizeText(text);
  if (!t || !corpus) return false;
  if (t.length <= 2) {
    return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(corpus);
  }
  return corpus.includes(t);
}

function tryAuthoritativeClaimConfirmation(userClaim = {}, sessionContext = {}, conversationMessages = []) {
  const corpus = collectAuthoritativeCorpus(sessionContext, conversationMessages);
  if (!corpus) {
    return { confirmed: false, reasonCode: "claim_not_verifiable" };
  }

  const assertedTokens = extractMeasurableTokens(userClaim.asserted);
  const contrastedTokens = extractMeasurableTokens(userClaim.contrasted);
  if (assertedTokens.length === 0) {
    return { confirmed: false, reasonCode: "claim_not_verifiable" };
  }

  const lastAssistant = (() => {
    const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") return normalizeText(messages[i]?.content || "");
    }
    return "";
  })();

  const assertedSupported = assertedTokens.some((t) => tokenPresentInText(t, corpus));
  const contrastedInPriorReply =
    contrastedTokens.length === 0 ||
    contrastedTokens.some((t) => tokenPresentInText(t, lastAssistant));

  if (assertedSupported && contrastedInPriorReply) {
    return { confirmed: true, reasonCode: "claim_confirmed_by_authoritative_source" };
  }

  return { confirmed: false, reasonCode: "claim_not_verifiable" };
}

export function resolveFactValidationPolicy(
  recognition = {},
  { sessionContext = {}, conversationMessages = [], message = "" } = {}
) {
  const continuity =
    recognition.correctionContinuity ||
    resolveCorrectionContinuity(message || recognition.rawMessage || recognition.resolvedQuery || "", {
      conversationMessages,
      sessionContext,
    });

  if (!continuity?.requiresFactValidation || continuity?.kind !== "factual_contrast") {
    return {
      version: FACT_VALIDATION_GOVERNANCE_VERSION,
      state: FACT_VALIDATION_STATES.NONE,
      blocksAutoConfirmation: false,
      bypassLlmVerbalization: false,
      reasonCodes: [],
    };
  }

  const userClaim = buildClaimLabels(
    continuity.factualContrast?.assertedSegment,
    continuity.factualContrast?.contrastedSegment
  );

  const auth = tryAuthoritativeClaimConfirmation(userClaim, sessionContext, conversationMessages);
  if (auth.confirmed) {
    return {
      version: FACT_VALIDATION_GOVERNANCE_VERSION,
      state: FACT_VALIDATION_STATES.CONFIRMED,
      blocksAutoConfirmation: false,
      bypassLlmVerbalization: true,
      userClaim,
      reasonCodes: [auth.reasonCode],
    };
  }

  return {
    version: FACT_VALIDATION_GOVERNANCE_VERSION,
    state: FACT_VALIDATION_STATES.PENDING,
    blocksAutoConfirmation: true,
    bypassLlmVerbalization: true,
    userClaim,
    reasonCodes: ["user_claim_requires_validation", "claim_validation_pending"],
  };
}

export function buildPendingFactValidationReply(contract = {}) {
  const key = warmthKey(contract);
  const pool = PENDING_VALIDATION_REPLY[key] || PENDING_VALIDATION_REPLY.warm_balanced;
  const fn = pickHumanizedVariant(pool, seedFromContract(contract, "pending-validation"));
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  const text = typeof fn === "function" ? fn(contract) : String(fn || "");
  if (depth === RESPONSE_DEPTH.MINIMAL) {
    return text.split(".")[0].trim() + ".";
  }
  return text;
}

export function buildConfirmedFactValidationReply(contract = {}) {
  const key = warmthKey(contract);
  const pool = CONFIRMED_CLAIM_REPLY[key] || CONFIRMED_CLAIM_REPLY.warm_balanced;
  const fn = pickHumanizedVariant(pool, seedFromContract(contract, "confirmed-claim"));
  return typeof fn === "function" ? fn(contract) : String(fn || "");
}

export function buildNotVerifiableFactReply(contract = {}) {
  const pool = NOT_VERIFIABLE_REPLY.warm_balanced;
  const fn = pickHumanizedVariant(pool, seedFromContract(contract, "not-verifiable"));
  return typeof fn === "function" ? fn(contract) : String(fn || "");
}

export function buildGovernedFactValidationReply(contract = {}) {
  const state = contract.factValidation?.state;
  if (state === FACT_VALIDATION_STATES.CONFIRMED) {
    return buildConfirmedFactValidationReply(contract);
  }
  if (state === FACT_VALIDATION_STATES.NOT_VERIFIABLE) {
    return buildNotVerifiableFactReply(contract);
  }
  return buildPendingFactValidationReply(contract);
}

const AFFIRMATION_WITHOUT_VALIDATION_PATTERN =
  /\b(voce esta certo|você está certo|vc esta certo|isso mesmo|realmente e|de fato e|obrigad\w* pela corre[cç][aã]o|agrade[cç]o pela corre[cç][aã]o)\b/;

const VALIDATION_HEDGE_PATTERN =
  /\b(validar|confirmar|verificar|antes de assumir|preciso confirmar|vou considerar|ap[oó]s validar|nao posso confirmar|não posso confirmar|sem validar|depois de validar)\b/;

export function detectUnvalidatedClaimConfirmation(reply = "", contract = {}) {
  if (!contract.factValidation?.blocksAutoConfirmation) {
    return { detected: false, reasonCode: null };
  }

  const text = normalizeText(reply);
  if (!text) return { detected: false, reasonCode: null };

  if (VALIDATION_HEDGE_PATTERN.test(text)) {
    return { detected: false, reasonCode: "validation_hedge_present" };
  }

  if (AFFIRMATION_WITHOUT_VALIDATION_PATTERN.test(text)) {
    return { detected: true, reasonCode: "unvalidated_user_claim_confirmation" };
  }

  const assertedTokens = extractMeasurableTokens(contract.factValidation?.userClaim?.asserted || "");
  const hasStrongAffirmation = /\b(confere|correto|certo|exato|isso|realmente)\b/.test(text);
  if (
    assertedTokens.length > 0 &&
    hasStrongAffirmation &&
    assertedTokens.some((t) => text.includes(t))
  ) {
    return { detected: true, reasonCode: "unvalidated_user_claim_confirmation" };
  }

  return { detected: false, reasonCode: null };
}

export function applyFactValidationGovernance(reply = "", contract = {}) {
  const fv = contract.factValidation || {};
  if (fv.bypassLlmVerbalization && fv.state === FACT_VALIDATION_STATES.PENDING) {
    return {
      reply: buildPendingFactValidationReply(contract),
      replaced: true,
      reasonCodes: ["claim_validation_pending", "user_claim_requires_validation"],
      builder: "buildPendingFactValidationReply",
    };
  }
  if (fv.bypassLlmVerbalization && fv.state === FACT_VALIDATION_STATES.CONFIRMED) {
    return {
      reply: buildConfirmedFactValidationReply(contract),
      replaced: true,
      reasonCodes: fv.reasonCodes || ["claim_confirmed_by_authoritative_source"],
      builder: "buildConfirmedFactValidationReply",
    };
  }

  const audit = detectUnvalidatedClaimConfirmation(reply, contract);
  if (audit.detected) {
    return {
      reply: buildPendingFactValidationReply(contract),
      replaced: true,
      reasonCodes: [audit.reasonCode, "claim_validation_pending"],
      builder: "buildPendingFactValidationReply",
    };
  }

  return { reply, replaced: false, reasonCodes: [], builder: null };
}

export function factValidationToTrace(factValidation = null) {
  if (!factValidation?.state || factValidation.state === FACT_VALIDATION_STATES.NONE) return null;
  return {
    version: factValidation.version,
    state: factValidation.state,
    blocksAutoConfirmation: factValidation.blocksAutoConfirmation,
    reasonCodes: factValidation.reasonCodes,
  };
}

export function enrichContractWithFactValidation(
  contract = {},
  { recognition = null, sessionContext = null, conversationMessages = [], message = "" } = {}
) {
  const factValidation = resolveFactValidationPolicy(recognition || {}, {
    sessionContext: sessionContext || {},
    conversationMessages,
    message: message || contract.userMessageForSpecificity || contract.resolvedQuery || "",
  });

  if (factValidation.state === FACT_VALIDATION_STATES.NONE) {
    return contract;
  }

  const responseBehavior = {
    ...(contract.responseBehavior || {}),
    forbidden: [
      ...new Set([
        ...(contract.responseBehavior?.forbidden || []),
        "confirm_user_factual_claim_without_validation",
        "adopt_user_asserted_spec_as_truth",
      ]),
    ],
  };

  return {
    ...contract,
    factValidation,
    factValidationVersion: FACT_VALIDATION_GOVERNANCE_VERSION,
    responseBehavior,
  };
}
