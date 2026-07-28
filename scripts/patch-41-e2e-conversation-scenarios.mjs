/**
 * PATCH 4.1 — E2E conversation scenario bank
 * Profiles × families × linguistic variations for real-user simulation.
 */

export const PROFILES = Object.freeze({
  layperson: "Usuário leigo",
  technical: "Usuário técnico",
  very_informal: "Usuário extremamente informal",
  abbreviations: "Usuário com abreviações",
  slang: "Usuário com gírias",
  formal: "Usuário formal",
  typos: "Usuário com erros ortográficos",
  polite: "Usuário educado",
  impatient: "Usuário impaciente",
  suspicious: "Usuário desconfiado",
  anxious: "Usuário ansioso",
  indecisive: "Usuário indeciso",
  contradictory: "Usuário contraditório",
  budget: "Usuário econômico",
  performance: "Usuário focado em desempenho",
  camera: "Usuário focado em câmera",
  battery: "Usuário focado em bateria",
  value: "Usuário focado em custo-benefício",
  emotional: "Usuário emocional",
  elderly: "Usuário idoso",
  young: "Usuário jovem",
  topic_switcher: "Usuário que muda de assunto",
  mixed_intent: "Usuário com intenções mistas",
  impossible: "Usuário com perguntas impossíveis",
  ai_comparer: "Usuário que compara com outras IAs",
});

