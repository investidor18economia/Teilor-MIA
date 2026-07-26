#!/usr/bin/env node
/**
 * Home Intro State — browser validation (intro layout, transition, viewports).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE_URL = process.env.MIA_HOME_INTRO_BROWSER_URL || "http://localhost:3000/app-mia";
const EVIDENCE_DIR = join(ROOT, "docs/evidence/home-intro/browser");

const DESKTOP_VIEWPORTS = [
  { id: "desktop-1366", width: 1366, height: 768 },
  { id: "desktop-1440", width: 1440, height: 900 },
  { id: "desktop-1920", width: 1920, height: 1080 },
];

const MOBILE_VIEWPORTS = [
  { id: "mobile-360", width: 360, height: 740 },
  { id: "mobile-390", width: 390, height: 844 },
  { id: "mobile-412", width: 412, height: 915 },
];

const checks = [];
let failed = 0;

function record(id, pass, detail = "") {
  checks.push({ id, pass, detail });
  if (!pass) failed += 1;
  console.log(`${pass ? "✓" : "✗"} ${id}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIntro(page) {
  await page.waitForSelector(".mia-chat-root--intro, .mia-opening-utterance", {
    timeout: 45000,
  });
  await sleep(600);
}

async function readOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    };
  });
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await waitForIntro(page);

    const introActive = await page.evaluate(() => ({
      bodyIntro: document.body.classList.contains("mia-app-intro"),
      rootIntro: document.querySelector(".mia-chat-root")?.classList.contains("mia-chat-root--intro"),
      suggestions: document.querySelectorAll(".suggestion-btn--secondary").length,
      inputVisible: Boolean(document.querySelector(".mia-input")),
    }));

    record(
      `${viewport.id}-intro-visible`,
      introActive.bodyIntro && introActive.rootIntro,
      `suggestions=${introActive.suggestions}`
    );
    record(`${viewport.id}-input-visible`, introActive.inputVisible);
    record(
      `${viewport.id}-suggestions-present`,
      introActive.suggestions >= 1,
      String(introActive.suggestions)
    );

    const overflowIntro = await readOverflow(page);
    record(
      `${viewport.id}-no-overflow-intro`,
      !overflowIntro.horizontalOverflow,
      `${overflowIntro.scrollWidth}/${overflowIntro.clientWidth}`
    );

    await page.locator(".mia-menu-btn").click();
    await sleep(400);
    const introAfterDrawer = await page.evaluate(() =>
      document.body.classList.contains("mia-app-intro")
    );
    record(`${viewport.id}-intro-after-drawer-open`, introAfterDrawer);
    await page.locator(".mia-drawer-overlay").click({ force: true });
    await sleep(400);
    const introAfterDrawerClose = await page.evaluate(() =>
      document.body.classList.contains("mia-app-intro")
    );
    record(`${viewport.id}-intro-after-drawer-close`, introAfterDrawerClose);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({
      path: join(EVIDENCE_DIR, `${viewport.id}-intro.png`),
      fullPage: false,
    });

    await page.locator(".mia-input").scrollIntoViewIfNeeded();
    await page.locator(".mia-input").fill("Quero um fone custo-benefício.");

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/mia-chat") && response.request().method() === "POST",
      { timeout: 120000 }
    );

    if (viewport.width < 500) {
      await page.locator(".mia-input").press("Enter");
    } else {
      const sendButton = page.getByRole("button", { name: /Perguntar para a MIA/i });
      await sendButton.scrollIntoViewIfNeeded();
      await sendButton.click({ force: true });
    }

    let chatResponse;
    try {
      chatResponse = await responsePromise;
    } catch (error) {
      record(`${viewport.id}-first-message`, false, String(error?.message || error).slice(0, 120));
      return;
    }
    await sleep(1200);

    const postFirst = await page.evaluate(() => ({
      bodyIntro: document.body.classList.contains("mia-app-intro"),
      bodyConversation: document.body.classList.contains("mia-app-conversation"),
      rootConversation: document.querySelector(".mia-chat-root")?.classList.contains(
        "mia-chat-root--conversation"
      ),
    }));

    record(
      `${viewport.id}-intro-off-after-first-message`,
      !postFirst.bodyIntro,
      `status=${chatResponse.status()}`
    );
    record(
      `${viewport.id}-conversation-on-after-first-message`,
      postFirst.bodyConversation || postFirst.rootConversation,
      `chat=${chatResponse.status()}`
    );
    record(
      `${viewport.id}-chat-api-ok`,
      chatResponse.status() === 200 || chatResponse.status() === 429,
      `status=${chatResponse.status()}`
    );

    const overflowConversation = await readOverflow(page);
    record(
      `${viewport.id}-no-overflow-conversation`,
      !overflowConversation.horizontalOverflow,
      `${overflowConversation.scrollWidth}/${overflowConversation.clientWidth}`
    );

    await page.screenshot({
      path: join(EVIDENCE_DIR, `${viewport.id}-conversation.png`),
      fullPage: false,
    });
  } catch (error) {
    record(`${viewport.id}-session`, false, String(error?.message || error).slice(0, 120));
  } finally {
    await context.close();
  }
}

console.log(`\nHome Intro browser validation: ${BASE_URL}\n`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });

for (const viewport of [...DESKTOP_VIEWPORTS, ...MOBILE_VIEWPORTS]) {
  console.log(`\n— ${viewport.id} (${viewport.width}x${viewport.height}) —`);
  await runViewport(browser, viewport);
  await sleep(4000);
}

await browser.close();

const passed = checks.filter((check) => check.pass).length;
console.log(`\nResultado: ${passed}/${checks.length} checks`);
if (failed > 0) process.exit(1);
