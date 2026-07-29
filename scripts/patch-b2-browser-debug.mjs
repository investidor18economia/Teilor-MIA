#!/usr/bin/env node
/**
 * PATCH B.2 — Browser failure diagnostic (read-only debug).
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_B2_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_B2_BROWSER_BASE_URL ||
  (process.env.PATCH_B2_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3018");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();

function loadEnvLocalAdminKey() {
  try {
    const envPath = join(ROOT, ".env.local");
    const text = readFileSync(envPath, "utf8");
    const line = text.split(/\r?\n/).find((l) => l.startsWith("MIA_ADMIN_API_KEY="));
    return line ? line.slice("MIA_ADMIN_API_KEY=".length).trim() : "";
  } catch {
    return "";
  }
}

if (!ADMIN_KEY) {
  console.error("MIA_ADMIN_API_KEY required");
  process.exit(1);
}

console.log(`\nB.2 browser debug — ${BASE}\n`);

// Production API probe
{
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
  console.log("health.build:", health.build);
  const em = await fetch(`${BASE}/api/executive-metrics?range=30d&fresh=1`);
  const emJson = await em.json().catch(() => ({}));
  console.log("executive-metrics status:", em.status);
  console.log("executive-metrics keys:", Object.keys(emJson).slice(0, 20).join(", "));
  console.log("platform present:", Boolean(emJson.platform));
  console.log("error field:", emJson.error ?? emJson.message ?? "none");
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

const authRes = await page.request.post(`${BASE}/api/founder/authenticate`, {
  data: { admin_key: ADMIN_KEY },
});
console.log("\nauth:", authRes.status(), authRes.ok());

const cookies = await context.cookies();
console.log(
  "cookies after auth:",
  cookies.map((c) => `${c.name}@${c.domain}`).join(", ") || "(none)"
);

await page.goto(`${BASE}/cockpit-fundador?range=30d`, { waitUntil: "load", timeout: 60000 });
console.log("url:", page.url());
console.log("title:", await page.title());

const snapshot = await page.evaluate(() => ({
  h1: document.querySelector("h1")?.textContent?.trim() ?? null,
  gate: Boolean(document.querySelector(".founder-cockpit-page--gate")),
  cockpitPage: Boolean(document.querySelector(".founder-cockpit-page")),
  executiveKpis: Boolean(document.querySelector(".founder-executive-kpis")),
  kpiStrip: Boolean(document.querySelector(".founder-kpi-strip")),
  skeleton: Boolean(document.querySelector(".founder-skeleton")),
  loginGate: Boolean(document.querySelector(".founder-login-gate")),
  bodyClasses: document.body.className,
  mainHtmlSnippet: document.querySelector("main")?.innerHTML?.slice(0, 600) ?? null,
}));

console.log("\nDOM snapshot:", JSON.stringify(snapshot, null, 2));
console.log("\nconsole errors:", consoleErrors.slice(0, 10));

// Check bundle for B.2 marker on prod
const html = await page.content();
const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
const cockpitChunk = chunks.find((u) => u.includes("cockpit-fundador"));
if (cockpitChunk) {
  const chunkText = await (await fetch(`${BASE}${cockpitChunk}`)).text();
  console.log("\nbundle has founder-executive-kpis:", chunkText.includes("founder-executive-kpis"));
  console.log("bundle has FounderExecutiveKpisSection:", chunkText.includes("KPIs Estratégicos") || chunkText.includes("KPIs Estrat"));
}

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_2_BROWSER_DEBUG.json"),
  JSON.stringify({ base: BASE, snapshot, consoleErrors, cookies: cookies.map((c) => c.name) }, null, 2)
);

await browser.close();
console.log("\nDebug written to docs/analytics/PATCH_B_2_BROWSER_DEBUG.json\n");
