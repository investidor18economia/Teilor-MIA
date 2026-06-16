/**
 * PATCH 7.6U-D — Cognitive Verbalizer Production Behavior Audit
 *
 * Audita generalização do 7.6U-C para variações humanas reais.
 * Somente leitura — não altera produção.
 *
 * Usage: node scripts/test-mia-cognitive-verbalizer-production-behavior-audit.js
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

const FAMILIES = [
  {
    id: "resistance",
    label: "resistance",
    expectedDetector: "hesitationReaction",
    expectedSubtypes: ["not_convinced", "hesitation", "not_sure", "indecision"],
    messages: [
      "nao sei se gostei",
      "nao me convenceu",
      "hmm nao curti muito",
      "acho que nao gostei",
      "nao sei se iria nesse",
    ],
    behaviorPatterns: [
      /\b(entendo|faz sentido|hesit|convenc|incomod|resist|duvida|perfeito|gostei|curti|nesse)\b/i,
    ],
    sellFirstForbidden: [/^faz sentido achar caro\b/i, /^eu iria no\b/i],
  },
  {
    id: "projective_risk",
    label: "projective_risk",
    expectedDetector: "projectiveRisk",
    expectedSubtypes: ["risk_probe"],
    messages: [
      "qual seria seu medo nessa compra",
      "o que poderia dar errado",
      "qual o maior risco",
      "onde eu posso me arrepender",
      "tem alguma pegadinha",
    ],
    behaviorPatterns: PROJECTIVE_RISK_BEHAVIOR_PATTERNS,
    sellFirstForbidden: PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN,
  },
  {
    id: "purchase_anxiety",
    label: "purchase_anxiety",
    expectedDetector: "hesitationReaction",
    expectedSubtypes: ["purchase_anxiety", "decision_paralysis"],
    messages: [
      "nao quero fazer besteira",
      "tenho medo de me arrepender",
      "nao quero jogar dinheiro fora",
      "to com receio",
      "e se eu me arrepender",
    ],
    behaviorPatterns: [
      /\b(medo|arrepend|besteira|jogar dinheiro|receio|segur|defens|tranquil|errar|entendo|conscient|chance)\b/i,
    ],
    sellFirstForbidden: [/^faz sentido achar caro\b/i],
  },
  {
    id: "delegation",
    label: "delegation",
    expectedDetector: "delegationRequest",
    expectedSubtypes: ["decision_delegation"],
    messages: [
      "e se fosse voce",
      "qual seria sua escolha",
      "o que voce faria",
      "escolhe um pra mim",
      "vai em qual",
    ],
    behaviorPatterns: [
      /\b(se fosse eu|se eu fosse|se eu tivesse|tivesse que escolher|eu escolheria|eu manteria|minha escolha|eu iria|seria o|escolheria|iria nele|recomendaria)\b/i,
    ],
    sellFirstForbidden: [],
  },
];

const ALL_CASES = FAMILIES.flatMap((f) =>
  f.messages.map((message) => ({ family: f, message }))
);

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

function inferFailureCause(record) {
  const causes = [];
  if (!record.winnerBefore && !record.winnerAfter) causes.push("anchor/winner");
  if (record.winnerBefore && record.winnerAfter && record.winnerBefore !== record.winnerAfter) {
    causes.push("anchor/winner");
  }
  if (record.openedNewSearch) causes.push("routing");
  if (
    record.expectedDetector &&
    record.detector &&
    record.detector !== record.expectedDetector
  ) {
    causes.push("classificação");
  }
  if (
    record.detector === record.expectedDetector &&
    !record.hasBehaviorInstruction &&
    record.responsePathPreserved
  ) {
    causes.push("transporte de sinal");
  }
  if (
    record.genericRecommendationRepeated ||
    (record.detector === record.expectedDetector && !record.behaviorMatchedFamily)
  ) {
    causes.push("verbalizer behavior");
  }
  return causes.length ? causes.join(" + ") : "verbalizer behavior";
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-d",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runCase(family, message) {
  const convId = `u-d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const winnerBefore = extractWinner(t1);

  const sessionAfterSearch = {
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

  const t2 = await httpPost(message, sessionAfterSearch, msgs, convId);
  const trace = t2.mia_debug?.pipelineTrace || {};
  const transport = trace.cognitive_signal_transport || {};
  const rd = trace.routingDecision || {};
  const reply = t2.reply || "";

  const winnerAfter = extractWinner(t2) || winnerBefore;
  const responsePath = trace.response_path || rd.responsePathHint || rd.mode || "";
  const openedNewSearch =
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(responsePath).includes("new_search");

  const staticTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: sessionAfterSearch,
    hasActiveAnchor: !!winnerBefore,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const turnType = transport.turnType || trace.cognitive_turn_early?.turnType || staticTurn.turnType;
  const detector = transport.detector || "";
  const subtype = transport.subtype || "";

  const genericRecommendationRepeated = GENERIC_RECOMMENDATION_RES.test(normalize(reply));
  const sellFirst = family.sellFirstForbidden.some((re) => re.test(normalize(reply)));

  const behaviorMatchedFamily =
    matchesAny(reply, family.behaviorPatterns) &&
    !sellFirst &&
    !genericRecommendationRepeated;

  const winnerPreserved =
    !winnerBefore || !winnerAfter || normalize(winnerBefore) === normalize(winnerAfter);
  const anchorPreserved = winnerPreserved && !!winnerAfter;
  const hasBehaviorInstruction = !!trace.cognitive_signal_behavior_instruction;

  const passed =
    winnerPreserved &&
    anchorPreserved &&
    !openedNewSearch &&
    !genericRecommendationRepeated &&
    behaviorMatchedFamily;

  const notes = [];
  if (!winnerPreserved) notes.push("winner changed");
  if (openedNewSearch) notes.push("new_search opened");
  if (genericRecommendationRepeated) notes.push("generic recommendation pattern");
  if (sellFirst) notes.push("sell-first opening");
  if (!behaviorMatchedFamily) notes.push("family behavior heuristic miss");
  if (detector !== family.expectedDetector) {
    notes.push(`detector=${detector || "none"} expected=${family.expectedDetector}`);
  }

  return {
    family: family.label,
    message,
    turnType,
    detector,
    subtype,
    winnerBefore,
    winnerAfter,
    anchorPreserved,
    responsePath,
    openedNewSearch,
    genericRecommendationRepeated,
    behaviorMatchedFamily,
    hasBehaviorInstruction,
    expectedDetector: family.expectedDetector,
    responsePathPreserved:
      String(responsePath).includes("context_decision") ||
      String(responsePath).includes("cognitive_anchor") ||
      String(responsePath).includes("anchored"),
    passed,
    notes: notes.join("; "),
    replyPreview: reply.replace(/\n/g, " ").slice(0, 140),
    failureCause: passed ? null : inferFailureCause({
      winnerBefore,
      winnerAfter,
      openedNewSearch,
      expectedDetector: family.expectedDetector,
      detector,
      hasBehaviorInstruction,
      responsePathPreserved: true,
      genericRecommendationRepeated,
      behaviorMatchedFamily,
    }),
  };
}

console.log("\n  PATCH 7.6U-D — Production Behavior Audit\n");
console.log(`  Base query: "${PRIOR_QUERY}"`);
console.log(`  API: ${API_ENDPOINT}\n`);

const results = [];
let execErrors = 0;

for (const { family, message } of ALL_CASES) {
  try {
    const r = await runCase(family, message);
    results.push(r);
    console.log(`  ${r.passed ? "✓" : "✗"} [${r.family}] "${message}"`);
  } catch (e) {
    execErrors++;
    results.push({
      family: family.label,
      message,
      passed: false,
      execError: e.message,
      failureCause: "exec error",
      notes: e.message,
    });
    console.log(`  ✗ [${family.label}] "${message}" — ${e.message}`);
  }
}

const executed = results.length;
const passedCount = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed);
const winnerOk = results.filter((r) => r.anchorPreserved !== false && r.winnerBefore !== undefined).length;
const behaviorOk = results.filter((r) => r.behaviorMatchedFamily).length;
const genericOk = results.filter((r) => !r.genericRecommendationRepeated).length;
const noSearchOk = results.filter((r) => !r.openedNewSearch).length;

const byFamily = {};
for (const f of FAMILIES) {
  const fr = results.filter((r) => r.family === f.label);
  byFamily[f.label] = {
    total: fr.length,
    passed: fr.filter((r) => r.passed).length,
    behaviorMatched: fr.filter((r) => r.behaviorMatchedFamily).length,
  };
}

const approval =
  execErrors === 0 &&
  executed === 20 &&
  winnerOk >= 20 &&
  noSearchOk >= 20 &&
  behaviorOk >= 18 &&
  genericOk >= 20;

console.log("\n  ── Summary ──\n");
console.log("  PATCH 7.6U-D — Production Behavior Audit\n");
console.log(`  Total cases: ${executed}`);
console.log(`  Passed: ${passedCount}`);
console.log(`  Failed: ${failed.length + execErrors}\n`);
console.log("  By family:");
for (const [label, stats] of Object.entries(byFamily)) {
  console.log(
    `    ${label}: ${stats.passed}/${stats.total} passed, ${stats.behaviorMatched}/${stats.total} behavior matched`
  );
}
console.log("\n  Criteria check:");
console.log(`    20/20 execute: ${executed === 20 && execErrors === 0 ? "✓" : "✗"}`);
console.log(`    winner preserved: ${winnerOk}/20 ${winnerOk >= 20 ? "✓" : "✗"}`);
console.log(`    no new_search: ${noSearchOk}/20 ${noSearchOk >= 20 ? "✓" : "✗"}`);
console.log(`    behavior >= 18/20: ${behaviorOk}/20 ${behaviorOk >= 18 ? "✓" : "✗"}`);
console.log(`    no generic pattern: ${genericOk}/20 ${genericOk >= 20 ? "✓" : "✗"}`);
console.log(`\n  Audit ${approval ? "PASSED" : "FAILED"}\n`);

if (failed.length) {
  console.log("  Failures:");
  for (const r of failed) {
    console.log(`    - ${r.family}`);
    console.log(`      message: ${r.message}`);
    console.log(`      reason: ${r.notes || r.execError || "unknown"}`);
    console.log(`      observed: ${r.replyPreview || r.execError || "—"}`);
    console.log(`      probable cause: ${r.failureCause || "—"}`);
  }
}

console.log("\n  ── Sample records ──\n");
for (const r of results.slice(0, 3)) {
  if (r.execError) continue;
  console.log(
    JSON.stringify(
      {
        family: r.family,
        message: r.message,
        turnType: r.turnType,
        detector: r.detector,
        subtype: r.subtype,
        winnerBefore: r.winnerBefore,
        winnerAfter: r.winnerAfter,
        anchorPreserved: r.anchorPreserved,
        responsePath: r.responsePath,
        openedNewSearch: r.openedNewSearch,
        genericRecommendationRepeated: r.genericRecommendationRepeated,
        behaviorMatchedFamily: r.behaviorMatchedFamily,
        notes: r.notes,
      },
      null,
      2
    )
  );
  console.log("");
}

process.exit(approval ? 0 : 1);
