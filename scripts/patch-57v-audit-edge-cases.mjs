#!/usr/bin/env node
/** PATCH 5.7V — Edge case audit + before/after matrix */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v");
mkdirSync(OUT, { recursive: true });

const before = JSON.parse(
  readFileSync(join(OUT, "LOCAL_FALLBACK_MATRIX_BEFORE_57.json"), "utf8")
);

const { recognizeMiaIntent } = await import(
  new URL("../lib/miaIntentRecognitionLayer.js", import.meta.url).href
);
const { buildSocialConversationBehaviorContract } = await import(
  new URL("../lib/miaSocialConversationBehavior.js", import.meta.url).href
);
const { enrichContractWithSemanticAuthority } = await import(
  new URL("../lib/miaSemanticAuthority.js", import.meta.url).href
);
const { buildIntentAuthorityFromRecognition } = await import(
  new URL("../lib/miaIntentAuthority.js", import.meta.url).href
);
const {
  enrichBehaviorContractWithHumanExperience,
  validateHumanConversationResponse,
} = await import(new URL("../lib/miaHumanConversationExperience.js", import.meta.url).href);
const { selectGovernedFallback } = await import(
  new URL("../lib/miaGovernedFallbackPolicy.js", import.meta.url).href
);

function buildTurn(message, extra = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: extra.sessionContext || {},
    conversationMessages: extra.conversationMessages || [],
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  let contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  contract = enrichContractWithSemanticAuthority(contract, {
    recognition,
    conversationMessages: extra.conversationMessages || [],
    sessionContext: extra.sessionContext || {},
  });
  contract = enrichBehaviorContractWithHumanExperience(contract, {
    recognition,
    authority,
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  contract.userMessageForSpecificity = message;
  return { recognition, contract };
}

function probe(message, extra = {}) {
  const { recognition, contract } = buildTurn(message, extra);
  const selection = selectGovernedFallback(contract, { failureReason: "edge_audit" });
  const validation = validateHumanConversationResponse(selection.text, contract);
  return {
    message,
    primarySocialIntent: recognition.primarySocialIntent,
    interactionMode: recognition.interactionMode,
    expectedHumanBehavior: contract.expectedHumanBehavior,
    target: contract.resolvedSemanticTarget,
    routing: contract.governedSocialRoutingKey,
    reply: selection.text,
    builder: selection.functionName,
    family: selection.family,
    valid: validation.valid,
    violations: validation.violations || [],
  };
}

const invalidBefore = before.results.filter((r) => !r.valid);
const afterRows = invalidBefore.map((row, i) => {
  const extra = {};
  const after = probe(row.message, extra);
  const rootCause =
    row.violations?.includes("specificity_violation") && row.behavior === "stay_social"
      ? "disapproval/approval misclassified + stay_social fallback without echo"
      : row.violations?.includes("specificity_violation")
        ? "mustReferenceUserContent without contextual verbalization"
        : row.violations?.includes("unnecessary_question_violation")
          ? "closureStyle blocked question without clarifying followUp"
          : "commercial_probe_on_social_fallback_path";

  return {
    id: `E${i + 1}`,
    message: row.message,
    before: {
      reply: row.reply,
      violations: row.violations,
      behavior: row.behavior,
      family: row.family,
    },
    after,
    rootCause,
    fixed: after.valid || after.skipped,
  };
});

const rejectionMatrix = [
  "não gostei",
  "não curti",
  "não gostei dessa resposta",
  "não gostei dessa recomendação",
  "esse não me convenceu",
  "não quero esse",
  "achei ruim",
  "ficou péssimo",
  "você errou",
  "não foi isso",
  "prefiro outro",
  "não gostei do jeito que você respondeu",
  "não gostei do produto",
  "não gostei da comparação",
].map((msg) => probe(msg));

writeFileSync(join(OUT, "ROOT_CAUSE_EDGE_CASES.json"), JSON.stringify({ invalidBefore, afterRows }, null, 2));
writeFileSync(join(OUT, "EDGE_CASE_MATRIX_BEFORE.json"), JSON.stringify(invalidBefore, null, 2));
writeFileSync(join(OUT, "EDGE_CASE_MATRIX_AFTER.json"), JSON.stringify(afterRows, null, 2));
writeFileSync(join(OUT, "REJECTION_INTENT_AUDIT.json"), JSON.stringify({ results: rejectionMatrix }, null, 2));

const strict = JSON.parse(
  readFileSync(join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57/LOCAL_FALLBACK_MATRIX.json"), "utf8")
);
execSync("node scripts/patch-57-comprehensive-validation.mjs", { cwd: ROOT, stdio: "inherit" });
const afterAll = JSON.parse(
  readFileSync(join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57/LOCAL_VALIDATION_SUMMARY.json"), "utf8")
);

writeFileSync(
  join(OUT, "FALLBACK_STRICT_VALIDATION.json"),
  JSON.stringify(
    {
      before: strict.summary,
      after: afterAll.fallback,
      socialStrictPass: afterAll.fallback.invalid === 0,
    },
    null,
    2
  )
);

console.log(JSON.stringify({ edgeCasesFixed: afterRows.filter((r) => r.after.valid).length, total: afterRows.length }, null, 2));
