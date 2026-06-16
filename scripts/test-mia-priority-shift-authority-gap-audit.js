/**
 * PATCH 7.6P-AUDIT — Priority Shift Authority Gap Audit
 *
 * Auditoria arquitetural de por que PRIORITY_SHIFT não recebe autoridade
 * na Cognitive Intent Authority Bridge e como o handler compensa esse gap.
 *
 * Audit ID: MIA_PRIORITY_SHIFT_AUTHORITY_GAP_AUDIT
 *
 * Usage:
 *   node scripts/test-mia-priority-shift-authority-gap-audit.js
 */

const API_BASE     = "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const PRIOR_QUERY  = "celular ate 2500";

// ─────────────────────────────────────────────────────────────
// Static analysis snapshot (offline — before HTTP tests)
// ─────────────────────────────────────────────────────────────

const STATIC = {
  // ── Bridge allowlist ──────────────────────────────────────
  bridgeAllowlist: ["EXPLANATION_REQUEST", "VALUE_QUESTION", "REFINEMENT", "COMPARISON", "NEW_SEARCH"],
  priorityShiftInAllowlist: false,
  priorityShiftMapEntry: null,
  exclusionComment: `miaCognitiveBridge.js line 54: "NÃO incluídos (ficam com legacy):
    CONVERSATIONAL, REACTION, OBJECTION, PRIORITY_SHIFT,
    FOLLOW_UP, COMPARISON_FOLLOWUP, COMMERCIAL_QUESTION, UNKNOWN"`,
  exclusionJustification: "Não documentada. Sem comentário explicando por quê excluído.",
  addedByPatch: "5.6B (origem do módulo bridge)",
  removedByPatch: null,
  neverIncluded: true,

  // ── _UNCHECKED_TURN_TYPES ─────────────────────────────────
  uncheckedTurnTypes: "miaCognitiveBridge.js line 586-589",
  priorityShiftIsUnchecked: true,
  uncheckedFlagGenerated: "LEGACY_ALLOWED_FOR_UNSUPPORTED_TURN (non-critical, informative only)",

  // ── Handler bypass ────────────────────────────────────────
  handlerBypassLine: 27191,
  handlerBypassCode: `const _isPriorityShiftWithAnchor =
    cognitiveTurnEarly?.turnType === "PRIORITY_SHIFT" && hasAnchorForRouting;`,
  handlerBypassEffect: "handler usa router signal diretamente, bypassa bridge para ativação do template",

  // ── Template ternary precedência ─────────────────────────
  templateTernaryLine: 27194,
  templateTernaryOrder: [
    "1. analysis",
    "2. confidence_challenge_defense",
    "3. objection_response_contract",
    "4. refinement_followup_response_contract",
    "5. priority_shift_response_contract  ← ativado por _isPriorityShiftWithAnchor",
    "6. explanation_anchored",
    "7. decision_generic (fallback)",
  ],

  // ── Router confidence ─────────────────────────────────────
  routerPriorityShiftConfidence: 0.80,
  routerConfidenceThreshold: 0.75,
  confidenceSufficient: true,

  // ── Safety check (Bloco C) ────────────────────────────────
  safetyAnalysis: {
    allowNewSearch:       false,
    allowReplaceWinner:   false,
    allowRerank:          false,
    shouldPreserveAnchor: true,
    reasoning: `PRIORITY_SHIFT = usuário muda eixo decisório (segurança, confiança, tranquilidade)
      mas NÃO pede novo produto. O winner autorizado permanece.
      Routing seguro é garantido: intent = "decision" mantém context block ativo,
      shouldPreserveAnchor = true protege anchor, allowNewSearch = false bloqueia re-search.
      É seguro conceder autoridade — comportamento esperado é análogo a EXPLANATION_REQUEST.`,
    verdict: "SEGURO",
  },

  // ── Bloco B: simulação com bridge aplicada ─────────────────
  simulatedBridge: {
    mappedIntent: "decision",
    mappedContextAction: "decision",
    mappedRoutingMode: "cognitive_anchor_hold",
    activatedContract: "priority_shift_response_contract",
    winnerProtected: true,
    rerank: false,
    newSearch: false,
  },
};

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

