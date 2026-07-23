#!/usr/bin/env node
/** PATCH 10.6 — validates all Phase 10 SQL (90 patch + 30 cross-audit) */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_DIR = join(ROOT, "docs/analytics/sql");
const BASE = process.env.PATCH106_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = readdirSync(SQL_DIR)
  .filter((f) => /^patch-10[1-6]-query\d+/.test(f) && f.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function runSql(file, attempt = 1) {
  try {
    const out = execSync(`npx supabase db query --linked -f "${join(SQL_DIR, file)}" -o json`, {
      cwd: ROOT,
      encoding: "utf8",
    });
    return JSON.parse(out).rows || [];
  } catch (err) {
    const msg = String(err.message || err);
    if (attempt < 4 && /502|Bad gateway|origin_bad_gateway/.test(msg)) {
      console.log(`  retry ${attempt}/3 for ${file} after 502...`);
      execSync("powershell -Command Start-Sleep -Seconds 15", { stdio: "ignore" });
      return runSql(file, attempt + 1);
    }
    throw err;
  }
}

console.log("\nPATCH 10.6 — Phase 10 SQL validation (120 queries)\n");
ok("query file count 120", QUERIES.length === 120, `count=${QUERIES.length}`);

{
  const res = await fetch(`${BASE}/api/health`);
  const health = await res.json().catch(() => ({}));
  ok("health", res.ok, `build=${health.build}`);
}

try {
  ok("supabase linked", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));
  for (const file of QUERIES) {
    const rows = runSql(file);
    ok(`SQL ${file}`, Array.isArray(rows), `rows=${rows.length}`);
  }
} catch (err) {
  ok("SQL validation", false, String(err.message).slice(0, 240));
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\nSummary: ${passed}/${checks.length} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
