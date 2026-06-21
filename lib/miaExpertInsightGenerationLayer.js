/**
 * PATCH 9.1H — Expert Insight Generation Layer
 *
 * Transforma evidência selecionada pelo 9.1G em insight especialista.
 * Insight = por que a evidência importa na decisão (sem inventar fatos).
 */

import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { enrichConsequencesWithMicroImpacts } from "./miaCommercialMicroConsequenceLayer.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";
import {
  assertUserFacingDataLayerText,
  sanitizeDataLayerEvidenceText,
} from "./miaDataLayerHumanizationGuard.js";
import {
  isArtificialAttributeChain,
  isGenericInsightBody,
} from "./miaDataLayerSemanticNormalizer.js";
import { selectInsightCandidate, inferSemanticFamilyFromText } from "./miaSemanticFamilyAllocationEngine.js";
import {
  buildSensationBridge,
  buildDecisionMeaningFromSensation,
  selectInsightSensation,
  verbalizeInsightFromDecisionMeaning,
  isSensationInsightTraceable,
  classifyInsightOrigin,
} from "./miaSensationReasoningLayer.js";

import {
  buildHumanExperienceModel,
  buildDecisionMeaningFromExperience,
  selectInsightExperience,
  isExperienceTraceable,
  classifyExperienceOrigin,
} from "./miaHumanSensationReasoningLayer.js";
import {
  buildHumanFrictionModel,
  enrichDecisionMeaningWithFriction,
  resolveInsightExperienceWithFriction,
  classifyFrictionOrigin,
} from "./miaHumanFrictionModelingLayer.js";
import {
  buildOwnershipExperienceModel,
  enrichDecisionMeaningWithOwnership,
  selectPrimaryOwnership,
  classifyOwnershipOrigin,
} from "./miaOwnershipExperienceLayer.js";

export const EXPERT_INSIGHT_GENERATION_VERSION = "9.2V.1";

export const EXPERT_INSIGHT_FLAGS = Object.freeze({
  MISSING_EXPERT_INSIGHT: "MISSING_EXPERT_INSIGHT",
  GENERIC_INSIGHT: "GENERIC_INSIGHT",
  INVENTED_INSIGHT: "INVENTED_INSIGHT",
  DUPLICATE_EVIDENCE: "DUPLICATE_EVIDENCE",
  SPEC_DUMP: "SPEC_DUMP",
  BANNED_INSIGHT_OPENER: "BANNED_INSIGHT_OPENER",
  BROKE_9_1G: "BROKE_9_1G",
  BROKE_9_1C: "BROKE_9_1C",
  REGRESSION_8X: "REGRESSION_8X",
});

const RECOVERY_INTERACTION_TYPES = new Set([
  "contradiction_recovery",
  "user_confusion_recovery",
  "escalated_confusion_recovery",
  "post_change_recovery",
  "final_decision_scope",
]);

export const INSIGHT_MARKER_PATTERN =
  /isso costuma importar|na pr[aá]tica, isso pesa|isso muda a decis[aã]o|n[aã]o conecta|entra na decis[aã]o|costuma ser ignorado na compra|isso costuma aparecer|isso costuma ser notado|costuma pesar mais do que parece|tende a pesar mais/i;

const BANNED_INSIGHT_OPENERS = Object.freeze([
  /^sabia que/i,
  /^curiosidade:/i,
  /^fato interessante:/i,
  /^conhecimento privilegiado:/i,
  /^especialistas sabem que/i,
  /^como especialista/i,
]);

const GENERIC_INSIGHT_PATTERNS = Object.freeze([
  /funciona melhor para esse perfil/i,
  /oferece mais tranquilidade no uso di[aá]rio/i,
  /menos sensa[cç][aã]o de limite/i,
  /experi[eê]ncia equilibrada/i,
  /uso cotidiano mais previs[ií]vel/i,
  /tende a ajudar/i,
  /produto de qualidade/i,
  /excelente escolha/i,
  /ótima op[cç][aã]o/i,
  /um detalhe pr[aá]tico que ajuda a calibrar a expectativa/i,
  /detalhe pr[aá]tico que ajuda/i,
]);

