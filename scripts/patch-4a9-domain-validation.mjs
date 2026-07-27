#!/usr/bin/env node
/**
 * PATCH 4A.9 — Domain knowledge conversation validation
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH4A9_MODE || "local";
const BASE =
  MODE === "production"
    ? process.env.PATCH4A9_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH4A9_LOCAL_BASE_URL || "http://localhost:3008";
const CHAT_URL = `${BASE}/api/mia-chat`;
const DELAY = Number(process.env.PATCH4A9_CHAT_DELAY_MS || 8000);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(
  EVIDENCE_DIR,
  MODE === "production"
    ? "PATCH_4A_9_PRODUCTION_DOMAIN_EVIDENCE.json"
    : "PATCH_4A_9_LOCAL_DOMAIN_EVIDENCE.json"
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendChat(message, sessionContext = {}, messages = [], conversationId = "") {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        messages,
        session_context: sessionContext,
        conversation_id: conversationId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    const reply = String(json?.reply || json?.message || "").trim();
    const result = {
      status: res.status,
      reply,
      sessionContext: json?.session_context || {},
    };
    if (res.status === 200 && reply.length >= 25) return result;
    if (attempt === 0 && (res.status >= 500 || reply.length < 25)) {
      await sleep(DELAY);
      continue;
    }
    return result;
  }
  return { status: 500, reply: "", sessionContext: {} };
}

function extractDomainSnapshot(session = {}) {
  const model = session?.lastDomainKnowledgeModel;
  if (!model) return null;
  return {
    domain: model.domain,
    neutral: !!model.neutral,
    itemCount: model.itemCount || model.items?.length || 0,
    matchedRules: model.matchedRules || [],
    topItems: (model.items || []).slice(0, 3).map((item) => ({
      type: item.type,
      origin: item.origin,
      confidence: item.confidence,
      validity: item.validity,
    })),
  };
}

function analyzeTurn(reply = "", session = {}, expectations = {}) {
  const domain = extractDomainSnapshot(session);
  const pass =
    expectations.httpStatus === 200 &&
    reply.length >= (expectations.minLen ?? 40) &&
    (!expectations.requireModel || !!domain) &&
    (!expectations.requireDomainItems || (domain?.itemCount || 0) > 0) &&
    (!expectations.requireNeutral || domain?.neutral === true) &&
    (!expectations.expectedDomain || domain?.domain === expectations.expectedDomain) &&
    (!expectations.expectedRule ||
      (domain?.matchedRules || []).some((rule) => rule.includes(expectations.expectedRule)));

  return { domain, pass, hasModel: !!domain };
}

const scenarios = [];

async function runScenario(def) {
  const conversationId = randomUUID();
  let session = {};
  const transcript = [];
  let scenarioPass = true;
  const messageHistory = [];

  for (const turn of def.turns) {
    await sleep(turn.delay ?? DELAY);
    messageHistory.push({ role: "user", content: turn.message });
    const result = await sendChat(turn.message, session, messageHistory, conversationId);
    session = result.sessionContext || session;
    const analysis = analyzeTurn(result.reply, session, {
      ...turn,
      httpStatus: result.status,
    });
    const turnPass = result.status === 200 && analysis.pass;
    if (!turnPass) scenarioPass = false;
    transcript.push({
      turn: transcript.length + 1,
      user: turn.message,
      assistant: result.reply,
      domain: analysis.domain,
      winner: session?.lastBestProduct?.product_name || null,
      pass: turnPass,
    });
  }

  scenarios.push({ id: def.id, title: def.title, environment: MODE, pass: scenarioPass, transcript });
  console.log(`${scenarioPass ? "PASS" : "FAIL"} [${def.id}] ${def.title}`);
  return scenarioPass;
}

console.log(`\nPATCH 4A.9 — Domain validation (${MODE})\nBase: ${BASE}\n`);

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const defs = [
  {
    id: "p1-galaxy-fe",
    title: "Positivo — Galaxy FE",
    turns: [
      {
        message: "o Galaxy S23 FE vale a pena?",
        requireModel: true,
        requireDomainItems: true,
        expectedDomain: "mobile",
        expectedRule: "galaxy_fe",
      },
    ],
  },
  {
    id: "p2-snapdragon-exynos",
    title: "Positivo — Snapdragon vs Exynos",
    turns: [
      {
        message: "quero um celular com Snapdragon até 2500",
        requireModel: true,
        requireDomainItems: true,
        expectedDomain: "mobile",
        expectedRule: "snapdragon",
      },
    ],
  },
  {
    id: "p3-pixel",
    title: "Positivo — Pixel / updates",
    turns: [
      {
        message: "o Pixel 8 vale a pena?",
        requireModel: true,
        requireDomainItems: true,
        expectedDomain: "mobile",
        expectedRule: "pixel",
      },
    ],
  },
  {
    id: "p4-redmi-note",
    title: "Positivo — Redmi Note custo-benefício",
    turns: [
      {
        message: "o Redmi Note 13 vale a pena até 1500?",
        requireModel: true,
        requireDomainItems: true,
        expectedDomain: "mobile",
        expectedRule: "redmi_note",
      },
    ],
  },
  {
    id: "p5-samsung-updates",
    title: "Positivo — política de atualização Samsung",
    turns: [
      {
        message: "o Galaxy A55 vale a pena considerando as atualizações?",
        requireModel: true,
        requireDomainItems: true,
        expectedDomain: "mobile",
        expectedRule: "samsung_updates",
      },
    ],
  },
  {
    id: "n1-unknown-product",
    title: "Negativo — produto desconhecido",
    turns: [
      {
        message: "o ZPhone ZX9000 Ultra vale a pena?",
        minLen: 40,
      },
    ],
  },
  {
    id: "n2-unknown-category",
    title: "Negativo — categoria sem domínio",
    turns: [
      {
        message: "qual cadeira ergonômica você recomenda para home office?",
        minLen: 25,
      },
    ],
  },
];

const results = [];
for (const def of defs) {
  results.push(await runScenario(def));
}

const passed = results.filter(Boolean).length;
const payload = {
  patch: "4A.9",
  phase: "domain_knowledge_validation",
  status: passed === results.length ? "APROVADA" : "BLOQUEADA",
  mode: MODE,
  base_url: BASE,
  commit: localCommit,
  finished_at: new Date().toISOString(),
  summary: { passed, failed: results.length - passed, total: results.length },
  scenarios,
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(payload, null, 2));

console.log(`\nPATCH 4A.9 (${MODE}): ${passed}/${results.length} scenarios passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(passed === results.length ? 0 : 1);
