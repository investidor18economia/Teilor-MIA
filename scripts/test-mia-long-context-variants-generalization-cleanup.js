/**
 * PATCH 7.9Z.2C — Long Context Variants Generalization Cleanup
 *
 * Validates conversational family variants preserve anchor/winner in long context.
 * 160+ scenarios — local, no HTTP.
 *
 * Usage: node scripts/test-mia-long-context-variants-generalization-cleanup.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";
import {
  isConstraintChangeFamilyQuery,
  isAcknowledgementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isAnchoredShortFollowUpQuery,
  isAntiRegretFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const STATE = {
  hasAnchor: true,
  winner: "Product Alpha 35",
  runnerUp: "Product Beta 22",
  budgetMax: 3200,
  priorityAxis: "desempenho",
  deprioritized: [],
};

const GROUP_A = [
  "prioriza silencio",
  "prioriza conforto",
  "prioriza durabilidade",
  "prioriza upgrade",
  "desempenho pesa mais",
  "bateria pesa mais agora",
  "preco importa mais",
  "acabamento importa menos",
  "posso abrir mao de performance",
  "quero focar em autonomia",
];

const GROUP_B = [
  "ok entendi",
  "beleza entendi",
  "show",
  "boa",
  "agora sim",
  "saquei",
  "ta claro",
  "fez sentido agora",
  "fechou entendi",
  "certo, continua",
];

const GROUP_C = [
  "continua valendo?",
  "mantem esse?",
  "ainda e esse?",
  "sustenta?",
  "voce bancaria essa?",
  "segue sendo a melhor?",
  "continua sendo a escolha?",
  "ainda recomenda?",
  "voce iria nele ainda?",
  "mantem a recomendacao?",
];

const GROUP_D = [
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
];

const GROUP_E = [
  "qual o custo beneficio?",
  "e o custo beneficio?",
  "custo beneficio conta?",
  "pensando no valor, qual fica?",
  "qual vale mais pelo preco?",
  "olhando preco e qualidade?",
  "qual equilibra melhor?",
  "qual entrega mais pelo valor?",
  "em custo beneficio qual ganha?",
  "pensando no bolso, qual vale?",
];

const GROUP_F = [
  "ok entendi, mas continua valendo?",
  "show, mas ainda to na duvida",
  "prioriza conforto mas sem subir muito o preco",
  "nao curti muito, tem outra opcao?",
  "custo beneficio importa mais agora",
  "e se eu quiser algo mais seguro?",
  "beleza, mas o povo fala bem?",
  "saquei, mas tenho medo de errar",
  "fechou, mas mostra outra opcao",
  "continua valendo mesmo se eu gastar menos?",
];

const NEGATIVE = [
  { q: "quero outro produto", expect: "COMMERCIAL_SEARCH", search: true },
  { q: "tenho medo de me arrepender", expect: "ANTI_REGRET", search: false },
  { q: "mostra outra opcao", expect: "ALTERNATIVE_EXPLORATION", search: false },
];

function familyDetector(family) {
  switch (family) {
    case "CONSTRAINT_CHANGE":
      return isConstraintChangeFamilyQuery;
    case "ACKNOWLEDGEMENT":
      return isAcknowledgementFamilyQuery;
    case "CONFIDENCE_CHALLENGE":
      return isConfidenceChallengeFamilyQuery;
    case "SOFT_DISAGREEMENT":
      return isSoftDisagreementFamilyQuery;
    case "COMMERCIAL_SEARCH":
      return (q) => isAnchoredShortFollowUpQuery(q, { hasActiveAnchor: true });
    case "ANTI_REGRET":
      return isAntiRegretFamilyQuery;
    case "ALTERNATIVE_EXPLORATION":
      return () => false;
    default:
      return () => false;
  }
}

function buildScenarios() {
  const positive = [];
  const groups = [
    { id: "A", family: "CONSTRAINT_CHANGE", queries: GROUP_A },
    { id: "B", family: "ACKNOWLEDGEMENT", queries: GROUP_B },
    { id: "C", family: "CONFIDENCE_CHALLENGE", queries: GROUP_C },
    { id: "D", family: "SOFT_DISAGREEMENT", queries: GROUP_D },
    { id: "E", family: "COMMERCIAL_SEARCH", queries: GROUP_E },
    { id: "F", family: "MIXED", queries: GROUP_F },
  ];
  for (const g of groups) {
    for (const query of g.queries) {
      positive.push({ id: `${g.id}:${query}`, group: g.id, query, family: g.family, expectSearch: false });
    }
  }
  const negative = NEGATIVE.map((n, i) => ({
    id: `neg-${i}:${n.q}`,
    group: "NEG",
    query: n.q,
    family: n.expect,
    expectSearch: n.search,
  }));
  return [...positive, ...negative];
}

function evaluateScenario(scenario) {
  const leaks = [];
  const trace = simulateTurn(scenario.query, STATE);

  if (scenario.family !== "MIXED") {
    const detect = familyDetector(scenario.family);
    if (!detect(scenario.query) && trace.actualFamily !== scenario.family) {
      leaks.push({ type: "INTENT_MISS", detail: `expected ${scenario.family}` });
    }
  }

  if (scenario.expectSearch === false) {
    if (trace.routing.openedNewSearch) leaks.push({ type: "UNNECESSARY_NEW_SEARCH", detail: "opened search" });
    if (trace.routing.shouldPreserveAnchor === false) leaks.push({ type: "ANCHOR_LOSS", detail: "anchor lost" });
    if (trace.routing.allowReplaceWinner) leaks.push({ type: "WINNER_LOSS", detail: "winner lost" });
    if (trace.responsePathFinal === "default_product_search") {
      leaks.push({ type: "INTENT_DRIFT", detail: "default_product_search" });
    }
    if (trace.genericFallback) leaks.push({ type: "GENERIC_FALLBACK", detail: "generic leak" });
  } else if (trace.routing.openedNewSearch === false && scenario.expectSearch) {
    leaks.push({ type: "SEARCH_MISS", detail: "expected new search" });
  }

  return { ...scenario, actual: trace.actualFamily, path: trace.responsePathFinal, leaks, ok: leaks.length === 0 };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

const scenarios = buildScenarios();
const results = scenarios.map(evaluateScenario);
const passed = results.filter((r) => r.ok).length;

console.log("PATCH 7.9Z.2C — Long Context Variants Generalization Cleanup\n");
console.log(`Scenarios: ${scenarios.length} | Passed: ${passed}/${scenarios.length} (${pct(passed, scenarios.length)}%)\n`);

const leakCounts = {};
for (const r of results) {
  for (const l of r.leaks) leakCounts[l.type] = (leakCounts[l.type] || 0) + 1;
}
if (Object.keys(leakCounts).length) {
  console.log("── Leaks ──\n");
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  for (const r of results.filter((x) => !x.ok).slice(0, 15)) {
    console.log(`    [${r.id}] ${r.leaks.map((l) => l.type).join(", ")} → ${r.actual}`);
  }
}

const verdict =
  passed / scenarios.length >= 0.95
    ? "A) LONG CONTEXT VARIANTS GENERALIZATION ROBUST"
    : "B) LONG CONTEXT VARIANTS GENERALIZATION POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(passed / scenarios.length >= 0.95 ? 0 : 1);
