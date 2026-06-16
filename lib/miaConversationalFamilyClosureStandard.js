/**
 * PATCH 7.7G — Conversational Family Closure Standard (shared detectors)
 *
 * Generic conversational fallback detector — NOT product-specific.
 */

export const GENERIC_CONVERSATIONAL_FALLBACK_MARKERS = [
  "posso te ajudar com compras",
  "comparacao de produtos",
  "comparação de produtos",
  "decisao de custo-beneficio",
  "decisão de custo-benefício",
  "me fala o produto que voce quer analisar",
  "me fala o produto que você quer analisar",
  "me fala o produto que voce quer analisar ou buscar",
  "me fala o produto que você quer analisar ou buscar",
];

export const CLOSURE_LAYERS = Object.freeze([
  "Router",
  "Routing",
  "Contract",
  "Response/Verbalizer",
  "Anchor preservation",
]);

export const CLOSURE_STATUSES = Object.freeze({
  FULLY_CLOSED: "FULLY_CLOSED",
  TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE:
    "TECHNICALLY_CLOSED_BUT_RESPONSE_INCOMPLETE",
  NOT_CLOSED: "NOT_CLOSED",
});

function normalize(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect institutional/generic welcome fallback unsuitable for pure conversational families.
 */
export function detectGenericConversationalFallback(text = "") {
  const q = normalize(text);
  if (!q) return false;

  let hits = 0;
  for (const marker of GENERIC_CONVERSATIONAL_FALLBACK_MARKERS) {
    if (q.includes(normalize(marker))) hits++;
  }

  return hits >= 2 || q.includes(normalize("posso te ajudar com compras"));
}

export const OFFICIAL_CLOSURE_CRITERIA = [
  "Router classifica a intenção corretamente.",
  "Routing não abre new_search indevido.",
  "Contract não força caminho comercial indevido.",
  "Anchor/winner são preservados quando houver contexto.",
  "Verbalizer/response builder usa caminho compatível com a intenção.",
  "A resposta final é natural, curta e coerente com a intenção.",
  "A resposta final não parece fallback genérico.",
  "Guards comerciais continuam funcionando.",
  "Regressões locais permanecem zeradas.",
  "Quando necessário, pelo menos um teste real ou semi-real valida percepção do usuário.",
];
