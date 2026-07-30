/**
 * PATCH 4.1I.2 — Social Verbalization Bridge Audit
 *
 * Rodar: node scripts/test-mia-patch-41i2-social-verbalization-bridge-audit.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import {
  buildSocialConversationBehaviorContract,
  buildFullHumanConversationInstructions,
} from "../lib/miaSocialConversationBehavior.js";
import {
  socialVerbalizationBridgeToInstructions,
  socialVerbalizationBridgeToTrace,
  validateSocialTaxonomyInPrompt,
  SOCIAL_VERBALIZATION_BRIDGE_VERSION,
} from "../lib/miaSocialVerbalizationBridge.js";
import { SOCIAL_INTENT_FAMILIES } from "../lib/miaSocialIntentTaxonomy.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function expectIncludes(haystack, needle, label = "") {
  if (!String(haystack || "").includes(needle)) {
    throw new Error(`Expected prompt to include "${needle}"${label ? ` [${label}]` : ""}`);
  }
}

function buildPipeline(message) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: {},
    signals: {},
    hasActiveAnchor: false,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: false,
    sessionContext: {},
  });
  const contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: [],
  });
  const bridgeOnly = socialVerbalizationBridgeToInstructions(contract);
  const fullInstructions = buildFullHumanConversationInstructions(contract);
  const trace = socialVerbalizationBridgeToTrace(contract);
  const validation = validateSocialTaxonomyInPrompt(fullInstructions, contract);

  return {
    recognition,
    contract,
    bridgeOnly,
    fullInstructions,
    trace,
    validation,
  };
}

console.log("\nPATCH 4.1I.2 — Social Verbalization Bridge Audit\n");

test("Bridge version exported", () => {
  expectTrue(SOCIAL_VERBALIZATION_BRIDGE_VERSION === "4.1I.2");
});

test("Bridge returns empty when no primarySocialIntent", () => {
  const out = socialVerbalizationBridgeToInstructions({});
  expectTrue(out === "");
});

const mandatoryCases = [
  { message: "Linda", family: SOCIAL_INTENT_FAMILIES.COMPLIMENT, behavior: "receive_compliment" },
  {
    message: "Você é muito inteligente",
    family: SOCIAL_INTENT_FAMILIES.COMPLIMENT,
    behavior: "receive_compliment",
  },
  { message: "Era ironia", family: SOCIAL_INTENT_FAMILIES.IRONY, behavior: "play_humor" },
  {
    message: "Só queria conversar",
    family: SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST,
    behavior: "stay_social",
  },
  {
    message: "Você me ajudou muito",
    family: SOCIAL_INTENT_FAMILIES.PRAISE,
    behavior: "receive_compliment",
  },
];

console.log("\nCasos obrigatórios — taxonomia → bridge → prompt\n");

for (const scenario of mandatoryCases) {
  test(`"${scenario.message}" — taxonomia produz ${scenario.family}`, () => {
    const pipe = buildPipeline(scenario.message);
    expectTrue(pipe.recognition.primarySocialIntent === scenario.family);
    expectTrue(pipe.recognition.expectedHumanBehavior === scenario.behavior);
  });

  test(`"${scenario.message}" — bridge inclui família e comportamento`, () => {
    const pipe = buildPipeline(scenario.message);
    expectIncludes(pipe.bridgeOnly, scenario.family, "primarySocialIntent");
    expectIncludes(pipe.bridgeOnly, scenario.behavior, "expectedHumanBehavior");
    expectIncludes(pipe.bridgeOnly, SOCIAL_VERBALIZATION_BRIDGE_VERSION, "bridge version");
  });

  test(`"${scenario.message}" — prompt final valida taxonomia`, () => {
    const pipe = buildPipeline(scenario.message);
    expectTrue(pipe.validation.valid, `missing: ${pipe.validation.missing.join(", ")}`);
    expectIncludes(pipe.fullInstructions, scenario.family, "full prompt");
    expectIncludes(pipe.fullInstructions, pipe.recognition.conversationObjective, "objective");
    expectIncludes(pipe.fullInstructions, pipe.recognition.conversationDirection, "direction");
    expectIncludes(pipe.fullInstructions, pipe.recognition.emotionalState, "emotionalState");
  });

  test(`"${scenario.message}" — trace confirma instructionsPresent`, () => {
    const pipe = buildPipeline(scenario.message);
    expectTrue(pipe.trace?.instructionsPresent === true);
    expectTrue(pipe.trace?.primarySocialIntent === scenario.family);
  });
}

test("buildFullHumanConversationInstructions coloca bridge antes do comportamento", () => {
  const pipe = buildPipeline("Linda");
  const idxBridge = pipe.fullInstructions.indexOf("Taxonomia social governada");
  const idxBehavior = pipe.fullInstructions.indexOf("Comportamento governado");
  expectTrue(idxBridge >= 0 && idxBehavior > idxBridge);
});

test("Contrato enriquecido com socialVerbalizationBridgeVersion", () => {
  const pipe = buildPipeline("Opa");
  expectTrue(pipe.contract.socialVerbalizationBridgeVersion === "4.1I.2");
});

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.error("Failures:", failures);
  process.exit(1);
}

process.exit(0);
