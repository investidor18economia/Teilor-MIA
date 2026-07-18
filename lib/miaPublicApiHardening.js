/**
 * PATCH 12C — Public API request/response hardening for MIA perimeter routes.
 * No cognition — validation, CORS, headers, and response sanitization only.
 */

export const PUBLIC_API_REASON_CODES = Object.freeze({
  METHOD_NOT_ALLOWED: "public_api_method_not_allowed",
  UNSUPPORTED_MEDIA_TYPE: "public_api_unsupported_media_type",
  INVALID_REQUEST: "public_api_invalid_request",
  PAYLOAD_TOO_LARGE: "public_api_payload_too_large",
  INTERNAL_ERROR: "mia_internal_error",
});

export const MIA_PUBLIC_MAX_BODY_BYTES_ENV = "MIA_PUBLIC_MAX_BODY_BYTES";
export const MIA_PUBLIC_MAX_TEXT_CHARS_ENV = "MIA_PUBLIC_MAX_TEXT_CHARS";
export const MIA_PUBLIC_MAX_MESSAGES_ENV = "MIA_PUBLIC_MAX_MESSAGES";
export const MIA_PUBLIC_MAX_MESSAGE_CHARS_ENV = "MIA_PUBLIC_MAX_MESSAGE_CHARS";
export const MIA_PUBLIC_MAX_IMAGE_BASE64_CHARS_ENV = "MIA_PUBLIC_MAX_IMAGE_BASE64_CHARS";
export const MIA_PUBLIC_ALLOWED_ORIGINS_ENV = "MIA_PUBLIC_ALLOWED_ORIGINS";
export const MIA_PUBLIC_DEBUG_ENABLED_ENV = "MIA_PUBLIC_DEBUG_ENABLED";

const DEFAULT_MAX_BODY_BYTES = 6_000_000;
const DEFAULT_MAX_TEXT_CHARS = 20_000;
const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_MAX_MESSAGE_CHARS = 20_000;
const DEFAULT_MAX_IMAGE_BASE64_CHARS = 5_500_000;
const DEFAULT_MAX_ID_CHARS = 256;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://economia-ai.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const INTERNAL_RESPONSE_KEYS = new Set([
  "mia_debug",
  "runtime_precedence",
  "runtime_enforcement",
  "pipelineTrace",
  "stack",
  "errorStack",
  "internalError",
  "rawError",
  "rawResponse",
  "providerRawResponse",
  "providerDiagnostics",
  "internalDiagnostics",
  "prompt",
  "systemPrompt",
  "developerPrompt",
  "upstream",
  "upstreamHeaders",
  "upstreamBody",
]);

const SECRET_PATTERNS = [
  /API_SHARED_KEY/i,
  /minha_chave_/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /service_role/i,
  /BEGIN PRIVATE KEY/i,
  /sk-proj-[A-Za-z0-9_-]+/i,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

function parsePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return defaultValue;
}

export function resolvePublicApiLimits(env = process.env) {
  return {
    maxBodyBytes: parsePositiveInt(env[MIA_PUBLIC_MAX_BODY_BYTES_ENV], DEFAULT_MAX_BODY_BYTES),
    maxTextChars: parsePositiveInt(env[MIA_PUBLIC_MAX_TEXT_CHARS_ENV], DEFAULT_MAX_TEXT_CHARS),
    maxMessages: parsePositiveInt(env[MIA_PUBLIC_MAX_MESSAGES_ENV], DEFAULT_MAX_MESSAGES),
    maxMessageChars: parsePositiveInt(
      env[MIA_PUBLIC_MAX_MESSAGE_CHARS_ENV],
      DEFAULT_MAX_MESSAGE_CHARS
    ),
    maxImageBase64Chars: parsePositiveInt(
      env[MIA_PUBLIC_MAX_IMAGE_BASE64_CHARS_ENV],
      DEFAULT_MAX_IMAGE_BASE64_CHARS
    ),
    maxIdChars: DEFAULT_MAX_ID_CHARS,
  };
}

export function isPublicDebugEnabled(env = process.env) {
  return parseBoolean(env[MIA_PUBLIC_DEBUG_ENABLED_ENV], false);
}

export function resolveAllowedOrigins(env = process.env) {
  const raw = String(env[MIA_PUBLIC_ALLOWED_ORIGINS_ENV] || "").trim();
  const fromEnv = raw
    ? raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]);
}

export function isJsonContentType(contentType = "") {
  const normalized = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return normalized === "application/json";
}

export function applyPublicSecurityHeaders(res, { varyOrigin = false } = {}) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (varyOrigin) {
    res.setHeader("Vary", "Origin");
  }
}

export function applyPublicCorsHeaders(req, res, env = process.env) {
  const origin = String(req.headers?.origin || req.headers?.Origin || "").trim();
  if (!origin) return { originAllowed: true, crossOrigin: false };

  const allowedOrigins = resolveAllowedOrigins(env);
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    applyPublicSecurityHeaders(res, { varyOrigin: true });
    return { originAllowed: true, crossOrigin: true };
  }

  return { originAllowed: false, crossOrigin: true };
}

