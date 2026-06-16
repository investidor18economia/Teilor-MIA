/**
 * PATCH 8.0B.3 — Tone Compliance Guard
 *
 * Validação e correção determinística de estilo na saída.
 * Downstream only — não altera decisão, winner, ranking ou routing.
 */

import {
  TONE_PROFILES,
  detectStyleLeaks as detectBaseStyleLeaks,
} from "./miaConversationalTone.js";

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu;

const VULGARITY_PATTERN =
  /\b(crl|krl|pqp|caralho|carai|porra|cacete|fdp|bct|pnc|merda|puto|puta)\b/gi;

const LAUGHTER_PATTERN = /\b(kkk+|rsrs+|hahaha+|hehe+|huehue+)\b/gi;

const PROFILE_RULES = Object.freeze({
  [TONE_PROFILES.FORMAL_POLITE]: {
    block: [
      /\bblz\b/gi,
      /\bvlw\b/gi,
      /\bmano\b/gi,
      /\bcara\b/gi,
      LAUGHTER_PATTERN,
      /\btmj\b/gi,
      /\bshow\b/gi,
    ],
    replace: [
      [/\bblz\b/gi, "certo"],
      [/\bvlw\b/gi, "obrigado"],
      [/\btmj\b/gi, "obrigado"],
    ],
    remove: [/\bmano\b/gi, /\bcara\b/gi, LAUGHTER_PATTERN, /\bshow\b/gi],
  },
  [TONE_PROFILES.INFORMAL_LIGHT]: {
    block: [
      /\b(parça|parca|truta)\b/gi,
      /\bmanooo+\b/gi,
      /\b(slk|seloko|coe)\b/gi,
      VULGARITY_PATTERN,
      /\b(kkkkk+)\b/gi,
      /\bbrabo demais\b/gi,
    ],
    replace: [[/\b(kkk+)\b/gi, ""]],
    remove: [
      /\b(parça|parca|truta|slk|seloko|coe)\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
      /\bbrabo demais\b/gi,
      /\bmano\b/gi,
    ],
  },
  [TONE_PROFILES.INFORMAL_HIGH]: {
    block: [
      /\b(parça|parca|fi|truta)\b/gi,
      /\bmanooo+\b/gi,
      /\bmano\b/gi,
      /\b(slk|seloko|coe)\b/gi,
      VULGARITY_PATTERN,
      /\b(kkkkk+)\b/gi,
    ],
    replace: [[/\b(kkk+)\b/gi, ""]],
    remove: [
      /\b(parça|parca|fi|truta|slk|seloko|coe)\b/gi,
      /\bmano\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
    ],
  },
  [TONE_PROFILES.TECHNICAL]: {
    block: [
      /\bentendo sua preocupa(c|ç)(a|ã)o\b/gi,
      /\bfica tranquilo\b/gi,
      /\bsem stress\b/gi,
      /\brelaxa\b/gi,
      LAUGHTER_PATTERN,
    ],
    replace: [],
    remove: [
      /\bentendo sua preocupa(c|ç)(a|ã)o\b/gi,
      /\bfica tranquilo\b/gi,
      /\bsem stress\b/gi,
      /\brelaxa\b/gi,
      LAUGHTER_PATTERN,
    ],
  },
  [TONE_PROFILES.LAYPERSON]: {
    block: [
      /\bbenchmark\b/gi,
      /\blat(e|ê)ncia\b/gi,
      /\bthrottling\b/gi,
      /\bipc\b/gi,
      /\btdp\b/gi,
      /\bnvme\b/gi,
      /\bchipset\b/gi,
    ],
    replace: [
      [/\bbenchmark\b/gi, "desempenho"],
      [/\blat(e|ê)ncia\b/gi, "demora"],
      [/\bthrottling\b/gi, "limitação de velocidade"],
      [/\bipc\b/gi, "eficiência"],
      [/\btdp\b/gi, "consumo"],
      [/\bnvme\b/gi, "armazenamento rápido"],
      [/\bchipset\b/gi, "processador"],
    ],
    remove: [],
  },
  [TONE_PROFILES.ANXIOUS_ANTI_REGRET]: {
    block: [
      /\bdesastre\b/gi,
      /\bcatastrof\w*\b/gi,
      /\bnunca compre\b/gi,
      /\bfuja\b/gi,
      /\bhorr(i|í)vel\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
    ],
    replace: [],
    remove: [
      /\bdesastre\b/gi,
      /\bcatastrof\w*\b/gi,
      /\bnunca compre\b/gi,
      /\bfuja\b/gi,
      /\bhorr(i|í)vel\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
    ],
  },
  [TONE_PROFILES.IRRITATED]: {
    block: [VULGARITY_PATTERN, LAUGHTER_PATTERN, /\bcalma a[ií]\b/gi, /\bvc que pediu\b/gi],
    replace: [],
    remove: [VULGARITY_PATTERN, LAUGHTER_PATTERN, /\bcalma a[ií]\b/gi, /\bvc que pediu\b/gi, /\bmano\b/gi],
  },
  [TONE_PROFILES.RUSHED]: {
    block: [/\bcomo eu j[aá] disse\b/gi, LAUGHTER_PATTERN],
    replace: [],
    remove: [LAUGHTER_PATTERN, /\bcomo eu j[aá] disse\b/gi],
  },
  [TONE_PROFILES.NEUTRAL_DEFAULT]: {
    block: [VULGARITY_PATTERN, /\b(parça|parca|slk|seloko)\b/gi, LAUGHTER_PATTERN],
    replace: [],
    remove: [VULGARITY_PATTERN, /\b(parça|parca|slk|seloko|mano)\b/gi, LAUGHTER_PATTERN],
  },
});

