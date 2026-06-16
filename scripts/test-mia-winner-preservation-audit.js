/**
 * PATCH 7.9Z.3 — Winner Preservation Audit
 *
 * Validates winner/anchor routing contract across conversational families.
 * 200+ scenarios — local harness, no HTTP, no production changes.
 *
 * Usage: node scripts/test-mia-winner-preservation-audit.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";

const WINNER = "Smartphone Alpha 35";
const RUNNER_UP = "Smartphone Beta 22";

const BASE_STATE = {
  hasAnchor: true,
  winner: WINNER,
  runnerUp: RUNNER_UP,
  budgetMax: 2800,
  priorityAxis: "desempenho",
  deprioritized: [],
};

function s(id, category, query, opts = {}) {
  return {
    id,
    category,
    query,
    expectWinnerPreserve: opts.expectWinnerPreserve !== false,
    replacementKind: opts.replacementKind || null,
    expectFamily: opts.expectFamily || null,
    expectAllowReplace: opts.expectAllowReplace ?? null,
    expectNewSearch: opts.expectNewSearch ?? null,
    label: opts.label || category,
  };
}

/** Category A — conversational pure (preserve) */
const CAT_A = [
  "gostei",
  "curti",
  "faz sentido",
  "blz",
  "show",
  "demorou",
  "valeu",
  "fechou",
  "entendi",
  "captei",
  "beleza",
  "tranquilo",
  "suave",
  "de boa",
  "otimo",
].map((q, i) => s(`A-${i}`, "A", q, { expectFamily: "ACKNOWLEDGEMENT", label: "conversational pure" }));

/** Category B — follow-up (preserve) */
const CAT_B = [
  "qual?",
  "me ajuda",
  "qual melhor?",
  "continua?",
  "e ai?",
  "qual recomenda?",
  "me indica",
  "qual vale mais?",
  "qual compensa?",
  "qual ficou melhor?",
  "qual seria sua escolha?",
  "me fala qual",
  "qual voce iria?",
  "recomenda?",
  "indica?",
].map((q, i) => s(`B-${i}`, "B", q, { label: "follow-up/delegation" }));

/** Category C — axis follow-up (preserve) */
const CAT_C = [
  "e bateria?",
  "e camera?",
  "e desempenho?",
  "e tela?",
  "e autonomia?",
  "e consumo?",
  "e upgrade?",
  "e durabilidade?",
  "e conforto?",
  "e silencio?",
  "e peso?",
  "e construcao?",
  "e ergonomia?",
  "e garantia?",
  "e conectividade?",
].map((q, i) => s(`C-${i}`, "C", q, { label: "axis follow-up" }));

/** Category D — ACK (preserve) */
const CAT_D = [
  "ok entendi",
  "beleza entendi",
  "ah entendi",
  "saquei",
  "agora sim",
  "ta claro",
  "fez sentido agora",
  "fechou entendi",
  "certo, continua",
  "blz entendi",
  "saquei melhor",
  "beleza, peguei",
].map((q, i) => s(`D-${i}`, "D", q, { expectFamily: "ACKNOWLEDGEMENT", label: "ACK" }));

/** Category E — comprehension (preserve) */
const CAT_E = [
  "explica melhor",
  "detalha melhor",
  "explica simples",
  "nao entendi",
  "como assim?",
  "detalha de novo",
  "explica de novo",
  "nao ficou claro",
  "pode explicar?",
  "me explica",
  "nao compreendi",
  "ficou confuso",
].map((q, i) => s(`E-${i}`, "E", q, { label: "comprehension" }));

/** Category F — social validation (preserve) */
const CAT_F = [
  "muita gente usa?",
  "costuma recomendar?",
  "galera curte?",
  "o pessoal compra?",
  "quem usa gosta?",
  "o povo fala bem?",
  "tem muita reclamacao?",
  "costuma dar problema?",
  "muita gente se arrepende?",
  "o pessoal recomenda?",
  "e popular?",
  "e bem recomendado?",
].map((q, i) => s(`F-${i}`, "F", q, { expectFamily: "SOCIAL_VALIDATION", label: "SV" }));

