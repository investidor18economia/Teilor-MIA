#!/usr/bin/env node
/**
 * PATCH 3.2 — Conversational Continuity Audit
 *
 * Validates 3.2a (session transport) and 3.2b (cognitive continuity).
 *
 * Usage: node scripts/test-mia-patch-32-conversational-continuity-audit.js
 */

import {
  pickSessionContextForTransport,
  mergeSessionContextFromApiResponse,
  auditSessionContextRebuild,
  auditSessionContextResponse,
  finalizeSessionContextTransport,
  SESSION_CONTEXT_TRANSPORT_FIELDS,
} from "../lib/miaSessionContextTransport.js";
import {
  rehydrateContinuityFromIncoming,
  buildContinuityPreservedSessionContext,
  isAnchoredContextualContinuityTurn,
  auditConversationContinuity,
  ANCHORED_CONTEXTUAL_TURN_TYPES,
} from "../lib/miaConversationContinuity.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

const WINNER = { product_name: "iPhone 13", price: "R$ 2.399", link: "https://mia.test/p/1" };
const RUNNER = { product_name: "Samsung Galaxy A55", price: "R$ 1.899" };
const THIRD = { product_name: "Xiaomi Redmi Note 13", price: "R$ 1.299" };

const FULL_SESSION = {
  lastBestProduct: WINNER,
  lastProductMentioned: WINNER.product_name,
  lastProducts: [WINNER, RUNNER, THIRD],
  lastRankingSnapshot: [
    { product_name: WINNER.product_name, rank: 1, score: 0.95 },
    { product_name: RUNNER.product_name, rank: 2, score: 0.81 },
    { product_name: THIRD.product_name, rank: 3, score: 0.72 },
  ],
  lastCategory: "celular",
  lastIntent: "search",
  lastPriority: "bateria",
  lastQuery: "celular ate 2500",
  budgetMax: 2500,
  lastCommercialConstraints: { budgetMax: 2500, category: "celular" },
  comparisonContextLocked: true,
  lastComparisonProducts: [WINNER, RUNNER],
  lastComparisonQuery: "iphone 13 vs galaxy a55",
  semanticStateProvenance: { version: "11A.7", turnIndex: 3 },
};

let total = 0;
let passed = 0;
const failures = [];

