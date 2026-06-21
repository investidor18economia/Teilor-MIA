/**
 * PATCH 9.2M — Semantic Family Allocation Engine
 *
 * Coordena famílias semânticas entre camadas specialist para evitar
 * repetição de consequências entre decisão, evidência, insight e tradeoff.
 */

import { normalizeDataLayerSemanticField, normalizeTrustedSpecsSemanticFields } from "./miaDataLayerSemanticNormalizer.js";
import {
  extractConsequenceTexts,
  translateDataLayerFieldsToConsequences,
} from "./miaConsequenceTranslationLayer.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";

export const SEMANTIC_FAMILY_ALLOCATION_VERSION = "9.2M.1";

export const SEMANTIC_FAMILIES = Object.freeze([
  "camera_video_confidence",
  "performance_longevity",
  "battery_autonomy",
  "ecosystem_software",
  "display_smoothness",
  "charging_speed",
  "price_value_risk",
  "durability_reliability",
  "comfort_usability",
  "size_capacity",
  "portability",
  "maintenance_cleaning",
  "safety_risk",
  "availability_trust",
  "generic_fit",
  "unknown",
]);

const AXIS_FAMILY_PRIORITY = Object.freeze({
  performance: ["performance_longevity", "camera_video_confidence", "ecosystem_software"],
  camera: ["camera_video_confidence", "performance_longevity", "display_smoothness"],
  battery: ["battery_autonomy", "performance_longevity", "charging_speed"],
  screen: ["display_smoothness", "camera_video_confidence", "performance_longevity"],
  longevity: ["ecosystem_software", "performance_longevity", "durability_reliability"],
  value: ["price_value_risk", "generic_fit", "performance_longevity"],
  storage: ["size_capacity", "performance_longevity", "generic_fit"],
  comfort: ["comfort_usability", "portability", "generic_fit"],
});

const TOKEN_FAMILY_RULES = Object.freeze([
  ["camera_video_confidence", /camera|câmera|camara|foto|fotos|selfie|video|vídeo|gravar|filmagem|registrar|momentos/i],
  ["performance_longevity", /desempenho|performance|processador|chip|rapido|rápido|travar|limite|pesado|multitarefa|longevidade|anos|obsolesc/i],
  ["battery_autonomy", /bateria|autonomia|durar|mah|carga|tomada|recarga/i],
  ["ecosystem_software", /ios|android|ecossistema|software|sistema|apps|atualiza/i],
  ["display_smoothness", /tela|display|hz|fluidez|brilho|painel|amolec|oled|lcd/i],
  ["charging_speed", /carregamento|carregar|carregador|watts|usb-c/i],
  ["durability_reliability", /longevidade|longevo|durabilidade|anos_uso|permanecer/i],
  ["price_value_risk", /preco|preço|caro|barato|custo|valor|orcamento|orçamento|econom/i],
  ["maintenance_cleaning", /limpeza|limpar|manutencao|manutenção|filtro|lavar|desmontar/i],
  ["size_capacity", /capacidade|litros|volume|tamanho|espaco|espaço|interno/i],
  ["portability", /peso|portabil|portatil|portátil|levar|mochila|compacto|transportar/i],
  ["comfort_usability", /conforto|ergonom|usabilidade|pratico|prático/i],
  ["durability_reliability", /longevidade|permanecer|manter o equipamento|obsolesc|durabilidade|vários anos|tranquilidade para manter/i],
  ["safety_risk", /risco|seguranca|segurança|queima|superaquec/i],
  ["availability_trust", /revenda|disponibilidade|garantia|loja|confianca|confiança/i],
]);

