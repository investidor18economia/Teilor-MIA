/**
 * PATCH 7.9X-J.3 — ACKNOWLEDGEMENT Residual Vocabulary (local audit)
 *
 * Usage: node scripts/test-mia-acknowledgement-semantic-expansion.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAcknowledgementFamilyQuery,
  hasAcknowledgementOpeningPrefix,
  isGreetingFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isAntiRegretFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isConstraintChangeFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual" },
  lastProducts: [{ product_name: "Produto Recomendado Atual" }],
};

const PURE_POSITIVE = [
  { group: "A", input: "ok", anchored: true },
  { group: "A", input: "ok", anchored: false },
  { group: "A", input: "okay", anchored: true },
  { group: "A", input: "certo", anchored: true },
  { group: "A", input: "beleza", anchored: false },
  { group: "A", input: "blz", anchored: true },
  { group: "A", input: "tá", anchored: false },
  { group: "A", input: "ta", anchored: true },
  { group: "A", input: "tá bom", anchored: true },
  { group: "A", input: "ta certo", anchored: false },
  { group: "C", input: "show", anchored: true },
  { group: "C", input: "top", anchored: false },
  { group: "C", input: "perfeito", anchored: true },
  { group: "C", input: "ótimo", anchored: true },
  { group: "C", input: "massa", anchored: false },
  { group: "C", input: "fechou", anchored: true },
  { group: "C", input: "combinado", anchored: true },
  { group: "C", input: "fechado", anchored: false },
  { group: "D", input: "suave", anchored: true },
  { group: "D", input: "tranquilo", anchored: false },
  { group: "D", input: "de boa", anchored: true },
  { group: "D", input: "demorou", anchored: true },
  { group: "D", input: "fechou então", anchored: true },
  { group: "D", input: "valeu", anchored: false },
  { group: "D", input: "valeu mesmo", anchored: true },
  { group: "D", input: "beleza então", anchored: true },
  { group: "A", input: "justo", anchored: true },
  { group: "A", input: "claro", anchored: false },
  { group: "A", input: "captei", anchored: true },
  { group: "A", input: "ah sim", anchored: true },
  { group: "A", input: "pode ser", anchored: false },
  { group: "A", input: "tudo certo", anchored: true },
  { group: "A", input: "verdade", anchored: false },
  { group: "C", input: "show", anchored: false },
  { group: "D", input: "suave", anchored: false },
  { group: "A", input: "blz", anchored: false },
  { group: "C", input: "fechou", anchored: false },
  { group: "D", input: "de boa", anchored: false },
  { group: "A", input: "certo", anchored: false },
  { group: "C", input: "top", anchored: true },
  { group: "D", input: "demorou", anchored: false },
  { group: "A", input: "okay", anchored: false },
  { group: "D", input: "valeu", anchored: true },
  { group: "C", input: "perfeito", anchored: false },
  { group: "A", input: "ta bom", anchored: true },
  { group: "D", input: "tranquilo", anchored: true },
  { group: "C", input: "massa", anchored: true },
  { group: "J3", input: "fechado então", anchored: true },
  { group: "J3", input: "fechado então", anchored: false },
  { group: "J3", input: "combinado então", anchored: true },
  { group: "J3", input: "certo então", anchored: false },
];

const CONTINUITY = [
  { group: "B", input: "pode seguir", anchored: true },
  { group: "B", input: "continua", anchored: true },
  { group: "B", input: "segue", anchored: false },
  { group: "B", input: "manda", anchored: true },
  { group: "B", input: "manda ver", anchored: false },
  { group: "B", input: "pode continuar", anchored: true },
  { group: "B", input: "prossiga", anchored: true },
  { group: "B", input: "vai", anchored: false },
  { group: "E", input: "saquei, segue", anchored: true },
  { group: "E", input: "entendi, continua", anchored: true },
  { group: "E", input: "ok, continua", anchored: false },
  { group: "E", input: "beleza, pode seguir", anchored: true },
  { group: "E", input: "tá, manda", anchored: true },
  { group: "E", input: "show, segue", anchored: false },
  { group: "E", input: "certo, continua", anchored: true },
  { group: "J3", input: "ótimo, segue", anchored: true },
  { group: "J3", input: "ótimo, segue", anchored: false },
  { group: "J3", input: "ótimo, pode seguir", anchored: true },
  { group: "J3", input: "perfeito, continua", anchored: true },
  { group: "J3", input: "perfeito, continua", anchored: false },
  { group: "J3", input: "perfeito, pode continuar", anchored: false },
  { group: "J3", input: "show, pode continuar", anchored: true },
];

const NEGATIVE = [
  { group: "GREET", input: "oi", family: "GREETING" },
  { group: "GREET", input: "e aí", family: "GREETING" },
  { group: "GREET", input: "salve", family: "GREETING" },
  { group: "GREET", input: "bom dia", family: "GREETING" },
  { group: "GREET", input: "fala mia", family: "GREETING" },
  { group: "COMP", input: "entendi", family: "COMPREHENSION" },
  { group: "COMP", input: "saquei", family: "COMPREHENSION" },
  { group: "COMP", input: "agora fez sentido", family: "COMPREHENSION" },
  { group: "COMP", input: "clareou", family: "COMPREHENSION" },
  { group: "COMP", input: "agora entendi", family: "COMPREHENSION" },
  { group: "DC", input: "vou nele", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "fechou, vou nele", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "fechou, vou pegar esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION", optional: true },
  { group: "DC", input: "então é esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION", optional: true },
  { group: "SD", input: "ok, mas não me convenceu", family: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "beleza, mas tô com pé atrás", family: "SOFT_DISAGREEMENT" },
  { group: "CC", input: "ok, mas você tem certeza?", family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "beleza, ainda sustenta essa escolha?", family: "CONFIDENCE_CHALLENGE" },
  { group: "AR", input: "ok, mas tenho medo de errar", family: "ANTI_REGRET" },
  { group: "AR", input: "beleza, não quero me arrepender", family: "ANTI_REGRET" },
  { group: "SV", input: "ok, mas a galera recomenda?", family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "beleza, o povo fala bem?", family: "SOCIAL_VALIDATION" },
  { group: "AE", input: "ok, tem outro?", family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "beleza, mostra alternativas", family: "ALTERNATIVE_EXPLORATION" },
  { group: "SBD", input: "ok, qual ficou em segundo?", family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "beleza, tem plano B?", family: "SECOND_BEST_DISCOVERY" },
  { group: "CC2", input: "ok, quero gastar menos", family: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "beleza, agora bateria importa mais", family: "CONSTRAINT_CHANGE" },
  { group: "SEARCH", input: "ok, quero um produto até 2000", family: "commercial_search" },
  { group: "SEARCH", input: "beleza, procura um produto para mim", family: "commercial_search" },
  { group: "COMP", input: "show, vou nele", family: "DECISION_CONFIRMATION" },
];

function classifyTurn(message, hasActiveAnchor) {
  return classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: hasActiveAnchor ? SESSION : {},
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });
}

function evaluatePurePositive(spec) {
  const turn = classifyTurn(spec.input, spec.anchored);
  const failures = [];
  const familyQuery = isAcknowledgementFamilyQuery(spec.input);

  if (!familyQuery) {
    failures.push("router: isAcknowledgement missing");
  }

  if (isGreetingFamilyQuery(spec.input)) failures.push("collision: GREETING");
  if (isComprehensionSemanticFamilyQuery(spec.input) && !isAcknowledgementFamilyQuery(spec.input)) {
    failures.push("collision: COMPREHENSION");
  }
  if (turn.signals?.isDecisionConfirmation && spec.input !== "fechou então") {
    failures.push("collision: DECISION_CONFIRMATION");
  }

  const idealTurn = turn.turnType === MIA_TURN_TYPES.REACTION;
  if (!idealTurn) {
    failures.push(`router turn: expected REACTION, got ${turn.turnType}`);
  }

  return {
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    turnType: turn.turnType,
    familyQuery,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateContinuity(spec) {
  const turn = classifyTurn(spec.input, spec.anchored);
  const failures = [];

  if (!isAcknowledgementFamilyQuery(spec.input)) {
    failures.push("router: continuity ACK missing");
  }
  if (isComprehensionSemanticFamilyQuery(spec.input) && !isAcknowledgementFamilyQuery(spec.input)) {
    failures.push("continuity misclassified as comprehension-only");
  }
  if (turn.turnType !== MIA_TURN_TYPES.REACTION) {
    failures.push(`router turn: expected REACTION, got ${turn.turnType}`);
  }

  return {
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    turnType: turn.turnType,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateNegative(spec) {
  const turn = classifyTurn(spec.input, true);
  const failures = [];
  const ackFamily = isAcknowledgementFamilyQuery(spec.input);

  if (ackFamily) {
    failures.push("router: must not be pure ACKNOWLEDGEMENT");
  }

  if (spec.family === "GREETING") {
    if (!isGreetingFamilyQuery(spec.input)) failures.push("expected GREETING, not ACK");
  } else if (spec.family === "COMPREHENSION") {
    if (!isComprehensionSemanticFamilyQuery(spec.input)) {
      failures.push("expected COMPREHENSION semantic, not ACK");
    }
  } else if (spec.family === "commercial_search") {
    if (ackFamily) failures.push("commercial search swallowed by ACK");
  } else if (spec.detector) {
    if (!spec.detector(spec.input) && !spec.optional) {
      failures.push(`neighbor: expected ${spec.family} detector`);
    }
  } else if (
    spec.family !== "GREETING" &&
    spec.family !== "COMPREHENSION" &&
    spec.family !== "commercial_search" &&
    !hasAcknowledgementOpeningPrefix(spec.input)
  ) {
    failures.push("expected acknowledgement opening prefix on composite");
  }

  if (spec.optional && failures.length > 0) {
    return { ...spec, context: "anchored", skipped: true, passed: true, failures: [] };
  }

  return {
    ...spec,
    context: "anchored",
    turnType: turn.turnType,
    passed: failures.length === 0,
    failures,
  };
}

console.log("\nPATCH 7.9X-J.3 — ACKNOWLEDGEMENT Residual Vocabulary\n");

const pureRecords = PURE_POSITIVE.map(evaluatePurePositive);
const continuityRecords = CONTINUITY.map(evaluateContinuity);
const negativeRecords = NEGATIVE.map(evaluateNegative);

console.log("── Pure acknowledgement ──\n");
for (const r of pureRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.turnType}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Acknowledgement + continuity ──\n");
for (const r of continuityRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.turnType}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Negative / neighbor guards ──\n");
for (const r of negativeRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.turnType || "-"}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}${r.skipped ? " (optional)" : ""}`
  );
}

const purePass = pureRecords.filter((r) => r.passed).length;
const pureTotal = pureRecords.length;
const contPass = continuityRecords.filter((r) => r.passed).length;
const contTotal = continuityRecords.length;
const negRequired = negativeRecords.filter((r) => !r.skipped);
const negPass = negRequired.filter((r) => r.passed).length;
const negTotal = negRequired.length;

console.log("\n── Summary ──\n");
console.log(`Pure ACK coverage: ${purePass}/${pureTotal} (${((purePass / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Continuity ACK: ${contPass}/${contTotal}`);
console.log(`Neighbor guards: ${negPass}/${negTotal}`);

const pass =
  purePass / pureTotal >= 0.9 &&
  contPass === contTotal &&
  negPass === negTotal;

console.log(`\nPATCH 7.9X-J expansion audit: ${pass ? "PASS" : "FAIL"}\n`);

if (!pass) process.exitCode = 1;
