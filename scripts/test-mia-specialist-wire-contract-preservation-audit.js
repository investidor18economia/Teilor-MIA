/**
 * PATCH 9.2Q — Specialist Wire Contract Preservation Audit
 *
 * Usage:
 *   node scripts/test-mia-specialist-wire-contract-preservation-audit.js
 *   MIA_SKIP_NESTED_REGRESSION=1 node scripts/test-mia-specialist-wire-contract-preservation-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { deriveConversationalToneProfile } from "../lib/miaConversationalTone.js";
import { applyToneComplianceGuard } from "../lib/miaToneComplianceGuard.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import { finalizeReplyWithRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import { finalizeReplyWithTradeoffVisualEmphasis } from "../lib/miaTradeoffVisualEmphasisLayer.js";
import {
  finalizeSpecialistPresentationRecovery,
  finalizeSpecialistWireContractPreservation,
  verifySpecialistWireContract,
} from "../lib/miaSpecialistPresentationContract.js";
import { splitAssistantParagraphs } from "../lib/miaFrontendParagraphRendering.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-specialist-presentation-recovery-audit.js",
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-consequence-translation-recovery-audit.js",
  "test-mia-structure-preserving-repetition-compression-audit.js",
  "test-mia-tone-compliance-guard-audit.js",
];

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    const msg = `${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

function simulateWirePayload(preToneReply, presentation, query) {
  const toneProfile = deriveConversationalToneProfile({
    originalMessage: query,
    normalizedMessage: query,
  });

  const toneGuard = applyToneComplianceGuard({
    response: preToneReply,
    toneProfile,
    preserveSpecialistPresentation: !!presentation?.tradeoff?.gains?.length,
    specialistPresentation: presentation,
  });

  const wire = finalizeSpecialistWireContractPreservation({
    replyBeforeTone: preToneReply,
    reply: toneGuard.response,
    presentation,
  });

  return {
    preToneReply,
    postToneReply: toneGuard.response,
    wireReply: wire.text || toneGuard.response,
    toneGuard,
    wire,
    toneProfile,
  };
}

function runSpecialistPipeline(product, query, axis = "performance") {
  const winner = product.trustedSpecs?.official_name || product.product_name;
  const ctx = {
    query,
    category: product.category || "celular",
    product,
    searchCognition: { primaryAxis: axis, consequenceChain: {} },
    querySignals: {},
    decisionMemory: {},
    responsePath: "return_seguro",
    sessionContext: {},
  };

  const specialist = buildSpecialistDecisionExplanation(ctx);
  let presentation = specialist.presentation || null;
  let reply = specialist.text || "";

  reply =
    finalizeReplyWithSpecialistNarrative({
      reply,
      query,
      winnerName: winner,
      allowedEvidence: winner,
      primaryAxis: axis,
      responsePath: "return_seguro",
    }).text || reply;

  reply =
    finalizeReplyWithRepetitionCompression({
      reply,
      query,
      winnerName: winner,
      allowedEvidence: winner,
      primaryAxis: axis,
      responsePath: "return_seguro",
    }).text || reply;

  const close = finalizeReplyWithConversationalClosing({
    reply,
    ...ctx,
    winnerName: winner,
    allowedEvidence: winner,
    presentation,
  });
  reply = close.text || reply;
  if (close.presentation) presentation = close.presentation;

  const visual = finalizeReplyWithTradeoffVisualEmphasis({
    reply,
    winnerName: winner,
    allowedEvidence: winner,
    responsePath: "return_seguro",
    presentation,
  });
  reply = visual.text || reply;
  if (visual.presentation) presentation = visual.presentation;

  const recovery = finalizeSpecialistPresentationRecovery({ reply, presentation });
  reply = recovery.text || reply;
  if (recovery.presentation) presentation = recovery.presentation;

  return { reply, presentation, query };
}

function assertSpecialistWire(name, result) {
  const { preToneReply, wireReply, presentation } = result;
  const preDouble = (preToneReply.match(/\n\n/g) || []).length;
  const wireDouble = (wireReply.match(/\n\n/g) || []).length;
  const wireGuard = verifySpecialistWireContract({
    reply: wireReply,
    presentation,
    stage: "audit",
  });
  const paras = splitAssistantParagraphs(wireReply);

  console.log(`\n▶ ${name}`);
  assert(`${name}: pré-tone \\n\\n >= 4`, preDouble >= 4, `got ${preDouble}`);
  assert(`${name}: pós-wire \\n\\n preservado`, wireDouble >= 4, `got ${wireDouble}`);
  assert(`${name}: wire contract ok`, wireGuard.ok, wireGuard.flags?.join(", "));
  assert(`${name}: headers detectáveis`, /O que você ganha/i.test(wireReply) && /O que você abre mão/i.test(wireReply));
  assert(`${name}: ✅ preservado`, wireReply.includes("✅"));
  assert(`${name}: ⚠️ preservado`, /⚠️?/.test(wireReply));
  assert(`${name}: bullets presentes`, (wireReply.match(/•/g) || []).length >= 2);
  assert(`${name}: sem header gain inline`, !/O que você ganha[ \t]*•/i.test(wireReply));
  assert(`${name}: sem header loss inline`, !/O que você abre mão[ \t]*•/i.test(wireReply));
  assert(`${name}: split múltiplos blocos`, paras.length >= 6, `got ${paras.length}`);
}

function assertCasualWire(name, query) {
  const toneProfile = deriveConversationalToneProfile({
    originalMessage: query,
    normalizedMessage: query,
  });
  const leaky = `Oi! ${query} 😊😊 kkkk vale sim`;
  const before = leaky;
  const guard = applyToneComplianceGuard({ response: before, toneProfile });
  const after = guard.response;

  console.log(`\n▶ ${name}`);
  assert(`${name}: tone guard ainda corrige casual`, guard.corrected || guard.violations.length > 0);
  assert(`${name}: sem preserve specialist`, guard.specialistPreserved !== true);
  assert(`${name}: remove excesso emoji casual`, !/😊.*😊/.test(after));
}

console.log("PATCH 9.2Q — Specialist Wire Contract Preservation Audit\n");

const iphone = runSpecialistPipeline(
  {
    product_name: "iPhone 13",
    isDataLayerProduct: true,
    category: "celular",
    trustedSpecs: {
      official_name: "iPhone 13",
      strengths: ["camera_consistente", "video_forte", "desempenho_forte", "ios_ecossistema", "longevidade_uso"],
      weaknesses: ["tela_60hz", "carregamento_lento", "preco_relativo_alto"],
      ideal_for: ["quem_prioriza_video"],
    },
  },
  "iPhone 13",
  "performance"
);
assertSpecialistWire("A iPhone 13", simulateWirePayload(iphone.reply, iphone.presentation, iphone.query));

const battery = runSpecialistPipeline(
  {
    product_name: "Moto G84",
    isDataLayerProduct: true,
    category: "celular",
    trustedSpecs: {
      official_name: "Moto G84",
      strengths: ["bateria_consistente", "tela_fluida", "desempenho_forte"],
      weaknesses: ["camera_limitada"],
      ideal_for: ["uso_diario_equilibrado"],
    },
  },
  "celular bateria forte",
  "battery"
);
assertSpecialistWire("B Bateria", simulateWirePayload(battery.reply, battery.presentation, battery.query));

const airFryer = runSpecialistPipeline(
  {
    product_name: "Air Fryer Max",
    isDataLayerProduct: true,
    category: "air_fryer",
    trustedSpecs: {
      official_name: "Air Fryer Max",
      strengths: ["boa_capacidade", "facil_limpeza"],
      weaknesses: ["ocupa_bancada"],
      ideal_for: ["familia_media"],
    },
  },
  "air fryer",
  "value"
);
assertSpecialistWire("C Air fryer", simulateWirePayload(airFryer.reply, airFryer.presentation, airFryer.query));

const noLayer = runSpecialistPipeline(
  { product_name: "Celular Genérico", category: "celular" },
  "celular barato",
  "value"
);
assertSpecialistWire("D Sem Data Layer", simulateWirePayload(noLayer.reply, noLayer.presentation, noLayer.query));

const notebook = runSpecialistPipeline(
  {
    product_name: "Notebook Nitro 5",
    isDataLayerProduct: true,
    category: "notebook",
    trustedSpecs: {
      official_name: "Notebook Nitro 5",
      strengths: ["desempenho_forte"],
      weaknesses: ["portabilidade_limitada"],
      ideal_for: ["trabalho_multitarefa"],
    },
  },
  "notebook gamer",
  "performance"
);
const notebookWire = simulateWirePayload(notebook.reply, notebook.presentation, notebook.query);
console.log("\n▶ E Notebook");
assert(
  "E Notebook: wire preserva estrutura ou sem tradeoff obrigatório",
  notebookWire.wireReply.includes("✅") || !notebook.presentation?.tradeoff?.gains?.length,
  verifySpecialistWireContract({
    reply: notebookWire.wireReply,
    presentation: notebook.presentation,
  }).flags?.join(", ")
);

assertCasualWire('F casual "oi"', "oi");
assertCasualWire('F casual "entendi"', "entendi");
assertCasualWire('F casual "obrigado"', "obrigado");

console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}

if (!process.env.MIA_SKIP_NESTED_REGRESSION) {
  console.log("\n--- Nested regressions ---");
  for (const script of PRIOR_AUDITS) {
    const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, MIA_SKIP_NESTED_REGRESSION: "1" },
    });
    if (result.status !== 0) {
      failed += 1;
      failures.push(`nested regression failed: ${script}`);
    }
  }
}

process.exit(failed > 0 ? 1 : 0);
