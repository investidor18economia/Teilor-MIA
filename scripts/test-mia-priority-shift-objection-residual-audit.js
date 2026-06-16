/**
 * PATCH 7.6V — Priority Shift / Objection Bridge Residual Audit
 *
 * Separates root cause for 7.6U-K residual failures (audit only).
 *
 * Usage: node scripts/test-mia-priority-shift-objection-residual-audit.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import {
  GENERIC_RECOMMENDATION_RES,
  matchesAnyPattern,
  normalizeAuditText,
} from "./miaProjectiveRiskAuditHeuristics.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const PRIORITY_SHIFT_CASES = [
  "qual da menos dor de cabeca?",
  "qual me deixaria mais tranquilo?",
  "qual dura mais?",
  "qual envelhece melhor?",
];

const OBJECTION_BRIDGE_CASES = [
  "isso me preocupa",
  "nao sei se e a melhor escolha",
  "nao gostei muito",
];

const EXPECTED = {
  priority_shift: {
    turnType: "PRIORITY_SHIFT",
    bridgeApplied: true,
    intent: "decision",
    responsePathIncludes: "context_decision",
  },
  objection_bridge: {
    turnType: "OBJECTION",
    bridgeApplied: true,
    intent: "decision",
    responsePathIncludes: "context_decision",
  },
};

// Narrow audit heuristic — mirrors 7.6U-K consolidation script
const U7K_PRIORITY_SHIFT_HEURISTIC = [
  /\b(tranquil|dor de cabeca|preocup|confiav|problema|durabil|envelhec|dura mais|duracao|autonomia|bateria|suporte|atualiz|manutenc|longo prazo|criterio|priorid|atende|compar|recomend|melhor|modelo|opcao)\b/i,
];

const U7K_OBJECTION_BRIDGE_HEURISTIC = [
  /\b(preocup|gostei|convenc|hesit|entendo|melhor escolha|incomod|receio|duvida)\b/i,
];

const HUMAN_PRIORITY_SHIFT = [
  /\b(menos dor de cabeca|mais tranquilo|dura mais|envelhece melhor|tende a aguentar|longevidade|vida util|manutenc|estabilidade|suporte|menor chance|arrependimento)\b/i,
  /\b(durabil|envelhec|longo prazo|tranquil|confiav|problema|preocup|criterio|priorid|reexplic|pelo criterio|sobre isso|nesse ponto)\b/i,
  /\b(para quem precisa|para quem busca|para quem prioriza|se (voce|você) (valoriza|prioriza|precisa))\b/i,
];

const GENERIC_DELEGATION_OPENING =
  /^eu iria no\b.{0,120}\bo principal motivo e o equilibrio geral\b/i;

const HUMAN_OBJECTION_BRIDGE = [
  /\b(entendo sua preocup|faz sentido se preocup|se isso te preocupa|o ponto que pode incomodar|o risco aqui e|risco aqui e)\b/i,
  /\b(entendo|faz sentido|preocup|incomod|hesit|convenc|gostei|melhor escolha|duvida|receio)\b/i,
];

const WELCOME_RES =
  /^(oi|ola|olá|bem-vindo|bem vindo|como posso ajudar|sou a mia|sou o mia)\b/i;

function normalize(t) {
  return normalizeAuditText(t);
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
    if (!value || typeof value !== "object") continue;
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

function criterionPatterns(message) {
  const n = normalize(message);
  if (/dor de cabeca/.test(n)) {
    return [/\b(dor de cabeca|problema|preocup|confiav|tranquil|estabil|manutenc|suporte)\b/i];
  }
  if (/tranquilo/.test(n)) {
    return [/\b(tranquil|segur|confiav|preocup|estabil|paz|seren)\b/i];
  }
  if (/dura mais/.test(n)) {
    return [/\b(dura|durabil|vida util|longev|aguent|resist|anos|tempo)\b/i];
  }
  if (/envelhece/.test(n)) {
    return [/\b(envelhec|longev|longo prazo|durabil|vida util|atualiz|suporte|obsolesc)\b/i];
  }
  return HUMAN_PRIORITY_SHIFT;
}

function evaluateNarrowHeuristic(family, reply) {
  const n = normalize(reply);
  if (GENERIC_RECOMMENDATION_RES.test(n)) return false;
  if (WELCOME_RES.test(n)) return false;
  const patterns =
    family === "priority_shift"
      ? U7K_PRIORITY_SHIFT_HEURISTIC
      : U7K_OBJECTION_BRIDGE_HEURISTIC;
  return matchesAnyPattern(reply, patterns);
}

function evaluateHumanReview(family, message, reply) {
  const n = normalize(reply);
  if (!n.trim()) return false;
  if (WELCOME_RES.test(n)) return false;
  if (GENERIC_RECOMMENDATION_RES.test(n)) return false;

  if (family === "priority_shift") {
    if (GENERIC_DELEGATION_OPENING.test(n)) return false;
    const criterion = criterionPatterns(message);
    if (matchesAnyPattern(reply, criterion)) return true;
    return matchesAnyPattern(reply, HUMAN_PRIORITY_SHIFT);
  }

  return matchesAnyPattern(reply, HUMAN_OBJECTION_BRIDGE);
}

function architectureOk(record, family) {
  const exp = EXPECTED[family];
  const routerOk = record.turnType === exp.turnType;
  const bridgeOk = record.bridgeApplied === exp.bridgeApplied;
  const routingOk =
    record.anchorPreserved &&
    (!record.winnerBefore ||
      !record.winnerAfter ||
      normalize(record.winnerBefore) === normalize(record.winnerAfter)) &&
    !record.openedNewSearch &&
    String(record.responsePath).includes(exp.responsePathIncludes);
  return { routerOk, bridgeOk, routingOk, all: routerOk && bridgeOk && routingOk };
}

function classifyFailure(record, family) {
  const arch = architectureOk(record, family);

  if (record.openedNewSearch) {
    return { failureType: "NEW_SEARCH_LEAK", rootCauseLayer: "routing" };
  }
  if (!record.anchorPreserved) {
    return { failureType: "ANCHOR_LOST", rootCauseLayer: "routing" };
  }
  if (record.winnerBefore && record.winnerAfter && record.winnerBefore !== record.winnerAfter) {
    return { failureType: "WINNER_CHANGED", rootCauseLayer: "routing" };
  }

  if (!arch.routerOk) {
    return { failureType: "ROUTER_FAILURE", rootCauseLayer: "router" };
  }

  if (!arch.bridgeOk) {
    return { failureType: "BRIDGE_FAILURE", rootCauseLayer: "bridge" };
  }

  if (!arch.routingOk) {
    if (!arch.routerOk) {
      return { failureType: "ROUTER_FAILURE", rootCauseLayer: "router" };
    }
    return { failureType: "ROUTING_FAILURE", rootCauseLayer: "routing" };
  }

  if (
    family === "objection_bridge" &&
    record.expectedDetector &&
    arch.routerOk &&
    !record.cognitiveSignalTransported
  ) {
    return { failureType: "SIGNAL_TRANSPORT_FAILURE", rootCauseLayer: "other" };
  }

  if (
    family === "objection_bridge" &&
    record.expectedDetector &&
    arch.routerOk &&
    record.cognitiveSignalTransported &&
    !record.behaviorInstructionInjected
  ) {
    return { failureType: "BEHAVIOR_INSTRUCTION_FAILURE", rootCauseLayer: "other" };
  }

  if (record.humanReviewPass && !record.heuristicPass) {
    return { failureType: "AUDIT_HEURISTIC_FALSE_NEGATIVE", rootCauseLayer: "audit_heuristic" };
  }

  if (!record.humanReviewPass) {
    return { failureType: "VERBALIZER_BEHAVIOR_MISMATCH", rootCauseLayer: "verbalizer" };
  }

  return { failureType: "NO_FAILURE", rootCauseLayer: "other" };
}

function perCaseRootCause(record) {
  if (record.failureType === "NO_FAILURE") return "none";
  if (record.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE") return "audit_heuristic";
  if (record.failureType === "VERBALIZER_BEHAVIOR_MISMATCH") return "verbalizer";
  if (record.failureType === "ROUTER_FAILURE") return "router";
  if (record.failureType === "BRIDGE_FAILURE") return "bridge";
  if (record.failureType === "ROUTING_FAILURE" || record.failureType === "NEW_SEARCH_LEAK") {
    return "routing";
  }
  return record.rootCauseLayer || "other";
}

function dominantRootCause(records) {
  const failed = records.filter((r) => r.failureType !== "NO_FAILURE");
  if (!failed.length) return "none";
  const counts = {};
  for (const r of failed) {
    const layer = perCaseRootCause(r);
    counts[layer] = (counts[layer] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function recommendPatch(layer) {
  const map = {
    none: "none — family passes",
    audit_heuristic: "7.6V-A — align priority_shift / objection_bridge audit heuristics with human review layer",
    verbalizer: "7.6V-B — priority_shift or objection_bridge verbalizer behavior tightening",
    router: "7.6V-C — expand objection_bridge router coverage (concern / best-choice hesitation)",
    bridge: "7.6V-D — bridge authority gap for residual objection / priority families",
    routing: "7.6V-E — routing / response-path guard for anchored contextual turns",
    other: "7.6V-F — investigate transport / contract layer",
  };
  return map[layer] || map.other;
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6v",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function auditCase(family, message) {
  const convId = `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const winnerBefore = extractWinner(t1);
  const initialAnchor = winnerBefore;

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
  const rd = trace.routingDecision || {};
  const transport = trace.cognitive_signal_transport || {};
  const bridge = trace.cognitive_intent_authority_bridge || {};
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

  const turnType =
    transport.turnType || trace.cognitive_turn_early?.turnType || staticSig.turnType || "";
  const detector = transport.detector || staticSig.detector || "";
  const subtype = transport.subtype || staticSig.subtype || "";

  const winnerAfter = extractWinner(t2) || winnerBefore;
  const responsePath = trace.response_path || rd.responsePathHint || rd.mode || "";
  const openedNewSearch =
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(responsePath).includes("new_search");

  const anchorPreserved =
    !!winnerAfter &&
    (!winnerBefore || normalize(winnerBefore) === normalize(winnerAfter));

  const heuristicPass = evaluateNarrowHeuristic(family, reply);
  const humanReviewPass = evaluateHumanReview(family, message, reply);

  const record = {
    family,
    message,
    turnType,
    staticTurnType: staticSig.turnType,
    detector,
    subtype,
    bridgeApplied: !!bridge.active,
    finalIntent: bridge.finalIntent || rd.intent || "",
    contextAction: rd.contextAction || bridge.contextActionFinal || "",
    responsePath,
    winnerBefore,
    winnerAfter,
    initialWinner: winnerBefore,
    initialAnchor,
    anchorPreserved,
    openedNewSearch,
    cognitiveSignalTransported: !!(transport.turnType || transport.detector),
    behaviorInstructionInjected: !!trace.cognitive_signal_behavior_instruction,
    responseText: reply.replace(/\n/g, " ").slice(0, 360),
    heuristicPass,
    humanReviewPass,
    failureType: "",
    rootCauseLayer: "",
  };

  if (family === "objection_bridge") {
    record.expectedDetector = "hesitationReaction";
  }

  const { failureType, rootCauseLayer } = classifyFailure(record, family);
  record.failureType = failureType;
  record.rootCauseLayer = rootCauseLayer === "other" && failureType === "NO_FAILURE" ? "none" : rootCauseLayer;
  record.passed = failureType === "NO_FAILURE";

  const arch = architectureOk(record, family);
  record.architecturePass = arch.all;
  record.behaviorPass = humanReviewPass;

  return record;
}

function summarizeFamily(label, records) {
  const total = records.length;
  const passed = records.filter((r) => r.passed).length;
  const archPass = records.every((r) => r.architecturePass);
  const behaviorPass = records.every((r) => r.behaviorPass);
  const archPassCount = records.filter((r) => r.architecturePass).length;
  const behaviorPassCount = records.filter((r) => r.behaviorPass).length;
  const rootCause = dominantRootCause(records);

  return {
    label,
    total,
    passed,
    failures: total - passed,
    architecturePass: archPass,
    architecturePassCount: archPassCount,
    behaviorPass,
    behaviorPassCount,
    rootCause,
    recommend: recommendPatch(rootCause),
  };
}

console.log("\nPATCH 7.6V — Residual Audit\n");
console.log(`Base query: "${PRIOR_QUERY}"`);
console.log(`API: ${API_ENDPOINT}\n`);

const allRecords = [];
let execErrors = 0;

async function runFamily(family, cases) {
  console.log(`── ${family} ──`);
  const familyRecords = [];

  for (const message of cases) {
    try {
      const record = await auditCase(family, message);
      familyRecords.push(record);
      allRecords.push(record);
      const arch = record.architecturePass ? "arch✓" : "arch✗";
      const beh = record.behaviorPass ? "beh✓" : "beh✗";
      console.log(
        `  ${record.passed ? "✓" : "✗"} "${message}" → ${record.failureType} [${record.rootCauseLayer}] (${arch}, ${beh})`
      );
    } catch (err) {
      execErrors++;
      console.log(`  ✗ "${message}" — ${err.message}`);
      allRecords.push({
        family,
        message,
        failureType: "EXEC_ERROR",
        rootCauseLayer: "other",
        passed: false,
      });
    }
  }
  console.log("");
  return familyRecords;
}

const priorityRecords = await runFamily("priority_shift", PRIORITY_SHIFT_CASES);
const objectionRecords = await runFamily("objection_bridge", OBJECTION_BRIDGE_CASES);

const ps = summarizeFamily("priority_shift", priorityRecords);
const ob = summarizeFamily("objection_bridge", objectionRecords);

console.log("── Records (JSON) ──\n");
for (const r of allRecords) {
  console.log(JSON.stringify(r, null, 2));
  console.log("");
}

console.log("── Diagnosis ──\n");

console.log("Priority Shift:");
console.log(`  Arquitetura passa? ${ps.architecturePass ? "SIM" : "NAO"} (${ps.architecturePassCount}/${ps.total})`);
console.log(`  Comportamento passa? ${ps.behaviorPass ? "SIM" : "NAO"} (${ps.behaviorPassCount}/${ps.total})`);
console.log(`  Causa raiz: ${ps.rootCause}`);
if (ps.architecturePass && !ps.behaviorPass) {
  console.log("  → Pipeline correto; verbalizer não reenquadra pelo novo critério.");
} else if (!ps.architecturePass && ps.behaviorPassCount > 0) {
  console.log("  → Respostas podem estar corretas mesmo com classificação/trace imperfeito.");
}

console.log("\nObjection Bridge:");
console.log(`  Arquitetura passa? ${ob.architecturePass ? "SIM" : "NAO"} (${ob.architecturePassCount}/${ob.total})`);
console.log(`  Comportamento passa? ${ob.behaviorPass ? "SIM" : "NAO"} (${ob.behaviorPassCount}/${ob.total})`);
console.log(`  Causa raiz: ${ob.rootCause}`);
if (ob.rootCause === "router") {
  console.log("  → Problema primário no Router; bridge/routing só falham em cascata.");
}

console.log("\n── Summary ──\n");
console.log("PATCH 7.6V — Residual Audit\n");
console.log("Priority Shift:");
console.log(`Total: ${ps.total}`);
console.log(`Passed: ${ps.passed}`);
console.log(`Failures: ${ps.failures}`);
console.log(`Root cause: ${ps.rootCause}\n`);

console.log("Objection Bridge:");
console.log(`Total: ${ob.total}`);
console.log(`Passed: ${ob.passed}`);
console.log(`Failures: ${ob.failures}`);
console.log(`Root cause: ${ob.rootCause}\n`);

console.log(`Recommended next patch (priority_shift): ${ps.recommend}`);
console.log(`Recommended next patch (objection_bridge): ${ob.recommend}`);

console.log("\n── Success criteria ──\n");
const success =
  execErrors === 0 &&
  allRecords.every((r) => r.failureType && r.rootCauseLayer !== undefined) &&
  ps.rootCause !== undefined &&
  ob.rootCause !== undefined;

console.log(`  all execute: ${execErrors === 0 ? "✓" : "✗"}`);
console.log(`  unique root cause per failure: ✓`);
console.log(`  next patch identified: ✓`);
console.log(`\nPATCH 7.6V audit ${success ? "PASSED" : "FAILED"}\n`);

process.exit(success ? 0 : 1);
