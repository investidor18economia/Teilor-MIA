/**
 * PATCH 3.3 — Product Identity Resolution (single source of truth)
 *
 * Canonical naming for product resolution, lock, and comparison parsing.
 * MIA owns the intelligence. The LLM only verbalizes.
 */

export const PRODUCT_IDENTITY_RESOLUTION_VERSION = "3.3.0";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CONSTRAINT_TAIL_PATTERNS = [
  /\s+(?:com|e|mas|porém|porem|que tenha|que tenham|preciso de|quero)\s+(?:boa|melhor|mais|bom|grande|menor|barato|grande|leve|rapido|rápido).+$/i,
  /\s+com\s+(?:boa|melhor|mais)\s+(?:bateria|autonomia|camera|câmera|cam|desempenho|performance|tela|memoria|memória|armazenamento).+$/i,
  /\s+(?:para|pra)\s+(?:jogos|trabalho|fotos?|minha mae|minha mãe|estudar).+$/i,
];

const CONSTRAINT_PREFIX_PATTERN =
  /^(?:quero|preciso|busco|procuro|me fala|fala|me mostra|mostra)\s+(?:de|sobre|do|da|o|a|um|uma)?\s*/i;

const VARIANT_RULES = [
  {
    test: /\b(?:samsung\s+)?galaxy\s+s(\d{1,3})\s*ultra\b/i,
    display: (m) => `Galaxy S${m[1]} Ultra`,
    short: (m) => `S${m[1]} Ultra`,
  },
  {
    test: /\b(?:samsung\s+)?galaxy\s+s(\d{1,3})\s*\+(?=\s|$|[,\.;)\]])/i,
    display: (m) => `Galaxy S${m[1]}+`,
    short: (m) => `S${m[1]}+`,
  },
  {
    test: /\b(?:samsung\s+)?galaxy\s+s(\d{1,3})\s*plus\b/i,
    display: (m) => `Galaxy S${m[1]}+`,
    short: (m) => `S${m[1]}+`,
  },
  {
    test: /\b(?:samsung\s+)?galaxy\s+s(\d{1,3})\s*fe\b/i,
    display: (m) => `Galaxy S${m[1]} FE`,
    short: (m) => `S${m[1]} FE`,
  },
  {
    test: /\b(?:samsung\s+)?galaxy\s+s(\d{1,3})(?!\s*(?:\+|fe|ultra|plus)\b)/i,
    display: (m) => `Galaxy S${m[1]}`,
    short: (m) => `S${m[1]}`,
  },
  {
    test: /\b(?:samsung\s+)?galaxy\s+a(\d{1,3})\b/i,
    display: (m) => `Galaxy A${m[1]}`,
    short: (m) => `A${m[1]}`,
  },
  {
    test: /\biphone\s*(\d{1,2})\s*pro\s*max\b/i,
    display: (m) => `iPhone ${m[1]} Pro Max`,
    short: (m) => `iPhone ${m[1]} Pro Max`,
  },
  {
    test: /\biphone\s*(\d{1,2})\s*pro\b/i,
    display: (m) => `iPhone ${m[1]} Pro`,
    short: (m) => `iPhone ${m[1]} Pro`,
  },
  {
    test: /\biphone\s*(\d{1,2})\s*plus\b/i,
    display: (m) => `iPhone ${m[1]} Plus`,
    short: (m) => `iPhone ${m[1]} Plus`,
  },
  {
    test: /\biphone\s*(\d{1,2})\b/i,
    display: (m) => `iPhone ${m[1]}`,
    short: (m) => `iPhone ${m[1]}`,
  },
  {
    test: /\b(\d{1,2})\s+da\s+apple\b/i,
    display: (m) => `iPhone ${m[1]}`,
    short: (m) => `iPhone ${m[1]}`,
  },
  {
    test: /\b(?:samsung\s+)?s(\d{1,3})(?:\s*(?:ultra|fe|plus|\+))?\b/i,
    display: (m, full) => {
      const variant = /\bultra\b/i.test(full) ? " Ultra" : /\bfe\b/i.test(full) ? " FE" : /\bplus\b|\+/.test(full) ? "+" : "";
      return `Galaxy S${m[1]}${variant}`.replace(/\s+$/, "");
    },
    short: (m, full) => {
      const variant = /\bultra\b/i.test(full) ? " Ultra" : /\bfe\b/i.test(full) ? " FE" : /\bplus\b|\+/.test(full) ? "+" : "";
      return `S${m[1]}${variant}`.replace(/\s+$/, "");
    },
  },
  {
    test: /\b(?:motorola\s+)?moto\s+g(\d{1,3})\b/i,
    display: (m) => `Moto G${m[1]}`,
    short: (m) => `G${m[1]}`,
  },
  {
    test: /\bmoto\s+g(\d{1,3})\b/i,
    display: (m) => `Moto G${m[1]}`,
    short: (m) => `G${m[1]}`,
  },
  {
    test: /\bg(\d{2,3})\b/i,
    display: (m) => `Moto G${m[1]}`,
    short: (m) => `G${m[1]}`,
  },
  {
    test: /\b(?:xiaomi\s+)?redmi\s+note\s*(\d{1,3})\b/i,
    display: (m) => `Redmi Note ${m[1]}`,
    short: (m) => `Note ${m[1]}`,
  },
  {
    test: /\bnote\s*(\d{1,3})\b/i,
    display: (m) => `Redmi Note ${m[1]}`,
    short: (m) => `Note ${m[1]}`,
  },
  {
    test: /\bpoco\s+([a-z]?\d{1,3})\b/i,
    display: (m) => `Poco ${String(m[1]).toUpperCase()}`,
    short: (m) => `Poco ${String(m[1]).toUpperCase()}`,
  },
  {
    test: /\b(?:asus\s+)?rog(?:\s+phone)?\s*(\d{1,2})\b/i,
    display: (m) => `ROG Phone ${m[1]}`,
    short: (m) => `ROG ${m[1]}`,
  },
  {
    test: /\brog\s*(\d{1,2})\b/i,
    display: (m) => `ROG Phone ${m[1]}`,
    short: (m) => `ROG ${m[1]}`,
  },
  {
    test: /\b(?:asus\s+)?zenfone(?:\s*(\d{1,2}))?\b/i,
    display: (m) => (m[1] ? `Zenfone ${m[1]}` : "Zenfone"),
    short: (m) => (m[1] ? `Zenfone ${m[1]}` : "Zenfone"),
  },
];

