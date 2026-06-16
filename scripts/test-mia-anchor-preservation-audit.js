/**
 * PATCH 7.9Z.4 — Anchor Preservation Audit
 *
 * Validates anchor/context routing contract across conversational families.
 * 220+ scenarios — local harness, no HTTP.
 *
 * Usage: node scripts/test-mia-anchor-preservation-audit.js
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
    expectedAnchorBehavior: opts.expectedAnchorBehavior || "PRESERVE",
    expectFamily: opts.expectFamily || null,
    expectNewSearch: opts.expectNewSearch ?? null,
    expectAllowReplace: opts.expectAllowReplace ?? null,
    label: opts.label || category,
  };
}

/** A — Conversacional puro */
const CAT_A = [
  "gostei", "curti", "faz sentido", "blz", "show", "demorou", "valeu", "fechou",
  "entendi", "captei", "beleza", "tranquilo", "suave", "de boa", "otimo",
].map((q, i) => s(`A-${i}`, "A", q, { expectFamily: "ACKNOWLEDGEMENT", label: "conversational pure" }));

/** B — Follow-up curto */
const CAT_B = [
  "qual?", "me ajuda", "qual melhor?", "continua?", "e ai?", "qual recomenda?",
  "me indica", "qual vale mais?", "qual compensa?", "qual ficou melhor?",
  "qual seria sua escolha?", "me fala qual", "qual voce iria?", "recomenda?", "indica?",
].map((q, i) => s(`B-${i}`, "B", q, { label: "follow-up" }));

/** C — Axis follow-up */
const CAT_C = [
  "e bateria?", "e camera?", "e desempenho?", "e tela?", "e autonomia?", "e consumo?",
  "e upgrade?", "e durabilidade?", "e conforto?", "e silencio?", "e peso?",
  "e construcao?", "e ergonomia?", "e garantia?", "e conectividade?",
  "e velocidade?", "e custo beneficio?",
].map((q, i) => s(`C-${i}`, "C", q, { label: "axis follow-up" }));

/** D — ACK */
const CAT_D = [
  "ok entendi", "beleza entendi", "ah entendi", "saquei", "agora sim", "ta claro",
  "fez sentido agora", "fechou entendi", "certo, continua", "blz entendi",
  "saquei melhor", "beleza, peguei",
].map((q, i) => s(`D-${i}`, "D", q, { expectFamily: "ACKNOWLEDGEMENT", label: "ACK" }));

/** E — Comprehension */
const CAT_E = [
  "explica melhor", "detalha melhor", "explica simples", "nao entendi", "como assim?",
  "detalha de novo", "explica de novo", "nao ficou claro", "pode explicar?",
  "me explica", "nao compreendi", "ficou confuso",
].map((q, i) => s(`E-${i}`, "E", q, { label: "comprehension" }));

/** F — Social Validation */
const CAT_F = [
  "muita gente usa?", "costuma recomendar?", "galera curte?", "o pessoal compra?",
  "quem usa gosta?", "o povo fala bem?", "o povo recomenda?", "quem comprou gostou?",
  "tem muita reclamacao?", "costuma dar problema?", "muita gente se arrepende?",
  "e popular?",
].map((q, i) => s(`F-${i}`, "F", q, { expectFamily: "SOCIAL_VALIDATION", label: "SV" }));

/** G — Confidence Challenge */
const CAT_G = [
  "continua valendo?", "ainda vale?", "mantem esse?", "continua recomendando?",
  "sustenta?", "voce bancaria essa?", "segue sendo a melhor?", "ainda recomenda?",
  "voce iria nele ainda?", "mantem a recomendacao?", "voce tem certeza?",
  "continua bancando esse?", "crava mesmo?", "voce mantem?", "segue nesse mesmo?",
  "voce manteria?",
].map((q, i) => s(`G-${i}`, "G", q, { expectFamily: "CONFIDENCE_CHALLENGE", label: "CC" }));

