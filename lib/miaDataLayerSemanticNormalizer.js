/**
 * PATCH 9.2K — Data Layer Semantic Normalizer
 *
 * Normaliza campos semânticos do Data Layer em tokens individuais
 * antes da tradução de consequências (3C-A) e da montagem specialist.
 */

export const DATA_LAYER_SEMANTIC_NORMALIZER_VERSION = "9.2K.1";

export const SEMANTIC_SPEC_FIELDS = Object.freeze([
  "strengths",
  "weaknesses",
  "ideal_for",
  "avoid_if",
  "notes",
  "market_notes",
  "strategic_notes",
  "risk_notes",
]);

const SNAKE_CASE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)+$/i;
const COMPOUND_SPLIT_PATTERN = /[;|,]+/;

const GENERIC_INSIGHT_BODY_PATTERNS = Object.freeze([
  /^combina com o perfil de uso descrito$/i,
  /^funciona bem para esse perfil$/i,
  /^ganho perceptível no uso real$/i,
  /^funciona melhor para quem valoriza estabilidade e previsibilidade no uso ao longo do tempo$/i,
]);

const SEMANTIC_LEAD_WORDS = Object.freeze(
  new Set([
    "video",
    "vídeo",
    "ios",
    "android",
    "camera",
    "câmera",
    "desempenho",
    "performance",
    "bateria",
    "tela",
    "ecossistema",
    "modelo",
    "marca",
    "quem",
    "quer",
    "uso",
    "longevidade",
    "estabilidade",
    "capacidade",
    "consumo",
    "limpeza",
    "preco",
    "preço",
  ])
);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isSemanticSlugToken(value = "") {
  const body = cleanText(value);
  if (!body) return false;
  if (SNAKE_CASE_PATTERN.test(body)) return true;
  if (/[|]/.test(body)) return true;
  if (/;/.test(body) && body.split(";").every((part) => SNAKE_CASE_PATTERN.test(cleanText(part)))) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeDataLayerSemanticField(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => normalizeDataLayerSemanticField(entry))
      .map((entry) => cleanText(entry))
      .filter(Boolean);
  }

  if (typeof value === "object") {
    return [];
  }

  const body = cleanText(String(value));
  if (!body) return [];

  if (COMPOUND_SPLIT_PATTERN.test(body)) {
    return body
      .split(COMPOUND_SPLIT_PATTERN)
      .map((entry) => cleanText(entry))
      .filter(Boolean);
  }

  return [body];
}

/**
 * @param {Record<string, unknown>|null|undefined} trustedSpecs
 * @returns {Record<string, unknown>|null}
 */
export function normalizeTrustedSpecsSemanticFields(trustedSpecs = null) {
  if (!trustedSpecs || typeof trustedSpecs !== "object") return null;

  const specs = { ...trustedSpecs };

  for (const field of SEMANTIC_SPEC_FIELDS) {
    if (!(field in trustedSpecs)) continue;
    const normalized = normalizeDataLayerSemanticField(trustedSpecs[field]);
    if (normalized.length) {
      specs[field] = normalized;
    } else {
      delete specs[field];
    }
  }

  return specs;
}

export function countArtificialConnectors(text = "") {
  const body = cleanText(text).toLowerCase();
  if (!body) return 0;
  return (body.match(/\s+e\s+/g) || []).length;
}

export function isArtificialAttributeChain(text = "") {
  const body = cleanText(text);
  if (!body) return false;

  if (countArtificialConnectors(body) >= 3) return true;

  const parts = body
    .split(/\s+e\s+/i)
    .map((entry) => cleanText(entry))
    .filter(Boolean);

  if (parts.length >= 3) {
    const shortAttributeLike = parts.filter(
      (part) =>
        part.split(/\s+/).length <= 4 &&
        !/\b(pode|vale|não|nao|quando|porque|menos|mais|ainda|recebe|continua)\b/i.test(part)
    ).length;
    if (shortAttributeLike >= 3) return true;
  }

  if (body.includes("_") && SNAKE_CASE_PATTERN.test(body)) return true;

  const words = body.split(/\s+/).filter(Boolean);
  if (
    words.length >= 4 &&
    words.length <= 14 &&
    !/\b(pode|vale|não|nao|quando|porque|menos|mais|ainda|recebe|continua|aparelho|equipamento)\b/i.test(
      body
    ) &&
    countArtificialConnectors(body) >= 2
  ) {
    return true;
  }

  return false;
}

export function tokenToReadableLabel(token = "") {
  let body = cleanText(String(token || "").toLowerCase()).replace(/_/g, " ");
  body = body.replace(/\bcamera\b/g, "câmera");
  body = body.replace(/\bvideo\b/g, "vídeo");
  body = body.replace(/\bios\b/g, "iOS");
  body = body.replace(/\bhz\b/g, "Hz");
  body = body.replace(/\bpreco\b/g, "preço");
  return cleanText(body);
}

/**
 * Lista controlada para atributos sem tradutor de consequência.
 */
export function formatControlledAttributeList(items = [], options = {}) {
  const labels = (Array.isArray(items) ? items : [])
    .map((entry) => tokenToReadableLabel(entry))
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(label.charAt(0).toUpperCase() + label.slice(1));
  }

  if (!unique.length) return "";

  const lead =
    options.lead ||
    "Ele se destaca principalmente pelos pontos positivos mais importantes para esse tipo de compra";

  if (unique.length === 1) {
    return `${lead}: ${unique[0]}.`;
  }

  if (unique.length === 2) {
    return `${lead}: ${unique[0]} e ${unique[1]}.`;
  }

  return `${lead}: ${unique.slice(0, -1).join(", ")} e ${unique.at(-1)}.`;
}

export function isGenericInsightBody(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  return GENERIC_INSIGHT_BODY_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * Evita que chains artificiais ou slugs cheguem à montagem specialist.
 */
export function sanitizeConsequenceForSpecialistUse(text = "", fallbackTokens = []) {
  const body = cleanText(text);
  if (!body) return "";

  if (!isArtificialAttributeChain(body)) {
    return body;
  }

  if (fallbackTokens.length) {
    return formatControlledAttributeList(fallbackTokens, {
      lead: "Os principais pontos positivos são",
    });
  }

  const splitParts = body
    .split(/\s+e\s+/i)
    .map((entry) => cleanText(entry))
    .filter(Boolean);

  if (splitParts.length >= 2) {
    return formatControlledAttributeList(splitParts, {
      lead: "Os principais pontos positivos são",
    });
  }

  return "";
}

export function softenSemanticLeadWords(text = "") {
  const body = cleanText(text);
  const match = body.match(/^([a-z0-9áéíóúãõâêôç]+)\s+(.*)$/i);
  if (!match) return body;

  const [, lead, rest] = match;
  const leadLower = lead.toLowerCase();

  if (SEMANTIC_LEAD_WORDS.has(leadLower)) {
    const readableLead = leadLower === "video" ? "vídeo" : leadLower === "ios" ? "iOS" : lead;
    return cleanText(`${readableLead} ${rest}`);
  }

  return body;
}