const GLOBAL_REMOVE = [VULGARITY_PATTERN, LAUGHTER_PATTERN, /\b(compra logo|garanto 100)\b/gi];

function normalizeProfileKey(toneProfile) {
  if (!toneProfile) return TONE_PROFILES.NEUTRAL_DEFAULT;
  if (typeof toneProfile === "string") return toneProfile;
  return toneProfile.toneProfile || TONE_PROFILES.NEUTRAL_DEFAULT;
}

function collectPatternViolations(text, patterns = [], code) {
  const violations = [];
  for (const pattern of patterns) {
    if (patternMatches(text, pattern)) violations.push(code);
  }
  return violations;
}

function countEmojis(text = "") {
  const matches = String(text || "").match(EMOJI_PATTERN);
  return matches ? matches.length : 0;
}

function collapseWhitespace(text = "") {
  return String(text || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function patternMatches(text, pattern) {
  if (!pattern || typeof pattern.test !== "function") return false;
  const re = new RegExp(pattern.source, pattern.flags);
  return re.test(String(text || ""));
}

function applyReplacements(text, replacements = []) {
  let out = text;
  for (const [pattern, replacement] of replacements) {
    const re = new RegExp(pattern.source, pattern.flags);
    out = out.replace(re, replacement);
  }
  return out;
}

function applyRemovals(text, removals = []) {
  let out = text;
  for (const pattern of removals) {
    const re = new RegExp(pattern.source, pattern.flags);
    out = out.replace(re, "");
  }
  return out;
}

/**
 * @param {{ response?: string, toneProfile?: object|string }} input
 * @returns {string[]}
 */
export function detectStyleLeaks(input = {}) {
  const response = String(input.response || "");
  const toneProfile =
    typeof input.toneProfile === "object"
      ? input.toneProfile
      : { toneProfile: normalizeProfileKey(input.toneProfile) };
  const profileKey = normalizeProfileKey(toneProfile);
  const rules = PROFILE_RULES[profileKey] || PROFILE_RULES[TONE_PROFILES.NEUTRAL_DEFAULT];
  const violations = [];

  for (const leak of detectBaseStyleLeaks(response, toneProfile)) {
    violations.push(leak);
  }

  for (const pattern of rules.block || []) {
    if (patternMatches(response, pattern)) violations.push(`profile:${profileKey}`);
  }

  for (const pattern of GLOBAL_REMOVE) {
    if (patternMatches(response, pattern)) violations.push("global:forbidden");
  }

  const emojiCount = countEmojis(response);
  if (emojiCount > 1) violations.push("emojiLeak");
  if (emojiCount > 0 && toneProfile && !toneProfile.shouldUseEmoji) {
    violations.push("emojiMisuse");
  }

  return [...new Set(violations)];
}

/**
 * @param {{ response?: string, toneProfile?: object|string }} input
 * @returns {{ response: string, violations: string[], corrected: boolean, remainingViolations?: string[] }}
 */
export function applyToneComplianceGuard(input = {}) {
  const original = String(input.response || "");
  const toneProfile =
    typeof input.toneProfile === "object"
      ? input.toneProfile
      : { toneProfile: normalizeProfileKey(input.toneProfile) };
  const profileKey = normalizeProfileKey(toneProfile);
  const rules = PROFILE_RULES[profileKey] || PROFILE_RULES[TONE_PROFILES.NEUTRAL_DEFAULT];

  const violations = detectStyleLeaks({ response: original, toneProfile });
  if (violations.length === 0) {
    return { response: original, violations: [], corrected: false, remainingViolations: [] };
  }

  let correctedText = original;

  correctedText = applyReplacements(correctedText, rules.replace || []);
  correctedText = applyRemovals(correctedText, rules.remove || []);
  correctedText = applyRemovals(correctedText, GLOBAL_REMOVE);

  if (!toneProfile.shouldUseEmoji) {
    correctedText = correctedText.replace(EMOJI_PATTERN, "");
  } else {
    const emojis = correctedText.match(EMOJI_PATTERN) || [];
    if (emojis.length > 1) {
      let kept = 0;
      correctedText = correctedText.replace(EMOJI_PATTERN, (m) => (kept++ === 0 ? m : ""));
    }
  }

  correctedText = collapseWhitespace(correctedText);

  const remainingViolations = detectStyleLeaks({
    response: correctedText,
    toneProfile,
  });

  return {
    response: correctedText,
    violations,
    corrected: correctedText !== original,
    remainingViolations,
  };
}

export { TONE_PROFILES };
