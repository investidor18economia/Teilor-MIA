/**
 * PATCH 11B.1 — Commercial Follow-up Continuity
 * PATCH 11B.3 — Constraint refinement continuity (RF-01)
 *
 * Contextual commercial intent: short follow-ups inherit authority from valid
 * prior commercial state. ENTITY ≠ INTENT (11B) preserved for cold messages.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { detectActiveCommercialAsk, detectConversationalEntityMentionFrame } from "./miaIntentRecognitionLayer.js";
import {
  resolveCommercialConstraintRefinement,
  buildConstraintRefinementDeterministicReply,
  constraintRefinementToTrace,
  extractCommercialRefinement,
  isInitialCommercialEntryMessage,
} from "./miaCommercialConstraintRefinement.js";
import {
  polishPriceFollowUpReply,
  polishRunnerUpFollowUpReply,
} from "./miaConversationPolish.js";
import { collectDecisionFactsFromSession } from "./miaDecisionFactsNarrative.js";
import { isConstraintChangeFamilyQuery } from "./miaCognitiveRouter.js";

export const COMMERCIAL_FOLLOW_UP_VERSION = "11C.V.3";

/** Structural product token (model codes) — not phrase-specific. */
const STRUCTURAL_PRODUCT_TOKEN =
  /\b(?:galaxy\s+[a-z]?\d{2,4}|iphone\s+\d{1,2}|moto\s+[a-z]?\d{2,4}|[a-z]{1,8}\d{2,4})\b/i;

const COMMERCIAL_DISCOURSE_PATTERN =
  /\b(recomend\w*|compar\w*|compensa|vale\s+a\s+pena|orçamento|preco|preço|celular|notebook|smartphone|produto|alternativ\w*|prioriz\w*)\b/i;

const ORDINAL_SLOT_PRIMARY = /\b(primeir\w*|anterior|vencedor|ganhador|escolhid\w*)\b/i;
const ORDINAL_SLOT_ALTERNATE = /\b(segund\w*|outr\w*|proxim\w*|runner|plano\s+b)\b/i;

export const COMMERCIAL_FOLLOW_UP_TYPES = Object.freeze({
  PRICE_FOLLOW_UP: "price_follow_up",
  RUNNER_UP_FOLLOW_UP: "runner_up_follow_up",
  ATTRIBUTE_FOLLOW_UP: "attribute_follow_up",
  COMPARISON_FOLLOW_UP: "comparison_follow_up",
  JUSTIFICATION_FOLLOW_UP: "justification_follow_up",
  AVAILABILITY_FOLLOW_UP: "availability_follow_up",
  ALTERNATIVE_FOLLOW_UP: "alternative_follow_up",
  CONSTRAINT_REFINEMENT: "constraint_refinement",
  CONFIRMATION_FOLLOW_UP: "confirmation_follow_up",
  TOPIC_SWITCH: "topic_switch",
  AMBIGUOUS_REFERENCE: "ambiguous_reference",
  NONE: "none",
});

const TOPIC_SWITCH_PATTERN =
  /\b(mudando de assunto|mudar de assunto|esquece(?:\s+o|\s+a|\s+os|\s+as)?|vamos conversar sobre outra|agora quero falar de|obrigad\w*[, ]+(?:era\s+)?s[oó]\s+isso|so queria conversar|s[oó] queria conversar|nao quero mais falar de|não quero mais falar de)\b/;

const PRICE_FOLLOW_UP_PATTERN =
  /\b(quanto custa|qto custa|qual o pre[cç]o|qual o valor|e quanto|e o pre[cç]o|e o valor|por quanto|t[aá] por quanto|est[aá] por quanto|quanto [eé]|qual [eé] o pre[cç]o|onde est[aá] mais barato|onde [eé] mais barato)\b/;

const RUNNER_UP_FOLLOW_UP_PATTERN =
  /\b(segunda op[cç][ãa]o|segundo colocado|segunda alternativa|e o segundo|e a segunda|e o outro|e a outra|plano b|runner.?up|segundo lugar|pr[oó]xim[oa] da lista|outra op[cç][ãa]o|tem (?:uma )?alternativa|tem alternativa|qual era o outro|qual [eé] a outra|quem ficou em segundo|e o pr[oó]ximo)\b/;

