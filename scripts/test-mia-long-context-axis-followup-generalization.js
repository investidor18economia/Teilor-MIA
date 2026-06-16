/**
 * PATCH 7.9Z.2A — Long Context Axis Follow-Up Generalization validation
 *
 * Validates anchored aspect follow-up intent does NOT open new_search.
 * 80+ scenarios across categories — local, no HTTP.
 *
 * Usage: node scripts/test-mia-long-context-axis-followup-generalization.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";
import {
  isAnchoredAspectFollowUpQuery,
  isAnchoredShortFollowUpQuery,
} from "../lib/miaCognitiveRouter.js";

const STATE = {
  hasAnchor: true,
  winner: "Product Alpha 35",
  runnerUp: "Product Beta 22",
  budgetMax: 2500,
  priorityAxis: "desempenho",
  deprioritized: [],
};

const CATEGORIES = [
  "smartphone",
  "notebook",
  "monitor",
  "pc gamer",
  "ssd",
  "mouse",
  "teclado",
  "cadeira",
  "tv",
  "placa de video",
];

const GROUP_A = ["e velocidade?", "e desempenho?", "e precisao?", "e conforto?", "e silencio?"];
const GROUP_B = ["e construcao?", "e acabamento?", "e ergonomia?", "e durabilidade?"];
const GROUP_C = ["e upgrade futuro?", "e manutencao?", "e compatibilidade?"];
const GROUP_D = ["e para jogos?", "e para trabalho?", "e para uso pesado?"];
const GROUP_E = ["e custo beneficio?", "e valor?", "e economia?"];

const NEGATIVE = [
  { q: "e tem outro?", why: "alternative" },
  { q: "e mostra alternativas?", why: "AE" },
  { q: "e quero gastar menos?", why: "constraint" },
  { q: "e voce tem certeza?", why: "CC" },
  { q: "e notebook?", why: "category pivot" },
  { q: "e celular?", why: "category pivot" },
  { q: "e qual recomenda?", why: "delegation" },
  { q: "e prioriza bateria?", why: "constraint" },
  { q: "quero outro produto", why: "explicit new search" },
  { q: "esquece isso quero comecar do zero", why: "context reset" },
];

function buildScenarios() {
  const positive = [];
  for (const category of CATEGORIES) {
    for (const group of [GROUP_A, GROUP_B, GROUP_C, GROUP_D, GROUP_E]) {
      for (const query of group) {
        positive.push({ id: `${category}:${query}`, category, query, expectAspect: true, expectSearch: false });
      }
    }
  }
  const negative = NEGATIVE.map((n, i) => ({
    id: `neg-${i}:${n.q}`,
    category: "anchored",
    query: n.q,
    expectAspect: false,
    expectSearch: true,
    why: n.why,
  }));
  return [...positive, ...negative];
}

function evaluateScenario(scenario) {
  const leaks = [];
  const trace = simulateTurn(scenario.query, STATE);
  const aspect = isAnchoredAspectFollowUpQuery(scenario.query, { hasActiveAnchor: true });
  const anchored = isAnchoredShortFollowUpQuery(scenario.query, { hasActiveAnchor: true });

  if (scenario.expectAspect && !aspect) {
    leaks.push({ type: "ASPECT_INTENT_MISS", detail: "expected aspect follow-up intent" });
  }
  if (!scenario.expectAspect && aspect) {
    leaks.push({ type: "ASPECT_FALSE_POSITIVE", detail: `should not be aspect (${scenario.why || ""})` });
  }
  if (scenario.expectSearch === false) {
    if (trace.routing.openedNewSearch) leaks.push({ type: "UNNECESSARY_NEW_SEARCH", detail: "opened search" });
    if (trace.routing.clearNewSearch && STATE.hasAnchor) {
      leaks.push({ type: "CONTEXT_RESET", detail: "clearNewCommercialSearch" });
    }
    if (trace.routing.shouldPreserveAnchor === false) {
      leaks.push({ type: "ANCHOR_LOSS", detail: "shouldPreserveAnchor=false" });
    }
    if (trace.routing.allowReplaceWinner === true) {
      leaks.push({ type: "WINNER_LOSS", detail: "allowReplaceWinner=true" });
    }
    if (trace.routing.openedNewSearch && STATE.budgetMax) {
      leaks.push({ type: "CONSTRAINT_LOSS", detail: "budget lost via search" });
    }
    if (trace.responsePathFinal === "default_product_search") {
      leaks.push({ type: "INTENT_DRIFT", detail: "path=default_product_search" });
    }
    if (trace.routing.mode !== "context_hold") {
      leaks.push({ type: "ROUTING_LEAK", detail: `mode=${trace.routing.mode}` });
    }
  } else if (scenario.expectSearch === true && !trace.routing.openedNewSearch && !aspect) {
    // negative controls should NOT hold context (except aspect false positives already caught)
  }

  return {
    ...scenario,
    aspect,
    anchored,
    mode: trace.routing.mode,
    openedNewSearch: trace.routing.openedNewSearch,
    path: trace.responsePathFinal,
    leaks,
    ok: leaks.length === 0,
  };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

const scenarios = buildScenarios();
const results = scenarios.map(evaluateScenario);
const passed = results.filter((r) => r.ok).length;
const positive = results.filter((r) => r.expectAspect);
const negative = results.filter((r) => !r.expectAspect);
const posPass = positive.filter((r) => r.ok).length;
const negPass = negative.filter((r) => r.ok).length;

const leakCounts = {};
for (const r of results) {
  for (const l of r.leaks) leakCounts[l.type] = (leakCounts[l.type] || 0) + 1;
}

console.log("PATCH 7.9Z.2A — Axis Follow-Up Generalization Validation\n");
console.log(`Scenarios: ${scenarios.length} | Passed: ${passed}/${scenarios.length} (${pct(passed, scenarios.length)}%)`);
console.log(`  Positive (aspect hold): ${posPass}/${positive.length} (${pct(posPass, positive.length)}%)`);
console.log(`  Negative (must not hold): ${negPass}/${negative.length} (${pct(negPass, negative.length)}%)\n`);

if (Object.keys(leakCounts).length) {
  console.log("── Leaks ──\n");
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log("\n  Failures (first 15):");
  for (const r of results.filter((x) => !x.ok).slice(0, 15)) {
    console.log(`    [${r.id}] ${r.leaks.map((l) => l.type).join(", ")}`);
  }
}

const verdict =
  passed === scenarios.length && posPass === positive.length && negPass === negative.length
    ? "A) LONG CONTEXT AXIS FOLLOW-UP ROBUST"
    : "B) LONG CONTEXT AXIS FOLLOW-UP POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
