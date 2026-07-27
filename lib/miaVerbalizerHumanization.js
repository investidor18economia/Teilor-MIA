/**
 * PATCH 3.5b — Verbalizer Humanization
 *
 * Natural, varied surface phrasing for already-decided facts.
 * Does not decide, infer specs, or alter Decision Facts content.
 */

import {
  detectLiteralFragment,
  rewriteConsequenceForSpeech,
} from "./miaVerbalizationStyleGovernor.js";

export const VERBALIZER_HUMANIZATION_VERSION = "3.5b.1";

const ROBOTIC_SURFACE_PATTERNS = [
  /^agora mudou um detalhe importante/i,
  /^faz sentido\.?$/i,
  /^entendi\.?$/i,
  /^boa observa[cç][aã]o\.?$/i,
  /^esse ponto muda a an[aá]lise\.?$/i,
  /^faz sentido pelo que voc[eê] trouxe\.?$/i,
  /^esse ponto pesa na decis[aã]o\.?$/i,
  /^entendo o contexto\.?$/i,
  /^certo\.?$/i,
  /^ok\.?$/i,
  /^boa\.?$/i,
];

export function hashSeed(seed = "") {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickHumanizedVariant(variants = [], seed = "") {
  const list = variants.filter(Boolean);
  if (!list.length) return "";
  return list[hashSeed(seed) % list.length];
}

export function isRoboticSurfaceReply(text = "") {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (ROBOTIC_SURFACE_PATTERNS.some((pattern) => pattern.test(t))) return true;
  if (t.length <= 22 && /^(faz sentido|entendi|certo|ok|boa)\b/i.test(t)) return true;
  return false;
}

function narrativeSeed(facts = {}, extra = "") {
  return [
    facts.sourceMessage || "",
    facts.newWinnerName || facts.winner?.product_name || "",
    facts.changeSummary || "",
    facts.refinementType || "",
    facts.primaryAxis || "",
    extra,
  ].join("|");
}

export function buildHumanizedRefinementTransition(facts = {}, extraSeed = "") {
  return pickHumanizedVariant(
    [
      "Isso realmente muda um pouco o cenário.",
      "Esse detalhe faz diferença na análise.",
      "Com essa informação consigo refinar melhor a recomendação.",
      "Esse ajuste muda o recorte da escolha.",
      "Boa — isso muda como eu comparo as opções.",
    ],
    narrativeSeed(facts, `transition|${extraSeed}`)
  );
}

export function buildHumanizedReevaluationBridge(facts = {}, extraSeed = "") {
  const summary = facts.changeSummary;
  const seed = narrativeSeed(facts, `bridge|${extraSeed}`);
  if (summary) {
    return pickHumanizedVariant(
      [
        `Como ${summary}, reavaliei as opções que já estávamos considerando.`,
        `Mantendo o que conversamos, ${summary} — e isso pede um ajuste fino.`,
        `Com ${summary}, olhei de novo as opções que já tínhamos em contexto.`,
        `Esse ponto entrou no critério: ${summary}. Reavaliei o que já tínhamos mapeado.`,
      ],
      seed
    );
  }
  return pickHumanizedVariant(
    [
      "Com esse refinamento, reavaliei as opções que já estávamos considerando.",
      "Com essa informação, ajustei a leitura do que já tínhamos em contexto.",
      "Levei isso em conta e reavaliei as opções da conversa.",
    ],
    seed
  );
}

export function buildHumanizedWinnerDecision(facts = {}, productName = "", why = "", extraSeed = "") {
  const name = String(productName || facts.newWinnerName || "").trim();
  if (!name) return "";
  const seed = narrativeSeed(facts, `decision|${extraSeed}`);
  if (facts.winnerChanged) {
    return pickHumanizedVariant(
      [
        `Eu trocaria para o ${name} — ${why}.`,
        `Nesse cenário eu iria no ${name} — ${why}.`,
        `Com esse novo recorte, o ${name} passa a fazer mais sentido — ${why}.`,
        `Mudaria a indicação para o ${name} — ${why}.`,
      ],
      seed
    );
  }
  return pickHumanizedVariant(
    [
      `Continuo indicando o ${name} — ${why}.`,
      `O ${name} segue na frente — ${why}.`,
      `Mantenho o ${name} como melhor opção — ${why}.`,
      `Ainda ficaria com o ${name} — ${why}.`,
    ],
    seed
  );
}

export function buildHumanizedContinuityLine(facts = {}, continuityCore = "", extraSeed = "") {
  const core = String(continuityCore || "").trim();
  if (!core) return "";
  const seed = narrativeSeed(facts, `continuity|${extraSeed}`);
  if (/^O que continua valendo/i.test(core)) {
    const body = core.replace(/^O que continua valendo(?: é|:)\s*/i, "").replace(/\.$/, "");
    return pickHumanizedVariant(
      [
        `Mantendo tudo o que conversamos até aqui, ${body} continua valendo.`,
        `Fora esse ajuste, ${body} segue valendo.`,
        `O restante do critério permanece: ${body}.`,
      ],
      seed
    );
  }
  return core;
}

export function buildHumanizedTransitionAck(facts = {}, { message = "", depth = "brief" } = {}) {
  const minimal = depth === "minimal" || depth === "omit";
  const seed = narrativeSeed(facts, message);

  if (facts.refinementType || facts.changeSummary) {
    const lead = facts.changeSummary || "esse refinamento";
    if (minimal) {
      return pickHumanizedVariant(
        [`Com ${lead},`, `Como ${lead},`, `Sobre ${lead},`],
        `${seed}|minimal`
      );
    }
    return pickHumanizedVariant(
      [
        `Como ${lead}, reavaliei a recomendação anterior.`,
        `Entendi o que mudou: ${lead}. Isso ajusta a leitura.`,
        `Com ${lead}, consigo refinar melhor a indicação.`,
      ],
      seed
    );
  }

  if (facts.hasCommercialContext && facts.primaryAxisLabel) {
    return minimal
      ? pickHumanizedVariant(
          [`Pensando em ${facts.primaryAxisLabel},`, `Com foco em ${facts.primaryAxisLabel},`],
          `${seed}|axis-min`
        )
      : pickHumanizedVariant(
          [
            `Pensando no foco em ${facts.primaryAxisLabel}, isso muda como eu comparo as opções.`,
            `Com ${facts.primaryAxisLabel} como prioridade, a leitura muda um pouco.`,
          ],
          `${seed}|axis`
        );
  }

  if (facts.hasCommercialContext) {
    return minimal
      ? pickHumanizedVariant(["Com o que você trouxe,", "Com esse contexto,"], `${seed}|ctx-min`)
      : pickHumanizedVariant(
          [
            "Com o que você trouxe agora, ajusto a leitura da recomendação anterior.",
            "Isso ajuda bastante a direcionar a escolha.",
            "Agora ficou mais claro o que você procura.",
          ],
          `${seed}|ctx`
        );
  }

  return "";
}

export function buildHumanizedGenericAck(message = "", seedExtra = "") {
  return pickHumanizedVariant(
    [
      "Isso ajuda bastante a direcionar a escolha.",
      "Agora ficou mais claro o que você procura.",
      "Entendi o que mudou — isso conta.",
      "Com esse contexto, consigo ser mais precisa.",
    ],
    `${message}|${seedExtra}|generic-ack`
  );
}

export function buildHumanizedFallbackAck(message = "", seedExtra = "") {
  return pickHumanizedVariant(
    [
      "Certo — vamos por aí.",
      "Entendi — seguimos.",
      "Ok — continuo a partir daqui.",
    ],
    `${message}|${seedExtra}|fallback-ack`
  );
}

export function buildHumanizedPositiveAck(seedExtra = "") {
  return pickHumanizedVariant(
    ["Que bom.", "Boa.", "Ótimo — isso ajuda."],
    `${seedExtra}|positive`
  );
}

export function buildHumanizedPriceFollowUp(name = "", priceDisplay = "", sourceClause = "") {
  const n = String(name || "").trim();
  const p = String(priceDisplay || "").trim();
  if (!n || !p) return "";
  return pickHumanizedVariant(
    [
      `${n} está por cerca de ${p} nas ofertas encontradas${sourceClause}.`,
      `Encontrei o ${n} por volta de ${p}${sourceClause}.`,
      `O ${n} aparece na faixa de ${p}${sourceClause}.`,
    ],
    `${n}|${p}|price-follow-up`
  );
}

export function buildHumanizedRunnerUpFollowUp(name = "", priceClause = "") {
  const n = String(name || "").trim();
  if (!n) return "";
  return pickHumanizedVariant(
    [
      `Em segundo ficou o ${n}${priceClause} — útil se quiser comparar o tradeoff com a primeira opção.`,
      `O ${n} ficou como alternativa${priceClause} — vale comparar o tradeoff com a principal.`,
      `Na sequência aparece o ${n}${priceClause}, caso queira pesar prós e contras.`,
    ],
    `${n}|${priceClause}|runner-up`
  );
}

export function buildHumanizedRefinementAck(refinementType = "", value = "", seedExtra = "") {
  const v = String(value || "").trim();
  const seed = `${refinementType}|${v}|${seedExtra}`;
  switch (refinementType) {
    case "negative_brand_refinement":
      return pickHumanizedVariant(
        [
          v ? `Tiro ${v} da comparação —` : "Tiro essa marca da comparação —",
          v ? `Sem ${v} no recorte —` : "Sem essa marca no recorte —",
        ],
        seed
      );
    case "positive_brand_refinement":
      return pickHumanizedVariant(
        [
          v ? `Priorizo ${v} —` : "Com essa preferência de marca —",
          v ? `Incluo ${v} na análise —` : "Incluo essa marca na análise —",
        ],
        seed
      );
    case "price_refinement":
      return pickHumanizedVariant(
        ["Buscando algo mais em conta —", "Com foco em gastar menos —"],
        seed
      );
    case "budget_refinement":
      return pickHumanizedVariant(
        [
          v ? `Com teto de ${v} —` : "Com esse orçamento —",
          v ? `Na faixa de ${v} —` : "Nessa faixa de preço —",
        ],
        seed
      );
    case "use_case_refinement":
      return pickHumanizedVariant(
        ["Para esse uso —", "Com esse objetivo de uso —"],
        seed
      );
    case "attribute_refinement":
      return pickHumanizedVariant(
        ["Com essa prioridade —", "Com esse critério em foco —"],
        seed
      );
    case "specification_refinement":
      return pickHumanizedVariant(
        [
          v ? `Considerando ${v} —` : "Com essa especificação —",
          v ? `Com ${v} como requisito —` : "Com esse requisito técnico —",
        ],
        seed
      );
    case "size_refinement":
      return pickHumanizedVariant(
        ["Ajustando o tamanho —", "No tamanho ideal —"],
        seed
      );
    case "remove_constraint":
      return pickHumanizedVariant(
        ["Libero essa restrição —", "Flexibilizo esse critério —"],
        seed
      );
    default:
      return pickHumanizedVariant(["Certo —", "Entendi —"], seed);
  }
}

export function buildHumanizedFirstAnswerOpening({ winner = "", gainPhrase = "", seed = "" } = {}) {
  const w = String(winner || "").trim();
  const rawGain = String(gainPhrase || "").trim();
  if (!w || !rawGain) return "";
  const spokenGain = rewriteConsequenceForSpeech(rawGain);
  const gainBody = spokenGain.replace(/\.$/, "");
  const gainSentence =
    gainBody.charAt(0).toUpperCase() + gainBody.slice(1) + (spokenGain.endsWith(".") ? "" : ".");

  const variants = [
    `Eu iria no ${w}. ${gainSentence}`,
    `Neste cenário, o ${w} se destaca — ${gainBody}.`,
    `A escolha mais equilibrada aqui é o ${w}: ${gainBody}.`,
    `Ficaria com o ${w} por um motivo claro: ${gainBody}.`,
    `Pelo que mapeei, o ${w} combina melhor com o que você pediu — ${gainBody}.`,
    `O ${w} faz sentido aqui porque ${spokenGain.charAt(0).toLowerCase()}${spokenGain.slice(1).replace(/\.$/, "")}.`,
  ].filter((entry) => {
    if (/\bporque\s+(?:menos|mais)\s+/i.test(entry)) return false;
    const becauseTail = entry.match(/\bporque\s+(.+?)\.?$/i)?.[1] || "";
    if (becauseTail && detectLiteralFragment(becauseTail).detected) return false;
    return true;
  });

  return pickHumanizedVariant(variants, `${seed}|${w}|${gainBody.slice(0, 32)}`);
}

export function humanizeTradeoffLine(tradeoff = "", sacrifice = "", seedExtra = "") {
  const t = String(tradeoff || "").trim();
  const s = String(sacrifice || "").trim();
  if (t) return t;
  if (s) {
    return pickHumanizedVariant(
      [`Tradeoff: ${s}.`, `Ponto de atenção: ${s}.`, `Vale considerar: ${s}.`],
      `${s}|tradeoff|${seedExtra}`
    );
  }
  return "";
}

export function verbalizerHumanizationToTrace(input = {}) {
  return {
    version: VERBALIZER_HUMANIZATION_VERSION,
    seed: input.seed || null,
    roboticBlocked: !!input.roboticBlocked,
  };
}
