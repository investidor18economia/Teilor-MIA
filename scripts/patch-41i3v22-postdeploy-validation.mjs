#!/usr/bin/env node
/**
 * PATCH 4.1I.3.V.2.2 — Post-deploy production validation (complete gates)
 */
import { createRequire } from "module";
import { writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { resolveSemanticTarget } from "../lib/miaSemanticTargetResolution.js";

const PROD_URL = "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = join(ROOT, "docs/conversational/audits/phase-4/evidence/patch-41i3v22");
const SCREENSHOTS = join(EVIDENCE, "screenshots");
mkdirSync(SCREENSHOTS, { recursive: true });

const LOG = join(EVIDENCE, "run.log");
const DELAY_MS = 3200;

const MIA_THANKS = /\b(obrigad\w*|que gentil|valeu pelo elogio|fico feliz)\b/i;
const CLARIFICATION = /\b(me diz rapidinho a que voc[eê] se refere|voc[eê] fala disso ou de outra coisa|me explica um pouco melhor o que voc[eê] quer)\b/i;
const PRODUCT_FRAME = /\b(o produto tem|visual bem marcante|design do galaxy|design dele|visual dele|o celular tem)\b/i;
const AMBIGUOUS_SOCIAL_OK = /\b(elogio|curiosa|pra mim|de mim|alguma coisa|algum produto|gratuito|recebi bem)\b/i;
const COMMERCIAL = /\b(celular,\s*notebook|faixa ou produto|me conta o que voc[eê] est[aá] buscando|direcionar a escolha|sem essa marca|buscando)\b/i;
const LEGACY = /\bPois é\.|Isso ajuda bastante a direcionar|Agora ficou mais claro o que você procura\b/i;
const RATE_LIMIT = /várias mensagens em sequência|aguarde alguns segundos/i;
const PRODUCT_TALK = /\b(design|visual|galaxy|iphone|celular|produto|aparelho|acabamento|elegante|modelo|marcante)\b/i;

const EXPECTED_COMMIT = process.argv[2] || process.env.PATCH_41I3V21_COMMIT || "";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(LOG, line);
  console.log(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHealth() {
  const res = await fetch("https://economia-ai.vercel.app/api/health");
  return res.json();
}

async function waitForDeploy(maxWaitMs = 900000) {
  if (!EXPECTED_COMMIT) {
    return fetchHealth();
  }
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const h = await fetchHealth();
    if (h.build && h.build.startsWith(EXPECTED_COMMIT.slice(0, 12))) {
      return h;
    }
    log(`Waiting deploy... current build=${h.build}, expected=${EXPECTED_COMMIT.slice(0, 12)}`);
    await sleep(15000);
  }
  throw new Error(`Deploy timeout: expected build starting with ${EXPECTED_COMMIT.slice(0, 12)}`);
}

function inferSemantics(message, history = []) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: history.length > 2 ? { lastBestProduct: { product_name: "Galaxy A55" } } : {},
    hasActiveAnchor: history.some((h) => /galaxy|iphone|produto|design/i.test(h.content || "")),
    conversationMessages: history,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: false,
    sessionContext: {},
  });
  const contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: history,
    sessionContext: {},
  });
  const targetResolution = resolveSemanticTarget({ message, recognition, conversationMessages: history });
  return {
    interactionMode: contract.interactionMode || recognition.interactionMode,
    primarySocialIntent: contract.primarySocialIntent || recognition.primarySocialIntent,
    resolvedSemanticTarget: contract.resolvedSemanticTarget || targetResolution.target,
    governedSocialRoutingKey: contract.governedSocialRoutingKey || null,
    targetReasonCodes: targetResolution.reasonCodes || [],
  };
}

function classifyTechnical(reply) {
  if (!reply || reply.startsWith("[ERROR")) return { technical: true, type: "error_or_empty" };
  if (RATE_LIMIT.test(reply)) return { technical: true, type: "rate_limit" };
  return { technical: false, type: null };
}

async function createSession(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  const turns = [];

  async function send(msg, screenshot = null) {
    await sleep(DELAY_MS);
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(msg);
    await page.locator(".send-btn").click();
    let reply = "";
    let status = 0;
    let data = {};
    try {
      const resp = await responsePromise;
      status = resp.status();
      data = await resp.json().catch(() => ({}));
      await page
        .waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
          timeout: 120000,
        })
        .catch(() => {});
      await sleep(700);
      const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
      reply = String(data?.reply || bubbleText || "").trim();
    } catch (e) {
      reply = `[ERROR: ${e.message}]`;
    }
    const turn = {
      msg,
      reply,
      status,
      trace: data?.meta?.response_replacement_trace || data?.debug?.response_replacement_trace || null,
      timestamp: new Date().toISOString(),
    };
    turns.push(turn);
    if (screenshot) {
      await page.screenshot({ path: join(SCREENSHOTS, screenshot), fullPage: true });
    }
    return turn;
  }

  return { ctx, page, send, turns };
}

