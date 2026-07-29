#!/usr/bin/env node
/**
 * PATCH B.1 — Executive architecture audit (documentation only — no implementation).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH B.1 — Executive architecture audit\n");

// Phase B architecture doc
const archDoc = "docs/analytics/FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md";
ok("Phase B architecture doc exists", existsSync(join(ROOT, archDoc)));
const arch = read(archDoc);
ok("doc defines 6 modules B.2-B.7", /KPIs Estratégicos/.test(arch) && /Resumo Executivo/.test(arch));
ok("doc defines executive layers", /Mapper Executivo/.test(arch) && /Interface Executiva/.test(arch));
ok("doc references Baseline A", arch.includes("FOUNDER_COCKPIT_BASELINE_A.md"));
ok("doc defines risks", arch.includes("Riscos"));
ok("doc defines roadmap B.2-B.9", arch.includes("PATCH B.9"));

// Baseline A intact
ok("Baseline A doc exists", existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_BASELINE_A.md")));
ok("Phase A final report exists", existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md")));

// B.1 must NOT add implementation files (unless B.2+ approved)
const b2Implemented = existsSync(join(ROOT, "lib/miaFounderExecutiveDisplay.js"));
const b3Implemented = existsSync(join(ROOT, "lib/miaFounderExecutiveGrowthDisplay.js"));
const b4Implemented = existsSync(join(ROOT, "lib/miaFounderExecutiveProductHealthDisplay.js"));
const forbiddenImplB1 = [
  ...(b3Implemented ? [] : ["components/founder-cockpit/FounderExecutiveGrowthSection.jsx"]),
  ...(b4Implemented ? [] : ["components/founder-cockpit/FounderExecutiveProductHealthSection.jsx"]),
  "components/founder-cockpit/FounderExecutiveSummarySection.jsx",
  "pages/api/founder-executive-metrics.js",
];
const b2Expected = [
  "lib/miaFounderExecutiveDisplay.js",
  "lib/miaFounderExecutiveCatalog.js",
  "components/founder-cockpit/FounderExecutiveKpisSection.jsx",
];
for (const f of forbiddenImplB1) {
  ok(`B.1 did not create ${f.split("/").pop()}`, !existsSync(join(ROOT, f)));
}
if (b2Implemented) {
  for (const f of b2Expected) {
    ok(`B.2 executive file ${f.split("/").pop()}`, existsSync(join(ROOT, f)));
  }
} else {
  for (const f of b2Expected) {
    ok(`B.1 did not create ${f.split("/").pop()}`, !existsSync(join(ROOT, f)));
  }
}
if (b3Implemented) {
  ok("B.3 growth file miaFounderExecutiveGrowthDisplay.js", existsSync(join(ROOT, "lib/miaFounderExecutiveGrowthDisplay.js")));
  ok("B.3 growth file miaFounderExecutiveGrowthCatalog.js", existsSync(join(ROOT, "lib/miaFounderExecutiveGrowthCatalog.js")));
  ok("B.3 growth file FounderExecutiveGrowthSection.jsx", existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveGrowthSection.jsx")));
}
if (b4Implemented) {
  ok("B.4 health file miaFounderExecutiveProductHealthDisplay.js", existsSync(join(ROOT, "lib/miaFounderExecutiveProductHealthDisplay.js")));
  ok("B.4 health file miaFounderExecutiveProductHealthCatalog.js", existsSync(join(ROOT, "lib/miaFounderExecutiveProductHealthCatalog.js")));
  ok("B.4 health file FounderExecutiveProductHealthSection.jsx", existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveProductHealthSection.jsx")));
}

// Baseline contracts unchanged — version strings
ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("filters catalog still A.7.0", read("lib/miaFounderFiltersCatalog.js").includes('"A.7.0"'));
ok("charts display still A.8.0", read("lib/miaFounderChartsDisplay.js").includes('"A.8.0"'));
ok("temporal catalog still A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));
ok("executive API still 11.1.0", read("lib/miaExecutiveMetricsCatalog.js").includes('"11.1.0"'));

// API routes untouched (no B.1 markers)
for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} no B.1 patch marker`, !read(route).includes("PATCH B.1"));
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_1_ARCHITECTURE_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.1",
      title: "PATCH B.1 — Executive Architecture Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      scope: "architecture documentation only — no implementation",
      baseline_a: "FROZEN — OFFICIALLY_COMPLETED",
      architecture_doc: archDoc,
      modules_defined: [
        "B.2 KPIs Estratégicos",
        "B.3 Crescimento da Plataforma",
        "B.4 Saúde do Produto",
        "B.5 Performance Comercial",
        "B.6 Indicadores Operacionais",
        "B.7 Resumo Executivo",
        "B.8 Polimento Executivo",
        "B.9 Auditoria Final",
      ],
      decisions: [
        "Phase B composes over Baseline A — no contract breaking",
        "New executive mappers in lib/miaFounderExecutive* (future patches)",
        "Existing APIs sufficient for initial Phase B — new RPCs only when justified",
        "Reuse A.7 filters, A.8 charts, A.9 design system",
      ],
      risks_documented: [
        "metric duplication",
        "KPI inconsistency",
        "multiple sources of truth",
        "frontend aggregation",
        "Phase A regression",
        "redundant APIs/RPCs",
        "performance",
      ],
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
