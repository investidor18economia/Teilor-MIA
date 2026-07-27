/**
 * PATCH 4A.7V — Absolute claim governance audit
 *
 * Usage: node scripts/test-mia-patch-4a7v-absolute-claim-governance-audit.js
 */

import {
  ABSOLUTE_CLAIM_GOVERNANCE_VERSION,
  containsAbsoluteClaim,
  detectAbsoluteClaimsOnSurface,
  governAbsoluteClaimsOnSurface,
  validateConfidenceReplyAlignment,
} from "../lib/miaAbsoluteClaimGovernance.js";
import { buildPracticalConsequences, validatePracticalConsequence } from "../lib/miaPracticalConsequenceEngine.js";
import { polishReplySurface, detectAbsoluteClaimsOnSurface as guardDetect } from "../lib/miaVerbalizationCompositionGuard.js";

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

console.log("\nPATCH 4A.7V — Absolute Claim Governance Audit\n");

console.log("── Version ──");
assert("governance version", ABSOLUTE_CLAIM_GOVERNANCE_VERSION === "4A.7V.0");

console.log("\n── Detection ──");
const samples = [
  "É sempre bom avaliar",
  "com certeza vai durar",
  "garante performance",
  "vai rodar tudo sem travar",
  "isso significa que você nunca vai precisar recarregar",
];
for (const sample of samples) {
  assert(`detect: ${sample.slice(0, 28)}`, containsAbsoluteClaim(sample));
}

console.log("\n── Surface governance ──");
for (const sample of samples) {
  const governed = governAbsoluteClaimsOnSurface(sample);
  assert(`govern: ${sample.slice(0, 28)}`, !containsAbsoluteClaim(governed), governed);
}

console.log("\n── Composition Guard integration ──");
const llmLeak = "Entendo! É sempre bom encontrar algo que se encaixe.";
const polished = polishReplySurface(llmLeak);
assert("polish removes absolute", !guardDetect(polished).detected, polished);

console.log("\n── Confidence alignment ──");
const lowConfReply = "Esse modelo é uma opção bem segura pra autonomia no dia a dia.";
const lowConf = [{ confidence: "low", category: "battery" }];
assert(
  "reject over-assertive for low confidence",
  !validateConfidenceReplyAlignment(lowConfReply, lowConf).pass
);
const hedgedReply = "Esse modelo tende a ser uma opção razoável pra autonomia no dia a dia.";
assert(
  "accept hedged reply for low confidence",
  validateConfidenceReplyAlignment(hedgedReply, lowConf).pass
);

console.log("\n── Engine still blocks absolute structured output ──");
const invalid = validatePracticalConsequence({
  category: "battery",
  confidence: "high",
  reason: "test",
  source: { primary: "data_layer_spec" },
  practicalMeaning: "sempre dura o dia inteiro",
});
assert("engine rejects absolute structured meaning", !invalid.valid);

console.log(`\nPATCH 4A.7V Governance Audit: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
console.log("ALL PASS");
