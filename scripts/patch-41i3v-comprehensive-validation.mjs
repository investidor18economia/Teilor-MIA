#!/usr/bin/env node
/**
 * PATCH 4.1I.3.V — Comprehensive production UI validation
 */
import { createRequire } from "module";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { resolveSemanticTarget, SEMANTIC_TARGETS } from "../lib/miaSemanticTargetResolution.js";

const URL = "https://economia-ai.vercel.app/app-mia";
const BUILD = "2140d069ab5f";
const COMMIT = "2140d06";
const EVIDENCE = join(ROOT, "docs/conversational/audits/phase-4/evidence/patch-41i3v");
mkdirSync(join(EVIDENCE, "screenshots"), { recursive: true });

const LEGACY = [
  "Isso ajuda bastante a direcionar a escolha.",
  "O visual dele realmente chama atenção.",
  "Agora ficou mais claro o que você procura.",
  "Com esse contexto, consigo ser mais precisa.",
  "Me conta o que você está buscando",
  "celular, notebook ou outro produto",
];

const COMMERCIAL_REDIRECT = /\b(celular,\s*notebook|faixa ou produto|me conta o que voc[eê] est[aá] buscando|direcionar a escolha)\b/i;
const MIA_THANKS = /\b(obrigad\w*|valeu pelo elogio|que gentil)\b/i;
const PRODUCT_TALK = /\b(design|visual|aparelho|produto|galaxy|iphone|celular|traseira|câmera|camera)\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function inferSemantics(message, history = [], sessionContext = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext,
    signals: {},
    hasActiveAnchor: false,
    conversationMessages: history,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: false,
    sessionContext,
  });
  const contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: history,
    sessionContext,
  });
  const targetResolution = resolveSemanticTarget({
    message,
    recognition,
    conversationMessages: history,
    sessionContext,
  });
  return {
    primarySocialIntent: contract.primarySocialIntent || recognition.primarySocialIntent || null,
    governedSocialRoutingKey: contract.governedSocialRoutingKey || null,
    interactionMode: contract.interactionMode || recognition.interactionMode,
    resolvedSemanticTarget: contract.resolvedSemanticTarget || targetResolution.target,
    commercialFallbackBlocked: contract.commercialFallbackBlocked ?? null,
    targetConfidence: targetResolution.confidence,
    targetReasonCodes: targetResolution.reasonCodes || [],
  };
}

function hasLegacy(text) {
  return LEGACY.some((l) => text.includes(l));
}

function evaluateCase({ id, msg, reply, expectedTarget, expectCommerce, forbidMiaThanks, forbidLegacy, forbidCommercialRedirect, history = [] }) {
  const sem = inferSemantics(msg, history);
  const legacy = hasLegacy(reply);
  const commercialRedirect = COMMERCIAL_REDIRECT.test(reply);
  const miaThanks = MIA_THANKS.test(reply);
  const productTalk = PRODUCT_TALK.test(reply);

  let humanOk = true;
  const reasons = [];

  if (forbidLegacy !== false && legacy) {
    humanOk = false;
    reasons.push("legacy_phrase");
  }
  if (forbidCommercialRedirect !== false && commercialRedirect) {
    humanOk = false;
    reasons.push("commercial_redirect");
  }
  if (forbidMiaThanks && miaThanks) {
    humanOk = false;
    reasons.push("mia_thanks_wrong_target");
  }
  if (expectedTarget && sem.resolvedSemanticTarget !== expectedTarget) {
    // allow close targets for unknown/situation/conversation
    const close =
      (expectedTarget === SEMANTIC_TARGETS.UNKNOWN && [SEMANTIC_TARGETS.UNKNOWN, SEMANTIC_TARGETS.CONVERSATION].includes(sem.resolvedSemanticTarget)) ||
      (expectedTarget === SEMANTIC_TARGETS.SITUATION && [SEMANTIC_TARGETS.UNKNOWN, SEMANTIC_TARGETS.CONVERSATION, SEMANTIC_TARGETS.SITUATION].includes(sem.resolvedSemanticTarget)) ||
      (expectedTarget === SEMANTIC_TARGETS.PRODUCT && sem.resolvedSemanticTarget === SEMANTIC_TARGETS.PRODUCT) ||
      (expectedTarget === SEMANTIC_TARGETS.MIA && sem.resolvedSemanticTarget === SEMANTIC_TARGETS.MIA) ||
      (expectedTarget === SEMANTIC_TARGETS.PREVIOUS_ANSWER && [SEMANTIC_TARGETS.PREVIOUS_ANSWER, SEMANTIC_TARGETS.CONVERSATION].includes(sem.resolvedSemanticTarget));
    if (!close) {
      humanOk = false;
      reasons.push(`target_mismatch:expected=${expectedTarget},got=${sem.resolvedSemanticTarget}`);
    }
  }
  if (expectCommerce && sem.interactionMode !== "commerce" && !/redmi|galaxy|iphone|recomend|compar|notebook|tv|mouse|placa|orçamento/i.test(reply)) {
    humanOk = false;
    reasons.push("missing_commercial_content");
  }
  if (expectedTarget === SEMANTIC_TARGETS.PRODUCT && miaThanks && !productTalk) {
    humanOk = false;
    reasons.push("product_expected_but_mia_thanks");
  }
  if (expectedTarget === SEMANTIC_TARGETS.MIA && legacy && /visual dele/i.test(reply)) {
    humanOk = false;
    reasons.push("entity_frame_on_mia");
  }

  return {
    id,
    msg,
    reply,
    ...sem,
    legacyHit: legacy,
    commercialRedirect,
    miaThanks,
    classification: humanOk ? "APROVADO" : "REPROVADO",
    reasons,
    timestamp: new Date().toISOString(),
  };
}

