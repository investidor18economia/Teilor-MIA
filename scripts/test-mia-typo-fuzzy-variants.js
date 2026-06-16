/**
 * PATCH 8.0D — Typo / Fuzzy Variants (Regra 18)
 *
 * Usage: node scripts/test-mia-typo-fuzzy-variants.js
 */

import {
  isAcknowledgementFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { applyTypoNormalization } from "../lib/miaTypoNormalizer.js";
import { applyAbbreviationNormalization } from "../lib/miaAbbreviationNormalizer.js";
import { applyInformalLanguageNormalization } from "../lib/miaInformalLanguageNormalization.js";

function v(persona, input, expectContains, opts = {}) {
  return { persona, input, expectContains, ...opts };
}

function pipelineText(message) {
  const typo = applyTypoNormalization(message);
  const abbrev = applyAbbreviationNormalization(typo.typoNormalizedMessage);
  const informal = applyInformalLanguageNormalization(abbrev.normalizedMessage);
  return { text: informal.text, typo };
}

function matches(actual, expected) {
  return actual === expected || actual.includes(expected);
}

const VARIANTS = [
  // leigo (12)
  v("leigo", "ipone vale?", "iphone vale"),
  v("leigo", "sansung ou xiaome?", "samsung ou xiaomi"),
  v("leigo", "poço comprar?", "posso comprar"),
  v("leigo", "tenho serteza", "tenho certeza"),
  v("leigo", "voçe recomenda?", "voce recomenda"),
  v("leigo", "notbook barato", "notebook barato"),
  v("leigo", "monito bom", "monitor bom"),
  v("leigo", "mause sem fio", "mouse sem fio"),
  v("leigo", "foni bluetooth", "fone bluetooth"),
  v("leigo", "cadeeira confortavel", "cadeira confortavel"),
  v("leigo", "bararto demais", "barato demais"),
  v("leigo", "ofertaa boa", "oferta boa"),

  // tecnico (10)
  v("tecnico", "gpu boa p jogar?", "placa de video boa para jogar"),
  v("tecnico", "notbook gamer sansung", "notebook gamer samsung"),
  v("tecnico", "monito 144hz", "monitor 144hz"),
  v("tecnico", "ssd nvme rapido", "ssd nvme rapido", { protected: true }),
  v("tecnico", "rtx 4060 vale?", "rtx 4060 vale", { protected: true }),
  v("tecnico", "desepenho do processador", "desempenho do processador"),
  v("tecnico", "bsteria do celulsr", "bateria do celular"),
  v("tecnico", "cameta frontal", "camera frontal"),
  v("tecnico", "perfomance ruim", "performance ruim"),
  v("tecnico", "custo benificio", "custo beneficio"),

  // typo_leve (10)
  v("typo_leve", "serteza?", "certeza"),
  v("typo_leve", "entendii", "entendi"),
  v("typo_leve", "tambemm", "tambem"),
  v("typo_leve", "naoo", "nao"),
  v("typo_leve", "bateriaa", "bateria"),
  v("typo_leve", "motrola", "motorola"),
  v("typo_leve", "realmi", "realme"),
  v("typo_leve", "tecldo", "teclado"),
  v("typo_leve", "mouze", "mouse"),
  v("typo_leve", "fonee", "fone"),

  // typo_pesado (10)
  v("typo_pesado", "iphnoe ifone ipone", "iphone iphone iphone"),
  v("typo_pesado", "sansung samsumg samgung", "samsung samsung samsung"),
  v("typo_pesado", "notboook notebbok", "notebook notebook"),
  v("typo_pesado", "monnitor monito", "monitor monitor"),
  v("typo_pesado", "tecaldo tecldo", "teclado teclado"),
  v("typo_pesado", "cadeeira cadeeira", "cadeira cadeira"),
  v("typo_pesado", "recomendassao", "recomendacao"),
  v("typo_pesado", "benefisio benefico", "beneficio beneficio"),
  v("typo_pesado", "promoçaoo", "promocao"),
  v("typo_pesado", "comcertesa comserteza", "com certeza com certeza"),

  // informal (10)
  v("informal", "slk pesado", "nossa pesado"),
  v("informal", "kkk entendii", "entendi"),
  v("informal", "crl ta caro", "crl ta caro"),
  v("informal", "blz entao", "beleza entao"),
  v("informal", "vlw mia", "valeu mia"),
  v("informal", "fechow", "fechou"),
  v("informal", "suav", "suave"),
  v("informal", "sla se compensa", "sei la se compensa"),
  v("informal", "n sei nao", "nao sei nao", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("informal", "to com receio", "to com receio", { familyQuery: isAntiRegretFamilyQuery, anchored: true }),

  // apressado (8)
  v("apressado", "ipone?", "iphone"),
  v("apressado", "sansung?", "samsung"),
  v("apressado", "notbook?", "notebook"),
  v("apressado", "serteza?", "certeza"),
  v("apressado", "poso?", "posso"),
  v("apressado", "monito?", "monitor"),
  v("apressado", "continua valendo?", "continua valendo", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true }),
  v("apressado", "blz", "beleza", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),

  // regional (6)
  v("regional", "oxe caro", "nossa caro"),
  v("regional", "uai compensa?", "nossa compensa"),
  v("regional", "eita pesado", "nossa pesado"),
  v("regional", "vish caro", "nossa caro"),
  v("regional", "poço confiar?", "posso confiar"),
  v("regional", "voçe indica?", "voce indica"),

  // typo_abrev (10)
  v("typo_abrev", "vc acha q esse notbook compensa?", "voce acha que esse notebook compensa"),
  v("typo_abrev", "sla se pego esse monito", "sei la se pego esse monitor"),
  v("typo_abrev", "pq esse sansung?", "por que esse samsung"),
  v("typo_abrev", "tbm quero notbook", "tambem quero notebook"),
  v("typo_abrev", "n curti esse mause", "nao curti esse mouse"),
  v("typo_abrev", "vc tem serteza?", "voce tem certeza", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true }),
  v("typo_abrev", "q notbook pego?", "qual notebook pego"),
  v("typo_abrev", "p mim parece caro", "para mim parece caro"),
  v("typo_abrev", "hj quero monito", "hoje quero monitor"),
  v("typo_abrev", "agr to na duvida", "agora to na duvida"),

  // typo_giria (8)
  v("typo_giria", "slk esse ipone caro", "nossa esse iphone caro"),
  v("typo_giria", "vish sansung caro", "nossa samsung caro"),
  v("typo_giria", "eita monito pesado", "nossa monitor pesado"),
  v("typo_giria", "caraca notbook caro", "nossa notebook caro"),
  v("typo_giria", "oxe mause caro", "nossa mouse caro"),
  v("typo_giria", "uai fone caro", "nossa fone caro"),
  v("typo_giria", "rapaz tecldo caro", "nossa teclado caro"),
  v("typo_giria", "pesado esse cadeeira", "cadeira"),

  // typo_risada (8)
  v("typo_risada", "kkkk entendii", "entendi"),
  v("typo_risada", "rsrs blz", "beleza"),
  v("typo_risada", "hahaha fechow", "fechou"),
  v("typo_risada", "kkk vlw", "valeu"),
  v("typo_risada", "rsrs demorou", "demorou"),
  v("typo_risada", "kkk show", "show"),
  v("typo_risada", "hehe entendii", "entendi"),
  v("typo_risada", "kkkk esse mause parece bom", "esse mouse parece bom"),

  // composto (8)
  v("composto", "vc acha q esse notbook compensa?", "voce acha que esse notebook compensa"),
  v("composto", "poço confiar nessa recomendassao?", "posso confiar nessa recomendacao"),
  v("composto", "tenho serteza q esse sansung vale", "tenho certeza que esse samsung vale"),
  v("composto", "essa recomendassao faz sentido?", "essa recomendacao faz sentido"),
  v("composto", "notbook ou monito?", "notebook ou monitor"),
  v("composto", "ifone ou sansung?", "iphone ou samsung"),
  v("composto", "muitooo caro esse ipone", "muito caro esse iphone"),
  v("composto", "barartinho demais esse mause", "barato demais esse mouse"),
];

