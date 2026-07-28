#!/usr/bin/env node
/**
 * PATCH A.4 / A.4.1 — Browser validation for Sessions & Users section.
 * Usage:
 *   PATCH_A4_BROWSER_BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/patch-a4-browser-validation.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A4_BROWSER_BASE_URL || "http://localhost:3000";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";
const EVIDENCE_PATH = join(ROOT, "docs/analytics/PATCH_A_4_BROWSER_UI_EVIDENCE.json");
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-a4-browser");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH A.4 — browser UI validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false, "MIA_ADMIN_API_KEY required");
  process.exit(1);
}

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const networkFailures = [];
const apiResponses = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/api/temporal-metrics") || url.includes("/api/executive-metrics")) {
    apiResponses.push({ url, status: res.status() });
  }
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (url.includes("/api/temporal-metrics") || url.includes("/api/executive-metrics")) {
    networkFailures.push(`${url} — ${req.failure()?.errorText || "failed"}`);
  }
});

let screenshotPath = null;

try {
  const authRes = await page.request.post(`${BASE}/api/founder/authenticate`, {
    data: { admin_key: ADMIN_KEY },
  });
  ok("authenticate 200", authRes.status() === 200, `status=${authRes.status()}`);

  await page.goto(`${BASE}/cockpit-fundador`, { waitUntil: "networkidle" });
  ok("cockpit loaded", page.url().includes("/cockpit-fundador"));

  await page.waitForSelector("#mod-sessoes-usuarios", { timeout: 25000 });
  ok("sessions section visible", await page.isVisible("#mod-sessoes-usuarios"));

  await page.waitForFunction(
    () => {
      const el = document.querySelector("#mod-sessoes-usuarios");
      return el && !el.innerText.includes("Carregando métricas temporais");
    },
    { timeout: 25000 }
  );
  ok("temporal loading finished", true);

  const text = await page.locator("#mod-sessoes-usuarios").innerText();
  ok("section title", text.includes("Sessões e Usuários"));
  ok("DAU label", text.includes("DAU visitantes"));
  ok("WAU label", text.includes("WAU visitantes"));
  ok("MAU label", text.includes("MAU visitantes"));
  ok("new visitors", text.includes("Novos visitantes"));
  ok("returning visitors", text.includes("Visitantes recorrentes"));
  ok("anonymous visitors", text.includes("Visitantes anônimos"));
  ok("authenticated users", text.includes("Usuários autenticados"));
  ok("auth rate", text.includes("Taxa de autenticação"));
  ok("sessions activity", text.includes("Sessões (último dia)"));
  ok("conversations", text.includes("Conversas (último dia)"));
  ok("questions", text.includes("Perguntas (último dia)"));
  ok("recommendations", text.includes("Recomendações exibidas (último dia)"));
  ok("trends block", text.includes("Tendências observadas"));
  ok(
    "recent table or empty",
    text.includes("Atividade diária recente") || text.includes("Sem atividade registrada")
  );
  ok("snapshot reference", text.includes("Referência snapshot"));

  const hasNumericData = /\d/.test(text);
  ok("real numeric data visible", hasNumericData && !text.includes("Carregando"));

  screenshotPath = join(SCREENSHOT_DIR, `sessions-users-${Date.now()}.png`);
  await page.locator("#mod-sessoes-usuarios").screenshot({ path: screenshotPath });
  ok(
    "screenshot captured",
    true,
    screenshotPath.replace(ROOT + "\\", "").replace(ROOT + "/", "")
  );

  const temporalApiOk = apiResponses.some(
    (r) => r.url.includes("/api/temporal-metrics") && r.status === 200
  );
  ok("temporal API 200 in browser", temporalApiOk);

  const a4ConsoleErrors = consoleErrors.filter(
    (msg) => /temporal-metrics|sessoes-usuarios|executive-metrics/i.test(msg)
  );
  ok(
    "no A.4 console errors",
    a4ConsoleErrors.length === 0,
    a4ConsoleErrors.slice(0, 3).join("; ") ||
      (consoleErrors.length ? `ignored ${consoleErrors.length} non-A.4 console errors` : "")
  );
  ok("no A.4 api network failures", networkFailures.length === 0, networkFailures.slice(0, 2).join("; "));

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.context().addCookies(await page.context().cookies());
  await mobile.goto(`${BASE}/cockpit-fundador`, { waitUntil: "networkidle" });
  await mobile.waitForSelector("#mod-sessoes-usuarios", { timeout: 25000 });
  ok("mobile viewport renders section", await mobile.isVisible("#mod-sessoes-usuarios"));
  await mobile.close();
} catch (err) {
  ok("browser flow", false, String(err.message).slice(0, 200));
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "A.4.1",
  title: "Founder Sessions & Users — Browser UI Validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  base_url: BASE,
  environment:
    BASE.includes("economia-ai.vercel.app") || BASE.includes("vercel.app")
      ? "production"
      : "local_production_build",
  screenshot: screenshotPath
    ? screenshotPath.replace(ROOT + "\\", "docs/analytics/").replace(ROOT + "/", "docs/analytics/")
    : null,
  console_errors: consoleErrors.slice(0, 20),
  console_errors_ignored_non_a4: consoleErrors.filter(
    (msg) => !/temporal-metrics|sessoes-usuarios|executive-metrics/i.test(msg)
  ).slice(0, 10),
  api_responses: apiResponses,
  network_failures: networkFailures.slice(0, 10),
  checks: { total: checks.length, passed, failed: checks.length - passed, items: checks },
};

writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));

console.log(`\nSummary: ${passed}/${checks.length} passed`);
console.log(`Evidence: docs/analytics/PATCH_A_4_BROWSER_UI_EVIDENCE.json\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
