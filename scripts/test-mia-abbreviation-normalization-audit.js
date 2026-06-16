/**
 * PATCH 8.0C — Abbreviation Normalization Audit
 *
 * Usage: node scripts/test-mia-abbreviation-normalization-audit.js
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
import { applyAbbreviationNormalization } from "../lib/miaAbbreviationNormalizer.js";
import { applyInformalLanguageNormalization } from "../lib/miaInformalLanguageNormalization.js";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
};

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

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
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
      hasClearNewCommercialSearch: clearNewSearch,
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

/** @typedef {{ id: string, input: string, expectNorm: string|string[], skipRouter?: boolean, family?: string, anchored?: boolean, familyQuery?: Function, turnType?: string, act?: string, ambiguousSkip?: boolean }} AuditCase */

/** Normalização pura + full stack onde o Router já suporta a forma expandida. */
const CASES = [
  // A — pronomes
  { id: "A1", input: "vc acha q vale?", expectNorm: "voce acha que vale", skipRouter: true },
  { id: "A2", input: "vcs recomendam esse?", expectNorm: "voces recomendam esse", skipRouter: true },
  { id: "A3", input: "ce acha q compensa?", expectNorm: "voce acha que compensa", skipRouter: true },
  { id: "A4", input: "cmg parece caro", expectNorm: "comigo parece caro", skipRouter: true },
  { id: "A5", input: "ngm curte?", expectNorm: "ninguem curte", skipRouter: true },
  { id: "A6", input: "vc tem certeza?", expectNorm: "voce tem certeza", family: "CONFIDENCE_CHALLENGE", anchored: true, familyQuery: isConfidenceChallengeFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" },
  { id: "A7", input: "vc iria nesse tbm?", expectNorm: "voce iria nesse tambem", family: "CONFIDENCE_CHALLENGE", anchored: true, familyQuery: isConfidenceChallengeFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" },
  { id: "A8", input: "vcs bancariam essa?", expectNorm: "voces bancariam essa", skipRouter: true },
  { id: "A9", input: "vce recomenda?", expectNorm: "voce recomenda", skipRouter: true },
  { id: "A10", input: "vcc acha q vale?", expectNorm: "voce acha que vale", skipRouter: true },

  // B — conectivos
  { id: "B1", input: "pq esse?", expectNorm: "por que esse", skipRouter: true },
  { id: "B2", input: "pq compensa?", expectNorm: "por que compensa", skipRouter: true },
  { id: "B3", input: "pk nao?", expectNorm: "por que nao", skipRouter: true },
  { id: "B4", input: "qnd chega?", expectNorm: "quando chega", skipRouter: true },
  { id: "B5", input: "qdo posso pegar?", expectNorm: "quando posso pegar", skipRouter: true },
  { id: "B6", input: "onde q compra?", expectNorm: "onde que compra", skipRouter: true },
  { id: "B7", input: "como q funciona?", expectNorm: "como que funciona", skipRouter: true },
  { id: "B8", input: "tbm quero saber", expectNorm: "tambem quero saber", skipRouter: true },
  { id: "B9", input: "tb quero ver", expectNorm: "tambem quero ver", skipRouter: true },
  { id: "B10", input: "tbmm quero saber", expectNorm: "tambem quero saber", skipRouter: true },

  // C — tempo
  { id: "C1", input: "hj ta caro", expectNorm: "hoje ta caro", skipRouter: true },
  { id: "C2", input: "agr quero algo barato", expectNorm: "agora quero algo barato", skipRouter: true },
  { id: "C3", input: "ag muda", expectNorm: "agora muda", skipRouter: true },
  { id: "C4", input: "dps vejo", expectNorm: "depois vejo", skipRouter: true },
  { id: "C5", input: "dp decido", expectNorm: "depois decido", skipRouter: true },
  { id: "C6", input: "agr msm", expectNorm: "agora mesmo", skipRouter: true },
  { id: "C7", input: "agor quero", expectNorm: "agora quero", skipRouter: true },

  // D — negação
  { id: "D1", input: "n sei nao", expectNorm: "nao sei nao", family: "SOFT_DISAGREEMENT", anchored: true, familyQuery: isSoftDisagreementFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" },
  { id: "D2", input: "n quero errar", expectNorm: "nao quero errar", family: "ANTI_REGRET", anchored: true, familyQuery: isAntiRegretFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "anti_regret" },
  { id: "D3", input: "n curti muito", expectNorm: "nao curti muito", family: "SOFT_DISAGREEMENT", anchored: true, familyQuery: isSoftDisagreementFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" },
  { id: "D4", input: "n entendi", expectNorm: "nao entendi", family: "COMPREHENSION", anchored: true, familyQuery: isComprehensionFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "comprehension" },
  { id: "D5", input: "nn sei", expectNorm: "nao sei", skipRouter: true },
  { id: "D6", input: "naum curti", expectNorm: "nao curti", skipRouter: true },
  { id: "D7", input: "n gostei", expectNorm: "nao gostei", skipRouter: true },

  // E — preposição segura
  { id: "E1", input: "p mim vale?", expectNorm: "para mim vale", skipRouter: true },
  { id: "E2", input: "p mim parece caro", expectNorm: "para mim parece caro", skipRouter: true },
  { id: "E3", input: "p jogar", expectNorm: "para jogar", skipRouter: true },
  { id: "E4", input: "d bateria", expectNorm: "de bateria", skipRouter: true },
  { id: "E5", input: "d camera", expectNorm: "de camera", skipRouter: true },
  { id: "E6", input: "d boa", expectNorm: "de boa", skipRouter: true },
  { id: "E7", input: "antes d comprar", expectNorm: "antes de comprar", skipRouter: true },
  { id: "E8", input: "dps d pensar", expectNorm: "depois de pensar", skipRouter: true },

  // F — intensidade
  { id: "F1", input: "mt caro", expectNorm: "muito caro", skipRouter: true },
  { id: "F2", input: "mto bom", expectNorm: "muito bom", skipRouter: true },
  { id: "F3", input: "mta coisa", expectNorm: "muita coisa", skipRouter: true },
  { id: "F4", input: "dms caro", expectNorm: "demais caro", skipRouter: true },
  { id: "F5", input: "mo caro", expectNorm: "muito caro", skipRouter: true },
  { id: "F6", input: "vale msm", expectNorm: "vale mesmo", skipRouter: true },

  // G — ACK
  { id: "G1", input: "blz", expectNorm: "beleza", family: "ACKNOWLEDGEMENT", anchored: true, familyQuery: isAcknowledgementFamilyQuery, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" },
  { id: "G2", input: "vlw", expectNorm: "valeu", family: "ACKNOWLEDGEMENT", anchored: true, familyQuery: isAcknowledgementFamilyQuery, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" },
  { id: "G3", input: "bllz", expectNorm: "beleza", skipRouter: true },
  { id: "G4", input: "flw", expectNorm: "falou", skipRouter: true },
  { id: "G5", input: "fechow", expectNorm: "fechou", skipRouter: true },
  { id: "G6", input: "suav", expectNorm: "suave", skipRouter: true },

  // H — incerteza
  { id: "H1", input: "sla", expectNorm: "sei la", skipRouter: true },
  { id: "H2", input: "sla se compensa", expectNorm: "sei la se compensa", skipRouter: true },
  { id: "H3", input: "sll", expectNorm: "sei la", skipRouter: true },
  { id: "H4", input: "sei la", expectNorm: "sei la", family: "SOFT_DISAGREEMENT", anchored: true, familyQuery: isSoftDisagreementFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" },

  // I — reação (normalização apenas; tom fica no Router/informal)
  { id: "I1", input: "crl ta caro", expectNorm: "crl ta caro", skipRouter: true },
  { id: "I2", input: "slk pesado", expectNorm: "slk pesado", skipRouter: true },

  // J — risada
  { id: "J1", input: "kkk entendi", expectNorm: "entendi", family: "ACKNOWLEDGEMENT", anchored: true, familyQuery: isAcknowledgementFamilyQuery, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" },
  { id: "J2", input: "rsrs blz", expectNorm: "beleza", skipRouter: true },
  { id: "J3", input: "hahaha entendi", expectNorm: "entendi", skipRouter: true },

  // K — valor / decisão
  { id: "K1", input: "qnt ta esse?", expectNorm: "quanto ta esse", skipRouter: true },
  { id: "K2", input: "qto custa?", expectNorm: "quanto custa", skipRouter: true },
  { id: "K3", input: "cxb dele e bom?", expectNorm: "custo beneficio dele e bom", skipRouter: true },
  { id: "K4", input: "compensa msm?", expectNorm: "compensa mesmo", skipRouter: true },
  { id: "K5", input: "continua valendo?", expectNorm: "continua valendo", family: "CONFIDENCE_CHALLENGE", anchored: true, familyQuery: isConfidenceChallengeFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" },

  // L — produtos
  { id: "L1", input: "q celular pego?", expectNorm: "qual celular pego", skipRouter: true },
  { id: "L2", input: "q notebook?", expectNorm: "qual notebook", skipRouter: true },
  { id: "L3", input: "cel barato", expectNorm: "celular barato", skipRouter: true },
  { id: "L4", input: "note gamer", expectNorm: "notebook gamer", skipRouter: true },
  { id: "L5", input: "gpu boa", expectNorm: "placa de video boa", skipRouter: true },

  // M — typos
  { id: "M1", input: "voce acha q vale msm?", expectNorm: "voce acha que vale mesmo", skipRouter: true },
  { id: "M2", input: "msmo preco", expectNorm: "mesmo preco", skipRouter: true },

  // N — ambíguos (não normalizar agressivamente)
  { id: "N1", input: "p", expectNorm: "p", ambiguousSkip: true },
  { id: "N2", input: "d", expectNorm: "d", ambiguousSkip: true },
  { id: "N3", input: "n", expectNorm: "n", ambiguousSkip: true },
  { id: "N4", input: "not bad", expectNorm: "not bad", ambiguousSkip: true },
  { id: "N5", input: "https://loja.com/produto", expectNorm: "https://loja.com/produto", ambiguousSkip: true },

  // O — full stack adicional
  { id: "O1", input: "nao quero errar", expectNorm: "nao quero errar", family: "ANTI_REGRET", anchored: true, familyQuery: isAntiRegretFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "anti_regret" },
  { id: "O2", input: "to com receio", expectNorm: "to com receio", family: "ANTI_REGRET", anchored: true, familyQuery: isAntiRegretFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "anti_regret" },
  { id: "O3", input: "explica melhor", expectNorm: "explica melhor", family: "COMPREHENSION", anchored: true, familyQuery: isComprehensionFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "comprehension" },
  { id: "O4", input: "espera ai", expectNorm: "espera ai", family: "SOFT_DISAGREEMENT", anchored: true, familyQuery: isSoftDisagreementFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" },
  { id: "O5", input: "voce sustenta?", expectNorm: "voce sustenta", family: "CONFIDENCE_CHALLENGE", anchored: true, familyQuery: isConfidenceChallengeFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" },
  { id: "O6", input: "demorou", expectNorm: "demorou", family: "ACKNOWLEDGEMENT", anchored: true, familyQuery: isAcknowledgementFamilyQuery, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" },
  { id: "O7", input: "fechou", expectNorm: "fechou", family: "ACKNOWLEDGEMENT", anchored: true, familyQuery: isAcknowledgementFamilyQuery, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" },
  { id: "O8", input: "calma ai", expectNorm: "calma ai", family: "SOFT_DISAGREEMENT", anchored: true, familyQuery: isSoftDisagreementFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" },
  { id: "O9", input: "nao sei nao", expectNorm: "nao sei nao", family: "SOFT_DISAGREEMENT", anchored: true, familyQuery: isSoftDisagreementFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" },
  { id: "O10", input: "ainda vale?", expectNorm: "ainda vale", family: "CONFIDENCE_CHALLENGE", anchored: true, familyQuery: isConfidenceChallengeFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" },

  // P — expansão cobertura 120+
  { id: "P1", input: "vc acha q vale msm?", expectNorm: "voce acha que vale mesmo", skipRouter: true },
  { id: "P2", input: "vcs acham q compensa?", expectNorm: "voces acham que compensa", skipRouter: true },
  { id: "P3", input: "pq q isso?", expectNorm: "por que que isso", skipRouter: true },
  { id: "P4", input: "td mundo curte?", expectNorm: "todo mundo curte", skipRouter: true },
  { id: "P5", input: "p vc vale?", expectNorm: "para voce vale", skipRouter: true },
  { id: "P6", input: "p trabalho", expectNorm: "para trabalho", skipRouter: true },
  { id: "P7", input: "p estudo", expectNorm: "para estudo", skipRouter: true },
  { id: "P8", input: "d preco", expectNorm: "de preco", skipRouter: true },
  { id: "P9", input: "d valor", expectNorm: "de valor", skipRouter: true },
  { id: "P10", input: "q monitor?", expectNorm: "qual monitor", skipRouter: true },
  { id: "P11", input: "q tv?", expectNorm: "qual tv", skipRouter: true },
  { id: "P12", input: "q fone?", expectNorm: "qual fone", skipRouter: true },
  { id: "P13", input: "cell barato", expectNorm: "celular barato", skipRouter: true },
  { id: "P14", input: "vlr alto", expectNorm: "valor alto", skipRouter: true },
  { id: "P15", input: "vga boa", expectNorm: "placa de video boa", skipRouter: true },
  { id: "P16", input: "obg mia", expectNorm: "obrigado mia", skipRouter: true },
  { id: "P17", input: "obgd", expectNorm: "obrigado", skipRouter: true },
  { id: "P18", input: "fmz", expectNorm: "firmeza", skipRouter: true },
  { id: "P19", input: "memo preco", expectNorm: "mesmo preco", skipRouter: true },
  { id: "P20", input: "mts modelos", expectNorm: "muitos modelos", skipRouter: true },
  { id: "P21", input: "mtas opcoes", expectNorm: "muitas opcoes", skipRouter: true },
  { id: "P22", input: "dmss caro", expectNorm: "demais caro", skipRouter: true },
  { id: "P23", input: "pk nao curti", expectNorm: "por que nao curti", skipRouter: true },
  { id: "P24", input: "pqe nao", expectNorm: "porque nao", skipRouter: true },
  { id: "P25", input: "qd chega", expectNorm: "quando chega", skipRouter: true },
  { id: "P26", input: "vc bancaria essa?", expectNorm: "voce bancaria essa", skipRouter: true },
  { id: "P27", input: "continua bancando esse?", expectNorm: "continua bancando esse", family: "CONFIDENCE_CHALLENGE", anchored: true, familyQuery: isConfidenceChallengeFamilyQuery, turnType: MIA_TURN_TYPES.EXPLANATION_REQUEST, act: "confidence_challenge" },
  { id: "P28", input: "pera ai", expectNorm: "pera ai", family: "SOFT_DISAGREEMENT", anchored: true, familyQuery: isSoftDisagreementFamilyQuery, turnType: MIA_TURN_TYPES.OBJECTION, act: "soft_disagreement" },
  { id: "P29", input: "entendi", expectNorm: "entendi", family: "ACKNOWLEDGEMENT", anchored: true, familyQuery: isAcknowledgementFamilyQuery, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" },
  { id: "P30", input: "show", expectNorm: "show", family: "ACKNOWLEDGEMENT", anchored: true, familyQuery: isAcknowledgementFamilyQuery, turnType: MIA_TURN_TYPES.REACTION, act: "acknowledgement" },
];

function normMatches(actual, expected) {
  const targets = Array.isArray(expected) ? expected : [expected];
  return targets.some((t) => actual === t || actual.includes(t));
}

function evaluateCase(spec) {
  const abbrev = applyAbbreviationNormalization(spec.input);
  const informal = applyInformalLanguageNormalization(abbrev.normalizedMessage);
  const failures = [];
  const layers = [];

  if (abbrev.originalMessage !== spec.input) {
    failures.push("originalMessage_not_preserved");
  }

  if (spec.ambiguousSkip) {
    if (abbrev.hasAbbreviationNormalization) {
      failures.push("over_normalization_ambiguous");
      layers.push("Over-normalization");
    }
    if (!normMatches(abbrev.normalizedMessage, spec.expectNorm)) {
      failures.push(`norm=${abbrev.normalizedMessage}`);
      layers.push("Normalization miss");
    }
    return { ok: failures.length === 0, failures, layers, abbrev, informal };
  }

  if (!normMatches(informal.text, spec.expectNorm) && !normMatches(abbrev.normalizedMessage, spec.expectNorm)) {
    failures.push(`norm=${informal.text} expected~${spec.expectNorm}`);
    layers.push("Normalization miss");
  }

  if (spec.skipRouter) {
    return { ok: failures.length === 0, failures, layers, abbrev, informal };
  }

  const hasAnchor = spec.anchored === true;
  const pipeline = simulatePipeline(spec.input, hasAnchor);

  if (spec.turnType && pipeline.cognitiveTurn.turnType !== spec.turnType) {
    failures.push(`turnType=${pipeline.cognitiveTurn.turnType} expected=${spec.turnType}`);
    layers.push("Router miss after normalization");
  }

  if (spec.familyQuery && !spec.familyQuery(spec.input)) {
    failures.push("familyQuery=false");
    layers.push("Router miss after normalization");
  }

  if (spec.act && pipeline.routingDecision.conversationAct !== spec.act) {
    failures.push(`act=${pipeline.routingDecision.conversationAct}`);
    layers.push("Routing miss");
  }

  if (hasAnchor && pipeline.routingDecision.shouldPreserveAnchor !== true) {
    failures.push("anchor_not_preserved");
    layers.push("Routing miss");
  }

  if (pipeline.routingDecision.allowNewSearch) {
    failures.push("new_search_leak");
    layers.push("Routing miss");
  }

  return { ok: failures.length === 0, failures, layers, abbrev, informal, pipeline };
}

console.log("PATCH 8.0C — Abbreviation Normalization Audit\n");
console.log("Causa raiz: Router recebia tokens abreviados (vc, q, pq, sla, tbm…) sem expansão pré-classificação.\n");

let pass = 0;
let fail = 0;
const failureRecords = [];

for (const spec of CASES) {
  const result = evaluateCase(spec);
  if (result.ok) {
    pass += 1;
    console.log(`✓ [${spec.id}] "${spec.input}" → "${result.informal.text}"`);
  } else {
    fail += 1;
    console.log(`✗ [${spec.id}] "${spec.input}" → ${result.failures.join("; ")} | abbrev="${result.abbrev.normalizedMessage}"`);
    failureRecords.push({ id: spec.id, input: spec.input, failures: result.failures, layers: result.layers });
  }
}

const total = pass + fail;
const rate = ((pass / total) * 100).toFixed(1);
console.log(`\nResultado: ${pass}/${total} (${rate}%)`);
console.log(`Cenários: ${total}`);
console.log(`Normalização pura: ${CASES.filter((c) => c.skipRouter || c.ambiguousSkip).length}`);
console.log(`Full stack: ${CASES.filter((c) => !c.skipRouter && !c.ambiguousSkip).length}`);

if (failureRecords.length) {
  console.log("\n── Falhas por camada ──\n");
  const byLayer = {};
  for (const r of failureRecords) {
    for (const l of r.layers) byLayer[l] = (byLayer[l] || 0) + 1;
  }
  for (const [layer, count] of Object.entries(byLayer)) {
    console.log(`  ${layer}: ${count}`);
  }
}

const verdict = pass / total >= 0.95 ? "A) ABBREVIATION NORMALIZATION ROBUST" : "B) ABBREVIATION NORMALIZATION POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(pass / total >= 0.95 ? 0 : 1);
