/**
 * PATCH 7.6F-AUDIT — MIA Semantic Family Audit
 *
 * MIA_SEMANTIC_FAMILY_AUDIT
 *
 * Objetivo: descobrir quais intenções humanas ainda não possuem representação
 * cognitiva no router. Não auditar frases — auditar INTENÇÕES.
 *
 * Princípio central:
 *   Uma mesma intenção pode ser expressa de dezenas de formas.
 *   O sistema deve cobrir a intenção, não as frases.
 *
 * Famílias investigadas:
 *   A — Decisional Discomfort
 *       Usuário não rejeita, não aceita, não muda prioridade,
 *       mas não consegue decidir / algo incomoda internamente.
 *
 *   B — Purchase Anxiety
 *       Medo de errar, medo financeiro, medo de arrependimento.
 *
 *   C — Decision Paralysis
 *       Bloqueio de decisão: perdido, travado, paralisado.
 *
 *   D — Soft Alternative Discovery
 *       Busca algo "parecido", "na mesma linha", "semelhante" —
 *       não pede posição de ranking explícita.
 *
 *   E — Relative Ranking Discovery
 *       "quem veio atrás", "quem ficou logo atrás" —
 *       sem ordinal explícito.
 *
 *   F — Comparative Safety Seeking
 *       "menos dor de cabeça", "mais seguro", "menos risco" —
 *       comparação sem estrutura explícita "X ou Y".
 *
 *   G — Human Explanation Request
 *       Pedido de explicação simples: "como leigo", "sem técnico",
 *       "simplifica" — inclui escolha hipotética.
 *
 *   H — Sanity / Baseline
 *       Famílias já existentes — verificar cobertura real.
 *
 * Nenhuma modificação ao código de produção.
 * Apenas classifica, registra gaps e produz relatório cognitivo.
 *
 * Usage: node scripts/test-mia-semantic-family-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
} from "../lib/miaCognitiveRouter.js";

// ─────────────────────────────────────────────────────────────
// Constantes de gap
// ─────────────────────────────────────────────────────────────

const COVERAGE = Object.freeze({
  FULL:    "FULL",    // router classifica corretamente
  PARTIAL: "PARTIAL", // router classifica mas não é o tipo ideal
  MISSING: "MISSING", // router retorna UNKNOWN
});

const GAP_TYPE = Object.freeze({
  VOCABULARY_GAP:      "VOCABULARY_GAP",      // intenção existe, mas vocabulário não mapeado
  ROUTER_PRIORITY_GAP: "ROUTER_PRIORITY_GAP", // tipo errado ganha por prioridade
  MISSING_FAMILY:      "MISSING_FAMILY",      // família cognitiva não existe no sistema
  PARTIAL_FAMILY:      "PARTIAL_FAMILY",      // família existe mas cobre apenas parte
  CONTRACT_GAP:        "CONTRACT_GAP",        // router ok, contrato/resposta não está certo
  NO_GAP:              "NO_GAP",              // sem gap
});

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
  lastPriority: "equilibrio",
};

// ─────────────────────────────────────────────────────────────
// Counters e acumuladores
// ─────────────────────────────────────────────────────────────

const results = [];
let total = 0;
let fullCoverage = 0;
let partialCoverage = 0;
let missingCoverage = 0;

const gapCounts = {};
Object.values(GAP_TYPE).forEach(g => { gapCounts[g] = 0; });

const familyCoverageMap = {};

// ─────────────────────────────────────────────────────────────
// Função de auditoria de cenário
// ─────────────────────────────────────────────────────────────

function audit({
  query,
  family,
  intent,          // descrição da INTENÇÃO (não da frase)
  expectedType,    // MIA_TURN_TYPES esperado
  coverageStatus,  // FULL | PARTIAL | MISSING (expectativa)
  gapType,         // GAP_TYPE esperado
  recommendation,  // o que fazer
  hasAnchor = true,
}) {
  total++;

  const cogResult = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: hasAnchor ? SESSION_WITH_ANCHOR : {},
    hasActiveAnchor: hasAnchor,
  });

  const detectedType  = cogResult.turnType;
  const confidence    = cogResult.confidence;
  const isCorrect     = detectedType === expectedType;
  const isUnknown     = detectedType === MIA_TURN_TYPES.UNKNOWN;

  // Cobertura real (confirmada por execução, não expectativa)
  let realCoverage;
  if (detectedType === expectedType) {
    realCoverage = COVERAGE.FULL;
    fullCoverage++;
  } else if (!isUnknown && detectedType !== MIA_TURN_TYPES.UNKNOWN) {
    realCoverage = COVERAGE.PARTIAL;
    partialCoverage++;
  } else {
    realCoverage = COVERAGE.MISSING;
    missingCoverage++;
  }

  gapCounts[gapType] = (gapCounts[gapType] || 0) + 1;

  if (!familyCoverageMap[family]) {
    familyCoverageMap[family] = { full: 0, partial: 0, missing: 0, total: 0 };
  }
  familyCoverageMap[family].total++;
  if (realCoverage === COVERAGE.FULL)    familyCoverageMap[family].full++;
  if (realCoverage === COVERAGE.PARTIAL) familyCoverageMap[family].partial++;
  if (realCoverage === COVERAGE.MISSING) familyCoverageMap[family].missing++;

  const record = {
    query,
    family,
    intent,
    expectedType,
    detectedType,
    confidence,
    realCoverage,
    expectedCoverage: coverageStatus,
    isCorrect,
    gapType: isCorrect ? GAP_TYPE.NO_GAP : gapType,
    recommendation,
  };

  results.push(record);

  const icon = realCoverage === COVERAGE.FULL ? "✓" :
               realCoverage === COVERAGE.PARTIAL ? "~" : "✗";
  const tag = `[${family}]`;
  const type = `${detectedType}${isCorrect ? "" : ` (esperado: ${expectedType})`}`;
  console.log(`${icon} ${tag} ${type} | "${query.substring(0, 60)}"`);

  return record;
}

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA A — Decisional Discomfort  ██████████████████████
// ─────────────────────────────────────────────────────────────
//
// INTENÇÃO: o usuário não rejeita nem aceita — algo interno
// impede a decisão, mas não há verbalização clara do bloqueio.
//
// Diferente de OBJECTION (rejeição explícita) e de PURCHASE_ANXIETY
// (medo de errar). É desconforto difuso com a recomendação atual.
//
// Cobertura atual: PARTIAL — hesitation Family E cobre "não me
// convenceu" e "não bateu", mas não cobre expressões de desconforto
// difuso como "algo me incomoda" ou "sentindo confiança".
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA A — Decisional Discomfort ═══");

// A.1 — Ausência de confiança interna (não diz "não gostei", só "não sinto")
audit({ family:"A", query:"não tô sentindo confiança nessa escolha",
  intent:"ausência de confiança interna — não rejeição explícita",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Expandir hesitation Family D: 'sentindo confiança' → 'confiante/seguro'" });

audit({ family:"A", query:"não me sinto confiante com essa escolha",
  intent:"ausência de confiança interna",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Hesitation Family D cobre 'não me sinto seguro' mas não 'confiante'" });

audit({ family:"A", query:"tô sem segurança nessa decisão",
  intent:"ausência de confiança interna",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Sem segurança/confiança no contexto decisão não coberto" });

// A.2 — Desconforto difuso / algo incomoda (sem saber o que é)
audit({ family:"A", query:"é estranho, mas parece que tem alguma coisa me incomodando",
  intent:"desconforto difuso indefinido",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Family C cobre 'não sei o que me incomoda' mas não 'alguma coisa me incomodando'" });

audit({ family:"A", query:"algo me incomoda nessa escolha",
  intent:"desconforto difuso indefinido",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Family C hesitation: adicionar 'algo me incomoda' variant" });

audit({ family:"A", query:"não consigo apontar exatamente o que é",
  intent:"desconforto difuso — não consegue articular o bloqueio",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Family C cobre 'não sei explicar' mas não 'não consigo apontar'" });

audit({ family:"A", query:"não consigo explicar mas tá me incomodando",
  intent:"desconforto difuso — articulação difícil",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'não consigo explicar' pode ser coberto por Family C mas 'incomodando' não está" });

// A.3 — Não bateu / não convenceu (cobertos pelo hesitation E)
audit({ family:"A", query:"rapaz, ainda não me convenceu",
  intent:"não convencimento — o produto ainda não ganhou confiança",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family E ✓" });

audit({ family:"A", query:"não bateu ainda",
  intent:"não convencimento informal",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family E ✓" });

audit({ family:"A", query:"não me ganhou",
  intent:"não convencimento informal",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family E ✓" });

// A.4 — Incerteza sobre a sensação (meta-desconforto)
audit({ family:"A", query:"não sei se é isso que eu quero",
  intent:"incerteza sobre a própria preferência",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Family C cobre 'não sei o que eu quero' — verificar cobertura exata" });

audit({ family:"A", query:"não sei se esse é o certo pra mim",
  intent:"incerteza sobre adequação pessoal",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Novo padrão: 'não sei se é o certo para mim'" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA B — Purchase Anxiety  ████████████████████████████
// ─────────────────────────────────────────────────────────────
//
// INTENÇÃO: medo de errar, medo financeiro, medo de arrependimento.
//
// Diferente de OBJECTION (o produto é caro) — não é sobre o preço,
// é sobre o risco da decisão. Diferente de Decisional Discomfort —
// há um elemento de MEDO ou CONSEQUÊNCIA FINANCEIRA explícito.
//
// Cobertura atual: PARTIAL — OBJECTION cobre "não queria gastar
// (isso)" mas não cobre "fazer besteira", "errar", "me arrepender".
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA B — Purchase Anxiety ═══");

// B.1 — Medo de arrependimento/decisão errada
audit({ family:"B", query:"não queria fazer besteira com esse dinheiro",
  intent:"medo de arrependimento — decisão financeira errada",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "OBJECTION unwantedExpense cobre 'não queria gastar' mas não 'fazer besteira'" });

audit({ family:"B", query:"tenho medo de me arrepender",
  intent:"medo de arrependimento pós-compra",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "Família cognitiva não existe: regret/arrependimento como intenção própria" });

audit({ family:"B", query:"e se eu me arrepender depois?",
  intent:"medo de arrependimento hipotético",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "Hipotético de arrependimento não coberto" });

audit({ family:"B", query:"não queria errar nessa compra",
  intent:"medo de erro de compra",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Novo vocabulário: 'errar' no contexto de compra" });

// B.2 — Medo financeiro (não é sobre preço, é sobre o gasto)
audit({ family:"B", query:"é muito dinheiro pra investir de uma vez",
  intent:"peso financeiro — não é rejeição de preço",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "OBJECTION pode capturar 'muito dinheiro' — verificar exato" });

audit({ family:"B", query:"tenho receio de gastar errado",
  intent:"medo de gasto errado — não rejeição de preço",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "'receio' não coberto. Padrão de medo de gasto ≠ objeção de preço" });

audit({ family:"B", query:"e se sair um modelo melhor logo depois que eu comprar?",
  intent:"medo de obsolescência imediata",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "Família nova: obsolescence_fear. Sem cobertura atual." });

// B.3 — Segurança financeira explícita
audit({ family:"B", query:"não quero gastar errado",
  intent:"medo de gasto mal-direcionado",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "OBJECTION unwanted_expense: 'nao queria gastar' — mas 'gastar errado' ≠ 'gastar isso'" });

audit({ family:"B", query:"preciso ter certeza antes de fechar",
  intent:"necessidade de certeza antes da compra",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "Intenção de confirmação pré-compra sem cobertura" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA C — Decision Paralysis  ██████████████████████████
// ─────────────────────────────────────────────────────────────
//
// INTENÇÃO: bloqueio de decisão — o usuário está paralisado,
// perdido, travado. Diferente de Decisional Discomfort (algo
// incomoda) — aqui é um estado de incapacidade de avançar.
//
// Cobertura atual: PARTIAL — hesitation Family B cobre "não
// consigo decidir", Family A cobre "continuo em dúvida".
// Mas "travado", "perdido", "paralisado" não estão cobertos.
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA C — Decision Paralysis ═══");

// C.1 — Paralisação explícita
audit({ family:"C", query:"tô meio perdido nessa decisão",
  intent:"paralisia decisória — perdido",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Hesitation Family não tem 'perdido' — novo vocab para paralisia" });

audit({ family:"C", query:"tô travado nessa escolha",
  intent:"paralisia decisória — travado",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Travado' não está em nenhuma família. Expandir hesitation." });

audit({ family:"C", query:"não consigo me decidir",
  intent:"paralisia decisória — não consegue decidir",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family B ✓" });

audit({ family:"C", query:"continuo em dúvida sobre esse",
  intent:"estado persistente de dúvida",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family A ✓" });

audit({ family:"C", query:"não to conseguindo decidir por nada",
  intent:"paralisia generalizada de decisão",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Family B cobre 'não consigo decidir' mas não 'por nada' variante" });

audit({ family:"C", query:"não sai do lugar essa decisão",
  intent:"bloqueio de decisão sem progresso",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Novo padrão: estagnação da decisão sem avançar" });

audit({ family:"C", query:"não sei por onde começar a decidir",
  intent:"falta de critério para tomar decisão",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Sem referência de decisão — gap de orientação inicial" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA D — Soft Alternative Discovery  ██████████████████
// ─────────────────────────────────────────────────────────────
//
// INTENÇÃO: o usuário quer explorar alternativas sem pedir
// posição de ranking explícita. Não é "o segundo" (ALTERNATIVE_REQUEST)
// mas "algo parecido" / "nessa linha" / "semelhante".
//
// Cobertura atual: PARTIAL — REFINEMENT cobre "tem algo mais/melhor",
// mas não cobre "parecido", "mesma linha", "semelhante".
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA D — Soft Alternative Discovery ═══");

// D.1 — Semelhança / mesma linha
audit({ family:"D", query:"tem algo parecido com esse?",
  intent:"exploração de alternativa semelhante — não por ranking",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Refinement patterns: adicionar 'parecido' / 'similar'" });

audit({ family:"D", query:"algo na mesma linha?",
  intent:"alternativa na mesma categoria/perfil",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Sem cobertura de 'mesma linha' como alternativa" });

audit({ family:"D", query:"tem algo semelhante só que mais acessível?",
  intent:"alternativa semelhante com restrição de preço",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'mais acessível' pode ativar refinement, mas 'semelhante' é silêncio" });

audit({ family:"D", query:"tem outra opção nessa categoria?",
  intent:"alternativa na mesma categoria — exploratório",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.ROUTER_PRIORITY_GAP,
  recommendation: "'outra opcao' também está em detectsObjectionSignal! Possível priority gap." });

audit({ family:"D", query:"tem algo equivalente mas de outra marca?",
  intent:"alternativa equivalente de marca diferente",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'equivalente' / 'de outra marca' sem cobertura em refinement" });

audit({ family:"D", query:"algo com o mesmo perfil?",
  intent:"alternativa de mesmo perfil de uso",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Perfil de uso como critério de alternativa — sem cobertura" });

// D.2 — Alternativa sem especificar ("outra opção" genérico)
audit({ family:"D", query:"tem outra coisa pra eu considerar?",
  intent:"abertura exploratória de alternativas",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Abertura exploratória genérica sem cobertura específica" });

audit({ family:"D", query:"me mostra outras opções",
  intent:"pedido de múltiplas alternativas sem critério específico",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Sem 'top N' ou ordinal — pode cair em UNKNOWN" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA E — Relative Ranking Discovery  ██████████████████
// ─────────────────────────────────────────────────────────────
//
// INTENÇÃO: descobrir quem ficou atrás/perto do winner, sem usar
// ordinal explícito. Diferente de Family D (alternativa por perfil)
// e Family ordinal (terceiro, quarto).
//
// Cobertura atual: PARTIAL — "quem quase ganhou" e "plano B" cobertos,
// mas "ficou logo atrás", "quem chegou perto", "o mais próximo" não.
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA E — Relative Ranking Discovery ═══");

// E.1 — Runner-up por posição relativa (não ordinal)
audit({ family:"E", query:"e quem ficou logo atrás dele?",
  intent:"runner-up por posição relativa — 'logo atrás'",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Runner-up cobre 'em segundo' e 'quase ganhou' mas não 'logo atrás'" });

audit({ family:"E", query:"quem chegou perto do winner?",
  intent:"proximidade de ranking informal",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Chegou perto' como runner-up relacional — sem cobertura" });

audit({ family:"E", query:"tinha alguém colado em segundo?",
  intent:"proximidade de pontuação ao runner-up",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Colado em segundo' = runner-up by score — vocabulário informal" });

audit({ family:"E", query:"qual ficou mais perto dele?",
  intent:"produto de pontuação próxima ao winner",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Mais perto' / 'mais próximo' sem cobertura em alternativeRequest" });

// E.2 — Já cobertos (baseline)
audit({ family:"E", query:"quem quase ganhou?",
  intent:"runner-up — 'quase ganhou'",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por ALTERNATIVE_REQUEST Family C ✓" });

audit({ family:"E", query:"e o terceiro da lista?",
  intent:"posição ordinal explícita — terceiro",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por ALTERNATIVE_REQUEST Family B (ordinals) ✓" });

audit({ family:"E", query:"qual seria o próximo?",
  intent:"next-best option — 'o próximo'",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por ALTERNATIVE_REQUEST Family C ('o próximo') ✓" });

// E.3 — Ranking relativo por qualidade (não posição)
audit({ family:"E", query:"me mostra os três que mais fizeram sentido",
  intent:"top-3 por critério qualitativo — não por posição fixa",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Os três que fizeram sentido' é top-N semântico, não '/top 3/' literal" });

audit({ family:"E", query:"os que chegaram mais perto do ideal",
  intent:"top-N por critério qualitativo",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Chegaram mais perto do ideal' — ranking qualitativo sem cobertura" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA F — Comparative Safety Seeking  ██████████████████
// ─────────────────────────────────────────────────────────────
//
// INTENÇÃO: o usuário busca o produto mais seguro/tranquilo,
// usando critérios de baixo risco, não de performance técnica.
// Diferente de COMPARISON ("entre X e Y") — não é estrutura
// comparativa explícita. Diferente de PRIORITY_SHIFT — não é eixo
// técnico (camera, bateria) mas eixo emocional (confiança, segurança).
//
// Cobertura atual: MISSING — esses queries geralmente caem em
// UNKNOWN ou FOLLOW_UP porque o vocabulário de safety não está
// mapeado como eixo de prioridade nem como comparação.
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA F — Comparative Safety Seeking ═══");

// F.1 — Segurança / confiabilidade como critério
audit({ family:"F", query:"entre esses, qual é mais seguro?",
  intent:"escolha por critério de segurança/confiabilidade",
  expectedType: MIA_TURN_TYPES.COMPARISON_FOLLOWUP,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Mais seguro' sem produtos explícitos não ativa comparison — UNKNOWN" });

audit({ family:"F", query:"qual tende a dar menos dor de cabeça?",
  intent:"preferência por menor custo de manutenção/problema",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Dor de cabeça' não está em nenhum eixo — eixo emocional não mapeado" });

audit({ family:"F", query:"qual tem menos chance de dar problema?",
  intent:"confiabilidade / risco de defeito como critério",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "Eixo de risco/confiabilidade ausente no sistema" });

audit({ family:"F", query:"qual é mais confiável no longo prazo?",
  intent:"confiabilidade temporal / longevidade de qualidade",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "PRIORITY_SHIFT cobre 'durabilidade' mas 'confiável no longo prazo' é semantic gap" });

audit({ family:"F", query:"entre o primeiro e o segundo, qual você manteria?",
  intent:"escolha hipotética entre posições de ranking",
  expectedType: MIA_TURN_TYPES.COMPARISON_FOLLOWUP,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Qual você manteria' com ordinal relativo — verificar cobertura" });

audit({ family:"F", query:"qual tem melhor reputação?",
  intent:"reputação de marca / histórico como critério",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "Eixo de reputação/histórico não mapeado" });

// F.2 — Custo emocional de manutenção
audit({ family:"F", query:"qual dá menos trabalho no dia a dia?",
  intent:"esforço operacional / manutenção como critério",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Menos trabalho' como eixo de escolha — sem cobertura" });

audit({ family:"F", query:"qual tende a envelhecer melhor?",
  intent:"longevidade de qualidade",
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "PRIORITY_SHIFT Layer G cobre 'envelhece melhor' — mas 'envelhecer melhor' vs 'forma tranquila'" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA G — Human Explanation Request  ███████████████████
// ─────────────────────────────────────────────────────────────
//
// INTENÇÃO: o usuário pede uma explicação em linguagem simples,
// sem jargão técnico, ou faz uma escolha hipotética.
//
// Cobertura atual: PARTIAL — "me explica sem linguagem técnica"
// e "como se fosse leigo" cobertos. Mas "simplifica", "fala simples",
// "se você tivesse que escolher" não estão cobertos.
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA G — Human Explanation Request ═══");

// G.1 — Já cobertos (baseline de EXPLANATION_REQUEST)
audit({ family:"G", query:"agora me explica isso sem usar linguagem técnica",
  intent:"pedido de explicação simples — sem técnico",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por EXPLANATION_REQUEST ✓" });

audit({ family:"G", query:"me explica como se eu fosse leigo",
  intent:"pedido de explicação acessível",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por EXPLANATION_REQUEST ✓" });

audit({ family:"G", query:"por que esse faz sentido?",
  intent:"justificativa da recomendação",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por EXPLANATION_REQUEST ✓" });

// G.2 — Simplificação (gaps)
audit({ family:"G", query:"simplifica pra mim",
  intent:"pedido de simplificação de linguagem",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Simplifica' não está em detectsExplanationRequestSignal" });

audit({ family:"G", query:"fala de forma simples",
  intent:"pedido de linguagem simples",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Forma simples' / 'de forma simples' sem cobertura" });

audit({ family:"G", query:"pode resumir o que importa?",
  intent:"pedido de síntese/resumo",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Resumir o que importa' como pedido de síntese — sem cobertura" });

// G.3 — Escolha hipotética (gap crítico)
audit({ family:"G", query:"se você tivesse que escolher um só, qual manteria?",
  intent:"escolha hipotética — força posição definitiva do sistema",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Se você tivesse que escolher' — framig hipotético não coberto" });

audit({ family:"G", query:"qual você escolheria se fosse você?",
  intent:"escolha hipotética com perspectiva do sistema",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Escolheria se fosse você' — framig hipotético agente" });

audit({ family:"G", query:"qual desses você compraria?",
  intent:"pedido de posição definitiva do sistema",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Você compraria' — posição definitiva solicitada ao sistema" });

// G.4 — Comparação qualitativa sem estrutura comparativa
audit({ family:"G", query:"qual desses envelhece de forma mais tranquila?",
  intent:"longevidade de qualidade — não eixo técnico",
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "PRIORITY_SHIFT Layer G: 'envelhece'+'melhor' mas 'tranquila' não equivale a 'melhor'" });

audit({ family:"G", query:"quero algo que continue bom daqui alguns anos",
  intent:"durabilidade temporal — longevidade de qualidade",
  expectedType: MIA_TURN_TYPES.REFINEMENT,
  coverageStatus: COVERAGE.PARTIAL,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Pode ativar PRIORITY_SHIFT por 'anos' em _axisExpanded — verificar" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA H — Baseline / Sanity (já cobertos) ██████████████
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA H — Baseline / Sanity ═══");

// H.1 — OBJECTION claro
audit({ family:"H", query:"acho caro demais",
  intent:"objeção de preço explícita",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por OBJECTION price signal ✓" });

audit({ family:"H", query:"não gostei dele",
  intent:"rejeição explícita do produto",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por OBJECTION ✓" });

// H.2 — ALTERNATIVE_REQUEST claro
audit({ family:"H", query:"se eu desistisse desse, qual seria o próximo?",
  intent:"runner-up explícito com hipotético",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por ALTERNATIVE_REQUEST Family C ✓" });

audit({ family:"H", query:"top 3",
  intent:"top-N explícito",
  expectedType: MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por ALTERNATIVE_REQUEST Family A ✓" });

// H.3 — PRIORITY_SHIFT claro
audit({ family:"H", query:"na verdade câmera começou a pesar mais",
  intent:"mudança de eixo de prioridade — câmera",
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por PRIORITY_SHIFT ('na verdade' + axis) ✓" });

audit({ family:"H", query:"uso mais vídeo e rede social",
  intent:"revelação de caso de uso — câmera/social",
  expectedType: MIA_TURN_TYPES.PRIORITY_SHIFT,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por PRIORITY_SHIFT Layer D (usage reveal) ✓" });

// H.4 — EXPLANATION_REQUEST claro
audit({ family:"H", query:"por que você escolheu esse?",
  intent:"justificativa da recomendação",
  expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por EXPLANATION_REQUEST ✓" });

// H.5 — FOLLOW_UP claro
audit({ family:"H", query:"e a bateria?",
  intent:"follow-up sobre atributo específico",
  expectedType: MIA_TURN_TYPES.FOLLOW_UP,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por FOLLOW_UP ✓" });

audit({ family:"H", query:"e o preço?",
  intent:"follow-up sobre preço",
  expectedType: MIA_TURN_TYPES.FOLLOW_UP,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por FOLLOW_UP ✓" });

// H.6 — Hesitation claro
audit({ family:"H", query:"to na dúvida ainda",
  intent:"dúvida persistente",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family A ✓" });

audit({ family:"H", query:"não sei explicar",
  intent:"incapacidade de articular bloqueio",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family C ✓" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA I — Frases informais / curtas / emocionais ████████
// ─────────────────────────────────────────────────────────────
//
// Frases reais do cotidiano brasileiro, informais, curtas ou emocionais.
// Testam a robustez do sistema contra expressões não padronizadas.
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA I — Informais / Curtas / Emocionais ═══");

audit({ family:"I", query:"cara, não sei",
  intent:"hesitação informal curta",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Hesitation Family F cobre 'não sei' standalone mas não 'cara, não sei'" });

audit({ family:"I", query:"hm",
  intent:"hesitação paralinguística",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family F ✓" });

audit({ family:"I", query:"sei lá",
  intent:"hesitação informal",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Coberto por hesitation Family F ✓" });

audit({ family:"I", query:"difícil decidir",
  intent:"paralisia informal de decisão",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Difícil decidir' sem sujeito — sem cobertura" });

audit({ family:"I", query:"tô na dúvida entre continuar com esse ou mudar",
  intent:"dúvida sobre manter ou trocar a decisão",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "Guard 'em duvida entre' bloqueia — mas aqui não é entre produtos, é entre ações" });

audit({ family:"I", query:"não tô 100%",
  intent:"certeza incompleta informal",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'não tô 100%' = incerteza informal — sem padrão" });

audit({ family:"I", query:"ainda não fechei na minha cabeça",
  intent:"decisão interna não concluída",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Fechei na cabeça' como metáfora decisória — sem cobertura" });

audit({ family:"I", query:"não tô confortável ainda",
  intent:"desconforto emocional com a decisão",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.VOCABULARY_GAP,
  recommendation: "'Confortável' não está nas famílias de hesitation" });

audit({ family:"I", query:"é muita grana pra decisão de cinco minutos",
  intent:"peso decisório vs montante financeiro",
  expectedType: MIA_TURN_TYPES.OBJECTION,
  coverageStatus: COVERAGE.MISSING,
  gapType: GAP_TYPE.MISSING_FAMILY,
  recommendation: "Desconforto com velocidade+valor da decisão — sem família" });

// ─────────────────────────────────────────────────────────────
// ██  FAMÍLIA J — Sem âncora (guardrail) ████████████████████████
// ─────────────────────────────────────────────────────────────

console.log("\n═══ FAMÍLIA J — Guardrail: sem âncora ═══");

audit({ family:"J", query:"não tô sentindo confiança nessa escolha",
  intent:"hesitação sem âncora — deve ir para busca/guia",
  expectedType: MIA_TURN_TYPES.UNKNOWN,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Sem âncora = UNKNOWN esperado — sistema correto ✓",
  hasAnchor: false });

audit({ family:"J", query:"tem algo parecido?",
  intent:"alternativa sem âncora — nova busca",
  expectedType: MIA_TURN_TYPES.UNKNOWN,
  coverageStatus: COVERAGE.FULL,
  gapType: GAP_TYPE.NO_GAP,
  recommendation: "Sem âncora — cai em UNKNOWN corretamente ✓",
  hasAnchor: false });

// ─────────────────────────────────────────────────────────────
// RELATÓRIO FINAL
// ─────────────────────────────────────────────────────────────

const DIVIDER = "═".repeat(72);

console.log(`\n${DIVIDER}`);
console.log(" MIA_SEMANTIC_FAMILY_AUDIT — RELATÓRIO FINAL");
console.log(DIVIDER);

console.log(`
Total frases auditadas : ${total}
  Cobertura FULL       : ${fullCoverage}  (router classifica corretamente)
  Cobertura PARTIAL    : ${partialCoverage}  (tipo errado ou incompleto)
  Cobertura MISSING    : ${missingCoverage}  (UNKNOWN — sem família cognitiva)
`);

console.log("─── Cobertura por família ────────────────────────────────────────────");
Object.entries(familyCoverageMap)
  .sort((a,b) => b[1].missing - a[1].missing)
  .forEach(([fam, stats]) => {
    const pctFull = Math.round((stats.full / stats.total) * 100);
    const bar = "█".repeat(Math.round(pctFull / 10)) + "░".repeat(10 - Math.round(pctFull / 10));
    console.log(`  Família ${fam} | ${bar} ${pctFull}% | full:${stats.full} partial:${stats.partial} missing:${stats.missing} / ${stats.total}`);
  });

console.log("\n─── Gap types encontrados ────────────────────────────────────────────");
Object.entries(gapCounts)
  .filter(([,v]) => v > 0)
  .sort((a,b) => b[1]-a[1])
  .forEach(([gap, count]) => {
    const icon = gap === GAP_TYPE.NO_GAP ? "✓" : "⚠";
    console.log(`  ${icon} ${gap.padEnd(25)} ${count}`);
  });

// ─────────────────────────────────────────────────────────────
// MAPA COGNITIVO COMPLETO
// ─────────────────────────────────────────────────────────────

console.log(`\n${DIVIDER}`);
console.log(" MAPA COGNITIVO — FAMÍLIAS E COBERTURA");
console.log(DIVIDER);

console.log(`
FAMÍLIA A — Decisional Discomfort
  Intenção   : desconforto difuso com a recomendação, sem rejeição explícita
  Cobertura  : PARTIAL
  O que existe: hesitation E cobre "não me convenceu", "não bateu"
  O que falta : "sentindo confiança" → Family D (variant)
                "algo me incomoda" → Family C variant
                "não consigo apontar o que é" → Family C variant
                "não sei se é o certo pra mim" → novo padrão
  Gap primário: VOCABULARY_GAP — a intenção existe (hesitation D/E), vocabulário incompleto
  Recomendação: Expandir Family D e C do detectsHesitationSignal

FAMÍLIA B — Purchase Anxiety
  Intenção   : medo de errar, medo de arrependimento, ansiedade financeira
  Cobertura  : MISSING
  O que existe: OBJECTION cobre "não queria gastar" (mas não "fazer besteira")
  O que falta : "fazer besteira", "me arrepender", "não queria errar",
                "tenho receio", "e se sair algo melhor depois?"
  Gap primário: MISSING_FAMILY — a intenção é cognitivamente distinta do OBJECTION de preço
  Recomendação: Criar subtipo "purchase_anxiety" dentro de detectsHesitationSignal
                (não um turn type novo — resolver como OBJECTION)

FAMÍLIA C — Decision Paralysis
  Intenção   : bloqueio de decisão — perdido, travado, paralisado
  Cobertura  : PARTIAL
  O que existe: hesitation B cobre "não consigo decidir", A cobre "em dúvida"
  O que falta : "perdido", "travado", "não sai do lugar", "não consigo avançar"
  Gap primário: VOCABULARY_GAP — família existe (hesitation B), vocabulário incompleto
  Recomendação: Expandir hesitation Family B com "perdido"/"travado" na decisão

FAMÍLIA D — Soft Alternative Discovery
  Intenção   : alternativa semelhante — não por ranking, por perfil/semelhança
  Cobertura  : PARTIAL (gap de vocabulário)
  O que existe: REFINEMENT cobre "tem algo mais/melhor/diferente"
  O que falta : "parecido", "mesma linha", "semelhante", "equivalente", "mesmo perfil"
  Gap primário: VOCABULARY_GAP — refinement existe, vocabulário de similaridade ausente
  Alerta      : "outra opção" TAMBÉM está em OBJECTION signal — possível ROUTER_PRIORITY_GAP
  Recomendação: Expandir detectsRefinementSignal com vocabulário de similaridade

FAMÍLIA E — Relative Ranking Discovery
  Intenção   : runner-up por posição relativa, sem ordinal explícito
  Cobertura  : PARTIAL
  O que existe: ALTERNATIVE_REQUEST cobre ordinals 3-10, "quem quase ganhou",
                "o próximo", "plano B", "depois dele/dela"
  O que falta : "logo atrás", "chegou perto", "colado em segundo",
                "os três que fizeram sentido" (qualitativo, não 'top 3' literal)
  Gap primário: VOCABULARY_GAP — família existe, vocabulário relacional incompleto
  Recomendação: Expandir detectsAlternativeRequestSignal Family C com "logo atrás",
                "mais perto", "chegou perto"

FAMÍLIA F — Comparative Safety Seeking
  Intenção   : escolha por eixo emocional — segurança, tranquilidade, confiabilidade
  Cobertura  : MISSING
  O que existe: PRIORITY_SHIFT cobre eixos técnicos (câmera, bateria, etc.)
                COMPARISON cobre "X ou Y" explícito
  O que falta : "dor de cabeça", "mais seguro" (sem contexto técnico),
                "menos problema", "mais confiável", "melhor reputação"
  Gap primário: MISSING_FAMILY — eixo emocional de safety não mapeado como eixo
  Recomendação: Adicionar eixo de safety/confiabilidade em PRIORITY_SHIFT _axisExpanded
                OU criar cluster específico em detectsExplanationRequestSignal

FAMÍLIA G — Human Explanation Request
  Intenção   : explicação simples, escolha hipotética, posição definitiva
  Cobertura  : PARTIAL
  O que existe: EXPLANATION_REQUEST cobre "me explica sem técnico", "como leigo",
                "por que esse faz sentido"
  O que falta : "simplifica", "fala de forma simples", "pode resumir",
                "se você tivesse que escolher", "qual você compraria"
  Gap primário: VOCABULARY_GAP — família existe, vocabulário de simplificação e
                framings hipotéticos ausentes
  Recomendação: Expandir detectsExplanationRequestSignal com "simplifica", "resumir",
                e padrão hipotético "se você tivesse/escolheria"

FAMÍLIA I — Informal / Emocional
  Intenção   : expressões cotidianas informais brasileiras
  Cobertura  : PARTIAL
  O que existe: "hm", "sei lá" (Family F)
  O que falta : "cara não sei", "difícil decidir", "não tô 100%",
                "não tô confortável", "não fechei na minha cabeça"
  Gap primário: VOCABULARY_GAP — informalidade e metáforas decisórias não cobertas
  Recomendação: Expandir hesitation com expressões de certeza incompleta
`);

console.log("─── TOP 10 GAPS COGNITIVOS (por impacto estimado) ───────────────────");
console.log(`
 1. [B] Purchase Anxiety — MISSING_FAMILY
    "fazer besteira", "me arrepender", "não queria errar", "tenho receio"
    Impacto: alto — expressões comuns em decisões de alto valor
    Ação   : Subtipo "purchase_anxiety" em detectsHesitationSignal → OBJECTION

 2. [A] Decisional Discomfort — VOCABULARY_GAP em hesitation D
    "sentindo confiança" ≠ "confiante", "algo me incomoda" sem "não sei o que"
    Impacto: alto — é a frase mais comum nos testes humanos (7.6D A1-A4)
    Ação   : Expandir hesitation Family D e C com variantes

 3. [C] Decision Paralysis — VOCABULARY_GAP em hesitation B
    "perdido", "travado" no contexto de decisão
    Impacto: alto — frases curtas e comuns
    Ação   : Expandir hesitation Family B com "perdido"/"travado nessa"

 4. [F] Comparative Safety Seeking — MISSING_FAMILY
    "mais seguro", "dor de cabeça", "menos problema"
    Impacto: médio-alto — critério emocional frequente em compras reais
    Ação   : Adicionar eixo emotional-safety em PRIORITY_SHIFT ou EXPLANATION

 5. [E] Relative Ranking Discovery — VOCABULARY_GAP em runner-up
    "logo atrás", "chegou perto", "mais perto do ideal"
    Impacto: médio — complemento ao ALTERNATIVE_REQUEST existente
    Ação   : Expandir detectsAlternativeRequestSignal Family C

 6. [G] Hypothetical Choice Framing — VOCABULARY_GAP
    "se você tivesse que escolher", "qual você compraria"
    Impacto: médio — força posição definitiva do sistema
    Ação   : Expandir detectsExplanationRequestSignal com framings hipotéticos

 7. [D] Soft Alternative Discovery — VOCABULARY_GAP em refinement
    "parecido", "mesma linha", "semelhante", "equivalente"
    Impacto: médio — busca de alternativa por perfil é muito comum
    Ação   : Expandir detectsRefinementSignal com vocabulário de similaridade

 8. [G] Simplification Request — VOCABULARY_GAP
    "simplifica", "fala simples", "pode resumir"
    Impacto: médio — usuários informais pedem resumo/simplicidade
    Ação   : Expandir detectsExplanationRequestSignal

 9. [I] Informal Certainty — VOCABULARY_GAP
    "não tô 100%", "não tô confortável", "não fechei na minha cabeça"
    Impacto: médio — expressões comuns de certeza incompleta
    Ação   : Adicionar na hesitation Family D/F

10. [D] Soft Alternative — ROUTER_PRIORITY_GAP
    "outra opção" está em OBJECTION E em buscas → pode classificar errado
    Impacto: médio — possível ambiguidade entre REFINEMENT e OBJECTION
    Ação   : Revisar prioridade em resolveTurnTypeFromSignals
`);

console.log("─── CLASSIFICAÇÃO POR TIPO DE AÇÃO ──────────────────────────────────");
console.log(`
APENAS VOCABULÁRIO (não exige novo turn type nem comportamento):
  A — Decisional Discomfort  → expandir hesitation D e C
  C — Decision Paralysis     → expandir hesitation B
  E — Relative Ranking       → expandir alternativeRequest Family C
  D — Soft Alternative       → expandir refinement patterns
  G — Simplification         → expandir explanationRequest
  I — Informal Certainty     → expandir hesitation D/F

EXIGE ANÁLISE MAIS PROFUNDA (pode exigir novo cluster semântico):
  B — Purchase Anxiety       → subtipo "purchase_anxiety" em hesitation
  F — Comparative Safety     → novo eixo em PRIORITY_SHIFT ou EXPLANATION_REQUEST

NÃO EXIGE NOVO TURN TYPE:
  Todos os gaps acima podem ser resolvidos como subtipos ou expansões
  de famílias existentes (OBJECTION via hesitation, REFINEMENT, ALTERNATIVE_REQUEST,
  EXPLANATION_REQUEST, PRIORITY_SHIFT).
  O sistema de routing e contratos existentes cobre os comportamentos necessários.
`);

console.log("─── QUAL PATCH GERA MAIOR GANHO REAL ────────────────────────────────");
console.log(`
PATCH 7.6F (recomendado imediato):
  Expandir detectsHesitationSignal:
    Family D: adicionar "sentindo confiança", "algo me incomoda", "não confortável"
    Family B: adicionar "perdido nessa", "travado nessa"
    Family nova: "purchase_anxiety" — "fazer besteira", "me arrepender", "não queria errar"
  Impacto: resolve GAP 1, 2, 3 acima — Grupos A e C do audit 7.6D
  Risco  : baixo — função já existe, apenas expansão de famílias

PATCH 7.6G (segunda prioridade):
  Expandir detectsAlternativeRequestSignal Family C e detectsRefinementSignal:
    "logo atrás", "chegou perto"
    "parecido", "mesma linha", "semelhante"
  Impacto: resolve GAP 5 e 7 — Grupos B e D do audit 7.6D
  Risco  : baixo — funções existentes

PATCH 7.6H (terceira prioridade):
  Expandir detectsExplanationRequestSignal:
    "simplifica", "fala simples", "se você tivesse que escolher"
  Impacto: resolve GAP 6 e 8
  Risco  : baixo

PATCH 8 (não começar antes de 7.6F-H):
  Quando: OBJECTION contextual não cair mais em fallback (7.6E ✓)
          ALTERNATIVE_REQUEST não perder ranking injection (7.6A+7.5 ✓)
          EXPLANATION_REQUEST ativar rich path corretamente (7.6E ✓)
          Vocabulary coverage ≥ 80% nos grupos críticos (7.6F-G)
`);

console.log("─── CONFIRMAÇÃO ZERO MUDANÇAS ────────────────────────────────────────");
console.log(`
  ✓ Nenhuma função de produção alterada
  ✓ lib/ intacto
  ✓ pages/api/ intacto
  ✓ Apenas criado: scripts/test-mia-semantic-family-audit.js
`);

console.log(`${DIVIDER}\n`);
console.log(`Total frases: ${total} | FULL: ${fullCoverage} | PARTIAL: ${partialCoverage} | MISSING: ${missingCoverage}`);
console.log(`${DIVIDER}\n`);

// Exit 0 — auditoria sempre termina clean (não é suite de correção)
process.exit(0);
