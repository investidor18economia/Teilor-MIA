/**
 * PATCH 4A.6V — Verbalization Composition Guard
 *
 * Systemic guard against broken concessions, semantic slot duplication,
 * and invalid concatenation in deterministic verbalization paths.
 * Does not alter facts, ranking, winner, or decision content.
 */

import { rewriteConsequenceForSpeech } from "./miaVerbalizationStyleGovernor.js";

export const VERBALIZATION_COMPOSITION_GUARD_VERSION = "4A.6V.2";

const NEUTRAL_SACRIFICE =
  "O ponto de atenção é confirmar preço, garantia e condição da oferta antes de decidir.";

const BROKEN_CONCESSION_PATTERNS = Object.freeze([
  /\bmesmo com\s+(?:pode|vale|é|são|tem|abre|ganha|considerar)\s+/i,
  /\bmesmo com\s+vale\s+/i,
  /\bmesmo tendo\s+(?:pode|vale)\s+/i,
  /\bapesar de\s+(?:pode|vale)\s+/i,
]);

const BROKEN_FRAGMENT_PATTERNS = Object.freeze([
  /\bporque\s+(?:menos|mais)\s+[a-záàâãéêíóôõúç]/i,
  /\bporque\s+(?:câmera|tela|bateria|desempenho|carregamento|visual|autonomia)\s+(?:boa|bom|fluida|forte|alta|lento|melhor|confortável)/i,
]);

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

/**
 * @returns {{ used: Set<string>, claims: Array<{ role: string, text: string, fingerprint: string }> }}
 */
export function createCompositionLedger() {
  return { used: new Set(), claims: [] };
}

/**
 * @param {{ used: Set<string>, claims: Array }} ledger
 * @param {string} text
 * @param {string} role
 * @param {{ allowNearDuplicate?: boolean, threshold?: number }} [options]
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
 * Formats tradeoff text for valid "Mesmo com / Mesmo sabendo" concessions.
 * @param {string} tradeoff
 */
export function formatConcessionPhrase(tradeoff = "") {
  const raw = cleanText(tradeoff);
  if (!raw || raw === NEUTRAL_SACRIFICE) return "esse ponto de atenção";

  if (/^o ponto de atenção (?:é|seria)\s/i.test(raw)) {
    return raw.replace(/^o ponto de atenção (?:é|seria)\s*/i, "esse ponto de atenção: ").replace(/\.$/, "");
  }

  if (/^pode\s+/i.test(raw)) {
    return `saber que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  if (/^vale\s+/i.test(raw)) {
    return `considerar que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  if (/^(?:é|são|tem|abre|ganha|considerar)\s/i.test(raw)) {
    return `saber que ${raw.charAt(0).toLowerCase()}${raw.slice(1).replace(/\.$/, "")}`;
  }

  return raw.charAt(0).toLowerCase() + raw.slice(1).replace(/\.$/, "");
}

/**
 * @param {{ winner: string, tradeoff: string, reason: string, ledger?: { used: Set<string> }|null }} input
 */
export function buildMesmoComClosing({ winner = "", tradeoff = "", reason = "", ledger = null } = {}) {
  const w = cleanText(winner);
  if (!w) return "";

  let reasonText = rewriteConsequenceForSpeech(cleanText(reason).replace(/\.$/, ""));
  if (ledger) {
    const claim = claimSemanticSlot(ledger, reasonText, "closing_reason", { allowNearDuplicate: true, threshold: 0.85 });
    if (!claim.claimed && claim.duplicate) {
      reasonText = "o ganho principal ainda pesa mais do que essa renúncia";
    }
  }

  const concession = formatConcessionPhrase(tradeoff);
  const reasonBody = reasonText.charAt(0).toLowerCase() + reasonText.slice(1).replace(/\.$/, "");

  if (/^(?:saber que|considerar que)/i.test(concession)) {
    return `Mesmo ${concession}, eu manteria o ${w} — ${reasonBody}.`;
  }

  return `Mesmo com ${concession}, eu manteria o ${w} — ${reasonBody}.`;
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
      output.push(rewritten);
      ledger.used.add(fp);
      ledger.claims.push({ role: "gain_bullet", text: rewritten, fingerprint: fp });
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
  if (overlapRatio(paragraph, opening) >= 0.55) {
    const runnerOnly = paragraph.split(/[.!?]/)[0]?.trim();
    if (runnerOnly && overlapRatio(runnerOnly, opening) < 0.55) return runnerOnly + ".";
    return "";
  }
  return paragraph;
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
    duplicateSentenceCount,
    dominantPhraseRepeats,
    pass: duplicateSentenceCount <= 1 && dominantPhraseRepeats === 0 && frames.porque <= 2,
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

/**
 * Last-mile surface polish for any reply path (PATCH 4A.6V systemic guard).
 * Preserves meaning; fixes known broken concatenations and raw fragments.
 * @param {string} text
 */
export function polishReplySurface(text = "") {
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
  body = body.replace(
    /\bMesmo com\s+(pode\s+[^,.\n!?]{4,160})/gi,
    (_, frag) => `Mesmo sabendo que ${cleanText(frag).charAt(0).toLowerCase()}${cleanText(frag).slice(1)}`
  );
  body = body.replace(
    /\bMesmo com\s+(vale\s+[^,.\n!?]{4,160})/gi,
    (_, frag) => `Mesmo considerando que ${cleanText(frag).charAt(0).toLowerCase()}${cleanText(frag).slice(1)}`
  );

  return body.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

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
