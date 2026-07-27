/**
 * PATCH 4A.7V — Verbalization Composition Guard (absolute claim governance)
 *
 * Systemic guard against broken concessions, semantic slot duplication,
 * internal label leakage, invalid concatenation, and absolute claims.
 * Does not alter facts, ranking, winner, or decision content.
 */

import { rewriteConsequenceForSpeech } from "./miaVerbalizationStyleGovernor.js";
import {
  ABSOLUTE_CLAIM_GOVERNANCE_VERSION,
  detectAbsoluteClaimsOnSurface,
  governAbsoluteClaimsOnSurface,
} from "./miaAbsoluteClaimGovernance.js";

export const VERBALIZATION_COMPOSITION_GUARD_VERSION = "4A.7V.0";
export { ABSOLUTE_CLAIM_GOVERNANCE_VERSION };

const NEUTRAL_SACRIFICE =
  "O ponto de atenção é confirmar preço, garantia e condição da oferta antes de decidir.";

const INTERNAL_LABELS = Object.freeze(
  new Set([
    "pesado",
    "leve",
    "rapido",
    "rápido",
    "lento",
    "premium",
    "intermediario",
    "intermediário",
    "basico",
    "básico",
    "medio",
    "médio",
  ])
);

const INTERNAL_LABEL_SPEECH = Object.freeze({
  pesado: "o peso pode pesar mais no uso prolongado",
  leve: "o aparelho tende a ser mais leve no dia a dia",
  rapido: "o desempenho tende a ser mais ágil",
  rápido: "o desempenho tende a ser mais ágil",
  lento: "o ritmo pode parecer mais lento em tarefas exigentes",
  premium: "o posicionamento fica mais premium",
  intermediario: "a faixa fica mais intermediária",
  intermediário: "a faixa fica mais intermediária",
  basico: "a proposta fica mais básica",
  básico: "a proposta fica mais básica",
  medio: "a proposta fica na faixa média",
  médio: "a proposta fica na faixa média",
});

const BROKEN_CONCESSION_PATTERNS = Object.freeze([
  /\bmesmo com\s+(?:pode|vale|é|são|tem|abre|ganha|considerar|existir|parece|saber)\s+/i,
  /\bmesmo\s+saber\s+que\b/i,
  /\bmesmo\s+existir\b/i,
  /\bmesmo\s+parece\b/i,
  /\bmesmo\s+vale\b/i,
  /\bmesmo tendo\s+(?:pode|vale)\s+/i,
  /\bapesar de\s+(?:pode|vale)\s+/i,
]);

const BROKEN_FRAGMENT_PATTERNS = Object.freeze([
  /\bporque\s+(?:menos|mais)\s+[a-záàâãéêíóôõúç]/i,
  /\bporque\s+(?:câmera|tela|bateria|desempenho|carregamento|visual|autonomia)\s+(?:boa|bom|fluida|forte|alta|lento|melhor|confortável)/i,
]);

const SEMANTIC_AXES = Object.freeze([
  {
    key: "autonomia",
    patterns: [/autonomia/i, /bateria/i, /carregador/i, /energia/i, /carga/i],
  },
  {
    key: "desempenho",
    patterns: [/desempenho/i, /fluid[oa]/i, /performance/i, /rapidez/i, /lentid/i],
  },
  {
    key: "camera",
    patterns: [/c[aâ]mera/i, /foto/i, /video/i, /v[ií]deo/i],
  },
  {
    key: "visual",
    patterns: [/visual/i, /tela/i, /display/i, /brilho/i],
  },
  {
    key: "preco",
    patterns: [/pre[cç]o/i, /custo/i, /or[cç]amento/i, /barato/i, /caro/i],
  },
]);

const STUB_CONTINUATION =
  /^(?:claro,?\s*(?:sigo aqui|posso continuar|vamos l[aá]|vamos continuar|vamos em frente)|vamos continuar|pode continuar)[!.]?$/i;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeFingerprint(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value = "") {
  const fp = normalizeFingerprint(value);
  if (!fp) return new Set();
  return new Set(fp.split(" ").filter((t) => t.length >= 4));
}

function overlapRatio(a = "", b = "") {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared += 1;
  }
  return shared / Math.min(setA.size, setB.size);
}

