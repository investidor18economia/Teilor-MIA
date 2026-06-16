/**
 * PATCH 7.6U-I — Projective Risk Verbalizer Tightening
 *
 * Validates projectiveRisk:risk_probe responses after behavioral instruction tightening.
 *
 * Usage: node scripts/test-mia-projective-risk-verbalizer-tightening.js
 */

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const CASES = [
  "qual seria seu medo nessa compra?",
  "o que poderia dar errado?",
  "onde eu posso me arrepender?",
  "qual a pegadinha?",
  "tem algum porem?",
  "tem algo que eu nao estou vendo?",
];

const EXPECTED_TURN_TYPE = "OBJECTION";
const EXPECTED_DETECTOR = "projectiveRisk";
const EXPECTED_SUBTYPE = "risk_probe";

const RISK_FRAME_PATTERNS = [
  /\briscos?\b/i,
  /\bpegadinha\b/i,
  /\bporem\b|\bporém\b/i,
  /\bponto de atencao\b|\bponto de atenção\b/i,
  /\b(quest\w+|ponto) a (se )?considerar\b/i,
  /\b(o que pode incomodar|o que pode dar errado|onde voce pode se arrepender|onde você pode se arrepender)\b/i,
  /\b(limitacao|limitação|tradeoff|trade-off|detalhe escondido|detalhe que|nao estou vendo|não estou vendo)\b/i,
  /\b(medo|preocup\w*|desvantag|dar errado|arrepend\w*|cuidado|contras?)\b/i,
];

const GENERIC_OPENING_FORBIDDEN = [
  /^eu iria no\b/i,
  /^o principal motivo e\b/i,
  /^o principal motivo é\b/i,
  /^o equilibrio geral\b/i,
  /^o equilíbrio geral\b/i,
  /^faz sentido achar caro\b/i,
  /^faz sentido achar que o preco\b/i,
  /^faz sentido achar que o preço\b/i,
  /^faz sentido achar o\b/i,
];

const GENERIC_RECOMMENDATION_RES =
  /eu iria no\b[\s\S]{0,140}\b(principal motivo|equil[ií]brio geral)\b/i;

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

function openingSlice(text, words = 28) {
  return normalize(text).split(/\s+/).slice(0, words).join(" ");
}

function startsWithRiskFrame(reply) {
  const open = openingSlice(reply);
  return matchesAny(open, RISK_FRAME_PATTERNS);
}

function doesNotOpenWithGenericRecommendation(reply) {
  const open = openingSlice(reply, 18);
  if (matchesAny(open, GENERIC_OPENING_FORBIDDEN)) return false;
  if (GENERIC_RECOMMENDATION_RES.test(normalize(reply))) return false;
  return true;
}

function behaviorMatchedProjectiveRisk(reply) {
  return (
    matchesAny(reply, RISK_FRAME_PATTERNS) &&
    doesNotOpenWithGenericRecommendation(reply)
  );
}

function extractWinner(data) {
  return (
    data?.session_context?.lastBestProduct?.product_name ||
    data?.prices?.[0]?.product_name ||
    data?.prices?.[0]?.title ||
    ""
  );
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-i",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runCase(message) {
  const convId = `u-i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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
    winnerPreserved,
    anchorPreserved,
    responsePath,
    openedNewSearch,
    hasBehaviorInstruction: !!trace.cognitive_signal_behavior_instruction,
    startsWithRiskFrame: startsWithRiskFrame(reply),
    doesNotOpenWithGenericRecommendation: doesNotOpenWithGenericRecommendation(reply),
    behaviorMatchedProjectiveRisk: behaviorMatchedProjectiveRisk(reply),
    responseText: reply.replace(/\n/g, " ").slice(0, 280),
    passed: false,
  };

  record.passed =
    record.turnType === EXPECTED_TURN_TYPE &&
    record.detector === EXPECTED_DETECTOR &&
    record.subtype === EXPECTED_SUBTYPE &&
    record.winnerPreserved &&
    record.anchorPreserved &&
    !record.openedNewSearch &&
    String(record.responsePath).includes("context_decision") &&
    record.startsWithRiskFrame &&
    record.doesNotOpenWithGenericRecommendation &&
    record.behaviorMatchedProjectiveRisk;

  return record;
}

console.log("\n  PATCH 7.6U-I — Projective Risk Verbalizer Tightening\n");
console.log(`  Base: "${PRIOR_QUERY}"`);
console.log(`  API: ${API_ENDPOINT}\n`);

let passed = 0;
let failed = 0;
const records = [];

for (const message of CASES) {
  try {
    const record = await runCase(message);
    records.push(record);
    if (record.passed) {
      passed++;
      console.log(`  ✓ "${message}"`);
    } else {
      failed++;
      console.log(`  ✗ "${message}"`);
      if (record.turnType !== EXPECTED_TURN_TYPE || record.detector !== EXPECTED_DETECTOR) {
        console.log(`      signal=${record.turnType}/${record.detector}/${record.subtype}`);
      }
      if (!record.startsWithRiskFrame) console.log("      missing early risk frame");
      if (!record.doesNotOpenWithGenericRecommendation) {
        console.log("      generic opening detected");
      }
      console.log(`      reply: ${record.responseText.slice(0, 120)}...`);
    }
  } catch (err) {
    failed++;
    records.push({ message, passed: false, error: err.message });
    console.log(`  ✗ "${message}" — ${err.message}`);
  }
}

console.log("\n--- PATCH 7.6U-I Records ---");
console.log(JSON.stringify(records, null, 2));
console.log(`\nResult: ${passed}/${CASES.length} passed`);

process.exit(failed > 0 ? 1 : 0);