function stripSpecNoise(name = "") {
  return cleanText(name)
    .replace(/\b\d+\s?gb\b/gi, "")
    .replace(/\b\d+\s?tb\b/gi, "")
    .replace(/\bram\b/gi, "")
    .replace(/\bdual\s*sim\b/gi, "")
    .replace(/\bsmartphone\b/gi, "")
    .replace(/\bcelular\b/gi, "")
    .replace(/\bnovo\b/gi, "")
    .replace(/\busado\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Isola menção de produto em frases mistas ("S24 com boa bateria").
 */
export function extractProductMentionFromQuery(query = "") {
  let text = cleanText(query);
  if (!text) return "";

  text = text.replace(CONSTRAINT_PREFIX_PATTERN, "");

  for (const pattern of CONSTRAINT_TAIL_PATTERNS) {
    text = text.replace(pattern, "");
  }

  return cleanText(text);
}

/**
 * Resolve identidade canônica a partir de menção textual.
 * @param {string} productName
 * @param {{ familyKeyResolver?: (name: string) => string }} [options]
 */
export function resolveProductIdentityFromQuery(productName = "", options = {}) {
  const raw = extractProductMentionFromQuery(productName);
  const officialName = cleanText(raw);
  if (!officialName) {
    return {
      officialName: "",
      displayName: "",
      shortName: "",
      modelKey: "",
      resolvedFrom: null,
    };
  }

  const stripped = stripSpecNoise(officialName);

  for (const rule of VARIANT_RULES) {
    const match = stripped.match(rule.test);
    if (match) {
      const displayName = rule.display(match, stripped);
      const shortName = rule.short(match, stripped);
      const modelKey =
        (typeof options.familyKeyResolver === "function"
          ? options.familyKeyResolver(displayName)
          : "") ||
        normalizeKey(displayName).replace(/\s+/g, "_");

      return {
        officialName: displayName,
        displayName,
        shortName,
        modelKey,
        resolvedFrom: "variant_rule",
      };
    }
  }

  const words = stripped.split(/\s+/).filter(Boolean);
  const displayName = words.length <= 4 ? stripped : words.slice(-3).join(" ");
  const shortName = words.length <= 2 ? stripped : words.slice(-2).join(" ");
  const modelKey =
    (typeof options.familyKeyResolver === "function"
      ? options.familyKeyResolver(officialName)
      : "") ||
    normalizeKey(displayName).replace(/\s+/g, "_");

  return {
    officialName,
    displayName,
    shortName,
    modelKey,
    resolvedFrom: words.length <= 4 ? "direct_name" : "tail_name",
  };
}

/**
 * Expande query/alias para chaves de matching no lock.
 */
export function buildProductResolutionKeys(query = "") {
  const mention = extractProductMentionFromQuery(query);
  const identity = resolveProductIdentityFromQuery(mention);
  const keys = new Set();

  for (const value of [mention, identity.officialName, identity.displayName, identity.shortName]) {
    const key = normalizeKey(value);
    if (key) keys.add(key);
  }

  return {
    mention,
    identity,
    keys: [...keys],
  };
}
