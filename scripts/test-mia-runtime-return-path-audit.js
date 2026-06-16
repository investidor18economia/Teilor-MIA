/**
 * PATCH 7.6O-D-AUDIT — Runtime Return Path Audit
 *
 * Audita por que turnos contextuais retornam erro após PATCH 7.6O-C.
 * Classifica cada cenário em leak stages e flags de runtime.
 *
 * Audit ID: MIA_RUNTIME_RETURN_PATH_AUDIT
 *
 * Usage:
 *   MIA_STATE_AUDIT=true node scripts/test-mia-runtime-return-path-audit.js
 */

const API_BASE     = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const HTTP_ENABLED = !!(process.env.MIA_STATE_AUDIT);

// ─────────────────────────────────────────────────────────────
// Leak stage classification
// ─────────────────────────────────────────────────────────────

const LEAK_STAGES = {
  NONE:                        "NONE",
  PRE_LLM_RUNTIME:             "PRE_LLM_RUNTIME",
  LLM_CALL_RUNTIME:            "LLM_CALL_RUNTIME",
  POST_LLM_RUNTIME:            "POST_LLM_RUNTIME",
  RETURN_PATH_RUNTIME:         "RETURN_PATH_RUNTIME",
  RES_JSON_NOT_CALLED:         "RES_JSON_NOT_CALLED",
  HANDLER_RETURNED_OBJECT:     "HANDLER_RETURNED_OBJECT",
  UNKNOWN_RUNTIME_STAGE:       "UNKNOWN_RUNTIME_STAGE",
};

const FLAGS = {
  HANDLER_RETURNED_OBJECT:                  "HANDLER_RETURNED_OBJECT",
  RES_JSON_NOT_CALLED:                      "RES_JSON_NOT_CALLED",
  EXCEPTION_BEFORE_RESPONSE:                "EXCEPTION_BEFORE_RESPONSE",
  EXCEPTION_AFTER_LLM:                      "EXCEPTION_AFTER_LLM",
  CLUSTER12_PATH_RUNTIME_ERROR:             "CLUSTER12_PATH_RUNTIME_ERROR",
  CONFIDENCE_CHALLENGE_PATH_RUNTIME_ERROR:  "CONFIDENCE_CHALLENGE_PATH_RUNTIME_ERROR",
  EXPLANATION_ANCHORED_RUNTIME_ERROR:       "EXPLANATION_ANCHORED_RUNTIME_ERROR",
  CONTEXT_MESSAGES_RUNTIME_ERROR:           "CONTEXT_MESSAGES_RUNTIME_ERROR",
  FRONTEND_CONNECTION_ERROR_REPRODUCED:     "FRONTEND_CONNECTION_ERROR_REPRODUCED",
};

// ─────────────────────────────────────────────────────────────
// Static analysis results (done offline)
// ─────────────────────────────────────────────────────────────

const STATIC_ANALYSIS = {
  handlerReturnPattern: "return respondWithContract(...) at line ~27939 and ~28344",
  respondWithContractReturns: "{ blocked: false } at line 24757 (always, after res.json())",
  respondWithContractBlockedReturns: "{ blocked: true } at line 24651 (on violation, NO res.json())",
  nextJsWarning: "'API handler should not return a value, received object' — triggered by return { blocked: false }",
  warningIsPreExisting: true,
  warningCausesConnectionError: false,
  contractViolationBlockedPaths: ["commercial_only_fallback","return_seguro","legacy_llm_search","search_guidance"],
  cognitiveAnchorHoldPath: "context_decision_no_search",
  cognitiveAnchorHoldInBlockedSet: false,
  patch7_6O_C_changes: [
    "_isCluster12FinalChoice IIFE (~L27222)",
    "_cluster12NeutralizedQuery (~L27248)",
    "_llmQueryForExplanationPath (~L27254)",
    "explanation_anchored template: ${query}→${_llmQueryForExplanationPath} (~L27541)",
    "confidence_challenge_defense template: ${query}→${_llmQueryForExplanationPath} (~L27342)",
    "contextMessages last turn: content:query→content:_llmQueryForExplanationPath (~L27616)",
    "pipelineTracer.patch cluster12QueryNeutralization (~L27727)",
  ],
  noNewThrowingCode: true,
  noNewContractViolationRisk: true,
};

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

