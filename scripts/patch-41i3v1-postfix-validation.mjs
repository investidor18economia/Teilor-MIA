#!/usr/bin/env node
/**
 * PATCH 4.1I.3.V.1 — Post-fix production revalidation
 */
import { createRequire } from "module";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
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

const URL = "https://economia-ai.vercel.app/app-mia";
const BUILD = process.env.MIA_BUILD || "f49a4f1982fa";
const COMMIT = "f49a4f1";
const EVIDENCE = join(ROOT, "docs/conversational/audits/phase-4/evidence/patch-41i3v1");
mkdirSync(join(EVIDENCE, "screenshots"), { recursive: true });

const LEGACY_PHRASES = [
  "Isso ajuda bastante a direcionar a escolha.",
  "O visual dele realmente chama atenção.",
  "Agora ficou mais claro o que você procura.",
  "Entendi o que mudou — isso conta.",
  "Com esse contexto, consigo ser mais precisa.",
  "Me conta o que você está buscando",
  "celular, notebook ou outro produto",
  "Pois é.",
];
const COMMERCIAL_REDIRECT = /\b(celular,\s*notebook|faixa ou produto|me conta o que voc[eê] est[aá] buscando|direcionar a escolha|sem essa marca)\b/i;
const MIA_THANKS = /\b(obrigad\w*|valeu pelo elogio|que gentil)\b/i;
const RATE_LIMIT = /várias mensagens em sequência|aguarde alguns segundos/i;
const PRODUCT_TALK = /\b(design|visual|iphone|galaxy|celular|produto|aparelho|câmera|camera|acabamento|premium|elegante|modelo|azul|vermelho|notebook)\b/i;

const DELAY_MS = 2800;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasLegacy(text) {
  return LEGACY_PHRASES.some((p) => text.includes(p));
}

function inferSemantics(message, history = []) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: {},
    signals: {},
    hasActiveAnchor: false,
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
  const targetResolution = resolveSemanticTarget({
    message,
    recognition,
    conversationMessages: history,
  });
  return {
    interactionMode: contract.interactionMode || recognition.interactionMode,
    resolvedSemanticTarget: contract.resolvedSemanticTarget || targetResolution.target,
    governedSocialRoutingKey: contract.governedSocialRoutingKey || null,
    commercialFallbackBlocked: contract.commercialFallbackBlocked ?? null,
    targetReasonCodes: targetResolution.reasonCodes || [],
  };
}

function classifyReply(reply, checks = {}) {
  const reasons = [];
  if (!reply || reply.startsWith("[ERROR")) reasons.push("empty_or_error");
  if (RATE_LIMIT.test(reply)) reasons.push("rate_limit");
  if (checks.forbidLegacy !== false && hasLegacy(reply)) reasons.push("legacy_phrase");
  if (checks.forbidCommercialRedirect !== false && COMMERCIAL_REDIRECT.test(reply))
    reasons.push("commercial_redirect");
  if (checks.forbidMiaThanks && MIA_THANKS.test(reply)) reasons.push("mia_thanks");
  if (checks.expectMiaThanks && !MIA_THANKS.test(reply)) reasons.push("missing_mia_thanks");
  if (checks.expectProductTalk && !PRODUCT_TALK.test(reply)) reasons.push("missing_product_talk");
  if (checks.expectSocial && COMMERCIAL_REDIRECT.test(reply)) reasons.push("not_social");
  return {
    classification: reasons.length ? (reasons.includes("rate_limit") ? "INCONCLUSIVO" : "REPROVADO") : "APROVADO",
    reasons,
    legacyHit: hasLegacy(reply),
    commercialRedirect: COMMERCIAL_REDIRECT.test(reply),
    miaThanks: MIA_THANKS.test(reply),
  };
}

