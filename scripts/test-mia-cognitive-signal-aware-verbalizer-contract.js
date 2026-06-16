/**
 * PATCH 7.6U-C — Cognitive Signal Aware Verbalizer Contract Audit
 *
 * Usage: node scripts/test-mia-cognitive-signal-aware-verbalizer-contract.js
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
const PRIOR_QUERY = "produto ate 2000";

const GENERIC_RECOMMENDATION_RE = GENERIC_RECOMMENDATION_RES;

const CASES = [
  {
    message: "nao sei se gostei",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
    behaviorPatterns: [
      /\b(entendo|hesit|convenc|incomod|resist|duvida|perfeito|limitacao|limita|gostei)\b/i,
    ],
    forbiddenPatterns: [/^faz sentido achar caro\b/i],
  },
  {
    message: "qual seria seu medo nessa compra",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
    behaviorPatterns: PROJECTIVE_RISK_BEHAVIOR_PATTERNS,
    forbiddenPatterns: PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN,
  },
  {
    message: "o que poderia dar errado",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
    behaviorPatterns: PROJECTIVE_RISK_BEHAVIOR_PATTERNS,
    forbiddenPatterns: PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN,
  },
  {
    message: "e se fosse voce",
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedDetector: "delegationRequest",
    expectedSubtype: "decision_delegation",
    behaviorPatterns: [
      /\b(se fosse eu|se eu fosse|se eu tivesse|tivesse que escolher|eu manteria|eu escolheria|eu ficaria|minha escolha|eu iria|seria o)\b/i,
    ],
    forbiddenPatterns: [],
  },
  {
    message: "nao quero fazer besteira",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "purchase_anxiety",
    behaviorPatterns: [
      /\b(arrepend|besteira|ansied|medo|segur|defens|tranquil|errar|entendo|conscient|besteir)\b/i,
    ],
    forbiddenPatterns: [/^faz sentido achar caro\b/i],
  },
];

function normalize(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(text, patterns) {
  return matchesAnyPattern(text, patterns);
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-c",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runCase(c) {
  const convId = `u-c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const winnerBefore =
    t1.session_context?.lastBestProduct?.product_name ||
    t1.prices?.[0]?.product_name ||
    "";

  const s1 = {
    ...(t1.session_context || {}),
    lastAxis: "equilibrio geral",
    lastMainConsequence: "desempenho solido para uso diario",
    lastTradeoff: "nao e o mais barato da lista",
  };
  const msgs = [
    { role: "user", content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];

  const t2 = await httpPost(c.message, s1, msgs, convId);
  const trace = t2.mia_debug?.pipelineTrace || {};
  const transport = trace.cognitive_signal_transport || {};
  const behaviorInstruction = trace.cognitive_signal_behavior_instruction || "";
  const rd = trace.routingDecision || {};

  const ct = classifyMiaTurn({
    query: c.message,
    originalQuery: c.message,
    resolvedQuery: c.message,
    sessionContext: s1,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const winnerAfter =
    t2.session_context?.lastBestProduct?.product_name ||
    t2.prices?.[0]?.product_name ||
    winnerBefore;

  const reply = t2.reply || "";
  const responsePath = trace.response_path || rd.responsePathHint || rd.mode || "";

  const genericRecommendationRepeated = GENERIC_RECOMMENDATION_RE.test(normalize(reply));
  const behaviorMatchedSignal =
    matchesAny(reply, c.behaviorPatterns) &&
    !c.forbiddenPatterns.some((re) => re.test(normalize(reply)));

  const signalMatch =
    (transport.turnType || ct.turnType) === c.expectedTurnType &&
    (transport.detector || "") === c.expectedDetector &&
    (transport.subtype || "") === c.expectedSubtype;

  const hasBehaviorInstruction = !!behaviorInstruction;

  return {
    message: c.message,
    turnType: transport.turnType || ct.turnType,
    detector: transport.detector || "",
    subtype: transport.subtype || "",
    winnerPreserved: !winnerBefore || !winnerAfter || winnerBefore === winnerAfter,
    anchorPreserved: !!(t2.session_context?.lastBestProduct?.product_name || winnerAfter),
    responsePathPreserved:
      String(responsePath).includes("context_decision") ||
      String(responsePath).includes("cognitive_anchor"),
    genericRecommendationRepeated,
    behaviorMatchedSignal: behaviorMatchedSignal && hasBehaviorInstruction,
    hasBehaviorInstruction,
    signalMatch,
    replyPreview: reply.replace(/\n/g, " ").slice(0, 180),
    replyFull: reply,
  };
}

console.log("\n  PATCH 7.6U-C — Cognitive Signal Aware Verbalizer Contract\n");

const results = [];
let failed = 0;

for (const c of CASES) {
  try {
    const r = await runCase(c);
    results.push(r);

    const ok =
      r.signalMatch &&
      r.winnerPreserved &&
      r.anchorPreserved &&
      r.responsePathPreserved &&
      !r.genericRecommendationRepeated &&
      r.behaviorMatchedSignal &&
      r.hasBehaviorInstruction;

    if (ok) {
      console.log(`  ✓ "${c.message}"`);
    } else {
      failed++;
      console.log(`  ✗ "${c.message}"`);
    }
    console.log(`    ${JSON.stringify({
      message: r.message,
      turnType: r.turnType,
      detector: r.detector,
      subtype: r.subtype,
      winnerPreserved: r.winnerPreserved,
      anchorPreserved: r.anchorPreserved,
      responsePathPreserved: r.responsePathPreserved,
      genericRecommendationRepeated: r.genericRecommendationRepeated,
      behaviorMatchedSignal: r.behaviorMatchedSignal,
      hasBehaviorInstruction: r.hasBehaviorInstruction,
    })}`);
    console.log(`    reply: ${r.replyPreview}\n`);
  } catch (e) {
    failed++;
    console.log(`  ✗ "${c.message}" — ${e.message}\n`);
  }
}

if (results.length >= 3) {
  console.log("  ── Diversidade entre respostas (normalizado) ──\n");
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = normalize(results[i].replyFull);
      const b = normalize(results[j].replyFull);
      const identical = a === b;
      if (identical) {
        failed++;
        console.log(`  ✗ Caso "${results[i].message}" ≡ "${results[j].message}" (resposta idêntica)`);
      }
    }
  }
}

console.log(`\n  Resultado: ${results.length - failed}/${results.length} casos aprovados`);
console.log(`  Falhas: ${failed}\n`);

process.exit(failed > 0 ? 1 : 0);