const SPEC_DUMP_PATTERNS = Object.freeze([
  /\b(?:snapdragon|mediatek|dimensity|exynos|apple a\d+)\b/i,
  /\b(?:rtx|gtx)\s*\d/i,
  /\b\d+\s*mah\b/i,
  /\b\d+\s*mp\b/i,
  /\b(?:ois|amoled|120hz|144hz)\b/i,
]);

const FIELD_INSIGHT_SOURCES = Object.freeze({
  strengths: ["reasoning_consequence", "ideal_for", "micro", "reasoning_impact"],
  market_notes: ["reasoning_consequence", "ideal_for", "avoid_if", "micro"],
  strategic_notes: ["reasoning_consequence", "ideal_for", "micro"],
  notes: ["reasoning_consequence", "ideal_for", "micro"],
  risk_notes: ["risk", "weakness", "reasoning_consequence"],
  ideal_for: ["ideal_for", "reasoning_impact", "reasoning_consequence", "micro"],
});

const INSIGHT_BRIDGES = Object.freeze([
  (body) => `Isso costuma importar porque ${body}.`,
  (body) => `Na prática, isso pesa porque ${body}.`,
  (body) => `Para essa busca, isso muda a decisão porque ${body}.`,
  (body) => `O que muita gente não conecta é que ${body}.`,
  (body) => `Isso entra na decisão porque ${body}.`,
]);

const RISK_INSIGHT_BRIDGES = Object.freeze([
  (body) => `Esse ponto costuma ser ignorado na compra, mas ${body}.`,
  (body) => `Isso costuma importar porque ${body}.`,
  (body) => `Na prática, isso pesa porque ${body}.`,
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanList(value, max = 3) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(entry)).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return [cleanText(value)].slice(0, max);
  }
  return [];
}

function seedFromText(text = "") {
  return Array.from(String(text || "")).reduce(
    (acc, char) => acc + char.charCodeAt(0),
    0
  );
}

function pickVariant(items = [], seed = "") {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  return list[seedFromText(seed) % list.length];
}

function lowercaseLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toLowerCase() + body.slice(1);
}

function capitalizeLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function stripTrailingPeriod(text = "") {
  return cleanText(text).replace(/[.!?]+$/, "");
}

function normalizeForOverlap(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");
}

function isGenericInsight(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  return GENERIC_INSIGHT_PATTERNS.some((pattern) => pattern.test(body));
}

function overlapsExistingBlocks(candidate = "", existing = []) {
  const normalized = normalizeForOverlap(candidate);
  if (!normalized || normalized.length < 20) return false;

  return existing.some((block) => {
    const prev = normalizeForOverlap(block);
    if (!prev) return false;
    if (prev.includes(normalized) || normalized.includes(prev)) return true;

    const words = normalized.split(" ").filter((w) => w.length > 4);
    const prevWords = prev.split(" ").filter((w) => w.length > 4);
    if (words.length < 4 || prevWords.length < 4) return false;
    const overlap = words.filter((w) => prevWords.includes(w)).length;
    return overlap / Math.min(words.length, prevWords.length) >= 0.62;
  });
}

function resolveEnrichedFacts(structuredFacts = null) {
  if (!structuredFacts || typeof structuredFacts !== "object") return null;
  if (structuredFacts.primaryMicroConsequence) return structuredFacts;
  return enrichConsequencesWithMicroImpacts(structuredFacts);
}

function collectReasoningPayload(searchCognition = {}, decisionMemory = {}) {
  const chain = searchCognition?.consequenceChain || {};
  return {
    impact: stripTrailingPeriod(chain.impact || ""),
    consequence: stripTrailingPeriod(chain.consequence || ""),
    tradeoffHonest: stripTrailingPeriod(searchCognition?.tradeoffHonest || ""),
    narrativeMain: stripTrailingPeriod(searchCognition?.narrativeBlocks?.mainConsequence || ""),
    dominanceAdvantages: cleanList(decisionMemory?.lastWinnerAdvantages, 2),
    dominanceSacrifices: cleanList(decisionMemory?.lastWinnerSacrifices, 2),
    lastTradeoff: stripTrailingPeriod(decisionMemory?.lastTradeoff || ""),
  };
}

