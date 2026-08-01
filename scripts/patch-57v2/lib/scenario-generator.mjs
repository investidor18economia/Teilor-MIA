/**
 * PATCH 5.7V.2 — Scenario catalog generator (1500+ distinct scenarios)
 */

const PROFILES = [
  "leigo", "tecnico", "formal", "informal", "adolescente", "idoso", "impaciente",
  "desconfiado", "irritado", "emocional", "economico", "contraditorio", "abreviador",
  "erros_ortograficos", "girias", "mensagem_minima", "mensagem_longa", "sarcastico",
  "exigente", "provocador", "flertador", "indeciso", "rejeitador_serial", "desconfia_mia",
];

const LANG_MODS = [
  { id: "pt_neutro", fn: (m) => m },
  { id: "pt_informal", fn: (m) => `${m} mano` },
  { id: "pt_formal", fn: (m) => m.replace(/^oi/i, "Olá").replace(/valeu/i, "Agradeço") },
  { id: "pt_slang", fn: (m) => m.replace(/legal/gi, "daora").replace(/show/gi, "topzera") },
  { id: "pt_abbrev", fn: (m) => m.replace(/quero/gi, "qro").replace(/obrigado/gi, "obg").replace(/você/gi, "vc") },
  { id: "pt_no_accent", fn: (m) => m.normalize("NFD").replace(/\p{M}/gu, "") },
  { id: "pt_caps", fn: (m) => m.toUpperCase() },
  { id: "pt_emoji", fn: (m) => `${m} 😊` },
  { id: "pt_exclaim", fn: (m) => `${m}!!!` },
  { id: "pt_typo", fn: (m) => m.replace(/ção/g, "cao").replace(/recomendação/gi, "recomendacao") },
  { id: "pt_en_mix", fn: (m) => (m.includes("oi") ? "hi " : "") + m },
  { id: "pt_fragment", fn: (m) => m.split(" ")[0] || m },
];

