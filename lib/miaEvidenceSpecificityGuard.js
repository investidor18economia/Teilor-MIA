/**
 * PATCH 9.2X — Evidence Specificity Guard
 *
 * Governa candidatos de evidência: especificidade, rastreabilidade e utilidade decisória.
 * Sem copy, templates ou hardcode por categoria.
 */

import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";
import { inferSemanticFamilyFromText } from "./miaSemanticFamilyAllocationEngine.js";

export const EVIDENCE_SPECIFICITY_GUARD_VERSION = "9.2X.1";

export const SPECIFICITY_CLASSES = Object.freeze([
  "specific_consequence",
  "specific_sensation",
  "specific_experience",
  "specific_friction",
  "specific_ownership",
  "specific_authority",
  "generic_note",
  "generic_axis_frame",
  "unsupported_claim",
  "interchangeable_phrase",
  "fallback_cautious",
]);

export const EVIDENCE_ACTIONS = Object.freeze(["accept", "downgrade", "omit"]);

const GENERIC_INTERCHANGEABLE_PATTERNS = Object.freeze([
  /um detalhe pr[aá]tico que ajuda a calibrar a expectativa/i,
  /algo que pesa mais do que parece/i,
  /combina com o perfil de uso descrito/i,
  /[eé] um ponto importante na compara[cç][aã]o/i,
  /ganho percept[ií]vel no uso real/i,
  /ren[uú]ncia percept[ií]vel/i,
  /funciona melhor para esse perfil/i,
  /experi[eê]ncia equilibrada/i,
  /uso cotidiano mais previs[ií]vel/i,
  /oferece mais tranquilidade no uso di[aá]rio/i,
  /menos sensa[cç][aã]o de limite/i,
  /tende a ajudar/i,
  /funciona bem para\b/i,
  /generic\.note\.default/i,
]);

const NOTE_FIELDS = new Set(["notes", "market_notes", "strategic_notes"]);

const AXIS_HINTS = Object.freeze({
  camera: /\b(c[aâ]mera|foto|fotos|v[ií]deo|noturn|selfie|registrar)\b/i,
  battery: /\b(bateria|autonomia|carreg|tomada|carga)\b/i,
  longevity: /\b(atualiza|anos|durar|longev|suporte|software|ficar v[aá]rios)\b/i,
  performance: /\b(desempenho|performance|jogo|multitarefa|fluid|rapidez|processador)\b/i,
  screen: /\b(tela|display|painel|visual|hz|fluidez|imagem|streaming|filmes|s[eé]ries)\b/i,
  value: /\b(pre[cç]o|custo|barato|econom|or[cç]amento)\b/i,
  comfort: /\b(conforto|ergonom|assento|suporte)\b/i,
  storage: /\b(armazen|gb|espa[cç]o|arquivo)\b/i,
});

const INSIGHT_LIKE_PATTERNS = Object.freeze([
  /costuma pesar mais/i,
  /tende a pesar/i,
  /na pr[aá]tica, isso pesa/i,
  /isso costuma importar/i,
]);

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

export function isGenericInterchangeableEvidence(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  if (isGenericInsightBody(body)) return true;
  return GENERIC_INTERCHANGEABLE_PATTERNS.some((pattern) => pattern.test(body));
}

function collectConsequences(structuredFacts = {}) {
  const buckets = [
    structuredFacts.strengthConsequences,
    structuredFacts.noteConsequences,
    structuredFacts.riskConsequences,
    structuredFacts.idealForConsequences,
    structuredFacts.microConsequences,
    structuredFacts.weaknessConsequences,
  ];
  const list = [];
  for (const bucket of buckets) {
    if (!bucket) continue;
    const values = Array.isArray(bucket) ? bucket : [bucket];
    for (const entry of values) {
      const text = cleanText(typeof entry === "string" ? entry : entry?.text || "");
      if (text) list.push(text);
    }
  }
  return list;
}

function findCognitiveAnchor(text = "", layers = {}) {
  const key = normalizeKey(text);
  if (!key) return null;

  const matchIn = (items = [], type = "") => {
    for (const item of items) {
      const haystack = normalizeKey(
        `${item.consequence || ""} ${item.sensation || ""} ${item.experience || ""} ${item.friction || ""} ${item.ownershipMeaning || ""} ${item.authorityReason || ""} ${item.text || ""}`
      );
      const source = normalizeKey(
        item.sourceConsequence || item.consequence || item.text || item.sensation || ""
      );
      if (source && (key.includes(source.slice(0, 24)) || source.includes(key.slice(0, 24)))) {
        return { type, item };
      }
      if (haystack && (haystack.includes(key.slice(0, 20)) || key.includes(haystack.slice(0, 20)))) {
        return { type, item };
      }
    }
    return null;
  };

  return (
    matchIn(layers.sensations, "sensation") ||
    matchIn(layers.experiences, "experience") ||
    matchIn(layers.frictions, "friction") ||
    matchIn(layers.ownershipExperiences, "ownership") ||
    (layers.authorityContract?.closingAuthority
      ? matchIn([layers.authorityContract.closingAuthority], "authority")
      : null)
  );
}

