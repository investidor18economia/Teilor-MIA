#!/usr/bin/env node
/** PATCH 5.7V.1 — Comprehensive negative feedback validation + evidence */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v1");
mkdirSync(OUT, { recursive: true });

const logPath = join(OUT, "run.log");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(logPath, line);
  console.log(msg);
}

const { classifySocialIntent, SOCIAL_INTENT_FAMILIES } = await import(
  pathToFileURL(join(ROOT, "lib/miaSocialIntentTaxonomy.js")).href
);
const { recognizeMiaIntent } = await import(
  pathToFileURL(join(ROOT, "lib/miaIntentRecognitionLayer.js")).href
);
const { selectGovernedFallback } = await import(
  pathToFileURL(join(ROOT, "lib/miaGovernedFallbackPolicy.js")).href
);
const { buildSocialConversationBehaviorContract } = await import(
  pathToFileURL(join(ROOT, "lib/miaSocialConversationBehavior.js")).href
);
const { enrichContractWithSemanticAuthority } = await import(
  pathToFileURL(join(ROOT, "lib/miaSemanticAuthority.js")).href
);
const { buildIntentAuthorityFromRecognition } = await import(
  pathToFileURL(join(ROOT, "lib/miaIntentAuthority.js")).href
);
const { enrichBehaviorContractWithHumanExperience } = await import(
  pathToFileURL(join(ROOT, "lib/miaHumanConversationExperience.js")).href
);

const assistantTurn = [{ role: "assistant", content: "Recomendo o Galaxy A55 pela bateria." }];

function pipeline(message, history = []) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    conversationMessages: history,
    hasActiveAnchor: history.length > 0,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, { hasActiveAnchor: history.length > 0 });
  let contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: history,
  });
  contract = enrichContractWithSemanticAuthority(contract, { recognition, conversationMessages: history });
  contract = enrichBehaviorContractWithHumanExperience(contract, {
    recognition,
    authority,
    message,
    conversationMessages: history,
  });
  contract.userMessageForSpecificity = message;
  const fallback = selectGovernedFallback(contract, { failureReason: "battery" });
  return { recognition, contract, fallback };
}

