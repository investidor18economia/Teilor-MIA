#!/usr/bin/env node
/**
 * PATCH 5.8.1 — Correction continuity, factual contrast, long-conversation fillers
 * Run: node scripts/test-mia-patch-581-correction-fillers.js
 */

import { strict as assert } from "node:assert";
import { recognizeMiaIntent, MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import { classifySocialIntent, SOCIAL_INTENT_FAMILIES } from "../lib/miaSocialIntentTaxonomy.js";
import {
  resolveCorrectionContinuity,
  detectFactualContrastFragment,
  isCorrectionRequestMessage,
  CORRECTION_CONTINUITY_VERSION,
} from "../lib/miaCorrectionContinuityGovernance.js";
import {
  classifyConversationalFiller,
  FILLER_TYPES,
  FILLER_GOVERNANCE_VERSION,
} from "../lib/miaConversationalFillerGovernance.js";
import {
  enrichCommercialSessionContext,
  hasActiveCommercialThread,
  hasRunningCommercialDiscourse,
} from "../lib/miaCommercialFollowUpContinuity.js";
import { resolveSemanticTarget, SEMANTIC_TARGETS } from "../lib/miaSemanticTargetResolution.js";
import { resolveClarificationDecision } from "../lib/miaClarificationGates.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

function pipeline(message, history = [], ctx = {}) {
  const enriched = enrichCommercialSessionContext(ctx, history);
  const hasAnchor = hasActiveCommercialThread(enriched);
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: enriched,
    conversationMessages: history,
    hasActiveAnchor: hasAnchor,
  });
  const target = resolveSemanticTarget({
    message,
    recognition,
    conversationMessages: history,
    sessionContext: enriched,
  });
  const clarification = resolveClarificationDecision({
    query: message,
    sessionContext: enriched,
    conversationMessages: history,
    intentRecognition: recognition,
  });
  const filler = classifyConversationalFiller(message, {
    conversationMessages: history,
    sessionContext: enriched,
    hasActiveAnchor: hasAnchor,
  });
  return { recognition, target, clarification, filler, enriched };
}

function buildLongCommercialHistory(turns = 16) {
  const base = [
    ["tô ansioso", "Entendo — comprar pode gerar ansiedade."],
    ["medo de comprar errado", "Posso comparar opções confiáveis."],
    ["quero celular confiável", "Qual faixa de preço?"],
    ["compara opções", "Galaxy A55 e Moto G84 se destacam."],
    ["qual menos arrependimento?", "A55 equilibra autonomia e suporte."],
    ["show", "Quer detalhar câmera ou bateria?"],
    ["valeu", "Por nada — estou aqui."],
    ["pera", "Sem pressa."],
    ["explica", "A55 equilibra bateria e câmera."],
    ["beleza", "Quer aprofundar algum ponto?"],
    ["hm", "Prefere câmera, bateria ou preço?"],
    ["ok", "Fico no aguardo."],
  ];
  const hist = [];
  for (let i = 0; i < Math.min(turns, base.length); i += 1) {
    hist.push({ role: "user", content: base[i][0] });
    hist.push({ role: "assistant", content: base[i][1] });
  }
  return hist;
}

console.log("\nPATCH 5.8.1 — Correction + factual contrast + long fillers\n");

test("versions", () => {
  assert.equal(CORRECTION_CONTINUITY_VERSION, "5.8.1");
  assert.equal(FILLER_GOVERNANCE_VERSION, "5.8.1");
});

