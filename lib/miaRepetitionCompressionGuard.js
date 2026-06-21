/**
 * PATCH 9.2D / 9.2I — Repetition Compression Guard
 *
 * Compacta redundância cognitiva dentro da mesma resposta.
 * Não altera winner, evidência, insight, tradeoff ou decisão principal.
 * 9.2I: preserva estrutura paragráfica (\n\n) criada pelo 9.2A.
 */

import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";
import { INSIGHT_MARKER_PATTERN } from "./miaExpertInsightGenerationLayer.js";
import {
  classifyCognitiveBlock,
  splitReplyIntoCognitiveBlocks,
} from "./miaHumanCognitiveVariationLayer.js";
import { hasSpecialistClosing } from "./miaSpecialistNarrativeEngine.js";

export const REPETITION_COMPRESSION_GUARD_VERSION = "9.2I.1";

export const COMPRESSION_GUARD_FLAGS = Object.freeze({
  WINNER_CHANGED: "WINNER_CHANGED",
  TRADEOFF_LOST: "TRADEOFF_LOST",
  EVIDENCE_LOST: "EVIDENCE_LOST",
  INSIGHT_LOST: "INSIGHT_LOST",
  INVENTED_CONTENT: "INVENTED_CONTENT",
  OVER_COMPRESSED: "OVER_COMPRESSED",
  REDUNDANCY_NOT_REDUCED: "REDUNDANCY_NOT_REDUCED",
  STRUCTURE_COLLAPSED: "STRUCTURE_COLLAPSED",
});

const EVIDENCE_MARKER_PATTERN =
  /(?:um )?detalhe que muita gente ignora|tem um ponto que ajudou|quase ningu[eé]m presta aten[cç][aã]o|é exatamente aqui que ele ganha for[cç]a|foi esse detalhe que fez diferen[cç]a|muitos acabam olhando s[oó] pre[cç]o e esquecem que/i;

const STOPWORDS = new Set([
  "para",
  "com",
  "como",
  "mais",
  "muito",
  "essa",
  "esse",
  "esta",
  "este",
  "sobre",
  "quando",
  "porque",
  "ainda",
  "mesmo",
  "ponto",
  "busca",
  "escolha",
  "produto",
  "modelo",
  "aqui",
  "nele",
  "nela",
  "isso",
  "peso",
  "pesa",
  "decisao",
  "decisão",
  "continua",
  "principal",
  "segura",
  "seguro",
  "faz",
  "sentido",
  "perfil",
  "pensando",
]);

const CONCEPT_GROUPS = Object.freeze({
  longevity: [
    "longevidade",
    "longevo",
    "durabilidade",
    "durar",
    "anos",
    "atualiza",
    "software",
    "suporte",
    "envelhece",
    "trocar",
    "ficar",
  ],
  performance: [
    "desempenho",
    "performance",
    "forte",
    "multitarefa",
    "travar",
    "fluid",
    "rapidez",
    "potencia",
    "potência",
    "equilibrado",
  ],
  camera: ["camera", "câmera", "foto", "fotos", "noturn", "registra", "momentos", "selfie"],
  battery: ["bateria", "autonomia", "carga", "tomada"],
  screen: ["tela", "display", "fluidez", "visual", "imagem", "streaming", "monitor"],
  comfort: ["conforto", "ergonom", "assento", "lombar", "horas", "prolongado"],
  value: ["preco", "preço", "custo", "barato", "econom", "beneficio", "benefício"],
  ecosystem: ["ecossistema", "integracao", "integração", "apps", "sistema"],
});

const PROTECTED_BLOCK_TYPES = new Set(["decision", "tradeoff", "evidence", "insight", "budget", "intent"]);

const COMPRESSIBLE_BLOCK_TYPES = new Set(["closing", "authority", "stakes", "support"]);

const OVERLAP_COMPRESS_THRESHOLD = 0.68;
const OVERLAP_DROP_THRESHOLD = 0.78;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
}

