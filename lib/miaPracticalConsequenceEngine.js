/**
 * PATCH 4A.7 — Practical Consequence Engine
 *
 * Translates technical specifications into governed practical consequences
 * using Data Layer knowledge as primary evidence and specs as reinforcement.
 * Produces structure only — never final user-facing text.
 */

import {
  SEMANTIC_CAVEAT_TYPE,
  SEMANTIC_CONDITIONALITY,
  SEMANTIC_CONFIDENCE,
  SEMANTIC_DECISION_ROLE,
  SEMANTIC_DIRECTION,
  SEMANTIC_EVIDENCE_SOURCE,
  SEMANTIC_EVIDENCE_TYPE,
  SEMANTIC_INTENSITY,
  SEMANTIC_PRIORITY_RELEVANCE,
  createSemanticCaveat,
  createSemanticDecisionUnit,
  createSemanticEvidence,
  createSemanticImplication,
  createSemanticLegacySurface,
  createSemanticPriority,
} from "./miaSemanticDecisionContract.js";
import { translateDataLayerFieldsToConsequences } from "./miaConsequenceTranslationLayer.js";

export const PRACTICAL_CONSEQUENCE_ENGINE_VERSION = "4A.7.0";

export const PRACTICAL_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INSUFFICIENT: "insufficient",
});

export const PRACTICAL_CONSEQUENCE_CATEGORY = Object.freeze({
  BATTERY: "battery",
  PROCESSOR: "processor",
  SCREEN: "screen",
  CAMERA: "camera",
  CHARGING: "charging",
  PROTECTION: "protection",
  MEMORY: "memory",
});

export const PRACTICAL_EVIDENCE_SOURCE = Object.freeze({
  DATA_LAYER_KNOWLEDGE: "data_layer_knowledge",
  DATA_LAYER_SPEC: "data_layer_spec",
  DECISION_FACTS: "decision_facts",
  COMBINED: "combined",
});

const PRODUCER_LAYER = "miaPracticalConsequenceEngine";

const ABSOLUTE_CLAIM_PATTERNS = Object.freeze([
  /\bisso significa que\b/i,
  /\bsempre\b/i,
  /\bcom certeza\b/i,
  /\bgarante\b/i,
  /\bvai durar\b/i,
  /\bvai rodar tudo\b/i,
  /\bcom certeza absoluta\b/i,
]);

const CATEGORY_KNOWLEDGE_PATTERNS = Object.freeze({
  [PRACTICAL_CONSEQUENCE_CATEGORY.BATTERY]: [/bateria|autonomia|recarga|carregador|energia|mah/i],
  [PRACTICAL_CONSEQUENCE_CATEGORY.PROCESSOR]: [
    /desempenho|performance|processador|chipset|multitarefa|fluidez|snapdragon|mediatek|dimensity|exynos/i,
  ],
  [PRACTICAL_CONSEQUENCE_CATEGORY.SCREEN]: [/tela|display|painel|hz|fluid|visual|brilho|oled|amoled|refresh/i],
  [PRACTICAL_CONSEQUENCE_CATEGORY.CAMERA]: [/c[aâ]mera|camera|foto|video|v[ií]deo|mp|selfie|registrar/i],
  [PRACTICAL_CONSEQUENCE_CATEGORY.CHARGING]: [/carregamento|carregar|watts|carregador|recarga r[aá]pida/i],
  [PRACTICAL_CONSEQUENCE_CATEGORY.PROTECTION]: [/ip\d|resist|água|agua|poeira|prote[cç][aã]o|durabilidade/i],
  [PRACTICAL_CONSEQUENCE_CATEGORY.MEMORY]: [/ram|armazen|storage|mem[oó]ria|gb|capacidade interna/i],
});

