/**
 * PATCH 7.6M — MIA Winner Verbalization Integrity Audit
 *
 * Objetivo: descobrir onde e por que o produto verbalizado diverge do winner
 * autorizado. Este script é puro diagnóstico — não corrige nada.
 *
 * Pipeline auditado:
 *   [1] PROMPT_INPUT_STAGE     — o prompt recebeu produto errado / lista ambígua?
 *   [2] LLM_RAW_REPLY_STAGE    — o prompt estava certo mas o LLM verbalizou outro?
 *   [3] CORRECTION_LAYER_STAGE — a correction detectou mas corrigiu mal / mascarou?
 *   [4] FINAL_REPLY_STAGE      — rawReply ok mas finalReply divergiu?
 *   [5] AUDIT_EXTRACTION_STAGE — audit extraiu winner errado (falso positivo)?
 *
 * Violation types registrados:
 *   AUTHORIZED_WINNER_NOT_MENTIONED
 *   UNAUTHORIZED_WINNER_VERBALIZED
 *   RUNNER_UP_VERBALIZED_AS_WINNER
 *   LLM_REDIRECTED_DECISION
 *   PROMPT_MISSING_AUTHORIZED_WINNER
 *   PROMPT_MISSING_ANCHOR_CONSTRAINT
 *   CORRECTION_LAYER_FAILED
 *   PROMPT_ALLOWED_UNAUTHORIZED_PRODUCT
 *
 * Usage:
 *   MIA_STATE_AUDIT=true node scripts/test-mia-winner-verbalization-integrity-audit.js
 *   node scripts/test-mia-winner-verbalization-integrity-audit.js  (HTTP desativado)
 */

// ─────────────────────────────────────────────────────────────
// Static pipeline analysis imports
// ─────────────────────────────────────────────────────────────
import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { shouldUseRichExplanationPath, buildExplanationContext } from "../lib/miaCognitiveExplanationPath.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";

// ─────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────

const FLAGS = {
  AUTHORIZED_WINNER_MISSING_IN_FINAL_REPLY:  "AUTHORIZED_WINNER_MISSING_IN_FINAL_REPLY",
  UNAUTHORIZED_PRODUCT_RECOMMENDED:          "UNAUTHORIZED_PRODUCT_RECOMMENDED",
  WINNER_CHANGED_WITHOUT_PERMISSION:         "WINNER_CHANGED_WITHOUT_PERMISSION",
  LLM_REDIRECTED_TO_UNAUTHORIZED_PRODUCT:    "LLM_REDIRECTED_TO_UNAUTHORIZED_PRODUCT",
  PROMPT_ALLOWED_UNAUTHORIZED_PRODUCT:       "PROMPT_ALLOWED_UNAUTHORIZED_PRODUCT",
  PROMPT_MISSING_AUTHORIZED_WINNER:          "PROMPT_MISSING_AUTHORIZED_WINNER",
  PROMPT_MISSING_ANCHOR_CONSTRAINT:          "PROMPT_MISSING_ANCHOR_CONSTRAINT",
  CORRECTION_LAYER_FAILED:                   "CORRECTION_LAYER_FAILED",
  CORRECTION_LAYER_MASKED_VIOLATION:         "CORRECTION_LAYER_MASKED_VIOLATION",
  FINAL_REPLY_DIVERGED_FROM_RAW_REPLY:       "FINAL_REPLY_DIVERGED_FROM_RAW_REPLY",
  AUDIT_EXTRACTION_POSSIBLE_FALSE_POSITIVE:  "AUDIT_EXTRACTION_POSSIBLE_FALSE_POSITIVE",
};

// ─────────────────────────────────────────────────────────────
// Prompt template map (static analysis of pipeline)
// Mirrors _richExpContextModeSelected logic in chat-gpt4o.js
// ─────────────────────────────────────────────────────────────

function resolveExpectedPromptTemplate(turnType, routingMode, contextAction, hasAnchor) {
  const richExpActivated = routingMode === "cognitive_anchor_hold";

  if (contextAction === "analysis")     return "analysis_llm";
  if (turnType === "OBJECTION" && hasAnchor) return "objection_response_contract";
  if (turnType === "ALTERNATIVE_REQUEST" && hasAnchor) return "refinement_followup_response_contract";
  if (turnType === "REFINEMENT" && hasAnchor) return "refinement_followup_response_contract";
  if (richExpActivated)                 return "explanation_anchored";
  return "decision_generic";
}

// For each template, does it pin the authorized winner explicitly?
const TEMPLATE_PINS_AUTHORIZED_WINNER = {
  analysis_llm:                         false, // Shows all products — relies on context
  objection_response_contract:          true,  // "PRODUTO RECOMENDADO: ${anchorTitle}"
  refinement_followup_response_contract: true, // "PRODUTO ATUAL (REFERÊNCIA): ${anchorTitle}"
  explanation_anchored:                 true,  // "PRODUTO EM QUESTÃO: ${anchorTitle}"
  decision_generic:                     false, // Shows all products, LLM decides freely
  confidence_challenge_defense:         true,  // "PRODUTO RECOMENDADO: ${anchorTitle}"
};

// ─────────────────────────────────────────────────────────────
// Product extraction from reply text
// ─────────────────────────────────────────────────────────────