console.log("\nGrupo A — correction continuation (13 originals + variations)");
const correctionHistories = [
  {
    label: "MT-0014 insult+error → corrige então",
    msg: "corrige então mano",
    hist: [
      { role: "user", content: "idiota, você errou mano" },
      { role: "assistant", content: "Entendi — vou revisar. O que ficou errado?" },
    ],
  },
  {
    label: "formal: então corrige",
    msg: "então corrige",
    hist: [
      { role: "user", content: "você errou" },
      { role: "assistant", content: "Pode me dizer qual ponto?" },
    ],
  },
  {
    label: "arruma isso após crítica",
    msg: "arruma isso",
    hist: [
      { role: "user", content: "essa resposta está errada" },
      { role: "assistant", content: "Entendi — me ajuda a localizar o erro?" },
    ],
  },
  {
    label: "revê aí após comparação",
    msg: "revê aí",
    hist: [
      { role: "user", content: "comparou errado" },
      { role: "assistant", content: "Vou revisar a comparação." },
    ],
  },
  {
    label: "corrige o que você falou",
    msg: "corrige o que você falou",
    hist: [
      { role: "user", content: "informação errada" },
      { role: "assistant", content: "Desculpa — qual dado?" },
    ],
  },
  {
    label: "corrige então após recomendação criticada",
    msg: "corrige então",
    hist: [
      { role: "assistant", content: "Recomendo o Galaxy A55 com 4000mAh." },
      { role: "user", content: "a bateria está errada" },
      { role: "assistant", content: "Entendi — vou verificar." },
    ],
  },
];

for (const c of correctionHistories) {
  test(c.label, () => {
    const r = pipeline(c.msg, c.hist);
    assert.notEqual(r.recognition.interactionMode, MIA_INTERACTION_MODES.CLARIFICATION);
    assert.equal(r.recognition.requiresClarification, false);
    assert.equal(r.clarification.needsClarification, false);
  });
}

const correctionVariations = [
  "corrige então", "então corrige", "arruma isso", "revê aí", "corrija então",
  "conserta isso", "ajusta aí", "corrige o que falou", "corrige pf", "corrige ai",
  "então arruma", "corrige ja", "corrige já", "arruma então", "revê então",
  "corrige mano", "arruma mano", "conserta então", "retifica isso", "corrige por favor",
  "então conserta", "corrige vc", "arruma vc", "revê o que disse", "corrige o ponto",
  "corrige dai", "arruma dai", "corrige ae", "então revisa", "revisa então",
];
for (const msg of correctionVariations) {
  test(`variation correction: ${msg}`, () => {
    const hist = [
      { role: "user", content: "você errou" },
      { role: "assistant", content: "Vou revisar — qual ponto?" },
    ];
    const r = pipeline(msg, hist);
    assert.equal(r.recognition.requiresClarification, false);
  });
}

test("correction sem contexto — não clarification genérica fria", () => {
  const r = pipeline("corrige então", []);
  assert.equal(r.recognition.requiresClarification, false);
  assert.equal(r.recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.CORRECTION);
});

console.log("\nGrupo B — factual correction fragments");
test("MT-0036: são 5000mAh não 4000", () => {
  const hist = [
    { role: "user", content: "quanto custa o A55?" },
    { role: "assistant", content: "Galaxy A55 ~R$1800, bateria 4000mAh." },
    { role: "user", content: "a bateria que vc citou está errada" },
  ];
  const r = pipeline("são 5000mAh não 4000", hist, { lastBestProduct: { product_name: "Galaxy A55" } });
  assert.equal(r.recognition.requiresClarification, false);
  assert.equal(r.recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.CORRECTION);
  assert.equal(r.target.target, SEMANTIC_TARGETS.PREVIOUS_ANSWER);
});

const factualVariations = [
  ["são 16GB não 8GB", true],
  ["é 144Hz não 60Hz", true],
  ["tem 3 portas não 2", true],
  ["é 220V não 110V", true],
  ["pesa 1,4kg não 1,8kg", true],
  ["são R$2000 não R$1500", true],
  ["é 2024 não 2023", true],
  ["são 512GB não 256", true],
  ["tem 12GB não 8", true],
  ["é 6,7 polegadas não 6,1", true],
  ["não gostei do tom", false],
  ["quero notebook barato", false],
];
for (const [msg, expectDetect] of factualVariations) {
  test(`factual contrast: ${msg}`, () => {
    const d = detectFactualContrastFragment(msg);
    assert.equal(d.detected, expectDetect);
    if (expectDetect) {
      assert.equal(d.requiresFactValidation, true);
    }
  });
}

