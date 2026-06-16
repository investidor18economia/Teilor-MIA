/**
 * PATCH Comercial 2B — Mercado Livre real client (isolado, sem plug na MIA)
 *
 * Busca pública via /sites/{siteId}/search.
 * OAuth env vars são validadas para readiness; secret nunca entra em logs/output.
 */

const ML_API_BASE = "https://api.mercadolibre.com";
const DEFAULT_SITE_ID = "MLB";
const MAX_SEARCH_LIMIT = 50;

const ENV_KEYS = Object.freeze([
  "MERCADOLIVRE_CLIENT_ID",
  "MERCADOLIVRE_CLIENT_SECRET",
  "MERCADOLIVRE_REDIRECT_URI",
]);

function readEnv(env = process.env) {
  return {
    clientId: String(env?.MERCADOLIVRE_CLIENT_ID || "").trim(),
    clientSecret: String(env?.MERCADOLIVRE_CLIENT_SECRET || "").trim(),
    redirectUri: String(env?.MERCADOLIVRE_REDIRECT_URI || "").trim(),
    siteId: String(env?.MERCADOLIVRE_SITE_ID || DEFAULT_SITE_ID).trim() || DEFAULT_SITE_ID,
    accessToken: String(env?.MERCADOLIVRE_ACCESS_TOKEN || "").trim(),
  };
}

function clampLimit(limit = 12) {
  const parsed = Number.parseInt(String(limit), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 12;
  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function validateMercadoLivreEnv(env = process.env) {
  const config = readEnv(env);
  const missing = [];

  for (const key of ENV_KEYS) {
    const value = String(env?.[key] || "").trim();
    if (!value) missing.push(key);
  }

  return {
    ok: missing.length === 0,
    missing,
    siteId: config.siteId,
    hasClientId: !!config.clientId,
    hasClientSecret: !!config.clientSecret,
    hasRedirectUri: !!config.redirectUri,
    hasAccessToken: !!config.accessToken,
  };
}

export function hasMercadoLivreAccessToken(env = process.env) {
  return !!readEnv(env).accessToken;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function buildMercadoLivreRequestHeaders(env = process.env) {
  const config = readEnv(env);
  const headers = {
    Accept: "application/json",
  };

  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }

  return headers;
}

function sanitizeMercadoLivreSensitiveOutput(value = "", config = readEnv()) {
  let safe = sanitizeForOutput(value, config.clientSecret);
  safe = sanitizeForOutput(safe, config.accessToken);
  safe = sanitizeForOutput(safe, config.clientId);
  return safe;
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @param {Record<string, string|undefined>} [env]
 */
export function buildMercadoLivreSearchUrl(query = "", limit = 12, env = process.env) {
  const config = readEnv(env);
  const siteId = config.siteId || DEFAULT_SITE_ID;
  const cap = clampLimit(limit);
  const q = encodeURIComponent(String(query || "").trim());
  return `${ML_API_BASE}/sites/${siteId}/search?q=${q}&limit=${cap}`;
}

/**
 * @param {unknown} response
 * @returns {Record<string, unknown>[]}
 */
export function mapMercadoLivreApiResponseToItems(response = null) {
  if (!response || typeof response !== "object") return [];

  const results = Array.isArray(response.results) ? response.results : [];

  return results
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: item.id ?? null,
      title: item.title ?? "",
      price: item.price ?? null,
      currency_id: item.currency_id ?? "BRL",
      permalink: item.permalink ?? null,
      thumbnail: item.thumbnail ?? null,
      condition: item.condition ?? null,
      available_quantity: item.available_quantity ?? null,
      seller:
        item.seller && typeof item.seller === "object"
          ? {
              id: item.seller.id ?? null,
              nickname: item.seller.nickname ?? null,
            }
          : null,
      shipping:
        item.shipping && typeof item.shipping === "object"
          ? {
              free_shipping: !!item.shipping.free_shipping,
              mode: item.shipping.mode ?? null,
            }
          : null,
      attributes: Array.isArray(item.attributes)
        ? item.attributes.map((attr) => ({
            id: attr?.id ?? null,
            name: attr?.name ?? null,
            value_name: attr?.value_name ?? null,
          }))
        : [],
      category_id: item.category_id ?? null,
    }));
}

