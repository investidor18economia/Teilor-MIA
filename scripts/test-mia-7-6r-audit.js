/**
 * PATCH 7.6R-AUDIT — Conversational Follow-up Classification Audit
 *
 * Objetivo: identificar exatamente em qual estágio do pipeline follow-ups
 * conversacionais humanos perdem a classificação correta quando existe âncora
 * ativa e contexto decisório válido.
 *
 * SOMENTE LEITURA — nenhuma correção, nenhum patch.
 *
 * Métricas capturadas por cenário (15 campos):
 *  1.  cognitiveTurnEarly.turnType
 *  2.  cognitiveTurnWithCSO.turnType
 *  3.  confidence
 *  4.  reasons
 *  5.  bridge.active
 *  6.  finalIntent
 *  7.  contextAction
 *  8.  routingMode
 *  9.  responsePath
 * 10.  allowNewSearch
 * 11.  allowReplaceWinner
 * 12.  shouldPreserveAnchor
 * 13.  anchorProduct
 * 14.  winner final
 * 15.  contract aplicado
 */

const API_BASE     = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const PRIOR_QUERY  = "celular ate 2500";
const API_KEY      = "minha_chave_181199";

// ─────────────────────────────────────────────────────────────
// Cenários — 20 queries em 4 grupos cognitivos
// ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  // Grupo A — Hesitação
  { id: "A.1", group: "A", cogFamily: "HESITATION",  label: "nao sei se gostei",              query: "nao sei se gostei" },
  { id: "A.2", group: "A", cogFamily: "HESITATION",  label: "sei la...",                       query: "sei la" },
  { id: "A.3", group: "A", cogFamily: "HESITATION",  label: "ainda nao estou convencido",      query: "ainda nao estou convencido" },
  { id: "A.4", group: "A", cogFamily: "HESITATION",  label: "nao me passou confianca",         query: "nao me passou confianca" },
  { id: "A.5", group: "A", cogFamily: "HESITATION",  label: "algo me incomoda",                query: "algo me incomoda" },

  // Grupo B — Objeção implícita (projective)
  { id: "B.1", group: "B", cogFamily: "IMPLICIT_OBJECTION", label: "qual seria seu medo nessa compra", query: "qual seria seu medo nessa compra" },
  { id: "B.2", group: "B", cogFamily: "IMPLICIT_OBJECTION", label: "o que te preocuparia",             query: "o que te preocuparia" },
  { id: "B.3", group: "B", cogFamily: "IMPLICIT_OBJECTION", label: "qual o maior risco",               query: "qual o maior risco" },
  { id: "B.4", group: "B", cogFamily: "IMPLICIT_OBJECTION", label: "onde voce ficaria com receio",     query: "onde voce ficaria com receio" },
  { id: "B.5", group: "B", cogFamily: "IMPLICIT_OBJECTION", label: "o que poderia dar errado",         query: "o que poderia dar errado" },

  // Grupo C — Continuação conversacional (delegation)
  { id: "C.1", group: "C", cogFamily: "CONVERSATIONAL_DELEGATION", label: "e se fosse voce",      query: "e se fosse voce" },
  { id: "C.2", group: "C", cogFamily: "CONVERSATIONAL_DELEGATION", label: "voce compraria",        query: "voce compraria" },
  { id: "C.3", group: "C", cogFamily: "CONVERSATIONAL_DELEGATION", label: "e agora",               query: "e agora" },
  { id: "C.4", group: "C", cogFamily: "CONVERSATIONAL_DELEGATION", label: "o que voce faria",      query: "o que voce faria" },
  { id: "C.5", group: "C", cogFamily: "CONVERSATIONAL_DELEGATION", label: "qual seria sua escolha",query: "qual seria sua escolha" },

  // Grupo D — Insegurança (purchase anxiety)
  { id: "D.1", group: "D", cogFamily: "PURCHASE_ANXIETY", label: "tenho medo de me arrepender", query: "tenho medo de me arrepender" },
  { id: "D.2", group: "D", cogFamily: "PURCHASE_ANXIETY", label: "estou em duvida ainda",        query: "estou em duvida ainda" },
  { id: "D.3", group: "D", cogFamily: "PURCHASE_ANXIETY", label: "nao quero fazer besteira",     query: "nao quero fazer besteira" },
  { id: "D.4", group: "D", cogFamily: "PURCHASE_ANXIETY", label: "tenho receio dessa escolha",   query: "tenho receio dessa escolha" },
];

