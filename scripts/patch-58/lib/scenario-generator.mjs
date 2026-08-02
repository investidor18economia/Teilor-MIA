/**
 * PATCH 5.8 — Integrated regression scenario catalog
 * Reuses 5.7V.2 generator with Phase 5.8 minimum scale + critical historical cases
 */
import {
  generateMatrixScenarios,
  generateStabilityScenarios,
  generateParityScenarios,
} from "../../patch-57v2/lib/scenario-generator.mjs";

const PROFILES = [
  "leigo", "tecnico", "formal", "informal", "adolescente", "idoso", "impaciente",
  "desconfiado", "irritado", "emocional", "economico", "contraditorio", "abreviador",
  "erros_ortograficos", "girias", "mensagem_minima", "mensagem_longa", "sarcastico",
  "exigente", "provocador", "flertador", "indeciso", "rejeitador_serial", "desconfia_mia",
];

export { PROFILES };

const MULTITURN_THEMES = [
  { theme: "social_to_commercial", turns: ["oi", "tudo bem?", "to precisando de um celular", "até 2000", "priorizo bateria", "me recomenda", "não gostei dessa opção", "prefiro Samsung"] },
  { theme: "commercial_reject_alt", turns: ["quero celular", "compara A55 e M34", "discordo", "e a câmera?", "não quero esse", "mostra outro", "valeu"] },
  { theme: "single_rec_dimension", turns: ["oi", "to precisando de um celular", "até 2000", "me recomenda", "e memória?", "e bateria?"] },
  { theme: "filler_long_commercial", turns: ["quero celular mano", "me recomenda", "e a câmera?", "explica mano", "hm mano", "ok mano"] },
  { theme: "criticism_refinement", turns: ["oi", "me ajuda com notebook", "ficou seco demais", "explica melhor", "priorizo tela", "ok entendi"] },
  { theme: "correction_flow", turns: ["quanto custa o A55?", "a bateria que você citou está errada", "são 5000mAh não 4000", "ah entendi", "então recomenda?"] },
  { theme: "praise_then_product", turns: ["você é boa", "obrigado", "lindo esse design", "quero um assim", "até 2500"] },
  { theme: "emotion_commerce", turns: ["tô ansioso", "medo de comprar errado", "quero celular confiável", "compara opções", "qual menos arrependimento?"] },
  { theme: "meta_then_commerce", turns: ["quem te criou?", "posso confiar?", "ok quero um celular", "até 1800"] },
  { theme: "long_references", turns: ["oi", "celular até 2k", "gostei do primeiro", "e o outro?", "e esse?", "e a câmera?", "e memória?", "hm", "resume"] },
  { theme: "disagreement_deep", turns: ["A55", "discordo", "não", "explica", "hm mano"] },
  { theme: "comparison_runner_up", turns: ["compara A55 e M34", "e o outro?", "o segundo", "e a bateria?"] },
  { theme: "topic_switch_resume", turns: ["notebook", "esquece", "quero celular", "muda orçamento pra 3k", "compara"] },
  { theme: "mixed_insult_commerce", turns: ["idiota, você errou", "corrige então", "quero celular barato"] },
  { theme: "negative_feedback_chain", turns: ["me recomenda", "ficou seco", "não gostei", "mostra outro"] },
];

const LANG_MODS = [
  { id: "pt_neutro", fn: (m) => m },
  { id: "pt_informal", fn: (m) => `${m} mano` },
  { id: "pt_abbrev", fn: (m) => m.replace(/quero/gi, "qro").replace(/você/gi, "vc") },
];

function expandTurns(base, targetLen) {
  const out = [...base];
  const fillers = ["hm", "ok", "entendi", "continua", "certo", "show", "valeu", "pera", "explica", "beleza"];
  while (out.length < targetLen) {
    out.push(fillers[out.length % fillers.length]);
  }
  return out.slice(0, targetLen);
}

