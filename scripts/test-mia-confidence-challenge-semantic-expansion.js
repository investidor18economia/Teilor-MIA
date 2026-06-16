/**
 * PATCH 7.9X-E — CONFIDENCE_CHALLENGE Semantic Expansion (local audit)
 *
 * Usage: node scripts/test-mia-confidence-challenge-semantic-expansion.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isConfidenceChallengeFamilyQuery,
  isAntiRegretFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isSocialValidationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isConstraintChangeFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const MOCK_WINNER = { product_name: "Produto Recomendado Atual", price: "R$ 1.899" };
const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProducts: [MOCK_WINNER],
};
const SESSION_NO_ANCHOR = {};

const POSITIVE = [
  { group: "A", input: "tem certeza?", anchored: false },
  { group: "A", input: "você tem certeza disso?", anchored: false },
  { group: "A", input: "certeza mesmo?", anchored: false },
  { group: "A", input: "dá pra confiar nessa escolha?", anchored: true },
  { group: "A", input: "tem certeza?", anchored: true },
  { group: "B", input: "você mantém essa recomendação?", anchored: true },
  { group: "B", input: "continua achando isso?", anchored: true },
  { group: "B", input: "ainda sustenta essa escolha?", anchored: true },
  { group: "B", input: "ainda recomenda esse?", anchored: true },
  { group: "B", input: "você bateria o martelo nisso?", anchored: true },
  { group: "B", input: "você revisaria essa decisão?", anchored: false },
  { group: "B", input: "isso continua valendo?", anchored: true },
  { group: "B", input: "não mudou sua opinião?", anchored: true },
  { group: "B", input: "você manteria essa recomendação?", anchored: true },
  { group: "B", input: "ainda acha isso?", anchored: true },
  { group: "B", input: "você sustenta essa escolha?", anchored: true },
  { group: "B", input: "essa decisão se mantém?", anchored: true },
  { group: "C", input: "não está forçando a barra?", anchored: true },
  { group: "C", input: "não está exagerando?", anchored: true },
  { group: "C", input: "essa recomendação está bem segura?", anchored: true },
  { group: "C", input: "não tem pegadinha?", anchored: true },
  { group: "D", input: "você compraria esse?", anchored: true },
  { group: "D", input: "você iria nele mesmo?", anchored: true },
  { group: "D", input: "se fosse você, compraria?", anchored: true },
  { group: "D", input: "você colocaria seu dinheiro nisso?", anchored: true },
  { group: "D", input: "ainda iria nele?", anchored: true },
  { group: "E", input: "esse ainda é o melhor mesmo?", anchored: true },
  { group: "E", input: "ele continua sendo o mais seguro?", anchored: true },
  { group: "E", input: "essa ainda é a escolha mais forte?", anchored: true },
  { group: "E", input: "você não mudaria a recomendação?", anchored: true },
  { group: "A", input: "é isso mesmo?", anchored: false },
  { group: "A", input: "crava mesmo?", anchored: true },
  { group: "A", input: "você garante?", anchored: true },
  { group: "B", input: "não vai mudar depois?", anchored: true },
  { group: "B", input: "não vai mudar de ideia?", anchored: true },
  { group: "C", input: "pode ir sem medo?", anchored: true },
  { group: "D", input: "você compraria mesmo?", anchored: true },
  { group: "E", input: "continua sendo sua primeira opção?", anchored: true },
  { group: "B", input: "você manteria essa recomendação?", anchored: false },
  { group: "B", input: "ainda acha isso?", anchored: false },
  { group: "B", input: "isso continua valendo?", anchored: false },
  { group: "A", input: "isso está seguro mesmo?", anchored: true },
  { group: "C", input: "não está puxando demais?", anchored: true },
  { group: "E", input: "mantém ele como vencedor?", anchored: true },
  { group: "F", input: "acho que vou nele, mas você manteria?", anchored: true },
  { group: "F", input: "faz sentido, mas não está forçando a barra?", anchored: true },
];

const NEGATIVE = [
  { group: "AR", input: "não quero me arrepender", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "AR", input: "quero evitar dor de cabeça", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "AR", input: "não quero errar nessa compra", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "SV", input: "a galera recomenda?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "as pessoas aprovam essa escolha?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "tem boa fama?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "DC", input: "acho que vou nele então", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "vou ficar com esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "vou nele então", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "SBD", input: "qual seria a reserva?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "quem ficou em segundo?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "AE", input: "quero explorar outras opções", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "quero ver outras opções", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "CC", input: "quero gastar menos", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "CC", input: "agora bateria importa mais", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "SD", input: "não me convenceu", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT", optional: true },
  { group: "SD", input: "não parece tão bom assim", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT" },
  { group: "GUARD", input: "tem certeza ou tem outro melhor?", family: "alternative_exploration" },
  { group: "GUARD", input: "não vai mudar se eu gastar menos?", family: "constraint_change" },
  { group: "GUARD", input: "crava esse ou qual ficou em segundo?", family: "second_best" },
  { group: "GUARD", input: "entendi, mas não me convenceu", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT" },
  { group: "GUARD", input: "faz sentido, mas tem outro melhor?", family: "alternative_exploration" },
];

function classifyTurn(message, hasActiveAnchor) {
  return classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR,
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });
}

function evaluatePositive(spec) {
  const turn = classifyTurn(spec.input, spec.anchored);
  const failures = [];
  const familyQuery = isConfidenceChallengeFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isConfidenceChallenge;

  if (!routerSignal && !familyQuery) {
    failures.push("router: isConfidenceChallenge missing");
  }

  if (turn.signals?.isAntiRegret) failures.push("collision: ANTI_REGRET");
  if (turn.signals?.isSocialValidation) failures.push("collision: SOCIAL_VALIDATION");
  if (turn.signals?.isDecisionConfirmation) failures.push("collision: DECISION_CONFIRMATION");
  if (turn.signals?.isSecondBestDiscovery) failures.push("collision: SECOND_BEST_DISCOVERY");
  if (turn.signals?.isAlternativeExploration) failures.push("collision: ALTERNATIVE_EXPLORATION");
  if (turn.signals?.isConstraintChange) failures.push("collision: CONSTRAINT_CHANGE");
  if (turn.signals?.isSoftDisagreement) failures.push("collision: SOFT_DISAGREEMENT");

  const idealTurn =
    !spec.anchored
      ? turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL
      : turn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST ||
        turn.turnType === MIA_TURN_TYPES.FOLLOW_UP ||
        turn.turnType === MIA_TURN_TYPES.OBJECTION;

  if (!idealTurn) {
    failures.push(`router turn: expected CC hold, got ${turn.turnType}`);
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
  const ccSignal = !!turn.signals?.isConfidenceChallenge;
  const ccFamily = isConfidenceChallengeFamilyQuery(spec.input);

  if (ccSignal || ccFamily) {
    failures.push("router: must not be CONFIDENCE_CHALLENGE");
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

console.log("\nPATCH 7.9X-E — CONFIDENCE_CHALLENGE Semantic Expansion\n");

const positiveRecords = POSITIVE.map(evaluatePositive);
const negativeRecords = NEGATIVE.map(evaluateNegative);

console.log("── Positive (confidence challenge) ──\n");
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
const routerPct = ((posPass / posTotal) * 100).toFixed(1);

console.log("\n── Summary ──\n");
console.log(`Positive router coverage: ${posPass}/${posTotal} (${routerPct}%)`);
console.log(`Neighbor guards: ${negPass}/${negTotal}`);

const pass = posPass / posTotal >= 0.9 && negPass === negTotal;
console.log(`\nPATCH 7.9X-E expansion audit: ${pass ? "PASS" : "FAIL"}\n`);

if (!pass) process.exitCode = 1;
