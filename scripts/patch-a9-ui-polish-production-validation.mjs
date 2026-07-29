#!/usr/bin/env node
/**
 * PATCH A.9 — Production bundle validation (UI polish).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A9_PROD_BASE_URL || "https://economia-ai.vercel.app";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH A.9 — UI polish production validation\n");

let health = {};
{
  const res = await fetch(`${BASE}/api/health`);
  health = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${health.build}`);
}

{
  const gateRes = await fetch(`${BASE}/cockpit-fundador`);
  const html = await gateRes.text();
  ok("cockpit gate 200", gateRes.status === 200);
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
  const chunk = chunks.find((u) => u.includes("cockpit-fundador"));
  if (chunk) {
    const text = await (await fetch(`${BASE}${chunk}`)).text();
    ok("bundle FounderSkeleton", text.includes("founder-skeleton") || text.includes("FounderSkeleton"));
    ok("bundle design tokens", text.includes("--fc-accent") || text.includes("founder-module-shell"));
  } else {
    ok("bundle scan", false, "chunk missing");
  }
}

const evidence = {
  patch: "A.9",
  status: checks.every((c) => c.pass) ? "APPROVED" : "PENDING",
  validated_at: new Date().toISOString(),
  production: { base_url: BASE, build: health.build ?? null },
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, items: checks },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_9_UI_POLISH_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
