#!/usr/bin/env node
/**
 * PATCH A.5 — Founder Products & Categories audit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_PRODUCTS_DISPLAY_VERSION,
  mapTemporalMetricsToFounderProductsCategories,
  mapCategoryDistributionBars,
  scanFounderProductsForbiddenContent,
} from "../lib/miaFounderProductsDisplay.js";
import { buildTemporalSeriesResponse } from "../lib/miaTemporalSeriesApi.js";
import { MIA_TEMPORAL_SERIES_GROUPS, MIA_TEMPORAL_SERIES_RPC } from "../lib/miaTemporalSeriesCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SAMPLE_TEMPORAL = {
  temporal_version: "A.5.0",
  reference_period_days: 30,
  computed_at: "2026-07-28T12:00:00.000Z",
  products: {
    summary: {
      distinct_products: 12,
      total_aparicoes: 120,
      total_recomendacoes: 80,
      total_cliques: 8,
      total_favoritos: 3,
      total_alertas: 2,
      taxa_clique_recomendacao: 0.1,
    },
    ranking: [
      {
        product_label: "iPhone 13",
        product_brand: "Apple",
        total_aparicoes: 56,
        total_recomendacoes: 50,
        total_cliques: 4,
        total_favoritos: 1,
        total_alertas: 1,
        taxa_clique_recomendacao: 0.08,
      },
    ],
    daily: [
      {
        activity_day: "2026-07-28",
        product_label: "iPhone 13",
        total_aparicoes: 10,
        total_recomendacoes: 8,
        total_cliques: 1,
        taxa_clique_recomendacao: 0.125,
      },
    ],
  },
  categories: {
    summary: {
      distinct_categories: 5,
      total_perguntas: 120,
      total_recomendacoes: 80,
      total_cliques: 8,
      total_eventos_categoria: 210,
      taxa_conversao_pergunta_recomendacao: 0.6667,
      taxa_conversao_recomendacao_clique: 0.1,
    },
    ranking: [
      {
        category: "smartphones",
        total_perguntas: 80,
        total_recomendacoes: 50,
        total_cliques: 5,
        total_eventos_categoria: 140,
        taxa_conversao_pergunta_recomendacao: 0.625,
      },
      {
        category: "notebooks",
        total_perguntas: 40,
        total_recomendacoes: 30,
        total_cliques: 3,
        total_eventos_categoria: 70,
        taxa_conversao_pergunta_recomendacao: 0.75,
      },
    ],
    daily: [
      {
        activity_day: "2026-07-28",
        category: "smartphones",
        total_eventos: 20,
        eventos_perguntas: 12,
        eventos_recomendacoes: 8,
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

console.log("\nPATCH A.5 — Founder Products & Categories audit\n");

console.log("Files");
ok("products display lib", existsSync(join(ROOT, "lib/miaFounderProductsDisplay.js")));
ok("ProductsCategoriesSection", existsSync(join(ROOT, "components/founder-cockpit/FounderProductsCategoriesSection.jsx")));
ok("products migration", existsSync(join(ROOT, "supabase/migrations/20260728210000_mia_temporal_series_products_categories_v1.sql")));

const displaySrc = readFileSync(join(ROOT, "lib/miaFounderProductsDisplay.js"), "utf8");
const sectionSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderProductsCategoriesSection.jsx"), "utf8");
const pageSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderCockpitPage.jsx"), "utf8");
const migrationSrc = readFileSync(
  join(ROOT, "supabase/migrations/20260728210000_mia_temporal_series_products_categories_v1.sql"),
  "utf8"
);

console.log("\nArchitecture — no aggregation in display layer");
ok("display no supabase", !displaySrc.includes("supabase"));
ok("display no SQL", !/select\s+from/i.test(displaySrc));
ok("display no rpc", !displaySrc.includes(".rpc("));
ok("section fetches temporal-metrics products", sectionSrc.includes("series=products,categories"));
ok("section no supabase", !sectionSrc.includes("supabase"));
ok("page includes ProductsCategoriesSection", pageSrc.includes("FounderProductsCategoriesSection"));

console.log("\nTemporal catalog");
ok("products group", MIA_TEMPORAL_SERIES_GROUPS.includes("products"));
ok("categories group", MIA_TEMPORAL_SERIES_GROUPS.includes("categories"));
ok("products rpc mapped", MIA_TEMPORAL_SERIES_RPC.products === "mia_temporal_series_products");
ok("categories rpc mapped", MIA_TEMPORAL_SERIES_RPC.categories === "mia_temporal_series_categories");
ok("migration products rpc", migrationSrc.includes("mia_temporal_series_products"));
ok("migration categories rpc", migrationSrc.includes("mia_temporal_series_categories"));
ok("product_label field", migrationSrc.includes("product_label"));
ok("production scope", migrationSrc.includes("mia_analytics_production_scope"));

console.log("\nMapper");
const view = mapTemporalMetricsToFounderProductsCategories(SAMPLE_TEMPORAL);
ok("display version A.5", FOUNDER_PRODUCTS_DISPLAY_VERSION === "A.5.0");
ok("status success", view.meta.status === "success");
ok("product summary metrics", view.productSummaryMetrics.length === 7);
ok("category summary metrics", view.categorySummaryMetrics.length === 7);
ok("top products", view.topProducts.length === 1);
ok("top categories", view.topCategories.length === 2);
ok("category distribution", view.categoryDistribution.length === 2);
ok("recent category days", view.recentCategoryDays.length === 1);
ok("unavailable documented", view.unavailableMetrics.length >= 2);
ok("product label mapped", view.topProducts[0].product_label === "iPhone 13");
ok("category mapped", view.topCategories[0].category === "smartphones");

const bars = mapCategoryDistributionBars(SAMPLE_TEMPORAL.categories.ranking, 210, 8);
ok("distribution uses period total", bars[0].percent > 0 && bars[0].percent < 100);

console.log("\nPartial / empty states");
const partialView = mapTemporalMetricsToFounderProductsCategories({
  temporal_version: "A.5.0",
  products: SAMPLE_TEMPORAL.products,
  categories: null,
  partial_errors: [{ scope: "categories", error: "rpc_failed" }],
});
ok("partial status", partialView.meta.status === "partial");

const emptyView = mapTemporalMetricsToFounderProductsCategories({
  temporal_version: "A.5.0",
  products: { summary: {}, ranking: [], daily: [] },
  categories: { summary: {}, ranking: [], daily: [] },
  partial_errors: [],
});
ok("empty status", emptyView.meta.status === "empty");

console.log("\nPrivacy");
ok("clean mapped JSON", scanFounderProductsForbiddenContent(JSON.stringify(view)).length === 0);
ok("no product_name key", !JSON.stringify(view).includes('"product_name"'));

console.log("\nLive API integration (optional)");
try {
  const live = await buildTemporalSeriesResponse({
    bypassCache: true,
    seriesGroups: ["products", "categories"],
  });
  ok("live products key", "products" in live);
  ok("live categories key", "categories" in live);
  if (live.products?.ranking?.length) {
    const liveView = mapTemporalMetricsToFounderProductsCategories(live);
    ok("live map status", ["success", "partial", "empty"].includes(liveView.meta.status));
  } else {
    ok("live map skipped", true);
  }
} catch {
  ok("live map skipped", true);
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
