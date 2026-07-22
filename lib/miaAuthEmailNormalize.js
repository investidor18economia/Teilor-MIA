/**
 * PATCH 3.3A — Email normalization for authentication challenges.
 */

export const MIA_AUTH_EMAIL_MAX_LENGTH = 254;

export function normalizeAuthEmail(email = "") {
  const trimmed = String(email || "").trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.length > MIA_AUTH_EMAIL_MAX_LENGTH) return null;
  if (!trimmed.includes("@") || !trimmed.includes(".")) return null;
  return trimmed;
}

export function isValidAuthEmailFormat(email = "") {
  return normalizeAuthEmail(email) != null;
}
