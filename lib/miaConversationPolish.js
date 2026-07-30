/**
 * PATCH 11C / 3.5a — Conversation Polish
 *
 * Shared surface-text helpers for natural acknowledgements, openings and closings.
 * MIA owns the intelligence; these helpers only shape how decisions are spoken.
 */

import { selectCommercialAwareAck } from "./miaDecisionFactsNarrative.js";
import {
  buildHumanizedFallbackAck,
  buildHumanizedFirstAnswerOpening,
  buildHumanizedGenericAck,
  buildHumanizedPositiveAck,
  buildHumanizedPriceFollowUp,
  buildHumanizedRefinementAck,
  buildHumanizedRunnerUpFollowUp,
} from "./miaVerbalizerHumanization.js";

export const CONVERSATION_POLISH_VERSION = "3.5b.0";

const EMPTY_GENERIC_OPENERS =
  /^(entendo|compreendo|claro|perfeito|certo|ok|tudo bem|faz sentido|pois [eé]|legal)\.?$/i;

const GENERIC_CLOSING_PATTERNS =
  /\b(posso ajudar em mais alguma coisa|quer saber mais|deseja mais informa[cç][õo]es|se quiser,? posso)\b/i;

export function isEmptyGenericOpener(text = "") {
  return EMPTY_GENERIC_OPENERS.test(String(text || "").trim());
}

export function hasGenericClosing(text = "") {
  return GENERIC_CLOSING_PATTERNS.test(String(text || "").toLowerCase());
}

function hashSeed(seed = "") {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickFromVariants(variants = [], seed = "") {
  if (!variants.length) return "";
  const idx = hashSeed(seed) % variants.length;
  return variants[idx];
}

function avoidRecentOpener(candidate = "", recentOpeners = []) {
  const normalized = String(candidate || "").trim().toLowerCase();
  const label = normalized.split(/\s+/)[0]?.replace(/[.,!?]/g, "");
  if (!label || !recentOpeners?.length) return candidate;
  const last = recentOpeners[recentOpeners.length - 1];
  if (last && String(last).includes(label)) {
    return candidate.replace(/^\w+/, "").trim() || candidate;
  }
  return candidate;
}

/**
 * Contextual human acknowledgement — avoids bare "Entendo." when possible.
 */
export function selectHumanAck({
  anchors = [],
  polarity = "neutral",
  depth = "brief",
  message = "",
  recentOpeners = [],
  decisionFacts = null,
  contract = null,
} = {}) {
  const commercialBlocked =
    contract?.commercialFallbackBlocked === true ||
    contract?.responseBehavior?.redirectToCommerce === false;

  if (!commercialBlocked) {
    const commercialAck = selectCommercialAwareAck({
      anchors,
      polarity,
      depth,
      message,
      decisionFacts,
    });
    if (commercialAck) {
      return avoidRecentOpener(commercialAck, recentOpeners);
    }
  }

  const minimal = depth === "minimal" || depth === "omit";

  if (polarity === "positive" || anchors.includes("entusiasmo")) {
    return buildHumanizedPositiveAck(message);
  }
  if (anchors.includes("agradecimento")) {
    return minimal ? "Por nada!" : "Imagina — por nada.";
  }
  if (anchors.includes("pesquisa_cansativa")) {
    return minimal
      ? "Comparar opções cansa mesmo."
      : "Comparar tantas opções cansa — faz sentido querer simplificar.";
  }
  if (anchors.includes("cansaco") || anchors.includes("dia_pesado")) {
    return minimal ? "Dia puxado." : "Dia pesado cansa mesmo.";
  }
  if (anchors.includes("frustracao")) {
    return minimal ? "Puxado." : "Frustração assim desgasta.";
  }
  if (anchors.includes("desanimo")) {
    return minimal ? "Dia arrastado." : "Dia meio arrastado pesa no astral.";
  }
  if (anchors.includes("calor")) {
    return "Esse calor realmente aperta.";
  }
  if (anchors.includes("trabalho")) {
    return minimal ? "Expediente pesado." : "Dia de trabalho pesado drena.";
  }

  const msg = String(message || "").trim();
  if (msg.length >= 8 && !decisionFacts?.hasCommercialContext) {
    return avoidRecentOpener(buildHumanizedGenericAck(msg, "human-ack"), recentOpeners);
  }

  return avoidRecentOpener(buildHumanizedFallbackAck(message, "human-fallback"), recentOpeners);
}

export function buildFirstAnswerOpening({ winner = "", gainPhrase = "", seed = "" } = {}) {
  return buildHumanizedFirstAnswerOpening({ winner, gainPhrase, seed });
}

export function matchesPolishedFirstAnswerOpening(body = "") {
  const text = String(body || "").trim();
  return (
    /^Eu iria no .+\./im.test(text) ||
    /^Neste cen[aá]rio, o .+ se destaca/im.test(text) ||
    /^A escolha mais equilibrada aqui [eé] o .+/im.test(text) ||
    /^Ficaria com o .+/im.test(text) ||
    /^Pelo que mapeei, o .+/im.test(text) ||
    /^O .+ faz sentido aqui/im.test(text)
  );
}

export function polishPriceFollowUpReply(name = "", priceDisplay = "", sourceClause = "") {
  return buildHumanizedPriceFollowUp(name, priceDisplay, sourceClause);
}

export function polishRunnerUpFollowUpReply(name = "", priceClause = "") {
  return buildHumanizedRunnerUpFollowUp(name, priceClause);
}

export function polishRefinementAck(refinementType = "", value = "") {
  return buildHumanizedRefinementAck(refinementType, value, "polish");
}

export function polishRefinementRecommendation({ ack = "", name = "", budgetClause = "", priceDisplay = "", isPriceRefinement = false } = {}) {
  const n = String(name || "").trim();
  if (!n) return "";
  if (isPriceRefinement && priceDisplay) {
    return `${ack} a melhor opção${budgetClause} passa a ser o ${n}, por cerca de ${priceDisplay}.`;
  }
  return `${ack} o ${n} passa a liderar entre as opções restantes${budgetClause}.`;
}

export function polishClarificationQuestion(refinementType = "") {
  switch (refinementType) {
    case "price_refinement":
      return "Mais barato que qual faixa ou produto você tinha em mente?";
    case "attribute_refinement":
      return "Isso vale para a recomendação que já vimos ou para uma busca nova?";
    case "negative_brand_refinement":
      return "Sem essa marca — em qual faixa ou produto você está pensando?";
    case "specification_refinement":
      return "Essa especificação vale para qual produto da conversa?";
    default:
      return "Isso se refere a qual recomendação anterior?";
  }
}

export function polishIntentDiscoveryFallback(labels = []) {
  if (Array.isArray(labels) && labels.length >= 2) {
    return `Para afinar: você liga mais para ${labels.slice(0, 3).join(" ou ")}?`;
  }
  return "O que pesa mais para você nessa escolha — preço, desempenho ou durabilidade?";
}

export function stripLeadingEmptyAck(text = "") {
  let out = String(text || "").trim();
  out = out.replace(/^(entendo|compreendo|claro|perfeito|certo)[.!,]?\s+/i, "");
  return out.trim();
}
