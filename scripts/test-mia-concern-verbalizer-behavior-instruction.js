/**
 * PATCH 7.6V-D — Concern Verbalizer Behavior Instruction
 *
 * Usage: node scripts/test-mia-concern-verbalizer-behavior-instruction.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const CORE_CASES = [
  "isso me preocupa",
  "isso me deixa com receio",
  "fico preocupado com isso",
  "isso me deixou preocupado",
];

const EXTENDED_CASES = [
  "isso me da um receio",
  "isso me deixa inseguro",
  "tenho um pe atras com isso",
];

const CASES = [...CORE_CASES, ...EXTENDED_CASES];

const EXPECTED_TURN_TYPE = "OBJECTION";
const EXPECTED_DETECTOR = "hesitationReaction";
const EXPECTED_SUBTYPE = "concern";

const CONCERN_ACK_PATTERNS = [
  /\bpreocup\w*/i,
  /\breceio\b/i,
  /\binsegur\w*/i,
  /\bpe atras\b/i,
  /\bfaz sentido se preocup/i,
  /\bentendo sua preocup/i,
  /\besse receio e valido\b/i,
  /\b(valido|valida|natural|compreensiv)\b/i,
  /\bponto que (merece|pode|vale)\b/i,
  /\bo cuidado aqui\b/i,
];

const GENERIC_OPENING_FORBIDDEN = [
  /^eu iria no\b/i,
  /^o principal motivo e\b/i,
  /^o equilibrio geral\b/i,
];

const GENERIC_RECOMMENDATION_RES =
  /^eu iria no\b[\s\S]{0,160}\b(principal motivo|equil[ií]brio geral)\b/i;

function normalize(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(text, patterns) {
  const n = normalize(text);
  return patterns.some((re) => re.test(n));
}

function acknowledgedConcern(reply) {
  return matchesAny(reply, CONCERN_ACK_PATTERNS);
}

function genericRecommendationRepeated(reply) {
  const n = normalize(reply);
  if (GENERIC_RECOMMENDATION_RES.test(n)) return true;
  const open = n.split(/\s+/).slice(0, 18).join(" ");
  return matchesAny(open, GENERIC_OPENING_FORBIDDEN);
}

function behaviorMatchedConcern(reply) {
  return acknowledgedConcern(reply) && !genericRecommendationRepeated(reply);
}

function extractWinner(data) {
  return (
    data?.session_context?.lastBestProduct?.product_name ||
    data?.prices?.[0]?.product_name ||
    data?.prices?.[0]?.title ||
    ""
  );
}

function staticExpectsConcern(message) {
  const r = classifyMiaTurn({
    query: message,
    originalQuery: message,
    sessionContext: { lastBestProduct: { product_name: "Anchor" } },
    hasActiveAnchor: true,
    detectedIntent: "decision",
  });
  return (
    r.turnType === EXPECTED_TURN_TYPE &&
    r.signals?.hesitationReaction?.detected &&
    r.signals?.hesitationReaction?.subtype === EXPECTED_SUBTYPE
  );
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6v-d",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runCase(message) {
  const routerExpected = staticExpectsConcern(message);
  const convId = `v-d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

  const winnerAfter = extractWinner(t2) || winnerBefore;
  const responsePath = trace.response_path || rd.responsePathHint || rd.mode || "";
  const openedNewSearch =
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(responsePath).includes("new_search");

  const winnerPreserved =
    !winnerBefore || !winnerAfter || normalize(winnerBefore) === normalize(winnerAfter);
  const anchorPreserved = winnerPreserved && !!winnerAfter;

  const record = {
    message,
    turnType: transport.turnType || trace.cognitive_turn_early?.turnType || "",
    detector: transport.detector || "",
    subtype: transport.subtype || "",
    responsePath,
    winnerBefore,
    winnerAfter,
    winnerPreserved,
    anchorPreserved,
    openedNewSearch,
    behaviorInstructionInjected: !!trace.cognitive_signal_behavior_instruction,
    acknowledgedConcern: acknowledgedConcern(reply),
    genericRecommendationRepeated: genericRecommendationRepeated(reply),
    behaviorMatchedConcern: behaviorMatchedConcern(reply),
    routerGap: !routerExpected,
    responseText: reply.replace(/\n/g, " ").slice(0, 320),
    passed: false,
  };

  if (record.routerGap) {
    record.passed = false;
    record.notes = "router gap — out of 7.6V-D scope";
    return record;
  }

  record.passed =
    record.turnType === EXPECTED_TURN_TYPE &&
    record.detector === EXPECTED_DETECTOR &&
    record.subtype === EXPECTED_SUBTYPE &&
    record.winnerPreserved &&
    record.anchorPreserved &&
    !record.openedNewSearch &&
    String(record.responsePath).includes("context_decision_no_search") &&
    record.behaviorInstructionInjected &&
    record.acknowledgedConcern &&
    !record.genericRecommendationRepeated &&
    record.behaviorMatchedConcern;

  return record;
}

console.log("\nPATCH 7.6V-D — Concern Verbalizer Behavior Instruction\n");
console.log(`Base: "${PRIOR_QUERY}"`);
console.log(`API: ${API_ENDPOINT}\n`);

const records = [];
let execErrors = 0;

for (const message of CASES) {
  try {
    const record = await runCase(message);
    records.push(record);
    const icon = record.passed ? "✓" : "✗";
    console.log(`  ${icon} "${message}"${record.routerGap ? " (router gap)" : ""}`);
    if (!record.passed && !record.routerGap) {
      if (!record.behaviorInstructionInjected) console.log("      missing behavior instruction");
      if (!record.acknowledgedConcern) console.log("      concern not acknowledged");
      if (record.genericRecommendationRepeated) console.log("      generic opening");
      console.log(`      reply: ${record.responseText.slice(0, 140)}...`);
    }
  } catch (err) {
    execErrors++;
    records.push({ message, passed: false, error: err.message });
    console.log(`  ✗ "${message}" — ${err.message}`);
  }
}

const corePassed = records
  .filter((r) => CORE_CASES.includes(r.message))
  .filter((r) => r.passed).length;
const extendedRouterGaps = records.filter(
  (r) => EXTENDED_CASES.includes(r.message) && r.routerGap
);
const extendedVerbalizerFailures = records.filter(
  (r) => EXTENDED_CASES.includes(r.message) && !r.passed && !r.routerGap
);

console.log("\n--- Records ---");
console.log(JSON.stringify(records, null, 2));

console.log("\n--- Summary ---");
console.log(`Core cases (4): ${corePassed}/4`);
console.log(`Extended router gaps: ${extendedRouterGaps.length}`);
if (extendedRouterGaps.length) {
  console.log(`  ${extendedRouterGaps.map((r) => r.message).join("; ")}`);
}

const coreOk = execErrors === 0 && corePassed === 4;
const extendedOk = extendedVerbalizerFailures.length === 0;

process.exit(coreOk && extendedOk ? 0 : 1);
