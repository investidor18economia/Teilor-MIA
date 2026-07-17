/**
 * PATCH 11B.3 — Natural Conversation Flow + RF-01 Constraint Refinement
 */

import {
  REFINEMENT_TYPES,
  extractCommercialRefinement,
  extractPriorCommercialConstraints,
  mergePriorConstraintsWithRefinement,
  resolveCommercialConstraintRefinement,
  resolveRefinementDecisionRefresh,
  buildConstraintRefinementDeterministicReply,
  applyMergedConstraintsToSessionContext,
} from "../lib/miaCommercialConstraintRefinement.js";
import {
  resolveContextualCommercialFollowUp,
  buildCommercialFollowUpDeterministicReply,
  classifyCommercialFollowUpType,
} from "../lib/miaCommercialFollowUpContinuity.js";
import {
  buildSpecificGovernedFallback,
  validateSocialResponsePerception,
  extractContentAnchors,
} from "../lib/miaSocialResponsePerception.js";

let passed = 0;
let failed = 0;

function expectTrue(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

function expectEqual(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`, { actual, expected });
}

function expectIncludes(label, haystack, needle) {
  expectTrue(label, String(haystack || "").toLowerCase().includes(String(needle).toLowerCase()));
}

const BASE_CTX = {
  lastBestProduct: { product_name: "iPhone 13", price: "2800" },
  lastRankingSnapshot: [
    { rank: 1, product_name: "iPhone 13", price: "2800" },
    { rank: 2, product_name: "Galaxy S23 FE", price: "2200" },
    { rank: 3, product_name: "Motorola Edge 40", price: "1900" },
  ],
  lastQuery: "celular até 3000",
  lastCategory: "phone",
  budgetMax: 3000,
  lastCommercialConstraints: {
    category: "phone",
    budgetMax: 3000,
    desiredAttributes: ["camera"],
  },
};

// ── GROUP A — PRICE ──
const priceCases = [
  "tem um mais barato?",
  "quero gastar menos",
  "algum abaixo desse valor?",
  "tem uma opção até 2000?",
  "quero o mais em conta",
];
for (const message of priceCases) {
  const refinement = extractCommercialRefinement(message, BASE_CTX);
  expectTrue(`price extract: ${message}`, refinement.detected);
  const resolved = resolveCommercialConstraintRefinement({
    message,
    sessionContext: BASE_CTX,
    hasValidContext: true,
    baselineProduct: BASE_CTX.lastBestProduct,
  });
  expectTrue(`price ctx auth: ${message}`, resolved.detected);
  if (/at[eé]|2000/.test(message)) {
    expectEqual(`price budget replace: ${message}`, refinement.refinementType, REFINEMENT_TYPES.BUDGET_REFINEMENT);
  } else {
    expectEqual(`price relative: ${message}`, refinement.refinementType, REFINEMENT_TYPES.PRICE_REFINEMENT);
  }
}

for (const message of priceCases) {
  const resolved = resolveCommercialConstraintRefinement({
    message,
    sessionContext: {},
    hasValidContext: false,
  });
  expectTrue(`price no ctx clarify: ${message}`, resolved.requiresClarification);
  expectTrue(`price no ctx zero provider: ${message}`, !resolved.providerRequired);
}

// ── GROUP B — ATTRIBUTES ──
const attributeCases = [
  ["quero mais bateria", "battery"],
  ["preciso de câmera melhor", "camera"],
  ["tem um mais rápido?", "performance"],
  ["quero uma tela melhor", "display"],
  ["tem um mais resistente?", "durability"],
];
for (const [message, attr] of attributeCases) {
  const refinement = extractCommercialRefinement(message, BASE_CTX);
  expectEqual(`attribute type: ${message}`, refinement.refinementType, REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT);
  expectEqual(`attribute value: ${message}`, refinement.value, attr);
  const merge = mergePriorConstraintsWithRefinement(
    extractPriorCommercialConstraints(BASE_CTX),
    refinement,
    { baselineProduct: BASE_CTX.lastBestProduct }
  );
  expectTrue(`attribute merge keeps budget: ${message}`, merge.mergedConstraints.budgetMax === 3000);
  expectTrue(`attribute merge adds attr: ${message}`, merge.mergedConstraints.desiredAttributes.includes(attr));
}

// ── GROUP C — BRANDS ──
const brandCases = [
  ["sem iPhone", REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT, "apple"],
  ["não quero Samsung", REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT, "samsung"],
  ["prefiro Motorola", REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT, "motorola"],
  ["pode ser Apple", REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT, "apple"],
];
for (const [message, type, brand] of brandCases) {
  const refinement = extractCommercialRefinement(message, BASE_CTX);
  expectEqual(`brand type: ${message}`, refinement.refinementType, type);
  expectEqual(`brand value: ${message}`, refinement.value, brand);
}

const resolvedNoApple = resolveCommercialConstraintRefinement({
  message: "sem iPhone",
  sessionContext: BASE_CTX,
  hasValidContext: true,
  baselineProduct: BASE_CTX.lastBestProduct,
});
expectTrue("sem iPhone rerank no provider", !resolvedNoApple.providerRequired);
expectIncludes("sem iPhone product", resolvedNoApple.selectedProduct?.product_name, "Galaxy");

// ── GROUP D — SPECS ──
const specCases = ["preciso de 256 GB", "quero 16 GB de RAM", "tem que ter NFC", "quero 5G", "preciso de tela de 120 Hz"];
for (const message of specCases) {
  const refinement = extractCommercialRefinement(message, BASE_CTX);
  expectEqual(`spec type: ${message}`, refinement.refinementType, REFINEMENT_TYPES.SPECIFICATION_REFINEMENT);
}

// ── GROUP E — SIZE ──
const sizeCases = [
  ["quero um menor", "compact"],
  ["tem um mais leve?", "light"],
  ["preciso de tela maior", "large"],
  ["não quero algo grande", "compact"],
  ["quero um compacto", "compact"],
];
for (const [message, size] of sizeCases) {
  const refinement = extractCommercialRefinement(message, BASE_CTX);
  expectEqual(`size type: ${message}`, refinement.refinementType, REFINEMENT_TYPES.SIZE_REFINEMENT);
  expectEqual(`size value: ${message}`, refinement.value, size);
}

// ── GROUP F — USE ──
const useCases = [
  "é mais para jogos",
  "vou usar para trabalhar",
  "é para minha mãe",
  "quero para tirar fotos",
  "preciso para estudar",
];
for (const message of useCases) {
  const refinement = extractCommercialRefinement(message, BASE_CTX);
  expectEqual(`use type: ${message}`, refinement.refinementType, REFINEMENT_TYPES.USE_CASE_REFINEMENT);
}

// ── GROUP G — RELAX / REMOVE ──
expectEqual(
  "relax budget",
  extractCommercialRefinement("pode passar um pouco do orçamento", BASE_CTX).refinementType,
  REFINEMENT_TYPES.RELAX_CONSTRAINT
);
expectEqual(
  "remove brands",
  extractCommercialRefinement("qualquer marca serve", BASE_CTX).refinementType,
  REFINEMENT_TYPES.REMOVE_CONSTRAINT
);
const removeSpec = mergePriorConstraintsWithRefinement(
  { ...extractPriorCommercialConstraints(BASE_CTX), specifications: ["256 gb"] },
  {
    detected: true,
    refinementType: REFINEMENT_TYPES.REMOVE_CONSTRAINT,
    operation: "REMOVE",
    target: "256 gb",
  }
);
expectTrue("remove spec", !removeSpec.mergedConstraints.specifications.includes("256 gb"));

// ── GROUP H — CONFLICTS ──
const conflictMerge = mergePriorConstraintsWithRefinement(
  { preferredBrands: ["samsung"], excludedBrands: [], budgetMax: 2500 },
  {
    detected: true,
    refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT,
    value: "samsung",
  }
);
expectTrue("exclude removes preferred", !conflictMerge.mergedConstraints.preferredBrands.includes("samsung"));
expectTrue("exclude adds excluded", conflictMerge.mergedConstraints.excludedBrands.includes("samsung"));

// ── NATURALITY — SOCIAL ──
const galaxyOpinion = buildSpecificGovernedFallback({
  contentAnchors: extractContentAnchors("acho esse Galaxy bonito"),
  userMessageForSpecificity: "acho esse Galaxy bonito",
  responseDepth: "brief",
});
expectIncludes("galaxy opinion design", galaxyOpinion, "design");
expectTrue("galaxy opinion not faz sentido", !/^faz sentido[.!]?$/i.test(galaxyOpinion));

const tiredReply = buildSpecificGovernedFallback({
  contentAnchors: extractContentAnchors("estou cansado de pesquisar celular"),
  userMessageForSpecificity: "estou cansado de pesquisar celular",
  responseDepth: "brief",
});
expectIncludes("tired research", tiredReply, "comparar");

const genericValidation = validateSocialResponsePerception("Faz sentido.", {
  mustReferenceUserContent: true,
  contentAnchors: ["estetica", "galaxy"],
  userMessageForSpecificity: "acho esse Galaxy bonito",
});
expectTrue("generic faz sentido rejected", !genericValidation.valid);

// ── MINIMAL PAIRS ──
expectTrue(
  "new search not refinement",
  classifyCommercialFollowUpType("quero um celular barato") !== "constraint_refinement" ||
    !extractCommercialRefinement("quero um celular barato", {}).detected
);
expectTrue(
  "relative price with ctx",
  !resolveCommercialConstraintRefinement({
    message: "tem um mais barato?",
    sessionContext: BASE_CTX,
    hasValidContext: true,
  }).providerRequired
);
expectTrue(
  "relative price without ctx",
  resolveCommercialConstraintRefinement({
    message: "tem um mais barato?",
    sessionContext: {},
    hasValidContext: false,
  }).requiresClarification
);

// ── CATEGORY GENERALIZATION ──
const generalized = [
  "tem uma geladeira mais barata?",
  "quero uma máquina de lavar maior",
  "sem Nike",
  "quero um perfume mais suave",
  "preciso de uma cadeira menor",
  "tem um aspirador mais silencioso?",
];
for (const message of generalized) {
  expectTrue(`generalized detect: ${message}`, extractCommercialRefinement(message, BASE_CTX).detected);
}

// ── MULTI-TURN MERGE SIMULATION ──
let session = { ...BASE_CTX };
const turns = [
  "quero mais bateria",
  "sem iPhone",
  "mas preciso de 256 GB",
  "tem um mais barato?",
];
for (const message of turns) {
  const resolved = resolveCommercialConstraintRefinement({
    message,
    sessionContext: session,
    hasValidContext: true,
    baselineProduct: session.lastBestProduct,
  });
  session = applyMergedConstraintsToSessionContext(session, resolved);
  if (resolved.selectedProduct?.product_name) {
    session.lastBestProduct = resolved.selectedProduct;
  }
}
expectTrue("multi-turn budget preserved", session.budgetMax === 3000);
expectTrue("multi-turn apple excluded", session.lastCommercialConstraints.excludedBrands.includes("apple"));
expectTrue("multi-turn battery attr", session.lastCommercialConstraints.desiredAttributes.includes("battery"));

// ── NEW CATEGORY DOES NOT MERGE PHONE BUDGET INTO NOTEBOOK ──
const categorySwitch = extractCommercialRefinement("agora quero um notebook até 4000", {
  ...BASE_CTX,
  lastCategory: "phone",
});
expectTrue("category switch detected", !!categorySwitch.topicSwitchCategory);

// ── DETERMINISTIC REPLIES ──
const cheaperReply = buildCommercialFollowUpDeterministicReply(
  resolveContextualCommercialFollowUp({
    message: "tem um mais barato?",
    sessionContext: BASE_CTX,
    hasActiveAnchor: true,
  }),
  BASE_CTX
);
expectTrue("cheaper deterministic", !!cheaperReply?.reply);
expectIncludes("cheaper mentions product", cheaperReply.reply, "Galaxy");

const clarifyReply = buildConstraintRefinementDeterministicReply(
  resolveCommercialConstraintRefinement({
    message: "sem iPhone",
    sessionContext: {},
    hasValidContext: false,
  })
);
expectTrue("clarify reply", !!clarifyReply?.reply);

// ── REFRESH MODES ──
const refresh = resolveRefinementDecisionRefresh({
  mergeResult: mergePriorConstraintsWithRefinement(
    extractPriorCommercialConstraints(BASE_CTX),
    {
      detected: true,
      refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT,
      value: "apple",
    }
  ),
  sessionContext: BASE_CTX,
  baselineProduct: BASE_CTX.lastBestProduct,
});
expectTrue("refresh rerank", refresh.providerRequired === false);

console.log(`\nPATCH 11B.3 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
