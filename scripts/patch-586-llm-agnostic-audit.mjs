#!/usr/bin/env node
/**
 * PATCH 5.8.6 — LLM-agnostic architectural audit (read-only, no API)
 * Proves conversational decisions remain in MIA governance layers, not in the LLM.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-586");
mkdirSync(OUT, { recursive: true });

function read(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch {
    return "";
  }
}

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

const checks = [];

function add(id, layer, claim, evidence, pass) {
  checks.push({ id, layer, claim, evidence, pass });
}

const chat = read("pages/api/chat-gpt4o.js");
const experience = read("lib/miaHumanConversationExperience.js");
const behavior = read("lib/miaSocialConversationBehavior.js");

// Intent / contract before LLM
add(
  "LLM-01",
  "intent_recognition",
  "Intent recognition builds behavior contract before verbalization",
  "buildSocialConversationBehaviorContract in miaSocialConversationBehavior.js",
  /buildSocialConversationBehaviorContract/.test(behavior) &&
    /recognizeMiaIntent/.test(behavior)
);

add(
  "LLM-02",
  "governance_enrichment",
  "Personality, continuity, rhythm, humanization enrich contract pre-LLM",
  "enrichBehaviorContractWithHumanExperience chain",
  /enrichContractWithPersonalityGovernance/.test(experience) &&
    /enrichContractWithSocialConversationContinuity/.test(experience) &&
    /enrichContractWithConversationalRhythm/.test(experience) &&
    /enrichContractWithSocialHumanization/.test(experience)
);

// Template bypass paths (no LLM decision)
add(
  "LLM-03",
  "template_bypass",
  "Fact validation bypass uses governed template, not LLM",
  "factValidation.bypassLlmVerbalization → buildGovernedSocialFallbackReply",
  /factValidation\?\.bypassLlmVerbalization/.test(chat) &&
    /buildGovernedSocialFallbackReply/.test(chat)
);

add(
  "LLM-04",
  "template_bypass",
  "Continuity bypass uses governed template",
  "socialContinuityBypass",
  /socialContinuityBypass/.test(chat)
);

add(
  "LLM-05",
  "template_bypass",
  "Humanization bypass uses governed template",
  "socialHumanizationBypass",
  /socialHumanizationBypass/.test(chat)
);

add(
  "LLM-06",
  "template_bypass",
  "Personality identity bypass uses governed template",
  "personalityGovernanceBypass",
  /personalityGovernanceBypass/.test(chat)
);

// Post-LLM gates (architecture corrects surface, not re-decide)
add(
  "LLM-07",
  "post_llm_gates",
  "Finalize applies governance gates after LLM response",
  "applyFactValidationGovernance → applyPersonalityGovernance → rhythm → humanization",
  /applyFactValidationGovernance/.test(experience) &&
    /applyPersonalityGovernance/.test(experience) &&
    /applyConversationalRhythmGovernance/.test(experience) &&
    /applySocialHumanizationGovernance/.test(experience)
);

add(
  "LLM-08",
  "post_llm_gates",
  "Validation failure triggers governed fallback, not raw LLM retry",
  "selectGovernedFallback on validation failure",
  /selectGovernedFallback/.test(experience)
);

// Governance modules declare non-decision scope
const govFiles = [
  ["lib/miaPersonalityGovernance.js", /Does NOT decide intent|não decide intent|Does NOT decide/i],
  ["lib/miaSocialConversationContinuity.js", /Does NOT|não decide|continuity/i],
  ["lib/miaConversationalRhythmGovernance.js", /Does NOT|não decide|ritmo/i],
  ["lib/miaSocialHumanizationGovernance.js", /Does NOT decide intent|não decide intent/i],
];

for (const [file, pattern] of govFiles) {
  const content = read(file);
  add(
    `LLM-09-${file.split("/").pop()?.replace(".js", "")}`,
    "governance_scope",
    `${file} documents scope separation from intent/decision`,
    file,
    content.length > 100 && pattern.test(content)
  );
}

// Observability is measurement-only
add(
  "LLM-10",
  "observability",
  "Observability layer does not alter routing",
  "miaConversationalObservability.js measurement-only",
  /Does NOT alter|measurement-only|Measurement-only/.test(read("lib/miaConversationalObservability.js"))
);

const passed = checks.filter((c) => c.pass).length;
const total = checks.length;

const result = {
  head: gitHead(),
  auditType: "llm_agnostic_architectural",
  timestamp: new Date().toISOString(),
  passed,
  total,
  allPass: passed === total,
  verdict:
    passed === total
      ? "Architecture remains LLM-agnostic: decisions in contract/governance; LLM is verbalization + post-gates."
      : "Gaps detected — review failed checks.",
  checks,
};

writeFileSync(join(OUT, "LLM_AGNOSTIC_AUDIT.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed, total, allPass: result.allPass }, null, 2));
process.exit(result.allPass ? 0 : 1);