const ATTRIBUTE_FOLLOW_UP_PATTERN =
  /\b(e a bateria|e bateria|e a c[aâ]mera|e c[aâ]mera|e o pre[cç]o|tem nfc|tem 5g|[eé] resistente|quanto de mem[oó]ria|e a mem[oó]ria|e o armazenamento|e a tela|e desempenho|e performance|autonomia|durabilidade|medo.*bateria|receio.*bateria|preocup.*bateria|bateria ser ruim|medo.*c[aâ]mera|receio.*c[aâ]mera|qual tem melhor (?:bateria|c[aâ]mera|tela|desempenho|autonomia)|melhor bateria|entre as op[cç][õo]es que sobraram)\b/;

const JUSTIFICATION_FOLLOW_UP_PATTERN =
  /\b(vale a pena|vale mesmo|e bom mesmo|[eé] boa escolha|voce compraria|voc[eê] compraria|tem defeito|ponto fraco|por que esse|por que essa|por que voce|por que voc[eê]|qual o problema|tem algum problema|voce iria nele|voc[eê] iria nele)\b/;

const COMPARISON_FOLLOW_UP_PATTERN =
  /\b(qual dos dois|qual das duas|qual [eé] melhor entre|qual tem mais|qual [eé] mais barato|qual [eé] mais caro|qual voce escolheria|qual voc[eê] escolheria|esse [eé] melhor|essa [eé] melhor|ganha do outro|entre os dois|entre esses)\b/;

const AVAILABILITY_FOLLOW_UP_PATTERN =
  /\b(onde encontro|onde comprar|onde acho|tem onde|tem loja|tem estoque|onde vende)\b/;

const CONSTRAINT_REFINEMENT_PATTERN =
  /\b(tem (?:um |uma )?mais barat\w*|algum(?:a)? (?:mais )?barat\w*|quero gastar menos|gastar menos|abaixo dis(?:so|se)|quero o mais em conta|quero mais bateria|mais barato|sem iphone|sem \w+|n[aã]o quero \w+|so samsung|s[oó] samsung|prefiro \w+|pode ser \w+|com 256|com 128|quero menor|quero maior|precisa ter|mas preciso|com c[aâ]mera melhor|bateria melhor|preciso de \d+\s*gb|quero \d+\s*gb|tem que ser 5g|quero compacto|mais leve|tela maior|pode passar|n[aã]o precisa|qualquer marca serve|mais resistente|mais r[aá]pid\w*|para jogos|para trabalho|para fotograf\w*|para faculdade|vou usar para|na verdade vou)\b/;

const CONFIRMATION_FOLLOW_UP_PATTERN =
  /\b(esse mesmo|essa mesma|confirmado|pode ser esse|fechou esse|vou dele|vou nessa)\b/;

const SOCIAL_REACTION_PATTERN =
  /^(legal|entendi|pois [eé]|ok|beleza|blz|show|massa|top|verdade|sim|claro|obrigad\w*|valeu|kkk+|rs+|haha+)$/;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasProductName(product) {
  return !!String(product?.product_name || "").trim();
}

function normalizeRanking(snapshot = []) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.filter((item) => hasProductName(item));
}

export function detectTopicSwitch(message = "") {
  const q = normalizeText(message);
  if (!q) return false;
  return TOPIC_SWITCH_PATTERN.test(q);
}

