/**
 * PATCH 9.2Y — Human Decision Narrative Engine
 *
 * Organiza cognição (evidence, sensation, experience, friction, ownership, authority)
 * em contrato narrativo universal — sem copy, templates ou storytelling.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";
import { calculateFrictionRelevance } from "./miaHumanFrictionModelingLayer.js";
import { selectPrimaryOwnership } from "./miaOwnershipExperienceLayer.js";
import { selectPrimaryAuthority } from "./miaAuthorityClosingContract.js";

export const HUMAN_DECISION_NARRATIVE_VERSION = "9.2Y.1";

export const NARRATIVE_TYPES = Object.freeze([
  "confidence_narrative",
  "anti_regret_narrative",
  "ownership_narrative",
  "performance_narrative",
  "practicality_narrative",
  "value_narrative",
  "stability_narrative",
]);

export const NARRATIVE_SLOTS = Object.freeze([
  "decision",
  "evidence",
  "meaning",
  "friction",
  "tradeoff",
  "ownership",
  "authority",
]);

const GENERIC_PATTERN =
  /ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|renúncia percept[ií]vel|combina com o perfil|algo que pesa mais do que parece/i;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeKey(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
}

function textsOverlap(a = "", b = "") {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (!x || !y || x.length < 12 || y.length < 12) return false;
  return x.includes(y.slice(0, 24)) || y.includes(x.slice(0, 24));
}

function buildSlot({ role, origin, content, relevance = 0.5, trace = {} }) {
  const text = cleanText(content);
  if (!text || GENERIC_PATTERN.test(text) || isGenericInsightBody(text)) return null;
  return {
    role,
    origin,
    content: text,
    relevance: clamp01(relevance),
    trace: {
      role,
      origin,
      content: text,
      ...trace,
    },
  };
}

function selectDecisionDriver(input = {}, ctx = {}) {
  const authority = input.authorityContract?.primaryAuthority;
  const sensation = input.sensations?.[0];
  const experience = input.experiences?.[0];
  const dominance = cleanText(input.searchCognition?.dominance || input.dominance || "moderate");

  const candidates = [];

  if (authority?.dominanceSupport) {
    candidates.push({
      driver: "dominance",
      content: authority.dominanceSupport.rationale || "eixo dominante da busca sustenta a escolha",
      relevance: clamp01(authority.dominanceSupport.strength || 0.7),
      trace: { source: "authority_contract", token: authority.sourceToken || "" },
    });
  }

  if (sensation?.consequence && sensation?.sensation) {
    candidates.push({
      driver: "consequence",
      content: sensation.consequence,
      relevance: clamp01(Number(sensation.confidence || 0.65)),
      trace: {
        source: "sensation",
        token: sensation.sourceToken || "",
        consequence: sensation.consequence,
        sensation: sensation.sensation,
      },
    });
  }

  if (experience?.experience && experience?.sourceConsequence) {
    candidates.push({
      driver: "experience",
      content: experience.experience,
      relevance: clamp01(Number(experience.confidence || 0.62)),
      trace: {
        source: "experience",
        token: experience.sourceToken || "",
        consequence: experience.sourceConsequence,
        experience: experience.experience,
      },
    });
  }

  const ownership = selectPrimaryOwnership(
    input.ownershipExperiences || [],
    ctx,
    experience,
    input.frictions?.[0]
  );
  if (ownership?.ownershipMeaning) {
    candidates.push({
      driver: "ownership",
      content: ownership.ownershipMeaning,
      relevance: clamp01(Number(ownership.contextualRelevance || 0.55)),
      trace: {
        source: "ownership",
        ownershipClass: ownership.ownershipClass || "",
        token: ownership.sourceToken || "",
      },
    });
  }

  if (dominance === "clear" && candidates[0]) {
    candidates[0].relevance += 0.08;
  }

  candidates.sort((a, b) => b.relevance - a.relevance);
  return candidates[0] || null;
}

function selectMeaningDriver(input = {}, ctx = {}, decisionDriver = null) {
  const experiences = input.experiences || [];
  const sensations = input.sensations || [];
  const evidenceText = cleanText(input.evidence?.text || input.evidence?.evidenceText || "");

  for (const experience of experiences) {
    if (textsOverlap(experience.experience, evidenceText)) continue;
    if (textsOverlap(experience.experience, decisionDriver?.content)) continue;
    if (!experience.experience || GENERIC_PATTERN.test(experience.experience)) continue;
    return {
      driver: "experience",
      content: experience.experience,
      relevance: clamp01(Number(experience.confidence || 0.6)),
      trace: {
        source: "experience",
        experienceClass: experience.experienceClass || "",
        consequence: experience.sourceConsequence || "",
        sensation: experience.sensation || "",
      },
    };
  }

  for (const sensation of sensations) {
    if (textsOverlap(sensation.sensation, evidenceText)) continue;
    if (textsOverlap(sensation.sensation, decisionDriver?.content)) continue;
    if (!sensation.sensation || GENERIC_PATTERN.test(sensation.sensation)) continue;
    return {
      driver: "sensation",
      content: sensation.sensation,
      relevance: clamp01(Number(sensation.confidence || 0.58)),
      trace: {
        source: "sensation",
        perceptionClass: sensation.perceptionClass || "",
        consequence: sensation.consequence || "",
      },
    };
  }

  const ownership = selectPrimaryOwnership(
    input.ownershipExperiences || [],
    ctx,
    experiences[0],
    input.frictions?.[0]
  );
  if (
    ownership?.ownershipMeaning &&
    !textsOverlap(ownership.ownershipMeaning, evidenceText) &&
    !textsOverlap(ownership.ownershipMeaning, decisionDriver?.content)
  ) {
    return {
      driver: "ownership",
      content: ownership.ownershipMeaning,
      relevance: clamp01(Number(ownership.contextualRelevance || 0.52)),
      trace: {
        source: "ownership",
        ownershipClass: ownership.ownershipClass || "",
        timeHorizon: ownership.timeHorizon || "",
      },
    };
  }

  return null;
}

function selectFrictionDriver(input = {}, ctx = {}) {
  const frictions = [...(input.frictions || [])].sort(
    (a, b) =>
      calculateFrictionRelevance(b, ctx) * 100 +
      Number(b.confidence || 0) -
      (calculateFrictionRelevance(a, ctx) * 100 + Number(a.confidence || 0))
  );
  const top = frictions.find((entry) => entry.friction && entry.sourceConsequence);
  if (!top) return null;
  return {
    driver: top.frictionClass || "usage_friction",
    content: top.friction,
    relevance: calculateFrictionRelevance(top, ctx),
    trace: {
      source: "friction",
      frictionClass: top.frictionClass || "",
      consequence: top.sourceConsequence || "",
      sensation: top.sensation || "",
      experience: top.sourceExperience || "",
    },
  };
}

function selectTradeoffDriver(input = {}, ctx = {}) {
  const sacrifices = (input.tradeoffs?.sacrifices || []).map((entry) =>
    typeof entry === "string" ? { text: entry } : entry
  );
  if (!sacrifices.length) return null;

  const query = cleanText(ctx.query || "");
  let best = sacrifices[0];
  let bestScore = 0.45;

  for (const sacrifice of sacrifices) {
    const text = cleanText(sacrifice.text || sacrifice);
    if (!text) continue;
    let score = 0.45;
    if (ctx.querySignals?.acceptsTradeoff) score += 0.15;
    if (ctx.querySignals?.avoidRegret && /preço|caro|custo|limite/i.test(text)) score += 0.12;
    if (/\b(tela|bateria|desempenho|espaço|espaco)\b/i.test(text)) score += 0.08;
    if (ctx.primaryAxis === "value" && /preço|caro|custo/i.test(text)) score += 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = sacrifice;
    }
  }

  const text = cleanText(best.text || best);
  if (!text) return null;
  return {
    driver: "tradeoff_sacrifice",
    content: text,
    relevance: clamp01(bestScore),
    trace: {
      source: "tradeoff",
      token: cleanText(best.token || ""),
      sacrificeText: text,
    },
  };
}

function selectOwnershipDriver(input = {}, ctx = {}) {
  const ownership = selectPrimaryOwnership(
    input.ownershipExperiences || [],
    ctx,
    input.experiences?.[0],
    input.frictions?.[0]
  );
  if (!ownership?.ownershipMeaning) return null;
  return {
    driver: ownership.ownershipClass || "long_term_satisfaction",
    content: ownership.ownershipMeaning,
    relevance: clamp01(Number(ownership.contextualRelevance || 0.5)),
    trace: {
      source: "ownership",
      ownershipClass: ownership.ownershipClass || "",
      timeHorizon: ownership.timeHorizon || "",
      consequence: ownership.sourceConsequence || "",
    },
  };
}

function selectAuthorityDriver(input = {}) {
  const closing = input.authorityContract?.closingAuthority;
  const primary = input.authorityContract?.primaryAuthority;
  const source = primary || closing;
  if (!source?.authorityReason) return null;
  return {
    driver: source.authorityClass || closing?.authorityClass || "dominance_authority",
    content: source.authorityReason,
    relevance: clamp01(Number(source.authorityConfidence || closing?.authorityConfidence || 0.65)),
    trace: {
      source: "authority_contract",
      authorityClass: source.authorityClass || closing?.authorityClass || "",
      ...(source.trace || closing?.trace || {}),
    },
  };
}

/**
 * @param {Record<string, unknown>} ctx
 * @param {Record<string, unknown>} drivers
 */
