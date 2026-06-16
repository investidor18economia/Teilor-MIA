/**
 * PATCH 7.6H — Explanation + Safety Semantic Expansion
 *
 * MIA_EXPLANATION_SAFETY_EXPANSION_AUDIT
 *
 * Famílias cognitivas expandidas:
 *
 *   Grupo A — Simplification  (EXPLANATION_REQUEST)
 *             "simplifica pra mim", "resume", "fala simples", "sem tecnicês"
 *
 *   Grupo B — Hypothetical Choice  (EXPLANATION_REQUEST)
 *             "qual você escolheria", "se tivesse que ficar com um só", "qual manteria"
 *
 *   Grupo C — Comparative Safety Seeking  (PRIORITY_SHIFT)
 *             "qual é mais seguro", "qual dá menos dor de cabeça", "qual é mais confiável"
 *
 *   Grupo D — Reliability Seeking  (PRIORITY_SHIFT)
 *             "qual envelhece mais tranquilo", "qual continua bom", "qual dura mais"
 *
 *   Grupo E — Negativos  (guardrails — NÃO devem classificar errado)
 *             "dor de cabeça hoje" [sem âncora], "seguro do carro", "problema de internet"
 *
 *   Grupo F — Regressões  (patches anteriores: 7.6G, 7.6F, 7.6E, 7.6D, 7.6C, 7.6B, 7.6A, 7.5, 7.4)
 *
 * Usage: node scripts/test-mia-explanation-safety-expansion.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const WINNER = { product_name: "Samsung Galaxy A55", price: "R$ 1.899" };
const RUNNER_UP = { product_name: "Motorola Edge 40", price: "R$ 1.699" };

const WITH_ANCHOR = {
  lastBestProduct: WINNER,
  lastProductMentioned: WINNER.product_name,
  lastProducts: [WINNER, RUNNER_UP],
  lastCategory: "celular",
};

const NO_ANCHOR = {};

let total = 0, passed = 0, failed = 0;
const failures = [];

function test(label, query, { expectedType, hasAnchor = true }) {
  total++;
  const result = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: hasAnchor ? WITH_ANCHOR : NO_ANCHOR,
    hasActiveAnchor: hasAnchor,
  });

  const got = result.turnType;
  const ok = got === expectedType;

  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push({ label, query, expected: expectedType, got });
    console.log(`  ✗ ${label}`);
    console.log(`      query    : "${query}"`);
    console.log(`      expected : ${expectedType}`);
    console.log(`      got      : ${got}`);
  }
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — SIMPLIFICATION (EXPLANATION_REQUEST)
// ─────────────────────────────────────────────────────────────
section("Grupo A — Simplification");

test("A.1 - simplifica pra mim", "simplifica pra mim", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.2 - fala simples", "fala simples", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.3 - fala de forma simples", "fala de forma simples", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.4 - explica de um jeito simples", "explica de um jeito simples", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.5 - pode resumir?", "pode resumir?", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.6 - resume isso", "resume isso", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.7 - qual é o resumo?", "qual e o resumo", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.8 - explica sem tecnicês", "explica sem tecnicez", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.9 - sem jargão", "sem jargao", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.10 - sem complicar", "sem complicar", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.11 - traduz isso pra mim", "traduz isso pra mim", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.12 - linguagem normal", "linguagem normal", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.13 - linguagem simples", "linguagem simples", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.14 - fala normal", "fala normal", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("A.15 - me explica sem complicar", "me explica sem complicar", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});

// ─────────────────────────────────────────────────────────────
// GRUPO B — HYPOTHETICAL CHOICE (EXPLANATION_REQUEST)
// ─────────────────────────────────────────────────────────────
section("Grupo B — Hypothetical Choice");

test("B.1 - se você tivesse que escolher um", "se voce tivesse que escolher um", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.2 - qual você manteria", "qual voce manteria", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.3 - qual você levaria", "qual voce levaria", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.4 - qual você escolheria", "qual voce escolheria", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.5 - qual você compraria", "qual voce compraria", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.6 - se fosse pra ficar com um só", "se fosse pra ficar com um so", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.7 - qual seria sua escolha final", "qual seria sua escolha final", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.8 - qual seria a decisão definitiva", "qual seria a decisao definitiva", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.9 - qual sobreviveria ao corte", "qual sobreviveria ao corte", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.10 - se eu so pudesse levar um", "se eu so pudesse levar um", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.11 - se vc tivesse que comprar um só", "se vc tivesse que comprar um so", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});
test("B.12 - qual ficaria no final", "qual ficaria no final", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});

// ─────────────────────────────────────────────────────────────
// GRUPO C — COMPARATIVE SAFETY SEEKING (PRIORITY_SHIFT)
// ─────────────────────────────────────────────────────────────
section("Grupo C — Comparative Safety Seeking");

test("C.1 - qual dá menos dor de cabeça", "qual da menos dor de cabeca", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.2 - qual é mais seguro", "qual e mais seguro", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.3 - qual tende a dar menos problema", "qual tende a dar menos problema", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.4 - qual é mais confiável", "qual e mais confiavel", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.5 - qual é mais tranquilo", "qual e mais tranquilo", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.6 - qual é mais estável", "qual e mais estavel", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.7 - qual tem menos chance de dar problema", "qual tem menos chance de dar problema", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.8 - qual inspira mais confiança", "qual inspira mais confianca", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.9 - qual tem melhor reputação", "qual tem melhor reputacao", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.10 - qual passa mais segurança", "qual passa mais seguranca", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.11 - qual parece menos arriscado", "qual parece menos arriscado", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.12 - qual costuma incomodar menos", "qual costuma incomodar menos", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.13 - qual é menos arriscado", "qual e menos arriscado", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.14 - qual transmite mais confiança", "qual transmite mais confianca", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("C.15 - qual dá menos risco", "qual da menos risco", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});

// ─────────────────────────────────────────────────────────────
// GRUPO D — RELIABILITY SEEKING (PRIORITY_SHIFT)
// ─────────────────────────────────────────────────────────────
section("Grupo D — Reliability Seeking");

test("D.1 - qual envelhece mais tranquilo", "qual envelhece mais tranquilo", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.2 - qual dura mais sem incomodar", "qual dura mais sem incomodar", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.3 - qual continua bom por mais tempo", "qual continua bom por mais tempo", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.4 - qual aguenta mais anos", "qual aguenta mais anos", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.5 - qual mantém valor melhor", "qual mantem valor melhor", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.6 - qual costuma ser mais consistente", "qual costuma ser mais consistente", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.7 - qual é mais duradouro", "qual e mais duradouro", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.8 - qual vai durar mais", "qual vai durar mais", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.9 - qual tende a continuar funcionando bem", "qual tende a continuar funcionando bem", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("D.10 - qual dá menos manutenção", "qual da menos manutencao", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});

// ─────────────────────────────────────────────────────────────
// GRUPO E — NEGATIVOS (não devem classificar nas novas famílias)
// ─────────────────────────────────────────────────────────────
section("Grupo E — Negativos / Guardrails");

// E.1–E.3: sem âncora — PRIORITY_SHIFT requer âncora; sem contexto → UNKNOWN
test("E.1 - dor de cabeça hoje [sem âncora]", "dor de cabeca hoje", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
  hasAnchor: false,
});
test("E.2 - qual é mais seguro [sem âncora]", "qual e mais seguro", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
  hasAnchor: false,
});
test("E.3 - menos problema [sem âncora]", "menos problema", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
  hasAnchor: false,
});

// E.4–E.6: contextos não-produto (sem "qual" → não dispara H1/H2)
test("E.4 - seguro do carro [com âncora]", "seguro do carro", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
});
test("E.5 - manutenção da casa [com âncora]", "manutencao da casa", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
});
test("E.6 - problema de internet [com âncora]", "problema de internet", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
});

// E.7–E.8: EXPLANATION_REQUEST sem âncora → retorna false → UNKNOWN
test("E.7 - simplifica sem âncora", "simplifica pra mim", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
  hasAnchor: false,
});
test("E.8 - qual você manteria sem âncora", "qual voce manteria", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
  hasAnchor: false,
});

// E.9: termos genéricos que não devem disparar PRIORITY_SHIFT
test("E.9 - confiança no processo [não é produto]", "tenho confianca no processo", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
});

// ─────────────────────────────────────────────────────────────
// GRUPO F — REGRESSÕES (patches anteriores)
// ─────────────────────────────────────────────────────────────
section("Grupo F — Regressões PATCH 7.6G");

test("F-7G.1 - algo parecido [REFINEMENT]", "tem algo parecido com esse", {
  expectedType: MIA_TURN_TYPES.REFINEMENT,
});
test("F-7G.2 - mesma linha [REFINEMENT]", "algo na mesma linha", {
  expectedType: MIA_TURN_TYPES.REFINEMENT,
});
test("F-7G.3 - logo atrás [ALTERNATIVE_REQUEST]", "qual ficou logo atras", {
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
});
test("F-7G.4 - me mostra outras opções [ALTERNATIVE_REQUEST]", "me mostra outras opcoes", {
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
});

section("Grupo F — Regressões PATCH 7.6F");

// "nao sei se vale a pena" → VALUE_QUESTION (router prioriza "vale a pena" sobre hesitação)
// Comportamento pré-existente, não é regressão de 7.6H.
test("F-7F.1 - não sei se vale a pena [VALUE_QUESTION]", "nao sei se vale a pena", {
  expectedType: MIA_TURN_TYPES.VALUE_QUESTION,
});
test("F-7F.2 - fiquei em dúvida [OBJECTION]", "fiquei em duvida", {
  expectedType: MIA_TURN_TYPES.OBJECTION,
});
test("F-7F.3 - medo de me arrepender [OBJECTION]", "medo de me arrepender", {
  expectedType: MIA_TURN_TYPES.OBJECTION,
});

section("Grupo F — Regressões PATCH 7.6E");

test("F-7E.1 - prefiro algo mais leve [PRIORITY_SHIFT]", "prefiro algo mais leve", {
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
});
test("F-7E.2 - qual a lógica? [EXPLANATION_REQUEST]", "qual a logica", {
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
});

section("Grupo F — Regressões PATCH 7.5/7.4");

// "quero o segundo" sem contexto de cargo/lista → router classifica como UNKNOWN.
// Ordinal "segundo" isolado não tem contexto suficiente sem "lugar/opção/etc."
// O interceptor em pages/api/chat-gpt4o.js trata este caso a nível de handler.
test("F-75.1 - quero o segundo [UNKNOWN sem contexto ordinal]", "quero o segundo", {
  expectedType: MIA_TURN_TYPES.UNKNOWN,
});
test("F-75.2 - busca por câmera [NEW_SEARCH]", "quero um celular bom para fotos", {
  expectedType: MIA_TURN_TYPES.NEW_SEARCH,
  hasAnchor: false,
});
test("F-74.1 - qual o terceiro? [ALTERNATIVE_REQUEST]", "qual o terceiro", {
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
});

// ─────────────────────────────────────────────────────────────
// Relatório Final
// ─────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`  PATCH 7.6H — Explanation + Safety Semantic Expansion`);
console.log(`${"═".repeat(60)}`);
console.log(`  Total   : ${total}`);
console.log(`  Passed  : ${passed}`);
console.log(`  Failed  : ${failed}`);

if (failures.length > 0) {
  console.log(`\n  FAILURES:`);
  failures.forEach(({ label, query, expected, got }) => {
    console.log(`    [${label}]`);
    console.log(`      query    : "${query}"`);
    console.log(`      expected : ${expected}`);
    console.log(`      got      : ${got}`);
  });
}

console.log(`\n  ${failed === 0 ? "ALL TESTS PASSED ✓" : `${failed} TEST(S) FAILED ✗`}`);
console.log(`${"═".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