export function classifyCommercialFollowUpType(message = "", sessionContext = {}) {
  const q = normalizeText(message);
  if (!q) return COMMERCIAL_FOLLOW_UP_TYPES.NONE;

  if (detectTopicSwitch(q)) return COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH;
  if (SOCIAL_REACTION_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.NONE;

  if (PRICE_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP;
  if (RUNNER_UP_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP;
  if (COMPARISON_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP;
  if (JUSTIFICATION_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP;
  if (ATTRIBUTE_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP;
  if (AVAILABILITY_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.AVAILABILITY_FOLLOW_UP;

  if (isConstraintChangeFamilyQuery(message)) {
    return COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT;
  }

  const refinement = extractCommercialRefinement(message, sessionContext);
  if (
    refinement.detected &&
    hasValidCommercialSessionContext(sessionContext) &&
    !isInitialCommercialEntryMessage(message, sessionContext)
  ) {
    return COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT;
  }

  if (CONSTRAINT_REFINEMENT_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT;
  if (CONFIRMATION_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.CONFIRMATION_FOLLOW_UP;

  if (detectActiveCommercialAsk(message) && !detectConversationalEntityMentionFrame(message)) {
    return COMMERCIAL_FOLLOW_UP_TYPES.CONFIRMATION_FOLLOW_UP;
  }

  if (/^e\s+(esse|essa|ele|ela|isso)\b/.test(q) && q.split(/\s+/).length <= 6) {
    return COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE;
  }

  if (hasValidCommercialSessionContext(sessionContext)) {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length <= 5) {
      if (ORDINAL_SLOT_ALTERNATE.test(q)) {
        return COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP;
      }
      if (ORDINAL_SLOT_PRIMARY.test(q)) {
        return COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE;
      }
      if (/\b(deles|delas|desses|dessas|entre\s+eles)\b/.test(q)) {
        return COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP;
      }
      if (
        tokens.length <= 3 &&
        /\b(esse|essa|ele|ela|isso|aquele|aquela)\b/.test(q)
      ) {
        return COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE;
      }
    }
  }

  return COMMERCIAL_FOLLOW_UP_TYPES.NONE;
}

export function hasValidCommercialSessionContext(sessionContext = {}) {
  if (hasProductName(sessionContext.lastBestProduct)) return true;
  if (normalizeRanking(sessionContext.lastRankingSnapshot).length >= 1) return true;
  if (Array.isArray(sessionContext.lastComparisonProducts) && sessionContext.lastComparisonProducts.length >= 2) {
    return true;
  }
  if (Array.isArray(sessionContext.lastProducts) && sessionContext.lastProducts.length >= 1) return true;
  if (sessionContext.comparisonContextLocked && Array.isArray(sessionContext.lastComparisonProducts)) {
    return sessionContext.lastComparisonProducts.length >= 1;
  }
  return false;
}

/**
 * PATCH 5.7V.3 — Unified commercial thread predicate (session anchors + comparison set).
 */
export function hasActiveCommercialThread(sessionContext = {}, incomingSessionContext = {}) {
  const sc = sessionContext || {};
  const inc = incomingSessionContext || {};
  return !!(
    hasProductName(sc.lastBestProduct) ||
    hasProductName(inc.lastBestProduct) ||
    sc.comparisonContextLocked ||
    inc.comparisonContextLocked ||
    (Array.isArray(sc.lastComparisonProducts) && sc.lastComparisonProducts.length >= 2) ||
    (Array.isArray(inc.lastComparisonProducts) && inc.lastComparisonProducts.length >= 2) ||
    normalizeRanking(sc.lastRankingSnapshot).length >= 1 ||
    normalizeRanking(inc.lastRankingSnapshot).length >= 1 ||
    (Array.isArray(sc.lastProducts) && sc.lastProducts.length > 0) ||
    (Array.isArray(inc.lastProducts) && inc.lastProducts.length > 0)
  );
}

function serializeInferredProduct(name = "", source = "conversation_inference") {
  const productName = String(name || "").trim();
  if (!productName) return null;
  return { product_name: productName, source };
}

function collectProductMentionsFromText(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const found = [];
  const seen = new Set();
  const patterns = [STRUCTURAL_PRODUCT_TOKEN, /\b(galaxy|iphone|samsung|motorola|xiaomi|redmi|notebook|celular)\s+\w+/gi];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = re.exec(normalized)) !== null) {
      const token = String(match[0] || "").trim();
      const key = token.toLowerCase();
      if (token.length >= 2 && !seen.has(key)) {
        seen.add(key);
        found.push(token);
      }
    }
  }
  return found;
}

/**
 * PATCH 5.7V.3 — Infer missing session anchors from recent conversation (structural, not phrase-specific).
 */
export function enrichCommercialSessionContext(sessionContext = {}, conversationMessages = []) {
  const base = { ...(sessionContext || {}) };
  if (hasValidCommercialSessionContext(base)) return base;

  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  if (messages.length === 0) return base;

  const recent = messages.slice(-14);
  let hasCommercialDiscourse = false;
  const inferredProducts = [];
  const seen = new Set();

  for (const msg of recent) {
    const content = String(msg?.content || "");
    const normalized = normalizeText(content);
    if (!normalized) continue;
    if (COMMERCIAL_DISCOURSE_PATTERN.test(normalized)) hasCommercialDiscourse = true;
    if (msg?.role !== "user" && msg?.role !== "assistant") continue;
    for (const mention of collectProductMentionsFromText(content)) {
      const key = mention.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        inferredProducts.push(serializeInferredProduct(mention));
      }
    }
  }

  if (!hasCommercialDiscourse && inferredProducts.length === 0) return base;

  const validInferred = inferredProducts.filter((p) => hasProductName(p));
  if (validInferred.length >= 2 && (!Array.isArray(base.lastComparisonProducts) || base.lastComparisonProducts.length < 2)) {
    base.lastComparisonProducts = validInferred.slice(0, 4);
    base.comparisonContextLocked = true;
    if (!hasProductName(base.lastBestProduct)) {
      base.lastBestProduct = validInferred[0];
    }
  } else if (validInferred.length >= 1 && !hasProductName(base.lastBestProduct)) {
    base.lastBestProduct = validInferred[0];
  }

  if (validInferred.length >= 1 && (!Array.isArray(base.lastProducts) || base.lastProducts.length === 0)) {
    base.lastProducts = validInferred.slice(0, 4);
  }

  return base;
}

function getComparisonProductSet(sessionContext = {}) {
  const comparisonProducts = Array.isArray(sessionContext.lastComparisonProducts)
    ? sessionContext.lastComparisonProducts.filter((p) => hasProductName(p))
    : [];
  if (comparisonProducts.length >= 2) return comparisonProducts;

  const ranking = normalizeRanking(sessionContext.lastRankingSnapshot);
  if (ranking.length >= 2) return ranking.slice(0, 4);

  const products = Array.isArray(sessionContext.lastProducts)
    ? sessionContext.lastProducts.filter((p) => hasProductName(p))
    : [];
  if (products.length >= 2) return products.slice(0, 4);

  return comparisonProducts;
}

function inferComparisonSlotIndex(message = "", followUpType = COMMERCIAL_FOLLOW_UP_TYPES.NONE) {
  const q = normalizeText(message);
  if (!q) return null;
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP) return 1;
  if (ORDINAL_SLOT_PRIMARY.test(q)) return 0;
  if (ORDINAL_SLOT_ALTERNATE.test(q)) return 1;
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE) return 0;
  return null;
}

function resolveRunnerUpProduct(sessionContext = {}) {
  const comparisonSet = getComparisonProductSet(sessionContext);
  if (comparisonSet.length >= 2 && hasProductName(comparisonSet[1])) {
    return {
      product: comparisonSet[1],
      comparisonProducts: comparisonSet,
      source: "lastComparisonProducts",
      rankingPosition: 2,
    };
  }

  const ranking = normalizeRanking(sessionContext.lastRankingSnapshot);
  if (ranking.length >= 2) {
    const runner =
      ranking.find((item) => Number(item.rank) === 2) ||
      ranking[1];
    if (hasProductName(runner)) {
      return { product: runner, comparisonProducts: comparisonSet, source: "lastRankingSnapshot", rankingPosition: 2 };
    }
  }
  const products = Array.isArray(sessionContext.lastProducts) ? sessionContext.lastProducts : [];
  if (products.length >= 2 && hasProductName(products[1])) {
    return {
      product: products[1],
      comparisonProducts: comparisonSet.length >= 2 ? comparisonSet : products,
      source: "lastProducts",
      rankingPosition: 2,
    };
  }
  return { product: null, comparisonProducts: comparisonSet, source: "none", rankingPosition: null };
}

function resolvePrimaryProduct(sessionContext = {}) {
  if (hasProductName(sessionContext.lastBestProduct)) {
    return {
      product: sessionContext.lastBestProduct,
      source: "lastBestProduct",
      rankingPosition: 1,
    };
  }
  const ranking = normalizeRanking(sessionContext.lastRankingSnapshot);
  if (ranking.length >= 1) {
    const winner = ranking.find((item) => Number(item.rank) === 1) || ranking[0];
    if (hasProductName(winner)) {
      return { product: winner, source: "lastRankingSnapshot", rankingPosition: 1 };
    }
  }
  return { product: null, source: "none", rankingPosition: null };
}

export function resolveCommercialFollowUpReference({
  message = "",
  sessionContext = {},
  followUpType = COMMERCIAL_FOLLOW_UP_TYPES.NONE,
} = {}) {
  const comparisonProducts = getComparisonProductSet(sessionContext);

  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP) {
    return resolveRunnerUpProduct(sessionContext);
  }

  const slotIndex = inferComparisonSlotIndex(message, followUpType);
  if (slotIndex != null && comparisonProducts.length >= 2 && hasProductName(comparisonProducts[slotIndex])) {
    return {
      product: comparisonProducts[slotIndex],
      comparisonProducts,
      source: "comparison_slot",
      rankingPosition: slotIndex + 1,
      slotIndex,
    };
  }

  if (
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP &&
    comparisonProducts.length >= 2
  ) {
    return {
      product: comparisonProducts[0],
      comparisonProducts,
      source: "lastComparisonProducts",
      rankingPosition: null,
    };
  }

  if (
    (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP ||
      followUpType === COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP ||
      followUpType === COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP) &&
    comparisonProducts.length >= 1
  ) {
    const primary = resolvePrimaryProduct(sessionContext);
    if (hasProductName(primary?.product)) {
      return { ...primary, comparisonProducts };
    }
    return {
      product: comparisonProducts[0],
      comparisonProducts,
      source: "comparison_primary_fallback",
      rankingPosition: 1,
    };
  }

  if (
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE &&
    comparisonProducts.length >= 1
  ) {
    const idx = slotIndex != null ? slotIndex : 0;
    const picked = comparisonProducts[idx] || comparisonProducts[0];
    if (hasProductName(picked)) {
      return {
        product: picked,
        comparisonProducts,
        source: "ambiguous_reference_slot",
        rankingPosition: idx + 1,
        slotIndex: idx,
      };
    }
  }

  return resolvePrimaryProduct(sessionContext);
}

function inferProviderRequired({ followUpType, resolvedProduct, sessionContext = {}, message = "" }) {
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP) {
    const price = resolvedProduct?.product?.price;
    return !price || String(price).trim() === "";
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP) {
    return !hasProductName(resolvedProduct?.product);
  }
  if (
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP ||
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP ||
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.CONFIRMATION_FOLLOW_UP
  ) {
    return false;
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT) {
    const refinement = resolveCommercialConstraintRefinement({
      message,
      sessionContext,
      hasValidContext: hasValidCommercialSessionContext(sessionContext),
      baselineProduct: resolvedProduct?.product || sessionContext.lastBestProduct || null,
    });
    return !!refinement.providerRequired;
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AVAILABILITY_FOLLOW_UP) {
    return !resolvedProduct?.product?.link;
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP) {
    return false;
  }
  return false;
}