function sanitizeForOutput(value = "", secret = "") {
  const text = String(value || "");
  if (!secret) return text;
  return text.split(secret).join("[REDACTED]");
}

function sanitizeRequestUrl(url = "", env = process.env) {
  return sanitizeMercadoLivreSensitiveOutput(String(url || ""), readEnv(env));
}

/**
 * @param {{
 *   text?: () => Promise<string>,
 *   json?: () => Promise<unknown>,
 * }} response
 * @param {ReturnType<typeof readEnv>} config
 * @param {number} [maxLen]
 */
async function readSafeErrorBodyPreview(response = {}, config = readEnv(), maxLen = 400) {
  let body = "";

  try {
    if (typeof response.text === "function") {
      body = await response.text();
    } else if (typeof response.json === "function") {
      const data = await response.json();
      body = typeof data === "string" ? data : JSON.stringify(data);
    }
  } catch {
    body = "";
  }

  body = sanitizeMercadoLivreSensitiveOutput(body, config);

  if (body.length > maxLen) {
    return `${body.slice(0, maxLen)}...`;
  }

  return body;
}

/**
 * @param {number} status
 * @param {string} url
 * @param {Awaited<ReturnType<typeof readSafeErrorBodyPreview>>} safeErrorBodyPreview
 * @param {ReturnType<typeof readEnv>} config
 * @param {string} [statusText]
 */
export function buildMercadoLivreHttpErrorDiagnostics(
  status = 0,
  url = "",
  safeErrorBodyPreview = "",
  config = readEnv(),
  statusText = ""
) {
  return {
    httpStatus: status,
    httpStatusText: String(statusText || "").trim(),
    safeErrorBodyPreview: String(safeErrorBodyPreview || ""),
    requestUrl: sanitizeRequestUrl(url, config),
    status,
  };
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: (url: string, init?: RequestInit) => Promise<{ ok: boolean, status?: number, json: () => Promise<unknown> }>,
 * }} [options]
 */
export async function searchMercadoLivreProducts(query = "", limit = 12, options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreEnv(env);
  const config = readEnv(env);
  const cap = clampLimit(limit);

  if (!validation.ok) {
    return {
      ok: false,
      items: [],
      error: "missing_env",
      missing: validation.missing,
      count: 0,
    };
  }

  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    return {
      ok: false,
      items: [],
      error: "missing_query",
      count: 0,
    };
  }

  const url = buildMercadoLivreSearchUrl(trimmedQuery, cap, env);

  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: buildMercadoLivreRequestHeaders(env),
    });

    if (!response?.ok) {
      const safeErrorBodyPreview = await readSafeErrorBodyPreview(response, config);
      return {
        ok: false,
        items: [],
        error: "http_error",
        count: 0,
        ...buildMercadoLivreHttpErrorDiagnostics(
          response?.status ?? 0,
          url,
          safeErrorBodyPreview,
          config,
          response?.statusText
        ),
      };
    }

    const payload = await response.json();
    const items = mapMercadoLivreApiResponseToItems(payload).slice(0, cap);

    if (!items.length) {
      return {
        ok: false,
        items: [],
        error: "empty_response",
        count: 0,
      };
    }

    return {
      ok: true,
      items,
      error: null,
      count: items.length,
      siteId: config.siteId,
      query: trimmedQuery,
    };
  } catch (err) {
    const message = sanitizeMercadoLivreSensitiveOutput(
      err?.message || "provider_error",
      config
    );
    return {
      ok: false,
      items: [],
      error: "provider_error",
      message,
      count: 0,
      requestUrl: sanitizeRequestUrl(url, config),
    };
  }
}

export function redactMercadoLivreSecrets(value = "", env = process.env) {
  return sanitizeMercadoLivreSensitiveOutput(value, readEnv(env));
}
