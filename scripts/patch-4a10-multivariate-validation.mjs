#!/usr/bin/env node
/**
 * PATCH 4A.10 — Multivariate fidelity, generalization & narrative audit
 *
 * Usage:
 *   node scripts/patch-4a10-multivariate-validation.mjs
 *   PATCH4A10_MODE=production node scripts/patch-4a10-multivariate-validation.mjs
 *   PATCH4A10_FAMILIES=battery,camera node scripts/patch-4a10-multivariate-validation.mjs
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { detectAbsoluteClaimsOnSurface } from "../lib/miaAbsoluteClaimGovernance.js";
import {
  computeRepetitionMetrics,
  detectBrokenSurfaceGrammar,
  validateComposedSurface,
} from "../lib/miaVerbalizationCompositionGuard.js";
import { detectDominantOpeningTemplate } from "../lib/miaVerbalizationStyleGovernor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH4A10_MODE || "local";
const BASE =
  MODE === "production"
    ? process.env.PATCH4A10_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH4A10_LOCAL_BASE_URL || "http://localhost:3008";
const CHAT_URL = `${BASE}/api/mia-chat`;
const DELAY = Number(process.env.PATCH4A10_CHAT_DELAY_MS || 6000);
const STABILITY_RUNS = Number(process.env.PATCH4A10_STABILITY_RUNS || 2);
const FAMILY_FILTER = (process.env.PATCH4A10_FAMILIES || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(
  EVIDENCE_DIR,
  MODE === "production"
    ? "PATCH_4A_10_PRODUCTION_MULTIVARIATE_EVIDENCE.json"
    : "PATCH_4A_10_LOCAL_MULTIVARIATE_EVIDENCE.json"
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendChat(message, sessionContext = {}, messages = [], conversationId = "") {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        messages,
        session_context: sessionContext,
        conversation_id: conversationId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    const reply = String(json?.reply || json?.message || "").trim();
    const result = {
      status: res.status,
      reply,
      sessionContext: json?.session_context || {},
    };
    if (res.status === 200 && reply.length >= 20) return result;
    if (attempt === 0 && (res.status >= 500 || reply.length < 20)) {
      await sleep(DELAY);
      continue;
    }
    return result;
  }
  return { status: 500, reply: "", sessionContext: {} };
}

function extractArchitectureSnapshot(session = {}) {
  const priority = session?.lastContextualPriorityModel;
  const domain = session?.lastDomainKnowledgeModel;
  return {
    intent: session?.lastIntent || null,
    priority: session?.lastPriority || null,
    category: session?.lastCategory || null,
    dominantCriterion: priority?.dominantCriterion || null,
    priorityPersonalized: !!priority?.personalized,
    priorityConservative: !!priority?.conservativeFallback,
    domainId: domain?.domain || null,
    domainItemCount: domain?.itemCount || domain?.items?.length || 0,
    practicalConsequenceCount: session?.lastPracticalConsequences?.length || 0,
    hasStructuredFacts: !!session?.lastStructuredDecisionFacts?.semanticUnits?.length,
    hasNarrativePlan: !!session?.lastNarrativePlan,
    hasVerbalizationPlan: !!session?.lastVerbalizationPlan,
    winner: session?.lastBestProduct?.product_name || null,
  };
}

function analyzeNarrativeQuality(reply = "") {
  const absolute = detectAbsoluteClaimsOnSurface(reply);
  const grammar = detectBrokenSurfaceGrammar(reply);
  const repetition = computeRepetitionMetrics(reply);
  const surface = validateComposedSurface(reply);
  const dominantOpening = detectDominantOpeningTemplate(reply);
  return {
    absoluteClaims: absolute.detected,
    absoluteSamples: absolute.samples || [],
    brokenGrammar: grammar.detected,
    duplicateSentenceCount: repetition.duplicateSentenceCount,
    dominantPhraseRepeats: repetition.dominantPhraseRepeats,
    surfaceValid: surface.pass,
    surfaceIssues: surface.grammar?.reasons || [],
    dominantOpeningTemplate: dominantOpening.detected,
    replyLength: reply.length,
  };
}

function scoreDimensions(reply, arch, narrative, expectations = {}) {
  const fidelity =
    !narrative.absoluteClaims &&
    narrative.surfaceValid &&
    !narrative.brokenGrammar &&
    (expectations.allowAbsolute !== true);
  const naturalness =
    reply.length >= (expectations.minLen ?? 35) &&
    !narrative.dominantOpeningTemplate &&
    (narrative.duplicateSentenceCount ?? 0) < 1;
  const consistency = expectations.requireWinner
    ? !!arch.winner
    : expectations.requireNoWinner
      ? !arch.winner
      : true;
  const personalization =
    !expectations.expectedDominant ||
    arch.dominantCriterion === expectations.expectedDominant ||
    !arch.dominantCriterion;
  return { fidelity, naturalness, consistency, personalization };
}

function analyzeTurn(reply, session, expectations = {}) {
  const arch = extractArchitectureSnapshot(session);
  const narrative = analyzeNarrativeQuality(reply);
  const dimensions = scoreDimensions(reply, arch, narrative, expectations);

  const hasArchitecture = !!arch.dominantCriterion || arch.hasStructuredFacts || !!arch.winner;
  const clarificationReply =
    /faixa de pre[cç]o|or[cç]amento|explica.*melhor|me diz|qual produto|consigo ser mais precisa|entendi o uso/i.test(
      reply
    );

  const intentMatch =
    !expectations.expectedDominant ||
    arch.dominantCriterion === expectations.expectedDominant ||
    (expectations.clarificationOk && !hasArchitecture && clarificationReply);

  const pass =
    expectations.httpStatus === 200 &&
    reply.length >= (expectations.minLen ?? 35) &&
    !narrative.absoluteClaims &&
    !narrative.brokenGrammar &&
    narrative.surfaceValid &&
    intentMatch &&
    (!expectations.requireArchitecture || hasArchitecture) &&
    (!expectations.requireStructuredFacts || arch.hasStructuredFacts) &&
    (!expectations.requireDomain || arch.domainId === "mobile" || arch.domainItemCount > 0) &&
    (!expectations.requireConservative || arch.priorityConservative || !arch.priorityPersonalized);

  return { arch, narrative, dimensions, pass, intentMatch };
}

/** Scenario families with linguistic variations */
const FAMILY_DEFINITIONS = {
  battery: {
    title: "Bateria / autonomia",
    expectedDominant: "battery",
    flexibleIntent: true,
    requireArchitecture: true,
    variations: [
      "qual celular dura mais ate 2500?",
      "qual celular tem a bateria melhor ate 2000?",
      "qual aguenta mais tempo longe da tomada ate 2500?",
      "quero um celular q nao me deixe na mao ate 1800",
      "o que segura um dia inteiro ate 2200?",
      "nao quero carregar toda hora, qual celular ate 2000?",
    ],
  },
  camera: {
    title: "Câmera / fotos",
    expectedDominant: "camera",
    flexibleIntent: true,
    requireArchitecture: true,
    variations: [
      "quero celular com camera boa ate 2500",
      "quero celular pra foto e video ate 3000, qual vale a pena?",
      "qual tira foto melhor ate 2000?",
      "to procurando smartphone com boa cam ate 2000",
      "fotografia eh minha prioridade, ate 2500",
    ],
  },
  games: {
    title: "Jogos / desempenho",
    expectedDominant: "processor",
    flexibleIntent: true,
    requireArchitecture: true,
    variations: [
      "quero celular pra jogar ate 2500",
      "preciso de desempenho pra games ate 3000",
      "qual roda jogo pesado melhor ate 2500?",
      "smartphone gamer barato ate 2000",
    ],
  },
  work: {
    title: "Trabalho",
    expectedDominant: "processor",
    flexibleIntent: true,
    requireArchitecture: true,
    variations: [
      "preciso de celular produtivo pro trabalho ate 2500",
      "preciso de um aparelho produtivo pro dia a dia profissional ate 3000",
      "smartphone pra home office ate 3000, qual recomenda?",
    ],
  },
  study: {
    title: "Estudo",
    expectedDominant: "value",
    flexibleIntent: true,
    requireArchitecture: true,
    variations: [
      "celular bom pra estudar e assistir aula ate 1500, qual vale a pena?",
      "quero um aparelho pra faculdade ate 1800",
      "smartphone pra estudante custo beneficio ate 1500",
    ],
  },
  value: {
    title: "Custo-benefício",
    expectedDominant: "value",
    flexibleIntent: true,
    requireArchitecture: true,
    variations: [
      "qual celular tem melhor custo beneficio ate 1500?",
      "quero o melhor bang for buck ate 1500",
      "smartphone barato q preste ate 1200",
      "nao quero gastar muito, qual smartphone decente ate 1500?",
      "melhor relacao preco qualidade ate 1500",
    ],
  },
  updates: {
    title: "Atualizações",
    expectedDominant: null,
    requireDomain: true,
    flexibleIntent: true,
    variations: [
      "o Galaxy A55 vale a pena considerando as atualizacoes?",
      "qual celular recebe update por mais tempo?",
      "quero android com update longo",
    ],
  },
  comparison: {
    title: "Comparação",
    expectedDominant: null,
    flexibleIntent: true,
    variations: [
      "Galaxy S23 FE ou Pixel 8, qual vale mais?",
      "compara iphone 13 com moto g84",
      "qual eh melhor redmi note 13 ou galaxy a55?",
      "diferenca entre edge 40 e pixel 8",
    ],
  },
  contestation: {
    title: "Contestação",
    expectedDominant: null,
    flexibleIntent: true,
    minLen: 25,
    variations: [
      "nao concordo, acho q a bateria eh fraca",
      "mas eu ouvi q esquenta muito",
      "na verdade prefiro samsung",
      "discordo, quero algo mais barato",
    ],
  },
  unknown_product: {
    title: "Produto desconhecido",
    expectedDominant: null,
    minLen: 35,
    variations: [
      "o ZPhone ZX9000 Ultra vale a pena?",
      "smartphone XPhone Pro Max 2029 eh bom?",
      "vale comprar o FoneTech Ultra Z9?",
    ],
  },
  unknown_brand: {
    title: "Marca desconhecida",
    expectedDominant: null,
    minLen: 35,
    variations: [
      "celular da marca Zentron vale a pena?",
      "smartphone NoNameTech eh confiavel?",
    ],
  },
  unknown_category: {
    title: "Categoria desconhecida",
    expectedDominant: null,
    minLen: 25,
    variations: [
      "qual cadeira ergonomica voce recomenda?",
      "melhor liquidificador industrial ate 500?",
    ],
  },
};

