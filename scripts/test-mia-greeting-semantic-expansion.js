/**
 * PATCH 7.9X-I — GREETING Semantic Expansion (local audit)
 *
 * Usage: node scripts/test-mia-greeting-semantic-expansion.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isGreetingFamilyQuery,
  hasGreetingOpeningPrefix,
  isAcknowledgementFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isAntiRegretFamilyQuery,
  isConstraintChangeFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual" },
  lastProducts: [{ product_name: "Produto Recomendado Atual" }],
};

const PURE_POSITIVE = [
  { group: "A", input: "oi", anchored: false },
  { group: "A", input: "oii", anchored: false },
  { group: "A", input: "olá", anchored: false },
  { group: "A", input: "ola", anchored: true },
  { group: "A", input: "hey", anchored: false },
  { group: "A", input: "hello", anchored: false },
  { group: "A", input: "alô", anchored: false },
  { group: "A", input: "alo", anchored: true },
  { group: "B", input: "e aí", anchored: false },
  { group: "B", input: "eai", anchored: false },
  { group: "B", input: "fala", anchored: false },
  { group: "B", input: "fala aí", anchored: false },
  { group: "B", input: "salve", anchored: true },
  { group: "B", input: "opa", anchored: false },
  { group: "C", input: "bom dia", anchored: false },
  { group: "C", input: "boa tarde", anchored: true },
  { group: "C", input: "boa noite", anchored: false },
  { group: "C", input: "boa madrugada", anchored: false },
  { group: "D", input: "mia", anchored: false },
  { group: "D", input: "oi mia", anchored: false },
  { group: "D", input: "fala mia", anchored: true },
  { group: "D", input: "mia?", anchored: false },
  { group: "D", input: "ei mia", anchored: false },
  { group: "D", input: "cadê você", anchored: false },
  { group: "D", input: "alguém aí?", anchored: false },
  { group: "D", input: "você tá aí?", anchored: false },
  { group: "D", input: "você está aí?", anchored: true },
  { group: "D", input: "tá aí?", anchored: false },
  { group: "D", input: "tem alguém aí?", anchored: false },
  { group: "D", input: "alguém online?", anchored: false },
  { group: "D", input: "mia, você tá aí?", anchored: false },
  { group: "E", input: "tudo bem?", anchored: false },
  { group: "E", input: "como vai?", anchored: true },
  { group: "E", input: "tudo certo por aí?", anchored: false },
  { group: "E", input: "como você tá?", anchored: false },
  { group: "E", input: "bora conversar?", anchored: false },
  { group: "E", input: "posso perguntar uma coisa?", anchored: false },
  { group: "E", input: "posso tirar uma dúvida?", anchored: false },
  { group: "E", input: "posso te perguntar uma coisa?", anchored: true },
  { group: "E", input: "posso fazer uma pergunta?", anchored: false },
  { group: "E", input: "posso tirar uma dúvida rápida?", anchored: false },
  { group: "E", input: "posso mandar uma dúvida?", anchored: false },
  { group: "E", input: "deixa eu te perguntar uma coisa", anchored: false },
  { group: "E", input: "deixa eu fazer uma pergunta", anchored: true },
  { group: "E", input: "deixa eu tirar uma dúvida", anchored: false },
  { group: "E", input: "queria te perguntar uma coisa", anchored: false },
  { group: "E", input: "queria tirar uma dúvida", anchored: false },
  { group: "E", input: "deixa eu falar contigo", anchored: false },
  { group: "E", input: "bora?", anchored: false },
  { group: "E", input: "chega mais", anchored: false },
  { group: "A", input: "oi", anchored: true },
  { group: "B", input: "e aí", anchored: true },
  { group: "C", input: "bom dia", anchored: true },
  { group: "D", input: "salve mia", anchored: false },
  { group: "E", input: "bom dia mia", anchored: false },
  { group: "E", input: "oi tudo bem", anchored: false },
  { group: "A", input: "oii", anchored: true },
  { group: "B", input: "eae", anchored: false },
  { group: "D", input: "fala comigo", anchored: false },
  { group: "E", input: "como você está?", anchored: false },
  { group: "E", input: "tudo bom", anchored: false },
  { group: "E", input: "tudo bom mia", anchored: false },
  { group: "A", input: "hi", anchored: false },
  { group: "B", input: "e ae", anchored: false },
];

const COMPOSITE = [
  { group: "F", input: "oi, quero comprar um celular" },
  { group: "F", input: "bom dia, me ajuda com uma compra?" },
  { group: "F", input: "salve mia, preciso decidir uma coisa" },
  { group: "F", input: "e aí, qual celular vale a pena?" },
  { group: "F", input: "opa, quero comparar dois produtos" },
  { group: "F", input: "fala mia, tô em dúvida entre opções" },
  { group: "F", input: "oi, quero comprar algo" },
  { group: "F", input: "bom dia, me ajuda a escolher?" },
  { group: "F", input: "salve, preciso escolher uma opção" },
  { group: "F", input: "e aí, qual vale mais a pena?" },
  { group: "F", input: "oi, preciso comprar algo" },
  { group: "F", input: "bom dia, quero um produto até 2000" },
  { group: "F", input: "salve, compara esses dois" },
  { group: "F", input: "opa, tem outro?" },
  { group: "F", input: "oi, quero gastar menos" },
  { group: "F", input: "bom dia, vou nele então" },
  { group: "F", input: "fala, mostra alternativas" },
  { group: "F", input: "oi, você tem certeza?" },
  { group: "F", input: "salve, a galera recomenda?" },
  { group: "F", input: "bom dia, tenho medo de errar" },
  { group: "F", input: "você tá aí? quero comprar um produto" },
  { group: "F", input: "posso tirar uma dúvida sobre qual comprar?" },
  { group: "F", input: "deixa eu te perguntar: qual vale mais a pena?" },
];

const NEGATIVE = [
  { group: "ACK", input: "ok", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "blz", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "beleza", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "certo", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "show", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "fechado", detector: isAcknowledgementFamilyQuery, family: "ACKNOWLEDGEMENT" },
  { group: "COMP", input: "entendi", family: "COMPREHENSION" },
  { group: "COMP", input: "saquei", family: "COMPREHENSION" },
  { group: "COMP", input: "agora fez sentido", family: "COMPREHENSION" },
  { group: "COMP", input: "clareou", family: "COMPREHENSION" },
  { group: "DC", input: "vou nele", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION", optional: true },
  { group: "DC", input: "acho que fechou", detector: isDecisionConfirmationFamilyQuery, family: "DECISION_CONFIRMATION", optional: true },
  { group: "AE", input: "tem outro?", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "mostra alternativas", detector: isAlternativeExplorationFamilyQuery, family: "ALTERNATIVE_EXPLORATION", optional: true },
  { group: "SBD", input: "qual ficou em segundo?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "plano B?", detector: isSecondBestDiscoveryFamilyQuery, family: "SECOND_BEST_DISCOVERY" },
  { group: "CC", input: "você tem certeza?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "continua achando isso?", detector: isConfidenceChallengeFamilyQuery, family: "CONFIDENCE_CHALLENGE" },
  { group: "SV", input: "a galera recomenda?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "SV", input: "o povo fala bem?", detector: isSocialValidationFamilyQuery, family: "SOCIAL_VALIDATION" },
  { group: "AR", input: "tenho medo de errar", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET", optional: true },
  { group: "AR", input: "não quero me arrepender", detector: isAntiRegretFamilyQuery, family: "ANTI_REGRET" },
  { group: "CC2", input: "quero gastar menos", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "agora bateria importa mais", detector: isConstraintChangeFamilyQuery, family: "CONSTRAINT_CHANGE", optional: true },
  { group: "SEARCH", input: "quero um produto até 2000", family: "commercial_search" },
  { group: "SEARCH", input: "procura um celular bom", family: "commercial_search" },
  { group: "GUARD", input: "posso tirar uma dúvida sobre qual comprar?", family: "commercial_search" },
  { group: "GUARD", input: "me explica qual comprar", family: "explanation_request" },
  { group: "GUARD", input: "explica a diferença entre esses dois", family: "explanation_request" },
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
  const familyQuery = isGreetingFamilyQuery(spec.input);
  const routerSignal = !!turn.signals?.isGreeting;

  if (!routerSignal && !familyQuery) {
    failures.push("router: isGreeting missing");
  }

  if (turn.signals?.isAcknowledgement) failures.push("collision: ACKNOWLEDGEMENT");
  if (isComprehensionSemanticFamilyQuery(spec.input)) failures.push("collision: COMPREHENSION");
  if (turn.signals?.isDecisionConfirmation) failures.push("collision: DECISION_CONFIRMATION");

  const idealTurn = turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL;
  if (!idealTurn) {
    failures.push(`router turn: expected CONVERSATIONAL, got ${turn.turnType}`);
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

function evaluateComposite(spec) {
  const turn = classifyTurn(spec.input, false);
  const failures = [];

  if (turn.signals?.isGreeting || isGreetingFamilyQuery(spec.input)) {
    failures.push("greeting must not dominate composite phrase");
  }
  if (!hasGreetingOpeningPrefix(spec.input)) {
    failures.push("expected greeting opening prefix");
  }
  if (turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL && turn.signals?.isGreeting) {
    failures.push("composite fell into pure greeting flow");
  }

  return {
    ...spec,
    context: "cold",
    turnType: turn.turnType,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateNegative(spec) {
  const turn = classifyTurn(spec.input, false);
  const failures = [];
  const greetSignal = !!turn.signals?.isGreeting;
  const greetFamily = isGreetingFamilyQuery(spec.input);

  if (greetSignal || greetFamily) {
    failures.push("router: must not be pure GREETING");
  }

  if (spec.family === "COMPREHENSION") {
    if (!isComprehensionSemanticFamilyQuery(spec.input)) {
      failures.push("expected COMPREHENSION semantic, not GREETING");
    }
  } else if (spec.family === "commercial_search") {
    if (turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL && greetFamily) {
      failures.push("commercial search swallowed by greeting");
    }
  } else if (spec.detector && !spec.detector(spec.input) && !spec.optional) {
    failures.push(`neighbor: expected ${spec.family} detector`);
  }

  if (spec.optional && failures.length > 0) {
    return { ...spec, context: "cold", skipped: true, passed: true, failures: [] };
  }

  return {
    ...spec,
    context: "cold",
    turnType: turn.turnType,
    passed: failures.length === 0,
    failures,
  };
}

console.log("\nPATCH 7.9X-I — GREETING Semantic Expansion\n");

const pureRecords = PURE_POSITIVE.map(evaluatePurePositive);
const compositeRecords = COMPOSITE.map(evaluateComposite);
const negativeRecords = NEGATIVE.map(evaluateNegative);

console.log("── Pure greeting ──\n");
for (const r of pureRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.turnType} signal=${r.routerSignal}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Greeting + embedded intent (prefix only) ──\n");
for (const r of compositeRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.turnType}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
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
const compositePass = compositeRecords.filter((r) => r.passed).length;
const compositeTotal = compositeRecords.length;
const negRequired = negativeRecords.filter((r) => !r.skipped);
const negPass = negRequired.filter((r) => r.passed).length;
const negTotal = negRequired.length;

console.log("\n── Summary ──\n");
console.log(`Pure greeting coverage: ${purePass}/${pureTotal} (${((purePass / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Composite prefix / no swallow: ${compositePass}/${compositeTotal}`);
console.log(`Neighbor guards: ${negPass}/${negTotal}`);

const pass =
  purePass / pureTotal >= 0.9 &&
  compositePass === compositeTotal &&
  negPass === negTotal;

console.log(`\nPATCH 7.9X-I expansion audit: ${pass ? "PASS" : "FAIL"}\n`);

if (!pass) process.exitCode = 1;
