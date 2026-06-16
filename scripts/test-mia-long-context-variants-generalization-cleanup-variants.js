/**
 * PATCH 7.9Z.2C — Regra 18: long context variant cleanup semantic variants
 *
 * Usage: node scripts/test-mia-long-context-variants-generalization-cleanup-variants.js
 */

import { simulateTurn } from "./test-mia-conversational-stress-15-turns.js";
import {
  isConstraintChangeFamilyQuery,
  isAcknowledgementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isAnchoredShortFollowUpQuery,
} from "../lib/miaCognitiveRouter.js";

const STATE = {
  hasAnchor: true,
  winner: "Product Alpha 35",
  runnerUp: "Product Beta 22",
  budgetMax: 2800,
  priorityAxis: null,
  deprioritized: [],
};

const VARIANTS = [
  { q: "bota silencio como prioridade", family: "CONSTRAINT_CHANGE", persona: "informal" },
  { q: "da mais peso pra conforto", family: "CONSTRAINT_CHANGE", persona: "leigo" },
  { q: "menos foco em acabamento", family: "CONSTRAINT_CHANGE", persona: "tecnico" },
  { q: "autonomia virou mais importante", family: "CONSTRAINT_CHANGE", persona: "apressado" },
  { q: "quero sacrificar performance", family: "CONSTRAINT_CHANGE", persona: "tecnico" },
  { q: "prioriza ruido baixo", family: "CONSTRAINT_CHANGE", persona: "detalhista" },
  { q: "upgrade pesa mais agora", family: "CONSTRAINT_CHANGE", persona: "tecnico" },
  { q: "conforto importa mais", family: "CONSTRAINT_CHANGE", persona: "leigo" },
  { q: "preco pesa mais agora", family: "CONSTRAINT_CHANGE", persona: "apressado" },
  { q: "posso abrir mao de acabamento", family: "CONSTRAINT_CHANGE", persona: "indeciso" },
  { q: "ah entendi", family: "ACKNOWLEDGEMENT", persona: "informal" },
  { q: "agora ficou claro", family: "ACKNOWLEDGEMENT", persona: "leigo" },
  { q: "saquei melhor", family: "ACKNOWLEDGEMENT", persona: "apressado" },
  { q: "beleza, peguei", family: "ACKNOWLEDGEMENT", persona: "informal" },
  { q: "ta explicado", family: "ACKNOWLEDGEMENT", persona: "curto" },
  { q: "demorou", family: "ACKNOWLEDGEMENT", persona: "girias" },
  { q: "blz entendi", family: "ACKNOWLEDGEMENT", persona: "curto" },
  { q: "certo entendi", family: "ACKNOWLEDGEMENT", persona: "leigo" },
  { q: "fechou entendi", family: "ACKNOWLEDGEMENT", persona: "informal" },
  { q: "agora sim entendi", family: "ACKNOWLEDGEMENT", persona: "indeciso" },
  { q: "tu ainda iria nesse?", family: "CONFIDENCE_CHALLENGE", persona: "informal" },
  { q: "continua de pe?", family: "CONFIDENCE_CHALLENGE", persona: "apressado" },
  { q: "nao mudou sua opiniao?", family: "CONFIDENCE_CHALLENGE", persona: "tecnico" },
  { q: "ainda segura essa indicacao?", family: "CONFIDENCE_CHALLENGE", persona: "detalhista" },
  { q: "voce manteria?", family: "CONFIDENCE_CHALLENGE", persona: "curto" },
  { q: "ainda vale?", family: "CONFIDENCE_CHALLENGE", persona: "curto" },
  { q: "continua bancando?", family: "CONFIDENCE_CHALLENGE", persona: "informal" },
  { q: "segue nesse mesmo?", family: "CONFIDENCE_CHALLENGE", persona: "leigo" },
  { q: "qual seria sua escolha?", family: "CONFIDENCE_CHALLENGE", persona: "indeciso" },
  { q: "voce crava ainda?", family: "CONFIDENCE_CHALLENGE", persona: "girias" },
  { q: "pera um pouco", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "calma que nao bateu", family: "SOFT_DISAGREEMENT", persona: "leigo" },
  { q: "ainda to desconfiado", family: "SOFT_DISAGREEMENT", persona: "indeciso" },
  { q: "meio estranho pra mim", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "nao me pegou", family: "SOFT_DISAGREEMENT", persona: "curto" },
  { q: "sei la", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "hm nao sei", family: "SOFT_DISAGREEMENT", persona: "indeciso" },
  { q: "nao me ganhou", family: "SOFT_DISAGREEMENT", persona: "leigo" },
  { q: "to meio dividido", family: "SOFT_DISAGREEMENT", persona: "indeciso" },
  { q: "nao curti muito", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "pelo preco qual compensa?", family: "COMMERCIAL_SEARCH", persona: "leigo" },
  { q: "qual da mais retorno?", family: "COMMERCIAL_SEARCH", persona: "tecnico" },
  { q: "qual vale cada real?", family: "COMMERCIAL_SEARCH", persona: "apressado" },
  { q: "pensando no orcamento?", family: "COMMERCIAL_SEARCH", persona: "indeciso" },
  { q: "qual e mais equilibrado?", family: "COMMERCIAL_SEARCH", persona: "tecnico" },
  { q: "custo beneficio importa mais", family: "CONSTRAINT_CHANGE", persona: "tecnico" },
  { q: "me ajuda", family: "COMMERCIAL_SEARCH", persona: "curto" },
  { q: "qual melhor?", family: "COMMERCIAL_SEARCH", persona: "curto" },
  { q: "ok entendi, mas continua valendo?", family: "CONFIDENCE_CHALLENGE", persona: "mixed" },
  { q: "show, mas ainda to na duvida", family: "SOFT_DISAGREEMENT", persona: "mixed" },
  { q: "nao curti muito, tem outra opcao?", family: "ALTERNATIVE_EXPLORATION", persona: "mixed" },
  { q: "beleza, mas o povo fala bem?", family: "SOCIAL_VALIDATION", persona: "mixed" },
  { q: "saquei, mas tenho medo de errar", family: "ANTI_REGRET", persona: "mixed" },
  { q: "prioriza conforto mas sem subir muito o preco", family: "CONSTRAINT_CHANGE", persona: "mixed" },
  { q: "continua valendo mesmo se eu gastar menos?", family: "CONFIDENCE_CHALLENGE", persona: "mixed" },
  { q: "fechou, mas mostra outra opcao", family: "ALTERNATIVE_EXPLORATION", persona: "mixed" },
  { q: "e se eu quiser algo mais seguro?", family: "CONSTRAINT_CHANGE", persona: "mixed" },
  { q: "bateria pesa mais", family: "CONSTRAINT_CHANGE", persona: "typo" },
  { q: "desempenho importa menos", family: "CONSTRAINT_CHANGE", persona: "tecnico" },
  { q: "quero focar mais em autonomia", family: "CONSTRAINT_CHANGE", persona: "leigo" },
  { q: "ta claro agora", family: "ACKNOWLEDGEMENT", persona: "informal" },
  { q: "continua recomendando?", family: "CONFIDENCE_CHALLENGE", persona: "apressado" },
  { q: "voce sustenta?", family: "CONFIDENCE_CHALLENGE", persona: "curto" },
  { q: "espera ai", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "nao bateu comigo", family: "SOFT_DISAGREEMENT", persona: "leigo" },
  { q: "qual equilibra melhor?", family: "COMMERCIAL_SEARCH", persona: "tecnico" },
  { q: "olhando preco e qualidade?", family: "COMMERCIAL_SEARCH", persona: "detalhista" },
  { q: "pensando no valor, qual fica?", family: "COMMERCIAL_SEARCH", persona: "indeciso" },
  { q: "em custo beneficio qual ganha?", family: "COMMERCIAL_SEARCH", persona: "tecnico" },
  { q: "pensando no bolso, qual vale?", family: "COMMERCIAL_SEARCH", persona: "leigo" },
  { q: "continua na mesma linha?", family: "CONFIDENCE_CHALLENGE", persona: "tecnico" },
  { q: "segue recomendando esse?", family: "CONFIDENCE_CHALLENGE", persona: "detalhista" },
  { q: "mantem a recomendacao?", family: "CONFIDENCE_CHALLENGE", persona: "formal" },
  { q: "voce iria nele ainda?", family: "CONFIDENCE_CHALLENGE", persona: "informal" },
  { q: "nao to comprando essa ideia", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "fiquei meio dividido", family: "SOFT_DISAGREEMENT", persona: "indeciso" },
  { q: "isso nao me desceu", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "nao bateu ainda", family: "SOFT_DISAGREEMENT", persona: "leigo" },
  { q: "nao sei nao", family: "SOFT_DISAGREEMENT", persona: "informal" },
  { q: "captei", family: "ACKNOWLEDGEMENT", persona: "curto" },
  { q: "show", family: "ACKNOWLEDGEMENT", persona: "curto" },
  { q: "prioriza silencio", family: "CONSTRAINT_CHANGE", persona: "audit" },
  { q: "qual o custo beneficio?", family: "COMMERCIAL_SEARCH", persona: "audit" },
];