async function createSession(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  const history = [];

  async function send(text, screenshot = null) {
    await sleep(DELAY_MS);
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(text);
    await page.locator(".send-btn").click();
    let reply = "";
    let status = 0;
    try {
      const resp = await responsePromise;
      status = resp.status();
      const data = await resp.json().catch(() => ({}));
      await page
        .waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
          timeout: 120000,
        })
        .catch(() => {});
      await sleep(600);
      const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
      reply = String(data?.reply || bubbleText || "").trim();
    } catch (e) {
      reply = `[ERROR: ${e.message}]`;
    }
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: reply });
    if (screenshot) {
      await page.screenshot({ path: join(EVIDENCE, "screenshots", screenshot), fullPage: true });
    }
    return { reply, status, history: [...history] };
  }

  return { ctx, send, getHistory: () => history };
}

async function runSingle(browser, id, msg, checks = {}, shot = null) {
  const s = await createSession(browser);
  try {
    const { reply } = await s.send(msg, shot);
    const sem = inferSemantics(msg);
    const verdict = classifyReply(reply, checks);
    return { id, msg, reply, ...sem, ...verdict, timestamp: new Date().toISOString() };
  } finally {
    await s.ctx.close();
  }
}

async function runMulti(browser, id, turns, checks = {}, shot = null) {
  const s = await createSession(browser);
  try {
    const turnResults = [];
    let reply = "";
    for (let i = 0; i < turns.length; i++) {
      const r = await s.send(turns[i], i === turns.length - 1 ? shot : null);
      reply = r.reply;
      turnResults.push({ turn: i + 1, msg: turns[i], reply });
    }
    const sem = inferSemantics(turns[turns.length - 1], s.getHistory().slice(0, -1));
    const verdict = classifyReply(reply, checks);
    return { id, turns: turnResults, reply, ...sem, ...verdict, timestamp: new Date().toISOString() };
  } finally {
    await s.ctx.close();
  }
}

async function runStability(browser, id, msgOrTurns, checks, times = 3) {
  const results = [];
  for (let i = 1; i <= times; i++) {
    const rid = `${id}_r${i}`;
    const row = Array.isArray(msgOrTurns)
      ? await runMulti(browser, rid, msgOrTurns, checks)
      : await runSingle(browser, rid, msgOrTurns, checks);
    results.push(row);
    process.stdout.write(`  ${row.classification} ${rid}\n`);
  }
  const aprovado = results.filter((r) => r.classification === "APROVADO").length;
  return { id, runs: results, aprovado, total: times, pass: aprovado === times };
}

const log = [];
function save(name, data) {
  writeFileSync(join(EVIDENCE, name), JSON.stringify(data, null, 2));
}

console.log(`\nPATCH 4.1I.3.V.1 — build ${BUILD} commit ${COMMIT}\n`);

// Health
save("HEALTH_BEFORE.json", { build: BUILD, commit: COMMIT, url: URL, timestamp: new Date().toISOString() });

const browser = await chromium.launch({ headless: true });

// === RERUN 11 CASES ===
console.log("Rerun 11 cases...");
const rerun11 = [];
const rerunCases = [
  ["A4", "Gostei dessa conversa", { forbidCommercialRedirect: true }],
  ["D1", "Quero conversar sobre música", { forbidCommercialRedirect: true }],
  ["A8", "Ele é lindo", { forbidCommercialRedirect: true }],
  ["A10", "Isso foi complicado", { forbidCommercialRedirect: true }, "A10.png"],
  ["D6", "Estou sem assunto", { forbidCommercialRedirect: true }, "D6.png"],
  ["B1", ["O que você acha do design do Galaxy A55?", "Linda"], { forbidMiaThanks: true, expectProductTalk: true }, "B1.png"],
  ["B2", ["Oi, MIA", "Linda"], { expectMiaThanks: true }, "B2.png"],
  ["B3", ["Estou olhando o iPhone 15 azul", "Bonito demais"], { forbidMiaThanks: true }, "B3.png"],
  ["B4", ["Me explique a diferença entre OLED e AMOLED", "Muito boa"], {}],
  ["I1", ["Qual a diferença entre LCD e OLED?", "Essa resposta ficou ótima"], {}],
  ["B6", ["O Galaxy A55 tem um design bonito?", "Linda", "Estou falando do celular"], { forbidMiaThanks: true, forbidCommercialRedirect: true }],
];
for (const c of rerunCases) {
  const row = Array.isArray(c[1])
    ? await runMulti(browser, c[0], c[1], c[2] || {}, c[3])
    : await runSingle(browser, c[0], c[1], c[2] || {}, c[3]);
  rerun11.push(row);
  console.log(`  ${row.classification} ${c[0]}: ${row.reply.slice(0, 80)}`);
  log.push(`${row.classification} rerun ${c[0]}`);
}
save("RERUN_11_CASES.json", { build: BUILD, commit: COMMIT, total: rerun11.length, aprovado: rerun11.filter((r) => r.classification === "APROVADO").length, results: rerun11 });

