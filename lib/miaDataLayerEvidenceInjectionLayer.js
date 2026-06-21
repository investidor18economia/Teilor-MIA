/**
 * PATCH 9.1G — Data Layer Evidence Injection Layer
 *
 * Extrai evidência concreta do Data Layer e injeta na explicação de decisão.
 * Não altera winner, ranking, routing ou decision engine.
 */

import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";
import {
  applyDataLayerHumanizationGuard,
  assertUserFacingDataLayerText,
  detectRawDataLayerTokenLeak,
  sanitizeDataLayerEvidenceText,
} from "./miaDataLayerHumanizationGuard.js";
import {
  isArtificialAttributeChain,
  normalizeTrustedSpecsSemanticFields,
} from "./miaDataLayerSemanticNormalizer.js";
import { translateTokenToStructuredConsequence } from "./miaConsequenceTranslationLayer.js";
import { selectEvidenceCandidate } from "./miaSemanticFamilyAllocationEngine.js";
import {
  guardEvidenceSpecificity,
  selectGuardedEvidenceCandidate,
  isGenericInterchangeableEvidence,
} from "./miaEvidenceSpecificityGuard.js";

export const DATA_LAYER_EVIDENCE_INJECTION_VERSION = "9.2Y.1";

export const EVIDENCE_INJECTION_FLAGS = Object.freeze({
  MISSING_EVIDENCE_INJECTION: "MISSING_EVIDENCE_INJECTION",
  GENERIC_EVIDENCE: "GENERIC_EVIDENCE",
  SPEC_DUMP: "SPEC_DUMP",
  INVENTED_EVIDENCE: "INVENTED_EVIDENCE",
  ABSTRACT_EVIDENCE: "ABSTRACT_EVIDENCE",
  BANNED_EVIDENCE_OPENER: "BANNED_EVIDENCE_OPENER",
  BROKE_9_1C: "BROKE_9_1C",
  BROKE_9_1A: "BROKE_9_1A",
  REGRESSION_8X: "REGRESSION_8X",
});

const RECOVERY_INTERACTION_TYPES = new Set([
  "contradiction_recovery",
  "user_confusion_recovery",
  "escalated_confusion_recovery",
  "post_change_recovery",
  "final_decision_scope",
]);

const BANNED_EVIDENCE_OPENERS = Object.freeze([
  /^sabia que/i,
  /^curiosidade:/i,
  /^fato interessante:/i,
  /^conhecimento privilegiado:/i,
  /^especialistas sabem que/i,
]);

const GENERIC_EVIDENCE_PATTERNS = Object.freeze([
  /ganho percept[ií]vel no uso real/i,
  /menos preocupa[cç][aã]o com autonomia/i,
  /funciona melhor para esse perfil/i,
  /menos sensa[cç][aã]o de limite/i,
  /oferece mais tranquilidade no uso di[aá]rio/i,
  /experi[eê]ncia equilibrada/i,
  /uso cotidiano mais previs[ií]vel/i,
  /funciona bem para\b/i,
  /tende a ajudar/i,
]);

const SPEC_DUMP_PATTERNS = Object.freeze([
  /\b(?:snapdragon|mediatek|dimensity|exynos|apple a\d+)\b/i,
  /\b(?:rtx|gtx)\s*\d/i,
  /\b\d+\s*mah\b/i,
  /\b\d+\s*mp\b/i,
  /\b(?:ois|amoled|120hz|144hz)\b/i,
  /\bpossui\b.*\b(?:hz|mah|mp|gb ram)\b/i,
]);

const AXIS_HINTS = Object.freeze({
  camera: /\b(c[aâ]mera|foto|fotos|v[ií]deo|noturn|selfie|registrar)\b/i,
  battery: /\b(bateria|autonomia|carreg|tomada|carga)\b/i,
  longevity: /\b(atualiza|anos|durar|longev|suporte|software|ficar v[aá]rios)\b/i,
  performance: /\b(desempenho|performance|jogo|multitarefa|fluid|rapidez)\b/i,
  screen: /\b(tela|display|painel|visual|hz|fluidez|imagem|streaming|filmes|s[eé]ries)\b/i,
  value: /\b(pre[cç]o|custo|barato|econom|or[cç]amento)\b/i,
  comfort: /\b(conforto|ergonom|assento|suporte)\b/i,
  storage: /\b(armazen|gb|espa[cç]o|arquivo)\b/i,
});

