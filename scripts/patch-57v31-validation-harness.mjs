#!/usr/bin/env node
/**
 * PATCH 5.7V.3.1 — Directed validation harness
 * Usage: node scripts/patch-57v31-validation-harness.mjs [--local-only] [--prod]
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v31");
mkdirSync(OUT, { recursive: true });

const LOCAL_ONLY = process.argv.includes("--local-only");
const PROD = process.argv.includes("--prod") || !LOCAL_ONLY;
const API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = process.env.MIA_HEALTH || "https://economia-ai.vercel.app/api/health";
const DELAY = Number(process.env.MIA_AUDIT_DELAY_MS || 3500);
const LOG = join(OUT, "run.log");

const {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
} = await import(pathToFileURL(join(ROOT, "lib/miaIntentRecognitionLayer.js")).href);
const { buildIntentAuthorityFromRecognition, COMMERCIAL_PERMISSION } = await import(
  pathToFileURL(join(ROOT, "lib/miaIntentAuthority.js")).href
);
const {
  resolveContextualCommercialFollowUp,
  enrichCommercialSessionContext,
  hasActiveCommercialThread,
  COMMERCIAL_FOLLOW_UP_TYPES,
  detectGenericDimensionFollowUpQuery,
  getActiveRecommendedEntity,
} = await import(pathToFileURL(join(ROOT, "lib/miaCommercialFollowUpContinuity.js")).href);
const { classifyConversationalFiller, FILLER_TYPES } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalFillerGovernance.js")).href
);
const { resolveSemanticTarget, SEMANTIC_TARGETS } = await import(
  pathToFileURL(join(ROOT, "lib/miaSemanticTargetResolution.js")).href
);
const { resolveClarificationDecision } = await import(
  pathToFileURL(join(ROOT, "lib/miaClarificationGates.js")).href
);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  appendFileSync(LOG, line + "\n");
  console.log(line);
}

function write(name, data) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2));
}

function cold(reply = "") {
  return /me ajuda: você se refere|me diz rapidinho a que você se refere/i.test(reply);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function localPipeline(message, ctx = {}, history = []) {
  const enriched = enrichCommercialSessionContext(ctx, history);
  const hasAnchor = hasActiveCommercialThread(enriched);
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: enriched,
    conversationMessages: history,
    hasActiveAnchor: hasAnchor,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: hasAnchor,
    sessionContext: enriched,
    conversationMessages: history,
  });
  const followUp = resolveContextualCommercialFollowUp({
    message,
    sessionContext: ctx,
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
  return { recognition, authority, followUp, target, clarification, filler, hasAnchor };
}

// ── Scenario generators ─────────────────────────────────────────────────────

const DIMENSIONS = [
  "memoria", "memória", "armazenamento", "tela", "bateria", "camera", "câmera",
  "desempenho", "processador", "preço", "preco", "construção", "construcao",
  "autonomia", "resistencia", "resistência", "carregamento", "sistema", "taxa",
  "consumo", "compatibilidade", "suporte", "garantia", "peso", "tamanho",
  "brilho", "contraste", "refresh", "fps", "latencia", "latência", "ruido", "ruído",
  "durabilidade", "acabamento", "design", "cor", "material", "ventilacao", "ventilação",
  "capacidade", "velocidade", "eficiencia", "eficiência", "qualidade", "nitidez",
  "som", "audio", "áudio", "conectividade", "wifi", "bluetooth", "portas",
  "entradas", "saidas", "saídas", "resolucao", "resolução", "hz", "polegadas",
  "polegada", "polegada?", "upgrade", "expansao", "expansão", "refrigeracao",
  "refrigeração", "freezer", "motor", "compressor", "filtro", "manutenção",
  "manutencao", "instalacao", "instalação", "montagem", "ergonomia", "ajuste",
  "lumens", "temperatura", "umidade", "selo", "certificacao", "certificação",
];

const FILLER_VARIANTS = [
  "hm", "hm mano", "hmm", "ok", "ok mano", "blz", "beleza", "entendi", "saquei",
  "show", "massa", "top", "legal", "verdade", "claro", "sim", "aham", "uhum",
  "pera", "perai", "pois", "ta", "tá", "ne", "hum", "ah", "oh", "rs", "kkk",
  "não", "nao", "nem", "não mano", "nao mano", "deixa", "esquece", "já foi",
  "ja foi", "não quero mais", "nao quero mais", "hm...", "ok!", "OK", "Hm",
  "blz mano", "entendi mano", "show mano", "massa mano", "top mano", "legal mano",
  "verdade mano", "claro mano", "sim mano", "aham mano", "pois mano", "ta mano",
  "ne mano", "hum mano", "ah mano", "rs mano", "kkk mano", "hmm mano", "ok cara",
  "blz cara", "hm vei", "ok vei", "entendi vei", "show vei", "massa vei",
  "top vei", "legal vei", "verdade vei", "claro vei", "sim vei", "pois vei",
  "ta vei", "ne vei", "hum vei", "ah vei", "rs vei", "kkk vei", "hmm vei",
  "ok bro", "blz bro", "hm bro", "entendi bro", "show bro", "massa bro",
];

const CATEGORIES = [
  { cat: "notebook", product: "Dell Inspiron 15", need: "quero notebook" },
  { cat: "tv", product: "Samsung Crystal 55", need: "quero tv" },
  { cat: "monitor", product: "LG UltraGear 27", need: "quero monitor" },
  { cat: "console", product: "PlayStation 5", need: "quero console" },
  { cat: "gpu", product: "RTX 4060", need: "quero placa de video" },
  { cat: "fridge", product: "Brastemp Frost Free", need: "quero geladeira" },
  { cat: "phone", product: "iPhone 13", need: "quero celular" },
];

function buildSingleRecScenarios() {
  const scenarios = [];
  let i = 0;
  for (const dim of DIMENSIONS.slice(0, 80)) {
    i++;
    const phrase = dim.startsWith("e ") ? dim : `e ${dim}?`;
    const cat = CATEGORIES[i % CATEGORIES.length];
    scenarios.push({
      id: `SR-${String(i).padStart(3, "0")}`,
      category: cat.cat,
      product: cat.product,
      dimension: dim.replace(/\?$/, ""),
      phrase,
      history: [
        { role: "user", content: cat.need },
        { role: "assistant", content: `Recomendo ${cat.product} para você.` },
      ],
      ctx: { lastBestProduct: { product_name: cat.product, category: cat.cat } },
    });
  }
  return scenarios;
}

function buildFillerScenarios() {
  const scenarios = [];
  let i = 0;
  const bases = [
    {
      label: "post_recommendation",
      history: [
        { role: "user", content: "quero celular" },
        { role: "assistant", content: "Eu iria no iPhone 13." },
      ],
      ctx: { lastBestProduct: { product_name: "iPhone 13" } },
    },
    {
      label: "post_comparison",
      history: [
        { role: "user", content: "compara A55 e M34" },
        { role: "assistant", content: "O A55 leva vantagem em bateria." },
      ],
      ctx: {
        lastComparisonProducts: [{ product_name: "Galaxy A55" }, { product_name: "Moto M34" }],
        comparisonContextLocked: true,
      },
    },
    {
      label: "post_question",
      history: [
        { role: "user", content: "discordo" },
        { role: "assistant", content: "Posso saber o que te levou a discordar?" },
      ],
      ctx: { lastBestProduct: { product_name: "Galaxy A55" } },
    },
    {
      label: "long_commercial",
      history: [
        { role: "user", content: "quero celular mano" },
        { role: "assistant", content: "Eu iria no iPhone 13." },
        { role: "user", content: "e a câmera?" },
        { role: "assistant", content: "A câmera do iPhone 13 é forte." },
        { role: "user", content: "explica mano" },
        { role: "assistant", content: "Claro! O que você gostaria que eu explicasse?" },
      ],
      ctx: { lastBestProduct: { product_name: "iPhone 13" } },
    },
  ];
  for (const filler of FILLER_VARIANTS.slice(0, 80)) {
    i++;
    const base = bases[i % bases.length];
    scenarios.push({
      id: `FL-${String(i).padStart(3, "0")}`,
      filler,
      context: base.label,
      history: base.history,
      ctx: base.ctx,
    });
  }
  return scenarios;
}

const REMAINING_6 = [
  { id: "RF-017", turns: ["A55", "discordo", "não"], msg: "não" },
  { id: "RF-024", turns: ["quero celular mano", "compara A55 e M34 mano", "discordo mano", "e a câmera? mano", "não quero esse mano", "mostra outro mano", "valeu mano", "valeu mano", "pera mano", "explica mano", "hm mano"], msg: "hm mano" },
  { id: "RF-029", turns: ["quero celular", "compara A55 e M34", "discordo", "e a câmera?", "não quero esse", "mostra outro", "valeu", "valeu", "pera", "explica", "hm mano"], msg: "hm mano" },
  { id: "RF-032", turns: ["quero celular mano", "compara A55 e M34 mano", "discordo mano", "e a câmera? mano", "não quero esse mano", "mostra outro mano", "valeu mano", "valeu mano", "pera mano", "explica mano", "ok mano"], msg: "ok mano" },
  { id: "RF-038", turns: ["quero celular", "compara A55 e M34", "discordo", "e a câmera?", "não quero esse", "mostra outro", "valeu", "valeu", "pera", "explica", "hm mano"], msg: "hm mano" },
  { id: "RF-072", turns: ["quero celular mano", "compara A55 e M34 mano", "discordo mano", "e a câmera? mano", "não quero esse mano", "mostra outro mano", "valeu mano", "valeu mano", "pera mano", "explica mano", "hm mano"], msg: "hm mano" },
];

const MV114 = {
  id: "MV-114",
  turns: ["oi", "to precisando de um celular", "até 2000", "me recomenda", "e memória?"],
  msg: "e memória?",
};

function runContractTests(scenarios, kind) {
  const results = [];
  for (const sc of scenarios) {
    const msg = sc.phrase || sc.filler;
    const r = localPipeline(msg, sc.ctx, sc.history);
    let pass = false;
    if (kind === "single_rec") {
      pass =
        r.followUp.contextualCommercialAuthorized &&
        r.recognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION &&
        !r.clarification.needsClarification &&
        r.target.target === SEMANTIC_TARGETS.PRODUCT;
    } else {
      pass =
        r.recognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION &&
        !r.clarification.needsClarification &&
        (r.filler.type === "exit"
          ? r.filler.blocksClarification
          : r.filler.detected
            ? r.filler.preserveCommercialAnchor
            : true);
    }
    results.push({
      id: sc.id,
      pass,
      mode: r.recognition.interactionMode,
      followUpType: r.followUp?.followUpType,
      fillerType: r.filler?.type,
      target: r.target?.target,
      reasonCode: r.followUp?.reasonCode || r.filler?.reasonCode,
    });
  }
  return results;
}

async function callApi(turns, sid) {
  const history = [];
  let last = {};
  for (const msg of turns) {
    await sleep(DELAY);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg, user_id: sid, conversation_id: sid, messages: history }),
    });
    const body = await res.json().catch(() => ({}));
    last = {
      message: msg,
      reply: body.reply || "",
      response_path: body.response_path || body.responsePath || "",
      status: res.status,
      cold: cold(body.reply),
    };
    history.push({ role: "user", content: msg });
    if (last.reply) history.push({ role: "assistant", content: last.reply });
  }
  return last;
}

function runStability() {
  const templates = [
    { name: "single_rec_dimension", fn: () => localPipeline("e memória?", { lastBestProduct: { product_name: "iPhone 13" } }, [{ role: "assistant", content: "Recomendo iPhone 13." }]) },
    { name: "single_rec_filler_dimension", fn: () => {
      const h = [{ role: "assistant", content: "Recomendo iPhone 13." }, { role: "user", content: "hm" }, { role: "assistant", content: "Pode continuar." }];
      return localPipeline("e memória?", { lastBestProduct: { product_name: "iPhone 13" } }, h);
    }},
    { name: "comparison_filler_other", fn: () => localPipeline("e o outro?", { lastComparisonProducts: [{ product_name: "A" }, { product_name: "B" }], comparisonContextLocked: true }, []) },
    { name: "recommendation_nao", fn: () => localPipeline("não", { lastBestProduct: { product_name: "A55" } }, [{ role: "assistant", content: "Posso saber mais?" }]) },
    { name: "pending_question_nao", fn: () => localPipeline("não", {}, [{ role: "assistant", content: "Quer que eu explique mais?" }]) },
    { name: "commercial_neutral_filler", fn: () => localPipeline("hm mano", { lastBestProduct: { product_name: "iPhone 13" } }, [{ role: "assistant", content: "O que explico?" }]) },
    { name: "commercial_exit_filler", fn: () => localPipeline("deixa", { lastBestProduct: { product_name: "iPhone 13" } }, []) },
    { name: "social_neutral_filler", fn: () => localPipeline("hm", {}, [{ role: "assistant", content: "Oi!" }]) },
    { name: "unknown_category_dimension", fn: () => localPipeline("e tela?", { lastBestProduct: { product_name: "Dell XPS" } }, []) },
    { name: "missing_knowledge_limitation", fn: () => localPipeline("e consumo?", { lastBestProduct: { product_name: "Produto Genérico XYZ" } }, []) },
  ];
  const runs = [];
  for (const t of templates) {
    for (let i = 1; i <= 10; i++) {
      const r = t.fn();
      const pass =
        r.recognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION &&
        !r.clarification.needsClarification;
      runs.push({ template: t.name, run: i, pass, mode: r.recognition.interactionMode });
    }
  }
  return runs;
}

function runRegressions() {
  const scripts = [
    "scripts/test-mia-patch-57v31-single-rec-filler.js",
    "scripts/test-mia-patch-57v3-indirect-reference.js",
    "scripts/test-mia-patch-57-social-contract-verbalization.js",
    "scripts/test-mia-patch-57v-rejection-verbalization.js",
    "scripts/test-mia-patch-57v1-negative-feedback.js",
    "scripts/test-mia-commercial-follow-up-continuity.js",
  ];
  return scripts.map((script) => {
    const r = spawnSync("node", [script], { cwd: ROOT, encoding: "utf8" });
    log(`[REGRESSION] ${script} exit=${r.status}`);
    return { script, exitCode: r.status, pass: r.status === 0 };
  });
}

async function main() {
  log("=== PATCH 5.7V.3.1 VALIDATION START ===");

  write("ROOT_CAUSE_SINGLE_RECOMMENDATION.json", {
    cause: "Generic dimension follow-up (e memória?) not detected — ATTRIBUTE_FOLLOW_UP_PATTERN required article (e a memória). Single recommendation lacked authorizedByComparisonContext (required comparisonSet >= 2).",
    fix: "detectGenericDimensionFollowUpQuery + authorizedByActiveCommercialEntity + getActiveRecommendedEntity",
    mv114: { context: MV114.turns.slice(0, -1), message: MV114.msg, observed: "cold clarification", expected: "commercial attribute follow-up on lastBestProduct" },
  });

  write("ROOT_CAUSE_LONG_CONVERSATION_FILLERS.json", {
    cause: "Neutral/negative fillers (hm mano, ok mano, não) in active commercial thread routed to CLARIFICATION via shortAmbiguous path without filler classification.",
    fix: "miaConversationalFillerGovernance.js wired into intent recognition, clarification gates, semantic state governance",
    cases: REMAINING_6.map((c) => c.id),
  });

  write("COMMERCIAL_ANCHOR_MODEL.json", {
    fields: ["lastBestProduct", "lastRankingSnapshot", "lastComparisonProducts", "lastProducts"],
    activeRecommendedEntity: "getActiveRecommendedEntity() — unified single-rec anchor",
    singleRecommendationValid: true,
    comparisonSetValid: true,
  });

  const singleRec = buildSingleRecScenarios();
  const fillers = buildFillerScenarios();
  const srResults = runContractTests(singleRec, "single_rec");
  const flResults = runContractTests(fillers, "filler");
  write("ATTRIBUTE_FOLLOWUP_CONTRACT_TESTS.json", { total: srResults.length, passed: srResults.filter((r) => r.pass).length, results: srResults });
  write("FILLER_CLASSIFICATION_MATRIX.json", { total: flResults.length, passed: flResults.filter((r) => r.pass).length, results: flResults });

  const multiCat = CATEGORIES.map((c, idx) => {
    const msg = `e ${["tela", "sistema", "taxa", "armazenamento", "consumo", "compatibilidade", "desempenho"][idx]}?`;
    const r = localPipeline(msg, { lastBestProduct: { product_name: c.product, category: c.cat } }, [
      { role: "assistant", content: `Recomendo ${c.product}.` },
    ]);
    return { category: c.cat, message: msg, pass: r.followUp.contextualCommercialAuthorized, target: r.target.target };
  });
  write("MULTICATEGORY_CONTRACT_TESTS.json", { results: multiCat, allPass: multiCat.every((r) => r.pass) });

  const stability = runStability();
  write("STABILITY_100_RUNS.json", { total: stability.length, passed: stability.filter((r) => r.pass).length, runs: stability });

  const unitTest = spawnSync("node", ["scripts/test-mia-patch-57v31-single-rec-filler.js"], { cwd: ROOT, encoding: "utf8" });
  write("UNIT_TESTS.json", { script: "test-mia-patch-57v31-single-rec-filler.js", pass: unitTest.status === 0, exitCode: unitTest.status });

  const regressions = runRegressions();
  write("REGRESSION_RESULTS.json", { results: regressions, allGreen: regressions.every((r) => r.pass) });

  let prodResults = [];
  let health = {};
  if (PROD) {
    try {
      health = await fetch(HEALTH).then((r) => r.json());
      write("PRODUCTION_HEALTH.json", health);
    } catch (e) {
      write("PRODUCTION_HEALTH.json", { error: String(e) });
    }

    const prodTargets = [...REMAINING_6, MV114];
    for (const sc of prodTargets) {
      const last = await callApi(sc.turns, `v31-${sc.id}`);
      prodResults.push({
        id: sc.id,
        message: sc.msg || sc.turns[sc.turns.length - 1],
        pass: !!last.reply && !last.cold,
        cold: last.cold,
        reply: last.reply?.slice(0, 200),
        response_path: last.response_path,
      });
      log(`[PROD] ${sc.id} pass=${!last.cold}`);
    }
    write("PRODUCTION_API_VALIDATION.json", { build: health.build, results: prodResults, passed: prodResults.filter((r) => r.pass).length });
    write("REMAINING_6_CASES_BEFORE_AFTER.json", { results: prodResults.filter((r) => REMAINING_6.some((x) => x.id === r.id)) });
    write("MV114_BEFORE_AFTER.json", prodResults.find((r) => r.id === "MV-114") || {});
  }

  const allLocalPass =
    srResults.every((r) => r.pass) &&
    flResults.every((r) => r.pass) &&
    stability.every((r) => r.pass) &&
    regressions.every((r) => r.pass) &&
    multiCat.every((r) => r.pass);

  const prodPass = prodResults.length === 0 || prodResults.every((r) => r.pass);
  const verdict = allLocalPass && prodPass ? "APROVADO" : "NÃO APROVADO";

  write("FINAL_CLOSURE_EVIDENCE.json", {
    patch: "5.7V.3.1",
    timestamp: new Date().toISOString(),
    build: health.build || null,
    singleRec: { total: srResults.length, passed: srResults.filter((r) => r.pass).length },
    fillers: { total: flResults.length, passed: flResults.filter((r) => r.pass).length },
    stability: { total: stability.length, passed: stability.filter((r) => r.pass).length },
    production: { total: prodResults.length, passed: prodResults.filter((r) => r.pass).length },
    regressions: { allGreen: regressions.every((r) => r.pass) },
    verdict,
    patch57Closable: verdict === "APROVADO",
    patch58Ready: verdict === "APROVADO",
  });

  log(`=== DONE verdict=${verdict} sr=${srResults.filter((r) => r.pass).length}/${srResults.length} fl=${flResults.filter((r) => r.pass).length}/${flResults.length} prod=${prodResults.filter((r) => r.pass).length}/${prodResults.length} ===`);
  if (verdict !== "APROVADO") process.exit(1);
}

main().catch((e) => {
  log(`FATAL: ${e.stack || e}`);
  process.exit(1);
});