/** H — Soft Disagreement */
const CAT_H = [
  "espera ai", "pera ai", "calma ai", "nao sei nao", "to meio assim", "nao curti muito",
  "isso nao me desceu", "nao bateu ainda", "nao to comprando essa ideia",
  "fiquei meio dividido", "nao me ganhou", "sei la", "hm nao sei",
  "nao me convenceu", "nao bateu comigo",
].map((q, i) => s(`H-${i}`, "H", q, { expectFamily: "SOFT_DISAGREEMENT", label: "SD" }));

/** I — Anti-Regret */
const CAT_I = [
  "tenho medo de me arrepender", "nao quero me arrepender", "nao quero errar",
  "to com receio", "nao quero fazer besteira", "tenho receio", "nao quero gastar errado",
  "quero evitar problemas depois", "nao quero dor de cabeca", "to cabreiro",
  "quero comprar tranquilo", "nao quero jogar dinheiro fora",
].map((q, i) => s(`I-${i}`, "I", q, { expectFamily: "ANTI_REGRET", label: "AR" }));

/** J — Constraint Change (recalibrate, not reset) */
const CAT_J = [
  "agora ate 1800", "bateria pesa mais", "preco importa menos", "prioriza conforto",
  "quero gastar menos", "quero algo mais seguro", "prioriza silencio",
  "agora orcamento caiu", "agora bateria importa mais", "desempenho pesa mais",
  "bateria pesa mais agora", "pensei melhor no orcamento", "baixei o orcamento",
  "custo beneficio importa mais agora", "da mais peso pra durabilidade",
].map((q, i) =>
  s(`J-${i}`, "J", q, {
    expectedAnchorBehavior: "RECALIBRATE",
    expectFamily: "CONSTRAINT_CHANGE",
    label: "constraint recalibration",
  })
);

/** K — Alternative Exploration (preserve anchor) */
const CAT_K = [
  "mostra outra opcao", "tem outra opcao?", "mostra alternativas", "mostre alternativas",
  "tem outro caminho?", "mostre outro caminho", "quero ver alternativas",
  "explorar outras opcoes", "ver outras opcoes", "tem concorrente?",
  "mostra outro produto", "tem outra alternativa?",
].map((q, i) =>
  s(`K-${i}`, "K", q, {
    expectedAnchorBehavior: "PRESERVE",
    expectFamily: "ALTERNATIVE_EXPLORATION",
    label: "AE",
  })
);

/** L — Second Best Discovery (preserve anchor) */
const CAT_L = [
  "qual ficou em segundo?", "quem ficou em segundo?", "qual o segundo colocado?",
  "mostra o plano b", "qual ficou em segundo lugar?", "qual e o runner up?",
  "qual ficou em 2?", "segundo colocado?", "qual e a reserva?", "tem plano b?",
  "qual ficou logo atras?", "quem ficou logo atras?", "runner up?",
].map((q, i) =>
  s(`L-${i}`, "L", q, {
    expectedAnchorBehavior: "PRESERVE",
    expectFamily: "SECOND_BEST_DISCOVERY",
    label: "SBD",
  })
);

/** M — Decision Confirmation */
const CAT_M = [
  "fechou vou pegar", "parece ser esse", "vou nele", "acho que fechou",
  "entao e esse", "vou ficar com esse", "fechou nele", "decidi por esse",
  "vou nesse", "fechado nele", "parece ser o certo", "fechou vou levar",
].map((q, i) =>
  s(`M-${i}`, "M", q, {
    expectedAnchorBehavior: "PRESERVE",
    expectFamily: "DECISION_CONFIRMATION",
    label: "DC",
  })
);

/** N — Long Context late-turn (preserve) */
const CAT_N = [
  "continua recomendando?", "continua na mesma linha?", "segue recomendando esse?",
  "entao mantem nele?", "qual melhor msm?", "continua valendo no fim?",
  "ainda segura essa indicacao?", "o povo aprova?", "explica melhor ai",
  "nao peguei direito", "to meio dividido ainda", "tenho medo de errar ainda",
  "e bateria no fim?", "e custo beneficio no fim?", "muita gente usa no fim?",
].map((q, i) => s(`N-${i}`, "N", q, { label: "long context late-turn" }));

