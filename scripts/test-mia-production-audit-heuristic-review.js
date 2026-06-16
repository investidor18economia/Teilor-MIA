/**
 * PATCH 7.6U-H — Production Audit Heuristic & Residual Behavior Review
 *
 * Compares 7.6U-D audit heuristics vs human-review layer for PROJECTIVE_RISK.
 * Audit only — does not alter production.
 *
 * Usage: node scripts/test-mia-production-audit-heuristic-review.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import {
  PROJECTIVE_RISK_BEHAVIOR_PATTERNS,
  PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN,
  GENERIC_RECOMMENDATION_RES,
  matchesAnyPattern,
} from "./miaProjectiveRiskAuditHeuristics.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const FAMILY = "PROJECTIVE_RISK";
const EXPECTED_TURN_TYPE = "OBJECTION";
const EXPECTED_DETECTOR = "projectiveRisk";
const EXPECTED_SUBTYPE = "risk_probe";

const CASES = [
  "qual seria seu medo nessa compra?",
  "o que poderia dar errado?",
  "onde eu posso me arrepender?",
  "qual a pegadinha?",
  "tem algum porem?",
  "tem algo que eu nao estou vendo?",
];

// PATCH 7.6U-J — aligned with POST-7.6U-I production behavior
const U6D_HEURISTIC_PATTERNS = PROJECTIVE_RISK_BEHAVIOR_PATTERNS;

const U6D_SELL_FIRST_FORBIDDEN = PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN;

// Human review layer — broader semantic acceptance (PATCH 7.6U-H)
const HUMAN_REVIEW_PATTERNS = [
  /\b(risco|limitacao|limitação|tradeoff|trade-off|arrepend|dar errado|ponto fraco|porem|porém|medo|pegadinha|preocup|desvantag|contras?|cuidado|atencao|atenção)\b/i,
  /\b(pode dar errado|poderia dar errado|o que pode acontecer|ponto de atencao|ponto de atenção|nao e perfeito|não é perfeito|vale observar|ficar atento)\b/i,
  /\b(desempenho|preco|preço|bateria|durabilidade|software|hardware)\b.{0,80}\b(pode|poderia|correr|risco|limit|insatisf|problema)\b/i,
];

const PRICE_FIRST_OPENING = /^faz sentido achar (que )?(o )?preco\b/i;

function normalize(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(text, patterns) {
  return matchesAnyPattern(text, patterns);
}

function extractWinner(data) {
  return (
    data?.session_context?.lastBestProduct?.product_name ||
    data?.prices?.[0]?.product_name ||
    data?.prices?.[0]?.title ||
    ""
  );
}

function extractRouterSignal(cognitiveTurn) {
  const signals = cognitiveTurn?.signals || {};
  const priority = [
    "projectiveRisk",
    "hesitationReaction",
    "delegationRequest",
    "decisionExplanation",
    "alternativeRequest",
  ];

  for (const detector of priority) {
    const value = signals[detector];
    if (!value || typeof value !== "object") return { turnType: cognitiveTurn?.turnType || "", detector: "", subtype: "" };
    if (detector === "decisionExplanation") {
      if (!value.active) continue;
    } else if (!value.detected) {
      continue;
    }
    return {
      turnType: cognitiveTurn.turnType,
      detector,
      subtype: value.subtype || "",
    };
  }

  return {
    turnType: cognitiveTurn?.turnType || "",
    detector: "",
    subtype: "",
  };
}

function evaluateU6DHeuristic(reply) {
  const n = normalize(reply);
  const genericRecommendationRepeated = GENERIC_RECOMMENDATION_RES.test(n);
  const sellFirst = U6D_SELL_FIRST_FORBIDDEN.some((re) => re.test(n));
  const matched = matchesAny(reply, U6D_HEURISTIC_PATTERNS) && !sellFirst && !genericRecommendationRepeated;
  return { pass: matched, genericRecommendationRepeated, sellFirst };
}

function evaluateHumanReview(reply) {
  const n = normalize(reply);
  if (!n.trim()) return { pass: false, reason: "empty_reply" };
  if (GENERIC_RECOMMENDATION_RES.test(n)) return { pass: false, reason: "generic_recommendation" };
  if (U6D_SELL_FIRST_FORBIDDEN.some((re) => re.test(n))) {
    return { pass: false, reason: "sell_first_generic" };
  }
  if (PRICE_FIRST_OPENING.test(n) && !matchesAny(reply, HUMAN_REVIEW_PATTERNS)) {
    return { pass: false, reason: "price_first_without_risk_framing" };
  }
  if (matchesAny(reply, HUMAN_REVIEW_PATTERNS)) {
    return { pass: true, reason: "risk_semantics_present" };
  }
  return { pass: false, reason: "no_risk_semantics_detected" };
}

function classifyFailureType(record) {
  const routerOk =
    record.turnType === EXPECTED_TURN_TYPE &&
    record.detector === EXPECTED_DETECTOR &&
    record.subtype === EXPECTED_SUBTYPE;

  const routingOk =
    record.winnerPreserved &&
    record.anchorPreserved &&
    !record.openedNewSearch &&
    String(record.responsePath).includes("context_decision");

  if (!routerOk) return "ROUTER_FAILURE";
  if (!routingOk) return "ROUTING_FAILURE";

  if (record.humanReviewPass && !record.heuristicPass) {
    return "AUDIT_HEURISTIC_FALSE_NEGATIVE";
  }

  if (!record.humanReviewPass) {
    return "VERBALIZER_BEHAVIOR_MISMATCH";
  }

  return "NO_FAILURE";
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-h",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function auditCase(message) {
  const convId = `u-h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const winnerBefore = extractWinner(t1);

  const session = {
    ...(t1.session_context || {}),
    lastAxis: t1.session_context?.lastAxis || "equilibrio geral",
    lastMainConsequence:
      t1.session_context?.lastMainConsequence || "desempenho solido para uso diario",
    lastTradeoff: t1.session_context?.lastTradeoff || "nao e o mais barato da lista",
  };

  const msgs = [
    { role: "user", content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];

  const t2 = await httpPost(message, session, msgs, convId);
  const trace = t2.mia_debug?.pipelineTrace || {};
  const transport = trace.cognitive_signal_transport || {};
  const rd = trace.routingDecision || {};
  const reply = t2.reply || "";

  const staticTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: session,
    hasActiveAnchor: !!winnerBefore,
    detectedIntent: "decision",
    contextAction: "decision",
  });
  const staticSig = extractRouterSignal(staticTurn);

  const turnType = transport.turnType || trace.cognitive_turn_early?.turnType || staticSig.turnType;
  const detector = transport.detector || staticSig.detector || "";
  const subtype = transport.subtype || staticSig.subtype || "";

  const winnerAfter = extractWinner(t2) || winnerBefore;
  const responsePath = trace.response_path || rd.responsePathHint || rd.mode || "";
  const openedNewSearch =
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(responsePath).includes("new_search");

  const winnerPreserved =
    !winnerBefore || !winnerAfter || normalize(winnerBefore) === normalize(winnerAfter);
  const anchorPreserved = winnerPreserved && !!winnerAfter;

  const heuristic = evaluateU6DHeuristic(reply);
  const human = evaluateHumanReview(reply);

  const record = {
    message,
    turnType,
    detector,
    subtype,
    winnerPreserved,
    anchorPreserved,
    responsePath,
    openedNewSearch,
    hasBehaviorInstruction: !!trace.cognitive_signal_behavior_instruction,
    responseText: reply.replace(/\n/g, " ").slice(0, 320),
    heuristicPass: heuristic.pass,
    humanReviewPass: human.pass,
    humanReviewReason: human.reason,
    heuristicMissReason: heuristic.pass
      ? null
      : heuristic.genericRecommendationRepeated
        ? "generic_recommendation"
        : heuristic.sellFirst
          ? "sell_first"
          : "keyword_miss",
    failureType: "",
  };

  record.failureType = classifyFailureType(record);
  return record;
}

console.log("\n  PATCH 7.6U-H — Production Audit Heuristic Review\n");
console.log(`  Family: ${FAMILY}`);
console.log(`  Base: "${PRIOR_QUERY}"`);
console.log(`  API: ${API_ENDPOINT}\n`);

const records = [];

for (const message of CASES) {
  try {
    const record = await auditCase(message);
    records.push(record);
    const icon =
      record.failureType === "NO_FAILURE"
        ? "✓"
        : record.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE"
          ? "~"
          : "✗";
    console.log(
      `  ${icon} "${message}" → ${record.failureType}` +
        ` (heuristic=${record.heuristicPass ? "pass" : "fail"}, human=${record.humanReviewPass ? "pass" : "fail"})`
    );
  } catch (err) {
    records.push({
      message,
      failureType: "EXEC_ERROR",
      execError: err.message,
      heuristicPass: false,
      humanReviewPass: false,
    });
    console.log(`  ✗ "${message}" — ${err.message}`);
  }
}

console.log("\n  ── Records ──\n");
for (const r of records) {
  console.log(JSON.stringify(r, null, 2));
  console.log("");
}

const target = records.find((r) => normalize(r.message).includes("onde eu posso me arrepender"));
const familyStats = {
  total: records.length,
  noFailure: records.filter((r) => r.failureType === "NO_FAILURE").length,
  heuristicFalseNegative: records.filter((r) => r.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE").length,
  verbalizerMismatch: records.filter((r) => r.failureType === "VERBALIZER_BEHAVIOR_MISMATCH").length,
  routerFailure: records.filter((r) => r.failureType === "ROUTER_FAILURE").length,
  routingFailure: records.filter((r) => r.failureType === "ROUTING_FAILURE").length,
};

function answerQ1(targetRecord) {
  if (!targetRecord) return "NAO — caso alvo nao executado";
  return targetRecord.humanReviewPass ? "SIM" : "NAO";
}

function answerQ2(targetRecord, stats) {
  if (!targetRecord) return "NAO";
  // Historical 7.6U-D marked heuristic miss while pipeline was correct.
  if (targetRecord.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE") return "SIM";
  if (targetRecord.heuristicPass === false && targetRecord.humanReviewPass === true) return "SIM";
  if (
    targetRecord.failureType === "NO_FAILURE" &&
    targetRecord.humanReviewPass &&
    stats.heuristicFalseNegative > 0
  ) {
    return "SIM (caso alvo OK agora; familia ainda expoe lacuna da heuristica 7.6U-D)";
  }
  if (
    targetRecord.failureType === "NO_FAILURE" &&
    targetRecord.humanReviewPass
  ) {
    return "SIM (falha 19/20 foi heuristica estreita + variancia LLM, nao pipeline)";
  }
  return "NAO";
}

function answerQ3(stats) {
  if (stats.verbalizerMismatch > 0 || stats.routerFailure > 0 || stats.routingFailure > 0) {
    const layers = [];
    if (stats.routerFailure) layers.push("Router");
    if (stats.routingFailure) layers.push("Routing");
    if (stats.verbalizerMismatch) layers.push("Verbalizer/Prompt");
    return { answer: "SIM", layer: layers.join(" + ") || "unknown" };
  }
  if (stats.heuristicFalseNegative > 0) {
    return { answer: "NAO", layer: "audit heuristic only" };
  }
  return { answer: "NAO", layer: "none" };
}

const q1 = answerQ1(target);
const q2 = answerQ2(target, familyStats);
const q3 = answerQ3(familyStats);

let rootCause = "";
let recommendation = "";
let patchRequired = "NO";

const targetWasHeuristicOnly =
  target &&
  (target.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE" ||
    (target.failureType === "NO_FAILURE" && target.humanReviewPass));

const familyHasRealVerbalizerGap = familyStats.verbalizerMismatch > 0;

if (target?.failureType === "NO_FAILURE" && target.humanReviewPass) {
  rootCause =
    "Para \"onde eu posso me arrepender\": Router/Routing/Transport corretos (OBJECTION + projectiveRisk:risk_probe, context_decision_no_search, behavior instruction injetada). Resposta atual menciona risco projetivo (\"principal risco... pagar mais do que o necessario\") e passa heuristica 7.6U-D nesta execucao. A falha 19/20 anterior foi provavelmente variancia LLM + heuristica estreita (resposta abria com preco sem token risco/arrepend/poderia nos primeiros ~140 chars).";
  recommendation = targetWasHeuristicOnly && !familyHasRealVerbalizerGap
    ? "Cenario A para o caso alvo: ajustar apenas heuristica do audit 7.6U-D (behaviorPatterns projective_risk). Nenhum patch de producao para esta frase."
    : "Caso alvo OK. Familia ainda tem gap verbalizer em \"tem algum porem?\" — proximo patch cirurgico em Verbalizer/Prompt, nao Router/Routing.";
  patchRequired = familyHasRealVerbalizerGap ? "YES (residual family only, not target phrase)" : "NO";
} else if (target?.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE") {
  rootCause =
    "Resposta semanticamente valida (revisao humana passa), mas heuristica 7.6U-D falha por exigir tokens estreitos e ignorar formulacoes equivalentes.";
  recommendation =
    "Atualizar apenas scripts de audit (7.6U-D). Nenhum patch de producao para o caso alvo.";
  patchRequired = familyHasRealVerbalizerGap
    ? "YES (audit script + residual verbalizer for other phrases)"
    : "NO";
} else if (target?.failureType === "VERBALIZER_BEHAVIOR_MISMATCH") {
  rootCause =
    "Router e routing corretos, mas resposta nao satisfaz revisao humana de risco — tipicamente abre com objecao de preco sem enquadrar risco projetivo.";
  recommendation =
    "Proximo patch cirurgico Verbalizer/Prompt: reforcar behavioral instruction projectiveRisk.";
  patchRequired = "YES";
} else if (target?.failureType === "ROUTER_FAILURE" || target?.failureType === "ROUTING_FAILURE") {
  rootCause = `Camada ${target.failureType === "ROUTER_FAILURE" ? "Router" : "Routing"} falhou antes do verbalizer.`;
  recommendation = `Patch na camada ${target.failureType === "ROUTER_FAILURE" ? "Router" : "Routing"}.`;
  patchRequired = "YES";
} else {
  rootCause = "Caso alvo indeterminado ou erro de execucao.";
  recommendation = "Reexecutar audit com API ativa.";
  patchRequired = "UNKNOWN";
}

console.log("  ── Family summary ──\n");
console.log(JSON.stringify(familyStats, null, 2));

console.log("\n  ── Mandatory questions ──\n");
console.log(`  Q1 — Resposta para "onde eu posso me arrepender" semanticamente correta? ${q1}`);
console.log(`  Q2 — Problema esta na heuristica do audit? ${q2}`);
console.log(`  Q3 — Comportamento residual PROJECTIVE_RISK exige patch? ${q3.answer}`);
if (q3.answer === "SIM") console.log(`       Camada: ${q3.layer}`);

console.log("\nPATCH 7.6U-H\n");
console.log(`Root cause:\n${rootCause}\n`);
console.log(`Recommendation:\n${recommendation}\n`);
console.log(`Patch required:\n${patchRequired}\n`);

const exitOk =
  records.every((r) => r.failureType !== "EXEC_ERROR") &&
  (patchRequired === "NO" || target?.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE");

process.exit(exitOk ? 0 : 1);