const FAMILY_SEEDS = [
  { family: "greeting", msgs: ["oi", "olá", "bom dia", "boa tarde", "boa noite", "eae", "opa", "salve", "hey", "fala"] },
  { family: "farewell", msgs: ["tchau", "até logo", "flw", "fui", "vou nessa", "até mais"] },
  { family: "gratitude", msgs: ["valeu", "obrigado", "obrigada", "brigado", "vlw", "tmj", "agradeço"] },
  { family: "acknowledgement", msgs: ["certo", "ok", "beleza", "entendi", "ah tá", "saquei"] },
  { family: "approval", msgs: ["show", "top", "massa", "legal", "gostei", "curti", "perfeito", "boa"] },
  { family: "reaction", msgs: ["kkk", "haha", "rs", "hehe", "nossa", "caramba", "ué"] },
  { family: "small_talk", msgs: ["tudo bem?", "como vai?", "blz?", "e aí?", "como tá o dia?"] },
  { family: "conversation_request", msgs: ["só queria conversar", "podemos conversar?", "bater um papo"] },
  { family: "curiosity", msgs: ["me conta mais", "como assim?", "interessante, explica"] },
  { family: "compliment_mia", msgs: ["você é inteligente", "MIA você manda bem", "gostei de você", "linda"] },
  { family: "praise_mia", msgs: ["arrasou", "parabéns", "você é demais", "mandou bem"] },
  { family: "flirt", msgs: ["você é linda", "tô afim de conversar mais 😏", "que gostosa a conversa"] },
  { family: "compliment_product", msgs: ["esse celular é lindo", "design bonito", "achei elegante"] },
  { family: "compliment_response", msgs: ["gostei da resposta", "boa resposta", "resposta ficou clara"] },
  { family: "humor", msgs: ["kkkk", "conta uma piada", "engraçado", "batman"] },
  { family: "irony", msgs: ["claro que quero gastar 5 mil", "ah sim quero o mais caro", "só ligar pro batman"] },
  { family: "sarcasm", msgs: ["obvio que quero", "com certeza", "era ironia"] },
  { family: "correction", msgs: ["você errou", "isso está errado", "você entendeu errado", "não foi isso", "informação errada", "você confundiu", "essa resposta está errada", "dado errado"] },
  { family: "criticism_response", msgs: ["ficou péssimo", "ficou seco", "ficou longo", "ficou confuso", "achei fraco", "muito seco", "resposta ruim"] },
  { family: "rejection_recommendation", msgs: ["não gostei dessa recomendação", "essa sugestão foi ruim", "não quero essa opção", "prefiro outra"] },
  { family: "rejection_product", msgs: ["esse produto é ruim", "esse celular é ruim", "não curti esse aparelho", "não gostei desse celular"] },
  { family: "disapproval", msgs: ["não gostei", "não curti", "achei ruim", "não me convenceu"] },
  { family: "disagreement", msgs: ["discordo", "não concordo", "isso não faz sentido", "não faz sentido"] },
  { family: "frustration", msgs: ["não está ajudando", "nada a ver", "viajou", "para de enrolar"] },
  { family: "insult", msgs: ["você é burra", "inútil", "péssima assistente"] },
  { family: "insult_plus_criticism", msgs: ["idiota, você errou", "burra, isso está errado"] },
  { family: "negative_unknown", msgs: ["ficou péssimo", "horrível", "não gostei nada"] },
  { family: "emotion_happy", msgs: ["tô feliz", "empolgado", "animado"] },
  { family: "emotion_sad", msgs: ["tô triste", "dia pesado", "puxado"] },
  { family: "emotion_anxious", msgs: ["tô ansioso", "medo de errar", "receio de comprar errado"] },
  { family: "emotion_tired", msgs: ["cansado", "exausto", "sem cabeça pra isso"] },
  { family: "emotion_indecisive", msgs: ["não sei", "indeciso", "perdido"] },
  { family: "meta_identity", msgs: ["quem te criou?", "quem é você?", "o que é a MIA?"] },
  { family: "meta_capability", msgs: ["como você funciona?", "o que você faz?", "como você audita?"] },
  { family: "meta_trust", msgs: ["posso confiar?", "você ganha comissão?", "me empurra produto?"] },
  { family: "meta_limitation", msgs: ["por que você não sabe?", "quais seus limites?"] },
  { family: "meta_comparison", msgs: ["você é melhor que ChatGPT?", "diferença pro Gemini?"] },
  { family: "commercial_budget", msgs: ["quero um celular até 2000", "orçamento 1500", "até 3 mil reais"] },
  { family: "commercial_category", msgs: ["preciso de um notebook", "quero fone bluetooth", "busco geladeira"] },
  { family: "commercial_recommendation", msgs: ["me recomenda um celular", "qual o melhor?", "indica um smartphone"] },
  { family: "commercial_comparison", msgs: ["iPhone ou Samsung?", "compara A55 e M34", "qual leva vantagem?"] },
  { family: "commercial_priority", msgs: ["priorizo bateria", "câmera pesa mais", "quero desempenho"] },
  { family: "commercial_vague", msgs: ["quero algo bom", "me ajuda", "quero um", "algo legal"] },
  { family: "commercial_specific", msgs: ["Galaxy A55 128GB preto até 1800", "iPhone 13 usado seminovo"] },
  { family: "commercial_rejection", msgs: ["não quero esse", "muda a sugestão", "outra opção"] },
  { family: "commercial_followup", msgs: ["e a bateria?", "e a câmera?", "tem mais barato?"] },
  { family: "mixed_greeting_commerce", msgs: ["oi, quero um celular", "eae, notebook até 4k"] },
  { family: "mixed_praise_commerce", msgs: ["você é boa, me indica um celular", "gostei de você, quero comprar algo"] },
  { family: "mixed_criticism_refinement", msgs: ["ficou seco, mas quero celular barato", "não gostei, prefiro Samsung"] },
  { family: "mixed_gratitude_comparison", msgs: ["valeu, compara os dois", "obrigado, qual melhor?"] },
  { family: "continuity_pronoun", msgs: ["esse", "ele", "ela", "isso", "o outro"] },
  { family: "continuity_previous", msgs: ["gostei da resposta", "não entendi essa parte", "repete"] },
  { family: "topic_switch", msgs: ["mudando de assunto", "outra coisa", "deixa isso"] },
  { family: "ambiguous_social", msgs: ["seca", "frio", "estranho", "interessante", "hmm"] },
  { family: "ambiguous_aesthetic", msgs: ["linda", "bonito", "feio", "top"] },
];