function classifyB2(reply, semantics) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (CLARIFICATION.test(reply)) reasons.push("neutral_clarification");
  if (PRODUCT_FRAME.test(reply)) reasons.push("product_frame");
  if (COMMERCIAL.test(reply)) reasons.push("commercial_fallback");
  if (LEGACY.test(reply)) reasons.push("legacy_hit");
  if (!MIA_THANKS.test(reply)) reasons.push("missing_mia_thanks");
  if (semantics.resolvedSemanticTarget !== "mia") reasons.push("wrong_target");
  if (semantics.governedSocialRoutingKey !== "mia_compliment") reasons.push("wrong_routing_key");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

function classifyB1(reply, semantics) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (MIA_THANKS.test(reply)) reasons.push("mia_thanks_on_product");
  if (CLARIFICATION.test(reply)) reasons.push("unnecessary_clarification");
  if (!PRODUCT_TALK.test(reply)) reasons.push("missing_product_opinion");
  if (semantics.resolvedSemanticTarget === "mia") reasons.push("wrong_target_mia");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

function classifyLindaIsolated(reply) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (PRODUCT_FRAME.test(reply)) reasons.push("product_frame");
  if (MIA_THANKS.test(reply) && !AMBIGUOUS_SOCIAL_OK.test(reply) && !/\?/.test(reply)) {
    reasons.push("mia_thanks_without_context");
  }
  if (CLARIFICATION.test(reply)) reasons.push("neutral_clarification");
  if (COMMERCIAL.test(reply)) reasons.push("commercial_redirect");
  if (LEGACY.test(reply)) reasons.push("legacy_hit");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

function classifySocial(reply) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (LEGACY.test(reply)) reasons.push("legacy_hit");
  if (COMMERCIAL.test(reply)) reasons.push("commercial_redirect");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

function classifyCommercial(reply) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (LEGACY.test(reply)) reasons.push("legacy_hit");
  if (/^pois e[.!]?$/i.test(reply.trim())) reasons.push("legacy_ack");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

function classifyCritical(msg, reply) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (LEGACY.test(reply)) reasons.push("legacy_hit");
  if (COMMERCIAL.test(reply)) reasons.push("commercial_redirect");
  if (CLARIFICATION.test(reply) && msg !== "Linda") reasons.push("unnecessary_clarification");
  if (msg === "Linda" && PRODUCT_FRAME.test(reply) && !MIA_THANKS.test(reply)) reasons.push("product_frame");
  if (msg === "Você é muito inteligente" && !MIA_THANKS.test(reply)) reasons.push("missing_mia_thanks");
  if (msg === "Você me ajudou muito" && !/\b(obrigad|ajud|feliz|imagina|por nada)\b/i.test(reply))
    reasons.push("missing_gratitude_ack");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

function classifyMiaComplimentVariant(reply, semantics = {}) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (PRODUCT_FRAME.test(reply)) reasons.push("product_frame_on_mia");
  if (CLARIFICATION.test(reply)) reasons.push("neutral_clarification");
  if (COMMERCIAL.test(reply)) reasons.push("commercial_redirect");
  if (LEGACY.test(reply)) reasons.push("legacy_hit");
  if (semantics.governedSocialRoutingKey === "ambiguous_social") {
    if (PRODUCT_FRAME.test(reply)) reasons.push("product_frame");
    return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
  }
  if (!MIA_THANKS.test(reply) && !AMBIGUOUS_SOCIAL_OK.test(reply) && !/\?/.test(reply)) {
    reasons.push("missing_mia_thanks");
  }
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

function classifyProductComplimentVariant(reply) {
  const tech = classifyTechnical(reply);
  if (tech.technical) return { classification: "FALHA_TECNICA", reasons: [tech.type], semantic: false };
  const reasons = [];
  if (MIA_THANKS.test(reply)) reasons.push("mia_thanks_on_product");
  if (CLARIFICATION.test(reply)) reasons.push("unnecessary_clarification");
  if (!PRODUCT_TALK.test(reply)) reasons.push("missing_product_opinion");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, semantic: reasons.length === 0 };
}

