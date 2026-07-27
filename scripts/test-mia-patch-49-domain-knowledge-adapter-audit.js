/**
 * PATCH 4A.9 — Domain Knowledge Adapter Audit
 *
 * Usage: node scripts/test-mia-patch-49-domain-knowledge-adapter-audit.js
 */

import { resetSemanticIdCounterForTests } from "../lib/miaSemanticDecisionContract.js";
import {
  buildContextualDecisionSynthesisPayload,
  CONTEXTUAL_DECISION_SYNTHESIS_VERSION,
} from "../lib/miaContextualDecisionSynthesis.js";
import {
  applyDomainKnowledgeAdapter,
  DOMAIN_KNOWLEDGE_ADAPTER_VERSION,
  domainKnowledgeToTrace,
  validateDomainKnowledgeResult,
} from "../lib/miaDomainKnowledgeAdapter.js";
import {
  DOMAIN_ID,
  DOMAIN_KNOWLEDGE_VALIDITY,
  validateDomainKnowledgeItem,
} from "../lib/domains/domainKnowledgeContract.js";
import { resolveDomainAdapter, listRegisteredDomainAdapters } from "../lib/domains/index.js";
import { reasonMobileDomainKnowledge } from "../lib/domains/mobile/reasoners/mobileProductReasoner.js";
import { SESSION_CONTEXT_TRANSPORT_FIELDS } from "../lib/miaSessionContextTransport.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

resetSemanticIdCounterForTests();

console.log("\nPATCH 4A.9 — Domain Knowledge Adapter Audit\n");

console.log("── Version ──");
assert("adapter version", DOMAIN_KNOWLEDGE_ADAPTER_VERSION === "4A.9.0");
assert("synthesis version", CONTEXTUAL_DECISION_SYNTHESIS_VERSION === "4A.9.0");

console.log("\n── Registry ──");
const adapters = listRegisteredDomainAdapters();
assert("mobile adapter registered", adapters.some((entry) => entry.id === DOMAIN_ID.MOBILE));
assert("default adapter registered", adapters.some((entry) => entry.id === DOMAIN_ID.DEFAULT));
assert(
  "mobile resolves for celular category",
  resolveDomainAdapter("mobile", { productName: "Galaxy A55" }).id === DOMAIN_ID.MOBILE
);
assert(
  "default resolves for unknown category",
  resolveDomainAdapter("office_chair", { productName: "Chair X" }).id === DOMAIN_ID.DEFAULT
);

console.log("\n── Mobile reasoner ──");
const feReason = reasonMobileDomainKnowledge({
  productName: "Samsung Galaxy S23 FE",
  trustedSpecs: { chipset: "Snapdragon 8 Gen 1" },
});
assert("galaxy fe matches", feReason.items.some((item) => item.origin.includes("galaxy_fe")));
assert(
  "snapdragon matches",
  feReason.items.some((item) => item.origin.includes("snapdragon"))
);
assert("each item has validity", feReason.items.every((item) => item.validity));
assert(
  "stable vs market_dependent present",
  feReason.items.some((item) => item.validity === DOMAIN_KNOWLEDGE_VALIDITY.STABLE) &&
    feReason.items.some((item) => item.validity === DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED)
);

const unknownReason = reasonMobileDomainKnowledge({ productName: "ZPhone ZX9000" });
assert("unknown product neutral", unknownReason.insufficient === true);

console.log("\n── Governance ──");
for (const item of feReason.items) {
  assert(`governed item ${item.origin}`, validateDomainKnowledgeItem(item).valid);
}

console.log("\n── Adapter orchestrator ──");
const domainResult = applyDomainKnowledgeAdapter({
  category: "mobile",
  productName: "Samsung Galaxy S23 FE",
  trustedSpecs: { chipset: "Exynos 2200", official_name: "Galaxy S23 FE" },
});
assert("domain result valid", validateDomainKnowledgeResult(domainResult).valid);
assert("merged translated knowledge", !!domainResult.mergedTranslatedKnowledge?.strategicNotes?.length);
assert("trace emitted", !!domainKnowledgeToTrace(domainResult)?.itemCount);
assert("does not mutate winner", !domainResult.winnerChanged);

console.log("\n── Synthesis integration ──");
const payload = buildContextualDecisionSynthesisPayload({
  productName: "Samsung Galaxy S23 FE",
  category: "mobile",
  primaryAxis: "value",
  trustedSpecs: {
    battery_mah: 4500,
    refresh_rate_hz: 120,
    chipset: "Snapdragon 8 Gen 1",
    official_name: "Samsung Galaxy S23 FE",
    strengths: ["Boa autonomia no dia a dia"],
    weaknesses: ["Pode esquentar em uso intenso"],
  },
  gainStrings: ["Equilíbrio entre preço e recursos"],
  sacrificeStrings: ["Não é topo de linha absoluto"],
  query: "Galaxy S23 FE vale a pena?",
});
assert("payload carries domain model", !!payload.domainKnowledgeModel?.domain);
assert("payload carries domain trace", !!payload.domainKnowledgeTrace?.domain);
assert("priority still present", !!payload.contextualPriorityModel);
assert("practical consequences still present", Array.isArray(payload.practicalConsequences));
assert("structured facts preserved", !!payload.structuredDecisionFacts?.semanticUnits?.length);

console.log("\n── Session transport ──");
assert(
  "lastDomainKnowledgeModel transport field",
  SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastDomainKnowledgeModel")
);
assert(
  "lastDomainKnowledgeTrace transport field",
  SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastDomainKnowledgeTrace")
);

console.log("\n── Pipeline wiring ──");
const synthesisSource = readFileSync(join(ROOT, "lib/miaContextualDecisionSynthesis.js"), "utf8");
const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("synthesis imports domain adapter", /applyDomainKnowledgeAdapter/.test(synthesisSource));
assert(
  "domain runs before practical enrichment in payload",
  synthesisSource.indexOf("applyDomainKnowledgeAdapter") <
    synthesisSource.indexOf("enrichSemanticUnitsWithPracticalConsequences", 400)
);
assert("chat persists domain model", /lastDomainKnowledgeModel/.test(chatSource));

console.log(`\nPATCH 4A.9 Domain Knowledge Adapter: ${passed}/${passed + failed} passed`);
if (failed) {
  console.log("FAILURES DETECTED");
  process.exit(1);
}
console.log("ALL PASS");