function resolveSourceEntries(sourceKey = "", context = {}) {
  const facts = context.enrichedFacts || {};
  const reasoning = context.reasoning || {};

  switch (sourceKey) {
    case "micro": {
      const raw = cleanList(
        facts.microConsequences || [],
        3
      );
      return raw.map((entry) => normalizeInsightBody(entry)).filter(Boolean);
    }
    case "ideal_for":
      return cleanList(facts.idealForConsequences, 2);
    case "note":
      return cleanList(facts.noteConsequences, 2);
    case "avoid_if":
      return cleanList(facts.avoidIfConsequences, 2);
    case "risk":
      return cleanList(facts.riskConsequences, 2);
    case "weakness":
      return cleanList(facts.weaknessConsequences, 2);
    case "reasoning_consequence":
      return cleanList([reasoning.consequence, reasoning.narrativeMain, reasoning.tradeoffHonest], 2);
    case "reasoning_impact":
      return cleanList([reasoning.impact], 1);
    case "stakes":
      return cleanList(facts.strengthConsequences, 1);
    default:
      return [];
  }
}

function scoreInsightCandidate(text = "", context = {}) {
  const body = cleanText(text);
  if (!body || body.length < 24) return -100;
  if (isGenericInsight(body) || isGenericInsightBody(body)) return -80;
  if (isArtificialAttributeChain(body)) return -85;
  if (overlapsExistingBlocks(body, [context.evidenceText || ""])) return -60;

  let score = Math.min(body.split(/\s+/).length, 16);
  if (context.querySignals?.priceSensitive && /\b(pre[cç]o|custo|barato|econom)\b/i.test(body)) {
    score += 8;
  }
  if (context.querySignals?.rushed && body.length <= 120) score += 6;
  if (context.primaryAxis && new RegExp(context.primaryAxis, "i").test(body)) score += 10;
  return score;
}

/**
 * @param {{ text?: string, field?: string }|null} evidence
 * @param {Record<string, unknown>} context
 */