function findConsequenceAnchor(text = "", consequences = []) {
  const key = normalizeKey(text);
  for (const consequence of consequences) {
    const cKey = normalizeKey(consequence);
    if (!cKey) continue;
    if (key.includes(cKey.slice(0, 28)) || cKey.includes(key.slice(0, 28))) {
      return consequence;
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} context
 */
export function calculateDecisionSupportScore(text = "", context = {}) {
  const body = cleanText(text);
  const primaryAxis = cleanText(context.primaryAxis || "");
  const query = cleanText(context.query || "");
  const querySignals = context.querySignals || {};
  let score = 0.42;

  if (primaryAxis && AXIS_HINTS[primaryAxis]?.test(body)) score += 0.28;
  if (primaryAxis && AXIS_HINTS[primaryAxis]?.test(query)) {
    const family = inferSemanticFamilyFromText(body, { primaryAxis });
    if (family && family !== "generic_fit") score += 0.12;
  }

  if (querySignals.priceSensitive && /\b(pre[cç]o|custo|econom|barato)\b/i.test(body)) {
    score += 0.1;
  }
  if (querySignals.technical && /\b(hz|processador|gpu|ram|mp|mah)\b/i.test(body)) {
    score += 0.08;
  }

  const words = body.split(/\s+/).filter(Boolean);
  if (words.length >= 8) score += 0.08;
  if (/\b(ainda|mesmo|continua|recebe|noturn|carregador|atualiza|multitarefa|streaming)\b/i.test(body)) {
    score += 0.1;
  }

  if (primaryAxis && AXIS_HINTS[primaryAxis] && !AXIS_HINTS[primaryAxis].test(body)) {
    const axisFamilies = {
      battery: /c[aâ]mera|foto|tela|hz|display/i,
      camera: /bateria|autonomia|tomada/i,
      screen: /bateria|autonomia|c[aâ]mera noturn/i,
    };
    if (axisFamilies[primaryAxis]?.test(body)) score -= 0.22;
  }

  return clamp01(score);
}

/**
 * @param {Record<string, unknown>} candidate
 * @param {Record<string, unknown>} context
 */
export function calculateGenericityRisk(candidate = {}, context = {}) {
  const text = cleanText(candidate.evidenceText || candidate.text || "");
  let risk = 0.35;

  if (isGenericInterchangeableEvidence(text)) risk = 0.95;
  if (isGenericInsightBody(text)) risk = Math.max(risk, 0.9);
  if (INSIGHT_LIKE_PATTERNS.some((pattern) => pattern.test(text))) risk = Math.max(risk, 0.85);

  const field = cleanText(candidate.field || candidate.source || "");
  if (NOTE_FIELDS.has(field) && candidate.source !== "consequence_translation") {
    risk += 0.2;
  }
  if (!candidate.token && NOTE_FIELDS.has(field)) risk += 0.15;
  if (candidate.source === "consequence_translation") risk -= 0.25;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 5) risk += 0.15;
  if (words.length >= 10 && /\b(ainda|mesmo|continua|recebe|noturn|atualiza)\b/i.test(text)) {
    risk -= 0.12;
  }

  if (!context.hasDataLayer) risk += 0.2;

  return clamp01(risk);
}

/**
 * @param {Record<string, unknown>} candidate
 * @param {Record<string, unknown>} anchor
 */
export function calculateTraceabilityScore(candidate = {}, anchor = null) {
  if (!anchor) return 0.2;
  let score = 0.45;

  if (anchor.consequence) score += 0.2;
  if (anchor.sensation || anchor.type === "sensation") score += 0.15;
  if (anchor.experience || anchor.type === "experience") score += 0.12;
  if (anchor.friction || anchor.type === "friction") score += 0.1;
  if (anchor.ownership || anchor.type === "ownership") score += 0.1;
  if (anchor.token) score += 0.08;
  if (candidate.source === "consequence_translation") score += 0.15;

  return clamp01(score);
}

function classifySpecificityClass(candidate = {}, anchor = null, genericityRisk = 0) {
  if (genericityRisk >= 0.85) {
    return isGenericInterchangeableEvidence(candidate.text || "")
      ? "interchangeable_phrase"
      : "generic_note";
  }
  if (!anchor) {
    if (candidate.source === "consequence_translation") return "specific_consequence";
    return genericityRisk >= 0.6 ? "unsupported_claim" : "generic_axis_frame";
  }
  if (anchor.type === "sensation") return "specific_sensation";
  if (anchor.type === "experience") return "specific_experience";
  if (anchor.type === "friction") return "specific_friction";
  if (anchor.type === "ownership") return "specific_ownership";
  if (anchor.type === "authority") return "specific_authority";
  if (anchor.consequence) return "specific_consequence";
  return "specific_consequence";
}

function determineEvidenceAction({
  specificityScore,
  traceabilityScore,
  decisionSupportScore,
  genericityRisk,
  specificityClass,
  hasDataLayer,
}) {
  if (
    specificityClass === "interchangeable_phrase" ||
    specificityClass === "unsupported_claim" ||
    genericityRisk >= 0.88
  ) {
    return "omit";
  }

  if (specificityClass === "specific_consequence" && genericityRisk < 0.65) {
    return "accept";
  }

  if (
    traceabilityScore >= 0.5 &&
    decisionSupportScore >= 0.45 &&
    genericityRisk < 0.55
  ) {
    return "accept";
  }

  if (!hasDataLayer) {
    if (genericityRisk < 0.7 && decisionSupportScore >= 0.4) {
      return "downgrade";
    }
    return "omit";
  }

  if (specificityScore >= 0.48 && genericityRisk < 0.72) {
    return "downgrade";
  }

  return "omit";
}

function buildDiagnostic(candidate = {}, context = {}, layers = {}) {
  const evidenceText = cleanText(candidate.text || candidate.evidenceText || "");
  const consequences = collectConsequences(context.structuredFacts || {});
  const consequenceAnchor = findConsequenceAnchor(evidenceText, consequences);
  const cognitiveAnchor = findCognitiveAnchor(evidenceText, layers);

  const anchor = cognitiveAnchor
    ? {
        type: cognitiveAnchor.type,
        consequence:
          cognitiveAnchor.item?.sourceConsequence ||
          cognitiveAnchor.item?.consequence ||
          consequenceAnchor ||
          "",
        sensation: cognitiveAnchor.item?.sensation || "",
        experience: cognitiveAnchor.item?.experience || "",
        friction: cognitiveAnchor.item?.friction || "",
        ownership: cognitiveAnchor.item?.ownershipMeaning || "",
        token:
          cognitiveAnchor.item?.sourceToken ||
          cognitiveAnchor.item?.token ||
          candidate.token ||
          "",
      }
    : consequenceAnchor
      ? { type: "consequence", consequence: consequenceAnchor, token: candidate.token || "" }
      : null;

  const genericityRisk = calculateGenericityRisk(
    { ...candidate, evidenceText },
    context
  );
  const decisionSupportScore = calculateDecisionSupportScore(evidenceText, context);
  const traceabilityScore = calculateTraceabilityScore(
    { ...candidate, evidenceText },
    anchor
  );
  const specificityClass = classifySpecificityClass(
    { ...candidate, evidenceText },
    anchor,
    genericityRisk
  );

  let specificityScore = clamp01(
    (1 - genericityRisk) * 0.35 +
      traceabilityScore * 0.3 +
      decisionSupportScore * 0.25 +
      (candidate.source === "consequence_translation" ? 0.1 : 0)
  );

  if (specificityClass.startsWith("specific_")) specificityScore = Math.max(specificityScore, 0.55);
  if (
    candidate.source === "consequence_translation" &&
    anchor?.consequence &&
    genericityRisk < 0.65
  ) {
    specificityScore = Math.max(specificityScore, 0.72);
  }

  const action = determineEvidenceAction({
    specificityScore,
    traceabilityScore,
    decisionSupportScore,
    genericityRisk,
    specificityClass,
    hasDataLayer: context.hasDataLayer !== false,
  });

  const sourceFamily =
    candidate.family ||
    inferSemanticFamilyFromText(evidenceText, {
      primaryAxis: context.primaryAxis,
      token: anchor?.token,
    });

  let reason = "";
  if (action === "accept") reason = "específica, rastreável e útil para a decisão";
  else if (action === "downgrade") {
    if (genericityRisk >= 0.55) reason = "risco genérico — fallback cauteloso";
    else if (decisionSupportScore < 0.45) reason = "baixo suporte decisório para o eixo atual";
    else reason = "rastreabilidade parcial — rebaixar sem opener forte";
  } else if (genericityRisk >= 0.85) reason = "frase intercambiável — omitir";
  else if (!anchor) reason = "sem ancoragem rastreável — omitir";
  else reason = "especificidade insuficiente — omitir";

  return {
    evidenceText,
    source: candidate.source || candidate.field || "unknown",
    sourceFamily,
    specificityClass: action === "downgrade" && !context.hasDataLayer ? "fallback_cautious" : specificityClass,
    specificityScore,
    traceabilityScore,
    decisionSupportScore,
    genericityRisk,
    action,
    reason,
    token: anchor?.token || candidate.token || "",
    trace: anchor
      ? {
          token: anchor.token || null,
          consequence: anchor.consequence || "",
          sensation: anchor.sensation || "",
          experience: anchor.experience || "",
          friction: anchor.friction || "",
          ownership: anchor.ownership || "",
        }
      : null,
    allowStrongOpener: action === "accept" && specificityScore >= 0.62 && genericityRisk < 0.5,
    originalCandidate: candidate,
  };
}

/**
 * @param {{
 *   evidenceCandidates?: Array<Record<string, unknown>>,
 *   structuredFacts?: Record<string, unknown>,
 *   consequences?: string[],
 *   sensations?: Array<Record<string, unknown>>,
 *   experiences?: Array<Record<string, unknown>>,
 *   frictions?: Array<Record<string, unknown>>,
 *   ownershipExperiences?: Array<Record<string, unknown>>,
 *   authorityContract?: Record<string, unknown>,
 *   context?: Record<string, unknown>,
 *   winner?: string,
 *   query?: string,
 *   primaryAxis?: string,
 *   querySignals?: Record<string, unknown>,
 * }} input
 */
export function guardEvidenceSpecificity(input = {}) {
  const candidates = input.evidenceCandidates || [];
  const ctx = {
    ...(input.context || {}),
    structuredFacts: input.structuredFacts || input.context?.structuredFacts || null,
    primaryAxis: cleanText(input.primaryAxis || input.context?.primaryAxis || ""),
    query: cleanText(input.query || input.context?.query || ""),
    querySignals: input.querySignals || input.context?.querySignals || {},
    hasDataLayer: input.structuredFacts?.mode === "data_layer" || input.context?.hasDataLayer,
    winner: cleanText(input.winner || input.context?.winner || ""),
  };

  const layers = {
    sensations: input.sensations || input.context?.sensations || [],
    experiences: input.experiences || input.context?.experiences || [],
    frictions: input.frictions || input.context?.frictions || [],
    ownershipExperiences: input.ownershipExperiences || input.context?.ownershipExperiences || [],
    authorityContract: input.authorityContract || input.context?.authorityContract || null,
  };

  const specificityDiagnostics = candidates.map((candidate) =>
    buildDiagnostic(candidate, ctx, layers)
  );

  const acceptedEvidence = specificityDiagnostics.filter((entry) => entry.action === "accept");
  const downgradedEvidence = specificityDiagnostics.filter((entry) => entry.action === "downgrade");
  const rejectedEvidence = specificityDiagnostics.filter((entry) => entry.action === "omit");

  return {
    ok: acceptedEvidence.length > 0 || downgradedEvidence.length > 0,
    acceptedEvidence,
    rejectedEvidence,
    downgradedEvidence,
    specificityDiagnostics,
    version: EVIDENCE_SPECIFICITY_GUARD_VERSION,
  };
}

/**
 * @param {ReturnType<typeof guardEvidenceSpecificity>} guardResult
 */
export function selectGuardedEvidenceCandidate(guardResult = {}, context = {}) {
  const ranked = [
    ...(guardResult.acceptedEvidence || []),
    ...(guardResult.downgradedEvidence || []),
  ].sort((a, b) => {
    const aScore = a.specificityScore * 0.5 + a.decisionSupportScore * 0.35 - a.genericityRisk * 0.15;
    const bScore = b.specificityScore * 0.5 + b.decisionSupportScore * 0.35 - b.genericityRisk * 0.15;
    return bScore - aScore;
  });

  const existing = context.existingParagraphs || [];
  for (const diagnostic of ranked) {
    const text = diagnostic.evidenceText;
    const overlaps = existing.some((block) => {
      const a = normalizeKey(block);
      const b = normalizeKey(text);
      return a.includes(b) || b.includes(a);
    });
    if (!overlaps) {
      return diagnostic;
    }
  }

  return ranked[0] || null;
}

export function isEvidenceSpecificityAcceptable(diagnostic = {}) {
  return (
    diagnostic.action === "accept" &&
    diagnostic.specificityScore >= 0.62 &&
    diagnostic.genericityRisk < 0.55 &&
    !isGenericInterchangeableEvidence(diagnostic.evidenceText || "")
  );
}

export function classifyEvidenceSpecificityOrigin(diagnostic = {}) {
  if (!diagnostic) return "unsupported";
  if (diagnostic.action === "omit") return "omitted";
  if (isEvidenceSpecificityAcceptable(diagnostic)) return "specific";
  if (diagnostic.action === "downgrade") return "downgraded";
  if (diagnostic.specificityClass === "interchangeable_phrase") return "generic";
  return "unsupported";
}