async function runMultiTurn(browser, id, messages, classifyFn, options = {}) {
  const s = await createSession(browser);
  const history = [];
  let lastSemantics = null;
  let lastReply = "";
  try {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const shot = options.screenshotLast && i === messages.length - 1 ? `${id}.png` : null;
      const turn = await s.send(msg, shot);
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: turn.reply });
      lastReply = turn.reply;
      lastSemantics = inferSemantics(msg, history.slice(0, -1));
    }
    const check = classifyFn(lastReply, lastSemantics || {});
    return { id, turns: s.turns, reply: lastReply, semantics: lastSemantics, ...check, timestamp: new Date().toISOString() };
  } finally {
    await s.ctx.close();
  }
}

async function runSingle(browser, id, msg, classifyFn, shot = null) {
  const s = await createSession(browser);
  try {
    const turn = await s.send(msg, shot);
    const check = classifyFn(msg, turn.reply);
    return { id, msg, reply: turn.reply, turns: s.turns, trace: turn.trace, ...check, timestamp: new Date().toISOString() };
  } finally {
    await s.ctx.close();
  }
}

const MIA_COMPLIMENT_VARIANTS = [
  ["Oi, MIA", "Linda"],
  ["Oi MIA", "Que linda você é"],
  ["E aí MIA", "Bonita demais"],
  ["Opa MIA", "Maravilhosa"],
  ["Oi, MIA", "Você é linda"],
  ["MIA", "Linda"],
  ["Ei MIA", "Incrível"],
  ["Oi assistente", "MIA", "Linda"],
  ["Oi, MIA", "Adorei você"],
  ["MIA oi", "Que gentil você"],
  ["Oi MIA tudo bem", "Linda"],
  ["E aí MIA", "Perfeita"],
  ["Opa MIA", "Sensacional"],
  ["Oi, MIA", "Você é demais"],
  ["MIA", "Arrasou"],
];

const PRODUCT_COMPLIMENT_VARIANTS = [
  ["O que você acha do design do Galaxy A55?", "Linda"],
  ["Como é o visual do iPhone 15?", "Bonito demais"],
  ["O Galaxy S24 é elegante?", "Linda"],
  ["Design do Pixel 8", "Maravilhoso"],
  ["Visual do Galaxy A55", "Perfeito"],
  ["O acabamento do iPhone", "Lindo"],
  ["Galaxy A55 design", "Show"],
  ["iPhone 15 Pro visual", "Incrível"],
  ["Como você vê o design dele?", "Linda"],
  ["Esse celular é bonito?", "Demais"],
  ["O Galaxy parece premium", "Linda"],
  ["Visual marcante do A55", "Adorei"],
  ["Design elegante do iPhone", "Perfeito"],
  ["O aparelho é bonito", "Linda"],
  ["Galaxy A55 é lindo", "Concordo"],
];