const FIELD_PRIORITY = Object.freeze({
  strengths: 100,
  market_notes: 90,
  strategic_notes: 88,
  notes: 85,
  risk_notes: 80,
  ideal_for: 70,
  micro: 75,
  weaknesses: 40,
  avoid_if: 35,
});

const EVIDENCE_MARKER_PATTERN =
  /(?:um )?detalhe que muita gente ignora|tem um ponto que ajudou|quase ningu[eé]m presta aten[cç][aã]o|é exatamente aqui que ele ganha for[cç]a|foi esse detalhe que fez diferen[cç]a|muitos acabam olhando s[oó] pre[cç]o e esquecem que/i;

const EVIDENCE_OPENERS = Object.freeze([
  "Um detalhe que muita gente ignora:",
  "Tem um ponto que ajudou ele a ganhar essa disputa:",
  "Quase ninguém presta atenção nisso:",
  "É exatamente aqui que ele ganha força:",
  "Foi esse detalhe que fez diferença:",
  "Muitos acabam olhando só preço e esquecem que",
]);

const CAUTIOUS_EVIDENCE_FRAMES = Object.freeze([
  (entry) => `Na comparação, ${lowercaseLead(entry)}.`,
  (entry) => `Um ponto observado: ${lowercaseLead(entry)}.`,
  (entry) => `Vale notar que ${lowercaseLead(entry)}.`,
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

function isHumanEvidenceSentence(text = "", field = "") {
  const body = cleanText(text);
  const words = body.split(/\s+/).filter(Boolean);
  const minWords = field === "ideal_for" || field === "market_notes" ? 3 : 5;
  if (words.length < minWords) return false;
  return /\b(pode|vale|n[aã]o|nao|ainda|mesmo|continua|recebe|ajuda|peso|pesa|quem|para|uso|trabalho|home|office|filmes|s[eé]ries)\b/i.test(
    body
  );
}

function isGenericEvidence(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  if (isGenericInterchangeableEvidence(body)) return true;
  return GENERIC_EVIDENCE_PATTERNS.some((pattern) => pattern.test(body));
}

function scoreAxisMatch(text = "", primaryAxis = "") {
  if (!primaryAxis || !AXIS_HINTS[primaryAxis]) return 0;
  return AXIS_HINTS[primaryAxis].test(text) ? 24 : 0;
}

function scoreConcreteness(text = "", field = "") {
  const body = cleanText(text);
  let score = Math.min(body.split(/\s+/).length, 18);
  if (/\b(ainda|mesmo|continua|recebe|noturn|anos|carregador|atualiza|home office|streaming|filmes)\b/i.test(body)) {
    score += 12;
  }
  if (isGenericEvidence(body)) score -= 40;
  if (!isHumanEvidenceSentence(body, field)) score -= 20;
  return score;
}

function overlapsExistingBlocks(candidate = "", existing = []) {
  const normalized = normalizeForOverlap(candidate);
  if (!normalized || normalized.length < 24) return false;

  return existing.some((block) => {
    const prev = normalizeForOverlap(block);
    if (!prev) return false;
    if (prev.includes(normalized) || normalized.includes(prev)) return true;

    const words = normalized.split(" ").filter((w) => w.length > 4);
    const prevWords = prev.split(" ").filter((w) => w.length > 4);
    if (words.length < 4 || prevWords.length < 4) return false;
    const overlap = words.filter((w) => prevWords.includes(w)).length;
    return overlap / Math.min(words.length, prevWords.length) >= 0.68;
  });
}

/**
 * @param {Record<string, unknown>|null} trustedSpecs
 * @param {string} primaryAxis
 * @param {Record<string, unknown>|null} structuredFacts
 */
export function extractDataLayerEvidence(
  trustedSpecs = null,
  primaryAxis = "",
  structuredFacts = null
) {
  const candidates = [];

  if (structuredFacts?.mode === "data_layer") {
    const consequenceBuckets = [
      ["strengths", structuredFacts.strengthConsequences],
      ["market_notes", structuredFacts.noteConsequences],
      ["risk_notes", structuredFacts.riskConsequences],
      ["ideal_for", structuredFacts.idealForConsequences],
      ["micro", structuredFacts.microConsequences],
    ];

    for (const [field, values] of consequenceBuckets) {
      for (const entry of cleanList(values, 3)) {
        if (!entry || isGenericEvidence(entry) || isArtificialAttributeChain(entry)) continue;
        if (SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(entry))) continue;

        candidates.push({
          text: entry,
          field,
          source: "consequence_translation",
          score:
            (FIELD_PRIORITY[field] || 50) + scoreAxisMatch(entry, primaryAxis) + scoreConcreteness(entry, field),
        });
      }
    }
  }

  if (!trustedSpecs || typeof trustedSpecs !== "object") {
    return candidates.sort((a, b) => b.score - a.score);
  }

  const normalizedSpecs = normalizeTrustedSpecsSemanticFields(trustedSpecs) || trustedSpecs;
  const { specs: humanizedSpecs } = applyDataLayerHumanizationGuard(normalizedSpecs);
  const safeSpecs = humanizedSpecs || normalizedSpecs;

  const fieldMap = [
    ["strengths", safeSpecs.strengths],
    ["market_notes", safeSpecs.market_notes],
    ["strategic_notes", safeSpecs.strategic_notes],
    ["notes", safeSpecs.notes],
    ["risk_notes", safeSpecs.risk_notes],
    ["ideal_for", safeSpecs.ideal_for],
  ];

  for (const [field, values] of fieldMap) {
    for (const entry of cleanList(values, 3)) {
      if (!entry || isGenericEvidence(entry) || isArtificialAttributeChain(entry)) continue;
      if (SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(entry))) continue;

      let safeEntry = entry;
      if (detectRawDataLayerTokenLeak(entry).leak) {
        const translated = translateTokenToStructuredConsequence(
          entry,
          field === "ideal_for"
            ? "ideal_for"
            : field === "weaknesses"
              ? "weakness"
              : field === "risk_notes"
                ? "risk"
                : "strength"
        );
        safeEntry = translated.consequence || "";
      } else {
        const sanitized = sanitizeDataLayerEvidenceText(entry);
        safeEntry = sanitized.ok && sanitized.text ? sanitized.text : entry;
      }

      if (!safeEntry || detectRawDataLayerTokenLeak(safeEntry).leak) continue;
      const concreteScore = scoreConcreteness(safeEntry, field);
      const minScore = field === "ideal_for" || field === "market_notes" ? 3 : 5;
      if (concreteScore < minScore && field !== "risk_notes" && field !== "market_notes") continue;

      candidates.push({
        text: safeEntry,
        field,
        source: "data_layer_humanized",
        score:
          (FIELD_PRIORITY[field] || 50) +
          scoreAxisMatch(safeEntry, primaryAxis) +
          concreteScore,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function selectEvidenceForDecision(candidates = [], context = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const existing = Array.isArray(context.existingParagraphs) ? context.existingParagraphs : [];

  for (const candidate of list) {
    if (overlapsExistingBlocks(candidate.text, existing)) continue;
    if (findInventedSpecViolations(candidate.text, context.allowedEvidence || "").length > 0) {
      continue;
    }
    return candidate;
  }

  for (const candidate of list) {
    if (findInventedSpecViolations(candidate.text, context.allowedEvidence || "").length > 0) {
      continue;
    }
    const normalized = normalizeForOverlap(candidate.text);
    if (
      existing.some((block) => normalizeForOverlap(block).includes(normalized)) &&
      normalized.length > 40
    ) {
      continue;
    }
    return candidate;
  }

  return null;
}

export function shouldApplyDataLayerEvidenceInjection(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") {
    return false;
  }

  if (input.intent === "comparison") return false;

  if (RECOVERY_INTERACTION_TYPES.has(input.sessionContext?.lastInteractionType)) {
    return false;
  }

  const product = input.product || {};
  const trustedSpecs = product.trustedSpecs || input.trustedSpecs || null;
  if (!trustedSpecs && input.structuredFacts?.mode !== "data_layer") {
    return false;
  }

  return !!trustedSpecs || input.structuredFacts?.mode === "data_layer";
}

function buildEvidenceParagraph(evidence = {}, context = {}) {
  const body = stripTrailingPeriod(evidence.text || "");
  if (!body) return "";

  const seed = `${context.query || ""}-${evidence.field || ""}-${context.primaryAxis || ""}`;
  const allowStrongOpener = context.allowStrongOpener !== false && evidence.allowStrongOpener !== false;

  if (!allowStrongOpener) {
    return capitalizeLead(pickVariant(CAUTIOUS_EVIDENCE_FRAMES, `${seed}-cautious`)(body));
  }

  const opener = pickVariant(EVIDENCE_OPENERS, seed);

  if (/^muitos acabam olhando s[oó] pre[cç]o/i.test(opener)) {
    return capitalizeLead(`${opener} ${lowercaseLead(body)}.`);
  }

  const frames = [
    (entry, lead) => `${lead} ${lowercaseLead(entry)}.`,
    (entry, lead) => `${lead} ${lowercaseLead(entry)} — e foi isso que pesou na escolha.`,
  ];

  return capitalizeLead(pickVariant(frames, `${seed}-frame`)(body, opener));
}

export function resolvePreferredDecisionReasonEvidence(input = {}) {
  const trustedSpecs = input.product?.trustedSpecs || input.trustedSpecs || null;
  const primaryAxis = cleanText(input.primaryAxis || input.searchCognition?.primaryAxis || "");
  const candidates = extractDataLayerEvidence(
    trustedSpecs,
    primaryAxis,
    input.structuredFacts || null
  );
  const guardResult = guardEvidenceSpecificity({
    evidenceCandidates: candidates,
    structuredFacts: input.structuredFacts || null,
    query: input.query || "",
    primaryAxis,
    querySignals: input.querySignals || {},
    winner: input.allowedEvidence || "",
  });
  const selected = selectGuardedEvidenceCandidate(guardResult, { primaryAxis });
  const text = selected?.evidenceText || candidates[0]?.text || "";
  if (!text || isGenericEvidence(text)) return "";
  return stripTrailingPeriod(text);
}

export function buildDataLayerEvidenceInjection(input = {}) {
  if (!shouldApplyDataLayerEvidenceInjection(input)) {
    return { ok: false, paragraph: "", evidence: null, error: "suppressed" };
  }

  const product = input.product || {};
  const trustedSpecs = product.trustedSpecs || input.trustedSpecs || null;
  const primaryAxis = cleanText(
    input.primaryAxis || input.searchCognition?.primaryAxis || input.activePriority || ""
  );
  const allowedEvidence =
    input.allowedEvidence ||
    input.structuredFacts?.allowedEvidence ||
    cleanText(product.trustedSpecs?.official_name || product.product_name || "");

  const candidates = extractDataLayerEvidence(
    trustedSpecs,
    primaryAxis,
    input.structuredFacts || null
  );

  const guardResult = guardEvidenceSpecificity({
    evidenceCandidates: candidates,
    structuredFacts: input.structuredFacts || null,
    sensations: input.sensations || [],
    experiences: input.experiences || [],
    frictions: input.frictions || [],
    ownershipExperiences: input.ownershipExperiences || [],
    authorityContract: input.authorityContract || null,
    query: input.query || "",
    primaryAxis,
    querySignals: input.querySignals || {},
    winner: allowedEvidence,
  });

  let selectedDiagnostic = selectGuardedEvidenceCandidate(guardResult, {
    existingParagraphs: input.existingParagraphs || [],
    primaryAxis,
  });

  let selected = selectedDiagnostic?.originalCandidate || null;

  if (!selected && input.semanticAllocationState) {
    const guardedCandidates = [
      ...(guardResult.acceptedEvidence || []),
      ...(guardResult.downgradedEvidence || []),
    ]
      .map((entry) => entry.originalCandidate)
      .filter(Boolean);
    selected = selectEvidenceCandidate(guardedCandidates, input.semanticAllocationState, {
      primaryAxis,
    });
    if (selected) {
      selectedDiagnostic =
        guardResult.specificityDiagnostics?.find(
          (entry) => entry.evidenceText === selected.text
        ) || null;
    }
  }

  if (!selected) {
    selected = selectEvidenceForDecision(
      (guardResult.acceptedEvidence || [])
        .concat(guardResult.downgradedEvidence || [])
        .map((entry) => entry.originalCandidate)
        .filter(Boolean),
      {
        existingParagraphs: input.existingParagraphs || [],
        allowedEvidence,
      }
    );
    if (selected) {
      selectedDiagnostic =
        guardResult.specificityDiagnostics?.find(
          (entry) => entry.evidenceText === selected.text
        ) || null;
    }
  }

  if (!selected) {
    return {
      ok: false,
      paragraph: "",
      evidence: null,
      error: "no_specific_evidence",
      specificityGuard: guardResult,
    };
  }

  if (selectedDiagnostic?.action === "omit") {
    return {
      ok: false,
      paragraph: "",
      evidence: selected,
      error: "omitted_generic_evidence",
      specificityGuard: guardResult,
    };
  }

  const paragraph = buildEvidenceParagraph(
    {
      ...selected,
      allowStrongOpener: selectedDiagnostic?.allowStrongOpener === true,
    },
    {
      query: input.query || "",
      primaryAxis,
      productName: cleanText(product.trustedSpecs?.official_name || product.product_name || ""),
      allowStrongOpener: selectedDiagnostic?.allowStrongOpener === true,
    }
  );

  const cleaned =
    cleanupMiaHumanLanguage(paragraph, {
      allowedEvidence,
      preserveStructure: true,
    }).text || paragraph;

  if (!cleaned || isGenericEvidence(cleaned)) {
    return { ok: false, paragraph: "", evidence: selected, error: "generic_evidence" };
  }

  if (SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return { ok: false, paragraph: "", evidence: selected, error: "spec_dump" };
  }

  if (BANNED_EVIDENCE_OPENERS.some((pattern) => pattern.test(cleaned))) {
    return { ok: false, paragraph: "", evidence: selected, error: "banned_opener" };
  }

  if (findInventedSpecViolations(cleaned, allowedEvidence).length > 0) {
    return { ok: false, paragraph: "", evidence: selected, error: "invented_evidence" };
  }

  if (!assertUserFacingDataLayerText(cleaned).ok) {
    return { ok: false, paragraph: "", evidence: selected, error: "raw_token_leak" };
  }

  return {
    ok: true,
    paragraph: cleaned,
    evidence: {
      ...selected,
      specificityClass: selectedDiagnostic?.specificityClass || "",
      specificityScore: selectedDiagnostic?.specificityScore || 0,
      action: selectedDiagnostic?.action || "accept",
      allowStrongOpener: selectedDiagnostic?.allowStrongOpener === true,
    },
    specificityGuard: guardResult,
    specificityDiagnostic: selectedDiagnostic,
    error: null,
  };
}

export function isEvidenceInjectionUseful(text = "") {
  const body = cleanText(text);
  if (!body || body.length < 50) return false;
  if (isGenericEvidence(body)) return false;
  if (BANNED_EVIDENCE_OPENERS.some((pattern) => pattern.test(body))) return false;

  return (
    EVIDENCE_MARKER_PATTERN.test(body) &&
    !SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(body))
  );
}

export function auditDataLayerEvidenceInjection(text = "", context = {}) {
  const flags = [];
  const body = cleanText(text);

  if (context.expectEvidence && !isEvidenceInjectionUseful(body)) {
    flags.push(EVIDENCE_INJECTION_FLAGS.MISSING_EVIDENCE_INJECTION);
  }

  if (body && isGenericEvidence(body)) {
    flags.push(EVIDENCE_INJECTION_FLAGS.GENERIC_EVIDENCE);
  }

  if (body && SPEC_DUMP_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(EVIDENCE_INJECTION_FLAGS.SPEC_DUMP);
  }

  if (body && GENERIC_EVIDENCE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(EVIDENCE_INJECTION_FLAGS.ABSTRACT_EVIDENCE);
  }

  if (body && BANNED_EVIDENCE_OPENERS.some((pattern) => pattern.test(body))) {
    flags.push(EVIDENCE_INJECTION_FLAGS.BANNED_EVIDENCE_OPENER);
  }

  if (findInventedSpecViolations(body, context.allowedEvidence || "").length > 0) {
    flags.push(EVIDENCE_INJECTION_FLAGS.INVENTED_EVIDENCE);
  }

  return flags;
}

export function extractEvidenceParagraphFromReply(reply = "") {
  const body = String(reply || "").trim();
  if (!body) return "";

  const chunks = body
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const fromParagraph = chunks.find(
    (chunk) =>
      isEvidenceInjectionUseful(chunk) &&
      !/^✅|^⚠️|^🏆|^👉/.test(chunk) &&
      !/\?\s*$/.test(chunk)
  );
  if (fromParagraph) return fromParagraph;

  const markerIndex = body.search(EVIDENCE_MARKER_PATTERN);
  if (markerIndex < 0) return "";

  const tail = body.slice(markerIndex);
  const stopPattern =
    /\s(?:Na prática,|Resumindo o que|Isso importa porque|O ponto principal|Se você seguir|Antes de fechar|✅|⚠️|🏆|👉)/;
  const stopAt = tail.search(stopPattern);
  let candidate = (stopAt > 0 ? tail.slice(0, stopAt) : tail).trim();

  if (candidate.length > 420) {
    const sentenceEnd = candidate.slice(0, 420).lastIndexOf(".");
    candidate =
      sentenceEnd > 80 ? candidate.slice(0, sentenceEnd + 1).trim() : candidate.slice(0, 420).trim();
  }

  if (isEvidenceInjectionUseful(candidate)) return candidate;

  const sentence = tail.match(/^[^.!?]+(?:[.!?]|—[^.!?]+[.!?])/)?.[0]?.trim() || "";
  return isEvidenceInjectionUseful(sentence) ? sentence : "";
}

export function buildDataLayerEvidenceInjectionAuditRecord(input = {}) {
  const built = buildDataLayerEvidenceInjection(input);
  const flags = auditDataLayerEvidenceInjection(built.paragraph, {
    expectEvidence: !!input.expectEvidence,
    allowedEvidence: input.allowedEvidence || "",
  });

  return {
    query: input.query || "",
    category: input.category || "",
    evidenceField: built.evidence?.field || "",
    evidenceSource: built.evidence?.source || "",
    evidenceInjected: built.ok,
    dataLayerEvidenceDetected: isEvidenceInjectionUseful(built.paragraph),
    genericEvidenceDetected: flags.includes(EVIDENCE_INJECTION_FLAGS.GENERIC_EVIDENCE),
    specDumpDetected: flags.includes(EVIDENCE_INJECTION_FLAGS.SPEC_DUMP),
    inventedEvidenceDetected: flags.includes(EVIDENCE_INJECTION_FLAGS.INVENTED_EVIDENCE),
    flags,
    paragraph: built.paragraph,
    ok: built.ok && flags.length === 0,
  };
}
