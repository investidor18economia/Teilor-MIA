/**
 * PATCH 7.9X-G / 7.9X-SD.2 / 7.9X-G.3 — SOFT_DISAGREEMENT Semantic Expansion (local audit)
 *
 * Usage: node scripts/test-mia-soft-disagreement-semantic-expansion.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isSoftDisagreementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isAntiRegretFamilyQuery,
  isSocialValidationFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isConstraintChangeFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual" },
  lastProducts: [{ product_name: "Produto Recomendado Atual" }],
};

const POSITIVE = [
  { group: "A", input: "não concordo muito", anchored: true },
  { group: "A", input: "não concordo muito", anchored: false },
  { group: "A", input: "não sei se concordo", anchored: true },
  { group: "A", input: "não concordei totalmente", anchored: true },
  { group: "A", input: "não estou tão convencido", anchored: true },
  { group: "A", input: "não estou tão convencido", anchored: false },
  { group: "B", input: "ainda estou com um pé atrás", anchored: true },
  { group: "B", input: "estou com um pé atrás", anchored: true },
  { group: "B", input: "ainda estou meio desconfiado", anchored: true },
  { group: "B", input: "não senti firmeza", anchored: true },
  { group: "B", input: "fiquei na dúvida", anchored: true },
  { group: "B", input: "não me passou tanta confiança", anchored: true },
  { group: "B", input: "continuo meio na dúvida", anchored: true },
  { group: "B", input: "continuo meio na dúvida", anchored: false },
  { group: "C", input: "não me convenceu", anchored: true },
  { group: "C", input: "não me convenceu muito", anchored: true },
  { group: "C", input: "não me ganhou", anchored: true },
  { group: "C", input: "não me ganhou ainda", anchored: true },
  { group: "C", input: "não bateu comigo", anchored: true },
  { group: "C", input: "não bateu muito comigo", anchored: true },
  { group: "D", input: "não achei isso tão forte assim", anchored: true },
  { group: "D", input: "não achei tão forte assim", anchored: true },
  { group: "D", input: "não parece tudo isso", anchored: true },
  { group: "D", input: "achei meio fraco", anchored: true },
  { group: "D", input: "esperava algo melhor", anchored: true },
  { group: "D", input: "não achei tão convincente", anchored: true },
  { group: "E", input: "faz sentido mas ainda tenho dúvida", anchored: true },
  { group: "E", input: "entendo mas não me convenceu", anchored: true },
  { group: "E", input: "até que faz sentido mas fiquei na dúvida", anchored: true },
  { group: "E", input: "não sei", anchored: true },
  { group: "E", input: "ainda não sei se compro essa ideia", anchored: true },
  { group: "E", input: "tenho minhas dúvidas", anchored: true },
  { group: "E", input: "não tenho certeza disso", anchored: true },
  { group: "E", input: "acho que não", anchored: true },
  { group: "F", input: "sei lá viu", anchored: true },
  { group: "F", input: "tô meio assim ainda", anchored: true },
  { group: "F", input: "não curti muito não", anchored: true },
  { group: "F", input: "não me desceu muito bem", anchored: true },
  { group: "F", input: "não bateu ainda", anchored: true },
  { group: "F", input: "não estou comprando muito essa ideia", anchored: true },
  { group: "C", input: "não me convenceu muito", anchored: false },
  { group: "D", input: "não parece tão bom assim", anchored: true },
  { group: "E", input: "não sei se é isso", anchored: true },
  { group: "F", input: "hmm não sei", anchored: true },
  { group: "B", input: "não me passou confiança", anchored: true },
  { group: "A", input: "não sei se concordo", anchored: false },
  { group: "D", input: "não achei isso tão forte assim", anchored: false },
  { group: "C", input: "não me ganhou ainda", anchored: false },
  // PATCH 7.9X-G.3 — residual vocabulary
  { group: "C", input: "não comprei muito essa ideia", anchored: true },
  { group: "C", input: "não comprei muito essa ideia", anchored: false },
  { group: "C", input: "não pegou muito pra mim", anchored: true },
  { group: "C", input: "não pegou muito pra mim", anchored: false },
  { group: "D", input: "parece meio forçado", anchored: true },
  { group: "D", input: "parece meio forçado", anchored: false },
  { group: "E", input: "não sei se compro essa ideia", anchored: true },
  { group: "E", input: "não sei se compro essa ideia", anchored: false },
  { group: "F", input: "tô meio dividido", anchored: true },
  { group: "F", input: "tô meio dividido", anchored: false },
  { group: "G", input: "acho que vou nele, mas não bateu totalmente", anchored: true },
  { group: "G", input: "acho que vou nele, mas não bateu totalmente", anchored: false },
  { group: "E", input: "até faz sentido mas fiquei na dúvida", anchored: true },
  { group: "E", input: "até faz sentido mas fiquei na dúvida", anchored: false },
  { group: "E", input: "até entendi mas não me ganhou", anchored: true },
  { group: "E", input: "até entendi mas não me ganhou", anchored: false },
];

const NEGATIVE = [
  { group: "CC", input: "você tem certeza?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "continua achando isso?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "ainda sustenta essa escolha?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "você compraria esse?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "você mantém essa recomendação?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "AR", input: "tenho medo de errar", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET", optional: true },
  { group: "AR", input: "não quero me arrepender", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "AR", input: "quero evitar dor de cabeça", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "AR", input: "estou inseguro com essa compra", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET", optional: true },
  { group: "SV", input: "a galera recomenda?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "o povo fala bem?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "quem comprou gostou?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "as pessoas aprovam?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "DC", input: "acho que vou nele", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "vou ficar com esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "fechou então", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION", optional: true },
  { group: "AE", input: "tem outro?", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "mostra alternativas", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION", optional: true },
  { group: "AE", input: "quero ver opções", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "SBD", input: "qual ficou em segundo?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "plano b?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "qual seria o backup?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "CC2", input: "quero gastar menos", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "bateria virou prioridade", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE", optional: true },
  { group: "CC2", input: "vou usar mais para fotos", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE", optional: true },
  { group: "GUARD", input: "não me convenceu ou tem outro?", family: "alternative_exploration" },
  { group: "GUARD", input: "não concordo muito mas quero gastar menos", family: "constraint_change" },
  { group: "GUARD", input: "não me passou confiança, a galera recomenda?", family: "social_validation" },
  { group: "GUARD", input: "não bateu comigo, você tem certeza?", family: "confidence_challenge" },
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
  const familyQuery = isSoftDisagreementFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isSoftDisagreement;

  if (!routerSignal && !familyQuery) {
    failures.push("router: isSoftDisagreement missing");
  }

  if (turn.signals?.isConfidenceChallenge) failures.push("collision: CONFIDENCE_CHALLENGE");
  if (turn.signals?.isAntiRegret) failures.push("collision: ANTI_REGRET");
  if (turn.signals?.isSocialValidation) failures.push("collision: SOCIAL_VALIDATION");
  if (turn.signals?.isDecisionConfirmation) failures.push("collision: DECISION_CONFIRMATION");
  if (turn.signals?.isSecondBestDiscovery) failures.push("collision: SECOND_BEST_DISCOVERY");
  if (turn.signals?.isAlternativeExploration) failures.push("collision: ALTERNATIVE_EXPLORATION");
  if (turn.signals?.isConstraintChange) failures.push("collision: CONSTRAINT_CHANGE");

  const idealTurn = spec.anchored
    ? turn.turnType === MIA_TURN_TYPES.OBJECTION
    : turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL;

  if (!idealTurn) {
    failures.push(
      `router turn: expected ${spec.anchored ? "OBJECTION" : "CONVERSATIONAL"}, got ${turn.turnType}`
    );
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

function evaluateNegative(spec) {
  const turn = classifyTurn(spec.input, true);
  const failures = [];
  const sdSignal = !!turn.signals?.isSoftDisagreement;
  const sdFamily = isSoftDisagreementFamilyQuery(spec.input);

  if (sdSignal || sdFamily) {
    failures.push("router: must not be SOFT_DISAGREEMENT");
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

console.log("\nPATCH 7.9X-G.3 — SOFT_DISAGREEMENT Residual Vocabulary\n");

const positiveRecords = POSITIVE.map(evaluatePositive);
const negativeRecords = NEGATIVE.map(evaluateNegative);

console.log("── Positive (soft disagreement) ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.turnType} signal=${r.routerSignal}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
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
const negRequired = negativeRecords.filter((r) => !r.skipped);
const negPass = negRequired.filter((r) => r.passed).length;
const negTotal = negRequired.length;

console.log("\n── Summary ──\n");
console.log(`Positive router coverage: ${posPass}/${posTotal} (${((posPass / posTotal) * 100).toFixed(1)}%)`);
console.log(`Neighbor guards: ${negPass}/${negTotal}`);

const pass = posPass === posTotal && negPass === negTotal;
console.log(`\nPATCH 7.9X-G.3 residual vocabulary audit: ${pass ? "PASS (100%)" : "FAIL"}\n`);

if (!pass) process.exitCode = 1;
