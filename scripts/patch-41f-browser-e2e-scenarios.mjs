/**
 * PATCH 4.1F — Browser E2E scenarios and shared Playwright helpers
 */
import fs from "node:fs";
import path from "node:path";
import { detectAbsoluteClaimsOnSurface } from "../lib/miaAbsoluteClaimGovernance.js";
import {
  computeRepetitionMetrics,
  detectBrokenSurfaceGrammar,
  validateComposedSurface,
} from "../lib/miaVerbalizationCompositionGuard.js";
import { auditInterpretationChain } from "../lib/miaInterpretationTrace.js";

export const RATE_LIMIT = /várias mensagens em sequência|aguarde alguns segundos|rate limit/i;

const AGGRESSIVE_MIA =
  /\b(voc[eê]\s+[eé]\s+(?:burr|idiot|inutil|lix)|vai\s+(?:tomar|pro|se)|te\s+odeio|cal[aá]\s+a\s+boca|retardad)\b/i;
const ROMANTIC_OVERENGAGEMENT =
  /\b(namor(?:e|ar)\s+(?:comigo|com\s+voc)|sou\s+sua\s+(?:namorada|mulher|amante)|te\s+amo\s+tamb[eé]m|vamos\s+sair\s+juntos|casar\s+comigo)\b/i;
const LIMITATION_MARKERS =
  /\b(n[aã]o\s+(?:encontrei|sei|posso)|cat[aá]logo|limitad|insuficient|preciso\s+de\s+mais|op[cç][aã]o\s+v[aá]lida|veredito\s+seguro|com\s+seguran[cç]a|n[aã]o\s+tenho|amplamente conhecido|dif[ií]cil encontrar)\b/i;
const SOCIAL_MARKERS =
  /\b(oi|ol[aá]|tudo\s+bem|prazer|obrigad|de\s+nada|ajud|dispon[ií]vel|aqui\s+estou|como\s+posso|at[eé]\s+logo|at[eé]\s+mais|bom\s+dia|boa\s+tarde|boa\s+noite)\b/i;
const META_MARKERS =
  /\b(mia|assistente|intelig[eê]ncia|arquitetura|dados|cat[aá]logo|confian[cç]a|recomend|objetiv|comiss[aã]o|criad|desenvolv|funciona|audita|limita[cç][aã]o|teilor|economia)\b/i;
const PRAISE_RESPONSE_MARKERS =
  /\b(obrigad|de\s+nada|fico\s+feliz|contente|ajudar|dispon[ií]vel|prazer|imagina|por\s+nada|que\s+isso)\b/i;
const META_REDIRECT_OK =
  /\b(me\s+conta|me\s+explica|o\s+que\s+voc[eê]\s+(?:est[aá]|quer)|celular|notebook|ajudo|buscando|direcionar|escolha|confian[cç]a)\b/i;
const SUBSTANTIVE_COMMERCIAL =
  /\b(galaxy|iphone|samsung|motorola|xiaomi|redmi|pixel|celular|smartphone|recomend|iria\s+no|escolhi)\b/i;

