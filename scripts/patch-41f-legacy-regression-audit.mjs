#!/usr/bin/env node
/**
 * PATCH 4.1F — Legacy regression audit (3.5b + conversation-polish)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFirstAnswerStructuredReply,
  matchesStrictFirstAnswerContract,
} from "../lib/miaFirstAnswerResponseContract.js";
import { matchesPolishedFirstAnswerOpening } from "../lib/miaConversationPolish.js";
import { VERBALIZER_HUMANIZATION_VERSION } from "../lib/miaVerbalizerHumanization.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const EVIDENCE = path.join(
  ROOT,
  "docs/conversational/audits/phase-4/evidence/PATCH_4_1F_LEGACY_REGRESSION_EVIDENCE.json"
);

const LEGACY_SUITES = [
  {
    id: "patch-35b",
    script: "test-mia-patch-35b-verbalizer-humanization-audit.js",
    focus: "verbalizer humanization + version contract",
  },
  {
    id: "conversation-polish",
    script: "test-mia-conversation-polish.js",
    focus: "strict first-answer contract + polish",
  },
];

function runSuite(script) {
  const started = Date.now();
  try {
    const output = execSync(`node scripts/${script}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      pass: true,
      duration_ms: Date.now() - started,
      output_tail: output.split("\n").slice(-12).join("\n"),
    };
  } catch (error) {
    const stdout = error.stdout?.toString?.() || "";
    const stderr = error.stderr?.toString?.() || "";
    return {
      pass: false,
      duration_ms: Date.now() - started,
      output_tail: `${stdout}\n${stderr}`.split("\n").slice(-20).join("\n"),
      exit_code: error.status ?? 1,
    };
  }
}

const fa = buildFirstAnswerStructuredReply({
  winnerName: "Galaxy A55",
  query: "celular até 2500",
  gains: ["Boa bateria para o dia a dia.", "Tela forte na faixa."],
  sacrifices: ["Desempenho não é foco para jogos pesados."],
});

const forensic = {
  patch_35b: {
    expected_version: "3.5b.1",
    actual_version: VERBALIZER_HUMANIZATION_VERSION,
    classification: VERBALIZER_HUMANIZATION_VERSION === "3.5b.1" ? "Tipo 2 — Teste obsoleto" : "Tipo 1 — Regressão real",
    rationale:
      "3.5b.1 é a versão vigente em lib/miaVerbalizerHumanization.js; o teste ainda exigia 3.5b.0 congelado.",
  },
  conversation_polish: {
    polished_opening: matchesPolishedFirstAnswerOpening(fa),
    strict_contract: matchesStrictFirstAnswerContract(fa, "Galaxy A55"),
    sample_output: fa,
    classification: "Tipo 1 — Regressão real + Tipo 3 — Contrato inconsistente",
    root_causes: [
      "surfaceRewriteFragment aplicava linguagem de ganho em itens de sacrifício",
      "matchesStrictFirstAnswerContract ainda exigia 'Mesmo com' após evolução para 'Mesmo considerando que'",
    ],
    fixes: [
      "Sacrifícios permanecem sanitizados sem surfaceRewriteFragment de ganho",
      "Contrato strict passou a aceitar variantes de closing do Composition Guard",
      "isFalseSacrificeText bloqueia linguagem de ganho na seção de sacrifício",
    ],
  },
};

console.log("\nPATCH 4.1F — Legacy regression audit\n");

const suiteResults = LEGACY_SUITES.map((suite) => {
  const result = runSuite(suite.script);
  console.log(`${result.pass ? "PASS" : "FAIL"} — ${suite.id}`);
  return { ...suite, ...result };
});

const passed = suiteResults.filter((entry) => entry.pass).length;
const evidence = {
  patch: "4.1F",
  phase: "legacy_regression_audit",
  status: passed === suiteResults.length ? "APPROVED" : "REJECTED",
  finished_at: new Date().toISOString(),
  forensic,
  suites: suiteResults,
  summary: {
    total: suiteResults.length,
    passed,
    failed: suiteResults.length - passed,
  },
};

fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));

console.log(`\nLegacy audit: ${passed}/${suiteResults.length} suites passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(passed === suiteResults.length ? 0 : 1);
