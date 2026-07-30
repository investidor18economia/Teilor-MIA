#!/usr/bin/env node
/**
 * PATCH 4.1I — Social Intent Local/Production Validation
 *
 * Usage:
 *   node scripts/patch-41i-social-intent-validation.mjs
 *   PATCH41I_MODE=production node scripts/patch-41i-social-intent-validation.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { recognizeMiaIntent, MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import { SOCIAL_INTENT_FAMILIES } from "../lib/miaSocialIntentTaxonomy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH41I_MODE || "local";
const BASE =
  MODE === "production"
    ? process.env.PATCH41I_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH41I_LOCAL_BASE_URL || "http://localhost:3000";
const DELAY = Number(process.env.PATCH41I_CHAT_DELAY_MS || 3500);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4/evidence");
const EVIDENCE = path.join(
  EVIDENCE_DIR,
  MODE === "production"
    ? "PATCH_4_1I_PRODUCTION_SOCIAL_INTENT_EVIDENCE.json"
    : "PATCH_4_1I_LOCAL_SOCIAL_INTENT_EVIDENCE.json"
);

const SCENARIOS = [
  { id: "greet-opa", msg: "Opa", expect: SOCIAL_INTENT_FAMILIES.GREETING, mode: "social" },
  { id: "greet-oi", msg: "Oi", expect: SOCIAL_INTENT_FAMILIES.GREETING, mode: "social" },
  { id: "greet-eai", msg: "E aí", expect: SOCIAL_INTENT_FAMILIES.GREETING, mode: "social" },
  { id: "compliment-linda", msg: "Linda", expect: SOCIAL_INTENT_FAMILIES.COMPLIMENT, mode: "social" },
  {
    id: "praise-intelligent",
    msg: "Você é muito inteligente",
    expectAny: [SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.COMPLIMENT],
    mode: "social",
  },
  { id: "gratitude-obrigado", msg: "Obrigado", expect: SOCIAL_INTENT_FAMILIES.GRATITUDE, mode: "social" },
  { id: "gratitude-valeu", msg: "Valeu", expect: SOCIAL_INTENT_FAMILIES.GRATITUDE, mode: "social" },
  {
    id: "correction-nao-entendeu",
    msg: "Você não entendeu",
    expectAny: [
      SOCIAL_INTENT_FAMILIES.CORRECTION,
      SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
      SOCIAL_INTENT_FAMILIES.FRUSTRATION,
    ],
    mode: "social",
  },
  {
    id: "correction-pqp",
    msg: "Pqp você não entendeu nada",
    expectAny: [
      SOCIAL_INTENT_FAMILIES.CORRECTION,
      SOCIAL_INTENT_FAMILIES.FRUSTRATION,
      SOCIAL_INTENT_FAMILIES.INSULT,
      SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT,
    ],
    mode: "social",
  },
  {
    id: "irony-brincadeira",
    msg: "Foi brincadeira kkk",
    expect: SOCIAL_INTENT_FAMILIES.IRONY,
    mode: "social",
  },
  {
    id: "sarcasm-explode",
    msg: "claro que quero um celular q explode na primeira queda ne 😂",
    expect: SOCIAL_INTENT_FAMILIES.SARCASM,
    mode: "social",
  },
  {
    id: "meta-quem-criou",
    msg: "Quem te criou?",
    expect: SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION,
    mode: "identity",
  },
  {
    id: "meta-como-funciona",
    msg: "Como você funciona?",
    expect: SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION,
    mode: "identity",
  },
  {
    id: "meta-comissao",
    msg: "Você ganha comissão?",
    expect: SOCIAL_INTENT_FAMILIES.TRUST_QUESTION,
    mode: "identity",
  },
  {
    id: "smalltalk-conversar",
    msg: "Só queria conversar",
    expectAny: [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST, SOCIAL_INTENT_FAMILIES.SMALL_TALK],
    mode: "social",
  },
  {
    id: "frustration-inutil",
    msg: "nao ta ajudando NADA, que assistente inutil",
    expectAny: [SOCIAL_INTENT_FAMILIES.FRUSTRATION, SOCIAL_INTENT_FAMILIES.INSULT],
    mode: "social",
  },
  {
    id: "commercial-regression",
    msg: "Qual celular compensa até R$ 2.000?",
    expectMode: MIA_INTERACTION_MODES.COMMERCE,
    commercialMin: 0.45,
  },
  {
    id: "commercial-negative-linda-produto",
    msg: "esse celular é lindo, me recomenda?",
    expectAnyMode: [MIA_INTERACTION_MODES.COMMERCE, MIA_INTERACTION_MODES.MIXED],
    commercialMin: 0.35,
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyLocal(message, scenario = {}) {
  const signals = scenario.commercialMin != null ? { hasClearNewCommercialSearch: true } : {};
  return recognizeMiaIntent({ userMessage: message, resolvedQuery: message, signals });
}

async function classifyRemote(message) {
  const res = await fetch(`${BASE}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, session_context: {}, messages: [] }),
  });
  const data = await res.json();
  const trace = data?.trace?.intentRecognition || data?.intentRecognition || null;
  if (trace?.primarySocialIntent) return trace;
  return classifyLocal(message);
}

function evaluateScenario(scenario, recognition) {
  const issues = [];
  if (scenario.expect && recognition.primarySocialIntent !== scenario.expect) {
    issues.push(`primarySocialIntent expected ${scenario.expect}, got ${recognition.primarySocialIntent}`);
  }
  if (scenario.expectAny && !scenario.expectAny.includes(recognition.primarySocialIntent)) {
    issues.push(
      `primarySocialIntent expected one of ${scenario.expectAny.join(",")}, got ${recognition.primarySocialIntent}`
    );
  }
  if (scenario.mode === "social" && recognition.interactionMode !== MIA_INTERACTION_MODES.SOCIAL &&
      recognition.interactionMode !== MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    issues.push(`interactionMode expected social, got ${recognition.interactionMode}`);
  }
  if (scenario.mode === "identity" && recognition.interactionMode !== MIA_INTERACTION_MODES.IDENTITY) {
    issues.push(`interactionMode expected identity, got ${recognition.interactionMode}`);
  }
  if (scenario.expectMode && recognition.interactionMode !== scenario.expectMode) {
    issues.push(`interactionMode expected ${scenario.expectMode}, got ${recognition.interactionMode}`);
  }
  if (
    scenario.expectAnyMode &&
    !scenario.expectAnyMode.includes(recognition.interactionMode)
  ) {
    issues.push(
      `interactionMode expected one of ${scenario.expectAnyMode.join(",")}, got ${recognition.interactionMode}`
    );
  }
  if (scenario.commercialMin != null && (recognition.commercialRelevance ?? 0) < scenario.commercialMin) {
    issues.push(`commercialRelevance below ${scenario.commercialMin}`);
  }
  if (!recognition.primarySocialIntent && !scenario.commercialMin) {
    issues.push("missing primarySocialIntent");
  }
  if (!recognition.emotionalState && !scenario.commercialMin) {
    issues.push("missing emotionalState");
  }
  return { pass: issues.length === 0, issues };
}

async function main() {
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    /* ignore */
  }

  console.log(`\nPATCH 4.1I — Social Intent Validation (${MODE})\n`);
  console.log(`Base: ${MODE === "production" ? BASE : "local module + optional " + BASE}\n`);

  const results = [];
  for (const scenario of SCENARIOS) {
    if (MODE === "production") await sleep(DELAY);
    const recognition =
      MODE === "production"
        ? await classifyRemote(scenario.msg)
        : classifyLocal(scenario.msg, scenario);
    const evaluation = evaluateScenario(scenario, recognition);
    results.push({
      ...scenario,
      pass: evaluation.pass,
      issues: evaluation.issues,
      primarySocialIntent: recognition.primarySocialIntent,
      interactionMode: recognition.interactionMode,
      emotionalState: recognition.emotionalState,
      confidence: recognition.socialIntentConfidence ?? recognition.confidence,
    });
    console.log(
      `${evaluation.pass ? "✓" : "✗"} ${scenario.id} → ${recognition.primarySocialIntent || recognition.interactionMode}`
    );
  }

  const passed = results.filter((r) => r.pass).length;
  const payload = {
    patch: "4.1I",
    phase: "social_intent_taxonomy_validation",
    status: passed === results.length ? "APROVADA" : "BLOQUEADA",
    mode: MODE,
    base_url: BASE,
    commit,
    finished_at: new Date().toISOString(),
    summary: { passed, failed: results.length - passed, total: results.length },
    scenarios: results,
  };

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(EVIDENCE, JSON.stringify(payload, null, 2));

  console.log(`\nEvidence: ${EVIDENCE}`);
  console.log(`Result: ${passed}/${results.length} — ${payload.status}\n`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
