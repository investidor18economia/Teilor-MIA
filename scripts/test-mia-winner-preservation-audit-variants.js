/**
 * PATCH 7.9Z.3 — Winner Preservation Audit Variants (Regra 18)
 *
 * Semantic paraphrases — same winner preservation intent, different phrasing.
 *
 * Usage: node scripts/test-mia-winner-preservation-audit-variants.js
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
  { q: "curti bastante", preserve: true, persona: "informal" },
  { q: "faz sentido sim", preserve: true, persona: "leigo" },
  { q: "continua de pe?", preserve: true, persona: "apressado" },
  { q: "muita gente curte?", preserve: true, persona: "informal" },
  { q: "o povo aprova?", preserve: true, persona: "curto" },
  { q: "explica melhor ai", preserve: true, persona: "leigo" },
  { q: "nao peguei direito", preserve: true, persona: "confuso" },
  { q: "e autonomia?", preserve: true, persona: "tecnico" },
  { q: "e o refresh?", preserve: true, persona: "tecnico" },
  { q: "e pra jogos?", preserve: true, persona: "leigo" },
  { q: "qual o custo beneficio?", preserve: true, persona: "detalhista" },
  { q: "pensando no valor, qual fica?", preserve: true, persona: "indeciso" },
  { q: "tu ainda iria nesse?", preserve: true, persona: "informal" },
  { q: "nao mudou sua opiniao?", preserve: true, persona: "tecnico" },
  { q: "voce manteria?", preserve: true, persona: "curto" },
  { q: "pera um pouco", preserve: true, persona: "informal" },
  { q: "calma que nao bateu", preserve: true, persona: "leigo" },
  { q: "nao me pegou", preserve: true, persona: "curto" },
  { q: "to meio dividido", preserve: true, persona: "indeciso" },
  { q: "nao quero errar nessa", preserve: true, persona: "indeciso" },
  { q: "to com receio ainda", preserve: true, persona: "leigo" },
  { q: "ah entendi", preserve: true, persona: "informal" },
  { q: "blz entendi", preserve: true, persona: "curto" },
  { q: "saquei melhor", preserve: true, persona: "apressado" },
  { q: "ta claro agora", preserve: true, persona: "leigo" },
  { q: "continua bancando?", preserve: true, persona: "informal" },
  { q: "segue nesse mesmo?", preserve: true, persona: "leigo" },
  { q: "ainda segura essa indicacao?", preserve: true, persona: "detalhista" },
  { q: "costuma recomendar?", preserve: true, persona: "leigo" },
  { q: "quem usa gosta?", preserve: true, persona: "apressado" },
  { q: "tem mta reclamacao?", preserve: true, persona: "typo" },
  { q: "e popular msm?", preserve: true, persona: "informal" },
  { q: "me ajuda ai", preserve: true, persona: "curto" },
  { q: "qual melhor msm?", preserve: true, persona: "informal" },
  { q: "qual seria sua escolha?", preserve: true, persona: "indeciso" },
  { q: "e consumo?", preserve: true, persona: "tecnico" },
  { q: "e silencio?", preserve: true, persona: "detalhista" },
  { q: "e durabilidade?", preserve: true, persona: "tecnico" },
  { q: "e ergonomia?", preserve: true, persona: "detalhista" },
  { q: "e garantia?", preserve: true, persona: "leigo" },
  { q: "ok entendi, mas continua valendo?", preserve: true, persona: "mixed" },
  { q: "show, mas ainda to na duvida", preserve: true, persona: "mixed" },
  { q: "beleza, mas o povo fala bem?", preserve: true, persona: "mixed" },
  { q: "saquei, mas tenho medo de errar", preserve: true, persona: "mixed" },
  { q: "gostei, mas continua valendo?", preserve: true, persona: "mixed" },
  { q: "entendi, mas qual o custo beneficio?", preserve: true, persona: "mixed" },
  { q: "blz, mas sustenta?", preserve: true, persona: "mixed" },
  { q: "captei, mas o pessoal reclama?", preserve: true, persona: "mixed" },
  { q: "fechou, mas explica melhor", preserve: true, persona: "mixed" },
  { q: "beleza, mas e bateria?", preserve: true, persona: "mixed" },
  { q: "continua valendo mesmo se eu gastar menos?", preserve: true, persona: "mixed" },
  { q: "nao curti mas voce tem certeza?", preserve: true, persona: "mixed" },
  { q: "entendi mas to cabreiro", preserve: true, persona: "mixed" },
  { q: "continua recomendando?", preserve: true, persona: "apressado" },
  { q: "segue recomendando esse?", preserve: true, persona: "detalhista" },
  { q: "continua na mesma linha?", preserve: true, persona: "tecnico" },
  { q: "voce sustenta?", preserve: true, persona: "curto" },
  { q: "crava mesmo?", preserve: true, persona: "informal" },
  { q: "voce mantem?", preserve: true, persona: "curto" },
  { q: "ainda recomenda?", preserve: true, persona: "apressado" },
  { q: "voce iria nele ainda?", preserve: true, persona: "informal" },
  { q: "mantem a recomendacao?", preserve: true, persona: "formal" },
  { q: "nao to comprando essa ideia", preserve: true, persona: "informal" },
  { q: "isso nao me desceu", preserve: true, persona: "informal" },
  { q: "fiquei meio dividido", preserve: true, persona: "indeciso" },
  { q: "nao me ganhou", preserve: true, persona: "leigo" },
  { q: "sei la", preserve: true, persona: "informal" },
  { q: "hm nao sei", preserve: true, persona: "indeciso" },
  { q: "nao me convenceu", preserve: true, persona: "leigo" },
  { q: "tenho medo de me arrepender", preserve: true, persona: "indeciso" },
  { q: "nao quero me arrepender", preserve: true, persona: "leigo" },
  { q: "quero evitar problemas depois", preserve: true, persona: "detalhista" },
  { q: "nao quero fazer besteira", preserve: true, persona: "informal" },
  { q: "to cabreiro", preserve: true, persona: "informal" },
  { q: "quero comprar tranquilo", preserve: true, persona: "leigo" },
  { q: "detalha de novo", preserve: true, persona: "leigo" },
  { q: "explica simples", preserve: true, persona: "apressado" },
  { q: "nao ficou claro", preserve: true, persona: "confuso" },
  { q: "como assim?", preserve: true, persona: "confuso" },
  { q: "pode explicar?", preserve: true, persona: "leigo" },
  { q: "me explica", preserve: true, persona: "curto" },
  { q: "ficou confuso", preserve: true, persona: "leigo" },
  { q: "o pessoal recomenda?", preserve: true, persona: "leigo" },
  { q: "a galera curte?", preserve: true, persona: "informal" },
  { q: "o povo fala bem?", preserve: true, persona: "leigo" },
  { q: "costuma dar problema?", preserve: true, persona: "tecnico" },
  { q: "muita gente se arrepende?", preserve: true, persona: "indeciso" },
  { q: "e bem recomendado?", preserve: true, persona: "tecnico" },
  { q: "vende bastante?", preserve: true, persona: "leigo" },
  { q: "quem comprou gostou?", preserve: true, persona: "leigo" },
  { q: "demorou", preserve: true, persona: "girias" },
  { q: "valeu", preserve: true, persona: "girias" },
  { q: "fechou", preserve: true, persona: "curto" },
  { q: "captei", preserve: true, persona: "curto" },
  { q: "beleza entendi", preserve: true, persona: "informal" },
  { q: "ok entendi", preserve: true, persona: "leigo" },
  { q: "agora sim", preserve: true, persona: "leigo" },
  { q: "ta claro", preserve: true, persona: "curto" },
  { q: "fez sentido agora", preserve: true, persona: "leigo" },
  { q: "certo, continua", preserve: true, persona: "formal" },
  { q: "beleza, peguei", preserve: true, persona: "informal" },
  { q: "continua?", preserve: true, persona: "curto" },
  { q: "qual?", preserve: true, persona: "curto" },
  { q: "recomenda?", preserve: true, persona: "curto" },
  { q: "indica?", preserve: true, persona: "curto" },
  { q: "qual compensa?", preserve: true, persona: "leigo" },
  { q: "qual vale mais?", preserve: true, persona: "apressado" },
  { q: "e peso?", preserve: true, persona: "tecnico" },
  { q: "e tela?", preserve: true, persona: "leigo" },
  { q: "e camera?", preserve: true, persona: "leigo" },
  { q: "e bateria?", preserve: true, persona: "leigo" },
  { q: "e desempenho?", preserve: true, persona: "tecnico" },
  { q: "e upgrade?", preserve: true, persona: "tecnico" },
  { q: "e conforto?", preserve: true, persona: "detalhista" },
  { q: "e construcao?", preserve: true, persona: "detalhista" },
  { q: "e conectividade?", preserve: true, persona: "tecnico" },
  { q: "prioriza silencio", preserve: false, replacementKind: "ANCHOR_RECALIBRATION", persona: "tecnico" },
  { q: "bateria pesa mais agora", preserve: false, replacementKind: "ANCHOR_RECALIBRATION", persona: "leigo" },
  { q: "da mais peso pra conforto", preserve: false, replacementKind: "ANCHOR_RECALIBRATION", persona: "informal" },
  { q: "baixei o orcamento", preserve: false, replacementKind: "ANCHOR_RECALIBRATION", persona: "apressado" },
  { q: "mostra outra opcao", preserve: false, replacementKind: "EXPECTED_REPLACEMENT", persona: "leigo" },
  { q: "tem outra alternativa?", preserve: false, replacementKind: "EXPECTED_REPLACEMENT", persona: "indeciso" },
  { q: "qual ficou em segundo?", preserve: false, replacementKind: "EXPECTED_REPLACEMENT", persona: "leigo" },
  { q: "tem plano b?", preserve: false, replacementKind: "EXPECTED_REPLACEMENT", persona: "informal" },
  { q: "agora quero notebook", preserve: false, replacementKind: "SEARCH_RESET", persona: "leigo" },
  { q: "quero comecar do zero", preserve: false, replacementKind: "SEARCH_RESET", persona: "indeciso" },
  { q: "preciso tv ate 3000", preserve: false, replacementKind: "SEARCH_RESET", persona: "apressado" },
  { q: "busco monitor gamer", preserve: false, replacementKind: "SEARCH_RESET", persona: "tecnico" },
];

function evaluate({ q, preserve, replacementKind, persona }) {
  const trace = simulateTurn(q, BASE_STATE);
  const leaks = [];
  const { allowReplaceWinner, openedNewSearch, shouldPreserveAnchor } = trace.routing;

  if (preserve) {
    if (allowReplaceWinner === true) {
      leaks.push("WINNER_LOSS");
      leaks.push("RANDOM_PRODUCT_SWITCH");
    }
    if (openedNewSearch) leaks.push("WINNER_LOSS");
    if (shouldPreserveAnchor === false) leaks.push("WINNER_LOSS");
  } else if (replacementKind === "SEARCH_RESET") {
    if (!allowReplaceWinner) leaks.push("MISSING_REPLACEMENT");
    if (!openedNewSearch) leaks.push("MISSING_REPLACEMENT");
  } else if (openedNewSearch) {
    leaks.push("WINNER_LOSS");
  }

  return {
    q,
    persona,
    preserve,
    allowReplaceWinner,
    openedNewSearch,
    shouldPreserveAnchor,
    conversationAct: trace.routing.conversationAct,
    responsePath: trace.responsePathFinal,
    actualFamily: trace.actualFamily,
    leaks,
    ok: leaks.filter((l) => !l.startsWith("MISSING")).length === 0 && (preserve || !leaks.includes("MISSING_REPLACEMENT")),
  };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

const results = VARIANTS.map(evaluate);
const passed = results.filter((r) => r.ok).length;
const preserve = results.filter((r) => r.preserve);
const replace = results.filter((r) => !r.preserve);
const winnerLoss = results.filter((r) => r.leaks.includes("WINNER_LOSS")).length;
const randomSwitch = results.filter((r) => r.leaks.includes("RANDOM_PRODUCT_SWITCH")).length;

console.log("PATCH 7.9Z.3 — Winner Preservation Variants (Regra 18)\n");
console.log(`Variants: ${VARIANTS.length} | Passed: ${passed}/${VARIANTS.length} (${pct(passed, VARIANTS.length)}%)`);
console.log(`  Preserve group: ${preserve.filter((r) => r.ok).length}/${preserve.length}`);
console.log(`  Replace group: ${replace.filter((r) => r.ok).length}/${replace.length}`);
console.log(`  WINNER_LOSS: ${winnerLoss} | RANDOM_PRODUCT_SWITCH: ${randomSwitch}\n`);

const fails = results.filter((r) => !r.ok);
if (fails.length) {
  console.log("── Failures ──\n");
  for (const r of fails.slice(0, 20)) {
    console.log(`  [${r.persona}] "${r.q}" → ${r.leaks.join(", ")}`);
  }
}

const verdict =
  winnerLoss === 0 &&
  randomSwitch === 0 &&
  passed / VARIANTS.length >= 0.95
    ? "A) WINNER PRESERVATION ROBUST"
    : "B) WINNER PRESERVATION POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
