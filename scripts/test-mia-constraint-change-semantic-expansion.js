/**
 * PATCH 7.9X-CC — CONSTRAINT_CHANGE Semantic Expansion (local audit)
 *
 * Router-only coverage for informal budget, priority, use-case and preference shifts.
 *
 * Usage: node scripts/test-mia-constraint-change-semantic-expansion.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isConstraintChangeFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
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
  { group: "A", input: "quero gastar menos" },
  { group: "A", input: "agora quero economizar" },
  { group: "A", input: "pensei melhor e quero gastar menos" },
  { group: "A", input: "ficou caro pra mim" },
  { group: "A", input: "tá puxado" },
  { group: "A", input: "pesou no bolso" },
  { group: "A", input: "passou do que eu queria" },
  { group: "A", input: "preciso baixar o valor" },
  { group: "A", input: "meu orçamento diminuiu" },
  { group: "A", input: "quero algo mais em conta" },
  { group: "A", input: "prefiro gastar menos" },
  { group: "A", input: "quero economizar mais" },

  { group: "B", input: "câmera virou prioridade" },
  { group: "B", input: "bateria virou prioridade" },
  { group: "B", input: "desempenho virou prioridade" },
  { group: "B", input: "conforto virou prioridade" },
  { group: "B", input: "agora câmera pesa mais" },
  { group: "B", input: "agora bateria importa mais" },
  { group: "B", input: "preciso priorizar autonomia" },
  { group: "B", input: "quero priorizar durabilidade" },
  { group: "B", input: "preço virou prioridade" },
  { group: "B", input: "desempenho ficou mais importante" },
  { group: "B", input: "quero focar em durabilidade" },
  { group: "B", input: "agora qualidade importa mais" },

  { group: "C", input: "vou jogar mais" },
  { group: "C", input: "vou usar mais para fotos" },
  { group: "C", input: "vou usar mais para trabalhar" },
  { group: "C", input: "vou usar mais fora de casa" },
  { group: "C", input: "vou usar mais no dia a dia pesado" },
  { group: "C", input: "meu uso mudou" },
  { group: "C", input: "agora o foco é outro" },
  { group: "C", input: "vou usar de outro jeito" },
  { group: "C", input: "pensei melhor sobre meu uso" },
  { group: "C", input: "preciso considerar outro tipo de uso" },
  { group: "C", input: "vou usar mais para estudo" },
  { group: "C", input: "vou trabalhar bastante nele" },
  { group: "C", input: "agora quero para jogos" },

  { group: "D", input: "câmera não importa tanto" },
  { group: "D", input: "bateria não é tão importante agora" },
  { group: "D", input: "desempenho deixou de ser prioridade" },
  { group: "D", input: "preço não é mais o único critério" },
  { group: "D", input: "posso abrir mão de câmera" },
  { group: "D", input: "posso sacrificar desempenho" },
  { group: "D", input: "não ligo tanto para isso" },
  { group: "D", input: "esse ponto perdeu peso para mim" },
  { group: "D", input: "autonomia não importa tanto agora" },
  { group: "D", input: "qualidade deixou de ser prioridade" },

  { group: "E", input: "mudei de ideia" },
  { group: "E", input: "pensei melhor" },
  { group: "E", input: "olhando melhor agora" },
  { group: "E", input: "pensando bem" },
  { group: "E", input: "acho que meu foco mudou" },
  { group: "E", input: "minha prioridade mudou" },
  { group: "E", input: "quero recalibrar a escolha" },
  { group: "E", input: "preciso reavaliar com outro critério" },
  { group: "E", input: "pensei melhor sobre o orçamento" },
  { group: "E", input: "mudei de ideia sobre a prioridade" },

  { group: "F", input: "gostei dele, mas quero gastar menos" },
  { group: "F", input: "acho que vou nele, mas câmera virou prioridade" },
  { group: "F", input: "esse parece bom, mas bateria importa mais" },
  { group: "F", input: "gostei da recomendação, mas tá puxado" },
  { group: "F", input: "parece certo, mas meu foco mudou" },
  { group: "F", input: "vou nesse se tiver algo mais em conta" },
  { group: "F", input: "acho que fechou, mas pensei melhor no orçamento" },
  { group: "F", input: "parece ser esse, mas quero economizar" },
  { group: "F", input: "gostei dele mas agora bateria pesa mais" },
  { group: "F", input: "esse parece certo mas vou usar mais para fotos" },
];

const NEGATIVE = [
  { group: "AR", input: "tenho medo de errar" },
  { group: "AR", input: "não quero me arrepender" },
  { group: "AR", input: "é muito dinheiro pra mim" },
  { group: "AR", input: "não quero jogar dinheiro fora" },
  { group: "AR", input: "tô cabreiro" },
  { group: "AR", input: "é muito dinheiro pra mim, não quero errar" },
  { group: "CC2", input: "você tem certeza?" },
  { group: "CC2", input: "continua achando isso?" },
  { group: "CC2", input: "sustenta essa recomendação?" },
  { group: "CC2", input: "você compraria esse?" },
  { group: "SV", input: "a galera recomenda?" },
  { group: "SV", input: "o povo fala bem?" },
  { group: "SV", input: "quem comprou gostou?" },
  { group: "SD", input: "não me convenceu" },
  { group: "SD", input: "tô meio assim" },
  { group: "SD", input: "não curti muito" },
  { group: "DC", input: "vou nele" },
  { group: "DC", input: "acho que vou nesse" },
  { group: "DC", input: "então é esse" },
  { group: "DC", input: "fechou, vou pegar esse" },
  { group: "AE", input: "tem outro?" },
  { group: "AE", input: "mostra alternativas" },
  { group: "AE", input: "quero ver opções" },
  { group: "SBD", input: "qual ficou em segundo?" },
  { group: "SBD", input: "plano b?" },
  { group: "COMP", input: "entendi" },
  { group: "COMP", input: "agora fez sentido" },
  { group: "ACK", input: "ok" },
  { group: "ACK", input: "blz" },
  { group: "GREET", input: "oi" },
  { group: "GREET", input: "bom dia" },
  { group: "COMM", input: "quero um produto até 2000" },
  { group: "COMM", input: "quero comprar um notebook" },
  { group: "COMM", input: "procura uma TV" },
  { group: "GUARD", input: "quero gastar menos, tem outro?" },
  { group: "GUARD", input: "ficou caro pra mim, compara com samsung?" },
];

const AR_CC_COLLISION = [
  { input: "ficou caro pra mim, quero gastar menos", expected: "CONSTRAINT_CHANGE" },
  { input: "é muito dinheiro pra mim, não quero errar", expected: "ANTI_REGRET" },
  { input: "pesou no bolso", expected: "CONSTRAINT_CHANGE" },
  { input: "essa compra pesa", expected: "ANTI_REGRET" },
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
  const familyQuery = isConstraintChangeFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isConstraintChange;

  if (!routerSignal && !familyQuery) {
    failures.push("router: isConstraintChange missing");
  }
  if (turn.signals?.isAntiRegret) failures.push("collision: ANTI_REGRET");
  if (turn.signals?.isConfidenceChallenge) failures.push("collision: CONFIDENCE_CHALLENGE");
  if (turn.signals?.isSocialValidation) failures.push("collision: SOCIAL_VALIDATION");
  if (turn.signals?.isSoftDisagreement) failures.push("collision: SOFT_DISAGREEMENT");
  if (turn.signals?.isDecisionConfirmation && !/\b(mas|porem)\b/i.test(spec.input)) {
    failures.push("collision: DECISION_CONFIRMATION");
  }
  if (turn.signals?.isAlternativeExploration) failures.push("collision: ALTERNATIVE_EXPLORATION");
  if (turn.signals?.isSecondBestDiscovery) failures.push("collision: SECOND_BEST_DISCOVERY");

  const idealTurn = turn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT;
  if (!idealTurn) {
    failures.push(`router turn: expected PRIORITY_SHIFT, got ${turn.turnType}`);
  }

  return { ...spec, turnType: turn.turnType, routerSignal, familyQuery, passed: failures.length === 0, failures };
}

function evaluateNegative(spec) {
  const turn = classifyTurn(spec.input, true);
  const failures = [];
  if (turn.signals?.isConstraintChange || isConstraintChangeFamilyQuery(spec.input)) {
    failures.push("router: must not be CONSTRAINT_CHANGE");
  }
  return { ...spec, turnType: turn.turnType, passed: failures.length === 0, failures };
}

function evaluateCollision(spec) {
  const cc = isConstraintChangeFamilyQuery(spec.input);
  const ar = isAntiRegretFamilyQuery(spec.input);
  const failures = [];
  if (spec.expected === "CONSTRAINT_CHANGE" && !cc) failures.push("expected CONSTRAINT_CHANGE");
  if (spec.expected === "CONSTRAINT_CHANGE" && ar) failures.push("unexpected ANTI_REGRET");
  if (spec.expected === "ANTI_REGRET" && !ar) failures.push("expected ANTI_REGRET");
  if (spec.expected === "ANTI_REGRET" && cc) failures.push("unexpected CONSTRAINT_CHANGE");
  return { ...spec, cc, ar, passed: failures.length === 0, failures };
}

console.log("\nPATCH 7.9X-CC — CONSTRAINT_CHANGE Semantic Expansion\n");

const positiveRecords = POSITIVE.map(evaluatePositive);
const negativeRecords = NEGATIVE.map(evaluateNegative);
const collisionRecords = AR_CC_COLLISION.map(evaluateCollision);

console.log("── Positive (constraint change) ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.turnType}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Negative / neighbor guards ──\n");
for (const r of negativeRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.turnType}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── AR vs CC collision guards ──\n");
for (const r of collisionRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${r.input}" → CC=${r.cc} AR=${r.ar}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

const posPass = positiveRecords.filter((r) => r.passed).length;
const negPass = negativeRecords.filter((r) => r.passed).length;
const colPass = collisionRecords.filter((r) => r.passed).length;
const posRate = Math.round((posPass / positiveRecords.length) * 100);
const totalPass = posPass + negPass + colPass;
const totalCount = positiveRecords.length + negativeRecords.length + collisionRecords.length;
const thresholdMet = posRate >= 90 && negPass === negativeRecords.length && colPass === collisionRecords.length;

console.log("\n── Summary ──\n");
console.log(`Positive: ${posPass}/${positiveRecords.length} (${posRate}%)`);
console.log(`Negative: ${negPass}/${negativeRecords.length}`);
console.log(`Collisions: ${colPass}/${collisionRecords.length}`);
console.log(`Total: ${totalPass}/${totalCount}`);

for (const g of ["A", "B", "C", "D", "E", "F"]) {
  const rows = positiveRecords.filter((r) => r.group === g);
  const pass = rows.filter((r) => r.passed).length;
  console.log(`  Group ${g}: ${pass}/${rows.length}`);
}

console.log(`\nVerdict: ${thresholdMet ? "PASS (ROBUST CC)" : "FAIL"}\n`);
process.exit(thresholdMet ? 0 : 1);
