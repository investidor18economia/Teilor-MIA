/**
 * PATCH 12E — Automatic log redaction for observability.
 */

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[_-]?key|session|jwt|hmac|bearer|email|prompt|systemprompt|developerprompt)/i;

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export const REDACTED = "[REDACTED]";

export function redactString(value = "") {
  let text = String(value ?? "");
  text = text.replace(BEARER_PATTERN, "Bearer ****");
  text = text.replace(JWT_PATTERN, "jwt_****");
  text = text.replace(EMAIL_PATTERN, (match) => {
    const [local, domain] = match.split("@");
    if (!domain) return REDACTED;
    const maskedLocal = local.length <= 2 ? "**" : `${local.slice(0, 1)}***`;
    return `${maskedLocal}@${domain}`;
  });
  return text;
}

export function redactValue(key, value, depth = 0) {
  if (depth > 6) return REDACTED;
  if (value == null) return value;

  if (typeof value === "string") {
    if (SENSITIVE_KEY_PATTERN.test(String(key))) return REDACTED;
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(key, entry, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(childKey)) {
        out[childKey] = REDACTED;
      } else {
        out[childKey] = redactValue(childKey, childValue, depth + 1);
      }
    }
    return out;
  }

  return value;
}

export function redactLogFields(fields = {}) {
  return redactValue("root", fields);
}