/** O — Cross-family mixed (preserve dominant) */
const CAT_O = [
  "ok entendi, mas continua valendo?", "show, mas ainda to na duvida",
  "beleza, mas o povo fala bem?", "saquei, mas tenho medo de errar",
  "entendi mas to cabreiro", "nao curti mas voce tem certeza?",
  "faz sentido, mas muita gente usa?", "blz, mas sustenta?",
  "captei, mas o pessoal reclama?", "entendi, mas qual o custo beneficio?",
  "gostei, mas continua valendo?", "curti, mas ainda recomenda?",
  "fechou, mas explica melhor", "beleza, mas e bateria?",
  "continua valendo mesmo se eu gastar menos?",
].map((q, i) => s(`O-${i}`, "O", q, { label: "cross-family mixed" }));

/** P — Nova busca legítima */
const CAT_P = [
  "agora quero notebook", "quero monitor gamer", "preciso notebook ate 4000",
  "busco tv nova", "procuro fone bluetooth", "quero tablet agora",
  "muda para notebook", "quero ssd nvme", "quero mouse sem fio",
  "agora quero uma tv", "preciso escolher um monitor tambem",
  "vamos falar de outro produto",
].map((q, i) =>
  s(`P-${i}`, "P", q, {
    expectedAnchorBehavior: "REPLACE",
    expectNewSearch: true,
    expectAllowReplace: true,
    label: "explicit new search",
  })
);

/** Q — Reset explícito */
const CAT_Q = [
  "quero comecar do zero", "esquece isso quero comecar do zero",
  "esquece essa busca", "zera tudo", "comeca de novo", "esquece esse quero outro tipo",
  "comeca do zero", "esquece essa recomendacao", "recomeca do zero",
  "limpa tudo e comeca de novo",
].map((q, i) =>
  s(`Q-${i}`, "Q", q, {
    expectedAnchorBehavior: "RESET",
    expectNewSearch: true,
    expectAllowReplace: true,
    label: "explicit reset",
  })
);

/** R — Mudança de categoria */
const CAT_R = [
  "sai de celular vamos para notebook", "agora e cadeira", "muda para placa de video",
  "troca pra notebook", "agora e monitor", "deixa celular quero tv",
  "agora quero comprar outra coisa", "preciso escolher um monitor",
  "vamos falar de notebook agora", "muda o foco para tablet",
].map((q, i) =>
  s(`R-${i}`, "R", q, {
    expectedAnchorBehavior: "REPLACE",
    expectNewSearch: true,
    expectAllowReplace: true,
    label: "category change",
  })
);

const SCENARIOS = [
  ...CAT_A, ...CAT_B, ...CAT_C, ...CAT_D, ...CAT_E, ...CAT_F, ...CAT_G, ...CAT_H,
  ...CAT_I, ...CAT_J, ...CAT_K, ...CAT_L, ...CAT_M, ...CAT_N, ...CAT_O,
  ...CAT_P, ...CAT_Q, ...CAT_R,
];