const TEXT_FAMILY_RULES = Object.freeze([
  ["camera_video_confidence", /registrar bons momentos|foto|fotos|câmera|camera|vídeo|video|gravar|momentos|selfie|segunda chance|situações difíceis|bons resultados em situa/i],
  ["performance_longevity", /desempenho|limite|uso pesado|pesado|folga|multitarefa|performance|chegar ao limite/i],
  ["battery_autonomy", /bateria|autonomia|recarga|tomada|durar o dia/i],
  ["ecosystem_software", /ecossistema|ios|android|software|atualiza|apps|previsibilidade no uso diário dentro de um ecossistema/i],
  ["display_smoothness", /fluida|fluidez|60|hz|tela|navegação|painel|display/i],
  ["charging_speed", /carregamento|carregar|carregador/i],
  ["price_value_risk", /preço|preco|custo|barato|caro|orçamento|valor|retorno pelo que você vai gastar/i],
  ["maintenance_cleaning", /limpeza|limpar|manutenção|manutencao|filtro/i],
  ["size_capacity", /capacidade|litros|volume|folga para o uso previsto/i],
  ["portability", /portátil|portatil|portabil|peso|mochila|transportar/i],
  ["comfort_usability", /conforto|ergonom|usabilidade/i],
  ["durability_reliability", /durabilidade|confiável|confiavel|resistente/i],
  ["generic_fit", /combina com o perfil|uso cotidiano|ganho perceptível|renúncia perceptível/i],
]);

const MICRO_CAMERA_PATTERNS =
  /segunda chance|situações rápidas|registrar bons momentos|repetir a foto/i;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
}

/**
 * @param {string} token
 * @param {Record<string, unknown>} [context]
 */
export function inferSemanticFamilyFromToken(token = "", context = {}) {
  const body = cleanText(String(token || "").replace(/_/g, " "));
  if (!body) return "unknown";

  for (const [family, pattern] of TOKEN_FAMILY_RULES) {
    if (pattern.test(body)) return family;
  }

  const axis = cleanText(context.primaryAxis || "");
  if (axis && AXIS_FAMILY_PRIORITY[axis]?.[0]) {
    return AXIS_FAMILY_PRIORITY[axis][0];
  }

  return "generic_fit";
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} [context]
 */
export function inferSemanticFamilyFromText(text = "", context = {}) {
  const body = cleanText(text);
  if (!body) return "unknown";

  if (context.token) {
    const fromToken = inferSemanticFamilyFromToken(context.token, context);
    if (fromToken !== "generic_fit" && fromToken !== "unknown") {
      return fromToken;
    }
  }

  const families = new Set();
  for (const [family, pattern] of TEXT_FAMILY_RULES) {
    if (pattern.test(body)) families.add(family);
  }

  if (families.size === 1) return [...families][0];
  if (families.size > 1) {
    if (families.has("camera_video_confidence") && /vídeo|video|gravar|foto|registrar/i.test(body)) {
      return "camera_video_confidence";
    }
    if (families.has("performance_longevity") && /limite|pesado|desempenho/i.test(body)) {
      return "performance_longevity";
    }
    return [...families][0];
  }

  if (context.type === "weakness" || context.type === "sacrifice") {
    return inferSemanticFamilyFromToken(body.replace(/\s+/g, "_"), context);
  }

  return inferSemanticFamilyFromToken(body.replace(/\s+/g, "_"), context);
}

export function createSemanticAllocationState() {
  return {
    usedFamilies: {},
    layerAssignments: {},
    candidatesByFamily: {},
    skippedDueToDuplication: [],
    fallbackUsed: false,
    usedTexts: [],
  };
}

/**
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {string} family
 * @param {string} layer
 * @param {{ text?: string, token?: string }} [meta]
 */
export function markFamilyUsed(state, family, layer, meta = {}) {
  if (!state || !family) return state;

  const key = family || "unknown";
  if (!state.usedFamilies[key]) {
    state.usedFamilies[key] = [];
  }
  state.usedFamilies[key].push(layer);
  state.layerAssignments[layer] = {
    family: key,
    text: cleanText(meta.text || ""),
    token: cleanText(meta.token || ""),
  };

  const textKey = normalizeKey(meta.text || "");
  if (textKey && !state.usedTexts.includes(textKey)) {
    state.usedTexts.push(textKey);
  }

  return state;
}