export function resolveContextualCommercialFollowUp({
  message = "",
  sessionContext = {},
  hasActiveAnchor = false,
  conversationMessages = [],
} = {}) {
  const enrichedSession = enrichCommercialSessionContext(sessionContext, conversationMessages);
  const commercialThreadActive =
    hasActiveAnchor || hasActiveCommercialThread(enrichedSession) || hasValidCommercialSessionContext(enrichedSession);

  const followUpType = classifyCommercialFollowUpType(message, enrichedSession);

  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.NONE) {
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: false,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: false,
      reasonCode: "no_follow_up_signal",
    };
  }

  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH) {
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: true,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: false,
      reasonCode: "topic_switch",
    };
  }

  const contextValid = hasValidCommercialSessionContext(enrichedSession) || commercialThreadActive;

  if (!contextValid) {
    const explicitAsk = detectActiveCommercialAsk(message);
    let constraintRefinement = null;
    if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT) {
      constraintRefinement = resolveCommercialConstraintRefinement({
        message,
        sessionContext: enrichedSession,
        hasValidContext: false,
        baselineProduct: null,
      });
    }
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: true,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: constraintRefinement?.requiresClarification ?? !explicitAsk,
      reasonCode: constraintRefinement?.reasonCode || (explicitAsk ? "explicit_ask_without_session" : "missing_commercial_context"),
      constraintRefinement,
      enrichedSessionUsed: enrichedSession !== sessionContext,
    };
  }

  const resolvedReference = resolveCommercialFollowUpReference({
    message,
    sessionContext: enrichedSession,
    followUpType,
  });

  const comparisonSet = getComparisonProductSet(enrichedSession);
  const attributeOrComparisonFollowUp =
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP ||
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP ||
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP;

  if (
    (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP ||
      followUpType === COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP) &&
    !hasProductName(resolvedReference?.product) &&
    followUpType !== COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE
  ) {
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: true,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: true,
      reasonCode: "unresolved_reference",
      enrichedSessionUsed: enrichedSession !== sessionContext,
    };
  }

  if (
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE &&
    !hasProductName(resolvedReference?.product) &&
    comparisonSet.length < 2
  ) {
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: true,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: true,
      reasonCode: "unresolved_reference",
      enrichedSessionUsed: enrichedSession !== sessionContext,
    };
  }

  const providerRequired = inferProviderRequired({
    followUpType,
    resolvedProduct: resolvedReference,
    sessionContext: enrichedSession,
    message,
  });

  let constraintRefinement = null;
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT) {
    constraintRefinement = resolveCommercialConstraintRefinement({
      message,
      sessionContext: enrichedSession,
      hasValidContext: contextValid,
      baselineProduct: resolvedReference?.product || enrichedSession.lastBestProduct || null,
    });
  }

  const authorizedByComparisonContext =
    attributeOrComparisonFollowUp && comparisonSet.length >= 2 && contextValid;

  return {
    version: COMMERCIAL_FOLLOW_UP_VERSION,
    detected: true,
    followUpType,
    contextualCommercialAuthorized:
      constraintRefinement?.requiresClarification && !contextValid
        ? false
        : authorizedByComparisonContext ||
          hasProductName(resolvedReference?.product) ||
          hasProductName(constraintRefinement?.selectedProduct) ||
          (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE && comparisonSet.length >= 2),
    requiresClarification:
      followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE &&
      !hasProductName(resolvedReference?.product) &&
      comparisonSet.length < 2
        ? true
        : !!constraintRefinement?.requiresClarification,
    reasonCode: constraintRefinement?.reasonCode || "contextual_commercial_follow_up",
    resolvedReference,
    resolvedProduct: constraintRefinement?.selectedProduct || resolvedReference?.product || comparisonSet[0] || null,
    comparisonProducts: resolvedReference?.comparisonProducts || comparisonSet,
    contextSource: resolvedReference?.source || null,
    rankingPosition: resolvedReference?.rankingPosition ?? null,
    slotIndex: resolvedReference?.slotIndex ?? null,
    providerRequired: constraintRefinement
      ? !!constraintRefinement.providerRequired
      : providerRequired,
    preserveRankingSnapshot: true,
    reusePriorCommercialContext: constraintRefinement
      ? !constraintRefinement.providerRequired
      : !providerRequired,
    constraintRefinement,
    enrichedSessionUsed: enrichedSession !== sessionContext,
  };
}

