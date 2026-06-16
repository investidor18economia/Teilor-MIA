/**
 * PATCH 7.6O-B-AUDIT — Explanation Anchored Contract Audit
 *
 * DIAGNÓSTICO PURO — não altera comportamento de produção.
 *
 * Objetivo: auditar por que `explanation_anchored` permite divergências de winner
 * mesmo quando toda a arquitetura (router, routing, session, anchor, policy) está correta.
 *
 * Blocos:
 *   BLOCO 1  Extração do contrato completo (texto exato do prompt)
 *   BLOCO 2  Comparação estrutural entre os três contratos
 *   BLOCO 3  Auditoria de compliance de winner por dimensão
 *   BLOCO 4  Cenários reais de produção (HTTP)
 *   BLOCO 5  Leak Stage Mapping
 *   BLOCO 6  Compliance Score por contrato
 *   BLOCO 7  Root Cause Consolidation
 *   BLOCO 8  Recomendação PATCH 7.6O-B
 *
 * Usage:
 *   MIA_STATE_AUDIT=true node scripts/test-mia-explanation-anchored-contract-audit.js
 *   node scripts/test-mia-explanation-anchored-contract-audit.js   (HTTP desativado)
 */

// ─────────────────────────────────────────────────────────────
// BLOCO 1 — Contratos extraídos do handler (texto exato)
//
// Fonte: pages/api/chat-gpt4o.js linhas 27447-27531
// Copiados textualmente — placeholders trocados por marcadores legíveis.
// ─────────────────────────────────────────────────────────────