export function generateMultiturnConversations58() {
  const convs = [];
  let id = 0;
  const buckets = [
    { count: 50, min: 5, max: 9 },
    { count: 30, min: 10, max: 14 },
    { count: 10, min: 15, max: 19 },
    { count: 10, min: 20, max: 24 },
  ];
  for (const bucket of buckets) {
    for (let i = 0; i < bucket.count; i++) {
      id += 1;
      const theme = MULTITURN_THEMES[i % MULTITURN_THEMES.length];
      const targetLen = bucket.min + (i % (bucket.max - bucket.min + 1));
      const profile = PROFILES[i % PROFILES.length];
      const lang = LANG_MODS[i % LANG_MODS.length];
      const userTurns = expandTurns(theme.turns, targetLen).map((t) => lang.fn(t));
      convs.push({
        id: `MT-${String(id).padStart(4, "0")}`,
        type: "multiturn",
        theme: theme.theme,
        profile,
        lang: lang.id,
        turnCount: userTurns.length,
        userTurns,
        dimensions: [theme.theme, profile, lang.id, `turns_${targetLen}`],
      });
    }
  }
  return convs;
}

/** Critical historical cases — always included */
export function generateCriticalScenarios() {
  const critical = [
    { id: "CR-MV114", family: "commercial_followup", message: "e memória?", history: [{ role: "user", content: "me recomenda um celular até 2000" }, { role: "assistant", content: "Eu iria no iPhone 13." }] },
    { id: "CR-OUTRO", family: "continuity_pronoun", message: "e o outro?", history: [{ role: "user", content: "compara A55 e M34" }, { role: "assistant", content: "O A55 leva vantagem em bateria." }] },
    { id: "CR-CAMERA", family: "commercial_followup", message: "e a câmera?", history: [{ role: "user", content: "compara opções" }, { role: "assistant", content: "Recomendo iPhone 13." }] },
    { id: "CR-FILLER-HM", family: "reaction", message: "hm mano", history: [{ role: "user", content: "explica mano" }, { role: "assistant", content: "Claro! O que você gostaria que eu explicasse?" }] },
    { id: "CR-FILLER-NAO", family: "disagreement", message: "não", history: [{ role: "user", content: "discordo" }, { role: "assistant", content: "Posso saber mais sobre o que te levou a essa opinião?" }] },
    { id: "CR-SECA", family: "ambiguous_social", message: "seca", history: [{ role: "assistant", content: "Recomendo o Galaxy A55." }] },
    { id: "CR-REJECT", family: "rejection_recommendation", message: "não quero esse", history: [{ role: "assistant", content: "Eu iria no iPhone 13." }] },
    { id: "CR-CORRECT", family: "correction", message: "você errou", history: [{ role: "assistant", content: "O A55 tem 5000mAh de bateria." }] },
    { id: "CR-MIXED", family: "mixed_greeting_commerce", message: "oi, quero celular até 2k", history: [] },
    { id: "CR-META", family: "meta_identity", message: "quem te criou?", history: [] },
  ];
  return critical.map((c) => ({
    ...c,
    type: "critical",
    profile: "critical",
    lang: "pt_neutro",
    contextId: "critical",
    dimensions: ["critical", c.family],
  }));
}

export function generateFullCatalog58() {
  const critical = generateCriticalScenarios();
  const matrixBase = generateMatrixScenarios(500);
  const seen = new Set(matrixBase.map((s) => s.message));
  const matrix = [...critical];
  for (const s of matrixBase) {
    if (matrix.length >= 500) break;
    if (!seen.has(s.message)) {
      matrix.push(s);
      seen.add(s.message);
    }
  }
  while (matrix.length < 500) {
    matrix.push(matrixBase[matrix.length % matrixBase.length]);
  }

  const multiturn = generateMultiturnConversations58();
  const stability = generateStabilityScenarios(matrix, 10, 200);
  const parity = generateParityScenarios(matrix, multiturn, 150);

  const totalTurnsEstimate =
    matrix.length +
    multiturn.reduce((a, c) => a + c.turnCount, 0) +
    stability.length +
    parity.length;

  return {
    version: "5.8",
    generatedAt: new Date().toISOString(),
    counts: {
      matrix: matrix.length,
      multiturn: multiturn.length,
      stability: stability.length,
      parity: parity.length,
      critical: critical.length,
      estimatedTurns: totalTurnsEstimate,
      profiles: PROFILES.length,
      families: 55,
    },
    profiles: PROFILES,
    families: [],
    matrix,
    multiturn,
    stability,
    parity,
    critical,
  };
}