export function extractInsightCandidates(evidence = null, context = {}) {
  if (!evidence?.text) return [];

  const field = cleanText(evidence.field || "strengths");
  const sourceKeys = FIELD_INSIGHT_SOURCES[field] || FIELD_INSIGHT_SOURCES.strengths;
  const enrichedFacts = resolveEnrichedFacts(context.structuredFacts);
  const reasoning = collectReasoningPayload(
    context.searchCognition || {},
    context.decisionMemory || {}
  );

  const payload = {
    ...context,
    enrichedFacts,
    reasoning,
    evidenceText: stripTrailingPeriod(evidence.text),
  };

  const candidates = [];

  for (const sourceKey of sourceKeys) {
    for (const entry of resolveSourceEntries(sourceKey, payload)) {
      const body = stripTrailingPeriod(entry);
      if (!body) continue;

      candidates.push({
        text: body,
        source: sourceKey,
        field,
        score: scoreInsightCandidate(body, payload) + (sourceKeys.indexOf(sourceKey) === 0 ? 12 : 0),
      });
    }
  }

  return candidates
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function shouldApplyExpertInsightGeneration(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") return false;
  if (input.intent === "comparison") return false;
  if (RECOVERY_INTERACTION_TYPES.has(input.sessionContext?.lastInteractionType)) return false;

  const product = input.product || {};
  const trustedSpecs = product.trustedSpecs || input.trustedSpecs || null;
  if (input.sensationBridge?.ok && (input.sensationBridge.sensations?.length || 0) > 0) {
    return true;
  }
  if (input.humanExperienceModel?.ok && (input.humanExperienceModel.experiences?.length || 0) > 0) {
    return true;
  }
  if (input.humanFrictionModel?.ok && (input.humanFrictionModel.frictions?.length || 0) > 0) {
    return true;
  }
  if (
    input.ownershipExperienceModel?.ok &&
    (input.ownershipExperienceModel.ownershipExperiences?.length || 0) > 0
  ) {
    return true;
  }
  if (trustedSpecs || input.structuredFacts?.mode === "data_layer") return true;
  if (input.evidence?.text) return true;

  return false;
}

function normalizeInsightBody(text = "") {
  let body = stripTrailingPeriod(text);
  body = body.replace(/^isso costuma (?:aparecer|ser notado|ser percebido)\s+(?:principalmente\s+)?/i, "");
  body = body.replace(/^isso costuma importar porque\s+/i, "");
  return stripTrailingPeriod(body);
}

function buildInsightParagraph(insight = {}, context = {}) {
  const body = lowercaseLead(normalizeInsightBody(insight.text || ""));
  if (!body || isGenericInsight(body) || isGenericInsightBody(body) || isArtificialAttributeChain(body)) {
    return "";
  }

  const seed = `${context.query || ""}-${context.evidence?.field || ""}-${context.primaryAxis || ""}-insight`;
  const bridges =
    context.evidence?.field === "risk_notes" ? RISK_INSIGHT_BRIDGES : INSIGHT_BRIDGES;

  return capitalizeLead(pickVariant(bridges, seed)(body));
}

function insightFamilyCollides(experience = {}, existingParagraphs = []) {
  const haystack = `${experience.experience || ""} ${experience.sourceConsequence || ""} ${experience.sensation || ""}`;
  const family = inferSemanticFamilyFromText(haystack, {
    primaryAxis: experience.perceptionClass || "",
    type: "insight",
  });
  if (!family) return false;
  return (existingParagraphs || []).some(
    (paragraph) => inferSemanticFamilyFromText(paragraph) === family
  );
}

function pickInsightExperience(experiences = [], context = {}, existingParagraphs = [], selectedSensation = null) {
  const ranked = [...(experiences || [])].sort(
    (a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0)
  );

  if (selectedSensation) {
    const aligned = ranked.find(
      (experience) =>
        (experience.perceptionClass === selectedSensation.perceptionClass ||
          experience.sourceConsequence === selectedSensation.consequence) &&
        !insightFamilyCollides(experience, existingParagraphs)
    );
    if (aligned) return aligned;
  }

  const withoutCollision = ranked.find(
    (experience) => !insightFamilyCollides(experience, existingParagraphs)
  );
  if (withoutCollision) return withoutCollision;

  return selectInsightExperience(experiences, context, existingParagraphs, selectedSensation);
}

function buildSensationBasedInsight(input = {}) {
  const evidenceText = cleanText(input.evidence?.text || "");
  if (
    evidenceText &&
    (isGenericInsightBody(evidenceText) || isGenericInsight(evidenceText))
  ) {
    return { ok: false, error: "generic_insight" };
  }

  const sensationBridge =
    input.sensationBridge ||
    buildSensationBridge({
      winner: input.allowedEvidence || input.product?.product_name || "",
      structuredFacts: input.structuredFacts,
      semanticCandidateData: input.semanticCandidateData,
      reasoning: collectReasoningPayload(input.searchCognition || {}, input.decisionMemory || {}),
      query: input.query || "",
      primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
      category: input.category || input.product?.category || "",
      querySignals: input.querySignals || {},
      tradeoffs: input.tradeoffs || null,
    });

  if (!sensationBridge.ok || !sensationBridge.sensations?.length) {
    return { ok: false, error: "no_sensation" };
  }

  const selectedSensation = selectInsightSensation(
    sensationBridge.sensations,
    {
      primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
      query: input.query || "",
      querySignals: input.querySignals || {},
    },
    input.existingParagraphs || [],
    input.usedPerceptionClasses || new Set()
  );

  if (!selectedSensation) {
    return { ok: false, error: "no_sensation_candidate" };
  }

  const humanExperienceModel =
    input.humanExperienceModel ||
    buildHumanExperienceModel({
      winner: input.allowedEvidence || input.product?.product_name || "",
      sensations: sensationBridge.sensations,
      structuredFacts: input.structuredFacts,
      semanticCandidateData: input.semanticCandidateData,
      reasoning: collectReasoningPayload(input.searchCognition || {}, input.decisionMemory || {}),
      tradeoffs: input.tradeoffs || null,
      query: input.query || "",
      primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
      category: input.category || input.product?.category || "",
      querySignals: input.querySignals || {},
      sensationBridge,
    });

  const humanFrictionModel =
    input.humanFrictionModel ||
    buildHumanFrictionModel({
      winner: input.allowedEvidence || input.product?.product_name || "",
      sensations: sensationBridge.sensations,
      experiences: humanExperienceModel.experiences || [],
      structuredFacts: input.structuredFacts,
      semanticCandidateData: input.semanticCandidateData,
      reasoning: collectReasoningPayload(input.searchCognition || {}, input.decisionMemory || {}),
      tradeoffs: input.tradeoffs || null,
      query: input.query || "",
      primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
      category: input.category || input.product?.category || "",
      querySignals: input.querySignals || {},
      sensationBridge,
      humanExperienceModel,
    });

  const insightContext = {
    primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
    query: input.query || "",
    querySignals: input.querySignals || {},
  };

  const resolvedInsight = resolveInsightExperienceWithFriction(
    humanExperienceModel.experiences || [],
    humanFrictionModel.frictions || [],
    insightContext,
    input.existingParagraphs || [],
    selectedSensation
  );

  const selectedExperience =
    pickInsightExperience(
      humanExperienceModel.experiences || [],
      insightContext,
      input.existingParagraphs || [],
      selectedSensation
    ) || resolvedInsight.experience;

  const selectedFriction = resolvedInsight.friction || null;

  const ownershipExperienceModel =
    input.ownershipExperienceModel ||
    buildOwnershipExperienceModel({
      winner: input.allowedEvidence || input.product?.product_name || "",
      sensations: sensationBridge.sensations,
      experiences: humanExperienceModel.experiences || [],
      frictions: humanFrictionModel.frictions || [],
      structuredFacts: input.structuredFacts,
      semanticCandidateData: input.semanticCandidateData,
      reasoning: collectReasoningPayload(input.searchCognition || {}, input.decisionMemory || {}),
      tradeoffs: input.tradeoffs || null,
      query: input.query || "",
      primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
      category: input.category || input.product?.category || "",
      querySignals: input.querySignals || {},
      sensationBridge,
      humanExperienceModel,
      humanFrictionModel,
    });

  const selectedOwnership = selectPrimaryOwnership(
    ownershipExperienceModel.ownershipExperiences || [],
    insightContext,
    selectedExperience,
    selectedFriction
  );

  const meaningFromExperience = selectedExperience
    ? buildDecisionMeaningFromExperience(selectedExperience, insightContext)
    : null;

  let meaning =
    meaningFromExperience && isExperienceTraceable(selectedExperience)
      ? {
          ...meaningFromExperience,
          trace: {
            ...(meaningFromExperience.trace || {}),
            perceptionClass: selectedSensation.perceptionClass || meaningFromExperience.perceptionClass,
          },
        }
      : buildDecisionMeaningFromSensation(selectedSensation, insightContext);

  if (selectedFriction) {
    meaning = enrichDecisionMeaningWithFriction(meaning, selectedFriction);
  }

  if (selectedOwnership) {
    meaning = enrichDecisionMeaningWithOwnership(meaning, selectedOwnership);
  }

  if (!meaning || !isSensationInsightTraceable(meaning)) {
    return { ok: false, error: "untraceable_sensation", meaning };
  }

  const paragraph = verbalizeInsightFromDecisionMeaning(meaning);
  if (!paragraph || isGenericInsight(paragraph) || isGenericInsightBody(paragraph)) {
    return { ok: false, error: "generic_sensation_insight", meaning };
  }

  return {
    ok: true,
    paragraph,
    insight: {
      text: meaning.experience || meaning.sensation,
      source: meaningFromExperience ? "human_experience_reasoning" : "sensation_reasoning",
      field: "perception",
      perceptionClass: meaning.perceptionClass,
      experienceClass: meaning.experienceClass || "",
      frictionClass: meaning.frictionClass || "",
      ownershipClass: meaning.ownershipClass || "",
      timeHorizon: meaning.timeHorizon || "",
      trace: meaning.trace,
      origin: meaningFromExperience
        ? classifyExperienceOrigin(selectedExperience)
        : classifyInsightOrigin(meaning),
      frictionOrigin: selectedFriction ? classifyFrictionOrigin(selectedFriction) : "",
      ownershipOrigin: selectedOwnership ? classifyOwnershipOrigin(selectedOwnership) : "",
    },
    meaning,
    sensation: selectedSensation,
    experience: selectedExperience,
    friction: selectedFriction,
    ownership: selectedOwnership,
    sensationBridge,
    humanExperienceModel,
    humanFrictionModel,
    ownershipExperienceModel,
    error: null,
  };
}

export function buildExpertInsight(input = {}) {
  if (!shouldApplyExpertInsightGeneration(input)) {
    return { ok: false, paragraph: "", insight: null, error: "suppressed" };
  }

  const allowedEvidence =
    input.allowedEvidence ||
    input.structuredFacts?.allowedEvidence ||
    cleanText(input.product?.trustedSpecs?.official_name || input.product?.product_name || "");

  const sensationInsight = buildSensationBasedInsight({
    ...input,
    allowedEvidence,
  });

  if (sensationInsight.ok && sensationInsight.paragraph) {
    const cleanedSensation =
      cleanupMiaHumanLanguage(sensationInsight.paragraph, {
        allowedEvidence,
        preserveStructure: true,
      }).text || sensationInsight.paragraph;

    if (
      cleanedSensation &&
      !isGenericInsight(cleanedSensation) &&
      !isGenericInsightBody(cleanedSensation) &&
      !overlapsExistingBlocks(cleanedSensation, input.existingParagraphs || [])
    ) {
      return {
        ok: true,
        paragraph: cleanedSensation,
        insight: sensationInsight.insight,
        meaning: sensationInsight.meaning,
        sensation: sensationInsight.sensation,
        experience: sensationInsight.experience,
        friction: sensationInsight.friction,
        ownership: sensationInsight.ownership,
        sensationBridge: sensationInsight.sensationBridge,
        humanExperienceModel: sensationInsight.humanExperienceModel,
        humanFrictionModel: sensationInsight.humanFrictionModel,
        ownershipExperienceModel: sensationInsight.ownershipExperienceModel,
        origin: sensationInsight.insight?.origin || "real",
        error: null,
      };
    }
  }

  const evidence = input.evidence || null;
  const sanitizedEvidence = evidence?.text
    ? sanitizeDataLayerEvidenceText(evidence.text)
    : { ok: false, text: "" };

  if (!sanitizedEvidence.ok || !sanitizedEvidence.text) {
    return { ok: false, paragraph: "", insight: null, error: sensationInsight.error || "suppressed_raw_evidence" };
  }

  if (
    isGenericInsightBody(sanitizedEvidence.text) ||
    isGenericInsight(sanitizedEvidence.text)
  ) {
    return { ok: false, paragraph: "", insight: null, error: "generic_insight" };
  }

  const safeEvidence = {
    ...evidence,
    text: sanitizedEvidence.text,
  };

  const candidates = extractInsightCandidates(safeEvidence, {
    structuredFacts: input.structuredFacts,
    searchCognition: input.searchCognition,
    decisionMemory: input.decisionMemory,
    querySignals: input.querySignals || {},
    primaryAxis: cleanText(
      input.primaryAxis || input.searchCognition?.primaryAxis || input.activePriority || ""
    ),
    query: input.query || "",
    existingParagraphs: input.existingParagraphs || [],
    evidenceText: safeEvidence.text,
  });

  const existing = input.existingParagraphs || [];
  let selected = null;

  if (input.semanticAllocationState) {
    selected = selectInsightCandidate(candidates, input.semanticAllocationState, {
      primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
    });
    if (!selected) {
      return { ok: false, paragraph: "", insight: null, error: "redundant_insight" };
    }
  }

  for (const candidate of candidates) {
    if (selected) break;
    if (overlapsExistingBlocks(candidate.text, existing)) continue;
    if (findInventedSpecViolations(candidate.text, allowedEvidence).length > 0) continue;
    selected = candidate;
    break;
  }

  if (!selected) {
    return { ok: false, paragraph: "", insight: null, error: "no_insight" };
  }

  const paragraph = buildInsightParagraph(selected, {
    query: input.query || "",
    evidence: safeEvidence,
    primaryAxis: input.primaryAxis || input.searchCognition?.primaryAxis || "",
  });

  const cleaned =
    cleanupMiaHumanLanguage(paragraph, {
      allowedEvidence,
      preserveStructure: true,
    }).text || paragraph;

  if (!cleaned || isGenericInsight(cleaned) || isGenericInsightBody(cleaned)) {
    return { ok: false, paragraph: "", insight: selected, error: "generic_insight" };
  }

  if (isArtificialAttributeChain(cleaned)) {
    return { ok: false, paragraph: "", insight: selected, error: "artificial_insight_source" };
  }

  if (SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return { ok: false, paragraph: "", insight: selected, error: "spec_dump" };
  }

  if (BANNED_INSIGHT_OPENERS.some((pattern) => pattern.test(cleaned))) {
    return { ok: false, paragraph: "", insight: selected, error: "banned_opener" };
  }

  if (findInventedSpecViolations(cleaned, allowedEvidence).length > 0) {
    return { ok: false, paragraph: "", insight: selected, error: "invented_insight" };
  }

  if (!assertUserFacingDataLayerText(cleaned).ok) {
    return { ok: false, paragraph: "", insight: selected, error: "raw_token_leak" };
  }

  if (overlapsExistingBlocks(cleaned, existing)) {
    return { ok: false, paragraph: "", insight: selected, error: "duplicate" };
  }

  return {
    ok: true,
    paragraph: cleaned,
    insight: selected,
    error: null,
  };
}

export function injectExpertInsight(input = {}) {
  return buildExpertInsight(input);
}

export function isExpertInsightUseful(text = "") {
  const body = cleanText(text);
  if (!body || body.length < 40) return false;
  if (isGenericInsight(body)) return false;
  if (isGenericInsightBody(body)) return false;
  if (BANNED_INSIGHT_OPENERS.some((pattern) => pattern.test(body))) return false;

  return (
    INSIGHT_MARKER_PATTERN.test(body) &&
    !SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(body))
  );
}