const MULTI_TURN_SCENARIOS = [
  {
    id: "follow-up",
    family: "follow_up",
    title: "Follow-up contextual",
    turns: [
      { message: "quero um celular com boa bateria ate 2000" },
      { message: "e a camera, como eh?" },
      { message: "qual vc recomenda entao?" },
    ],
  },
  {
    id: "refinement",
    family: "refinement",
    title: "Refinamento de busca",
    turns: [
      { message: "quero celular samsung ate 2500" },
      { message: "prefiro linha A, nao S" },
      { message: "o A55 vale a pena?" },
    ],
  },
  {
    id: "priority-shift",
    family: "priority_change",
    title: "Mudança de prioridade / contradição",
    turns: [
      { message: "quero celular com bateria boa ate 2500" },
      { message: "agora camera ficou mais importante" },
      { message: "na verdade desempenho pesou mais" },
      { message: "esquece, quero melhor custo beneficio" },
      { message: "o que vc recomenda agora?" },
    ],
  },
  {
    id: "long-conversation",
    family: "long_conversation",
    title: "Conversa longa (10+ turnos)",
    turns: [
      { message: "oi, to procurando celular novo" },
      { message: "uso muito instagram e whats" },
      { message: "bateria eh importante pq viajo" },
      { message: "orcamento ate 2200" },
      { message: "prefiro samsung ou motorola" },
      { message: "galaxy a55 parece interessante" },
      { message: "ele esquenta muito?" },
      { message: "e as atualizacoes?" },
      { message: "tem algo melhor pelo mesmo preco?" },
      { message: "ok, qual vc recomenda?" },
      { message: "pode resumir os prós e contras?" },
    ],
  },
];