// === A10 variations ===
console.log("\nA10 variations...");
const a10Msgs = [
  "Isso foi complicado",
  "Foi meio estranho",
  "Essa situação foi chata",
  "Isso não foi legal",
  "Foi confuso",
  "Complicado isso aí",
  "Não gostei disso",
  "Que situação ruim",
];
const a10Results = [];
for (const msg of a10Msgs) {
  const row = await runSingle(browser, `A10_${msg.slice(0, 12).replace(/\W/g, "_")}`, msg, { forbidCommercialRedirect: true });
  a10Results.push(row);
  console.log(`  ${row.classification}: ${msg}`);
}
save("A10_RESULTS.json", { build: BUILD, results: a10Results, aprovado: a10Results.filter((r) => r.classification === "APROVADO").length });

// === B3 variations ===
console.log("\nB3 variations...");
const b3Cases = [
  ["B3_orig", ["Estou olhando o iPhone 15 azul", "Bonito demais"]],
  ["B3_galaxy", ["Estou vendo o Galaxy A55 preto", "Lindo"]],
  ["B3_notebook", ["Esse notebook tem acabamento em alumínio", "Bonito mesmo"]],
  ["B3_vermelho", ["Olha esse modelo vermelho", "Muito bonito"]],
  ["B3_design", ["Estou falando do design do aparelho", "Charmoso"]],
  ["B3_elegante", ["O iPhone 15 azul parece elegante", "Demais"]],
];
const b3Results = [];
for (const [id, turns] of b3Cases) {
  const row = await runMulti(browser, id, turns, { forbidMiaThanks: true, forbidCommercialRedirect: true });
  b3Results.push(row);
  console.log(`  ${row.classification} ${id}: ${row.reply.slice(0, 70)}`);
}
save("B3_RESULTS.json", { build: BUILD, results: b3Results, aprovado: b3Results.filter((r) => r.classification === "APROVADO").length });

// === D6 + non-commercial multiturn ===
console.log("\nD6 and non-commercial multiturn...");
const d6Single = await runSingle(browser, "D6", "Estou sem assunto", { forbidCommercialRedirect: true }, "D6_single.png");
const gamesMt = await runMulti(
  browser,
  "D6_games_6t",
  [
    "Quero conversar sobre jogos",
    "Gosto muito de jogos de mundo aberto",
    "O que deixa esse tipo de jogo tão relaxante?",
    "Pra mim é poder andar sem rumo",
    "Às vezes jogo só para esquecer os problemas",
    "Enfim, obrigado pela conversa",
  ],
  { forbidCommercialRedirect: true },
  "D6_games.png"
);
const musicMt = await runMulti(
  browser,
  "D6_music_6t",
  [
    "Quero falar de música",
    "Gosto de ouvir jazz à noite",
    "Me recomenda um estilo relaxante?",
    "Hoje foi cansativo",
    "A música ajuda a desligar",
    "Valeu pela conversa",
  ],
  { forbidCommercialRedirect: true }
);
save("D6_RESULTS.json", { build: BUILD, d6Single, gamesMt, musicMt });

