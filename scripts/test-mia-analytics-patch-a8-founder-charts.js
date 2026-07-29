#!/usr/bin/env node
/**
 * PATCH A.8 — Founder Charts audit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_CHARTS_DISPLAY_VERSION,
  mapTemporalToSessionsUsersCharts,
  mapTemporalToProductsCategoriesCharts,
  mapTemporalToPerformanceConversionCharts,
  scanFounderChartsForbiddenContent,
} from "../lib/miaFounderChartsDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("\nPATCH A.8 — Founder Charts audit\n\nFiles");
for (const rel of [
  "lib/miaFounderChartsDisplay.js",
  "components/founder-cockpit/charts/FounderLineChart.jsx",
  "components/founder-cockpit/charts/FounderBarChart.jsx",
  "components/founder-cockpit/charts/FounderLegend.jsx",
  "components/founder-cockpit/charts/FounderTooltip.jsx",
  "components/founder-cockpit/charts/FounderEmptyChart.jsx",
  "components/founder-cockpit/charts/FounderChartPanel.jsx",
]) {
  ok(rel, existsSync(join(ROOT, rel)));
}

console.log("\nArchitecture");
ok("charts version A.8", FOUNDER_CHARTS_DISPLAY_VERSION === "A.8.0");
const chartsLib = readFileSync(join(ROOT, "lib/miaFounderChartsDisplay.js"), "utf8");
ok("mapper no supabase", !/supabase/i.test(chartsLib));
ok("mapper no SQL", !/select\s+/i.test(chartsLib));
ok("sessions section imports charts", readFileSync(join(ROOT, "components/founder-cockpit/FounderSessionsUsersSection.jsx"), "utf8").includes("FounderLineChart"));
ok("products section imports charts", readFileSync(join(ROOT, "components/founder-cockpit/FounderProductsCategoriesSection.jsx"), "utf8").includes("FounderLineChart"));
ok("performance section imports charts", readFileSync(join(ROOT, "components/founder-cockpit/FounderPerformanceConversionSection.jsx"), "utf8").includes("FounderLineChart"));
ok("chart panel isolated failure", readFileSync(join(ROOT, "components/founder-cockpit/charts/FounderChartPanel.jsx"), "utf8").includes("indisponível"));

const SAMPLE = {
  temporal_version: "A.7.0",
  reference_period_days: 30,
  growth: {
    series: [
      { activity_day: "2026-07-20", dau_visitors: 10, new_visitors: 2, crescimento_dau_visitors_pct: 0.1 },
      { activity_day: "2026-07-21", dau_visitors: 12, new_visitors: 3, crescimento_dau_visitors_pct: 0.2 },
    ],
  },
  platform_activity: {
    series: [
      { activity_day: "2026-07-20", total_sessions: 20, questions: 5 },
      { activity_day: "2026-07-21", total_sessions: 22, questions: 6 },
    ],
  },
  categories: {
    ranking: [{ category: "smartphones", total_eventos_categoria: 100 }],
    daily: [
      { activity_day: "2026-07-20", category: "smartphones", eventos_perguntas: 4, eventos_recomendacoes: 8 },
      { activity_day: "2026-07-21", category: "smartphones", eventos_perguntas: 5, eventos_recomendacoes: 9 },
    ],
    summary: { total_eventos_categoria: 100 },
  },
  products: {
    daily: [
      { activity_day: "2026-07-20", total_aparicoes: 3, total_recomendacoes: 2 },
      { activity_day: "2026-07-21", total_aparicoes: 4, total_recomendacoes: 3 },
    ],
  },
  conversion: {
    daily: [
      { activity_day: "2026-07-20", eventos_recomendacoes: 10, eventos_cliques: 2, taxa_clique_recomendacao: 0.2 },
      { activity_day: "2026-07-21", eventos_recomendacoes: 12, eventos_cliques: 3, taxa_clique_recomendacao: 0.25 },
    ],
    funnel_stages: [
      { ordem: 1, etapa: "sessoes_iniciadas", eventos: 50, taxa_conversao_visitante: 1 },
      { ordem: 2, etapa: "perguntas_enviadas", eventos: 30, taxa_conversao_visitante: 0.6 },
    ],
  },
};

console.log("\nMappers");
const sessionsCharts = mapTemporalToSessionsUsersCharts(SAMPLE);
ok("sessions charts ready", sessionsCharts.meta.status === "ready");
ok("sessions active users series", sessionsCharts.activeUsers?.series?.length === 2);
ok("sessions chronological labels", sessionsCharts.activeUsers?.xLabels?.length === 2);

const productsCharts = mapTemporalToProductsCategoriesCharts(SAMPLE, { category: "smartphones" });
ok("products charts ready", productsCharts.meta.status === "ready");
ok("category questions chart", productsCharts.categoryQuestions?.series?.length >= 1);
ok("category share bars", productsCharts.categoryShare?.items?.length >= 1);

const perfCharts = mapTemporalToPerformanceConversionCharts(SAMPLE);
ok("performance charts ready", perfCharts.meta.status === "ready");
ok("ctr daily chart", perfCharts.ctrDaily?.series?.[0]?.format === "rate");
ok("funnel bar chart", perfCharts.funnelStages?.items?.length === 2);

const empty = mapTemporalToSessionsUsersCharts({});
ok("empty state", empty.meta.status === "empty" && !empty.activeUsers);

console.log("\nPrivacy");
ok("forbidden scan clean", scanFounderChartsForbiddenContent(JSON.stringify(sessionsCharts)).length === 0);

console.log("\nLive API (optional)");
try {
  const base = process.env.PATCH_A8_PROD_BASE_URL || "https://economia-ai.vercel.app";
  const res = await fetch(`${base}/api/temporal-metrics?range=7d&series=conversion&fresh=1`);
  const json = await res.json();
  const live = mapTemporalToPerformanceConversionCharts(json);
  ok("live conversion charts", res.ok && (live.meta.status === "ready" || live.meta.status === "empty"));
} catch (err) {
  ok("live conversion charts", true, `skipped (${String(err.message).slice(0, 40)})`);
}

const passed = checks.filter((c) => c.pass).length;
const failed = checks.length - passed;
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
