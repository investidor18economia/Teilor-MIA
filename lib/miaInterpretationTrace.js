/**
 * PATCH 4A.11 — Interpretation Trace (semantic audit contract)
 *
 * Formalizes the claim → evidence → interpreter → narrative → surface chain.
 * The LLM may only appear as the renderer of pre-structured language — never as interpreter.
 */

import { contextualSynthesisToTrace } from "./miaContextualDecisionSynthesis.js";
import { validateConfidenceReplyAlignment } from "./miaAbsoluteClaimGovernance.js";
import {
  detectBrokenSurfaceGrammar,
  validateComposedSurface,
} from "./miaVerbalizationCompositionGuard.js";
import { SEMANTIC_EVIDENCE_SOURCE } from "./miaSemanticDecisionContract.js";

export const INTERPRETATION_TRACE_VERSION = "4A.11.0";

export const INTERPRETER_COMPONENT = Object.freeze({
  CONSEQUENCE_TRANSLATION: "ConsequenceTranslationLayer",
  PRACTICAL_CONSEQUENCE_ENGINE: "PracticalConsequenceEngine",
  CONTEXTUAL_PRIORITY_ENGINE: "ContextualPriorityEngine",
  DOMAIN_KNOWLEDGE_ADAPTER: "DomainKnowledgeAdapter",
  STRUCTURED_DECISION_FACTS: "StructuredDecisionFacts",
  NARRATIVE_PLANNER: "NarrativePlanner",
  SEMANTIC_VERBALIZER: "SemanticVerbalizer",
  COMPOSITION_GUARD: "VerbalizationCompositionGuard",
  CONFIDENCE_GOVERNANCE: "AbsoluteClaimGovernance",
  SURFACE_RENDERER: "LLM_SurfaceRenderer",
});

const FORBIDDEN_INTERPRETER_MARKERS = /\b(llm|gpt|openai|chatgpt)\b/i;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolveInterpreterForUnit(unit = null) {
  const source = String(unit?.evidence?.source || "").toLowerCase();
  const traceSource = String(unit?.trace?.interpreter || unit?.trace?.source || "").toLowerCase();

  if (traceSource.includes("practical_consequence")) {
    return INTERPRETER_COMPONENT.PRACTICAL_CONSEQUENCE_ENGINE;
  }
  if (traceSource.includes("domain")) {
    return INTERPRETER_COMPONENT.DOMAIN_KNOWLEDGE_ADAPTER;
  }
  if (source === SEMANTIC_EVIDENCE_SOURCE.DATA_LAYER || source === "data_layer") {
    return INTERPRETER_COMPONENT.CONSEQUENCE_TRANSLATION;
  }
  if (source === SEMANTIC_EVIDENCE_SOURCE.COMMERCIAL || source === "commercial") {
    return INTERPRETER_COMPONENT.STRUCTURED_DECISION_FACTS;
  }
  if (source === SEMANTIC_EVIDENCE_SOURCE.FALLBACK || source === "fallback") {
    return INTERPRETER_COMPONENT.STRUCTURED_DECISION_FACTS;
  }
  if (unit?.implication?.effectKey) {
    return INTERPRETER_COMPONENT.PRACTICAL_CONSEQUENCE_ENGINE;
  }
  return INTERPRETER_COMPONENT.STRUCTURED_DECISION_FACTS;
}

function evidenceFromUnit(unit = null) {
  if (!unit?.evidence) return [];
  return [
    {
      id: unit.evidence.id || null,
      dimension: unit.evidence.dimension || null,
      source: unit.evidence.source || null,
      token: unit.evidence.sourceToken || null,
      interpretedText: unit.evidence.interpretedText || null,
      confidence: unit.evidence.confidence || null,
    },
  ];
}

function limitationsFromUnit(unit = null) {
  const limitations = [];
  if (unit?.caveat?.text) limitations.push(unit.caveat.text);
  if (unit?.caveat?.type) limitations.push(`caveat:${unit.caveat.type}`);
  if (unit?.implication?.confidence === "low" || unit?.implication?.confidence === "unknown") {
    limitations.push("low_confidence_implication");
  }
  return limitations;
}

