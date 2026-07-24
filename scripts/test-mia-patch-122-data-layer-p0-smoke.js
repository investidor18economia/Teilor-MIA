#!/usr/bin/env node
/**
 * PATCH 12.2 — Data Layer P0 smoke (no pipeline spawn).
 */
import {
  classifyDataLayerResponse,
  classifyFallbackKind,
  DATA_LAYER_RESPONSE_CLASSIFICATIONS,
} from "../lib/miaDataLayerResolutionClassifier.js";
import {
  humanizeDataLayerText,
  detectRawDataLayerTokenLeak,
  applyDataLayerHumanizationGuard,
} from "../lib/miaDataLayerHumanizationGuard.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

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

console.log("\nPATCH 12.2 — Data Layer P0 smoke\n");

ok("NO_COMMERCIAL_RESULT", classifyDataLayerResponse({ productsUsedCount: 0 }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT);
ok("FULL_DATA_LAYER", classifyDataLayerResponse({ productsUsedCount: 2, dataLayerUsedAsPrimarySource: true, dataLayerProductsInResponse: 2 }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FULL_DATA_LAYER);
ok("FALLBACK_ONLY", classifyDataLayerResponse({ productsUsedCount: 1, dataLayerUsedAsPrimarySource: false }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY);
ok("fallback kind none", classifyFallbackKind({ responseClassification: "NO_COMMERCIAL_RESULT" }) === "none");

const human = humanizeDataLayerText("excelente_custo_beneficio");
ok("humanize no snake leak", !detectRawDataLayerTokenLeak(human).leak);
ok("guard null safe", applyDataLayerHumanizationGuard(null).changed === false);

ok("no invented specs empty", findInventedSpecViolations("", {}).length === 0);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
