/**
 * PATCH 9.2F — Tradeoff Visual Emphasis Layer
 *
 * Reorganiza tradeoffs já gerados (9.1D) em bloco visual escaneável.
 * Não altera winner, decisão, evidência, insight ou conteúdo cognitivo.
 */

import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { INSIGHT_MARKER_PATTERN } from "./miaExpertInsightGenerationLayer.js";
import {
  extractTradeoffBlockFromReply,
  isTradeoffCommunicationUseful,
} from "./miaTradeoffCommunicationLayer.js";
import { hasAdequateConversationalClosing } from "./miaConversationalClosingEngine.js";
import {
  dedupeTradeoffItemsByFamily,
} from "./miaSemanticFamilyAllocationEngine.js";
import {
  renderTradeoffPresentationBlock,
  stripSpecialistPresentationTail,
  assembleSpecialistReplyFromContract,
  setPresentationClosing,
} from "./miaSpecialistPresentationContract.js";

export const TRADEOFF_VISUAL_EMPHASIS_LAYER_VERSION = "9.2O.1";

export const TRADEOFF_VISUAL_FLAGS = Object.freeze({
  WINNER_CHANGED: "WINNER_CHANGED",
  EVIDENCE_LOST: "EVIDENCE_LOST",
  INSIGHT_LOST: "INSIGHT_LOST",
  CLOSING_LOST: "CLOSING_LOST",
  TRADEOFF_LOST: "TRADEOFF_LOST",
  INVENTED_CONTENT: "INVENTED_CONTENT",
  DUPLICATED_TRADEOFF: "DUPLICATED_TRADEOFF",
  VISUAL_NOT_APPLIED: "VISUAL_NOT_APPLIED",
});

const EVIDENCE_MARKER_PATTERN =
  /(?:um )?detalhe que muita gente ignora|tem um ponto que ajudou|quase ningu[eé]m presta aten[cç][aã]o|é exatamente aqui que ele ganha for[cç]a|foi esse detalhe que fez diferen[cç]a|muitos acabam olhando s[oó] pre[cç]o e esquecem que/i;

const GAIN_HEADER = "✅ O que você ganha";
const SACRIFICE_HEADER = "⚠️ O que você abre mão";

const TRADEOFF_INTRO_INLINE_PATTERN =
  /(?:Resumindo o que você ganha e o que abre mão|Na prática, a escolha fica assim|Se você seguir por esse caminho):?\s*/i;

function paragraphContainsCognitiveContent(paragraph = "") {
  return (
    /Minha escolha|recomendo|detalhe que muita gente|Quase ningu[eé]m presta/i.test(paragraph) ||
    EVIDENCE_MARKER_PATTERN.test(paragraph) ||
    INSIGHT_MARKER_PATTERN.test(paragraph)
  );
}

function splitClosingFromTradeoff(text = "") {
  const body = cleanText(text);
  const match = body.match(/^([\s\S]*?)(\s+Esse é o próximo passo[\s\S]*)$/i);
  if (!match) {
    const alt = body.match(/^([\s\S]*?)(\s+Por aqui, eu fecharia[\s\S]*)$/i);
    if (!alt) return { tradeoff: body, closing: "" };
    return { tradeoff: alt[1].trim(), closing: alt[2].trim() };
  }
  return { tradeoff: match[1].trim(), closing: match[2].trim() };
}

