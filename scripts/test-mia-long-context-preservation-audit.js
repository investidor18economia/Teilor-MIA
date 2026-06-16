/**
 * PATCH 7.9Z.2 — Long Context Preservation Audit (AUDIT ONLY)
 *
 * Validates accumulated context across 20 long conversations (30–40 turns).
 * Focus: winner, anchor, constraints, continuity, late-turn families — Regra 17.
 *
 * Usage: node scripts/test-mia-long-context-preservation-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  simulateTurn,
  evaluateTurn,
  applyTurnToState,
} from "./test-mia-conversational-stress-15-turns.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function t(msg, family, opts = {}) {
  return { msg, family, ...opts };
}

const P = { preserveWinner: true };
const NS = { newSearch: true, setAnchor: true };

function conv(id, type, name, category, turns) {
  return { id, type, name, category, turns };
}

/** Shared late-context probes (turn 20+) — intenção, não frase fixa */
function lateContextProbes(extra = []) {
  return [
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("e bateria?", "COMMERCIAL_SEARCH", P),
    t("mostra outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("qual voce escolheria?", "CONFIDENCE_CHALLENGE", { ...P, a: ["COMMERCIAL_SEARCH"] }),
    t("nao quero errar", "ANTI_REGRET", P),
    t("o pessoal fala bem?", "SOCIAL_VALIDATION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("continua nesse mesmo?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("fechou nele", "DECISION_CONFIRMATION", P),
    ...extra,
  ];
}

function baseEstablish(category, budget, axis = "desempenho") {
  return [
    t(`quero ${category} ate ${budget}`, "COMMERCIAL_SEARCH", { ...NS, setBudget: budget }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t(`e ${axis}?`, "COMMERCIAL_SEARCH", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("mostra alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("o povo fala bem?", "SOCIAL_VALIDATION", P),
    t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: Math.round(budget * 0.88) }),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("nao curti muito", "SOFT_DISAGREEMENT", P),
    t("detalha melhor", "COMPREHENSION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
  ];
}

function closeConv() {
  return [
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece ser esse", "DECISION_CONFIRMATION", P),
    t("fechou vou pegar", "DECISION_CONFIRMATION", P),
    t("valeu", "ACKNOWLEDGEMENT", P),
  ];
}

/** 20 conversas × 34 turnos = 680 turns (meta 700+) */
const CONVERSATIONS = [
  // ── Tipo A: indeciso (3) ──
  conv("LC01", "A", "Indeciso — smartphone longo", "smartphone", [
    ...baseEstablish("smartphone", 2500, "bateria"),
    ...lateContextProbes([t("nao sei", "SOFT_DISAGREEMENT", P), t("pera ai", "SOFT_DISAGREEMENT", P)]),
    ...closeConv(),
  ]),
  conv("LC02", "A", "Indeciso — notebook oscilante", "notebook", [
    ...baseEstablish("notebook", 4500, "desempenho"),
    ...lateContextProbes([t("hm nao sei", "SOFT_DISAGREEMENT", P), t("nao, espera", "SOFT_DISAGREEMENT", P)]),
    ...closeConv(),
  ]),
  conv("LC03", "A", "Indeciso — monitor hesitante", "monitor gamer", [
    ...baseEstablish("monitor gamer", 1800, "tela"),
    ...lateContextProbes([t("to meio assim", "SOFT_DISAGREEMENT", P)]),
    ...closeConv(),
  ]),

  // ── Tipo B: técnico (3) ──
  conv("LC04", "B", "Técnico — placa de video", "placa de video", [
    ...baseEstablish("placa de video", 3200, "desempenho"),
    t("e latencia?", "COMMERCIAL_SEARCH", P),
    t("qual o custo beneficio?", "COMMERCIAL_SEARCH", P),
    ...lateContextProbes([t("voce manteria?", "CONFIDENCE_CHALLENGE", P)]),
    ...closeConv(),
  ]),
  conv("LC05", "B", "Técnico — ssd nvme", "ssd nvme", [
    ...baseEstablish("ssd nvme", 600, "velocidade"),
    t("e durabilidade?", "COMMERCIAL_SEARCH", P),
    ...lateContextProbes([t("continua achando melhor?", "CONFIDENCE_CHALLENGE", P)]),
    ...closeConv(),
  ]),
  conv("LC06", "B", "Técnico — pc gamer", "pc gamer", [
    ...baseEstablish("pc gamer", 5500, "desempenho"),
    t("e upgrade futuro?", "COMMERCIAL_SEARCH", P),
    ...lateContextProbes([t("voce crava isso?", "CONFIDENCE_CHALLENGE", P)]),
    ...closeConv(),
  ]),

  // ── Tipo C: leigo (2) ──
  conv("LC07", "C", "Leigo — tv simples", "tv", [
    ...baseEstablish("tv", 2800, "tela"),
    t("me ajuda ai", "COMMERCIAL_SEARCH", P),
    t("qual?", "COMMERCIAL_SEARCH", P),
    ...lateContextProbes([t("nao entendi direito", "COMPREHENSION", P)]),
    ...closeConv(),
  ]),
  conv("LC08", "C", "Leigo — cadeira gamer", "cadeira gamer", [
    ...baseEstablish("cadeira gamer", 1200, "conforto"),
    t("me indica o melhor", "COMMERCIAL_SEARCH", P),
    ...lateContextProbes([t("explica simples", "COMPREHENSION", P)]),
    ...closeConv(),
  ]),

  // ── Tipo D: mudanças de prioridade (3) ──
  conv("LC09", "D", "Prioridade — mouse recalibração", "mouse gamer", [
    ...baseEstablish("mouse gamer", 350, "precisao"),
    t("prioriza bateria", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("agora ate 300", "CONSTRAINT_CHANGE", { ...P, setBudget: 300 }),
    t("e se camera importar mais?", "CONSTRAINT_CHANGE", { ...P, axis: "camera" }),
    t("pensei melhor no orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 280 }),
    ...lateContextProbes(),
    ...closeConv(),
  ]),
  conv("LC10", "D", "Prioridade — teclado eixos", "teclado mecanico", [
    ...baseEstablish("teclado mecanico", 500, "conforto"),
    t("prioriza silencio", "CONSTRAINT_CHANGE", { ...P, axis: "silencio" }),
    t("preciso baixar mais", "CONSTRAINT_CHANGE", { ...P, setBudget: 420 }),
    t("camera importa menos", "CONSTRAINT_CHANGE", { ...P, deprioritize: true, axis: "camera" }),
    ...lateContextProbes(),
    ...closeConv(),
  ]),
  conv("LC11", "D", "Prioridade — celular multi-eixo", "celular", [
    ...baseEstablish("celular", 2200, "camera"),
    t("prioriza bateria", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("agora ate 1900", "CONSTRAINT_CHANGE", { ...P, setBudget: 1900 }),
    t("desempenho pesa mais", "CONSTRAINT_CHANGE", { ...P, axis: "desempenho" }),
    ...lateContextProbes(),
    ...closeConv(),
  ]),

  // ── Tipo E: anti-regret denso (2) ──
  conv("LC12", "E", "Anti-regret — notebook medo", "notebook", [
    ...baseEstablish("notebook", 4000, "durabilidade"),
    t("nao quero errar", "ANTI_REGRET", P),
    t("nao quero dor de cabeca", "ANTI_REGRET", P),
    t("quero comprar tranquilo", "ANTI_REGRET", P),
    t("tenho medo de escolher errado", "ANTI_REGRET", P),
    t("da pra ficar sossegado?", "ANTI_REGRET", P),
    ...lateContextProbes([t("voce sustenta ou eu erro?", "CONFIDENCE_CHALLENGE", { ...P, a: ["ANTI_REGRET"] })]),
    ...closeConv(),
  ]),
  conv("LC13", "E", "Anti-regret — smartphone receio", "smartphone", [
    ...baseEstablish("smartphone", 2000, "bateria"),
    t("nao quero fazer besteira", "ANTI_REGRET", P),
    t("quero evitar dor de cabeca", "ANTI_REGRET", P),
    t("sera que vou me arrepender?", "ANTI_REGRET", P),
    t("to com receio", "ANTI_REGRET", P),
    ...lateContextProbes(),
    ...closeConv(),
  ]),

  // ── Tipo F: social validation denso (2) ──
  conv("LC14", "F", "Social — monitor prova coletiva", "monitor", [
    ...baseEstablish("monitor", 1500, "tela"),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("quem comprou gostou?", "SOCIAL_VALIDATION", P),
    t("o povo fala bem ou da problema?", "SOCIAL_VALIDATION", P),
    t("sera que muita gente se arrepende?", "SOCIAL_VALIDATION", P),
    ...lateContextProbes(),
    ...closeConv(),
  ]),
  conv("LC15", "F", "Social — tv validação", "tv", [
    ...baseEstablish("tv", 3200, "tela"),
    t("muita gente usa?", "SOCIAL_VALIDATION", P),
    t("o pessoal reclama?", "SOCIAL_VALIDATION", P),
    t("costuma recomendar?", "SOCIAL_VALIDATION", P),
    ...lateContextProbes(),
    ...closeConv(),
  ]),

  // ── Tipo G: follow-ups curtos (2) ──
  conv("LC16", "G", "Follow-ups curtos — fone", "fone de ouvido", [
    ...baseEstablish("fone de ouvido", 400, "conforto"),
    t("qual?", "COMMERCIAL_SEARCH", P),
    t("e bateria?", "COMMERCIAL_SEARCH", P),
    t("continua?", "CONFIDENCE_CHALLENGE", P),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("show", "ACKNOWLEDGEMENT", P),
    t("entao mantem esse?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    ...lateContextProbes([t("recomenda?", "COMMERCIAL_SEARCH", P)]),
    ...closeConv(),
  ]),
  conv("LC17", "G", "Follow-ups curtos — tablet", "tablet", [
    ...baseEstablish("tablet", 1800, "tela"),
    t("qual vale?", "COMMERCIAL_SEARCH", P),
    t("e preco?", "COMMERCIAL_SEARCH", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("ok", "ACKNOWLEDGEMENT", P),
    t("ta", "ACKNOWLEDGEMENT", P),
    ...lateContextProbes(),
    ...closeConv(),
  ]),

  // ── Tipo H: cross-family colisões (3) ──
  conv("LC18", "H", "Cross-family — mouse denso", "mouse", [
    ...baseEstablish("mouse", 250, "precisao"),
    t("nao me convenceu, voce tem certeza?", "CONFIDENCE_CHALLENGE", { ...P, a: ["SOFT_DISAGREEMENT"] }),
    t("gostei mas tenho medo de errar", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT", "DECISION_CONFIRMATION"] }),
    t("entendi mas nao to 100 por cento", "SOFT_DISAGREEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("faz sentido mas fiquei na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["COMPREHENSION"] }),
    ...lateContextProbes([t("nao, calma ai", "SOFT_DISAGREEMENT", P)]),
    ...closeConv(),
  ]),
  conv("LC19", "H", "Cross-family — teclado composto", "teclado", [
    ...baseEstablish("teclado", 450, "conforto"),
    t("parece bom mas nao quero errar", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT", "DECISION_CONFIRMATION"] }),
    t("blz mas o povo fala bem?", "SOCIAL_VALIDATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("fechou mas espera ai", "SOFT_DISAGREEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    ...lateContextProbes([t("segue recomendando esse?", "CONFIDENCE_CHALLENGE", P)]),
    ...closeConv(),
  ]),
  conv("LC20", "H", "Cross-family — cadeira maratona", "cadeira", [
    ...baseEstablish("cadeira", 900, "conforto"),
    t("nao curti mas continua valendo?", "CONFIDENCE_CHALLENGE", { ...P, a: ["SOFT_DISAGREEMENT"] }),
    t("entendi mas tenho receio", "ANTI_REGRET", { ...P, a: ["COMPREHENSION"] }),
    t("show mas tem outro caminho?", "ALTERNATIVE_EXPLORATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("ok mas voce sustenta?", "CONFIDENCE_CHALLENGE", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    ...lateContextProbes([t("entao mantem nele?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] })]),
    ...closeConv(),
  ]),
];

function evaluateLongContextTurn(turnIndex, turnSpec, trace, state, convState) {
  const base = evaluateTurn(turnIndex, turnSpec, trace, state, convState);
  const leaks = [...base.leaks];
  const tNum = turnIndex + 1;
  const isLate = turnIndex >= 19;

  const contextOk =
    !leaks.some((l) => ["CONTEXT_RESET", "ANCHOR_LOSS", "CONSTRAINT_LOSS", "CONTEXT_LOSS"].includes(l.type)) &&
    base.anchorOk &&
    base.constraintOk;

  if (!contextOk && !leaks.some((l) => ["ANCHOR_LOSS", "CONSTRAINT_LOSS", "CONTEXT_RESET"].includes(l.type))) {
    leaks.push({ type: "CONTEXT_LOSS", detail: `T${tNum} accumulated context degraded` });
  }

  const continuityOk =
    contextOk && !leaks.some((l) => l.type === "UNNECESSARY_NEW_SEARCH") && base.bridgeOk;

  if (isLate && !base.routerOk && turnSpec.preserveWinner) {
    if (!leaks.some((l) => l.type === "FAMILY_LOSS")) {
      leaks.push({
        type: "FAMILY_LOSS",
        detail: `T${tNum} late-turn family loss expect=${turnSpec.family} got=${trace.actualFamily}`,
      });
    }
  }

  let contractOk = base.routingOk && base.pathOk && trace.routing.shouldPreserveAnchor !== false;
  if (turnSpec.preserveWinner && trace.routing.mode === "new_search") contractOk = false;

  let responseBuilderOk = base.pathOk && !trace.genericFallback;
  if (turnSpec.newSearch) {
    responseBuilderOk =
      trace.responsePathFinal === "default_product_search" ||
      trace.cognitiveTurn.turnType === "NEW_SEARCH";
  }

  let userPerception = base.userPerception;
  if (
    leaks.some((l) =>
      ["ANCHOR_LOSS", "WINNER_LOSS", "UNNECESSARY_NEW_SEARCH", "CONTEXT_LOSS", "RANDOM_PRODUCT_SWITCH"].includes(l.type)
    )
  ) {
    userPerception = "NÃO";
  } else if (leaks.length) {
    userPerception = "PARCIAL";
  }

  if (turnSpec.preserveWinner && userPerception !== "SIM") {
    leaks.push({ type: "USER_PERCEPTION_LEAK", detail: `T${tNum} perception=${userPerception}` });
  }

  const fullStackOk =
    base.routerOk &&
    base.routingOk &&
    contractOk &&
    responseBuilderOk &&
    continuityOk &&
    contextOk &&
    userPerception === "SIM";

  return {
    ...base,
    leaks,
    isLate,
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
  const convState = { establishedWinner: null, winnerDrift: false, initialBudget: null, initialCategory: conv.category };
  const turnResults = [];

  for (let i = 0; i < conv.turns.length; i++) {
    const turnSpec = conv.turns[i];
    const trace = simulateTurn(turnSpec.msg, state);
    const result = evaluateLongContextTurn(i, turnSpec, trace, state, convState);
    turnResults.push(result);
    state = applyTurnToState(state, turnSpec, trace);
    if (state.hasAnchor && state.winner) convState.establishedWinner = state.winner;
    if (turnSpec.setBudget != null && convState.initialBudget == null) convState.initialBudget = turnSpec.setBudget;
  }

  const total = turnResults.length;
  const lateTurns = turnResults.filter((r) => r.isLate);
  const metrics = (key) => turnResults.filter((r) => r[key]).length / total;
  const lateMetrics = (key) => (lateTurns.length ? lateTurns.filter((r) => r[key]).length / lateTurns.length : 1);

  const allLeaks = turnResults.flatMap((r) =>
    r.leaks.map((l) => ({ ...l, conv: conv.id, turn: r.turnIndex, msg: r.msg, typeConv: conv.type }))
  );

  let convPerception = "SIM";
  if (turnResults.some((r) => r.userPerception === "NÃO") || !turnResults.every((r) => r.winnerOk && r.anchorOk)) {
    convPerception = "NÃO";
  } else if (turnResults.some((r) => r.userPerception === "PARCIAL") || turnResults.some((r) => !r.ok)) {
    convPerception = "PARCIAL";
  }

  return {
    ...conv,
    turnResults,
    okTurns: turnResults.filter((r) => r.ok).length,
    total,
    passRate: turnResults.filter((r) => r.ok).length / total,
    contextAcc: metrics("contextOk"),
    winnerAcc: metrics("winnerOk"),
    anchorAcc: metrics("anchorOk"),
    constraintAcc: metrics("constraintOk"),
    continuityAcc: metrics("continuityOk"),
    fullStackAcc: metrics("fullStackOk"),
    perceptionSim: turnResults.filter((r) => r.userPerception === "SIM").length / total,
    lateFamilyAcc: lateMetrics("routerOk"),
    lateContextAcc: lateMetrics("contextOk"),
    convPerception,
    leaks: allLeaks,
    winnerPreservedEnd: !convState.establishedWinner || state.winner === convState.establishedWinner,
    budgetPreserved: !convState.initialBudget || state.budgetMax != null,
  };
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function analyzeRootCause(leaks) {
  const clusters = new Map();
  for (const leak of leaks) {
    const key = leak.type;
    if (!clusters.has(key)) clusters.set(key, { count: 0, examples: [], layers: new Set(), families: new Set() });
    const c = clusters.get(key);
    c.count++;
    if (c.examples.length < 4) c.examples.push(`[${leak.conv}/T${leak.turn}] "${leak.msg}"`);
    if (["ANCHOR_LOSS", "WINNER_LOSS", "CONTEXT_RESET", "UNNECESSARY_NEW_SEARCH", "CONSTRAINT_LOSS"].includes(leak.type)) {
      c.layers.add("Routing Contract");
    }
    if (["FAMILY_LOSS", "INTENT_DRIFT"].includes(leak.type)) c.layers.add("Cognitive Router");
    if (["DECISION_DRIFT", "ROUTING_LEAK"].includes(leak.type)) c.layers.add("Bridge / Routing Safety");
    if (["USER_PERCEPTION_LEAK", "CONTEXT_LOSS"].includes(leak.type)) c.layers.add("Full Stack / Percepção");
    if (["RANDOM_PRODUCT_SWITCH"].includes(leak.type)) c.layers.add("Winner / Ranking");
  }
  return clusters;
}

function recommendPatch(clusters) {
  const recs = [];
  if (clusters.get("UNNECESSARY_NEW_SEARCH")?.count) {
    recs.push("7.9Z.2A — Routing Safety: reforçar holds de follow-up ancorado curto pós turno 20+");
  }
  if (clusters.get("FAMILY_LOSS")?.count) {
    recs.push("7.9Z.2B — Router: validar famílias em turnos tardios (CC/AE/AR/SV/SD) sem drift para COMMERCIAL_SEARCH");
  }
  if (clusters.get("CONSTRAINT_LOSS")?.count) {
    recs.push("7.9Z.2C — Session context: propagar budget/axis após recalibrações múltiplas");
  }
  if (clusters.get("WINNER_LOSS") || clusters.get("RANDOM_PRODUCT_SWITCH")) {
    recs.push("7.9Z.2D — Routing Contract: bloquear allowReplaceWinner em turnos de continuidade");
  }
  if (!recs.length) recs.push("(nenhum patch recomendado — suite limpa)");
  return recs;
}

function runRegressions() {
  const scripts = [
    "test-mia-conversational-stress-30-turns.js",
    "test-mia-conversational-stress-15-turns.js",
    "test-mia-conversational-continuity-fix.js",
  ];
  return scripts.map((s) => {
    const p = join(ROOT, "scripts", s);
    const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
    return { script: s, exit: r.status ?? 1 };
  });
}

// ── EXECUTION ──
console.log("PATCH 7.9Z.2 — Long Context Preservation Audit — AUDIT ONLY\n");
console.log("HTTP usage: false | Production changes: NONE\n");

const totalTurnsPlanned = CONVERSATIONS.reduce((s, c) => s + c.turns.length, 0);
const minPerConv = Math.min(...CONVERSATIONS.map((c) => c.turns.length));
const maxPerConv = Math.max(...CONVERSATIONS.map((c) => c.turns.length));

if (CONVERSATIONS.length < 20 || totalTurnsPlanned < 700 || minPerConv < 30) {
  console.error(
    `Suite inválida: ${CONVERSATIONS.length} conversas, ${totalTurnsPlanned} turns, min/conv=${minPerConv}`
  );
  process.exit(2);
}

const results = CONVERSATIONS.map(runConversation);
const totalTurns = results.reduce((s, r) => s + r.total, 0);
const totalOk = results.reduce((s, r) => s + r.okTurns, 0);
const allLeaks = results.flatMap((r) => r.leaks);
const avg = (key) => results.reduce((s, r) => s + r[key], 0) / results.length;

console.log("── 1. Arquivos criados ──\n");
console.log("  scripts/test-mia-long-context-preservation-audit.js");
console.log("  scripts/test-mia-long-context-preservation-audit-variants.js (Fase 2)\n");

console.log("── 2. Mapa real do fluxo ──\n");
console.log("  Contexto acumulado → Memória conversacional → Winner → Anchor → Constraints");
console.log("  → Prioridades → Histórico de decisões → Routing Contract → Response Builder → Percepção");
console.log(
  `  ${CONVERSATIONS.length} conversas | ${totalTurns} turns | ${minPerConv}–${maxPerConv} turnos/conversa\n`
);

console.log("── 3. Métricas por camada ──\n");
console.log(`  Context Preservation:     ${pct(avg("contextAcc") * 100, 100)}%`);
console.log(`  Winner Preservation:        ${pct(avg("winnerAcc") * 100, 100)}%`);
console.log(`  Anchor Preservation:        ${pct(avg("anchorAcc") * 100, 100)}%`);
console.log(`  Constraint Preservation:    ${pct(avg("constraintAcc") * 100, 100)}%`);
console.log(`  Continuity Preservation:    ${pct(avg("continuityAcc") * 100, 100)}%`);
console.log(`  Full Stack (Regra 17):      ${pct(avg("fullStackAcc") * 100, 100)}%`);
console.log(`  User Perception SIM:        ${pct(avg("perceptionSim") * 100, 100)}%`);
console.log(`  Late-turn context (T20+):   ${pct(results.reduce((s, r) => s + r.lateContextAcc, 0) / results.length * 100, 100)}%`);
console.log(`  Late-turn families (T20+):  ${pct(results.reduce((s, r) => s + r.lateFamilyAcc, 0) / results.length * 100, 100)}%`);

console.log("\n── 4–7. Preservação por conversa ──\n");
for (const r of results) {
  console.log(
    `  [${r.id}/${r.type}] ${r.name}: ${r.okTurns}/${r.total} (${pct(r.okTurns, r.total)}%) | ctx=${pct(r.contextAcc * 100, 100)}% win=${pct(r.winnerAcc * 100, 100)}% anc=${pct(r.anchorAcc * 100, 100)}% | percepção=${r.convPerception}`
  );
}

const leakCounts = {};
for (const leak of allLeaks) {
  leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
}

console.log("\n── 8. Leaks encontrados ──\n");
if (!allLeaks.length) {
  console.log("  (nenhum leak detectado)");
} else {
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log("\n  Detalhe (primeiros 30):");
  for (const leak of allLeaks.slice(0, 30)) {
    console.log(`    [${leak.conv}/T${leak.turn}] ${leak.type}: ${leak.detail} | "${leak.msg}"`);
  }
  if (allLeaks.length > 30) console.log(`    ... +${allLeaks.length - 30} leaks`);
}

const rootClusters = analyzeRootCause(allLeaks);
console.log("\n── 9. Causa raiz ──\n");
if (!rootClusters.size) {
  console.log("  (nenhum gap — contexto longo preservado)");
} else {
  for (const [type, data] of rootClusters.entries()) {
    console.log(`  ${type} (${data.count}x) | camadas: ${[...data.layers].join(", ") || "n/a"}`);
    console.log(`    Ex.: ${data.examples.join("; ")}`);
  }
  console.log("\n  Próximos patches recomendados:");
  for (const rec of recommendPatch(rootClusters)) console.log(`    • ${rec}`);
}

console.log("\n── 10. Regressões (suites anteriores intactas) ──\n");
for (const r of runRegressions()) {
  console.log(`  ${r.script}: exit ${r.exit}`);
}

const simConvs = results.filter((r) => r.convPerception === "SIM").length;
const naoConvs = results.filter((r) => r.convPerception === "NÃO").length;

console.log("\n── 11. Veredito ──\n");
const robust =
  avg("contextAcc") >= 0.95 &&
  avg("winnerAcc") >= 0.95 &&
  avg("anchorAcc") >= 0.95 &&
  avg("constraintAcc") >= 0.95 &&
  avg("continuityAcc") >= 0.90 &&
  avg("fullStackAcc") >= 0.90 &&
  naoConvs === 0;

const verdict = robust ? "A) LONG CONTEXT FULL STACK ROBUST" : "B) LONG CONTEXT POSSUI GAP";
console.log(verdict);
console.log(`  Turns auditados: ${totalOk}/${totalTurns} (${pct(totalOk, totalTurns)}%)`);
console.log(`  Conversas SIM: ${simConvs}/${results.length} | NÃO: ${naoConvs}`);

console.log("\nPATCH 7.9Z.2 audit COMPLETE — AUDIT ONLY (sem alterações em produção)\n");
process.exit(verdict.startsWith("A") ? 0 : 1);