/** Category G — confidence challenge (preserve) */
const CAT_G = [
  "continua valendo?",
  "ainda vale?",
  "mantem esse?",
  "ainda e esse?",
  "sustenta?",
  "voce bancaria essa?",
  "segue sendo a melhor?",
  "continua sendo a escolha?",
  "ainda recomenda?",
  "voce iria nele ainda?",
  "mantem a recomendacao?",
  "voce tem certeza?",
  "continua bancando esse?",
  "crava mesmo?",
  "voce mantem?",
  "segue nesse mesmo?",
].map((q, i) => s(`G-${i}`, "G", q, { expectFamily: "CONFIDENCE_CHALLENGE", label: "CC" }));

/** Category H — soft disagreement (preserve) */
const CAT_H = [
  "espera ai",
  "pera ai",
  "calma ai",
  "nao sei nao",
  "to meio assim",
  "nao curti muito",
  "isso nao me desceu",
  "nao bateu ainda",
  "nao to comprando essa ideia",
  "fiquei meio dividido",
  "nao me ganhou",
  "sei la",
  "hm nao sei",
  "nao me convenceu",
  "nao bateu comigo",
].map((q, i) => s(`H-${i}`, "H", q, { expectFamily: "SOFT_DISAGREEMENT", label: "SD" }));

/** Category I — anti-regret (preserve) */
const CAT_I = [
  "tenho medo de me arrepender",
  "nao quero me arrepender",
  "nao quero errar",
  "to com receio",
  "nao quero fazer besteira",
  "tenho receio",
  "nao quero gastar errado",
  "quero evitar problemas depois",
  "nao quero dor de cabeca",
  "to cabreiro",
  "quero comprar tranquilo",
  "nao quero jogar dinheiro fora",
].map((q, i) => s(`I-${i}`, "I", q, { expectFamily: "ANTI_REGRET", label: "AR" }));

/** Category J — long-context refinements (preserve) */
const CAT_J = [
  "continua recomendando?",
  "continua na mesma linha?",
  "segue recomendando esse?",
  "entao mantem nele?",
  "parece ser o certo",
  "fechou vou levar",
  "quero comprar tranquilo",
  "prefiro gastar menos",
  "baixei o orcamento",
  "prioriza durabilidade",
  "prioriza bateria",
  "mostre outro caminho",
  "tem outro caminho?",
  "to com receio",
  "galera curte?",
].map((q, i) => s(`J-${i}`, "J", q, { label: "long context" }));

/** Category K — mixed compounds (preserve dominant) */
const CAT_K = [
  "ok entendi, mas continua valendo?",
  "show, mas ainda to na duvida",
  "beleza, mas o povo fala bem?",
  "saquei, mas tenho medo de errar",
  "entendi mas to cabreiro",
  "nao curti mas voce tem certeza?",
  "continua valendo mesmo se eu gastar menos?",
  "faz sentido, mas muita gente usa?",
  "blz, mas sustenta?",
  "captei, mas o pessoal reclama?",
  "entendi, mas qual o custo beneficio?",
  "gostei, mas continua valendo?",
  "curti, mas ainda recomenda?",
  "fechou, mas explica melhor",
  "beleza, mas e bateria?",
].map((q, i) => s(`K-${i}`, "K", q, { label: "mixed" }));

/** Category L — constraint change (legitimate recalibration) */
const CAT_L = [
  "agora orcamento caiu",
  "agora bateria importa mais",
  "prioriza silencio",
  "prioriza conforto",
  "desempenho pesa mais",
  "bateria pesa mais agora",
  "preco importa mais",
  "quero gastar menos",
  "pensei melhor no orcamento",
  "baixei o orcamento",
  "agora ate 1500",
  "custo beneficio importa mais agora",
].map((q, i) =>
  s(`L-${i}`, "L", q, {
    expectWinnerPreserve: false,
    replacementKind: "ANCHOR_RECALIBRATION",
    expectFamily: "CONSTRAINT_CHANGE",
    label: "constraint recalibration",
  })
);

/** Category M — alternative exploration */
const CAT_M = [
  "mostra outra opcao",
  "tem outra opcao?",
  "mostra alternativas",
  "mostre alternativas",
  "tem outro caminho?",
  "mostre outro caminho",
  "quero ver alternativas",
  "explorar outras opcoes",
  "tem concorrente?",
  "ver outras opcoes",
  "mostra outro produto",
  "tem outra alternativa?",
].map((q, i) =>
  s(`M-${i}`, "M", q, {
    expectWinnerPreserve: false,
    replacementKind: "EXPECTED_REPLACEMENT",
    expectFamily: "ALTERNATIVE_EXPLORATION",
    label: "AE",
  })
);

