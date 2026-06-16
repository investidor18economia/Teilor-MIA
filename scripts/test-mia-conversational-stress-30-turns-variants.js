/**
 * PATCH 7.9Z.1A — Phase 2: semantic variant validation (Rule 18)
 *
 * Semantically equivalent conversations — different phrasing, user personas.
 * Does NOT repeat original 30+ turn phrases.
 *
 * Usage: node scripts/test-mia-conversational-stress-30-turns-variants.js
 */

import {
  simulateTurn,
  evaluateTurn,
  applyTurnToState,
} from "./test-mia-conversational-stress-15-turns.js";

function t(msg, family, opts = {}) {
  return { msg, family, ...opts };
}

const P = { preserveWinner: true };
const NS = { newSearch: true, setAnchor: true };

function conv(id, persona, name, turns) {
  return { id, persona, name, turns };
}

/**
 * 12 conversas variantes — clusters A–F + personas diversas.
 * Frases distintas do audit 7.9Z.1 original.
 */
const CONVERSATIONS = [
  conv("V01", "apressado", "AE imperativo curto — usuário apressado", [
    t("celular ate 2200", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2200 }),
    t("qual indica?", "COMMERCIAL_SEARCH", P),
    t("me mostre opcoes parecidas", "ALTERNATIVE_EXPLORATION", P),
    t("tem mais alternativas?", "ALTERNATIVE_EXPLORATION", P),
    t("mostre outro caminho", "ALTERNATIVE_EXPLORATION", P),
    t("quero explorar outras possibilidades", "ALTERNATIVE_EXPLORATION", P),
    t("tem concorrente?", "ALTERNATIVE_EXPLORATION", P),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("continua bancando esse?", "CONFIDENCE_CHALLENGE", P),
    t("fechou com ele", "DECISION_CONFIRMATION", P),
  ]),
  conv("V02", "leigo", "SD pausa coloquial — usuário leigo", [
    t("quero um notebook barato", "COMMERCIAL_SEARCH", { ...NS, setBudget: 3500 }),
    t("me recomenda um", "COMMERCIAL_SEARCH", P),
    t("espera um pouco", "SOFT_DISAGREEMENT", P),
    t("calma la", "SOFT_DISAGREEMENT", P),
    t("pera ai deixa eu pensar", "SOFT_DISAGREEMENT", P),
    t("nao to convencido ainda", "SOFT_DISAGREEMENT", P),
    t("explica simples", "COMPREHENSION", P),
    t("to com receio", "ANTI_REGRET", P),
    t("quero comprar tranquilo", "ANTI_REGRET", P),
    t("nao quero gastar errado", "ANTI_REGRET", P),
    t("voce mantem essa?", "CONFIDENCE_CHALLENGE", P),
    t("parece ser o certo", "DECISION_CONFIRMATION", P),
  ]),
  conv("V03", "tecnico", "DC composto — usuário técnico", [
    t("busco monitor gamer ate 1500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 1500 }),
    t("qual voce escolheria?", "COMMERCIAL_SEARCH", P),
    t("e latencia?", "COMMERCIAL_SEARCH", P),
    t("vou levar esse entao", "DECISION_CONFIRMATION", P),
    t("fechou com esse", "DECISION_CONFIRMATION", P),
    t("parece ser o certo", "DECISION_CONFIRMATION", P),
    t("nao, calma ai", "SOFT_DISAGREEMENT", P),
    t("continua na mesma recomendacao?", "CONFIDENCE_CHALLENGE", P),
    t("segue recomendando esse?", "CONFIDENCE_CHALLENGE", P),
    t("ainda banca esse?", "CONFIDENCE_CHALLENGE", P),
    t("fechou vou levar", "DECISION_CONFIRMATION", P),
  ]),
  conv("V04", "indeciso", "CC follow-up — usuário indeciso", [
    t("smartphone ate 1800", "COMMERCIAL_SEARCH", { ...NS, setBudget: 1800 }),
    t("qual vale?", "COMMERCIAL_SEARCH", P),
    t("e bateria?", "COMMERCIAL_SEARCH", P),
    t("continua na mesma linha?", "CONFIDENCE_CHALLENGE", P),
    t("ainda e essa a melhor?", "CONFIDENCE_CHALLENGE", P),
    t("voce seguiria nesse?", "CONFIDENCE_CHALLENGE", P),
    t("nao quero fazer besteira", "ANTI_REGRET", P),
    t("quero evitar problemas depois", "ANTI_REGRET", P),
    t("tem outro caminho?", "ALTERNATIVE_EXPLORATION", P),
    t("qual seria meu plano b?", "SECOND_BEST_DISCOVERY", P),
    t("e se eu nao pegar esse?", "ALTERNATIVE_EXPLORATION", P),
    t("continua indicando esse?", "CONFIDENCE_CHALLENGE", P),
    t("entao mantem nele?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
  ]),
  conv("V05", "conversador", "AR genérico — usuário conversador", [
    t("oi quero tv ate 2800", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2800 }),
    t("me ajuda ai", "COMMERCIAL_SEARCH", P),
    t("fala mia, to com receio", "ANTI_REGRET", P),
    t("quero evitar dor de cabeca", "ANTI_REGRET", P),
    t("nao quero me frustrar depois", "ANTI_REGRET", P),
    t("quero comprar sossegado", "ANTI_REGRET", P),
    t("a galera curte?", "SOCIAL_VALIDATION", P),
    t("voce crava nele?", "CONFIDENCE_CHALLENGE", P),
    t("mostre possibilidades parecidas", "ALTERNATIVE_EXPLORATION", P),
    t("tem mais opcoes?", "ALTERNATIVE_EXPLORATION", P),
    t("beleza entendi", "ACKNOWLEDGEMENT", P),
    t("fechou nele mesmo", "DECISION_CONFIRMATION", P),
  ]),
  conv("V06", "erros", "AE + typos — usuário que escreve errado", [
    t("qro celular ate 2000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2000 }),
    t("qual recomenda", "COMMERCIAL_SEARCH", P),
    t("mostre alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("tem outras opcoes", "ALTERNATIVE_EXPLORATION", P),
    t("quero ver opcoes diferentes", "ALTERNATIVE_EXPLORATION", P),
    t("pera ai", "SOFT_DISAGREEMENT", P),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    t("nao quero errar", "ANTI_REGRET", P),
    t("continua nesse mesmo", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("parece ser esse", "DECISION_CONFIRMATION", P),
  ]),
  conv("V07", "curto", "Mensagens curtas — cluster mix", [
    t("fone ate 500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 500 }),
    t("qual?", "COMMERCIAL_SEARCH", P),
    t("mostre outro", "ALTERNATIVE_EXPLORATION", P),
    t("calma ai", "SOFT_DISAGREEMENT", P),
    t("fechou nele", "DECISION_CONFIRMATION", P),
    t("nao quero errar", "ANTI_REGRET", P),
    t("continua?", "CONFIDENCE_CHALLENGE", P),
    t("fechou vou pegar", "DECISION_CONFIRMATION", P),
  ]),
  conv("V08", "tecnico-longo", "AE verbo+objeto denso", [
    t("preciso tablet ate 1200", "COMMERCIAL_SEARCH", { ...NS, setBudget: 1200 }),
    t("me indica o melhor", "COMMERCIAL_SEARCH", P),
    t("quero ver outras opcoes", "ALTERNATIVE_EXPLORATION", P),
    t("da pra ver mais caminhos", "ALTERNATIVE_EXPLORATION", P),
    t("tem mais possibilidades", "ALTERNATIVE_EXPLORATION", P),
    t("quero olhar alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("nao quero decidir sem ver outras opcoes", "ALTERNATIVE_EXPLORATION", P),
    t("voce tem certeza disso?", "CONFIDENCE_CHALLENGE", P),
    t("continua recomendando esse", "CONFIDENCE_CHALLENGE", P),
    t("to cabreiro", "ANTI_REGRET", { ...P, a: ["SOFT_DISAGREEMENT"] }),
    t("quero ficar tranquilo", "ANTI_REGRET", P),
    t("vou nesse", "DECISION_CONFIRMATION", P),
  ]),
  conv("V09", "oscilante", "SD + DC + CC alternado", [
    t("mouse gamer ate 300", "COMMERCIAL_SEARCH", { ...NS, setBudget: 300 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    t("nao me ganhou", "SOFT_DISAGREEMENT", P),
    t("continua achando melhor?", "CONFIDENCE_CHALLENGE", P),
    t("parece ser esse", "DECISION_CONFIRMATION", P),
    t("nao, pera", "SOFT_DISAGREEMENT", P),
    t("fechou vou pegar", "DECISION_CONFIRMATION", P),
    t("continua nesse mesmo", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("entao mantem esse", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("ok", "ACKNOWLEDGEMENT", P),
  ]),
  conv("V10", "AR-denso", "Anti-regret variantes coloquiais", [
    t("notebook ate 4500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 4500 }),
    t("qual voce iria?", "CONFIDENCE_CHALLENGE", { ...P, a: ["COMMERCIAL_SEARCH"] }),
    t("to com receio", "ANTI_REGRET", P),
    t("nao quero fazer besteira", "ANTI_REGRET", P),
    t("quero evitar dor de cabeca", "ANTI_REGRET", P),
    t("nao quero gastar errado", "ANTI_REGRET", P),
    t("quero comprar tranquilo", "ANTI_REGRET", P),
    t("sera que vou me arrepender?", "ANTI_REGRET", P),
    t("da pra ficar sossegado?", "ANTI_REGRET", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("mostre outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
  ]),
  conv("V11", "cross", "Cross-cluster variantes naturais", [
    t("cadeira gamer ate 900", "COMMERCIAL_SEARCH", { ...NS, setBudget: 900 }),
    t("me recomenda", "COMMERCIAL_SEARCH", P),
    t("tem outro caminho?", "ALTERNATIVE_EXPLORATION", P),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("calma ai", "SOFT_DISAGREEMENT", P),
    t("nao quero errar", "ANTI_REGRET", P),
    t("continua recomendando esse?", "CONFIDENCE_CHALLENGE", P),
    t("parece ser esse", "DECISION_CONFIRMATION", P),
    t("fechou nele", "DECISION_CONFIRMATION", P),
    t("entao mantem esse?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
  ]),
  conv("V12", "maratona", "Maratona variantes 20 turnos", [
    t("quero teclado mecanico ate 400", "COMMERCIAL_SEARCH", { ...NS, setBudget: 400 }),
    t("qual indica?", "COMMERCIAL_SEARCH", P),
    t("mostre alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("tem outras opcoes", "ALTERNATIVE_EXPLORATION", P),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    t("pera ai", "SOFT_DISAGREEMENT", P),
    t("nao quero errar", "ANTI_REGRET", P),
    t("nao quero dor de cabeca", "ANTI_REGRET", P),
    t("continua nesse mesmo?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("continua recomendando esse?", "CONFIDENCE_CHALLENGE", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("mostre outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("fechou vou pegar", "DECISION_CONFIRMATION", P),
    t("nao, calma ai", "SOFT_DISAGREEMENT", P),
    t("parece ser esse", "DECISION_CONFIRMATION", P),
    t("fechou nele", "DECISION_CONFIRMATION", P),
    t("entao mantem esse?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("quero comprar tranquilo", "ANTI_REGRET", P),
    t("vou nele", "DECISION_CONFIRMATION", P),
    t("fechado", "ACKNOWLEDGEMENT", P),
  ]),
];

function evaluateTurnExtended(turnIndex, turnSpec, trace, state, convState) {
  const base = evaluateTurn(turnIndex, turnSpec, trace, state, convState);
  const leaks = [...base.leaks];
  const tNum = turnIndex + 1;

  if (!base.routerOk && base.routingOk) {
    leaks.push({ type: "ROUTER_LEAK", detail: `T${tNum} router miss routing pass` });
  }
  if (base.routerOk && !base.routingOk) {
    leaks.push({ type: "ROUTING_LEAK", detail: `T${tNum} router ok routing fail` });
  }
  if (!base.pathOk && !leaks.some((l) => l.type === "INTENT_DRIFT")) {
    leaks.push({ type: "RESPONSE_PATH_LEAK", detail: `T${tNum} path=${trace.responsePathFinal}` });
  }

  const contextOk =
    !leaks.some((l) => ["CONTEXT_RESET", "ANCHOR_LOSS", "CONSTRAINT_LOSS"].includes(l.type)) &&
    base.anchorOk &&
    base.constraintOk;

  const continuityOk =
    contextOk && !leaks.some((l) => l.type === "UNNECESSARY_NEW_SEARCH") && base.bridgeOk;

  let contractOk = base.routingOk && base.pathOk;
  if (turnSpec.newSearch) {
    // T1 cold-start: shouldPreserveAnchor=false é esperado ao abrir busca comercial
    contractOk =
      contractOk &&
      (trace.routing.openedNewSearch ||
        trace.responsePathFinal === "default_product_search" ||
        trace.cognitiveTurn?.turnType === "NEW_SEARCH");
  } else {
    contractOk = contractOk && trace.routing.shouldPreserveAnchor !== false;
    if (turnSpec.preserveWinner && trace.routing.mode === "new_search") contractOk = false;
  }

  let responseBuilderOk = base.pathOk && !trace.genericFallback;
  if (turnSpec.newSearch) responseBuilderOk = trace.responsePathFinal === "default_product_search";

  let userPerception = base.userPerception;
  if (leaks.some((l) => ["ANCHOR_LOSS", "WINNER_LOSS", "UNNECESSARY_NEW_SEARCH"].includes(l.type))) {
    userPerception = "NÃO";
  } else if (leaks.length) {
    userPerception = "PARCIAL";
  }

  const fullStackOk =
    base.routerOk &&
    base.routingOk &&
    contractOk &&
    responseBuilderOk &&
    continuityOk &&
    userPerception === "SIM";

  return {
    ...base,
    leaks,
    contextOk,
    continuityOk,
    contractOk,
    responseBuilderOk,
    fullStackOk,
    userPerception,
    ok: leaks.length === 0,
  };
}

function runConversation(conv) {
  let state = {
    hasAnchor: false,
    winner: null,
    runnerUp: null,
    budgetMax: null,
    priorityAxis: null,
    deprioritized: [],
  };
  const convState = { establishedWinner: null, winnerDrift: false };
  const turnResults = [];

  for (let i = 0; i < conv.turns.length; i++) {
    const turnSpec = conv.turns[i];
    const trace = simulateTurn(turnSpec.msg, state);
    const result = evaluateTurnExtended(i, turnSpec, trace, state, convState);
    turnResults.push(result);
    state = applyTurnToState(state, turnSpec, trace);
    if (state.hasAnchor && state.winner) convState.establishedWinner = state.winner;
  }

  const total = turnResults.length;
  const okTurns = turnResults.filter((r) => r.ok).length;
  const routerAcc = turnResults.filter((r) => r.routerOk).length / total;
  const routingAcc = turnResults.filter((r) => r.routingOk).length / total;
  const pathAcc = turnResults.filter((r) => r.pathOk).length / total;
  const anchorAcc = turnResults.filter((r) => r.anchorOk).length / total;
  const winnerAcc = turnResults.filter((r) => r.winnerOk).length / total;
  const constraintAcc = turnResults.filter((r) => r.constraintOk).length / total;
  const fullStackAcc = turnResults.filter((r) => r.fullStackOk).length / total;
  const perceptionSim = turnResults.filter((r) => r.userPerception === "SIM").length / total;

  let convPerception = "SIM";
  if (turnResults.some((r) => r.userPerception === "NÃO")) convPerception = "NÃO";
  else if (okTurns < total) convPerception = "PARCIAL";

  return {
    ...conv,
    turnResults,
    okTurns,
    total,
    passRate: okTurns / total,
    routerAcc,
    routingAcc,
    pathAcc,
    anchorAcc,
    winnerAcc,
    constraintAcc,
    fullStackAcc,
    perceptionSim,
    convPerception,
    leaks: turnResults.flatMap((r) =>
      r.leaks.map((l) => ({ ...l, conv: conv.id, turn: r.turnIndex, msg: r.msg }))
    ),
  };
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

console.log("PATCH 7.9Z.1A — Phase 2: Semantic Variant Validation (Rule 18)\n");

const results = CONVERSATIONS.map(runConversation);
const totalTurns = results.reduce((s, r) => s + r.total, 0);
const totalOk = results.reduce((s, r) => s + r.okTurns, 0);
const allLeaks = results.flatMap((r) => r.leaks);
const avg = (key) => results.reduce((s, r) => s + r[key], 0) / results.length;

console.log(`Conversas: ${results.length} | Turns: ${totalTurns}\n`);
console.log("── Variant Pass Rate ──\n");
console.log(`  Turns OK: ${totalOk}/${totalTurns} (${pct(totalOk, totalTurns)}%)`);
console.log(`  Router: ${pct(avg("routerAcc") * 100, 100)}%`);
console.log(`  Routing: ${pct(avg("routingAcc") * 100, 100)}%`);
console.log(`  Response Path: ${pct(avg("pathAcc") * 100, 100)}%`);
console.log(`  Winner Preservation: ${pct(avg("winnerAcc") * 100, 100)}%`);
console.log(`  Anchor Preservation: ${pct(avg("anchorAcc") * 100, 100)}%`);
console.log(`  Constraint Preservation: ${pct(avg("constraintAcc") * 100, 100)}%`);
console.log(`  Full Stack: ${pct(avg("fullStackAcc") * 100, 100)}%`);
console.log(`  User Perception SIM: ${pct(avg("perceptionSim") * 100, 100)}%`);

console.log("\n── Por conversa ──\n");
for (const r of results) {
  console.log(
    `  [${r.id}/${r.persona}] ${r.name}: ${r.okTurns}/${r.total} (${pct(r.okTurns, r.total)}%) | percepção=${r.convPerception}`
  );
}

if (allLeaks.length) {
  console.log("\n── Leaks ──\n");
  for (const leak of allLeaks) {
    console.log(`  [${leak.conv}/T${leak.turn}] ${leak.type}: ${leak.detail} | "${leak.msg}"`);
  }
}

const simConvs = results.filter((r) => r.convPerception === "SIM").length;
const passRate = totalOk / totalTurns;
const verdict =
  passRate >= 0.98 && avg("fullStackAcc") >= 0.95 && simConvs === results.length
    ? "A) VARIANT SUITE ROBUST"
    : "B) VARIANT SUITE POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