function findNarrativeElement(narrativePlan = null, unitId = "") {
  const sections = narrativePlan?.sections || [];
  return sections.find((entry) => entry.unitId === unitId) || null;
}

function findVerbalizationSlot(verbalizationPlan = null, unitId = "") {
  const slots = verbalizationPlan?.sections || verbalizationPlan?.slots || [];
  return slots.find((entry) => entry.unitId === unitId) || null;
}

/**
 * @param {{
 *   unit?: Record<string, unknown>,
 *   narrativeElement?: Record<string, unknown>|null,
 *   verbalizationSlot?: Record<string, unknown>|null,
 *   practicalConsequence?: Record<string, unknown>|null,
 *   renderedSentence?: string|null,
 * }} input
 */
export function buildClaimTrace(input = {}) {
  const unit = input.unit || null;
  const narrativeElement = input.narrativeElement || null;
  const verbalizationSlot = input.verbalizationSlot || null;
  const practicalConsequence = input.practicalConsequence || null;

  const claimText =
    cleanText(verbalizationSlot?.text) ||
    cleanText(narrativeElement?.legacyText) ||
    cleanText(unit?.implication?.interpretedSourceText) ||
    cleanText(unit?.evidence?.interpretedText) ||
    cleanText(unit?.legacy?.compactedText);

  return {
    claim: claimText || null,
    evidence: evidenceFromUnit(unit),
    interpreter: resolveInterpreterForUnit(unit),
    reasoning: {
      effectKey: unit?.implication?.effectKey || null,
      direction: unit?.implication?.direction || null,
      decisionRole: unit?.decisionRole || null,
      narrativeSection: narrativeElement?.sectionType || null,
      verbalizationSlot: verbalizationSlot?.slot || null,
    },
    practicalConsequence: practicalConsequence
      ? {
          category: practicalConsequence.category || null,
          practicalMeaning: practicalConsequence.practicalMeaning || null,
          confidence: practicalConsequence.confidence || null,
          limitations: practicalConsequence.limitations || [],
        }
      : null,
    confidence:
      unit?.implication?.confidence ||
      unit?.evidence?.confidence ||
      practicalConsequence?.confidence ||
      null,
    limitations: limitationsFromUnit(unit),
    narrativeElement: narrativeElement
      ? {
          sectionType: narrativeElement.sectionType || null,
          unitId: narrativeElement.unitId || null,
          effectKey: narrativeElement.effectKey || null,
        }
      : null,
    renderedSentence: input.renderedSentence || null,
  };
}

function matchPracticalConsequence(consequences = [], unit = null) {
  const effectKey = unit?.implication?.effectKey;
  if (!effectKey) return null;
  return (
    consequences.find(
      (entry) =>
        String(entry?.category || "").toLowerCase() === String(effectKey).toLowerCase() ||
        String(entry?.source?.primary || "").toLowerCase().includes(String(effectKey).toLowerCase())
    ) || null
  );
}

/**
 * @param {Record<string, unknown>} session
 * @param {string} [reply]
 */