function signatureTokens(text = "") {
  return normalizeKey(text)
    .split(" ")
    .filter((word) => word.length > 4 && !STOPWORDS.has(word));
}

function buildTokenHash(text = "") {
  const tokens = signatureTokens(text);
  if (!tokens.length) return "";
  return tokens.slice(0, 14).sort().join("|");
}

function splitSentences(text = "") {
  return cleanText(text)
    .split(/(?<=[.!?…])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectConceptGroups(text = "", primaryAxis = "") {
  const body = normalizeKey(text);
  const groups = new Set();

  for (const [group, words] of Object.entries(CONCEPT_GROUPS)) {
    if (words.some((word) => body.includes(normalizeKey(word)))) {
      groups.add(group);
    }
  }

  if (primaryAxis && CONCEPT_GROUPS[primaryAxis]) {
    if (CONCEPT_GROUPS[primaryAxis].some((word) => body.includes(normalizeKey(word)))) {
      groups.add(primaryAxis);
    }
  }

  if (primaryAxis) {
    groups.add(`axis:${primaryAxis}`);
  }

  return groups;
}

export function extractNarrativeConcepts(block = {}, context = {}) {
  const text = cleanText(block.text || "");
  const primaryAxis = cleanText(context.primaryAxis || "");
  const groups = detectConceptGroups(text, primaryAxis);
  const tokenHash = buildTokenHash(text);

  return {
    blockType: block.type || classifyCognitiveBlock(text),
    groups: [...groups],
    tokenHash,
    textLength: text.length,
  };
}

function conceptOverlap(a = {}, b = {}) {
  const groupsA = new Set(a.groups || []);
  const groupsB = new Set(b.groups || []);
  let groupScore = 0;

  if (groupsA.size && groupsB.size) {
    const shared = [...groupsA].filter((group) => groupsB.has(group)).length;
    groupScore = shared / Math.min(groupsA.size, groupsB.size);
  }

  const hashA = a.tokenHash || "";
  const hashB = b.tokenHash || "";
  let tokenScore = 0;

  if (hashA && hashB) {
    const wordsA = hashA.split("|").filter(Boolean);
    const wordsB = hashB.split("|").filter(Boolean);
    const hits = wordsA.filter((word) => wordsB.includes(word)).length;
    tokenScore = hits / Math.min(wordsA.length, wordsB.length || 1);
  }

  if (groupScore >= 0.5 && tokenScore >= 0.45) {
    return Math.max(groupScore, tokenScore);
  }

  return Math.max(groupScore * 0.85, tokenScore * 0.75);
}

export function detectRepeatedConcepts(blocks = [], context = {}) {
  const concepts = blocks.map((block) => extractNarrativeConcepts(block, context));
  const repeated = [];

  for (let index = 1; index < concepts.length; index += 1) {
    let bestMatch = null;

    for (let prior = 0; prior < index; prior += 1) {
      const overlap = conceptOverlap(concepts[index], concepts[prior]);
      if (!bestMatch || overlap > bestMatch.overlap) {
        bestMatch = {
          blockIndex: index,
          priorIndex: prior,
          overlap,
          blockType: concepts[index].blockType,
          priorType: concepts[prior].blockType,
        };
      }
    }

    if (bestMatch && bestMatch.overlap >= OVERLAP_COMPRESS_THRESHOLD) {
      repeated.push(bestMatch);
    }
  }

  return {
    concepts,
    repeated,
    repetitionScore: repeated.length,
  };
}

function isClosingBlock(block = {}) {
  if (block.type === "closing") return true;
  return hasSpecialistClosing(block.text || "");
}

function blockPriority(block = {}, seenTypes = new Set()) {
  const type = block.type || "support";
  if (type === "decision") return 100;
  if (type === "evidence" && !seenTypes.has("evidence")) return 90;
  if (type === "insight" && !seenTypes.has("insight")) return 88;
  if (type === "tradeoff") return 86;
  if (type === "budget") return 70;
  if (isClosingBlock(block)) return 40;
  if (COMPRESSIBLE_BLOCK_TYPES.has(type)) return 30;
  return 50;
}

export function buildCompressionPlan(blocks = [], context = {}) {
  const detection = detectRepeatedConcepts(blocks, context);
  const actions = [];
  const seenTypes = new Set();
  const retainedConcepts = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const type = block.type || classifyCognitiveBlock(block.text || "");
    const concept = detection.concepts[index];
    const repeats = detection.repeated.filter((entry) => entry.blockIndex === index);
    const bestRepeat = repeats.sort((a, b) => b.overlap - a.overlap)[0] || null;

    if (!bestRepeat || bestRepeat.overlap < OVERLAP_COMPRESS_THRESHOLD) {
      actions.push({ index, action: "keep", block, reason: "unique" });
      retainedConcepts.push(concept);
      if (type === "evidence" || type === "insight") seenTypes.add(type);
      continue;
    }

    const protectedCore =
      type === "decision" ||
      type === "tradeoff" ||
      type === "budget" ||
      type === "intent" ||
      type === "evidence" ||
      type === "insight";

    if (protectedCore) {
      if (
        (type === "insight" || type === "evidence" || type === "stakes" || type === "authority") &&
        bestRepeat.overlap >= OVERLAP_COMPRESS_THRESHOLD
      ) {
        actions.push({
          index,
          action: "compress_sentences",
          block,
          reason: "protected_trim_sentences",
          overlap: bestRepeat.overlap,
        });
      } else {
        actions.push({ index, action: "keep", block, reason: "protected_core" });
        retainedConcepts.push(concept);
      }
      if (type === "decision") seenTypes.add("decision");
      if (type === "evidence") seenTypes.add("evidence");
      if (type === "insight") seenTypes.add("insight");
      continue;
    }

    if (COMPRESSIBLE_BLOCK_TYPES.has(type) || isClosingBlock(block)) {
      if (hasProtectedMarker(block.text || "")) {
        actions.push({
          index,
          action: "compress_sentences",
          block,
          reason: "marked_secondary_trim",
          overlap: bestRepeat.overlap,
        });
        continue;
      }

      if (bestRepeat.overlap >= OVERLAP_DROP_THRESHOLD) {
        actions.push({
          index,
          action: "drop",
          block,
          reason: "redundant_secondary_block",
          overlap: bestRepeat.overlap,
        });
        continue;
      }

      actions.push({
        index,
        action: "compress_sentences",
        block,
        reason: "redundant_sentences",
        overlap: bestRepeat.overlap,
      });
      continue;
    }

    if (bestRepeat.overlap >= OVERLAP_DROP_THRESHOLD) {
      actions.push({ index, action: "drop", block, reason: "redundant_block", overlap: bestRepeat.overlap });
      continue;
    }

    actions.push({ index, action: "keep", block, reason: "uncertain" });
    retainedConcepts.push(concept);
  }

  return {
    actions,
    detection,
    compressedBlocks: actions.filter((entry) => entry.action !== "keep").length,
  };
}

function hasEvidenceMarker(text = "") {
  return EVIDENCE_MARKER_PATTERN.test(text);
}

function hasInsightMarker(text = "") {
  return INSIGHT_MARKER_PATTERN.test(text);
}

function hasProtectedMarker(text = "") {
  return hasEvidenceMarker(text) || hasInsightMarker(text) || /✅/.test(text);
}

function preserveReplyParagraphs(text = "") {
  return String(text || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function splitParagraphUnits(text = "") {
  return preserveReplyParagraphs(text)
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function countParagraphUnits(text = "") {
  return splitParagraphUnits(text).length;
}

export function countParagraphBreaks(text = "") {
  return (preserveReplyParagraphs(text).match(/\n\s*\n/g) || []).length;
}

function compressBlockSentencesFlat(block = {}, priorConcepts = []) {
  const sentences = splitSentences(block.text);
  if (sentences.length <= 1) return block.text;

  const kept = [];
  const retained = [...priorConcepts];

  for (const sentence of sentences) {
    if (hasProtectedMarker(sentence)) {
      kept.push(sentence);
      retained.push(extractNarrativeConcepts({ ...block, text: sentence }));
      continue;
    }

    const concept = extractNarrativeConcepts({ ...block, text: sentence });
    const redundant = retained.some(
      (prior) => conceptOverlap(concept, prior) >= OVERLAP_COMPRESS_THRESHOLD
    );

    if (redundant) continue;
    kept.push(sentence);
    retained.push(concept);
  }

  if (!kept.length) {
    return sentences.find((sentence) => hasProtectedMarker(sentence)) || sentences[0];
  }

  return kept.join(" ");
}

function hasTradeoffLineStructure(text = "") {
  return /\n/.test(text) && (/✅/.test(text) || /⚠️/.test(text));
}

function compressBlockSentences(block = {}, priorConcepts = []) {
  const blockText = String(block.text || "").trim();
  if (!blockText) return blockText;

  if (/\n\s*\n/.test(blockText)) {
    return blockText
      .split(/\n\s*\n/)
      .map((chunk) =>
        compressBlockSentences({ ...block, text: chunk.trim() }, priorConcepts)
      )
      .filter(Boolean)
      .join("\n\n");
  }

  if (hasTradeoffLineStructure(blockText)) {
    return blockText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        compressBlockSentences({ ...block, text: line }, priorConcepts)
      )
      .filter(Boolean)
      .join("\n");
  }

  return compressBlockSentencesFlat(block, priorConcepts);
}

export function verifyStructurePreservation(before = "", after = "") {
  const beforeParagraphs = countParagraphUnits(before);
  const afterParagraphs = countParagraphUnits(after);
  const beforeBreaks = countParagraphBreaks(before);
  const afterBreaks = countParagraphBreaks(after);

  if (beforeParagraphs >= 3 && afterParagraphs <= 1) {
    return { ok: false, reason: "paragraph_structure_collapsed", flags: [COMPRESSION_GUARD_FLAGS.STRUCTURE_COLLAPSED] };
  }

  if (beforeParagraphs >= 2 && afterParagraphs < 2) {
    return { ok: false, reason: "paragraph_structure_reduced", flags: [COMPRESSION_GUARD_FLAGS.STRUCTURE_COLLAPSED] };
  }

  if (beforeParagraphs >= 5 && afterParagraphs <= 2) {
    return { ok: false, reason: "specialist_structure_collapsed", flags: [COMPRESSION_GUARD_FLAGS.STRUCTURE_COLLAPSED] };
  }

  if (beforeBreaks >= 5) {
    const minBreaksAfter = Math.max(2, Math.floor(beforeBreaks * 0.4));
    if (afterBreaks < minBreaksAfter) {
      return {
        ok: false,
        reason: "double_newline_structure_lost",
        flags: [COMPRESSION_GUARD_FLAGS.STRUCTURE_COLLAPSED],
      };
    }
  }

  if (
    beforeParagraphs >= 4 &&
    afterParagraphs < Math.max(2, Math.ceil(beforeParagraphs * 0.45))
  ) {
    return {
      ok: false,
      reason: "paragraph_structure_over_compressed",
      flags: [COMPRESSION_GUARD_FLAGS.STRUCTURE_COLLAPSED],
    };
  }

  return { ok: true, reason: null, flags: [] };
}

function normalizeLineWhitespace(line = "") {
  return String(line || "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

/**
 * Cleanup leve que preserva quebras \n\n e listas ✅/⚠️.
 * Evita applyPhraseRewrites global que colapsa \n\n via /\s{2,}/.
 */
export function safeCleanupPreservingParagraphs(text = "", context = {}) {
  const body = preserveReplyParagraphs(text);
  if (!body) return "";

  const paragraphs = splitParagraphUnits(body);
  if (!paragraphs.length) return body;

  const cleanedParagraphs = paragraphs.map((paragraph) => {
    const lines = paragraph.split("\n");
    const cleanedLines = lines
      .map((line) => {
        const cleaned = cleanupMiaHumanLanguage(line, {
          allowedEvidence: context.allowedEvidence || "",
          winnerName: context.winnerName || "",
          preserveStructure: true,
        });
        return normalizeLineWhitespace(cleaned.text || line);
      })
      .filter(Boolean);

    return cleanedLines.join("\n");
  });

  return cleanedParagraphs.filter(Boolean).join("\n\n").trim();
}

export function applyRepetitionCompression(input = {}) {
  const originalReply = String(input.reply || "").trim();
  if (!originalReply) {
    return { ok: false, text: "", error: "empty" };
  }

  const blocks = splitReplyIntoCognitiveBlocks(originalReply);
  if (blocks.length <= 1) {
    return {
      ok: true,
      text: originalReply,
      blocks,
      plan: null,
      error: null,
    };
  }

  const context = {
    primaryAxis: cleanText(input.primaryAxis || input.searchCognition?.primaryAxis || ""),
    winnerName: cleanText(input.winnerName || input.productName || ""),
    query: cleanText(input.query || ""),
  };

  const plan = buildCompressionPlan(blocks, context);
  const priorConcepts = [];
  const outputBlocks = [];

  for (const entry of plan.actions) {
    if (entry.action === "drop") continue;

    if (entry.action === "compress_sentences") {
      const compressedText = compressBlockSentences(entry.block, priorConcepts);
      if (!compressedText || compressedText === entry.block.text) {
        outputBlocks.push(entry.block);
        priorConcepts.push(extractNarrativeConcepts(entry.block, context));
        continue;
      }

      const compressedBlock = { ...entry.block, text: compressedText };
      outputBlocks.push(compressedBlock);
      priorConcepts.push(extractNarrativeConcepts(compressedBlock, context));
      continue;
    }

    outputBlocks.push(entry.block);
    priorConcepts.push(extractNarrativeConcepts(entry.block, context));
  }

  const text = outputBlocks.map((block) => block.text).join("\n\n").trim();
  const safety = verifyCompressionSafety(originalReply, text, input);
  const structure = verifyStructurePreservation(originalReply, text);

  if (!structure.ok) {
    return {
      ok: false,
      text: originalReply,
      plan,
      error: structure.reason,
      flags: structure.flags,
    };
  }

  if (!safety.ok) {
    return {
      ok: false,
      text: originalReply,
      plan,
      error: safety.reason,
      flags: safety.flags,
    };
  }

  if (text.length < originalReply.length * 0.55) {
    const protectedKept =
      outputBlocks.some((block) => block.type === "decision" || block.type === "support") &&
      outputBlocks.some((block) => block.type === "tradeoff") &&
      outputBlocks.some((block) => block.type === "evidence" || EVIDENCE_MARKER_PATTERN.test(block.text || ""));

    if (!protectedKept || text.length < originalReply.length * 0.42) {
      return {
        ok: false,
        text: originalReply,
        plan,
        error: "over_compressed",
        flags: [COMPRESSION_GUARD_FLAGS.OVER_COMPRESSED],
      };
    }
  }

  return {
    ok: true,
    text: text || originalReply,
    blocks: outputBlocks,
    plan,
    removedBlocks: plan.actions.filter((entry) => entry.action === "drop").length,
    error: null,
  };
}

export function verifyCompressionSafety(before = "", after = "", context = {}) {
  const flags = [];
  const winner = cleanText(context.winnerName || "");

  if (winner && !normalizeKey(after).includes(normalizeKey(winner))) {
    flags.push(COMPRESSION_GUARD_FLAGS.WINNER_CHANGED);
  }

  if (/✅/.test(before) && !/✅/.test(after)) {
    flags.push(COMPRESSION_GUARD_FLAGS.TRADEOFF_LOST);
  }

  if (EVIDENCE_MARKER_PATTERN.test(before) && !EVIDENCE_MARKER_PATTERN.test(after)) {
    flags.push(COMPRESSION_GUARD_FLAGS.EVIDENCE_LOST);
  }

  if (INSIGHT_MARKER_PATTERN.test(before) && !INSIGHT_MARKER_PATTERN.test(after)) {
    flags.push(COMPRESSION_GUARD_FLAGS.INSIGHT_LOST);
  }

  if (findInventedSpecViolations(after, context.allowedEvidence || winner).length > 0) {
    flags.push(COMPRESSION_GUARD_FLAGS.INVENTED_CONTENT);
  }

  return {
    ok: flags.length === 0,
    flags,
    reason: flags[0] || null,
  };
}

export function measureConceptRedundancy(text = "", context = {}) {
  const blocks = splitReplyIntoCognitiveBlocks(text);
  const detection = detectRepeatedConcepts(blocks, context);
  return {
    blockCount: blocks.length,
    repetitionScore: detection.repetitionScore,
    repeatedPairs: detection.repeated.length,
  };
}

export function shouldApplyRepetitionCompression(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") return false;
  if (input.intent === "comparison") return false;
  if (!String(input.reply || "").trim()) return false;
  return true;
}

export function finalizeReplyWithRepetitionCompression(input = {}) {
  if (!shouldApplyRepetitionCompression(input)) {
    return {
      ok: false,
      text: String(input.reply || "").trim(),
      error: "suppressed",
    };
  }

  const applied = applyRepetitionCompression(input);
  if (!applied.ok) return applied;

  const beforeCleanup = applied.text || "";
  const beforeParagraphs = countParagraphUnits(beforeCleanup);
  const beforeBreaks = countParagraphBreaks(beforeCleanup);

  const cleanupContext = {
    allowedEvidence: input.allowedEvidence || input.winnerName || "",
    winnerName: input.winnerName || input.productName || "",
    preserveStructure: true,
  };

  let finalText = safeCleanupPreservingParagraphs(beforeCleanup, cleanupContext) || beforeCleanup;

  const structureAfterCleanup = verifyStructurePreservation(beforeCleanup, finalText);
  if (!structureAfterCleanup.ok) {
    finalText = beforeCleanup;
  } else if (beforeParagraphs >= 3 && countParagraphUnits(finalText) <= 1) {
    finalText = beforeCleanup;
  } else if (beforeParagraphs >= 2 && countParagraphUnits(finalText) < 2) {
    finalText = beforeCleanup;
  } else if (beforeBreaks >= 5) {
    const minBreaksAfter = Math.max(2, Math.floor(beforeBreaks * 0.4));
    if (countParagraphBreaks(finalText) < minBreaksAfter) {
      finalText = beforeCleanup;
    }
  } else if (beforeParagraphs >= 5 && countParagraphUnits(finalText) <= 2) {
    finalText = beforeCleanup;
  }

  const structureFinal = verifyStructurePreservation(
    String(input.reply || "").trim(),
    finalText
  );

  return {
    ...applied,
    text: finalText,
    structurePreserved: structureFinal.ok,
    paragraphsBeforeCleanup: beforeParagraphs,
    paragraphsAfterFinalize: countParagraphUnits(finalText),
    doubleNewlinesAfterFinalize: countParagraphBreaks(finalText),
  };
}

export function auditRepetitionCompression(before = "", after = "", context = {}) {
  const flags = verifyCompressionSafety(before, after, context).flags;
  const beforeMetrics = measureConceptRedundancy(before, context);
  const afterMetrics = measureConceptRedundancy(after, context);

  if (
    context.expectLessRedundancy &&
    after.length >= before.length &&
    afterMetrics.repetitionScore >= beforeMetrics.repetitionScore
  ) {
    flags.push(COMPRESSION_GUARD_FLAGS.REDUNDANCY_NOT_REDUCED);
  }

  return {
    flags,
    beforeMetrics,
    afterMetrics,
  };
}