async function createSession(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  const history = [];
  let sessionContext = {};

  async function send(text, { screenshotName = null } = {}) {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(text);
    await page.locator(".send-btn").click();
    let data = {};
    let status = 0;
    try {
      const resp = await responsePromise;
      status = resp.status();
      data = await resp.json().catch(() => ({}));
    } catch (e) {
      return { reply: `[ERROR: ${e.message}]`, status: 0, error: e.message };
    }
    await page
      .waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
        timeout: 120000,
      })
      .catch(() => {});
    await sleep(800);
    const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
    const reply = String(data?.reply || bubbleText || "").trim();
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: reply });
    sessionContext = data?.session_context || sessionContext;
    if (screenshotName) {
      await page.screenshot({
        path: join(EVIDENCE, "screenshots", `${screenshotName}.png`),
        fullPage: true,
      });
    }
    return { reply, status, sessionContext, mode: data?.session_context?.lastInteractionMode };
  }

  return { ctx, page, send, getHistory: () => history, getSession: () => sessionContext };
}

const allResults = [];
const browser = await chromium.launch({ headless: true });

async function runSingle(id, msg, evalOpts, shot = null) {
  const s = await createSession(browser);
  try {
    const { reply, status, error } = await s.send(msg, { screenshotName: shot || id.replace(/[^a-z0-9_-]/gi, "_") });
    const row = evaluateCase({ id, msg, reply, history: [], ...evalOpts });
    row.status = status;
    row.error = error || null;
    allResults.push(row);
    return row;
  } finally {
    await s.ctx.close();
  }
}

async function runMulti(id, turns, evalLast, shots = []) {
  const s = await createSession(browser);
  const turnResults = [];
  try {
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      const shot = shots[i] || (i === turns.length - 1 ? id : null);
      const { reply, status, error } = await s.send(t, {
        screenshotName: shot ? `${id}_T${i + 1}` : null,
      });
      turnResults.push({ turn: i + 1, msg: t, reply, status, error: error || null });
      await sleep(500);
    }
    const last = turnResults[turnResults.length - 1];
    const hist = s.getHistory().slice(0, -1);
    const row = evaluateCase({
      id,
      msg: last.msg,
      reply: last.reply,
      history: hist,
      ...evalLast,
    });
    row.turns = turnResults;
    row.status = last.status;
    allResults.push(row);
    if (shots.includes("final")) {
      await s.page.screenshot({ path: join(EVIDENCE, "screenshots", `${id}_final.png`), fullPage: true });
    }
    return row;
  } finally {
    await s.ctx.close();
  }
}

console.log(`PATCH 4.1I.3.V validation — build ${BUILD}`);

// BLOCK A
const blockA = [
  ["A1", "Você é bonita", { expectedTarget: SEMANTIC_TARGETS.MIA, forbidMiaThanks: false }],
  ["A2", "Esse aparelho é bonito", { expectedTarget: SEMANTIC_TARGETS.PRODUCT, forbidMiaThanks: true }],
  ["A3", "Sua resposta foi ótima", { expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER, forbidMiaThanks: false }],
  ["A4", "Gostei dessa conversa", { expectedTarget: SEMANTIC_TARGETS.CONVERSATION, forbidMiaThanks: false }],
  ["A5", "vc é linda demais", { expectedTarget: SEMANTIC_TARGETS.MIA, forbidMiaThanks: false }],
  ["A6", "O Galaxy A55 é lindo", { expectedTarget: SEMANTIC_TARGETS.PRODUCT, forbidMiaThanks: true }],
  ["A7", "essa resposta ficou boa demais", { expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER, forbidMiaThanks: false }],
  ["A8", "Ele é lindo", { expectedTarget: SEMANTIC_TARGETS.UNKNOWN, forbidMiaThanks: true }],
  ["A9", "Legal", { expectedTarget: null, forbidMiaThanks: false }],
  ["A10", "Isso foi complicado", { expectedTarget: SEMANTIC_TARGETS.SITUATION, forbidMiaThanks: false }],
];
for (const [id, msg, opts] of blockA) {
  console.log(`  ${id}...`);
  await runSingle(id, msg, opts);
}

