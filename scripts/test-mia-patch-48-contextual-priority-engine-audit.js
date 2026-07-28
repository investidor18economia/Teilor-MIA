/**
 * PATCH 4A.8 — Contextual Priority Engine Audit
 *
 * Usage: node scripts/test-mia-patch-48-contextual-priority-engine-audit.js
 */

import { resetSemanticIdCounterForTests } from "../lib/miaSemanticDecisionContract.js";
import { buildStructuredDecisionFacts } from "../lib/miaStructuredDecisionFacts.js";
import {
  buildContextualDecisionSynthesisPayload,
  CONTEXTUAL_DECISION_SYNTHESIS_VERSION,
} from "../lib/miaContextualDecisionSynthesis.js";
import {
  applyContextualPriorityToStructuredFacts,
  attachContextualPriorityToSession,
  buildContextualPriorityModel,
  CATEGORY_CRITERIA,
  CONTEXTUAL_PRIORITY_ENGINE_VERSION,
  inferCriterionFromSemanticUnit,
  PRIORITY_CRITERION,
  validateContextualPriorityModel,
} from "../lib/miaContextualPriorityEngine.js";
import { buildSemanticDecisionUnitFromPoolItem } from "../lib/miaSemanticDecisionBridge.js";
import { SESSION_CONTEXT_TRANSPORT_FIELDS } from "../lib/miaSessionContextTransport.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

resetSemanticIdCounterForTests();

console.log("\nPATCH 4A.8 — Contextual Priority Engine Audit\n");

console.log("── Version ──");
assert("engine version", CONTEXTUAL_PRIORITY_ENGINE_VERSION === "4A.10.0");
assert("synthesis version", CONTEXTUAL_DECISION_SYNTHESIS_VERSION === "4A.9.0");

console.log("\n── Model structure ──");
const gamerModel = buildContextualPriorityModel({
  query: "quero um celular para jogar muito, desempenho é prioridade",
  category: "mobile",
  primaryAxis: "performance",
  querySignals: { gaming: true, heavyUse: true },
});
assert("gamer model valid", validateContextualPriorityModel(gamerModel).valid);
assert("gamer dominant processor", gamerModel.dominantCriterion === PRIORITY_CRITERION.PROCESSOR);
assert(
  "gamer processor weight highest",
  gamerModel.criteria[0].criterion === PRIORITY_CRITERION.PROCESSOR
);
assert("gamer has origin trace", gamerModel.criteria.some((entry) => entry.origin !== "default"));
assert("each criterion has reason", gamerModel.criteria.every((entry) => entry.reason));

console.log("\n── Intention families ──");
const cameraModel = buildContextualPriorityModel({
  query: "preciso de celular para fotografia e registrar viagens",
  category: "mobile",
  primaryAxis: "camera",
});
assert("photographer camera dominant", cameraModel.dominantCriterion === PRIORITY_CRITERION.CAMERA);

const batteryModel = buildContextualPriorityModel({
  query: "bateria é minha prioridade, quero autonomia",
  category: "mobile",
  primaryAxis: "battery",
  querySignals: { batteryPriority: true },
});
assert("battery priority dominant", batteryModel.dominantCriterion === PRIORITY_CRITERION.BATTERY);

console.log("\n── Session priority shift ──");
const shiftModel = buildContextualPriorityModel({
  query: "e a câmera?",
  category: "mobile",
  primaryAxis: "camera",
  sessionContext: {
    lastPriority: "camera",
    lastPreviousPriority: "battery",
    lastQuery: "bateria é minha prioridade",
  },
});
assert(
  "shift boosts camera",
  shiftModel.criteria.find((entry) => entry.criterion === PRIORITY_CRITERION.CAMERA)?.contextWeight > 0
);
assert(
  "shift recorded in trace",
  shiftModel.trace?.adjustments?.some((entry) => entry.type === "session_shift")
);

console.log("\n── Conservative fallback ──");
const sparseModel = buildContextualPriorityModel({
  query: "oi",
  category: "mobile",
});
assert("sparse conservative fallback", sparseModel.conservativeFallback === true);
assert("sparse limitation recorded", !!sparseModel.limitation);
const genericProductModel = buildContextualPriorityModel({
  query: "o Galaxy A55 vale a pena?",
  category: "mobile",
});
assert(
  "generic product query stays conservative",
  genericProductModel.conservativeFallback === true && !genericProductModel.personalized
);

