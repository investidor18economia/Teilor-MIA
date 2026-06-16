/**
 * PATCH 7.6Q-AUDIT — Explanation Consistency Audit
 *
 * Audita se a MIA usa a memória decisória real para construir explicações,
 * ou se recorre ao conhecimento genérico do LLM.
 *
 * Audit ID: MIA_EXPLANATION_CONSISTENCY_AUDIT
 *
 * Separação explícita entre:
 *   - Winner consistency (produto correto)
 *   - Reasoning consistency (explicação ancorada na decisão real)
 *
 * Uso:
 *   MIA_DEBUG=true node scripts/test-mia-explanation-consistency-audit.js
 *   (MIA_DEBUG=true adiciona explanation_consistency_audit ao trace do servidor)
 *
 * Funciona sem MIA_DEBUG — auditoria local replica a lógica do servidor.
 */

const API_BASE     = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const PRIOR_QUERY  = "celular ate 2500";

// ─────────────────────────────────────────────────────────────
// Local audit (mirrors miaExplanationConsistencyAudit.js)
// ─────────────────────────────────────────────────────────────

function _norm(s = "") {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const _STOP = new Set(["para","com","que","quando","mais","uma","esse","essa",
  "este","esta","pelo","pela","como","muito","menos","entre","algo","isso",
  "aqui","onde","qual","quem","deve","pode","disso","voce","eles","elas",
  "nesse","nessa","neste","nesta","desse","dessa"]);

function _terms(s, minLen = 4) {
  return _norm(s).split(" ").filter(t => t.length >= minLen && !_STOP.has(t));
}

function _overlap(terms, target, thresh = 0.25) {
  if (!terms.length) return true;
  return terms.filter(t => target.includes(t)).length / terms.length >= thresh;
}

// EN→PT synonym map for common decision axes
const _AXIS_SYNONYMS = {
  "performance": ["desempenho", "performance", "rapido", "velocidade", "fluidez"],
  "battery":     ["bateria", "battery", "autonomia", "duracao"],
  "camera":      ["camera", "camara", "foto", "fotos"],
  "price":       ["preco", "price", "custo", "barato", "economico"],
  "durability":  ["durabilidade", "durability", "duravel", "resistente"],
  "safety":      ["seguranca", "safety", "seguro", "confiavel"],
  "comfort":     ["conforto", "comfort", "tranquilidade", "tranquilo"],
};

function _axisReflectedInReply(axisRaw, replyNorm) {
  if (!axisRaw || replyNorm.length < 100) return true;
  const axisNorm = _norm(axisRaw);
  const directTerms = _terms(axisNorm, 4);
  if (_overlap(directTerms, replyNorm, 0.25)) return true;
  const synonymList = _AXIS_SYNONYMS[axisNorm] || [];
  return synonymList.some(s => replyNorm.includes(_norm(s)));
}

function localConsistencyAudit(reply, decMem, winnerName, turnType) {
  const rn      = _norm(reply);
  const flags   = [];
  const diag    = {};

  // 1. Axis reflected? (with EN→PT synonym support)
  diag.axisNotReflected = !_axisReflectedInReply(decMem.lastAxis, rn);
  if (diag.axisNotReflected) flags.push("PROMPT_MISSING_AXIS → LLM_IGNORED_AXIS");

  // 2. Tradeoff reflected?
  const tradeoffTerms = _terms(decMem.lastTradeoff || "", 5);
  diag.tradeoffNotReflected = tradeoffTerms.length >= 3 && rn.length >= 150 && !_overlap(tradeoffTerms, rn, 0.15);
  if (diag.tradeoffNotReflected) flags.push("PROMPT_MISSING_TRADEOFF → LLM_IGNORED_TRADEOFF");

  // 3. Decision memory ignored (axis AND consequence both absent)?
  const consTerms  = _terms(decMem.lastMainConsequence || "", 5);
  const axisAbsent = !_axisReflectedInReply(decMem.lastAxis, rn);
  const consAbsent = consTerms.length > 0 && !_overlap(consTerms, rn, 0.15);
  diag.decisionMemoryIgnored = !!(decMem.hasAxis && decMem.hasConsequence && rn.length >= 150 && axisAbsent && consAbsent);
  if (diag.decisionMemoryIgnored) flags.push("LLM_USED_GENERIC_KNOWLEDGE");

  // 4. Winner absent?
  const wTerms = _terms(winnerName || "", 3);
  diag.winnerAbsent = wTerms.length > 0 && rn.length >= 100 && !_overlap(wTerms, rn, 0.5);
  if (diag.winnerAbsent) flags.push("FINAL_REPLY_NOT_DECISION_GROUNDED");

  // 5. Unauthorized alternative? (EXPLANATION/PRIORITY_SHIFT + sugestão de outro produto)
  const altTypes = new Set(["COMPARISON","REFINEMENT","NEW_SEARCH","COMPARISON_FOLLOWUP"]);
  if (!altTypes.has(turnType)) {
    const signalA = /\btambem (e|seria) (uma?|um?) (boa|bom|excelente|otima|otimo|interessante) (opcao|alternativa|escolha)\b/.test(rn);
    const signalB = /\boutra (opcao|alternativa|possibilidade)\b/.test(rn);
    const signalC = /\bse (voce|vc|quiser|preferir)\b.{0,50}\b(outro|outra|diferente)\b/.test(rn);
    diag.unauthorizedAlternative = signalA || signalB || signalC;
    if (diag.unauthorizedAlternative) flags.push("WINNER_CORRECT_REASONING_WRONG → LLM_SPECULATED_REASONING");
  }

  // 6. Generic knowledge detected (product-specific buzzwords not in decision memory)
  const genericTerms = ["a15","chip","bionic","ecossistema","ecosistema","valor de revenda",
    "atualizacoes","software","build quality","qualidade de construcao","acabamento premium"];
  const axisText = _norm((decMem.lastAxis || "") + " " + (decMem.lastMainConsequence || "") + " " + (decMem.lastTradeoff || ""));
  diag.genericKnowledgeDetected = genericTerms.some(g => rn.includes(_norm(g)) && !axisText.includes(_norm(g)));

  // 7. Speculative reasoning (LLM inventa raciocínio que não estava na memória)
  const specSignals = [/\bprovavelmente\b/, /\bgenericamente\b/, /\bno geral\b/, /\bnormalmente\b/];
  diag.speculativeReasoningDetected = specSignals.some(r => r.test(rn));

  // Consistency score (0–100, maior = mais consistente)
  let score = 100;
  if (diag.axisNotReflected)          score -= 25;
  if (diag.tradeoffNotReflected)      score -= 20;
  if (diag.decisionMemoryIgnored)     score -= 30;
  if (diag.winnerAbsent)              score -= 15;
  if (diag.unauthorizedAlternative)   score -= 25;
  if (diag.genericKnowledgeDetected)  score -= 10;
  if (diag.speculativeReasoningDetected) score -= 5;
  score = Math.max(0, score);

  // Leak stage classification
  let leakStage = "NONE";
  if (diag.decisionMemoryIgnored || diag.axisNotReflected) {
    leakStage = "RAW_LLM_STAGE";
  } else if (diag.unauthorizedAlternative || diag.genericKnowledgeDetected) {
    leakStage = "RAW_LLM_STAGE";
  } else if (diag.winnerAbsent) {
    leakStage = "FINAL_REPLY_STAGE";
  }

  return { flags, diag, score, leakStage };
}

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

async function httpCall(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "minha_chave_181199" },
    body: JSON.stringify({
      text, image_base64: "", user_id: "eq-audit-7-6q",
      conversation_id: convId, messages, session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runCase(id, label, query) {
  const convId = `eq-${id}-${Date.now()}`;

  // Turn 1: search → establish anchor + decision memory
  const t1 = await httpCall(PRIOR_QUERY, {}, [], convId);
  const session1 = t1.session_context || {};
  const msgs1 = [
    { role: "user",      content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];

  // Decision memory snapshot (from session_context after T1)
  const decMem = {
    lastAxis:           session1.lastAxis           || "",
    lastMainConsequence:session1.lastMainConsequence|| "",
    lastTradeoff:       session1.lastTradeoff        || "",
    lastDecisionReason: session1.lastDecisionReason  || "",
    lastWinnerAdvantages: Array.isArray(session1.lastWinnerAdvantages) ? session1.lastWinnerAdvantages : [],
    lastWinnerSacrifices: Array.isArray(session1.lastWinnerSacrifices) ? session1.lastWinnerSacrifices : [],
    hasAxis:       !!(session1.lastAxis || session1.lastPriority),
    hasConsequence:!!(session1.lastMainConsequence),
    hasTradeoff:   !!(session1.lastTradeoff),
    hasDecisionReason: !!(session1.lastDecisionReason),
    richness: [
      session1.lastAxis, session1.lastMainConsequence, session1.lastTradeoff,
      session1.lastDecisionReason,
    ].filter(Boolean).length +
    (session1.lastWinnerAdvantages?.length || 0) +
    (session1.lastWinnerSacrifices?.length || 0),
  };

  const winnerName = session1.lastBestProduct?.product_name
    || t1.winner_product || t1.prices?.[0]?.product_name || null;

  // Turn 2: explanation query
  const t2 = await httpCall(query, session1, msgs1, convId);
  const trace2 = t2.mia_debug?.pipelineTrace || {};

  const ct     = trace2.cognitive_turn_early || trace2.cognitive_turn_with_cso || {};
  const bridge = trace2.cognitive_intent_authority_bridge || {};
  const rd     = trace2.routingDecision || {};
  const rich   = trace2.rich_explanation_audit || {};
  const serverConsistency = trace2.explanation_consistency_audit || null; // only with MIA_DEBUG=true

  const turnType     = ct.turnType || null;
  const routingMode  = rd.mode || null;
  const contextMode  = rich.contextModeSelected || null;
  const responsePath = trace2.response_path || trace2.responsePath || null;
  const finalReply   = t2.reply || "";

  // Local audit
  const localAudit = localConsistencyAudit(finalReply, decMem, winnerName, turnType);

  // Winner check
  const winnerMentioned = winnerName
    ? _norm(finalReply).includes(_norm(winnerName.split(" ")[0]))
    : null;

  return {
    id, label, query,
    // Routing
    turnType, routingMode, contextMode, responsePath,
    bridgeApplied: !!bridge.active,
    finalIntent: bridge.toIntent || null,
    // Winner
    winner: winnerName,
    winnerMentioned,
    // Decision memory (from T1 session_context)
    decisionMemoryAvailable: decMem.richness > 0,
    decisionMemoryRichnessScore: decMem.richness,
    lastAxis:            decMem.lastAxis || "—",
    lastMainConsequence: decMem.lastMainConsequence || "—",
    lastTradeoff:        decMem.lastTradeoff || "—",
    lastDecisionReason:  decMem.lastDecisionReason || "—",
    winnerAdvantagesCount: decMem.lastWinnerAdvantages.length,
    winnerSacrificesCount: decMem.lastWinnerSacrifices.length,
    winnerAdvantages: decMem.lastWinnerAdvantages,
    winnerSacrifices: decMem.lastWinnerSacrifices,
    hasAxis: decMem.hasAxis,
    hasConsequence: decMem.hasConsequence,
    hasTradeoff: decMem.hasTradeoff,
    // Prompt inputs (from _explanationCtx in server = decMem from session)
    promptIncludesAxis:          decMem.hasAxis,
    promptIncludesMainConsequence: decMem.hasConsequence,
    promptIncludesTradeoff:       decMem.hasTradeoff,
    promptIncludesDecisionReason: decMem.hasDecisionReason,
    // Raw reply
    rawReplyPreview:   finalReply.replace(/\n/g," ").slice(0, 120),
    finalReplyPreview: finalReply.replace(/\n/g," ").slice(0, 120),
    // Local audit results
    replyReflectsAxis:             !localAudit.diag.axisNotReflected,
    replyReflectsMainConsequence:  !localAudit.diag.decisionMemoryIgnored,
    replyReflectsTradeoff:         !localAudit.diag.tradeoffNotReflected,
    replyUsesDecisionMemory:       !(localAudit.diag.decisionMemoryIgnored || localAudit.diag.axisNotReflected),
    genericKnowledgeDetected:      localAudit.diag.genericKnowledgeDetected,
    speculativeReasoningDetected:  localAudit.diag.speculativeReasoningDetected,
    // Scores
    consistencyScore: localAudit.score,
    leakStage:        localAudit.leakStage,
    flags:            localAudit.flags,
    // Server-side audit (only when MIA_DEBUG=true)
    serverAuditAvailable: !!serverConsistency?.consistencyChecked,
    serverFlags: serverConsistency?.flags || null,
    serverConsistent: serverConsistency?.isConsistent ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  // Grupo A — Simplificação
  { id: "A.1", g: "A", label: "fala simples",                       query: "fala simples" },
  { id: "A.2", g: "A", label: "simplifica pra mim",                 query: "simplifica pra mim" },
  { id: "A.3", g: "A", label: "me explica sem linguagem tecnica",    query: "me explica sem linguagem tecnica" },
  // Grupo B — Escolha final / Cluster 12
  { id: "B.1", g: "B", label: "se voce tivesse que escolher um so", query: "se voce tivesse que escolher um so" },
  { id: "B.2", g: "B", label: "qual sobreviveria ao corte",          query: "qual sobreviveria ao corte" },
  { id: "B.3", g: "B", label: "qual voce manteria",                  query: "qual voce manteria" },
  // Grupo C — Priority shift
  { id: "C.1", g: "C", label: "qual da menos dor de cabeca",         query: "qual da menos dor de cabeca" },
  { id: "C.2", g: "C", label: "qual me deixaria mais tranquilo",      query: "qual me deixaria mais tranquilo" },
  { id: "C.3", g: "C", label: "qual e mais seguro",                   query: "qual e mais seguro" },
  // Grupo D — Objeção
  { id: "D.1", g: "D", label: "nao to sentindo confianca",            query: "nao to sentindo confianca" },
  { id: "D.2", g: "D", label: "algo me incomoda",                     query: "algo me incomoda" },
  { id: "D.3", g: "D", label: "nao queria fazer besteira",            query: "nao queria fazer besteira" },
  // Grupo E — Por quê / Explicação
  { id: "E.1", g: "E", label: "por que ele",                          query: "por que ele" },
  { id: "E.2", g: "E", label: "por que esse",                         query: "por que esse" },
  { id: "E.3", g: "E", label: "me explica melhor",                    query: "me explica melhor" },
];

function section(t) { console.log(`\n  ${"─".repeat(66)}\n  ${t}\n  ${"─".repeat(66)}`); }
function pad(s, n) { return String(s ?? "—").slice(0, n).padEnd(n); }

section("MIA_EXPLANATION_CONSISTENCY_AUDIT — PATCH 7.6Q");

// ─────────────────────────────────────────────────────────────
// Run all scenarios
// ─────────────────────────────────────────────────────────────

let currentGroup = null;
const results = [];

for (const s of SCENARIOS) {
  if (s.g !== currentGroup) {
    const groupLabel = {
      A: "Grupo A — Simplificação",
      B: "Grupo B — Escolha final / Cluster 12",
      C: "Grupo C — Priority Shift",
      D: "Grupo D — Objeção",
      E: "Grupo E — Por quê / Explicação",
    }[s.g];
    section(groupLabel);
    currentGroup = s.g;
  }

  try {
    const r = await runCase(s.id, s.label, s.query);
    results.push(r);

    const consistIcon = r.consistencyScore >= 70 ? "✓" : r.consistencyScore >= 40 ? "~" : "✗";
    const winIcon = r.winnerMentioned ? "✓" : "✗";
    console.log(`\n  ${consistIcon} ${r.id} — ${r.label}`);
    console.log(`      turnType     : ${r.turnType}  bridge=${r.bridgeApplied}`);
    console.log(`      routingMode  : ${r.routingMode}  mode=${r.contextMode}`);
    console.log(`      DECISION MEMORY:`);
    console.log(`        lastAxis           : "${r.lastAxis}"`);
    console.log(`        lastMainConsequence: "${r.lastMainConsequence}"`);
    console.log(`        lastTradeoff       : "${r.lastTradeoff}"`);
    console.log(`        lastDecisionReason : "${r.lastDecisionReason}"`);
    console.log(`        advantages (${r.winnerAdvantagesCount}) : ${r.winnerAdvantages.slice(0,3).join(" | ") || "—"}`);
    console.log(`        sacrifices  (${r.winnerSacrificesCount}) : ${r.winnerSacrifices.slice(0,2).join(" | ") || "—"}`);
    console.log(`        richness score     : ${r.decisionMemoryRichnessScore}`);
    console.log(`      PROMPT INPUTS:`);
    console.log(`        axis=${r.promptIncludesAxis} consequence=${r.promptIncludesMainConsequence} tradeoff=${r.promptIncludesTradeoff} reason=${r.promptIncludesDecisionReason}`);
    console.log(`      REPLY ANALYSIS:`);
    console.log(`        winner ${winIcon} ${r.winner}  mentioned=${r.winnerMentioned}`);
    console.log(`        axisReflected=${r.replyReflectsAxis}  tradeoffReflected=${r.replyReflectsTradeoff}`);
    console.log(`        genericKnowledge=${r.genericKnowledgeDetected}  speculative=${r.speculativeReasoningDetected}`);
    console.log(`        decisionMemoryUsed=${r.replyUsesDecisionMemory}`);
    console.log(`      consistencyScore : ${r.consistencyScore}/100`);
    console.log(`      leakStage        : ${r.leakStage}`);
    if (r.flags.length) console.log(`      flags            : ${r.flags.join(", ")}`);
    if (r.serverAuditAvailable) console.log(`      server flags     : ${(r.serverFlags||[]).join(", ") || "none"}`);
    console.log(`      replyPreview     : "${r.rawReplyPreview}"`);
  } catch (err) {
    results.push({ id: s.id, label: s.label, error: err.message });
    console.log(`\n  ✗ ${s.id} — ${s.label}  [ERROR: ${err.message}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// Tables & Report
// ─────────────────────────────────────────────────────────────

const ran    = results.filter(r => !r.error);
const errors = results.filter(r => r.error);

section("TABELA GERAL — Winner × Reasoning Consistency");
console.log(`\n  ${pad("ID",4)} ${pad("Winner?",8)} ${pad("Axis?",7)} ${pad("DecMem?",8)} ${pad("Score",6)} ${pad("LeakStage",24)} Flags`);
console.log(`  ${"─".repeat(100)}`);
for (const r of ran) {
  const w = r.winnerMentioned ? "✓" : "✗";
  const a = r.replyReflectsAxis ? "✓" : "✗";
  const m = r.replyUsesDecisionMemory ? "✓" : "✗";
  console.log(`  ${pad(r.id,4)} ${pad(w,8)} ${pad(a,7)} ${pad(m,8)} ${pad(r.consistencyScore,6)} ${pad(r.leakStage,24)} ${(r.flags||[]).join(" ")||"—"}`);
}

// ─────────────────────────────────────────────────────────────
// Flag frequency
// ─────────────────────────────────────────────────────────────

section("FLAGS MAIS FREQUENTES");
const flagCount = {};
for (const r of ran) {
  for (const f of (r.flags || [])) {
    flagCount[f] = (flagCount[f] || 0) + 1;
  }
}
const sortedFlags = Object.entries(flagCount).sort((a,b) => b[1]-a[1]);
if (sortedFlags.length === 0) {
  console.log(`\n  Nenhuma flag de inconsistência detectada.`);
} else {
  for (const [f, c] of sortedFlags) {
    console.log(`  ${c}/${ran.length}  ${f}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Decision memory availability audit
// ─────────────────────────────────────────────────────────────

section("DECISION MEMORY — Disponibilidade por campo");
const memSample = ran[0];
if (memSample) {
  console.log(`\n  (baseado em T1 "celular ate 2500" → session_context retornado):`);
  console.log(`  lastAxis             : "${memSample.lastAxis}"  populated=${memSample.hasAxis}`);
  console.log(`  lastMainConsequence  : "${memSample.lastMainConsequence}"  populated=${memSample.hasConsequence}`);
  console.log(`  lastTradeoff         : "${memSample.lastTradeoff}"  populated=${memSample.hasTradeoff}`);
  console.log(`  lastDecisionReason   : "${memSample.lastDecisionReason}"  populated=${!!memSample.lastDecisionReason && memSample.lastDecisionReason !== "—"}`);
  console.log(`  lastWinnerAdvantages : [${memSample.winnerAdvantages.join(", ")}]  count=${memSample.winnerAdvantagesCount}`);
  console.log(`  lastWinnerSacrifices : [${memSample.winnerSacrifices.join(", ")}]  count=${memSample.winnerSacrificesCount}`);
  console.log(`  richness score       : ${memSample.decisionMemoryRichnessScore}`);
}

// ─────────────────────────────────────────────────────────────
// Consolidated root cause
// ─────────────────────────────────────────────────────────────

const avgScore  = ran.length ? Math.round(ran.reduce((s,r)=>s+(r.consistencyScore||0),0)/ran.length) : 0;
const nAxisOk   = ran.filter(r => r.replyReflectsAxis).length;
const nMemOk    = ran.filter(r => r.replyUsesDecisionMemory).length;
const nWinnerOk = ran.filter(r => r.winnerMentioned).length;
const nGeneric  = ran.filter(r => r.genericKnowledgeDetected).length;

section("DIAGNÓSTICO — Causa raiz consolidada");

console.log(`\n  Métricas de consistência:`);
console.log(`    Cenários executados         : ${ran.length}`);
console.log(`    Winner correto              : ${nWinnerOk}/${ran.length}  (${Math.round(nWinnerOk/ran.length*100)}%)`);
console.log(`    Axis refletido no reply     : ${nAxisOk}/${ran.length}  (${Math.round(nAxisOk/ran.length*100)}%)`);
console.log(`    DecisionMemory usada        : ${nMemOk}/${ran.length}  (${Math.round(nMemOk/ran.length*100)}%)`);
console.log(`    Generic knowledge detectado : ${nGeneric}/${ran.length}  (${Math.round(nGeneric/ran.length*100)}%)`);
console.log(`    Consistency score médio     : ${avgScore}/100`);

console.log(`\n  Pipeline de perda de consistência:`);

const memAvailable = memSample?.decisionMemoryRichnessScore > 0;
const memHasAxis   = memSample?.hasAxis;
const memHasCons   = memSample?.hasConsequence;
const memHasTradeoff = memSample?.hasTradeoff;

console.log(`\n  ① DECISION_MEMORY_STAGE`);
console.log(`     lastAxis disponível         : ${memHasAxis} (valor: "${memSample?.lastAxis}")`);
console.log(`     lastMainConsequence dispon. : ${memHasCons} (valor: "${memSample?.lastMainConsequence}")`);
console.log(`     lastTradeoff disponível     : ${memHasTradeoff} (valor: "${memSample?.lastTradeoff}")`);
console.log(`     lastWinnerAdvantages        : ${memSample?.winnerAdvantagesCount} itens`);
console.log(`     VEREDICTO: ${memAvailable ? "MEMÓRIA DISPONÍVEL ✓" : "MEMÓRIA AUSENTE ✗ ← LEAK AQUI"}`);

console.log(`\n  ② PROMPT_INPUT_STAGE`);
console.log(`     Os campos de memória são passados via _explanationCtx para os templates:`);
console.log(`     - explanation_anchored  (linha 27539-27540 do handler)`);
console.log(`     - priority_shift_response_contract (linha 27379-27380)`);
console.log(`     - confidence_challenge_defense (linha 27451)`);
console.log(`     VEREDICTO: ${memHasAxis ? "PROMPT RECEBE MEMÓRIA QUANDO DISPONÍVEL ✓" : "PROMPT NÃO RECEBE EIXO ✗ ← LEAK AQUI"}`);

console.log(`\n  ③ RAW_LLM_STAGE`);
console.log(`     Axis refletido             : ${nAxisOk}/${ran.length} cenários`);
console.log(`     Decision memory usada      : ${nMemOk}/${ran.length} cenários`);
console.log(`     Generic knowledge detectado: ${nGeneric}/${ran.length} cenários`);
const llmLeaks = ran.filter(r => r.leakStage === "RAW_LLM_STAGE").length;
console.log(`     Cenários com leak RAW_LLM  : ${llmLeaks}/${ran.length}`);
console.log(`     VEREDICTO: ${llmLeaks > 0 ? "LLM IGNORA MEMÓRIA EM " + llmLeaks + " CENÁRIO(S) ✗ ← LEAK AQUI" : "LLM RESPEITA MEMÓRIA ✓"}`);

console.log(`\n  ④ FINAL_REPLY_STAGE (post-processing)`);
const finalLeaks = ran.filter(r => r.leakStage === "FINAL_REPLY_STAGE").length;
console.log(`     Cenários com leak FINAL    : ${finalLeaks}/${ran.length}`);
console.log(`     VEREDICTO: ${finalLeaks > 0 ? "POST-PROCESSING MUDA REASONING ✗" : "POST-PROCESSING NÃO ALTERA REASONING ✓"}`);

console.log(`\n  CAUSA RAIZ:`);
if (!memAvailable) {
  console.log(`  → DECISION_MEMORY_STAGE: memória não populada após busca.`);
  console.log(`    O handler não salva lastMainConsequence/lastTradeoff na sessão.`);
} else if (!memHasAxis || !memHasCons) {
  console.log(`  → DECISION_MEMORY_STAGE (parcial): alguns campos faltando na sessão.`);
  console.log(`    Campos vazios não entram no prompt → LLM não tem base decisória real.`);
} else if (llmLeaks > 0) {
  console.log(`  → RAW_LLM_STAGE: a memória existe e entra no prompt,`);
  console.log(`    mas o LLM usa conhecimento genérico em vez da decisão real.`);
  console.log(`    O LLM recebe o "lastAxis" e o "lastTradeoff" no prompt,`);
  console.log(`    mas a instrução não é suficientemente imperativa para que`);
  console.log(`    ele os use como âncora da explicação.`);
} else {
  console.log(`  → NENHUM LEAK DETECTADO: consistência de reasoning adequada.`);
}

section("PRÓXIMO PATCH RECOMENDADO");
if (!memAvailable) {
  console.log(`  PATCH 7.6Q-A — Decision Memory Enrichment Fix`);
  console.log(`  Garantir que buildDecisionMemoryEnrichment seja chamado no path correto.`);
} else if (llmLeaks > 0) {
  console.log(`  PATCH 7.6Q-B — Explanation Anchoring Hardening`);
  console.log(`  Tornar as instruções de reasoning mais imperativas nos templates:`);
  console.log(`  - explanation_anchored`);
  console.log(`  - priority_shift_response_contract`);
  console.log(`  - confidence_challenge_defense`);
  console.log(`  Substituir "use o eixo X" por "sua explicação DEVE referenciar X"`);
  console.log(`  Medir com re-execução deste script.`);
} else {
  console.log(`  Nenhum próximo patch necessário neste momento.`);
}

console.log(`\n  ${"═".repeat(66)}\n`);
process.exit(errors.length > 0 ? 1 : 0);