export function isCommercialFollowUpContinuationSignal(message = "") {
  const type = classifyCommercialFollowUpType(message);
  return (
    type !== COMMERCIAL_FOLLOW_UP_TYPES.NONE &&
    type !== COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH
  );
}

export function commercialFollowUpToTrace(followUp = null) {
  if (!followUp?.detected) return null;
  return {
    version: followUp.version,
    followUpType: followUp.followUpType,
    contextualCommercialAuthorized: followUp.contextualCommercialAuthorized,
    requiresClarification: followUp.requiresClarification,
    reasonCode: followUp.reasonCode,
    resolvedProductName: followUp.resolvedProduct?.product_name || null,
    contextSource: followUp.contextSource || null,
    rankingPosition: followUp.rankingPosition,
    providerRequired: followUp.providerRequired,
    reusePriorCommercialContext: followUp.reusePriorCommercialContext,
    constraintRefinement: constraintRefinementToTrace(followUp.constraintRefinement),
  };
}

function formatFollowUpPriceDisplay(price) {
  const raw = String(price || "").trim();
  if (!raw) return "";
  if (/^R\$\s*/i.test(raw)) return raw;
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return `R$ ${numeric.toFixed(2).replace(".", ",")}`;
  }
  return raw;
}

function serializeFollowUpPriceCard(product = {}) {
  const name = String(product?.product_name || "").trim();
  if (!name) return null;
  return {
    product_name: name,
    price: product?.price || null,
    link: product?.link || null,
    thumbnail: product?.thumbnail || null,
    source: product?.source || "histórico",
  };
}

