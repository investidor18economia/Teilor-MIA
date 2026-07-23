#!/usr/bin/env node
/**
 * PATCH 11.2 — Public metrics page audit (Teilor em Números).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatPublicMetricNumber,
  formatPublicMetricCurrency,
  formatPublicMetricRate,
  mapExecutiveMetricsToPublicPage,
  scanPublicMetricsForbiddenContent,
  PUBLIC_METRICS_FORBIDDEN_PATTERNS,
} from "../lib/miaPublicMetricsDisplay.js";
import { buildExecutiveMetricsResponse } from "../lib/miaExecutiveMetricsApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

console.log("\nPATCH 11.2 — Teilor em Números audit\n");

console.log("Files");
ok("page route", existsSync(join(ROOT, "pages/teilor-em-numeros.jsx")));
ok("display lib", existsSync(join(ROOT, "lib/miaPublicMetricsDisplay.js")));
ok("PublicMetricsPage", existsSync(join(ROOT, "components/public-metrics/PublicMetricsPage.jsx")));
ok("PublicMetricCard", existsSync(join(ROOT, "components/public-metrics/PublicMetricCard.jsx")));
ok("styles", existsSync(join(ROOT, "styles/public-metrics.css")));
ok("doc", existsSync(join(ROOT, "docs/analytics/PUBLIC_METRICS_PAGE.md")));

console.log("\nNo direct analytics / aggregation");
const pageSrc = readFileSync(join(ROOT, "pages/teilor-em-numeros.jsx"), "utf8");
const displaySrc = readFileSync(join(ROOT, "lib/miaPublicMetricsDisplay.js"), "utf8");
const componentSrc = readFileSync(join(ROOT, "components/public-metrics/PublicMetricsPage.jsx"), "utf8");
ok("page fetches executive-metrics only", pageSrc.includes("/api/executive-metrics"));
ok("page no supabase", !pageSrc.includes("supabase"));
ok("page no buildExecutiveMetricsResponse", !pageSrc.includes("buildExecutiveMetricsResponse"));
ok("display no supabase", !displaySrc.includes("supabase"));
ok("display no SQL", !/select\s+from/i.test(displaySrc));
ok("component no fetch", !componentSrc.includes("fetch("));

console.log("\nISR / cache");
ok("getStaticProps", pageSrc.includes("getStaticProps"));
ok("revalidate", pageSrc.includes("revalidate"));

console.log("\nSEO");
ok("Head title", pageSrc.includes("<title>"));
ok("meta description", pageSrc.includes('name="description"'));
ok("canonical", pageSrc.includes('rel="canonical"'));
ok("og:title", pageSrc.includes('property="og:title"'));
ok("twitter:card", pageSrc.includes('name="twitter:card"'));
ok("schema.org Organization", pageSrc.includes('"@type": "Organization"'));

console.log("\nFormatters");
ok("number pt-BR", formatPublicMetricNumber(15000, { suffix: "+" }) === "15.000+");
ok("number compact mil", formatPublicMetricNumber(350000, { compact: true, suffix: "+" }).includes("mil"));
ok("currency million", formatPublicMetricCurrency(1200000).includes("milhão"));
ok("rate percent", formatPublicMetricRate(0.125) === "12,5%");

console.log("\nMapper (display only)");
const sample = await buildExecutiveMetricsResponse({ bypassCache: true });
const mapped = mapExecutiveMetricsToPublicPage(sample);
ok("hero title", mapped.hero.title === "Teilor em Números");
ok("5 sections", Object.keys(mapped.sections).length === 5);
ok("platform cards", mapped.sections.platform.cards.length === 4);
ok("recommendation cards", mapped.sections.recommendation.cards.length === 4);
ok("commerce cards", mapped.sections.commerce.cards.length === 4);
ok("savings disclaimer", mapped.sections.savings.disclaimer.includes("Não representa economia"));
ok(
  "acceptance not labeled satisfaction",
  !mapped.sections.recommendation.cards.some((c) => /satisfação/i.test(c.title))
);
ok("system cards", mapped.sections.system.cards.length >= 2);

console.log("\nPrivacy patterns");
ok("forbidden patterns defined", PUBLIC_METRICS_FORBIDDEN_PATTERNS.length >= 5);
ok("clean mapped output", scanPublicMetricsForbiddenContent(JSON.stringify(mapped)).length === 0);
ok("detects visitor_id", scanPublicMetricsForbiddenContent("visitor_id=abc").length > 0);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