function classifyAnchorLeaks(scenario, trace) {
  const leaks = [];
  const {
    allowReplaceWinner,
    openedNewSearch,
    shouldPreserveAnchor,
    clearNewSearch,
    conversationAct,
    responsePathHint,
    mode,
  } = trace.routing;

  const contextReset =
    openedNewSearch ||
    (trace.genericFallback && BASE_STATE.hasAnchor) ||
    (clearNewSearch && BASE_STATE.hasAnchor && scenario.expectedAnchorBehavior === "PRESERVE");

  const behavior = scenario.expectedAnchorBehavior;

  if (behavior === "PRESERVE") {
    if (shouldPreserveAnchor === false) {
      leaks.push({ type: "ANCHOR_LOSS", detail: "shouldPreserveAnchor=false on preserve scenario" });
    }
    if (openedNewSearch) {
      leaks.push({ type: "UNNECESSARY_CONTEXT_RESET", detail: "openedNewSearch on preserve scenario" });
    }
    if (trace.genericFallback) {
      leaks.push({ type: "UNNECESSARY_CONTEXT_RESET", detail: "generic fallback with active anchor" });
    }
    if (allowReplaceWinner === true) {
      leaks.push({ type: "WRONG_ANCHOR_REPLACEMENT", detail: "allowReplaceWinner=true without explicit new search" });
    }
    if (clearNewSearch && BASE_STATE.hasAnchor) {
      leaks.push({ type: "UNNECESSARY_CONTEXT_RESET", detail: "clearNewSearch with anchor on preserve scenario" });
    }
  } else if (behavior === "RECALIBRATE") {
    if (openedNewSearch) {
      leaks.push({ type: "ANCHOR_LOSS", detail: "constraint recalibration opened new search" });
      leaks.push({ type: "UNNECESSARY_CONTEXT_RESET", detail: "full reset on recalibration" });
    }
    if (trace.genericFallback) {
      leaks.push({ type: "UNNECESSARY_CONTEXT_RESET", detail: "generic fallback on recalibration" });
    }
    if (scenario.expectFamily && trace.actualFamily !== scenario.expectFamily) {
      leaks.push({
        type: "MISSING_RECALIBRATION",
        detail: `expected ${scenario.expectFamily} got ${trace.actualFamily}`,
      });
    }
  } else if (behavior === "REPLACE" || behavior === "RESET") {
    if (!openedNewSearch) {
      leaks.push({ type: "ANCHOR_STALE", detail: "expected new search / anchor replace" });
    }
    if (shouldPreserveAnchor === true && openedNewSearch === false) {
      leaks.push({ type: "ANCHOR_STALE", detail: "anchor preserved when should replace/reset" });
    }
    if (scenario.expectAllowReplace === true && allowReplaceWinner !== true) {
      leaks.push({ type: "MISSING_REPLACEMENT", detail: "expected allowReplaceWinner=true" });
    }
    if (scenario.expectNewSearch === true && !openedNewSearch) {
      leaks.push({ type: "MISSING_REPLACEMENT", detail: "expected openedNewSearch=true" });
    }
  }

  if (scenario.expectAllowReplace === false && allowReplaceWinner === true) {
    leaks.push({ type: "WRONG_ANCHOR_REPLACEMENT", detail: "unexpected allowReplaceWinner=true" });
  }
  if (scenario.expectNewSearch === false && openedNewSearch) {
    leaks.push({ type: "UNNECESSARY_CONTEXT_RESET", detail: "unexpected openedNewSearch=true" });
  }

  return { leaks, contextReset };
}

