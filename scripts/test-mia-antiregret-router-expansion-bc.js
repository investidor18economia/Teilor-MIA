/**
 * PATCH 7.9X-D.4 — ANTI_REGRET Router Expansion B/C (local audit)
 *
 * Router-only coverage for implicit fear (B) and colloquial receio (C),
 * plus groups D–F and neighbor collision guards.
 *
 * Usage: node scripts/test-mia-antiregret-router-expansion-bc.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isConstraintChangeFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isAcknowledgementFamilyQuery,
  isGreetingFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual" },
  lastProducts: [{ product_name: "Produto Recomendado Atual" }],
};

const POSITIVE = [
  { group: "A", input: "tenho medo de errar" },
  { group: "A", input: "não quero me arrepender" },
  { group: "A", input: "não quero escolher errado" },
  { group: "A", input: "não quero fazer besteira" },
  { group: "A", input: "tenho medo de escolher errado" },
  { group: "A", input: "não quero errar nessa compra" },
  { group: "A", input: "medo de errar nessa escolha" },
  { group: "A", input: "não quero me frustrar depois" },
  { group: "A", input: "quero evitar dor de cabeça" },
  { group: "A", input: "não quero escolher mal" },

  { group: "B", input: "é muito dinheiro pra mim" },
  { group: "B", input: "essa compra pesa" },
  { group: "B", input: "isso pesa no bolso" },
  { group: "B", input: "não quero jogar dinheiro fora" },
  { group: "B", input: "não quero gastar errado" },
  { group: "B", input: "é uma grana alta" },
  { group: "B", input: "não posso errar nessa compra" },
  { group: "B", input: "se eu errar vai doer" },
  { group: "B", input: "não quero desperdiçar grana" },
  { group: "B", input: "me dá insegurança gastar isso" },
  { group: "B", input: "fico pensando se vale o risco" },
  { group: "B", input: "tenho receio de investir errado" },

  { group: "C", input: "tô cabreiro" },
  { group: "C", input: "tô meio cabreiro" },
  { group: "C", input: "tô com receio" },
  { group: "C", input: "fiquei com receio" },
  { group: "C", input: "tô inseguro" },
  { group: "C", input: "tô meio inseguro" },
  { group: "C", input: "não sei se é seguro ir nesse" },
  { group: "C", input: "não sei se confio nessa escolha" },
  { group: "C", input: "tô com o pé atrás por medo de errar" },
  { group: "C", input: "tô apreensivo com essa compra" },
  { group: "C", input: "tô meio receoso" },
  { group: "C", input: "tô inseguro nessa" },

  { group: "D", input: "não quero dor de cabeça depois" },
  { group: "D", input: "não quero me incomodar depois" },
  { group: "D", input: "quero evitar problema depois" },
  { group: "D", input: "quero ficar tranquilo depois da compra" },
  { group: "D", input: "quero comprar e não me preocupar" },
  { group: "D", input: "quero algo que não me dê trabalho" },
  { group: "D", input: "não quero arrependimento depois" },
  { group: "D", input: "quero evitar dor de cabeça" },
  { group: "D", input: "quero uma escolha tranquila" },
  { group: "D", input: "quero algo que não me incomode depois" },

  { group: "E", input: "será que eu vou me arrepender?" },
  { group: "E", input: "eu vou me arrepender?" },
  { group: "E", input: "será que vou fazer besteira?" },
  { group: "E", input: "será que é seguro pra mim?" },
  { group: "E", input: "será que vou me frustrar?" },
  { group: "E", input: "será que estou escolhendo errado?" },
  { group: "E", input: "vou me arrepender?" },
  { group: "E", input: "e se eu me arrepender?" },

  { group: "F", input: "acho que vou nele, mas tenho medo de errar" },
  { group: "F", input: "parece ser esse, mas tô inseguro" },
  { group: "F", input: "acho que fechou, mas tô cabreiro" },
  { group: "F", input: "gostei dele, mas é muito dinheiro pra mim" },
  { group: "F", input: "vou nesse, mas não quero me arrepender" },
  { group: "F", input: "parece ser esse mas tenho receio" },
  { group: "F", input: "acho que é esse, mas não quero errar" },
  { group: "F", input: "fechou nele, mas tô com receio" },
];

const NEGATIVE = [
  { group: "CC", input: "você tem certeza?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "continua achando isso?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "sustenta essa recomendação?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "você compraria esse?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "SV", input: "a galera recomenda?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "o povo fala bem?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "quem comprou gostou?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "tem muita reclamação?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "quem comprou se arrepende?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "o pessoal reclama?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "a galera teve problema?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SD", input: "não me convenceu", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "tô meio assim", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "não curti muito", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "não me desceu bem", detector: isSoftDisagreementFamilyQuery, family: "SOFT_DISAGREEMENT" },
  { group: "DC", input: "vou nele", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "acho que vou nesse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "então é esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "DC", input: "fechou, vou pegar esse", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION" },
  { group: "CC2", input: "quero gastar menos", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "agora bateria importa mais", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "vou usar mais para fotos", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "AE", input: "tem outro?", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "mostra alternativas", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "quero ver opções", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "SBD", input: "qual ficou em segundo?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "plano b?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "COMP", input: "entendi", detector: isComprehensionSemanticFamilyQuery, family: "COMPREHENSION" },
  { group: "COMP", input: "agora fez sentido", detector: isComprehensionSemanticFamilyQuery, family: "COMPREHENSION" },
  { group: "COMP", input: "saquei o raciocínio", detector: isComprehensionSemanticFamilyQuery, family: "COMPREHENSION" },
  { group: "ACK", input: "ok", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "blz", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "show", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "GREET", input: "oi", detector: isGreetingFamilyQuery, family: "GREETING" },
  { group: "GREET", input: "bom dia", detector: isGreetingFamilyQuery, family: "GREETING" },
  { group: "GREET", input: "salve", detector: isGreetingFamilyQuery, family: "GREETING" },
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
  const turn = classifyTurn(spec.input, true);
  const failures = [];
  const familyQuery = isAntiRegretFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isAntiRegret;

  if (!routerSignal && !familyQuery) {
    failures.push("router: isAntiRegret missing");
  }
  if (turn.signals?.isConfidenceChallenge) failures.push("collision: CONFIDENCE_CHALLENGE");
  if (turn.signals?.isSocialValidation) failures.push("collision: SOCIAL_VALIDATION");
  if (turn.signals?.isSoftDisagreement) failures.push("collision: SOFT_DISAGREEMENT");
  if (turn.signals?.isDecisionConfirmation && !/\b(mas|porem)\b/i.test(spec.input)) {
    failures.push("collision: DECISION_CONFIRMATION");
  }
  if (turn.signals?.isAlternativeExploration) failures.push("collision: ALTERNATIVE_EXPLORATION");
  if (turn.signals?.isSecondBestDiscovery) failures.push("collision: SECOND_BEST_DISCOVERY");
  if (turn.signals?.isConstraintChange) failures.push("collision: CONSTRAINT_CHANGE");

  return {
    ...spec,
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
  const arSignal = !!turn.signals?.isAntiRegret;
  const arFamily = isAntiRegretFamilyQuery(spec.input);

  if (arSignal || arFamily) {
    failures.push("router: must not be ANTI_REGRET");
  }

  return {
    ...spec,
    turnType: turn.turnType,
    neighborMatch: spec.detector ? spec.detector(spec.input) : null,
    passed: failures.length === 0,
    failures,
  };
}

console.log("\nPATCH 7.9X-D.4 — ANTI_REGRET Router Expansion B/C\n");

const positiveRecords = POSITIVE.map(evaluatePositive);
const negativeRecords = NEGATIVE.map(evaluateNegative);

console.log("── Positive (anti-regret B/C) ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → signal=${r.routerSignal}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Negative / neighbor guards ──\n");
for (const r of negativeRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.turnType}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

const posPass = positiveRecords.filter((r) => r.passed).length;
const negPass = negativeRecords.filter((r) => r.passed).length;
const posRate = Math.round((posPass / positiveRecords.length) * 100);
const totalPass = posPass + negPass;
const totalRate = Math.round((totalPass / (positiveRecords.length + negativeRecords.length)) * 100);

console.log("\n── Summary ──\n");
console.log(`Positive: ${posPass}/${positiveRecords.length} (${posRate}%)`);
console.log(`Negative: ${negPass}/${negativeRecords.length}`);
console.log(`Total: ${totalPass}/${positiveRecords.length + negativeRecords.length} (${totalRate}%)`);

const groupSummary = ["A", "B", "C", "D", "E", "F"].map((g) => {
  const rows = positiveRecords.filter((r) => r.group === g);
  const pass = rows.filter((r) => r.passed).length;
  return `  Group ${g}: ${pass}/${rows.length}`;
});
console.log("\n── Group coverage ──\n");
for (const line of groupSummary) console.log(line);

const thresholdMet = posRate >= 90 && negPass === negativeRecords.length;
console.log(`\nVerdict: ${thresholdMet ? "PASS (ROBUST B/C)" : "FAIL"}\n`);
process.exit(thresholdMet ? 0 : 1);
