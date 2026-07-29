#!/usr/bin/env node
/**
 * PATCH B.8 — Executive UI polish audit (visual consistency only).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_EXECUTIVE_POLISH_CATALOG_VERSION,
  EXECUTIVE_MODULE_DISCLAIMERS,
  EXECUTIVE_SECTION_ORDER,
} from "../lib/miaFounderExecutivePolishCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH B.8 — Executive UI polish audit\n");

ok("polish catalog exists", existsSync(join(ROOT, "lib/miaFounderExecutivePolishCatalog.js")));
ok("polish catalog version B.8.0", FOUNDER_EXECUTIVE_POLISH_CATALOG_VERSION === "B.8.0");
ok("six executive disclaimers", Object.keys(EXECUTIVE_MODULE_DISCLAIMERS).length === 6);
ok("section order defined", EXECUTIVE_SECTION_ORDER.length === 7);

const css = read("styles/founder-cockpit.css");
ok("B.8 polish CSS block", css.includes("PATCH B.8 — Executive polish"));
ok("unified executive module class", css.includes(".founder-executive-module"));
ok("text-primary token", css.includes("--fc-text-primary"));
ok("unified narrative panels", css.includes(".founder-executive-growth-narrative,"));
ok("unified badge critical", css.includes(".founder-executive-badge--critical,"));
ok("executive focus-visible", css.includes(".founder-executive-badge:focus-visible"));
ok("mobile funnel stack", css.includes(".founder-executive-commercial-funnel"));

const executiveSections = [
  "FounderExecutiveKpisSection.jsx",
  "FounderExecutiveGrowthSection.jsx",
  "FounderExecutiveProductHealthSection.jsx",
  "FounderExecutiveCommercialPerformanceSection.jsx",
  "FounderExecutiveOperationalSection.jsx",
  "FounderExecutiveSummarySection.jsx",
];

for (const file of executiveSections) {
  const src = read(`components/founder-cockpit/${file}`);
  ok(`${file} uses founder-executive-module`, src.includes("founder-executive-module"));
  ok(`${file} uses polish catalog`, src.includes("miaFounderExecutivePolishCatalog"));
  ok(`${file} render-only guard`, !src.includes("classifyExecutive") && !src.includes("computeExecutive"));
}

const page = read("components/founder-cockpit/FounderCockpitPage.jsx");
const pageInner = page.slice(page.indexOf("function FounderCockpitPageInner"));
ok("layout order preserved", pageInner.indexOf("FounderExecutiveKpisSection") < pageInner.indexOf("FounderExecutiveSummarySection"));
ok("summary before insights", pageInner.indexOf("FounderExecutiveSummarySection") < pageInner.indexOf("FounderExecutiveInsights"));

const forbiddenMappers = [
  "lib/miaFounderExecutiveDisplay.js",
  "lib/miaFounderExecutiveGrowthDisplay.js",
  "lib/miaFounderExecutiveProductHealthDisplay.js",
  "lib/miaFounderExecutiveCommercialPerformanceDisplay.js",
  "lib/miaFounderExecutiveOperationalDisplay.js",
  "lib/miaFounderExecutiveSummaryDisplay.js",
];
for (const f of forbiddenMappers) {
  const src = read(f);
  ok(`${f.split("/").pop()} unchanged by B.8`, !src.includes("PATCH B.8"));
  ok(`${f.split("/").pop()} version intact`, src.includes('"B.'));
}

for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} unchanged`, !read(route).includes("PATCH B.8"));
}

ok("B.2 catalog still B.2.0", read("lib/miaFounderExecutiveCatalog.js").includes('"B.2.0"'));
ok("B.7 catalog still B.7.0", read("lib/miaFounderExecutiveSummaryCatalog.js").includes('"B.7.0"'));
ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));

const doc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
ok("dashboard doc mentions B.8", doc.includes("PATCH B.8") || doc.includes("B.8"));

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_8_EXECUTIVE_POLISH_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.8",
      title: "PATCH B.8 — Executive UI Polish Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      catalog_version: FOUNDER_EXECUTIVE_POLISH_CATALOG_VERSION,
      scope: "UX/UI polish only — no metrics, APIs, or mapper changes",
      modules_polished: executiveSections,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
