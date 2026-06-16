/**
 * PATCH 7.9Z.2A — Fase 4 (Regra 18): axis follow-up semantic variants
 *
 * Same intention (evaluate another aspect of current winner), different phrasing.
 *
 * Usage: node scripts/test-mia-long-context-axis-followup-generalization-variants.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";
import { isAnchoredAspectFollowUpQuery } from "../lib/miaCognitiveRouter.js";

const STATE = {
  hasAnchor: true,
  winner: "Product Alpha 35",
  runnerUp: "Product Beta 22",
  budgetMax: 3200,
  priorityAxis: null,
  deprioritized: [],
};

/** Paraphrases — NOT repeating audit principal phrases */
const VARIANTS = [
  { q: "e rapidez?", persona: "apressado" },
  { q: "e o ruido?", persona: "tecnico" },
  { q: "e a robustez?", persona: "detalhista" },
  { q: "e expansao?", persona: "tecnico" },
  { q: "e revisao?", persona: "detalhista" },
  { q: "e integracao?", persona: "tecnico" },
  { q: "e pra editar video?", persona: "leigo" },
  { q: "e pra home office?", persona: "confuso" },
  { q: "e o investimento?", persona: "detalhista" },
  { q: "e o custo?", persona: "apressado" },
  { q: "e eficiencia?", persona: "tecnico" },
  { q: "e a tela?", persona: "leigo" },
  { q: "e peso?", persona: "apressado" },
  { q: "e bateria?", persona: "leigo" },
  { q: "e autonomia?", persona: "confuso" },
  { q: "e a camera?", persona: "leigo" },
  { q: "e o material?", persona: "detalhista" },
  { q: "e o design?", persona: "girias" },
  { q: "e a garantia?", persona: "detalhista" },
  { q: "e suporte?", persona: "tecnico" },
  { q: "e conectividade?", persona: "tecnico" },
  { q: "e wifi?", persona: "leigo" },
  { q: "e portabilidade?", persona: "apressado" },
  { q: "e o tamanho?", persona: "confuso" },
  { q: "e a qualidade?", persona: "detalhista" },
  { q: "e a resistencia?", persona: "tecnico" },
  { q: "e o refresh?", persona: "tecnico" },
  { q: "e fps?", persona: "girias" },
  { q: "e input lag?", persona: "tecnico" },
  { q: "e a resposta?", persona: "apressado" },
  { q: "e pra streaming?", persona: "leigo" },
  { q: "e pra estudar?", persona: "confuso" },
  { q: "e pra viagem?", persona: "apressado" },
  { q: "e amortecimento?", persona: "detalhista" },
  { q: "e ventilacao?", persona: "tecnico" },
  { q: "e consumo?", persona: "detalhista" },
  { q: "e a ergonomia?", persona: "detalhista" },
  { q: "e o acabamento?", persona: "detalhista" },
  { q: "e durabilidade?", persona: "tecnico" },
  { q: "e desempenho?", persona: "tecnico" },
];

function evaluate({ q, persona }) {
  const trace = simulateTurn(q, STATE);
  const aspect = isAnchoredAspectFollowUpQuery(q, { hasActiveAnchor: true });
  const leaks = [];
  if (!aspect) leaks.push("ASPECT_INTENT_MISS");
  if (trace.routing.openedNewSearch) leaks.push("UNNECESSARY_NEW_SEARCH");
  if (trace.routing.shouldPreserveAnchor === false) leaks.push("ANCHOR_LOSS");
  if (trace.routing.allowReplaceWinner) leaks.push("WINNER_LOSS");
  if (trace.routing.openedNewSearch) leaks.push("CONSTRAINT_LOSS");
  if (trace.responsePathFinal === "default_product_search") leaks.push("INTENT_DRIFT");
  return { q, persona, aspect, mode: trace.routing.mode, leaks, ok: leaks.length === 0 };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

console.log("PATCH 7.9Z.2A — Fase 4: Axis Follow-Up Variants (Regra 18)\n");

const results = VARIANTS.map(evaluate);
const passed = results.filter((r) => r.ok).length;

console.log(`Variants: ${VARIANTS.length} | Passed: ${passed}/${VARIANTS.length} (${pct(passed, VARIANTS.length)}%)\n`);

if (passed < VARIANTS.length) {
  console.log("── Failures ──\n");
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  [${r.persona}] "${r.q}" → ${r.leaks.join(", ")} (mode=${r.mode})`);
  }
}

const verdict =
  passed === VARIANTS.length ? "A) AXIS FOLLOW-UP VARIANTS ROBUST" : "B) AXIS FOLLOW-UP VARIANTS POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(verdict.startsWith("A") ? 0 : 1);