// ─────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id:         "audit-7-6r",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ─────────────────────────────────────────────────────────────
// Extractor — all 15 metrics from mia_debug.pipelineTrace
// ─────────────────────────────────────────────────────────────

function extractMetrics(apiResp, winnerFromT1) {
  const trace    = apiResp?.mia_debug?.pipelineTrace || {};
  const ct       = trace.cognitive_turn_early       || {};
  const ctCSO    = trace.cognitive_turn_with_cso    || {};
  const bridge   = trace.cognitive_intent_authority_bridge || {};
  const routing  = trace.routingDecision            || {};
  const rich     = trace.rich_explanation_audit     || {};
  const contract = trace.applied_contract           || {};
  const session  = apiResp?.session_context         || {};

  // 1. cognitiveTurnEarly.turnType
  const turnTypeEarly = ct.turnType || null;

  // 2. cognitiveTurnWithCSO.turnType
  const turnTypeCSO = ctCSO.turnType || null;

  // 3. confidence
  const confidence = ct.confidence ?? ctCSO.confidence ?? null;

  // 4. reasons
  const reasons = ct.reasons || ctCSO.reasons || [];

  // 5. bridge.active
  const bridgeActive = !!(bridge.active);

  // 6. finalIntent
  const finalIntent = bridge.finalIntent || routing.intent || null;

  // 7. contextAction
  const contextAction = routing.contextAction || bridge.contextActionFinal || null;

  // 8. routingMode
  const routingMode = routing.mode || rich.contextModeSelected || null;

  // 9. responsePath
  const responsePath = routing.responsePath || routing.path || null;

  // 10. allowNewSearch
  const allowNewSearch = routing.allowNewSearch ?? null;

  // 11. allowReplaceWinner
  const allowReplaceWinner = routing.allowReplaceWinner ?? null;

  // 12. shouldPreserveAnchor
  const shouldPreserveAnchor = routing.shouldPreserveAnchor ?? null;

  // 13. anchorProduct
  const anchorProduct = session.lastBestProduct?.product_name
    || bridge.anchorProduct
    || null;

  // 14. winner final (from session or reply heuristic)
  const winnerFinal = anchorProduct || winnerFromT1 || null;

  // 15. contract aplicado
  const contractApplied = rich.contextModeSelected
    || contract.name
    || routing.mode
    || null;

  // Leak stage inference
  let leakStage = "NONE";
  if (!turnTypeEarly && !turnTypeCSO) {
    leakStage = "ROUTER_STAGE";
  } else if (turnTypeEarly === "UNKNOWN" || turnTypeEarly === "CONVERSATIONAL") {
    leakStage = "ROUTER_STAGE";
  } else if (!bridgeActive && turnTypeEarly !== "OBJECTION" && turnTypeEarly !== "EXPLANATION_REQUEST") {
    leakStage = "BRIDGE_STAGE";
  } else if (!contextAction || contextAction === "search" || contextAction === "general_answer") {
    leakStage = "CONTEXT_ACTION_STAGE";
  } else if (!routingMode || routingMode === "decision_generic") {
    leakStage = "ROUTING_STAGE";
  }

  return {
    turnTypeEarly,
    turnTypeCSO,
    confidence,
    reasons,
    bridgeActive,
    finalIntent,
    contextAction,
    routingMode,
    responsePath,
    allowNewSearch,
    allowReplaceWinner,
    shouldPreserveAnchor,
    anchorProduct,
    winnerFinal,
    contractApplied,
    leakStage,
    replyPreview: (apiResp?.reply || "").replace(/\n/g, " ").slice(0, 120),
  };
}

