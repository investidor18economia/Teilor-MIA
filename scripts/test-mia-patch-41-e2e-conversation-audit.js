/**
 * PATCH 4.1 — E2E conversation battery (unit / structure audit)
 * Usage: node scripts/test-mia-patch-41-e2e-conversation-audit.js
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildScenarioBank,
  PROFILES,
  REQUIRED_FAMILIES,
  REQUIRED_PROFILES,
} from "./patch-41-e2e-conversation-scenarios.mjs";
import { detectAbsoluteClaimsOnSurface } from "../lib/miaAbsoluteClaimGovernance.js";

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

console.log("\nPATCH 4.1 — E2E Conversation Battery Audit\n");

console.log("── Infrastructure ──");
const batteryScript = join(ROOT, "scripts/patch-41-e2e-conversation-battery.mjs");
const scenariosScript = join(ROOT, "scripts/patch-41-e2e-conversation-scenarios.mjs");
const regressionScript = join(ROOT, "scripts/patch-41-regression-runner.mjs");
const parityScript = join(ROOT, "scripts/patch-41-local-real-parity.mjs");
const batterySource = readFileSync(batteryScript, "utf8");

assert("battery script exists", existsSync(batteryScript));
assert("scenarios module exists", existsSync(scenariosScript));
assert("regression runner exists", existsSync(regressionScript));
assert("parity script exists", existsSync(parityScript));
assert("uses mia-chat endpoint", /\/api\/mia-chat/.test(batterySource));
assert("uses interpretation trace", /auditInterpretationChain/.test(batterySource));
assert("uses composition guard", /validateComposedSurface/.test(batterySource));
assert("insult safety checks", /insultSafe|AGGRESSIVE_MIA/.test(batterySource));
assert("flirt safety checks", /flirtSafe|ROMANTIC_OVERENGAGEMENT/.test(batterySource));

console.log("\n── Required profiles ──");
for (const profile of REQUIRED_PROFILES) {
  assert(`profile ${profile}`, !!PROFILES[profile]);
}

console.log("\n── Required families ──");
const bank = buildScenarioBank();
for (const family of REQUIRED_FAMILIES) {
  assert(`family ${family}`, bank.some((entry) => entry.family === family));
}

console.log("\n── Scenario bank size ──");
assert(">= 60 scenarios", bank.length >= 60, `got ${bank.length}`);
assert("all profiles represented", REQUIRED_PROFILES.every((p) => bank.some((e) => e.profile === p)));
assert("multi-turn scenarios", bank.some((e) => e.messages.length > 1));
assert("commercial subfamilies", bank.filter((e) => e.family === "commercial").length >= 15);
assert("casual meta questions", bank.some((e) => e.subfamily === "meta_mia"));
assert("insult scenarios", bank.filter((e) => e.family === "insults").length >= 3);
assert("flirt scenarios", bank.filter((e) => e.family === "flirt").length >= 2);

console.log("\n── Safety helpers ──");
assert("absolute claim detection", detectAbsoluteClaimsOnSurface("com certeza vai durar").detected);

console.log("\n── Evidence paths ──");
assert("LOCAL evidence path", /PATCH_4_1_LOCAL_E2E_CONVERSATION_EVIDENCE/.test(batterySource));
assert("PRODUCTION evidence path", /PATCH_4_1_PRODUCTION_E2E_CONVERSATION_EVIDENCE/.test(batterySource));

console.log(`\nPATCH 4.1 E2E Audit: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
console.log("ALL PASS");
