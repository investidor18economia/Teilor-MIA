/**
 * PATCH 3.6.1 — Multi-refinement extraction (mixed intent integration)
 *
 * Independent probes + reconciliation. Used by miaCommercialConstraintRefinement.js.
 */

import { extractBudget, parseBudgetAmount } from "./miaRoutingSafety.js";

export function createCommercialRefinementMultiExtractor(deps = {}) {
  const {
    REFINEMENT_TYPES,
    REFINEMENT_OPERATIONS,
    normalizeText,
    normalizeBrandToken,
    isBrandLikeToken,
    detectProductBrand,
    tryExtractBrandServeRefinement,
    tryExtractBudgetCapOrCorrectionRefinement,
    tryExtractBudgetRefinement,
    isBudgetRelaxationMessage,
    isHardBudgetConstraintMessage,
    hasRefinementOverridePrefix,
    captureBrandFromMatch,
    capturePositiveBrandFromMatch,
    isExplicitCategorySwitch,
    CATEGORY_TOKEN_PATTERN,
    NEGATIVE_BRAND_PATTERN,
    DEPRIORITIZE_ATTRIBUTE_PATTERN,
    BRAND_RESTRICTION_PATTERN,
    PRIORITY_ADD_PATTERN,
    BUDGET_REDUCTION_CUE_PATTERN,
    MIXED_CLAUSE_SPLIT_PATTERN,
    COMMERCIAL_QUESTION_CLAUSE_PATTERN,
    USE_CASE_PATTERN,
    ATTRIBUTE_PATTERN,
    POSITIVE_BRAND_PATTERN,
    RELATIVE_PRICE_PATTERN,
    RELAX_PATTERN,
    REMOVE_SPEC_PATTERN,
    SIZE_PATTERN,
    SPEC_PATTERN,
  } = deps;

  function splitMixedRefinementClauses(message = "") {
    const parts = String(message || "")
      .split(MIXED_CLAUSE_SPLIT_PATTERN)
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length > 1 ? parts : [String(message || "").trim()];
  }

  function isCommercialQuestionClause(clause = "") {
    return COMMERCIAL_QUESTION_CLAUSE_PATTERN.test(normalizeText(clause));
  }

  function isHesitationOnlyBudgetRelax(q = "") {
    return /\btalvez\s+possa\s+passar\b/.test(q) || /\bainda\s+n[aã]o\s+decid/i.test(q);
  }

  function refinementKey(refinement = {}) {
    return [
      refinement.refinementType,
      refinement.operation,
      refinement.target || "",
      refinement.tighten ? "tighten" : "",
      Array.isArray(refinement.value) ? refinement.value.join("+") : refinement.value || "",
    ].join("|");
  }

  function probeBrandRestriction(message, q) {
    if (/\b(?:qual|quais)\b.{0,30}\bou\b/.test(q)) return null;
    const match = q.match(BRAND_RESTRICTION_PATTERN);
    if (!match) return null;
    if (match[1] && match[2]) {
      if (!isBrandLikeToken(match[1]) || !isBrandLikeToken(match[2])) return null;
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.REPLACE,
        value: [normalizeBrandToken(match[1]), normalizeBrandToken(match[2])],
        brandRestriction: true,
        confidence: 0.92,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
    const solo = match[3] || match[4];
    if (solo && isBrandLikeToken(solo)) {
      return {
        detected: true,
        refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.REPLACE,
        value: [normalizeBrandToken(solo)],
        brandRestriction: true,
        confidence: 0.91,
        requiresClarification: false,
        sourceMessage: message,
      };
    }
    return null;
  }

  function probeBudgetRelaxation(message, q, sessionContext) {
    if (!isBudgetRelaxationMessage(q) || isHesitationOnlyBudgetRelax(q)) return null;
    if (isHardBudgetConstraintMessage(q)) return null;
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

  function probePriorityAdd(message, q) {
    const match = q.match(PRIORITY_ADD_PATTERN);
    if (!match?.[1]) return null;
    let attribute = normalizeText(match[1]);
    if (/bateria/.test(attribute)) attribute = "battery";
    else if (/c[aâ]mera|camera/.test(attribute)) attribute = "camera";
    else if (/desempenho|jogos/.test(attribute)) attribute = "performance";
    else if (/tela/.test(attribute)) attribute = "display";
    else if (/preco|pre[cç]o/.test(attribute)) attribute = "price";
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

  function probeBudgetReduction(message, q) {
    if (!BUDGET_REDUCTION_CUE_PATTERN.test(q)) return null;
    const explicit = tryExtractBudgetRefinement(message, q);
    if (explicit) return explicit;
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.RELAX_CONSTRAINT,
      operation: REFINEMENT_OPERATIONS.RELAX,
      target: "budgetMax",
      tighten: true,
      confidence: 0.87,
      requiresClarification: false,
      sourceMessage: message,
    };
  }

  function probeRemoveOrRelaxFromPattern(message, q) {
    const relaxMatch = q.match(RELAX_PATTERN);
    if (!relaxMatch || isHardBudgetConstraintMessage(q)) return null;
    if (/\bpode ser \w+ tamb[eé]m\b/.test(q)) return null;

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
    if (isBudgetRelaxationMessage(q)) return null;
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

  function probeSizeRefinement(message, q) {
    const sizeMatch = q.match(SIZE_PATTERN);
    if (!sizeMatch) return null;
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

  function probeSpecificationRefinement(message, q) {
    const specMatch = q.match(SPEC_PATTERN);
    if (!specMatch) return null;
    const spec = normalizeText(specMatch[2] || specMatch[3] || specMatch[1] || "");
    if (!spec) return null;
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

  function collectRefinementProbes(message, sessionContext) {
    const q = normalizeText(message);
    if (!q) return [];

    const probes = [];
    const push = (ref) => {
      if (ref?.detected) probes.push(ref);
    };

    const brandAlsoMatch = q.match(/\bpode ser (\w+) tamb[eé]m\b/);
    if (brandAlsoMatch && isBrandLikeToken(brandAlsoMatch[1])) {
      const priorBrand = detectProductBrand(sessionContext?.lastBestProduct || {});
      const alsoBrand = normalizeBrandToken(brandAlsoMatch[1]);
      push({
        detected: true,
        refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.ADD,
        value: alsoBrand,
        inferredPriorBrand: priorBrand && priorBrand !== alsoBrand ? priorBrand : null,
        confidence: 0.91,
        requiresClarification: false,
        sourceMessage: message,
      });
    }

    const brandServe = tryExtractBrandServeRefinement(q);
    if (brandServe) {
      const priorBrand = detectProductBrand(sessionContext?.lastBestProduct || {});
      push({
        detected: true,
        refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.ADD,
        value: brandServe,
        inferredPriorBrand: priorBrand && priorBrand !== brandServe ? priorBrand : null,
        confidence: 0.9,
        requiresClarification: false,
        sourceMessage: message,
      });
    }

    push(tryExtractBudgetCapOrCorrectionRefinement(message, q));
    push(probeBrandRestriction(message, q));

    const considerBrandsMatch = q.match(/\bpode considerar (\w+) e (\w+)\b/);
    if (
      considerBrandsMatch &&
      isBrandLikeToken(considerBrandsMatch[1]) &&
      isBrandLikeToken(considerBrandsMatch[2])
    ) {
      push({
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
      });
    }

    push(probeBudgetRelaxation(message, q, sessionContext));

    const negativeBrand = q.match(NEGATIVE_BRAND_PATTERN);
    if (negativeBrand) {
      const brand = captureBrandFromMatch(negativeBrand);
      if (brand) {
        push({
          detected: true,
          refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT,
          operation: REFINEMENT_OPERATIONS.EXCLUDE,
          value: brand,
          confidence: 0.92,
          requiresClarification: false,
          sourceMessage: message,
        });
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
      push({
        detected: true,
        refinementType: REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.REMOVE,
        value: attribute,
        confidence: 0.88,
        requiresClarification: false,
        sourceMessage: message,
      });
    }

    push(probePriorityAdd(message, q));
    push(probeBudgetReduction(message, q));

    push(probeRemoveOrRelaxFromPattern(message, q));
    push(probeSizeRefinement(message, q));
    push(probeSpecificationRefinement(message, q));

    const attributeMatch = q.match(ATTRIBUTE_PATTERN);
    if (attributeMatch) {
      let attribute = normalizeText(attributeMatch[0]);
      if (/bateria/.test(attribute)) attribute = "battery";
      else if (/c[aâ]mera|camera/.test(attribute)) attribute = "camera";
      else if (/desempenho|r[aá]pid/.test(attribute)) attribute = "performance";
      else if (/resistente/.test(attribute)) attribute = "durability";
      else if (/tela/.test(attribute)) attribute = "display";
      push({
        detected: true,
        refinementType: REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.ADD,
        value: attribute,
        confidence: 0.9,
        requiresClarification: false,
        sourceMessage: message,
      });
    }

    const useCaseMatch = q.match(USE_CASE_PATTERN);
    if (useCaseMatch) {
      const useCase = normalizeText(
        useCaseMatch[1] || useCaseMatch[2] || useCaseMatch[3] || useCaseMatch[4] || ""
      );
      if (useCase) {
        const priorUseCase = normalizeText(
          sessionContext?.lastCommercialConstraints?.useCase || sessionContext?.useCase || ""
        );
        const isOverride =
          hasRefinementOverridePrefix(q) ||
          (priorUseCase &&
            priorUseCase !== useCase &&
            /\b(vou usar|quero usar|na verdade|mais pra)\b/.test(q));
        push({
          detected: true,
          refinementType: REFINEMENT_TYPES.USE_CASE_REFINEMENT,
          operation: isOverride ? REFINEMENT_OPERATIONS.REPLACE : REFINEMENT_OPERATIONS.ADD,
          value: useCase,
          confidence: isOverride ? 0.92 : 0.87,
          requiresClarification: false,
          sourceMessage: message,
        });
      }
    }

    const positiveBrand = q.match(POSITIVE_BRAND_PATTERN);
    if (positiveBrand && !/quero (?:um|uma|algo)\b/.test(q)) {
      const brand = capturePositiveBrandFromMatch(positiveBrand);
      if (brand && !probes.some((p) => p.brandRestriction)) {
        push({
          detected: true,
          refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
          operation: REFINEMENT_OPERATIONS.ADD,
          value: brand,
          confidence: 0.9,
          requiresClarification: false,
          sourceMessage: message,
        });
      }
    }

    push(tryExtractBudgetRefinement(message, q));

    if (RELATIVE_PRICE_PATTERN.test(q)) {
      push({
        detected: true,
        refinementType: REFINEMENT_TYPES.PRICE_REFINEMENT,
        operation: REFINEMENT_OPERATIONS.ADD,
        value: "cheaper_than_baseline",
        confidence: 0.9,
        requiresClarification: false,
        sourceMessage: message,
      });
    }

    return probes;
  }

  function reconcileRefinementCandidates(candidates = [], message = "") {
    const q = normalizeText(message);
    const byKey = new Map();
    for (const candidate of candidates) {
      const key = refinementKey(candidate);
      if (!byKey.has(key) || (candidate.confidence || 0) > (byKey.get(key).confidence || 0)) {
        byKey.set(key, candidate);
      }
    }

    let list = [...byKey.values()];

    const hasHardBudget = list.some(
      (r) =>
        r.refinementType === REFINEMENT_TYPES.BUDGET_REFINEMENT &&
        isHardBudgetConstraintMessage(q)
    );
    if (hasHardBudget) {
      list = list.filter(
        (r) =>
          !(r.refinementType === REFINEMENT_TYPES.RELAX_CONSTRAINT && r.target === "budgetMax")
      );
    }

    const hasBrandRestriction = list.some((r) => r.brandRestriction);
    if (hasBrandRestriction) {
      list = list.filter(
        (r) =>
          !(
            r.refinementType === REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT &&
            r.operation === REFINEMENT_OPERATIONS.ADD &&
            !r.brandRestriction
          )
      );
    }

    if (/\bn[aã]o\s+quero\s+\w+\s+nem\s+\w+\b/.test(q)) {
      list = list.filter((r) => r.refinementType !== REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT);
    }

    if (/\bj[aá]\s+passou\b/.test(q) && !isBudgetRelaxationMessage(q)) {
      list = list.filter(
        (r) =>
          !(r.refinementType === REFINEMENT_TYPES.RELAX_CONSTRAINT && r.target === "budgetMax")
      );
    }

    const hasRelax = list.some(
      (r) => r.refinementType === REFINEMENT_TYPES.RELAX_CONSTRAINT && r.target === "budgetMax" && !r.tighten
    );
    const hasTighten = list.some((r) => r.tighten);
    if (hasRelax && hasTighten) {
      list = list.filter((r) => !r.tighten);
    }

    return list.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  function extractCommercialRefinements(message = "", sessionContext = {}) {
    const q = normalizeText(message);
    if (!q) return [];

    if (isExplicitCategorySwitch(message, sessionContext.lastCategory || null)) {
      const matches = [...String(message || "").matchAll(CATEGORY_TOKEN_PATTERN)];
      const newCategory = normalizeText(matches[matches.length - 1][0]);
      return [
        {
          detected: true,
          refinementType: REFINEMENT_TYPES.NONE,
          operation: REFINEMENT_OPERATIONS.REPLACE,
          confidence: 0.95,
          requiresClarification: false,
          topicSwitchCategory: newCategory,
          reasonCode: "explicit_new_category",
          sourceMessage: message,
        },
      ];
    }

    const clauses = splitMixedRefinementClauses(message);
    const allCandidates = [];
    for (const clause of clauses) {
      if (isCommercialQuestionClause(clause)) continue;
      allCandidates.push(...collectRefinementProbes(clause, sessionContext));
    }
    if (!allCandidates.length) {
      allCandidates.push(...collectRefinementProbes(message, sessionContext));
    }
    return reconcileRefinementCandidates(allCandidates, message);
  }

  function extractCommercialRefinement(message = "", sessionContext = {}) {
    const refinements = extractCommercialRefinements(message, sessionContext);
    if (!refinements.length) {
      return {
        detected: false,
        refinementType: REFINEMENT_TYPES.NONE,
        operation: null,
        confidence: 0,
        requiresClarification: false,
      };
    }
    if (refinements.length === 1) {
      return refinements[0];
    }
    return {
      detected: true,
      refinementType: REFINEMENT_TYPES.MULTI_REFINEMENT,
      operation: REFINEMENT_OPERATIONS.ADD,
      confidence: Math.min(
        0.97,
        refinements.reduce((acc, r) => acc + (r.confidence || 0), 0) / refinements.length
      ),
      requiresClarification: false,
      multiRefinements: refinements,
      refinements,
      sourceMessage: message,
    };
  }

  return {
    extractCommercialRefinements,
    extractCommercialRefinement,
  };
}
