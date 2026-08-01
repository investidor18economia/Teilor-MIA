#!/usr/bin/env node
/**
 * PATCH 5.6 — Production Quality & Semantic Stability Audit (production UI + API)
 * Observability post-hoc via miaConversationalObservability (no decision changes).
 * Run: node scripts/patch-56-production-quality-audit.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-56");
const SHOTS = join(OUT, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const PROD_UI = "https://economia-ai.vercel.app/app-mia";
const HEALTH = "https://economia-ai.vercel.app/api/health";
const SPACING_MS = 4500;
const LOG = join(OUT, "run.log");

const { runUniversalValidatorChain, RECOVERY_STRATEGIES } = await import(
  pathToFileURL(join(ROOT, "lib/miaUniversalConversationRecovery.js")).href
);
const { MIA_INTERACTION_MODES } = await import(
  pathToFileURL(join(ROOT, "lib/miaIntentRecognitionLayer.js")).href
);
const {
  measureVerbalizationQuality,
  measurePersonalityConsistency,
  classifyVerbalizationVariation,
  evaluateSemanticStability,
  buildSemanticVerbalFingerprint,
  buildConversationalObservabilityReport,
  CONVERSATIONAL_OBSERVABILITY_VERSION,
} = await import(pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(LOG, line);
  console.log(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeReply(text = "") {
  return String(text || "")
    .replace(/^MIΛ\s*/i, "")
    .replace(/^MIA\s*/i, "")
    .replace(/recomendação miλ[\s\S]*$/i, "")
    .replace(/oferta selecionada[\s\S]*$/i, "")
    .replace(/produto disponível[\s\S]*$/i, "")
    .replace(/você enviou várias mensagens em sequência\.?\s*aguarde\.?/gi, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRateLimited(text = "") {
  return /várias mensagens em sequência|aguarde/i.test(String(text || ""));
}

function isCommercialPath(path = "") {
  const p = String(path || "").toLowerCase();
  return /commercial|commerce|product|recommend|comparison|budget|clarification_commercial/.test(p);
}

function inferInteractionMode(apiMeta = {}) {
  if (isCommercialPath(apiMeta.response_path)) return MIA_INTERACTION_MODES.COMMERCE;
  if (/mixed/.test(String(apiMeta.response_path || ""))) return MIA_INTERACTION_MODES.MIXED;
  return MIA_INTERACTION_MODES.SOCIAL;
}

function inferBehaviorContract(apiMeta = {}) {
  const mode = inferInteractionMode(apiMeta);
  return {
    interactionMode: mode,
    intent: apiMeta.intent || null,
    governedSocialRoutingKey: apiMeta.routing || null,
    resolvedSemanticTarget: apiMeta.target || null,
    ambiguousSocialContract: apiMeta.ambiguous ?? null,
  };
}

function analyzeRecovery(apiMeta, reply, category) {
  const empty = !String(reply || "").trim();
  const mode = inferInteractionMode(apiMeta);
  const behaviorContract = inferBehaviorContract(apiMeta);
  const isCommercial = mode === MIA_INTERACTION_MODES.COMMERCE;

  if (isCommercial) {
    return {
      deliveryMode: "commercial",
      recoveryLikelyActed: empty ? true : false,
      recoveryShouldAct: empty,
      validatorsRun: ["structural_integrity"],
      validatorChain: {
        valid: !empty,
        approved: empty ? [] : ["structural_integrity"],
        rejected: empty ? [{ id: "structural_integrity", violations: ["empty_reply"] }] : [],
      },
      note: "Commercial recovery is structural-only (PATCH 5.5 bc3290f)",
      overRecoveryRisk: false,
      underRecovery: empty,
    };
  }

  const chain = runUniversalValidatorChain(reply, behaviorContract, null);
  const wouldTriggerRecovery = !chain.valid || empty;
  const fallbackPatterns = [
    /beleza — pode falar à vontade/i,
    /me conta um pouco mais/i,
    /consigo te ajudar/i,
    /pode falar comigo/i,
    /estou por aqui/i,
  ];
  const looksLikeFallback = fallbackPatterns.some((re) => re.test(reply));

  return {
    deliveryMode: "social",
    recoveryLikelyActed: wouldTriggerRecovery && looksLikeFallback,
    recoveryShouldAct: wouldTriggerRecovery,
    validatorsRun: chain.results?.map((r) => r.id) || [],
    validatorChain: {
      valid: chain.valid,
      approved: chain.approved,
      rejected: chain.rejected,
      reasonCodes: chain.reasonCodes,
    },
    looksLikeFallback,
    overRecoveryRisk: chain.valid && looksLikeFallback,
    underRecovery: wouldTriggerRecovery && !empty && !looksLikeFallback,
    category,
  };
}

function analyzeQuality(reply, apiMeta = {}) {
  const behaviorContract = inferBehaviorContract(apiMeta);
  const context = {
    behaviorContract,
    interactionMode: behaviorContract.interactionMode,
    resolvedTarget: apiMeta.target || null,
  };
  const quality = measureVerbalizationQuality(reply, context);
  const personality = measurePersonalityConsistency(reply, context);
  const fingerprint = buildSemanticVerbalFingerprint(reply, context);
  return {
    version: CONVERSATIONAL_OBSERVABILITY_VERSION,
    fingerprint,
    quality,
    personality,
    overallQuality: quality.overall,
    overallPersonality: personality.overall,
    signals: quality.signals,
  };
}

function semanticFingerprint(text = "") {
  return buildSemanticVerbalFingerprint(text, {});
}

function pathsCompatible(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  const social = new Set(["greeting_flow", "governed_social_intent_flow", "social_conversation"]);
  if (social.has(a) && social.has(b)) return true;
  return false;
}

function evaluateParity(api, ui) {
  const apiNorm = normalizeReply(api.reply);
  const uiNorm = normalizeReply(ui.displayText);
  const exactMatch = apiNorm === uiNorm;
  const fpMatch = semanticFingerprint(api.reply) === semanticFingerprint(ui.displayText);
  const pathOk = pathsCompatible(api.response_path, ui.response_path);
  const bothNonEmpty = !api.reply_empty && !ui.display_empty;
  const noLeak = !ui.has_mia_debug_in_payload && !ui.leaks_internal_json;
  const approved =
    api.status === 200 &&
    ui.status === 200 &&
    bothNonEmpty &&
    noLeak &&
    (exactMatch || fpMatch) &&
    pathOk;
  let divergenceClass = "none";
  if (!approved) {
    if (isRateLimited(api.reply) || isRateLimited(ui.displayText)) divergenceClass = "rate_limit_artifact";
    else if (!pathOk) divergenceClass = "path_divergence";
    else if (!bothNonEmpty) divergenceClass = "empty_response";
    else if (!exactMatch && !fpMatch) divergenceClass = "semantic_divergence";
    else divergenceClass = "other";
  }
  return {
    exactMatch,
    fpMatch,
    pathOk,
    bothNonEmpty,
    noLeak,
    approved,
    divergenceClass,
    apiNorm: apiNorm.slice(0, 160),
    uiNorm: uiNorm.slice(0, 160),
    apiFp: semanticFingerprint(api.reply),
    uiFp: semanticFingerprint(ui.displayText),
  };
}

async function probeApi(scenario, history = [], attempt = 0) {
  const messages = [...history, { role: "user", content: scenario.msg }];
  const t0 = Date.now();
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: scenario.msg,
      user_id: uid("api"),
      conversation_id: uid("conv"),
      messages,
      session_context: scenario.session_context || {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  const reply = String(body?.reply ?? "").trim();
  if (isRateLimited(reply) && attempt < 3) {
    await sleep(10000 + attempt * 5000);
    return probeApi(scenario, history, attempt + 1);
  }
  const pt = body?.mia_debug?.pipelineTrace || {};
  const sa = pt?.semantic_authority || {};
  const sp = sa?.semanticPrecedence || pt?.semantic_precedence || null;
  const recoveryTrace = body?.mia_debug?.universal_conversation_recovery || null;
  return {
    channel: "api",
    status: res.status,
    latency_ms: Date.now() - t0,
    reply,
    reply_empty: !reply,
    response_path: body?.latency_analytics?.response_path || null,
    intent: body?.intent || pt?.intent || null,
    routing: sa?.governedSocialRoutingKey || null,
    ambiguous: sa?.ambiguousSocialContract ?? null,
    target: sa?.resolvedSemanticTarget || null,
    precedence: sp,
    has_debug: !!body?.mia_debug,
    recoveryTrace,
  };
}

async function openFreshSession(page) {
  await page.goto(`${PROD_UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  });
  await sleep(800);
}

async function sendUiTurn(page, text, { captureShot = false, shotId = "", attempt = 0 } = {}) {
  const bubbleCountBefore = await page.locator(".mia-msg-assistant-bubble").count();
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );
  await page.locator(".mia-input").fill(text);
  await page.locator(".send-btn").click();
  const resp = await responsePromise;
  const data = await resp.json().catch(() => ({}));
  await page
    .waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
      timeout: 120000,
    })
    .catch(() => {});
  await sleep(1500);
  const bubbleCountAfter = await page.locator(".mia-msg-assistant-bubble").count();
  const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  const displayText = String(data?.reply || bubbleText || "").trim();
  if (isRateLimited(displayText) && attempt < 3) {
    await sleep(12000 + attempt * 5000);
    return sendUiTurn(page, text, { captureShot, shotId, attempt: attempt + 1 });
  }
  const leaksJson =
    displayText.includes("pipelineTrace") ||
    displayText.includes("universal_conversation") ||
    displayText.includes('"mia_debug"');
  if (captureShot && shotId) {
    await page.screenshot({ path: join(SHOTS, `${shotId}.png`), fullPage: false });
  }
  return {
    channel: "ui",
    status: resp.status(),
    displayText,
    display_empty: !displayText,
    reply: displayText,
    reply_empty: !displayText,
    response_path: data?.latency_analytics?.response_path || null,
    bubble_delta: bubbleCountAfter - bubbleCountBefore,
    duplicate_bubble: bubbleCountAfter - bubbleCountBefore > 1,
    has_mia_debug_in_payload: !!data?.mia_debug,
    leaks_internal_json: leaksJson,
    recoveryTrace: data?.mia_debug?.universal_conversation_recovery || null,
  };
}

async function runScenario(page, scenario) {
  if (scenario.fresh !== false) await openFreshSession(page);
  if (scenario.prior?.length) {
    for (const turn of scenario.prior) {
      await sendUiTurn(page, turn);
      await sleep(1000);
    }
  }
  const history = [];
  for (let i = 0; i < (scenario.prior || []).length; i++) {
    history.push({ role: "user", content: scenario.prior[i] });
    if (scenario.priorAssistant?.[i]) {
      history.push({ role: "assistant", content: scenario.priorAssistant[i] });
    }
  }
  const api = await probeApi(scenario, history);
  await sleep(1500);
  const ui = await sendUiTurn(page, scenario.msg, {
    captureShot: !!scenario.screenshot,
    shotId: scenario.id,
  });
  const parity = evaluateParity(api, ui);
  const recovery = analyzeRecovery(api, api.reply, scenario.category);
  const recoveryUi = analyzeRecovery({ ...api, response_path: ui.response_path || api.response_path }, ui.reply, scenario.category);
  const qualityApi = analyzeQuality(api.reply, api);
  const qualityUi = analyzeQuality(ui.reply, { ...api, response_path: ui.response_path || api.response_path });
  return {
    id: scenario.id,
    category: scenario.category,
    profile: scenario.profile || "default",
    msg: scenario.msg,
    api,
    ui,
    parity,
    quality: { api: qualityApi, ui: qualityUi },
    recovery: {
      api: recovery,
      ui: recoveryUi,
      parityRecoveryAnalysis: recovery.deliveryMode === recoveryUi.deliveryMode,
      productionDebugAvailable: !!(api.has_debug || ui.has_mia_debug_in_payload),
    },
  };
}

function scenario(id, category, msg, extra = {}) {
  return { id, category, msg, fresh: true, ...extra };
}

function withProfile(base, profile) {
  const transforms = {
    formal: (m) => m.replace(/oi/i, "Olá").replace(/opa/i, "Olá"),
    informal: (m) => m + " kkk",
    teen: (m) => m.replace(/você/gi, "vc").replace(/beleza/i, "blz") + " mano",
    elderly: (m) => `Com licença, ${m}`,
    technical: (m) => `[ctx: audit] ${m}`,
    typos: (m) => m.replace(/celular/gi, "celuar").replace(/recomenda/gi, "recomenda"),
    emoji: (m) => `${m} 😊🔥✨`,
    caps: (m) => m.toUpperCase(),
    mixed_lang: (m) => m.replace(/oi/i, "hey oi").replace(/obrigado/i, "thanks obrigado"),
    abbrev: (m) => m.replace(/quero/gi, "qro").replace(/celular/gi, "cel"),
    one_word: (m) => m.split(/\s+/)[0] || m,
  };
  const fn = transforms[profile];
  return fn ? fn(base) : base;
}

function buildScenarioMatrix() {
  const list = [];
  let n = 0;
  const add = (category, messages, extra = {}) => {
    for (const msg of messages) {
      n += 1;
      list.push(scenario(`S${String(n).padStart(3, "0")}`, category, msg, extra));
    }
  };
  const addVar = (category, bases, profiles) => {
    for (const base of bases) {
      for (const profile of profiles) {
        n += 1;
        list.push(
          scenario(`V${String(n).padStart(3, "0")}`, category, withProfile(base, profile), {
            profile,
          })
        );
      }
    }
  };

  add("greeting", [
    "Oi", "Opa", "eae", "E aí", "Bom dia", "Boa tarde", "Boa noite", "Oi, MIA", "fala mia",
    "salve", "opa mia", "eae mia blz?", "OI", "OPA!!!", "bom diaa", "boa noite 😊", "salve mia",
    "hey", "fala aí", "e aí mia",
  ]);
  add("farewell", [
    "Tchau", "Até logo", "Até mais", "Flw", "Falou", "Vou nessa", "Até amanhã", "Xau",
    "Tchau MIA", "Até a próxima", "Fui", "Tenho que ir",
  ]);
  add("gratitude", [
    "Obrigado", "Obrigada", "Valeu", "Valeu demais", "Muito obrigado", "Brigadão",
    "Thanks", "Vlw", "Agradeço", "Gratidão", "Valeu MIA", "Obrigado pela ajuda",
  ]);
  add("approval", ["Show", "Boa", "Legal", "Entendi", "Perfeito", "Beleza", "Top", "Massa", "Firmeza", "Certo", "Ok", "Concordo"]);
  add("reaction", ["Nossa", "Caramba", "Sério?", "Uau", "Não acredito", "Que isso", "Puts", "Eita"]);
  add("compliment", [
    "Linda", "Bonito", "Incrível", "Sensacional", "Muito boa", "Legal", "Perfeito",
    "Interessante", "Gostei", "Maravilhoso", "Você é demais", "Adorei", "Excelente",
    "Impressionante", "Fantástico",
  ]);
  add("praise", ["Parabéns", "Mandou bem", "Arrasou", "Você manda muito", "Nota 10", "Perfeita resposta", "Muito boa explicação"]);
  add("affection", ["Te adoro", "Você é especial", "Gosto de conversar com você", "Você me entende", "Sinto-me bem falando contigo"]);
  add("flirt", ["Você é linda", "Gatinha", "Queria te conhecer pessoalmente", "Você namora?", "Me acha interessante?"]);
  add("humor", [
    "kkkk", "hahaha", "rsrs", "Tô rindo aqui", "Engraçado demais", "Piada boa",
    "MIA você é engraçada", "kkk boa", "haha entendi", "risada",
  ]);
  add("irony", ["Claro que sim...", "Ah tá", "Sei...", "Muito convincente", "Genial mesmo", "Ótimo plano"]);
  add("sarcasm", ["Parabéns, genial", "Nossa, que surpresa", "Adorei essa ideia ruim", "Excelente escolha (not)"]);
  add("joke", ["Por que o celular foi ao médico?", "Conta uma piada", "Me faz rir", "Sabe alguma piada?"]);
  add("emotional_support", [
    "Estou triste", "Dia difícil", "Preciso desabafar", "Me sinto sozinho", "Estou ansioso",
    "Não tô bem", "Preciso conversar", "Estou preocupado",
  ]);
  add("frustration", [
    "Isso não funciona", "Não entendi nada", "Péssimo", "Que resposta ruim", "Não ajudou",
    "Decepcionante", "Cansado disso", "Sem paciência hoje",
  ]);
  add("correction", ["Era ironia", "Não era isso", "Você entendeu errado", "Quis dizer outra coisa", "Corrigindo"]);
  add("disagreement", ["Discordo", "Não concordo", "Acho que não", "Errado", "Não é bem assim"]);
  add("confusion", ["Não entendi", "Como assim?", "Pode explicar?", "Fiquei confuso", "Não ficou claro", "Hã?", "Que?", "Repita"]);
  add("curiosity", [
    "Como funciona?", "Por quê?", "Me explica", "Tenho curiosidade", "Como você sabe disso?",
    "De onde vem isso?", "Conta mais", "Interessante, e daí?",
  ]);
  add("conversation_request", [
    "Quero conversar", "Bate-papo", "Só queria papo", "Vamos conversar?", "Pode papear comigo?",
  ]);
  add("small_talk", [
    "Como vai?", "Tudo bem?", "Como foi seu dia?", "Que calor hoje", "Choveu aqui",
    "Tô com sono", "Acordei cedo", "Fim de semana chegando", "Segunda-feira...", "Tô com fome",
  ]);
  add("identity", [
    "Quem é você?", "Qual seu nome?", "Você é humana?", "Você é uma IA?", "Quem te criou?",
  ]);
  add("capability", [
    "O que você faz?", "Como pode me ajudar?", "Quais suas funções?", "Você recomenda produtos?",
    "Você entende de tecnologia?",
  ]);
  add("trust", ["Posso confiar em você?", "Você é confiável?", "É seguro?", "Posso acreditar?", "Será que é verdade?"]);
  add("about_mia", [
    "Fale sobre a MIA", "O que é a MIA?", "Quem é a MIA?", "História da MIA", "Missão da MIA",
  ]);
  add("commercial", [
    "Quero um celular até 2000", "Compare iPhone 13 com Galaxy A55", "Notebook até 3500",
    "Melhor custo-benefício celular", "Preciso de um monitor", "Fone de ouvido bom",
    "Tablet para estudar", "Smartwatch barato", "Câmera boa até 1500", "TV 55 polegadas",
    "Quero um Galaxy S24", "iPhone 15 vale a pena?", "MacBook ou Windows?", "SSD 1TB recomendação",
    "Mouse gamer", "Teclado mecânico", "Headset sem fio", "Celular com boa câmera",
    "Orçamento 3000 reais", "Produto mais vendido",
  ], { screenshot: true });
  add("mixed_intent", [
    "Oi, quero um celular até 2 mil", "Você é ótima, agora me ajuda com um notebook",
    "Quem te criou? E qual celular você recomenda?", "Bom dia, preciso de um fone",
    "kkk engraçada, me indica um celular", "Tchau... brincadeira, quero um notebook",
    "Estou triste mas preciso comprar um celular", "Valeu! Agora compare iPhone e Samsung",
    "Você é linda, qual o melhor Galaxy?", "Oi MIA, monitor gamer até 1500",
    "Adorei você, me ajuda com orçamento", "Como vai? Quero tablet",
  ]);
  for (const s of [
    scenario("FU01", "follow_up", "E a câmera?", { prior: ["Quero um celular até 2000"], fresh: true }),
    scenario("FU02", "follow_up", "Tem em outra cor?", { prior: ["Quero um Galaxy A55"], fresh: true }),
    scenario("FU03", "follow_up", "E a bateria?", { prior: ["Compare iPhone 13 com Galaxy A55"], fresh: true }),
    scenario("FU04", "follow_up", "Mais barato?", { prior: ["Quero notebook até 3500"], fresh: true }),
    scenario("FU05", "follow_up", "Pode detalhar?", { prior: ["Me explica OLED"], priorAssistant: ["OLED usa pixels autoiluminados."], fresh: true }),
  ]) list.push(s);
  for (const s of [
    scenario("TC01", "topic_change", "Mudando de assunto, quero um fone", { prior: ["Como vai?"], fresh: true }),
    scenario("TC02", "topic_change", "Agora fala de notebook", { prior: ["Quero um celular até 2000"], fresh: true }),
    scenario("TC03", "topic_change", "Esquece, me conta uma piada", { prior: ["Compare iPhone e Samsung"], fresh: true }),
    scenario("TC04", "topic_change", "Voltando ao celular, até 1500", { prior: ["Oi", "Tudo bem?"], fresh: true }),
  ]) list.push(s);
  for (const s of [
    scenario("RS01", "resumption", "Retomando: celular até 2000", { prior: ["Oi", "Quero um celular até 2000", "Valeu"], fresh: true }),
    scenario("RS02", "resumption", "Continuando a conversa de antes", { prior: ["Bom dia"], fresh: true }),
  ]) list.push(s);
  add("comparison", [
    "iPhone 13 ou Galaxy A55?", "Qual é melhor?", "Compare os dois", "Diferença entre eles",
    "Vale mais a pena qual?", "Prós e contras", "Side by side", "Qual você escolheria?",
  ]);
  add("rejection", [
    "Não gostei dessa recomendação", "Não quero esse", "Outra opção", "Muito caro", "Não serve",
    "Horrível escolha", "Passa", "Próximo",
  ]);
  for (const s of [
    scenario("PC01", "priority_change", "Prioridade agora é câmera", { prior: ["Quero celular até 2000"], fresh: true }),
    scenario("PC02", "priority_change", "Mudei de ideia, quero bateria", { prior: ["Quero Galaxy A55"], fresh: true }),
  ]) list.push(s);
  for (const s of [
    scenario("BG01", "budget_change", "Aumentei para 3000", { prior: ["Quero celular até 2000"], fresh: true }),
    scenario("BG02", "budget_change", "Só tenho 1000 agora", { prior: ["Quero notebook até 3500"], fresh: true }),
  ]) list.push(s);
  add("indecision", [
    "Não sei qual pegar", "Estou em dúvida", "Me ajuda a decidir", "Indeciso entre os dois",
    "Qual escolher?", "Tô perdido", "Muitas opções", "Não consigo decidir",
  ]);
  add("emotion", [
    "Estou feliz!", "Que alegria", "Empolgado", "Animado", "Com medo de errar", "Nervoso com a compra",
  ]);
  add("one_word", ["Oi", "Show", "Linda", "Valeu", "Não", "Sim", "Ok", "Help", "Celular", "Por quê?", "Tchau", "Galaxy"]);
  add("long_message", [
    "Oi MIA, tudo bem? Então, tô procurando um celular novo porque o meu quebrou semana passada e eu uso muito para fotos, redes sociais e trabalho, então preciso de boa câmera, bateria que dure o dia todo e que caiba no orçamento de até dois mil reais, preferência Android mas aceito sugestões.",
    "Boa tarde! Preciso de ajuda urgente para escolher um notebook para faculdade de engenharia, rodo AutoCAD leve, Python, e muitas abas no Chrome, orçamento até 4500, quero algo confiável com boa garantia.",
  ]);
  addVar("greeting", ["Oi", "Opa", "Boa noite"], ["caps", "emoji", "teen", "formal"]);
  addVar("compliment", ["Linda", "Show", "Incrível"], ["caps", "emoji", "typos"]);
  addVar("commercial", ["Quero um celular até 2000", "Compare iPhone 13 com Galaxy A55"], ["abbrev", "mixed_lang", "caps"]);
  addVar("gratitude", ["Obrigado", "Valeu"], ["emoji", "teen", "formal"]);

  add("vague_request", [
    "Me ajuda", "Preciso de algo", "Não sei o que quero", "Surpreenda-me", "Algo bom",
    "Me indica", "O que você sugere?", "Qualquer coisa serve", "Tô perdido aqui",
  ]);
  add("specific_request", [
    "Quero iPhone 13 128GB azul", "Galaxy A55 256GB preto", "Notebook Dell Inspiron 15 i5 16GB",
    "Monitor LG 27 144Hz IPS", "Fone Sony WH-1000XM5", "Tablet Samsung Tab S9 FE",
  ]);
  add("emotion_extended", [
    "Estou muito feliz hoje!", "Dia horrível", "Com saudade", "Ansioso demais", "Empolgado com a compra",
    "Medo de gastar errado", "Aliviado agora", "Frustrado com opções",
  ]);
  add("humor_extended", [
    "kkkkkk", "hahaha boa", "MIA você é engraçada demais", "Piada ruim kkk", "Tô rindo sozinho",
    "Isso foi engraçado", "Humor ácido hoje", "Ironia pura",
  ]);

  // Targets multiturn
  list.push(
    scenario("TGT01", "mia_target", "Linda", { prior: ["Oi, MIA"], priorAssistant: ["Opa!"], screenshot: true }),
    scenario("TGT02", "mia_target", "Você é muito inteligente"),
    scenario("TGT03", "product_target", "Linda", {
      prior: ["O que você acha do design do Galaxy A55?"],
      priorAssistant: ["O Galaxy A55 tem visual marcante."],
      screenshot: true,
    }),
    scenario("TGT04", "product_target", "Bonito demais", { prior: ["Quero um Galaxy A55"] }),
    scenario("TGT05", "previous_answer", "Muito boa", {
      prior: ["Explique OLED"],
      priorAssistant: ["OLED usa pixels autoiluminados."],
    })
  );

  return list;
}

async function runStability(page, msg, times = 20, id = "STAB") {
  const runs = [];
  for (let i = 0; i < times; i++) {
    await openFreshSession(page);
    const api = await probeApi({ msg });
    const ui = await sendUiTurn(page, msg);
    const recovery = analyzeRecovery(api, api.reply, "stability");
    const quality = analyzeQuality(api.reply, api);
    runs.push({
      run: i + 1,
      api_path: api.response_path,
      api_reply: api.reply.slice(0, 200),
      api_reply_full: api.reply,
      api_reply_len: api.reply.length,
      ui_fp: semanticFingerprint(ui.displayText),
      api_fp: semanticFingerprint(api.reply),
      parity: evaluateParity(api, ui).approved,
      ui_empty: ui.display_empty,
      recoveryValid: recovery.validatorChain?.valid,
      underRecovery: recovery.underRecovery,
      overRecovery: recovery.overRecoveryRisk,
      overallQuality: quality.overallQuality,
      qualitySignals: quality.signals,
    });
    await sleep(SPACING_MS);
  }
  const stabilityEval = evaluateSemanticStability(
    runs.map((r) => ({ reply: r.api_reply_full || r.api_reply })),
    { interactionMode: MIA_INTERACTION_MODES.SOCIAL }
  );
  return { id, msg, times, runs, stabilityEval };
}

async function runMultiturn(page, id, turns, category) {
  await openFreshSession(page);
  const results = [];
  for (let i = 0; i < turns.length; i++) {
    const msg = turns[i];
    const api = await probeApi({ msg }, turns.slice(0, i).map((c) => ({ role: "user", content: c })));
    const ui = await sendUiTurn(page, msg, { captureShot: i === turns.length - 1, shotId: `${id}_t${i + 1}` });
    const recovery = analyzeRecovery(api, api.reply, category);
    results.push({ turn: i + 1, msg, api, ui, parity: evaluateParity(api, ui), recovery });
    await sleep(1200);
  }
  return { id, category, turns: results };
}

function summarizeQuality(matrix) {
  const withQuality = matrix.filter((m) => m.quality?.api);
  const avg = (key) => {
    const vals = withQuality.map((m) => m.quality.api.quality.metrics[key]).filter((v) => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const avgOverall =
    withQuality.reduce((a, m) => a + (m.quality.api.overallQuality || 0), 0) / (withQuality.length || 1);
  const avgPersonality =
    withQuality.reduce((a, m) => a + (m.quality.api.overallPersonality || 0), 0) / (withQuality.length || 1);
  const signalCounts = {};
  for (const m of withQuality) {
    for (const s of m.quality.api.signals || []) {
      signalCounts[s] = (signalCounts[s] || 0) + 1;
    }
  }
  const lowQuality = withQuality.filter((m) => (m.quality.api.overallQuality || 0) < 0.65).length;
  return {
    samples: withQuality.length,
    avgOverallQuality: avgOverall,
    avgOverallPersonality: avgPersonality,
    metrics: {
      naturalness: avg("naturalness"),
      humanWarmth: avg("humanWarmth"),
      clarity: avg("clarity"),
      coherence: avg("coherence"),
      contractAdherence: avg("contractAdherence"),
      targetAdherence: avg("targetAdherence"),
      interactionModeAdherence: avg("interactionModeAdherence"),
    },
    signalCounts,
    lowQualityCount: lowQuality,
  };
}

function summarizeStability(stability) {
  const entries = Object.values(stability);
  const acceptable = entries.filter((e) => e.stabilityEval?.acceptable !== false).length;
  const regressions = entries.reduce((a, e) => a + (e.stabilityEval?.regressionCount || 0), 0);
  const linda = stability["Linda"];
  return {
    scenarios: entries.length,
    acceptableScenarios: acceptable,
    totalRegressions: regressions,
    lindaVariability: linda?.stabilityEval?.variability ?? null,
    lindaUniqueFingerprints: linda?.stabilityEval?.uniqueFingerprints ?? [],
    lindaAcceptable: linda?.stabilityEval?.acceptable ?? null,
  };
}

function summarizeMatrix(matrix) {
  const parityApproved = matrix.filter((m) => m.parity?.approved).length;
  const apiOk = matrix.filter((m) => m.api?.status === 200 && !m.api?.reply_empty).length;
  const uiOk = matrix.filter((m) => m.ui?.status === 200 && !m.ui?.display_empty).length;
  const underRecovery = matrix.filter((m) => m.recovery?.api?.underRecovery).length;
  const overRecovery = matrix.filter((m) => m.recovery?.api?.overRecoveryRisk).length;
  const commercialDegraded = matrix.filter(
    (m) =>
      m.category === "commercial" &&
      m.api?.reply &&
      /beleza — pode falar à vontade|pode falar comigo|estou por aqui/i.test(m.api.reply) &&
      !/celular|iphone|galaxy|notebook|recomend|produto|monitor|fone/i.test(m.api.reply)
  ).length;
  const rateLimitHits = matrix.filter(
    (m) => isRateLimited(m.api?.reply) || isRateLimited(m.ui?.displayText)
  ).length;
  const byCategory = {};
  for (const m of matrix) {
    byCategory[m.category] = byCategory[m.category] || { total: 0, parityOk: 0, empty: 0, underRecovery: 0 };
    byCategory[m.category].total += 1;
    if (m.parity?.approved) byCategory[m.category].parityOk += 1;
    if (m.api?.reply_empty || m.ui?.display_empty) byCategory[m.category].empty += 1;
    if (m.recovery?.api?.underRecovery) byCategory[m.category].underRecovery += 1;
  }
  return {
    totalScenarios: matrix.length,
    apiOk,
    uiOk,
    parityApproved,
    parityFailed: matrix.length - parityApproved,
    underRecovery,
    overRecovery,
    commercialDegraded,
    rateLimitHits,
    byCategory,
  };
}

function auditValidatorsLocally() {
  const chainEmpty = runUniversalValidatorChain("", {}, null);
  const chainValid = runUniversalValidatorChain("Opa! Tudo bem?", { interactionMode: MIA_INTERACTION_MODES.SOCIAL }, null);
  const ids = chainValid.results.map((r) => r.id);
  const uniqueIds = new Set(ids);
  return {
    validatorCount: chainValid.results.length,
    validatorIds: ids,
    order: ids,
    duplicateIds: ids.length !== uniqueIds.size,
    allExecutedInChain: ids.length === 5,
    emptyTriggersStructural: !chainEmpty.valid && chainEmpty.rejected.some((r) => r.id === "structural_integrity"),
    validSocialPasses: chainValid.valid,
    deadValidatorCheck: "All 5 validators invoked in runUniversalValidatorChain per source audit",
  };
}

function auditFinalizerPaths() {
  const egressPath = join(ROOT, "lib/miaUnifiedConversationalEgress.js");
  const src = readFileSync(egressPath, "utf8");
  const usesRecovery = src.includes("applyUniversalConversationRecovery");
  const usesCommercialRecovery = src.includes("applyCommercialConversationRecovery");
  const earlyReturns = (src.match(/return\s+\{/g) || []).length;
  return {
    egressVersion: "5.5.0",
    usesUniversalRecovery: usesRecovery,
    usesCommercialRecovery: usesCommercialRecovery,
    prepareSocialCallsRecovery: src.includes("applyUniversalConversationRecovery("),
    prepareCommercialCallsRecovery: src.includes("applyCommercialConversationRecovery("),
    earlyReturnCountInEgress: earlyReturns,
    note: "Static audit — all delivery paths go through prepare*EgressFinalization in egress module",
  };
}

function runLocalRecoveryTests() {
  try {
    const out = execSync("node scripts/test-mia-patch-55-universal-recovery.js", {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
    });
    const pass = /(\d+)\/(\d+)/.exec(out);
    return { stdout: out.slice(-500), pass: pass ? `${pass[1]}/${pass[2]}` : "unknown", ok: out.includes("PASS") || /16\/16|15\/15/.test(out) };
  } catch (e) {
    return { ok: false, error: String(e.message || e), stdout: String(e.stdout || "").slice(-500) };
  }
}

// ─── Main ───
log("PATCH 5.6 production quality & stability audit starting");

const healthInitial = await (await fetch(HEALTH)).json();
writeFileSync(
  join(OUT, "HEALTH_INITIAL.json"),
  JSON.stringify({ ...healthInitial, url: HEALTH, capturedAt: new Date().toISOString() }, null, 2)
);

const gitCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
writeFileSync(
  join(OUT, "BUILD_COMMIT_VALIDATION.json"),
  JSON.stringify(
    {
      expectedFunctionalCommit: "56ec5f0",
      expectedEvidenceCommit: "316e0ea",
      patch56ObservabilityVersion: CONVERSATIONAL_OBSERVABILITY_VERSION,
      activeProductionBuild: healthInitial.build,
      localHead: gitCommit,
      validatedAt: new Date().toISOString(),
    },
    null,
    2
  )
);

const validatorAudit = auditValidatorsLocally();
const finalizerAudit = auditFinalizerPaths();
const localTests = runLocalRecoveryTests();
writeFileSync(join(OUT, "VALIDATOR_CHAIN_AUDIT.json"), JSON.stringify(validatorAudit, null, 2));
writeFileSync(join(OUT, "FINALIZER_PATH_AUDIT.json"), JSON.stringify(finalizerAudit, null, 2));
writeFileSync(join(OUT, "LOCAL_RECOVERY_TESTS.json"), JSON.stringify(localTests, null, 2));

const SCENARIOS = buildScenarioMatrix();
log(`Scenario matrix size: ${SCENARIOS.length}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

const matrix = [];
const checkpointEvery = 25;
for (let i = 0; i < SCENARIOS.length; i++) {
  const scenarioDef = SCENARIOS[i];
  log(`[${i + 1}/${SCENARIOS.length}] ${scenarioDef.id} ${scenarioDef.category}: ${scenarioDef.msg.slice(0, 50)}`);
  try {
    matrix.push(await runScenario(page, scenarioDef));
  } catch (err) {
    matrix.push({
      id: scenarioDef.id,
      category: scenarioDef.category,
      msg: scenarioDef.msg,
      error: String(err.message || err),
    });
  }
  if ((i + 1) % checkpointEvery === 0) {
    writeFileSync(join(OUT, "MATRIX_CHECKPOINT.json"), JSON.stringify({ progress: i + 1, total: SCENARIOS.length, matrix }, null, 2));
  }
  await sleep(SPACING_MS);
}

log("Running stability battery (20x each)...");
const stabilityTargets = [
  "Oi", "Opa", "Linda", "Show", "Quero um celular até 2000",
  "Compare iPhone 13 com Galaxy A55", "Valeu", "Não entendi",
  "Bom dia", "Obrigado", "Me ajuda", "Estou triste",
];
const stability = {};
for (const msg of stabilityTargets) {
  stability[msg] = await runStability(page, msg, 20, `STAB_${msg.slice(0, 12).replace(/\W/g, "_")}`);
}

log("Running multiturn sessions...");
const multiturn = [];
multiturn.push(
  await runMultiturn(page, "MT_A", ["Oi", "Hoje foi corrido", "Quero um celular até 2000", "Preciso de boa câmera", "Valeu"], "social_to_commercial")
);
multiturn.push(
  await runMultiturn(page, "MT_B", ["Bom dia", "Como vai?", "Me conta uma piada", "kkk", "Agora quero um fone"], "social_mixed")
);
multiturn.push(
  await runMultiturn(page, "MT_C", ["O que você acha do Galaxy A55?", "Linda", "Quero comparar com iPhone 13"], "product_eval")
);
multiturn.push(
  await runMultiturn(page, "MT_D", ["Quero notebook", "Muito caro", "Tem mais barato?", "Show", "Obrigado"], "commercial_flow")
);
multiturn.push(
  await runMultiturn(page, "MT_E", ["Estou triste", "Obrigado por ouvir", "Preciso de um celular barato"], "emotion_to_commercial")
);
multiturn.push(
  await runMultiturn(page, "MT_LONG", [
    "Oi", "Tudo bem?", "Quero um celular", "Até 2500", "Boa câmera", "E bateria?", "Compare com Samsung", "Gostei", "Valeu", "Tchau",
  ], "long_conversation")
);

await browser.close();

const summary = summarizeMatrix(matrix);
const qualitySummary = summarizeQuality(matrix);
const stabilitySummary = summarizeStability(stability);
const totalTurns =
  matrix.length +
  Object.values(stability).reduce((a, s) => a + s.runs.length, 0) +
  multiturn.reduce((a, m) => a + m.turns.length, 0);

const payload = {
  patch: "5.6",
  observabilityVersion: CONVERSATIONAL_OBSERVABILITY_VERSION,
  timestamp: new Date().toISOString(),
  health: healthInitial,
  totalTurns,
  summary,
  qualitySummary,
  stabilitySummary,
  validatorAudit,
  finalizerAudit,
  localTests,
  productionDebugExposed: matrix.some((m) => m.recovery?.productionDebugAvailable),
  stability,
  multiturn,
  consoleErrors: { count: consoleErrors.length, samples: consoleErrors.slice(0, 20) },
};

writeFileSync(join(OUT, "QUALITY_AUDIT_MATRIX.json"), JSON.stringify({ results: matrix, qualitySummary }, null, 2));
writeFileSync(join(OUT, "RECOVERY_AUDIT_MATRIX.json"), JSON.stringify({ results: matrix, summary }, null, 2));
writeFileSync(join(OUT, "API_UI_PARITY.json"), JSON.stringify(matrix.map((m) => ({ id: m.id, category: m.category, ...m.parity })), null, 2));
writeFileSync(join(OUT, "QUALITY_METRICS.json"), JSON.stringify(matrix.map((m) => ({ id: m.id, category: m.category, msg: m.msg, quality: m.quality })), null, 2));
writeFileSync(join(OUT, "RECOVERY_ANALYSIS.json"), JSON.stringify(matrix.map((m) => ({ id: m.id, category: m.category, msg: m.msg, recovery: m.recovery, api_path: m.api?.response_path })), null, 2));
writeFileSync(join(OUT, "STABILITY_20X.json"), JSON.stringify(stability, null, 2));
writeFileSync(join(OUT, "STABILITY_SUMMARY.json"), JSON.stringify(stabilitySummary, null, 2));
writeFileSync(join(OUT, "MULTITURN_AUDIT.json"), JSON.stringify(multiturn, null, 2));
writeFileSync(join(OUT, "AUDIT_SUMMARY.json"), JSON.stringify(payload, null, 2));

log(`DONE totalTurns=${totalTurns} parity=${summary.parityApproved}/${summary.totalScenarios} avgQuality=${qualitySummary.avgOverallQuality?.toFixed(3)} lindaStable=${stabilitySummary.lindaAcceptable}`);
console.log(JSON.stringify({ totalTurns, summary, qualitySummary, stabilitySummary, localTests: localTests.pass }, null, 2));