export function buildInterpretationTraceFromSession(session = {}, reply = "") {
  const structured = session?.lastStructuredDecisionFacts || null;
  const narrativePlan = session?.lastNarrativePlan || null;
  const verbalizationPlan = session?.lastVerbalizationPlan || null;
  const consequences = Array.isArray(session?.lastPracticalConsequences)
    ? session.lastPracticalConsequences
    : [];
  const priorityModel = session?.lastContextualPriorityModel || null;
  const domainModel = session?.lastDomainKnowledgeModel || null;

  const fallbackUnits = [
    ...(Array.isArray(session?.lastSemanticDecisionUnits) ? session.lastSemanticDecisionUnits : []),
    ...(Array.isArray(session?.lastSemanticSacrificeUnits) ? session.lastSemanticSacrificeUnits : []),
  ];

  const units = [
    ...(structured?.semanticUnits || []),
    ...(structured?.tradeoffs?.map((entry) => entry.unit).filter(Boolean) || []),
  ];

  const claimUnits =
    units.length > 0
      ? units
      : fallbackUnits.length > 0
        ? fallbackUnits
        : consequences.length > 0
          ? consequences.map((entry, index) => ({
              id: `pce_${index}`,
              decisionRole: "supporting_evidence",
              evidence: {
                id: `ev_pce_${index}`,
                source: "data_layer",
                dimension: entry.category,
                interpretedText: entry.practicalMeaning,
                confidence: entry.confidence,
              },
              implication: {
                effectKey: entry.category,
                direction: "positive",
                confidence: entry.confidence,
              },
            }))
          : [];

  const claims = [];
  for (const unit of claimUnits) {
    const unitId = unit?.id || "";
    const narrativeElement = findNarrativeElement(narrativePlan, unitId);
    const verbalizationSlot = findVerbalizationSlot(verbalizationPlan, unitId);
    const practicalConsequence = matchPracticalConsequence(consequences, unit);
    claims.push(
      buildClaimTrace({
        unit,
        narrativeElement,
        verbalizationSlot,
        practicalConsequence,
        renderedSentence: reply ? null : null,
      })
    );
  }

  const synthesisPayload = {
    structuredDecisionFacts: structured,
    narrativePlan,
    verbalizationPlan,
    verbalizationStyleGovernance: session?.lastVerbalizationStyleGovernance || null,
    practicalConsequenceTrace: session?.lastPracticalConsequences
      ? { consequences, count: consequences.length }
      : null,
    contextualPriorityTrace: priorityModel,
    domainKnowledgeTrace: session?.lastDomainKnowledgeTrace || domainModel,
  };

  const confidenceAlignment = validateConfidenceReplyAlignment(reply, consequences);
  const surfaceValidation = reply ? validateComposedSurface(reply) : null;
  const grammarCheck = reply ? detectBrokenSurfaceGrammar(reply) : null;

  return {
    version: INTERPRETATION_TRACE_VERSION,
    claimCount: claims.length,
    claims,
    cognitiveChain: {
      knowledgeBase: {
        hasStructuredFacts:
          !!structured?.semanticUnits?.length || claimUnits.length > 0 || consequences.length > 0,
        unitCount: structured?.semanticUnits?.length || claimUnits.length || 0,
        legacyIsPrimaryTruth: structured?.legacy?.isPrimaryTruth === true,
      },
      decisionFacts: structured?.trace || null,
      priorityEngine: priorityModel
        ? {
            dominantCriterion: priorityModel.dominantCriterion || null,
            personalized: !!priorityModel.personalized,
            criteriaCount: priorityModel.criteria?.length || 0,
          }
        : null,
      domainAdapter: domainModel
        ? {
            domain: domainModel.domain || null,
            itemCount: domainModel.itemCount || domainModel.items?.length || 0,
            neutral: !!domainModel.neutral,
            limitation: domainModel.limitation || null,
          }
        : null,
      practicalConsequenceEngine: {
        count: consequences.length,
        categories: consequences.map((entry) => entry.category).filter(Boolean),
      },
      confidenceEvaluation: {
        alignmentPass: confidenceAlignment.pass,
        alignmentReason: confidenceAlignment.reason,
        consequenceConfidences: consequences.map((entry) => entry.confidence).filter(Boolean),
      },
      narrativePlan: narrativePlan
        ? {
            sectionCount: narrativePlan.sections?.length || 0,
            closingType: narrativePlan.recommendedClosing?.type || null,
          }
        : null,
      verbalizationPlan: verbalizationPlan
        ? {
            sectionCount: verbalizationPlan.sections?.length || 0,
            builtFromNarrativePlan: !!verbalizationPlan.trace?.builtFromNarrativePlan,
          }
        : null,
      compositionGuard: surfaceValidation
        ? { pass: surfaceValidation.pass, grammarOk: !grammarCheck?.detected }
        : null,
      surfaceRenderer: reply ? { role: INTERPRETER_COMPONENT.SURFACE_RENDERER, replyLength: reply.length } : null,
    },
    synthesisTrace: contextualSynthesisToTrace(synthesisPayload),
    limitationsDeclared:
      !!domainModel?.limitation ||
      claims.some((entry) => entry.limitations.length > 0) ||
      /limitad|insuficient|nao encontrei|nao posso afirmar|preciso de mais|cat[aá]logo|op[cç][aã]o v[aá]lida/i.test(
        reply
      ),
  };
}

/**
 * @param {ReturnType<typeof buildInterpretationTraceFromSession>} trace
 */