const STABILITY_SCENARIOS = [
  { id: "stab-battery", message: "qual celular dura mais ate 2500?", expectedDominant: "battery" },
  { id: "stab-value", message: "melhor custo beneficio ate 1500", expectedDominant: "value" },
  { id: "stab-galaxy-fe", message: "o Galaxy S23 FE vale a pena?", requireDomain: true },
];

/** Extra family discovered during audit — vague input without budget */
const DISCOVERED_FAMILIES = {
  vague_clarification: {
    title: "Ambiguidade — clarificação honesta (descoberta na auditoria)",
    expectedDominant: null,
    clarificationOk: true,
    minLen: 35,
    variations: [
      "qual tem bateria melhor?",
      "quero celular com camera boa",
      "melhor relacao preco qualidade",
    ],
  },
};

const scenarios = [];
const coverage = {
  families: {},
  totalVariations: 0,
  totalTurns: 0,
  totalScenarios: 0,
  categories: new Set(),
  intentsObserved: new Set(),
};

async function runSingleVariation(familyId, familyDef, message, index) {
  const conversationId = randomUUID();
  await sleep(DELAY);
  const result = await sendChat(message, {}, [{ role: "user", content: message }], conversationId);
  const analysis = analyzeTurn(result.reply, result.sessionContext, {
    httpStatus: result.status,
    expectedDominant: familyDef.expectedDominant,
    flexibleIntent: familyDef.flexibleIntent,
    requireDomain: familyDef.requireDomain,
    requireArchitecture: familyDef.requireArchitecture,
    clarificationOk: familyDef.clarificationOk,
    minLen: familyDef.minLen,
  });

  coverage.totalTurns += 1;
  if (analysis.arch.category) coverage.categories.add(analysis.arch.category);
  if (analysis.arch.dominantCriterion) coverage.intentsObserved.add(analysis.arch.dominantCriterion);
  if (analysis.arch.intent) coverage.intentsObserved.add(analysis.arch.intent);

  const scenarioId = `${familyId}-v${index + 1}`;
  const record = {
    id: scenarioId,
    family: familyId,
    title: `${familyDef.title} — variação ${index + 1}`,
    environment: MODE,
    message,
    pass: result.status === 200 && analysis.pass,
    architecture: analysis.arch,
    narrative: analysis.narrative,
    dimensions: analysis.dimensions,
    intentMatch: analysis.intentMatch,
    replyPreview: result.reply.slice(0, 280),
  };

  scenarios.push(record);
  if (!coverage.families[familyId]) {
    coverage.families[familyId] = { tested: 0, passed: 0, variations: familyDef.variations.length };
  }
  coverage.families[familyId].tested += 1;
  if (record.pass) coverage.families[familyId].passed += 1;

  console.log(`${record.pass ? "PASS" : "FAIL"} [${scenarioId}] ${message.slice(0, 50)}`);
  return record.pass;
}

