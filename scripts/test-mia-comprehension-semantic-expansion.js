/**
 * PATCH 7.9X-H / 7.9X-H.2 — COMPREHENSION Semantic Expansion (local audit)
 *
 * Usage: node scripts/test-mia-comprehension-semantic-expansion.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isComprehensionSemanticFamilyQuery,
  isComprehensionFamilyQuery,
  isAcknowledgementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isAntiRegretFamilyQuery,
  isSocialValidationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isConstraintChangeFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual" },
  lastProducts: [{ product_name: "Produto Recomendado Atual" }],
};

const POSITIVE = [
  { group: "A", input: "entendi", anchored: true },
  { group: "A", input: "entendi", anchored: false },
  { group: "A", input: "agora entendi", anchored: true },
  { group: "A", input: "entendi sim", anchored: true },
  { group: "A", input: "saquei", anchored: true },
  { group: "A", input: "saquei agora", anchored: true },
  { group: "A", input: "peguei", anchored: true },
  { group: "B", input: "entendi a lógica", anchored: true },
  { group: "B", input: "saquei o raciocínio", anchored: true },
  { group: "B", input: "entendi o ponto", anchored: true },
  { group: "B", input: "peguei a ideia", anchored: true },
  { group: "B", input: "entendi o motivo", anchored: true },
  { group: "B", input: "agora entendi por que", anchored: true },
  { group: "C", input: "agora ficou claro", anchored: true },
  { group: "C", input: "clareou", anchored: true },
  { group: "C", input: "boa, clareou", anchored: true },
  { group: "C", input: "ficou mais claro", anchored: true },
  { group: "C", input: "agora ficou mais fácil de entender", anchored: true },
  { group: "C", input: "agora fez sentido", anchored: true },
  { group: "D", input: "faz sentido", anchored: true },
  { group: "D", input: "faz sentido mesmo", anchored: true },
  { group: "D", input: "agora faz sentido", anchored: true },
  { group: "D", input: "agora eu entendi melhor", anchored: true },
  { group: "D", input: "tá explicado", anchored: true },
  { group: "D", input: "bem explicado", anchored: true },
  { group: "E", input: "ahh entendi", anchored: true },
  { group: "E", input: "ata, entendi", anchored: true },
  { group: "E", input: "tá, peguei", anchored: true },
  { group: "E", input: "agora sim", anchored: true },
  { group: "E", input: "boa", anchored: true },
  { group: "E", input: "show, saquei", anchored: true },
  { group: "E", input: "entendi mano", anchored: true },
  { group: "F", input: "agora caiu a ficha", anchored: true },
  { group: "F", input: "agora eu vi", anchored: true },
  { group: "F", input: "agora consegui entender", anchored: true },
  { group: "F", input: "agora conectei os pontos", anchored: true },
  { group: "F", input: "agora ficou redondo", anchored: true },
  { group: "F", input: "agora entendi o caminho", anchored: true },
  { group: "A", input: "tá peguei", anchored: true },
  { group: "C", input: "agora fez sentido", anchored: false },
  { group: "D", input: "faz sentido", anchored: false },
  { group: "A", input: "agora entendi", anchored: false },
  { group: "F", input: "agora caiu a ficha", anchored: false },
  { group: "B", input: "entendi a lógica", anchored: false },
  { group: "E", input: "ahh entendi", anchored: false },
  { group: "C", input: "ficou mais claro", anchored: true },
];

const FAILURE_POSITIVE = [
  { group: "FA", input: "não entendi direito", anchored: true },
  { group: "FA", input: "não entendi direito", anchored: false },
  { group: "FA", input: "não saquei", anchored: true },
  { group: "FA", input: "não peguei", anchored: true },
  { group: "FB", input: "fiquei confuso", anchored: true },
  { group: "FB", input: "me perdi um pouco", anchored: true },
  { group: "FB", input: "estou confuso", anchored: true },
  { group: "FC", input: "não acompanhei", anchored: true },
  { group: "FC", input: "não consegui entender a lógica", anchored: true },
  { group: "FC", input: "me perdi no raciocínio", anchored: true },
  { group: "FD", input: "simplifica pra mim", anchored: true },
  { group: "FD", input: "fala de um jeito mais simples", anchored: true },
  { group: "FD", input: "fala mais simples", anchored: true },
  { group: "FE", input: "pode explicar de novo?", anchored: true },
  { group: "FE", input: "explica de novo?", anchored: true },
  { group: "FE", input: "pode repetir?", anchored: true },
  { group: "FE", input: "não ficou tão claro", anchored: true },
  { group: "FE", input: "explica de outro jeito", anchored: false },
];

const NEGATIVE = [
  { group: "ACK", input: "ok", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "blz", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "beleza", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "certo", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "tá bom", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "FAIL", input: "não entendi", family: "COMPREHENSION_FAILURE" },
  { group: "FAIL", input: "como assim?", family: "COMPREHENSION_FAILURE" },
  { group: "FAIL", input: "explica melhor", family: "COMPREHENSION_FAILURE" },
  { group: "FAIL", input: "fiquei confuso", family: "COMPREHENSION_FAILURE" },
  { group: "FAIL", input: "simplifica pra mim", family: "COMPREHENSION_FAILURE" },
  { group: "GUARD", input: "me explica qual comprar", family: "commercial_explanation" },
  { group: "GUARD", input: "explica a diferença entre esses dois", family: "comparison" },
  { group: "DC", input: "vou nele", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "acho que vou nesse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "então é esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION", optional: true },
  { group: "SD", input: "faz sentido, mas não me convenceu", family: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "entendi, mas tô com pé atrás", family: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "saquei, mas não gostei muito", family: "SOFT_DISAGREEMENT", optional: true },
  { group: "CC", input: "entendi, mas você tem certeza?", family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "saquei, mas ainda sustenta isso?", family: "CONFIDENCE_CHALLENGE" },
  { group: "AR", input: "entendi, mas tenho medo de errar", family: "ANTI_REGRET" },
  { group: "AR", input: "faz sentido, mas não quero me arrepender", family: "ANTI_REGRET" },
  { group: "SV", input: "entendi, mas o povo recomenda?", family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "faz sentido, mas a galera gosta?", family: "SOCIAL_VALIDATION" },
  { group: "AE", input: "entendi, tem outro?", family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "saquei, mostra outras opções", family: "ALTERNATIVE_EXPLORATION" },
  { group: "SBD", input: "entendi, qual ficou em segundo?", family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "saquei, tem plano B?", family: "SECOND_BEST_DISCOVERY" },
  { group: "CC2", input: "entendi, mas quero gastar menos", family: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "faz sentido, mas agora câmera importa mais", family: "CONSTRAINT_CHANGE" },
  { group: "GUARD", input: "entendi, mas tem outro?", family: "alternative_exploration" },
  { group: "GUARD", input: "faz sentido, mas quero gastar menos", family: "constraint_change" },
  { group: "GUARD", input: "saquei, mas tenho medo de errar", family: "anti_regret" },
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

function evaluatePositive(spec) {
  const turn = classifyTurn(spec.input, spec.anchored);
  const failures = [];
  const familyQuery = isComprehensionSemanticFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isComprehension || familyQuery;

  if (!familyQuery) {
    failures.push("router: isComprehension missing");
  }

  if (turn.signals?.isDecisionConfirmation) failures.push("collision: DECISION_CONFIRMATION");
  if (turn.signals?.isSoftDisagreement) failures.push("collision: SOFT_DISAGREEMENT");
  if (turn.signals?.isConfidenceChallenge) failures.push("collision: CONFIDENCE_CHALLENGE");
  if (turn.signals?.isAntiRegret) failures.push("collision: ANTI_REGRET");
  if (turn.signals?.isSocialValidation) failures.push("collision: SOCIAL_VALIDATION");
  if (turn.signals?.isSecondBestDiscovery) failures.push("collision: SECOND_BEST_DISCOVERY");
  if (turn.signals?.isAlternativeExploration) failures.push("collision: ALTERNATIVE_EXPLORATION");
  if (turn.signals?.isConstraintChange) failures.push("collision: CONSTRAINT_CHANGE");

  const idealTurn = turn.turnType === MIA_TURN_TYPES.REACTION;
  if (!idealTurn) {
    failures.push(`router turn: expected REACTION, got ${turn.turnType}`);
  }

  return {
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    turnType: turn.turnType,
    routerSignal,
    familyQuery,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateFailurePositive(spec) {
  const turn = classifyTurn(spec.input, spec.anchored);
  const failures = [];
  const failureQuery = isComprehensionFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isComprehension;

  if (!routerSignal || !failureQuery) {
    failures.push("router: isComprehension failure missing");
  }

  if (turn.signals?.isAcknowledgement && !turn.signals?.isComprehension) {
    failures.push("collision: misclassified as ACK-only");
  }
  if (turn.signals?.isDecisionConfirmation) failures.push("collision: DECISION_CONFIRMATION");
  if (turn.signals?.isSoftDisagreement) failures.push("collision: SOFT_DISAGREEMENT");
  if (turn.signals?.isConfidenceChallenge) failures.push("collision: CONFIDENCE_CHALLENGE");
  if (turn.signals?.isAntiRegret) failures.push("collision: ANTI_REGRET");
  if (turn.signals?.isSocialValidation) failures.push("collision: SOCIAL_VALIDATION");

  const idealTurn = spec.anchored
    ? turn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
    : turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL;

  if (!idealTurn) {
    failures.push(
      `router turn: expected ${spec.anchored ? "EXPLANATION_REQUEST" : "CONVERSATIONAL"}, got ${turn.turnType}`
    );
  }

  return {
    ...spec,
    kind: "failure",
    context: spec.anchored ? "anchored" : "cold",
    turnType: turn.turnType,
    routerSignal,
    failureQuery,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateNegative(spec) {
  const turn = classifyTurn(spec.input, true);
  const failures = [];
  const compSignal = !!turn.signals?.isComprehension;
  const compFamily = isComprehensionSemanticFamilyQuery(spec.input);

  if (spec.family === "COMPREHENSION_FAILURE") {
    if (!compSignal && !compFamily) {
      failures.push("expected comprehension failure signal for clarification request");
    }
    if (turn.turnType !== MIA_TURN_TYPES.EXPLANATION_REQUEST) {
      failures.push(`expected EXPLANATION_REQUEST for failure comprehension, got ${turn.turnType}`);
    }
  } else if (spec.family === "commercial_explanation" || spec.family === "comparison") {
    if (compSignal || (compFamily && spec.family === "commercial_explanation")) {
      failures.push("router: must not be COMPREHENSION_FAILURE");
    }
  } else if (compSignal || compFamily) {
    failures.push("router: must not be positive COMPREHENSION");
  }

  if (spec.detector && !spec.detector(spec.input) && !spec.optional) {
    failures.push(`neighbor: expected ${spec.family} detector`);
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

console.log("\nPATCH 7.9X-H.2 — COMPREHENSION Failure Vocabulary Expansion\n");

const positiveRecords = POSITIVE.map(evaluatePositive);
const failureRecords = FAILURE_POSITIVE.map(evaluateFailurePositive);
const negativeRecords = NEGATIVE.map(evaluateNegative);

console.log("── Positive (comprehension success) ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.turnType} signal=${r.routerSignal}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Positive (comprehension failure) ──\n");
for (const r of failureRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.turnType} isComprehension=${r.routerSignal}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Negative / neighbor guards ──\n");
for (const r of negativeRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.turnType || "-"}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}${r.skipped ? " (optional)" : ""}`
  );
}

const posPass = positiveRecords.filter((r) => r.passed).length;
const posTotal = positiveRecords.length;
const failPass = failureRecords.filter((r) => r.passed).length;
const failTotal = failureRecords.length;
const negRequired = negativeRecords.filter((r) => !r.skipped);
const negPass = negRequired.filter((r) => r.passed).length;
const negTotal = negRequired.length;

console.log("\n── Summary ──\n");
console.log(`Success router coverage: ${posPass}/${posTotal} (${((posPass / posTotal) * 100).toFixed(1)}%)`);
console.log(`Failure router coverage: ${failPass}/${failTotal} (${((failPass / failTotal) * 100).toFixed(1)}%)`);
console.log(`Neighbor guards: ${negPass}/${negTotal}`);

const pass =
  posPass / posTotal >= 0.9 &&
  failPass / failTotal >= 0.9 &&
  negPass === negTotal;
console.log(`\nPATCH 7.9X-H.2 expansion audit: ${pass ? "PASS" : "FAIL"}\n`);

if (!pass) process.exitCode = 1;
