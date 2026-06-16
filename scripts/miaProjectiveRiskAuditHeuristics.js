/**
 * PATCH 7.6U-J — Shared audit heuristics for projectiveRisk:risk_probe responses.
 * Aligns audit scripts with POST-7.6U-I production behavior (audit-only).
 */

export const PROJECTIVE_RISK_BEHAVIOR_PATTERNS = [
  /\briscos?\b/i,
  /\bmedo\b/i,
  /\bdar errado\b/i,
  /\berrado\b/i,
  /\barrepend\w*/i,
  /\blimita[cç][aã]o\b/i,
  /\blimit\b/i,
  /\btradeoff\b/i,
  /\btrade-off\b/i,
  /\bpor[eé]m\b/i,
  /\bpegadinha\b/i,
  /\bponto de aten[cç][aã]o\b/i,
  /\bpreocupa[cç][aã]o\b/i,
  /\bpreocup\w*/i,
  /\bcaveat\b/i,
  /\bdetalhe escondido\b/i,
  /\balgo que (voce|você) n[aã]o est[aá] vendo\b/i,
  /\bo que pode incomodar\b/i,
  /\b(o que|uma) (quest\w+|ponto) a (se )?considerar\b/i,
  /\b(desvantag|receio|poderia|problema|considerar|atualiz|cuidado|contras?)\b/i,
];

export const PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN = [
  /^eu iria no\b/i,
  /^o principal motivo e\b/i,
  /^o principal motivo é\b/i,
  /^o equilibrio geral\b/i,
  /^o equilíbrio geral\b/i,
  /^faz sentido achar caro\b/i,
  /^faz sentido achar que o preco\b/i,
  /^faz sentido achar que o preço\b/i,
  /^faz sentido achar o\b/i,
  /^eu iria no\b.*\bequil[ií]brio geral\b/i,
];

export const GENERIC_RECOMMENDATION_RES =
  /eu iria no\b[\s\S]{0,140}\b(principal motivo|equil[ií]brio geral)\b/i;

export function normalizeAuditText(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function matchesAnyPattern(text, patterns) {
  const n = normalizeAuditText(text);
  return patterns.some((re) => re.test(n));
}

export function matchesProjectiveRiskBehavior(
  text,
  { behaviorPatterns = PROJECTIVE_RISK_BEHAVIOR_PATTERNS, forbiddenOpenings = PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN } = {}
) {
  if (GENERIC_RECOMMENDATION_RES.test(normalizeAuditText(text))) return false;
  if (forbiddenOpenings.some((re) => re.test(normalizeAuditText(text)))) return false;
  return matchesAnyPattern(text, behaviorPatterns);
}
