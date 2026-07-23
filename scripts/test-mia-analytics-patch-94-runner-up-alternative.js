#!/usr/bin/env node
/**
 * PATCH 9.4 — Runner-up and Alternative Analytics audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import { COMMERCIAL_FOLLOW_UP_TYPES } from "../lib/miaCommercialFollowUpContinuity.js";
import {
  MIA_RECOMMENDATION_ALTERNATIVE_CATALOG_VERSION,
  MIA_SCORE_GAP_BUCKETS,
  MIA_RUNNER_UP_COMPETITIVENESS,
  MIA_ALTERNATIVE_MATCH_METHODS,
  MIA_ALTERNATIVE_MATCH_CONFIDENCE,
  MIA_ALTERNATIVE_RECOVERY_CLASSES,
  classifyScoreGapBucket,
  classifyRunnerUpCompetitiveness,
  resolveRunnerUpDisplayState,
  matchAlternativeToRunnerUp,
  classifyWinnerRunnerUpDiversity,
  buildRunnerUpAlternativeDecisionEnrichment,
  classifyAlternativeRecoveryOutcome,
  classifyRunnerUpBecameWinner,
  resolveWinnerAndRunnerUpRanks,
  hashSafeFamilyKey,
  isAlternativeAnalyticsDomainAllowed,
} from "../lib/miaRecommendationAlternativeAnalytics.js";
import {
  buildRecommendationDecisionMetadata,
} from "../lib/miaRecommendationDecisionClassifier.js";
import {
  classifyAcceptanceSignalFromFollowUp,
  classifyAcceptanceSignalFromClientEvent,
} from "../lib/miaRecommendationAcceptanceClassifier.js";
import { buildRecommendationDecisionRecommendationMetadata } from "../lib/miaRecommendationDecisionAnalytics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");
const MIA_CHAT = join(ROOT, "components/MIAChat.jsx");

const SQL_FILES = [
  "patch-94-query1-runner-up-availability.sql",
  "patch-94-query2-score-gap-competitiveness.sql",
  "patch-94-query3-display-delivery-funnel.sql",
  "patch-94-query4-interactions.sql",
  "patch-94-query5-alternative-requests.sql",
  "patch-94-query6-runner-up-selection.sql",
  "patch-94-query7-non-runner-up-alternatives.sql",
  "patch-94-query8-recovery.sql",
  "patch-94-query9-diversity.sql",
  "patch-94-query10-decision-source.sql",
  "patch-94-query11-runner-up-quality.sql",
  "patch-94-query12-quality-fanout.sql",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

const winner = { familyKey: "samsung-galaxy-a55", product_name: "Samsung A55", score: 120 };
const runnerUp = { familyKey: "motorola-edge-50", product_name: "Motorola Edge 50", score: 115 };
const alt = { familyKey: "xiaomi-redmi-note", product_name: "Xiaomi Note", score: 100 };
const ranked = [winner, runnerUp, alt];
const display = [winner, alt];

console.log("\nPATCH 9.4 — Runner-up and Alternative Analytics audit\n");

console.log("Catalog");
assert("catalog version", MIA_RECOMMENDATION_ALTERNATIVE_CATALOG_VERSION === "9.4.0");

console.log("\nRunner-up authority");
const ranks = resolveWinnerAndRunnerUpRanks(ranked, winner);
assert("runner-up present", ranks.runnerUpPresent === true);
assert("runner-up rank 2", ranks.runnerUpRank === 2);
assert("not raw index when same family skipped", ranks.runnerUpProduct?.familyKey === "motorola-edge-50");

console.log("\nScore gap buckets");
assert("tie", classifyScoreGapBucket(0) === MIA_SCORE_GAP_BUCKETS.TIE);
assert("very close", classifyScoreGapBucket(1.5) === MIA_SCORE_GAP_BUCKETS.VERY_CLOSE);
assert("close", classifyScoreGapBucket(4) === MIA_SCORE_GAP_BUCKETS.CLOSE);
assert("moderate", classifyScoreGapBucket(8) === MIA_SCORE_GAP_BUCKETS.MODERATE);
assert("wide", classifyScoreGapBucket(15) === MIA_SCORE_GAP_BUCKETS.WIDE);

console.log("\nCompetitiveness");
assert("highly competitive", classifyRunnerUpCompetitiveness(1.5, true, true) === MIA_RUNNER_UP_COMPETITIVENESS.HIGHLY_COMPETITIVE);
assert("not comparable", classifyRunnerUpCompetitiveness(null, true, false) === MIA_RUNNER_UP_COMPETITIVENESS.NOT_COMPARABLE);

console.log("\nDisplay vs cognitive runner-up");
const displayState = resolveRunnerUpDisplayState(display, runnerUp);
assert("runner-up not in display slice", displayState.runner_up_in_display_products === false);
assert("second card not runner-up", displayState.display_second_card_is_cognitive_runner_up === false);

const displayAligned = resolveRunnerUpDisplayState([winner, runnerUp], runnerUp);
assert("runner-up in display", displayAligned.runner_up_in_display_products === true);
assert("second card is runner-up", displayAligned.display_second_card_is_cognitive_runner_up === true);

console.log("\nIdentity match");
const wHash = hashSafeFamilyKey("motorola-edge-50");
const rHash = hashSafeFamilyKey("motorola-edge-50");
const match = matchAlternativeToRunnerUp(rHash, wHash, hashSafeFamilyKey("samsung"));
assert("exact family HIGH", match.match_method === MIA_ALTERNATIVE_MATCH_METHODS.EXACT_FAMILY_MATCH);
assert("is runner-up match", match.is_runner_up_match === true);

const noMatch = matchAlternativeToRunnerUp(hashSafeFamilyKey("other"), rHash, hashSafeFamilyKey("samsung"));
assert("no match", noMatch.is_runner_up_match === false);

console.log("\nDecision metadata enrichment");
const meta = buildRecommendationDecisionMetadata({
  selectedBestProduct: winner,
  rankedProducts: ranked,
  displayProducts: display,
  routingDecision: { mode: "commercial_search" },
  decisionSource: "COGNITIVE_PRIMARY",
});
assert("runner_up_product_family", !!meta.runner_up_product_family);
assert("score_gap_bucket", meta.score_gap_bucket === MIA_SCORE_GAP_BUCKETS.CLOSE);
assert("runner_up_in_ranking", meta.runner_up_in_ranking === true);
assert("no product_name in metadata", !("product_name" in meta));

console.log("\nRunner-up became winner");
const became = classifyRunnerUpBecameWinner(meta.runner_up_product_family, meta.runner_up_product_family);
assert("became winner", became.runner_up_became_winner === true);
assert("match confidence HIGH", became.match_confidence === MIA_ALTERNATIVE_MATCH_CONFIDENCE.HIGH);

console.log("\nRecovery classification");
assert(
  "recovered by runner-up",
  classifyAlternativeRecoveryOutcome({ rejectionExplicit: true, acceptanceOnRunnerUp: true }) ===
    MIA_ALTERNATIVE_RECOVERY_CLASSES.RECOVERED_BY_RUNNER_UP
);
assert(
  "new search recovery",
  classifyAlternativeRecoveryOutcome({ refinementPresent: true, newSearchRecovery: true }) ===
    MIA_ALTERNATIVE_RECOVERY_CLASSES.RECOVERED_BY_NEW_SEARCH
);

console.log("\n9.2 runner-up follow-up enabled");
const runnerFollowUp = classifyAcceptanceSignalFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP, {
  runnerUpProductFamilyHash: meta.runner_up_product_family,
});
assert("follow-up not excluded", runnerFollowUp != null);
assert("target RUNNER_UP", runnerFollowUp?.signal_target === "RUNNER_UP");

console.log("\n9.2 client runner-up click");
const runnerHash = meta.runner_up_product_family;
const click = classifyAcceptanceSignalFromClientEvent(
  "offer_click",
  { product_id: "motorola-edge-50", metadata: {} },
  { winner_product_family: meta.winner_product_family, runner_up_product_family: runnerHash }
);
assert("runner-up click target", click?.signal_target === "RUNNER_UP");

console.log("\nInline response metadata");
const inline = buildRecommendationDecisionRecommendationMetadata({
  request_id: "11111111-1111-4111-8111-111111111111",
  event_version: "9.1.0",
  winner_product_family: meta.winner_product_family,
  runner_up_product_family: meta.runner_up_product_family,
  runner_up_in_display_products: false,
  score_gap_bucket: meta.score_gap_bucket,
  runner_up_competitiveness: meta.runner_up_competitiveness,
  winner_present: true,
  runner_up_present: true,
  decision_valid: true,
});
assert("inline runner-up family", !!inline.recommendation_decision_runner_up_product_family);

console.log("\nDomain gate");
assert("commercial allowed", isAlternativeAnalyticsDomainAllowed({ commercialPermission: COMMERCIAL_PERMISSION.ALLOW }));
assert("social denied", !isAlternativeAnalyticsDomainAllowed({ interactionMode: MIA_INTERACTION_MODES.SOCIAL }));

console.log("\nHooks");
const chat = readFileSync(CHAT_API, "utf8");
const miaChat = readFileSync(MIA_CHAT, "utf8");
assert("alternative analytics lib used via classifier", chat.includes("buildRunnerUpAlternativeDecisionEnrichment") || chat.includes("lastRecommendationDecisionRunnerUpFamily"));
assert("session runner-up family", chat.includes("lastRecommendationDecisionRunnerUpFamily"));
assert("frontend runner-up context", miaChat.includes("runner_up_product_family"));

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const content = readFileSync(join(ROOT, "docs/analytics/sql", file), "utf8");
  assert(`${file} exists`, content.includes("9.4") || content.includes("runner_up"));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