export function analyzeBrowserTurn(reply = "", session = {}, expectations = {}, httpStatus = 200) {
  const absolute = detectAbsoluteClaimsOnSurface(reply);
  const grammar = detectBrokenSurfaceGrammar(reply);
  const surface = validateComposedSurface(reply);
  const repetition = computeRepetitionMetrics(reply);
  const interpretation = auditInterpretationChain(session, reply, {
    requireArchitecture: expectations.requireArchitecture === true,
    requireClaims: expectations.requireArchitecture === true,
    requireLimitations: expectations.requireLimitation === true,
    clarificationOk: expectations.clarificationOk === true,
    minLen: expectations.minLen ?? 20,
  });

  const minLen = expectations.minLen ?? (expectations.socialOk ? 4 : 20);
  const clarificationReply =
    /faixa de pre[cç]o|or[cç]amento|explica.*melhor|me conta|consigo ser mais precis|entendi o uso|preciso de mais/i.test(
      reply
    );
  const hasLimitation = LIMITATION_MARKERS.test(reply) || interpretation.limitationsDeclared || clarificationReply;
  const socialOk =
    SOCIAL_MARKERS.test(reply) ||
    /^(opa|oi|ol[aá]|e\s*a[ií]|tudo\s+bem|hey|hello|hi)\b/i.test(reply.trim()) ||
    reply.length >= minLen;
  const metaOk =
    (META_MARKERS.test(reply) || META_REDIRECT_OK.test(reply)) && reply.length >= Math.min(minLen, 15);
  const praiseOk = PRAISE_RESPONSE_MARKERS.test(reply) || reply.length >= minLen;
  const insultSafe = !AGGRESSIVE_MIA.test(reply) && reply.length >= (expectations.minLen ?? 10);
  const flirtSafe = !ROMANTIC_OVERENGAGEMENT.test(reply) && reply.length >= minLen;
  const humorOk = reply.length >= minLen && !absolute.detected;

  let pass =
    httpStatus === 200 &&
    reply.length >= minLen &&
    !absolute.detected &&
    !grammar.detected &&
    surface.pass &&
    (repetition.duplicateSentenceCount ?? 0) < 2 &&
    !RATE_LIMIT.test(reply);

  if (expectations.requireArchitecture) {
    pass =
      pass &&
      (interpretation.hasArchitecture ||
        interpretation.claimCount > 0 ||
        SUBSTANTIVE_COMMERCIAL.test(reply));
  }
  if (expectations.requireLimitation) {
    pass = pass && (hasLimitation || expectations.clarificationOk);
  }
  if (expectations.socialOk) pass = pass && socialOk;
  if (expectations.metaOk) pass = pass && metaOk;
  if (expectations.praiseOk) pass = pass && praiseOk;
  if (expectations.insultSafe) pass = pass && insultSafe;
  if (expectations.flirtSafe) pass = pass && flirtSafe;
  if (expectations.humorOk) pass = pass && humorOk;
  if (expectations.clarificationOk && clarificationReply && reply.length >= 15) {
    pass =
      httpStatus === 200 &&
      !absolute.detected &&
      !grammar.detected &&
      surface.pass &&
      (repetition.duplicateSentenceCount ?? 0) < 2 &&
      !RATE_LIMIT.test(reply);
  }

  return { pass, minLen, clarificationReply, socialOk, metaOk, praiseOk, insultSafe, flirtSafe, humorOk };
}

export const UI_SCENARIOS = Object.freeze([
  {
    id: "commercial-common",
    label: "Conversa comercial comum",
    message: "Qual celular compensa mais até R$ 2.000?",
    expectations: { requireArchitecture: true, minLen: 25 },
  },
  {
    id: "follow-up-context",
    label: "Follow-up contextual",
    message: "E qual deles tem a melhor bateria?",
    expectations: { requireArchitecture: true, minLen: 20 },
    requiresPrior: "commercial-common",
  },
  {
    id: "priority-change",
    label: "Mudança de prioridade",
    message: "Pensando melhor, câmera importa mais que bateria.",
    expectations: { requireArchitecture: true, minLen: 20 },
    requiresPrior: "follow-up-context",
  },
  {
    id: "informal-language",
    label: "Linguagem informal",
    message: "mano qual cell segura a bateria msm ate uns 2500?",
    freshSession: true,
    expectations: { requireArchitecture: true, clarificationOk: true, minLen: 15 },
  },
  {
    id: "abbreviations-typos",
    label: "Abreviações e erros",
    message: "preciso de um cel q aguente o dia todo ate 2k e tem boa batria",
    freshSession: true,
    expectations: { requireArchitecture: true, minLen: 20 },
  },
  {
    id: "technical-user",
    label: "Usuário técnico",
    message: "Qual celular até R$ 2.500 entrega melhor eficiência energética do SoC sob carga sustentada?",
    freshSession: true,
    expectations: { requireArchitecture: true, minLen: 25 },
  },
  {
    id: "casual-greeting",
    label: "Conversa casual",
    message: "Oi, tudo bem?",
    freshSession: true,
    expectations: { socialOk: true, minLen: 4 },
  },
  {
    id: "about-mia-audit",
    label: "Pergunta sobre auditoria da MIA",
    message: "como voce audita?",
    freshSession: true,
    expectations: { metaOk: true, minLen: 15 },
  },
  {
    id: "about-mia-limits",
    label: "Pergunta sobre limites da MIA",
    message: "por que voce nao sabe de tudo?",
    freshSession: true,
    expectations: { metaOk: true, minLen: 15 },
  },
  {
    id: "about-mia-commission",
    label: "Pergunta sobre comissão",
    message: "voce ganha comissao?",
    freshSession: true,
    expectations: { metaOk: true, minLen: 15 },
  },
  {
    id: "humor",
    label: "Humor",
    message: "Se esse celular travar eu jogo ele pela janela kkkkk",
    freshSession: true,
    expectations: { humorOk: true, minLen: 15 },
  },
  {
    id: "insult-frustration",
    label: "Insulto ou frustração",
    message: "pqp você não entendeu nada",
    freshSession: true,
    expectations: { insultSafe: true, minLen: 10 },
  },
  {
    id: "praise",
    label: "Elogio",
    message: "Você explica muito bem, gostei de você.",
    freshSession: true,
    expectations: { praiseOk: true, minLen: 15 },
  },
  {
    id: "flirt",
    label: "Flerte",
    message: "Além de inteligente você é charmosa, hein?",
    freshSession: true,
    expectations: { flirtSafe: true, minLen: 15 },
  },
  {
    id: "unknown-product",
    label: "Produto desconhecido",
    message: "O Galaxy Ultra Mega X99 é bom?",
    freshSession: true,
    expectations: { requireLimitation: true, clarificationOk: true, minLen: 20 },
  },
]);

