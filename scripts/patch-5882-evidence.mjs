#!/usr/bin/env node
/**
 * PATCH 5.8.8.2 — Evidence + local validation runner
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-5882");
mkdirSync(OUT, { recursive: true });

function run(cmd, label) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    return { pass: true, label, output: out.slice(-400) };
  } catch (err) {
    return { pass: false, label, error: String(err.stderr || err.message).slice(0, 800) };
  }
}

const pipelineIdentityAudit = {
  patch: "5.8.8.2",
  timestamp: new Date().toISOString(),
  stages: [
    {
      stage: "classifyIdentityQuery",
      receivesIdentity: true,
      losesIdentity: false,
      replacesIdentity: false,
      notes: "Primary taxonomy patterns; returns GENERAL when unmatched (not null).",
    },
    {
      stage: "classifyIdentityQuerySupplement",
      receivesIdentity: true,
      losesIdentity: false,
      replacesIdentity: false,
      notes: "Covers colloquial/meta variants (humana, LLM, stack, especialidade, só um robô).",
    },
    {
      stage: "resolveIdentityQueryKind",
      receivesIdentity: true,
      losesIdentity: "FIXED: now merges primary + supplement + about_mia intent",
      replacesIdentity: false,
      notes: "Single resolver used by personality + identity presence layers.",
    },
    {
      stage: "resolveCentralPersonalityPolicy",
      receivesIdentity: true,
      losesIdentity: "FIXED: uses resolveIdentityQueryKind instead of classifyIdentityQuery only",
      replacesIdentity: false,
    },
    {
      stage: "propagateIdentityQueryContractFields",
      receivesIdentity: true,
      losesIdentity: false,
      replacesIdentity: false,
      notes: "Syncs identityQueryKind, identityMode, expectedHumanBehavior=ANSWER_META.",
    },
    {
      stage: "miaPersonalityGovernance / buildPersonalityGovernedStaySocialReply",
      receivesIdentity: true,
      losesIdentity: "FIXED: redirects to buildGovernedIdentityReply when identityQueryKind set",
      replacesIdentity: "FIXED: no longer emits generic stay_social for meta queries",
    },
    {
      stage: "miaConversationalIdentityPresenceGovernance",
      receivesIdentity: true,
      losesIdentity: "FIXED: removed bypass skip when personalityGovernanceBypass && identity",
      replacesIdentity: "FIXED: detects identity_query_replaced_by_stay_social",
    },
    {
      stage: "miaSocialContractVerbalization",
      receivesIdentity: true,
      losesIdentity: "FIXED: early guard routes identity before stay_social template",
      replacesIdentity: false,
    },
    {
      stage: "finalizeHumanConversationReply",
      receivesIdentity: true,
      losesIdentity: false,
      replacesIdentity: "identity + warmth gates reapply when cold/generic detected",
    },
    {
      stage: "egress",
      receivesIdentity: true,
      losesIdentity: false,
      replacesIdentity: false,
      notes: "No new egress path; same governed finalizer output.",
    },
  ],
};

const pipelineWarmthAudit = {
  patch: "5.8.8.2",
  timestamp: new Date().toISOString(),
  stages: [
    {
      stage: "resolveHumanWarmthPresence",
      receivesWarmth: true,
      losesWarmth: false,
      notes: "Derives responseMoment from intent (greeting, gratitude, empathy, reciprocal).",
    },
    {
      stage: "measureResponseWarmthPresence",
      receivesWarmth: true,
      losesWarmth: false,
      notes: "Detects cold ack, cold gratitude (De nada/Por nada), micro_confirm without markers.",
    },
    {
      stage: "applyHumanWarmthPresenceGovernance",
      receivesWarmth: true,
      losesWarmth: false,
      replacesWithCold: "FIXED: replaces functionally cold LLM/template seeds with governed warm pools",
    },
    {
      stage: "applySocialHumanizationGovernance",
      receivesWarmth: true,
      losesWarmth: false,
      notes: "Gratitude_with_presence, comfort_without_therapy unchanged structurally.",
    },
    {
      stage: "finalizeHumanConversationReply gates",
      receivesWarmth: true,
      losesWarmth: "FIXED: warmth gate runs after tone guard; no architectural strip of presence",
      whoOverrides: "Only when validation fails (forbidden patterns), not for identity/warmth policy",
    },
  ],
};

writeFileSync(join(OUT, "PIPELINE_IDENTITY_AUDIT.json"), JSON.stringify(pipelineIdentityAudit, null, 2));
writeFileSync(join(OUT, "PIPELINE_WARMTH_AUDIT.json"), JSON.stringify(pipelineWarmthAudit, null, 2));

writeFileSync(
  join(OUT, "ROOT_CAUSE.json"),
  JSON.stringify(
    {
      patch: "5.8.8.2",
      confirmed: true,
      rootCauses: [
        "resolveCentralPersonalityPolicy used classifyIdentityQuery only — supplement variants lost before contract enrichment",
        "enrichContractWithConversationalIdentityPresence set identityQueryKind but did not sync expectedHumanBehavior to ANSWER_META",
        "applyConversationalIdentityPresenceGovernance skipped correction when personalityGovernanceBypass && identityQueryKind",
        "buildPersonalityGovernedStaySocialReply and stay_social verbalization took precedence over identity for meta queries",
        "GENERIC_STAY_SOCIAL patterns did not flag 'Fico por aqui — o que você quer conversar?' as identity bleed",
        "Human warmth gate did not treat bare De nada/Por nada as cold gratitude responses",
      ],
      scope: "Classes B and F only — no Decision Engine / ranking / commercial changes",
    },
    null,
    2
  )
);

writeFileSync(
  join(OUT, "FIX_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "5.8.8.2",
      files: [
        "lib/miaPersonalityGovernance.js",
        "lib/miaConversationalIdentityPresenceGovernance.js",
        "lib/miaSocialContractVerbalization.js",
        "lib/miaHumanWarmthPresenceGovernance.js",
        "lib/miaHumanConversationExperience.js",
        "scripts/test-mia-patch-5882-identity-warmth.js",
      ],
      structuralFixes: [
        "resolveIdentityQueryKind unified resolver exported",
        "propagateIdentityQueryContractFields syncs contract semantics",
        "stay_social paths redirect to identity reply when identityQueryKind present",
        "identity presence finalizer no longer bypasses on personalityGovernanceBypass",
        "cold gratitude detection extended to Por nada",
        "IDENTITY_AI_NATURE accepts só/apenas/mesmo modifiers",
      ],
    },
    null,
    2
  )
);

const directed = run("node scripts/test-mia-patch-5882-identity-warmth.js", "directed-5882");
const humanPresence = run("node scripts/test-mia-patch-588-human-presence.js", "588-human-presence");
const regression = run("node scripts/patch-588-regression-runner.mjs", "regression");

writeFileSync(
  join(OUT, "REGRESSION_RESULTS.json"),
  JSON.stringify({ patch: "5.8.8.2", directed, humanPresence, regression, timestamp: new Date().toISOString() }, null, 2)
);

const builds = [];
for (let i = 1; i <= 2; i += 1) {
  builds.push(run("npm run build", `build-${i}`));
}
writeFileSync(join(OUT, "BUILD_RESULTS.json"), JSON.stringify({ builds, allGreen: builds.every((b) => b.pass) }, null, 2));

const allPass = [directed, humanPresence, regression, ...builds].every((r) => r.pass);
console.log(JSON.stringify({ allPass, out: OUT }, null, 2));
process.exit(allPass ? 0 : 1);
