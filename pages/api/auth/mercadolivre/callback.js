/**
 * PATCH Comercial 2D — callback OAuth Mercado Livre (isolado)
 */

import {
  exchangeMercadoLivreAuthorizationCode,
  redactMercadoLivreOAuthSecrets,
  validateMercadoLivreOAuthEnv,
} from "../../../../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const validation = validateMercadoLivreOAuthEnv(process.env);
  if (!validation.ok) {
    return res.status(503).json({
      ok: false,
      error: "missing_env",
      missing: validation.missing,
    });
  }

  const oauthError = String(req.query.error || "").trim();
  if (oauthError) {
    return res.status(400).json({
      ok: false,
      error: "oauth_denied",
      oauthError,
    });
  }

  const code = String(req.query.code || "").trim();
  if (!code) {
    return res.status(400).json({
      ok: false,
      error: "missing_code",
      hint: "Mercado Livre must redirect with ?code=",
    });
  }

  try {
    const result = await exchangeMercadoLivreAuthorizationCode(code);

    if (!result.ok) {
      const payload = {
        ok: false,
        error: result.error,
        httpStatus: result.httpStatus ?? null,
        httpStatusText: result.httpStatusText ?? null,
        safeErrorBodyPreview: result.safeErrorBodyPreview ?? null,
        message: result.message ?? null,
      };
      const safeJson = redactMercadoLivreOAuthSecrets(JSON.stringify(payload), process.env);
      return res.status(502).json(JSON.parse(safeJson));
    }

    return res.status(200).json({
      ok: true,
      access_token: result.token.access_token,
      refresh_token: result.token.refresh_token,
      expires_in: result.token.expires_in,
      token_type: result.token.token_type,
    });
  } catch (err) {
    const message = redactMercadoLivreOAuthSecrets(
      String(err?.message || "provider_error"),
      process.env
    );
    return res.status(500).json({
      ok: false,
      error: "provider_error",
      message,
    });
  }
}
