/**
 * PATCH 4.1I.2 — Bridge validation with before/after prompt evidence
 *
 * Rodar: node scripts/patch-41i2-bridge-validation.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import {
  buildSocialConversationBehaviorContract,
  buildFullHumanConversationInstructions,
  behaviorContractToVerbalizationInstructions,
} from "../lib/miaSocialConversationBehavior.js";
import { experienceContractToVerbalizationInstructions } from "../lib/miaHumanConversationExperience.js";
import { perceptionContractToVerbalizationInstructions } from "../lib/miaSocialResponsePerception.js";
import {
  socialVerbalizationBridgeToInstructions,
  validateSocialTaxonomyInPrompt,
  SOCIAL_VERBALIZATION_BRIDGE_VERSION,
} from "../lib/miaSocialVerbalizationBridge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(__dirname, "../docs/conversational/audits/phase-4/evidence");

const SCENARIOS = [
  "Linda",
  "Voc\u00ea \u00e9 muito inteligente",
  "Era ironia",
  "S\u00f3 queria conversar",
  "Voc\u00ea me ajudou muito",
];

function buildPromptBeforeBridge(contract) {
  return [
    behaviorContractToVerbalizationInstructions(contract),
    experienceContractToVerbalizationInstructions(contract),
    contract.perceptionVersion ? perceptionContractToVerbalizationInstructions(contract) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function simulateUserPrompt(behaviorInstructions, message) {
  return `
Mensagem do usuário: "${message}"
Instruções para esta resposta social:
${behaviorInstructions}
`.trim();
}

const results = [];

for (const message of SCENARIOS) {
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

  const promptBefore = buildPromptBeforeBridge(contract);
  const bridge = socialVerbalizationBridgeToInstructions(contract);
  const promptAfter = buildFullHumanConversationInstructions(contract);
  const userPromptAfter = simulateUserPrompt(promptAfter, message);
  const validationBefore = validateSocialTaxonomyInPrompt(promptBefore, contract);
  const validationAfter = validateSocialTaxonomyInPrompt(promptAfter, contract);
  const validationLlm = validateSocialTaxonomyInPrompt(userPromptAfter, contract);

  results.push({
    message,
    taxonomy: {
      primarySocialIntent: recognition.primarySocialIntent,
      secondarySocialIntent: recognition.secondarySocialIntent,
      expectedHumanBehavior: recognition.expectedHumanBehavior,
      conversationObjective: recognition.conversationObjective,
      conversationDirection: recognition.conversationDirection,
      emotionalState: recognition.emotionalState,
      socialIntentSignals: recognition.socialIntentSignals,
      socialIntentReasonCodes: recognition.socialIntentReasonCodes,
      socialIntentConfidence: recognition.socialIntentConfidence,
    },
    bridge: {
      version: SOCIAL_VERBALIZATION_BRIDGE_VERSION,
      instructions: bridge,
    },
    promptBefore: {
      hadPrimarySocialIntent: promptBefore.includes(recognition.primarySocialIntent),
      validation: validationBefore,
    },
    promptAfter: {
      hadPrimarySocialIntent: promptAfter.includes(recognition.primarySocialIntent),
      validation: validationAfter,
      excerpt: promptAfter.slice(0, 600),
    },
    llmUserPrompt: {
      validation: validationLlm,
      excerpt: userPromptAfter.slice(0, 800),
    },
    pass: validationAfter.valid && validationLlm.valid,
  });

  const status = results.at(-1).pass ? "✓" : "✗";
  console.log(
    `${status} ${message} → ${recognition.primarySocialIntent} | before=${validationBefore.valid} after=${validationAfter.valid} llm=${validationLlm.valid}`
  );
}

mkdirSync(EVIDENCE_DIR, { recursive: true });
const evidencePath = join(EVIDENCE_DIR, "PATCH_4_1I2_BRIDGE_VALIDATION_EVIDENCE.json");
writeFileSync(evidencePath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log(`\nEvidence: ${evidencePath}`);

const allPass = results.every((r) => r.pass);
console.log(`\n${allPass ? "ALL PASS" : "FAILURES"} (${results.filter((r) => r.pass).length}/${results.length})\n`);
process.exit(allPass ? 0 : 1);
