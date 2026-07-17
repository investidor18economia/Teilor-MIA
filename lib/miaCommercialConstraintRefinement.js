/**
 * PATCH 11B.3 — RF-01 Constraint Refinement Continuity
 *
 * Incremental commercial refinements merge with prior constraints and reuse
 * ranking snapshots before authorizing new provider calls.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { detectTopicSwitch } from "./miaCommercialFollowUpContinuity.js";
import {
  polishClarificationQuestion,
  polishRefinementAck,
  polishRefinementRecommendation,
} from "./miaConversationPolish.js";

export const CONSTRAINT_REFINEMENT_VERSION = "11C";

export const REFINEMENT_TYPES = Object.freeze({
  PRICE_REFINEMENT: "price_refinement",
  BUDGET_REFINEMENT: "budget_refinement",
  POSITIVE_BRAND_REFINEMENT: "positive_brand_refinement",
  NEGATIVE_BRAND_REFINEMENT: "negative_brand_refinement",
  ATTRIBUTE_REFINEMENT: "attribute_refinement",
  SPECIFICATION_REFINEMENT: "specification_refinement",
  SIZE_REFINEMENT: "size_refinement",
  USE_CASE_REFINEMENT: "use_case_refinement",
  ALTERNATIVE_REFINEMENT: "alternative_refinement",
  RELAX_CONSTRAINT: "relax_constraint",
  REMOVE_CONSTRAINT: "remove_constraint",
  CONFLICTING_REFINEMENT: "conflicting_refinement",
  AMBIGUOUS_REFINEMENT: "ambiguous_refinement",
  NONE: "none",
});

export const REFINEMENT_OPERATIONS = Object.freeze({
  ADD: "ADD",
  REPLACE: "REPLACE",
  REMOVE: "REMOVE",
  RELAX: "RELAX",
  EXCLUDE: "EXCLUDE",
});

export const DECISION_REFRESH_MODES = Object.freeze({
  REUSE_EXISTING_PRODUCT: "REUSE_EXISTING_PRODUCT",
  REUSE_RANKING_SNAPSHOT: "REUSE_RANKING_SNAPSHOT",
  RERANK_EXISTING_PRODUCTS: "RERANK_EXISTING_PRODUCTS",
  RUN_DECISION_ENGINE_WITH_EXISTING_DATA: "RUN_DECISION_ENGINE_WITH_EXISTING_DATA",
  RUN_GOVERNED_COMMERCIAL_SEARCH: "RUN_GOVERNED_COMMERCIAL_SEARCH",
  ASK_CLARIFICATION: "ASK_CLARIFICATION",
});

const CATEGORY_TOKEN_PATTERN =
  /\b(celular(?:es)?|smartphone(?:s)?|iphone(?:s)?|notebook(?:s)?|laptop(?:s)?|tv|televis(?:ao|ão|ões)|monitor(?:es)?|fone(?:s)?|headset(?:s)?|tablet(?:s)?|cadeira(?:s)?|geladeira(?:s)?|maquina de lavar|m[aá]quina de lavar|camera(?:s)?|c[aâ]mera(?:s)?|console(?:s)?|aspirador(?:es)?|tenis|t[eê]nis|perfume(?:s)?)\b/gi;

const BRAND_ALIASES = Object.freeze({
  iphone: "apple",
  apple: "apple",
  galaxy: "samsung",
  samsung: "samsung",
  motorola: "motorola",
  moto: "motorola",
  xiaomi: "xiaomi",
  redmi: "xiaomi",
  dell: "dell",
  lenovo: "lenovo",
  nike: "nike",
  applewatch: "apple",
});

const RELATIVE_PRICE_PATTERN =
  /\b(tem (?:um |uma )?(?:\w+\s+){0,3}mais barat\w*|algum(?:a)? (?:\w+\s+){0,3}(?:mais )?barat\w*|quero gastar menos|gastar menos|abaixo dis(?:so|se)|abaixo desse valor|quero o mais em conta|mais em conta|economizar(?: um pouco)?|ficou caro|quero (?:algo )?mais barat\w*|mais barat\w*)\b/;

const BUDGET_EXPLICIT_PATTERN =
  /\b(?:at[eé]|ate|m[aá]ximo|max(?:imo)?|por|de)\s*(?:r\$\s*)?(\d[\d.,]*)\b/;

const NEGATIVE_BRAND_PATTERN =
  /\b(sem\s+(\w+)|n[aã]o\s+quero\s+(?:\w+\s+)?(\w+)|pode excluir\s+(\w+)|qualquer marca menos\s+(\w+))\b/;

const POSITIVE_BRAND_PATTERN =
  /\b(prefiro\s+(\w+)|pode ser\s+(\w+)|gosto mais de\s+(\w+)|s[oó]\s+(\w+))\b/;

const ATTRIBUTE_PATTERN =
  /\b(quero mais bateria|mais bateria|bateria melhor|preciso de c[aâ]mera melhor|quero c[aâ]mera melhor|c[aâ]mera melhor|quero mais desempenho|mais desempenho|mais r[aá]pid\w*|tem (?:um |uma )?mais resistente|mais resistente|quero uma tela melhor|tela melhor|mais silencios\w*|perfume mais suave|mais suave)\b/;

const SPEC_PATTERN =
  /\b(preciso de|precisa ter|quero|tem que ser|mas preciso)\s*(?:de\s+)?(\d+\s*gb(?:\s+de\s+ram)?|\d+\s*gb|nfc|5g|120\s*hz|tela de 120)\b|\b(\d+\s*gb(?:\s+de\s+ram)?|nfc|5g|120\s*hz)\b/;

const SIZE_PATTERN =
  /\b(quero (?:um |uma )?menor|preciso de (?:um |uma )?(?:cadeira )?menor|tem (?:um |uma )?mais leve|mais leve|preciso de (?:uma )?tela maior|tela maior|n[aã]o quero algo grande|quero compacto|quero (?:um |uma )?compact\w*|quero (?:um |uma )?maior|maquina de lavar maior|m[aá]quina de lavar maior)\b/;

const USE_CASE_PATTERN =
  /\b([eé] mais para|quero usar para|vou usar para|preciso para|quero para)\s+(jogos|trabalhar|trabalho|minha m[aã]e|fotograf\w*|estudar|tirar fotos)\b|\b(para (?:minha )?m[aã]e|para jogos|para trabalho|para fotograf\w*)\b/;

const RELAX_PATTERN =
  /\b(pode ser (\w+) tamb[eé]m|n[aã]o precisa mais ter|pode passar (?:um pouco )?(?:de|do)|n[aã]o precisa ser|qualquer marca serve)\b/;

const REMOVE_SPEC_PATTERN =
  /\bn[aã]o precisa(?: mais)? ter\s+(\d+\s*gb|\w+)/;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBrandToken(token = "") {
  const raw = normalizeText(token);
  if (!raw) return "";
  return BRAND_ALIASES[raw] || raw;
}

function uniqueList(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function hasProductName(product) {
  return !!String(product?.product_name || "").trim();
}

function normalizeRanking(snapshot = []) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.filter((item) => hasProductName(item));
}

export function parseProductPrice(price) {
  const raw = String(price || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return null;
}

function formatPriceDisplay(value) {
  if (value == null || !Number.isFinite(value)) return "";
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function detectProductBrand(product = {}) {
  const name = normalizeText(product?.product_name || "");
  if (!name) return null;
  for (const [alias, brand] of Object.entries(BRAND_ALIASES)) {
    if (name.includes(alias)) return brand;
  }
  const tokens = name.split(/\s+/);
  for (const token of tokens) {
    const brand = normalizeBrandToken(token);
    if (BRAND_ALIASES[token] || Object.values(BRAND_ALIASES).includes(brand)) {
      return brand;
    }
  }
  return null;
}

function productMatchesStorage(product = {}, storageGb) {
  if (!storageGb) return true;
  const haystack = normalizeText(
    `${product?.product_name || ""} ${product?.description || ""} ${product?.storage || ""}`
  );
  return new RegExp(`\\b${storageGb}\\s*gb\\b`).test(haystack);
}

function productPassesBrandFilters(product = {}, constraints = {}) {
  const brand = detectProductBrand(product);
  const excluded = (constraints.excludedBrands || []).map(normalizeBrandToken);
  const preferred = (constraints.preferredBrands || []).map(normalizeBrandToken);

  if (brand && excluded.includes(brand)) return false;

  if (preferred.length > 0) {
    return brand ? preferred.includes(brand) : true;
  }
  return true;
}

function productPassesPriceFilters(product = {}, constraints = {}, baselineProduct = null) {
  const price = parseProductPrice(product?.price);
  if (constraints.budgetMax != null && price != null && price > constraints.budgetMax) {
    return false;
  }
  if (constraints.pricePreference === "cheaper_than_baseline") {
    const baseline =
      constraints.baselinePrice ??
      parseProductPrice(baselineProduct?.price) ??
      null;
    if (baseline != null && price != null && price >= baseline) return false;
  }
  return true;
}

function productPassesSpecFilters(product = {}, constraints = {}) {
  for (const spec of constraints.specifications || []) {
    const match = String(spec).match(/(\d+)\s*gb/i);
    if (match?.[1] && !productMatchesStorage(product, Number(match[1]))) {
      return false;
    }
  }
  return true;
}

function filterRankingByConstraints({
  ranking = [],
  constraints = {},
  baselineProduct = null,
  excludeProductName = "",
} = {}) {
  const excludeKey = normalizeText(excludeProductName);
  return ranking.filter((product) => {
    const nameKey = normalizeText(product?.product_name || "");
    if (excludeKey && nameKey === excludeKey) return false;
    if (!productPassesBrandFilters(product, constraints)) return false;
    if (!productPassesPriceFilters(product, constraints, baselineProduct)) return false;
    if (!productPassesSpecFilters(product, constraints)) return false;
    return true;
  });
}

function isExplicitCategorySwitch(message = "", priorCategory = "") {
  const q = normalizeText(message);
  if (!priorCategory || !q) return false;
  if (!/\b(agora quero|agora preciso|mudar para|e (?:um |uma )?|quero (?:um |uma )|preciso de (?:um |uma ))/i.test(q)) {
    return false;
  }
  const matches = [...String(message || "").matchAll(CATEGORY_TOKEN_PATTERN)];
  if (!matches.length) return false;
  const nextCategory = normalizeText(matches[matches.length - 1][0]);
  const blockedCategoryTokens = new Set(["camera", "cameras", "câmera", "câmeras"]);
  if (blockedCategoryTokens.has(nextCategory) && /\b(melhor|boa|boa|mais)\b/.test(q)) {
    return false;
  }
  return nextCategory && normalizeText(priorCategory) !== nextCategory;
}

export function extractPriorCommercialConstraints(sessionContext = {}) {
  const stored = sessionContext.lastCommercialConstraints || {};
  return {
    category:
      stored.category ||
      sessionContext.lastCategory ||
      null,
    budgetMax:
      stored.budgetMax ??
      sessionContext.budgetMax ??
      sessionContext.lastBudget ??
      null,
    preferredBrands: uniqueList([
      ...(stored.preferredBrands || []),
      ...(sessionContext.preferredBrands || []),
    ]),
    excludedBrands: uniqueList([
      ...(stored.excludedBrands || []),
      ...(sessionContext.excludedBrands || []),
    ]),
    desiredAttributes: uniqueList([
      ...(stored.desiredAttributes || []),
      ...(sessionContext.desiredAttributes || []),
      ...(sessionContext.lastPriority ? [sessionContext.lastPriority] : []),
    ]),
    specifications: uniqueList([
      ...(stored.specifications || []),
      ...(sessionContext.specifications || []),
    ]),
    sizePreference: stored.sizePreference || sessionContext.sizePreference || null,
    useCase: stored.useCase || sessionContext.useCase || null,
    pricePreference: stored.pricePreference || null,
    baselinePrice: stored.baselinePrice ?? null,
    baselineProductName:
      stored.baselineProductName ||
      sessionContext.lastBestProduct?.product_name ||
      null,
  };
}

function captureBrandFromMatch(match = []) {
  const raw = match[2] || match[3] || match[4] || match[5] || "";
  if (!isBrandLikeToken(raw)) return "";
  return normalizeBrandToken(raw);
}

const NON_BRAND_TOKENS = new Set([
  "mais",
  "menor",
  "maior",
  "barato",
  "caro",
  "leve",
  "melhor",
  "bom",
  "boa",
  "algo",
  "um",
  "uma",
  "bateria",
  "camera",
  "cam",
  "grande",
]);

function isBrandLikeToken(token = "") {
  const value = normalizeText(token);
  return value.length >= 3 && !NON_BRAND_TOKENS.has(value);
}

function capturePositiveBrandFromMatch(match = []) {
  const raw = match[2] || match[3] || match[4] || match[5] || "";
  if (!isBrandLikeToken(raw)) return "";
  return normalizeBrandToken(raw);
}

export function extractCommercialRefinement(message = "", sessionContext = {}) {
  const q = normalizeText(message);
  if (!q) {
    return {
      detected: false,
      refinementType: REFINEMENT_TYPES.NONE,
      operation: null,
      confidence: 0,
      requiresClarification: false,
    };
  }

  const priorCategory = sessionContext.lastCategory || null;
  if (isExplicitCategorySwitch(message, priorCategory)) {
    const matches = [...String(message || "").matchAll(CATEGORY_TOKEN_PATTERN)];
    const newCategory = normalizeText(matches[matches.length - 1][0]);
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.NONE,
      operation: REFINEMENT_OPERATIONS.REPLACE,
      confidence: 0.95,
      requiresClarification: false,
      topicSwitchCategory: newCategory,
      reasonCode: "explicit_new_category",
    };
  }

  const relaxMatch = q.match(RELAX_PATTERN);
  if (relaxMatch) {
    const removeSpec = q.match(REMOVE_SPEC_PATTERN);
    if (removeSpec) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.REMOVE_CONSTRAINT,
        operation: REFINEMENT_OPERATIONS.REMOVE,
        target: removeSpec[1],
        confidence: 0.88,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
    if (/qualquer marca serve/.test(q)) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.REMOVE_CONSTRAINT,
        operation: REFINEMENT_OPERATIONS.REMOVE,
        target: "brand_preferences",
        confidence: 0.9,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
    if (/pode passar/.test(q)) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.RELAX_CONSTRAINT,
        operation: REFINEMENT_OPERATIONS.RELAX,
        target: "budgetMax",
        confidence: 0.86,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.RELAX_CONSTRAINT,
      operation: REFINEMENT_OPERATIONS.RELAX,
      target: relaxMatch[1] || "constraint",
      confidence: 0.75,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  const sizeMatch = q.match(SIZE_PATTERN);
  if (sizeMatch) {
    let sizePreference = "compact";
    if (/maior|grande/.test(q) && !/n[aã]o quero algo grande/.test(q)) {
      sizePreference = "large";
    } else if (/leve/.test(q)) {
      sizePreference = "light";
    } else if (/compact|menor|n[aã]o quero algo grande/.test(q)) {
      sizePreference = "compact";
    }
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.SIZE_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      value: sizePreference,
      confidence: 0.88,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  const specMatch = q.match(SPEC_PATTERN);
  if (specMatch) {
    const spec = normalizeText(specMatch[2] || specMatch[3] || specMatch[1] || "");
    if (spec) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.SPECIFICATION_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.ADD,
        value: spec,
        confidence: 0.9,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
  }

  const negativeBrand = q.match(NEGATIVE_BRAND_PATTERN);
  if (negativeBrand) {
    const brand = captureBrandFromMatch(negativeBrand);
    if (brand) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.EXCLUDE,
        value: brand,
        confidence: 0.92,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
  }

  const attributeMatch = q.match(ATTRIBUTE_PATTERN);
  if (attributeMatch) {
    let attribute = normalizeText(attributeMatch[0]);
    if (/bateria/.test(attribute)) attribute = "battery";
    else if (/c[aâ]mera|camera/.test(attribute)) attribute = "camera";
    else if (/desempenho|r[aá]pid/.test(attribute)) attribute = "performance";
    else if (/resistente/.test(attribute)) attribute = "durability";
    else if (/tela/.test(attribute)) attribute = "display";
    else if (/silencios/.test(attribute)) attribute = "noise";
    else if (/suave/.test(attribute)) attribute = "scent";
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      value: attribute,
      confidence: 0.9,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  const useCaseMatch = q.match(USE_CASE_PATTERN);
  if (useCaseMatch) {
    const useCase = normalizeText(useCaseMatch[2] || useCaseMatch[1] || "");
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.USE_CASE_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      value: useCase,
      confidence: 0.87,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  const positiveBrand = q.match(POSITIVE_BRAND_PATTERN);
  if (positiveBrand && !/quero (?:um|uma|algo)\b/.test(q)) {
    const brand = capturePositiveBrandFromMatch(positiveBrand);
    if (brand) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.ADD,
        value: brand,
        confidence: 0.9,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
  }

  const budgetExplicit = q.match(BUDGET_EXPLICIT_PATTERN);
  const budgetFromExtractor = extractBudget(message);
  if (budgetExplicit || (budgetFromExtractor && /at[eé]|maximo|m[aá]ximo/.test(q))) {
    const raw = budgetExplicit?.[1] || String(budgetFromExtractor);
    const numeric = Number(String(raw).replace(/[^\d]/g, ""));
    if (numeric > 0) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.REPLACE,
        value: numeric,
        confidence: 0.93,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
  }

  if (RELATIVE_PRICE_PATTERN.test(q)) {
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.PRICE_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      value: "cheaper_than_baseline",
      confidence: 0.9,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  if (/\b(tem outr\w+|alguma alternativa|outra op[cç][ãa]o)\b/.test(q)) {
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.ALTERNATIVE_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      confidence: 0.72,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  if (
    /\b(mais barato|sem \w+|prefiro|quero mais|preciso de \d+|mas preciso)\b/.test(q)
  ) {
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.AMBIGUOUS_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      confidence: 0.45,
      requiresClarification: true,
      sourceMessage: message,
    };
  }

  return {
    detected: false,
    refinementType: REFINEMENT_TYPES.NONE,
    operation: null,
    confidence: 0,
    requiresClarification: false,
  };
}

export function mergePriorConstraintsWithRefinement(
  priorConstraints = {},
  refinement = {},
  { baselineProduct = null } = {}
) {
  const merged = {
    ...priorConstraints,
    preferredBrands: [...(priorConstraints.preferredBrands || [])],
    excludedBrands: [...(priorConstraints.excludedBrands || [])],
    desiredAttributes: [...(priorConstraints.desiredAttributes || [])],
    specifications: [...(priorConstraints.specifications || [])],
  };
  const removedConstraints = [];
  const replacedConstraints = [];
  const conflicts = [];
  const reasonCodes = [];

  if (!refinement?.detected) {
    return {
      mergedConstraints: merged,
      removedConstraints,
      replacedConstraints,
      conflicts,
      reasonCodes,
      requiresClarification: false,
    };
  }

  if (refinement.refinementType === REFINEMENT_TYPES.CONFLICTING_REFINEMENT) {
    return {
      mergedConstraints: merged,
      removedConstraints,
      replacedConstraints,
      conflicts: [refinement],
      reasonCodes: ["conflicting_refinement"],
      requiresClarification: true,
    };
  }

  switch (refinement.refinementType) {
    case REFINEMENT_TYPES.PRICE_REFINEMENT:
      merged.pricePreference = "cheaper_than_baseline";
      merged.baselinePrice =
        parseProductPrice(baselineProduct?.price) ?? merged.baselinePrice ?? null;
      merged.baselineProductName =
        baselineProduct?.product_name || merged.baselineProductName || null;
      reasonCodes.push("price_refinement_relative_to_baseline");
      break;

    case REFINEMENT_TYPES.BUDGET_REFINEMENT:
      replacedConstraints.push({
        field: "budgetMax",
        previous: merged.budgetMax ?? null,
        next: refinement.value,
      });
      merged.budgetMax = refinement.value;
      reasonCodes.push("budget_refinement_explicit_cap");
      break;

    case REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT: {
      const brand = normalizeBrandToken(refinement.value);
      if (merged.excludedBrands.includes(brand)) {
        conflicts.push({
          type: "brand_preference_vs_exclusion",
          brand,
        });
      } else {
        merged.preferredBrands = uniqueList([...merged.preferredBrands, brand]);
        reasonCodes.push("positive_brand_added");
      }
      break;
    }

    case REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT: {
      const brand = normalizeBrandToken(refinement.value);
      merged.excludedBrands = uniqueList([...merged.excludedBrands, brand]);
      if (merged.preferredBrands.includes(brand)) {
        merged.preferredBrands = merged.preferredBrands.filter((b) => b !== brand);
        removedConstraints.push({ field: "preferredBrands", value: brand });
        reasonCodes.push("excluded_brand_overrides_preference");
      } else {
        reasonCodes.push("negative_brand_excluded");
      }
      break;
    }

    case REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT:
      merged.desiredAttributes = uniqueList([
        ...merged.desiredAttributes,
        refinement.value,
      ]);
      reasonCodes.push("attribute_priority_added");
      break;

    case REFINEMENT_TYPES.SPECIFICATION_REFINEMENT:
      merged.specifications = uniqueList([
        ...merged.specifications,
        refinement.value,
      ]);
      reasonCodes.push("specification_added");
      break;

    case REFINEMENT_TYPES.SIZE_REFINEMENT:
      replacedConstraints.push({
        field: "sizePreference",
        previous: merged.sizePreference ?? null,
        next: refinement.value,
      });
      merged.sizePreference = refinement.value;
      reasonCodes.push("size_preference_updated");
      break;

    case REFINEMENT_TYPES.USE_CASE_REFINEMENT:
      replacedConstraints.push({
        field: "useCase",
        previous: merged.useCase ?? null,
        next: refinement.value,
      });
      merged.useCase = refinement.value;
      reasonCodes.push("use_case_updated");
      break;

    case REFINEMENT_TYPES.RELAX_CONSTRAINT:
      if (refinement.target === "budgetMax") {
        reasonCodes.push("budget_relaxed_requires_confirmation");
      } else {
        reasonCodes.push("constraint_relaxed");
      }
      break;

    case REFINEMENT_TYPES.REMOVE_CONSTRAINT:
      if (refinement.target === "brand_preferences") {
        removedConstraints.push({ field: "preferredBrands", value: merged.preferredBrands });
        removedConstraints.push({ field: "excludedBrands", value: merged.excludedBrands });
        merged.preferredBrands = [];
        merged.excludedBrands = [];
        reasonCodes.push("brand_preferences_cleared");
      } else if (/\d+\s*gb/.test(String(refinement.target || ""))) {
        const spec = normalizeText(refinement.target);
        merged.specifications = merged.specifications.filter(
          (item) => normalizeText(item) !== spec
        );
        removedConstraints.push({ field: "specifications", value: spec });
        reasonCodes.push("specification_removed");
      }
      break;

    default:
      break;
  }

  return {
    mergedConstraints: merged,
    removedConstraints,
    replacedConstraints,
    conflicts,
    reasonCodes,
    requiresClarification: conflicts.length > 0 || !!refinement.requiresClarification,
  };
}

export function resolveRefinementDecisionRefresh({
  mergeResult = {},
  sessionContext = {},
  baselineProduct = null,
} = {}) {
  const merged = mergeResult.mergedConstraints || {};
  const ranking = normalizeRanking(sessionContext.lastRankingSnapshot);
  const products = normalizeRanking(sessionContext.lastProducts);
  const sourceList = ranking.length ? ranking : products;

  if (mergeResult.requiresClarification && mergeResult.conflicts?.length) {
    return {
      mode: DECISION_REFRESH_MODES.ASK_CLARIFICATION,
      providerRequired: false,
      selectedProduct: null,
      reasonCode: "conflicting_constraints",
    };
  }

  if (!sourceList.length) {
    return {
      mode: DECISION_REFRESH_MODES.RUN_GOVERNED_COMMERCIAL_SEARCH,
      providerRequired: true,
      selectedProduct: null,
      reasonCode: "no_ranking_snapshot",
    };
  }

  const focal = baselineProduct || sessionContext.lastBestProduct || sourceList[0];
  const filtered = filterRankingByConstraints({
    ranking: sourceList,
    constraints: merged,
    baselineProduct: focal,
    excludeProductName:
      merged.pricePreference === "cheaper_than_baseline"
        ? focal?.product_name || ""
        : "",
  });

  if (filtered.length >= 1) {
    const selected = filtered[0];
    const sameAsFocal =
      normalizeText(selected?.product_name || "") ===
      normalizeText(focal?.product_name || "");
    return {
      mode: sameAsFocal
        ? DECISION_REFRESH_MODES.REUSE_EXISTING_PRODUCT
        : DECISION_REFRESH_MODES.RERANK_EXISTING_PRODUCTS,
      providerRequired: false,
      selectedProduct: selected,
      filteredRanking: filtered,
      reasonCode: sameAsFocal ? "existing_product_still_best" : "reranked_from_snapshot",
    };
  }

  const attributeOnly =
    mergeResult.reasonCodes?.includes("attribute_priority_added") &&
    !mergeResult.reasonCodes?.some((code) =>
      ["negative_brand_excluded", "price_refinement_relative_to_baseline", "specification_added"].includes(code)
    );

  if (attributeOnly) {
    return {
      mode: DECISION_REFRESH_MODES.RUN_GOVERNED_COMMERCIAL_SEARCH,
      providerRequired: true,
      selectedProduct: null,
      reasonCode: "attribute_refinement_requires_search",
    };
  }

  return {
    mode: DECISION_REFRESH_MODES.RUN_GOVERNED_COMMERCIAL_SEARCH,
    providerRequired: true,
    selectedProduct: null,
    reasonCode: "no_snapshot_match",
  };
}

export function resolveCommercialConstraintRefinement({
  message = "",
  sessionContext = {},
  hasValidContext = false,
  baselineProduct = null,
} = {}) {
  if (detectTopicSwitch(message)) {
    return {
      version: CONSTRAINT_REFINEMENT_VERSION,
      detected: false,
      requiresClarification: false,
      reasonCode: "topic_switch",
    };
  }

  const refinement = extractCommercialRefinement(message, sessionContext);

  if (refinement.topicSwitchCategory) {
    return {
      version: CONSTRAINT_REFINEMENT_VERSION,
      detected: true,
      refinement,
      requiresClarification: false,
      reasonCode: refinement.reasonCode,
      topicSwitchCategory: refinement.topicSwitchCategory,
      providerRequired: true,
      decisionRefreshMode: DECISION_REFRESH_MODES.RUN_GOVERNED_COMMERCIAL_SEARCH,
    };
  }

  if (!refinement.detected) {
    return {
      version: CONSTRAINT_REFINEMENT_VERSION,
      detected: false,
      requiresClarification: false,
      reasonCode: "no_refinement_signal",
    };
  }

  if (!hasValidContext) {
    return {
      version: CONSTRAINT_REFINEMENT_VERSION,
      detected: true,
      refinement,
      requiresClarification: true,
      reasonCode: "missing_commercial_context",
      providerRequired: false,
      decisionRefreshMode: DECISION_REFRESH_MODES.ASK_CLARIFICATION,
    };
  }

  const priorConstraints = extractPriorCommercialConstraints(sessionContext);
  const mergeResult = mergePriorConstraintsWithRefinement(
    priorConstraints,
    refinement,
    { baselineProduct }
  );

  if (mergeResult.requiresClarification) {
    return {
      version: CONSTRAINT_REFINEMENT_VERSION,
      detected: true,
      refinement,
      priorConstraints,
      mergeResult,
      requiresClarification: true,
      reasonCode: "constraint_conflict",
      providerRequired: false,
      decisionRefreshMode: DECISION_REFRESH_MODES.ASK_CLARIFICATION,
    };
  }

  const refresh = resolveRefinementDecisionRefresh({
    mergeResult,
    sessionContext,
    baselineProduct: baselineProduct || sessionContext.lastBestProduct || null,
  });

  return {
    version: CONSTRAINT_REFINEMENT_VERSION,
    detected: true,
    refinement,
    priorConstraints,
    mergeResult,
    mergedConstraints: mergeResult.mergedConstraints,
    requiresClarification: false,
    providerRequired: refresh.providerRequired,
    decisionRefreshMode: refresh.mode,
    selectedProduct: refresh.selectedProduct || null,
    filteredRanking: refresh.filteredRanking || null,
    reasonCode: refresh.reasonCode,
  };
}

export function applyMergedConstraintsToSessionContext(
  sessionContext = {},
  refinementResult = {}
) {
  const merged = refinementResult?.mergedConstraints;
  if (!merged) return sessionContext;
  const next = { ...(sessionContext || {}) };
  next.lastCommercialConstraints = {
    ...(next.lastCommercialConstraints || {}),
    ...merged,
    version: CONSTRAINT_REFINEMENT_VERSION,
    updatedAt: Date.now(),
  };
  if (merged.budgetMax != null) next.budgetMax = merged.budgetMax;
  if (merged.category) next.lastCategory = merged.category;
  if (Array.isArray(merged.desiredAttributes) && merged.desiredAttributes.length) {
    next.lastPriority = merged.desiredAttributes[merged.desiredAttributes.length - 1];
  }
  next.preferredBrands = merged.preferredBrands || [];
  next.excludedBrands = merged.excludedBrands || [];
  return next;
}

function refinementAckPhrase(refinement = {}) {
  const value =
    refinement.refinementType === REFINEMENT_TYPES.BUDGET_REFINEMENT
      ? formatPriceDisplay(refinement.value)
      : refinement.value;
  return polishRefinementAck(refinement.refinementType, value);
}

export function buildConstraintRefinementClarificationReply(refinementResult = {}) {
  const refinement = refinementResult?.refinement || {};
  return polishClarificationQuestion(refinement.refinementType);
}

export function buildConstraintRefinementDeterministicReply(refinementResult = {}) {
  if (refinementResult?.requiresClarification) {
    return {
      reply: buildConstraintRefinementClarificationReply(refinementResult),
      prices: [],
      responsePath: "constraint_refinement_clarification",
      formatterUsed: "buildConstraintRefinementClarificationReply",
    };
  }

  const product = refinementResult?.selectedProduct;
  const name = String(product?.product_name || "").trim();
  if (!name) return null;

  const refinement = refinementResult.refinement || {};
  const ack = refinementAckPhrase(refinement);
  const budget =
    refinementResult.mergedConstraints?.budgetMax ??
    refinementResult.priorConstraints?.budgetMax ??
    null;
  const budgetClause = budget ? " dentro do seu orçamento" : "";
  const priceDisplay = formatPriceDisplay(parseProductPrice(product?.price));

  const reply = polishRefinementRecommendation({
    ack,
    name,
    budgetClause,
    priceDisplay,
    isPriceRefinement: refinement.refinementType === REFINEMENT_TYPES.PRICE_REFINEMENT,
  });

  const card =
    product?.price || product?.link
      ? {
          product_name: name,
          price: product?.price || null,
          link: product?.link || null,
          thumbnail: product?.thumbnail || null,
          source: product?.source || "ranking anterior",
        }
      : null;

  return {
    reply,
    prices: card ? [card] : [],
    responsePath: "constraint_refinement_rerank",
    formatterUsed: "buildConstraintRefinementDeterministicReply",
    avoidFullRecommendationRepeat: true,
  };
}

export function constraintRefinementToTrace(result = null) {
  if (!result?.detected) return null;
  return {
    version: result.version,
    refinementType: result.refinement?.refinementType || null,
    refinementOperation: result.refinement?.operation || null,
    priorConstraints: result.priorConstraints || null,
    mergedConstraints: result.mergedConstraints || null,
    removedConstraints: result.mergeResult?.removedConstraints || [],
    constraintConflicts: result.mergeResult?.conflicts || [],
    decisionRefreshMode: result.decisionRefreshMode || null,
    providerRequired: result.providerRequired,
    selectedProductName: result.selectedProduct?.product_name || null,
    reasonCode: result.reasonCode || null,
    requiresClarification: result.requiresClarification,
  };
}
