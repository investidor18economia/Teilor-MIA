#!/usr/bin/env node
/**
 * PATCH 5.2 — Conversation strategic analytics SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-conversation-strategic.sql");
const STRATEGIC_DOC = join(ANALYTICS_DIR, "CONVERSATION_STRATEGIC_ANALYTICS.md");
const EXEC_DOC = join(ANALYTICS_DIR, "EXECUTIVE_METRICS.md");

const REQUIRED_ALIASES = [
  "media_perguntas_por_conversa",
  "mediana_perguntas_por_conversa",
  "pct_conversas_profundas",
  "pct_conversas_com_recomendacao",
  "pct_conversas_com_intencao_compra",
  "pct_perguntas_com_imagem",
  "media_intervalo_segundos_entre_perguntas",
  "faixa_profundidade",
  "pct_conversas_na_faixa",
  "media_conversas_por_entidade",
  "pct_entidades_multiplas_conversas",
  "tipo_analise",
  "delta_media_perguntas_dia_anterior",
  "delta_pct_conversas_profundas",
  "dia_referencia",
];

const FORBIDDEN_DUPLICATE_41 = [
  /\bas\s+conversas_unicas\b/i,
  /\bas\s+perguntas_recebidas\b/i,
  "entidades_pergunta",
  "taxa_conversao_sessao_pergunta",
];

const FORBIDDEN = [
  /\bas\s+dau\b/i,
  /\bas\s+wau\b/i,
  /\bas\s+mau\b/i,
  /create\s+table/i,
  /materialized\s+view/i,
];

const PRODUCTION_MARKERS = [
  "price_alert_email_test",
  "price_alert_e2e_test",
  "price_drop_email_test_%",
  "price_drop_email_e2e_%",
  "test-agent",
];

const SPLIT_FILES = [
  "patch-52-query1-depth-snapshot.sql",
  "patch-52-query2-depth-distribution.sql",
  "patch-52-query3-recurrence-segments.sql",
  "patch-52-query4-daily-engagement-trends.sql",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

console.log("\nPATCH 5.2 — Conversation strategic analytics audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const strategicDoc = readFileSync(STRATEGIC_DOC, "utf8");

console.log("Documentation — delta vs Fase 4");
assert("CONVERSATION_STRATEGIC_ANALYTICS.md references CONVERSATION_ID", strategicDoc.includes("CONVERSATION_ID.md"));
assert("CONVERSATION_STRATEGIC_ANALYTICS.md references EXECUTIVE_METRICS", strategicDoc.includes("EXECUTIVE_METRICS.md"));
assert("Delta section — o que NÃO será reimplementado", /NÃO será reimplementado/i.test(strategicDoc));
assert("Delta section — o que passa a existir na Fase 5", /passa a existir apenas na Fase 5/i.test(strategicDoc));
assert("Strategic doc — profundidade", /media_perguntas_por_conversa/i.test(strategicDoc));
assert("Strategic doc — imagem vs texto", /pct_perguntas_com_imagem/i.test(strategicDoc));
assert("Strategic doc — no conversas_unicas duplication claim", /não substituído|NÃO será reimplementado/i.test(strategicDoc));

console.log("\nSQL structure");
assert("SQL references CONVERSATION_ID", sql.includes("CONVERSATION_ID.md"));
assert("SQL references PATCH 4.1 non-duplication", /PATCH 4\.1/i.test(sql));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — conversation_id filter", /conversation_id is not null/i.test(sql));
assert("SQL — has_image metadata", /has_image/i.test(sql));
assert("SQL — Query 1 depth snapshot", /QUERY 1/i.test(sql));
assert("SQL — Query 2 distribution", /QUERY 2/i.test(sql));
assert("SQL — Query 3 recurrence", /QUERY 3/i.test(sql));
assert("SQL — Query 4 daily trends", /QUERY 4/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const pattern of FORBIDDEN_DUPLICATE_41) {
  const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  const label = typeof pattern === "string" ? pattern : pattern.toString();
  assert(`SQL — no Fase 4 duplicate ${label}`, !re.test(sql));
}

for (const marker of PRODUCTION_MARKERS) {
  assert(`SQL — production filter ${marker}`, sql.includes(marker));
}

console.log("\nSplit SQL files");
for (const file of SPLIT_FILES) {
  const splitSql = readFileSync(join(ANALYTICS_DIR, "sql", file), "utf8");
  assert(`${file} — from analytics_events`, /from\s+analytics_events/i.test(splitSql));
  assert(`${file} — production filter`, splitSql.includes("price_alert_email_test"));
}

{
  const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md lists conversation strategic analytics", dashboards.includes("analytics-conversation-strategic.sql"));
}

{
  assert("EXECUTIVE_METRICS conversas_unicas still canonical", readFileSync(EXEC_DOC, "utf8").includes("conversas_unicas"));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
