/**
 * PATCH 11C — Conversation Polish
 *
 * Shared surface-text helpers for natural acknowledgements, openings and closings.
 * MIA owns the intelligence; these helpers only shape how decisions are spoken.
 */

export const CONVERSATION_POLISH_VERSION = "11C";

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
} = {}) {
  const minimal = depth === "minimal" || depth === "omit";

  if (polarity === "positive" || anchors.includes("entusiasmo")) {
    return pickFromVariants(["Que bom.", "Boa.", "Ótimo."], message);
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
  if (msg.length >= 8) {
    const contextual = pickFromVariants(
      [
        "Faz sentido pelo que você trouxe.",
        "Esse ponto pesa na decisão.",
        "Entendo o contexto.",
      ],
      msg
    );
    return avoidRecentOpener(contextual, recentOpeners);
  }

  return avoidRecentOpener(
    pickFromVariants(["Certo.", "Entendi.", "Ok."], message),
    recentOpeners
  );
}

export function buildFirstAnswerOpening({ winner = "", gainPhrase = "", seed = "" } = {}) {
  const w = String(winner || "").trim();
  const gain = String(gainPhrase || "").trim();
  if (!w || !gain) return "";

  const normalizedGain = gain.charAt(0).toLowerCase() + gain.slice(1).replace(/\.$/, "");
  const variants = [
    `Eu iria no ${w} porque ${normalizedGain}.`,
    `Neste cenário, o ${w} faz mais sentido porque ${normalizedGain}.`,
    `A escolha mais equilibrada aqui é o ${w} porque ${normalizedGain}.`,
    `Entre as opções, eu colocaria o ${w} em primeiro porque ${normalizedGain}.`,
  ];
  return pickFromVariants(variants, `${seed}-${w}-${normalizedGain.slice(0, 24)}`);
}

export function matchesPolishedFirstAnswerOpening(body = "") {
  const text = String(body || "").trim();
  return (
    /^Eu iria no .+ porque .+\./im.test(text) ||
    /^Neste cen[aá]rio, o .+ faz mais sentido porque .+\./im.test(text) ||
    /^A escolha mais equilibrada aqui [eé] o .+ porque .+\./im.test(text) ||
    /^Entre as op[cç][õo]es, eu colocaria o .+ em primeiro porque .+\./im.test(text)
  );
}

export function polishPriceFollowUpReply(name = "", priceDisplay = "", sourceClause = "") {
  const n = String(name || "").trim();
  const p = String(priceDisplay || "").trim();
  if (!n || !p) return "";
  return `${n} está por cerca de ${p} nas ofertas encontradas${sourceClause}.`;
}

export function polishRunnerUpFollowUpReply(name = "", priceClause = "") {
  const n = String(name || "").trim();
  if (!n) return "";
  return `Em segundo ficou o ${n}${priceClause} — útil se quiser comparar o tradeoff com a primeira opção.`;
}

export function polishRefinementAck(refinementType = "", value = "") {
  const v = String(value || "").trim();
  switch (refinementType) {
    case "negative_brand_refinement":
      return v ? `Retiro ${v} da comparação —` : "Retiro essa marca da comparação —";
    case "positive_brand_refinement":
      return v ? `Priorizo ${v} —` : "Com essa preferência de marca —";
    case "price_refinement":
      return "Buscando algo mais em conta —";
    case "budget_refinement":
      return v ? `Com teto de ${v} —` : "Com esse orçamento —";
    case "attribute_refinement":
      return "Com essa prioridade —";
    case "specification_refinement":
      return v ? `Considerando ${v} —` : "Com essa especificação —";
    case "size_refinement":
      return "Ajustando o tamanho —";
    case "use_case_refinement":
      return "Para esse uso —";
    case "remove_constraint":
      return "Libero essa restrição —";
    default:
      return "Certo —";
  }
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
