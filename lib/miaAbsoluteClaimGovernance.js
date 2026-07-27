/**
 * PATCH 4A.7V — Shared absolute-claim governance
 *
 * Single source of truth for detecting and governing over-confident language.
 * Used by Practical Consequence Engine (structured output) and Composition Guard (surface).
 */

export const ABSOLUTE_CLAIM_GOVERNANCE_VERSION = "4A.7V.0";

export const ABSOLUTE_CLAIM_PATTERNS = Object.freeze([
  /\bisso significa que\b/i,
  /\bsempre\s+(?:bom|boa|melhor|pior|certo|errado)\b/i,
  /\bsempre\b/i,
  /\bcom certeza absoluta\b/i,
  /\bcom certeza\b/i,
  /\bgarantindo\b/i,
  /\bgarante\b/i,
  /\bvai durar o dia inteiro\b/i,
  /\bvai durar\b/i,
  /\bvai rodar tudo\b/i,
]);

/** Ordered surface governance — most specific rules first. */
export const ABSOLUTE_SURFACE_GOVERNANCE_RULES = Object.freeze([
  {
    id: "sempre_qualifier",
    pattern: /\bsempre\s+(bom|boa|melhor|pior|certo|errado)\b/gi,
    replace: "costuma ser $1",
  },
  {
    id: "certeza_absoluta",
    pattern: /\bcom certeza absoluta\b/gi,
    replace: "com boa margem de confiança",
  },
  {
    id: "com_certeza",
    pattern: /\bcom certeza\b/gi,
    replace: "com boa probabilidade",
  },
  {
    id: "vai_rodar_tudo",
    pattern: /\bvai rodar tudo\b/gi,
    replace: "pode lidar bem com a maior parte do uso",
  },
  {
    id: "vai_durar_dia",
    pattern: /\bvai durar o dia inteiro\b/gi,
    replace: "pode durar a maior parte do dia",
  },
  {
    id: "vai_durar",
    pattern: /\bvai durar\b/gi,
    replace: "pode durar",
  },
  {
    id: "garantindo",
    pattern: /\bgarantindo\b/gi,
    replace: "tendendo a oferecer",
  },
  {
    id: "garante",
    pattern: /\bgarante\b/gi,
    replace: "tende a oferecer",
  },
  {
    id: "sempre",
    pattern: /\bsempre\b/gi,
    replace: "em geral",
  },
  {
    id: "isso_significa",
    pattern: /\bisso significa que\b/gi,
    replace: "isso sugere que",
  },
]);

const OVER_ASSERTIVE_FOR_LOW_CONFIDENCE = Object.freeze([
  /\bbem segura?\b/i,
  /\bopção bem segura\b/i,
  /\bsem d[úu]vida\b/i,
  /\bdefinitivamente\b/i,
  /\bcom certeza\b/i,
  /\bgarantid[oa]\b/i,
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function containsAbsoluteClaim(text = "") {
  const body = cleanText(text);
  if (!body) return false;
  return ABSOLUTE_CLAIM_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * @param {string} text
 * @returns {{ detected: boolean, matches: string[], text: string }}
 */
export function detectAbsoluteClaimsOnSurface(text = "") {
  const body = cleanText(text);
  if (!body) return { detected: false, matches: [], text: body };
  const matches = ABSOLUTE_CLAIM_PATTERNS.filter((pattern) => pattern.test(body)).map(
    (pattern) => pattern.source
  );
  return { detected: matches.length > 0, matches, text: body };
}

/**
 * Rule-based hedging for user-facing surface text.
 * @param {string} text
 */
export function governAbsoluteClaimsOnSurface(text = "") {
  let body = String(text || "");
  if (!body.trim()) return body;

  for (const rule of ABSOLUTE_SURFACE_GOVERNANCE_RULES) {
    body = body.replace(rule.pattern, rule.replace);
  }

  return cleanText(body);
}

/**
 * Validates reply assertiveness against practical consequence confidence levels.
 * @param {string} reply
 * @param {Array<{ confidence?: string, category?: string, practicalMeaning?: string, limitations?: string[] }>} consequences
 */
export function validateConfidenceReplyAlignment(reply = "", consequences = []) {
  const body = cleanText(reply);
  const list = Array.isArray(consequences) ? consequences.filter(Boolean) : [];
  if (!body || !list.length) {
    return { pass: true, reason: list.length ? "no_reply" : "no_consequences", details: {} };
  }

  const rank = { high: 3, medium: 2, low: 1, insufficient: 0 };
  const maxRank = Math.max(...list.map((entry) => rank[String(entry.confidence || "").toLowerCase()] ?? 0));
  const minRank = Math.min(...list.map((entry) => rank[String(entry.confidence || "").toLowerCase()] ?? 0));
  const overAssertive = OVER_ASSERTIVE_FOR_LOW_CONFIDENCE.some((pattern) => pattern.test(body));
  const hasAbsolute = containsAbsoluteClaim(body);

  if (hasAbsolute) {
    return {
      pass: false,
      reason: "absolute_claim_in_reply",
      details: { maxRank, minRank, overAssertive },
    };
  }

  if (maxRank <= 1 && overAssertive) {
    return {
      pass: false,
      reason: "over_assertive_for_low_confidence",
      details: { maxRank, minRank, overAssertive: true },
    };
  }

  return {
    pass: true,
    reason: "aligned",
    details: { maxRank, minRank, consequenceCount: list.length },
  };
}