export function auditExpertInsightGeneration(text = "", context = {}) {
  const flags = [];
  const body = cleanText(text);

  if (context.expectInsight && !isExpertInsightUseful(body)) {
    flags.push(EXPERT_INSIGHT_FLAGS.MISSING_EXPERT_INSIGHT);
  }

  if (body && (isGenericInsight(body) || isGenericInsightBody(body))) {
    flags.push(EXPERT_INSIGHT_FLAGS.GENERIC_INSIGHT);
  }

  if (body && SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(EXPERT_INSIGHT_FLAGS.SPEC_DUMP);
  }

  if (body && BANNED_INSIGHT_OPENERS.some((pattern) => pattern.test(body))) {
    flags.push(EXPERT_INSIGHT_FLAGS.BANNED_INSIGHT_OPENER);
  }

  if (findInventedSpecViolations(body, context.allowedEvidence || "").length > 0) {
    flags.push(EXPERT_INSIGHT_FLAGS.INVENTED_INSIGHT);
  }

  if (
    body &&
    context.evidenceText &&
    normalizeForOverlap(body).includes(normalizeForOverlap(context.evidenceText))
  ) {
    flags.push(EXPERT_INSIGHT_FLAGS.DUPLICATE_EVIDENCE);
  }

  return flags;
}

