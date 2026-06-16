/**
 * PATCH 8.0D — Typo / Fuzzy Input Understanding Audit
 *
 * Usage: node scripts/test-mia-typo-fuzzy-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAcknowledgementFamilyQuery,
  isAntiRegretFamilyQuery,
  isComprehensionFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { applyTypoNormalization } from "../lib/miaTypoNormalizer.js";
import { applyAbbreviationNormalization } from "../lib/miaAbbreviationNormalizer.js";
import { applyInformalLanguageNormalization } from "../lib/miaInformalLanguageNormalization.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Atual", price: "R$ 999" },
  lastRecommendation: { winner: "Produto Atual" },
  lastProductMentioned: "Produto Atual",
  lastProducts: [{ product_name: "Produto Atual" }],
};

function fullPipelineText(message) {
  const typo = applyTypoNormalization(message);
  const abbrev = applyAbbreviationNormalization(typo.typoNormalizedMessage);
  const informal = applyInformalLanguageNormalization(abbrev.normalizedMessage);
  return { typo, abbrev, informal, text: informal.text };
}

function simulatePipeline(message, hasActiveAnchor) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: hasActiveAnchor ? SESSION : {},
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: false, clearContext: !hasActiveAnchor },
    sessionContext: hasActiveAnchor ? SESSION : {},
    incomingSessionContext: hasActiveAnchor ? SESSION : {},
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
    },
    signals: {
      hasClearNewCommercialSearch: resolveClearNewCommercialSearchForRouting({
        query: message,
        resolvedQuery: message,
        hasAnchor: hasActiveAnchor,
        looksLikeShortPriorityFollowUp: false,
        looksLikeAmbiguousFollowUp: false,
        isExplicitComparison: false,
        explicitProductOnlyQuery: false,
        wantsNew: false,
        detectProductCategory: () => "",
        wantsNewProduct: () => false,
      }),
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  return { cognitiveTurn, routingDecision };
}

function c(id, input, expectContains, opts = {}) {
  return { id, input, expectContains, ...opts };
}

const CASES = [
  // A — marcas (40)
  ...["sansung", "samsumg", "samsng", "samgung"].map((w, i) => c(`A${i + 1}`, w, "samsung")),
  ...["xiaome", "xiaomii", "xiaumy"].map((w, i) => c(`A${i + 5}`, w, "xiaomi")),
  ...["motrola", "motorla"].map((w, i) => c(`A${i + 8}`, w, "motorola")),
  ...["aple", "aplle"].map((w, i) => c(`A${i + 10}`, w, "apple")),
  ...["iphonne", "iphnoe", "ifone", "ipone"].map((w, i) => c(`A${i + 12}`, w, "iphone")),
  c("A16", "realmi", "realme"),
  c("A17", "reame", "realme"),
  c("A18", "infinixx", "infinix"),
  c("A19", "tecnoo", "tecno"),

  // B — palavras comuns (25)
  c("B1", "serteza", "certeza"),
  c("B2", "sertesa", "certeza"),
  c("B3", "srtza", "certeza"),
  c("B4", "tenho serteza", "tenho certeza"),
  c("B5", "comserteza", "com certeza"),
  c("B6", "poso comprar", "posso comprar"),
  c("B7", "possu comprar", "posso comprar"),
  c("B8", "poço comprar", "posso comprar"),
  c("B9", "tambemm", "tambem"),
  c("B10", "tbemm", "tambem"),
  c("B11", "naun", "nao"),
  c("B12", "naoo", "nao"),
  c("B13", "entendii", "entendi"),
  c("B14", "entendiu", "entendi"),
  c("B15", "voçe recomenda", "voce recomenda"),
  c("B16", "recomendassao", "recomendacao"),
  c("B17", "bateriaa", "bateria"),
  c("B18", "cameta", "camera"),
  c("B19", "desepenho", "desempenho"),
  c("B20", "perfomance", "performance"),
  c("B21", "bsteria", "bateria"),
  c("B22", "celulsr", "celular"),
  c("B23", "bararto", "barato"),
  c("B24", "ofertaa", "oferta"),
  c("B25", "benefisio", "beneficio"),

  // C — categorias (20)
  ...["notbook", "notebbok", "notboook"].map((w, i) => c(`C${i + 1}`, w, "notebook")),
  ...["monito", "monnitor"].map((w, i) => c(`C${i + 4}`, w, "monitor")),
  c("C6", "tecldo", "teclado"),
  c("C7", "tecaldo", "teclado"),
  c("C8", "mause", "mouse"),
  c("C9", "mouze", "mouse"),
  c("C10", "foni", "fone"),
  c("C11", "fonee", "fone"),
  c("C12", "cadeeira", "cadeira"),
  c("C13", "notbook gamer", "notebook gamer"),
  c("C14", "monito gamer", "monitor gamer"),
  c("C15", "tecldo mecanico", "teclado mecanico"),
  c("C16", "mause sem fio", "mouse sem fio"),
  c("C17", "foni bluetooth", "fone bluetooth"),
  c("C18", "cadeeira gamer", "cadeira gamer"),
  c("C19", "celulsr barato", "celular barato"),
  c("C20", "notbook ate 3000", "notebook ate 3000"),

  // D — compras / benefício (10)
  c("D1", "custo benificio", "custo beneficio"),
  c("D2", "custo benefisio", "custo beneficio"),
  c("D3", "custo benefico", "custo beneficio"),
  c("D4", "baratinhoo", "barato"),
  c("D5", "promoçaoo", "promocao"),
  c("D6", "compensa msm", "compensa mesmo", { skipRouter: true }),
  c("D7", "vale msm", "vale mesmo", { skipRouter: true }),
  c("D8", "muitooo caro", "muito caro"),
  c("D9", "caroooo", "caro"),
  c("D10", "perfeitooo", "perfeito"),

  // E — full stack (20)
  c("E1", "voce tem certeza?", "voce tem certeza", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" }),
  c("E2", "vc tem serteza?", "voce tem certeza", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" }),
  c("E3", "continua valendo?", "continua valendo", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" }),
  c("E4", "nao entendi", "nao entendi", { familyQuery: isComprehensionFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "comprehension" }),
  c("E5", "n entendi", "nao entendi", { familyQuery: isComprehensionFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "comprehension" }),
  c("E6", "nao sei nao", "nao sei nao", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" }),
  c("E7", "espera ai", "espera ai", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" }),
  c("E8", "nao quero errar", "nao quero errar", { familyQuery: isAntiRegretFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.OBJECTION, act: "anti_regret" }),
  c("E9", "to com receio", "to com receio", { familyQuery: isAntiRegretFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.OBJECTION, act: "anti_regret" }),
  c("E10", "fechou", "fechou", { familyQuery: isAcknowledgementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" }),
  c("E11", "blz", "beleza", { familyQuery: isAcknowledgementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" }),
  c("E12", "vlw", "valeu", { familyQuery: isAcknowledgementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" }),
  c("E13", "explica melhor", "explica melhor", { familyQuery: isComprehensionFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "comprehension" }),
  c("E14", "ainda vale?", "ainda vale", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" }),
  c("E15", "voce sustenta?", "voce sustenta", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" }),
  c("E16", "calma ai", "calma ai", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" }),
  c("E17", "demorou", "demorou", { familyQuery: isAcknowledgementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" }),
  c("E18", "entendi", "entendi", { familyQuery: isAcknowledgementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" }),
  c("E19", "show", "show", { familyQuery: isAcknowledgementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" }),
  c("E20", "sei la", "sei la", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" }),

  // F — protegidos (15)
  c("F1", "RTX4060", "rtx4060", { protected: true }),
  c("F2", "rtx 4060", "rtx 4060", { protected: true }),
  c("F3", "RX7800XT", "rx7800xt", { protected: true }),
  c("F4", "DDR5", "ddr5", { protected: true }),
  c("F5", "SSD", "ssd", { protected: true }),
  c("F6", "S24", "s24", { protected: true }),
  c("F7", "A55", "a55", { protected: true }),
  c("F8", "4060", "4060", { protected: true }),
  c("F9", "SM-A556E", "sm-a556e", { protected: true }),
  c("F10", "https://loja.com/produto", "https://loja.com/produto", { protected: true }),
  c("F11", "GPU", "gpu", { protected: true }),
  c("F12", "NVMe", "nvme", { protected: true }),
  c("F13", "p", "p", { protected: true }),
  c("F14", "not bad", "not bad", { protected: true }),
  c("F15", "procuro notebook", "procuro notebook", { protected: true }),

  // G — frases compostas typo (20)
  c("G1", "ipone vale?", "iphone vale"),
  c("G2", "sansung ou xiaome?", "samsung ou xiaomi"),
  c("G3", "notbook compensa?", "notebook compensa"),
  c("G4", "monito barato", "monitor barato"),
  c("G5", "tecldo rgb", "teclado rgb"),
  c("G6", "mause gamer", "mouse gamer"),
  c("G7", "foni sem fio", "fone sem fio"),
  c("G8", "cadeeira ergonomica", "cadeira ergonomica"),
  c("G9", "tenho serteza nessa", "tenho certeza nessa"),
  c("G10", "voçe recomenda esse?", "voce recomenda esse"),
  c("G11", "custo benificio bom?", "custo beneficio bom"),
  c("G12", "celulsr samsung", "celular samsung"),
  c("G13", "notbook sansung", "notebook samsung"),
  c("G14", "monito com boa cameta", "monitor com boa camera"),
  c("G15", "bsteria fraca", "bateria fraca"),
  c("G16", "desepenho ruim", "desempenho ruim"),
  c("G17", "bararto demais", "barato demais"),
  c("G18", "ofertaa boa", "oferta boa"),
  c("G19", "motrola ou sansung", "motorola ou samsung"),
  c("G20", "ifone ou sansung", "iphone ou samsung"),

  // H — expansão 150+ (25)
  c("H1", "sansung galaxy", "samsung galaxy"),
  c("H2", "ipone 15", "iphone 15", { protectedPartial: true }),
  c("H3", "notebook sansung", "notebook samsung"),
  c("H4", "tablet xiaome", "tablet xiaomi"),
  c("H5", "tv sansung", "tv samsung"),
  c("H6", "fone motrola", "fone motorola"),
  c("H7", "ssd nvme", "ssd nvme", { protected: true }),
  c("H8", "placa de video boa", "placa de video boa"),
  c("H9", "processador bom", "processador bom"),
  c("H10", "memoria ddr5", "memoria ddr5", { protected: true }),
  c("H11", "com certeza", "com certeza"),
  c("H12", "comcertesa", "com certeza"),
  c("H13", "tem serteza?", "tem certeza"),
  c("H14", "voce tem serteza?", "voce tem certeza"),
  c("H15", "recomendacao boa", "recomendacao boa"),
  c("H16", "recomendacão ruim", "recomendacao ruim"),
  c("H17", "promocao boa", "promocao boa"),
  c("H18", "promoçaoo imperdivel", "promocao imperdivel"),
  c("H19", "booom demais", "bom demais"),
  c("H20", "tooop", "top"),
  c("H21", "explicassao", "explicacao", { skipRouter: true }),
  c("H22", "explicacao", "explicacao"),
  c("H23", "indicassao", "indicacao", { skipRouter: true }),
  c("H24", "confio nessa recomendassao", "confio nessa recomendacao"),
  c("H25", "poco comprar esse?", "posso comprar esse"),
];

function textMatches(actual, expected) {
  return actual === expected || actual.includes(expected);
}

function evaluateCase(spec) {
  const pipeline = fullPipelineText(spec.input);
  const failures = [];
  const layers = [];

  if (pipeline.typo.originalMessage !== spec.input) {
    failures.push("original_not_preserved");
  }

  if (spec.protected) {
    if (pipeline.typo.hasTypoNormalization && !spec.input.includes("http")) {
      failures.push("over_correction_protected");
      layers.push("Over-correction");
    }
    if (!textMatches(pipeline.typo.typoNormalizedMessage, spec.expectContains)) {
      failures.push(`typo=${pipeline.typo.typoNormalizedMessage}`);
      layers.push("Typo miss");
    }
    return { ok: failures.length === 0, failures, layers, pipeline };
  }

  if (!textMatches(pipeline.text, spec.expectContains)) {
    failures.push(`text=${pipeline.text} expected~${spec.expectContains}`);
    layers.push("Typo miss");
  }

  if (spec.skipRouter) {
    return { ok: failures.length === 0, failures, layers, pipeline };
  }

  if (spec.familyQuery || spec.turnType) {
    const sim = simulatePipeline(spec.input, spec.anchored === true);
    if (spec.turnType && sim.cognitiveTurn.turnType !== spec.turnType) {
      failures.push(`turnType=${sim.cognitiveTurn.turnType}`);
      layers.push("Router miss");
    }
    if (spec.familyQuery && !spec.familyQuery(spec.input)) {
      failures.push("familyQuery=false");
      layers.push("Router miss");
    }
    if (spec.act && sim.routingDecision.conversationAct !== spec.act) {
      failures.push(`act=${sim.routingDecision.conversationAct}`);
      layers.push("Routing miss");
    }
    if (spec.anchored && sim.routingDecision.shouldPreserveAnchor !== true) {
      failures.push("anchor_lost");
      layers.push("Routing miss");
    }
  }

  return { ok: failures.length === 0, failures, layers, pipeline };
}

console.log("PATCH 8.0D — Typo / Fuzzy Input Understanding Audit\n");
console.log(`Cenários: ${CASES.length}\n`);

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  const result = evaluateCase(spec);
  if (result.ok) {
    pass += 1;
    console.log(`✓ [${spec.id}] "${spec.input}" → "${result.pipeline.text}"`);
  } else {
    fail += 1;
    console.log(`✗ [${spec.id}] "${spec.input}" → ${result.failures.join("; ")} | "${result.pipeline.text}"`);
  }
}

const rate = ((pass / (pass + fail)) * 100).toFixed(1);
console.log(`\nResultado: ${pass}/${pass + fail} (${rate}%)`);
const verdict = pass / (pass + fail) >= 0.95 ? "A) TYPO / FUZZY UNDERSTANDING ROBUST" : "B) TYPO / FUZZY UNDERSTANDING POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(pass / (pass + fail) >= 0.95 ? 0 : 1);