function evaluateScenario(scenario) {
  const trace = simulateTurn(scenario.query, BASE_STATE);
  const { leaks, contextReset } = classifyAnchorLeaks(scenario, trace);

  const criticalTypes = ["ANCHOR_LOSS", "UNNECESSARY_CONTEXT_RESET", "WRONG_ANCHOR_REPLACEMENT", "ANCHOR_STALE"];
  const userPerception = leaks.some((l) => criticalTypes.includes(l.type))
    ? "NÃO"
    : leaks.some((l) => l.type.startsWith("MISSING"))
      ? "PARCIAL"
      : "SIM";

  const preserveOk = !leaks.some((l) => criticalTypes.includes(l.type));
  const behaviorOk =
    scenario.expectedAnchorBehavior === "PRESERVE" ||
    scenario.expectedAnchorBehavior === "RECALIBRATE"
      ? preserveOk
      : !leaks.some((l) => ["ANCHOR_STALE", "MISSING_REPLACEMENT"].includes(l.type));

  return {
    ...scenario,
    anchorBefore: BASE_STATE.hasAnchor,
    anchorAfter: BASE_STATE.hasAnchor,
    winnerBefore: BASE_STATE.winner,
    winnerAfter: BASE_STATE.winner,
    constraintBefore: BASE_STATE.budgetMax,
    constraintAfter: BASE_STATE.budgetMax,
    shouldPreserveAnchor: trace.routing.shouldPreserveAnchor,
    allowNewSearch: trace.routing.mode === "new_search" || trace.routing.openedNewSearch,
    allowReplaceWinner: trace.routing.allowReplaceWinner,
    conversationAct: trace.routing.conversationAct,
    responsePathHint: trace.routing.responsePathHint,
    openedNewSearch: trace.routing.openedNewSearch,
    clearNewSearch: trace.routing.clearNewSearch,
    contextReset,
    responsePath: trace.responsePathFinal,
    actualFamily: trace.actualFamily,
    userPerception,
    leaks,
    ok: preserveOk && behaviorOk,
  };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

console.log("PATCH 7.9Z.4 — Anchor Preservation Audit\n");
console.log(`Scenarios: ${SCENARIOS.length}\n`);

const results = SCENARIOS.map(evaluateScenario);

const preserve = results.filter((r) => r.expectedAnchorBehavior === "PRESERVE");
const recalibrate = results.filter((r) => r.expectedAnchorBehavior === "RECALIBRATE");
const replace = results.filter((r) => r.expectedAnchorBehavior === "REPLACE");
const reset = results.filter((r) => r.expectedAnchorBehavior === "RESET");

const preserveOk = preserve.filter((r) => r.ok).length;
const recalibrateOk = recalibrate.filter((r) => r.ok).length;
const replaceOk = replace.filter((r) => r.ok).length;
const resetOk = reset.filter((r) => r.ok).length;

const leakByType = {};
for (const r of results) {
  for (const l of r.leaks) leakByType[l.type] = (leakByType[l.type] || 0) + 1;
}

const anchorLoss = results.flatMap((r) => r.leaks.filter((l) => l.type === "ANCHOR_LOSS"));
const wrongReplace = results.flatMap((r) => r.leaks.filter((l) => l.type === "WRONG_ANCHOR_REPLACEMENT"));
const anchorStale = results.flatMap((r) => r.leaks.filter((l) => l.type === "ANCHOR_STALE"));
const unnecessaryReset = results.flatMap((r) => r.leaks.filter((l) => l.type === "UNNECESSARY_CONTEXT_RESET"));

console.log("── Métricas ──\n");
console.log(`  Anchor Preservation (PRESERVE): ${preserveOk}/${preserve.length} (${pct(preserveOk, preserve.length)}%)`);
console.log(`  Anchor Recalibration (RECALIBRATE): ${recalibrateOk}/${recalibrate.length} (${pct(recalibrateOk, recalibrate.length)}%)`);
console.log(`  Anchor Replacement (REPLACE): ${replaceOk}/${replace.length} (${pct(replaceOk, replace.length)}%)`);
console.log(`  Anchor Reset (RESET): ${resetOk}/${reset.length} (${pct(resetOk, reset.length)}%)`);
console.log(`  Overall pass: ${results.filter((r) => r.ok).length}/${results.length} (${pct(results.filter((r) => r.ok).length, results.length)}%)`);
console.log(`  ANCHOR_LOSS: ${anchorLoss.length}`);
console.log(`  WRONG_ANCHOR_REPLACEMENT: ${wrongReplace.length}`);
console.log(`  ANCHOR_STALE: ${anchorStale.length}`);
console.log(`  UNNECESSARY_CONTEXT_RESET: ${unnecessaryReset.length}`);

if (Object.keys(leakByType).length) {
  console.log("\n── Leaks by type ──\n");
  for (const [type, count] of Object.entries(leakByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log("\n── Failures (first 25) ──\n");
  for (const r of results.filter((x) => !x.ok).slice(0, 25)) {
    console.log(`  [${r.id}] "${r.query}" → ${r.leaks.map((l) => l.type).join(", ")}`);
  }
}

const byCategory = {};
for (const r of results) {
  if (!byCategory[r.category]) byCategory[r.category] = { total: 0, ok: 0 };
  byCategory[r.category].total++;
  if (r.ok) byCategory[r.category].ok++;
}
console.log("\n── Por categoria ──\n");
for (const cat of "ABCDEFGHIJKLMNOPQRST") {
  const b = byCategory[cat];
  if (b) console.log(`  ${cat}: ${b.ok}/${b.total} (${pct(b.ok, b.total)}%)`);
}

const verdict =
  anchorLoss.length === 0 &&
  wrongReplace.length === 0 &&
  anchorStale.length === 0 &&
  preserveOk === preserve.length &&
  recalibrateOk / recalibrate.length >= 0.95 &&
  (replaceOk + resetOk) / (replace.length + reset.length) >= 0.95
    ? "A) ANCHOR PRESERVATION ROBUST"
    : "B) ANCHOR PRESERVATION POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
