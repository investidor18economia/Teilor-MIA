/**
 * PATCH UX-1 — Cognitive loading preview (read-only, zero LLM).
 * Returns visual loading copy derived from Router + Routing signals.
 */

import { buildCognitiveLoadingPreview } from "../../lib/miaCognitiveLoadingPreview.js";
import { getCognitiveLoadingFallbackState } from "../../lib/miaCognitiveLoading.js";

const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { text = "", session_context: sessionContext = {} } = req.body || {};
    const loading =
      buildCognitiveLoadingPreview({
        text,
        sessionContext,
      }) || getCognitiveLoadingFallbackState(text);

    return res.status(200).json({
      ...loading,
      readOnly: true,
    });
  } catch {
    return res.status(200).json(getCognitiveLoadingFallbackState());
  }
}
