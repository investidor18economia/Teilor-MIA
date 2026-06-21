/**
 * PATCH 9.2O — Specialist Presentation Contract
 *
 * Contrato estruturado para preservar blocos specialist (decisão, evidência,
 * tradeoff, closing) sem reparse reverso por regex nas camadas posteriores.
 */

import { dedupeTradeoffItemsByFamily } from "./miaSemanticFamilyAllocationEngine.js";

export const SPECIALIST_PRESENTATION_CONTRACT_VERSION = "9.2Q.1";

export const PRESENTATION_BLOCK_TYPES = Object.freeze({
  INTRO: "intro",
  EVIDENCE: "evidence",
  INSIGHT: "insight",
  GAIN_LIST: "gain_list",
  LOSS_LIST: "loss_list",
  CLOSING: "closing",
  SUPPORT: "support",
});

const TRADEOFF_TAIL_PATTERN =
  /(?:\n\s*\n|\s)(?:Resumindo o que você ganha|Na prática, a escolha fica assim|Se você seguir por esse caminho|✅\s*O que voc[eê] ganha)[\s\S]*$/i;

const CLOSING_TAIL_PATTERNS = [
  /(?:\n\s*\n|\s)(Esse é o próximo passo[\s\S]*)$/i,
  /(?:\n\s*\n|\s)(Por aqui, eu fecharia[\s\S]*)$/i,
  /(?:\n\s*\n|\s)(Pensando no uso que você descreveu[\s\S]*)$/i,
  /(?:\n\s*\n|\s)(Para quem prioriza[\s\S]*)$/i,
];

const GAIN_HEADER = "✅ O que você ganha";
const SACRIFICE_HEADER = "⚠️ O que você abre mão";

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

