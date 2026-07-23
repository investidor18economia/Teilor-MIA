/**
 * PATCH 11.4 — Optional LLM verbalization for executive insights (facts only).
 */

import { callOpenAI, getOpenAIText } from "./openai.js";
import { EXECUTIVE_INSIGHTS_FORBIDDEN_LLM_TERMS } from "./miaExecutiveInsightsThresholds.js";

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function isExecutiveInsightsLlmEnabled(env = process.env) {
  if (String(env.MIA_EXECUTIVE_INSIGHTS_LLM_ENABLED || "1") === "0") return false;
  return Boolean(String(env.OPENAI_API_KEY || "").trim());
}

/**
 * @param {{ deterministicSummary: object, insights: object[], windowDays: number, limitations: string[] }} input
 * @param {Record<string, string|undefined>} [env]
 */
export async function verbalizeExecutiveInsights(input, env = process.env) {
  if (!isExecutiveInsightsLlmEnabled(env)) {
    return { ok: false, reason: "llm_disabled", summary: null };
  }

  const payload = {
    period_days: input.windowDays,
    deterministic_summary: input.deterministicSummary,
    insights: input.insights.slice(0, 12).map((i) => ({
      insight_id: i.insight_id,
      type: i.type,
      severity: i.severity,
      title: i.title,
      confidence: i.confidence,
      current_value: i.current_value,
      previous_value: i.previous_value,
      absolute_change: i.absolute_change,
      percentage_change: i.percentage_change,
      disclaimers: i.disclaimers,
      hypothesis: i.hypothesis,
    })),
    limitations: input.limitations,
  };

  const systemPrompt = [
    "Você organiza insights executivos da Teilor para o fundador.",
    "REGRAS OBRIGATÓRIAS:",
    "- Use APENAS os fatos fornecidos no JSON.",
    "- NÃO invente números, causas, satisfação, compras, receita ou economia realizada.",
    "- Trate hipóteses como 'hipótese para investigação', nunca como causalidade comprovada.",
    "- Taxa de aceitação NÃO é satisfação.",
    "- Economia potencial NÃO é economia realizada.",
    "- Responda em português brasileiro, tom executivo, máximo 4 frases.",
    "- Retorne JSON: { \"headline\": string, \"overview\": string }",
  ].join("\n");

  try {
    const response = await callOpenAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
      { temperature: 0.1, max_tokens: 400, timeout_ms: 15000 }
    );

    const text = getOpenAIText(response);
    let parsed = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed?.overview) {
      return { ok: false, reason: "llm_parse_failed", summary: null };
    }

    const blob = `${parsed.headline} ${parsed.overview}`.toLowerCase();
    if (EXECUTIVE_INSIGHTS_FORBIDDEN_LLM_TERMS.some((term) => blob.includes(term))) {
      return { ok: false, reason: "llm_forbidden_term", summary: null };
    }

    return {
      ok: true,
      summary: {
        headline: String(parsed.headline).slice(0, 200),
        overview: String(parsed.overview).slice(0, 1200),
        source: "llm",
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: String(err?.message || "llm_error").slice(0, 120),
      summary: null,
    };
  }
}