async function runMultiTurnScenario(def) {
  const conversationId = randomUUID();
  let session = {};
  const messageHistory = [];
  const transcript = [];
  let scenarioPass = true;

  for (const turn of def.turns) {
    await sleep(turn.delay ?? DELAY);
    messageHistory.push({ role: "user", content: turn.message });
    const result = await sendChat(turn.message, session, messageHistory, conversationId);
    session = result.sessionContext || session;
    const analysis = analyzeTurn(result.reply, session, {
      httpStatus: result.status,
      flexibleIntent: true,
      minLen: turn.minLen ?? 25,
    });
    coverage.totalTurns += 1;
    if (analysis.arch.category) coverage.categories.add(analysis.arch.category);
    if (analysis.arch.dominantCriterion) coverage.intentsObserved.add(analysis.arch.dominantCriterion);

    const turnPass = result.status === 200 && analysis.pass;
    if (!turnPass) scenarioPass = false;
    transcript.push({
      turn: transcript.length + 1,
      user: turn.message,
      assistantPreview: result.reply.slice(0, 220),
      architecture: analysis.arch,
      narrative: analysis.narrative,
      dimensions: analysis.dimensions,
      pass: turnPass,
    });
  }

  const record = {
    id: def.id,
    family: def.family,
    title: def.title,
    environment: MODE,
    pass: scenarioPass,
    turnCount: def.turns.length,
    transcript,
  };
  scenarios.push(record);

  if (!coverage.families[def.family]) {
    coverage.families[def.family] = { tested: 1, passed: scenarioPass ? 1 : 0, variations: def.turns.length };
  } else {
    coverage.families[def.family].tested += 1;
    if (scenarioPass) coverage.families[def.family].passed += 1;
  }

  console.log(`${scenarioPass ? "PASS" : "FAIL"} [${def.id}] ${def.title} (${def.turns.length} turnos)`);
  return scenarioPass;
}

async function runStabilityScenario(def, runIndex) {
  const conversationId = randomUUID();
  await sleep(DELAY);
  const result = await sendChat(def.message, {}, [{ role: "user", content: def.message }], conversationId);
  const analysis = analyzeTurn(result.reply, result.sessionContext, {
    httpStatus: result.status,
    expectedDominant: def.expectedDominant,
    requireDomain: def.requireDomain,
    flexibleIntent: true,
  });
  coverage.totalTurns += 1;

  const record = {
    id: `${def.id}-run${runIndex + 1}`,
    family: "stability",
    title: `Estabilidade — ${def.id} run ${runIndex + 1}`,
    environment: MODE,
    message: def.message,
    pass: result.status === 200 && analysis.pass,
    architecture: analysis.arch,
    narrative: analysis.narrative,
    dimensions: analysis.dimensions,
  };
  scenarios.push(record);
  console.log(`${record.pass ? "PASS" : "FAIL"} [${record.id}]`);
  return record.pass;
}

