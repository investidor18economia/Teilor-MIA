#!/usr/bin/env node
/**
 * PATCH 4.1 — Production validation (executive dashboard SQL).
 * Executes Query 1 + Query 2 via `supabase db query --linked` and validates coherence.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH41_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-41-query1-snapshot.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-41-query2-daily.sql");

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

loadEnv();

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function runLinkedSql(filePath) {
  const out = execSync(`npx supabase db query --linked -f "${filePath}" -o json`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const parsed = JSON.parse(out);
  return parsed.rows || [];
}

console.log("\nPATCH 4.1 — executive dashboard production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

{
  const res = await fetch(`${BASE}/app-mia`, { redirect: "follow" });
  ok("production MIA app reachable", res.ok, `status=${res.status}`);
}

let snapshot = null;
let daily = [];

try {
  ok("supabase CLI linked project available", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const rows1 = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed on production", rows1.length >= 1, `rows=${rows1.length}`);
  snapshot = rows1[0] || null;

  if (snapshot?.dia_referencia) {
    console.log("\nQuery 1 — snapshot (production SQL):");
    console.log(JSON.stringify(snapshot, null, 2));

    const dau = Number(snapshot.dau_visitors);
    const newV = Number(snapshot.new_visitors);
    const ret = Number(snapshot.returning_visitors);

    ok("dia_referencia present", Boolean(snapshot.dia_referencia));
    ok("new + returning = dau_visitors", newV + ret === dau, `${newV}+${ret}=${dau}`);
    ok("dau_users <= dau_visitors", Number(snapshot.dau_users) <= dau);
    ok("anonymous_visitors <= dau_visitors", Number(snapshot.anonymous_visitors) <= dau);
    ok("wau_visitors >= dau_visitors", Number(snapshot.wau_visitors) >= dau);
    ok("mau_visitors >= wau_visitors", Number(snapshot.mau_visitors) >= Number(snapshot.wau_visitors));
    ok("wau_users >= dau_users", Number(snapshot.wau_users) >= Number(snapshot.dau_users));
    ok("mau_users >= wau_users", Number(snapshot.mau_users) >= Number(snapshot.wau_users));
    ok(
      "taxa_autenticacao in [0,1]",
      snapshot.taxa_autenticacao == null ||
        (Number(snapshot.taxa_autenticacao) >= 0 && Number(snapshot.taxa_autenticacao) <= 1)
    );
  }

  daily = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed on production", daily.length >= 1, `days=${daily.length}`);

  let dailyOk = true;
  for (const row of daily) {
    const sum = Number(row.new_visitors) + Number(row.returning_visitors);
    if (sum !== Number(row.dau_visitors)) {
      dailyOk = false;
      ok(`daily coherence ${row.dia}`, false, `${row.new_visitors}+${row.returning_visitors}!=${row.dau_visitors}`);
    }
  }
  if (dailyOk) {
    ok("daily evolution coherence (all days)", true, `${daily.length} day(s)`);
  }

  if (snapshot?.dia_referencia && daily.length > 0) {
    const refRow = daily.find((r) => String(r.dia) === String(snapshot.dia_referencia));
    ok(
      "Query 1 matches Query 2 on reference day",
      refRow != null && Number(refRow.dau_visitors) === Number(snapshot.dau_visitors),
      refRow
        ? `dau_visitors q1=${snapshot.dau_visitors} q2=${refRow.dau_visitors}`
        : "reference day row missing in Query 2"
    );
  }
} catch (err) {
  ok("production SQL execution", false, err.message);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  try {
    const res = await fetch(`${url}/rest/v1/analytics_events?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
    });
    ok("service_role read analytics_events", res.ok, `status=${res.status}`);
  } catch (err) {
    ok("service_role read analytics_events", false, err.message);
  }
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