for (const msg of [
  "são 5000mAh não 4000", "é 16GB não 8GB", "tem 3 portas não 2", "é 144Hz não 60Hz",
  "pesa 1,4kg não 1,8kg", "é 220V não 110V", "são 500 não 400", "é 128GB não 64GB",
  "tem 8GB não 4GB", "é 90Hz não 60Hz", "são 2 anos não 1 ano", "é 15W não 10W",
  "tem 4 núcleos não 2", "é 1080p não 720p", "são 3 câmeras não 2", "é IP68 não IP67",
  "tem 120Hz não 60Hz", "é 5G não 4G", "são 6000mAh não 5000", "é OLED não LCD",
]) {
  test(`factual pipeline: ${msg}`, () => {
    const hist = [
      { role: "assistant", content: "O produto X tem spec Y." },
      { role: "user", content: "isso está errado" },
    ];
    const r = pipeline(msg, hist);
    assert.equal(r.recognition.requiresClarification, false);
  });
}

console.log("\nGrupo C — long-conversation fillers");
const longHist = buildLongCommercialHistory(12);
for (const msg of ["ok mano", "certo mano", "hm mano", "ok", "certo", "hm"]) {
  test(`long filler MT-style: ${msg}`, () => {
    const f = classifyConversationalFiller(msg, {
      conversationMessages: longHist,
      sessionContext: {},
      hasActiveAnchor: false,
    });
    assert.equal(f.detected, true);
    assert.equal(f.blocksClarification, true);
    assert.equal(f.type, FILLER_TYPES.NEUTRAL);
  });
}

test("hasRunningCommercialDiscourse on 12+ turn history", () => {
  assert.equal(hasRunningCommercialDiscourse(longHist), true);
});

const fillerVariations = [
  "ok", "certo", "hm", "entendi", "beleza", "show", "ta", "sim", "claro",
  "ok mano", "certo mano", "hm mano", "beleza mano", "show mano",
];
for (const turns of [10, 15, 20]) {
  const h = buildLongCommercialHistory(turns);
  for (const msg of fillerVariations) {
    test(`${turns} turns filler: ${msg}`, () => {
      const r = pipeline(msg, h);
      assert.equal(r.recognition.requiresClarification, false);
    });
  }
}

test("exit filler clears thread", () => {
  const f = classifyConversationalFiller("deixa", {
    conversationMessages: longHist,
    sessionContext: {},
    hasActiveAnchor: true,
  });
  assert.equal(f.type, FILLER_TYPES.EXIT);
  assert.equal(f.clearsCommercialThread, true);
});

test("pending question guides filler", () => {
  const hist = [
    { role: "assistant", content: "Qual faixa de preço você tem em mente?" },
  ];
  const f = classifyConversationalFiller("hm", {
    conversationMessages: hist,
    sessionContext: { lastBestProduct: { product_name: "X" } },
    hasActiveAnchor: true,
  });
  assert.equal(f.blocksClarification, true);
});

console.log("\nReason codes");
test("correction chain reason codes", () => {
  const r = resolveCorrectionContinuity("corrige então", {
    conversationMessages: [
      { role: "user", content: "você errou" },
      { role: "assistant", content: "Vou revisar." },
    ],
  });
  assert.equal(r.active, true);
  assert.ok(r.reasonCodes.includes("correction_chain_preserves_previous_target"));
});

test("factual contrast reason code", () => {
  const d = detectFactualContrastFragment("são 5000mAh não 4000");
  assert.equal(d.reasonCode, "factual_contrast_detected_from_previous_answer");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