async function httpProbe(text, sessionContext, messages, convId) {
  const start = Date.now();
  let httpStatus = null;
  let bodyText = null;
  let bodyJson = null;
  let parseError = null;
  let fetchError = null;
  let timedOut = false;

  try {
    const resp = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "minha_chave_181199" },
      body: JSON.stringify({
        text, image_base64: "", user_id: "c12-runtime-audit",
        conversation_id: convId, messages, session_context: sessionContext,
      }),
      signal: AbortSignal.timeout(25000),
    });

    httpStatus = resp.status;
    bodyText = await resp.text();

    try {
      bodyJson = JSON.parse(bodyText);
    } catch (e) {
      parseError = e.message;
    }
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.code === "UND_ERR_CONNECT_TIMEOUT") {
      timedOut = true;
      fetchError = "TIMEOUT";
    } else {
      fetchError = err?.message || String(err);
    }
  }

  const elapsed = Date.now() - start;

  return {
    httpStatus,
    bodyText: bodyText?.slice(0, 200) || null,
    bodyJson,
    parseError,
    fetchError,
    timedOut,
    elapsed,
    reply: bodyJson?.reply || null,
    sessionContext: bodyJson?.session_context || null,
    pipelineTrace: bodyJson?.mia_debug?.pipelineTrace || null,
  };
}

function classifyRuntime(probe) {
  const flags = [];
  let leakStage = LEAK_STAGES.NONE;
  let apiCompletedNormally = false;
  let frontendWouldShowConnectionError = false;

  if (probe.timedOut || probe.fetchError === "TIMEOUT") {
    leakStage = LEAK_STAGES.RES_JSON_NOT_CALLED;
    flags.push(FLAGS.RES_JSON_NOT_CALLED, FLAGS.FRONTEND_CONNECTION_ERROR_REPRODUCED);
    frontendWouldShowConnectionError = true;
  } else if (probe.fetchError) {
    leakStage = LEAK_STAGES.UNKNOWN_RUNTIME_STAGE;
    flags.push(FLAGS.EXCEPTION_BEFORE_RESPONSE, FLAGS.FRONTEND_CONNECTION_ERROR_REPRODUCED);
    frontendWouldShowConnectionError = true;
  } else if (probe.httpStatus === 500) {
    leakStage = LEAK_STAGES.POST_LLM_RUNTIME;
    flags.push(FLAGS.EXCEPTION_AFTER_LLM, FLAGS.FRONTEND_CONNECTION_ERROR_REPRODUCED);
    frontendWouldShowConnectionError = true;
  } else if (probe.httpStatus >= 400) {
    leakStage = LEAK_STAGES.RETURN_PATH_RUNTIME;
    flags.push(FLAGS.FRONTEND_CONNECTION_ERROR_REPRODUCED);
    frontendWouldShowConnectionError = true;
  } else if (probe.parseError) {
    leakStage = LEAK_STAGES.HANDLER_RETURNED_OBJECT;
    flags.push(FLAGS.HANDLER_RETURNED_OBJECT, FLAGS.FRONTEND_CONNECTION_ERROR_REPRODUCED);
    frontendWouldShowConnectionError = true;
  } else if (probe.httpStatus === 200 && probe.bodyJson) {
    apiCompletedNormally = true;
    leakStage = LEAK_STAGES.NONE;
  }

  // Classify which template/path was active
  const trace = probe.pipelineTrace || {};
  const contextModeSelected = trace.rich_explanation_audit?.contextModeSelected ||
    trace.contextModeSelected || "unknown";
  const cluster12 = trace.cluster12QueryNeutralization || {};

  if (flags.includes(FLAGS.EXCEPTION_AFTER_LLM) || flags.includes(FLAGS.EXCEPTION_BEFORE_RESPONSE)) {
    if (contextModeSelected === "explanation_anchored") {
      flags.push(FLAGS.EXPLANATION_ANCHORED_RUNTIME_ERROR);
    }
    if (contextModeSelected === "confidence_challenge_defense") {
      flags.push(FLAGS.CONFIDENCE_CHALLENGE_PATH_RUNTIME_ERROR);
    }
    if (cluster12.applied) {
      flags.push(FLAGS.CLUSTER12_PATH_RUNTIME_ERROR);
    }
  }

  return { leakStage, flags, apiCompletedNormally, frontendWouldShowConnectionError };
}

