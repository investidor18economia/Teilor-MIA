/**
 * PATCH 7.6V-B — Priority Shift Verbalizer Tightening
 *
 * Usage: node scripts/test-mia-priority-shift-verbalizer-tightening.js
 */

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const CORE_CASES = [
  "qual da menos dor de cabeca?",
  "qual me deixaria mais tranquilo?",
  "qual dura mais?",
  "qual envelhece melhor?",
];

const EXTENDED_CASES = [
  "qual vai me dar menos problema?",
  "qual eu compro mais sossegado?",
  "qual tem mais vida util?",
  "qual aguenta melhor os proximos anos?",
];

const CASES = [...CORE_CASES, ...EXTENDED_CASES];

const CRITERION_PATTERNS = [
  /\b(dor de cabeca|problemas?|tranquil|tranquilidade|seguranca|segurança|confiavel|confiável|risco)\b/i,
  /\b(dura|durabilidade|vida util|tempo|aguenta|longev)\b/i,
  /\b(envelhece|futuro|defasad|anos|suporte|estabilidade)\b/i,
  /\b(sossegad|menos atrito|previsivel|arrependimento|manutenc)\b/i,
  /\b(se o ponto|nesse criterio|olhando por|prioridade|mudou para|a prioridade)\b/i,
];

const GENERIC_OPENING_FORBIDDEN = [
  /^eu iria no\b/i,
  /^o principal motivo e\b/i,
  /^o principal motivo é\b/i,
  /^o equilibrio geral\b/i,
  /^o equilíbrio geral\b/i,
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

function openingKey(text, words = 10) {
  return normalize(text).split(/\s+/).slice(0, words).join(" ");
}

function criterionForMessage(message) {
  const n = normalize(message);
  if (/dor de cabeca|problema|chato/.test(n)) {
    return [/\b(dor de cabeca|problemas?|tranquil|estabil|atrito|previsiv|incomod|manter)\b/i];
  }
  if (/tranquilo|segur|confiavel|sossegad|risco/.test(n)) {
    return [/\b(tranquil|segur|confiavel|sossegad|risco|surpresa|defensiv)\b/i];
  }
  if (/dura|vida util|aguenta|longe/.test(n)) {
    return [/\b(dura|durabil|vida util|aguenta|longev|tempo|anos)\b/i];
  }
  if (/envelhece|futuro|defasad|proximos anos/.test(n)) {
    return [/\b(envelhece|futuro|defasad|anos|suporte|atualiz|longo prazo)\b/i];
  }
  return CRITERION_PATTERNS;
}

function criterionDetectedInResponse(message, reply) {
  return (
    matchesAny(reply, criterionForMessage(message)) ||
    matchesAny(reply, CRITERION_PATTERNS)
  );
}

function genericRecommendationRepeated(reply) {
  const n = normalize(reply);
  if (GENERIC_RECOMMENDATION_RES.test(n)) return true;
  const open = normalize(reply).split(/\s+/).slice(0, 18).join(" ");
  return matchesAny(open, GENERIC_OPENING_FORBIDDEN);
}

function behaviorMatchedPriorityShift(message, reply) {
  return (
    criterionDetectedInResponse(message, reply) &&
    !genericRecommendationRepeated(reply)
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
      user_id: "audit-7-6v-b",
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
  const convId = `v-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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
  const bridge = trace.cognitive_intent_authority_bridge || {};
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
    bridgeApplied: !!bridge.active,
    responsePath,
    winnerBefore,
    winnerAfter,
    winnerPreserved,
    anchorPreserved,
    openedNewSearch,
    behaviorInstructionInjected: !!trace.cognitive_signal_behavior_instruction,
    criterionDetectedInResponse: criterionDetectedInResponse(message, reply),
    genericRecommendationRepeated: genericRecommendationRepeated(reply),
    openingKey: openingKey(reply),
    behaviorMatchedPriorityShift: behaviorMatchedPriorityShift(message, reply),
    responseText: reply.replace(/\n/g, " ").slice(0, 320),
    passed: false,
  };

  record.passed =
    record.turnType === "PRIORITY_SHIFT" &&
    record.bridgeApplied &&
    record.winnerPreserved &&
    record.anchorPreserved &&
    !record.openedNewSearch &&
    String(record.responsePath).includes("context_decision_no_search") &&
    record.behaviorInstructionInjected &&
    record.criterionDetectedInResponse &&
    !record.genericRecommendationRepeated &&
    record.behaviorMatchedPriorityShift;

  record.routerGap =
    record.turnType !== "PRIORITY_SHIFT" && CORE_CASES.indexOf(message) === -1;

  return record;
}

console.log("\nPATCH 7.6V-B — Priority Shift Verbalizer Tightening\n");
console.log(`Base: "${PRIOR_QUERY}"`);
console.log(`API: ${API_ENDPOINT}\n`);

const records = [];
let execFailed = 0;

for (const message of CASES) {
  try {
    const record = await runCase(message);
    records.push(record);
  } catch (err) {
    execFailed++;
    records.push({ message, passed: false, error: err.message });
    console.log(`  ✗ "${message}" — ${err.message}`);
  }
}

const openings = records.filter((r) => r.openingKey).map((r) => r.openingKey);
const uniqueOpenings = new Set(openings);
const dynamicOpening = uniqueOpenings.size >= Math.min(3, openings.length);

for (const r of records) {
  r.dynamicOpening = dynamicOpening;
  if (r.passed !== false && r.error == null) {
    r.passed = r.passed && dynamicOpening;
  }
}

let passed = 0;
let failed = 0;

for (const record of records) {
  if (record.passed) {
    passed++;
    console.log(`  ✓ "${record.message}"`);
  } else {
    failed++;
    console.log(`  ✗ "${record.message}"`);
    if (record.error) continue;
    if (record.routerGap) console.log("      router gap (out of 7.6V-B scope)");
    if (!record.behaviorInstructionInjected && !record.routerGap) {
      console.log("      missing behavior instruction");
    }
    if (record.genericRecommendationRepeated) console.log("      generic recommendation repeated");
    if (!record.criterionDetectedInResponse) console.log("      criterion not detected in response");
    if (!dynamicOpening) console.log("      openings not diverse enough across batch");
    console.log(`      reply: ${(record.responseText || "").slice(0, 140)}...`);
  }
}

const corePassed = records
  .filter((r) => CORE_CASES.includes(r.message))
  .filter((r) => r.passed).length;

console.log("\n--- Dynamic opening check ---");
console.log(`  Unique openings: ${uniqueOpenings.size}/${openings.length}`);
console.log(`  dynamicOpening: ${dynamicOpening ? "pass" : "fail"}`);

console.log("\n--- Records ---");
console.log(JSON.stringify(records, null, 2));

const extendedRouterGaps = records.filter(
  (r) => EXTENDED_CASES.includes(r.message) && r.routerGap
);
const extendedVerbalizerFailures = records.filter(
  (r) => EXTENDED_CASES.includes(r.message) && !r.passed && !r.routerGap
);
const extendedPassed = records
  .filter((r) => EXTENDED_CASES.includes(r.message))
  .filter((r) => r.passed).length;

console.log("\n--- Summary ---");
console.log(`Core cases (4): ${corePassed}/4`);
console.log(`Extended cases (${EXTENDED_CASES.length}): ${extendedPassed}/${EXTENDED_CASES.length}`);
if (extendedRouterGaps.length) {
  console.log(
    `Extended router gaps (${extendedRouterGaps.length}): ${extendedRouterGaps.map((r) => r.message).join("; ")}`
  );
}
console.log(`dynamicOpening: ${dynamicOpening}`);

const coreOk = corePassed === 4 && dynamicOpening;
const extendedOk = extendedVerbalizerFailures.length === 0;

process.exit(coreOk && extendedOk && execFailed === 0 ? 0 : 1);
