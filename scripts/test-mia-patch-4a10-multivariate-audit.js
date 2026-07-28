/**
 * PATCH 4A.10 — Multivariate robustness audit (unit / structure)
 *
 * Usage: node scripts/test-mia-patch-4a10-multivariate-audit.js
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAbsoluteClaimsOnSurface } from "../lib/miaAbsoluteClaimGovernance.js";
import {
  computeRepetitionMetrics,
  validateComposedSurface,
  VERBALIZATION_COMPOSITION_GUARD_VERSION,
} from "../lib/miaVerbalizationCompositionGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nPATCH 4A.10 — Multivariate Robustness Audit\n");

console.log("── Validation infrastructure ──");
const validationScript = join(ROOT, "scripts/patch-4a10-multivariate-validation.mjs");
const regressionScript = join(ROOT, "scripts/patch-4a10-regression-runner.mjs");
const validationSource = readFileSync(validationScript, "utf8");
assert("multivariate validation script exists", existsSync(validationScript));
assert("regression runner exists", existsSync(regressionScript));
assert("imports absolute claim governance", /detectAbsoluteClaimsOnSurface/.test(validationSource));
assert("imports composition guard", /validateComposedSurface/.test(validationSource));
assert("extracts architecture snapshot", /extractArchitectureSnapshot/.test(validationSource));
assert("scores four narrative dimensions", /fidelity.*naturalness.*consistency.*personalization/s.test(validationSource));

console.log("\n── Required families ──");
const requiredFamilies = [
  "battery",
  "camera",
  "games",
  "work",
  "study",
  "value",
  "updates",
  "comparison",
  "contestation",
  "unknown_product",
  "unknown_brand",
  "unknown_category",
];
for (const family of requiredFamilies) {
  assert(`family ${family}`, validationSource.includes(`${family}:`));
}
assert("long conversation scenario", /long-conversation/.test(validationSource));
assert("priority shift scenario", /priority-shift/.test(validationSource));
assert("stability reruns", /STABILITY_RUNS/.test(validationSource));

console.log("\n── Battery multivariation ──");
const batteryVariations = (validationSource.match(/battery:[\s\S]*?variations:\s*\[([\s\S]*?)\],/m) || [])[1] || "";
assert("battery >= 5 variations", (batteryVariations.match(/"/g) || []).length >= 10);

console.log("\n── Factual fidelity helpers ──");
const absoluteSample = "Com certeza vai durar o dia inteiro sem problemas.";
assert("detect absolute on sample", detectAbsoluteClaimsOnSurface(absoluteSample).detected);
const cleanSample = "A autonomia tende a ser um ponto forte no dia a dia.";
assert("clean sample passes", !detectAbsoluteClaimsOnSurface(cleanSample).detected);

console.log("\n── Narrative quality helpers ──");
const robotic = "Pelo que mapeei, o aparelho combina. Pelo que mapeei, o aparelho combina.";
const repetition = computeRepetitionMetrics(robotic);
assert("repetition detected on duplicate", repetition.duplicateSentenceCount >= 1);
const surface = validateComposedSurface("Eu iria no Galaxy A55 porque a bateria sugere mais folga.");
assert("valid surface passes", surface.pass);

console.log("\n── Composition guard version ──");
assert("guard version present", VERBALIZATION_COMPOSITION_GUARD_VERSION === "4A.7V.0");

console.log("\n── Coverage reporting ──");
assert("absolute coverage block", /coverage:\s*\{[\s\S]*absolute:/m.test(validationSource));
assert("relative coverage NULL percent", /coveragePercent:\s*null/.test(validationSource));
assert("LOCAL/REAL evidence paths", /PATCH_4A_10_LOCAL_MULTIVARIATE_EVIDENCE/.test(validationSource));

console.log(`\nPATCH 4A.10 Multivariate Audit: ${passed}/${passed + failed} passed`);
if (failed) {
  console.log("FAILURES DETECTED");
  process.exit(1);
}
console.log("ALL PASS");