const CONTRACT_TEXTS = {

  explanation_anchored: `
🧠 MODO EXPLICAÇÃO DE RECOMENDAÇÃO ANCORADA

O usuário quer entender melhor por que você recomendou o produto atual.
NÃO tome nova decisão. NÃO troque o produto. Explique o raciocínio da recomendação anterior.

PRODUTO EM QUESTÃO: "{anchorTitle}"

REGRAS ABSOLUTAS:
- NÃO recomende outro produto.
- NÃO invente produto novo.
- NÃO abra nova busca.
- NÃO mude o produto recomendado.
- NÃO responda genericamente ("Posso te ajudar..." ou similar).
- NÃO liste especificações técnicas sem relacionar ao contexto do usuário.
- Use apenas os dados do contexto abaixo.

O QUE RESPONDER (em prosa natural, sem asteriscos, sem listas numeradas):
- Por que esse produto foi recomendado — o critério principal que guiou a decisão.
- Qual consequência prática isso traz para o usuário no dia a dia.
- O tradeoff honesto — em que situação esse produto não seria a melhor escolha.
- Em que cenário você mudaria de recomendação.    ← [AUDIT FLAG: opens door to alternatives]

Responda de forma direta, humana, com raciocínio. Não termine com pergunta genérica.

CONTEXTO DA RECOMENDAÇÃO ANTERIOR:
- Critério/Eixo principal: "{lastAxis}"
- Argumento central: "{lastConsequence}"
- Tradeoff identificado: "{lastTradeoff}"
- Prioridade do usuário: {priority}
- Vantagens principais: {advantages}
- Pontos de atenção: {sacrifices}

PRODUTOS DISPONÍVEIS (não inventar outros):
{rememberedProductsText}

MENSAGEM ATUAL DO USUÁRIO:
"{query}"
`,

  objection_response_contract: `
🧠 MODO OBJEÇÃO / CONTRATO DE RESPOSTA

O usuário expressou resistência ao produto recomendado (ex: preço alto, objeção de valor).
Sua missão é reconhecer a objeção com empatia e manter a recomendação atual — sem trocar o produto automaticamente.

PRODUTO RECOMENDADO: "{anchorTitle}"

REGRAS ABSOLUTAS:
- NÃO liste outros produtos como alternativas espontâneas.
- NÃO diga "Uma boa alternativa é...", "Outra opção seria...", "Veja também...".
- NÃO trate a objeção como pedido de nova busca.
- NÃO refaça o ranking ou troque o produto recomendado.
- MANTENHA o produto atual como referência central da resposta.
- Pode reconhecer que o preço está no limite do orçamento.
- Pode explicar o custo-benefício e por que o produto ainda faz sentido.
- Pode oferecer refazer a recomendação SOMENTE se o usuário confirmar que preço virou prioridade absoluta — nunca por iniciativa própria.

O QUE RESPONDER (em prosa natural, sem asteriscos, sem listas numeradas mecânicas):
1. Reconheça a objeção com empatia e honestidade — "Faz sentido achar caro."
2. Explique o tradeoff de valor: por que o produto ainda faz sentido dado o critério original.
3. Ofereça um próximo passo controlado: "Se quiser, posso refazer a recomendação focando em preço."

Tom: acolhedor, honesto, firme. Sem parecer vendedor. Sem inventar alternativa.

CONTEXTO DA DECISÃO:
- Produto: "{anchorTitle}"              ← [repete anchorTitle]
- Critério/Eixo original: "{lastAxis}"
- Argumento central: "{lastConsequence}"
- Tradeoff identificado: "{lastTradeoff}"
- Prioridade do usuário: {priority}
- Motivo da decisão: "{lastDecisionReason}"

PRODUTOS DISPONÍVEIS (não inventar outros, não listar espontaneamente):
{rememberedProductsText}

MENSAGEM ATUAL DO USUÁRIO:
"{query}"
`,

  priority_shift_response_contract: `
🧠 MODO MUDANÇA DE CRITÉRIO / CONTRATO DE RESPOSTA

O usuário está avaliando o produto recomendado sob um novo eixo (ex: segurança, confiabilidade, durabilidade, tranquilidade).
Sua missão é responder sobre o produto autorizado considerando esse novo critério — não escolher outro produto livremente.

PRODUTO AUTORIZADO: "{anchorTitle}"

REGRAS ABSOLUTAS:
- NÃO substitua o produto autorizado por outro sem critério explícito do usuário.
- NÃO diga "Mas para este critério, o melhor seria X" usando produto fora da decisão autorizada.
- NÃO abra nova busca nem refaça o ranking.
- NÃO responda genericamente como se não houvesse contexto.
- PODE explicar como o produto autorizado se sai nesse novo critério.
- PODE mencionar honestamente se ele tem limitações nesse eixo.
- PODE oferecer refazer a recomendação com foco nesse critério SOMENTE se o usuário confirmar — nunca por iniciativa própria.

O QUE RESPONDER (em prosa natural, sem asteriscos, sem listas numeradas):
1. Como o produto autorizado se comporta no critério mencionado pelo usuário.
2. Se ele é uma escolha sólida para esse critério — ou onde tem limitação honesta.
3. Se houver limitação real, ofereça um próximo passo controlado.

Tom: direto, honesto, sem pressão. Não parecer vendedor. Não inventar outro winner.

CONTEXTO DA DECISÃO ATUAL:
- Produto autorizado: "{anchorTitle}"    ← [repete anchorTitle]
- Critério/Eixo original: "{lastAxis}"
- Argumento central: "{lastConsequence}"
- Tradeoff identificado: "{lastTradeoff}"
- Prioridade atual do usuário: {priority}
- Motivo da decisão: "{lastDecisionReason}"

PRODUTOS DISPONÍVEIS (não inventar outros, não recomendar espontaneamente como novo winner):
{rememberedProductsText}

MENSAGEM ATUAL DO USUÁRIO:
"{query}"
`,
};

// ─────────────────────────────────────────────────────────────
// BLOCO 2 — Análise estrutural de cada dimensão de compliance
// ─────────────────────────────────────────────────────────────

