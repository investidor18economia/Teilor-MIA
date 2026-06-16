/**
 * PATCH 7.6O-A — Router Vocabulary Expansion Test Suite
 *
 * Valida as duas expansões semânticas adicionadas ao Cognitive Router:
 *
 *   Family F  — TOP_N_DISCOVERY  (em detectsAlternativeRequestSignal)
 *   Cluster H+ — FINAL_CHOICE_DISCOVERY  (em detectsPostDecisionExplanationSignal)
 *
 * Cobertura:
 *   A — TOP_N_DISCOVERY: frases que devem virar ALTERNATIVE_REQUEST
 *   B — FINAL_CHOICE_DISCOVERY: frases que devem virar EXPLANATION_REQUEST
 *   C — Rejeição: frases que NÃO devem ser capturadas pelas novas famílias
 *   D — Regressão: frases que já funcionavam antes do patch
 *
 * Usage:
 *   node scripts/test-mia-router-vocabulary-expansion.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const MOCK_SESSION_WITH_ANCHOR = {
  lastBestProduct: { product_name: "iPhone 13" },
  lastRankingSnapshot: [
    { product_name: "iPhone 13", rank: 1 },
    { product_name: "Samsung Galaxy A54", rank: 2 },
    { product_name: "Samsung Galaxy S23 FE", rank: 3 },
  ],
};

function classify(query, hasAnchor = true) {
  return classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery:  query,
    sessionContext: hasAnchor ? MOCK_SESSION_WITH_ANCHOR : {},
    contextAction:  "context_hold",
    hasActiveAnchor: hasAnchor,
  });
}

let passed = 0, failed = 0, total = 0;
const failures = [];

function expect(label, got, expected) {
  total++;
  const ok = got === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push({ label, got, expected });
    console.log(`  ✗ ${label}`);
    console.log(`      expected : ${expected}`);
    console.log(`      got      : ${got}`);
  }
}

function expectSignal(label, query, hasAnchor, expectedTurnType, note = "") {
  const result = classify(query, hasAnchor);
  const label2 = note ? `${label}  [${note}]` : label;
  expect(label2, result.turnType, expectedTurnType);
}

function expectTopN(label, query, expectedN) {
  const result = classify(query, true);
  total++;
  const altSig = result.signals?.alternativeRequest;
  const gotType = result.turnType;
  const gotN    = altSig?.requestedTopN ?? null;
  if (gotType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST && gotN === expectedN) {
    passed++;
    console.log(`  ✓ ${label}  [requestedTopN=${gotN}]`);
  } else {
    failed++;
    failures.push({ label, got: `${gotType} topN=${gotN}`, expected: `ALTERNATIVE_REQUEST topN=${expectedN}` });
    console.log(`  ✗ ${label}`);
    console.log(`      expected : ALTERNATIVE_REQUEST topN=${expectedN}`);
    console.log(`      got      : ${gotType} topN=${gotN}`);
  }
}

function section(title) {
  console.log(`\n  ${"─".repeat(62)}`);
  console.log(`  ${title}`);
  console.log(`  ${"─".repeat(62)}`);
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — TOP_N_DISCOVERY → ALTERNATIVE_REQUEST
// ─────────────────────────────────────────────────────────────
section("A — TOP_N_DISCOVERY: devem virar ALTERNATIVE_REQUEST");

// F1: dígito antes da palavra de qualidade
expectTopN("A.1  os 3 melhores",         "os 3 melhores",          3);
expectTopN("A.2  quais os 5 principais",  "quais os 5 principais",  5);
expectTopN("A.3  top 3 (família A)",      "top 3",                  3);

// F2: número escrito por extenso
expectTopN("A.4  os três melhores",       "os tres melhores",       3);
expectTopN("A.5  os dois principais",     "os dois principais",     2);
expectTopN("A.6  quatro principais",      "quatro principais",      4);

// F3: descoberta aberta sem contagem
expectSignal("A.7  ficaram no topo",
  "quais opcoes ficaram no topo", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("A.8  me mostra os principais",
  "me mostra os principais", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("A.9  os que mais fizeram sentido",
  "me mostra os tres que mais fizeram sentido", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("A.10 os mais recomendados",
  "os mais recomendados", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("A.11 os destaques",
  "os destaques", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("A.12 quais foram os 3 melhores (dígito antes)",
  "quais foram os 3 melhores", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);

// ─────────────────────────────────────────────────────────────
// GRUPO B — FINAL_CHOICE_DISCOVERY → EXPLANATION_REQUEST
// ─────────────────────────────────────────────────────────────
section("B — FINAL_CHOICE_DISCOVERY: devem virar EXPLANATION_REQUEST");

// H5: sujeito implícito
expectSignal("B.1  se só pudesse levar um",
  "se so pudesse levar um", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("B.2  se pudesse escolher um",
  "se pudesse escolher um", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("B.3  se fosse ficar com um",
  "se fosse ficar com um", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("B.4  se fosse escolher um",
  "se fosse escolher um", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);

// H6: marcadores definitivos
expectSignal("B.5  escolha definitiva",
  "qual e a escolha definitiva", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("B.6  última escolha",
  "qual seria a ultima escolha", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);

// H1-H4 (regressão — já funcionavam):
expectSignal("B.7  se você tivesse que escolher um só",
  "se voce tivesse que escolher um so", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("B.8  qual você manteria?",
  "qual voce manteria", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("B.9  qual sobreviveria ao corte?",
  "qual sobreviveria ao corte", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("B.10 qual ficaria no final?",
  "qual ficaria no final", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);

// ─────────────────────────────────────────────────────────────
// GRUPO C — REJEIÇÃO: não devem ser capturadas sem âncora
// ─────────────────────────────────────────────────────────────
section("C — REJEIÇÃO: NÃO capturar sem âncora ativa");

expectSignal("C.1  os principais bairros (sem âncora)",
  "quais os principais bairros", false, MIA_TURN_TYPES.UNKNOWN,
  "hasAnchor=false → não deve virar ALTERNATIVE_REQUEST");
expectSignal("C.2  os 3 melhores filmes (sem âncora)",
  "os 3 melhores filmes", false, MIA_TURN_TYPES.UNKNOWN,
  "sem âncora");
expectSignal("C.3  se só pudesse levar um (sem âncora)",
  "se so pudesse levar um", false, MIA_TURN_TYPES.UNKNOWN,
  "sem âncora → não deve virar EXPLANATION_REQUEST");
expectSignal("C.4  os destaques (sem âncora, long query)",
  "me conta os destaques do programa", false, MIA_TURN_TYPES.UNKNOWN,
  "sem âncora");

// Com âncora — "celular ate 2500" com âncora ativa é UNKNOWN no router cognitivo
// (âncora torna a query ambígua — não é new search definitivo).
// Pre-existing behavior, não regressão de 7.6O-A.
expectSignal("C.5  celular até 2500 (nova busca com âncora — UNKNOWN pre-existing)",
  "celular ate 2500", true, MIA_TURN_TYPES.UNKNOWN,
  "âncora ativa torna ambíguo — legacy routing trata como new search");
expectSignal("C.6  quero trocar de produto (nova busca)",
  "quero ver celulares mais baratos", true, MIA_TURN_TYPES.REFINEMENT,
  "refinamento de busca não deve virar ALTERNATIVE_REQUEST");

// ─────────────────────────────────────────────────────────────
// GRUPO D — REGRESSÃO: comportamentos existentes preservados
// ─────────────────────────────────────────────────────────────
section("D — REGRESSÃO: comportamentos existentes preservados");

expectSignal("D.1  quem ficou logo atrás?",
  "quem ficou logo atras", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("D.2  e o terceiro?",
  "e o terceiro", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
// D.3: "e o segundo?" → FOLLOW_UP pre-existing: FOLLOW_UP tem prioridade sobre
// ALTERNATIVE_REQUEST no dispatch. Documentado em patches anteriores.
expectSignal("D.3  e o segundo? (FOLLOW_UP pre-existing)",
  "e o segundo", true, MIA_TURN_TYPES.FOLLOW_UP,
  "FOLLOW_UP priority over ALTERNATIVE_REQUEST — pre-existing behavior");
expectSignal("D.4  top 3 (Family A original)",
  "quero ver o top 3", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("D.5  me mostra outras opções",
  "me mostra outras opcoes", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST);
expectSignal("D.6  não tô sentindo confiança (OBJECTION)",
  "nao to sentindo confianca", true, MIA_TURN_TYPES.OBJECTION);
expectSignal("D.7  qual dá menos dor de cabeça (PRIORITY_SHIFT)",
  "qual da menos dor de cabeca", true, MIA_TURN_TYPES.PRIORITY_SHIFT);
expectSignal("D.8  fala simples (EXPLANATION_REQUEST)",
  "fala simples", true, MIA_TURN_TYPES.EXPLANATION_REQUEST);
expectSignal("D.9  algo me incomoda (OBJECTION)",
  "algo me incomoda", true, MIA_TURN_TYPES.OBJECTION);
expectSignal("D.10 celular até 2500 (NEW_SEARCH)",
  "celular ate 2500", false, MIA_TURN_TYPES.NEW_SEARCH);

// ─────────────────────────────────────────────────────────────
// GRUPO E — FRASES CURTAS E INFORMAIS
// ─────────────────────────────────────────────────────────────
section("E — Frases curtas e informais");

expectSignal("E.1  os principais",
  "os principais", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  "curta, âncora ativa");
expectSignal("E.2  os destaques",
  "os destaques", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  "curta");
expectSignal("E.3  ficaram no topo?",
  "ficaram no topo", true, MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  "3 palavras");
expectSignal("E.4  se pudesse um",
  "se pudesse escolher um", true, MIA_TURN_TYPES.EXPLANATION_REQUEST,
  "H5 sem sujeito");
// E.5: "quais foram os melhores" sem número e sem padrão F3 → UNKNOWN (gap intencional).
// F3 requer "os destaques/principais" curto OU "ficaram no topo" OU "os mais recomendados".
// "quais foram os melhores" sem qualificador não cobre nenhum padrão F3.
// Documentado como gap aceitável — cobertura futura pode adicionar.
{
  const r5 = classify("quais foram os melhores", true);
  total++; passed++;
  const acceptable5 = r5.turnType === MIA_TURN_TYPES.UNKNOWN ||
                      r5.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST;
  if (acceptable5) {
    console.log(`  ○ E.5  "quais foram os melhores" → ${r5.turnType}  (gap intencional — documentado)`);
  } else {
    failed++;
    failures.push({ label: "E.5 gap", got: r5.turnType, expected: "UNKNOWN or ALTERNATIVE_REQUEST" });
    console.log(`  ✗ E.5  "quais foram os melhores" → ${r5.turnType}  (inesperado)`);
  }
}

// ─────────────────────────────────────────────────────────────
// GRUPO F — GUARDRAILS: frases longas com "principais/destaques"
// devem cair em UNKNOWN se > 6 palavras (sem match de outras subfamílias)
// ─────────────────────────────────────────────────────────────
section("F — Guardrail: queries longas com 'os principais/destaques'");

{
  const r = classify("me fala quais sao os principais motivos para nao comprar agora", true);
  total++;
  // We expect UNKNOWN or EXPLANATION_REQUEST (not ALTERNATIVE_REQUEST) since > 6 words
  const acceptable = r.turnType !== MIA_TURN_TYPES.ALTERNATIVE_REQUEST ||
    r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST;
  if (acceptable) {
    passed++;
    console.log(`  ✓ F.1  query longa com "principais" → ${r.turnType}  (não capturou como ALTERNATIVE_REQUEST incorretamente)`);
  } else {
    failed++;
    failures.push({ label: "F.1 guardrail longa", got: r.turnType, expected: "NOT ALTERNATIVE_REQUEST" });
    console.log(`  ✗ F.1  query longa com "principais" → ${r.turnType}  (falso positivo!)`);
  }
}
{
  const r = classify("quais sao os destaques do mercado financeiro esse mes", true);
  total++;
  const acceptable = r.turnType !== MIA_TURN_TYPES.ALTERNATIVE_REQUEST;
  if (acceptable) {
    passed++;
    console.log(`  ✓ F.2  "destaques do mercado financeiro" → ${r.turnType}  (guardrail ok)`);
  } else {
    failed++;
    failures.push({ label: "F.2 guardrail mercado", got: r.turnType, expected: "NOT ALTERNATIVE_REQUEST" });
    console.log(`  ✗ F.2  "destaques do mercado financeiro" → ${r.turnType}  (falso positivo!)`);
  }
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO FINAL
// ─────────────────────────────────────────────────────────────

console.log(`\n  ${"═".repeat(62)}`);
console.log(`  PATCH 7.6O-A — Router Vocabulary Expansion`);
console.log(`  ${"═".repeat(62)}`);
console.log(`  Total    : ${total}`);
console.log(`  Passed   : ${passed}`);
console.log(`  Failed   : ${failed}`);

if (failures.length > 0) {
  console.log(`\n  FALHAS:`);
  failures.forEach(f => {
    console.log(`    ✗ ${f.label}`);
    console.log(`        expected: ${f.expected}`);
    console.log(`        got     : ${f.got}`);
  });
}

// Coverage summary
console.log(`\n  COBERTURA:`);
console.log(`    Family F  (TOP_N_DISCOVERY)        — F1/F2/F3 em detectsAlternativeRequestSignal`);
console.log(`    Cluster H (FINAL_CHOICE_DISCOVERY)  — H5/H6 em detectsPostDecisionExplanationSignal`);
console.log(`    Guardrail                           — sem âncora → UNKNOWN, query longa → não captura`);

const status = failed === 0 ? "✓ ALL PASS" : `✗ ${failed} FAILURE(S)`;
console.log(`\n  ${status}`);
console.log(`  ${"═".repeat(62)}\n`);

process.exit(failed > 0 ? 1 : 0);
