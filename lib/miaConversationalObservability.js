/**
 * PATCH 5.6 — Conversational Observability, Verbalization Quality & Semantic Stability
 *
 * Measurement-only layer. Does NOT alter decisions, routing, recovery or egress.
 * Debug-only delivery via pipeline trace (MIA_DEBUG / MIA_CONVERSATIONAL_OBSERVABILITY).
 */

import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import {
  validateHumanConversationResponse,
  RESPONSE_DEPTH,
} from "./miaHumanConversationExperience.js";
import {
  validateSocialResponsePerception,
  SOCIAL_DISTANCE,
} from "./miaSocialResponsePerception.js";
import { validateUniversalContractShape } from "./miaUniversalConversationResponseContract.js";
import { runUniversalValidatorChain } from "./miaUniversalConversationRecovery.js";
import { SEMANTIC_TARGETS } from "./miaSemanticTargetResolution.js";

export const CONVERSATIONAL_OBSERVABILITY_VERSION = "5.6.0";

export const VARIATION_CLASS = Object.freeze({
  STYLE_ONLY: "style_only",
  SEMANTICALLY_EQUIVALENT: "semantically_equivalent",
  MINOR_DEGRADATION: "minor_degradation",
  RELEVANT_DEGRADATION: "relevant_degradation",
  REGRESSION: "regression",
});

export const QUALITY_SIGNAL = Object.freeze({
  TOO_SHORT: "too_short",
  TOO_LONG: "too_long",
  TOO_COLD: "too_cold",
  TOO_ROBOTIC: "too_robotic",
  REPETITIVE: "repetitive",
  INSTITUTIONAL: "institutional",
  LOW_WARMTH: "low_warmth",
  EXCESS_INFORMAL: "excess_informal",
  EXCESS_FORMAL: "excess_formal",
});

const INSTITUTIONAL_PATTERN =
  /\b(assistente virtual|intelig[eê]ncia artificial|minha especialidade|lista de capacidades|sou uma ia|como posso ajud[áa]r)\b/i;

const ROBOTIC_PATTERN =
  /\b(conforme solicitado|de acordo com|em rela[cç][aã]o ao|a seguir apresento|segue abaixo|informo que|certamente posso)\b/i;

const WARMTH_MARKERS =
  /\b(opa|oi|ol[aá]|valeu|imagina|fico feliz|que bom|entendo|poxa|show|legal|obrigad)\b/i;

const EXCESS_INFORMAL_PATTERN = /\b(mano|blz|vlw|tmj|flw|pô|po|carai|porra|kkk{3,})\b/i;

const EXCESS_FORMAL_PATTERN =
  /\b(prezad[oa]|cordialmente|vossa senhoria|outrossim|consoante|mediante|por oportuno)\b/i;

