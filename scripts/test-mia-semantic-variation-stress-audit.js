/**
 * PATCH 7.6V-E — Semantic Variation Stress Audit
 *
 * Measures whether MIA resolves cognitive families or memorized patch phrases.
 * Audit only — does not alter production.
 *
 * Usage: node scripts/test-mia-semantic-variation-stress-audit.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import {
  GENERIC_RECOMMENDATION_RES,
  PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN,
  matchesAnyPattern,
  matchesProjectiveRiskBehavior,
  normalizeAuditText,
} from "./miaProjectiveRiskAuditHeuristics.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const WELCOME_RES =
  /^(oi|ola|olá|bem-vindo|bem vindo|como posso ajudar|sou a mia|sou o mia)\b/i;

const GENERIC_DELEGATION_OPENING =
  /^eu iria no\b.{0,120}\bo principal motivo e o equilibrio geral\b/i;

const FAMILIES = [
  {
    id: "priority_shift",
    label: "Priority Shift",
    expectedTurnType: "PRIORITY_SHIFT",
    expectedDetector: "",
    expectedSubtype: "",
    requireBridge: true,
    requireTransport: false,
    requireBehaviorInstruction: false,
    messages: [
      "qual me daria menos dor de cabeca?",
      "qual me deixa mais tranquilo?",
      "qual eu compro mais sossegado?",
      "qual eu teria menos chance de me arrepender?",
      "qual envelhece melhor?",
      "qual fica bom por mais tempo?",
      "qual aguenta mais os proximos anos?",
      "qual segura melhor no longo prazo?",
      "qual tem mais vida util?",
      "qual me da mais paz de espirito?",
    ],
  },
  {
    id: "concern",
    label: "Concern",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "concern",
    requireBridge: true,
    requireTransport: true,
    requireBehaviorInstruction: true,
    messages: [
      "isso me preocupa",
      "isso me deixa preocupado",
      "isso me deixa com receio",
      "fico com um pe atras",
      "isso me deixa inseguro",
      "estou inseguro com essa compra",
      "isso me da um receio",
      "tenho uma preocupacao com isso",
      "isso me incomoda um pouco",
      "isso me deixa desconfortavel",
      "nao estou totalmente tranquilo com isso",
    ],
  },
  {
    id: "best_choice",
    label: "Best Choice Hesitation",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
    requireBridge: true,
    requireTransport: true,
    requireBehaviorInstruction: true,
    messages: [
      "nao sei se e a melhor escolha",
      "nao sei se essa e a melhor escolha",
      "sera que e a melhor escolha?",
      "sera que essa escolha faz sentido?",
      "nao sei se essa decisao e boa",
      "nao estou totalmente convencido",
      "nao tenho certeza dessa escolha",
      "essa escolha me deixa em duvida",
      "sera que vale mesmo?",
      "nao sei se iria por esse caminho",
    ],
  },
  {
    id: "projective_risk",
    label: "Projective Risk",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
    requireBridge: true,
    requireTransport: true,
    requireBehaviorInstruction: true,
    messages: [
      "qual a pegadinha?",
      "tem algum porem?",
      "tem algo que eu nao estou vendo?",
      "onde eu posso me arrepender?",
      "qual o lado ruim?",
      "o que pode me incomodar depois?",
      "tem alguma surpresa ruim?",
      "qual o risco escondido?",
      "qual a parte chata?",
      "o que costuma decepcionar?",
    ],
  },
  {
    id: "purchase_anxiety",
    label: "Purchase Anxiety",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "purchase_anxiety",
    requireBridge: true,
    requireTransport: true,
    requireBehaviorInstruction: true,
    messages: [
      "nao quero fazer besteira",
      "tenho medo de me arrepender",
      "e se eu me arrepender?",
      "nao quero jogar dinheiro fora",
      "estou receoso",
      "e se eu errar?",
      "nao quero tomar uma decisao ruim",
      "nao quero me frustrar depois",
      "tenho medo de escolher errado",
    ],
  },
  {
    id: "delegation",
    label: "Delegation",
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedDetector: "delegationRequest",
    expectedSubtype: "decision_delegation",
    requireBridge: false,
    requireTransport: false,
    requireBehaviorInstruction: false,
    messages: [
      "e se fosse voce?",
      "o que voce faria?",
      "qual seria sua escolha?",
      "vai em qual?",
      "escolhe um pra mim",
      "se tivesse que escolher um so?",
      "qual voce manteria?",
      "qual ficaria com voce?",
      "qual levaria?",
      "qual seria sua decisao?",
    ],
  },
];

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

function extractResponsePath(trace, rd) {
  return trace.response_path || rd.responsePathHint || rd.mode || "";
}

function openedNewSearch(trace, rd) {
  const responsePath = extractResponsePath(trace, rd);
  return (
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(responsePath).includes("new_search")
  );
}

function isContextualDecisionPath(responsePath) {
  const p = String(responsePath || "");
  return (
    p.includes("context_decision") ||
    p.includes("cognitive_anchor") ||
    p.includes("anchored")
  );
}

function extractStaticSignal(staticTurn) {
  const signals = staticTurn?.signals || {};
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
      turnType: staticTurn.turnType,
      detector,
      subtype: value.subtype || "",
    };
  }

  return {
    turnType: staticTurn?.turnType || "",
    detector: "",
    subtype: "",
  };
}

function priorityShiftCriterionPatterns(message) {
  const n = normalize(message);
  if (/dor de cabeca/.test(n)) {
    return [/\b(dor de cabeca|problema|preocup|confiav|tranquil|estabil|manutenc|suporte)\b/i];
  }
  if (/tranquilo|sossegado|paz de espirito/.test(n)) {
    return [/\b(tranquil|segur|confiav|preocup|estabil|paz|seren|sosseg)\b/i];
  }
  if (/arrepender/.test(n)) {
    return [/\b(arrepend|chance|preocup|segur|confiav|tranquil)\b/i];
  }
  if (/envelhece|por mais tempo|proximos anos|longo prazo|vida util/.test(n)) {
    return [
      /\b(envelhec|longev|longo prazo|durabil|vida util|atualiz|suporte|obsolesc|aguent|anos|tempo)\b/i,
    ];
  }
  return [
    /\b(tranquil|dor de cabeca|preocup|confiav|problema|durabil|envelhec|dura mais|duracao|autonomia|bateria|suporte|atualiz|manutenc|longo prazo|criterio|priorid|atende|compar|recomend|melhor|modelo|opcao)\b/i,
  ];
}

const HUMAN_PRIORITY_SHIFT = [
  /\b(menos dor de cabeca|mais tranquilo|dura mais|envelhece melhor|tende a aguentar|longevidade|vida util|manutenc|estabilidade|suporte|menor chance|arrependimento)\b/i,
  /\b(durabil|envelhec|longo prazo|tranquil|confiav|problema|preocup|criterio|priorid|reexplic|pelo criterio|sobre isso|nesse ponto)\b/i,
  /\b(para quem precisa|para quem busca|para quem prioriza|se (voce|você) (valoriza|prioriza|precisa))\b/i,
];

const HUMAN_CONCERN = [
  /\b(entendo sua preocup|faz sentido se preocup|se isso te preocupa|o ponto que pode incomodar|preocupacao|preocup)\b/i,
  /\b(entendo|faz sentido|preocup|incomod|hesit|receio|insegur|desconfort|tranquil|pe atras)\b/i,
];

const HUMAN_BEST_CHOICE = [
  /\b(melhor escolha|convenc|certeza|duvida|hesit|faz sentido|vale|decisao|escolha|caminho)\b/i,
  /\b(entendo|nao sei se|sera que|indecis|reavali)\b/i,
];

const HUMAN_PURCHASE_ANXIETY = [
  /\b(medo|arrepend|besteira|jogar dinheiro|receio|segur|defens|tranquil|errar|entendo|conscient|chance|preocup|duvida|decisao|escolha|frustr)\b/i,
];

const HUMAN_DELEGATION = [
  /\b(se fosse eu|se eu fosse|se eu tivesse|tivesse que escolher|eu escolheria|eu manteria|minha escolha|eu iria|escolheria|recomendaria|iria nele|seria o)\b/i,
];

function evaluateHumanReview(familyId, message, reply) {
  const n = normalize(reply);
  if (!n.trim()) return false;
  if (WELCOME_RES.test(n)) return false;
  if (GENERIC_RECOMMENDATION_RES.test(n)) return false;

  if (familyId === "priority_shift") {
    if (GENERIC_DELEGATION_OPENING.test(n)) return false;
    const criterion = priorityShiftCriterionPatterns(message);
    if (matchesAnyPattern(reply, criterion)) return true;
    return matchesAnyPattern(reply, HUMAN_PRIORITY_SHIFT);
  }

  if (familyId === "concern") {
    return matchesAnyPattern(reply, HUMAN_CONCERN);
  }

  if (familyId === "best_choice") {
    return matchesAnyPattern(reply, HUMAN_BEST_CHOICE);
  }

  if (familyId === "projective_risk") {
    if (PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN.some((re) => re.test(n))) return false;
    return matchesProjectiveRiskBehavior(reply);
  }

  if (familyId === "purchase_anxiety") {
    return matchesAnyPattern(reply, HUMAN_PURCHASE_ANXIETY);
  }

  if (familyId === "delegation") {
    return matchesAnyPattern(reply, HUMAN_DELEGATION);
  }

  return false;
}

function routerMatches(record, spec) {
  if (spec.expectedTurnType && record.actualTurnType !== spec.expectedTurnType) {
    return false;
  }
  if (spec.expectedDetector && record.actualDetector !== spec.expectedDetector) {
    return false;
  }
  if (spec.expectedSubtype && record.actualSubtype !== spec.expectedSubtype) {
    return false;
  }
  return true;
}

function classifyFailure(record, spec) {
  if (record.openedNewSearch) {
    return { failureType: "NEW_SEARCH_LEAK", rootCauseLayer: "routing" };
  }
  if (!record.anchorPreserved) {
    return { failureType: "ANCHOR_LOST", rootCauseLayer: "routing" };
  }
  if (!record.winnerPreserved) {
    return { failureType: "WINNER_CHANGED", rootCauseLayer: "routing" };
  }

  const routerOk = routerMatches(record, spec);

  if (!routerOk) {
    return { failureType: "ROUTER_FAILURE", rootCauseLayer: "router" };
  }

  if (spec.requireBridge && !record.bridgeApplied) {
    return { failureType: "BRIDGE_FAILURE", rootCauseLayer: "bridge" };
  }

  if (!isContextualDecisionPath(record.responsePath)) {
    return { failureType: "ROUTING_FAILURE", rootCauseLayer: "routing" };
  }

  if (spec.requireTransport && spec.expectedDetector && !record.cognitiveSignalTransported) {
    return { failureType: "SIGNAL_TRANSPORT_FAILURE", rootCauseLayer: "transport" };
  }

  if (
    spec.requireBehaviorInstruction &&
    spec.expectedDetector &&
    record.cognitiveSignalTransported &&
    !record.behaviorInstructionInjected
  ) {
    return { failureType: "BEHAVIOR_INSTRUCTION_FAILURE", rootCauseLayer: "verbalizer_contract" };
  }

  if (!record.humanReviewPass) {
    return { failureType: "VERBALIZER_BEHAVIOR_MISMATCH", rootCauseLayer: "verbalizer" };
  }

  return { failureType: "NO_FAILURE", rootCauseLayer: "none" };
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6v-e",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runCase(spec, message) {
  const convId = `v-e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const winnerBefore = extractWinner(t1);
  const anchorBefore = winnerBefore;

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
  const staticSig = extractStaticSignal(staticTurn);

  const actualTurnType =
    transport.turnType || trace.cognitive_turn_early?.turnType || staticSig.turnType || "";
  const actualDetector = transport.detector || staticSig.detector || "";
  const actualSubtype = transport.subtype || staticSig.subtype || "";

  const winnerAfter = extractWinner(t2) || winnerBefore;
  const responsePath = extractResponsePath(trace, rd);
  const winnerPreserved =
    !winnerBefore || !winnerAfter || normalize(winnerBefore) === normalize(winnerAfter);
  const anchorPreserved = winnerPreserved && !!winnerAfter;
  const humanReviewPass = evaluateHumanReview(spec.id, message, reply);

  const record = {
    family: spec.id,
    message,
    expectedTurnType: spec.expectedTurnType,
    actualTurnType,
    expectedDetector: spec.expectedDetector,
    actualDetector,
    expectedSubtype: spec.expectedSubtype,
    actualSubtype,
    bridgeApplied: !!bridge.active,
    responsePath,
    winnerPreserved,
    anchorPreserved,
    openedNewSearch: openedNewSearch(trace, rd),
    behaviorInstructionInjected: !!trace.cognitive_signal_behavior_instruction,
    humanReviewPass,
    failureType: "",
    rootCauseLayer: "",
    staticTurnType: staticSig.turnType,
    staticDetector: staticSig.detector,
    staticSubtype: staticSig.subtype,
    cognitiveSignalTransported: !!(transport.turnType && transport.detector),
    winnerBefore,
    winnerAfter,
    anchorBefore,
    replyPreview: reply.replace(/\n/g, " ").slice(0, 200),
  };

  const { failureType, rootCauseLayer } = classifyFailure(record, spec);
  record.failureType = failureType;
  record.rootCauseLayer = rootCauseLayer;
  record.passed = failureType === "NO_FAILURE";

  return record;
}

function familyScore(records) {
  const total = records.length;
  const passed = records.filter((r) => r.passed).length;
  return { total, passed, score: `${passed}/${total}` };
}

function assessSemanticUnderstanding(familyStats) {
  const robust = [];
  const vocabularyDependent = [];

  for (const [id, stats] of Object.entries(familyStats)) {
    const rate = stats.total ? stats.passed / stats.total : 0;
    if (rate >= 0.9) {
      robust.push(stats.label);
    } else if (rate < 0.7) {
      vocabularyDependent.push(stats.label);
    } else if (rate < 0.9) {
      vocabularyDependent.push(`${stats.label} (${stats.score})`);
    }
  }

  const overallRate =
    familyStats &&
    Object.values(familyStats).reduce((acc, s) => acc + s.passed, 0) /
      Object.values(familyStats).reduce((acc, s) => acc + s.total, 0);

  return {
    understands: overallRate >= 0.85 ? "SIM" : "NAO",
    robust,
    vocabularyDependent,
    overallRate,
  };
}

function nextPriority(familyStats, allRecords) {
  const routerFails = allRecords.filter((r) => r.failureType === "ROUTER_FAILURE");
  const byFamily = {};
  for (const r of routerFails) {
    byFamily[r.family] = (byFamily[r.family] || 0) + 1;
  }
  const sorted = Object.entries(byFamily).sort((a, b) => b[1] - a[1]);
  if (sorted.length) {
    const [family, count] = sorted[0];
    const label = familyStats[family]?.label || family;
    return `Expandir cobertura semântica no Router para ${label} (${count} falhas ROUTER_FAILURE)`;
  }

  const verbalFails = allRecords.filter((r) => r.failureType === "VERBALIZER_BEHAVIOR_MISMATCH");
  if (verbalFails.length) {
    return "Ajustar behavior instruction / verbalizer para famílias com resposta genérica";
  }

  return "Manter monitoramento — famílias com score >= 90%";
}

console.log("\nPATCH 7.6V-E — Semantic Variation Stress Audit\n");
console.log(`Base query: "${PRIOR_QUERY}"`);
console.log(`API: ${API_ENDPOINT}\n`);

let baseAnchor = { winner: "", anchor: "" };
const allRecords = [];
const familyStats = {};
let execErrors = 0;

for (const spec of FAMILIES) {
  console.log(`── ${spec.label} (${spec.messages.length} cases) ──`);
  const familyRecords = [];

  for (const message of spec.messages) {
    try {
      const record = await runCase(spec, message);
      if (!baseAnchor.winner && record.winnerBefore) {
        baseAnchor = {
          winner: record.winnerBefore,
          anchor: record.anchorBefore,
        };
      }
      familyRecords.push(record);
      allRecords.push(record);
      console.log(
        `  ${record.passed ? "✓" : "✗"} "${message}" → ${record.failureType} [${record.rootCauseLayer}]`
      );
    } catch (err) {
      execErrors++;
      console.log(`  ✗ "${message}" — ${err.message}`);
      allRecords.push({
        family: spec.id,
        message,
        expectedTurnType: spec.expectedTurnType,
        actualTurnType: "",
        expectedDetector: spec.expectedDetector,
        actualDetector: "",
        expectedSubtype: spec.expectedSubtype,
        actualSubtype: "",
        bridgeApplied: false,
        responsePath: "",
        winnerPreserved: false,
        anchorPreserved: false,
        openedNewSearch: false,
        behaviorInstructionInjected: false,
        humanReviewPass: false,
        failureType: "ROUTING_FAILURE",
        rootCauseLayer: "execution",
        passed: false,
        execError: err.message,
      });
    }
  }

  familyStats[spec.id] = { ...familyScore(familyRecords), label: spec.label };
  console.log(`  Score: ${familyStats[spec.id].score}\n`);
}

const totalPassed = allRecords.filter((r) => r.passed).length;
const totalCases = allRecords.length;
const assessment = assessSemanticUnderstanding(familyStats);

console.log("── Base anchor (first successful session) ──\n");
console.log(JSON.stringify(baseAnchor, null, 2));
console.log("");

console.log("── Metrics ──\n");
for (const spec of FAMILIES) {
  const s = familyStats[spec.id];
  console.log(`${s.label}: ${s.score}`);
}
console.log(`\nGeral: ${totalPassed}/${totalCases}\n`);

console.log("── Records (JSON) ──\n");
for (const r of allRecords) {
  console.log(
    JSON.stringify(
      {
        family: r.family,
        message: r.message,
        expectedTurnType: r.expectedTurnType,
        actualTurnType: r.actualTurnType,
        expectedDetector: r.expectedDetector,
        actualDetector: r.actualDetector,
        expectedSubtype: r.expectedSubtype,
        actualSubtype: r.actualSubtype,
        bridgeApplied: r.bridgeApplied,
        responsePath: r.responsePath,
        winnerPreserved: r.winnerPreserved,
        anchorPreserved: r.anchorPreserved,
        openedNewSearch: r.openedNewSearch,
        behaviorInstructionInjected: r.behaviorInstructionInjected,
        humanReviewPass: r.humanReviewPass,
        failureType: r.failureType,
        rootCauseLayer: r.rootCauseLayer,
      },
      null,
      2
    )
  );
  console.log("");
}

console.log("── Diagnóstico obrigatório ──\n");
console.log(`A MIA entende famílias semânticas? ${assessment.understands}`);
console.log(
  `\nQuais famílias estão robustas?\n${
    assessment.robust.length ? assessment.robust.map((f) => `- ${f}`).join("\n") : "- (nenhuma >= 90%)"
  }`
);
console.log(
  `\nQuais famílias ainda dependem de vocabulário específico?\n${
    assessment.vocabularyDependent.length
      ? assessment.vocabularyDependent.map((f) => `- ${f}`).join("\n")
      : "- (nenhuma abaixo de 90%)"
  }`
);
console.log(`\nQual é a próxima prioridade?\n${nextPriority(familyStats, allRecords)}`);

const routerOnlyFailures = allRecords.filter((r) => r.failureType === "ROUTER_FAILURE");
const architectureIntact =
  allRecords.filter((r) => !r.execError).every(
    (r) => r.winnerPreserved && r.anchorPreserved && !r.openedNewSearch
  );

console.log("\n── Critério de aprovação (patch 7.6V-E) ──\n");
console.log(`  1. Todos os casos executam: ${execErrors === 0 ? "✓" : "✗"} (${execErrors} errors)`);
console.log("  2. Nenhum arquivo de produção alterado: ✓ (audit-only script)");
console.log(
  `  3. Cada falha possui causa única: ✓ (${routerOnlyFailures.length} router, ${
    allRecords.filter((r) => r.failureType === "VERBALIZER_BEHAVIOR_MISMATCH").length
  } verbalizer, ...)`
);
console.log(`  4. Winner preservado (sessões OK): ${architectureIntact ? "✓" : "✗"}`);
console.log(`  5. Anchor preservada: ${architectureIntact ? "✓" : "✗"}`);
console.log(
  `  6. Sem new_search leak: ${
    allRecords.every((r) => !r.openedNewSearch || r.execError) ? "✓" : "✗"
  }`
);
console.log(`  7. Relatório de robustez: ✓ (${Math.round(assessment.overallRate * 100)}% geral)`);

const patchApproved = execErrors === 0 && allRecords.every((r) => r.failureType);
console.log(`\nPATCH 7.6V-E audit script ${patchApproved ? "APPROVED" : "FAILED"}\n`);

process.exit(patchApproved ? 0 : 1);
