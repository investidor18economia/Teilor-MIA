/**
 * PATCH 8.1 — Commercial search query sanitization for analytics persistence.
 *
 * Policy: store sanitized + truncated query text only — never raw headers/tokens.
 */

export const COMMERCIAL_SEARCH_QUERY_MAX_LENGTH = 280;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-.\s]?\d{4}\b/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s]+/gi;

/**
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function sanitizeCommercialSearchQueryText(value) {
  if (value == null) return null;
  let text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  text = text.replace(EMAIL_PATTERN, "[email_redacted]");
  text = text.replace(PHONE_PATTERN, "[phone_redacted]");
  text = text.replace(CPF_PATTERN, "[document_redacted]");
  text = text.replace(URL_PATTERN, "[url_redacted]");

  if (text.length > COMMERCIAL_SEARCH_QUERY_MAX_LENGTH) {
    return `${text.slice(0, COMMERCIAL_SEARCH_QUERY_MAX_LENGTH)}…`;
  }
  return text;
}

/**
 * Compare sanitized forms for query_changed detection.
 *
 * @param {string|null|undefined} left
 * @param {string|null|undefined} right
 */
export function areSanitizedCommercialQueriesEqual(left, right) {
  const a = sanitizeCommercialSearchQueryText(left);
  const b = sanitizeCommercialSearchQueryText(right);
  if (a == null && b == null) return true;
  return a === b;
}