export function buildPublicApiError(statusCode, error, reasonCode, reply) {
  return {
    statusCode,
    payload: {
      error,
      reasonCode,
      reply,
    },
  };
}

export function validatePublicHttpMethod(req, allowedMethods = ["POST"]) {
  const method = String(req.method || "").toUpperCase();
  if (allowedMethods.includes(method)) {
    return { ok: true, method };
  }
  return {
    ok: false,
    response: buildPublicApiError(
      405,
      "method_not_allowed",
      PUBLIC_API_REASON_CODES.METHOD_NOT_ALLOWED,
      "Esse método não é suportado para esta rota."
    ),
    allowHeader: allowedMethods.join(", "),
  };
}

export function validatePublicContentType(req, { requireBody = true } = {}) {
  if (!requireBody) return { ok: true };

  const contentType = req.headers?.["content-type"] || req.headers?.["Content-Type"] || "";
  if (!contentType) {
    return { ok: true, missing: true };
  }

  if (isJsonContentType(contentType)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: buildPublicApiError(
      415,
      "unsupported_media_type",
      PUBLIC_API_REASON_CODES.UNSUPPORTED_MEDIA_TYPE,
      "Esse formato de solicitação não é suportado."
    ),
  };
}

function estimateJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasPrototypePollutionKeys(value) {
  if (!isPlainObject(value)) return false;
  return ["__proto__", "prototype", "constructor"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function validateMessageEntry(message, limits) {
  if (!isPlainObject(message)) return "messages entries must be objects";
  const role = message.role;
  const content = message.content;
  if (role != null && typeof role !== "string") return "message role must be a string";
  if (content != null && typeof content !== "string") return "message content must be a string";
  if (typeof content === "string" && content.length > limits.maxMessageChars) {
    return "message content exceeds limit";
  }
  return null;
}

export function validatePublicChatRequestBody(body, env = process.env) {
  const limits = resolvePublicApiLimits(env);

  if (body == null) {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  if (!isPlainObject(body)) {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  if (hasPrototypePollutionKeys(body)) {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  const bodyBytes = estimateJsonBytes(body);
  if (bodyBytes > limits.maxBodyBytes) {
    return {
      ok: false,
      response: buildPublicApiError(
        413,
        "payload_too_large",
        PUBLIC_API_REASON_CODES.PAYLOAD_TOO_LARGE,
        "Essa solicitação ficou grande demais para ser processada. Reduza o conteúdo e tente novamente."
      ),
    };
  }

  if (body.text != null && typeof body.text !== "string") {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  if (typeof body.text === "string" && body.text.length > limits.maxTextChars) {
    return {
      ok: false,
      response: buildPublicApiError(
        413,
        "payload_too_large",
        PUBLIC_API_REASON_CODES.PAYLOAD_TOO_LARGE,
        "Essa solicitação ficou grande demais para ser processada. Reduza o conteúdo e tente novamente."
      ),
    };
  }

  if (body.messages != null) {
    if (!Array.isArray(body.messages)) {
      return {
        ok: false,
        response: buildPublicApiError(
          400,
          "invalid_request",
          PUBLIC_API_REASON_CODES.INVALID_REQUEST,
          "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
        ),
      };
    }

    if (body.messages.length > limits.maxMessages) {
      return {
        ok: false,
        response: buildPublicApiError(
          413,
          "payload_too_large",
          PUBLIC_API_REASON_CODES.PAYLOAD_TOO_LARGE,
          "Essa solicitação ficou grande demais para ser processada. Reduza o conteúdo e tente novamente."
        ),
      };
    }

    for (const message of body.messages) {
      const messageError = validateMessageEntry(message, limits);
      if (messageError) {
        return {
          ok: false,
          response: buildPublicApiError(
            400,
            "invalid_request",
            PUBLIC_API_REASON_CODES.INVALID_REQUEST,
            "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
          ),
        };
      }
    }
  }

  if (body.image_base64 != null && typeof body.image_base64 !== "string") {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  if (
    typeof body.image_base64 === "string" &&
    body.image_base64.length > limits.maxImageBase64Chars
  ) {
    return {
      ok: false,
      response: buildPublicApiError(
        413,
        "payload_too_large",
        PUBLIC_API_REASON_CODES.PAYLOAD_TOO_LARGE,
        "Essa solicitação ficou grande demais para ser processada. Reduza o conteúdo e tente novamente."
      ),
    };
  }

  for (const idField of ["conversation_id", "conversationId", "user_id", "userId"]) {
    if (body[idField] != null && typeof body[idField] !== "string") {
      return {
        ok: false,
        response: buildPublicApiError(
          400,
          "invalid_request",
          PUBLIC_API_REASON_CODES.INVALID_REQUEST,
          "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
        ),
      };
    }
    if (typeof body[idField] === "string" && body[idField].length > limits.maxIdChars) {
      return {
        ok: false,
        response: buildPublicApiError(
          400,
          "invalid_request",
          PUBLIC_API_REASON_CODES.INVALID_REQUEST,
          "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
        ),
      };
    }
  }

  if (body.session_context != null && !isPlainObject(body.session_context)) {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  return { ok: true, body: cloneSafePublicBody(body) };
}

export function validatePublicLoadingRequestBody(body, env = process.env) {
  const limits = resolvePublicApiLimits(env);

  if (!isPlainObject(body)) {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  if (hasPrototypePollutionKeys(body)) {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  if (estimateJsonBytes(body) > limits.maxBodyBytes) {
    return {
      ok: false,
      response: buildPublicApiError(
        413,
        "payload_too_large",
        PUBLIC_API_REASON_CODES.PAYLOAD_TOO_LARGE,
        "Essa solicitação ficou grande demais para ser processada. Reduza o conteúdo e tente novamente."
      ),
    };
  }

  if (body.text != null && typeof body.text !== "string") {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  if (typeof body.text === "string" && body.text.length > limits.maxTextChars) {
    return {
      ok: false,
      response: buildPublicApiError(
        413,
        "payload_too_large",
        PUBLIC_API_REASON_CODES.PAYLOAD_TOO_LARGE,
        "Essa solicitação ficou grande demais para ser processada. Reduza o conteúdo e tente novamente."
      ),
    };
  }

  if (body.session_context != null && !isPlainObject(body.session_context)) {
    return {
      ok: false,
      response: buildPublicApiError(
        400,
        "invalid_request",
        PUBLIC_API_REASON_CODES.INVALID_REQUEST,
        "Não consegui processar essa solicitação. Revise a mensagem e tente novamente."
      ),
    };
  }

  return { ok: true, body: cloneSafePublicBody(body) };
}

export function cloneSafePublicBody(body) {
  return JSON.parse(JSON.stringify(body));
}

function containsSecretPattern(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeKnownInternalFields(value, debugEnabled) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeKnownInternalFields(entry, debugEnabled));
  }

  if (!isPlainObject(value)) {
    if (typeof value === "string" && containsSecretPattern(value)) {
      return "[redacted]";
    }
    return value;
  }

  const next = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (!debugEnabled && INTERNAL_RESPONSE_KEYS.has(key)) {
      continue;
    }
    if (key === "stack" || key === "errorStack") {
      continue;
    }
    next[key] = sanitizeKnownInternalFields(entryValue, debugEnabled);
  }
  return next;
}

export function sanitizePublicChatResponsePayload(payload, env = process.env) {
  const debugEnabled = isPublicDebugEnabled(env);
  if (payload == null) return payload;

  if (typeof payload === "string") {
    if (containsSecretPattern(payload)) return "[redacted]";
    return payload;
  }

  if (!isPlainObject(payload)) {
    return payload;
  }

  const sanitized = sanitizeKnownInternalFields(payload, debugEnabled);

  if (!debugEnabled) {
    delete sanitized.mia_debug;
    delete sanitized.runtime_precedence;
    delete sanitized.runtime_enforcement;
    delete sanitized.pipelineTrace;
  }

  if (typeof sanitized.reply !== "string" && sanitized.reply != null) {
    sanitized.reply = String(sanitized.reply);
  }

  return sanitized;
}

export function sanitizePublicUpstreamResponse({
  status,
  bodyText,
  contentType = "application/json",
  env = process.env,
}) {
  const isJson = String(contentType || "").toLowerCase().includes("application/json");

  if (!isJson) {
    if (containsSecretPattern(bodyText || "")) {
      return {
        status,
        bodyText: JSON.stringify({
          error: "internal_error",
          reasonCode: PUBLIC_API_REASON_CODES.INTERNAL_ERROR,
          reply: "Não consegui concluir essa resposta agora. Tente novamente em instantes.",
        }),
        contentType: "application/json",
      };
    }
    return { status, bodyText, contentType };
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText || "{}");
  } catch {
    return {
      status,
      bodyText: JSON.stringify({
        error: "internal_error",
        reasonCode: PUBLIC_API_REASON_CODES.INTERNAL_ERROR,
        reply: "Não consegui concluir essa resposta agora. Tente novamente em instantes.",
      }),
      contentType: "application/json",
    };
  }

  const sanitized = sanitizePublicChatResponsePayload(parsed, env);

  if (status >= 500) {
    return {
      status,
      bodyText: JSON.stringify({
        error: sanitized.error || "internal_error",
        reasonCode: sanitized.reasonCode || PUBLIC_API_REASON_CODES.INTERNAL_ERROR,
        reply:
          sanitized.reply ||
          "Não consegui concluir essa resposta agora. Tente novamente em instantes.",
        ...(isPublicDebugEnabled(env) && sanitized.mia_debug
          ? { mia_debug: sanitized.mia_debug }
          : {}),
      }),
      contentType: "application/json",
    };
  }

  return {
    status,
    bodyText: JSON.stringify(sanitized),
    contentType: "application/json",
  };
}

export function sendPublicApiError(res, errorResponse, { allowHeader } = {}) {
  if (allowHeader) {
    res.setHeader("Allow", allowHeader);
  }
  return res.status(errorResponse.statusCode).json(errorResponse.payload);
}