/**
 * Deterministic verbalization for contextual commercial follow-ups.
 * Returns null when provider or LLM path is still required.
 */
export function buildCommercialFollowUpDeterministicReply(followUp = {}, sessionContext = {}) {
  if (followUp?.constraintRefinement?.detected) {
    const refinementReply = buildConstraintRefinementDeterministicReply(
      followUp.constraintRefinement,
      sessionContext
    );
    if (refinementReply?.reply) return refinementReply;
  }

  if (followUp?.requiresClarification && followUp?.constraintRefinement?.detected) {
    const clarification = buildConstraintRefinementDeterministicReply(
      followUp.constraintRefinement,
      sessionContext
    );
    if (clarification?.reply) return clarification;
  }

  if (!followUp?.contextualCommercialAuthorized || followUp.requiresClarification) {
    return null;
  }

  const product = followUp.resolvedProduct;
  const name = String(product?.product_name || "").trim();

  if (followUp.followUpType === COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP) {
    if (!name) return null;
    const priceDisplay = formatFollowUpPriceDisplay(product?.price);
    if (!priceDisplay) return null;
    const source = String(product?.source || "").trim();
    const sourceClause = source ? ` (${source})` : "";
    const card = serializeFollowUpPriceCard(product);
    return {
      reply: polishPriceFollowUpReply(name, priceDisplay, sourceClause),
      prices: card ? [card] : [],
      responsePath: "commercial_follow_up_price",
      formatterUsed: "buildCommercialFollowUpDeterministicReply:price",
    };
  }

  if (followUp.followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP) {
    if (!name) return null;
    const priceDisplay = formatFollowUpPriceDisplay(product?.price);
    const priceClause = priceDisplay ? `, por cerca de ${priceDisplay}` : "";
    const card = serializeFollowUpPriceCard(product);
    const facts = collectDecisionFactsFromSession(sessionContext);
    let reply = polishRunnerUpFollowUpReply(name, priceClause);
    if (facts.tradeoff && !reply.includes(facts.tradeoff.slice(0, 20))) {
      reply = `${reply} ${facts.tradeoff}`;
    } else if (facts.primaryAxisLabel && facts.primaryAxisLabel !== "equilíbrio geral") {
      reply = `${reply} Útil se ${facts.primaryAxisLabel} não for sua prioridade absoluta.`;
    }
    return {
      reply,
      prices: card?.price ? [card] : [],
      responsePath: "commercial_follow_up_runner_up",
      formatterUsed: "buildCommercialFollowUpDeterministicReply:runner_up",
    };
  }

  if (followUp.followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AVAILABILITY_FOLLOW_UP) {
    if (!name) return null;
    const link = String(product?.link || "").trim();
    if (link) {
      return {
        reply: `Você encontra o ${name} neste link: ${link}`,
        prices: [],
        responsePath: "commercial_follow_up_availability",
        formatterUsed: "buildCommercialFollowUpDeterministicReply:availability",
      };
    }
    return null;
  }

  return null;
}