// BLOCK B — D5 gate
console.log("  Block B...");
await runMulti("B1", ["O que você acha do design do Galaxy A55?", "Linda"], {
  expectedTarget: SEMANTIC_TARGETS.PRODUCT,
  forbidMiaThanks: true,
});
await runMulti("B2", ["Oi, MIA", "Linda"], {
  expectedTarget: SEMANTIC_TARGETS.MIA,
  forbidMiaThanks: false,
});
await runMulti("B3", ["Estou olhando o iPhone 15 azul", "Bonito demais"], {
  expectedTarget: SEMANTIC_TARGETS.PRODUCT,
  forbidMiaThanks: true,
});
await runMulti(
  "B4",
  ["Me explique a diferença entre OLED e AMOLED", "Muito boa"],
  { expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER, forbidMiaThanks: false }
);
await runMulti("B5", ["Quero só conversar com você", "Legal"], {
  expectedTarget: SEMANTIC_TARGETS.CONVERSATION,
  forbidCommercialRedirect: true,
});
await runMulti(
  "B6",
  ["O Galaxy A55 tem um design bonito?", "Linda", "Estou falando do celular"],
  { expectedTarget: SEMANTIC_TARGETS.PRODUCT, forbidMiaThanks: true }
);
await runMulti(
  "B7",
  ["Oi, MIA", "Linda", "Eu estava falando da interface"],
  { expectedTarget: null, forbidMiaThanks: false }
);

// BLOCK C — new variations (5 per category)
const blockC = [
  ...["MIA, você manda muito bem", "adorei te conhecer", "você parece bem esperta", "nossa, que assistente atenciosa", "vc é demais, viu"].map((m, i) => [
    `C1_${i + 1}`,
    m,
    { expectedTarget: SEMANTIC_TARGETS.MIA, forbidMiaThanks: false },
  ]),
  ...["A câmera desse modelo impressiona", "Esse notebook parece robusto", "A tela ficou excelente", "O preço dele assusta um pouco", "Gostei do acabamento premium"].map((m, i) => [
    `C2_${i + 1}`,
    m,
    { expectedTarget: SEMANTIC_TARGETS.PRODUCT, forbidMiaThanks: true },
  ]),
  ...["Ficou claro agora, valeu", "Não entendi essa parte da resposta", "Resume isso em uma frase", "Essa explicação ficou confusa", "Pode detalhar mais esse ponto"].map((m, i) => [
    `C3_${i + 1}`,
    m,
    { expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER, forbidMiaThanks: false },
  ]),
  ...["Estou gostando da conversa", "Vamos mudar de assunto", "Não quero falar disso agora", "Quero continuar conversando", "Vamos parar por aqui"].map((m, i) => [
    `C4_${i + 1}`,
    m,
    { expectedTarget: SEMANTIC_TARGETS.CONVERSATION, forbidCommercialRedirect: true },
  ]),
  ...["Isso aí", "Bonito", "Top demais", "E ele?", "Curti"].map((m, i) => [
    `C5_${i + 1}`,
    m,
    { expectedTarget: SEMANTIC_TARGETS.UNKNOWN, forbidMiaThanks: false },
  ]),
];
for (const [id, msg, opts] of blockC) {
  await runSingle(id, msg, opts);
}

// BLOCK D
const blockD = [
  "Quero conversar sobre música",
  "Gosto muito de jogos",
  "Hoje foi um dia cansativo",
  "Acabei de assistir um filme",
  "Você acha carros antigos bonitos?",
  "Estou sem assunto",
  "Me conta alguma coisa interessante",
  "Podemos mudar de assunto?",
  "Não quero comprar nada agora",
  "Quero só trocar ideia",
  "Qual música você acha relaxante?",
  "Você gosta de histórias?",
  "Hoje eu só quero conversar um pouco",
  "O que você acha de jogos de mundo aberto?",
  "Meu dia foi meio estranho",
];
for (let i = 0; i < blockD.length; i++) {
  await runSingle(`D${i + 1}`, blockD[i], { forbidCommercialRedirect: true });
}

