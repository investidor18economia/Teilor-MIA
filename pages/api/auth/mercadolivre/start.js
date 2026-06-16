/**
 * PATCH Comercial 2D — inicia OAuth Mercado Livre (isolado)
 */

import {
  buildMercadoLivreAuthorizationUrl,
  validateMercadoLivreOAuthEnv,
} from "../../../../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";

export default function handler(req, res) {
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

  const authorization = buildMercadoLivreAuthorizationUrl(process.env);
  if (!authorization.ok || !authorization.url) {
    return res.status(503).json({
      ok: false,
      error: authorization.error || "authorization_url_failed",
    });
  }

  res.writeHead(302, { Location: authorization.url });
  res.end();
}
