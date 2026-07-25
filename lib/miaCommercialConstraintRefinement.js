/**
 * PATCH 11B.3 / 3.4b — RF-01 Constraint Refinement Continuity
 *
 * Incremental commercial refinements merge with prior constraints and reuse
 * ranking snapshots before authorizing new provider calls.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { extractBudget, parseBudgetAmount } from "./miaRoutingSafety.js";
import { detectTopicSwitch } from "./miaCommercialFollowUpContinuity.js";
import {
  polishClarificationQuestion,
  polishRefinementAck,
  polishRefinementRecommendation,
} from "./miaConversationPolish.js";
import {
  buildCommercialRefinementNarrative,
  collectRefinementDecisionFacts,
  decisionFactsNarrativeToTrace,
  isShallowCommercialReply,
} from "./miaDecisionFactsNarrative.js";

export const CONSTRAINT_REFINEMENT_VERSION = "3.6.0";

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
  /\b(?:at[eé]|ate|m[aá]ximo|max(?:imo)?|por\s+at[eé])\s*(?:r\$\s*)?(\d[\d.,]*)\b/;

const NEGATIVE_BRAND_PATTERN =
  /\b(sem\s+(\w+)|n[aã]o\s+quero\s+(?:\w+\s+)?(\w+)|pode excluir\s+(\w+)|pode tirar\s+(\w+)|qualquer marca menos\s+(\w+))\b/;

const POSITIVE_BRAND_PATTERN =
  /\b(prefiro\s+(\w+)|pode ser\s+(\w+)|gosto mais de\s+(\w+)|s[oó]\s+(\w+))\b/;

const ATTRIBUTE_PATTERN =
  /\b(quero mais bateria|mais bateria|bateria melhor|preciso de c[aâ]mera melhor|quero c[aâ]mera melhor|c[aâ]mera melhor|quero mais desempenho|mais desempenho|mais r[aá]pid\w*|tem (?:um |uma )?mais resistente|mais resistente|quero uma tela melhor|tela melhor|mais silencios\w*|perfume mais suave|mais suave)\b/;

const SPEC_PATTERN =
  /\b(preciso de|precisa ter|quero|tem que ser|mas preciso)\s*(?:de\s+)?(\d+\s*gb(?:\s+de\s+ram)?|\d+\s*gb|nfc|5g|120\s*hz|tela de 120)\b|\b(\d+\s*gb(?:\s+de\s+ram)?|nfc|5g|120\s*hz)\b/;

const SIZE_PATTERN =
  /\b(quero (?:um |uma )?menor|preciso de (?:um |uma )?(?:cadeira )?menor|tem (?:um |uma )?mais leve|mais leve|preciso de (?:uma )?tela maior|tela maior|n[aã]o quero algo grande|quero compacto|quero (?:um |uma )?compact\w*|quero (?:um |uma )?maior|maquina de lavar maior|m[aá]quina de lavar maior)\b/;

const USE_CASE_TERMS =
  "jogos|trabalhar|trabalho|minha mae|fotograf\\w*|estudar|estudo|faculdade|facul|universidade|escola|tirar fotos|dia a dia|streaming|programar|programacao|programação";

const USE_CASE_PATTERN = new RegExp(
  `\\b(?:na\\s+(?:verdade|real))\\s*(?:e\\s+)?(?:pra|para)\\s+(${USE_CASE_TERMS})\\b|\\b(?:na verdade\\s+)?(?:[eé] mais para|quero usar para|vou usar para|vou usar na|vou usar no|preciso para|quero para|vou usar mais para)\\s+(${USE_CASE_TERMS})\\b|\\b(?:vai ser )?mais pra (${USE_CASE_TERMS}) do que\\b|\\b(para (?:minha )?m[aã]e|para jogos|para trabalho|para fotograf\\w*|para faculdade|para estudar|para estudo)\\b`,
  "i"
);

const DEPRIORITIZE_ATTRIBUTE_PATTERN =
  /\b(bateria|c[aâ]mera|camera|desempenho|tela|preco|pre[cç]o)\s+n[aã]o\s+importa(?: tanto)?\b/;

const BRAND_SERVE_PATTERN =
  /\b([a-z0-9]+)\s+(?:tbm|tb|tambem)\s+(?:serve|pode|funciona)\b|\b(?:serve|funciona)\s+(?:tbm|tb|tambem)\s+([a-z0-9]+)\b/;

const BUDGET_INCREASE_CUE_PATTERN =
  /\b(pode\s+(?:aumentar|subir|ir|chegar)|da\s+pra\s+(?:subir|aumentar|ir|chegar)|aumentar\s+(?:para|pra|ate|at[eé])|subir\s+(?:para|pra|ate|at[eé]))\b/;

const HARD_BUDGET_CONSTRAINT_PATTERN =
  /\b(n[aã]o\s+pode\s+passar|n[aã]o\s+pode\s+ultrapassar|n[aã]o\s+pode\s+passar\s+de|limite\s+r[ií]gid[oa]|teto\s+firm[eao]|continua\s+sendo\s+meu\s+limite|nao\s+pode\s+passar\s+dos)\b/;

const REFINEMENT_OVERRIDE_PREFIX_PATTERN =
  /\b(na verdade|mudei de ideia|na real|agora|antes|melhor)\b/;

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
  const raw = match[2] || match[3] || match[4] || match[5] || match[6] || "";
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
  "ate",
  "até",
  "r$",
  "rs",
  "reais",
  "real",
  "maximo",
  "max",
  "por",
  "de",
  "posso",
  "consigo",
  "gastar",
  "so",
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

function hasRefinementOverridePrefix(q = "") {
  return REFINEMENT_OVERRIDE_PREFIX_PATTERN.test(q);
}

function isHardBudgetConstraintMessage(q = "") {
  return HARD_BUDGET_CONSTRAINT_PATTERN.test(q);
}

function isBudgetRelaxationMessage(q = "") {
  if (isHardBudgetConstraintMessage(q)) return false;
  if (/\b(j[aá]\s+passou|quanto\s+passa|passou\s+do\s+or[cç]amento)\b/.test(q)) return false;
  if (/\btalvez\s+possa\s+passar\b/.test(q)) return false;
  return (
    /\bpode\s+passar\b/.test(q) ||
    /\b(se\s+passa\s+um\s+pouco|pode\s+ser\s+mais\s+caro|se\s+compensar)\b/.test(q) ||
    /\b(se\s+valer\s+a\s+pena|consigo\s+gastar\s+mais|posso\s+gastar\s+mais|nao\s+precisa\s+ficar\s+preso|nao\s+precisa\s+ficar\s+preso\s+aos)\b/.test(
      q
    )
  );
}

function tryExtractBrandServeRefinement(q = "") {
  const match = q.match(BRAND_SERVE_PATTERN);
  if (!match) return null;
  const raw = match[1] || match[2] || "";
  if (!isBrandLikeToken(raw)) return null;
  const brand = normalizeBrandToken(raw);
  return brand || null;
}

function extractHardCapBudget(message = "", q = "") {
  const direct = extractBudget(message);
  if (direct != null) return direct;
  const match = q.match(
    /\b(?:de|dos|em|ate|at[eé]|por)\s*(?:r\$\s*)?(\d+(?:[.,]\d+)*)\s*(mil|k)?\b/i
  );
  if (!match?.[1]) return null;
  let numeric = parseBudgetAmount(match[1]);
  if ((match[2] || /\bmil\b/.test(q.slice(match.index || 0, (match.index || 0) + 24))) && numeric < 1000) {
    numeric *= 1000;
  }
  return numeric;
}

function tryExtractBudgetCapOrCorrectionRefinement(message = "", q = "") {
  const spendCapMatch = q.match(/\b(?:so|só)\s+posso\s+gastar\s*(?:r\$\s*)?(\d[\d.,]*)\b/);
  if (spendCapMatch?.[1]) {
    const numeric = parseBudgetAmount(spendCapMatch[1]);
    if (numeric != null && numeric > 0) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.REPLACE,
        value: numeric,
        confidence: 0.92,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
  }

  if (/\b(corrigindo|quis dizer|errei)\b/.test(q)) {
    const numeric =
      extractBudget(message) ||
      (() => {
        const spaced = String(message).match(/(\d{1,3})[\s.](\d{3})\b/);
        if (spaced) {
          return Number(spaced[1]) * 1000 + Number(spaced[2]);
        }
        const dotted = String(message).match(/(\d{1,3}(?:\.\d{3})+)/);
        if (dotted?.[1]) {
          return Number(dotted[1].replace(/\./g, ""));
        }
        const m = q.match(/\b(\d+(?:,\d+)?)\b/);
        return m?.[1] ? parseBudgetAmount(m[1]) : null;
      })();
    if (numeric != null && numeric > 0) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.REPLACE,
        value: numeric,
        confidence: 0.94,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
  }

  return null;
}

function tryExtractBudgetRefinement(message = "", q = "") {
  if (isHardBudgetConstraintMessage(q)) {
    const hardCapValue = extractHardCapBudget(message, q);
    if (hardCapValue != null && Number.isFinite(hardCapValue) && hardCapValue > 0) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.REPLACE,
        value: hardCapValue,
        confidence: 0.94,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
  }

  const budgetValue = extractBudget(message);
  const explicitMatch = q.match(BUDGET_EXPLICIT_PATTERN);
  const increaseMatch =
    BUDGET_INCREASE_CUE_PATTERN.test(q) &&
    q.match(/\b(?:para|pra|ate|at[eé])\s*(?:r\$\s*)?(\d[\d.,]*)\b/);
  const hasBudgetCue =
    !!explicitMatch ||
    !!increaseMatch ||
    (budgetValue != null &&
      (/\b(at[eé]|ate|maximo|max|na verdade|pode ser at[eé]|r\$\s*\d)/.test(q) ||
        BUDGET_INCREASE_CUE_PATTERN.test(q)));

  if (!hasBudgetCue) return null;

  let numeric = budgetValue;
  if ((numeric == null || !Number.isFinite(numeric)) && explicitMatch?.[1]) {
    numeric = parseBudgetAmount(explicitMatch[1]);
  }
  if ((numeric == null || !Number.isFinite(numeric)) && increaseMatch?.[1]) {
    numeric = parseBudgetAmount(increaseMatch[1]);
  }
  if (numeric == null || !Number.isFinite(numeric) || numeric <= 0) return null;

  return {
    detected: true,
    refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
    operation: REFINEMENT_OPERATIONS.REPLACE,
    value: numeric,
    confidence: hasRefinementOverridePrefix(q) ? 0.95 : 0.93,
    requiresClarification: false,
    sourceMessage: message,
  };
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

  const brandAlsoMatch = q.match(/\bpode ser (\w+) tamb[eé]m\b/);
  if (brandAlsoMatch && isBrandLikeToken(brandAlsoMatch[1])) {
    const priorBrand = detectProductBrand(sessionContext?.lastBestProduct || {});
    const alsoBrand = normalizeBrandToken(brandAlsoMatch[1]);
    const inferredPrior =
      priorBrand && priorBrand !== alsoBrand ? priorBrand : null;
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      value: alsoBrand,
      inferredPriorBrand: inferredPrior,
      confidence: 0.91,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  const brandServe = tryExtractBrandServeRefinement(q);
  if (brandServe) {
    const priorBrand = detectProductBrand(sessionContext?.lastBestProduct || {});
    const inferredPrior =
      priorBrand && priorBrand !== brandServe ? priorBrand : null;
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      value: brandServe,
      inferredPriorBrand: inferredPrior,
      confidence: 0.9,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  const budgetCapOrCorrection = tryExtractBudgetCapOrCorrectionRefinement(message, q);
  if (budgetCapOrCorrection) {
    return budgetCapOrCorrection;
  }

  const considerBrandsMatch = q.match(/\bpode considerar (\w+) e (\w+)\b/);
  if (
    considerBrandsMatch &&
    isBrandLikeToken(considerBrandsMatch[1]) &&
    isBrandLikeToken(considerBrandsMatch[2])
  ) {
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      value: [
        normalizeBrandToken(considerBrandsMatch[1]),
        normalizeBrandToken(considerBrandsMatch[2]),
      ],
      confidence: 0.9,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  if (isBudgetRelaxationMessage(q)) {
    const budgetFlexMatch = q.match(/\bpode passar (?:um pouco )?(?:de|do|dos)\b/);
    if (budgetFlexMatch) {
      const flexBudget = extractBudget(message);
      const priorBudget =
        sessionContext?.budgetMax ??
        sessionContext?.lastCommercialConstraints?.budgetMax ??
        null;
      if (flexBudget && priorBudget && flexBudget > priorBudget) {
        return {
          detected: true,
          refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
          operation: REFINEMENT_OPERATIONS.REPLACE,
          value: flexBudget,
          confidence: 0.9,
          requiresClarification: false,
          sourceMessage: message,
        };
      }
    }
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.RELAX_CONSTRAINT,
      operation: REFINEMENT_OPERATIONS.RELAX,
      target: "budgetMax",
      confidence: 0.9,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  const relaxMatch = q.match(RELAX_PATTERN);
  if (relaxMatch && !isHardBudgetConstraintMessage(q)) {
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
    if (isBudgetRelaxationMessage(q)) {
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

  const deprioritizeMatch = q.match(DEPRIORITIZE_ATTRIBUTE_PATTERN);
  if (deprioritizeMatch) {
    let attribute = normalizeText(deprioritizeMatch[1]);
    if (/bateria/.test(attribute)) attribute = "battery";
    else if (/c[aâ]mera|camera/.test(attribute)) attribute = "camera";
    else if (/desempenho/.test(attribute)) attribute = "performance";
    else if (/tela/.test(attribute)) attribute = "display";
    else if (/preco|pre[cç]o/.test(attribute)) attribute = "price";
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.REMOVE,
      value: attribute,
      confidence: 0.88,
      requiresClarification: false,
      sourceMessage: message,
    };
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
    const useCase = normalizeText(
      useCaseMatch[1] || useCaseMatch[2] || useCaseMatch[3] || useCaseMatch[4] || ""
    );
    const priorUseCase = normalizeText(
      sessionContext?.lastCommercialConstraints?.useCase ||
        sessionContext?.useCase ||
        ""
    );
    const isOverride =
      hasRefinementOverridePrefix(q) ||
      (priorUseCase && priorUseCase !== useCase && /\b(vou usar|quero usar|na verdade)\b/.test(q));
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.USE_CASE_REFINEMENT,
      operation: isOverride ? REFINEMENT_OPERATIONS.REPLACE : REFINEMENT_OPERATIONS.ADD,
      value: useCase,
      confidence: isOverride ? 0.92 : 0.87,
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

  const budgetRefinement = tryExtractBudgetRefinement(message, q);
  if (budgetRefinement) {
    return budgetRefinement;
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
      const brands = Array.isArray(refinement.value)
        ? refinement.value.map((entry) => normalizeBrandToken(entry)).filter(Boolean)
        : [normalizeBrandToken(refinement.value)].filter(Boolean);
      if (refinement.inferredPriorBrand) {
        merged.preferredBrands = uniqueList([
          ...merged.preferredBrands,
          refinement.inferredPriorBrand,
        ]);
        reasonCodes.push("prior_anchor_brand_inferred");
      }
      for (const brand of brands) {
        if (merged.excludedBrands.includes(brand)) {
          conflicts.push({
            type: "brand_preference_vs_exclusion",
            brand,
          });
        } else {
          merged.preferredBrands = uniqueList([...merged.preferredBrands, brand]);
          reasonCodes.push("positive_brand_added");
        }
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
      if (refinement.operation === REFINEMENT_OPERATIONS.REMOVE) {
        merged.desiredAttributes = merged.desiredAttributes.filter(
          (entry) => normalizeText(entry) !== normalizeText(refinement.value)
        );
        reasonCodes.push("attribute_deprioritized");
      } else {
        merged.desiredAttributes = uniqueList([
          ...merged.desiredAttributes,
          refinement.value,
        ]);
        reasonCodes.push("attribute_priority_added");
      }
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
      if (refinement.target === "budgetMax" && merged.budgetMax != null) {
        const previousBudget = merged.budgetMax;
        merged.budgetMax = Math.round(Number(merged.budgetMax) * 1.15);
        replacedConstraints.push({
          field: "budgetMax",
          previous: previousBudget,
          next: merged.budgetMax,
        });
        reasonCodes.push("budget_relaxed_soft_cap");
      } else if (refinement.target === "budgetMax") {
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

export function buildConstraintRefinementDeterministicReply(
  refinementResult = {},
  sessionContext = {}
) {
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
  const facts = collectRefinementDecisionFacts(refinementResult, sessionContext);
  let reply = buildCommercialRefinementNarrative(facts, {
    seed: refinement.sourceMessage || facts.sourceMessage || "",
  });

  if (!reply || isShallowCommercialReply(reply)) {
    const ack = refinementAckPhrase(refinement);
    const budget =
      refinementResult.mergedConstraints?.budgetMax ??
      refinementResult.priorConstraints?.budgetMax ??
      null;
    const budgetClause = budget ? " dentro do seu orçamento" : "";
    const priceDisplay = formatPriceDisplay(parseProductPrice(product?.price));
    reply = polishRefinementRecommendation({
      ack,
      name,
      budgetClause,
      priceDisplay,
      isPriceRefinement: refinement.refinementType === REFINEMENT_TYPES.PRICE_REFINEMENT,
    });
  }

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
    decisionFactsNarrative: decisionFactsNarrativeToTrace(facts),
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
