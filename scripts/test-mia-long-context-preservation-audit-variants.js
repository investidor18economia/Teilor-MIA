/**
 * PATCH 7.9Z.2 — Fase 2: Long Context Preservation Variants (Regra 18)
 *
 * Mesmas intenções, frases diferentes, perfis diversos.
 * AUDIT ONLY — sem alterações em produção.
 *
 * Usage: node scripts/test-mia-long-context-preservation-audit-variants.js
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

function conv(id, persona, name, category, turns) {
  return { id, persona, name, category, turns };
}

function lateProbes(extra = []) {
  return [
    t("ainda vale?", "CONFIDENCE_CHALLENGE", P),
    t("e autonomia?", "COMMERCIAL_SEARCH", P),
    t("tem outro caminho?", "ALTERNATIVE_EXPLORATION", P),
    t("qual seria sua escolha?", "CONFIDENCE_CHALLENGE", { ...P, a: ["COMMERCIAL_SEARCH"] }),
    t("to com receio", "ANTI_REGRET", P),
    t("galera curte?", "SOCIAL_VALIDATION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("segue nesse mesmo?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("fechou com ele", "DECISION_CONFIRMATION", P),
    ...extra,
  ];
}

function openPhase(category, budget, axis) {
  return [
    t(`preciso ${category} ate ${budget}`, "COMMERCIAL_SEARCH", { ...NS, setBudget: budget }),
    t("me indica", "COMMERCIAL_SEARCH", P),
    t(`e ${axis}?`, "COMMERCIAL_SEARCH", P),
    t("captei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("continua bancando esse?", "CONFIDENCE_CHALLENGE", P),
    t("mostre outro caminho", "ALTERNATIVE_EXPLORATION", P),
    t("nao quero fazer besteira", "ANTI_REGRET", P),
    t("quem usa fala bem?", "SOCIAL_VALIDATION", P),
    t("calma ai", "SOFT_DISAGREEMENT", P),
    t("detalha de novo", "COMPREHENSION", P),
    t("beleza entendi", "ACKNOWLEDGEMENT", P),
    t("show", "ACKNOWLEDGEMENT", P),
    t("prefiro gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: Math.round(budget * 0.9) }),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("crava mesmo?", "CONFIDENCE_CHALLENGE", P),
    t("nao me ganhou", "SOFT_DISAGREEMENT", P),
    t("explica simples", "COMPREHENSION", P),
    t("ok entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("pera ai", "SOFT_DISAGREEMENT", P),
    t("voce mantem?", "CONFIDENCE_CHALLENGE", P),
  ];
}

function closePhase() {
  return [
    t("quero comprar tranquilo", "ANTI_REGRET", P),
    t("parece ser o certo", "DECISION_CONFIRMATION", P),
    t("fechou vou levar", "DECISION_CONFIRMATION", P),
    t("demorou", "ACKNOWLEDGEMENT", P),
  ];
}

/** 12 conversas variantes — intenções equivalentes, vocabulário novo */
const CONVERSATIONS = [
  conv("LV01", "apressado", "Variante indeciso — celular", "celular", [
    ...openPhase("celular", 2300, "camera"),
    ...lateProbes([t("sei la", "SOFT_DISAGREEMENT", P)]),
    ...closePhase(),
  ]),
  conv("LV02", "detalhista", "Variante técnico — placa", "placa de video", [
    ...openPhase("placa de video", 3500, "desempenho"),
    t("e consumo?", "COMMERCIAL_SEARCH", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV03", "confuso", "Variante leigo — tv", "tv", [
    ...openPhase("tv", 2600, "tela"),
    t("me ajuda", "COMMERCIAL_SEARCH", P),
    t("qual melhor?", "COMMERCIAL_SEARCH", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV04", "tecnico", "Variante prioridade — ssd", "ssd", [
    ...openPhase("ssd", 550, "velocidade"),
    t("prioriza durabilidade", "CONSTRAINT_CHANGE", { ...P, axis: "durabilidade" }),
    t("baixei o orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 480 }),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV05", "leigo", "Variante AR — notebook", "notebook", [
    ...openPhase("notebook", 4200, "bateria"),
    t("nao quero gastar errado", "ANTI_REGRET", P),
    t("quero evitar problemas depois", "ANTI_REGRET", P),
    t("tenho receio", "ANTI_REGRET", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV06", "girias", "Variante SV — monitor", "monitor", [
    ...openPhase("monitor", 1400, "tela"),
    t("a galera curte?", "SOCIAL_VALIDATION", P),
    t("o povo recomenda?", "SOCIAL_VALIDATION", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV07", "curto", "Variante follow-ups — mouse", "mouse", [
    ...openPhase("mouse", 280, "precisao"),
    t("qual?", "COMMERCIAL_SEARCH", P),
    t("continua?", "CONFIDENCE_CHALLENGE", P),
    t("blz", "ACKNOWLEDGEMENT", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV08", "erros", "Variante typos — teclado", "teclado", [
    ...openPhase("teclado", 480, "conforto"),
    t("mostre alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV09", "incompleto", "Variante cross — cadeira", "cadeira", [
    ...openPhase("cadeira", 850, "conforto"),
    t("nao curti mas voce tem certeza?", "CONFIDENCE_CHALLENGE", { ...P, a: ["SOFT_DISAGREEMENT"] }),
    t("entendi mas to cabreiro", "ANTI_REGRET", { ...P, a: ["COMPREHENSION"] }),
    ...lateProbes([t("entao mantem nele?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] })]),
    ...closePhase(),
  ]),
  conv("LV10", "apressado", "Variante pc gamer", "pc gamer", [
    ...openPhase("pc gamer", 5200, "desempenho"),
    t("e upgrade?", "COMMERCIAL_SEARCH", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
  conv("LV11", "detalhista", "Variante tablet longo", "tablet", [
    ...openPhase("tablet", 1700, "tela"),
    t("prioriza bateria", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("agora ate 1500", "CONSTRAINT_CHANGE", { ...P, setBudget: 1500 }),
    ...lateProbes([t("segue recomendando esse?", "CONFIDENCE_CHALLENGE", P)]),
    ...closePhase(),
  ]),
  conv("LV12", "confuso", "Variante fone maratona", "fone", [
    ...openPhase("fone", 380, "conforto"),
    t("nao quero errar", "ANTI_REGRET", P),
    t("continua na mesma linha?", "CONFIDENCE_CHALLENGE", P),
    t("tem concorrente?", "ALTERNATIVE_EXPLORATION", P),
    ...lateProbes(),
    ...closePhase(),
  ]),
];

function evaluateLongContextTurn(turnIndex, turnSpec, trace, state, convState) {
  const base = evaluateTurn(turnIndex, turnSpec, trace, state, convState);
  const leaks = [...base.leaks];

  const contextOk =
    !leaks.some((l) => ["CONTEXT_RESET", "ANCHOR_LOSS", "CONSTRAINT_LOSS"].includes(l.type)) &&
    base.anchorOk &&
    base.constraintOk;

  const continuityOk =
    contextOk && !leaks.some((l) => l.type === "UNNECESSARY_NEW_SEARCH") && base.bridgeOk;

  let userPerception = base.userPerception;
  if (leaks.some((l) => ["ANCHOR_LOSS", "WINNER_LOSS", "UNNECESSARY_NEW_SEARCH", "RANDOM_PRODUCT_SWITCH"].includes(l.type))) {
    userPerception = "NÃO";
  } else if (leaks.length) userPerception = "PARCIAL";

  const fullStackOk =
    base.routerOk &&
    base.routingOk &&
    contextOk &&
    continuityOk &&
    userPerception === "SIM";

  return {
    ...base,
    leaks,
    contextOk,
    continuityOk,
    fullStackOk,
    userPerception,
    ok: leaks.length === 0,
  };
}

function runConversation(conv) {
  let state = { hasAnchor: false, winner: null, runnerUp: null, budgetMax: null, priorityAxis: null, deprioritized: [] };
  const convState = { establishedWinner: null, winnerDrift: false };
  const turnResults = [];

  for (let i = 0; i < conv.turns.length; i++) {
    const turnSpec = conv.turns[i];
    const trace = simulateTurn(turnSpec.msg, state);
    const result = evaluateLongContextTurn(i, turnSpec, trace, state, convState);
    turnResults.push(result);
    state = applyTurnToState(state, turnSpec, trace);
    if (state.hasAnchor && state.winner) convState.establishedWinner = state.winner;
  }

  const total = turnResults.length;
  return {
    ...conv,
    okTurns: turnResults.filter((r) => r.ok).length,
    total,
    contextAcc: turnResults.filter((r) => r.contextOk).length / total,
    winnerAcc: turnResults.filter((r) => r.winnerOk).length / total,
    anchorAcc: turnResults.filter((r) => r.anchorOk).length / total,
    constraintAcc: turnResults.filter((r) => r.constraintOk).length / total,
    continuityAcc: turnResults.filter((r) => r.continuityOk).length / total,
    fullStackAcc: turnResults.filter((r) => r.fullStackOk).length / total,
    perceptionSim: turnResults.filter((r) => r.userPerception === "SIM").length / total,
    convPerception: turnResults.every((r) => r.userPerception === "SIM" && r.winnerOk && r.anchorOk)
      ? "SIM"
      : turnResults.some((r) => r.userPerception === "NÃO")
        ? "NÃO"
        : "PARCIAL",
    leaks: turnResults.flatMap((r) => r.leaks.map((l) => ({ ...l, conv: conv.id, turn: r.turnIndex, msg: r.msg }))),
  };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

console.log("PATCH 7.9Z.2 — Fase 2: Long Context Variants (Regra 18) — AUDIT ONLY\n");

const results = CONVERSATIONS.map(runConversation);
const totalTurns = results.reduce((s, r) => s + r.total, 0);
const totalOk = results.reduce((s, r) => s + r.okTurns, 0);
const avg = (k) => results.reduce((s, r) => s + r[k], 0) / results.length;
const allLeaks = results.flatMap((r) => r.leaks);

console.log(`Conversas: ${results.length} | Turns: ${totalTurns}\n`);
console.log(`  Turns OK: ${totalOk}/${totalTurns} (${pct(totalOk, totalTurns)}%)`);
console.log(`  Context Preservation: ${pct(avg("contextAcc") * 100, 100)}%`);
console.log(`  Winner Preservation: ${pct(avg("winnerAcc") * 100, 100)}%`);
console.log(`  Anchor Preservation: ${pct(avg("anchorAcc") * 100, 100)}%`);
console.log(`  Constraint Preservation: ${pct(avg("constraintAcc") * 100, 100)}%`);
console.log(`  Continuity Preservation: ${pct(avg("continuityAcc") * 100, 100)}%`);
console.log(`  Full Stack: ${pct(avg("fullStackAcc") * 100, 100)}%`);
console.log(`  User Perception SIM: ${pct(avg("perceptionSim") * 100, 100)}%`);

console.log("\n── Por conversa ──\n");
for (const r of results) {
  console.log(`  [${r.id}/${r.persona}] ${r.name}: ${r.okTurns}/${r.total} | percepção=${r.convPerception}`);
}

if (allLeaks.length) {
  console.log("\n── Leaks (top 20) ──\n");
  for (const leak of allLeaks.slice(0, 20)) {
    console.log(`  [${leak.conv}/T${leak.turn}] ${leak.type}: ${leak.detail}`);
  }
}

const simConvs = results.filter((r) => r.convPerception === "SIM").length;
const verdict =
  totalOk / totalTurns >= 0.95 &&
  avg("contextAcc") >= 0.95 &&
  avg("winnerAcc") >= 0.95 &&
  simConvs === results.length
    ? "A) LONG CONTEXT VARIANTS ROBUST"
    : "B) LONG CONTEXT VARIANTS POSSUI GAP";

console.log(`\n── Veredito Fase 2 ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