console.log(`\nPATCH 4A.10 — Multivariate validation (${MODE})\nBase: ${BASE}\n`);

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const results = [];
const familiesToRun = FAMILY_FILTER.length
  ? Object.fromEntries(
      Object.entries({ ...FAMILY_DEFINITIONS, ...DISCOVERED_FAMILIES }).filter(([id]) =>
        FAMILY_FILTER.includes(id)
      )
    )
  : { ...FAMILY_DEFINITIONS, ...DISCOVERED_FAMILIES };

for (const [familyId, familyDef] of Object.entries(familiesToRun)) {
  coverage.totalVariations += familyDef.variations.length;
  for (let i = 0; i < familyDef.variations.length; i += 1) {
    results.push(await runSingleVariation(familyId, familyDef, familyDef.variations[i], i));
  }
}

for (const def of MULTI_TURN_SCENARIOS) {
  coverage.totalVariations += def.turns.length;
  results.push(await runMultiTurnScenario(def));
}

for (const def of STABILITY_SCENARIOS) {
  for (let run = 0; run < STABILITY_RUNS; run += 1) {
    coverage.totalVariations += 1;
    results.push(await runStabilityScenario(def, run));
  }
}

coverage.totalScenarios = scenarios.length;

function computeConvergence(familyId) {
  const strict = scenarios.filter(
    (entry) => entry.family === familyId && entry.architecture?.dominantCriterion
  );
  if (strict.length < 2) return { family: familyId, samples: strict.length, converged: null };
  const dominant = strict.map((entry) => entry.architecture.dominantCriterion);
  const unique = [...new Set(dominant)];
  return {
    family: familyId,
    samples: strict.length,
    converged: unique.length === 1,
    dominantCriteria: unique,
  };
}

const convergence = Object.keys(FAMILY_DEFINITIONS)
  .map((familyId) => computeConvergence(familyId))
  .filter((entry) => entry.samples >= 2);

const passed = results.filter(Boolean).length;
const failed = results.length - passed;

const REQUIRED_FAMILIES = [
  "battery",
  "camera",
  "games",
  "work",
  "study",
  "value",
  "updates",
  "comparison",
  "contestation",
  "follow_up",
  "refinement",
  "priority_change",
  "unknown_product",
  "unknown_brand",
  "unknown_category",
  "vague_clarification",
  "long_conversation",
  "stability",
];

const familiesExercised = REQUIRED_FAMILIES.filter(
  (id) => coverage.families[id]?.tested > 0 || id === "stability"
);
const stabilityFamily = scenarios.some((s) => s.family === "stability");
if (stabilityFamily && !familiesExercised.includes("stability")) {
  familiesExercised.push("stability");
}

const payload = {
  patch: "4A.10",
  phase: "multivariate_robustness_audit",
  status: failed === 0 ? "APROVADA" : "BLOQUEADA",
  mode: MODE,
  base_url: BASE,
  commit: localCommit,
  finished_at: new Date().toISOString(),
  summary: {
    passed,
    failed,
    total: results.length,
    scenarioRecords: scenarios.length,
    turns: coverage.totalTurns,
    variations: coverage.totalVariations,
  },
  coverage: {
    absolute: {
      intentionsTested: [...coverage.intentsObserved],
      variations: coverage.totalVariations,
      scenarios: coverage.totalScenarios,
      turns: coverage.totalTurns,
      categories: [...coverage.categories],
      families: coverage.families,
    },
    relative: {
      familiesRequired: REQUIRED_FAMILIES.length,
      familiesExercised: familiesExercised.length,
      familiesMissing: REQUIRED_FAMILIES.filter((id) => !familiesExercised.includes(id)),
      coveragePercent: null,
      coveragePercentNote:
        "NULL — denominador de famílias futuras (notebook, TV, etc.) não possui baseline confiável neste PATCH.",
      limitations: [
        "Bateria de variações cobre mobile como categoria principal",
        "Cenários dependem de catálogo comercial disponível no ambiente",
        "Estabilidade testada com 2 execuções por cenário crítico",
        "Variações vagas sem orçamento exercitadas na família vague_clarification (descoberta na auditoria)",
      ],
    },
    convergence,
  },
  scenarios,
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(payload, null, 2));

console.log(`\nPATCH 4A.10 (${MODE}): ${passed}/${results.length} checks passed`);
console.log(`Turns: ${coverage.totalTurns} | Variations: ${coverage.totalVariations}`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(failed === 0 ? 0 : 1);