// === B1/B2 stability 3x ===
console.log("\nB1/B2 stability 3x...");
const b1Stab = await runStability(browser, "B1", ["O que você acha do design do Galaxy A55?", "Linda"], { forbidMiaThanks: true, expectProductTalk: true });
const b2Stab = await runStability(browser, "B2", ["Oi, MIA", "Linda"], { expectMiaThanks: true });
save("B1_B2_STABILITY.json", { build: BUILD, b1: b1Stab, b2: b2Stab });

// === Critical 5 x3 ===
console.log("\nCritical 5 x3...");
const critical = [
  ["Linda", { forbidCommercialRedirect: true }],
  ["Você é muito inteligente", {}],
  ["Era ironia", { forbidCommercialRedirect: true }],
  ["Só queria conversar", { forbidCommercialRedirect: true }],
  ["Você me ajudou muito", {}],
];
const criticalResults = {};
for (const [msg, checks] of critical) {
  const id = msg.replace(/\W/g, "_").slice(0, 20);
  criticalResults[id] = await runStability(browser, `CRIT_${id}`, msg, checks);
}
save("CRITICAL_5_STABILITY.json", { build: BUILD, results: criticalResults });

// === Legacy hits rerun ===
console.log("\nLegacy hits rerun...");
const legacyCases = [
  ["A4", "Gostei dessa conversa"],
  ["A10", "Isso foi complicado"],
  ["C1_2", "adorei te conhecer"],
  ["D1", "Quero conversar sobre música"],
  ["E5", "Você é charmosa kkk, mas falando sério: quero uma TV até R$ 3.000."],
  ["G7", "Discordo dessa resposta"],
];
const legacyResults = [];
for (const [id, msg] of legacyCases) {
  const row = await runSingle(browser, `LEG_${id}`, msg, { forbidLegacy: true, forbidCommercialRedirect: id !== "E5" });
  legacyResults.push(row);
  console.log(`  ${row.classification} ${id}`);
}
for (let i = 1; i <= 3; i++) {
  const row = await runSingle(browser, `LEG_J_musica_r${i}`, "Quero conversar sobre música", { forbidLegacy: true, forbidCommercialRedirect: true });
  legacyResults.push(row);
}
save("LEGACY_HITS_RERUN.json", { build: BUILD, results: legacyResults, legacyHits: legacyResults.filter((r) => r.legacyHit).length });

// === Social regression ===
console.log("\nSocial regression...");
const socialMsgs = [
  "Foi complicado",
  "Estranho isso",
  "Que chato",
  "Legal",
  "Bonito",
  "Muito boa",
  "Entendi",
  "Não era isso",
  "Era brincadeira",
  "Só quero conversar",
  "Não quero comprar nada",
  "Me conta alguma coisa",
  "Hoje foi cansativo",
  "Gosto de jogos",
  "Quero falar de música",
];
const socialResults = [];
for (const msg of socialMsgs) {
  socialResults.push(await runSingle(browser, `SOC_${msg.slice(0, 10).replace(/\W/g, "_")}`, msg, { forbidCommercialRedirect: true }));
}
save("SOCIAL_REGRESSION.json", { build: BUILD, results: socialResults, aprovado: socialResults.filter((r) => r.classification === "APROVADO").length });

// === Commercial regression ===
console.log("\nCommercial regression...");
const commercialCases = [
  ["COM_1", "Quero um celular"],
  ["COM_2", "Quero um bom"],
  ["COM_3", "Até 2 mil"],
  ["COM_4", "Para jogos"],
  ["COM_5", "Quero um notebook"],
  ["COM_6", "Um barato"],
  ["COM_7", ["Compare o Galaxy A55 com o Moto G84", "Compare os dois"]],
  ["COM_8", ["O que acha do Galaxy A55?", "E a câmera?"]],
  ["COM_9", ["Estou olhando o iPhone 15", "Esse vale a pena?"]],
  ["COM_10", ["Quero celular até 2000", "Qual compensa mais?"]],
];
const commercialResults = [];
for (const c of commercialCases) {
  const row = Array.isArray(c[1])
    ? await runMulti(browser, c[0], c[1], { forbidCommercialRedirect: false })
    : await runSingle(browser, c[0], c[1], { forbidCommercialRedirect: false });
  commercialResults.push(row);
}
const comStab = [];
for (let i = 1; i <= 3; i++) {
  comStab.push(await runSingle(browser, `COM_H1_r${i}`, "Qual celular compensa até R$ 2.000?", {}));
  comStab.push(await runSingle(browser, `COM_MIX_r${i}`, "Você é ótima, mas quero um celular", {}));
  comStab.push(await runMulti(browser, `COM_THX_r${i}`, ["Compare Galaxy A55 e Moto G84", "Obrigado. Agora compare com o concorrente"], {}));
}
save("COMMERCIAL_REGRESSION.json", { build: BUILD, results: commercialResults, stability: comStab });

