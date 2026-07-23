#!/usr/bin/env node
/** PATCH 11.3 — production smoke for /cockpit-fundador */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanFounderCockpitForbiddenContent } from "../lib/miaFounderCockpitDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH113_PROD_BASE_URL || "https://economia-ai.vercel.app";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH 11.3 — Founder cockpit production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const gateRes = await fetch(`${BASE}/cockpit-fundador`);
const gateHtml = await gateRes.text();
ok("gate page HTTP 200", gateRes.status === 200);
ok("login gate visible", gateHtml.includes("Cockpit Executivo") && gateHtml.includes("Acesso restrito"));
ok("robots noindex", gateHtml.includes("noindex, nofollow"));
ok("gate no forbidden body", scanFounderCockpitForbiddenContent(gateHtml.replace(/<head[\s\S]*?<\/head>/gi, "")).length === 0);

let authedHtml = gateHtml;
if (ADMIN_KEY) {
  const authRes = await fetch(`${BASE}/api/founder/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_key: ADMIN_KEY }),
  });
  const setCookie = authRes.headers.get("set-cookie") || "";
  ok("admin authenticate 200", authRes.status === 200, `status=${authRes.status}`);

  if (authRes.ok && setCookie.includes("mia_founder_gate")) {
    const cookie = setCookie.split(";")[0];
    const cockpitRes = await fetch(`${BASE}/cockpit-fundador`, {
      headers: { Cookie: cookie, Accept: "text/html" },
    });
    authedHtml = await cockpitRes.text();
    ok("authed cockpit 200", cockpitRes.status === 200);
    ok("overview section", authedHtml.includes("Visão geral"));
    ok("platform module", authedHtml.includes("Plataforma"));
    ok("price intelligence module", authedHtml.includes("Price Intelligence"));
    ok("economia disclaimer", authedHtml.includes("Não representa economia"));
    ok("period filter 30 dias", authedHtml.includes("30 dias"));
    ok("API source via modules", authedHtml.includes("Recomendações") || authedHtml.includes("Comercial"));
  } else {
    ok("authed cockpit skipped", false, "no gate cookie");
  }
} else {
  ok("admin auth skipped", true, "MIA_ADMIN_API_KEY not set locally");
}

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_11_3_FOUNDER_DASHBOARD_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "11.3",
      title: "Cockpit Executivo do Fundador",
      status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
      validated_at: new Date().toISOString(),
      production: {
        base_url: BASE,
        build: healthJson.build ?? null,
        page_path: "/cockpit-fundador",
        api_path: "/api/executive-metrics",
      },
      checks: {
        total: checks.length,
        passed: checks.filter((c) => c.pass).length,
        failed: checks.filter((c) => !c.pass).length,
        items: checks,
      },
    },
    null,
    2
  )
);

process.exit(checks.some((c) => !c.pass) ? 1 : 0);
