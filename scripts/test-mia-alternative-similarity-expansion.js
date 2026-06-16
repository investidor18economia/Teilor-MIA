/**
 * PATCH 7.6G — Alternative & Similarity Semantic Expansion
 *
 * MIA_ALTERNATIVE_SIMILARITY_AUDIT
 *
 * Famílias cognitivas expandidas:
 *
 *   Grupo A — Similarity Discovery  (REFINEMENT)
 *             "algo parecido", "mesma linha", "mesmo perfil", "nessa pegada"
 *
 *   Grupo B — Relative Ranking Discovery  (ALTERNATIVE_REQUEST)
 *             "logo atrás", "chegou perto", "ficou colado", "perdeu por pouco"
 *
 *   Grupo C — Soft Alternative Discovery  (ALTERNATIVE_REQUEST)
 *             "me mostra outras opções", "tem algo além desse"
 *
 *   Grupo D — Negativos  (guardrails — NÃO devem classificar errado)
 *             "logo atrás da minha casa", "mesma linha de ônibus", "perfil do instagram"
 *
 *   Grupo E — Regressões  (comportamento existente não pode mudar)
 *             Todos os patches anteriores: 7.6F, 7.6E, 7.6D, 7.6C, 7.6B, 7.6A, 7.5, 7.4
 *
 * Usage: node scripts/test-mia-alternative-similarity-expansion.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const WINNER = { product_name: "Samsung Galaxy A55", price: "R$ 1.899" };

const WITH_ANCHOR = {
  lastBestProduct: WINNER,
  lastProductMentioned: WINNER.product_name,
  lastProducts: [WINNER],
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

  const ok = result.turnType === expectedType;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}\n      esperado: ${expectedType}\n      obtido  : ${result.turnType}\n      query   : "${query}"`;
    console.log(msg);
    failures.push(msg);
  }
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — Similarity Discovery
// ─────────────────────────────────────────────────────────────
// Intenção: alternativa com perfil/característica similar.
// Esperado: REFINEMENT

console.log("\n── Grupo A: Similarity Discovery (REFINEMENT) ──────────────────────────");

// A.1 — Similarity adjectives (S1)
test("A.1 algo parecido com esse", "tem algo parecido com esse?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.2 algo semelhante", "algo semelhante a esse?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.3 algo equivalente", "algo equivalente ao que você mostrou?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.4 algo similar", "tem algo similar?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.5 algo parecido mas mais barato", "algo parecido mas mais barato?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.6 algo parecido mas melhor", "tem algo parecido mas um pouco melhor?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.7 semelhante com esse", "semelhante com esse porém mais acessível?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

// A.8 — Same-line/profile patterns (S2)
test("A.8 algo na mesma linha", "algo na mesma linha?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.9 algo com o mesmo perfil", "algo com o mesmo perfil?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.10 mesma proposta", "algo com a mesma proposta?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.11 mesmo estilo", "algo no mesmo estilo?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.12 mesma ideia", "algo com a mesma ideia?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.13 mesma faixa de qualidade", "algo na mesma faixa de qualidade?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.14 nessa pegada", "tem algo nessa pegada?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.15 nessa faixa de preço", "tem algo nessa faixa de preço?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.16 perfil parecido", "algo com perfil parecido?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("A.17 mesmo nível", "algo no mesmo nível?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

// ─────────────────────────────────────────────────────────────
// GRUPO B — Relative Ranking Discovery
// ─────────────────────────────────────────────────────────────
// Intenção: runner-up por posição relativa, sem ordinal explícito.
// Esperado: ALTERNATIVE_REQUEST

console.log("\n── Grupo B: Relative Ranking Discovery (ALTERNATIVE_REQUEST) ───────────");

// B.1 — "logo atrás"
test("B.1 quem ficou logo atrás", "quem ficou logo atrás?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.2 e quem ficou logo atrás dele", "e quem ficou logo atrás dele?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.3 qual veio logo atrás", "qual veio logo atrás?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// B.4 — "chegou perto / ficou mais perto"
test("B.4 quem chegou mais perto", "quem chegou mais perto?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.5 qual ficou mais perto dele", "qual ficou mais perto dele?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.6 o que ficou mais próximo", "o que ficou mais próximo?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// B.7 — "ficou colado"
test("B.7 tinha alguém colado em segundo", "tinha alguém colado em segundo?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.8 quem ficou colado", "quem ficou colado atrás do vencedor?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// B.9 — "por pouco"
test("B.9 quem perdeu por pouco", "quem perdeu por pouco?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.10 ficou por pouco", "ficou por pouco?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// B.11 — "quase levou"
test("B.11 quem quase levou", "quem quase levou?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.12 quase foi escolhido", "qual quase foi escolhido?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// B.13 — "veio logo depois"
test("B.13 qual veio logo depois", "qual veio logo depois?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.14 veio depois na lista", "quem veio depois na lista?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// B.15 — Já cobertos (regressão)
test("B.15 [reg] quem quase ganhou", "quem quase ganhou?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("B.16 [reg] qual seria o próximo", "qual seria o próximo?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// ─────────────────────────────────────────────────────────────
// GRUPO C — Soft Alternative Discovery
// ─────────────────────────────────────────────────────────────
// Intenção: exploração aberta de alternativas sem critério de ranking.
// Esperado: ALTERNATIVE_REQUEST

console.log("\n── Grupo C: Soft Alternative Discovery (ALTERNATIVE_REQUEST) ───────────");

test("C.1 me mostra outras opções", "me mostra outras opções",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("C.2 me mostra outras alternativas", "me mostra outras alternativas",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("C.3 me mostra outros modelos", "me mostra outros modelos",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("C.4 tem algo além desse", "tem algo além desse?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("C.5 tem algo além dessa", "tem algo além dessa opção?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("C.6 que outros você olharia", "que outros você olharia?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("C.7 o que mais faria sentido", "o que mais você consideraria?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// ─────────────────────────────────────────────────────────────
// GRUPO D — Negativos (guardrails)
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo D: Negativos (guardrails) ─────────────────────────────────────");

// D.1 — "logo atrás" with location context → NOT ALTERNATIVE_REQUEST
test("D.1 logo atrás da minha casa [location guard]",
  "fica logo atrás da minha casa",
  { expectedType: MIA_TURN_TYPES.UNKNOWN });

test("D.2 veio depois da entrega [delivery guard]",
  "o pedido veio depois da entrega",
  { expectedType: MIA_TURN_TYPES.UNKNOWN });

// D.3 — "mesma linha" with transport context → NOT REFINEMENT
test("D.3 mesma linha de ônibus [transport guard]",
  "pega a mesma linha de ônibus",
  { expectedType: MIA_TURN_TYPES.UNKNOWN });

// D.4 — "perfil do instagram" → NOT REFINEMENT (no "mesmo/parecido" prefix)
test("D.4 perfil do instagram [no prefix]",
  "vou postar no perfil do instagram",
  { expectedType: MIA_TURN_TYPES.UNKNOWN });

// D.5 — sem âncora → não deve classificar como REFINEMENT/ALTERNATIVE_REQUEST
test("D.5 algo parecido [sem âncora]",
  "tem algo parecido com esse?",
  { expectedType: MIA_TURN_TYPES.UNKNOWN, hasAnchor: false });

test("D.6 logo atrás [sem âncora]",
  "quem ficou logo atrás?",
  { expectedType: MIA_TURN_TYPES.UNKNOWN, hasAnchor: false });

// D.7 — "da loja" aciona COMMERCIAL_QUESTION pré-existente — comportamento correto
// (não deve ser ALTERNATIVE_REQUEST, que é o importante)
test("D.7 o produto ficou perto da loja [não é ALTERNATIVE_REQUEST ✓]",
  "o produto ficou perto da loja?",
  { expectedType: MIA_TURN_TYPES.COMMERCIAL_QUESTION });

// ─────────────────────────────────────────────────────────────
// GRUPO E — Regressões (famílias existentes)
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo E: Regressões ─────────────────────────────────────────────────");

// E.1 — ALTERNATIVE_REQUEST (núcleo 7.5) intacto
test("E.1 [reg 7.5] top 3", "top 3",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("E.2 [reg 7.5] e o terceiro?", "e o terceiro?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("E.3 [reg 7.5] plano B", "qual seria o plano B?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("E.4 [reg 7.5] se eu não quiser esse", "se eu não quiser esse, qual seria?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

// E.5 — OBJECTION (price) intacto
test("E.5 [reg] acho caro demais", "acho caro demais",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.6 [reg] não gostei dele", "não gostei dele",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.7 — PRIORITY_SHIFT intacto
test("E.7 [reg] câmera começou a pesar", "na verdade câmera começou a pesar mais",
  { expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT });

// E.8 — EXPLANATION_REQUEST intacto
test("E.8 [reg] por que esse?", "por que você escolheu esse?",
  { expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST });

// E.9 — FOLLOW_UP intacto (não deve ser confundido com relative ranking)
test("E.9 [reg] e a bateria?", "e a bateria?",
  { expectedType: MIA_TURN_TYPES.FOLLOW_UP });

test("E.10 [reg] e o preço?", "e o preço?",
  { expectedType: MIA_TURN_TYPES.FOLLOW_UP });

// E.11 — REFINEMENT (núcleo) intacto
test("E.11 [reg] mais barato", "tem algo mais barato?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

test("E.12 [reg] tem algo diferente", "tem algo diferente?",
  { expectedType: MIA_TURN_TYPES.REFINEMENT });

// E.13 — Hesitation (7.6F) intacto
test("E.13 [reg 7.6F] não me convenceu", "não me convenceu",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.14 [reg 7.6F] não queria fazer besteira", "não queria fazer besteira",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

test("E.15 [reg 7.6F] tô travado", "tô travado nessa escolha",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// E.16 — OBJECTION priority (7.6B) intacto
test("E.16 [reg 7.6B] quem quase ganhou", "quem quase ganhou?",
  { expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST });

test("E.17 [reg 7.6C] não sei explicar", "não sei explicar",
  { expectedType: MIA_TURN_TYPES.OBJECTION });

// ─────────────────────────────────────────────────────────────
// RELATÓRIO
// ─────────────────────────────────────────────────────────────

const DIV = "═".repeat(60);

console.log(`\n${DIV}`);
console.log(" MIA_ALTERNATIVE_SIMILARITY_AUDIT — PATCH 7.6G");
console.log(` Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
console.log(DIV);

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