console.log("PATCH 8.0D — Typo / Fuzzy Variants (Regra 18)\n");
console.log(`Variantes: ${VARIANTS.length}\n`);

let pass = 0;
let fail = 0;
const byPersona = {};

for (const spec of VARIANTS) {
  const { text, typo } = pipelineText(spec.input);
  const failures = [];

  if (typo.originalMessage !== spec.input) failures.push("original_lost");

  if (spec.protected) {
    if (!matches(typo.typoNormalizedMessage, spec.expectContains)) {
      failures.push(`typo=${typo.typoNormalizedMessage}`);
    }
  } else if (!matches(text, spec.expectContains)) {
    failures.push(`text=${text}`);
  }

  if (spec.familyQuery && !spec.familyQuery(spec.input)) {
    failures.push("family=false");
  }

  byPersona[spec.persona] = byPersona[spec.persona] || { pass: 0, fail: 0 };
  if (failures.length) {
    fail += 1;
    byPersona[spec.persona].fail += 1;
    console.log(`✗ [${spec.persona}] "${spec.input}" → ${failures.join("; ")} | "${text}"`);
  } else {
    pass += 1;
    byPersona[spec.persona].pass += 1;
  }
}

console.log(`\nResultado: ${pass}/${pass + fail} (${((pass / (pass + fail)) * 100).toFixed(1)}%)`);
console.log("\n── Por persona ──\n");
for (const [persona, stats] of Object.entries(byPersona)) {
  console.log(`  [${persona}]: ${stats.pass}/${stats.pass + stats.fail}`);
}

const rate = pass / (pass + fail);
const verdict = rate >= 0.95 ? "A) TYPO VARIANTS ROBUST" : "B) TYPO VARIANTS POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(rate >= 0.95 ? 0 : 1);
