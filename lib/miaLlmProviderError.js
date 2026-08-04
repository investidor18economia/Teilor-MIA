/**
 * PATCH 5.8.8.1 — LLM provider error classification (recoverable failures).
 */

export const LLM_PROVIDER_FAILURE_KIND = Object.freeze({
  QUOTA_EXHAUSTED: "quota_exhausted",
  RATE_LIMITED: "rate_limited",
  AUTH: "auth",
  TIMEOUT: "timeout",
  UNAVAILABLE: "unavailable",
  BAD_REQUEST: "bad_request",
  UNKNOWN: "unknown",
});

export const LLM_PROVIDER_REASON_CODES = Object.freeze({
  LLM_PROVIDER_QUOTA_EXHAUSTED: "llm_provider_quota_exhausted",
  LLM_PROVIDER_RATE_LIMITED: "llm_provider_rate_limited",
  LLM_PROVIDER_UNAVAILABLE: "llm_provider_unavailable",
  LLM_PROVIDER_TIMEOUT: "llm_provider_timeout",
  LLM_PROVIDER_AUTH: "llm_provider_auth",
});

function parseJsonSafe(text = "") {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function classifyOpenAIHttpFailure(status, bodyText = "") {
  const parsed = parseJsonSafe(bodyText);
  const apiError = parsed?.error || {};
  const code = String(apiError.code || apiError.type || "").toLowerCase();
  const message = String(apiError.message || bodyText || "").toLowerCase();

  if (status === 429) {
    if (
      code.includes("insufficient_quota") ||
      code.includes("credit_balance") ||
      message.includes("no credits remaining") ||
      message.includes("credit_balance")
    ) {
      return {
        kind: LLM_PROVIDER_FAILURE_KIND.QUOTA_EXHAUSTED,
        reasonCode: LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_QUOTA_EXHAUSTED,
        httpStatus: status,
        provider: "openai",
        recoverable: true,
      };
    }
    return {
      kind: LLM_PROVIDER_FAILURE_KIND.RATE_LIMITED,
      reasonCode: LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_RATE_LIMITED,
      httpStatus: status,
      provider: "openai",
      recoverable: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: LLM_PROVIDER_FAILURE_KIND.AUTH,
      reasonCode: LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_AUTH,
      httpStatus: status,
      provider: "openai",
      recoverable: false,
    };
  }

  if (status >= 500) {
    return {
      kind: LLM_PROVIDER_FAILURE_KIND.UNAVAILABLE,
      reasonCode: LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_UNAVAILABLE,
      httpStatus: status,
      provider: "openai",
      recoverable: true,
    };
  }

  if (status >= 400) {
    return {
      kind: LLM_PROVIDER_FAILURE_KIND.BAD_REQUEST,
      reasonCode: LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_UNAVAILABLE,
      httpStatus: status,
      provider: "openai",
      recoverable: true,
    };
  }

  return {
    kind: LLM_PROVIDER_FAILURE_KIND.UNKNOWN,
    reasonCode: LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_UNAVAILABLE,
    httpStatus: status || 0,
    provider: "openai",
    recoverable: true,
  };
}

export class MiaLlmProviderError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "MiaLlmProviderError";
    this.kind = meta.kind || LLM_PROVIDER_FAILURE_KIND.UNKNOWN;
    this.reasonCode = meta.reasonCode || LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_UNAVAILABLE;
    this.httpStatus = meta.httpStatus || 0;
    this.provider = meta.provider || "openai";
    this.recoverable = meta.recoverable !== false;
    this.stage = meta.stage || "openai_chat_completions";
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      reasonCode: this.reasonCode,
      httpStatus: this.httpStatus,
      provider: this.provider,
      recoverable: this.recoverable,
      stage: this.stage,
      message: this.message,
    };
  }
}

export function isMiaLlmProviderError(error) {
  return (
    error instanceof MiaLlmProviderError ||
    error?.name === "MiaLlmProviderError" ||
    String(error?.message || "").startsWith("OpenAI error ")
  );
}

export function buildMiaLlmProviderErrorFromUnknown(error, { stage = "openai_chat_completions" } = {}) {
  if (error instanceof MiaLlmProviderError) return error;

  const message = String(error?.message || error || "");

  if (message.startsWith("OpenAI error ")) {
    const match = message.match(/^OpenAI error (\d+)\s+([\s\S]*)$/);
    const status = Number(match?.[1] || 0);
    const bodyText = match?.[2] || "";
    const classified = classifyOpenAIHttpFailure(status, bodyText);
    return new MiaLlmProviderError(message, { ...classified, stage });
  }

  if (/timed out after/i.test(message)) {
    return new MiaLlmProviderError(message, {
      kind: LLM_PROVIDER_FAILURE_KIND.TIMEOUT,
      reasonCode: LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_TIMEOUT,
      httpStatus: 408,
      provider: "openai",
      recoverable: true,
      stage,
    });
  }

  return null;
}