export function selectNarrativeType(ctx = {}, drivers = {}) {
  const query = cleanText(ctx.query || "");
  const axis = cleanText(ctx.primaryAxis || "");

  if (ctx.querySignals?.avoidRegret || /\b(arrepend|não quero errar|nao quero errar)\b/i.test(query)) {
    return "anti_regret_narrative";
  }
  if (axis === "longevity" || /\b(longevo|anos|durar|vários anos|varios anos)\b/i.test(query)) {
    return "ownership_narrative";
  }
  if (axis === "performance" || /\b(desempenho|performance|gamer|fps)\b/i.test(query)) {
    return "performance_narrative";
  }
  if (axis === "value" || ctx.querySignals?.priceSensitive || /\b(custo.?benef|barato|econom)\b/i.test(query)) {
    return "value_narrative";
  }
  if (/\b(pr[aá]tic|simples|dia a dia|f[aá]cil)\b/i.test(query)) {
    return "practicality_narrative";
  }
  if (drivers.ownership?.driver?.includes("stability") || drivers.authority?.driver?.includes("stability")) {
    return "stability_narrative";
  }
  if (drivers.meaning?.driver === "sensation") return "confidence_narrative";
  return "confidence_narrative";
}

/**
 * @param {Record<string, unknown>} narrative
 * @param {Record<string, unknown>} ctx
 */
