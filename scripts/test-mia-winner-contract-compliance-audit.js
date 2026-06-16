/**
 * PATCH 7.6N-B — MIA Winner Contract Compliance Audit
 *
 * DIAGNÓSTICO PURO — não altera comportamento de produção.
 *
 * Para cada cenário multi-turn, rastreia 8 estágios:
 *
 *   STAGE 1  AUTHORIZED_WINNER         — winner definido pela arquitetura
 *   STAGE 2  AUTHORIZED_RANK           — rank do winner no snapshot
 *   STAGE 3  TEMPLATE_SELECTED         — template de prompt selecionado
 *   STAGE 4  WINNER_PINNED_IN_PROMPT   — o prompt pina o winner explicitamente?
 *   STAGE 5  RAW_LLM_REPLY_WINNER      — winner mencionado na resposta (best effort)
 *   STAGE 6  DIFFERENT_PRODUCT_IN_REPLY — produto não autorizado promovido?
 *   STAGE 7  FINAL_REPLY_HAS_WINNER    — winner presente na resposta final?
 *   STAGE 8  FINAL_REPLY_GENERIC       — resposta perdeu contexto e ficou genérica?
 *
 * Flags possíveis:
 *   PROMPT_MISSING_WINNER
 *   PROMPT_MISSING_RANK
 *   LLM_IGNORED_AUTHORIZED_WINNER
 *   LLM_INVENTED_PRODUCT
 *   FINAL_REPLY_LOST_AUTHORIZED_WINNER
 *   FINAL_REPLY_BECAME_GENERIC
 *   WINNER_VERBALIZATION_DRIFT
 *   RANKING_VERBALIZATION_DRIFT
 *
 * Leak stages:
 *   PROMPT_STAGE          — prompt não forneceu winner/rank ao LLM
 *   RAW_LLM_STAGE         — prompt correto, LLM desobedeceu
 *   POST_PROCESSING_STAGE — resposta ok, correção pós-processamento adulterou
 *   FINAL_REPLY_STAGE     — reply final divergiu sem causa clara
 *
 * Note on observability:
 *   Este script acessa apenas a resposta HTTP final (reply + session_context).
 *   STAGE 5 (raw LLM reply) não é diretamente visível — é inferido comparando
 *   com o comportamento esperado do template (STAGE 3/4). Quando o template
 *   pina o winner E a resposta final não menciona → RAW_LLM_STAGE.
 *   Quando o template não pina → PROMPT_STAGE é a causa provável.
 *
 * Usage:
 *   MIA_STATE_AUDIT=true node scripts/test-mia-winner-contract-compliance-audit.js
 *   node scripts/test-mia-winner-contract-compliance-audit.js  (HTTP desativado)
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

// ─────────────────────────────────────────────────────────────
// Constantes — replicam a lógica do handler sem alterar produção
// ─────────────────────────────────────────────────────────────

const TEMPLATE_PINS_WINNER = {
  analysis:                              false,
  confidence_challenge_defense:          true,
  objection_response_contract:           true,
  refinement_followup_response_contract: true,
  priority_shift_response_contract:      true,
  explanation_anchored:                  true,
  decision_generic:                      false,
};

function resolveExpectedTemplate(turnType, hasAnchor, richExpActivated, contextAction, decisionExpSubtype) {
  const isConfidenceChallenge  = decisionExpSubtype === "confidence_challenge" && richExpActivated;
  const isObjectionWithAnchor  = turnType === "OBJECTION" && hasAnchor;
  const isAlternativeRequest   = turnType === "ALTERNATIVE_REQUEST" && hasAnchor;
  const isRefinementWithAnchor = (turnType === "REFINEMENT" || isAlternativeRequest) && hasAnchor;
  const isPriorityShiftWithAnchor = turnType === "PRIORITY_SHIFT" && hasAnchor;

  if (contextAction === "analysis")   return "analysis";
  if (isConfidenceChallenge)          return "confidence_challenge_defense";
  if (isObjectionWithAnchor)          return "objection_response_contract";
  if (isRefinementWithAnchor)         return "refinement_followup_response_contract";
  if (isPriorityShiftWithAnchor)      return "priority_shift_response_contract";
  if (richExpActivated)               return "explanation_anchored";
  return "decision_generic";
}

// ─────────────────────────────────────────────────────────────
// Text analysis helpers
// ─────────────────────────────────────────────────────────────

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

function extractNamesFromText(text = "", products = []) {
  return products
    .filter(p => p?.product_name && nameInText(text, p.product_name))
    .map(p => p.product_name);
}

const GENERIC_FALLBACK_PATTERNS = [
  /posso te ajudar com compras/i,
  /me fala o produto que voc/i,
  /o que voc[eê] quer em um celular/i,
  /qual [eé] o produto que voc/i,
  /c[aâ]mera boa, bateria duradoura ou algo mais/i,
  /para te ajudar melhor, preciso saber/i,
  /n[aã]o tenho informa[cç][oõ]es suficientes/i,
];

function isGenericFallback(reply = "") {
  return GENERIC_FALLBACK_PATTERNS.some(re => re.test(reply));
}

const RECOMMENDATION_PATTERNS = [
  /eu\s+iria\s+no\s+([^\n.,!?]{3,80})/i,
  /eu\s+compraria\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /recomendo\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /eu\s+recomendaria\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /a\s+melhor\s+op[cç][aã]o\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /(?:o\s+)?celular\s+que\s+d[aá]\s+menos\s+dor\s+de\s+cabe[cç]a\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /(?:o\s+)?mais\s+(?:seguro|confi[aá]vel|indicado|recomendado)\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /(?:o\s+)?que\s+(?:te\s+)?deixaria\s+mais\s+tranquilo\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
];

function extractVerbalizedRecommendation(reply = "") {
  for (const re of RECOMMENDATION_PATTERNS) {
    const m = reply.match(re);
    if (m?.[1]) return m[1].trim().replace(/[.,!?]+$/, "").trim();
  }
  return null;
}

function isDifferentProduct(verbalized = "", authorizedWinner = "") {
  if (!verbalized || !authorizedWinner) return false;
  return !nameInText(verbalized, authorizedWinner) &&
         !nameInText(authorizedWinner, verbalized);
}

// ─────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────

const F = {
  PROMPT_MISSING_WINNER:              "PROMPT_MISSING_WINNER",
  PROMPT_MISSING_RANK:                "PROMPT_MISSING_RANK",
  LLM_IGNORED_AUTHORIZED_WINNER:      "LLM_IGNORED_AUTHORIZED_WINNER",
  LLM_INVENTED_PRODUCT:               "LLM_INVENTED_PRODUCT",
  FINAL_REPLY_LOST_AUTHORIZED_WINNER: "FINAL_REPLY_LOST_AUTHORIZED_WINNER",
  FINAL_REPLY_BECAME_GENERIC:         "FINAL_REPLY_BECAME_GENERIC",
  WINNER_VERBALIZATION_DRIFT:         "WINNER_VERBALIZATION_DRIFT",
  RANKING_VERBALIZATION_DRIFT:        "RANKING_VERBALIZATION_DRIFT",
};

// ─────────────────────────────────────────────────────────────
// Full compliance audit record
// ─────────────────────────────────────────────────────────────

function buildComplianceRecord({
  scenarioId, scenarioLabel, query,
  authorizedWinner, authorizedRank, allProducts,
  turnType, templateSelected,
  finalReply,
}) {
  const s1_authorizedWinner  = authorizedWinner || null;
  const s2_authorizedRank    = authorizedRank ?? null;
  const s3_templateSelected  = templateSelected || "unknown";
  const s4_winnerPinned      = TEMPLATE_PINS_WINNER[s3_templateSelected] ?? false;

  // STAGE 5 — raw LLM reply is not directly observable via HTTP.
  // We observe the final reply and infer the raw:
  //   - If template pins winner AND final lacks it → raw likely also lacked it (LLM_STAGE)
  //   - If template doesn't pin winner → raw may have freely chosen (PROMPT_STAGE)
  // We flag this as inferred rather than observed.
  const s7_finalHasWinner      = nameInText(finalReply, s1_authorizedWinner);
  const s8_finalBecameGeneric  = isGenericFallback(finalReply);

  const verbalizedRec          = extractVerbalizedRecommendation(finalReply);
  const mentionedProducts      = extractNamesFromText(finalReply, allProducts);
  const hasDifferentProduct    = verbalizedRec
    ? isDifferentProduct(verbalizedRec, s1_authorizedWinner)
    : false;

  const s5_rawMentionsWinner   = s7_finalHasWinner; // best effort — same source
  const s6_differentProductRec = hasDifferentProduct;

  // Flags
  const flags = [];
  if (!s4_winnerPinned)              flags.push(F.PROMPT_MISSING_WINNER);
  if (s2_authorizedRank > 1 && !s4_winnerPinned) flags.push(F.PROMPT_MISSING_RANK);
  if (!s7_finalHasWinner && s4_winnerPinned) flags.push(F.LLM_IGNORED_AUTHORIZED_WINNER);
  if (!s7_finalHasWinner)            flags.push(F.FINAL_REPLY_LOST_AUTHORIZED_WINNER);
  if (s8_finalBecameGeneric)         flags.push(F.FINAL_REPLY_BECAME_GENERIC);
  if (s6_differentProductRec)        flags.push(F.WINNER_VERBALIZATION_DRIFT);
  if (s6_differentProductRec && verbalizedRec &&
      !allProducts.some(p => nameInText(verbalizedRec, p.product_name))) {
    flags.push(F.LLM_INVENTED_PRODUCT);
  }

  // Leak stage
  let leakStage = "NONE";
  if (s8_finalBecameGeneric) {
    leakStage = "FINAL_REPLY_STAGE";
  } else if (!s7_finalHasWinner && !s4_winnerPinned) {
    leakStage = "PROMPT_STAGE";
  } else if (!s7_finalHasWinner && s4_winnerPinned) {
    leakStage = "RAW_LLM_STAGE";
  } else if (s6_differentProductRec) {
    leakStage = "RAW_LLM_STAGE";
  }

  // Overall compliance
  const compliant = s7_finalHasWinner && !s8_finalBecameGeneric && !s6_differentProductRec;

  return {
    scenarioId, scenarioLabel, query,
    stage1_authorizedWinner:   s1_authorizedWinner,
    stage2_authorizedRank:     s2_authorizedRank,
    stage3_templateSelected:   s3_templateSelected,
    stage4_winnerPinned:       s4_winnerPinned,
    stage5_rawMentionsWinner:  s5_rawMentionsWinner,
    stage6_differentProduct:   s6_differentProductRec,
    stage7_finalHasWinner:     s7_finalHasWinner,
    stage8_becameGeneric:      s8_finalBecameGeneric,
    verbalizedRecommendation:  verbalizedRec,
    mentionedProducts,
    finalReplyPreview:         (finalReply || "").slice(0, 180),
    flags, leakStage, compliant,
  };
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
      text: query, image_base64: "", user_id: "compliance-audit-766nb",
      conversation_id: convId, messages, session_context,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runTurns(turns) {
  const convId = `compliance-${Date.now()}`;
  let sc = {}, msgs = [];
  const results = [];
  for (const { query } of turns) {
    const data = await httpTurn(query, sc, msgs, convId);
    msgs = [...msgs, { role: "user", content: query }, { role: "assistant", content: data.reply || "" }];
    sc = data.session_context || {};
    results.push({ query, data, sc });
  }
  return results;
}

function classifyTurn(query, session, hasAnchor) {
  return classifyMiaTurn({
    query, originalQuery: query, resolvedQuery: query,
    sessionContext: session,
    hasActiveAnchor: hasAnchor ?? !!(session?.lastBestProduct?.product_name),
  });
}

// ─────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────

const auditRecords = [];
let scenarioCount = 0, compliantCount = 0;

function section(title) {
  console.log(`\n${"─".repeat(66)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(66));
}

function printStages(r) {
  console.log(`      STAGE 1  authorized winner : ${r.stage1_authorizedWinner || "null"}`);
  console.log(`      STAGE 2  authorized rank   : ${r.stage2_authorizedRank ?? "unknown"}`);
  console.log(`      STAGE 3  template selected : ${r.stage3_templateSelected}`);
  console.log(`      STAGE 4  winner pinned     : ${r.stage4_winnerPinned ? "YES" : "NO"}`);
  console.log(`      STAGE 5  raw→winner (infer): ${r.stage5_rawMentionsWinner ? "YES" : "NO"}`);
  console.log(`      STAGE 6  diff product rec  : ${r.stage6_differentProduct ? "YES" + (r.verbalizedRecommendation ? ` ("${r.verbalizedRecommendation.slice(0,40)}")` : "") : "NO"}`);
  console.log(`      STAGE 7  final has winner  : ${r.stage7_finalHasWinner ? "YES" : "NO"}`);
  console.log(`      STAGE 8  became generic    : ${r.stage8_becameGeneric ? "YES" : "NO"}`);
  console.log(`      LEAK     stage             : ${r.leakStage}`);
  console.log(`      FLAGS    ${r.flags.length ? r.flags.join(", ") : "(none)"}`);
  console.log(`      REPLY    "${r.finalReplyPreview.replace(/\n/g, " ").slice(0, 120)}"`);
  console.log(`      RESULT   ${r.compliant ? "✓ COMPLIANT" : "✗ VIOLATION"}`);
}

async function auditScenario(scenarioId, scenarioLabel, turns, contextTurnIdx) {
  scenarioCount++;
  if (!HTTP_ENABLED) {
    console.log(`  ○ ${scenarioId} — ${scenarioLabel} [HTTP — skipped]`);
    return;
  }

  try {
    const results = await runTurns(turns);
    const turn1     = results[0];
    const ctxTurn   = results[contextTurnIdx];
    const lastTurn  = results[results.length - 1];

    const authorizedWinner = turn1.sc?.lastBestProduct?.product_name || null;
    const allProducts      = turn1.sc?.lastProducts || [];
    const snapshot         = turn1.sc?.lastRankingSnapshot || [];
    const authorizedRank   = snapshot.find(s => s.product_name === authorizedWinner)?.rank ?? 1;

    const session      = ctxTurn.sc;
    const hasAnchor    = !!(session?.lastBestProduct?.product_name);
    const cognitive    = classifyTurn(ctxTurn.query, session, hasAnchor);

    // Infer routing mode from session's lastInteractionType (approximate)
    const richExpActivated = session?.lastInteractionType === "cognitive_anchor_hold";
    const contextAction    = session?.lastInteractionType === "analysis" ? "analysis" : "context_hold";

    const templateSelected = resolveExpectedTemplate(
      cognitive.turnType, hasAnchor, richExpActivated, contextAction, null
    );

    const record = buildComplianceRecord({
      scenarioId, scenarioLabel,
      query: ctxTurn.query,
      authorizedWinner,
      authorizedRank,
      allProducts: allProducts.length ? allProducts : snapshot,
      turnType: cognitive.turnType,
      templateSelected,
      finalReply: lastTurn.data.reply || "",
    });

    auditRecords.push(record);
    if (record.compliant) compliantCount++;

    const icon = record.compliant ? "✓" : "✗";
    console.log(`  ${icon} ${scenarioId} — ${scenarioLabel}`);
    printStages(record);

  } catch (err) {
    console.log(`  ✗ ${scenarioId} — ${scenarioLabel}`);
    console.log(`      HTTP ERROR: ${err.message}`);
    auditRecords.push({
      scenarioId, scenarioLabel, error: err.message,
      compliant: false, leakStage: "HTTP_ERROR", flags: [],
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — PRIORITY_SHIFT
// ─────────────────────────────────────────────────────────────
section("Grupo A — PRIORITY_SHIFT");

await auditScenario("A1", "qual dá menos dor de cabeça? → fala simples", [
  { query: "celular ate 2500" },
  { query: "qual da menos dor de cabeca" },
  { query: "fala simples" },
], 1);   // audit contextual turn

await auditScenario("A2", "qual é mais seguro?", [
  { query: "celular ate 2500" },
  { query: "qual e mais seguro" },
], 1);

await auditScenario("A3", "qual envelhece melhor?", [
  { query: "celular ate 2500" },
  { query: "qual envelhece melhor" },
], 1);

// ─────────────────────────────────────────────────────────────
// GRUPO B — ALTERNATIVE_REQUEST
// ─────────────────────────────────────────────────────────────
section("Grupo B — ALTERNATIVE_REQUEST");

await auditScenario("B1", "quem ficou logo atrás?", [
  { query: "celular ate 2500" },
  { query: "quem ficou logo atras" },
], 1);

await auditScenario("B2", "e o terceiro?", [
  { query: "celular ate 2500" },
  { query: "e o terceiro" },
], 1);

await auditScenario("B3", "me mostra os três que mais fizeram sentido", [
  { query: "celular ate 2500" },
  { query: "me mostra os tres que mais fizeram sentido" },
], 1);

// ─────────────────────────────────────────────────────────────
// GRUPO C — OBJECTION
// ─────────────────────────────────────────────────────────────
section("Grupo C — OBJECTION");

await auditScenario("C1", "não tô sentindo confiança", [
  { query: "celular ate 2500" },
  { query: "nao to sentindo confianca" },
], 1);

await auditScenario("C2", "algo me incomoda", [
  { query: "celular ate 2500" },
  { query: "algo me incomoda" },
], 1);

await auditScenario("C3", "não queria fazer besteira", [
  { query: "celular ate 2500" },
  { query: "nao queria fazer besteira" },
], 1);

// ─────────────────────────────────────────────────────────────
// GRUPO D — EXPLANATION_REQUEST
// ─────────────────────────────────────────────────────────────
section("Grupo D — EXPLANATION_REQUEST");

await auditScenario("D1", "fala simples", [
  { query: "celular ate 2500" },
  { query: "fala simples" },
], 1);

await auditScenario("D2", "simplifica pra mim", [
  { query: "celular ate 2500" },
  { query: "simplifica pra mim" },
], 1);

await auditScenario("D3", "se você tivesse que escolher um só", [
  { query: "celular ate 2500" },
  { query: "se voce tivesse que escolher um so" },
], 1);

// ─────────────────────────────────────────────────────────────
// RELATÓRIO CONSOLIDADO
// ─────────────────────────────────────────────────────────────

if (HTTP_ENABLED) {
  const records = auditRecords.filter(r => !r.error);
  const violated = records.filter(r => !r.compliant);
  const allFlags  = records.flatMap(r => r.flags);
  const flagCount = {};
  allFlags.forEach(f => { flagCount[f] = (flagCount[f] || 0) + 1; });

  const leakStageCounts = {};
  records.forEach(r => {
    leakStageCounts[r.leakStage] = (leakStageCounts[r.leakStage] || 0) + 1;
  });

  console.log(`\n${"═".repeat(66)}`);
  console.log(`  PATCH 7.6N-B — Winner Contract Compliance Audit`);
  console.log(`${"═".repeat(66)}`);
  console.log(`  Cenários executados : ${scenarioCount}`);
  console.log(`  Compliant           : ${compliantCount}`);
  console.log(`  Violations          : ${scenarioCount - compliantCount}`);

  // Full compliance table
  console.log(`\n  ┌────┬────────────────────────────┬──────────┬────────────┬────────┬──────────────────────┐`);
  console.log(`  │ ID │ Cenário                    │ Winner   │ Template   │ Pinned │ Leak Stage           │`);
  console.log(`  ├────┼────────────────────────────┼──────────┼────────────┼────────┼──────────────────────┤`);
  for (const r of records) {
    const id    = r.scenarioId.padEnd(2);
    const label = r.scenarioLabel.slice(0, 26).padEnd(26);
    const win   = (r.stage1_authorizedWinner || "?").slice(0, 8).padEnd(8);
    const tpl   = (r.stage3_templateSelected || "?").replace("_response_contract","").replace("decision_","dec_").slice(0, 10).padEnd(10);
    const pin   = r.stage4_winnerPinned ? "YES   " : "NO    ";
    const leak  = (r.leakStage || "NONE").slice(0, 20).padEnd(20);
    const ok    = r.compliant ? "✓" : "✗";
    console.log(`  │${ok}${id}│ ${label} │ ${win} │ ${tpl} │ ${pin} │ ${leak} │`);
  }
  console.log(`  └────┴────────────────────────────┴──────────┴────────────┴────────┴──────────────────────┘`);

  // Stage-by-stage table
  console.log(`\n  STAGES POR CENÁRIO:`);
  console.log(`  ${"─".repeat(62)}`);
  for (const r of records) {
    const stages = [
      r.stage4_winnerPinned ? "S4:PIN ✓" : "S4:PIN ✗",
      r.stage7_finalHasWinner ? "S7:WIN ✓" : "S7:WIN ✗",
      r.stage8_becameGeneric ? "S8:GEN ✗" : "S8:GEN ✓",
      r.stage6_differentProduct ? "S6:DIFF ✗" : "S6:DIFF ✓",
    ].join("  ");
    console.log(`  ${r.scenarioId.padEnd(4)} ${r.scenarioLabel.slice(0,28).padEnd(28)} ${stages}  [${r.leakStage}]`);
  }

  // Flag frequency
  if (Object.keys(flagCount).length) {
    console.log(`\n  FLAGS DETECTADAS (frequência):`);
    Object.entries(flagCount)
      .sort(([,a],[,b]) => b - a)
      .forEach(([f, n]) => console.log(`    [${n}x] ${f}`));
  }

  // Leak stage distribution
  console.log(`\n  MAPA DE VAZAMENTOS:`);
  Object.entries(leakStageCounts)
    .sort(([,a],[,b]) => b - a)
    .forEach(([stage, n]) => {
      const pct = ((n / records.length) * 100).toFixed(0);
      const affected = records.filter(r => r.leakStage === stage).map(r => r.scenarioId).join(", ");
      console.log(`    ${stage.padEnd(26)} ${n}/${records.length} (${pct}%)  →  ${affected}`);
    });

  // Violations detail
  if (violated.length > 0) {
    console.log(`\n  VIOLAÇÕES DETALHADAS:`);
    for (const r of violated) {
      console.log(`\n  ─── ${r.scenarioId}: ${r.scenarioLabel} ───`);
      console.log(`    winner autorizado : ${r.stage1_authorizedWinner || "null"}`);
      console.log(`    template          : ${r.stage3_templateSelected}`);
      console.log(`    pinado?           : ${r.stage4_winnerPinned ? "YES" : "NO"}`);
      console.log(`    winner na reply?  : ${r.stage7_finalHasWinner ? "YES" : "NO"}`);
      console.log(`    genérico?         : ${r.stage8_becameGeneric ? "YES" : "NO"}`);
      console.log(`    produto diferente?: ${r.stage6_differentProduct ? "YES" : "NO"}`);
      if (r.verbalizedRecommendation) console.log(`    verbalizado rec   : "${r.verbalizedRecommendation}"`);
      console.log(`    leak stage        : ${r.leakStage}`);
      console.log(`    flags             : ${r.flags.join(", ") || "none"}`);
      console.log(`    reply preview     : "${r.finalReplyPreview.replace(/\n/g, " ").slice(0, 150)}"`);
    }
  }

  // Consolidated root cause
  console.log(`\n  CAUSA RAIZ CONSOLIDADA:`);
  const promptStage = leakStageCounts["PROMPT_STAGE"] || 0;
  const llmStage    = leakStageCounts["RAW_LLM_STAGE"] || 0;
  const finalStage  = leakStageCounts["FINAL_REPLY_STAGE"] || 0;
  const total       = records.length;

  if (promptStage >= llmStage && promptStage > 0) {
    console.log(`    PRIMARY: PROMPT_STAGE — ${promptStage}/${total} cenários não tiveram winner pinado no prompt.`);
    console.log(`    Templates sem pinagem: decision_generic é usado quando o router não ativa um contrato específico.`);
  }
  if (llmStage > 0) {
    console.log(`    SECONDARY: RAW_LLM_STAGE — ${llmStage}/${total} cenários: template pinou o winner mas LLM desobedeceu.`);
    console.log(`    Isso indica não-compliance do LLM com as REGRAS ABSOLUTAS do contrato.`);
  }
  if (finalStage > 0) {
    console.log(`    TERTIARY: FINAL_REPLY_STAGE — ${finalStage}/${total} cenários: resposta ficou genérica (contexto perdido).`);
  }
  if (promptStage === 0 && llmStage === 0 && finalStage === 0) {
    console.log(`    Nenhum vazamento confirmado nesta execução. Todos os cenários retornaram winner correto.`);
  }

  // Probabilidade por causa
  console.log(`\n  PROBABILIDADE DE CADA CAUSA (nesta execução):`);
  const causes = [
    ["PROMPT_STAGE (template não pina winner)", promptStage / total],
    ["RAW_LLM_STAGE (LLM desobedece contrato)", llmStage / total],
    ["FINAL_REPLY_STAGE (resposta genérica)", finalStage / total],
    ["NONE (compliant)", compliantCount / total],
  ];
  causes.sort(([,a],[,b]) => b - a).forEach(([label, prob]) => {
    const pct = (prob * 100).toFixed(0);
    const bar = "█".repeat(Math.round(prob * 20));
    console.log(`    ${label.padEnd(44)} ${bar.padEnd(20)} ${pct}%`);
  });

} else {
  console.log(`\n${"═".repeat(66)}`);
  console.log(`  PATCH 7.6N-B — Winner Contract Compliance Audit`);
  console.log(`${"═".repeat(66)}`);
  console.log(`\n  ⚠  Testes HTTP desativados.`);
  console.log(`     Ative com: MIA_STATE_AUDIT=true node scripts/test-mia-winner-contract-compliance-audit.js`);
  console.log(`     (O servidor deve estar rodando em ${API_BASE})`);
}

console.log(`\n${"═".repeat(66)}\n`);