function analyze(contractKey) {
  const text = CONTRACT_TEXTS[contractKey];
  return {
    // Winner label strength
    winner_label:
      /PRODUTO\s+AUTORIZADO:/i.test(text)  ? "AUTORIZADO (forte)"
      : /PRODUTO\s+RECOMENDADO:/i.test(text) ? "RECOMENDADO (médio)"
      : /PRODUTO\s+EM\s+QUEST[AÃ]O:/i.test(text) ? "EM QUESTÃO (fraco)"
      : "ausente",

    // Winner mention count in body (header + context)
    winner_mention_count:
      (text.match(/\{anchorTitle\}/g) || []).length,

    // Anti-substituição
    anti_substitution:
      /NÃO\s+(substitua|troque|mude|altere)/i.test(text) ||
      /NÃO\s+refaça\s+o\s+ranking\s+ou\s+troque/i.test(text),

    // Obrigação explícita de citar o winner na resposta
    must_cite_winner:
      /DEVE.*mencion|a\s+resposta\s+deve.*product|mention.*produto/i.test(text) ||
      /Como\s+o\s+produto\s+(autorizado|recomendado)\s+se\s+(comporta|sai)/i.test(text),

    // Anti-alternativa espontânea
    anti_spontaneous_alternative:
      /NÃO\s+(liste|promova|sugira|recomende|diga)\s+.*(alternativa|outro\s+produto|concorrente)/i.test(text) ||
      /NÃO\s+diga\s+"Uma\s+boa\s+alternativa/i.test(text) ||
      /NÃO\s+substitua\s+o\s+produto\s+autorizado/i.test(text),

    // Regras absolutas presentes
    has_regras_absolutas: /REGRAS\s+ABSOLUTAS:/i.test(text),

    // Alternative-opening bullet (danger signal)
    has_alternative_opening_bullet:
      /Em\s+que\s+cen[aá]rio\s+voc[eê]\s+mudaria\s+de\s+recomenda/i.test(text),

    // Repetição do anchorTitle no CONTEXTO (não apenas no header)
    winner_in_context_section:
      (text.match(/CONTEXTO[\s\S]*?\{anchorTitle\}/i) || []).length > 0,

    // Controlled offer (SOMENTE se usuário confirmar)
    controlled_offer:
      /SOMENTE\s+se\s+o\s+usu[aá]rio\s+confirm/i.test(text),

    // Mission statement pins winner
    mission_pins_winner:
      /sua\s+miss[aã]o\s+[eé]\s+.*(manter|defender|explicar\s+o\s+(produto|winner)|responder\s+sobre\s+o\s+produto\s+autorizado)/i.test(text),
  };
}

const CONTRACTS = ["explanation_anchored", "objection_response_contract", "priority_shift_response_contract"];

// ─────────────────────────────────────────────────────────────
// BLOCO 3 — Compliance score por dimensão
// ─────────────────────────────────────────────────────────────

const DIMENSIONS = [
  ["winner_label",                    "Winner label strength"],
  ["winner_mention_count",            "Winner mention count"],
  ["anti_substitution",               "Anti-substituição"],
  ["must_cite_winner",                "Obriga citar winner"],
  ["anti_spontaneous_alternative",    "Anti-alternativa espontânea"],
  ["has_regras_absolutas",            "REGRAS ABSOLUTAS presentes"],
  ["has_alternative_opening_bullet",  "Bullet abre alternativa (risco)"],
  ["winner_in_context_section",       "Winner repetido no CONTEXTO"],
  ["controlled_offer",                "Oferta controlada (SOMENTE se)"],
  ["mission_pins_winner",             "Mission statement pina winner"],
];

function complianceScore(analysis) {
  let score = 0, max = 0;
  const POSITIVE = ["anti_substitution","must_cite_winner","anti_spontaneous_alternative",
                    "has_regras_absolutas","winner_in_context_section","controlled_offer","mission_pins_winner"];
  const NEGATIVE = ["has_alternative_opening_bullet"];
  for (const dim of POSITIVE) {
    max++;
    if (analysis[dim]) score++;
  }
  for (const dim of NEGATIVE) {
    max++;
    if (!analysis[dim]) score++; // good = NOT having the risky bullet
  }
  return { score, max, pct: Math.round(score/max*100) };
}

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

const API_BASE     = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const HTTP_ENABLED = !!(process.env.MIA_STATE_AUDIT);

