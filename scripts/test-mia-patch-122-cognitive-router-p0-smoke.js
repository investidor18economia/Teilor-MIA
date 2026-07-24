#!/usr/bin/env node
/**
 * PATCH 12.2 — Cognitive Router P0 smoke (deterministic critical paths).
 */
import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

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

console.log("\nPATCH 12.2 — Cognitive Router P0 smoke\n");

const greeting = classifyMiaTurn({ query: "oi, tudo bem?" });
ok("greeting/conversational", [MIA_TURN_TYPES.CONVERSATIONAL, MIA_TURN_TYPES.UNKNOWN].includes(greeting.turnType));
ok("confidence numeric", typeof greeting.confidence === "number");

const search = classifyMiaTurn({ query: "quero um notebook gamer até 5000 reais" });
ok("new search", search.turnType === MIA_TURN_TYPES.NEW_SEARCH);

const compare = classifyMiaTurn({
  query: "qual a diferença entre eles?",
  hasActiveAnchor: true,
  lastBestProduct: { product_name: "Phone A" },
});
ok("comparison follow-up", [MIA_TURN_TYPES.COMPARISON, MIA_TURN_TYPES.COMPARISON_FOLLOWUP, MIA_TURN_TYPES.FOLLOW_UP].includes(compare.turnType));

const alt = classifyMiaTurn({
  query: "tem outra opção?",
  hasActiveAnchor: true,
  lastBestProduct: { product_name: "Phone A" },
});
ok("alternative request family", [MIA_TURN_TYPES.ALTERNATIVE_REQUEST, MIA_TURN_TYPES.REFINEMENT, MIA_TURN_TYPES.FOLLOW_UP].includes(alt.turnType));

const empty = classifyMiaTurn({ query: "   " });
ok("whitespace safe", empty.turnType != null);

const about = classifyMiaTurn({ query: "o que é a MIA?" });
ok("about mia", about.turnType === MIA_TURN_TYPES.ABOUT_MIA);

ok("shadowOnly flag", greeting.shadowOnly === true);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
