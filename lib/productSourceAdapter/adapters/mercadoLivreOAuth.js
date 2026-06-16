/**
 * PATCH Comercial 2D — Mercado Livre OAuth (isolado, sem plug na MIA)
 */

import { redactMercadoLivreSecrets, validateMercadoLivreEnv } from "./mercadoLivreClient.js";

export const MERCADOLIVRE_OAUTH_AUTHORIZE_URL =
  "https://auth.mercadolivre.com.br/authorization";
export const MERCADOLIVRE_OAUTH_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

function readOAuthConfig(env = process.env) {
  return {
    clientId: String(env?.MERCADOLIVRE_CLIENT_ID || "").trim(),
    clientSecret: String(env?.MERCADOLIVRE_CLIENT_SECRET || "").trim(),
    redirectUri: String(env?.MERCADOLIVRE_REDIRECT_URI || "").trim(),
  };
}

export function validateMercadoLivreOAuthEnv(env = process.env) {
  return validateMercadoLivreEnv(env);
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {Record<string, string>} [extraParams]
 */
export function buildMercadoLivreAuthorizationUrl(env = process.env, extraParams = {}) {
  const validation = validateMercadoLivreOAuthEnv(env);
  const config = readOAuthConfig(env);

  if (!validation.ok) {
    return {
      ok: false,
      error: "missing_env",
      missing: validation.missing,
      url: null,
    };
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });

  for (const [key, value] of Object.entries(extraParams || {})) {
    const text = String(value ?? "").trim();
    if (text) params.set(key, text);
  }

  return {
    ok: true,
    url: `${MERCADOLIVRE_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
    error: null,
  };
}

/**
 * @param {unknown} payload
 */
export function mapMercadoLivreTokenResponse(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return {
      access_token: null,
      refresh_token: null,
      expires_in: null,
      token_type: null,
    };
  }

  return {
    access_token: payload.access_token ?? null,
    refresh_token: payload.refresh_token ?? null,
    expires_in: payload.expires_in ?? null,
    token_type: payload.token_type ?? null,
  };
}

/**
 * @param {string} code
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: (url: string, init?: RequestInit) => Promise<{
 *     ok: boolean,
 *     status?: number,
 *     statusText?: string,
 *     json: () => Promise<unknown>,
 *     text?: () => Promise<string>,
 *   }>,
 * }} [options]
 */
export async function exchangeMercadoLivreAuthorizationCode(code = "", options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreOAuthEnv(env);
  const config = readOAuthConfig(env);

  if (!validation.ok) {
    return {
      ok: false,
      error: "missing_env",
      missing: validation.missing,
    };
  }

  const authorizationCode = String(code || "").trim();
  if (!authorizationCode) {
    return {
      ok: false,
      error: "missing_code",
    };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: authorizationCode,
    redirect_uri: config.redirectUri,
  });

  try {
    const response = await fetcher(MERCADOLIVRE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response?.ok) {
      const previewSource =
        payload && typeof payload === "object"
          ? JSON.stringify(payload)
          : typeof response.text === "function"
            ? await response.text()
            : "";

      return {
        ok: false,
        error: "token_exchange_failed",
        httpStatus: response?.status ?? 0,
        httpStatusText: response?.statusText ?? "",
        safeErrorBodyPreview: redactMercadoLivreSecrets(previewSource, env),
      };
    }

    return {
      ok: true,
      token: mapMercadoLivreTokenResponse(payload),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: "provider_error",
      message: redactMercadoLivreSecrets(String(err?.message || "provider_error"), env),
    };
  }
}

export function redactMercadoLivreOAuthSecrets(value = "", env = process.env) {
  return redactMercadoLivreSecrets(value, env);
}