function splitTradeoffSliceFromText(text = "") {
  const body = preserveReplyStructure(text);
  const introMatch = body.match(TRADEOFF_INTRO_INLINE_PATTERN);

  if (introMatch && introMatch.index != null) {
    return {
      prefix: body.slice(0, introMatch.index).trim(),
      tradeoffSlice: body.slice(introMatch.index).trim(),
    };
  }

  const firstMarker = body.search(/✅/u);
  if (firstMarker >= 0) {
    return {
      prefix: body.slice(0, firstMarker).trim(),
      tradeoffSlice: body.slice(firstMarker).trim(),
    };
  }

  return { prefix: body, tradeoffSlice: "" };
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function preserveReplyStructure(value = "") {
  return String(value || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeKey(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
}

function splitParagraphs(text = "") {
  return preserveReplyStructure(text)
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stripClosingTail(text = "") {
  return cleanText(text).replace(/\s+Esse é o próximo passo.*$/i, "").replace(/\s+Por aqui, eu fecharia.*$/i, "");
}

function capitalizePhrase(text = "") {
  const body = stripClosingTail(cleanText(text).replace(/[.!?…]+$/g, ""));
  if (!body) return "";
  return `${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}

function stripGainPrefix(text = "") {
  return cleanText(text)
    .replace(/^✅\s*/u, "")
    .replace(/^(?:ganha|você leva|fica com|leva)\s+/i, "")
    .replace(/^também\s+/i, "")
    .replace(/[.!?…]+$/g, "")
    .trim();
}

function stripSacrificePrefix(text = "") {
  return cleanText(text)
    .replace(/^⚠️\s*/u, "")
    .replace(/^(?:também\s+)?(?:abre mão de|em troca, abre mão de|não terá|fica sem)\s+/i, "")
    .replace(/^também\s+/i, "")
    .replace(/[.!?…]+$/g, "")
    .trim();
}

function uniqueItems(items = []) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const body = cleanText(item);
    if (!body || body.length < 3) continue;
    const key = normalizeKey(body);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(body);
  }

  return output;
}

export function hasVisualTradeoffEmphasis(text = "") {
  const body = preserveReplyStructure(text);
  if (!body) return false;
  return /O que voc[eê] ganha/i.test(body) && /O que voc[eê] abre m[aã]o/i.test(body);
}

export function hasTradeoffMarkers(text = "") {
  return /✅/.test(text || "") && /⚠️/.test(text || "");
}

function extractMarkedSegments(text = "") {
  const gains = [];
  const sacrifices = [];

  const body = preserveReplyStructure(text)
    .replace(TRADEOFF_INTRO_INLINE_PATTERN, "")
    .trim();

  const lines = body.split(/\n/).map((entry) => entry.trim()).filter(Boolean);
  let section = "";

  for (const line of lines) {
    if (/✅\s*O que voc[eê] ganha/i.test(line)) {
      section = "gain";
      continue;
    }
    if (/⚠️\s*O que voc[eê] abre m[aã]o/i.test(line)) {
      section = "sacrifice";
      continue;
    }

    if (/^✅/.test(line)) {
      const parts = line.split(/(?=⚠️)/u);
      const gainText = stripGainPrefix(parts[0]);
      if (gainText) gains.push(gainText);
      for (let index = 1; index < parts.length; index += 1) {
        const sacrificeText = stripSacrificePrefix(parts[index]);
        if (sacrificeText) sacrifices.push(sacrificeText);
      }
      continue;
    }

    if (/^⚠️/.test(line)) {
      const sacrificeText = stripSacrificePrefix(line);
      if (sacrificeText) sacrifices.push(sacrificeText);
      continue;
    }

    if (section === "gain" && line) {
      const subParts = line
        .split(/✅/u)
        .map((entry) => entry.trim())
        .filter(Boolean);
      for (const part of subParts) {
        gains.push(part.replace(/[.!?…]+$/g, ""));
      }
      continue;
    }

    if (section === "sacrifice" && line) {
      sacrifices.push(stripClosingTail(line.replace(/[.!?…]+$/g, "")));
    }
  }

  const segments = body.split(/(?=✅|⚠️)/u).map((entry) => entry.trim()).filter(Boolean);
  for (const segment of segments) {
    if (/O que voc[eê] ganha/i.test(segment) || /O que voc[eê] abre m[aã]o/i.test(segment)) {
      continue;
    }

    if (/^✅/.test(segment)) {
      const parts = segment.split(/(?=⚠️)/u);
      const gainText = stripGainPrefix(parts[0]);
      if (gainText) gains.push(gainText);
      for (let index = 1; index < parts.length; index += 1) {
        const sacrificeText = stripSacrificePrefix(parts[index]);
        if (sacrificeText) sacrifices.push(sacrificeText);
      }
    } else if (/^⚠️/.test(segment)) {
      const sacrificeText = stripSacrificePrefix(segment);
      if (sacrificeText) sacrifices.push(sacrificeText);
    }
  }

  return {
    gains: dedupeTradeoffItemsByFamily(uniqueItems(gains), 3),
    sacrifices: dedupeTradeoffItemsByFamily(uniqueItems(sacrifices), 3),
  };
}

export function detectTradeoffBlock(reply = "") {
  const body = preserveReplyStructure(reply);
  if (!body || !hasTradeoffMarkers(body)) {
    return {
      found: false,
      block: "",
      paragraphIndex: -1,
      parsed: { gains: [], sacrifices: [] },
    };
  }

  const paragraphs = splitParagraphs(body);
  const extracted = extractTradeoffBlockFromReply(body);
  let paragraphIndex = paragraphs.findIndex((paragraph) => {
    if (extracted && normalizeKey(paragraph).includes(normalizeKey(extracted).slice(0, 40))) {
      return true;
    }
    return /✅/.test(paragraph) && /⚠️/.test(paragraph);
  });

  const sourceParagraph =
    paragraphIndex >= 0 ? paragraphs[paragraphIndex] : paragraphs.find((paragraph) => /✅/.test(paragraph) && /⚠️/.test(paragraph)) || "";

  const { tradeoffSlice } = splitTradeoffSliceFromText(sourceParagraph || body);
  const sourceBlock = tradeoffSlice || extracted || sourceParagraph || body;
  const parsed = extractMarkedSegments(sourceBlock);

  return {
    found: parsed.gains.length > 0 && parsed.sacrifices.length > 0,
    block: sourceBlock,
    paragraphIndex,
    parsed,
  };
}

export function buildVisualTradeoffBlock(parsed = {}) {
  const gains = dedupeTradeoffItemsByFamily(uniqueItems(parsed.gains || []), 3);
  const sacrifices = dedupeTradeoffItemsByFamily(uniqueItems(parsed.sacrifices || []), 3);

  if (!gains.length || !sacrifices.length) {
    return "";
  }

  return renderTradeoffPresentationBlock({ gains, sacrifices });
}

/**
 * @param {{ gains?: string[], sacrifices?: string[] }} tradeoff
 */
export function buildVisualTradeoffBlockFromContract(tradeoff = {}) {
  return renderTradeoffPresentationBlock(tradeoff);
}

function isTradeoffPrimaryParagraph(paragraph = "") {
  const body = cleanText(paragraph);
  if (!body) return false;
  if (/O que voc[eê] ganha/i.test(body) && /O que voc[eê] abre m[aã]o/i.test(body)) return true;
  if (paragraphContainsCognitiveContent(paragraph)) return false;

  const { prefix, tradeoffSlice } = splitTradeoffSliceFromText(paragraph);
  if (prefix && tradeoffSlice) return false;

  const trimmed = paragraph.trim();
  if (/^(?:Se você seguir|Na prática|Resumindo)/i.test(trimmed) && hasTradeoffMarkers(trimmed)) {
    return true;
  }

  return hasTradeoffMarkers(paragraph) && isTradeoffCommunicationUseful(paragraph);
}

export function applyTradeoffVisualEmphasis(input = {}) {
  const originalReply = preserveReplyStructure(input.reply || "");
  const presentation = input.presentation || input.specialistPresentation || null;

  if (!originalReply && !presentation?.tradeoff?.gains?.length) {
    return { ok: false, text: "", applied: false, error: "empty" };
  }

  if (presentation?.tradeoff?.gains?.length && presentation?.tradeoff?.sacrifices?.length) {
    const visualBlock = buildVisualTradeoffBlockFromContract(presentation.tradeoff);
    if (visualBlock) {
      const bodyPrefix = stripSpecialistPresentationTail(originalReply);
      const text = assembleSpecialistReplyFromContract(presentation, bodyPrefix);
      const safety = verifyTradeoffPreservation(originalReply, text, {
        ...input,
        parsed: {
          gains: presentation.tradeoff.gains,
          sacrifices: presentation.tradeoff.sacrifices,
        },
      });

      if (!safety.ok) {
        return {
          ok: false,
          text: originalReply,
          applied: false,
          error: safety.reason,
          flags: safety.flags,
        };
      }

      return {
        ok: true,
        text,
        applied: true,
        visualBlock,
        presentation,
        usedContract: true,
        error: null,
      };
    }
  }

  if (!originalReply) {
    return { ok: false, text: "", applied: false, error: "empty" };
  }

  if (!hasTradeoffMarkers(originalReply)) {
    return {
      ok: true,
      text: originalReply,
      applied: false,
      error: null,
    };
  }

  if (hasVisualTradeoffEmphasis(originalReply)) {
    return {
      ok: true,
      text: originalReply,
      applied: false,
      alreadyVisual: true,
      error: null,
    };
  }

  const detection = detectTradeoffBlock(originalReply);
  if (!detection.found) {
    return {
      ok: true,
      text: originalReply,
      applied: false,
      error: "tradeoff_not_detected",
    };
  }

  const visualBlock = buildVisualTradeoffBlock(detection.parsed);
  if (!visualBlock) {
    return {
      ok: true,
      text: originalReply,
      applied: false,
      error: "visual_block_empty",
    };
  }

  const paragraphs = splitParagraphs(originalReply);
  const output = [];
  let inserted = false;

  for (const paragraph of paragraphs) {
    if (hasVisualTradeoffEmphasis(paragraph)) {
      output.push(paragraph);
      inserted = true;
      continue;
    }

    if (/✅/.test(paragraph) && /⚠️/.test(paragraph)) {
      const { prefix, tradeoffSlice } = splitTradeoffSliceFromText(paragraph);
      const { tradeoff, closing } = splitClosingFromTradeoff(tradeoffSlice || paragraph);
      const parsed = extractMarkedSegments(tradeoff);
      const block = buildVisualTradeoffBlock(parsed);

      if (block) {
        if (prefix && !/✅/.test(prefix)) {
          output.push(prefix);
        }
        output.push(block);
        if (closing) {
          output.push(closing);
        }
        inserted = true;
        continue;
      }
    }

    if (!/✅/.test(paragraph) || !/⚠️/.test(paragraph)) {
      output.push(paragraph);
      continue;
    }

    const { prefix, tradeoffSlice } = splitTradeoffSliceFromText(paragraph);
    const parsed = extractMarkedSegments(tradeoffSlice || paragraph);
    const block = buildVisualTradeoffBlock(parsed) || visualBlock;

    if (prefix && !/✅/.test(prefix)) {
      output.push(prefix);
    }

    if (!inserted && block) {
      output.push(block);
      inserted = true;
    }
  }

  if (!inserted) {
    const insertAt = Math.max(output.length - 1, 0);
    output.splice(insertAt, 0, visualBlock);
    inserted = true;
  }

  const text = output.join("\n\n").trim();
  const safety = verifyTradeoffPreservation(originalReply, text, {
    ...input,
    parsed: detection.parsed,
  });

  if (!safety.ok) {
    return {
      ok: false,
      text: originalReply,
      applied: false,
      error: safety.reason,
      flags: safety.flags,
    };
  }

  if (countVisualTradeoffBlocks(text) > 1) {
    return {
      ok: false,
      text: originalReply,
      applied: false,
      error: "duplicated_tradeoff",
      flags: [TRADEOFF_VISUAL_FLAGS.DUPLICATED_TRADEOFF],
    };
  }

  return {
    ok: true,
    text,
    applied: true,
    visualBlock,
    detection,
    error: null,
  };
}

function countVisualTradeoffBlocks(text = "") {
  return (preserveReplyStructure(text).match(/✅ O que voc[eê] ganha/gi) || []).length;
}

function contentPreserved(before = "", after = "", items = []) {
  const afterNorm = normalizeKey(after);
  return items.every((item) => {
    const key = normalizeKey(item);
    if (!key) return true;
    if (key.length <= 12) return afterNorm.includes(key);
    return afterNorm.includes(key.slice(0, Math.max(12, Math.floor(key.length * 0.72))));
  });
}

export function verifyTradeoffPreservation(before = "", after = "", context = {}) {
  const flags = [];
  const winner = cleanText(context.winnerName || context.productName || "");

  if (winner && !normalizeKey(after).includes(normalizeKey(winner))) {
    flags.push(TRADEOFF_VISUAL_FLAGS.WINNER_CHANGED);
  }

  if (EVIDENCE_MARKER_PATTERN.test(before) && !EVIDENCE_MARKER_PATTERN.test(after)) {
    flags.push(TRADEOFF_VISUAL_FLAGS.EVIDENCE_LOST);
  }

  if (INSIGHT_MARKER_PATTERN.test(before) && !INSIGHT_MARKER_PATTERN.test(after)) {
    flags.push(TRADEOFF_VISUAL_FLAGS.INSIGHT_LOST);
  }

  if (hasAdequateConversationalClosing(before) && !hasAdequateConversationalClosing(after)) {
    const beforeClosing = before.match(/Esse é o próximo passo[\s\S]*$/i) || before.match(/Por aqui, eu fecharia[\s\S]*$/i);
    const afterClosing = after.match(/Esse é o próximo passo[\s\S]*$/i) || after.match(/Por aqui, eu fecharia[\s\S]*$/i);
    if (!beforeClosing || !afterClosing) {
      flags.push(TRADEOFF_VISUAL_FLAGS.CLOSING_LOST);
    }
  }

  if (hasTradeoffMarkers(before) && !hasTradeoffMarkers(after)) {
    flags.push(TRADEOFF_VISUAL_FLAGS.TRADEOFF_LOST);
  }

  const parsed = context.parsed || detectTradeoffBlock(before).parsed;
  if (!contentPreserved(before, after, [...(parsed.gains || []), ...(parsed.sacrifices || [])])) {
    flags.push(TRADEOFF_VISUAL_FLAGS.TRADEOFF_LOST);
  }

  if (findInventedSpecViolations(after, context.allowedEvidence || winner).length > 0) {
    flags.push(TRADEOFF_VISUAL_FLAGS.INVENTED_CONTENT);
  }

  if (preserveReplyStructure(before).length > 80 && after.length < before.length * 0.55) {
    flags.push(TRADEOFF_VISUAL_FLAGS.TRADEOFF_LOST);
  }

  return {
    ok: flags.length === 0,
    flags,
    reason: flags[0] || null,
  };
}

function countSectionItems(block = "", headerPattern, stopPattern) {
  const lines = String(block || "")
    .split(/\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  let inSection = false;
  let count = 0;

  for (const line of lines) {
    if (headerPattern.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && stopPattern.test(line)) break;
    if (inSection && line) count += 1;
  }

  return count;
}

export function measureTradeoffVisibility(text = "") {
  const body = preserveReplyStructure(text);
  const paragraphs = splitParagraphs(body);
  const tradeoffParagraph = paragraphs.find(
    (paragraph) => /O que voc[eê] ganha/i.test(paragraph) && /O que voc[eê] abre m[aã]o/i.test(paragraph)
  );

  // 9.2O+ bullet layout spreads headers and items across paragraphs — measure on full body.
  const scope =
    tradeoffParagraph ||
    (/✅\s*O que voc[eê] ganha/i.test(body) && /⚠️\s*O que voc[eê] abre m[aã]o/i.test(body)
      ? body
      : "");

  const gainItemCount = scope
    ? countSectionItems(
        scope,
        /✅\s*O que voc[eê] ganha/i,
        /⚠️\s*O que voc[eê] abre m[aã]o/i
      )
    : 0;

  const sacrificeItemCount = scope
    ? countSectionItems(scope, /⚠️\s*O que voc[eê] abre m[aã]o/i, /^$/)
    : 0;

  // Bullet lines (•) also count when headers are isolated from items.
  const bulletGainCount = scope
    ? (scope.match(/•\s+[^\n]+/g) || []).filter((line) => {
        const gainStart = scope.search(/✅\s*O que voc[eê] ganha/i);
        const sacrificeStart = scope.search(/⚠️\s*O que voc[eê] abre m[aã]o/i);
        const lineStart = scope.indexOf(line);
        return gainStart >= 0 && lineStart > gainStart && (sacrificeStart < 0 || lineStart < sacrificeStart);
      }).length
    : 0;

  const bulletSacrificeCount = scope
    ? (scope.match(/•\s+[^\n]+/g) || []).filter((line) => {
        const sacrificeStart = scope.search(/⚠️\s*O que voc[eê] abre m[aã]o/i);
        const lineStart = scope.indexOf(line);
        return sacrificeStart >= 0 && lineStart > sacrificeStart;
      }).length
    : 0;

  return {
    hasVisualHeaders: hasVisualTradeoffEmphasis(body),
    hasGainHeader: /✅ O que voc[eê] ganha/i.test(body),
    hasSacrificeHeader: /⚠️ O que voc[eê] abre m[aã]o/i.test(body),
    gainItemCount: Math.max(gainItemCount, bulletGainCount),
    sacrificeItemCount: Math.max(sacrificeItemCount, bulletSacrificeCount),
    tradeoffBlockIsolated: !!scope,
    scannableLines: Math.max(gainItemCount, bulletGainCount) + Math.max(sacrificeItemCount, bulletSacrificeCount),
  };
}

export function shouldApplyTradeoffVisualEmphasis(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") return false;
  if (input.intent === "comparison") return false;

  const presentation = input.presentation || input.specialistPresentation || null;
  if (presentation?.tradeoff?.gains?.length && presentation?.tradeoff?.sacrifices?.length) {
    return true;
  }

  if (!preserveReplyStructure(input.reply || "")) return false;
  if (!hasTradeoffMarkers(input.reply || "")) return false;
  return true;
}

export function finalizeReplyWithTradeoffVisualEmphasis(input = {}) {
  if (!shouldApplyTradeoffVisualEmphasis(input)) {
    return {
      ok: false,
      text: preserveReplyStructure(input.reply || ""),
      error: "suppressed",
    };
  }

  const applied = applyTradeoffVisualEmphasis(input);
  if (!applied.ok) return applied;

  const text = preserveReplyStructure(applied.text);

  return {
    ...applied,
    text,
    visibility: measureTradeoffVisibility(text),
  };
}

export function auditTradeoffVisualEmphasis(before = "", after = "", context = {}) {
  const flags = verifyTradeoffPreservation(before, after, context).flags;
  const visibility = measureTradeoffVisibility(after);

  if (context.expectVisual && !visibility.hasVisualHeaders) {
    flags.push(TRADEOFF_VISUAL_FLAGS.VISUAL_NOT_APPLIED);
  }

  if (context.expectVisual && visibility.gainItemCount < 1) {
    flags.push(TRADEOFF_VISUAL_FLAGS.TRADEOFF_LOST);
  }

  if (context.expectVisual && visibility.sacrificeItemCount < 1) {
    flags.push(TRADEOFF_VISUAL_FLAGS.TRADEOFF_LOST);
  }

  if (countVisualTradeoffBlocks(after) > 1) {
    flags.push(TRADEOFF_VISUAL_FLAGS.DUPLICATED_TRADEOFF);
  }

  return {
    flags,
    visibility,
  };
}