/**
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {string} family
 * @param {{ allowRepeatLayer?: string, maxUses?: number }} [options]
 */
export function isFamilyAlreadyUsed(state, family, options = {}) {
  if (!state || !family || family === "unknown" || family === "generic_fit") {
    return false;
  }

  const uses = state.usedFamilies[family] || [];
  if (!uses.length) return false;

  if (options.allowRepeatLayer && uses.length === 1 && uses[0] === options.allowRepeatLayer) {
    return false;
  }

  const maxUses = options.maxUses ?? 1;
  return uses.length >= maxUses;
}

function isTextAlreadyUsed(state, text = "") {
  const key = normalizeKey(text);
  if (!key || key.length < 16) return false;
  return state.usedTexts.some(
    (entry) => entry.includes(key.slice(0, 24)) || key.includes(entry.slice(0, 24))
  );
}

/**
 * @param {Array<{ text: string, type?: string, token?: string, family?: string }>} candidates
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {{ layer?: string, preferredFamilies?: string[], allowUsedFamily?: boolean, maxPerFamily?: number }} [options]
 */
export function filterCandidatesByUnusedFamily(candidates = [], state, options = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const preferred = options.preferredFamilies || [];
  const output = [];

  for (const candidate of list) {
    const text = cleanText(candidate.text || candidate.consequence || candidate);
    if (!text || isGenericInsightBody(text)) continue;
    if (isTextAlreadyUsed(state, text)) {
      state.skippedDueToDuplication.push({ layer: options.layer, text, reason: "text_overlap" });
      continue;
    }

    const family =
      candidate.family ||
      inferSemanticFamilyFromText(text, {
        token: candidate.token || candidate.sourceToken,
        type: candidate.type,
        primaryAxis: options.primaryAxis,
      });

    if (
      !options.allowUsedFamily &&
      isFamilyAlreadyUsed(state, family, { maxUses: options.maxPerFamily ?? 1 })
    ) {
      state.skippedDueToDuplication.push({ layer: options.layer, text, family, reason: "family_used" });
      continue;
    }

    const score =
      (preferred.indexOf(family) >= 0 ? 20 - preferred.indexOf(family) : 0) +
      (candidate.score || 0);

    output.push({ ...candidate, text, family, score });
  }

  return output.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {string[]} [preferredFamilies]
 * @param {Array<{ text: string, family?: string, type?: string, token?: string }>} [pool]
 */
export function getUnusedCandidates(state, preferredFamilies = [], pool = []) {
  return filterCandidatesByUnusedFamily(pool, state, {
    preferredFamilies,
    allowUsedFamily: false,
  });
}

function compactConsequence(text = "", family = "") {
  const body = cleanText(text);
  if (!body) return "";

  const compactByFamily = {
    camera_video_confidence: "câmera confiável para fotos e vídeos",
    performance_longevity: "bom desempenho para o dia a dia",
    battery_autonomy: "autonomia prática no uso real",
    ecosystem_software: "ecossistema integrado e previsível",
    display_smoothness: "tela fluida no cotidiano",
    charging_speed: "carregamento mais lento que rivais recentes",
    price_value_risk: "preço mais alto que alguns rivais",
    durability_reliability: "boa longevidade para uso prolongado",
    size_capacity: "capacidade adequada para o uso previsto",
    maintenance_cleaning: "manutenção simples no dia a dia",
    portability: "portabilidade equilibrada",
    generic_fit: body.split(/[.!?]/)[0].slice(0, 90),
  };

  if (compactByFamily[family]) {
    return compactByFamily[family];
  }

  if (body.length <= 90) return body;
  return body.split(/[.!?]/)[0].slice(0, 90);
}

function compactSacrifice(text = "", family = "") {
  const map = {
    display_smoothness: "tela limitada a 60Hz",
    charging_speed: "carregamento mais lento",
    price_value_risk: "preço mais alto que rivais",
    portability: "menos portabilidade",
    battery_autonomy: "autonomia abaixo do topo da categoria",
    camera_video_confidence: "câmera abaixo do topo da categoria",
    maintenance_cleaning: "limpeza mais trabalhosa",
    size_capacity: "capacidade menor que modelos maiores",
  };

  if (map[family]) return map[family];
  return compactConsequence(text, family);
}

function isFamilyUsedByPriorLayers(state, family = "") {
  const layers = state?.usedFamilies?.[family] || [];
  return layers.some((layer) => !String(layer).startsWith("tradeoff"));
}

function isLowValueConsequence(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  if (/^uma renúncia perceptível que vale pesar/i.test(body)) return true;
  if (/^ganho perceptível no uso real$/i.test(body)) return true;
  if (isGenericInsightBody(body)) return true;
  return false;
}

function addPoolEntry(pool, entry) {
  const text = cleanText(entry.text);
  if (!text || isLowValueConsequence(text)) return;
  const family =
    entry.family ||
    inferSemanticFamilyFromText(text, {
      token: entry.token,
      type: entry.type,
      primaryAxis: entry.primaryAxis,
    });

  const key = normalizeKey(text);
  if (pool.some((item) => normalizeKey(item.text) === key)) return;

  pool.push({
    text,
    type: entry.type || "strength",
    token: entry.token || "",
    family,
    field: entry.field || entry.type || "strengths",
  });
}

/**
 * @param {Record<string, unknown>|null} structuredFacts
 * @param {Record<string, unknown>} [context]
 */
export function buildSemanticCandidatePool(structuredFacts = null, context = {}) {
  const pool = [];
  const primaryAxis = cleanText(context.primaryAxis || "");
  const trustedSpecs = context.trustedSpecs || null;

  const pushList = (items = [], type, tokens = [], field = type) => {
    items.forEach((text, index) => {
      addPoolEntry(pool, {
        text,
        type,
        token: tokens[index] || "",
        field,
        primaryAxis,
      });
    });
  };

  if (structuredFacts) {
    const normalizedSpecs = trustedSpecs ? normalizeTrustedSpecsSemanticFields(trustedSpecs) : null;
    const strengthTokens = normalizedSpecs
      ? normalizeDataLayerSemanticField(normalizedSpecs.strengths)
      : [];
    const weaknessTokens = normalizedSpecs
      ? normalizeDataLayerSemanticField(normalizedSpecs.weaknesses)
      : [];
    const idealTokens = normalizedSpecs
      ? normalizeDataLayerSemanticField(normalizedSpecs.ideal_for)
      : [];

    pushList(structuredFacts.strengthConsequences, "strength", strengthTokens, "strengths");
    pushList(structuredFacts.weaknessConsequences, "weakness", weaknessTokens, "weaknesses");
    pushList(structuredFacts.idealForConsequences, "ideal_for", idealTokens, "ideal_for");
    pushList(structuredFacts.noteConsequences, "note", [], "notes");
    pushList(structuredFacts.riskConsequences, "risk", [], "risk_notes");
    pushList(structuredFacts.avoidIfConsequences, "avoid_if", [], "avoid_if");

    const micro = structuredFacts.microConsequences || [];
    pushList(micro, "micro", [], "micro");
  }

  if (trustedSpecs && structuredFacts?.mode === "data_layer") {
    const normalized = normalizeTrustedSpecsSemanticFields(trustedSpecs) || trustedSpecs;
    const translated = translateDataLayerFieldsToConsequences(normalized);

    const strengthTokens = normalizeDataLayerSemanticField(normalized.strengths);
    const weaknessTokens = normalizeDataLayerSemanticField(normalized.weaknesses);
    const idealTokens = normalizeDataLayerSemanticField(normalized.ideal_for);

    extractConsequenceTexts(translated.strengths, 6).forEach((text, index) => {
      addPoolEntry(pool, {
        text,
        type: "strength",
        token: strengthTokens[index] || "",
        field: "strengths",
        primaryAxis,
      });
    });
    extractConsequenceTexts(translated.weaknesses, 4).forEach((text, index) => {
      addPoolEntry(pool, {
        text,
        type: "weakness",
        token: weaknessTokens[index] || "",
        field: "weaknesses",
        primaryAxis,
      });
    });
    extractConsequenceTexts(translated.idealFor, 3).forEach((text, index) => {
      addPoolEntry(pool, {
        text,
        type: "ideal_for",
        token: idealTokens[index] || "",
        field: "ideal_for",
        primaryAxis,
      });
    });
  }

  const chain = context.searchCognition?.consequenceChain || {};
  if (chain.impact) {
    addPoolEntry(pool, {
      text: cleanText(chain.impact),
      type: "routing",
      field: "reasoning_impact",
      primaryAxis,
    });
  }
  if (chain.consequence) {
    addPoolEntry(pool, {
      text: cleanText(chain.consequence),
      type: "routing",
      field: "reasoning_consequence",
      primaryAxis,
    });
  }

  const byFamily = {};
  for (const item of pool) {
    if (!byFamily[item.family]) byFamily[item.family] = [];
    byFamily[item.family].push(item);
  }

  return { pool, candidatesByFamily: byFamily };
}

/**
 * @param {{ pool: Array, candidatesByFamily: Record<string, Array> }} candidateData
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {{ primaryAxis?: string, searchCognition?: Record<string, unknown> }} context
 */
export function selectDecisionConsequence(candidateData, state, context = {}) {
  const primaryAxis = cleanText(context.primaryAxis || "");
  const preferred = AXIS_FAMILY_PRIORITY[primaryAxis] || [];
  const strengths = (candidateData.pool || []).filter((item) => item.type === "strength");

  let picked = filterCandidatesByUnusedFamily(strengths, state, {
    layer: "decision",
    preferredFamilies: preferred,
    primaryAxis,
  })[0];

  if (!picked && strengths.length) {
    picked = strengths[0];
    state.fallbackUsed = true;
  }

  if (!picked) {
    const impact = cleanText(context.searchCognition?.consequenceChain?.impact || "");
    if (impact) {
      picked = {
        text: impact,
        family: inferSemanticFamilyFromText(impact, { primaryAxis }),
        type: "routing",
      };
      state.fallbackUsed = true;
    }
  }

  if (!picked) {
    return {
      text: "",
      shortText: "",
      family: "unknown",
      secondaryFamily: null,
    };
  }

  const shortText = compactConsequence(picked.text, picked.family);
  markFamilyUsed(state, picked.family, "decision", {
    text: shortText,
    token: picked.token,
  });

  let secondaryFamily = null;
  let secondaryShortText = "";
  const secondary = filterCandidatesByUnusedFamily(strengths, state, {
    layer: "decision_secondary",
    preferredFamilies: preferred.filter((f) => f !== picked.family),
    primaryAxis,
  })[0];

  if (secondary && secondary.family !== picked.family) {
    secondaryFamily = secondary.family;
    secondaryShortText = compactConsequence(secondary.text, secondary.family);
    markFamilyUsed(state, secondaryFamily, "decision_secondary", {
      text: secondaryShortText,
      token: secondary.token,
    });
  }

  return {
    text: picked.text,
    shortText,
    family: picked.family,
    secondaryFamily,
    secondaryShortText,
    token: picked.token,
  };
}

/**
 * @param {Array<{ text: string, field?: string, score?: number, family?: string }>} candidates
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {{ primaryAxis?: string }} context
 */
export function selectEvidenceCandidate(candidates = [], state, context = {}) {
  const primaryAxis = cleanText(context.primaryAxis || "");
  const preferred = (AXIS_FAMILY_PRIORITY[primaryAxis] || []).filter(
    (family) => !isFamilyAlreadyUsed(state, family)
  );

  const enriched = candidates.map((entry) => ({
    ...entry,
    text: cleanText(entry.text),
    family: entry.family || inferSemanticFamilyFromText(entry.text, { primaryAxis }),
  }));

  let picked = filterCandidatesByUnusedFamily(enriched, state, {
    layer: "evidence",
    preferredFamilies: preferred,
    primaryAxis,
  })[0];

  if (!picked && enriched.length) {
    picked =
      enriched.find(
        (entry) => !isFamilyAlreadyUsed(state, entry.family) && !isTextAlreadyUsed(state, entry.text)
      ) || null;
    if (picked) state.fallbackUsed = true;
  }

  if (!picked) return null;

  markFamilyUsed(state, picked.family, "evidence", { text: picked.text });
  return picked;
}

/**
 * @param {Array<{ text: string, source?: string, score?: number }>} candidates
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {{ primaryAxis?: string }} context
 */
export function selectInsightCandidate(candidates = [], state, context = {}) {
  const primaryAxis = cleanText(context.primaryAxis || "");
  const preferred = [
    "ecosystem_software",
    "performance_longevity",
    "price_value_risk",
    "durability_reliability",
    "battery_autonomy",
    "display_smoothness",
  ].filter((family) => !isFamilyAlreadyUsed(state, family));

  const enriched = candidates
    .map((entry) => ({
      ...entry,
      text: cleanText(entry.text),
      family: inferSemanticFamilyFromText(entry.text, { primaryAxis }),
    }))
    .filter((entry) => {
      if (MICRO_CAMERA_PATTERNS.test(entry.text) && isFamilyAlreadyUsed(state, "camera_video_confidence")) {
        return false;
      }
      if (isGenericInsightBody(entry.text)) return false;
      return true;
    });

  const picked = filterCandidatesByUnusedFamily(enriched, state, {
    layer: "insight",
    preferredFamilies: preferred,
    primaryAxis,
  })[0];

  if (!picked) return null;

  markFamilyUsed(state, picked.family, "insight", { text: picked.text });
  return picked;
}

/**
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {{ pool: Array }} candidateData
 * @param {{ primaryAxis?: string, maxGains?: number }} context
 */
export function selectTradeoffGains(state, candidateData, context = {}) {
  const maxGains = context.maxGains ?? 3;
  const primaryAxis = cleanText(context.primaryAxis || "");
  const strengths = (candidateData.pool || []).filter((item) => item.type === "strength");

  const preferred = [
    ...(AXIS_FAMILY_PRIORITY[primaryAxis] || []),
    "camera_video_confidence",
    "ecosystem_software",
    "durability_reliability",
    "performance_longevity",
    "battery_autonomy",
    "display_smoothness",
    "charging_speed",
    "price_value_risk",
  ];

  const ranked = strengths
    .filter((item) => !isLowValueConsequence(item.text))
    .map((item) => ({
      ...item,
      family:
        item.family ||
        inferSemanticFamilyFromText(item.text, {
          token: item.token,
          type: item.type,
          primaryAxis,
        }),
      rank:
        preferred.indexOf(
          item.family ||
            inferSemanticFamilyFromText(item.text, { token: item.token, primaryAxis })
        ) >= 0
          ? preferred.indexOf(
              item.family ||
                inferSemanticFamilyFromText(item.text, { token: item.token, primaryAxis })
            )
          : 99,
    }))
    .sort((a, b) => a.rank - b.rank);

  const gains = [];
  const seenFamilies = new Set();

  const tryAddGain = (item, allowPriorRepeat = false) => {
    if (gains.length >= maxGains) return false;
    if (seenFamilies.has(item.family)) return false;
    if (!allowPriorRepeat && isFamilyUsedByPriorLayers(state, item.family)) return false;

    const text = compactConsequence(item.text, item.family) || item.text;
    if (!text || gains.some((gain) => normalizeKey(gain) === normalizeKey(text))) return false;

    gains.push(text);
    seenFamilies.add(item.family);
    markFamilyUsed(state, item.family, "tradeoff_gain", { text: item.text, token: item.token });
    return true;
  };

  for (const item of ranked) {
    tryAddGain(item, false);
  }

  for (const item of ranked) {
    if (gains.length >= maxGains) break;
    tryAddGain(item, true);
  }

  if (gains.length === 0) {
    for (const item of ranked) {
      if (tryAddGain(item, true)) break;
    }
  }

  if (!gains.length) {
    state.fallbackUsed = true;
    const impact = cleanText(context.searchCognition?.consequenceChain?.impact || "");
    if (impact) gains.push(compactConsequence(impact, inferSemanticFamilyFromText(impact, { primaryAxis })));
  }

  return gains.slice(0, maxGains);
}

/**
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 * @param {{ pool: Array }} candidateData
 * @param {{ primaryAxis?: string, maxSacrifices?: number }} context
 */
export function selectTradeoffSacrifices(state, candidateData, context = {}) {
  const maxSacrifices = context.maxSacrifices ?? 3;
  const weaknesses = (candidateData.pool || []).filter((item) => item.type === "weakness");
  const sacrifices = [];
  const usedFamilies = new Set();

  for (const item of weaknesses) {
    if (sacrifices.length >= maxSacrifices) break;
    if (isLowValueConsequence(item.text)) continue;

    const family = inferSemanticFamilyFromText(item.text, {
      token: item.token,
      type: "weakness",
      primaryAxis: context.primaryAxis,
    });

    if (usedFamilies.has(family)) continue;
    if (isTextAlreadyUsed(state, item.text) && sacrifices.length > 0) continue;

    sacrifices.push(compactSacrifice(item.text, family) || item.text);
    usedFamilies.add(family);
    markFamilyUsed(state, family, "tradeoff_sacrifice", { text: item.text, token: item.token });
  }

  return sacrifices.slice(0, maxSacrifices);
}

/**
 * @param {Record<string, unknown>} input
 */
export function allocateSpecialistFamilies(input = {}) {
  const state = createSemanticAllocationState();
  const candidateData = buildSemanticCandidatePool(input.structuredFacts, {
    trustedSpecs: input.trustedSpecs,
    primaryAxis: input.primaryAxis,
    searchCognition: input.searchCognition,
    category: input.category,
  });

  state.candidatesByFamily = candidateData.candidatesByFamily;

  const decision = selectDecisionConsequence(candidateData, state, {
    primaryAxis: input.primaryAxis,
    searchCognition: input.searchCognition,
  });

  return {
    state,
    candidateData,
    decision,
  };
}

/**
 * @param {ReturnType<typeof createSemanticAllocationState>} state
 */
export function summarizeFamilyAllocation(state) {
  return {
    usedFamilies: { ...state.usedFamilies },
    layerAssignments: { ...state.layerAssignments },
    skippedCount: state.skippedDueToDuplication.length,
    fallbackUsed: state.fallbackUsed,
  };
}

/**
 * Conta ocorrências de família em blocos de texto.
 * @param {string[]} blocks
 * @param {string} family
 */
export function countFamilyOccurrences(blocks = [], family = "") {
  let count = 0;
  for (const block of blocks) {
    if (inferSemanticFamilyFromText(block) === family) count += 1;
    else if (family && new RegExp(TEXT_FAMILY_RULES.find(([f]) => f === family)?.[1] || "$^").test(block)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Dedupe visual tradeoff items por texto e família.
 * @param {string[]} items
 * @param {number} [max]
 */
export function dedupeTradeoffItemsByFamily(items = [], max = 3) {
  const seenText = new Set();
  const seenFamily = new Set();
  const output = [];

  for (const item of items) {
    const text = cleanText(item);
    if (!text) continue;
    const key = normalizeKey(text);
    const family = inferSemanticFamilyFromText(text);

    if (seenText.has(key)) continue;
    if (seenFamily.has(family) && family !== "unknown" && family !== "generic_fit") continue;

    seenText.add(key);
    seenFamily.add(family);
    output.push(text);
    if (output.length >= max) break;
  }

  return output;
}