export function extractExpertInsightFromReply(reply = "") {
  const body = String(reply || "").trim();
  if (!body) return "";

  const chunks = body
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const fromParagraph = chunks.find(
    (chunk) => isExpertInsightUseful(chunk) && !/^✅|^⚠️|^🏆|^👉/.test(chunk)
  );
  if (fromParagraph) return fromParagraph;

  const markerIndex = body.search(INSIGHT_MARKER_PATTERN);
  if (markerIndex < 0) return "";

  const tail = body.slice(markerIndex);
  const stopPattern =
    /\s(?:Nessa faixa|O ponto|Um detalhe|Tem um ponto|Quase ningu|É exatamente|Foi esse|Muitos acabam|Na prática, a escolha|✅|⚠️)/;
  const stopAt = tail.search(stopPattern);
  const candidate = (stopAt > 0 ? tail.slice(0, stopAt) : tail.slice(0, 220)).trim();

  return isExpertInsightUseful(candidate) ? candidate : "";
}

export function buildExpertInsightAuditRecord(input = {}) {
  const built = buildExpertInsight(input);
  const flags = auditExpertInsightGeneration(built.paragraph, {
    expectInsight: !!input.expectInsight,
    allowedEvidence: input.allowedEvidence || "",
    evidenceText: input.evidence?.text || "",
  });

  return {
    query: input.query || "",
    category: input.category || "",
    insightSource: built.insight?.source || "",
    insightInjected: built.ok,
    expertInsightDetected: isExpertInsightUseful(built.paragraph),
    flags,
    paragraph: built.paragraph,
    ok: built.ok && flags.length === 0,
  };
}