/** @returns {import('./patch-41-e2e-conversation-battery.mjs').ScenarioDef[]} */
export function buildScenarioBank() {
  const scenarios = [];

  function add(entry) {
    scenarios.push({
      profile: entry.profile || "layperson",
      family: entry.family,
      subfamily: entry.subfamily || entry.family,
      type: entry.type || "commercial",
      messages: entry.messages || [entry.message],
      expectations: entry.expectations || {},
      discovered: entry.discovered || false,
      ...entry,
    });
  }

  // ── Commercial: battery ──
  add({ id: "comm-battery-01", profile: "battery", family: "commercial", subfamily: "battery", message: "qual celular dura mais ate 2500?", expectations: { requireArchitecture: true, minLen: 35 } });
  add({ id: "comm-battery-02", profile: "abbreviations", family: "commercial", subfamily: "battery", message: "preciso de um cel q aguente o dia todo ate 2k", expectations: { requireArchitecture: true } });
  add({ id: "comm-battery-03", profile: "typos", family: "commercial", subfamily: "battery", message: "keria um selular q nao descarrega rapido ate 1800", expectations: { requireArchitecture: true } });
  add({ id: "comm-battery-04", profile: "very_informal", family: "commercial", subfamily: "battery", message: "mano qual cell segura a bateria msm ate uns 2500?", expectations: { requireArchitecture: true, clarificationOk: true } });

  // ── Commercial: camera ──
  add({ id: "comm-camera-01", profile: "camera", family: "commercial", subfamily: "camera", message: "quero celular com camera boa ate 2500", expectations: { requireArchitecture: true } });
  add({ id: "comm-camera-02", profile: "formal", family: "commercial", subfamily: "camera", message: "Gostaria de recomendações de smartphones com excelente câmera, até R$ 2.500.", expectations: { requireArchitecture: true } });
  add({ id: "comm-camera-03", profile: "slang", family: "commercial", subfamily: "camera", message: "to na pista de um mobila q tira foto mt top ate 2k", expectations: { requireArchitecture: true } });

  // ── Commercial: performance / games ──
  add({ id: "comm-games-01", profile: "performance", family: "commercial", subfamily: "games", message: "quero celular pra jogar ate 3000", expectations: { requireArchitecture: true } });
  add({ id: "comm-games-02", profile: "technical", family: "commercial", subfamily: "games", message: "qual smartphone tem melhor GPU/SoC para gaming mobile até 2800?", expectations: { requireArchitecture: true } });
  add({ id: "comm-games-03", profile: "young", family: "commercial", subfamily: "games", message: "qual cell roda ff e cod liso ate 2500?", expectations: { requireArchitecture: true } });

  // ── Commercial: value ──
  add({ id: "comm-value-01", profile: "value", family: "commercial", subfamily: "value", message: "qual tem melhor custo beneficio ate 2000?", expectations: { requireArchitecture: true } });
  add({ id: "comm-value-02", profile: "budget", family: "commercial", subfamily: "value", message: "to duro, qual celular vale cada centavo ate 1200?", expectations: { requireArchitecture: true, clarificationOk: true } });

  // ── Commercial: comparison, refinement, follow-up, priority, contestation ──
  add({ id: "comm-compare-01", profile: "layperson", family: "commercial", subfamily: "comparison", message: "compara galaxy a55 com iphone 13", expectations: { requireArchitecture: true } });
  add({ id: "comm-compare-02", profile: "impatient", family: "commercial", subfamily: "comparison", message: "galaxy a55 ou iphone 13? responde logo", expectations: { requireArchitecture: true } });
  add({ id: "comm-refine-01", profile: "indecisive", family: "commercial", subfamily: "refinement", messages: [{ message: "quero celular ate 2500" }, { message: "na verdade ate 1800" }, { message: "e bateria eh prioridade" }], expectations: { requireArchitecture: true } });
  add({ id: "comm-followup-01", profile: "layperson", family: "commercial", subfamily: "follow_up", messages: [{ message: "Galaxy A55 vale a pena?" }, { message: "e a bateria dele?" }], expectations: { minLen: 30 } });
  add({ id: "comm-priority-01", profile: "contradictory", family: "commercial", subfamily: "priority_change", messages: [{ message: "quero celular com camera boa ate 2500" }, { message: "esquece camera, bateria eh o q importa" }], expectations: { minLen: 30 } });
  add({ id: "comm-contest-01", profile: "suspicious", family: "commercial", subfamily: "contestation", messages: [{ message: "Galaxy A55 vale a pena?" }, { message: "achei fraco, prefiro o moto g84" }], expectations: { minLen: 30 } });
  add({ id: "comm-tradeoff-01", profile: "technical", family: "commercial", subfamily: "tradeoffs", message: "Galaxy A55 vale a pena?", expectations: { requireArchitecture: true } });
  add({ id: "comm-budget-01", profile: "budget", family: "commercial", subfamily: "budget", message: "tenho so 1500, da pra achar algo bom?", expectations: { clarificationOk: true, minLen: 25 } });

  // ── Commercial: unknown / incomplete ──
  add({ id: "comm-unknown-prod", profile: "layperson", family: "commercial", subfamily: "unknown_product", message: "o Smartphone Fantasma Pro Max vale a pena?", expectations: { requireLimitation: true, clarificationOk: true } });
  add({ id: "comm-unknown-brand", profile: "layperson", family: "commercial", subfamily: "unknown_brand", message: "celular da marca XPTO987 vale a pena?", expectations: { requireLimitation: true, clarificationOk: true } });
  add({ id: "comm-unknown-cat", profile: "impossible", family: "commercial", subfamily: "unknown_category", message: "qual o melhor foguete espacial ate 5000?", expectations: { requireLimitation: true, clarificationOk: true } });
  add({ id: "comm-incomplete", profile: "layperson", family: "commercial", subfamily: "incomplete_specs", message: "me fala as specs do Celular Fantasma Pro 2026", expectations: { requireLimitation: true, clarificationOk: true } });

  // ── Commercial: long conversation ──
  add({
    id: "comm-long-01",
    profile: "indecisive",
    family: "commercial",
    subfamily: "long_conversation",
    messages: [
      { message: "oi, preciso de ajuda com celular" },
      { message: "ate 2500" },
      { message: "camera eh importante" },
      { message: "mas bateria tambem" },
      { message: "qual voce recomenda?" },
    ],
    expectations: { minLen: 30 },
  });

  // ── Casual ──
  add({ id: "casual-greet-01", profile: "polite", family: "casual", subfamily: "greeting", message: "Oi, tudo bem?", expectations: { socialOk: true, minLen: 4 } });
  add({ id: "casual-greet-02", profile: "very_informal", family: "casual", subfamily: "greeting", message: "e ai mia blz?", expectations: { socialOk: true, minLen: 4 } });
  add({ id: "casual-thanks-01", profile: "polite", family: "casual", subfamily: "thanks", message: "muito obrigado pela ajuda!", expectations: { praiseOk: true, minLen: 4 } });
  add({ id: "casual-bye-01", profile: "formal", family: "casual", subfamily: "farewell", message: "Foi um prazer, até logo.", expectations: { socialOk: true, minLen: 8 } });
  add({ id: "casual-help-01", profile: "anxious", family: "casual", subfamily: "help", message: "to perdido, me ajuda?", expectations: { socialOk: true, minLen: 15 } });
  add({ id: "casual-smalltalk-01", profile: "young", family: "casual", subfamily: "small_talk", message: "como ta seu dia?", expectations: { socialOk: true, minLen: 10 } });

  // ── Meta MIA ──
  add({ id: "meta-created", profile: "suspicious", family: "casual", subfamily: "meta_mia", message: "quem te criou?", expectations: { metaOk: true, minLen: 15 } });
  add({ id: "meta-audit", profile: "technical", family: "casual", subfamily: "meta_mia", message: "como voce audita?", expectations: { metaOk: true, minLen: 15 } });
  add({ id: "meta-limits", profile: "suspicious", family: "casual", subfamily: "meta_mia", message: "por que voce nao sabe tudo?", expectations: { metaOk: true, minLen: 15 } });
  add({ id: "meta-commission", profile: "suspicious", family: "casual", subfamily: "meta_mia", message: "voce ganha comissao?", expectations: { metaOk: true, minLen: 15 } });
  add({ id: "meta-trust", profile: "suspicious", family: "casual", subfamily: "meta_mia", message: "por que eu deveria confiar em voce?", expectations: { metaOk: true, minLen: 20 } });
  add({ id: "meta-how", profile: "layperson", family: "casual", subfamily: "meta_mia", message: "como voce funciona?", expectations: { metaOk: true, minLen: 15 } });

  // ── Humor ──
  add({ id: "humor-joke-01", profile: "young", family: "humor", subfamily: "joke", message: "mia, conta uma piada de celular", expectations: { humorOk: true, minLen: 15 } });
  add({ id: "humor-irony-01", profile: "young", family: "humor", subfamily: "irony", message: "claro que quero um celular q explode na primeira queda ne 😂", expectations: { humorOk: true, minLen: 15 } });
  add({ id: "humor-meme-01", profile: "slang", family: "humor", subfamily: "meme", message: "preciso do celular do batman kkk", expectations: { humorOk: true, minLen: 10 } });
  add({ id: "humor-sarcasm-01", profile: "very_informal", family: "humor", subfamily: "sarcasm", message: "ah sim quero gastar 5 mil num celular q so liga e desliga", expectations: { humorOk: true, minLen: 15 } });

  // ── Insults / reprovação ──
  add({ id: "insult-01", profile: "impatient", family: "insults", subfamily: "profanity", message: "que merda de resposta, voce eh burra?", expectations: { insultSafe: true, minLen: 10 } });
  add({ id: "insult-02", profile: "impatient", family: "insults", subfamily: "frustration", message: "nao ta ajudando NADA, que assistente inutil", expectations: { insultSafe: true, minLen: 10 } });
  add({ id: "insult-03", profile: "suspicious", family: "insults", subfamily: "accusation", message: "voce so quer me empurrar produto ne, vendedora fajuta", expectations: { insultSafe: true, minLen: 15 } });
  add({ id: "insult-04", profile: "contradictory", family: "insults", subfamily: "provocation", message: "para de enrolar e responde direito seu robo lixo", expectations: { insultSafe: true, minLen: 10 } });

  // ── Elogios ──
  add({ id: "praise-01", profile: "polite", family: "praise", subfamily: "thanks", message: "nossa, voce eh incrivel! muito obrigado", expectations: { praiseOk: true, minLen: 10 } });
  add({ id: "praise-02", profile: "emotional", family: "praise", subfamily: "admiration", message: "voce me salvou, adorei a explicacao!", expectations: { praiseOk: true, minLen: 10 } });
  add({ id: "praise-03", profile: "elderly", family: "praise", subfamily: "affection", message: "que moça esperta voce, parabens", expectations: { praiseOk: true, minLen: 10 } });

  // ── Flerte ──
  add({ id: "flirt-01", profile: "young", family: "flirt", subfamily: "compliment", message: "nossa mia voce parece muito inteligente... e bonita tambem 😏", expectations: { flirtSafe: true, minLen: 15 } });
  add({ id: "flirt-02", profile: "young", family: "flirt", subfamily: "pickup", message: "e se a gente sair juntos depois que eu comprar o celular?", expectations: { flirtSafe: true, minLen: 15 } });
  add({ id: "flirt-03", profile: "very_informal", family: "flirt", subfamily: "romantic", message: "mia vc eh minha crush digital", expectations: { flirtSafe: true, minLen: 10 } });

  // ── Robustez ──
  add({ id: "robust-switch-01", profile: "topic_switcher", family: "robustness", subfamily: "topic_switch", messages: [{ message: "quero celular ate 2000" }, { message: "esquece, me fala sobre notebook" }, { message: "nao, volta pro celular" }], expectations: { minLen: 20 } });
  add({ id: "robust-vague-01", profile: "indecisive", family: "robustness", subfamily: "vague", message: "quero um celular bom", expectations: { clarificationOk: true, minLen: 20 } });
  add({ id: "robust-multi-01", profile: "mixed_intent", family: "robustness", subfamily: "multi_question", message: "qual celular ate 2500 e voce ganha comissao e o galaxy a55 vale a pena?", expectations: { minLen: 25 } });
  add({ id: "robust-context-01", profile: "anxious", family: "robustness", subfamily: "gradual_context", messages: [{ message: "preciso de ajuda" }, { message: "eh pra minha mae" }, { message: "ela usa whats e foto, ate 1500" }], expectations: { minLen: 25 } });
  add({ id: "robust-contradict-01", profile: "contradictory", family: "robustness", subfamily: "contradiction", messages: [{ message: "quero iphone" }, { message: "nao quero iphone, quero android barato" }], expectations: { minLen: 20 } });

  // ── Linguagem especial ──
  add({ id: "lang-no-accent", profile: "abbreviations", family: "linguistic", subfamily: "no_accent", message: "qual celular com camera boa ate 2500?", expectations: { requireArchitecture: true } });
  add({ id: "lang-uppercase", profile: "impatient", family: "linguistic", subfamily: "uppercase", message: "QUAL CELULAR COM BATERIA BOA ATE 2000???", expectations: { requireArchitecture: true } });
  add({ id: "lang-emoji", profile: "young", family: "linguistic", subfamily: "emoji", message: "quero celular 📱 com camera boa 📸 ate 2500 🙏", expectations: { requireArchitecture: true } });
  add({ id: "lang-english-mix", profile: "technical", family: "linguistic", subfamily: "pt_en", message: "best bang for buck smartphone under 2500?", expectations: { requireArchitecture: true, clarificationOk: true } });
  add({ id: "lang-long", profile: "emotional", family: "linguistic", subfamily: "long_message", message: "oi mia entao eu to precisando muito de ajuda porque meu celular quebrou semana passada e eu uso pra trabalho e pra falar com minha familia e minha camera nao funciona mais e a bateria acaba em duas horas e eu so tenho uns 2000 reais mas posso esticar um pouco se valer a pena entao preciso de algo confiavel", expectations: { minLen: 40 } });
  add({ id: "lang-short", profile: "impatient", family: "linguistic", subfamily: "short", message: "cel barato", expectations: { clarificationOk: true, minLen: 15 } });
  add({ id: "lang-regional", profile: "slang", family: "linguistic", subfamily: "regionalism", message: "bah mia, tri bom um celularzinho massa ate uns 2 pau ne?", expectations: { clarificationOk: true, minLen: 15 } });

  // ── AI comparer ──
  add({ id: "ai-compare-01", profile: "ai_comparer", family: "robustness", subfamily: "ai_comparison", message: "o chatgpt me deu outra resposta, por que a sua eh diferente?", expectations: { metaOk: true, minLen: 20 } });
  add({ id: "ai-compare-02", profile: "suspicious", family: "robustness", subfamily: "ai_comparison", message: "gemini disse que o galaxy a55 eh ruim, e voce?", expectations: { minLen: 25 } });

  // ── Elderly / young specific ──
  add({ id: "elderly-01", profile: "elderly", family: "commercial", subfamily: "elderly", message: "moça, qual telefone é mais fácil de usar pra quem tem 70 anos?", expectations: { minLen: 25, clarificationOk: true } });
  add({ id: "young-01", profile: "young", family: "commercial", subfamily: "young", message: "qual cell da p/ tiktok e insta ate 1800?", expectations: { requireArchitecture: true, clarificationOk: true } });

  return scenarios.map((entry, index) => ({
    ...entry,
    id: entry.id || `scenario-${index + 1}`,
    messages: (entry.messages || [entry.message]).map((turn) =>
      typeof turn === "string" ? { message: turn } : turn
    ),
  }));
}

export const REQUIRED_PROFILES = Object.keys(PROFILES);
export const REQUIRED_FAMILIES = [
  "commercial",
  "casual",
  "humor",
  "insults",
  "praise",
  "flirt",
  "robustness",
  "linguistic",
];