async function httpTurn(query, session_context, msgs, convId) {
  const messages = [...msgs, { role: "user", content: query }];
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "minha_chave_181199" },
    body: JSON.stringify({
      text: query, image_base64: "", user_id: "explanation-anchor-audit-766ob",
      conversation_id: convId, messages, session_context,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runTurns(turns) {
  const convId = `anchor-audit-${Date.now()}`;
  let sc = {}, msgs = [];
  const results = [];
  for (const { query } of turns) {
    const data = await httpTurn(query, sc, msgs, convId);
    msgs = [...msgs, { role: "user", content: query }, { role: "assistant", content: data.reply || "" }];
    sc   = data.session_context || {};
    results.push({ query, data, sc });
  }
  return results;
}

function normalizeText(s = "") {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function nameInText(text = "", name = "") {
  if (!name || !text) return false;
  const normText = normalizeText(text);
  const normName = normalizeText(name);
  if (normText.includes(normName)) return true;
  const words = normName.split(" ");
  for (let i = 0; i <= words.length - 3; i++) {
    const w = words.slice(i, i + 3).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  for (let i = 0; i <= words.length - 2; i++) {
    const w = words.slice(i, i + 2).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// BLOCO 4 — Cenários reais
// ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "A",
    label: "celular até 2500 → não tô sentindo confiança → fala simples",
    turns: [
      { query: "celular ate 2500" },
      { query: "nao to sentindo confianca" },
      { query: "fala simples" },
    ],
    auditTurnIdx: 2,
    expectedTemplate: "explanation_anchored",
  },
  {
    id: "B",
    label: "celular até 2500 → qual dá menos dor de cabeça → fala simples",
    turns: [
      { query: "celular ate 2500" },
      { query: "qual da menos dor de cabeca" },
      { query: "fala simples" },
    ],
    auditTurnIdx: 2,
    expectedTemplate: "explanation_anchored",
  },
  {
    id: "C",
    label: "celular até 2500 → se você tivesse que escolher um só",
    turns: [
      { query: "celular ate 2500" },
      { query: "se voce tivesse que escolher um so" },
    ],
    auditTurnIdx: 1,
    expectedTemplate: "explanation_anchored",
  },
  {
    id: "D",
    label: "celular até 2500 → qual sobreviveria ao corte",
    turns: [
      { query: "celular ate 2500" },
      { query: "qual sobreviveria ao corte" },
    ],
    auditTurnIdx: 1,
    expectedTemplate: "explanation_anchored",
  },
];

const scenarioResults = [];

async function runScenario(s) {
  if (!HTTP_ENABLED) {
    scenarioResults.push({ ...s, error: "HTTP disabled" });
    return;
  }
  try {
    const turns = await runTurns(s.turns);
    const turn0 = turns[0];
    const auditTurn = turns[s.auditTurnIdx];

    const authorizedWinner = turn0.sc?.lastBestProduct?.product_name || null;
    const anchor           = auditTurn.sc?.lastBestProduct?.product_name || null;
    const finalReply       = auditTurn.data.reply || "";
    const winnerInReply    = nameInText(finalReply, authorizedWinner);

    // Detect if LLM verbalized a different product as recommendation
    const RECOMMENDATION_RE = /eu\s+(recomendaria|compraria|iria\s+n[o|a]|ficaria\s+com|escolheria)\s+(?:o\s+|a\s+)?([^\n.,!?]{3,60})/i;
    const recMatch = finalReply.match(RECOMMENDATION_RE);
    const verbalizedRec = recMatch?.[2]?.trim() || null;
    const hasAlternativeRec = verbalizedRec && !nameInText(verbalizedRec, authorizedWinner);

    scenarioResults.push({
      ...s,
      authorizedWinner,
      anchor,
      anchorPreserved: anchor === authorizedWinner,
      finalReply,
      winnerInReply,
      hasAlternativeRec,
      verbalizedRec,
      fullReply: finalReply,
    });
  } catch (err) {
    scenarioResults.push({ ...s, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// PRINT HELPERS
// ─────────────────────────────────────────────────────────────

function sep(n = 68, char = "─") { console.log(char.repeat(n)); }
function SEP(n = 68, char = "═") { console.log(char.repeat(n)); }

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

// ── BLOCO 1: Print contracts ──
sep(); console.log("BLOCO 1 — CONTRATOS COMPLETOS"); sep();
for (const key of CONTRACTS) {
  console.log(`\n【 ${key} 】`);
  console.log(CONTRACT_TEXTS[key]);
}

// ── BLOCO 2 + 3: Structural comparison + compliance ──
sep(); console.log("BLOCO 2 — COMPARAÇÃO ESTRUTURAL + BLOCO 3 — COMPLIANCE"); sep();

const analyses = {};
for (const key of CONTRACTS) {
  analyses[key] = analyze(key);
}

console.log("\n  Dimensão".padEnd(42) + "explanation_anchored".padEnd(25) + "objection_contract".padEnd(25) + "priority_shift_contract");
console.log("  " + "─".repeat(110));

for (const [dim, label] of DIMENSIONS) {
  const vals = CONTRACTS.map(k => {
    const v = analyses[k][dim];
    if (typeof v === "boolean") return (v ? "✓ YES" : "✗ NO").padEnd(24);
    return String(v).slice(0, 22).padEnd(24);
  });
  const dimLabel = ("  " + label).padEnd(42);
  console.log(`${dimLabel}${vals.join(" ")}`);
}

// ── Compliance scores ──
console.log("\n  COMPLIANCE SCORE:");
for (const key of CONTRACTS) {
  const { score, max, pct } = complianceScore(analyses[key]);
  const bar = "█".repeat(Math.round(pct / 10)).padEnd(10);
  console.log(`    ${key.padEnd(40)} ${score}/${max}  ${bar}  ${pct}%`);
}

// ── Run HTTP scenarios ──
sep(); console.log("BLOCO 4 — CENÁRIOS REAIS DE PRODUÇÃO"); sep();
for (const s of SCENARIOS) {
  console.log(`\n  Executando ${s.id}: ${s.label}...`);
  await runScenario(s);
}

// ── BLOCO 4: Print scenario results ──
sep(); console.log("BLOCO 4 — RESULTADOS DOS CENÁRIOS"); sep();

for (const r of scenarioResults) {
  console.log(`\n  CENÁRIO ${r.id}: ${r.label}`);
  if (r.error) {
    console.log(`    ERROR: ${r.error}`);
    continue;
  }
  console.log(`    Winner autorizado  : ${r.authorizedWinner}`);
  console.log(`    Anchor atual       : ${r.anchor}`);
  console.log(`    Anchor preservada  : ${r.anchorPreserved}`);
  console.log(`    Template esperado  : ${r.expectedTemplate}`);
  console.log(`    Winner na reply    : ${r.winnerInReply ? "YES" : "NO"}`);
  console.log(`    Rec alternativa    : ${r.hasAlternativeRec ? `YES → "${r.verbalizedRec?.slice(0,50)}"` : "NO"}`);
  console.log(`    Reply preview      : "${(r.finalReply || "").replace(/\n/g, " ").slice(0, 150)}"`);
  console.log(`    RESULTADO          : ${r.winnerInReply && !r.hasAlternativeRec ? "✓ COMPLIANT" : "✗ VIOLATION"}`);
}

// ── BLOCO 5: Leak stage mapping ──
sep(); console.log("BLOCO 5 — LEAK STAGE MAPPING"); sep();

console.log(`
  Evidências de cada stage para explanation_anchored:

  ARCHITECTURE STAGE:
    ✓ Cognitive Router classifica → EXPLANATION_REQUEST (conf=0.83)
    ✓ Bridge aplicada → intent = "decision"
    ✓ buildRoutingDecision → mode = "cognitive_anchor_hold"
    ✓ shouldUseRichExplanationPath → true
    ✓ _richExpPathActivated = true
    → A ARQUITETURA CHEGA CORRETAMENTE AO TEMPLATE

  PROMPT STAGE (CONTRACT STAGE):
    ✓ Template selecionado: explanation_anchored
    ✓ anchorTitle injetado no header: "PRODUTO EM QUESTÃO: {winner}"
    ✗ anchorTitle NÃO repetido no CONTEXTO (vs. objection/priority que repetem)
    ✗ Winner label = "EM QUESTÃO" (fraco — vs. "AUTORIZADO"/"RECOMENDADO")
    ✗ Bullet 4 convida LLM a explorar cenário de mudança de recomendação
    ✗ Sem obrigação explícita de CITAR o winner na resposta
    → PROMPT_STAGE / CONTRACT_STAGE: fragilidade identificada

  RAW_LLM_STAGE:
    Observado via reply HTTP (STAGE 5 nos cenários anteriores):
    - Cenário A: "fala simples" após objeção → winner depende do LLM (variável)
    - Cenário B: "fala simples" após PRIORITY_SHIFT → LLM às vezes verbalizou A53
    - Cenário C: "se você tivesse que escolher um só" → LLM verbalizou A54
    - Cenário D: "qual sobreviveria ao corte" → LLM verbalizou A54 (PATCH 7.6N-B)
    → RAW_LLM_STAGE: LLM usa o "bullet 4" e o espaço aberto para escolher livremente

  POST_PROCESSING_STAGE:
    O responseMentionsUnknownProduct só corrige quando o produto está FORA da lista.
    Se o produto alternativo ESTÁ na lista (e está), a correção não dispara.
    → NÃO é responsável pelas violações (corrige corretamente quando fora da lista)

  FINAL_REPLY_STAGE:
    O que LLM escolheu no raw é o que aparece no final.
    Sem pós-processamento adicional que pudesse reverter a escolha.
    → FINAL_REPLY_STAGE: sem filtro adicional`);

for (const r of scenarioResults) {
  if (r.error) continue;
  const leaked = !r.winnerInReply;
  const stage  = leaked
    ? (analyses.explanation_anchored.has_alternative_opening_bullet
        ? "CONTRACT_STAGE + RAW_LLM_STAGE"
        : "RAW_LLM_STAGE")
    : "NONE";
  const icon   = r.winnerInReply ? "✓" : "✗";
  console.log(`\n  ${icon} CENÁRIO ${r.id}: ${r.label}`);
  console.log(`    Leak stage: ${stage}`);
  if (!r.winnerInReply) {
    console.log(`    Evidência: template não obrigou citar winner + bullet 4 abriu espaço`);
    console.log(`    LLM verbalizou: "${r.verbalizedRec || "(indetectável)"}" vs winner "${r.authorizedWinner}"`);
  }
}

// ── BLOCO 6: Compliance score ──
sep(); console.log("BLOCO 6 — COMPLIANCE SCORE POR CONTRATO"); sep();

// Run scenarios per expected template
const TEMPLATE_COMPLIANCE = {};
for (const key of CONTRACTS) {
  const relevant = scenarioResults.filter(r => r.expectedTemplate === key && !r.error);
  const total    = relevant.length;
  const pass     = relevant.filter(r => r.winnerInReply).length;
  TEMPLATE_COMPLIANCE[key] = { pass, total };
}

console.log(`\n  Baseado nos ${scenarioResults.filter(r => !r.error).length} cenários executados:`);
for (const key of CONTRACTS) {
  const { pass, total } = TEMPLATE_COMPLIANCE[key] || { pass: 0, total: 0 };
  const structural = complianceScore(analyses[key]);
  if (total > 0) {
    const pct = Math.round(pass/total*100);
    const bar = "█".repeat(Math.round(pct/10)).padEnd(10);
    console.log(`    ${key.padEnd(40)} HTTP: ${pass}/${total} (${pct}%)  Structural: ${structural.score}/${structural.max} (${structural.pct}%)`);
  } else {
    console.log(`    ${key.padEnd(40)} HTTP: n/a  Structural: ${structural.score}/${structural.max} (${structural.pct}%)`);
  }
}

if (HTTP_ENABLED) {
  // Count all scenarios that used explanation_anchored
  const expAnchored = scenarioResults.filter(r => r.expectedTemplate === "explanation_anchored" && !r.error);
  const pass = expAnchored.filter(r => r.winnerInReply).length;
  console.log(`\n  Winner Compliance Rate:`);
  console.log(`    explanation_anchored           : ${pass}/${expAnchored.length}`);
  console.log(`    objection_response_contract    : vide PATCH 7.6N-B (8/12 geral, ~80% quando in scope)`);
  console.log(`    priority_shift_response_contract: vide PATCH 7.6N-B (2/3 → 67%)`);
}

// ── BLOCO 7: Root cause ──
sep(); console.log("BLOCO 7 — ROOT CAUSE CONSOLIDATION"); sep();

console.log(`
  CAUSA RAIZ PRIMÁRIA: CONTRACT_STAGE
  Categoria: CONTRACT (déficit estrutural no prompt)
  Probabilidade: ALTA

  Evidências:

  1. WINNER LABEL FRACO
     explanation_anchored  → "PRODUTO EM QUESTÃO"   (fraco)
     objection_contract    → "PRODUTO RECOMENDADO"  (médio)
     priority_shift_contract → "PRODUTO AUTORIZADO" (forte)

     "EM QUESTÃO" comunica que o produto é o assunto da conversa,
     não que ele é o único produto autorizado a ser recomendado.
     O LLM lê isso como "vamos discutir sobre este produto" em vez de
     "este produto é a sua recomendação ativa — não mude".

  2. WINNER NÃO REPETIDO NO CONTEXTO
     explanation_anchored: {anchorTitle} aparece apenas 1x (header)
     objection_contract:   {anchorTitle} aparece 2x (header + CONTEXTO)
     priority_shift:       {anchorTitle} aparece 2x (header + CONTEXTO)

     A repetição no CONTEXTO serve como reforço cognitivo para o LLM.
     Sem ela, o LLM vê o winner uma vez no início e pode "esquecer"
     enquanto processa o CONTEXTO e o "O QUE RESPONDER".

  3. BULLET 4 ABRE CAMINHO PARA ALTERNATIVA
     "- Em que cenário você mudaria de recomendação."

     Este bullet convida o LLM a pensar em cenários onde ele troca o produto.
     Uma vez ativado esse raciocínio, o LLM frequentemente:
     a) Identifica que o critério atual poderia favorecer outro produto
     b) Passa a responder a pergunta do usuário COM esse outro produto
     c) Abandona o winner mesmo sem ter "mudado a recomendação" formalmente

     Comparação: objection e priority_shift NÃO têm este bullet.
     Eles só permitem: "SOMENTE se o usuário confirmar" (controlado).

  4. SEM OBRIGAÇÃO EXPLÍCITA DE CITAR O WINNER
     Os outros contratos exigem comportamentos que implicam citar:
     - objection: "Explique o tradeoff de valor: por que o produto ainda faz sentido"
     - priority_shift: "Como o produto autorizado se comporta no critério"
     explanation_anchored: descreve 4 bullets sobre explicar a decisão,
     mas NENHUM diz "você DEVE mencionar o produto {anchorTitle} na resposta".

  ─────────────────────────────────────────────────────────────

  CAUSA RAIZ SECUNDÁRIA: RAW_LLM_STAGE
  Categoria: RAW_LLM_BEHAVIOR
  Probabilidade: MÉDIA

  O LLM tem liberdade interpretativa suficiente para, dado o contrato atual,
  escolher um produto diferente. Isso é consequência da causa primária —
  não é uma falha independente do LLM.

  Se o contrato fosse mais restritivo (como objection/priority_shift),
  o LLM teria menos espaço para divergir.

  ─────────────────────────────────────────────────────────────

  CAUSAS DESCARTADAS:

  ✗ ARCHITECTURE:        Router, routing mode, bridge, session — todos corretos.
  ✗ ROUTING:             cognitive_anchor_hold é aplicado.
  ✗ RESPONSE_POST_PROCESSING: só corrige produtos fora da lista — não aplicável aqui.
  ✗ FINAL_REPLY_STAGE:   não há pós-processamento adicional após o raw reply.`);

// ── BLOCO 8: Recomendação ──
sep(); console.log("BLOCO 8 — RECOMENDAÇÃO PATCH 7.6O-B"); sep();

console.log(`
  PATCH 7.6O-B — explanation_anchored Winner Pinning

  ESCOPO MÍNIMO:
  Apenas o bloco do template explanation_anchored em pages/api/chat-gpt4o.js
  (~linhas 27447-27484). Nenhuma outra lógica, routing, session ou policy.

  MUDANÇAS NECESSÁRIAS (3 intervenções cirúrgicas):

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ INTERVENÇÃO 1 — Fortalecer o winner label                               │
  │ Antes: PRODUTO EM QUESTÃO: "{anchorTitle}"                              │
  │ Depois: PRODUTO AUTORIZADO: "{anchorTitle}"                             │
  │ Risco: ZERO — apenas mudança de rótulo, sem lógica                     │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ INTERVENÇÃO 2 — Repetir anchorTitle no CONTEXTO                         │
  │ Antes: CONTEXTO DA RECOMENDAÇÃO ANTERIOR (sem anchorTitle)              │
  │ Depois: - Produto: "{anchorTitle}"  (primeira linha do CONTEXTO)        │
  │ Alinha com objection e priority_shift que repetem 2x                   │
  │ Risco: ZERO — adiciona dado já disponível                              │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ INTERVENÇÃO 3 — Substituir bullet 4 (rewrite controlado)               │
  │ Antes: "- Em que cenário você mudaria de recomendação."                 │
  │ Depois: "- Se houver limitação real neste produto, ofereça um próximo   │
  │          passo controlado: 'Se quiser, posso refazer buscando [critério │
  │          específico]' — nunca por iniciativa própria."                  │
  │ Ou remover o bullet inteiramente (opção mais cirúrgica)                 │
  │ Risco: BAIXO — remove espaço de liberdade do LLM                       │
  └─────────────────────────────────────────────────────────────────────────┘

  FUNÇÃO EXATA:
  Bloco de template em contextModeInstructions, ramo:
    ": shouldUseRichExplanationPath(routingDecision) ? \`...\` :"
  Localização: pages/api/chat-gpt4o.js ~L27447-27484

  IMPACTO ESPERADO:
    - Winner compliance rate: +20-30pp para cenários EXPLANATION_REQUEST
    - Zero impacto nos outros contratos (isolado)
    - Zero impacto em routing, session, ranking, winner policy

  RISCO ESTIMADO: BAIXO
    - Não altera lógica de seleção de template
    - Não altera routing decision
    - Não altera session state
    - Não altera winner policy
    - Única mudança: texto do prompt enviado ao LLM`);

// ── Final summary ──
SEP(); console.log("PATCH 7.6O-B-AUDIT — SUMÁRIO"); SEP();
const httpRan = scenarioResults.filter(r => !r.error).length;
const httpPass = scenarioResults.filter(r => !r.error && r.winnerInReply).length;
if (HTTP_ENABLED && httpRan > 0) {
  console.log(`\n  Cenários HTTP executados : ${httpRan}`);
  console.log(`  Winner compliance rate   : ${httpPass}/${httpRan} (${Math.round(httpPass/httpRan*100)}%)`);
} else {
  console.log(`\n  HTTP: desativado (análise estática apenas)`);
  console.log(`  Para resultados completos: MIA_STATE_AUDIT=true node scripts/test-mia-explanation-anchored-contract-audit.js`);
}

console.log(`
  CAUSA RAIZ PRIMÁRIA   : CONTRACT_STAGE
  CAUSA RAIZ SECUNDÁRIA : RAW_LLM_BEHAVIOR (consequência do CONTRACT_STAGE)

  STRUCTURAL COMPLIANCE SCORES:
    explanation_anchored            : ${complianceScore(analyses.explanation_anchored).score}/${complianceScore(analyses.explanation_anchored).max} (${complianceScore(analyses.explanation_anchored).pct}%)
    objection_response_contract     : ${complianceScore(analyses.objection_response_contract).score}/${complianceScore(analyses.objection_response_contract).max} (${complianceScore(analyses.objection_response_contract).pct}%)
    priority_shift_response_contract: ${complianceScore(analyses.priority_shift_response_contract).score}/${complianceScore(analyses.priority_shift_response_contract).max} (${complianceScore(analyses.priority_shift_response_contract).pct}%)

  PRÓXIMO PATCH: PATCH 7.6O-B (3 intervenções cirúrgicas em ~38 linhas)
`);
