/**
 * PATCH 3.5a — Decision Facts, Narrative & Commercial Explanation
 *
 * Transports facts already computed by the Decision Engine to verbalization.
 * Does not decide, rank, or recalculate — only explains existing decisions.
 */

import { REFINEMENT_TYPES, REFINEMENT_OPERATIONS } from "./miaCommercialConstraintRefinement.js";
import {
  VERBALIZER_HUMANIZATION_VERSION,
  buildHumanizedRefinementTransition,
  buildHumanizedReevaluationBridge,
  buildHumanizedWinnerDecision,
  buildHumanizedContinuityLine,
  buildHumanizedTransitionAck,
  buildHumanizedGenericAck,
  humanizeTradeoffLine,
  isRoboticSurfaceReply,
} from "./miaVerbalizerHumanization.js";
import {
  applyLegacyDecisionFactsAdapter,
  enrichDecisionFactsWithStructure,
  getStructuredPrimaryEffectKey,
  hasStructuredDecisionFacts,
  structuredDecisionFactsToTrace,
} from "./miaStructuredDecisionFacts.js";

export const DECISION_FACTS_NARRATIVE_VERSION = "4A.2.0";

const AXIS_LABELS = Object.freeze({
  value: "custo-benefício",
  battery: "bateria",
  camera: "câmera",
  performance: "desempenho",
  durability: "durabilidade",
  display: "tela",
  price: "preço",
  gaming: "jogos",
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value = "") {
  return cleanText(value).toLowerCase();
}

function formatBudget(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function axisLabel(axis = "") {
  const key = normalizeKey(axis);
  return AXIS_LABELS[key] || cleanText(axis) || "equilíbrio geral";
}

function shortProductName(name = "") {
  const n = cleanText(name);
  if (n.length <= 48) return n;
  return `${n.slice(0, 45).trim()}…`;
}

export function isShallowCommercialReply(text = "") {
  return isRoboticSurfaceReply(text);
}

/**
 * Collect decision facts already present in session — no recalculation.
 * When semantic units are available, enriches with structured hierarchy (PATCH 4A.2).
 */
export function collectDecisionFactsFromSession(sessionContext = {}, options = {}) {
  const ranking = Array.isArray(sessionContext.lastRankingSnapshot)
    ? sessionContext.lastRankingSnapshot.filter((p) => p?.product_name)
    : [];
  const winner = sessionContext.lastBestProduct || ranking[0] || null;
  const runnerUp = ranking.find((p) => Number(p.rank) === 2) || ranking[1] || null;

  const primaryAxis =
    sessionContext.lastAxis ||
    sessionContext.lastPriority ||
    sessionContext.lastCommercialConstraints?.desiredAttributes?.slice(-1)[0] ||
    "";

  const base = {
    version: DECISION_FACTS_NARRATIVE_VERSION,
    winner: winner?.product_name ? { ...winner, product_name: cleanText(winner.product_name) } : null,
    runnerUp: runnerUp?.product_name
      ? { ...runnerUp, product_name: cleanText(runnerUp.product_name) }
      : null,
    primaryAxis: cleanText(primaryAxis),
    primaryAxisLabel: axisLabel(primaryAxis),
    tradeoff: cleanText(sessionContext.lastTradeoff),
    decisionReason: cleanText(sessionContext.lastDecisionReason),
    mainConsequence: cleanText(sessionContext.lastMainConsequence),
    advantages: (sessionContext.lastWinnerAdvantages || []).map(cleanText).filter(Boolean),
    sacrifices: (sessionContext.lastWinnerSacrifices || []).map(cleanText).filter(Boolean),
    budgetMax:
      sessionContext.budgetMax ?? sessionContext.lastCommercialConstraints?.budgetMax ?? null,
    useCase: cleanText(
      sessionContext.useCase || sessionContext.lastCommercialConstraints?.useCase || ""
    ),
    category: cleanText(sessionContext.lastCategory || ""),
    hasCommercialContext: !!winner?.product_name,
  };

  const semanticUnits =
    options.semanticUnits ||
    sessionContext.lastSemanticDecisionUnits ||
    sessionContext.semanticUnits ||
    [];
  const sacrificeUnits =
    options.sacrificeUnits ||
    sessionContext.lastSemanticSacrificeUnits ||
    sessionContext.semanticSacrificeUnits ||
    [];

  if (sessionContext.lastStructuredDecisionFacts?.semanticUnits?.length) {
    return applyLegacyDecisionFactsAdapter(base, sessionContext.lastStructuredDecisionFacts);
  }

  if (semanticUnits.length || sacrificeUnits.length) {
    return enrichDecisionFactsWithStructure(base, {
      semanticUnits,
      gainUnits: semanticUnits,
      sacrificeUnits,
      category: base.category,
      primaryAxis: base.primaryAxis,
    });
  }

  return base;
}

function describeRefinementTypeChange(refinement = {}, prior = {}, merged = {}) {
  const type = refinement.refinementType;
  const value = refinement.value;

  switch (type) {
    case REFINEMENT_TYPES.BUDGET_REFINEMENT:
      return prior.budgetMax != null && merged.budgetMax != null
        ? `o teto passou de ${formatBudget(prior.budgetMax)} para ${formatBudget(merged.budgetMax)}`
        : merged.budgetMax != null
          ? `o teto ficou em ${formatBudget(merged.budgetMax)}`
          : "o orçamento foi ajustado";
    case REFINEMENT_TYPES.PRICE_REFINEMENT:
      return "você pediu algo mais em conta que a opção anterior";
    case REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT:
      if (refinement.brandRestriction || refinement.operation === REFINEMENT_OPERATIONS.REPLACE) {
        const brands = Array.isArray(value) ? value : [value].filter(Boolean);
        return brands.length
          ? `a busca ficou restrita a ${brands.join(" e ")}`
          : "a busca ficou restrita às marcas pedidas";
      }
      return value
        ? `a marca ${value} entrou na análise`
        : "uma nova preferência de marca entrou na análise";
    case REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT:
      return value ? `${value} saiu da comparação` : "uma marca foi retirada da comparação";
    case REFINEMENT_TYPES.USE_CASE_REFINEMENT:
      return value ? `o uso principal passou a ser ${value}` : "o uso principal mudou";
    case REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT:
      return value
        ? `a prioridade em ${axisLabel(value)} ganhou peso`
        : "uma nova prioridade entrou na decisão";
    case REFINEMENT_TYPES.SPECIFICATION_REFINEMENT:
      return value ? `${value} passou a ser requisito` : "uma especificação nova entrou nos critérios";
    case REFINEMENT_TYPES.SIZE_REFINEMENT:
      return "o tamanho ideal foi ajustado";
    case REFINEMENT_TYPES.RELAX_CONSTRAINT:
      return refinement.target === "budgetMax" ||
        /or[cç]amento|passar/.test(String(refinement.sourceMessage || ""))
        ? "o orçamento ficou um pouco mais flexível"
        : "uma restrição foi relaxada";
    case REFINEMENT_TYPES.REMOVE_CONSTRAINT:
      return "uma restrição anterior deixou de valer";
    default:
      return "você refinou um critério da busca";
  }
}

/**
 * Facts for constraint-refinement verbalization paths.
 */
export function collectRefinementDecisionFacts(refinementResult = {}, sessionContext = {}) {
  const base = collectDecisionFactsFromSession(sessionContext);
  const prior = refinementResult.priorConstraints || {};
  const merged = refinementResult.mergedConstraints || {};
  const refinements = Array.isArray(refinementResult.refinements)
    ? refinementResult.refinements.filter(Boolean)
    : refinementResult.refinement?.refinements ||
      refinementResult.refinement?.multiRefinements ||
      [];
  const refinement =
    refinements.length === 1
      ? refinements[0]
      : refinementResult.refinement?.refinementType === REFINEMENT_TYPES.MULTI_REFINEMENT
        ? refinementResult.refinement
        : refinementResult.refinement || refinements[0] || {};
  const selected = refinementResult.selectedProduct || null;
  const priorWinnerName = cleanText(base.winner?.product_name || "");
  const newWinnerName = cleanText(selected?.product_name || priorWinnerName);
  const winnerChanged =
    !!priorWinnerName &&
    !!newWinnerName &&
    normalizeKey(priorWinnerName) !== normalizeKey(newWinnerName);

  const changeSummaries =
    refinements.length > 1
      ? refinements.map((step) => describeRefinementTypeChange(step, prior, merged))
      : [describeRefinementTypeChange(refinement, prior, merged)];

  return {
    ...base,
    refinementType: refinement.refinementType || null,
    refinementOperation: refinement.operation || null,
    refinements,
    changeSummaries,
    changeSummary: changeSummaries.filter(Boolean).join("; "),
    priorConstraints: prior,
    mergedConstraints: merged,
    decisionRefreshMode: refinementResult.decisionRefreshMode || null,
    selectedProduct: selected,
    priorWinnerName,
    newWinnerName,
    winnerChanged,
    runnerUpName: cleanText(base.runnerUp?.product_name || ""),
    refreshReason: cleanText(refinementResult.reasonCode || ""),
    sourceMessage: cleanText(
      refinement.sourceMessage || refinementResult.refinement?.sourceMessage || ""
    ),
  };
}

function whatStaysSame(facts = {}) {
  const parts = [];
  if (facts.primaryAxisLabel && facts.primaryAxisLabel !== "equilíbrio geral") {
    parts.push(`o foco em ${facts.primaryAxisLabel}`);
  }
  if (facts.useCase) {
    parts.push(`o uso para ${facts.useCase}`);
  }
  if (
    facts.mergedConstraints?.budgetMax &&
    facts.refinementType !== REFINEMENT_TYPES.BUDGET_REFINEMENT
  ) {
    parts.push(`a faixa até ${formatBudget(facts.mergedConstraints.budgetMax)}`);
  }
  if (!parts.length && facts.advantages?.length) {
    parts.push(`o que pesou a favor (${facts.advantages.slice(0, 2).join(", ")})`);
  }
  if (!parts.length) return "";
  if (parts.length === 1) return `O que continua valendo é ${parts[0]}.`;
  return `O que continua valendo: ${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}.`;
}

function whyOutcome(facts = {}) {
  if (facts.decisionReason) return facts.decisionReason;
  if (hasStructuredDecisionFacts(facts)) {
    const primaryText =
      facts.structured?.legacy?.mainConsequence ||
      facts.structured?.primaryGain?.unit?.implication?.interpretedSourceText ||
      "";
    if (primaryText) return primaryText;
    const effectKey = getStructuredPrimaryEffectKey(facts);
    if (effectKey) return `continua sendo a opção mais coerente para ${facts.primaryAxisLabel || "o perfil"}`;
  }
  if (facts.mainConsequence) return facts.mainConsequence;
  if (facts.advantages?.length) {
    return `ainda combina melhor com ${facts.advantages.slice(0, 2).join(" e ")}`;
  }
  if (facts.primaryAxisLabel) {
    return `continua sendo o melhor equilíbrio para ${facts.primaryAxisLabel}`;
  }
  return "ainda lidera entre as opções que restaram na conversa";
}

/**
 * Full commercial explanation for constraint refinement (deterministic path).
 */
export function buildCommercialRefinementNarrative(facts = {}, options = {}) {
  const name = shortProductName(facts.newWinnerName);
  if (!name) return "";

  const extraSeed = options.seed || facts.refreshReason || "";
  const transition = buildHumanizedRefinementTransition(facts, extraSeed);
  const change = buildHumanizedReevaluationBridge(facts, extraSeed);
  const why = whyOutcome(facts);
  const decision = buildHumanizedWinnerDecision(facts, name, why, extraSeed);

  const continuityCore = whatStaysSame(facts);
  const continuity = buildHumanizedContinuityLine(facts, continuityCore, extraSeed);
  const tradeoff = humanizeTradeoffLine(
    facts.tradeoff && !decision.includes(String(facts.tradeoff).slice(0, 24)) ? facts.tradeoff : "",
    facts.sacrifices?.[0] || "",
    extraSeed
  );

  const parts = [transition, change, decision];
  if (continuity) parts.push(continuity);
  if (tradeoff) parts.push(tradeoff);

  const reply = parts.filter(Boolean).join("\n\n");
  if (isRoboticSurfaceReply(reply.split("\n\n")[0])) {
    return parts.slice(1).filter(Boolean).join("\n\n");
  }
  return reply;
}

/**
 * Transition ack for mixed/commercial paths — connects human line to commercial body.
 */
export function buildCommercialTransitionAck({ message = "", decisionFacts = null, depth = "brief" } = {}) {
  return buildHumanizedTransitionAck(decisionFacts || {}, { message, depth });
}

/**
 * Prefer fact-grounded ack over shallow templates when commercial context exists.
 */
export function selectCommercialAwareAck(input = {}) {
  const {
    anchors = [],
    polarity = "neutral",
    depth = "brief",
    message = "",
    decisionFacts = null,
  } = input;

  const commercialAck = buildCommercialTransitionAck({
    message,
    decisionFacts,
    depth,
  });
  if (commercialAck) return commercialAck;

  if (!decisionFacts?.hasCommercialContext) return null;

  const minimal = depth === "minimal" || depth === "omit";
  if (polarity === "positive" || anchors.includes("entusiasmo")) {
    return minimal ? "Boa —" : "Boa — isso ajuda a fechar a escolha.";
  }
  if (anchors.includes("agradecimento")) {
    return minimal ? "Por nada!" : "Imagina — por nada.";
  }

  return minimal ? "Certo —" : buildHumanizedGenericAck(message, "commercial-aware");
}

export function decisionFactsNarrativeToTrace(facts = null) {
  if (!facts) return null;
  const structuredTrace = structuredDecisionFactsToTrace(facts);
  return {
    version: facts.version || DECISION_FACTS_NARRATIVE_VERSION,
    winner: facts.newWinnerName || facts.winner?.product_name || null,
    runnerUp: facts.runnerUpName || facts.runnerUp?.product_name || null,
    primaryAxis: facts.primaryAxis || null,
    winnerChanged: !!facts.winnerChanged,
    changeSummary: facts.changeSummary || null,
    decisionRefreshMode: facts.decisionRefreshMode || null,
    shallowReplyBlocked: true,
    structured: structuredTrace,
  };
}