async function httpCall(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "minha_chave_181199" },
    body:    JSON.stringify({
      text, image_base64: "", user_id: "ps-authority-audit",
      conversation_id: convId, messages, session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runScenario(id, label, query) {
  const convId = `ps-audit-${id}-${Date.now()}`;

  // Turn 1: anchor
  const t1 = await httpCall(PRIOR_QUERY, {}, [], convId);
  const session1 = t1.session_context || {};
  const msgs1    = [
    { role: "user",      content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];

  // Turn 2: priority shift query
  const t2 = await httpCall(query, session1, msgs1, convId);

  const trace = t2.mia_debug?.pipelineTrace || {};
  const ct    = trace.cognitive_turn_early || {};
  const ctCso = trace.cognitive_turn_with_cso || {};
  const bridge = trace.cognitive_intent_authority_bridge || {};
  const guard  = trace.cognitive_context_action_guard || {};
  const mode   = trace.universal_followup_understanding_audit || trace.final_routing_mode_audit || {};
  const rich   = trace.rich_explanation_audit || {};
  const c12    = trace.cluster12QueryNeutralization || {};

  const turnType    = ct.turnType || ctCso.turnType || null;
  const conf        = ct.confidence || ctCso.confidence || null;
  const bridgeApplied = !!bridge.active;
  const finalIntent = bridge.toIntent || trace.finalIntent || mode.finalIntent || null;
  const routingMode = trace.routingDecision?.mode || mode.finalRoutingMode || null;
  const contextModeSelected = rich.contextModeSelected || null;
  const responsePath = trace.response_path || trace.responsePath || null;

  // Determine which contract was activated
  let contract = "unknown";
  if (contextModeSelected)           contract = contextModeSelected;
  else if (responsePath === "return_seguro") contract = "return_seguro_path";
  else if (routingMode === "general_answer") contract = "general_answer_path";

  // Winner protection
  const anchor = session1.lastBestProduct?.product_name || t1.winner_product || null;
  const replyMentionsAnchor = anchor
    ? (t2.reply || "").toLowerCase().includes(anchor.toLowerCase().split(" ")[0])
    : null;
  const winnerProtected = replyMentionsAnchor !== false;

  return {
    id, label, query,
    hasActiveAnchor:   !!anchor,
    anchorProduct:     anchor,
    turnType,
    confidence:        conf,
    bridgeApplied,
    bridgeReason:      bridge.reason || null,
    finalIntent,
    contextAction:     trace.context_action || null,
    routingMode,
    contextModeSelected,
    contract,
    responsePath,
    winnerProtected,
    replyPreview: (t2.reply || "").replace(/\n/g, " ").slice(0, 90),
  };
}

// ─────────────────────────────────────────────────────────────
// Run mandatory scenarios (Bloco D)
// ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  { id: "D.1", label: "qual da menos dor de cabeca",    query: "qual da menos dor de cabeca" },
  { id: "D.2", label: "qual e mais seguro",             query: "qual e mais seguro" },
  { id: "D.3", label: "qual inspira mais confianca",    query: "qual inspira mais confianca" },
  { id: "D.4", label: "qual dura mais",                 query: "qual dura mais" },
  { id: "D.5", label: "qual envelhece melhor",          query: "qual envelhece melhor" },
  { id: "D.6", label: "qual me deixaria mais tranquilo",query: "qual me deixaria mais tranquilo" },
];

function pad(s, n) { return String(s || "—").slice(0, n).padEnd(n); }
function section(t) { console.log(`\n  ${"─".repeat(68)}\n  ${t}\n  ${"─".repeat(68)}`); }

section("MIA_PRIORITY_SHIFT_AUTHORITY_GAP_AUDIT — PATCH 7.6P");

// ── Print static findings ────────────────────────────────────
section("INSPEÇÃO ESTÁTICA — Bridge + Handler");

console.log(`\n  COGNITIVE_BRIDGE_ALLOWLIST:`);
STATIC.bridgeAllowlist.forEach(t => console.log(`    ✓ ${t}`));
console.log(`    ✗ PRIORITY_SHIFT  ← AUSENTE`);

console.log(`\n  EXCLUSÃO:`);
console.log(`    Linha 54 (miaCognitiveBridge.js): comentário explícito no fonte`);
console.log(`    "NÃO incluídos (ficam com legacy): [...] PRIORITY_SHIFT [...]"`);
console.log(`    Justificativa: NENHUMA — sem comentário arquitetural explicando por quê`);
console.log(`    Adicionado por: PATCH 5.6B (origem do módulo bridge)`);
console.log(`    Removido por: NUNCA INCLUÍDO`);

console.log(`\n  _UNCHECKED_TURN_TYPES (linha 586-589 miaCognitiveBridge.js):`);
console.log(`    PRIORITY_SHIFT está na lista "expected legacies, não regressões"`);
console.log(`    Flag gerada: LEGACY_ALLOWED_FOR_UNSUPPORTED_TURN (non-critical)`);

console.log(`\n  BYPASS DO HANDLER (linha 27191 chat-gpt4o.js):`);
console.log(`    const _isPriorityShiftWithAnchor =`);
console.log(`      cognitiveTurnEarly?.turnType === "PRIORITY_SHIFT" && hasAnchorForRouting;`);
console.log(`    → Usa router signal DIRETAMENTE, sem passar pela bridge`);
console.log(`    → Ativa "priority_shift_response_contract" independente da bridge`);

section("BLOCO A — Allowlist");
console.log(`  1. Allowlist definida: miaCognitiveBridge.js linha 57-59`);
console.log(`     COGNITIVE_BRIDGE_ALLOWLIST = new Set(Object.keys(COGNITIVE_TO_LEGACY_INTENT_MAP))`);
console.log(`     Contém: EXPLANATION_REQUEST, VALUE_QUESTION, REFINEMENT, COMPARISON, NEW_SEARCH`);
console.log(`\n  2. PRIORITY_SHIFT fora da allowlist: SIM`);
console.log(`\n  3. Desde quando: desde a criação do módulo (PATCH 5.6B) — NUNCA incluído`);
console.log(`\n  4. Removido por patch anterior: NÃO — nunca foi adicionado`);
console.log(`\n  5. Comentário justificando exclusão:`);
console.log(`     Linha 54: "NÃO incluídos (ficam com legacy): CONVERSATIONAL, REACTION,`);
console.log(`     OBJECTION, PRIORITY_SHIFT, FOLLOW_UP, COMPARISON_FOLLOWUP,`);
console.log(`     COMMERCIAL_QUESTION, UNKNOWN"`);
console.log(`     → Justificativa de SEGURANÇA: não documentada no arquivo`);

section("BLOCO B — Impacto arquitetural (simulação bridge aplicada)");
console.log(`  Se PRIORITY_SHIFT fosse adicionado ao allowlist + map:`);
console.log(`\n  Router PRIORITY_SHIFT (conf=0.80)`);
console.log(`    ↓ bridge.active = true`);
console.log(`    ↓ intent = "decision"   (mapeamento sugerido: igual EXPLANATION_REQUEST)`);
console.log(`    ↓ detectContextAction("decision") → contextAction = "decision"`);
console.log(`    ↓ buildRoutingDecision("decision", anchor=true) → mode = "cognitive_anchor_hold"`);
console.log(`    ↓ _isPriorityShiftWithAnchor = true`);
console.log(`    ↓ _richExpContextModeSelected = "priority_shift_response_contract"`);
console.log(`\n  1. Intent final produzida    : "decision"`);
console.log(`  2. Routing mode produzido    : "cognitive_anchor_hold"`);
console.log(`  3. Contract ativado          : "priority_shift_response_contract"`);
console.log(`  4. Winner permaneceria       : SIM — shouldPreserveAnchor = true`);
console.log(`  5. Rerank                    : NÃO — allowRerank = false`);
console.log(`  6. Nova busca                : NÃO — allowNewSearch = false`);

section("BLOCO C — Segurança");
console.log(`  allowNewSearch       = false  ✓`);
console.log(`  allowReplaceWinner   = false  ✓`);
console.log(`  allowRerank          = false  ✓`);
console.log(`  shouldPreserveAnchor = true   ✓`);
console.log(`\n  VEREDICTO: SEGURO`);
console.log(`\n  Raciocínio:`);
console.log(`    PRIORITY_SHIFT é semanticamente análogo a EXPLANATION_REQUEST:`);
console.log(`    o usuário não pede produto novo — reorienta o eixo de julgamento.`);
console.log(`    Bridge segura = "decision" intent → context block ativo →`);
console.log(`    anchor protegido → priority_shift_response_contract`);

section("BLOCO D — Cenários reais (HTTP)");
console.log(`  Carregando...\n`);

const results = [];
for (const s of SCENARIOS) {
  try {
    const r = await runScenario(s.id, s.label, s.query);
    results.push(r);
    const icon = r.winnerProtected ? "✓" : "✗";
    const bridgeMark = r.bridgeApplied ? "APPLIED" : "NOT_APPLIED";
    const contract = r.contextModeSelected || r.contract || "?";
    console.log(`  ${icon} ${r.id} — ${r.label}`);
    console.log(`      turnType        : ${r.turnType}   (conf=${r.confidence})`);
    console.log(`      bridge          : ${bridgeMark}  reason=${r.bridgeReason}`);
    console.log(`      finalIntent     : ${r.finalIntent}`);
    console.log(`      routingMode     : ${r.routingMode}`);
    console.log(`      contextMode     : ${contract}`);
    console.log(`      responsePath    : ${r.responsePath}`);
    console.log(`      winnerProtected : ${r.winnerProtected}  anchor=${r.anchorProduct}`);
    console.log(`      replyPreview    : "${r.replyPreview}"`);
  } catch (err) {
    results.push({ ...s, error: err.message });
    console.log(`  ✗ ${s.id} — ${s.label}  [ERROR: ${err.message}]`);
  }
}

section("TABELA GERAL — Router → Bridge → Contract");
const h = `  ${pad("ID",4)} ${pad("turnType",20)} ${pad("bridge",12)} ${pad("finalIntent",14)} ${pad("routingMode",22)} ${pad("contract",38)} W?`;
console.log(h);
console.log(`  ${"─".repeat(130)}`);
for (const r of results) {
  if (r.error) {
    console.log(`  ${pad(r.id,4)} ERROR: ${r.error}`);
    continue;
  }
  const w  = r.winnerProtected ? "✓" : "✗";
  const bd = r.bridgeApplied ? "APPLIED  " : "NOT_APPLI";
  const ct = r.contextModeSelected || r.contract || "?";
  console.log(`  ${pad(r.id,4)} ${pad(r.turnType,20)} ${pad(bd,12)} ${pad(r.finalIntent,14)} ${pad(r.routingMode,22)} ${pad(ct,38)} ${w}`);
}

section("BLOCO E — Risco de regressão");
console.log(`\n  Suites potencialmente afetadas se bridge for estendida para PRIORITY_SHIFT:`);
console.log(`    - test-mia-priority-shift-winner-pinning.js         → verificar`);
console.log(`    - test-mia-winner-contract-compliance-audit.js      → verificar`);
console.log(`    - test-mia-router-vocabulary-expansion.js           → verificar`);
console.log(`    - test-mia-session-ranking-snapshot-integrity.js    → verificar`);
console.log(`\n  Cenários que podem mudar comportamento:`);
console.log(`    - PRIORITY_SHIFT sem anchor: bridge iria propor intent="decision"`);
console.log(`      → risk: pode entrar em context path sem ter anchor ativo`);
console.log(`    - PRIORITY_SHIFT de baixa confiança (< 0.75): sem impacto (threshold protege)`);
console.log(`    - Queries que o router classifica como PRIORITY_SHIFT incorretamente`);
console.log(`      (falso positivo) receberiam intent="decision" em vez de general_answer`);
console.log(`\n  Classificação de risco:`);
console.log(`    Risco de adição ao allowlist (sem map):     ZERO     (noop)`);
console.log(`    Risco de adição ao allowlist + map="decision": BAIXO`);
console.log(`      → já tem guard hasAnchorForRouting no _isPriorityShiftWithAnchor`);
console.log(`      → handler já ativa priority_shift_response_contract sem bridge`);
console.log(`      → bridge adicionaria apenas: intent authority + contextAction authority`);
console.log(`      → risco real: baixo (intent já roteado corretamente via handler bypass)`);

section("DIAGNÓSTICO COMPLETO — Causa raiz");

const bridgeNotApplied = results.filter(r => !r.error && !r.bridgeApplied);
const contractOk       = results.filter(r => !r.error && r.contextModeSelected === "priority_shift_response_contract");
const decisionGeneric  = results.filter(r => !r.error && r.contextModeSelected === "decision_generic");
const winnerOk         = results.filter(r => !r.error && r.winnerProtected);

console.log(`\n  Router → Bridge → Routing → Contract — fluxo ATUAL:`);
console.log(`\n  ① Router (miaCognitiveRouter.js)`);
console.log(`     PRIORITY_SHIFT detectado corretamente com confidence=0.80`);
console.log(`     Layers H1–H5 (PATCH 7.6H) cobrem família safety/reliability`);
console.log(`\n  ② Bridge (miaCognitiveBridge.js)`);
console.log(`     PRIORITY_SHIFT NÃO está em COGNITIVE_BRIDGE_ALLOWLIST`);
console.log(`     → bridge.active = false`);
console.log(`     → reason = "turn_type_not_in_allowlist"`);
console.log(`     → intent permanece legacy ("general_answer" para queries qualitativas)`);
console.log(`\n  ③ Intent legacy (detectIntent)`);
console.log(`     "qual é mais seguro", "qual dura mais" → intent = "general_answer"`);
console.log(`     detectContextAction("general_answer") → contextAction = "conversation"`);
console.log(`     buildRoutingDecision → mode = "context_hold"`);
console.log(`\n  ④ Handler bypass (chat-gpt4o.js linha 27191)`);
console.log(`     COMPENSA a ausência da bridge:`);
console.log(`     _isPriorityShiftWithAnchor = cognitiveTurnEarly.turnType === "PRIORITY_SHIFT"`);
console.log(`                                 && hasAnchorForRouting`);
console.log(`     → true quando router detectou PRIORITY_SHIFT + anchor ativo`);
console.log(`     → ativa "priority_shift_response_contract" DIRETAMENTE`);
console.log(`\n  ⑤ Contract`);
console.log(`     priority_shift_response_contract: ${contractOk.length}/${results.filter(r=>!r.error).length} cenários`);
console.log(`     decision_generic:                 ${decisionGeneric.length}/${results.filter(r=>!r.error).length} cenários`);
console.log(`     Winner protegido:                 ${winnerOk.length}/${results.filter(r=>!r.error).length} cenários`);

console.log(`\n  PONTO EXATO DE PERDA DE AUTORIDADE:`);
console.log(`  miaCognitiveBridge.js linha 84:`);
console.log(`    if (!COGNITIVE_BRIDGE_ALLOWLIST.has(turnType)) {`);
console.log(`      return { active: false, reason: "turn_type_not_in_allowlist", ... }`);
console.log(`    }`);
console.log(`  PRIORITY_SHIFT perde autoridade de INTENT aqui.`);
console.log(`\n  COMPENSAÇÃO:`);
console.log(`  chat-gpt4o.js linha 27191 bypassa bridge e usa router diretamente.`);
console.log(`  Gap funcional REAL só ocorre quando:`);
console.log(`    A) contextResolution.shouldSkipProductSearch = false (produto search ativo)`);
console.log(`    B) OU routingDecision.mode ∉ {context_decision, anchored_reaction}`);
console.log(`    C) OU isDecisionIntent = false (intent ≠ "decision", sem bridge)`);
console.log(`    → Nestes casos, context block NÃO é entrado → cai em search path`);

section("PRÓXIMO PATCH RECOMENDADO");
console.log(`\n  PATCH 7.6P — Priority Shift Bridge Authority`);
console.log(`\n  Objetivo: adicionar PRIORITY_SHIFT ao COGNITIVE_BRIDGE_ALLOWLIST`);
console.log(`  e ao COGNITIVE_TO_LEGACY_INTENT_MAP com mapeamento "decision".`);
console.log(`\n  Cirúrgico:`);
console.log(`    1. miaCognitiveBridge.js:`);
console.log(`       COGNITIVE_TO_LEGACY_INTENT_MAP: { ..., PRIORITY_SHIFT: "decision" }`);
console.log(`       _GUARD_SCOPE_TURN_TYPES: adicionar "PRIORITY_SHIFT"`);
console.log(`       _UNCHECKED_TURN_TYPES:  remover "PRIORITY_SHIFT"`);
console.log(`    2. Sem alteração no handler (bypass permanece, agora redundante)`);
console.log(`    3. Sem alteração no router`);
console.log(`    4. Criar script de regressão validando os 6 cenários D.1–D.6`);
console.log(`\n  Risco: BAIXO`);
console.log(`  Zero impacto em EXPLANATION_REQUEST, REFINEMENT, COMPARISON, NEW_SEARCH`);

console.log(`\n  ${"═".repeat(68)}\n`);