function normalizeText(s = "") {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function extractMentionedProductNames(reply = "", allProducts = []) {
  const norm = normalizeText(reply);
  return allProducts
    .filter(p => {
      if (!p?.product_name) return false;
      const key = normalizeText(p.product_name);
      const words = key.split(" ").slice(0, 4).join(" ");
      return norm.includes(words) || norm.includes(key);
    })
    .map(p => p.product_name);
}

const RECOMMENDATION_PATTERNS = [
  /eu\s+iria\s+no\s+([^\n.,!?]{3,80})/i,
  /eu\s+compraria\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /recomendo\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /o\s+celular\s+que\s+d[aá]\s+menos\s+dor\s+de\s+cabe[cç]a\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /o\s+mais\s+confi[aá]vel\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /o\s+mais\s+seguro\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /a\s+melhor\s+op[cç][aã]o\s+[eé]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /fico\s+com\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
  /indica[oõ]\s+(?:o\s+|a\s+)?([^\n.,!?]{3,80})/i,
];

function extractVerbalizedRecommendation(reply = "") {
  for (const re of RECOMMENDATION_PATTERNS) {
    const m = reply.match(re);
    if (m?.[1]) return m[1].trim().replace(/[.,!?]+$/, "").trim();
  }
  return null;
}

function authorizedWinnerMentionedInReply(reply = "", authorizedWinner = "") {
  if (!authorizedWinner || !reply) return false;
  const normReply   = normalizeText(reply);
  const normWinner  = normalizeText(authorizedWinner);

  // Full name match
  if (normReply.includes(normWinner)) return true;

  // First 4 words (e.g. "samsung galaxy s23 fe")
  const words4 = normWinner.split(" ").slice(0, 4).join(" ");
  if (words4.length > 5 && normReply.includes(words4)) return true;

  // Sliding 3-word windows — catches "Galaxy S23 FE" from "Samsung Galaxy S23 FE"
  // and similar abbreviated product names the LLM commonly uses.
  const words = normWinner.split(" ");
  for (let i = 0; i <= words.length - 3; i++) {
    const window3 = words.slice(i, i + 3).join(" ");
    if (window3.length > 5 && normReply.includes(window3)) return true;
  }

  // 2-word window for very short product names (e.g. "iPhone 13", "Pixel 8")
  for (let i = 0; i <= words.length - 2; i++) {
    const window2 = words.slice(i, i + 2).join(" ");
    if (window2.length > 5 && normReply.includes(window2)) return true;
  }

  return false;
}

function productMatchesWinner(productText = "", winnerName = "") {
  if (!productText || !winnerName) return false;
  const normText   = normalizeText(productText);
  const normWinner = normalizeText(winnerName);
  if (normText.includes(normWinner) || normWinner.includes(normText)) return true;
  // 3-word window
  const words = normWinner.split(" ");
  for (let i = 0; i <= words.length - 3; i++) {
    const w = words.slice(i, i + 3).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  // 2-word window
  for (let i = 0; i <= words.length - 2; i++) {
    const w = words.slice(i, i + 2).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Static prompt template analysis
// ─────────────────────────────────────────────────────────────

function analyzePromptInputStage({
  turnType,
  routingMode,
  contextAction,
  hasAnchor,
  authorizedWinner,
  allProducts,
}) {
  const template = resolveExpectedPromptTemplate(turnType, routingMode, contextAction, hasAnchor);
  const pinsWinner = TEMPLATE_PINS_AUTHORIZED_WINNER[template] ?? false;
  const flags = [];
  const violations = [];

  if (!pinsWinner) {
    flags.push(FLAGS.PROMPT_MISSING_ANCHOR_CONSTRAINT);
    violations.push("PROMPT_MISSING_ANCHOR_CONSTRAINT");
  }

  if (!authorizedWinner) {
    flags.push(FLAGS.PROMPT_MISSING_AUTHORIZED_WINNER);
    violations.push("PROMPT_MISSING_AUTHORIZED_WINNER");
  }

  // Check if allProducts contains products that could redirect the LLM
  const hasMultipleProducts = allProducts.length > 1;

  return {
    template,
    pinsWinner,
    hasMultipleProducts,
    productCount: allProducts.length,
    flags,
    violations,
    risk: !pinsWinner && hasMultipleProducts ? "HIGH" : !pinsWinner ? "MEDIUM" : "LOW",
  };
}

// ─────────────────────────────────────────────────────────────
// Final reply analysis
// ─────────────────────────────────────────────────────────────

function analyzeFinalReply({
  reply,
  authorizedWinner,
  allProducts,
  allowReplaceWinner,
}) {
  const flags = [];
  const violations = [];

  const winnerMentioned  = authorizedWinnerMentionedInReply(reply, authorizedWinner);
  const verbalizedRec    = extractVerbalizedRecommendation(reply);
  const mentionedNames   = extractMentionedProductNames(reply, allProducts);
  const recMatchesWinner = verbalizedRec
    ? productMatchesWinner(verbalizedRec, authorizedWinner)
    : null;

  if (!winnerMentioned) {
    flags.push(FLAGS.AUTHORIZED_WINNER_MISSING_IN_FINAL_REPLY);
    violations.push("AUTHORIZED_WINNER_NOT_MENTIONED");
  }

  if (verbalizedRec && recMatchesWinner === false && !allowReplaceWinner) {
    flags.push(FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION);
    flags.push(FLAGS.UNAUTHORIZED_PRODUCT_RECOMMENDED);
    violations.push("UNAUTHORIZED_WINNER_VERBALIZED");
  }

  if (verbalizedRec && recMatchesWinner === false) {
    flags.push(FLAGS.LLM_REDIRECTED_TO_UNAUTHORIZED_PRODUCT);
    violations.push("LLM_REDIRECTED_DECISION");
  }

  return {
    winnerMentioned,
    verbalizedRecommendation: verbalizedRec,
    mentionedProductNames: mentionedNames,
    recMatchesWinner,
    flags,
    violations,
  };
}

// ─────────────────────────────────────────────────────────────
// Leak stage classifier
// ─────────────────────────────────────────────────────────────

function classifyLeakStage(promptAnalysis, replyAnalysis) {
  if (promptAnalysis.violations.length > 0 && replyAnalysis.violations.length > 0) {
    return "PROMPT_INPUT_STAGE";
  }
  if (promptAnalysis.violations.length === 0 && replyAnalysis.violations.length > 0) {
    return "LLM_RAW_REPLY_STAGE";
  }
  if (promptAnalysis.violations.length > 0 && replyAnalysis.violations.length === 0) {
    return "PROMPT_INPUT_STAGE (risk present but LLM correct)";
  }
  return "NONE — verbalization ok";
}

// ─────────────────────────────────────────────────────────────
// Build full audit record
// ─────────────────────────────────────────────────────────────

function buildAuditRecord({
  scenarioLabel,
  query,
  turnNumber,
  turnType,
  routingMode,
  contextAction,
  allowReplaceWinner,
  shouldPreserveAnchor,
  anchorPreserved,
  authorizedWinner,
  anchorProduct,
  allProducts,
  reply,
}) {
  const promptAnalysis = analyzePromptInputStage({
    turnType,
    routingMode,
    contextAction,
    hasAnchor: !!authorizedWinner,
    authorizedWinner,
    allProducts,
  });

  const replyAnalysis = analyzeFinalReply({
    reply,
    authorizedWinner,
    allProducts,
    allowReplaceWinner,
  });

  const leakStage = classifyLeakStage(promptAnalysis, replyAnalysis);
  const allFlags  = [...new Set([...promptAnalysis.flags, ...replyAnalysis.flags])];
  const allViolations = [...new Set([...promptAnalysis.violations, ...replyAnalysis.violations])];

  const winnerVerbalizationOk =
    replyAnalysis.winnerMentioned && replyAnalysis.violations.length === 0;

  return {
    scenarioLabel,
    query,
    turnNumber,
    cognitiveTurnType: turnType,
    routingMode,
    responsePath: contextAction || "unknown",
    allowReplaceWinner: allowReplaceWinner ?? null,
    shouldPreserveAnchor: shouldPreserveAnchor ?? null,
    anchorPreserved: anchorPreserved ?? null,
    authorizedWinner: authorizedWinner || null,
    anchorProduct: anchorProduct || null,
    finalResponseProduct: replyAnalysis.verbalizedRecommendation,
    mentionedProductNames: replyAnalysis.mentionedProductNames,
    promptTemplate: promptAnalysis.template,
    promptPinsWinner: promptAnalysis.pinsWinner,
    promptRisk: promptAnalysis.risk,
    productCount: promptAnalysis.productCount,
    winnerMentionedInReply: replyAnalysis.winnerMentioned,
    verbalizedRecommendation: replyAnalysis.verbalizedRecommendation,
    recMatchesWinner: replyAnalysis.recMatchesWinner,
    finalReplyPreview: (reply || "").slice(0, 180),
    winnerVerbalizationOk,
    violations: allViolations,
    leakStage,
    flags: allFlags,
  };
}

// ─────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────

let total = 0, passed = 0, failed = 0;
const auditRecords = [];
const failures = [];

function section(title) {
  console.log(`\n${"─".repeat(66)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(66));
}

function auditTest(label, fn) {
  total++;
  try {
    const r = fn();
    if (r.ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`);
      if (r.detail) console.log(`      detail: ${r.detail}`);
      failures.push({ label, ...r });
    }
    if (r.record) auditRecords.push(r.record);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      ERROR: ${err.message}`);
    failures.push({ label, detail: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// GRUPO A — STATIC: Prompt template risk per turn type
// ─────────────────────────────────────────────────────────────
section("Grupo A — STATIC: Prompt template risk por turnType");

const P1 = { product_name: "Samsung Galaxy S23 FE", price: "R$ 2.199", rank: 1, score: 0.91, isWinner: true };
const P2 = { product_name: "iPhone 13",              price: "R$ 2.399", rank: 2, score: 0.83 };
const P3 = { product_name: "Redmi Note 13 Pro",      price: "R$ 1.299", rank: 3, score: 0.72 };

const ALL_PRODUCTS = [P1, P2, P3];
const AUTHORIZED_WINNER = P1.product_name;

const STATIC_SCENARIOS = [
  // (turnType, routingMode, contextAction, label, expectPinsWinner)
  ["OBJECTION",           "anchored_reaction",   "context_hold",      "OBJECTION / hesitation",         true ],
  ["ALTERNATIVE_REQUEST", "anchored_reaction",   "context_hold",      "ALTERNATIVE_REQUEST / ranking",  true ],
  ["REFINEMENT",          "anchored_reaction",   "context_hold",      "REFINEMENT",                     true ],
  ["EXPLANATION_REQUEST", "cognitive_anchor_hold","context_hold",     "EXPLANATION_REQUEST (rich path)", true ],
  ["PRIORITY_SHIFT",      "anchored_reaction",   "context_hold",      "PRIORITY_SHIFT / safety query",  false], // ← risk
  ["FOLLOW_UP",           "anchored_reaction",   "context_hold",      "FOLLOW_UP",                      false], // ← risk
  ["UNKNOWN",             "context_decision",    "decision",          "UNKNOWN / decision generic",     false], // ← risk
];

for (const [turnType, routingMode, contextAction, label, expectPins] of STATIC_SCENARIOS) {
  auditTest(`A — ${label}: prompt pins winner = ${expectPins}`, () => {
    const analysis = analyzePromptInputStage({
      turnType, routingMode, contextAction,
      hasAnchor: true,
      authorizedWinner: AUTHORIZED_WINNER,
      allProducts: ALL_PRODUCTS,
    });
    const record = buildAuditRecord({
      scenarioLabel: `A — ${label}`,
      query: `(static: ${label})`,
      turnNumber: 2,
      turnType, routingMode, contextAction,
      allowReplaceWinner: false,
      shouldPreserveAnchor: true,
      anchorPreserved: true,
      authorizedWinner: AUTHORIZED_WINNER,
      anchorProduct: AUTHORIZED_WINNER,
      allProducts: ALL_PRODUCTS,
      reply: `Referente ao ${AUTHORIZED_WINNER}, ele é uma boa opção.`,
    });
    return {
      ok: analysis.pinsWinner === expectPins,
      detail: `template="${analysis.template}", pins=${analysis.pinsWinner} (want: ${expectPins}), risk=${analysis.risk}`,
      record,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO B — STATIC: anchorTitle resolution chain
// ─────────────────────────────────────────────────────────────
section("Grupo B — STATIC: anchorTitle resolution chain (buildExplanationContext)");

const FULL_SESSION = {
  lastBestProduct: { product_name: P1.product_name, price: P1.price },
  lastProductMentioned: P1.product_name,
  lastProducts: ALL_PRODUCTS,
  lastRankingSnapshot: [
    { product_name: P1.product_name, rank: 1, score: 0.91, isWinner: true },
    { product_name: P2.product_name, rank: 2, score: 0.83 },
    { product_name: P3.product_name, rank: 3, score: 0.72 },
  ],
  lastCategory: "celular",
  lastIntent: "search",
  lastInteractionType: "search",
  lastPriority: "",
  lastAxis: "custo-beneficio",
  lastMainConsequence: "equilibrio entre preco e desempenho",
  lastTradeoff: "sem fone de ouvido na caixa",
};

auditTest("B.1 — anchorTitle resolve corretamente de preferredProductName", () => {
  const ctx = buildExplanationContext(FULL_SESSION, P1.product_name, "");
  return {
    ok: ctx.anchorTitle === P1.product_name,
    detail: `anchorTitle = "${ctx.anchorTitle}"`,
  };
});

auditTest("B.2 — anchorTitle resolve de lastBestProduct quando preferredProductName vazio", () => {
  const ctx = buildExplanationContext(FULL_SESSION, "", "");
  return {
    ok: ctx.anchorTitle === P1.product_name,
    detail: `anchorTitle = "${ctx.anchorTitle}"`,
  };
});

auditTest("B.3 — anchorTitle cai em 'produto recomendado' quando sessionContext sem anchor", () => {
  const ctx = buildExplanationContext({}, "", "");
  return {
    ok: ctx.anchorTitle === "produto recomendado",
    detail: `anchorTitle = "${ctx.anchorTitle}"`,
  };
});

auditTest("B.4 — shouldUseRichExplanationPath = true apenas para cognitive_anchor_hold", () => {
  const holdMode  = shouldUseRichExplanationPath({ mode: "cognitive_anchor_hold" });
  const otherMode = shouldUseRichExplanationPath({ mode: "anchored_reaction" });
  const decMode   = shouldUseRichExplanationPath({ mode: "context_decision" });
  return {
    ok: holdMode === true && otherMode === false && decMode === false,
    detail: `hold=${holdMode}, anchored=${otherMode}, decision=${decMode}`,
  };
});

auditTest("B.5 — PRIORITY_SHIFT NÃO ativa cognitive_anchor_hold → usa template genérico (RISK)", () => {
  // For PRIORITY_SHIFT, routingDecision.mode is expected to be "anchored_reaction"
  // (set by PATCH 6.2/6.3 interceptors via context_hold), NOT cognitive_anchor_hold.
  // So shouldUseRichExplanationPath returns false → decision_generic template is used.
  // This template shows all products without pinning the authorized winner.
  const priorityShiftMode = "anchored_reaction"; // Expected mode for PRIORITY_SHIFT
  const richActive = shouldUseRichExplanationPath({ mode: priorityShiftMode });
  const template = resolveExpectedPromptTemplate(
    "PRIORITY_SHIFT", priorityShiftMode, "context_hold", true
  );
  return {
    ok: richActive === false && template === "decision_generic",
    detail: `richActive=${richActive}, template="${template}" → LLM can choose freely (RISK CONFIRMED)`,
  };
});

auditTest("B.6 — FOLLOW_UP NÃO ativa nenhum template ancorado → usa template genérico (RISK)", () => {
  const followUpMode = "anchored_reaction";
  const richActive = shouldUseRichExplanationPath({ mode: followUpMode });
  const template = resolveExpectedPromptTemplate("FOLLOW_UP", followUpMode, "context_hold", true);
  return {
    ok: richActive === false && template === "decision_generic",
    detail: `richActive=${richActive}, template="${template}" → LLM can choose freely (RISK CONFIRMED)`,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO C — STATIC: Product extraction from reply text
// ─────────────────────────────────────────────────────────────
section("Grupo C — STATIC: Product extraction e winnerMentioned detection");

auditTest("C.1 — Winner mencionado na reply pelo nome exato", () => {
  const reply = `O ${P1.product_name} tem o melhor custo-benefício para o seu caso.`;
  const ok = authorizedWinnerMentionedInReply(reply, P1.product_name);
  return { ok, detail: `mentioned=${ok}, winner="${P1.product_name}"` };
});

auditTest("C.2 — extractVerbalizedRecommendation detecta 'eu iria no'", () => {
  const reply = `Eu iria no ${P1.product_name}. Porque pensando em custo-benefício, ele faz sentido.`;
  const rec = extractVerbalizedRecommendation(reply);
  const ok = rec && normalizeText(rec).includes(normalizeText(P1.product_name).slice(0, 15));
  return { ok, detail: `extracted="${rec}"` };
});

auditTest("C.3 — extractVerbalizedRecommendation detecta 'o celular que dá menos dor de cabeça'", () => {
  const reply = `O celular que dá menos dor de cabeça é o ${P2.product_name}. Ele é mais simples de usar.`;
  const rec = extractVerbalizedRecommendation(reply);
  const ok = rec && normalizeText(rec).includes(normalizeText(P2.product_name).slice(0, 10));
  return { ok, detail: `extracted="${rec}"` };
});

auditTest("C.4 — Violação detectada: LLM verbalizou P2 quando authorized é P1", () => {
  const reply = `O celular que dá menos dor de cabeça é o ${P2.product_name}. Ele é mais simples.`;
  const replyAnalysis = analyzeFinalReply({
    reply,
    authorizedWinner: P1.product_name,
    allProducts: ALL_PRODUCTS,
    allowReplaceWinner: false,
  });
  const hasViolation = replyAnalysis.violations.includes("UNAUTHORIZED_WINNER_VERBALIZED") ||
                       replyAnalysis.violations.includes("LLM_REDIRECTED_DECISION");
  return {
    ok: hasViolation,
    detail: `violations=${replyAnalysis.violations.join(",")} flags=${replyAnalysis.flags.map(f=>f.slice(0,30)).join(",")}`,
  };
});

auditTest("C.5 — Sem violação: LLM verbalizou corretamente o winner autorizado", () => {
  const reply = `O ${P1.product_name} dá menos dor de cabeça pela simplicidade do ecosistema e suporte.`;
  const replyAnalysis = analyzeFinalReply({
    reply,
    authorizedWinner: P1.product_name,
    allProducts: ALL_PRODUCTS,
    allowReplaceWinner: false,
  });
  return {
    ok: replyAnalysis.violations.length === 0 && replyAnalysis.winnerMentioned,
    detail: `violations=${replyAnalysis.violations.length}, winnerMentioned=${replyAnalysis.winnerMentioned}`,
  };
});

auditTest("C.6 — Leak stage PROMPT_INPUT_STAGE quando template não pina winner E reply diverge", () => {
  const promptA = analyzePromptInputStage({
    turnType: "PRIORITY_SHIFT", routingMode: "anchored_reaction", contextAction: "context_hold",
    hasAnchor: true, authorizedWinner: P1.product_name, allProducts: ALL_PRODUCTS,
  });
  const replyA = analyzeFinalReply({
    reply: `O celular que dá menos dor de cabeça é o ${P2.product_name}.`,
    authorizedWinner: P1.product_name,
    allProducts: ALL_PRODUCTS,
    allowReplaceWinner: false,
  });
  const stage = classifyLeakStage(promptA, replyA);
  return {
    ok: stage === "PROMPT_INPUT_STAGE",
    detail: `leakStage="${stage}"`,
  };
});

auditTest("C.7 — Leak stage LLM_RAW_REPLY_STAGE quando template pina winner E reply diverge", () => {
  const promptA = analyzePromptInputStage({
    turnType: "OBJECTION", routingMode: "anchored_reaction", contextAction: "context_hold",
    hasAnchor: true, authorizedWinner: P1.product_name, allProducts: ALL_PRODUCTS,
  });
  const replyA = analyzeFinalReply({
    reply: `Eu entendo a dúvida. Mas pensando bem, o ${P2.product_name} é melhor para você.`,
    authorizedWinner: P1.product_name,
    allProducts: ALL_PRODUCTS,
    allowReplaceWinner: false,
  });
  const stage = classifyLeakStage(promptA, replyA);
  return {
    ok: stage === "LLM_RAW_REPLY_STAGE",
    detail: `leakStage="${stage}" (prompt OK → LLM diverged)`,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO D — STATIC: Full audit record structure
// ─────────────────────────────────────────────────────────────
section("Grupo D — STATIC: Estrutura completa do audit record");

auditTest("D.1 — Audit record para PRIORITY_SHIFT com violação documenta PROMPT_INPUT_STAGE", () => {
  const reply = `O celular que dá menos dor de cabeça é o ${P2.product_name}. É mais simples de usar.`;
  const record = buildAuditRecord({
    scenarioLabel: "D — PRIORITY_SHIFT violation",
    query: "qual da menos dor de cabeca",
    turnNumber: 2,
    turnType: "PRIORITY_SHIFT",
    routingMode: "anchored_reaction",
    contextAction: "context_hold",
    allowReplaceWinner: false,
    shouldPreserveAnchor: true,
    anchorPreserved: true,
    authorizedWinner: P1.product_name,
    anchorProduct: P1.product_name,
    allProducts: ALL_PRODUCTS,
    reply,
  });
  return {
    ok: record.leakStage === "PROMPT_INPUT_STAGE" &&
        record.flags.includes(FLAGS.PROMPT_MISSING_ANCHOR_CONSTRAINT) &&
        record.flags.includes(FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION),
    detail: `leakStage="${record.leakStage}", flags=${record.flags.length}`,
    record,
  };
});

auditTest("D.2 — Audit record para OBJECTION com reply correto: zero violations", () => {
  const reply = `Entendo a preocupação. Mas o ${P1.product_name} ainda faz sentido no seu orçamento por causa do custo-benefício.`;
  const record = buildAuditRecord({
    scenarioLabel: "D — OBJECTION ok",
    query: "nao to sentindo confianca",
    turnNumber: 2,
    turnType: "OBJECTION",
    routingMode: "anchored_reaction",
    contextAction: "context_hold",
    allowReplaceWinner: false,
    shouldPreserveAnchor: true,
    anchorPreserved: true,
    authorizedWinner: P1.product_name,
    anchorProduct: P1.product_name,
    allProducts: ALL_PRODUCTS,
    reply,
  });
  return {
    ok: record.violations.length === 0 && record.winnerVerbalizationOk,
    detail: `violations=${record.violations.length}, ok=${record.winnerVerbalizationOk}`,
    record,
  };
});

// ─────────────────────────────────────────────────────────────
// GRUPO E — HTTP: Real multi-turn scenario audit
// ─────────────────────────────────────────────────────────────
section("Grupo E — HTTP: Cenários reais multi-turn (requer servidor localhost:3000)");

const API_BASE     = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const HTTP_ENABLED = !!(process.env.MIA_STATE_AUDIT);

if (!HTTP_ENABLED) {
  console.log(`\n  ⚠  Testes HTTP desativados.`);
  console.log(`     Ative com: MIA_STATE_AUDIT=true node scripts/test-mia-winner-verbalization-integrity-audit.js`);
  console.log(`     (O servidor deve estar rodando em ${API_BASE})`);
}

let _conversationId = `wvi-audit-${Date.now()}`;

async function httpTurn(query, session_context = {}, conversationMessages = [], turnLabel = "") {
  const messages = [
    ...conversationMessages,
    { role: "user", content: query },
  ];
  const body = {
    text: query,
    image_base64: "",
    user_id: "winner-verbalization-audit",
    conversation_id: _conversationId,
    messages,
    session_context,
  };
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "minha_chave_181199",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} on ${turnLabel}`);
  return resp.json();
}

async function runScenario(scenarioLabel, turns) {
  // turns: [{ query, label }]
  // Executes multi-turn chain, accumulates session_context and conversationMessages
  let session_context = {};
  let conversationMessages = [];
  const turnResults = [];

  for (let i = 0; i < turns.length; i++) {
    const { query, label } = turns[i];
    const turnLabel = `${scenarioLabel} T${i + 1}: ${label}`;
    try {
      const data = await httpTurn(query, session_context, conversationMessages, turnLabel);
      conversationMessages = [
        ...conversationMessages,
        { role: "user", content: query },
        { role: "assistant", content: data.reply || "" },
      ];
      session_context = data.session_context || {};
      turnResults.push({ turnLabel, query, data, session_context, ok: true });
    } catch (err) {
      turnResults.push({ turnLabel, query, data: null, session_context, ok: false, error: err.message });
    }
  }

  return turnResults;
}

async function httpAuditTest(scenarioLabel, turns, finalTurnIdx, auditFn) {
  total++;
  if (!HTTP_ENABLED) {
    console.log(`  ○ ${scenarioLabel} [HTTP — skipped]`);
    return;
  }

  try {
    const results = await runScenario(scenarioLabel, turns);
    const finalTurn = results[finalTurnIdx];

    if (!finalTurn?.ok) {
      failed++;
      console.log(`  ✗ ${scenarioLabel}`);
      console.log(`      HTTP ERROR: ${finalTurn?.error || "unknown"}`);
      failures.push({ label: scenarioLabel, detail: finalTurn?.error });
      return;
    }

    const result = auditFn(finalTurn, results);
    if (result.record) auditRecords.push(result.record);

    if (result.ok) {
      passed++;
      console.log(`  ✓ ${scenarioLabel}`);
    } else {
      failed++;
      console.log(`  ✗ ${scenarioLabel}`);
      if (result.detail) console.log(`      detail: ${result.detail}`);
      if (result.record?.leakStage) console.log(`      leakStage: ${result.record.leakStage}`);
      if (result.record?.violations?.length) console.log(`      violations: ${result.record.violations.join(", ")}`);
      failures.push({ label: scenarioLabel, ...result });
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${scenarioLabel}`);
    console.log(`      ERROR: ${err.message}`);
    failures.push({ label: scenarioLabel, detail: err.message });
  }
}

// ── Cenário 1 — Safety / dor de cabeça ────────────────────────────────────
_conversationId = `wvi-c1-${Date.now()}`;
await httpAuditTest(
  "E.1 — Cenário 1 Safety: 'qual dá menos dor de cabeça?' preserva winner autorizado",
  [
    { query: "celular ate 2500",                 label: "Turn 1: busca" },
    { query: "me mostra os tres que mais fizeram sentido", label: "Turn 2: top 3" },
    { query: "qual da menos dor de cabeca",       label: "Turn 3: priority shift" },
    { query: "fala simples",                      label: "Turn 4: simplify" },
  ],
  3, // audit Turn 4 (fala simples)
  (finalTurn, allTurns) => {
    const sc = finalTurn.data.session_context || {};
    const authorizedWinner = sc.lastBestProduct?.product_name || null;
    const products = allTurns[0]?.data?.session_context?.lastProducts ||
                     sc.lastProducts || [];
    const t3Products = allTurns[1]?.data?.session_context?.lastProducts || products;

    const record = buildAuditRecord({
      scenarioLabel: "Cenário 1 — Safety/dor de cabeça (Turn 4: fala simples)",
      query: finalTurn.query,
      turnNumber: 4,
      turnType: "EXPLANATION_REQUEST",
      routingMode: finalTurn.data.session_context?.lastInteractionType || "unknown",
      contextAction: "context_hold",
      allowReplaceWinner: false,
      shouldPreserveAnchor: true,
      anchorPreserved: !!authorizedWinner,
      authorizedWinner,
      anchorProduct: allTurns[0]?.data?.session_context?.lastBestProduct?.product_name || null,
      allProducts: t3Products,
      reply: finalTurn.data.reply || "",
    });

    console.log(`      Turn 1 winner: ${allTurns[0]?.data?.session_context?.lastBestProduct?.product_name || "?"}`);
    console.log(`      Turn 3 winner: ${allTurns[2]?.data?.session_context?.lastBestProduct?.product_name || "?"}`);
    console.log(`      Turn 4 winner: ${authorizedWinner || "?"}`);
    console.log(`      Turn 4 reply: "${(finalTurn.data.reply || "").slice(0, 120)}"`);

    return {
      ok: record.winnerVerbalizationOk || record.violations.length === 0,
      detail: `authorizedWinner="${authorizedWinner}", leakStage="${record.leakStage}", template="${record.promptTemplate}"`,
      record,
    };
  }
);

// ── Cenário 2 — Alternative ranking ───────────────────────────────────────
_conversationId = `wvi-c2-${Date.now()}`;
await httpAuditTest(
  "E.2 — Cenário 2 Alternative: 'quem ficou logo atrás? e o terceiro?' preserva snapshot",
  [
    { query: "celular ate 2500",        label: "Turn 1: busca" },
    { query: "quem ficou logo atras",   label: "Turn 2: runner-up" },
    { query: "e o terceiro",            label: "Turn 3: rank 3" },
    { query: "fala simples",            label: "Turn 4: simplify" },
  ],
  2, // audit Turn 3 (e o terceiro)
  (finalTurn, allTurns) => {
    const sc = finalTurn.data.session_context || {};
    const authorizedWinner = sc.lastBestProduct?.product_name ||
                             allTurns[0]?.data?.session_context?.lastBestProduct?.product_name || null;
    const products = allTurns[0]?.data?.session_context?.lastProducts || sc.lastProducts || [];

    const record = buildAuditRecord({
      scenarioLabel: "Cenário 2 — Alternative ranking (Turn 3: e o terceiro)",
      query: finalTurn.query,
      turnNumber: 3,
      turnType: "ALTERNATIVE_REQUEST",
      routingMode: sc.lastInteractionType || "unknown",
      contextAction: "context_hold",
      allowReplaceWinner: true, // alternatives are allowed to mention runner-ups
      shouldPreserveAnchor: true,
      anchorPreserved: !!sc.lastBestProduct?.product_name,
      authorizedWinner,
      anchorProduct: allTurns[0]?.data?.session_context?.lastBestProduct?.product_name || null,
      allProducts: products,
      reply: finalTurn.data.reply || "",
    });

    console.log(`      Turn 1 winner: ${allTurns[0]?.data?.session_context?.lastBestProduct?.product_name || "?"}`);
    console.log(`      Turn 3 anchor preserved: ${!!sc.lastBestProduct?.product_name}`);
    console.log(`      Turn 3 reply: "${(finalTurn.data.reply || "").slice(0, 120)}"`);

    return {
      ok: !!sc.lastBestProduct?.product_name,
      detail: `anchor preserved: ${!!sc.lastBestProduct?.product_name}, leakStage="${record.leakStage}"`,
      record,
    };
  }
);

// ── Cenário 3 — Objection / hesitation ────────────────────────────────────
_conversationId = `wvi-c3-${Date.now()}`;
await httpAuditTest(
  "E.3 — Cenário 3 Objection: 'não tô sentindo confiança' + 'fala simples' preserva winner",
  [
    { query: "celular ate 2500",           label: "Turn 1: busca" },
    { query: "nao to sentindo confianca",  label: "Turn 2: objection" },
    { query: "fala simples",               label: "Turn 3: simplify" },
  ],
  2, // audit Turn 3
  (finalTurn, allTurns) => {
    const sc = finalTurn.data.session_context || {};
    const turn1Winner = allTurns[0]?.data?.session_context?.lastBestProduct?.product_name;
    const authorizedWinner = sc.lastBestProduct?.product_name || turn1Winner || null;
    const products = allTurns[0]?.data?.session_context?.lastProducts || sc.lastProducts || [];

    const record = buildAuditRecord({
      scenarioLabel: "Cenário 3 — Objection (Turn 3: fala simples)",
      query: finalTurn.query,
      turnNumber: 3,
      turnType: "EXPLANATION_REQUEST",
      routingMode: sc.lastInteractionType || "unknown",
      contextAction: "context_hold",
      allowReplaceWinner: false,
      shouldPreserveAnchor: true,
      anchorPreserved: !!sc.lastBestProduct?.product_name,
      authorizedWinner,
      anchorProduct: turn1Winner || null,
      allProducts: products,
      reply: finalTurn.data.reply || "",
    });

    console.log(`      Turn 1 winner: ${turn1Winner || "?"}`);
    console.log(`      Turn 3 winner: ${authorizedWinner || "?"}`);
    console.log(`      Anchor match: ${authorizedWinner === turn1Winner}`);
    console.log(`      Turn 3 reply: "${(finalTurn.data.reply || "").slice(0, 120)}"`);

    return {
      ok: record.winnerVerbalizationOk || record.violations.length === 0,
      detail: `authorizedWinner="${authorizedWinner}", template="${record.promptTemplate}", violations="${record.violations.join(",") || "none"}"`,
      record,
    };
  }
);

// ── Cenário 4 — Priority Shift / Safety ───────────────────────────────────
_conversationId = `wvi-c4-${Date.now()}`;
await httpAuditTest(
  "E.4 — Cenário 4 Priority Shift: 'qual é mais seguro?' verbaliza winner autorizado",
  [
    { query: "celular ate 2500",   label: "Turn 1: busca" },
    { query: "qual e mais seguro", label: "Turn 2: priority shift" },
  ],
  1, // audit Turn 2
  (finalTurn, allTurns) => {
    const sc = finalTurn.data.session_context || {};
    const turn1Winner = allTurns[0]?.data?.session_context?.lastBestProduct?.product_name;
    const authorizedWinner = turn1Winner || null; // Turn 1 winner is the anchor
    const products = allTurns[0]?.data?.session_context?.lastProducts || sc.lastProducts || [];

    const record = buildAuditRecord({
      scenarioLabel: "Cenário 4 — Priority Shift / 'qual é mais seguro?' (Turn 2)",
      query: finalTurn.query,
      turnNumber: 2,
      turnType: "PRIORITY_SHIFT",
      routingMode: sc.lastInteractionType || "unknown",
      contextAction: "context_hold",
      allowReplaceWinner: false,
      shouldPreserveAnchor: true,
      anchorPreserved: !!sc.lastBestProduct?.product_name,
      authorizedWinner,
      anchorProduct: turn1Winner || null,
      allProducts: products,
      reply: finalTurn.data.reply || "",
    });

    console.log(`      Turn 1 winner: ${turn1Winner || "?"}`);
    console.log(`      Turn 2 winner in session: ${sc.lastBestProduct?.product_name || "?"}`);
    console.log(`      Prompt template (static): ${record.promptTemplate}`);
    console.log(`      Prompt pins winner: ${record.promptPinsWinner}`);
    console.log(`      Verbalized rec: "${record.verbalizedRecommendation || "(not extracted)"}"`);
    console.log(`      Winner mentioned: ${record.winnerMentionedInReply}`);
    console.log(`      Turn 2 reply: "${(finalTurn.data.reply || "").slice(0, 150)}"`);

    return {
      ok: record.winnerVerbalizationOk,
      detail: [
        `authorizedWinner="${authorizedWinner}"`,
        `template="${record.promptTemplate}"`,
        `pinsWinner=${record.promptPinsWinner}`,
        `winnerMentioned=${record.winnerMentionedInReply}`,
        `violations="${record.violations.join(",") || "none"}"`,
        `leakStage="${record.leakStage}"`,
      ].join(", "),
      record,
    };
  }
);

// ─────────────────────────────────────────────────────────────
// RELATÓRIO FINAL
// ─────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(66)}`);
console.log(`  PATCH 7.6M — Winner Verbalization Integrity Audit`);
console.log(`${"═".repeat(66)}`);
console.log(`  Total   : ${total}${HTTP_ENABLED ? "" : " (HTTP skipped)"}`);
console.log(`  Passed  : ${passed}`);
console.log(`  Failed  : ${failed}`);

// Tabela de audit records HTTP
if (HTTP_ENABLED && auditRecords.filter(r => r.scenarioLabel?.startsWith("Cenário")).length > 0) {
  const httpRecords = auditRecords.filter(r => r.scenarioLabel?.startsWith("Cenário"));
  console.log(`\n  ┌─────────────────────────────────────────────────────────────┐`);
  console.log(`  │  TABELA DE VERBALIZATION AUDIT                              │`);
  console.log(`  ├──────────────────────┬─────────────────┬──────────┬─────────┤`);
  console.log(`  │ Cenário              │ Authorized Win  │ Template │ OK?     │`);
  console.log(`  ├──────────────────────┼─────────────────┼──────────┼─────────┤`);
  for (const r of httpRecords) {
    const sc  = (r.scenarioLabel || "").slice(0, 20).padEnd(20);
    const aw  = (r.authorizedWinner || "?").slice(0, 15).padEnd(15);
    const tpl = (r.promptTemplate || "?").slice(0, 8).padEnd(8);
    const ok  = r.winnerVerbalizationOk ? "✓ OK    " : "✗ FAIL  ";
    console.log(`  │ ${sc} │ ${aw} │ ${tpl} │ ${ok}│`);
  }
  console.log(`  └──────────────────────┴─────────────────┴──────────┴─────────┘`);

  // Violations summary
  const allViolations = httpRecords.flatMap(r => r.violations || []);
  const allFlags = httpRecords.flatMap(r => r.flags?.map(f => String(f)) || []);
  const uniqueViolations = [...new Set(allViolations)];
  const uniqueFlags = [...new Set(allFlags)];

  if (uniqueViolations.length > 0) {
    console.log(`\n  VIOLATION TYPES DETECTADOS:`);
    uniqueViolations.forEach(v => console.log(`    ⚑  ${v}`));
  }
  if (uniqueFlags.length > 0) {
    console.log(`\n  FLAGS DETECTADAS:`);
    uniqueFlags.forEach(f => console.log(`    ⚑  ${f}`));
  }

  // Leak stages
  const leakStages = [...new Set(httpRecords.map(r => r.leakStage).filter(Boolean))];
  if (leakStages.length > 0) {
    console.log(`\n  LEAK STAGES:`);
    leakStages.forEach(s => console.log(`    ↳  ${s}`));
  }

  // Full records
  console.log(`\n  DETALHES POR CENÁRIO:`);
  for (const r of httpRecords) {
    console.log(`\n  ─── ${r.scenarioLabel} ───`);
    console.log(`    turnType:           ${r.cognitiveTurnType}`);
    console.log(`    promptTemplate:     ${r.promptTemplate}`);
    console.log(`    pinsWinner:         ${r.promptPinsWinner}`);
    console.log(`    promptRisk:         ${r.promptRisk}`);
    console.log(`    authorizedWinner:   ${r.authorizedWinner || "null"}`);
    console.log(`    verbalizedRec:      ${r.verbalizedRecommendation || "(not extracted)"}`);
    console.log(`    winnerMentioned:    ${r.winnerMentionedInReply}`);
    console.log(`    recMatchesWinner:   ${r.recMatchesWinner}`);
    console.log(`    violations:         ${r.violations.join(", ") || "none"}`);
    console.log(`    leakStage:          ${r.leakStage}`);
    console.log(`    finalReplyPreview:  "${r.finalReplyPreview}"`);
  }
}

// Static risk summary
console.log(`\n  RISK MAP (Static — Prompt template per turnType):`);
for (const [turnType, routingMode, , label, expectPins] of STATIC_SCENARIOS) {
  const template = resolveExpectedPromptTemplate(turnType, routingMode, "context_hold", true);
  const risk = expectPins ? "LOW " : "HIGH";
  console.log(`    [${risk}] ${label.padEnd(38)} → ${template}`);
}

if (failures.length > 0) {
  console.log(`\n  FALHAS DETALHADAS:`);
  failures.forEach(f => {
    console.log(`    ✗ ${f.label}`);
    if (f.detail) console.log(`        ${f.detail}`);
  });
}

if (!HTTP_ENABLED) {
  console.log(`\n  PRÓXIMO PASSO:`);
  console.log(`    Ative o servidor e execute com MIA_STATE_AUDIT=true para capturar evidências reais.`);
  console.log(`    MIA_STATE_AUDIT=true node scripts/test-mia-winner-verbalization-integrity-audit.js`);
}

console.log(`\n  ${failed === 0 ? "ALL TESTS PASSED ✓" : `${failed} TEST(S) FAILED ✗`}`);
console.log(`${"═".repeat(66)}\n`);

process.exit(failed > 0 ? 1 : 0);