function detectFamily(family, q) {
  switch (family) {
    case "CONSTRAINT_CHANGE":
      return isConstraintChangeFamilyQuery(q);
    case "ACKNOWLEDGEMENT":
      return isAcknowledgementFamilyQuery(q);
    case "CONFIDENCE_CHALLENGE":
      return isConfidenceChallengeFamilyQuery(q);
    case "SOFT_DISAGREEMENT":
      return isSoftDisagreementFamilyQuery(q);
    case "COMMERCIAL_SEARCH":
      return isAnchoredShortFollowUpQuery(q, { hasActiveAnchor: true });
    default:
      return true;
  }
}

function evaluate({ q, family, persona }) {
  const trace = simulateTurn(q, STATE);
  const leaks = [];
  if (family !== "MIXED" && family !== "SOCIAL_VALIDATION" && family !== "ANTI_REGRET" && family !== "ALTERNATIVE_EXPLORATION") {
    if (!detectFamily(family, q) && trace.actualFamily !== family) leaks.push("INTENT_MISS");
  }
  if (trace.routing.openedNewSearch) leaks.push("UNNECESSARY_NEW_SEARCH");
  if (trace.routing.shouldPreserveAnchor === false) leaks.push("ANCHOR_LOSS");
  if (trace.routing.allowReplaceWinner) leaks.push("WINNER_LOSS");
  if (trace.responsePathFinal === "default_product_search") leaks.push("INTENT_DRIFT");
  if (trace.genericFallback) leaks.push("GENERIC_FALLBACK");
  return { q, family, persona, actual: trace.actualFamily, path: trace.responsePathFinal, leaks, ok: leaks.length === 0 };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) : "0.0";
}

const results = VARIANTS.map(evaluate);
const passed = results.filter((r) => r.ok).length;

console.log("PATCH 7.9Z.2C — Variants Cleanup (Regra 18)\n");
console.log(`Variants: ${VARIANTS.length} | Passed: ${passed}/${VARIANTS.length} (${pct(passed, VARIANTS.length)}%)\n`);

const fails = results.filter((r) => !r.ok);
if (fails.length) {
  console.log("── Failures ──\n");
  for (const r of fails.slice(0, 25)) {
    console.log(`  [${r.persona}] "${r.q}" → ${r.leaks.join(", ")} (${r.actual})`);
  }
}

const verdict =
  passed / VARIANTS.length >= 0.95
    ? "A) LONG CONTEXT VARIANTS GENERALIZATION ROBUST"
    : "B) LONG CONTEXT VARIANTS GENERALIZATION POSSUI GAP";

console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(passed / VARIANTS.length >= 0.95 ? 0 : 1);
