/**
 * PATCH UX-1 — Cognitive Loading States unit audit
 *
 * Usage: node scripts/test-mia-cognitive-loading.js
 */

import {
  deriveCognitiveLoadingState,
  getCognitiveLoadingFallbackState,
  COGNITIVE_LOADING_FALLBACK,
} from "../lib/miaCognitiveLoading.js";
import { buildCognitiveLoadingPreview } from "../lib/miaCognitiveLoadingPreview.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${name}`);
}

console.log("PATCH UX-1 — Cognitive Loading States\n");

const fallback = getCognitiveLoadingFallbackState();
assert("fallback has description", typeof fallback.description === "string" && fallback.description.length > 0);
assert("fallback key", fallback.key === "FALLBACK");

const ae = deriveCognitiveLoadingState({
  conversationAct: "alternative_exploration",
  seed: "ae-1",
});
assert("AE key", ae.key === "ALTERNATIVE_EXPLORATION");
assert("AE description", ae.description.includes("alternativ") || ae.description.includes("opç"));

const sbd = deriveCognitiveLoadingState({
  conversationAct: "second_best_discovery",
  seed: "sbd-1",
});
assert("SBD key", sbd.key === "SECOND_BEST_DISCOVERY");

const cc = deriveCognitiveLoadingState({
  conversationAct: "confidence_challenge",
  seed: "cc-1",
});
assert("CC key", cc.key === "CONFIDENCE_CHALLENGE");

const ns = deriveCognitiveLoadingState({
  responsePathHint: "new_commercial_search",
  turnType: "NEW_SEARCH",
  seed: "ns-1",
});
assert("NEW_SEARCH key", ns.key === "NEW_SEARCH");

const unknown = deriveCognitiveLoadingState({});
assert("unknown uses fallback", unknown.key === "FALLBACK");
assert("unknown non-empty", unknown.description === COGNITIVE_LOADING_FALLBACK || unknown.description.length > 0);

const stableA = deriveCognitiveLoadingState({
  conversationAct: "social_validation",
  seed: "stable",
});
const stableB = deriveCognitiveLoadingState({
  conversationAct: "social_validation",
  seed: "stable",
});
assert("stable seed", stableA.description === stableB.description);

const preview = buildCognitiveLoadingPreview({
  text: "mostra outra opcao",
  sessionContext: {
    lastBestProduct: { product_name: "Produto A" },
    hasAnchor: true,
  },
});
assert("preview AE", preview.key === "ALTERNATIVE_EXPLORATION");
assert("preview non-empty", preview.description.length > 0);

const previewReset = buildCognitiveLoadingPreview({
  text: "agora quero notebook",
  sessionContext: {
    lastBestProduct: { product_name: "Produto A" },
    hasAnchor: true,
  },
});
assert("preview new search", previewReset.key === "NEW_SEARCH");

console.log(`\nPassed: ${passed} | Failed: ${failed}`);
process.exit(failed ? 1 : 0);
