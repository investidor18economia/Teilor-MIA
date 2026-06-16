/**
 * PATCH 7.9Z.2B — Long Context Social Validation Variant Generalization
 *
 * Validates collective social validation intent does NOT open new_search with active anchor.
 * 120+ scenarios across categories — local, no HTTP.
 *
 * Usage: node scripts/test-mia-long-context-social-validation-variant-generalization.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";
import {
  isSocialValidationFamilyQuery,
  isAntiRegretFamilyQuery,
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
  "celular",
  "notebook",
  "monitor",
  "pc gamer",
  "tv",
  "cadeira",
  "mouse",
  "teclado",
  "fone",
  "tablet",
  "ssd",
  "placa de video",
];

const GROUP_A = [
  "muita gente usa?",
  "bastante gente usa?",
  "o pessoal usa bastante?",
  "e popular?",
  "o povo compra?",
  "o pessoal compra?",
  "vende bastante?",
  "e usado por muita gente?",
];

const GROUP_B = [
  "costuma recomendar?",
  "o pessoal recomenda?",
  "a galera recomenda?",
  "quem tem recomenda?",
  "quem usa recomenda?",
  "e bem recomendado?",
  "indicam bastante?",
  "falam para comprar?",
];

const GROUP_C = [
  "galera curte?",
  "o pessoal gosta?",
  "quem usa gosta?",
  "quem comprou gostou?",
  "quem tem aprovou?",
  "a maioria aprova?",
  "costuma agradar?",
  "e bem aceito?",
];

const GROUP_D = [
  "o povo fala bem?",
  "falam bem dele?",
  "tem boa fama?",
  "e bem visto?",
  "e confiavel na pratica?",
  "tem reputacao boa?",
];

const GROUP_E = [
  "tem muita reclamacao?",
  "o pessoal reclama?",
  "muita gente reclama?",
  "costuma dar problema?",
  "da dor de cabeca para muita gente?",
  "tem problema recorrente?",
];

const GROUP_F = [
  "muita gente se arrepende?",
  "o pessoal costuma se arrepender?",
  "quem comprou se arrependeu?",
  "a galera se arrepende?",
];

const ALL_SV = [...GROUP_A, ...GROUP_B, ...GROUP_C, ...GROUP_D, ...GROUP_E, ...GROUP_F];

const NEGATIVE = [
  { q: "tenho medo de me arrepender", expectFamily: "ANTI_REGRET", why: "personal anti-regret" },
  { q: "nao quero me arrepender", expectFamily: "ANTI_REGRET", why: "personal anti-regret" },
  { q: "e bateria?", expectFamily: "COMMERCIAL_SEARCH", why: "axis follow-up not SV" },
  { q: "mostra outra opcao", expectFamily: "ALTERNATIVE_EXPLORATION", why: "alternative" },
  { q: "quero gastar menos", expectFamily: "CONSTRAINT_CHANGE", why: "constraint" },
  { q: "voce tem certeza?", expectFamily: "CONFIDENCE_CHALLENGE", why: "CC" },
  { q: "quero outro produto", expectFamily: "COMMERCIAL_SEARCH", why: "new search" },
  { q: "esquece isso quero comecar do zero", expectFamily: "COMMERCIAL_SEARCH", why: "reset" },
];

function buildScenarios() {
  const positive = [];
  for (const category of CATEGORIES) {
    for (let i = 0; i < 10; i++) {
      const query = ALL_SV[(CATEGORIES.indexOf(category) * 10 + i) % ALL_SV.length];
      positive.push({
        id: `${category}:${query}`,
        category,
        query,
        expectSV: true,
        expectSearch: false,
        group: query.includes("arrepend") ? "F" : "SV",
      });
    }
  }
  const negative = NEGATIVE.map((n, idx) => ({
    id: `neg-${idx}:${n.q}`,
    category: "anchored",
    query: n.q,
    expectSV: false,
    expectSearch: n.expectFamily === "COMMERCIAL_SEARCH" ? true : false,
    expectFamily: n.expectFamily,
    why: n.why,
  }));
  return [...positive, ...negative];
}

function evaluateScenario(scenario) {
  const leaks = [];
  const trace = simulateTurn(scenario.query, STATE);
  const sv = isSocialValidationFamilyQuery(scenario.query);
  const ar = isAntiRegretFamilyQuery(scenario.query);

  if (scenario.expectSV) {
    if (!sv) leaks.push({ type: "SV_INTENT_MISS", detail: "expected social validation" });
    if (trace.routing.conversationAct !== "social_validation" && sv) {
      leaks.push({ type: "ROUTING_ACT_MISS", detail: `act=${trace.routing.conversationAct}` });
    }
    if (trace.routing.openedNewSearch) {
      leaks.push({ type: "UNNECESSARY_NEW_SEARCH", detail: "opened search" });
    }
    if (trace.routing.clearNewSearch && STATE.hasAnchor) {
      leaks.push({ type: "CONTEXT_RESET", detail: "clearNewCommercialSearch" });
    }
    if (trace.routing.shouldPreserveAnchor === false) {
      leaks.push({ type: "ANCHOR_LOSS", detail: "shouldPreserveAnchor=false" });
    }
    if (trace.routing.allowReplaceWinner === true) {
      leaks.push({ type: "WINNER_LOSS", detail: "allowReplaceWinner=true" });
    }
    if (trace.responsePathFinal === "default_product_search") {
      leaks.push({ type: "INTENT_DRIFT", detail: "path=default_product_search" });
    }
    if (trace.responsePathFinal !== "social_validation_flow" && sv) {
      leaks.push({ type: "PATH_MISS", detail: `path=${trace.responsePathFinal}` });
    }
    if (trace.routing.mode !== "context_hold" && sv) {
      leaks.push({ type: "ROUTING_LEAK", detail: `mode=${trace.routing.mode}` });
    }
    if (trace.genericFallback) {
      leaks.push({ type: "GENERIC_FALLBACK", detail: "generic welcome leak" });
    }
  } else {
    if (sv && scenario.expectFamily !== "SOCIAL_VALIDATION") {
      leaks.push({ type: "SV_FALSE_POSITIVE", detail: scenario.why || "" });
    }
    if (scenario.expectFamily === "ANTI_REGRET" && !ar) {
      leaks.push({ type: "AR_MISS", detail: "expected anti-regret" });
    }
    if (scenario.expectFamily === "ANTI_REGRET" && trace.routing.openedNewSearch) {
      leaks.push({ type: "UNNECESSARY_NEW_SEARCH", detail: "AR opened search" });
    }
  }

  return {
    ...scenario,
    sv,
    ar,
    mode: trace.routing.mode,
    act: trace.routing.conversationAct,
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
const positive = results.filter((r) => r.expectSV);
const negative = results.filter((r) => !r.expectSV);
const posPass = positive.filter((r) => r.ok).length;
const negPass = negative.filter((r) => r.ok).length;

const leakCounts = {};
for (const r of results) {
  for (const l of r.leaks) leakCounts[l.type] = (leakCounts[l.type] || 0) + 1;
}

console.log("PATCH 7.9Z.2B — Social Validation Variant Generalization\n");
console.log(`Scenarios: ${scenarios.length} | Passed: ${passed}/${scenarios.length} (${pct(passed, scenarios.length)}%)`);
console.log(`  Positive (SV hold): ${posPass}/${positive.length} (${pct(posPass, positive.length)}%)`);
console.log(`  Negative controls: ${negPass}/${negative.length} (${pct(negPass, negative.length)}%)\n`);

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
    ? "A) LONG CONTEXT SOCIAL VALIDATION VARIANTS ROBUST"
    : "B) LONG CONTEXT SOCIAL VALIDATION VARIANTS POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