export function calculateNarrativeRelevance(narrative = {}, ctx = {}) {
  let score = Number(narrative.confidence || 0.5);
  if (narrative.contract?.decision) score += 0.12;
  if (narrative.contract?.meaning && !textsOverlap(narrative.contract.meaning.content, narrative.contract.evidence?.content || "")) {
    score += 0.1;
  }
  if (narrative.contract?.authority && !textsOverlap(narrative.contract.authority.content, narrative.contract.ownership?.content || "")) {
    score += 0.08;
  }
  if (narrative.contextApplied) score += 0.05;
  return clamp01(score);
}

/**
 * @param {{
 *   winner?: string,
 *   context?: Record<string, unknown>,
 *   evidence?: Record<string, unknown>,
 *   sensations?: Array<Record<string, unknown>>,
 *   experiences?: Array<Record<string, unknown>>,
 *   frictions?: Array<Record<string, unknown>>,
 *   ownershipExperiences?: Array<Record<string, unknown>>,
 *   authorityContract?: Record<string, unknown>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   searchCognition?: Record<string, unknown>,
 *   reasoning?: Record<string, unknown>,
 *   query?: string,
 *   primaryAxis?: string,
 *   querySignals?: Record<string, unknown>,
 * }} input
 */
export function buildHumanDecisionNarrative(input = {}) {
  const query = cleanText(input.query || input.context?.query || "");
  const primaryAxis = cleanText(input.primaryAxis || input.context?.primaryAxis || input.searchCognition?.primaryAxis || "");
  const budget = extractBudget(query);
  const ctx = {
    query,
    primaryAxis,
    hasBudget: budget != null,
    querySignals: input.querySignals || input.context?.querySignals || {},
  };

  const decisionDriver = selectDecisionDriver(input, ctx);
  const meaningDriver = selectMeaningDriver(input, ctx, decisionDriver);
  const frictionDriver = selectFrictionDriver(input, ctx);
  const tradeoffDriver = selectTradeoffDriver(input, ctx);
  const ownershipDriver = selectOwnershipDriver(input, ctx);
  const authorityDriver = selectAuthorityDriver(input);

  const drivers = {
    decision: decisionDriver,
    meaning: meaningDriver,
    friction: frictionDriver,
    tradeoff: tradeoffDriver,
    ownership: ownershipDriver,
    authority: authorityDriver,
  };

  const narrativeType = selectNarrativeType(ctx, drivers);

  const evidenceText = cleanText(input.evidence?.text || input.evidence?.evidenceText || "");
  const supportingEvidence = evidenceText && !GENERIC_PATTERN.test(evidenceText) ? evidenceText : "";

  const contract = {
    decision: decisionDriver
      ? buildSlot({
          role: "decision",
          origin: decisionDriver.driver,
          content: decisionDriver.content,
          relevance: decisionDriver.relevance,
          trace: decisionDriver.trace,
        })
      : null,
    evidence: supportingEvidence
      ? buildSlot({
          role: "evidence",
          origin: cleanText(input.evidence?.source || input.evidence?.field || "evidence"),
          content: supportingEvidence,
          relevance: clamp01(Number(input.evidence?.specificityScore || 0.65)),
          trace: {
            source: input.evidence?.source || "evidence_injection",
            field: input.evidence?.field || "",
            specificityClass: input.evidence?.specificityClass || "",
          },
        })
      : null,
    meaning: meaningDriver
      ? buildSlot({
          role: "meaning",
          origin: meaningDriver.driver,
          content: meaningDriver.content,
          relevance: meaningDriver.relevance,
          trace: meaningDriver.trace,
        })
      : null,
    friction: frictionDriver
      ? buildSlot({
          role: "friction",
          origin: frictionDriver.driver,
          content: frictionDriver.content,
          relevance: frictionDriver.relevance,
          trace: frictionDriver.trace,
        })
      : null,
    tradeoff: tradeoffDriver
      ? buildSlot({
          role: "tradeoff",
          origin: tradeoffDriver.driver,
          content: tradeoffDriver.content,
          relevance: tradeoffDriver.relevance,
          trace: tradeoffDriver.trace,
        })
      : null,
    ownership: ownershipDriver
      ? buildSlot({
          role: "ownership",
          origin: ownershipDriver.driver,
          content: ownershipDriver.content,
          relevance: ownershipDriver.relevance,
          trace: ownershipDriver.trace,
        })
      : null,
    authority: authorityDriver
      ? buildSlot({
          role: "authority",
          origin: authorityDriver.driver,
          content: authorityDriver.content,
          relevance: authorityDriver.relevance,
          trace: authorityDriver.trace,
        })
      : null,
  };

  if (contract.meaning && contract.evidence && textsOverlap(contract.meaning.content, contract.evidence.content)) {
    contract.meaning = null;
  }
  if (contract.authority && contract.ownership && textsOverlap(contract.authority.content, contract.ownership.content)) {
    contract.ownership = null;
  }

  const filledSlots = NARRATIVE_SLOTS.filter((slot) => contract[slot]);
  const confidence = clamp01(
    filledSlots.length / NARRATIVE_SLOTS.length * 0.35 +
      (decisionDriver?.relevance || 0) * 0.2 +
      (authorityDriver?.relevance || 0) * 0.2 +
      (meaningDriver?.relevance || 0) * 0.15 +
      (ownershipDriver?.relevance || 0) * 0.1
  );

  const narrative = {
    narrativeType,
    primaryDecisionDriver: decisionDriver?.driver || "",
    supportingEvidence,
    primaryMeaning: meaningDriver?.content || "",
    primaryFriction: frictionDriver?.content || "",
    primaryTradeoff: tradeoffDriver?.content || "",
    ownershipMeaning: ownershipDriver?.content || "",
    authorityReason: authorityDriver?.content || "",
    confidence,
    contract,
    contextApplied: Boolean(decisionDriver && (meaningDriver || authorityDriver)),
    trace: {
      narrativeType,
      decision: decisionDriver?.trace || null,
      evidence: contract.evidence?.trace || null,
      meaning: meaningDriver?.trace || null,
      friction: frictionDriver?.trace || null,
      tradeoff: tradeoffDriver?.trace || null,
      ownership: ownershipDriver?.trace || null,
      authority: authorityDriver?.trace || null,
    },
  };

  narrative.contextualRelevance = calculateNarrativeRelevance(narrative, ctx);

  return {
    ok: filledSlots.length >= 3 && Boolean(contract.decision && contract.authority),
    narrative,
    version: HUMAN_DECISION_NARRATIVE_VERSION,
    winner: cleanText(input.winner || ""),
    context: ctx,
  };
}

export function isNarrativeTraceable(narrative = {}) {
  return Boolean(
    narrative?.narrativeType &&
      NARRATIVE_TYPES.includes(narrative.narrativeType) &&
      narrative?.contract?.decision?.trace &&
      narrative?.contract?.authority?.trace &&
      narrative.primaryDecisionDriver &&
      narrative.authorityReason &&
      !GENERIC_PATTERN.test(narrative.supportingEvidence || "placeholder")
  );
}

export function classifyNarrativeOrigin(narrative = {}) {
  if (!narrative) return "placeholder";
  if (isNarrativeTraceable(narrative)) {
    if (narrative.contextApplied && narrative.contextualRelevance >= 0.65) return "real";
    return "derived";
  }
  if (narrative.narrativeType) return "pseudo";
  return "placeholder";
}

export function isGenericNarrative(narrative = {}) {
  const slots = Object.values(narrative.contract || {}).filter(Boolean);
  if (!slots.length) return true;
  return slots.some((slot) => GENERIC_PATTERN.test(slot.content || ""));
}