// ─────────────────────────────────────────────────────────────
// Run one case: T1 (anchor) then T2 (follow-up)
// ─────────────────────────────────────────────────────────────

async function runCase(scenario) {
  const convId = `r-audit-${scenario.id}-${Date.now()}`;

  // T1 — establish anchor
  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const s1  = t1.session_context || {};
  const msgs1 = [
    { role: "user",      content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];
  const winnerT1 = s1.lastBestProduct?.product_name || t1.winner_product || null;

  // T2 — the follow-up query under audit
  const t2 = await httpPost(scenario.query, s1, msgs1, convId);
  const metrics = extractMetrics(t2, winnerT1);

  return { ...scenario, winnerT1, ...metrics };
}

// ─────────────────────────────────────────────────────────────
// Classify outcome
// ─────────────────────────────────────────────────────────────

const CORRECT_TYPES = new Set(["OBJECTION", "EXPLANATION_REQUEST", "FOLLOW_UP", "PRIORITY_SHIFT", "REACTION"]);
const ESCAPE_TYPES  = new Set(["UNKNOWN", "CONVERSATIONAL", null]);

function classifyOutcome(r) {
  const tt = r.turnTypeEarly;
  if (ESCAPE_TYPES.has(tt))   return "ESCAPED";
  if (CORRECT_TYPES.has(tt))  return "CLASSIFIED";
  return "MISCLASSIFIED"; // e.g. REACTION for negative sentiment
}

// ─────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────

function pad(s, n) { return String(s ?? "—").padEnd(n); }
function section(t) { console.log(`\n  ${"─".repeat(70)}\n  ${t}\n  ${"─".repeat(70)}`); }

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

section("PATCH 7.6R-AUDIT — Conversational Follow-up Classification Audit");
console.log("  Anchor: 'celular ate 2500'  |  20 cenários  |  15 métricas por cenário\n");

let currentGroup = null;
const results = [];
const errors  = [];

for (const s of SCENARIOS) {
  if (s.group !== currentGroup) {
    const labels = {
      A: "Grupo A — Hesitação",
      B: "Grupo B — Objeção Implícita (projective)",
      C: "Grupo C — Continuação Conversacional (delegation)",
      D: "Grupo D — Insegurança (purchase anxiety)",
    };
    section(labels[s.group]);
    currentGroup = s.group;
  }

  try {
    const r   = await runCase(s);
    const out = classifyOutcome(r);
    const icon = out === "CLASSIFIED" ? "✓" : out === "ESCAPED" ? "✗" : "~";
    results.push({ ...r, outcome: out });

    console.log(`\n  ${icon} ${r.id} — ${r.label}  [outcome=${out}]`);
    console.log(`      cogFamily       : ${r.cogFamily}`);
    console.log(`      turnType (early): ${r.turnTypeEarly ?? "—"}  (CSO: ${r.turnTypeCSO ?? "—"})`);
    console.log(`      confidence      : ${r.confidence ?? "—"}`);
    console.log(`      reasons         : ${(r.reasons || []).slice(0, 4).join(" | ") || "—"}`);
    console.log(`      bridge.active   : ${r.bridgeActive}`);
    console.log(`      finalIntent     : ${r.finalIntent ?? "—"}`);
    console.log(`      contextAction   : ${r.contextAction ?? "—"}`);
    console.log(`      routingMode     : ${r.routingMode ?? "—"}`);
    console.log(`      responsePath    : ${r.responsePath ?? "—"}`);
    console.log(`      allowNewSearch  : ${r.allowNewSearch}`);
    console.log(`      allowReplace    : ${r.allowReplaceWinner}`);
    console.log(`      preserveAnchor  : ${r.shouldPreserveAnchor}`);
    console.log(`      anchor          : ${r.anchorProduct ?? "—"}`);
    console.log(`      winner final    : ${r.winnerFinal ?? "—"}`);
    console.log(`      contract        : ${r.contractApplied ?? "—"}`);
    console.log(`      leakStage       : ${r.leakStage}`);
    console.log(`      reply           : "${r.replyPreview}"`);
  } catch (e) {
    errors.push({ id: s.id, label: s.label, error: e.message });
    console.log(`\n  ✗ ${s.id} — ${s.label}  [ERROR: ${e.message}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// Summary Table
// ─────────────────────────────────────────────────────────────

section("TABELA GERAL — 7.6R-AUDIT");
console.log(`\n  ${"ID".padEnd(4)} ${"Query".padEnd(36)} ${"TurnType".padEnd(22)} ${"Conf".padEnd(5)} ${"Bridge".padEnd(7)} ${"FinalIntent".padEnd(20)} ${"RoutingMode".padEnd(32)} ${"WinPres".padEnd(8)} ${"LeakStage".padEnd(24)} RootCause`);
console.log(`  ${"─".repeat(185)}`);

for (const r of results) {
  const winPres = r.anchorProduct ? "✓" : "✗";
  const rootCause = r.leakStage === "ROUTER_STAGE" ? "no_pattern_match"
    : r.leakStage === "BRIDGE_STAGE"               ? "bridge_not_activated"
    : r.leakStage === "CONTEXT_ACTION_STAGE"        ? "intent_lost_in_cso"
    : r.leakStage === "ROUTING_STAGE"               ? "routing_mode_fallback"
    : "—";
  console.log(
    `  ${pad(r.id, 4)} ${pad(r.label, 36)} ${pad(r.turnTypeEarly, 22)} ${pad(r.confidence?.toFixed(2), 5)} ${pad(r.bridgeActive ? "✓" : "✗", 7)} ${pad(r.finalIntent, 20)} ${pad(r.routingMode, 32)} ${pad(winPres, 8)} ${pad(r.leakStage, 24)} ${rootCause}`
  );
}

// ─────────────────────────────────────────────────────────────
// Frequency by cognitive family and outcome
// ─────────────────────────────────────────────────────────────

section("FREQUÊNCIA POR FAMÍLIA COGNITIVA");

const byGroup = {};
for (const r of results) {
  const k = r.cogFamily;
  if (!byGroup[k]) byGroup[k] = { total: 0, CLASSIFIED: 0, ESCAPED: 0, MISCLASSIFIED: 0 };
  byGroup[k].total++;
  byGroup[k][r.outcome]++;
}

console.log(`\n  ${"Família".padEnd(30)} ${"Total".padEnd(7)} ${"✓ CLASS".padEnd(10)} ${"✗ ESCAPED".padEnd(12)} ${"~ MISC".padEnd(10)}`);
console.log(`  ${"─".repeat(70)}`);
for (const [k, v] of Object.entries(byGroup)) {
  console.log(`  ${pad(k, 30)} ${pad(v.total, 7)} ${pad(v.CLASSIFIED, 10)} ${pad(v.ESCAPED, 12)} ${pad(v.MISCLASSIFIED, 10)}`);
}

// By turnType distribution
section("DISTRIBUIÇÃO POR TURN TYPE");

const byTT = {};
for (const r of results) {
  const tt = r.turnTypeEarly || "null";
  byTT[tt] = (byTT[tt] || 0) + 1;
}
for (const [tt, count] of Object.entries(byTT).sort((a, b) => b[1] - a[1])) {
  const bar = "█".repeat(count * 2);
  console.log(`\n    ${pad(tt, 28)} ${bar} ${count}`);
}

// By leak stage
section("DISTRIBUIÇÃO POR LEAK STAGE");

const byLeak = {};
for (const r of results) {
  byLeak[r.leakStage] = (byLeak[r.leakStage] || 0) + 1;
}
for (const [stage, count] of Object.entries(byLeak).sort((a, b) => b[1] - a[1])) {
  const pct = Math.round(count / results.length * 100);
  console.log(`\n    ${pad(stage, 28)} ${count}/${results.length}  (${pct}%)`);
}

// ─────────────────────────────────────────────────────────────
// Escaped scenarios detail
// ─────────────────────────────────────────────────────────────

const escaped = results.filter(r => r.outcome !== "CLASSIFIED");
if (escaped.length > 0) {
  section("CENÁRIOS ESCAPADOS / MAL CLASSIFICADOS — DETALHE");
  for (const r of escaped) {
    console.log(`\n  ${r.outcome === "ESCAPED" ? "✗" : "~"} ${r.id} "${r.label}"`);
    console.log(`      Família esperada  : ${r.cogFamily}`);
    console.log(`      TurnType recebido : ${r.turnTypeEarly ?? "null"}`);
    console.log(`      Reasons           : ${(r.reasons || []).join(", ") || "—"}`);
    console.log(`      LeakStage         : ${r.leakStage}`);
    console.log(`      Reply preview     : "${r.replyPreview}"`);
  }
}

// ─────────────────────────────────────────────────────────────
// Final diagnosis
// ─────────────────────────────────────────────────────────────

section("DIAGNÓSTICO CONSOLIDADO — 7.6R-AUDIT");

const nEscaped       = results.filter(r => r.outcome === "ESCAPED").length;
const nMisclassified = results.filter(r => r.outcome === "MISCLASSIFIED").length;
const nClassified    = results.filter(r => r.outcome === "CLASSIFIED").length;
const total          = results.length;

console.log(`\n  Cenários executados  : ${total}`);
console.log(`  Classificados OK     : ${nClassified}/${total}  (${Math.round(nClassified/total*100)}%)`);
console.log(`  Escapados (UNKNOWN)  : ${nEscaped}/${total}  (${Math.round(nEscaped/total*100)}%)`);
console.log(`  Mal classificados    : ${nMisclassified}/${total}  (${Math.round(nMisclassified/total*100)}%)`);

// Identify dominant leak stages
const leakBreakdown = {};
for (const r of escaped) {
  leakBreakdown[r.leakStage] = (leakBreakdown[r.leakStage] || []);
  leakBreakdown[r.leakStage].push(`${r.id}:${r.cogFamily}`);
}
if (Object.keys(leakBreakdown).length > 0) {
  console.log(`\n  LEAK STAGES DOMINANTES:`);
  for (const [stage, ids] of Object.entries(leakBreakdown)) {
    console.log(`    ${stage}: ${ids.join(", ")}`);
  }
}

// Group B specific note
const bEscaped = escaped.filter(r => r.group === "B");
if (bEscaped.length > 0) {
  console.log(`\n  GRUPO B (projective questions) — ${bEscaped.length}/5 escapados`);
  console.log(`    Família semântica: perguntas direcionadas à MIA sobre riscos/receios`);
  console.log(`    Nenhum detector cobre 'qual seria seu medo', 'o que te preocuparia'`);
}

const cEscaped = escaped.filter(r => r.group === "C");
if (cEscaped.length > 0) {
  console.log(`\n  GRUPO C (delegation) — ${cEscaped.length}/5 escapados ou mal classificados`);
  console.log(`    Família semântica: delegação de decisão para MIA ('e se fosse voce?', 'voce compraria?')`);
}

const aEscaped = escaped.filter(r => r.group === "A");
if (aEscaped.length > 0) {
  console.log(`\n  GRUPO A (hesitation gaps) — ${aEscaped.length}/5 escapados`);
  console.log(`    Família semântica: hesitação com variações de tempo verbal ou vocabulário`);
}

console.log(`\n  ${"═".repeat(70)}\n`);

if (errors.length) {
  console.log(`  ⚠ ${errors.length} cenários com erro de rede: ${errors.map(e => e.id).join(", ")}\n`);
}