const REPETITION_CHUNK = /\b(.{4,24})\b.*\b\1\b/i;

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenCount(text = "") {
  const n = normalizeText(text);
  if (!n) return 0;
  return n.split(/\s+/).filter(Boolean).length;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

export function isConversationalObservabilityEnabled() {
  return (
    process.env.MIA_DEBUG === "true" ||
    process.env.MIA_CHAT_PIPELINE_DEBUG === "true" ||
    process.env.MIA_CONVERSATIONAL_OBSERVABILITY === "true"
  );
}

export function buildSemanticVerbalFingerprint(reply = "", context = {}) {
  const n = normalizeText(reply);
  if (!n) return "empty";
  if (/^(opa!?|oi!?|e aí!?|salve!?|bom dia!?|boa tarde!?|boa noite!?)/.test(n)) return "greeting";
  if (/obrigad|valeu|de nada|por nada|imagina/.test(n)) return "gratitude";
  if (/\?/.test(n) && /(mim|produto|refere|curios)/.test(n)) return "ambiguous_social";
  if (/celular|iphone|galaxy|notebook|recomend|orçamento|compar|monitor|fone|produto/.test(n)) {
    return "commercial";
  }
  if (/tchau|até logo|até mais|flw|falou/.test(n)) return "farewell";
  if (/sinto muito|entendo|pesado|difícil|triste/.test(n)) return "emotional_support";
  if (context.interactionMode === MIA_INTERACTION_MODES.COMMERCE) return "commercial";
  if (context.interactionMode === MIA_INTERACTION_MODES.MIXED) return "mixed";
  return "other_social";
}

function depthLimits(depth = RESPONSE_DEPTH.BRIEF) {
  const map = {
    [RESPONSE_DEPTH.MINIMAL]: { min: 1, max: 28 },
    [RESPONSE_DEPTH.BRIEF]: { min: 1, max: 55 },
    [RESPONSE_DEPTH.STANDARD]: { min: 2, max: 90 },
    [RESPONSE_DEPTH.SUPPORTIVE]: { min: 3, max: 120 },
    [RESPONSE_DEPTH.COMMERCIAL_MIXED]: { min: 4, max: 180 },
  };
  return map[depth] || map[RESPONSE_DEPTH.BRIEF];
}

function scoreDimension(base, penalties = []) {
  let score = base;
  for (const p of penalties) score -= p;
  return clamp01(score);
}

export function measureVerbalizationQuality(reply = "", context = {}) {
  const text = String(reply || "");
  const normalized = normalizeText(text);
  const tokens = tokenCount(text);
  const contract = context.behaviorContract || {};
  const limits = depthLimits(contract.responseDepth);
  const signals = [];

  if (!tokens) signals.push(QUALITY_SIGNAL.TOO_SHORT);
  if (tokens > limits.max) signals.push(QUALITY_SIGNAL.TOO_LONG);
  if (tokens > 0 && tokens < Math.max(1, limits.min)) signals.push(QUALITY_SIGNAL.TOO_SHORT);
  if (INSTITUTIONAL_PATTERN.test(normalized)) signals.push(QUALITY_SIGNAL.INSTITUTIONAL);
  if (ROBOTIC_PATTERN.test(normalized)) signals.push(QUALITY_SIGNAL.TOO_ROBOTIC);
  if (!WARMTH_MARKERS.test(normalized) && contract.interactionMode === MIA_INTERACTION_MODES.SOCIAL) {
    const depth = contract.responseDepth || contract.behaviorContract?.responseDepth;
    const isMirrorGreeting =
      contract.expectedHumanBehavior === "mirror_greeting" ||
      contract.behaviorContract?.expectedHumanBehavior === "mirror_greeting";
    const hasWarmthInMirror = /^(opa|oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|salve)[!.?\s]*(\w+)?/i.test(
      normalized
    );
    if (!(isMirrorGreeting && hasWarmthInMirror && (depth === "brief" || depth === "minimal"))) {
      signals.push(QUALITY_SIGNAL.LOW_WARMTH);
    }
  }
  if (EXCESS_INFORMAL_PATTERN.test(normalized)) signals.push(QUALITY_SIGNAL.EXCESS_INFORMAL);
  if (EXCESS_FORMAL_PATTERN.test(normalized)) signals.push(QUALITY_SIGNAL.EXCESS_FORMAL);
  if (REPETITION_CHUNK.test(normalized)) signals.push(QUALITY_SIGNAL.REPETITIVE);

  const experienceValidation = validateHumanConversationResponse(text, contract);
  const perceptionValidation = validateSocialResponsePerception(text, contract);

  const naturalness = scoreDimension(
    0.85,
    [
      signals.includes(QUALITY_SIGNAL.TOO_ROBOTIC) ? 0.25 : 0,
      signals.includes(QUALITY_SIGNAL.REPETITIVE) ? 0.15 : 0,
      experienceValidation.violations.length ? 0.1 : 0,
    ]
  );

  const humanWarmth = scoreDimension(
    0.8,
    [
      signals.includes(QUALITY_SIGNAL.LOW_WARMTH) ? 0.3 : 0,
      signals.includes(QUALITY_SIGNAL.TOO_COLD) ? 0.2 : 0,
      perceptionValidation.violations?.includes("forced_availability") ? 0.15 : 0,
    ]
  );

  const clarity = scoreDimension(
    0.82,
    [
      signals.includes(QUALITY_SIGNAL.TOO_LONG) ? 0.2 : 0,
      signals.includes(QUALITY_SIGNAL.INSTITUTIONAL) ? 0.15 : 0,
      tokens > limits.max * 1.5 ? 0.1 : 0,
    ]
  );

  const objectivity = scoreDimension(
    0.78,
    [
      signals.includes(QUALITY_SIGNAL.EXCESS_INFORMAL) ? 0.1 : 0,
      signals.includes(QUALITY_SIGNAL.EXCESS_FORMAL) ? 0.1 : 0,
    ]
  );

  const continuity = scoreDimension(0.8, [context.hasAnchorMismatch ? 0.25 : 0]);
  const coherence = scoreDimension(experienceValidation.valid ? 0.88 : 0.55, []);
  const repetition = scoreDimension(signals.includes(QUALITY_SIGNAL.REPETITIVE) ? 0.45 : 0.9, []);
  const verbosity = scoreDimension(
    tokens > limits.max ? 0.5 : tokens < limits.min ? 0.65 : 0.88,
    []
  );

  const contractAdherence = scoreDimension(
    experienceValidation.valid && perceptionValidation.valid ? 0.92 : 0.6,
    []
  );

  const targetAdherence = scoreDimension(
    context.resolvedTarget && context.resolvedTarget !== SEMANTIC_TARGETS.UNKNOWN ? 0.86 : 0.75,
    [experienceValidation.violations.includes("mia_thanks_on_unknown_target") ? 0.3 : 0]
  );

  const modeAdherence = scoreDimension(
    contract.interactionMode === context.interactionMode ? 0.9 : 0.65,
    []
  );

  const metrics = {
    naturalness,
    humanWarmth,
    clarity,
    objectivity,
    continuity,
    coherence,
    repetition,
    verbosity,
    contractAdherence,
    targetAdherence,
    interactionModeAdherence: modeAdherence,
    stability: context.stabilityScore ?? null,
  };

  const overall = clamp01(
    (metrics.naturalness +
      metrics.humanWarmth +
      metrics.clarity +
      metrics.coherence +
      metrics.contractAdherence) /
      5
  );

  return {
    version: CONVERSATIONAL_OBSERVABILITY_VERSION,
    tokenCount: tokens,
    signals,
    experienceValidation: {
      valid: experienceValidation.valid,
      violations: experienceValidation.violations || [],
    },
    perceptionValidation: {
      valid: perceptionValidation.valid,
      violations: perceptionValidation.violations || [],
    },
    metrics,
    overall,
  };
}

export function measurePersonalityConsistency(reply = "", context = {}) {
  const contract = context.behaviorContract || {};
  const normalized = normalizeText(reply);
  const distance = contract.personalityPolicy?.socialDistance || SOCIAL_DISTANCE.NEUTRAL_WARM;

  const proximity = clamp01(
    distance === SOCIAL_DISTANCE.FRIENDLY_BRIEF || distance === SOCIAL_DISTANCE.LIGHT_PLAYFUL
      ? WARMTH_MARKERS.test(normalized)
        ? 0.9
        : 0.55
      : WARMTH_MARKERS.test(normalized)
        ? 0.75
        : 0.82
  );

  const sympathy = clamp01(
    /\b(sinto muito|entendo|pesado|difícil|poxa|imagino)\b/.test(normalized) ? 0.88 : 0.72
  );

  const professionalism = clamp01(
    EXCESS_INFORMAL_PATTERN.test(normalized) ? 0.45 : INSTITUTIONAL_PATTERN.test(normalized) ? 0.7 : 0.86
  );

  const neutrality = clamp01(
    contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE && !EXCESS_INFORMAL_PATTERN.test(normalized)
      ? 0.85
      : 0.75
  );

  const enthusiasm = clamp01(/!/.test(reply) || /\b(show|massa|demais|incrível)\b/.test(normalized) ? 0.82 : 0.68);

  const consistency = clamp01((proximity + professionalism + sympathy) / 3);

  return {
    version: CONVERSATIONAL_OBSERVABILITY_VERSION,
    configuredSocialDistance: distance,
    proximity,
    sympathy,
    professionalism,
    neutrality,
    enthusiasmWhenAppropriate: enthusiasm,
    consistency,
    overall: consistency,
  };
}

export function classifyVerbalizationVariation(baseline = "", candidate = "", context = {}) {
  const a = normalizeText(baseline);
  const b = normalizeText(candidate);
  if (!a || !b) {
    return { classification: VARIATION_CLASS.REGRESSION, reason: "empty_variant" };
  }
  if (a === b) {
    return { classification: VARIATION_CLASS.STYLE_ONLY, reason: "exact_match" };
  }

  const fpA = buildSemanticVerbalFingerprint(baseline, context);
  const fpB = buildSemanticVerbalFingerprint(candidate, context);
  const jaccard = (() => {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const inter = [...setA].filter((t) => setB.has(t)).length;
    const union = new Set([...setA, ...setB]).size || 1;
    return inter / union;
  })();

  if (fpA === fpB && jaccard >= 0.35) {
    return {
      classification: VARIATION_CLASS.SEMANTICALLY_EQUIVALENT,
      reason: "same_semantic_family",
      fingerprint: fpA,
      lexicalOverlap: jaccard,
    };
  }

  if (fpA === fpB) {
    return {
      classification: VARIATION_CLASS.STYLE_ONLY,
      reason: "same_family_different_wording",
      fingerprint: fpA,
      lexicalOverlap: jaccard,
    };
  }

  const compatiblePairs = new Set([
    "gratitude|ambiguous_social",
    "ambiguous_social|gratitude",
    "other_social|gratitude",
    "gratitude|other_social",
  ]);
  if (compatiblePairs.has(`${fpA}|${fpB}`)) {
    return {
      classification: VARIATION_CLASS.MINOR_DEGRADATION,
      reason: "compatible_social_pool_shift",
      fingerprintA: fpA,
      fingerprintB: fpB,
      lexicalOverlap: jaccard,
    };
  }

  if (
    (fpA === "commercial" && fpB !== "commercial") ||
    (fpB === "commercial" && fpA !== "commercial")
  ) {
    return {
      classification: VARIATION_CLASS.REGRESSION,
      reason: "commercial_semantic_shift",
      fingerprintA: fpA,
      fingerprintB: fpB,
    };
  }

  if (jaccard < 0.15) {
    return {
      classification: VARIATION_CLASS.RELEVANT_DEGRADATION,
      reason: "low_lexical_overlap_different_family",
      fingerprintA: fpA,
      fingerprintB: fpB,
      lexicalOverlap: jaccard,
    };
  }

  return {
    classification: VARIATION_CLASS.MINOR_DEGRADATION,
    reason: "moderate_wording_shift",
    fingerprintA: fpA,
    fingerprintB: fpB,
    lexicalOverlap: jaccard,
  };
}

export function evaluateSemanticStability(runs = [], context = {}) {
  if (!Array.isArray(runs) || !runs.length) {
    return { acceptable: true, variability: 0, classifications: [], note: "no_runs" };
  }
  const baseline = runs[0]?.reply || "";
  const classifications = runs.slice(1).map((run, idx) => ({
    run: idx + 2,
    ...classifyVerbalizationVariation(baseline, run.reply || "", context),
  }));

  const regressionCount = classifications.filter(
    (c) => c.classification === VARIATION_CLASS.REGRESSION
  ).length;
  const relevantCount = classifications.filter(
    (c) => c.classification === VARIATION_CLASS.RELEVANT_DEGRADATION
  ).length;
  const acceptable = regressionCount === 0 && relevantCount <= Math.floor(runs.length * 0.15);

  const fingerprints = [...new Set(runs.map((r) => buildSemanticVerbalFingerprint(r.reply || "", context)))];
  const variability = fingerprints.length / runs.length;

  return {
    acceptable,
    variability,
    uniqueFingerprints: fingerprints,
    regressionCount,
    relevantDegradationCount: relevantCount,
    classifications,
    criteria: {
      maxRegression: 0,
      maxRelevantDegradationRatio: 0.15,
      styleOnlyAllowed: true,
    },
  };
}

export function buildConversationalObservabilityReport({
  userMessage = "",
  reply = "",
  responsePath = "",
  intentRecognition = null,
  intentAuthority = null,
  routingDecision = null,
  universalContract = null,
  universalRecovery = null,
  egressPrep = null,
  behaviorContract = null,
  pipelineTrace = null,
} = {}) {
  const contract = behaviorContract || {};
  const context = {
    behaviorContract: contract,
    interactionMode: intentRecognition?.interactionMode || contract.interactionMode || null,
    resolvedTarget:
      intentAuthority?.resolvedSemanticTarget ||
      contract.resolvedSemanticTarget ||
      pipelineTrace?.semantic_authority?.resolvedSemanticTarget ||
      null,
    hasAnchorMismatch: false,
  };

  const quality = measureVerbalizationQuality(reply, context);
  const personality = measurePersonalityConsistency(reply, context);

  const validatorChain = runUniversalValidatorChain(
    reply,
    contract,
    universalContract || egressPrep?.universalContract || null
  );

  const contractShape = universalContract
    ? validateUniversalContractShape(universalContract)
    : { valid: null, violations: [] };

  return {
    version: CONVERSATIONAL_OBSERVABILITY_VERSION,
    input: {
      userMessage: String(userMessage || "").slice(0, 300),
      replyLength: String(reply || "").length,
      tokenCount: quality.tokenCount,
    },
    pipeline: {
      responsePath,
      interactionMode: intentRecognition?.interactionMode || null,
      intent: intentRecognition?.primaryIntent || null,
      resolvedTarget: context.resolvedTarget,
      semanticPrecedence:
        intentAuthority?.semanticPrecedence ||
        pipelineTrace?.semantic_authority?.semanticPrecedence ||
        null,
      routingDecision: routingDecision || pipelineTrace?.routingDecision || null,
    },
    delivery: {
      contractReceived: !!universalContract || !!egressPrep?.universalContract,
      contractShapeValid: contractShape.valid,
      contractViolations: contractShape.violations || [],
      validators: validatorChain,
      recovery: universalRecovery || egressPrep?.universalRecovery || null,
      fallbackApplied: !!(universalRecovery?.recoveryApplied || egressPrep?.finalizationMeta?.usedFallback),
      finalizerKind: egressPrep?.finalizationMeta?.finalizerKind || null,
      egressVersion: egressPrep?.finalizationMeta?.universalRecoveryVersion || null,
    },
    quality,
    personality,
    fingerprint: buildSemanticVerbalFingerprint(reply, context),
  };
}

export function conversationalObservabilityToTrace(report = null) {
  if (!report) return null;
  return {
    version: report.version,
    fingerprint: report.fingerprint,
    overallQuality: report.quality?.overall ?? null,
    overallPersonality: report.personality?.overall ?? null,
    qualityMetrics: report.quality?.metrics ?? null,
    qualitySignals: report.quality?.signals ?? [],
    personality: report.personality ?? null,
    pipeline: report.pipeline ?? null,
    delivery: {
      contractReceived: report.delivery?.contractReceived ?? false,
      recoveryApplied: report.delivery?.recovery?.recoveryApplied ?? false,
      recoveryStrategy: report.delivery?.recovery?.strategy ?? null,
      validatorValid: report.delivery?.validators?.valid ?? null,
      finalizerKind: report.delivery?.finalizerKind ?? null,
    },
  };
}