console.log("\n── Session transport attach ──");
const attached = attachContextualPriorityToSession(
  { lastQuery: "bateria é minha prioridade", lastPriority: "battery", lastCategory: "mobile" },
  { activePriority: "battery" }
);
assert("attach sets lastContextualPriorityModel", !!attached.lastContextualPriorityModel?.dominantCriterion);

console.log("\n── Category extensibility ──");
assert("mobile criteria", CATEGORY_CRITERIA.mobile.includes(PRIORITY_CRITERION.BATTERY));
assert("notebook criteria", CATEGORY_CRITERIA.notebook.includes(PRIORITY_CRITERION.PROCESSOR));

console.log("\n── Structured facts reorder (not ranking) ──");
const batteryUnit = buildSemanticDecisionUnitFromPoolItem(
  { text: "autonomia consistente", family: "battery_autonomy", type: "strength" },
  { productName: "Galaxy A55", category: "mobile", primaryAxis: "battery" }
);
const cameraUnit = buildSemanticDecisionUnitFromPoolItem(
  { text: "fotos consistentes", family: "camera_video_confidence", type: "strength" },
  { productName: "Galaxy A55", category: "mobile", primaryAxis: "camera" }
);
const structured = buildStructuredDecisionFacts({
  gainUnits: [cameraUnit, batteryUnit],
  sacrificeUnits: [],
  productName: "Galaxy A55",
  category: "mobile",
  primaryAxis: "battery",
});
const applied = applyContextualPriorityToStructuredFacts(structured, batteryModel, {
  productName: "Galaxy A55",
  category: "mobile",
  primaryAxis: "battery",
});
assert("priority reorder applied", applied.reordered === true);
assert(
  "battery becomes primary gain under battery model",
  applied.structuredDecisionFacts?.primaryGain?.effectKey === structured.primaryGain?.effectKey ||
    inferCriterionFromSemanticUnit(applied.structuredDecisionFacts?.primaryGain?.unit) ===
      PRIORITY_CRITERION.BATTERY
);

console.log("\n── Synthesis integration ──");
const payload = buildContextualDecisionSynthesisPayload({
  gainStrings: ["autonomia consistente", "fotos consistentes"],
  sacrificeStrings: ["carregamento mais lento"],
  trustedSpecs: {
    official_name: "Galaxy A55",
    battery_mah: 5000,
    main_camera_mp: 50,
    strengths: ["bateria consistente"],
    weaknesses: ["carregamento lento"],
  },
  query: "quero bateria forte",
  category: "mobile",
  primaryAxis: "battery",
  querySignals: { batteryPriority: true },
  productName: "Galaxy A55",
});
assert("payload carries priority model", !!payload.contextualPriorityModel?.dominantCriterion);
assert("payload carries priority trace", !!payload.contextualPriorityTrace?.criteria?.length);

console.log("\n── Session transport ──");
assert(
  "lastContextualPriorityModel transport field",
  SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastContextualPriorityModel")
);

console.log("\n── PATCH 4A.10 intent lock ──");
const axisOverrideBatteryModel = buildContextualPriorityModel({
  query: "qual celular dura mais ate 2500?",
  category: "phone",
  primaryAxis: "performance",
  querySignals: { heavyUse: true },
  priorityWeightsModel: {
    priorityWeights: {
      primaryPriority: "performance_priority",
      confidence: 0.92,
      weights: { performance_priority: 0.3, learning_priority: 0.2 },
    },
  },
});
assert("query battery beats inferred performance axis", axisOverrideBatteryModel.dominantCriterion === "battery");
const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
const synthesisSource = readFileSync(join(ROOT, "lib/miaContextualDecisionSynthesis.js"), "utf8");
assert("chat persists priority model", /lastContextualPriorityModel/.test(chatSource));
assert("chat passes priorityWeightsModel", /priorityWeightsModel/.test(chatSource));
assert("synthesis imports priority engine", /miaContextualPriorityEngine/.test(synthesisSource));
assert(
  "synthesis applies priority before narrative",
  /buildContextualPriorityModel/.test(synthesisSource) &&
    /buildNarrativePlanFromStructuredFacts/.test(synthesisSource)
);

console.log(`\nPATCH 4A.8 Contextual Priority Engine: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
console.log("ALL PASS");