// === Multiturn 6 scenarios ===
console.log("\nMultiturn scenarios...");
const mt = [];
mt.push(await runMulti(browser, "MT1", ["O que acha do design do Galaxy A55?", "Linda", "Quis dizer a traseira do celular", "E a câmera, é boa?"], { forbidMiaThanks: true }));
mt.push(await runMulti(browser, "MT2", ["Só quero conversar", "Hoje foi cansativo", "Foi complicado", "Trabalhei demais", "Agora quero relaxar"], { forbidCommercialRedirect: true }));
mt.push(await runMulti(browser, "MT3", ["Oi MIA", "Linda", "Era brincadeira", "Mas você me ajudou", "Valeu"], {}));
mt.push(await runMulti(browser, "MT4", ["Quero celular até 2000", "Você explica muito bem", "Agora quero só conversar", "Gosto de jogos", "Voltar ao celular: quero boa bateria"], {}));
mt.push(gamesMt);
mt.push(await runMulti(browser, "MT6", ["Você é muito boa", "Me ajuda a comparar dois celulares", "Não concordo com isso", "Quero um mais barato", "Mas sem perder câmera", "Valeu"], {}));
save("MULTITURN_RESULTS.json", { build: BUILD, results: mt });

// === Family matrix (minimal) ===
console.log("\nFamily matrix...");
const family = { unknown: [], product: [], mia: [], previous: [], social: [], irony: [], mixed: [], commerce: [], shortRef: [] };
const familyCases = {
  unknown: ["Ele é lindo", "Bonito", "Top demais", "Isso foi complicado", "Foi confuso", "Legal", "Estranho", "Complicado isso aí"],
  product: [["O Galaxy A55 é bonito?", "Linda"], ["Estou olhando iPhone 15", "Bonito demais"], "Esse aparelho parece robusto", "A câmera desse modelo impressiona", "Gostei do acabamento premium", "O preço dele assusta", "A tela ficou excelente", "Esse notebook parece robusto"],
  mia: ["Você é bonita", "vc é linda demais", "MIA, você manda bem", "nossa que assistente atenciosa", "adorei te conhecer", "vc é demais viu"],
  previous: [["Me explique OLED vs AMOLED", "Muito boa"], ["Qual celular até 2000?", "Não concordo"], "Essa resposta ficou ótima", "Resume isso em uma frase", "Pode detalhar mais", "Essa explicação ficou confusa"],
  social: ["Quero conversar sobre música", "Hoje foi cansativo", "Estou sem assunto", "Podemos mudar de assunto?", "Quero só trocar ideia", "Gostei dessa conversa", "Vamos mudar de assunto", "Não quero comprar nada", "Me conta alguma coisa interessante", "Hoje eu só quero conversar"],
  irony: ["Era ironia", "Eu tava só zoando", "Foi sarcasmo", "Calma era brincadeira", "Não foi isso que eu quis dizer", "Você entendeu errado", "Discordo dessa resposta", "Não concordo com essa recomendação"],
  mixed: ["Você é inteligente. Agora me ajuda a escolher um celular.", "Gostei de você, mas não sei qual notebook comprar.", "Foi boa explicação. Qual vale mais a pena?", "Você é charmosa kkk, quero TV até 3000", "Não quero comprar hoje, só entender qual modelo", "Valeu. E para jogos muda?", "Você é ótima mas quero celular", "Obrigado. Compare agora A55 e Edge 50"],
  commerce: ["Qual celular compensa até R$ 2.000?", "Quero notebook para trabalhar", "Compare duas TVs", "Preciso mouse para jogos", "Qual placa de vídeo vale?", "Quero comprar presente", "Esse aparelho é bonito mas vale o preço?", "Quero celular bom"],
  shortRef: [["Oi MIA", "Linda"], ["Design Galaxy A55?", "Linda"], ["Explique OLED", "Muito boa"], ["iPhone 15 azul", "Bonito demais"], ["Só conversar", "Legal"], ["MIA linda", "Era ironia"], ["Galaxy A55 design", "Bonito"], ["OLED explicado", "Boa demais"]],
};
for (const [fam, cases] of Object.entries(familyCases)) {
  for (const c of cases) {
    const row = Array.isArray(c) ? await runMulti(browser, `${fam}_${Math.random().toString(36).slice(2, 6)}`, c, fam === "commerce" ? {} : { forbidCommercialRedirect: fam !== "mixed" }) : await runSingle(browser, `${fam}_${Math.random().toString(36).slice(2, 6)}`, c, fam === "commerce" ? {} : { forbidCommercialRedirect: ["social", "unknown", "mia", "irony"].includes(fam) });
    family[fam].push(row);
  }
}
save("FAMILY_MATRIX.json", { build: BUILD, family });