const DEFAULT_LIMITATIONS = Object.freeze({
  [PRACTICAL_CONSEQUENCE_CATEGORY.BATTERY]: ["depende do uso real", "otimização de software influencia"],
  [PRACTICAL_CONSEQUENCE_CATEGORY.PROCESSOR]: ["depende dos aplicativos", "varia com multitarefa e jogos"],
  [PRACTICAL_CONSEQUENCE_CATEGORY.SCREEN]: ["depende do conteúdo exibido", "nem todo app aproveita taxa alta"],
  [PRACTICAL_CONSEQUENCE_CATEGORY.CAMERA]: ["depende da cena e da luz", "resultado varia por aplicativo"],
  [PRACTICAL_CONSEQUENCE_CATEGORY.CHARGING]: ["depende do carregador e cabo usados", "varia com temperatura"],
  [PRACTICAL_CONSEQUENCE_CATEGORY.PROTECTION]: ["depende do cenário de uso", "não elimina risco de dano"],
  [PRACTICAL_CONSEQUENCE_CATEGORY.MEMORY]: ["depende do perfil de apps", "armazenamento cheio reduz folga"],
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function containsAbsoluteClaim(text = "") {
  return ABSOLUTE_CLAIM_PATTERNS.some((pattern) => pattern.test(cleanText(text)));
}

function mapPracticalConfidenceToSemantic(confidence = "") {
  const key = cleanText(confidence).toLowerCase();
  if (key === PRACTICAL_CONFIDENCE.HIGH) return SEMANTIC_CONFIDENCE.HIGH;
  if (key === PRACTICAL_CONFIDENCE.MEDIUM) return SEMANTIC_CONFIDENCE.MEDIUM;
  if (key === PRACTICAL_CONFIDENCE.LOW) return SEMANTIC_CONFIDENCE.LOW;
  return SEMANTIC_CONFIDENCE.UNKNOWN;
}

function collectKnowledgeTexts(translated = {}) {
  const buckets = {
    strengths: [],
    weaknesses: [],
    idealFor: [],
    avoidIf: [],
    notes: [],
    riskNotes: [],
  };

  for (const [key, list] of Object.entries(buckets)) {
    buckets[key] = (translated[key] || [])
      .map((entry) => cleanText(entry?.consequence || entry))
      .filter(Boolean);
  }

  return buckets;
}

function knowledgeMatchesCategory(texts = [], category = "") {
  const pattern = CATEGORY_KNOWLEDGE_PATTERNS[category];
  if (!pattern) return { matched: false, fields: [], snippets: [] };

  const fields = [];
  const snippets = [];
  for (const [field, list] of Object.entries(texts)) {
    for (const text of list) {
      if (pattern.some((regex) => regex.test(text))) {
        fields.push(field);
        snippets.push(text);
      }
    }
  }

  return {
    matched: snippets.length > 0,
    fields: [...new Set(fields)],
    snippets: [...new Set(snippets)].slice(0, 3),
  };
}

function buildKnowledgeIndex(translatedKnowledge = null) {
  if (!translatedKnowledge) return collectKnowledgeTexts({});
  if (Array.isArray(translatedKnowledge.strengths)) return collectKnowledgeTexts(translatedKnowledge);
  return collectKnowledgeTexts(translateDataLayerFieldsToConsequences(translatedKnowledge));
}

function evaluateCombinedConfidence({ knowledgeMatch = null, specPresent = false, specStrength = 0 } = {}) {
  const hasKnowledge = !!knowledgeMatch?.matched;
  const strongSpec = specStrength >= 2;
  const moderateSpec = specStrength >= 1;

  if (hasKnowledge && specPresent && strongSpec) {
    return {
      confidence: PRACTICAL_CONFIDENCE.HIGH,
      reason: "conhecimento estruturado do Data Layer alinhado com especificação técnica compatível",
      source: PRACTICAL_EVIDENCE_SOURCE.COMBINED,
    };
  }
  if (hasKnowledge && (specPresent || moderateSpec)) {
    return {
      confidence: PRACTICAL_CONFIDENCE.MEDIUM,
      reason: "conhecimento estruturado do Data Layer sustenta a tradução prática",
      source: PRACTICAL_EVIDENCE_SOURCE.DATA_LAYER_KNOWLEDGE,
    };
  }
  if (hasKnowledge) {
    return {
      confidence: PRACTICAL_CONFIDENCE.MEDIUM,
      reason: "conhecimento estruturado do Data Layer disponível sem reforço técnico decisivo",
      source: PRACTICAL_EVIDENCE_SOURCE.DATA_LAYER_KNOWLEDGE,
    };
  }
  if (specPresent && strongSpec) {
    return {
      confidence: PRACTICAL_CONFIDENCE.LOW,
      reason: "especificação técnica presente, mas sem conhecimento estruturado correspondente",
      source: PRACTICAL_EVIDENCE_SOURCE.DATA_LAYER_SPEC,
    };
  }
  if (specPresent && moderateSpec) {
    return {
      confidence: PRACTICAL_CONFIDENCE.LOW,
      reason: "sinal técnico parcial sem base estruturada equivalente",
      source: PRACTICAL_EVIDENCE_SOURCE.DATA_LAYER_SPEC,
    };
  }
  return {
    confidence: PRACTICAL_CONFIDENCE.INSUFFICIENT,
    reason: "não há evidência estruturada suficiente para traduzir esta dimensão",
    source: PRACTICAL_EVIDENCE_SOURCE.DATA_LAYER_SPEC,
  };
}

function createPracticalConsequence({
  category,
  spec = null,
  practicalMeaning = "",
  confidence = PRACTICAL_CONFIDENCE.INSUFFICIENT,
  reason = "",
  source = PRACTICAL_EVIDENCE_SOURCE.DATA_LAYER_SPEC,
  limitations = [],
  evidenceUsed = {},
  direction = SEMANTIC_DIRECTION.NEUTRAL,
  knowledgeSnippets = [],
} = {}) {
  const body = cleanText(practicalMeaning);
  if (body && containsAbsoluteClaim(body)) return null;
  if (confidence === PRACTICAL_CONFIDENCE.INSUFFICIENT && !body) return null;

  return {
    id: `pc_${category}_${spec?.key || "general"}`,
    category,
    spec: spec || { key: null, rawValue: null, displayLabel: null },
    practicalMeaning: body || null,
    confidence,
    reason: cleanText(reason),
    source: {
      primary: source,
      secondary: [],
      specKeys: spec?.key ? [spec.key] : [],
    },
    limitations: (limitations.length ? limitations : DEFAULT_LIMITATIONS[category] || []).slice(0, 3),
    evidenceUsed: {
      knowledgeFields: evidenceUsed.knowledgeFields || [],
      specFields: evidenceUsed.specFields || [],
      knowledgeSnippets,
    },
    direction,
  };
}

function buildBatteryConsequence(specs = {}, knowledgeIndex = {}) {
  const mah = toNumber(specs.battery_mah);
  const wh = toNumber(specs.battery_wh);
  const knowledge = knowledgeMatchesCategory(knowledgeIndex, PRACTICAL_CONSEQUENCE_CATEGORY.BATTERY);

  let specStrength = 0;
  let direction = SEMANTIC_DIRECTION.POSITIVE;
  let meaning = "";

  if (mah != null) {
    if (mah >= 5000) specStrength = 2;
    else if (mah >= 4300) specStrength = 1;
    else if (mah < 3800) {
      specStrength = 1;
      direction = SEMANTIC_DIRECTION.NEGATIVE;
    }
  } else if (wh != null && wh >= 15) {
    specStrength = 1;
  }

  if (knowledge.matched) {
    meaning =
      direction === SEMANTIC_DIRECTION.NEGATIVE
        ? "pode pedir mais atenção à autonomia em dias mais longos"
        : "tende a reduzir a necessidade de recarga ao longo do dia";
  } else if (mah != null && specStrength >= 1) {
    meaning =
      direction === SEMANTIC_DIRECTION.NEGATIVE
        ? "a autonomia pode pesar mais em rotinas intensas fora de casa"
        : "a capacidade de bateria sugere mais folga para uso fora de casa";
  }

  const evaluated = evaluateCombinedConfidence({
    knowledgeMatch: knowledge,
    specPresent: mah != null || wh != null,
    specStrength,
  });

  return createPracticalConsequence({
    category: PRACTICAL_CONSEQUENCE_CATEGORY.BATTERY,
    spec: mah != null ? { key: "battery_mah", rawValue: String(mah), displayLabel: `${mah} mAh` } : null,
    practicalMeaning: meaning,
    confidence: evaluated.confidence,
    reason: evaluated.reason,
    source: evaluated.source,
    limitations: DEFAULT_LIMITATIONS[PRACTICAL_CONSEQUENCE_CATEGORY.BATTERY],
    evidenceUsed: { knowledgeFields: knowledge.fields, specFields: mah != null ? ["battery_mah"] : [] },
    direction,
    knowledgeSnippets: knowledge.snippets,
  });
}

function buildProcessorConsequence(specs = {}, knowledgeIndex = {}) {
  const knowledge = knowledgeMatchesCategory(knowledgeIndex, PRACTICAL_CONSEQUENCE_CATEGORY.PROCESSOR);
  const chipset = cleanText(specs.chipset || specs.cpu || "");
  const ram = toNumber(specs.ram_gb);

  let specStrength = chipset ? 1 : 0;
  if (ram != null && ram >= 12) specStrength += 1;

  let meaning = "";
  if (knowledge.matched) {
    meaning = "tende a sustentar melhor multitarefa e uso mais exigente no dia a dia";
  } else if (chipset) {
    meaning = "o conjunto de processamento sugere desempenho adequado para uso cotidiano";
  } else if (ram != null && ram >= 8) {
    meaning = "a memória RAM sugere mais folga para apps abertos ao mesmo tempo";
  }

  const evaluated = evaluateCombinedConfidence({
    knowledgeMatch: knowledge,
    specPresent: !!chipset || ram != null,
    specStrength,
  });

  return createPracticalConsequence({
    category: PRACTICAL_CONSEQUENCE_CATEGORY.PROCESSOR,
    spec: chipset
      ? { key: "chipset", rawValue: chipset, displayLabel: chipset }
      : ram != null
        ? { key: "ram_gb", rawValue: String(ram), displayLabel: `${ram} GB RAM` }
        : null,
    practicalMeaning: meaning,
    confidence: evaluated.confidence,
    reason: evaluated.reason,
    source: evaluated.source,
    evidenceUsed: {
      knowledgeFields: knowledge.fields,
      specFields: [chipset ? "chipset" : null, ram != null ? "ram_gb" : null].filter(Boolean),
    },
    direction: SEMANTIC_DIRECTION.POSITIVE,
    knowledgeSnippets: knowledge.snippets,
  });
}

function buildScreenConsequence(specs = {}, knowledgeIndex = {}) {
  const knowledge = knowledgeMatchesCategory(knowledgeIndex, PRACTICAL_CONSEQUENCE_CATEGORY.SCREEN);
  const refresh = toNumber(specs.refresh_rate_hz);
  const panel = cleanText(specs.screen_type || specs.panel_type || "");

  let specStrength = 0;
  let direction = SEMANTIC_DIRECTION.POSITIVE;
  let meaning = "";

  if (refresh != null) {
    if (refresh >= 120) specStrength = 2;
    else if (refresh >= 90) specStrength = 1;
    else if (refresh <= 60) {
      specStrength = 1;
      direction = SEMANTIC_DIRECTION.NEGATIVE;
    }
  } else if (panel) {
    specStrength = 1;
  }

  if (knowledge.matched) {
    meaning =
      direction === SEMANTIC_DIRECTION.NEGATIVE
        ? "a navegação pode parecer menos fluida para quem veio de telas mais rápidas"
        : "tende a entregar leitura e rolagem mais confortáveis no uso diário";
  } else if (refresh != null && specStrength >= 1) {
    meaning =
      direction === SEMANTIC_DIRECTION.NEGATIVE
        ? "a taxa de atualização pode limitar a sensação de fluidez em alguns cenários"
        : "a taxa de atualização sugere interações mais fluidas na interface";
  } else if (panel) {
    meaning = "o tipo de painel sugere conforto visual no consumo de conteúdo";
  }

  const evaluated = evaluateCombinedConfidence({
    knowledgeMatch: knowledge,
    specPresent: refresh != null || !!panel,
    specStrength,
  });

  return createPracticalConsequence({
    category: PRACTICAL_CONSEQUENCE_CATEGORY.SCREEN,
    spec: refresh != null
      ? { key: "refresh_rate_hz", rawValue: String(refresh), displayLabel: `${refresh} Hz` }
      : panel
        ? { key: "screen_type", rawValue: panel, displayLabel: panel }
        : null,
    practicalMeaning: meaning,
    confidence: evaluated.confidence,
    reason: evaluated.reason,
    source: evaluated.source,
    evidenceUsed: {
      knowledgeFields: knowledge.fields,
      specFields: [refresh != null ? "refresh_rate_hz" : null, panel ? "screen_type" : null].filter(Boolean),
    },
    direction,
    knowledgeSnippets: knowledge.snippets,
  });
}

function buildCameraConsequence(specs = {}, knowledgeIndex = {}) {
  const knowledge = knowledgeMatchesCategory(knowledgeIndex, PRACTICAL_CONSEQUENCE_CATEGORY.CAMERA);
  const mainMp = toNumber(specs.main_camera_mp);
  const video = cleanText(specs.video_quality || "");

  let specStrength = 0;
  if (mainMp != null && mainMp >= 48) specStrength = 1;
  if (video) specStrength += 1;

  let meaning = "";
  if (knowledge.matched) {
    meaning = "tende a facilitar registros consistentes no dia a dia";
  } else if (mainMp != null && specStrength >= 1) {
    meaning = "a configuração de câmera sugere boa versatilidade para fotos cotidianas";
  }

  const evaluated = evaluateCombinedConfidence({
    knowledgeMatch: knowledge,
    specPresent: mainMp != null || !!video,
    specStrength,
  });

  return createPracticalConsequence({
    category: PRACTICAL_CONSEQUENCE_CATEGORY.CAMERA,
    spec: mainMp != null
      ? { key: "main_camera_mp", rawValue: String(mainMp), displayLabel: `${mainMp} MP` }
      : null,
    practicalMeaning: meaning,
    confidence: evaluated.confidence,
    reason: evaluated.reason,
    source: evaluated.source,
    evidenceUsed: {
      knowledgeFields: knowledge.fields,
      specFields: [mainMp != null ? "main_camera_mp" : null, video ? "video_quality" : null].filter(Boolean),
    },
    direction: SEMANTIC_DIRECTION.POSITIVE,
    knowledgeSnippets: knowledge.snippets,
  });
}

function buildChargingConsequence(specs = {}, knowledgeIndex = {}) {
  const knowledge = knowledgeMatchesCategory(knowledgeIndex, PRACTICAL_CONSEQUENCE_CATEGORY.CHARGING);
  const watts = toNumber(specs.charging_w || specs.fast_charging_w);

  let specStrength = 0;
  let direction = SEMANTIC_DIRECTION.POSITIVE;
  let meaning = "";

  if (watts != null) {
    if (watts >= 45) specStrength = 2;
    else if (watts >= 25) specStrength = 1;
    else if (watts < 18) {
      specStrength = 1;
      direction = SEMANTIC_DIRECTION.NEGATIVE;
    }
  }

  if (knowledge.matched) {
    meaning =
      direction === SEMANTIC_DIRECTION.NEGATIVE
        ? "o carregamento pode exigir mais paciência no dia a dia"
        : "tende a reduzir o tempo conectado ao carregador";
  } else if (watts != null && specStrength >= 1) {
    meaning =
      direction === SEMANTIC_DIRECTION.NEGATIVE
        ? "a potência de carregamento pode ser mais lenta que rivais recentes"
        : "a potência de carregamento sugere recargas mais rápidas";
  }

  const evaluated = evaluateCombinedConfidence({
    knowledgeMatch: knowledge,
    specPresent: watts != null,
    specStrength,
  });

  return createPracticalConsequence({
    category: PRACTICAL_CONSEQUENCE_CATEGORY.CHARGING,
    spec: watts != null ? { key: "charging_w", rawValue: String(watts), displayLabel: `${watts} W` } : null,
    practicalMeaning: meaning,
    confidence: evaluated.confidence,
    reason: evaluated.reason,
    source: evaluated.source,
    evidenceUsed: { knowledgeFields: knowledge.fields, specFields: watts != null ? ["charging_w"] : [] },
    direction,
    knowledgeSnippets: knowledge.snippets,
  });
}

function buildProtectionConsequence(specs = {}, knowledgeIndex = {}) {
  const knowledge = knowledgeMatchesCategory(knowledgeIndex, PRACTICAL_CONSEQUENCE_CATEGORY.PROTECTION);
  const ip = cleanText(specs.ip_rating || specs.water_resistance || "");

  let specStrength = 0;
  if (/ip6[78]/i.test(ip)) specStrength = 2;
  else if (/ip5/i.test(ip)) specStrength = 1;

  let meaning = "";
  if (knowledge.matched) {
    meaning = "pode oferecer mais tranquilidade em uso exposto a poeira ou respingos";
  } else if (specStrength >= 1) {
    meaning = "a classificação de proteção sugere mais resistência em situações cotidianas de exposição";
  }

  const evaluated = evaluateCombinedConfidence({
    knowledgeMatch: knowledge,
    specPresent: !!ip,
    specStrength,
  });

  return createPracticalConsequence({
    category: PRACTICAL_CONSEQUENCE_CATEGORY.PROTECTION,
    spec: ip ? { key: "ip_rating", rawValue: ip, displayLabel: ip } : null,
    practicalMeaning: meaning,
    confidence: evaluated.confidence,
    reason: evaluated.reason,
    source: evaluated.source,
    evidenceUsed: { knowledgeFields: knowledge.fields, specFields: ip ? ["ip_rating"] : [] },
    direction: SEMANTIC_DIRECTION.POSITIVE,
    knowledgeSnippets: knowledge.snippets,
  });
}

function buildMemoryConsequence(specs = {}, knowledgeIndex = {}) {
  const knowledge = knowledgeMatchesCategory(knowledgeIndex, PRACTICAL_CONSEQUENCE_CATEGORY.MEMORY);
  const ram = toNumber(specs.ram_gb);
  const storage = toNumber(specs.storage_gb);
  const ufs = cleanText(specs.storage_type || specs.ufs || "");

  let specStrength = 0;
  if (ram != null && ram >= 8) specStrength += 1;
  if (storage != null && storage >= 256) specStrength += 1;
  if (/ufs/i.test(ufs)) specStrength += 1;

  let meaning = "";
  if (knowledge.matched) {
    meaning = "tende a oferecer mais folga para apps, arquivos e uso prolongado";
  } else if (ram != null && storage != null && specStrength >= 1) {
    meaning = "a combinação de memória e armazenamento sugere margem para uso cotidiano e mídia";
  } else if (ram != null && ram >= 8) {
    meaning = "a memória RAM sugere mais folga para multitarefa";
  } else if (storage != null && storage >= 128) {
    meaning = "o armazenamento interno sugere espaço razoável para apps e fotos";
  }

  const evaluated = evaluateCombinedConfidence({
    knowledgeMatch: knowledge,
    specPresent: ram != null || storage != null || !!ufs,
    specStrength,
  });

  return createPracticalConsequence({
    category: PRACTICAL_CONSEQUENCE_CATEGORY.MEMORY,
    spec:
      ram != null
        ? { key: "ram_gb", rawValue: String(ram), displayLabel: `${ram} GB RAM` }
        : storage != null
          ? { key: "storage_gb", rawValue: String(storage), displayLabel: `${storage} GB` }
          : null,
    practicalMeaning: meaning,
    confidence: evaluated.confidence,
    reason: evaluated.reason,
    source: evaluated.source,
    evidenceUsed: {
      knowledgeFields: knowledge.fields,
      specFields: [ram != null ? "ram_gb" : null, storage != null ? "storage_gb" : null].filter(Boolean),
    },
    direction: SEMANTIC_DIRECTION.POSITIVE,
    knowledgeSnippets: knowledge.snippets,
  });
}

/**
 * @param {object} consequence
 */
export function validatePracticalConsequence(consequence = null) {
  if (!consequence) return { valid: false, reasons: ["missing"] };
  const reasons = [];
  if (!consequence.category) reasons.push("missing_category");
  if (!consequence.reason) reasons.push("missing_reason");
  if (!consequence.source?.primary) reasons.push("missing_source");
  if (!Object.values(PRACTICAL_CONFIDENCE).includes(consequence.confidence)) {
    reasons.push("invalid_confidence");
  }
  if (consequence.practicalMeaning && containsAbsoluteClaim(consequence.practicalMeaning)) {
    reasons.push("absolute_claim");
  }
  if (
    consequence.confidence !== PRACTICAL_CONFIDENCE.INSUFFICIENT &&
    !consequence.practicalMeaning
  ) {
    reasons.push("missing_meaning");
  }
  return { valid: reasons.length === 0, reasons };
}

/**
 * Main engine entry — never produces final user text.
 * @param {{
 *   trustedSpecs?: Record<string, unknown>|null,
 *   translatedKnowledge?: Record<string, unknown>|null,
 *   primaryAxis?: string,
 *   productName?: string,
 *   category?: string,
 * }} input
 */
export function buildPracticalConsequences(input = {}) {
  const specs = input.trustedSpecs || {};
  const knowledgeIndex = buildKnowledgeIndex(input.translatedKnowledge || specs);
  const builders = [
    buildBatteryConsequence,
    buildProcessorConsequence,
    buildScreenConsequence,
    buildCameraConsequence,
    buildChargingConsequence,
    buildProtectionConsequence,
    buildMemoryConsequence,
  ];

  const consequences = [];
  const skipped = [];

  for (const builder of builders) {
    const candidate = builder(specs, knowledgeIndex);
    if (!candidate) continue;
    const validation = validatePracticalConsequence(candidate);
    if (!validation.valid) {
      skipped.push({ category: candidate.category, reasons: validation.reasons });
      continue;
    }
    if (candidate.confidence === PRACTICAL_CONFIDENCE.INSUFFICIENT) {
      skipped.push({ category: candidate.category, reasons: ["insufficient_confidence"] });
      continue;
    }
    consequences.push(candidate);
  }

  const axisPriority = cleanText(input.primaryAxis || "");
  if (axisPriority) {
    consequences.sort((a, b) => {
      const aMatch = a.category === axisPriority || CATEGORY_KNOWLEDGE_PATTERNS[a.category]?.some((p) => p.test(axisPriority));
      const bMatch = b.category === axisPriority || CATEGORY_KNOWLEDGE_PATTERNS[b.category]?.some((p) => p.test(axisPriority));
      return Number(bMatch) - Number(aMatch);
    });
  }

  return {
    version: PRACTICAL_CONSEQUENCE_ENGINE_VERSION,
    consequences: consequences.slice(0, 5),
    skipped,
    meta: {
      productName: input.productName || null,
      category: input.category || null,
      primaryAxis: input.primaryAxis || null,
      knowledgeFieldCount: Object.values(knowledgeIndex).flat().length,
    },
  };
}

function categoryToEffect(category = "", direction = SEMANTIC_DIRECTION.NEUTRAL) {
  const map = {
    [PRACTICAL_CONSEQUENCE_CATEGORY.BATTERY]: ["extended_off_grid_autonomy", "autonomy", "daily_usage"],
    [PRACTICAL_CONSEQUENCE_CATEGORY.PROCESSOR]: ["sustained_daily_performance", "performance", "demanding_daily_use"],
    [PRACTICAL_CONSEQUENCE_CATEGORY.SCREEN]: ["greater_visual_responsiveness", "usage_experience", "interface_navigation"],
    [PRACTICAL_CONSEQUENCE_CATEGORY.CAMERA]: ["consistent_capture_results", "capture_experience", "photo_and_video_use"],
    [PRACTICAL_CONSEQUENCE_CATEGORY.CHARGING]: ["slower_recharge_cycle", "convenience", "recharge_routine"],
    [PRACTICAL_CONSEQUENCE_CATEGORY.PROTECTION]: ["extended_service_life", "durability", "long_term_ownership"],
    [PRACTICAL_CONSEQUENCE_CATEGORY.MEMORY]: ["adequate_capacity_for_intended_use", "capacity", "intended_workload"],
  };
  const entry = map[category] || ["profile_aligned_benefit", "general", "general_use"];
  return {
    effectKey: entry[0],
    effectKind: entry[1],
    scope: entry[2],
    direction:
      direction === SEMANTIC_DIRECTION.NEGATIVE
        ? SEMANTIC_DIRECTION.NEGATIVE
        : SEMANTIC_DIRECTION.POSITIVE,
  };
}

/**
 * Converts practical consequences into SemanticDecisionUnits for downstream synthesis.
 * @param {Array} consequences
 * @param {Record<string, unknown>} context
 */
export function practicalConsequencesToSemanticUnits(consequences = [], context = {}) {
  const units = [];

  for (const consequence of consequences) {
    if (!consequence?.practicalMeaning) continue;

    const effect = categoryToEffect(consequence.category, consequence.direction);
    const semanticConfidence = mapPracticalConfidenceToSemantic(consequence.confidence);
    const evidence = createSemanticEvidence({
      type: SEMANTIC_EVIDENCE_TYPE.INTERPRETIVE,
      source: SEMANTIC_EVIDENCE_SOURCE.DATA_LAYER,
      dimension: consequence.category,
      sourceToken: consequence.spec?.key || null,
      rawValue: consequence.spec?.displayLabel || null,
      interpretedText: consequence.practicalMeaning,
      confidence: semanticConfidence,
      productName: context.productName || null,
      category: context.category || null,
      producerLayer: PRODUCER_LAYER,
    });

    const implication = createSemanticImplication({
      evidenceIds: [evidence.id],
      effectKey: effect.effectKey,
      effectKind: effect.effectKind,
      scope: effect.scope,
      direction: effect.direction,
      intensity:
        consequence.confidence === PRACTICAL_CONFIDENCE.HIGH
          ? SEMANTIC_INTENSITY.HIGH
          : SEMANTIC_INTENSITY.MODERATE,
      confidence: semanticConfidence,
      conditionality: SEMANTIC_CONDITIONALITY.USE_CASE_DEPENDENT,
      producerLayer: PRODUCER_LAYER,
      interpretedSourceText: consequence.practicalMeaning,
    });

    const priority = createSemanticPriority({
      targetId: implication.id,
      targetKind: "implication",
      relevance:
        context.primaryAxis && context.primaryAxis === consequence.category
          ? SEMANTIC_PRIORITY_RELEVANCE.PRIMARY
          : SEMANTIC_PRIORITY_RELEVANCE.SECONDARY,
      reasonCode: "practical_spec_translation",
      reasonText: consequence.reason,
      confidence: semanticConfidence,
    });

    const caveat =
      consequence.limitations?.length > 0
        ? createSemanticCaveat({
            type: SEMANTIC_CAVEAT_TYPE.LIMITATION,
            evidenceIds: [evidence.id],
            relatedImplicationId: implication.id,
            severity: SEMANTIC_INTENSITY.LOW,
            conditionality: SEMANTIC_CONDITIONALITY.USE_CASE_DEPENDENT,
            conditionCode: consequence.limitations[0],
            confidence: semanticConfidence,
          })
        : null;

    const decisionRole =
      effect.direction === SEMANTIC_DIRECTION.NEGATIVE
        ? SEMANTIC_DECISION_ROLE.TRADEOFF
        : SEMANTIC_DECISION_ROLE.SUPPORTING_EVIDENCE;

    units.push(
      createSemanticDecisionUnit({
        evidence,
        implication,
        priority,
        caveat,
        decisionRole,
        legacy: createSemanticLegacySurface({
          compactedText: consequence.practicalMeaning,
        }),
      })
    );
  }

  return units;
}

/**
 * @param {{ consequences?: Array }} payload
 */
export function practicalConsequencesToTrace(payload = null) {
  const list = payload?.consequences || payload || [];
  if (!Array.isArray(list)) return null;
  return {
    version: PRACTICAL_CONSEQUENCE_ENGINE_VERSION,
    count: list.length,
    categories: list.map((entry) => entry.category),
    confidenceLevels: list.map((entry) => entry.confidence),
    sources: list.map((entry) => entry.source?.primary || null),
  };
}

/**
 * Audit helper — which spec dimensions have enough structured knowledge today.
 * @param {Record<string, unknown>} trustedSpecs
 */
export function auditDataLayerSpecTranslationCoverage(trustedSpecs = {}) {
  const translated = translateDataLayerFieldsToConsequences(trustedSpecs);
  const knowledgeIndex = buildKnowledgeIndex(translated);
  const categories = Object.values(PRACTICAL_CONSEQUENCE_CATEGORY);
  const report = [];

  for (const category of categories) {
    const knowledge = knowledgeMatchesCategory(knowledgeIndex, category);
    const engineResult = buildPracticalConsequences({ trustedSpecs, translatedKnowledge: translated });
    const produced = engineResult.consequences.find((entry) => entry.category === category);
    report.push({
      category,
      hasStructuredKnowledge: knowledge.matched,
      knowledgeFields: knowledge.fields,
      hasSupportingSpec: !!produced?.spec?.key,
      translatableNow: !!produced,
      confidence: produced?.confidence || PRACTICAL_CONFIDENCE.INSUFFICIENT,
    });
  }

  return {
    version: PRACTICAL_CONSEQUENCE_ENGINE_VERSION,
    semanticFieldCount: Object.values(knowledgeIndex).flat().length,
    categories: report,
  };
}