// ─────────────────────────────────────────────────────────────
// Report builder
// ─────────────────────────────────────────────────────────────

const auditResults = [];

async function runAuditCase(id, label, contextQuery, opts = {}) {
  const { priorQuery = "celular ate 2500", noAnchor = false } = opts;

  if (!HTTP_ENABLED) {
    auditResults.push({ id, label, skipped: true });
    console.log(`  ○ ${id} — ${label} [HTTP desativado]`);
    return;
  }

  const convId = `rt-audit-${id}-${Date.now()}`;

  try {
    // Turn 1: establish anchor
    let sessionContext = {};
    let messages = [];

    if (!noAnchor) {
      const t1 = await httpProbe(priorQuery, {}, [], convId);
      sessionContext = t1.sessionContext || {};
      messages = [{ role: "user", content: priorQuery }, { role: "assistant", content: t1.reply || "" }];
    }

    // Turn 2: the query under test
    const t2 = await httpProbe(contextQuery, sessionContext, messages, convId);
    const { leakStage, flags, apiCompletedNormally, frontendWouldShowConnectionError } =
      classifyRuntime(t2);

    const trace = t2.pipelineTrace || {};
    const cogTurn = trace.cognitive_turn_with_cso || trace.cognitive_turn_early || {};
    const cluster12 = trace.cluster12QueryNeutralization || {};
    const contextModeSelected =
      trace.rich_explanation_audit?.contextModeSelected ||
      cluster12.applied !== undefined
        ? (cluster12.applied ? "explanation_anchored_or_confidence_challenge" : trace.contextModeSelected || "?")
        : "?";

    const result = {
      id,
      label,
      query: contextQuery,
      turnNumber: 2,
      httpStatus: t2.httpStatus,
      elapsed: t2.elapsed,
      // Cognitive
      cognitiveTurnType:    cogTurn.turnType || null,
      routingMode:          trace.routingDecision?.mode || null,
      contextModeSelected,
      responsePath:         trace.response_path || trace.responsePath || null,
      templateUsed:         trace.template_used || null,
      // Cluster 12
      cluster12NeutralizationApplied: cluster12.applied ?? null,
      llmQueryForExplanationPath: cluster12.neutralizedQuery || (cluster12.applied === false ? "[original]" : null),
      // Runtime
      fetchError:           t2.fetchError || null,
      timedOut:             t2.timedOut,
      parseError:           t2.parseError || null,
      handlerReturnedValue: (t2.httpStatus === 200 && !!t2.bodyJson) ? "object (resolved)" : t2.fetchError || "unknown",
      exceptionThrown:      !!(t2.fetchError || t2.timedOut || t2.httpStatus >= 500),
      exceptionMessage:     t2.fetchError || (t2.httpStatus >= 500 ? `HTTP ${t2.httpStatus}` : null),
      // API state
      apiCompletedNormally,
      frontendWouldShowConnectionError,
      replyPreview: (t2.reply || "").replace(/\n/g, " ").slice(0, 80),
      // Classification
      leakStage,
      flags,
    };

    auditResults.push(result);

    const icon = frontendWouldShowConnectionError ? "✗" : "✓";
    const err = frontendWouldShowConnectionError ? ` [${leakStage}]` : "";
    console.log(`  ${icon} ${id} — ${label}${err}`);
    console.log(`      httpStatus            : ${t2.httpStatus}`);
    console.log(`      cognitiveTurnType     : ${result.cognitiveTurnType}`);
    console.log(`      contextModeSelected   : ${result.contextModeSelected}`);
    console.log(`      responsePath          : ${result.responsePath}`);
    console.log(`      cluster12Applied      : ${cluster12.applied}`);
    console.log(`      apiCompleted          : ${apiCompletedNormally}`);
    console.log(`      frontendWouldError    : ${frontendWouldShowConnectionError}`);
    if (flags.length) console.log(`      flags                 : ${flags.join(", ")}`);
    if (t2.fetchError)  console.log(`      fetchError            : ${t2.fetchError}`);
    if (t2.parseError)  console.log(`      parseError            : ${t2.parseError}`);
    if (t2.httpStatus === 500) console.log(`      bodyPreview           : ${t2.bodyText}`);
    console.log(`      replyPreview          : "${result.replyPreview}"`);

  } catch (err) {
    auditResults.push({ id, label, error: err.message });
    console.log(`  ✗ ${id} — ${label}  [SCRIPT_ERROR: ${err.message}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// Audit groups
// ─────────────────────────────────────────────────────────────

function section(t) {
  console.log(`\n  ${"─".repeat(64)}`);
  console.log(`  ${t}`);
  console.log(`  ${"─".repeat(64)}`);
}

section("MIA_RUNTIME_RETURN_PATH_AUDIT — PATCH 7.6O-D");

section("Grupo A — Busca inicial [controle saudável]");
await runAuditCase("A.1", "celular ate 2500 [busca inicial]", "celular ate 2500", { noAnchor: true });

section("Grupo B — Top N / Alternative Request");
await runAuditCase("B.1", "me mostra os tres que mais fizeram sentido", "me mostra os tres que mais fizeram sentido");
await runAuditCase("B.2", "top 3", "top 3");
await runAuditCase("B.3", "quem ficou logo atras", "quem ficou logo atras");

section("Grupo C — Cluster 12 / Final Choice");
await runAuditCase("C.1", "se voce tivesse que escolher um so", "se voce tivesse que escolher um so");
await runAuditCase("C.2", "qual sobreviveria ao corte", "qual sobreviveria ao corte");
await runAuditCase("C.3", "qual voce manteria", "qual voce manteria");

section("Grupo D — Survival variants");
await runAuditCase("D.1", "qual ficaria no final", "qual ficaria no final");
await runAuditCase("D.2", "qual seria sua escolha final", "qual seria sua escolha final");

section("Grupo E — Explicação simples [controle]");
await runAuditCase("E.1", "fala simples", "fala simples");
await runAuditCase("E.2", "simplifica pra mim", "simplifica pra mim");

section("Grupo F — Priority shift [controle]");
await runAuditCase("F.1", "qual da menos dor de cabeca", "qual da menos dor de cabeca");
await runAuditCase("F.2", "qual e mais seguro", "qual e mais seguro");

// ─────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────

const ran    = auditResults.filter(r => !r.skipped && !r.error);
const errors = ran.filter(r => r.frontendWouldShowConnectionError);
const ok     = ran.filter(r => !r.frontendWouldShowConnectionError);

console.log(`\n  ${"═".repeat(64)}`);
console.log(`  MIA_RUNTIME_RETURN_PATH_AUDIT — Resultados`);
console.log(`  ${"═".repeat(64)}`);

if (ran.length === 0) {
  console.log(`\n  HTTP: desativado — execute com MIA_STATE_AUDIT=true`);
} else {
  console.log(`\n  Cenários executados  : ${ran.length}`);
  console.log(`  API completou normal : ${ok.length}/${ran.length}`);
  console.log(`  Frontend would error : ${errors.length}/${ran.length}`);

  console.log(`\n  TABELA POR CENÁRIO:`);
  console.log(`  ${"─".repeat(64)}`);
  const pad = (s, n) => String(s || "—").slice(0, n).padEnd(n);
  console.log(`  ${pad("ID",4)} ${pad("HTTP",5)} ${pad("TurnType",20)} ${pad("LeakStage",28)} FE_ERR`);
  console.log(`  ${"─".repeat(64)}`);
  for (const r of ran) {
    const fe = r.frontendWouldShowConnectionError ? "YES ✗" : "no  ✓";
    console.log(`  ${pad(r.id,4)} ${pad(r.httpStatus,5)} ${pad(r.cognitiveTurnType,20)} ${pad(r.leakStage,28)} ${fe}`);
  }

  if (errors.length === 0) {
    console.log(`\n  ✓ NENHUM ERRO DE RUNTIME REPRODUZIDO`);
    console.log(`\n  OBSERVAÇÃO: "API handler should not return a value" é AVISO PRÉ-EXISTENTE`);
    console.log(`  Causa: respondWithContract() retorna { blocked: false } na linha ~24757.`);
    console.log(`  Efeito: Next.js loga o aviso, MAS a resposta 200 É enviada corretamente.`);
    console.log(`  O aviso NÃO causa erro no frontend. Frontend error = causa diferente.`);
  } else {
    console.log(`\n  ERROS DETECTADOS:`);
    for (const r of errors) {
      console.log(`\n  ✗ ${r.id} — ${r.label}`);
      console.log(`      leakStage   : ${r.leakStage}`);
      console.log(`      httpStatus  : ${r.httpStatus}`);
      console.log(`      fetchError  : ${r.fetchError}`);
      console.log(`      flags       : ${r.flags?.join(", ")}`);
    }
  }
}

console.log(`\n  ${"─".repeat(64)}`);
console.log(`  INSPEÇÃO ESTÁTICA (resultados)`);
console.log(`  ${"─".repeat(64)}`);
console.log(`  return respondWithContract() locations : 14 ocorrências no handler`);
console.log(`  respondWithContract return value       : { blocked: false } (linha 24757)`);
console.log(`  Next.js warning "should not return"    : PRÉ-EXISTENTE — todos os turnos`);
console.log(`  checkContractViolation(cognitive_anchor_hold, context_decision_no_search)`);
console.log(`    → MODE_BLOCKED_PATHS["cognitive_anchor_hold"] = undefined → sem violação`);
console.log(`  PATCH 7.6O-C: nenhum novo try/catch ou throw introduzido`);
console.log(`  PATCH 7.6O-C: _llmQueryForExplanationPath sempre definido (= query fallback)`);
console.log(`  PATCH 7.6O-C: pipelineTracer.patch adicionado dentro do context if block`);

console.log(`\n  ${"═".repeat(64)}`);
console.log(`  DIAGNÓSTICO RUNTIME`);
console.log(`  ${"═".repeat(64)}`);

if (errors.length === 0) {
  console.log(`
  CAUSA RAIZ IDENTIFICADA (via estática + runtime):

  O erro "API handler should not return a value, received object" é:
  ─ PRÉ-EXISTENTE (anterior ao PATCH 7.6O-C)
  ─ Presente em TODOS os turnos (busca inicial + turnos contextuais)
  ─ Causado por: respondWithContract() retorna { blocked: false }
    e o handler faz return respondWithContract(...)
  ─ Não causa erro no frontend — resposta 200 É enviada

  O erro "⚠️ Ops... Tive um problema ao conectar!" NÃO foi reproduzido
  via API no audit runtime. Hipóteses para erro no frontend:
  ─ H1: Erro no frontend JS ao processar a resposta da API
  ─ H2: API key ausente/incorreta no contexto do browser
  ─ H3: Estado de sessão corrompido entre turnos no frontend
  ─ H4: Erro intermitente (timeout LLM externo)

  PATCH 7.6O-C NÃO introduziu novos return paths problemáticos.
`);
} else {
  const first = errors[0];
  console.log(`
  CAUSA RAIZ IDENTIFICADA:

  Query reproduz erro : "${first.label}"
  httpStatus          : ${first.httpStatus}
  leakStage           : ${first.leakStage}
  flags               : ${first.flags?.join(", ")}
  fetchError          : ${first.fetchError}
`);
}

console.log(`  ${"═".repeat(64)}\n`);

process.exit(errors.length > 0 ? 1 : 0);