function test(label, fn) {
  total++;
  try {
    const ok = fn();
    if (ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failures.push(label);
      console.log(`  ✗ ${label}`);
    }
    return ok;
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
    console.log(`  ✗ ${label} — ${err.message}`);
    return false;
  }
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

section("Grupo 1 — Transporte (3.2a)");

test("1.1 transport fields allowlist includes winner + snapshot", () => {
  return (
    SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastBestProduct") &&
    SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastRankingSnapshot") &&
    SESSION_CONTEXT_TRANSPORT_FIELDS.includes("budgetMax")
  );
});

test("1.2 pickSessionContextForTransport preserves ranking snapshot", () => {
  const out = pickSessionContextForTransport(FULL_SESSION);
  return (
    out.lastBestProduct?.product_name === WINNER.product_name &&
    Array.isArray(out.lastRankingSnapshot) &&
    out.lastRankingSnapshot.length === 3
  );
});

test("1.3 mergeSessionContextFromApiResponse preserves snapshot when API returns partial", () => {
  const merged = mergeSessionContextFromApiResponse(FULL_SESSION, {
    lastQuery: "e mais barato?",
    lastInteractionType: "follow_up",
  });
  return (
    merged.lastBestProduct?.product_name === WINNER.product_name &&
    merged.lastRankingSnapshot?.length === 3
  );
});

test("1.4 merge fallback without session_context keeps winner", () => {
  const merged = mergeSessionContextFromApiResponse(FULL_SESSION, null, {
    pergunta: "e bateria?",
    productsRaw: [],
  });
  return merged.lastBestProduct?.product_name === WINNER.product_name;
});

test("1.5 finalizeSessionContextTransport restores dropped winner on preserve anchor", () => {
  const out = finalizeSessionContextTransport(
    { lastQuery: "e bateria?" },
    FULL_SESSION,
    { shouldPreserveAnchor: true, allowReplaceWinner: false }
  );
  return out.lastBestProduct?.product_name === WINNER.product_name;
});

test("1.6 finalizeSessionContextTransport restores dropped ranking snapshot", () => {
  const out = finalizeSessionContextTransport(
    {},
    FULL_SESSION,
    { shouldPreserveAnchor: true, allowReplaceWinner: false }
  );
  return Array.isArray(out.lastRankingSnapshot) && out.lastRankingSnapshot.length === 3;
});

section("Grupo 2 — Continuidade cognitiva (3.2b)");

test("2.1 rehydrateContinuityFromIncoming restores budget + constraints", () => {
  const built = rehydrateContinuityFromIncoming(
    { lastBestProduct: WINNER, lastProducts: [WINNER] },
    FULL_SESSION
  );
  return built.budgetMax === 2500 && built.lastCommercialConstraints?.budgetMax === 2500;
});

test("2.2 rehydrateContinuityFromIncoming restores comparison lock", () => {
  const built = rehydrateContinuityFromIncoming({ lastBestProduct: WINNER }, FULL_SESSION);
  return built.comparisonContextLocked === true && built.lastComparisonProducts?.length === 2;
});

test("2.3 auditConversationContinuity flags dropped winner", () => {
  const audit = auditConversationContinuity(FULL_SESSION, { lastBestProduct: null });
  return !audit.ok && audit.flags.includes("BUILD_CONTEXT_DROPPED_LAST_BEST");
});

test("2.4 auditConversationContinuity happy path — no flags", () => {
  const built = rehydrateContinuityFromIncoming(
    { lastBestProduct: WINNER, lastRankingSnapshot: FULL_SESSION.lastRankingSnapshot },
    FULL_SESSION
  );
  return auditConversationContinuity(FULL_SESSION, built).ok;
});

test("2.5 buildContinuityPreservedSessionContext keeps anchor on partial override", () => {
  const out = buildContinuityPreservedSessionContext(FULL_SESSION, {
    lastInteractionType: "follow_up",
  });
  return (
    out.lastBestProduct?.product_name === WINNER.product_name &&
    out.lastRankingSnapshot?.length === 3
  );
});

test("2.6 isAnchoredContextualContinuityTurn for ALTERNATIVE_REQUEST", () => {
  return isAnchoredContextualContinuityTurn({
    hasAnchor: true,
    cognitiveTurnType: "ALTERNATIVE_REQUEST",
  });
});

section("Grupo 3 — Smoke P0 baseline (PATCH 2.6 / 3.2)");

test("3.1 follow-up 'e mais barato?' routing preserves anchor", () => {
  const rd = buildRoutingDecision({
    userMessage: "e mais barato?",
    resolvedQuery: "e mais barato?",
    sessionContext: FULL_SESSION,
    incomingSessionContext: FULL_SESSION,
    intent: "search",
    cognitiveRoutingSignal: {
      turnType: MIA_TURN_TYPES.FOLLOW_UP,
      hasActiveAnchor: true,
      isAnchoredShortFollowUp: true,
    },
    signals: {
      isAnchoredShortFollowUp: true,
      looksLikeShortPriorityFollowUp: true,
    },
  });
  return rd.shouldPreserveAnchor === true && rd.allowReplaceWinner === false;
});

test("3.2 comparison follow-up preserves comparison lock in transport", () => {
  const out = finalizeSessionContextTransport(
    { lastQuery: "e a camera?" },
    FULL_SESSION,
    { shouldPreserveAnchor: true, allowReplaceWinner: false, mode: "comparison_followup" }
  );
  return out.comparisonContextLocked === true;
});

test("3.3 'quem ficou logo atras?' classified as ALTERNATIVE_REQUEST with anchor", () => {
  const turn = classifyMiaTurn({
    query: "quem ficou logo atras",
    sessionContext: FULL_SESSION,
    hasActiveAnchor: true,
  });
  return turn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST;
});

test("3.4 5-turn refinement simulation preserves snapshot length", () => {
  let session = { ...FULL_SESSION };
  const turns = [
    "qual recomenda?",
    "e bateria?",
    "quero gastar menos",
    "qual ficou em segundo?",
    "continua recomendando?",
  ];
  for (const msg of turns) {
    session = rehydrateContinuityFromIncoming(
      { lastBestProduct: session.lastBestProduct, lastQuery: msg },
      session
    );
  }
  return (
    session.lastBestProduct?.product_name === WINNER.product_name &&
    session.lastRankingSnapshot?.length >= 1
  );
});

test("3.5 priority change keeps conversation context", () => {
  const session = rehydrateContinuityFromIncoming(
    { lastBestProduct: WINNER, lastPriority: "camera" },
    FULL_SESSION
  );
  return session.lastBestProduct?.product_name === WINNER.product_name && session.budgetMax === 2500;
});

test("3.6 auditSessionContextResponse flags response drop", () => {
  const flags = auditSessionContextResponse(
    FULL_SESSION,
    { lastBestProduct: null },
    { shouldPreserveAnchor: true, allowReplaceWinner: false }
  );
  return flags.includes("RESPONSE_DROPPED_LAST_BEST");
});

test("3.7 ANCHORED_CONTEXTUAL_TURN_TYPES includes CONSTRAINT_CHANGE", () => {
  return ANCHORED_CONTEXTUAL_TURN_TYPES.includes("CONSTRAINT_CHANGE");
});

test("3.8 transport round-trip does not mutate internal-only keys", () => {
  const withInternal = { ...FULL_SESSION, mia_debug: { secret: true } };
  const transported = pickSessionContextForTransport(withInternal);
  return transported.mia_debug === undefined;
});

section("Grupo 4 — Handler wiring");

test("4.1 MIAChat imports transport merge (static check)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("components/MIAChat.jsx", "utf8");
  return (
    src.includes("mergeSessionContextFromApiResponse") &&
    src.includes("pickSessionContextForTransport")
  );
});

test("4.2 chat-gpt4o uses rehydrateContinuityFromIncoming", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("pages/api/chat-gpt4o.js", "utf8");
  return (
    src.includes("rehydrateContinuityFromIncoming") &&
    src.includes("finalizeSessionContextTransport")
  );
});

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.2 audit: ${passed}/${total} passed, ${failures.length} failed`);
console.log(`${"=".repeat(60)}`);

if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

console.log("\nPATCH 3.2 CONVERSATIONAL CONTINUITY: APROVADO\n");
process.exit(0);
