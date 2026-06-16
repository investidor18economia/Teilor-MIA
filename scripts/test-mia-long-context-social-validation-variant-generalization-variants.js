/**
 * PATCH 7.9Z.2B — Fase 5 (Regra 18): social validation semantic variants
 *
 * Same intention (collective proof / social validation), different phrasing.
 *
 * Usage: node scripts/test-mia-long-context-social-validation-variant-generalization-variants.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";
import { isSocialValidationFamilyQuery } from "../lib/miaCognitiveRouter.js";

const STATE = {
  hasAnchor: true,
  winner: "Product Alpha 35",
  runnerUp: "Product Beta 22",
  budgetMax: 3200,
  priorityAxis: null,
  deprioritized: [],
};

/** Paraphrases — NOT repeating audit principal phrases verbatim where possible */
const VARIANTS = [
  { q: "geral usa isso?", persona: "informal" },
  { q: "e coisa que o povo compra?", persona: "leigo" },
  { q: "quem tem fala bem?", persona: "apressado" },
  { q: "dono costuma gostar?", persona: "indeciso" },
  { q: "isso e bem aceito?", persona: "tecnico" },
  { q: "tem fama boa?", persona: "leigo" },
  { q: "o pessoal mete pau?", persona: "informal" },
  { q: "galera reclama?", persona: "informal" },
  { q: "da problema pra muita gente?", persona: "leigo" },
  { q: "quem pegou se arrependeu?", persona: "indeciso" },
  { q: "povo aprova?", persona: "apressado" },
  { q: "costuma agradar na pratica?", persona: "tecnico" },
  { q: "a turma curte?", persona: "informal" },
  { q: "muita gente indica?", persona: "leigo" },
  { q: "o pessoal fala mal?", persona: "informal" },
  { q: "tem avaliacao boa?", persona: "tecnico" },
  { q: "quem comprou curtiu?", persona: "apressado" },
  { q: "e bem avaliado?", persona: "tecnico" },
  { q: "o povo recomenda msm?", persona: "informal" },
  { q: "geral recomenda?", persona: "apressado" },
  { q: "muita gente compra msm?", persona: "informal" },
  { q: "tem gente q reclama?", persona: "typo" },
  { q: "costuma ser aprovado?", persona: "tecnico" },
  { q: "e aceito no mercado?", persona: "tecnico" },
  { q: "quem usa passa raiva?", persona: "informal" },
  { q: "da dor de cabeca?", persona: "apressado" },
  { q: "o pessoal se arrepende?", persona: "indeciso" },
  { q: "a maioria gosta?", persona: "leigo" },
  { q: "falam q e bom?", persona: "informal" },
  { q: "tem boa reputacao?", persona: "tecnico" },
  { q: "e confiavel na pratica?", persona: "tecnico" },
  { q: "quem tem aprova?", persona: "apressado" },
  { q: "o povo curte?", persona: "informal" },
  { q: "muita gente aprova?", persona: "leigo" },
  { q: "costuma ser recomendado?", persona: "tecnico" },
  { q: "e escolha popular?", persona: "tecnico" },
  { q: "tem muita gente usando?", persona: "leigo" },
  { q: "o pessoal indica?", persona: "apressado" },
  { q: "quem comprou aprovou?", persona: "indeciso" },
  { q: "a galera usa?", persona: "informal" },
  { q: "tem reclamacao recorrente?", persona: "tecnico" },
  { q: "costuma dar problema?", persona: "leigo" },
  { q: "muita gente se arrepende msm?", persona: "informal" },
  { q: "o povo aprova?", persona: "apressado" },
  { q: "falam bem?", persona: "curto" },
  { q: "e popular msm?", persona: "informal" },
  { q: "quem usa recomenda?", persona: "leigo" },
  { q: "o pessoal gosta msm?", persona: "informal" },
  { q: "tem boa fama?", persona: "tecnico" },
  { q: "muita gente curte?", persona: "informal" },
  { q: "costuma ser bem visto?", persona: "tecnico" },
  { q: "o povo usa?", persona: "curto" },
  { q: "quem tem gostou?", persona: "indeciso" },
  { q: "a turma recomenda?", persona: "informal" },
  { q: "tem mta reclamacao?", persona: "typo" },
  { q: "e bem recomendado?", persona: "tecnico" },
  { q: "o pessoal compra msm?", persona: "informal" },
  { q: "quem comprou se arrepende?", persona: "indeciso" },
  { q: "geral curte?", persona: "curto" },
  { q: "e aceito pelos usuarios?", persona: "tecnico" },
  { q: "muita gente fala bem?", persona: "leigo" },
  { q: "o pessoal aprova?", persona: "apressado" },
  { q: "costuma ser elogiado?", persona: "tecnico" },
  { q: "tem problema comum?", persona: "leigo" },
  { q: "a galera aprova?", persona: "informal" },
  { q: "quem usa aprova?", persona: "apressado" },
];

function evaluate({ q, persona }) {
  const trace = simulateTurn(q, STATE);
  const sv = isSocialValidationFamilyQuery(q);
  const leaks = [];
  if (!sv) leaks.push("SV_INTENT_MISS");
  if (trace.routing.openedNewSearch) leaks.push("UNNECESSARY_NEW_SEARCH");
  if (trace.routing.shouldPreserveAnchor === false) leaks.push("ANCHOR_LOSS");
  if (trace.routing.allowReplaceWinner) leaks.push("WINNER_LOSS");
  if (trace.responsePathFinal === "default_product_search") leaks.push("INTENT_DRIFT");
  if (trace.responsePathFinal !== "social_validation_flow" && sv) leaks.push("PATH_MISS");
  if (trace.routing.mode !== "context_hold" && sv) leaks.push("ROUTING_LEAK");
  if (trace.genericFallback) leaks.push("GENERIC_FALLBACK");
  return { q, persona, sv, mode: trace.routing.mode, path: trace.responsePathFinal, leaks, ok: leaks.length === 0 };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

const results = VARIANTS.map(evaluate);
const passed = results.filter((r) => r.ok).length;

console.log("PATCH 7.9Z.2B — Social Validation Variants (Regra 18)\n");
console.log(`Variants: ${VARIANTS.length} | Passed: ${passed}/${VARIANTS.length} (${pct(passed, VARIANTS.length)}%)\n`);

const fails = results.filter((r) => !r.ok);
if (fails.length) {
  console.log("── Failures ──\n");
  for (const r of fails.slice(0, 20)) {
    console.log(`  [${r.persona}] "${r.q}" → ${r.leaks.join(", ")}`);
  }
}

const verdict =
  passed / VARIANTS.length >= 0.95
    ? "A) LONG CONTEXT SOCIAL VALIDATION VARIANTS ROBUST"
    : passed / VARIANTS.length >= 0.9
      ? "A) LONG CONTEXT SOCIAL VALIDATION VARIANTS ROBUST (90%+)"
      : "B) LONG CONTEXT SOCIAL VALIDATION VARIANTS POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(passed / VARIANTS.length >= 0.9 ? 0 : 1);