/** Category N — second best discovery */
const CAT_N = [
  "qual ficou em segundo?",
  "quem ficou em segundo?",
  "qual o segundo colocado?",
  "mostra o plano b",
  "qual ficou em segundo lugar?",
  "qual e o runner up?",
  "qual ficou em 2?",
  "segundo colocado?",
  "qual e a reserva?",
  "tem plano b?",
  "qual ficou logo atras?",
  "quem ficou logo atras?",
].map((q, i) =>
  s(`N-${i}`, "N", q, {
    expectWinnerPreserve: false,
    replacementKind: "EXPECTED_REPLACEMENT",
    expectFamily: "SECOND_BEST_DISCOVERY",
    label: "SBD",
  })
);

/** Category O — explicit new search */
const CAT_O = [
  "agora quero notebook",
  "quero outro produto",
  "esquece isso quero comecar do zero",
  "quero comecar do zero",
  "preciso notebook ate 4000",
  "busco tv nova",
  "quero monitor gamer",
  "procuro fone bluetooth",
  "quero tablet agora",
  "muda para notebook",
  "quero ssd nvme",
  "quero mouse sem fio",
].map((q, i) =>
  s(`O-${i}`, "O", q, {
    expectWinnerPreserve: false,
    replacementKind: "SEARCH_RESET",
    expectAllowReplace: true,
    expectNewSearch: true,
    label: "explicit new search",
  })
);

const SCENARIOS = [
  ...CAT_A,
  ...CAT_B,
  ...CAT_C,
  ...CAT_D,
  ...CAT_E,
  ...CAT_F,
  ...CAT_G,
  ...CAT_H,
  ...CAT_I,
  ...CAT_J,
  ...CAT_K,
  ...CAT_L,
  ...CAT_M,
  ...CAT_N,
  ...CAT_O,
];

function classifyLeak(scenario, trace) {
  const leaks = [];
  const {
    allowReplaceWinner,
    openedNewSearch,
    shouldPreserveAnchor,
    conversationAct,
  } = trace.routing;

  if (scenario.expectWinnerPreserve) {
    if (allowReplaceWinner === true) {
      leaks.push({
        type: "WINNER_LOSS",
        detail: "allowReplaceWinner=true on preserve scenario",
      });
      leaks.push({
        type: "RANDOM_PRODUCT_SWITCH",
        detail: "winner replace signal without legitimate recalibration",
      });
    }
    if (openedNewSearch) {
      leaks.push({
        type: "WINNER_LOSS",
        detail: "openedNewSearch on preserve scenario",
      });
    }
    if (shouldPreserveAnchor === false) {
      leaks.push({
        type: "WINNER_LOSS",
        detail: "shouldPreserveAnchor=false on preserve scenario",
      });
    }
  } else {
    if (scenario.replacementKind === "SEARCH_RESET") {
      if (allowReplaceWinner !== true) {
        leaks.push({ type: "MISSING_REPLACEMENT", detail: "expected allowReplaceWinner=true" });
      }
      if (!openedNewSearch) {
        leaks.push({ type: "MISSING_REPLACEMENT", detail: "expected openedNewSearch=true" });
      }
    } else if (scenario.expectFamily && trace.actualFamily !== scenario.expectFamily) {
      leaks.push({
        type: "MISSING_REPLACEMENT",
        detail: `expected family ${scenario.expectFamily} got ${trace.actualFamily}`,
      });
    }
    if (scenario.replacementKind === "ANCHOR_RECALIBRATION" && openedNewSearch) {
      leaks.push({
        type: "WINNER_LOSS",
        detail: "constraint recalibration opened new search",
      });
    }
  }

  if (scenario.expectAllowReplace === true && allowReplaceWinner !== true) {
    leaks.push({ type: "MISSING_REPLACEMENT", detail: "allowReplaceWinner expected true" });
  }
  if (scenario.expectAllowReplace === false && allowReplaceWinner === true) {
    leaks.push({ type: "WINNER_LOSS", detail: "allowReplaceWinner unexpected true" });
  }
  if (scenario.expectNewSearch === true && !openedNewSearch) {
    leaks.push({ type: "MISSING_REPLACEMENT", detail: "openedNewSearch expected true" });
  }
  if (scenario.expectNewSearch === false && openedNewSearch) {
    leaks.push({ type: "WINNER_LOSS", detail: "openedNewSearch unexpected true" });
  }

  return leaks;
}