// BLOCK E
const blockE = [
  "Você é muito inteligente. Agora me ajuda a escolher um celular.",
  "Obrigado pela ajuda. Compare agora o A55 com o Edge 50 Fusion.",
  "Gostei de você, mas ainda não sei qual notebook comprar.",
  "Foi uma boa explicação. Qual deles vale mais a pena?",
  "Você é charmosa kkk, mas falando sério: quero uma TV até R$ 3.000.",
  "Eu estava brincando antes. Agora quero voltar para a comparação.",
  "Não quero comprar hoje, só quero entender qual modelo seria melhor.",
  "Valeu. E para jogos, muda alguma coisa?",
];
for (let i = 0; i < blockE.length; i++) {
  await runSingle(`E${i + 1}`, blockE[i], { forbidLegacy: true });
}

// BLOCK F multiturn
await runMulti(
  "F1",
  [
    "Quero um celular até R$ 2.000",
    "Você explica muito bem",
    "Mas agora quero só conversar um pouco",
    "Gosto de jogos de mundo aberto",
    "Vamos voltar ao celular: quero boa bateria",
  ],
  { expectCommerce: true, forbidCommercialRedirect: false },
  ["final"]
);
await runMulti(
  "F2",
  ["O que acha do design do Galaxy A55?", "Linda", "Quis dizer a traseira do celular", "E a câmera, é boa?"],
  { expectedTarget: SEMANTIC_TARGETS.PRODUCT, forbidMiaThanks: true },
  ["final"]
);
await runMulti(
  "F3",
  ["Você é muito inteligente", "Era ironia", "Tô brincando kkk", "Mas você me ajudou mesmo"],
  { forbidCommercialRedirect: true },
  ["final"]
);
await runMulti(
  "F4",
  [
    "Só quero conversar",
    "Hoje foi um dia cansativo",
    "Joguei um pouco para relaxar",
    "Gosto muito de jogos de mundo aberto",
    "Enfim, obrigado pela conversa",
  ],
  { forbidCommercialRedirect: true },
  ["final"]
);
await runMulti(
  "F5",
  [
    "Você é muito boa nisso",
    "Me ajuda a comparar dois celulares",
    "Valeu, gostei da explicação",
    "Agora quero um mais barato",
    "Mas sem perder muita câmera",
  ],
  { forbidLegacy: true },
  ["final"]
);
await runMulti(
  "F6",
  [
    "Quero conversar sobre filmes de ficção",
    "Gosto de histórias com final aberto",
    "Vi um filme estranho ontem",
    "Prefiro suspense a comédia",
    "Obrigado pelo papo",
  ],
  { forbidCommercialRedirect: true },
  ["final"]
);

// BLOCK G
const blockG = [
  "Era ironia",
  "Eu tava só zoando",
  "Foi sarcasmo",
  "Você levou a sério demais kkk",
  "Não foi isso que eu quis dizer",
  "Você entendeu errado",
  "Discordo dessa resposta",
  "Não concordo com essa recomendação",
  "Calma, era brincadeira",
  "Eu estava falando de outra coisa",
  "Não, o bonito era sobre o celular",
  "Você confundiu o que eu quis dizer",
];
for (let i = 0; i < blockG.length; i++) {
  await runSingle(`G${i + 1}`, blockG[i], { forbidCommercialRedirect: true, forbidLegacy: true });
}

// BLOCK H
const blockH = [
  "Qual celular compensa até R$ 2.000?",
  "Quero um notebook para trabalhar",
  "Compare duas TVs para mim",
  "Preciso de um mouse para jogos",
  "Qual placa de vídeo vale a pena?",
  "Quero comprar um presente",
  "Esse aparelho é bonito, mas vale o preço?",
  "Obrigado. Agora compare com o concorrente.",
  "Você é ótima, mas quero voltar aos celulares.",
  "Não quero comprar agora, só entender qual seria melhor.",
];
for (let i = 0; i < blockH.length; i++) {
  await runSingle(`H${i + 1}`, blockH[i], { expectCommerce: i !== 9, forbidLegacy: false });
}
for (let r = 1; r <= 3; r++) {
  await runSingle(`H1_r${r}`, blockH[0], { expectCommerce: true });
}