function capitalizePhrase(text = "") {
  const body = cleanText(String(text || "").replace(/[.!?…]+$/g, ""));
  if (!body) return "";
  return `${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}

/**
 * @returns {{
 *   intro: string[],
 *   evidence: string[],
 *   insight: string[],
 *   tradeoff: { gains: string[], sacrifices: string[] },
 *   closing: string|null,
 *   blocks: Array<{ type: string, items?: string[], text?: string }>,
 *   version: string,
 * }}
 */
export function createSpecialistPresentationContract() {
  return {
    intro: [],
    evidence: [],
    insight: [],
    tradeoff: { gains: [], sacrifices: [] },
    closing: null,
    blocks: [],
    version: SPECIALIST_PRESENTATION_CONTRACT_VERSION,
  };
}

/**
 * @param {string} text
 */
export function isStructuredSpecialistReply(text = "") {
  const body = preserveReplyStructure(text);
  if (!body) return false;

  const hasTradeoffMarkers = /✅/.test(body) && /⚠️/.test(body);
  const hasVisualTradeoff =
    /O que voc[eê] ganha/i.test(body) && /O que voc[eê] abre m[aã]o/i.test(body);
  const hasSpecialistCognition =
    /Minha escolha|Eu iria|ficou no topo|ganha for[cç]a|detalhe que muita gente/i.test(body);

  return hasSpecialistCognition && (hasTradeoffMarkers || hasVisualTradeoff);
}

/**
 * @param {string} text
 */
export function hasDetectableSpecialistPresentation(text = "") {
  const body = preserveReplyStructure(text);
  if (!body) return false;

  const hasGainStructure =
    /O que voc[eê] ganha/i.test(body) ||
    (/✅/.test(body) && /\b(ganha|você leva|fica com)\b/i.test(body));
  const hasLossStructure =
    /O que voc[eê] abre m[aã]o/i.test(body) ||
    (/⚠️/.test(body) && /(abre m[aã]o|n[aã]o ter[aá]|em troca)/i.test(body));

  return hasGainStructure && hasLossStructure;
}

/**
 * @param {{ gains?: string[], sacrifices?: string[] }} tradeoff
 */
export function buildPresentationBlocksFromTradeoff(tradeoff = {}) {
  const gains = (tradeoff.gains || []).filter(Boolean);
  const sacrifices = (tradeoff.sacrifices || []).filter(Boolean);
  const blocks = [];

  if (gains.length) {
    blocks.push({ type: PRESENTATION_BLOCK_TYPES.GAIN_LIST, items: [...gains] });
  }
  if (sacrifices.length) {
    blocks.push({ type: PRESENTATION_BLOCK_TYPES.LOSS_LIST, items: [...sacrifices] });
  }

  return blocks;
}

/**
 * @param {ReturnType<typeof createSpecialistPresentationContract>} contract
 */
export function syncPresentationBlocks(contract) {
  if (!contract) return contract;

  const blocks = [];

  for (const entry of contract.intro || []) {
    if (entry) blocks.push({ type: PRESENTATION_BLOCK_TYPES.INTRO, text: entry });
  }
  for (const entry of contract.evidence || []) {
    if (entry) blocks.push({ type: PRESENTATION_BLOCK_TYPES.EVIDENCE, text: entry });
  }
  for (const entry of contract.insight || []) {
    if (entry) blocks.push({ type: PRESENTATION_BLOCK_TYPES.INSIGHT, text: entry });
  }

  blocks.push(...buildPresentationBlocksFromTradeoff(contract.tradeoff));

  if (contract.closing) {
    blocks.push({ type: PRESENTATION_BLOCK_TYPES.CLOSING, text: contract.closing });
  }

  contract.blocks = blocks;
  return contract;
}

/**
 * @param {{ gains?: string[], sacrifices?: string[] }} tradeoff
 * @param {{ useBullets?: boolean, maxItems?: number }} [options]
 */
export function renderTradeoffPresentationBlock(tradeoff = {}, options = {}) {
  const useBullets = options.useBullets !== false;
  const maxItems = options.maxItems ?? 3;

  const gains = dedupeTradeoffItemsByFamily(
    (tradeoff.gains || []).map((entry) => cleanText(entry)).filter(Boolean),
    maxItems
  );
  const sacrifices = dedupeTradeoffItemsByFamily(
    (tradeoff.sacrifices || []).map((entry) => cleanText(entry)).filter(Boolean),
    maxItems
  );

  if (!gains.length || !sacrifices.length) {
    return "";
  }

  const formatItem = (entry) => {
    const phrase = capitalizePhrase(entry);
    return useBullets ? `• ${phrase}` : phrase;
  };

  const gainLines = [GAIN_HEADER, ...gains.map(formatItem)];
  const sacrificeLines = [SACRIFICE_HEADER, ...sacrifices.map(formatItem)];

  return [...gainLines, "", ...sacrificeLines].join("\n\n").trim();
}

/**
 * @param {ReturnType<typeof createSpecialistPresentationContract>} contract
 * @param {string} [bodyPrefix]
 */
export function assembleSpecialistReplyFromContract(contract, bodyPrefix = "") {
  if (!contract) return cleanText(bodyPrefix);

  const parts = [];

  if (bodyPrefix && cleanText(bodyPrefix)) {
    parts.push(preserveReplyStructure(bodyPrefix));
  } else {
    for (const entry of [...(contract.intro || []), ...(contract.evidence || []), ...(contract.insight || [])]) {
      if (cleanText(entry)) parts.push(preserveReplyStructure(entry));
    }
  }

  const tradeoffBlock = renderTradeoffPresentationBlock(contract.tradeoff);
  if (tradeoffBlock) parts.push(tradeoffBlock);

  if (contract.closing) {
    parts.push(preserveReplyStructure(contract.closing));
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

/**
 * Remove tradeoff inline/visual e closing do texto para re-montagem via contrato.
 * @param {string} reply
 */
export function stripSpecialistPresentationTail(reply = "") {
  let body = preserveReplyStructure(reply);
  if (!body) return "";

  for (const pattern of CLOSING_TAIL_PATTERNS) {
    body = body.replace(pattern, "").trim();
  }

  body = body.replace(TRADEOFF_TAIL_PATTERN, "").trim();
  return body;
}

/**
 * @param {ReturnType<typeof createSpecialistPresentationContract>} contract
 * @param {string} closingText
 */
export function setPresentationClosing(contract, closingText = "") {
  if (!contract) return null;
  const text = preserveReplyStructure(closingText);
  contract.closing = text || null;
  syncPresentationBlocks(contract);
  return contract;
}

/**
 * @param {ReturnType<typeof createSpecialistPresentationContract>|null|undefined} contract
 * @param {string} finalReply
 */
export function verifySpecialistPresentationGuard(contract, finalReply = "") {
  if (!contract?.tradeoff?.gains?.length) {
    return { ok: true, skipped: true };
  }

  const reply = preserveReplyStructure(finalReply);
  if (!hasDetectableSpecialistPresentation(reply)) {
    return { ok: false, reason: "presentation_lost", flags: ["PRESENTATION_LOST"] };
  }

  const renderedGains = dedupeTradeoffItemsByFamily(contract.tradeoff.gains || [], 3);
  const missingGain = renderedGains.some((gain) => {
    const key = cleanText(gain).slice(0, Math.min(24, cleanText(gain).length));
    return key.length >= 8 && !reply.toLowerCase().includes(key.toLowerCase().slice(0, 16));
  });

  if (missingGain && renderedGains.length <= 3) {
    return { ok: false, reason: "gain_content_lost", flags: ["GAIN_CONTENT_LOST"] };
  }

  if (contract.closing) {
    const closingKey = cleanText(contract.closing).slice(0, 20);
    if (closingKey.length >= 12 && !reply.includes(closingKey.slice(0, 16))) {
      return { ok: false, reason: "closing_lost", flags: ["CLOSING_LOST"] };
    }
  }

  const doubleNewlines = (reply.match(/\n\n/g) || []).length;
  if (doubleNewlines < 2 && renderedGains.length > 1) {
    return { ok: false, reason: "structure_collapsed", flags: ["STRUCTURE_COLLAPSED"] };
  }

  return { ok: true };
}

/**
 * @param {{
 *   reply?: string,
 *   presentation?: ReturnType<typeof createSpecialistPresentationContract>|null,
 *   allowDegraded?: boolean,
 * }} input
 */
export function finalizeSpecialistPresentationRecovery(input = {}) {
  const contract = input.presentation || null;
  const originalReply = preserveReplyStructure(input.reply || "");

  if (!contract?.tradeoff?.gains?.length) {
    return {
      ok: true,
      text: originalReply,
      applied: false,
      presentation: contract,
      error: null,
    };
  }

  const bodyPrefix = stripSpecialistPresentationTail(originalReply);
  const assembled = assembleSpecialistReplyFromContract(contract, bodyPrefix);
  const guard = verifySpecialistPresentationGuard(contract, assembled);

  if (!guard.ok) {
    if (input.allowDegraded) {
      return {
        ok: true,
        text: originalReply,
        applied: false,
        presentation: contract,
        error: guard.reason,
        flags: guard.flags,
      };
    }
    return {
      ok: false,
      text: originalReply,
      applied: false,
      presentation: contract,
      error: guard.reason,
      flags: guard.flags,
    };
  }

  return {
    ok: true,
    text: assembled,
    applied: assembled !== originalReply,
    presentation: contract,
    error: null,
  };
}

/**
 * @param {{
 *   intro?: string[],
 *   evidence?: string[],
 *   insight?: string[],
 *   tradeoffSources?: { gains?: string[], sacrifices?: string[] }|null,
 * }} input
 */
export function buildSpecialistPresentationContract(input = {}) {
  const contract = createSpecialistPresentationContract();

  contract.intro = (input.intro || []).map((entry) => preserveReplyStructure(entry)).filter(Boolean);
  contract.evidence = (input.evidence || []).map((entry) => preserveReplyStructure(entry)).filter(Boolean);
  contract.insight = (input.insight || []).map((entry) => preserveReplyStructure(entry)).filter(Boolean);

  const sources = input.tradeoffSources || {};
  contract.tradeoff = {
    gains: [...(sources.gains || [])].map((entry) => cleanText(entry)).filter(Boolean),
    sacrifices: [...(sources.sacrifices || [])].map((entry) => cleanText(entry)).filter(Boolean),
  };

  return syncPresentationBlocks(contract);
}

/**
 * Métricas leves para auditoria.
 * @param {string} text
 */
export function measureSpecialistPresentation(text = "") {
  const body = preserveReplyStructure(text);
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);

  return {
    paragraphs: paragraphs.length,
    doubleNewlines: (body.match(/\n\n/g) || []).length,
    hasGainHeader: /O que voc[eê] ganha/i.test(body),
    hasSacrificeHeader: /O que voc[eê] abre mão/i.test(body),
    bulletCount: (body.match(/•/g) || []).length,
    checkmarks: (body.match(/✅/g) || []).length,
    warnings: (body.match(/⚠️/g) || []).length,
    structured: isStructuredSpecialistReply(body),
    detectable: hasDetectableSpecialistPresentation(body),
  };
}

const INLINE_GAIN_HEADER_PATTERN = /O que voc[eê] ganha[ \t\u00A0]*•/i;
const INLINE_LOSS_HEADER_PATTERN = /O que voc[eê] abre m[aã]o[ \t\u00A0]*•/i;
const INLINE_BULLET_CHAIN_PATTERN = /•[^.\n]+?\.\s*•/;

/**
 * PATCH 9.2Q — Wire contract guard (HTTP payload validation).
 * @param {{
 *   reply?: string,
 *   presentation?: ReturnType<typeof createSpecialistPresentationContract>|null,
 *   stage?: string,
 * }} input
 */
export function verifySpecialistWireContract(input = {}) {
  const contract = input.presentation || null;
  const stage = input.stage || "wire";

  if (!contract?.tradeoff?.gains?.length) {
    return { ok: true, skipped: true, stage };
  }

  const reply = preserveReplyStructure(input.reply || "");
  const flags = [];
  const paragraphs = reply.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean);
  const doubleNewlines = (reply.match(/\n\n/g) || []).length;
  const gainCount = contract.tradeoff.gains.length;
  const sacrificeCount = contract.tradeoff.sacrifices?.length || 0;

  if (!hasDetectableSpecialistPresentation(reply)) {
    flags.push("PRESENTATION_LOST");
  }

  if (gainCount > 0 && doubleNewlines < Math.min(4, gainCount + sacrificeCount + 1)) {
    flags.push("PARAGRAPH_BREAKS_LOST");
  }

  if (INLINE_GAIN_HEADER_PATTERN.test(reply)) {
    flags.push("INLINE_GAIN_HEADER");
  }

  if (INLINE_LOSS_HEADER_PATTERN.test(reply)) {
    flags.push("INLINE_LOSS_HEADER");
  }

  if (INLINE_BULLET_CHAIN_PATTERN.test(reply)) {
    flags.push("INLINE_BULLET_CHAIN");
  }

  if (gainCount >= 2 && paragraphs.length < gainCount + 2) {
    flags.push("INSUFFICIENT_PARAGRAPH_BLOCKS");
  }

  if (/O que voc[eê] ganha/i.test(reply) && !/✅/.test(reply)) {
    flags.push("GAIN_MARKER_MISSING");
  }

  if (/O que voc[eê] abre m[aã]o/i.test(reply) && !/⚠️?/.test(reply)) {
    flags.push("LOSS_MARKER_MISSING");
  }

  if (contract.closing) {
    const closingKey = cleanText(contract.closing).slice(0, 20);
    if (closingKey.length >= 12) {
      const closingIdx = reply.indexOf(closingKey.slice(0, 16));
      if (closingIdx < 0) {
        flags.push("CLOSING_LOST");
      } else {
        const tail = reply.slice(closingIdx);
        if (!/^\S/.test(tail) && paragraphs.length > 0) {
          const closingPara = paragraphs[paragraphs.length - 1];
          if (closingPara && contract.tradeoff.sacrifices?.length) {
            const lastSacrifice = cleanText(contract.tradeoff.sacrifices[contract.tradeoff.sacrifices.length - 1]);
            if (lastSacrifice && closingPara.includes(lastSacrifice.slice(0, 12))) {
              flags.push("CLOSING_GLUED_TO_LOSS");
            }
          }
        }
      }
    }
  }

  return {
    ok: flags.length === 0,
    flags,
    stage,
    doubleNewlines,
    paragraphCount: paragraphs.length,
    detectable: hasDetectableSpecialistPresentation(reply),
  };
}

/**
 * PATCH 9.2Q — Restore specialist structure after tone guard if wire contract failed.
 * @param {{
 *   replyBeforeTone?: string,
 *   reply?: string,
 *   presentation?: ReturnType<typeof createSpecialistPresentationContract>|null,
 * }} input
 */
export function finalizeSpecialistWireContractPreservation(input = {}) {
  const contract = input.presentation || null;
  const replyBeforeTone = preserveReplyStructure(input.replyBeforeTone || input.reply || "");
  let currentReply = preserveReplyStructure(input.reply || "");

  if (!contract?.tradeoff?.gains?.length) {
    return {
      ok: true,
      text: currentReply,
      applied: false,
      presentation: contract,
      error: null,
    };
  }

  const postToneGuard = verifySpecialistWireContract({
    reply: currentReply,
    presentation: contract,
    stage: "post_tone",
  });

  if (postToneGuard.ok) {
    return {
      ok: true,
      text: currentReply,
      applied: false,
      presentation: contract,
      guard: postToneGuard,
      error: null,
    };
  }

  const recovery = finalizeSpecialistPresentationRecovery({
    reply: replyBeforeTone,
    presentation: contract,
  });

  if (recovery.ok && recovery.text) {
    const recoveredGuard = verifySpecialistWireContract({
      reply: recovery.text,
      presentation: contract,
      stage: "post_recovery",
    });

    if (recoveredGuard.ok) {
      return {
        ok: true,
        text: recovery.text,
        applied: true,
        presentation: contract,
        guard: recoveredGuard,
        recoveredFrom: postToneGuard.flags,
        error: null,
      };
    }
  }

  return {
    ok: false,
    text: currentReply,
    applied: false,
    presentation: contract,
    guard: postToneGuard,
    error: "wire_contract_failed",
    flags: postToneGuard.flags,
  };
}