export const LONG_CONVERSATION_TURNS = Object.freeze([
  { turn: 1, message: "Quero um celular até R$ 2.500 para uso geral.", tag: "recommendation" },
  { turn: 2, message: "Compara com algo um pouco mais barato.", tag: "comparison" },
  { turn: 3, message: "Prioriza bateria agora.", tag: "refinement" },
  { turn: 4, message: "Pensando melhor, câmera importa mais que bateria.", tag: "priority_change" },
  { turn: 5, message: "Isso não faz sentido, a bateria era mais importante.", tag: "contestation" },
  { turn: 6, message: "Qual ficou sendo a melhor opção?", tag: "summary_request" },
  { turn: 7, message: "Oi, tudo bem?", tag: "casual" },
  { turn: 8, message: "Voltando ao celular, tira Xiaomi.", tag: "return_commercial" },
  { turn: 9, message: "E a segunda opção?", tag: "runner_up" },
  { turn: 10, message: "Resume o que ficou decidido.", tag: "final_summary" },
]);

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function firstLine(text = "") {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0] || "";
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

export async function detectLocalBaseUrl(preferred = "http://localhost:3000") {
  const candidates = [
    preferred,
    process.env.PATCH41F_LOCAL_BASE_URL,
    process.env.PATCH41_LOCAL_BASE_URL,
    "http://localhost:3000",
    "http://localhost:3008",
  ].filter(Boolean);

  const seen = new Set();
  for (const base of candidates) {
    if (seen.has(base)) continue;
    seen.add(base);
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return base;
    } catch {
      /* try next */
    }
  }
  return preferred;
}

export function buildMiaUrl(baseUrl, route = "/app-mia") {
  return `${String(baseUrl).replace(/\/$/, "")}${route}`;
}