// === 44 reprovados classification ===
const priorFails = JSON.parse(
  readFileSync(join(ROOT, "docs/conversational/audits/phase-4/evidence/patch-41i3v/PATCH_4_1I3V_FULL_EVIDENCE.json"), "utf8")
).results.filter((r) => r.classification === "REPROVADO");
const classification = priorFails.map((r) => {
  let bucket = "independente";
  const id = r.id || "";
  if (["A4", "D1", "J_musica"].some((p) => id.startsWith(p) || id.includes("musica"))) bucket = "8f59803_conversation_commercial";
  else if (id === "A10" || id.startsWith("A10")) bucket = "f49a4f1_clarification";
  else if (id === "B3" || id.startsWith("B3")) bucket = "8f59803_product_aesthetic";
  else if (id === "D6") bucket = "independente_d6";
  else if (r.reasons?.some((x) => x.includes("legacy"))) bucket = "legacy_path";
  else if (r.reasons?.some((x) => x.includes("previous_answer"))) bucket = "8f59803_previous_answer";
  else if (r.reasons?.some((x) => x.includes("product"))) bucket = "8f59803_product_target";
  else if (r.reasons?.some((x) => x.includes("conversation"))) bucket = "8f59803_conversation";
  else if (r.reasons?.some((x) => x.includes("missing_commercial"))) bucket = "rate_limit_or_commercial";
  return { id: r.id, msg: r.msg, priorReasons: r.reasons, bucket };
});
save("FAILED_44_CLASSIFICATION.json", { build: BUILD, classification });

await browser.close();

const summary = {
  build: BUILD,
  commit: COMMIT,
  url: URL,
  timestamp: new Date().toISOString(),
  rerun11: { total: rerun11.length, aprovado: rerun11.filter((r) => r.classification === "APROVADO").length },
  a10: { total: a10Results.length, aprovado: a10Results.filter((r) => r.classification === "APROVADO").length },
  b3: { total: b3Results.length, aprovado: b3Results.filter((r) => r.classification === "APROVADO").length },
  b1Stability: b1Stab.pass,
  b2Stability: b2Stab.pass,
  legacyHits: legacyResults.filter((r) => r.legacyHit).length,
  socialRegression: socialResults.filter((r) => r.classification === "APROVADO").length,
};
save("FINAL_SUMMARY.json", summary);
save("HEALTH_FINAL.json", summary);
writeFileSync(join(EVIDENCE, "run.log"), log.join("\n"));
console.log("\nSUMMARY:", JSON.stringify(summary, null, 2));
console.log(`\nEvidence: ${EVIDENCE}\n`);
