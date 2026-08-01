#!/usr/bin/env node
/** PATCH 5.6 — Conversational observability unit tests */
import { strict as assert } from "node:assert";
import {
  CONVERSATIONAL_OBSERVABILITY_VERSION,
  VARIATION_CLASS,
  QUALITY_SIGNAL,
  buildSemanticVerbalFingerprint,
  measureVerbalizationQuality,
  measurePersonalityConsistency,
  classifyVerbalizationVariation,
  evaluateSemanticStability,
  buildConversationalObservabilityReport,
  conversationalObservabilityToTrace,
  isConversationalObservabilityEnabled,
} from "../lib/miaConversationalObservability.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import { RESPONSE_DEPTH } from "../lib/miaHumanConversationExperience.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}:`, err.message);
  }
}

console.log("PATCH 5.6 conversational observability tests\n");

test("observability version", () => {
  assert.equal(CONVERSATIONAL_OBSERVABILITY_VERSION, "5.6.0");
});

test("semantic fingerprint greeting", () => {
  assert.equal(buildSemanticVerbalFingerprint("Opa!"), "greeting");
});

test("semantic fingerprint gratitude", () => {
  assert.equal(buildSemanticVerbalFingerprint("Valeu demais!"), "gratitude");
});

test("semantic fingerprint commercial", () => {
  assert.equal(
    buildSemanticVerbalFingerprint("Recomendo o Galaxy A55 por equilíbrio.", {
      interactionMode: MIA_INTERACTION_MODES.COMMERCE,
    }),
    "commercial"
  );
});

test("measureVerbalizationQuality returns metrics", () => {
  const q = measureVerbalizationQuality("Opa! Tudo certo por aqui.", {
    behaviorContract: {
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      responseDepth: RESPONSE_DEPTH.BRIEF,
    },
  });
  assert.ok(q.metrics.naturalness >= 0 && q.metrics.naturalness <= 1);
  assert.ok(q.overall >= 0 && q.overall <= 1);
  assert.ok(Array.isArray(q.signals));
});

test("detects institutional tone", () => {
  const q = measureVerbalizationQuality("Sou uma assistente virtual. Como posso ajudar?", {
    behaviorContract: { interactionMode: MIA_INTERACTION_MODES.SOCIAL, responseDepth: RESPONSE_DEPTH.BRIEF },
  });
  assert.ok(q.signals.includes(QUALITY_SIGNAL.INSTITUTIONAL));
});

test("measurePersonalityConsistency", () => {
  const p = measurePersonalityConsistency("Opa! Fico feliz em ajudar.", {
    behaviorContract: { interactionMode: MIA_INTERACTION_MODES.SOCIAL },
  });
  assert.ok(p.consistency >= 0 && p.consistency <= 1);
  assert.ok(p.proximity >= 0);
});

test("classify exact match as style_only", () => {
  const c = classifyVerbalizationVariation("Opa!", "Opa!", {});
  assert.equal(c.classification, VARIATION_CLASS.STYLE_ONLY);
});

test("classify same family as semantically_equivalent", () => {
  const c = classifyVerbalizationVariation("Opa! Tudo bem?", "Opa, como vai?", {
    interactionMode: MIA_INTERACTION_MODES.SOCIAL,
  });
  assert.ok(
    c.classification === VARIATION_CLASS.SEMANTICALLY_EQUIVALENT ||
      c.classification === VARIATION_CLASS.STYLE_ONLY
  );
});

test("classify commercial shift as regression", () => {
  const c = classifyVerbalizationVariation(
    "Eu iria no Galaxy A55 por equilíbrio.",
    "Valeu! Imagina.",
    { interactionMode: MIA_INTERACTION_MODES.COMMERCE }
  );
  assert.equal(c.classification, VARIATION_CLASS.REGRESSION);
});

test("evaluateSemanticStability acceptable pool", () => {
  const runs = [
    { reply: "Opa!" },
    { reply: "Opa, tudo bem?" },
    { reply: "Oi!" },
    { reply: "E aí!" },
  ];
  const s = evaluateSemanticStability(runs, { interactionMode: MIA_INTERACTION_MODES.SOCIAL });
  assert.equal(s.regressionCount, 0);
  assert.equal(s.acceptable, true);
});

test("buildConversationalObservabilityReport shape", () => {
  const report = buildConversationalObservabilityReport({
    userMessage: "Linda",
    reply: "Obrigada! Sobre o quê você está falando?",
    responsePath: "governed_social_intent_flow",
    intentRecognition: { interactionMode: MIA_INTERACTION_MODES.SOCIAL, primaryIntent: "compliment" },
    behaviorContract: { interactionMode: MIA_INTERACTION_MODES.SOCIAL, responseDepth: RESPONSE_DEPTH.BRIEF },
  });
  assert.equal(report.version, "5.6.0");
  assert.ok(report.quality);
  assert.ok(report.personality);
  assert.ok(report.pipeline);
});

test("conversationalObservabilityToTrace compact", () => {
  const report = buildConversationalObservabilityReport({
    userMessage: "Oi",
    reply: "Opa!",
    responsePath: "greeting_flow",
    behaviorContract: { interactionMode: MIA_INTERACTION_MODES.SOCIAL },
  });
  const trace = conversationalObservabilityToTrace(report);
  assert.ok(trace.overallQuality != null);
  assert.ok(trace.qualityMetrics);
  assert.ok(!trace.qualityMetrics.naturalness || trace.qualityMetrics.naturalness <= 1);
});

test("isConversationalObservabilityEnabled respects env", () => {
  const prev = process.env.MIA_DEBUG;
  process.env.MIA_DEBUG = "true";
  assert.equal(isConversationalObservabilityEnabled(), true);
  process.env.MIA_DEBUG = prev;
});

console.log(`\nResultado: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
