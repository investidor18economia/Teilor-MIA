#!/usr/bin/env node
/**
 * PATCH A.6 — Founder Performance & Conversion audit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_PERFORMANCE_DISPLAY_VERSION,
  mapTemporalMetricsToFounderPerformanceConversion,
  scanFounderPerformanceForbiddenContent,
} from "../lib/miaFounderPerformanceDisplay.js";
import { buildTemporalSeriesResponse } from "../lib/miaTemporalSeriesApi.js";
import { MIA_TEMPORAL_SERIES_GROUPS, MIA_TEMPORAL_SERIES_RPC } from "../lib/miaTemporalSeriesCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SAMPLE_TEMPORAL = {
  temporal_version: "A.6.0",
  reference_period_days: 30,
  computed_at: "2026-07-28T12:00:00.000Z",
  conversion: {
    grain: "rolling_window",
    reference_day: "2026-07-28",
    summary: {
      eventos_recomendacoes: 120,
      eventos_cliques: 12,
      eventos_favoritos: 4,
      eventos_alertas: 2,
      taxa_clique_recomendacao: 0.1,
      taxa_favoritos_recomendacao: 0.0333,
      taxa_alertas_recomendacao: 0.0167,
      conversao_acumulada_visitante: 0.05,
    },
    funnel_stages: [
      {
        ordem: 1,
        etapa: "sessoes_iniciadas",
        eventos: 200,
        visitantes_sequenciais: 150,
        taxa_conversao_visitante: 1,
        abandono_visitante: 0,
        conversao_acumulada_visitante: 1,
      },
      {
        ordem: 2,
        etapa: "perguntas_enviadas",
        eventos: 180,
        visitantes_sequenciais: 120,
        taxa_conversao_visitante: 0.8,
        abandono_visitante: 0.2,
        conversao_acumulada_visitante: 0.8,
      },
      {
        ordem: 3,
        etapa: "recomendacoes_exibidas",
        eventos: 120,
        visitantes_sequenciais: 90,
        taxa_conversao_visitante: 0.75,
        abandono_visitante: 0.25,
        conversao_acumulada_visitante: 0.6,
      },
    ],
    bottlenecks: [
      {
        transicao: "pergunta_para_recomendacao",
        etapa_origem: "perguntas_enviadas",
        etapa_destino: "recomendacoes_exibidas",
        taxa_abandono_transicao: 0.25,
        taxa_conversao_transicao: 0.75,
        is_gargalo_principal: true,
      },
      {
        transicao: "sessao_para_pergunta",
        etapa_origem: "sessoes_iniciadas",
        etapa_destino: "perguntas_enviadas",
        taxa_abandono_transicao: 0.2,
        taxa_conversao_transicao: 0.8,
        is_gargalo_principal: false,
      },
    ],
    daily: [
      {
        activity_day: "2026-07-28",
        eventos_recomendacoes: 20,
        eventos_cliques: 2,
        taxa_clique_recomendacao: 0.1,
      },
      {
        activity_day: "2026-07-27",
        eventos_recomendacoes: 18,
        eventos_cliques: 1,
        taxa_clique_recomendacao: 0.0556,
      },
    ],
  },
  partial_errors: [],
};

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\nPATCH A.6 — Founder Performance & Conversion audit\n");

console.log("Files");
ok("performance display lib", existsSync(join(ROOT, "lib/miaFounderPerformanceDisplay.js")));
ok("PerformanceConversionSection", existsSync(join(ROOT, "components/founder-cockpit/FounderPerformanceConversionSection.jsx")));
ok("conversion migration", existsSync(join(ROOT, "supabase/migrations/20260728220000_mia_temporal_series_conversion_v1.sql")));

const displaySrc = readFileSync(join(ROOT, "lib/miaFounderPerformanceDisplay.js"), "utf8");
const sectionSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderPerformanceConversionSection.jsx"), "utf8");
const pageSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderCockpitPage.jsx"), "utf8");
const migrationSrc = readFileSync(
  join(ROOT, "supabase/migrations/20260728220000_mia_temporal_series_conversion_v1.sql"),
  "utf8"
);

console.log("\nArchitecture — no aggregation in display layer");
ok("display no supabase", !displaySrc.includes("supabase"));
ok("display no SQL", !/select\s+from/i.test(displaySrc));
ok("display no rpc", !displaySrc.includes(".rpc("));
ok("section fetches temporal-metrics via filters", sectionSrc.includes("buildTemporalQueryString") && sectionSrc.includes("temporal-metrics"));
ok("section no supabase", !sectionSrc.includes("supabase"));
ok("page includes PerformanceConversionSection", pageSrc.includes("FounderPerformanceConversionSection"));

console.log("\nTemporal catalog");
ok("conversion group", MIA_TEMPORAL_SERIES_GROUPS.includes("conversion"));
ok("conversion rpc mapped", MIA_TEMPORAL_SERIES_RPC.conversion === "mia_temporal_series_conversion");
ok("migration conversion rpc", migrationSrc.includes("mia_temporal_series_conversion"));
ok("funnel stages field", migrationSrc.includes("funnel_stages"));
ok("bottlenecks field", migrationSrc.includes("bottlenecks"));
ok("production scope", migrationSrc.includes("mia_analytics_production_scope"));

console.log("\nMapper");
const view = mapTemporalMetricsToFounderPerformanceConversion(SAMPLE_TEMPORAL);
ok("display version A.6", FOUNDER_PERFORMANCE_DISPLAY_VERSION === "A.6.0");
ok("status success", view.meta.status === "success");
ok("summary metrics", view.summaryMetrics.length === 6);
ok("funnel table", view.funnelTable.length === 3);
ok("main bottleneck", view.mainBottleneck?.transicao === "Pergunta → recomendação");
ok("bottleneck cards", view.bottleneckCards.length === 2);
ok("recent days", view.recentDays.length === 2);
ok("unavailable documented", view.unavailableMetrics.length >= 2);
ok("stage label mapped", view.funnelTable[0].etapa === "Sessões iniciadas");
ok("ctr formatted", view.summaryMetrics.find((m) => m.id === "taxa_clique_recomendacao")?.format === "rate");

const snapshotView = mapTemporalMetricsToFounderPerformanceConversion(SAMPLE_TEMPORAL, {
  snapshotRecommendation: {
    metrics: [
      { id: "generated", label: "Recomendações geradas", value: 500, format: "number" },
      { id: "runner_up", label: "Runner-up utilizado", value: 40, format: "number" },
    ],
  },
  snapshotCommerce: {
    metrics: [
      { id: "clicks", label: "Cliques", value: 50, format: "number" },
      { id: "favorites", label: "Favoritos", value: 10, format: "number" },
    ],
  },
});
ok("snapshot reference", snapshotView.snapshotReference.length === 4);

console.log("\nPartial / empty states");
const partialView = mapTemporalMetricsToFounderPerformanceConversion({
  temporal_version: "A.6.0",
  conversion: SAMPLE_TEMPORAL.conversion,
  partial_errors: [{ scope: "conversion", error: "rpc_failed" }],
});
ok("partial status", partialView.meta.status === "partial");

const emptyView = mapTemporalMetricsToFounderPerformanceConversion({
  temporal_version: "A.6.0",
  conversion: { summary: {}, funnel_stages: [], bottlenecks: [], daily: [] },
  partial_errors: [],
});
ok("empty status", emptyView.meta.status === "empty");

const errorView = mapTemporalMetricsToFounderPerformanceConversion(null);
ok("error status", errorView.meta.status === "error");

console.log("\nPrivacy");
ok("clean mapped JSON", scanFounderPerformanceForbiddenContent(JSON.stringify(view)).length === 0);

console.log("\nLive API integration (optional)");
try {
  const live = await buildTemporalSeriesResponse({
    bypassCache: true,
    seriesGroups: ["conversion"],
  });
  ok("live conversion key", "conversion" in live);
  if (live.conversion?.summary) {
    const liveView = mapTemporalMetricsToFounderPerformanceConversion(live);
    ok("live map status", ["success", "partial", "empty"].includes(liveView.meta.status));
  } else {
    ok("live map skipped", true);
  }
} catch {
  ok("live map skipped", true);
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