function evaluateScenario(scenario) {
  const winnerBefore = BASE_STATE.winner;
  const anchorBefore = BASE_STATE.hasAnchor;
  const trace = simulateTurn(scenario.query, BASE_STATE);
  const leaks = classifyLeak(scenario, trace);

  const userPerception =
    leaks.some((l) => ["WINNER_LOSS", "RANDOM_PRODUCT_SWITCH"].includes(l.type))
      ? "NÃO"
      : leaks.length
        ? "PARCIAL"
        : "SIM";

  return {
    ...scenario,
    winnerBefore,
    winnerAfter: BASE_STATE.winner,
    anchorBefore,
    anchorAfter: BASE_STATE.hasAnchor,
    allowReplaceWinner: trace.routing.allowReplaceWinner,
    shouldPreserveAnchor: trace.routing.shouldPreserveAnchor,
    conversationAct: trace.routing.conversationAct,
    responsePath: trace.responsePathFinal,
    openedNewSearch: trace.routing.openedNewSearch,
    actualFamily: trace.actualFamily,
    userPerception,
    leaks,
    ok: leaks.filter((l) => !l.type.startsWith("MISSING")).length === 0,
    replacementOk: scenario.expectWinnerPreserve || leaks.every((l) => l.type !== "MISSING_REPLACEMENT"),
  };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

console.log("PATCH 7.9Z.3 — Winner Preservation Audit\n");
console.log(`Scenarios: ${SCENARIOS.length}\n`);

const results = SCENARIOS.map(evaluateScenario);
const preserve = results.filter((r) => r.expectWinnerPreserve);
const replace = results.filter((r) => !r.expectWinnerPreserve);

const preserveOk = preserve.filter((r) => r.ok).length;
const replaceOk = replace.filter((r) => r.replacementOk).length;

const winnerLoss = results.flatMap((r) => r.leaks.filter((l) => l.type === "WINNER_LOSS"));
const randomSwitch = results.flatMap((r) => r.leaks.filter((l) => l.type === "RANDOM_PRODUCT_SWITCH"));
const expectedReplace = replace.filter((r) => r.replacementOk && !r.leaks.some((l) => l.type === "WINNER_LOSS"));

const leakByType = {};
for (const r of results) {
  for (const l of r.leaks) leakByType[l.type] = (leakByType[l.type] || 0) + 1;
}

console.log("── Métricas ──\n");
console.log(`  Winner Preservation (must hold): ${preserveOk}/${preserve.length} (${pct(preserveOk, preserve.length)}%)`);
console.log(`  Expected Replacement (legitimate): ${replaceOk}/${replace.length} (${pct(replaceOk, replace.length)}%)`);
console.log(`  Overall pass: ${results.filter((r) => r.ok && r.replacementOk).length}/${results.length} (${pct(results.filter((r) => r.ok && r.replacementOk).length, results.length)}%)`);
console.log(`  WINNER_LOSS: ${winnerLoss.length}`);
console.log(`  RANDOM_PRODUCT_SWITCH: ${randomSwitch.length}`);
console.log(`  EXPECTED_REPLACEMENT identified: ${expectedReplace.length}/${replace.length}`);

if (Object.keys(leakByType).length) {
  console.log("\n── Leaks by type ──\n");
  for (const [type, count] of Object.entries(leakByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log("\n── Failures (first 20) ──\n");
  for (const r of results.filter((x) => !x.ok || !x.replacementOk).slice(0, 20)) {
    console.log(`  [${r.id}] "${r.query}" → ${r.leaks.map((l) => l.type).join(", ")}`);
  }
}

const byCategory = {};
for (const r of results) {
  if (!byCategory[r.category]) byCategory[r.category] = { total: 0, ok: 0 };
  byCategory[r.category].total++;
  if (r.ok && r.replacementOk) byCategory[r.category].ok++;
}
console.log("\n── Por categoria ──\n");
for (const cat of "ABCDEFGHIJKLMNO") {
  const b = byCategory[cat];
  if (b) console.log(`  ${cat}: ${b.ok}/${b.total} (${pct(b.ok, b.total)}%)`);
}

const verdict =
  winnerLoss.length === 0 &&
  randomSwitch.length === 0 &&
  preserveOk === preserve.length &&
  replaceOk / replace.length >= 0.95
    ? "A) WINNER PRESERVATION ROBUST"
    : "B) WINNER PRESERVATION POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