async function main() {
  appendFileSync(LOG, `\n--- PATCH 4.1I.3.V.2.2 POST-DEPLOY ${new Date().toISOString()} ---\n`);
  log(`Expected commit: ${EXPECTED_COMMIT || "(any active build)"}`);

  let healthFinal;
  try {
    healthFinal = await waitForDeploy();
    writeFileSync(join(EVIDENCE, "HEALTH_FINAL.json"), JSON.stringify(healthFinal, null, 2));
    log(`Deploy confirmed: build=${healthFinal.build}`);
  } catch (e) {
    healthFinal = await fetchHealth();
    writeFileSync(join(EVIDENCE, "HEALTH_FINAL.json"), JSON.stringify({ ...healthFinal, deployWarning: e.message }, null, 2));
    log(`WARNING: ${e.message} — proceeding with build=${healthFinal.build}`);
  }

  const browser = await chromium.launch({ headless: true });

  log("B2 (10 runs)...");
  const b2Runs = [];
  for (let i = 1; i <= 10; i++) {
    const r = await runMultiTurn(browser, `B2_r${i}`, ["Oi, MIA", "Linda"], classifyB2, { screenshotLast: i <= 2 });
    b2Runs.push(r);
    log(`B2 ${i}/10: ${r.classification} — ${r.reply.slice(0, 80)}`);
    if (r.classification === "FALHA_TECNICA") await sleep(8000);
  }
  writeFileSync(join(EVIDENCE, "PROD_B2_STABILITY.json"), JSON.stringify({ build: healthFinal.build, runs: b2Runs }, null, 2));

  log("B1 (10 runs)...");
  const b1Runs = [];
  for (let i = 1; i <= 10; i++) {
    const r = await runMultiTurn(
      browser,
      `B1_r${i}`,
      ["O que você acha do design do Galaxy A55?", "Linda"],
      classifyB1,
      { screenshotLast: i === 1 }
    );
    b1Runs.push(r);
    log(`B1 ${i}/10: ${r.classification} — ${r.reply.slice(0, 80)}`);
    if (r.classification === "FALHA_TECNICA") await sleep(8000);
  }
  writeFileSync(join(EVIDENCE, "PRODUCT_CONTEXT_REGRESSION.json"), JSON.stringify({ build: healthFinal.build, runs: b1Runs }, null, 2));

  log("Linda isolated (5 runs)...");
  const lindaRuns = [];
  for (let i = 1; i <= 5; i++) {
    const r = await runSingle(browser, `LINDA_iso_r${i}`, "Linda", classifyLindaIsolated);
    lindaRuns.push(r);
    log(`Linda isolated ${i}/5: ${r.classification} — ${r.reply.slice(0, 60)}`);
    if (r.classification === "FALHA_TECNICA") await sleep(8000);
  }
  writeFileSync(join(EVIDENCE, "LINDA_ISOLATED.json"), JSON.stringify({ build: healthFinal.build, runs: lindaRuns }, null, 2));

  log("Critical 5 x3...");
  const criticalMsgs = ["Linda", "Você é muito inteligente", "Era ironia", "Só queria conversar", "Você me ajudou muito"];
  const criticalRuns = [];
  for (const msg of criticalMsgs) {
    for (let i = 1; i <= 3; i++) {
      const r = await runSingle(browser, `CRIT_${msg.slice(0, 12)}_r${i}`, msg, classifyCritical);
      criticalRuns.push({ msg, run: i, ...r });
      log(`Critical "${msg}" ${i}/3: ${r.classification}`);
      if (r.classification === "FALHA_TECNICA") await sleep(8000);
    }
  }
  writeFileSync(join(EVIDENCE, "CRITICAL_5_REGRESSION.json"), JSON.stringify({ build: healthFinal.build, runs: criticalRuns }, null, 2));

  log("Social regression (10)...");
  const socialMsgs = [
    "Quero conversar", "Hoje foi complicado", "Não quero comprar nada", "Me conta alguma coisa",
    "Era brincadeira", "Você entendeu errado", "Gostei da conversa", "Sua resposta ficou boa",
    "Foi estranho", "Legal",
  ];
  const socialRuns = [];
  for (const msg of socialMsgs) {
    const r = await runSingle(browser, `SOC_${msg.slice(0, 10)}`, msg, classifySocial);
    socialRuns.push({ msg, ...r });
    log(`Social "${msg.slice(0, 20)}": ${r.classification}`);
    if (r.classification === "FALHA_TECNICA") await sleep(8000);
  }
  writeFileSync(join(EVIDENCE, "SOCIAL_REGRESSION.json"), JSON.stringify({ build: healthFinal.build, runs: socialRuns }, null, 2));

  log("Commercial regression (10)...");
  const commercialMsgs = [
    "Quero um celular", "Até R$ 2.000", "Para jogos", "Qual compensa mais?", "Esse vale a pena?",
    "Compare os dois", "Quero um notebook", "Um mais barato", "Você é ótima, mas quero um celular",
    "Obrigado. Agora compare com o concorrente",
  ];
  const commercialRuns = [];
  for (const msg of commercialMsgs) {
    const r = await runSingle(browser, `COM_${msg.slice(0, 10)}`, msg, classifyCommercial);
    commercialRuns.push({ msg, ...r });
    log(`Commercial "${msg.slice(0, 20)}": ${r.classification}`);
    if (r.classification === "FALHA_TECNICA") await sleep(8000);
  }
  writeFileSync(join(EVIDENCE, "COMMERCIAL_REGRESSION.json"), JSON.stringify({ build: healthFinal.build, runs: commercialRuns }, null, 2));

  log("MIA compliment variants (15+)...");
  const miaVariantRuns = [];
  for (let i = 0; i < MIA_COMPLIMENT_VARIANTS.length; i++) {
    const msgs = MIA_COMPLIMENT_VARIANTS[i];
    const r = await runMultiTurn(browser, `MIA_VAR_${i + 1}`, msgs, (reply, semantics) => classifyMiaComplimentVariant(reply, semantics));
    miaVariantRuns.push({ variant: i + 1, messages: msgs, ...r });
    log(`MIA variant ${i + 1}/${MIA_COMPLIMENT_VARIANTS.length}: ${r.classification}`);
    if (r.classification === "FALHA_TECNICA") await sleep(8000);
  }
  writeFileSync(join(EVIDENCE, "MIA_COMPLIMENT_VARIANTS.json"), JSON.stringify({ build: healthFinal.build, runs: miaVariantRuns }, null, 2));

  log("Product compliment variants (15+)...");
  const productVariantRuns = [];
  for (let i = 0; i < PRODUCT_COMPLIMENT_VARIANTS.length; i++) {
    const msgs = PRODUCT_COMPLIMENT_VARIANTS[i];
    const r = await runMultiTurn(browser, `PROD_VAR_${i + 1}`, msgs, (reply) => classifyProductComplimentVariant(reply));
    productVariantRuns.push({ variant: i + 1, messages: msgs, ...r });
    log(`Product variant ${i + 1}/${PRODUCT_COMPLIMENT_VARIANTS.length}: ${r.classification}`);
    if (r.classification === "FALHA_TECNICA") await sleep(8000);
  }
  writeFileSync(join(EVIDENCE, "PRODUCT_COMPLIMENT_VARIANTS.json"), JSON.stringify({ build: healthFinal.build, runs: productVariantRuns }, null, 2));

  await browser.close();

  const b2Semantic = b2Runs.filter((r) => r.classification === "APROVADO").length;
  const b1Semantic = b1Runs.filter((r) => r.classification === "APROVADO").length;
  const lindaSemantic = lindaRuns.filter((r) => r.classification === "APROVADO").length;
  const critSemantic = criticalRuns.filter((r) => r.classification === "APROVADO").length;
  const socSemantic = socialRuns.filter((r) => r.classification === "APROVADO").length;
  const comSemantic = commercialRuns.filter((r) => r.classification === "APROVADO").length;
  const miaVarSemantic = miaVariantRuns.filter((r) => r.classification === "APROVADO").length;
  const prodVarSemantic = productVariantRuns.filter((r) => r.classification === "APROVADO").length;

  const deployOk = !EXPECTED_COMMIT || healthFinal.build?.startsWith(EXPECTED_COMMIT.slice(0, 12));
  const allGates =
    deployOk &&
    b2Semantic === 10 &&
    b1Semantic === 10 &&
    lindaSemantic === 5 &&
    critSemantic === 15 &&
    socSemantic === socialMsgs.length &&
    comSemantic === commercialMsgs.length &&
    miaVarSemantic === MIA_COMPLIMENT_VARIANTS.length &&
    prodVarSemantic === PRODUCT_COMPLIMENT_VARIANTS.length;

  const summary = {
    verdict: allGates ? "APROVADO" : "NAO_APROVADO",
    patch41i3Closeable: allGates,
    patch41jStartable: false,
    build: healthFinal.build,
    commit: EXPECTED_COMMIT || null,
    deployConfirmed: deployOk,
    rootCause: "Short social turns without sufficient context inferred wrong target",
    fixStage: "miaSemanticAuthority ambiguous_social + miaSemanticTargetResolution context gate",
    callSite: "selectGovernedFallback → buildProductAestheticFallback (blocked by mia_compliment contract)",
    noTextBasedDefense: true,
    gates: {
      b2: `${b2Semantic}/10`,
      b1: `${b1Semantic}/10`,
      lindaIsolated: `${lindaSemantic}/5`,
      critical: `${critSemantic}/15`,
      social: `${socSemantic}/${socialMsgs.length}`,
      commercial: `${comSemantic}/${commercialMsgs.length}`,
      miaComplimentVariants: `${miaVarSemantic}/${MIA_COMPLIMENT_VARIANTS.length}`,
      productComplimentVariants: `${prodVarSemantic}/${PRODUCT_COMPLIMENT_VARIANTS.length}`,
    },
    timestamp: new Date().toISOString(),
  };

  writeFileSync(join(EVIDENCE, "FINAL_SUMMARY.json"), JSON.stringify(summary, null, 2));
  log(`\nFINAL: ${summary.verdict}`);
  log(`B2: ${summary.gates.b2} | B1: ${summary.gates.b1} | Linda: ${summary.gates.lindaIsolated}`);
  log(`Critical: ${summary.gates.critical} | Social: ${summary.gates.social} | Commercial: ${summary.gates.commercial}`);
  log(`MIA variants: ${summary.gates.miaComplimentVariants} | Product variants: ${summary.gates.productComplimentVariants}`);
  process.exit(allGates ? 0 : 1);
}

main().catch((e) => {
  log(`Fatal: ${e.message}`);
  process.exit(1);
});
