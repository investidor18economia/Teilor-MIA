/**
 * PATCH 7.9Z.4 — Anchor Preservation Audit Variants (Regra 18)
 *
 * Semantic paraphrases — same anchor intent, different phrasing.
 *
 * Usage: node scripts/test-mia-anchor-preservation-audit-variants.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";

const BASE_STATE = {
  hasAnchor: true,
  winner: "Smartphone Alpha 35",
  runnerUp: "Smartphone Beta 22",
  budgetMax: 3200,
  priorityAxis: "desempenho",
  deprioritized: [],
};

const VARIANTS = [
  // Preserve — paraphrases
  { q: "e nessa parte?", behavior: "PRESERVE", persona: "leigo" },
  { q: "como fica nesse ponto?", behavior: "PRESERVE", persona: "conversador" },
  { q: "isso continua bom?", behavior: "PRESERVE", persona: "indeciso" },
  { q: "quem usa aprova?", behavior: "PRESERVE", persona: "informal" },
  { q: "ainda segura?", behavior: "PRESERVE", persona: "apressado" },
  { q: "me explica esse motivo", behavior: "PRESERVE", persona: "leigo" },
  { q: "to meio dividido", behavior: "PRESERVE", persona: "indeciso" },
  { q: "qual fica em segundo?", behavior: "PRESERVE", persona: "leigo", expectFamily: "SECOND_BEST_DISCOVERY" },
  { q: "tem outro caminho?", behavior: "PRESERVE", persona: "indeciso", expectFamily: "ALTERNATIVE_EXPLORATION" },
  { q: "curti bastante", behavior: "PRESERVE", persona: "informal" },
  { q: "qual melhor msm?", behavior: "PRESERVE", persona: "informal" },
  { q: "continua de pe?", behavior: "PRESERVE", persona: "apressado" },
  { q: "muita gente curte?", behavior: "PRESERVE", persona: "informal" },
  { q: "o povo aprova?", behavior: "PRESERVE", persona: "curto" },
  { q: "explica melhor ai", behavior: "PRESERVE", persona: "leigo" },
  { q: "nao peguei direito", behavior: "PRESERVE", persona: "confuso" },
  { q: "e autonomia?", behavior: "PRESERVE", persona: "tecnico" },
  { q: "e o refresh?", behavior: "PRESERVE", persona: "tecnico" },
  { q: "qual o custo beneficio?", behavior: "PRESERVE", persona: "detalhista" },
  { q: "tu ainda iria nesse?", behavior: "PRESERVE", persona: "informal" },
  { q: "voce manteria?", behavior: "PRESERVE", persona: "curto" },
  { q: "pera um pouco", behavior: "PRESERVE", persona: "informal" },
  { q: "nao me pegou", behavior: "PRESERVE", persona: "curto" },
  { q: "nao quero errar nessa", behavior: "PRESERVE", persona: "indeciso" },
  { q: "to com receio ainda", behavior: "PRESERVE", persona: "leigo" },
  { q: "ah entendi", behavior: "PRESERVE", persona: "informal" },
  { q: "blz entendi", behavior: "PRESERVE", persona: "curto" },
  { q: "ta claro agora", behavior: "PRESERVE", persona: "leigo" },
  { q: "continua bancando?", behavior: "PRESERVE", persona: "informal" },
  { q: "segue nesse mesmo?", behavior: "PRESERVE", persona: "leigo" },
  { q: "costuma recomendar?", behavior: "PRESERVE", persona: "leigo" },
  { q: "quem usa gosta?", behavior: "PRESERVE", persona: "apressado" },
  { q: "e popular msm?", behavior: "PRESERVE", persona: "informal" },
  { q: "me ajuda ai", behavior: "PRESERVE", persona: "curto" },
  { q: "e consumo?", behavior: "PRESERVE", persona: "tecnico" },
  { q: "e silencio?", behavior: "PRESERVE", persona: "detalhista" },
  { q: "e durabilidade?", behavior: "PRESERVE", persona: "tecnico" },
  { q: "ok entendi, mas continua valendo?", behavior: "PRESERVE", persona: "mixed" },
  { q: "show, mas ainda to na duvida", behavior: "PRESERVE", persona: "mixed" },
  { q: "beleza, mas o povo fala bem?", behavior: "PRESERVE", persona: "mixed" },
  { q: "saquei, mas tenho medo de errar", behavior: "PRESERVE", persona: "mixed" },
  { q: "gostei, mas continua valendo?", behavior: "PRESERVE", persona: "mixed" },
  { q: "entendi, mas qual o custo beneficio?", behavior: "PRESERVE", persona: "mixed" },
  { q: "blz, mas sustenta?", behavior: "PRESERVE", persona: "mixed" },
  { q: "captei, mas o pessoal reclama?", behavior: "PRESERVE", persona: "mixed" },
  { q: "fechou, mas explica melhor", behavior: "PRESERVE", persona: "mixed" },
  { q: "beleza, mas e bateria?", behavior: "PRESERVE", persona: "mixed" },
  { q: "continua recomendando?", behavior: "PRESERVE", persona: "apressado" },
  { q: "voce sustenta?", behavior: "PRESERVE", persona: "curto" },
  { q: "crava mesmo?", behavior: "PRESERVE", persona: "informal" },
  { q: "ainda recomenda?", behavior: "PRESERVE", persona: "apressado" },
  { q: "nao to comprando essa ideia", behavior: "PRESERVE", persona: "informal" },
  { q: "isso nao me desceu", behavior: "PRESERVE", persona: "informal" },
  { q: "fiquei meio dividido", behavior: "PRESERVE", persona: "indeciso" },
  { q: "sei la", behavior: "PRESERVE", persona: "informal" },
  { q: "nao me convenceu", behavior: "PRESERVE", persona: "leigo" },
  { q: "tenho medo de me arrepender", behavior: "PRESERVE", persona: "indeciso" },
  { q: "nao quero me arrepender", behavior: "PRESERVE", persona: "leigo" },
  { q: "to cabreiro", behavior: "PRESERVE", persona: "informal" },
  { q: "detalha de novo", behavior: "PRESERVE", persona: "leigo" },
  { q: "pode explicar?", behavior: "PRESERVE", persona: "leigo" },
  { q: "me explica", behavior: "PRESERVE", persona: "curto" },
  { q: "o pessoal recomenda?", behavior: "PRESERVE", persona: "leigo" },
  { q: "a galera curte?", behavior: "PRESERVE", persona: "informal" },
  { q: "quem comprou gostou?", behavior: "PRESERVE", persona: "leigo" },
  { q: "demorou", behavior: "PRESERVE", persona: "girias" },
  { q: "valeu", behavior: "PRESERVE", persona: "girias" },
  { q: "fechou", behavior: "PRESERVE", persona: "curto" },
  { q: "ok entendi", behavior: "PRESERVE", persona: "leigo" },
  { q: "agora sim", behavior: "PRESERVE", persona: "leigo" },
  { q: "fez sentido agora", behavior: "PRESERVE", persona: "leigo" },
  { q: "continua?", behavior: "PRESERVE", persona: "curto" },
  { q: "qual?", behavior: "PRESERVE", persona: "curto" },
  { q: "recomenda?", behavior: "PRESERVE", persona: "curto" },
  { q: "e bateria?", behavior: "PRESERVE", persona: "leigo" },
  { q: "e camera?", behavior: "PRESERVE", persona: "leigo" },
  { q: "e desempenho?", behavior: "PRESERVE", persona: "tecnico" },
  { q: "e velocidade?", behavior: "PRESERVE", persona: "tecnico" },
  { q: "e upgrade futuro?", behavior: "PRESERVE", persona: "tecnico" },
  { q: "ver outras opcoes", behavior: "PRESERVE", persona: "leigo", expectFamily: "ALTERNATIVE_EXPLORATION" },
  { q: "explorar outras opcoes", behavior: "PRESERVE", persona: "leigo", expectFamily: "ALTERNATIVE_EXPLORATION" },
  { q: "runner up?", behavior: "PRESERVE", persona: "informal", expectFamily: "SECOND_BEST_DISCOVERY" },
  { q: "fechou vou pegar", behavior: "PRESERVE", persona: "apressado", expectFamily: "DECISION_CONFIRMATION" },
  { q: "parece ser esse", behavior: "PRESERVE", persona: "indeciso", expectFamily: "DECISION_CONFIRMATION" },
  { q: "vou nele", behavior: "PRESERVE", persona: "curto", expectFamily: "DECISION_CONFIRMATION" },
  { q: "nao quero errar", behavior: "PRESERVE", persona: "leigo" },
  { q: "continua valendo?", behavior: "PRESERVE", persona: "apressado" },
  { q: "muita gente usa?", behavior: "PRESERVE", persona: "leigo" },
  { q: "e custo beneficio?", behavior: "PRESERVE", persona: "detalhista" },
  { q: "voce iria nele?", behavior: "PRESERVE", persona: "informal" },
  { q: "sustenta?", behavior: "PRESERVE", persona: "curto" },
  { q: "ainda vale?", behavior: "PRESERVE", persona: "apressado" },
  { q: "nao quero dor de cabeca", behavior: "PRESERVE", persona: "leigo" },
  { q: "mostra outra opcao", behavior: "PRESERVE", persona: "leigo", expectFamily: "ALTERNATIVE_EXPLORATION" },
  { q: "quem ficou em segundo?", behavior: "PRESERVE", persona: "leigo", expectFamily: "SECOND_BEST_DISCOVERY" },
  { q: "prioriza silencio", behavior: "RECALIBRATE", persona: "tecnico", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "da mais peso pra conforto", behavior: "RECALIBRATE", persona: "informal", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "corta um pouco o orcamento", behavior: "RECALIBRATE", persona: "apressado", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "menos foco em acabamento", behavior: "RECALIBRATE", persona: "tecnico", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "agora silencio pesa", behavior: "RECALIBRATE", persona: "detalhista", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "quero priorizar durabilidade", behavior: "RECALIBRATE", persona: "tecnico", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "bateria pesa mais agora", behavior: "RECALIBRATE", persona: "leigo", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "preco importa menos", behavior: "RECALIBRATE", persona: "indeciso", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "quero gastar menos", behavior: "RECALIBRATE", persona: "apressado", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "agora ate 1800", behavior: "RECALIBRATE", persona: "leigo", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "quero algo mais seguro", behavior: "RECALIBRATE", persona: "indeciso", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "virou mais importante a bateria", behavior: "RECALIBRATE", persona: "conversador", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "baixei o orcamento", behavior: "RECALIBRATE", persona: "apressado", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "custo beneficio importa mais agora", behavior: "RECALIBRATE", persona: "detalhista", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "prioriza conforto", behavior: "RECALIBRATE", persona: "leigo", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "desempenho pesa mais", behavior: "RECALIBRATE", persona: "tecnico", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "pensei melhor no orcamento", behavior: "RECALIBRATE", persona: "indeciso", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "agora bateria importa mais", behavior: "RECALIBRATE", persona: "leigo", expectFamily: "CONSTRAINT_CHANGE" },
  { q: "troca pra notebook", behavior: "REPLACE", persona: "leigo" },
  { q: "vamos comecar de novo", behavior: "RESET", persona: "indeciso" },
  { q: "agora e monitor", behavior: "REPLACE", persona: "apressado" },
  { q: "deixa esse de lado", behavior: "RESET", persona: "informal" },
  { q: "quero outro tipo de produto", behavior: "REPLACE", persona: "leigo" },
  { q: "agora quero notebook", behavior: "REPLACE", persona: "leigo" },
  { q: "quero monitor gamer", behavior: "REPLACE", persona: "tecnico" },
  { q: "esquece esse quero tv", behavior: "REPLACE", persona: "informal" },
  { q: "comeca do zero", behavior: "RESET", persona: "apressado" },
  { q: "zera tudo", behavior: "RESET", persona: "curto" },
  { q: "vamos falar de outro produto", behavior: "REPLACE", persona: "conversador" },
  { q: "preciso escolher um monitor", behavior: "REPLACE", persona: "tecnico" },
  { q: "muda para cadeira", behavior: "REPLACE", persona: "leigo" },
  { q: "agora e cadeira", behavior: "REPLACE", persona: "apressado" },
  { q: "sai de celular vamos para notebook", behavior: "REPLACE", persona: "conversador" },
  { q: "recomeca do zero", behavior: "RESET", persona: "informal" },
  { q: "esquece essa busca", behavior: "RESET", persona: "leigo" },
  { q: "busco tv nova", behavior: "REPLACE", persona: "apressado" },
  { q: "procuro fone bluetooth", behavior: "REPLACE", persona: "tecnico" },
  { q: "me explica esse motivo", behavior: "PRESERVE", persona: "conversador" },
  { q: "esquece esse quero tv", behavior: "REPLACE", persona: "informal" },
  { q: "limpa tudo e comeca de novo", behavior: "RESET", persona: "formal" },
  { q: "preciso escolher um monitor", behavior: "REPLACE", persona: "tecnico" },
  { q: "agora e monitor", behavior: "REPLACE", persona: "apressado" },
  { q: "deixa esse de lado", behavior: "RESET", persona: "informal" },
  { q: "quero outro tipo de produto", behavior: "REPLACE", persona: "leigo" },
  { q: "to meio dividido ainda", behavior: "PRESERVE", persona: "indeciso" },
  { q: "continua valendo no fim?", behavior: "PRESERVE", persona: "long-context" },
  { q: "e upgrade futuro?", behavior: "PRESERVE", persona: "tecnico" },
];

function classifyLeaks(variant, trace) {
  const leaks = [];
  const { allowReplaceWinner, openedNewSearch, shouldPreserveAnchor, clearNewSearch } = trace.routing;
  const behavior = variant.behavior;

  if (behavior === "PRESERVE") {
    if (shouldPreserveAnchor === false) leaks.push("ANCHOR_LOSS");
    if (openedNewSearch) leaks.push("UNNECESSARY_CONTEXT_RESET");
    if (trace.genericFallback) leaks.push("UNNECESSARY_CONTEXT_RESET");
    if (allowReplaceWinner === true) leaks.push("WRONG_ANCHOR_REPLACEMENT");
    if (clearNewSearch && BASE_STATE.hasAnchor) leaks.push("UNNECESSARY_CONTEXT_RESET");
  } else if (behavior === "RECALIBRATE") {
    if (openedNewSearch) leaks.push("ANCHOR_LOSS");
    if (trace.genericFallback) leaks.push("UNNECESSARY_CONTEXT_RESET");
    if (variant.expectFamily && trace.actualFamily !== variant.expectFamily) {
      leaks.push("MISSING_RECALIBRATION");
    }
  } else if (behavior === "REPLACE" || behavior === "RESET") {
    if (!openedNewSearch) leaks.push("ANCHOR_STALE");
    if (shouldPreserveAnchor === true && !openedNewSearch) leaks.push("ANCHOR_STALE");
    if (allowReplaceWinner !== true) leaks.push("MISSING_REPLACEMENT");
  }

  return leaks;
}

function evaluate(variant) {
  const trace = simulateTurn(variant.q, BASE_STATE);
  const leaks = classifyLeaks(variant, trace);
  const critical = ["ANCHOR_LOSS", "UNNECESSARY_CONTEXT_RESET", "WRONG_ANCHOR_REPLACEMENT", "ANCHOR_STALE"];

  return {
    ...variant,
    shouldPreserveAnchor: trace.routing.shouldPreserveAnchor,
    allowReplaceWinner: trace.routing.allowReplaceWinner,
    openedNewSearch: trace.routing.openedNewSearch,
    conversationAct: trace.routing.conversationAct,
    responsePath: trace.responsePathFinal,
    actualFamily: trace.actualFamily,
    leaks,
    ok:
      !leaks.some((l) => critical.includes(l)) &&
      (variant.behavior === "PRESERVE" ||
        variant.behavior === "RECALIBRATE" ||
        !leaks.includes("MISSING_REPLACEMENT")),
  };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

console.log("PATCH 7.9Z.4 — Anchor Preservation Variants (Regra 18)\n");

const results = VARIANTS.map(evaluate);
const passed = results.filter((r) => r.ok).length;
const preserve = results.filter((r) => r.behavior === "PRESERVE");
const recalibrate = results.filter((r) => r.behavior === "RECALIBRATE");
const replaceReset = results.filter((r) => r.behavior === "REPLACE" || r.behavior === "RESET");

const anchorLoss = results.filter((r) => r.leaks.includes("ANCHOR_LOSS")).length;
const wrongReplace = results.filter((r) => r.leaks.includes("WRONG_ANCHOR_REPLACEMENT")).length;
const anchorStale = results.filter((r) => r.leaks.includes("ANCHOR_STALE")).length;
const unnecessaryReset = results.filter((r) => r.leaks.includes("UNNECESSARY_CONTEXT_RESET")).length;

console.log(`Variants: ${VARIANTS.length} | Passed: ${passed}/${VARIANTS.length} (${pct(passed, VARIANTS.length)}%)`);
console.log(`  Preserve: ${preserve.filter((r) => r.ok).length}/${preserve.length}`);
console.log(`  Recalibrate: ${recalibrate.filter((r) => r.ok).length}/${recalibrate.length}`);
console.log(`  Replace/Reset: ${replaceReset.filter((r) => r.ok).length}/${replaceReset.length}`);
console.log(`  ANCHOR_LOSS: ${anchorLoss} | WRONG_ANCHOR_REPLACEMENT: ${wrongReplace}`);
console.log(`  ANCHOR_STALE: ${anchorStale} | UNNECESSARY_CONTEXT_RESET: ${unnecessaryReset}\n`);

const fails = results.filter((r) => !r.ok);
if (fails.length) {
  console.log("── Failures ──\n");
  for (const r of fails.slice(0, 25)) {
    console.log(`  [${r.persona}] "${r.q}" → ${r.leaks.join(", ")}`);
  }
}

const verdict =
  anchorLoss === 0 &&
  wrongReplace === 0 &&
  anchorStale === 0 &&
  passed / VARIANTS.length >= 0.95
    ? "A) ANCHOR PRESERVATION ROBUST"
    : "B) ANCHOR PRESERVATION POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
