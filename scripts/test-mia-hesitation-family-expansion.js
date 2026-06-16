/**
 * PATCH 7.6F — Hesitation Family Expansion + Purchase Anxiety Integration
 *
 * Test suite para as três famílias cognitivas expandidas/adicionadas:
 *
 *   Grupo A — Hesitation Discomfort (Families C+D expandidas)
 *   Grupo B — Decision Paralysis (Family G nova)
 *   Grupo C — Purchase Anxiety (Family H nova)
 *   Grupo D — Negativos (guardrails — NÃO devem classificar)
 *   Grupo E — Regressões (famílias existentes devem manter comportamento)
 *
 * turnType esperado: OBJECTION (sem exceção — sem novo turn type)
 * subtypes esperados: "not_sure" | "decision_paralysis" | "purchase_anxiety"
 *
 * Usage: node scripts/test-mia-hesitation-family-expansion.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const MOCK_WINNER = {
  product_name: "Samsung Galaxy A55",
  price: "R$ 1.899",
};

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
  lastCategory: "celular",
};

const SESSION_NO_ANCHOR = {};

// ─────────────────────────────────────────────────────────────
// Test runner
// ─────────────────────────────────────────────────────────────

let total = 0;
let passed = 0;
let failed = 0;
const failures = [];

function test(label, query, { expectedType, expectedSubtype = null, hasAnchor = true }) {
  total++;

  const result = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: hasAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR,
    hasActiveAnchor: hasAnchor,
  });

  const typeOk = result.turnType === expectedType;
  const subtypeOk =
    expectedSubtype === null ||
    (result.signals?.hesitationReaction?.subtype === expectedSubtype) ||
    (result.reasons?.some(r => r.includes(`hesitation_subtype:${expectedSubtype}`)));

  const ok = typeOk && subtypeOk;

  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const got = result.turnType;
    const gotSub = result.signals?.hesitationReaction?.subtype ?? "(none)";
    const msg = `  ✗ ${label}\n      esperado: ${expectedType}${expectedSubtype ? ` [${expectedSubtype}]` : ""}\n      obtido  : ${got} [${gotSub}]\n      query   : "${query}"`;
    console.log(msg);
    failures.push(msg);
  }
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — Hesitation Discomfort (Families C + D expandidas)
// ─────────────────────────────────────────────────────────────
// Intenção: desconforto difuso com a recomendação, sem rejeição explícita.

console.log("\n── Grupo A: Hesitation Discomfort ──────────────────────────────────────");

// A.1 — Confiança como substantivo (Family D expansion)
test("A.1 não tô sentindo confiança", "não tô sentindo confiança nessa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

test("A.2 não estou sentindo segurança", "não estou sentindo segurança nessa decisão",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

// A.3 — Confortável (Family D expansion)
test("A.3 não me sinto confortável", "não me sinto confortável com essa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

test("A.4 não tô confortável ainda", "não tô confortável ainda",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

test("A.5 fiquei desconfortável", "fiquei desconfortável com essa recomendação",
  { expectedType: MIA_TURN_TYPES.OBJECTION }); // fiquei inseguro path

// A.6 — Tô sem segurança (Family D expansion)
test("A.6 tô sem segurança nessa decisão", "tô sem segurança nessa decisão",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

test("A.7 estou sem confiança nisso", "estou sem confiança nisso",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

// A.8 — Algo me incomoda (Family C expansion)
test("A.8 algo me incomoda nessa escolha", "algo me incomoda nessa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

test("A.9 alguma coisa tá me incomodando", "alguma coisa tá me incomodando",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

// A.10 — Não consigo apontar (Family C expansion)
test("A.10 não consigo apontar o que é", "não consigo apontar o que é",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

test("A.11 não consigo identificar exatamente", "não consigo identificar exatamente o que me incomoda",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

// A.12 — Tem algo estranho (Family C expansion)
test("A.12 tem algo estranho nisso", "tem algo estranho nisso",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

// A.13 — Existentes que devem continuar funcionando
test("A.13 [regressão] não me sinto seguro", "não me sinto seguro nessa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

test("A.14 [regressão] não sei explicar", "não sei explicar",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "not_sure" });

// ─────────────────────────────────────────────────────────────
// GRUPO B — Decision Paralysis (Family G nova)
// ─────────────────────────────────────────────────────────────
// Intenção: bloqueio decisório — perdido, travado, paralisado.

console.log("\n── Grupo B: Decision Paralysis ─────────────────────────────────────────");

// B.1 — Perdido no contexto de decisão
test("B.1 tô meio perdido nessa decisão", "tô meio perdido nessa decisão",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

test("B.2 estou perdido nessa escolha", "estou perdido nessa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

test("B.3 fiquei meio perdido aqui", "fiquei meio perdido aqui",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

// B.4 — Travado
test("B.4 tô travado nessa escolha", "tô travado nessa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

test("B.5 estou travado nessa decisão", "estou travado nessa decisão",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

test("B.6 fiquei travada com isso", "fiquei travada com isso",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

// B.7 — Não consigo me decidir (reflexivo — diferente de Family B)
test("B.7 não consigo me decidir", "não consigo me decidir",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

// B.8 — Não sai do lugar
test("B.8 não sai do lugar essa decisão", "não sai do lugar essa decisão",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

test("B.9 decisão não anda", "a decisão não anda",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

// B.10 — Continuo parado
test("B.10 continuo parado nessa", "continuo parado nessa",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

// B.11 — Não consigo avançar
test("B.11 não consigo avançar nessa escolha", "não consigo avançar nessa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "decision_paralysis" });

// B.12 — [regressão] não consigo decidir (Family B original)
test("B.12 [regressão] não consigo decidir", "não consigo decidir",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "indecision" });

test("B.13 [regressão] continuo em dúvida", "continuo em dúvida sobre esse",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// ─────────────────────────────────────────────────────────────
// GRUPO C — Purchase Anxiety (Family H nova)
// ─────────────────────────────────────────────────────────────
// Intenção: medo de consequência da compra — não é objeção de preço.

console.log("\n── Grupo C: Purchase Anxiety ───────────────────────────────────────────");

// C.1 — Fazer besteira
test("C.1 não queria fazer besteira", "não queria fazer besteira com esse dinheiro",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

test("C.2 não quero fazer besteira", "não quero fazer besteira",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// C.3 — Medo de arrepender
test("C.3 tenho medo de me arrepender", "tenho medo de me arrepender",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

test("C.4 não queria me arrepender", "não queria me arrepender dessa compra",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// C.5 — Não queria errar
test("C.5 não queria errar nessa compra", "não queria errar nessa compra",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

test("C.6 não quero errar aqui", "não quero errar aqui",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// C.7 — Tenho receio
test("C.7 tenho receio de gastar errado", "tenho receio de gastar errado",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

test("C.8 tenho medo de investir errado", "tenho medo de investir errado nessa decisão",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// C.9 — Medo de errar explícito
test("C.9 medo de errar na escolha", "medo de errar na escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// C.10 — Preciso ter certeza
test("C.10 preciso ter certeza antes", "preciso ter certeza antes de fechar",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

test("C.11 quero ter certeza primeiro", "quero ter certeza primeiro",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// C.12 — Jogar dinheiro fora
test("C.12 não quero jogar dinheiro fora", "não quero jogar dinheiro fora",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

test("C.13 não quero desperdiçar dinheiro", "não quero desperdiçar dinheiro",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// C.14 — Não quero gastar errado
test("C.14 não quero gastar errado", "não quero gastar errado",
  { expectedType: MIA_TURN_TYPES.OBJECTION, expectedSubtype: "purchase_anxiety" });

// ─────────────────────────────────────────────────────────────
// GRUPO D — Negativos (NÃO devem classificar como OBJECTION via hesitation)
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo D: Negativos (guardrails) ─────────────────────────────────────");

// D.1 — Discovery intent (sem âncora) → NEW_SEARCH (sistema correto)
// Sem âncora, "não sei qual celular comprar" é nova busca, não ansiedade.
test("D.1 não sei qual celular comprar [sem âncora → NEW_SEARCH]",
  "não sei qual celular comprar",
  { expectedType: MIA_TURN_TYPES.NEW_SEARCH, hasAnchor: false });

test("D.2 não sei o que comprar [sem âncora]",
  "não sei o que comprar",
  { expectedType: MIA_TURN_TYPES.UNKNOWN, hasAnchor: false });

// D.3 — "perdido" sem contexto decisório e sem âncora → não deve ser decision_paralysis
test("D.3 tô perdido [sem âncora]",
  "tô perdido",
  { expectedType: MIA_TURN_TYPES.UNKNOWN, hasAnchor: false });

// D.4 — "errar" sem âncora → não deve ser purchase_anxiety
test("D.4 não queria errar [sem âncora]",
  "não queria errar nessa compra",
  { expectedType: MIA_TURN_TYPES.UNKNOWN, hasAnchor: false });

// D.5 — "perdido" sem contexto decisório e com âncora (casual) → não deve ser paralysis
// "tô perdido na cidade" — mas com âncora, "perdido" sozinho sem contexto de decisão
// não deve disparar. Nosso guard exige co-ocorrência com decisao/escolha/aqui/nessa.
// "tô perdido na cidade" → não deve disparar
test("D.5 tô perdido na cidade [com âncora — fora do contexto]",
  "tô perdido na cidade",
  { expectedType: MIA_TURN_TYPES.UNKNOWN });  // sem "decisao/escolha/aqui"

// D.6 — "fazer besteira" em outro contexto sem âncora
test("D.6 não quero fazer besteira [sem âncora]",
  "não quero fazer besteira",
  { expectedType: MIA_TURN_TYPES.UNKNOWN, hasAnchor: false });

// D.7 — "não sei qual" com âncora → continua sendo guard
test("D.7 não sei qual celular comprar [com âncora]",
  "não sei qual celular comprar",
  { expectedType: MIA_TURN_TYPES.UNKNOWN });

// D.8 — "em dúvida entre dois produtos" → UNKNOWN (sem "ou"/"vs" explícito)
// Comportamento pré-existente: hesitation guard bloqueia corretamente,
// mas comparison não ativa sem "ou"/"vs"/link explícito.
// O importante é que NÃO classifica como hesitation/OBJECTION. ✓
test("D.8 em dúvida entre dois produtos [guard bloqueia hesitation]",
  "em dúvida entre o Samsung e o iPhone",
  { expectedType: MIA_TURN_TYPES.UNKNOWN });

// ─────────────────────────────────────────────────────────────
// GRUPO E — Regressões (famílias existentes intactas)
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo E: Regressões (famílias existentes) ───────────────────────────");

// E.1 — Family A (doubt) original
test("E.1 [reg] to na dúvida", "to na dúvida ainda",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.2 [reg] continuo em dúvida", "continuo em dúvida",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.3 — Family B (indecision) original
test("E.3 [reg] não consigo decidir", "não consigo decidir",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.4 [reg] tô indeciso", "tô indeciso",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.5 — Family C original
test("E.5 [reg] não sei explicar", "não sei explicar",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.6 [reg] não sei bem", "não sei bem",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.7 — Family D original
test("E.7 [reg] não tô seguro", "não tô seguro",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.8 [reg] não me sinto tranquilo", "não me sinto tranquilo",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.9 [reg] não tô confiante", "não tô confiante",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.10 — Family E original
test("E.10 [reg] não me convenceu", "não me convenceu",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.11 [reg] não bateu ainda", "não bateu ainda",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.12 [reg] não me ganhou", "não me ganhou",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.13 — Family F original (short informal)
test("E.13 [reg] hmm", "hmm",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.14 [reg] sei lá", "sei lá",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.15 [reg] não sei (standalone)", "não sei",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.16 — OBJECTION de preço original (não deve ser afetado)
test("E.16 [reg] acho caro demais", "acho caro demais",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.17 [reg] não gostei dele", "não gostei dele",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.18 [reg] não quero esse", "não quero esse",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.19 — ALTERNATIVE_REQUEST intacto (não deve ser confundido com paralysis/hesitation)
test("E.19 [reg] quem quase ganhou?", "quem quase ganhou?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("E.20 [reg] e o terceiro?", "e o terceiro?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// E.21 — PRIORITY_SHIFT intacto
test("E.21 [reg] camera virou prioridade", "na verdade câmera começou a pesar mais",
  { expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT });

test("E.22 [reg] uso para trabalho", "uso para trabalho e estudo",
  { expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT });

// E.23 — EXPLANATION_REQUEST intacto
test("E.23 [reg] me explica como leigo", "me explica como se eu fosse leigo",
  { expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST });

test("E.24 [reg] por que esse?", "por que você escolheu esse?",
  { expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST });

// E.25 — FOLLOW_UP intacto
test("E.25 [reg] e a bateria?", "e a bateria?",
  { expectedType: MIA_TURN_TYPES.FOLLOW_UP });

// ─────────────────────────────────────────────────────────────
// RELATÓRIO
// ─────────────────────────────────────────────────────────────

const DIVIDER = "═".repeat(60);

console.log(`\n${DIVIDER}`);
console.log(" PATCH 7.6F — Hesitation Family Expansion");
console.log(` Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
console.log(DIVIDER);

if (failures.length > 0) {
  console.log("\nFalhas:\n");
  failures.forEach(f => console.log(f));
}

if (failed === 0) {
  console.log("\n  ✓ Todos os testes passaram. Zero regressões.\n");
} else {
  console.log(`\n  ✗ ${failed} teste(s) falharam.\n`);
  process.exit(1);
}