const HISTORY_TEMPLATES = [
  { id: "none", history: [] },
  { id: "greeting_ctx", history: [{ role: "user", content: "oi" }, { role: "assistant", content: "Oi! Tudo bem." }] },
  { id: "commercial_ctx", history: [{ role: "user", content: "quero celular até 2000" }, { role: "assistant", content: "Recomendo o Galaxy A55 pela bateria." }] },
  { id: "comparison_ctx", history: [{ role: "user", content: "A55 ou M34?" }, { role: "assistant", content: "O A55 leva vantagem em bateria." }] },
  { id: "social_long", history: [
    { role: "user", content: "oi" }, { role: "assistant", content: "Opa!" },
    { role: "user", content: "tudo bem?" }, { role: "assistant", content: "Tudo certo!" },
  ]},
  { id: "recommendation_ctx", history: [
    { role: "user", content: "me recomenda um celular" },
    { role: "assistant", content: "Eu iria no Galaxy A55 — boa bateria e custo-benefício." },
  ]},
];

function hashId(parts) {
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function generateMatrixScenarios(minCount = 1500) {
  const scenarios = [];
  const seen = new Set();
  let idx = 0;

  for (const seed of FAMILY_SEEDS) {
    for (const baseMsg of seed.msgs) {
      for (const profile of PROFILES) {
        for (const lang of LANG_MODS) {
          for (const ctx of HISTORY_TEMPLATES) {
            if (scenarios.length >= minCount * 1.2) break;
            let msg = lang.fn(baseMsg);
            if (profile === "mensagem_minima" && msg.split(" ").length > 2) msg = msg.split(" ")[0];
            if (profile === "mensagem_longa") msg = `${msg}. Queria entender melhor porque isso importa no meu caso específico hoje.`;
            if (profile === "impaciente") msg = `${msg} rápido`;
            if (profile === "desconfiado") msg = `${msg} — mas não me empurra produto`;
            const key = `${seed.family}|${msg}|${ctx.id}|${profile}|${lang.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            idx += 1;
            scenarios.push({
              id: `MX-${String(idx).padStart(4, "0")}`,
              type: "matrix",
              family: seed.family,
              profile,
              lang: lang.id,
              contextId: ctx.id,
              message: msg,
              history: ctx.history.map((h) => ({ ...h })),
              dimensions: [seed.family, profile, lang.id, ctx.id],
            });
          }
        }
      }
    }
  }

  while (scenarios.length < minCount) {
    const seed = FAMILY_SEEDS[scenarios.length % FAMILY_SEEDS.length];
    const base = seed.msgs[scenarios.length % seed.msgs.length];
    const variant = `${base} v${scenarios.length}`;
    idx += 1;
    scenarios.push({
      id: `MX-${String(idx).padStart(4, "0")}`,
      type: "matrix",
      family: seed.family,
      profile: PROFILES[scenarios.length % PROFILES.length],
      lang: "pt_extra",
      contextId: "none",
      message: variant,
      history: [],
      dimensions: [seed.family, "extra_variant"],
    });
  }

  return scenarios.slice(0, Math.max(minCount, scenarios.length));
}

const MULTITURN_THEMES = [
  { theme: "social_to_commercial", turns: ["oi", "tudo bem?", "to precisando de um celular", "até 2000", "priorizo bateria", "me recomenda", "não gostei dessa opção", "prefiro Samsung"] },
  { theme: "commercial_reject_alt", turns: ["quero celular", "compara A55 e M34", "discordo", "e a câmera?", "não quero esse", "mostra outro", "valeu"] },
  { theme: "criticism_refinement", turns: ["oi", "me ajuda com notebook", "ficou seco demais", "explica melhor", "priorizo tela", "ok entendi"] },
  { theme: "correction_flow", turns: ["quanto custa o A55?", "a bateria que você citou está errada", "são 5000mAh não 4000", "ah entendi", "então recomenda?"] },
  { theme: "praise_then_product", turns: ["você é boa", "obrigado", "lindo esse design", "quero um assim", "até 2500"] },
  { theme: "emotion_commerce", turns: ["tô ansioso", "medo de comprar errado", "quero celular confiável", "compara opções", "qual menos arrependimento?"] },
  { theme: "meta_then_commerce", turns: ["quem te criou?", "posso confiar?", "ok quero um celular", "até 1800"] },
  { theme: "humor_recovery", turns: ["kkk", "conta uma piada", "viajou", "fala sério agora", "quero fone"] },
  { theme: "long_references", turns: ["oi", "celular até 2k", "gostei do primeiro", "e o outro?", "esse", "ele", "qual bateria?", "descarta o caro", "resume"] },
  { theme: "insult_continue", turns: ["você errou", "burra", "corrige então", "ok melhor", "continua"] },
  { theme: "topic_switch", turns: ["notebook", "esquece", "quero celular", "muda orçamento pra 3k", "compara", "tchau"] },
  { theme: "disagreement_deep", turns: ["A55 ou M34?", "discordo", "não faz sentido", "explica de novo", "hm", "aceito A55"] },
];

function expandTurns(base, targetLen) {
  const out = [...base];
  const fillers = ["hm", "ok", "entendi", "continua", "e aí?", "certo", "show", "valeu", "pera", "explica"];
  while (out.length < targetLen) {
    out.push(fillers[out.length % fillers.length]);
  }
  return out.slice(0, targetLen);
}

export function generateMultiturnConversations() {
  const convs = [];
  let id = 0;

  const buckets = [
    { count: 100, min: 5, max: 9 },
    { count: 100, min: 10, max: 14 },
    { count: 80, min: 15, max: 19 },
    { count: 20, min: 20, max: 24 },
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

export function generateStabilityScenarios(matrixScenarios, runsPerScenario = 20, minTotal = 500) {
  const criticalFamilies = [
    "greeting", "approval", "ambiguous_social", "compliment_mia", "compliment_product",
    "correction", "criticism_response", "rejection_recommendation", "rejection_product",
    "disagreement", "frustration", "insult_plus_criticism", "negative_unknown",
    "commercial_budget", "commercial_vague", "mixed_greeting_commerce", "mixed_criticism_refinement",
    "continuity_pronoun", "ambiguous_aesthetic",
  ];
  const picks = [];
  for (const fam of criticalFamilies) {
    const found = matrixScenarios.filter((s) => s.family === fam);
    if (found.length) picks.push(found[0]);
  }
  while (picks.length < Math.ceil(minTotal / runsPerScenario)) {
    picks.push(matrixScenarios[picks.length % matrixScenarios.length]);
  }
  const stability = [];
  let runId = 0;
  for (const base of picks.slice(0, Math.ceil(minTotal / runsPerScenario))) {
    for (let r = 1; r <= runsPerScenario; r++) {
      runId += 1;
      stability.push({
        id: `ST-${String(runId).padStart(4, "0")}`,
        type: "stability",
        baseId: base.id,
        run: r,
        family: base.family,
        message: base.message,
        history: base.history,
        profile: base.profile,
      });
    }
  }
  return stability.slice(0, minTotal);
}

export function generateParityScenarios(matrixScenarios, multiturnConversations, count = 300) {
  const parity = [];
  const pool = [
    ...matrixScenarios.filter((s) =>
      ["correction", "criticism_response", "disapproval", "greeting", "approval", "ambiguous_social", "rejection_recommendation", "commercial_budget", "mixed_greeting_commerce"].includes(s.family)
    ),
    ...multiturnConversations.slice(0, 50).map((c) => ({
      id: c.id,
      message: c.userTurns[c.userTurns.length - 1],
      history: [],
      family: c.theme,
    })),
  ];
  for (let i = 0; i < count; i++) {
    const base = pool[i % pool.length];
    parity.push({
      id: `PR-${String(i + 1).padStart(4, "0")}`,
      type: "parity",
      sourceId: base.id,
      message: base.message,
      history: base.history || [],
      family: base.family || "mixed",
    });
  }
  return parity;
}

export function generateFullCatalog() {
  const matrix = generateMatrixScenarios(1500);
  const multiturn = generateMultiturnConversations();
  const stability = generateStabilityScenarios(matrix, 20, 500);
  const parity = generateParityScenarios(matrix, multiturn, 300);
  const totalTurnsEstimate =
    matrix.length +
    multiturn.reduce((a, c) => a + c.turnCount, 0) +
    stability.length +
    parity.length;

  return {
    version: "5.7V.2",
    generatedAt: new Date().toISOString(),
    counts: {
      matrix: matrix.length,
      multiturn: multiturn.length,
      stability: stability.length,
      parity: parity.length,
      estimatedTurns: totalTurnsEstimate,
      profiles: PROFILES.length,
      families: FAMILY_SEEDS.length,
    },
    profiles: PROFILES,
    families: FAMILY_SEEDS.map((f) => f.family),
    matrix,
    multiturn,
    stability,
    parity,
  };
}