export function validateInterpretationTrace(trace = null) {
  const reasons = [];
  const claims = trace?.claims || [];

  if (!trace) {
    return { valid: false, reasons: ["missing_trace"], claimIssues: [] };
  }

  const claimIssues = [];
  for (const claim of claims) {
    const issues = [];
    if (!claim.claim) issues.push("missing_claim_text");
    if (!claim.evidence?.length) issues.push("missing_evidence");
    if (!claim.interpreter) issues.push("missing_interpreter");
    if (FORBIDDEN_INTERPRETER_MARKERS.test(String(claim.interpreter || ""))) {
      issues.push("llm_as_interpreter");
    }
    if (issues.length) {
      claimIssues.push({ claim: claim.claim, issues });
      reasons.push(...issues.map((issue) => `claim:${issue}`));
    }
  }

  if (trace.cognitiveChain?.knowledgeBase?.legacyIsPrimaryTruth) {
    reasons.push("legacy_strings_as_primary_truth");
  }

  if (trace.cognitiveChain?.confidenceEvaluation?.alignmentPass === false) {
    reasons.push("confidence_misalignment");
  }

  if (trace.cognitiveChain?.compositionGuard?.pass === false) {
    reasons.push("composition_guard_failed");
  }

  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    claimIssues,
    auditedClaims: claims.length,
  };
}

/**
 * High-level audit helper for conversation validation scripts.
 * @param {Record<string, unknown>} session
 * @param {string} reply
 * @param {Record<string, unknown>} [expectations]
 */
export function auditInterpretationChain(session = {}, reply = "", expectations = {}) {
  const trace = buildInterpretationTraceFromSession(session, reply);
  const validation = validateInterpretationTrace(trace);
  const chain = trace.cognitiveChain || {};

  const requiresArchitecture = expectations.requireArchitecture === true;
  const requiresClaims = expectations.requireClaims === true;
  const requiresLimitations = expectations.requireLimitations === true;
  const clarificationOk = expectations.clarificationOk === true;

  const clarificationReply =
    /faixa de pre[cç]o|or[cç]amento|explica.*melhor|me diz|qual produto|consigo ser mais precisa|entendi o uso|preciso de mais/i.test(
      reply
    );

  const hasArchitecture =
    !!chain.knowledgeBase?.hasStructuredFacts ||
    !!chain.priorityEngine?.dominantCriterion ||
    (chain.practicalConsequenceEngine?.count || 0) > 0;

  const llmOnlyReply =
    /gtx\s*\d+|rx\s*\d+|placa de v[ií]deo/i.test(reply) &&
    trace.claimCount === 0 &&
    (chain.practicalConsequenceEngine?.count || 0) === 0;

  const fakeProductRecommendation =
    /se destaca|fecha bem para o seu perfil|mantaria esse produto/i.test(reply) &&
    !trace.limitationsDeclared;

  const stubReply =
    /^agora ficou mais claro o que voc[eê] procura\.?$/i.test(reply.trim()) ||
    (reply.length < 60 && /ficou mais claro/i.test(reply));

  const architectureOk =
    !requiresArchitecture ||
    hasArchitecture ||
    (clarificationOk && clarificationReply && !hasArchitecture);

  const claimsOk =
    !requiresClaims ||
    trace.claimCount > 0 ||
    (chain.practicalConsequenceEngine?.count || 0) > 0 ||
    (clarificationOk && clarificationReply);

  const limitationsOk =
    !requiresLimitations ||
    trace.limitationsDeclared ||
    (clarificationOk && clarificationReply);

  const pass =
    validation.valid &&
    architectureOk &&
    claimsOk &&
    limitationsOk &&
    !llmOnlyReply &&
    !(requiresLimitations && fakeProductRecommendation) &&
    !(expectations.rejectStub && stubReply) &&
    reply.length >= (expectations.minLen ?? 30) &&
    chain.confidenceEvaluation?.alignmentPass !== false &&
    chain.compositionGuard?.pass !== false;

  return {
    pass,
    trace,
    validation,
    hasArchitecture,
    claimCount: trace.claimCount,
    limitationsDeclared: trace.limitationsDeclared,
    clarificationReply,
  };
}
