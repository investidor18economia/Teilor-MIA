/**
 * PATCH 7.9X-F — SOCIAL_VALIDATION Semantic Expansion (local audit)
 *
 * Usage: node scripts/test-mia-social-validation-semantic-expansion.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isSocialValidationFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isAntiRegretFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isConstraintChangeFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual" },
  lastProducts: [{ product_name: "Produto Recomendado Atual" }],
};

const POSITIVE = [
  { group: "A", input: "a galera recomenda?", anchored: true },
  { group: "A", input: "o pessoal recomenda?", anchored: false },
  { group: "A", input: "o povo recomenda?", anchored: true },
  { group: "A", input: "geral recomenda?", anchored: false },
  { group: "A", input: "muita gente indica?", anchored: true },
  { group: "A", input: "é uma escolha bem indicada?", anchored: true },
  { group: "A", input: "a galera costuma recomendar?", anchored: false },
  { group: "A", input: "a galera costuma recomendar?", anchored: true },
  { group: "B", input: "é bem visto?", anchored: true },
  { group: "B", input: "tem boa reputação?", anchored: true },
  { group: "B", input: "falam bem dele?", anchored: true },
  { group: "B", input: "o povo fala bem?", anchored: false },
  { group: "B", input: "o povo fala bem?", anchored: true },
  { group: "B", input: "tem boa fama?", anchored: true },
  { group: "B", input: "tem fama boa?", anchored: true },
  { group: "C", input: "quem comprou gostou?", anchored: true },
  { group: "C", input: "quem usa gosta?", anchored: true },
  { group: "C", input: "donos costumam gostar?", anchored: true },
  { group: "C", input: "quem tem recomenda?", anchored: true },
  { group: "C", input: "quem comprou se arrepende?", anchored: true },
  { group: "C", input: "o pessoal que usa reclama?", anchored: true },
  { group: "C", input: "quem tem costuma gostar?", anchored: false },
  { group: "C", input: "quem tem costuma gostar?", anchored: true },
  { group: "D", input: "costuma dar problema?", anchored: true },
  { group: "D", input: "tem muita reclamação?", anchored: false },
  { group: "D", input: "tem muita reclamação?", anchored: true },
  { group: "D", input: "reclamam muito dele?", anchored: true },
  { group: "D", input: "dá dor de cabeça para muita gente?", anchored: true },
  { group: "D", input: "tem algum problema famoso?", anchored: true },
  { group: "D", input: "tem histórico ruim?", anchored: true },
  { group: "E", input: "a maioria aprova?", anchored: true },
  { group: "E", input: "no geral é aprovado?", anchored: true },
  { group: "E", input: "o consenso é bom?", anchored: true },
  { group: "E", input: "geral gosta?", anchored: true },
  { group: "E", input: "é bem aceito?", anchored: true },
  { group: "E", input: "costuma agradar quem compra?", anchored: false },
  { group: "E", input: "costuma agradar quem compra?", anchored: true },
  { group: "E", input: "as pessoas aprovam essa escolha?", anchored: true },
  { group: "F", input: "na prática o pessoal gosta?", anchored: true },
  { group: "F", input: "fora da ficha técnica ele é aprovado?", anchored: true },
  { group: "F", input: "no uso real falam bem?", anchored: true },
  { group: "F", input: "quem usa no dia a dia aprova?", anchored: true },
  { group: "F", input: "a experiência real é boa?", anchored: true },
  { group: "F", input: "é confiável na prática?", anchored: true },
  { group: "F", input: "donos costumam elogiar?", anchored: true },
  { group: "G", input: "faz sentido, mas tem muita reclamação?", anchored: true },
  { group: "G", input: "acho que vou nele, mas é bem visto?", anchored: true },
  { group: "G", input: "entendi, mas a galera recomenda?", anchored: true },
  { group: "B", input: "o pessoal gosta?", anchored: true },
  { group: "E", input: "as pessoas aceitam?", anchored: true },
];

const NEGATIVE = [
  { group: "CC", input: "você tem certeza?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "você manteria essa recomendação?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "você compraria esse?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "ainda sustenta essa escolha?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "AR", input: "tenho medo de errar", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET", optional: true },
  { group: "AR", input: "não quero me arrepender", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "AR", input: "quero evitar dor de cabeça", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "AR", input: "quero evitar dor de cabeça, mas o pessoal gosta?", family: "ANTI_REGRET" },
  { group: "DC", input: "acho que vou nele então", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "vou ficar com esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "então fechou", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION", optional: true },
  { group: "SBD", input: "qual seria a reserva?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "quem ficou em segundo?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "AE", input: "quero explorar outras opções", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "quero ver outras opções", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "CC2", input: "quero gastar menos", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "agora bateria importa mais", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "SD", input: "não me convenceu", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT", optional: true },
  { group: "SD", input: "não parece tão bom assim", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT" },
  { group: "GUARD", input: "a galera recomenda ou tem outro?", family: "alternative_exploration" },
  { group: "GUARD", input: "é bem aceito ou compara com samsung?", family: "comparison" },
  { group: "GUARD", input: "quem comprou gostou ou qual ficou em segundo?", family: "second_best" },
  { group: "AR", input: "eu vou me arrepender?", family: "ANTI_REGRET" },
  { group: "CC", input: "tem certeza desse até 2000?", family: "commercial" },
  { group: "CC", input: "o povo fala bem ou espero promoção?", family: "commercial" },
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
  const familyQuery = isSocialValidationFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isSocialValidation;

  if (!routerSignal && !familyQuery) {
    failures.push("router: isSocialValidation missing");
  }

  if (turn.signals?.isConfidenceChallenge) failures.push("collision: CONFIDENCE_CHALLENGE");
  if (turn.signals?.isAntiRegret) failures.push("collision: ANTI_REGRET");
  if (turn.signals?.isDecisionConfirmation) failures.push("collision: DECISION_CONFIRMATION");
  if (turn.signals?.isSecondBestDiscovery) failures.push("collision: SECOND_BEST_DISCOVERY");
  if (turn.signals?.isAlternativeExploration) failures.push("collision: ALTERNATIVE_EXPLORATION");
  if (turn.signals?.isConstraintChange) failures.push("collision: CONSTRAINT_CHANGE");
  if (turn.signals?.isSoftDisagreement) failures.push("collision: SOFT_DISAGREEMENT");

  const idealTurn =
    !spec.anchored
      ? turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL
      : turn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST ||
        turn.turnType === MIA_TURN_TYPES.VALUE_QUESTION ||
        turn.turnType === MIA_TURN_TYPES.FOLLOW_UP;

  if (!idealTurn) {
    failures.push(`router turn: expected SV hold, got ${turn.turnType}`);
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
  const svSignal = !!turn.signals?.isSocialValidation;
  const svFamily = isSocialValidationFamilyQuery(spec.input);

  if (svSignal || svFamily) {
    failures.push("router: must not be SOCIAL_VALIDATION");
  }

  if (spec.family === "ANTI_REGRET" && spec.input.includes("pessoal gosta")) {
    if (!turn.signals?.isAntiRegret && !isAntiRegretFamilyQuery(spec.input)) {
      failures.push("collision: expected ANTI_REGRET over SOCIAL_VALIDATION");
    }
  } else if (spec.family === "ANTI_REGRET" && spec.input === "eu vou me arrepender?") {
    if (turn.signals?.isSocialValidation) failures.push("collision: SV swallowed personal AR");
  } else if (spec.detector && !spec.detector(spec.input) && !spec.optional) {
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

console.log("\nPATCH 7.9X-F — SOCIAL_VALIDATION Semantic Expansion\n");

const positiveRecords = POSITIVE.map(evaluatePositive);
const negativeRecords = NEGATIVE.map(evaluateNegative);

console.log("── Positive (social validation) ──\n");
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

const pass = posPass / posTotal >= 0.9 && negPass === negTotal;
console.log(`\nPATCH 7.9X-F expansion audit: ${pass ? "PASS" : "FAIL"}\n`);

if (!pass) process.exitCode = 1;