const ISOLATED_PROBES = [
  // correction
  ["correction_voce_errou", "você errou", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["correction_esta_errada", "essa resposta está errada", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["correction_entendeu_errado", "você entendeu errado", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["correction_dado_errado", "esse dado está errado", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["correction_confundiu", "você confundiu", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["correction_nao_foi_isso", "não foi isso", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["correction_voce_esta_errada", "você está errada", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["correction_isso_esta_errado", "isso está errado", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  // criticism
  ["criticism_ficou_pessimo", "ficou péssimo", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["criticism_ficou_ruim", "ficou ruim", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["criticism_ficou_seco", "ficou muito seco", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["criticism_ficou_longo", "ficou muito longo", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["criticism_ficou_confuso", "ficou confuso", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["criticism_achei_fraco", "achei fraco", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["criticism_nao_gostei_jeito", "não gostei do jeito que você respondeu", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  // rejection
  ["rejection_recomendacao", "não gostei dessa recomendação", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["rejection_produto", "esse produto é ruim", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["rejection_celular", "esse celular é ruim", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["rejection_nao_gostei", "não gostei", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["rejection_nao_curti", "não curti", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  // disagreement
  ["disagreement_discordo", "discordo", SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT, "social", "buildWarmDisagreementReply"],
  ["disagreement_nao_concordo", "não concordo", SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT, "social", "buildWarmDisagreementReply"],
  ["disagreement_nao_faz_sentido", "isso não faz sentido", SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT, "social", "buildWarmDisagreementReply"],
  // frustration (should stay frustration when no criticism marker)
  ["frustration_nao_ajuda", "não está ajudando", SOCIAL_INTENT_FAMILIES.FRUSTRATION, "emotional_support", null],
  ["frustration_nada_a_ver", "nada a ver", SOCIAL_INTENT_FAMILIES.FRUSTRATION, "emotional_support", null],
  ["correction_info_errada", "informação errada", SOCIAL_INTENT_FAMILIES.CORRECTION, "social", "buildWarmCorrectionReply"],
  ["criticism_nao_convenceu", "não me convenceu", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["rejection_prefiro_outro", "prefiro outra opção", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
  ["disagreement_essa_recomendacao_ruim", "essa recomendação foi ruim", SOCIAL_INTENT_FAMILIES.DISAPPROVAL, "social", "buildWarmDisapprovalReply"],
];

// Expand with reformulations for 100+ isolated probes
const REFORMULATION_SUFFIXES = ["", "!", "...", "??", " 😠", " PF"];
const REFORMULATION_PREFIXES = ["", "ah ", "pois "];

const expandedProbes = [];
for (const [id, msg, family, mode, builder] of ISOLATED_PROBES) {
  expandedProbes.push([id, msg, family, mode, builder]);
  if (id.startsWith("correction_") || id.startsWith("criticism_") || id.startsWith("disagreement_") || id.startsWith("rejection_")) {
    for (let i = 0; i < 4; i++) {
      const variant = `${REFORMULATION_PREFIXES[i % REFORMULATION_PREFIXES.length]}${msg}${REFORMULATION_SUFFIXES[i % REFORMULATION_SUFFIXES.length]}`.trim();
      expandedProbes.push([`${id}_v${i}`, variant, family, mode, builder]);
    }
  }
}

log(`Isolated battery: ${expandedProbes.length} probes`);

const isolatedResults = [];
let isolatedPass = 0;
for (const [id, msg, expectedFamily, expectedMode, expectedBuilder] of expandedProbes) {
  const hist = msg.length < 30 ? assistantTurn : assistantTurn;
  const { recognition, fallback } = pipeline(msg, hist);
  const okFamily = recognition.primarySocialIntent === expectedFamily;
  const okMode = recognition.interactionMode === expectedMode;
  const okBuilder = !expectedBuilder || fallback.functionName === expectedBuilder;
  const ok = okFamily && okMode && okBuilder;
  if (ok) isolatedPass += 1;
  isolatedResults.push({
    id,
    message: msg,
    expectedFamily,
    actualFamily: recognition.primarySocialIntent,
    expectedMode,
    actualMode: recognition.interactionMode,
    expectedBuilder,
    actualBuilder: fallback.functionName,
    reply: fallback.text?.slice(0, 120),
    pass: ok,
  });
}

writeFileSync(join(OUT, "ISOLATED_BATTERY.json"), JSON.stringify({ total: expandedProbes.length, pass: isolatedPass, results: isolatedResults }, null, 2));

const STABILITY_MESSAGES = [
  ["você errou", SOCIAL_INTENT_FAMILIES.CORRECTION],
  ["ficou péssimo", SOCIAL_INTENT_FAMILIES.DISAPPROVAL],
  ["não gostei dessa recomendação", SOCIAL_INTENT_FAMILIES.DISAPPROVAL],
  ["esse produto é ruim", SOCIAL_INTENT_FAMILIES.DISAPPROVAL],
  ["ficou muito seco", SOCIAL_INTENT_FAMILIES.DISAPPROVAL],
  ["discordo", SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT],
  ["isso não faz sentido", SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT],
  ["viajou", SOCIAL_INTENT_FAMILIES.CORRECTION],
  ["ficou péssimo", SOCIAL_INTENT_FAMILIES.DISAPPROVAL],
  ["não gostei", SOCIAL_INTENT_FAMILIES.DISAPPROVAL],
];

const stabilityResults = [];
let stabilityPass = 0;
for (let run = 1; run <= 10; run++) {
  for (const [msg, expectedFamily] of STABILITY_MESSAGES) {
    const { recognition } = pipeline(msg, assistantTurn);
    const ok = recognition.primarySocialIntent === expectedFamily;
    if (ok) stabilityPass += 1;
    stabilityResults.push({ run, message: msg, expectedFamily, actualFamily: recognition.primarySocialIntent, pass: ok });
  }
}

writeFileSync(join(OUT, "STABILITY_100_RUNS.json"), JSON.stringify({ total: 100, pass: stabilityPass, results: stabilityResults }, null, 2));

const multiturnScenarios = [
  {
    id: "MT-A-correction",
    turns: [
      { user: "Quanto custa o Galaxy A55?", expectFamily: null },
      { user: "A bateria que você citou está errada", expectFamily: SOCIAL_INTENT_FAMILIES.CORRECTION },
    ],
  },
  {
    id: "MT-B-criticism",
    turns: [
      { user: "oi", expectFamily: SOCIAL_INTENT_FAMILIES.GREETING },
      { user: "ficou muito seco", expectFamily: SOCIAL_INTENT_FAMILIES.DISAPPROVAL },
    ],
  },
  {
    id: "MT-C-rejection-rec",
    turns: [
      { user: "me recomenda um celular", expectFamily: null },
      { user: "não gostei dessa recomendação", expectFamily: SOCIAL_INTENT_FAMILIES.DISAPPROVAL },
    ],
  },
  {
    id: "MT-D-rejection-product",
    turns: [
      { user: "o Galaxy A55 é bom?", expectFamily: null },
      { user: "esse celular é ruim", expectFamily: SOCIAL_INTENT_FAMILIES.DISAPPROVAL },
    ],
  },
  {
    id: "MT-E-disagreement",
    turns: [
      { user: "qual é melhor A55 ou M34?", expectFamily: null },
      { user: "discordo", expectFamily: SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT },
    ],
  },
  {
    id: "MT-H-target-ambiguity",
    turns: [
      { user: "oi", expectFamily: SOCIAL_INTENT_FAMILIES.GREETING },
      { user: "ficou péssimo", expectFamily: SOCIAL_INTENT_FAMILIES.DISAPPROVAL },
    ],
  },
];

const multiturnResults = [];
const history = [];
for (const scenario of multiturnScenarios) {
  const scenarioResult = { id: scenario.id, turns: [] };
  history.length = 0;
  for (const turn of scenario.turns) {
    history.push({ role: "user", content: turn.user });
    const { recognition, fallback } = pipeline(turn.user, history.slice(0, -1));
    history.push({ role: "assistant", content: fallback.text || "ok" });
    const pass = !turn.expectFamily || recognition.primarySocialIntent === turn.expectFamily;
    scenarioResult.turns.push({
      user: turn.user,
      expectedFamily: turn.expectFamily,
      actualFamily: recognition.primarySocialIntent,
      mode: recognition.interactionMode,
      builder: fallback.functionName,
      reply: fallback.text?.slice(0, 100),
      pass,
    });
  }
  multiturnResults.push(scenarioResult);
}

writeFileSync(join(OUT, "MULTITURN_BATTERY.json"), JSON.stringify(multiturnResults, null, 2));

const rootCause = {
  voce_errou: {
    problem: "Missing factual error markers; short_incomplete clarification override",
    fix: "Extended CORRECTION_MARKERS + negative feedback intent override in intent layer",
    after: pipeline("você errou", assistantTurn),
  },
  ficou_pessimo: {
    problem: "péssimo in FRUSTRATION_MARKERS stole from response criticism",
    fix: "RESPONSE_CRITICISM_MARKERS + detection before frustration; raised DISAPPROVAL priority",
    after: pipeline("ficou péssimo", assistantTurn),
  },
};

writeFileSync(join(OUT, "ROOT_CAUSE_CRITICISM_ERROR.json"), JSON.stringify(rootCause, null, 2));

writeFileSync(
  join(OUT, "NEGATIVE_INTENT_TAXONOMY.json"),
  JSON.stringify(
    {
      families: ["correction", "disapproval", "soft_disagreement", "frustration"],
      markers: ["CORRECTION_MARKERS", "RESPONSE_CRITICISM_MARKERS", "DISAGREEMENT_MARKERS", "RECOMMENDATION_REJECTION_MARKERS", "PRODUCT_REJECTION_MARKERS"],
      version: "4.1I.5.7V1",
    },
    null,
    2
  )
);

writeFileSync(
  join(OUT, "BEFORE_AFTER_MATRIX.json"),
  JSON.stringify(
    {
      voce_errou: { before: "clarification/stay_social", after: rootCause.voce_errou.after.recognition.primarySocialIntent },
      ficou_pessimo: { before: "frustration/emotional_support", after: rootCause.ficou_pessimo.after.recognition.primarySocialIntent },
    },
    null,
    2
  )
);

// Run unit tests
let unitOk = true;
try {
  execSync("node scripts/test-mia-patch-57v1-negative-feedback.js", { cwd: ROOT, stdio: "pipe" });
  log("Unit tests: PASS");
} catch (e) {
  unitOk = false;
  log("Unit tests: FAIL");
}

try {
  execSync("node scripts/test-mia-patch-57v-rejection-verbalization.js", { cwd: ROOT, stdio: "pipe" });
  log("5.7V regression tests: PASS");
} catch {
  log("5.7V regression tests: FAIL");
  unitOk = false;
}

writeFileSync(
  join(OUT, "UNIT_TESTS.json"),
  JSON.stringify({ pass: unitOk, script: "test-mia-patch-57v1-negative-feedback.js" }, null, 2)
);

const summary = {
  isolated: { total: expandedProbes.length, pass: isolatedPass, rate: `${isolatedPass}/${expandedProbes.length}` },
  stability: { total: 100, pass: stabilityPass, rate: `${stabilityPass}/100` },
  multiturn: {
    scenarios: multiturnResults.length,
    pass: multiturnResults.every((s) => s.turns.every((t) => t.pass)),
  },
  unitTests: unitOk,
};

writeFileSync(join(OUT, "FINAL_CLOSURE_EVIDENCE.json"), JSON.stringify(summary, null, 2));
log(JSON.stringify(summary, null, 2));

process.exit(isolatedPass >= expandedProbes.length * 0.95 && stabilityPass === 100 && unitOk ? 0 : 1);
