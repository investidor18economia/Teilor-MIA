#!/usr/bin/env node
/**
 * PATCH 5.7 — Comprehensive local validation (fallback layer + optional API)
 * Run: node scripts/patch-57-comprehensive-validation.mjs [--api http://localhost:3000]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57");
mkdirSync(OUT, { recursive: true });

const API_BASE = process.argv.find((a) => a.startsWith("--api="))?.split("=")[1] || null;

const { recognizeMiaIntent } = await import(
  pathToFileURL(join(ROOT, "lib/miaIntentRecognitionLayer.js")).href
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
const {
  enrichBehaviorContractWithHumanExperience,
  buildGovernedSocialFallbackReply,
  validateHumanConversationResponse,
} = await import(pathToFileURL(join(ROOT, "lib/miaHumanConversationExperience.js")).href);
const { measureVerbalizationQuality } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href
);
const { selectGovernedFallback } = await import(
  pathToFileURL(join(ROOT, "lib/miaGovernedFallbackPolicy.js")).href
);

const SHORT_SOCIAL = [
  "oi", "Opa", "eae", "salve", "fala", "bom dia", "boa tarde", "boa noite",
  "show", "boa", "legal", "massa", "beleza", "blz", "tá", "ok", "certo",
  "seca", "frio", "estranho", "ruim", "interessante", "gostei", "não gostei",
  "viajou", "sério?", "ué", "nossa", "ah tá", "enfim", "kkkkk", "haha", "rs",
  "valeu", "obrigado", "obrigada", "brigado", "tmj", "vlw",
  "puxado", "cansado", "triste", "feliz", "ansioso",
  "hehe", "kkk", "haha", "rsrs", "😂", "👀",
  "top", "dahora", "sinistro", "daora", "maneiro",
  "nossa que legal", "que isso", "caramba", "putz",
  "hmm", "hm", "ah", "oh", "ui", "eita",
  "serio", "jura", "mentira", "capaz", "imagina",
  "concordo", "discordo", "talvez", "sei la", "sei lá",
  "faz sentido", "justo", "verdade", "real", "exato",
  "continua", "fala", "conta", "me conta", "e ai", "e aí",
];

const COMMERCIAL = [
  "Quero um celular até 2000",
  "Melhor smartphone custo benefício",
  "Comparar iPhone e Samsung",
  "Orçamento 1500 reais",
  "Produto mais vendido",
];

const MULTITURN = [
  { prior: ["oi"], priorAssistant: ["Opa! Tudo bem."], msg: "seca" },
  { prior: ["oi"], msg: "seca" },
  { prior: ["bom dia"], priorAssistant: ["Bom dia! Tudo bem."], msg: "show" },
  { prior: ["Quero um celular"], msg: "valeu" },
  { prior: ["oi"], priorAssistant: ["Oi! Como vai."], msg: "não gostei" },
  { prior: ["kkkk"], priorAssistant: ["Hehe!"], msg: "viajou" },
  { prior: ["tô cansado"], priorAssistant: ["Puxado."], msg: "puxado mesmo" },
  { prior: ["MIA é boa"], priorAssistant: ["Obrigada!"], msg: "obrigado" },
  { prior: ["oi"], priorAssistant: ["Opa! Tudo bem."], msg: "eae" },
  { prior: ["show de bola"], priorAssistant: ["Boa!"], msg: "rs" },
];

function buildTurn(message, extra = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: extra.sessionContext || {},
    conversationMessages: extra.conversationMessages || [],
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  let contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  contract = enrichContractWithSemanticAuthority(contract, {
    recognition,
    conversationMessages: extra.conversationMessages || [],
    sessionContext: extra.sessionContext || {},
  });
  contract = enrichBehaviorContractWithHumanExperience(contract, recognition, {
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  contract.userMessageForSpecificity = message;
  return { recognition, contract };
}

function evaluateFallback(message, extra = {}) {
  const { contract } = buildTurn(message, extra);
  const selection = selectGovernedFallback(contract, { failureReason: "validation_probe" });
  const fb = selection.text;
  const validation = validateHumanConversationResponse(fb, contract);
  const quality = measureVerbalizationQuality(fb, { behaviorContract: contract });
  const coldClarification = /me diz rapidinho a que você se refere/i.test(fb);
  const contractDriven = (selection.reasonCodes || []).includes("contract_driven");
  return {
    message,
    reply: fb,
    valid: validation.valid,
    violations: validation.violations || [],
    quality: quality.overall,
    signals: quality.signals || [],
    coldClarification,
    contractDriven,
    builder: selection.functionName || selection.builder || null,
    family: selection.family || null,
    behavior: contract.expectedHumanBehavior || null,
    routing: contract.governedSocialRoutingKey || null,
  };
}

const fallbackResults = [];
for (const msg of SHORT_SOCIAL) {
  fallbackResults.push(evaluateFallback(msg));
}
for (const msg of COMMERCIAL) {
  fallbackResults.push(evaluateFallback(msg));
}
for (const mt of MULTITURN) {
  const conv = [];
  for (let i = 0; i < mt.prior.length; i++) {
    conv.push({ role: "user", content: mt.prior[i] });
    if (mt.priorAssistant?.[i]) {
      conv.push({ role: "assistant", content: mt.priorAssistant[i] });
    }
  }
  fallbackResults.push(
    evaluateFallback(mt.msg, {
      conversationMessages: conv,
    })
  );
}

const profiles = ["formal", "informal", "teen", "emoji", "caps", "abbrev"];
for (const profile of profiles) {
  for (const base of ["oi", "show", "valeu", "seca", "não gostei"]) {
    let msg = base;
    if (profile === "formal") msg = base.replace(/oi/i, "Olá");
    if (profile === "informal") msg = `${base} kkk`;
    if (profile === "teen") msg = `${base} mano`;
    if (profile === "emoji") msg = `${base} 😊`;
    if (profile === "caps") msg = base.toUpperCase();
    if (profile === "abbrev") msg = base.replace(/quero/gi, "qro");
    fallbackResults.push(evaluateFallback(msg));
  }
}

const apiResults = [];
if (API_BASE) {
  const endpoint = `${API_BASE.replace(/\/$/, "")}/api/mia-chat`;
  const keyScenarios = [
    { label: "seca_multiturn", messages: [{ role: "user", content: "oi" }, { role: "assistant", content: "Opa! Tudo bem." }, { role: "user", content: "seca" }] },
    ...["oi", "Opa", "show", "não gostei", "valeu", "kkk", "bom dia", "boa noite", "eae"].map((m) => ({
      label: `single_${m}`,
      messages: [{ role: "user", content: m }],
    })),
    { label: "commercial", messages: [{ role: "user", content: "Quero um celular até 2000" }] },
  ];
  for (const sc of keyScenarios) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sc.messages[sc.messages.length - 1].content,
          user_id: `p57local-${Date.now()}`,
          conversation_id: `p57-${sc.label}`,
          messages: sc.messages,
          session_context: {},
        }),
      });
      const body = await res.json().catch(() => ({}));
      const reply = String(body?.reply ?? "").trim();
      const quality = measureVerbalizationQuality(reply, { behaviorContract: { responseDepth: "brief" } });
      apiResults.push({
        label: sc.label,
        status: res.status,
        reply,
        quality: quality.overall,
        signals: quality.signals,
        coldClarification: /me diz rapidinho a que você se refere/i.test(reply),
      });
    } catch (err) {
      apiResults.push({ label: sc.label, error: err.message });
    }
  }
}

const summary = {
  patch: "5.7",
  timestamp: new Date().toISOString(),
  gitCommit: execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim(),
  fallback: {
    total: fallbackResults.length,
    valid: fallbackResults.filter((r) => r.valid).length,
    invalid: fallbackResults.filter((r) => !r.valid).length,
    contractDriven: fallbackResults.filter((r) => r.contractDriven).length,
    coldClarification: fallbackResults.filter((r) => r.coldClarification).length,
    avgQuality: fallbackResults.reduce((a, r) => a + (r.quality || 0), 0) / fallbackResults.length,
    lowWarmth: fallbackResults.filter((r) => r.signals?.includes("low_warmth")).length,
    tooLong: fallbackResults.filter((r) => r.signals?.includes("too_long")).length,
    repetitive: fallbackResults.filter((r) => r.signals?.includes("repetitive")).length,
  },
  api: apiResults.length ? {
    total: apiResults.length,
    coldClarification: apiResults.filter((r) => r.coldClarification).length,
    avgQuality: apiResults.filter((r) => r.quality).reduce((a, r) => a + r.quality, 0) / (apiResults.filter((r) => r.quality).length || 1),
  } : null,
};

writeFileSync(join(OUT, "LOCAL_FALLBACK_MATRIX.json"), JSON.stringify({ summary: summary.fallback, results: fallbackResults }, null, 2));
if (apiResults.length) {
  writeFileSync(join(OUT, "LOCAL_API_VALIDATION.json"), JSON.stringify({ summary: summary.api, results: apiResults }, null, 2));
}
writeFileSync(join(OUT, "LOCAL_VALIDATION_SUMMARY.json"), JSON.stringify(summary, null, 2));

console.log(JSON.stringify(summary, null, 2));
if (summary.fallback.coldClarification > 0) {
  console.error("COLD CLARIFICATIONS:", fallbackResults.filter((r) => r.coldClarification));
  process.exit(1);
}
if (summary.fallback.invalid > 0) {
  console.warn(`WARN: ${summary.fallback.invalid} fallback probes failed strict validation (documented in LOCAL_FALLBACK_MATRIX.json)`);
}