function simpleHash(value = "") {
  let hash = 0;
  const body = String(value || "");
  for (let i = 0; i < body.length; i += 1) {
    hash = (hash * 31 + body.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function detectSemanticAxes(text = "") {
  const body = cleanText(text);
  const hits = [];
  for (const axis of SEMANTIC_AXES) {
    if (axis.patterns.some((pattern) => pattern.test(body))) hits.push(axis.key);
  }
  return hits;
}

function countSemanticAxisRepeats(text = "") {
  const body = cleanText(text);
  const counts = {};
  for (const axis of SEMANTIC_AXES) {
    let total = 0;
    for (const pattern of axis.patterns) {
      total += (body.match(pattern) || []).length;
    }
    if (total > 0) counts[axis.key] = total;
  }
  return counts;
}

/**
 * @returns {{ used: Set<string>, claims: Array<{ role: string, text: string, fingerprint: string }> }}
 */
export function createCompositionLedger() {
  return { used: new Set(), claims: [], axes: new Set() };
}

/**
 * @param {{ used: Set<string>, claims: Array, axes?: Set<string> }} ledger
 * @param {string} text
 * @param {string} role
 * @param {{ allowNearDuplicate?: boolean, threshold?: number, trackAxis?: boolean }} [options]
 */
export function claimSemanticSlot(ledger, text = "", role = "", options = {}) {
  const body = cleanText(text);
  const fingerprint = normalizeFingerprint(body);
  if (!fingerprint) return { claimed: false, text: body, fingerprint: "", duplicate: false };

  const threshold = options.threshold ?? 0.72;
  for (const existing of ledger.used) {
    if (existing === fingerprint) {
      return { claimed: false, text: body, fingerprint, duplicate: true };
    }
    if (!options.allowNearDuplicate && overlapRatio(existing, fingerprint) >= threshold) {
      return { claimed: false, text: body, fingerprint, duplicate: true };
    }
  }

  if (options.trackAxis !== false && ledger.axes) {
    for (const axis of detectSemanticAxes(body)) {
      if (ledger.axes.has(axis) && !options.allowNearDuplicate) {
        return { claimed: false, text: body, fingerprint, duplicate: true, axisDuplicate: axis };
      }
    }
    for (const axis of detectSemanticAxes(body)) ledger.axes.add(axis);
  }

  ledger.used.add(fingerprint);
  ledger.claims.push({ role, text: body, fingerprint });
  return { claimed: true, text: body, fingerprint, duplicate: false };
}

/**
 * Pick first gain whose semantic fingerprint is not yet claimed.
 * @param {string[]} gains
 * @param {{ used: Set<string> }} ledger
 * @param {number} [startIndex]
 */
export function pickUnusedGain(gains = [], ledger = null, startIndex = 0) {
  const list = (Array.isArray(gains) ? gains : []).map((g) => cleanText(g)).filter(Boolean);
  for (let i = startIndex; i < list.length; i += 1) {
    const candidate = rewriteConsequenceForSpeech(list[i].replace(/\.$/, ""));
    if (!ledger) return candidate;
    const claim = claimSemanticSlot(ledger, candidate, `gain_${i}`, { allowNearDuplicate: false });
    if (claim.claimed) return candidate;
  }
  return "";
}

/**
 * Maps tradeoff text to a grammatically valid inner clause (gerund-led when needed).
 * @param {string} tradeoff
 */
export function formatConcessionPhrase(tradeoff = "") {
  const raw = cleanText(tradeoff);
  if (!raw || raw === NEUTRAL_SACRIFICE) return "esse ponto de atenção";

  if (/^o ponto de atenção (?:é|seria)\s/i.test(raw)) {
    return raw.replace(/^o ponto de atenção (?:é|seria)\s*/i, "esse ponto de atenção: ").replace(/\.$/, "");
  }

  if (/^pode\s+/i.test(raw)) {
    return `sabendo que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  if (/^vale\s+/i.test(raw)) {
    return `considerando que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  if (/^exist(?:e|ir)\s+/i.test(raw)) {
    return `reconhecendo que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  if (/^parece\s+/i.test(raw)) {
    return `sabendo que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  if (/^(?:é|são|tem|abre|ganha)\s/i.test(raw)) {
    return `reconhecendo que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  if (/^considerar\s+/i.test(raw)) {
    return `considerando ${raw.replace(/^considerar\s+/i, "").replace(/\.$/, "")}`;
  }

  return `considerando que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
}

/**
 * Contextual concession opener — rotates valid templates by seed.
 * @param {string} tradeoff
 * @param {string} [seed]
 */
export function formatContextualConcessionOpening(tradeoff = "", seed = "") {
  const raw = cleanText(tradeoff);
  const hash = simpleHash(`${seed}|${raw}`);

  if (/^pode\s+/i.test(raw)) {
    const rest = raw.replace(/^pode\s+/i, "").replace(/\.$/, "");
    const variants = [
      `Mesmo sabendo que pode ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`,
      `Embora possa ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`,
      `Ainda que possa ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`,
    ];
    return variants[hash % variants.length];
  }

  if (/^vale\s+/i.test(raw)) {
    const body = raw.charAt(0).toLowerCase() + raw.slice(1).replace(/\.$/, "");
    const variants = [
      `Mesmo considerando que ${body}`,
      `Ainda que ${body}`,
      `Mesmo reconhecendo que ${body}`,
    ];
    return variants[hash % variants.length];
  }

  const clause = formatConcessionPhrase(raw);
  if (/^sabendo que/i.test(clause)) return `Mesmo ${clause}`;
  if (/^considerando/i.test(clause)) return `Mesmo ${clause}`;
  if (/^reconhecendo que/i.test(clause)) return `Mesmo ${clause}`;
  return `Mesmo considerando ${clause}`;
}

/**
 * @param {{ winner: string, tradeoff: string, reason: string, ledger?: { used: Set<string> }|null, seed?: string }} input
 */
export function buildMesmoComClosing({
  winner = "",
  tradeoff = "",
  reason = "",
  ledger = null,
  seed = "",
} = {}) {
  const w = cleanText(winner);
  if (!w) return "";

  let reasonText = rewriteConsequenceForSpeech(cleanText(reason).replace(/\.$/, ""));
  if (ledger) {
    const claim = claimSemanticSlot(ledger, reasonText, "closing_reason", {
      allowNearDuplicate: true,
      threshold: 0.85,
    });
    if (!claim.claimed && claim.duplicate) {
      reasonText = "o ganho principal ainda pesa mais do que essa renúncia";
    }
  }

  const opening = formatContextualConcessionOpening(tradeoff, seed || w);
  const reasonBody = reasonText.charAt(0).toLowerCase() + reasonText.slice(1).replace(/\.$/, "");
  return `${opening}, eu manteria o ${w} — ${reasonBody}.`;
}

/**
 * Remove gain bullets that duplicate already-claimed semantic slots.
 * @param {string[]} gains
 * @param {{ used: Set<string> }} ledger
 */
export function dedupeGainBullets(gains = [], ledger = null) {
  const list = (Array.isArray(gains) ? gains : []).map((g) => cleanText(g)).filter(Boolean);
  if (!ledger) return list;

  const output = [];
  for (const gain of list) {
    const rewritten = rewriteConsequenceForSpeech(gain.replace(/\.$/, ""));
    const fp = normalizeFingerprint(rewritten);
    let duplicate = false;
    for (const existing of ledger.used) {
      if (existing === fp || overlapRatio(existing, fp) >= 0.72) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      for (const axis of detectSemanticAxes(rewritten)) {
        if (ledger.axes?.has(axis)) {
          duplicate = true;
          break;
        }
      }
    }
    if (!duplicate) {
      output.push(rewritten);
      ledger.used.add(fp);
      ledger.claims.push({ role: "gain_bullet", text: rewritten, fingerprint: fp });
      for (const axis of detectSemanticAxes(rewritten)) ledger.axes?.add(axis);
    }
  }
  return output.length ? output : list.slice(0, 1);
}

/**
 * Skip or trim comparative paragraph when it repeats opening semantics.
 * @param {string} comparativeParagraph
 * @param {string} openingGain
 */
export function guardComparativeParagraph(comparativeParagraph = "", openingGain = "") {
  const paragraph = cleanText(comparativeParagraph);
  const opening = cleanText(openingGain);
  if (!paragraph || !opening) return paragraph;

  const openingAxes = detectSemanticAxes(opening);
  const paragraphAxes = detectSemanticAxes(paragraph);
  const sharedAxis = openingAxes.some((axis) => paragraphAxes.includes(axis));

  if (overlapRatio(paragraph, opening) >= 0.55 || sharedAxis) {
    const runnerOnly = paragraph.split(/[.!?]/)[0]?.trim();
    if (runnerOnly && overlapRatio(runnerOnly, opening) < 0.55 && !detectSemanticAxes(runnerOnly).some((a) => openingAxes.includes(a))) {
      return `${runnerOnly}.`;
    }
    return "";
  }
  return paragraph;
}

function isStandaloneInternalLabel(text = "", label = "") {
  const body = cleanText(text);
  if (!body) return false;

  if (new RegExp(`^pode pesar na decis[aã]o:\\s*${label}\\s*[.!?]?$`, "i").test(body)) return true;
  if (new RegExp(`^[•\\-*]?\\s*${label}\\s*[.!?]?$`, "i").test(body)) return true;
  if (new RegExp(`^:\\s*${label}\\s*[.!?]?$`, "i").test(body)) return true;
  if (body.toLowerCase() === label.toLowerCase()) return true;

  return false;
}

/**
 * @param {string} text
 */
export function detectInternalLabelLeakage(text = "") {
  const normalized = cleanText(text);
  if (!normalized) return { detected: false, labels: [] };

  const labels = [];
  if (
    /\bpode pesar na decis[aã]o:\s*(pesado|leve|r[aá]pido|lento|premium|intermedi[aá]rio|b[aá]sico|m[eé]dio)\b/i.test(
      normalized
    )
  ) {
    labels.push("sacrifice_label_leak");
  }

  const segments = normalized.split(/(?=[•⚠️✅])|[\n•]/).map((s) => cleanText(s)).filter(Boolean);
  for (const segment of segments.length ? segments : [normalized]) {
    for (const label of INTERNAL_LABELS) {
      if (isStandaloneInternalLabel(segment, label)) labels.push(label);
    }
  }

  return { detected: labels.length > 0, labels: [...new Set(labels)], text: normalized };
}

/**
 * @param {string} text
 */
export function sanitizeInternalLabelText(text = "") {
  let body = cleanText(text);
  if (!body) return body;

  body = body.replace(
    /\bpode pesar na decis[aã]o:\s*(pesado|leve|r[aá]pido|lento|premium|intermedi[aá]rio|b[aá]sico|m[eé]dio)\b/gi,
    (_, label) => INTERNAL_LABEL_SPEECH[label.toLowerCase()] || "esse ponto pode pesar na decisão"
  );

  const words = body.split(/\s+/);
  if (words.length === 1 && INTERNAL_LABELS.has(words[0].toLowerCase())) {
    return INTERNAL_LABEL_SPEECH[words[0].toLowerCase()] || body;
  }

  return body;
}

/**
 * @param {string} text
 */
export function detectInvalidConcessionGrammar(text = "") {
  const normalized = cleanText(text);
  if (!normalized) return { detected: false, reasons: [] };
  const reasons = [];
  for (const pattern of BROKEN_CONCESSION_PATTERNS) {
    if (pattern.test(normalized)) reasons.push("broken_concession");
  }
  return { detected: reasons.length > 0, reasons, text: normalized };
}

/**
 * @param {string} text
 */
export function detectBrokenSurfaceGrammar(text = "") {
  const normalized = cleanText(text);
  if (!normalized) return { detected: false, reasons: [] };
  const reasons = [];
  if (detectInvalidConcessionGrammar(normalized).detected) reasons.push("broken_concession");
  for (const pattern of BROKEN_FRAGMENT_PATTERNS) {
    if (pattern.test(normalized)) reasons.push("artificial_fragment");
  }
  if (/\bmesmo com\s+[,.]/i.test(normalized)) reasons.push("orphan_connector");
  if (detectInternalLabelLeakage(normalized).detected) reasons.push("internal_label_leak");
  if (detectAbsoluteClaimsOnSurface(normalized).detected) reasons.push("absolute_claim");
  return { detected: reasons.length > 0, reasons, text: normalized };
}

/**
 * Objective repetition metrics for audit.
 * @param {string} text
 */
export function computeRepetitionMetrics(text = "") {
  const body = cleanText(text);
  if (!body) {
    return {
      lexicalRepetitionRatio: 0,
      structuralFrameCounts: {},
      semanticAxisCounts: {},
      duplicateSentenceCount: 0,
      dominantPhraseRepeats: 0,
      pass: true,
    };
  }

  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => cleanText(s))
    .filter((s) => s.length >= 12);

  const sentenceFps = sentences.map((s) => normalizeFingerprint(s));
  const seen = new Set();
  let duplicateSentenceCount = 0;
  for (const fp of sentenceFps) {
    if (seen.has(fp)) duplicateSentenceCount += 1;
    seen.add(fp);
  }

  const words = body.toLowerCase().split(/\s+/).filter((w) => w.length >= 5);
  const freq = new Map();
  for (const word of words) freq.set(word, (freq.get(word) || 0) + 1);
  const repeatedWords = [...freq.values()].filter((c) => c >= 4).length;
  const lexicalRepetitionRatio = words.length ? repeatedWords / words.length : 0;

  const frames = {
    mesmoCom: (body.match(/\bmesmo com\b/gi) || []).length,
    naPratica: (body.match(/\bna prática\b/gi) || []).length,
    porOutroLado: (body.match(/\bpor outro lado\b/gi) || []).length,
    porque: (body.match(/\bporque\b/gi) || []).length,
    autonomia: (body.match(/\bautonomia\b/gi) || []).length,
  };

  const semanticAxisCounts = countSemanticAxisRepeats(body);
  const excessiveAxis = Object.values(semanticAxisCounts).some((count) => count >= 4);

  const phraseChunks = body.match(/[^.!?]{20,80}/g) || [];
  const chunkFreq = new Map();
  for (const chunk of phraseChunks) {
    const fp = normalizeFingerprint(chunk);
    if (fp.length < 16) continue;
    chunkFreq.set(fp, (chunkFreq.get(fp) || 0) + 1);
  }
  const dominantPhraseRepeats = [...chunkFreq.values()].filter((c) => c >= 3).length;

  return {
    lexicalRepetitionRatio: Math.round(lexicalRepetitionRatio * 1000) / 1000,
    structuralFrameCounts: frames,
    semanticAxisCounts,
    duplicateSentenceCount,
    dominantPhraseRepeats,
    pass:
      duplicateSentenceCount <= 1 &&
      dominantPhraseRepeats === 0 &&
      frames.porque <= 2 &&
      !excessiveAxis,
  };
}

/**
 * @param {string} text
 */
export function validateComposedSurface(text = "") {
  const grammar = detectBrokenSurfaceGrammar(text);
  const repetition = computeRepetitionMetrics(text);
  return {
    grammar,
    repetition,
    pass: !grammar.detected && repetition.pass,
  };
}

function repairConcessionGrammar(body = "") {
  let text = String(body || "");
  text = text.replace(/\bMesmo saber que\b/gi, "Mesmo sabendo que");
  text = text.replace(/\bMesmo considerar que\b/gi, "Mesmo considerando que");
  text = text.replace(/\bMesmo reconhecer que\b/gi, "Mesmo reconhecendo que");
  text = text.replace(/\bMesmo existir\b/gi, "Mesmo existindo");
  text = text.replace(/\bMesmo parece\b/gi, "Mesmo sabendo que parece");
  text = text.replace(/\bMesmo vale\b/gi, "Mesmo considerando que vale");
  text = text.replace(
    /\bMesmo com\s+(pode\s+[^,.\n!?]{4,160})/gi,
    (_, frag) => `Mesmo sabendo que ${cleanText(frag).charAt(0).toLowerCase()}${cleanText(frag).slice(1)}`
  );
  text = text.replace(
    /\bMesmo com\s+(vale\s+[^,.\n!?]{4,160})/gi,
    (_, frag) => `Mesmo considerando que ${cleanText(frag).charAt(0).toLowerCase()}${cleanText(frag).slice(1)}`
  );
  text = text.replace(
    /\bMesmo com\s+(exist(?:e|ir)\s+[^,.\n!?]{4,160})/gi,
    (_, frag) => `Mesmo reconhecendo que ${cleanText(frag).charAt(0).toLowerCase()}${cleanText(frag).slice(1)}`
  );
  return text;
}

/**
 * Expands deterministic/LLM continuation stubs using session context.
 * @param {string} text
 * @param {object} [sessionContext]
 */
export function expandStubContinuationReply(text = "", sessionContext = {}) {
  const trimmed = cleanText(text);
  if (!STUB_CONTINUATION.test(trimmed)) return text;

  const product =
    sessionContext?.lastBestProduct?.product_name ||
    sessionContext?.purchaseContext?.lastRecommended ||
    sessionContext?.lastRecommendedProduct ||
    "";
  const consequence =
    sessionContext?.lastMainConsequence ||
    sessionContext?.explanationCtx?.lastConsequence ||
    sessionContext?.purchaseContext?.lastMainConsequence ||
    "";
  const axis = sessionContext?.purchaseContext?.lastAxis || sessionContext?.lastAxis || "";

  if (product && consequence) {
    return `Continuando com o ${product}: ${consequence.replace(/\.$/, "")}. Quer que eu aprofunde algum ponto?`;
  }
  if (product && axis) {
    return `Seguindo com o ${product}, o foco segue em ${axis}. O que você quer explorar agora?`;
  }
  if (product) {
    return `Seguindo com o ${product}. Quer aprofundar preço, uso no dia a dia ou algum trade-off?`;
  }
  return "Posso continuar a partir do que já vimos — quer foco em uso, preço ou algum trade-off específico?";
}

/**
 * Last-mile surface polish for any reply path (PATCH 4A.6V.3 universal guard).
 * Preserves meaning; fixes known broken concatenations and raw fragments.
 * @param {string} text
 * @param {{ sessionContext?: object }} [options]
 */
export function polishReplySurface(text = "", options = {}) {
  let body = String(text || "");
  if (!body.trim()) return body;

  body = body.replace(
    /\bporque\s+(menos\s+[^.\n!?]{4,160})/gi,
    (_, frag) => `— ${rewriteConsequenceForSpeech(cleanText(frag))}`
  );
  body = body.replace(
    /\bporque\s+(mais\s+[^.\n!?]{4,160})/gi,
    (_, frag) => `— ${rewriteConsequenceForSpeech(cleanText(frag))}`
  );
  body = body.replace(
    /\bescolhi\s+([^—\n!?]{2,80}?)\s+porque\s+(menos|mais)\s+([^.\n!?]{4,160})/gi,
    (_, product, _mod, frag) =>
      `escolhi ${cleanText(product)} — ${rewriteConsequenceForSpeech(cleanText(`${_mod} ${frag}`))}`
  );

  body = repairConcessionGrammar(body);
  body = sanitizeInternalLabelText(body);
  body = governAbsoluteClaimsOnSurface(body);

  if (options.sessionContext) {
    body = expandStubContinuationReply(body, options.sessionContext);
  }

  return body.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export { detectAbsoluteClaimsOnSurface, governAbsoluteClaimsOnSurface };

/**
 * @param {string} choiceName
 * @param {string} reason
 */
export function formatChoiceReasonClause(choiceName = "", reason = "") {
  const choice = cleanText(choiceName);
  const spoken = rewriteConsequenceForSpeech(cleanText(reason).replace(/\.$/, ""));
  if (!choice || !spoken) return "";
  const body = spoken.charAt(0).toLowerCase() + spoken.slice(1).replace(/\.$/, "");
  return `escolhi o ${choice} — ${body}.`;
}

/**
 * @param {string} subjectName
 * @param {string} reason
 */
export function formatCoherentBecauseClause(subjectName = "", reason = "") {
  const subject = cleanText(subjectName);
  const spoken = rewriteConsequenceForSpeech(cleanText(reason).replace(/\.$/, ""));
  if (!subject || !spoken) return "";
  const body = spoken.charAt(0).toLowerCase() + spoken.slice(1).replace(/\.$/, "");
  return `${subject} continua coerente aqui — ${body}.`;
}