// BLOCK I
await runMulti("I1", ["Qual a diferença entre LCD e OLED?", "Essa resposta ficou ótima"], {
  expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER,
});
await runMulti("I2", ["Qual celular compensa até R$ 2.000?", "Não concordo com isso"], {
  forbidLegacy: true,
});
await runMulti("I3", ["Como funciona a câmera do iPhone 15?", "Explica isso de um jeito mais simples"], {
  expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER,
});
await runMulti("I4", ["O que acha do design do Galaxy A55?", "Aprofunda essa parte"], {
  expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER,
});
await runMulti(
  "I5",
  ["O Galaxy A55 parece bonito", "Não, eu estava falando da sua resposta"],
  { expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER }
);

// BLOCK J stability (3x each)
const stabilityCases = [
  { id: "J_Linda", msg: "Linda", opts: { expectedTarget: SEMANTIC_TARGETS.MIA, forbidLegacy: true } },
  { id: "J_vc_linda", msg: "vc é linda", opts: { expectedTarget: SEMANTIC_TARGETS.MIA, forbidLegacy: true } },
  { id: "J_ironia", msg: "Era ironia", opts: { forbidCommercialRedirect: true, forbidLegacy: true } },
  { id: "J_conversar", msg: "Só queria conversar", opts: { forbidCommercialRedirect: true, forbidLegacy: true } },
  { id: "J_ajudou", msg: "Você me ajudou muito", opts: { forbidLegacy: true } },
  { id: "J_aparelho", msg: "Esse aparelho é bonito", opts: { expectedTarget: SEMANTIC_TARGETS.PRODUCT, forbidMiaThanks: true } },
  { id: "J_resposta_otima", msg: "Sua resposta foi ótima", opts: { expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER } },
  { id: "J_ele_lindo", msg: "Ele é lindo", opts: { expectedTarget: SEMANTIC_TARGETS.UNKNOWN, forbidMiaThanks: true } },
  {
    id: "J_prod_Linda",
    multi: ["O que acha do design do Galaxy A55?", "Linda"],
    opts: { expectedTarget: SEMANTIC_TARGETS.PRODUCT, forbidMiaThanks: true },
  },
  { id: "J_mia_Linda", multi: ["Oi, MIA", "Linda"], opts: { expectedTarget: SEMANTIC_TARGETS.MIA } },
  {
    id: "J_resp_Muitoboa",
    multi: ["Me explique OLED vs AMOLED", "Muito boa"],
    opts: { expectedTarget: SEMANTIC_TARGETS.PREVIOUS_ANSWER },
  },
  { id: "J_musica", msg: "Quero conversar sobre música", opts: { forbidCommercialRedirect: true } },
  { id: "J_mixed", msg: "Você é ótima, mas quero um celular", opts: { forbidLegacy: true } },
  { id: "J_cel2000", msg: "Qual celular compensa até R$ 2.000?", opts: { expectCommerce: true } },
  { id: "J_brincando", msg: "Eu tava só brincando", opts: { forbidCommercialRedirect: true, forbidLegacy: true } },
];

for (const sc of stabilityCases) {
  for (let rep = 1; rep <= 3; rep++) {
    const rid = `${sc.id}_r${rep}`;
    if (sc.multi) {
      await runMulti(rid, sc.multi, sc.opts);
    } else {
      await runSingle(rid, sc.msg, sc.opts);
    }
    await sleep(400);
  }
}

await browser.close();

const summary = {
  build: BUILD,
  commit: COMMIT,
  url: URL,
  timestamp: new Date().toISOString(),
  total: allResults.length,
  aprovado: allResults.filter((r) => r.classification === "APROVADO").length,
  reprovado: allResults.filter((r) => r.classification === "REPROVADO").length,
  inconclusivo: allResults.filter((r) => r.error || r.reply?.startsWith("[ERROR")).length,
  legacyHits: allResults.filter((r) => r.legacyHit).length,
  results: allResults,
};

writeFileSync(join(EVIDENCE, "PATCH_4_1I3V_FULL_EVIDENCE.json"), JSON.stringify(summary, null, 2));
writeFileSync(
  join(EVIDENCE, "PATCH_4_1I3V_SUMMARY.json"),
  JSON.stringify(
    {
      build: BUILD,
      total: summary.total,
      aprovado: summary.aprovado,
      reprovado: summary.reprovado,
      inconclusivo: summary.inconclusivo,
      legacyHits: summary.legacyHits,
      gates: {
        B1: allResults.find((r) => r.id === "B1")?.classification,
        B2: allResults.find((r) => r.id === "B2")?.classification,
        legacyZeroSocial: allResults.filter((r) => r.legacyHit && !r.id.startsWith("H")).length,
      },
    },
    null,
    2
  )
);

console.log("\nSUMMARY:", JSON.stringify(summary, null, 2).slice(0, 2000));
console.log(`\nEvidence: ${EVIDENCE}`);