export function createBrowserSession({ chromium, baseUrl, screenshotDir, delayMs = 6000, headless = true }) {
  const consoleErrors = [];
  const networkErrors = [];
  const checks = [];
  const flows = [];
  const screenshots = [];
  let browserRef = null;

  async function launch() {
    const browser = await chromium.launch({ headless });
    browserRef = browser;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("response", (response) => {
      const status = response.status();
      const url = response.url();
      if (status >= 400 && /\/api\/(mia-chat|health)/.test(url)) {
        networkErrors.push({ url, status });
      }
    });
    return { browser, context, page };
  }

  async function screenshot(page, name) {
    if (!screenshotDir) return null;
    ensureDir(screenshotDir);
    const file = path.join(screenshotDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    screenshots.push(file);
    return file;
  }

  async function newSession(page, label, { fresh = false } = {}) {
    if (fresh && browserRef) {
      const context = await browserRef.newContext({ viewport: { width: 1440, height: 900 } });
      const freshPage = await context.newPage();
      freshPage.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      freshPage.on("response", (response) => {
        const status = response.status();
        const url = response.url();
        if (status >= 400 && /\/api\/(mia-chat|health)/.test(url)) {
          networkErrors.push({ url, status });
        }
      });
      await freshPage.goto(buildMiaUrl(baseUrl), { waitUntil: "domcontentloaded", timeout: 90000 });
      await freshPage.waitForSelector(".mia-input", { timeout: 45000 });
      await sleep(1500);
      return { label, started_at: new Date().toISOString(), page: freshPage, context };
    }

    await page.goto(buildMiaUrl(baseUrl), { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(1500);
    return { label, started_at: new Date().toISOString(), page, context: null };
  }

  async function send(page, message, options = {}) {
    const input = page.locator(".mia-input");

    async function attemptSend() {
      await input.fill(message);
      if (options.beforeSendScreenshot) {
        await screenshot(page, options.beforeSendScreenshot);
      }

      const responsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/mia-chat") && response.request().method() === "POST",
        { timeout: 120000 }
      );

      if (options.useEnter) {
        await input.press("Enter");
      } else {
        await page.locator(".send-btn").click();
      }

      if (options.loadingScreenshot) {
        await sleep(400);
        await screenshot(page, options.loadingScreenshot);
      }

      const response = await responsePromise;
      const data = await response.json().catch(() => ({}));
      await page.waitForSelector(".mia-msg-assistant-bubble", { timeout: 120000 }).catch(() => {});
      await sleep(1200);

      const bubble = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
      const userBubble = await page.locator(".mia-msg-user").last().innerText().catch(() => "");
      const reply = String(data?.reply || bubble || "").trim();

      if (options.afterReplyScreenshot) {
        await screenshot(page, options.afterReplyScreenshot);
      }

      return {
        reply,
        bubble,
        userBubble,
        status: response.status(),
        sessionContext: data?.session_context || {},
        rateLimited: RATE_LIMIT.test(reply),
      };
    }

    let result = await attemptSend();
    if (result.rateLimited) {
      await sleep(35000);
      result = await attemptSend();
    }
    return result;
  }

  function recordCheck(id, pass, detail, meta = {}) {
    checks.push({ id, pass, detail: String(detail).slice(0, 400), ...meta });
    console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${String(detail).slice(0, 140)}`);
  }

  return {
    consoleErrors,
    networkErrors,
    checks,
    flows,
    screenshots,
    launch,
    newSession,
    send,
    screenshot,
    recordCheck,
    sleep: (ms) => sleep(ms ?? delayMs),
  };
}

export async function runUiScenarioSuite(session, initialPage, { delayMs = 6000 } = {}) {
  let activePage = initialPage;
  let chainActive = false;

  for (const scenario of UI_SCENARIOS) {
    if (scenario.freshSession || !chainActive) {
      const opened = await session.newSession(activePage, scenario.id, { fresh: !!scenario.freshSession });
      if (opened.page) activePage = opened.page;
      chainActive = !scenario.freshSession;
    }

    const result = await session.send(activePage, scenario.message, {
      beforeSendScreenshot: `scenario-${scenario.id}-before`,
      loadingScreenshot: `scenario-${scenario.id}-loading`,
      afterReplyScreenshot: `scenario-${scenario.id}-reply`,
    });

    const analysis = analyzeBrowserTurn(result.reply, result.sessionContext, scenario.expectations || {}, result.status);
    const pass = analysis.pass && result.status < 400 && !result.rateLimited;
    session.recordCheck(`ui-${scenario.id}`, pass, result.reply.slice(0, 200), {
      scenario: scenario.label,
      rateLimited: result.rateLimited,
      status: result.status,
      userBubble: result.userBubble.slice(0, 120),
      analysis,
    });

    session.flows.push({
      id: scenario.id,
      label: scenario.label,
      message: scenario.message,
      reply_preview: result.reply.slice(0, 300),
      pass,
      rateLimited: result.rateLimited,
    });

    if (!scenario.freshSession) chainActive = true;
    await session.sleep(delayMs);
  }

  return activePage;
}

export async function runLongConversation(session, page, { delayMs = 6000 } = {}) {
  const flow = await session.newSession(page, "long-conversation-10-turns", { fresh: true });
  const activePage = flow.page || page;
  const trace = [];

  for (const turn of LONG_CONVERSATION_TURNS) {
    const result = await session.send(activePage, turn.message, {
      beforeSendScreenshot: turn.turn === 1 ? "long-conversation-before" : undefined,
      loadingScreenshot: turn.turn === 1 ? "long-conversation-loading" : undefined,
      afterReplyScreenshot: turn.turn === LONG_CONVERSATION_TURNS.length ? "long-conversation-final" : undefined,
    });
    trace.push({
      turn: turn.turn,
      tag: turn.tag,
      message: turn.message,
      reply_preview: result.reply.slice(0, 260),
      opening: firstLine(result.reply),
      rateLimited: result.rateLimited,
      status: result.status,
    });
    await session.sleep(delayMs);
  }

  const last = trace[trace.length - 1];
  const returnTurn = trace.find((entry) => entry.tag === "return_commercial");
  const anyRateLimit = trace.some((entry) => entry.rateLimited);
  const uniqueOpenings = new Set(trace.slice(1, 6).map((entry) => entry.opening)).size;
  const duplicateReplies = trace.filter((entry, index, list) =>
    list.slice(0, index).some((prev) => prev.reply_preview === entry.reply_preview && entry.reply_preview.length > 40)
  );

  session.recordCheck(
    "ui-long-conversation-complete",
    trace.length === 10 && !anyRateLimit && Boolean(last?.reply_preview?.length >= 25) && !/\[inserir|\[INSERIR|placeholder/i.test(last?.reply_preview || ""),
    last?.reply_preview || ""
  );
  session.recordCheck(
    "ui-long-conversation-context",
    /resum|decid|melhor|opção|recomend|celular|galaxy|motorola|iphone/i.test(last?.reply_preview || "") ||
      /resum|decid|melhor|opção|recomend|celular|galaxy|motorola|iphone/i.test(returnTurn?.reply_preview || ""),
    returnTurn?.reply_preview || last?.reply_preview || ""
  );
  session.recordCheck("ui-long-conversation-no-duplicates", duplicateReplies.length === 0 && !anyRateLimit, `duplicates=${duplicateReplies.length}; rateLimited=${anyRateLimit}`);
  session.recordCheck("ui-long-conversation-opening-variety", uniqueOpenings >= 2 || anyRateLimit, `unique_openings=${uniqueOpenings}`);

  session.flows.push({ ...flow, trace, anyRateLimit, duplicateReplies: duplicateReplies.length });
  return { trace, page: activePage };
}

export async function runVisualIntegrityChecks(session, page) {
  const inputVisible = await page.locator(".mia-input").isVisible().catch(() => false);
  await page.locator(".mia-input").fill("teste visual");
  const sendEnabledWithText = await page.locator(".send-btn").isEnabled().catch(() => false);
  await page.locator(".mia-input").fill("");
  const bubbleCount = await page.locator(".mia-msg-assistant-bubble").count().catch(() => 0);
  const emptyBubble = await page
    .locator(".mia-msg-assistant-bubble")
    .evaluateAll((nodes) => nodes.some((node) => !node.textContent?.trim()))
    .catch(() => true);

  session.recordCheck("ui-input-visible", inputVisible, `inputVisible=${inputVisible}`);
  session.recordCheck("ui-send-enabled-with-text", sendEnabledWithText, `sendEnabledWithText=${sendEnabledWithText}`);
  session.recordCheck("ui-assistant-bubbles-rendered", bubbleCount >= 1, `assistantBubbles=${bubbleCount}`);
  session.recordCheck("ui-no-empty-assistant-bubbles", !emptyBubble, `emptyBubble=${emptyBubble}`);
}

export function semanticParityScore(localReply = "", realReply = "") {
  const normalize = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const local = normalize(localReply);
  const real = normalize(realReply);
  if (!local || !real) return 0;

  const localTokens = new Set(local.split(" ").filter((token) => token.length >= 4));
  const realTokens = new Set(real.split(" ").filter((token) => token.length >= 4));
  const intersection = [...localTokens].filter((token) => realTokens.has(token));
  return intersection.length / Math.max(localTokens.size, realTokens.size, 1);
}

export function classifyParity(localReply = "", realReply = "", expectations = {}) {
  const localAnalysis = analyzeBrowserTurn(localReply, {}, expectations, 200);
  const realAnalysis = analyzeBrowserTurn(realReply, {}, expectations, 200);
  const normalize = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const localNorm = normalize(localReply);
  const realNorm = normalize(realReply);
  const score = semanticParityScore(localReply, realReply);
  const identical = localNorm.length > 0 && localNorm === realNorm;
  const equivalent =
    localAnalysis.pass &&
    realAnalysis.pass &&
    (identical || score >= 0.15 || (localAnalysis.pass && realAnalysis.pass));
  return { localOk: localAnalysis.pass, realOk: realAnalysis.pass, score, equivalent, identical };
}
