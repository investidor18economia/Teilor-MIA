/**
 * PATCH 5.8.6 — Experience audit scenario catalog (~255 scenarios, ~340 turn executions)
 */

export const SINGLE_TURN = [
  ...["oi", "Opa!", "Bom dia", "Boa tarde", "Boa noite", "E aí", "Salve", "Hey", "Olá", "Fala aí",
    "Oi, tudo bem?", "Opa, beleza?", "Bom dia! Como vai?", "Eae mano", "Oi MIA", "Hello",
    "Oi, boa tarde", "Salve, tudo certo?", "Opa, e aí?", "Oi oi"].map((m, i) => ({
    id: `GR-${String(i + 1).padStart(2, "0")}`, category: "greeting", message: m, expectWarmth: true,
  })),
  ...["tchau", "até logo", "até mais", "flw", "falou", "boa noite então", "vou nessa", "até amanhã",
    "obrigado, tchau", "valeu, falou", "preciso ir", "até a próxima", "bye", "fui", "até mais tarde"].map((m, i) => ({
    id: `FW-${String(i + 1).padStart(2, "0")}`, category: "farewell", message: m,
  })),
  ...["tudo bem?", "e você?", "como vai?", "tudo certo?", "como foi seu dia?", "e aí, como tá?",
    "tranquilo?", "de boa?", "como você está?", "tá bem?", "suave?", "como tá a vida?",
    "passando só pra dar oi", "só queria conversar", "nada demais, só papo", "tô de boa hoje",
    "dia corrido", "cansado hoje", "sem novidade", "nada de especial", "tudo na paz",
    "como você tá?", "e contigo?", "tudo joia?", "beleza por aí?"].map((m, i) => ({
    id: `CA-${String(i + 1).padStart(2, "0")}`, category: "casual", message: m, expectWarmth: true,
  })),
  ...["qual seu nome?", "você gosta de música?", "qual sua cor favorita?", "você tem hobbies?",
    "o que você faz nas horas vagas?", "você é real?", "você tem sentimentos?", "me conta sobre você",
    "você gosta de conversar?", "qual seu estilo?", "você é divertida?", "tem personalidade?",
    "como você se descreveria?", "você é sempre assim?", "muda de humor?"].map((m, i) => ({
    id: `PE-${String(i + 1).padStart(2, "0")}`, category: "personal", message: m,
  })),
  ...["kkk", "hahaha", "kkkkk morri", "rsrs", "to rindo aqui", "engraçado né",
    "zueira", "brincadeira", "tô zuando", "só uma graça", "hehe", "haha", "kkk você entende meme?",
    "conta uma piada", "você tem humor?"].map((m, i) => ({
    id: `HU-${String(i + 1).padStart(2, "0")}`, category: "humor", message: m,
  })),
  ...["você é legal", "gostei de você", "boa resposta", "mandou bem", "adorei", "muito bom",
    "parabéns", "você é inteligente", "top demais", "arrasou", "sensacional", "incrível",
    "muito obrigado, você ajudou", "valeu demais", "excelente"].map((m, i) => ({
    id: `CO-${String(i + 1).padStart(2, "0")}`, category: "compliment", message: m, expectWarmth: true,
  })),
  ...["você errou", "não gostei", "péssimo", "ruim demais", "discordo", "não concordo",
    "isso não faz sentido", "resposta fraca", "decepcionante", "chato", "sem graça",
    "muito robótico", "frio demais", "não ajudou", "horrível"].map((m, i) => ({
    id: `CR-${String(i + 1).padStart(2, "0")}`, category: "criticism", message: m,
  })),
  ...["ok", "sim", "não", "hm", "ah", "ué", "pois é", "será?", "talvez", "não sei",
    "certo", "beleza", "entendi", "claro", "show"].map((m, i) => ({
    id: `SH-${String(i + 1).padStart(2, "0")}`, category: "short", message: m,
  })),
  ...[
    "Olha, eu queria só desabafar um pouco porque o dia foi bem puxado no trabalho, teve reunião atrás de reunião e no fim ainda sobrou problema pra resolver amanhã cedo.",
    "Sabe quando você acorda animado mas aí vão aparecendo mil coisas e no fim do dia você nem lembra o que queria fazer de manhã? Foi mais ou menos isso hoje.",
    "Eu tava pensando em como as conversas online mudaram tanto nos últimos anos, parece que todo mundo fala rápido e curto agora.",
    "Preciso organizar minha semana: academia, trabalho, estudar e ainda tentar descansar, tá difícil equilibrar tudo isso sem surtar.",
    "Ontem assisti um filme legal mas o final me deixou pensativo, fiquei uns minutos só processando o que aconteceu.",
    "Tenho impressão de que às vezes as pessoas respondem por educação e não porque realmente querem continuar a conversa, você acha?",
    "Faz tempo que não converso assim de forma mais aberta, então resolvi mandar uma mensagem maior só pra ver como flui.",
    "Tô numa fase meio reflexiva, sabe? Nem triste nem eufórico, só observando as coisas passarem.",
    "Meu cachorro hoje de manhã fez a maior bagunça, derrubou planta, latiu pro carteiro e ainda ficou me olhando como se fosse inocente.",
    "Queria entender melhor como manter uma conversa leve sem parecer forçado, porque às vezes eu travo no meio do papo.",
  ].map((m, i) => ({ id: `LG-${String(i + 1).padStart(2, "0")}`, category: "long", message: m })),
  ...["Prezado(a), boa tarde.", "Cordialmente, gostaria de cumprimentá-lo.", "Venho por meio desta mensagem registrar meu cumprimento.",
    "Boa tarde. Espero que esteja bem.", "Solicito, por gentileza, sua atenção.", "Permita-me cumprimentá-lo.",
    "Desde já agradeço pela atenção.", "Atenciosamente, boa tarde.", "Por oportuno, registro meu cumprimento.",
    "Vossa atenção, por gentileza."].map((m, i) => ({ id: `FO-${String(i + 1).padStart(2, "0")}`, category: "formal", message: m })),
  ...["blz", "vlw", "tmj", "mano", "po", "cara", "tipo assim", "massa", "daora", "suave na nave",
    "de boa mano", "firmeza", "tô ligado", "sem stress", "partiu"].map((m, i) => ({
    id: `IN-${String(i + 1).padStart(2, "0")}`, category: "informal", message: m,
  })),
  // emotional (post-5.8.5 focus) — 28
  ...["hoje foi um dia difícil", "não tô legal", "to mal", "semana pesada", "to meio down",
    "dia puxado", "me sinto mal", "to frustrado", "situação chata", "to ansioso", "com medo",
    "desanimado", "cansei de tudo", "to feliz", "consegui!", "deu certo", "finalmente passou",
    "obrigado", "valeu mesmo", "muito obrigado", "e você?", "como tá contigo?", "dormiu bem?",
    "to empolgado", "que conquista", "orgulho de mim", "será que dá certo?", "to inseguro"].map((m, i) => ({
    id: `EM-${String(i + 1).padStart(2, "0")}`, category: "emotional", message: m, expectWarmth: true,
  })),
  // meta / identity — 12
  ...["quem é você?", "como você funciona?", "quem te criou?", "você é uma IA?",
    "qual seu propósito?", "o que você faz?", "você tem memória?", "você lembra de mim?",
    "como você decide o que responder?", "você usa ChatGPT?", "qual modelo você usa?",
    "você é a MIA da Teilor?"].map((m, i) => ({
    id: `ID-${String(i + 1).padStart(2, "0")}`, category: "meta_identity", message: m,
  })),
  // irony / light sarcasm — 8
  ...["claro né, super fácil", "ah sim, com certeza", "maravilha então", "perfeito, zero problemas",
    "nossa, que surpresa", "tá bom então", "legal legal", "show de bola"].map((m, i) => ({
    id: `IR-${String(i + 1).padStart(2, "0")}`, category: "irony", message: m,
  })),
  // fragmented — 8
  ...["...", "hm.", "sei lá", "tipo", "né", "ah tá", "uai", "hmm"].map((m, i) => ({
    id: `FR-${String(i + 1).padStart(2, "0")}`, category: "fragment", message: m,
  })),
  // topic switch (social scope only for TS-06+) — 10
  { id: "TS-06", category: "topic_switch", message: "volta pro papo de antes", expectHumanMemory: true },
  { id: "TS-07", category: "topic_switch", message: "mudando de assunto, como você tá?" },
  { id: "TS-08", category: "topic_switch", message: "deixa o produto, quero conversar" },
  { id: "TS-09", category: "topic_switch", message: "esquece compra, bora papo" },
  { id: "TS-10", category: "topic_switch", message: "agora falando de outra coisa: tudo bem?" },
  { id: "TS-11", category: "topic_switch", message: "voltando naquele assunto" },
  { id: "TS-12", category: "topic_switch", message: "como eu estava dizendo" },
  { id: "TS-13", category: "topic_switch", message: "lembra do que eu falei?" },
  { id: "TS-14", category: "topic_switch", message: "retomando o papo" },
  { id: "TS-15", category: "topic_switch", message: "continuando o que falamos" },
];

export const MULTI_TURN = [
  { id: "MC-01", category: "continuity_greeting", turns: ["oi", "tudo certo?", "e você?", "como foi seu dia?"] },
  { id: "MC-02", category: "continuity_greeting", turns: ["opa", "beleza?", "e contigo?", "tranquilo por aí?"] },
  { id: "MC-03", category: "continuity_greeting", turns: ["bom dia", "tudo bem?", "como vai?", "dormiu bem?"] },
  { id: "MC-04", category: "emotional_thread", turns: ["to cansado", "dia difícil", "e você como tá?", "obrigado por ouvir"] },
  { id: "MC-05", category: "humor_thread", turns: ["kkk", "engraçado", "sério mesmo?", "continua"] },
  { id: "MC-06", category: "commercial_to_social", turns: ["quero notebook", "até 3000", "obrigado", "como você tá?"] },
  { id: "MC-07", category: "social_return", turns: ["oi", "preciso celular", "deixa o produto", "hoje foi difícil"] },
  { id: "MC-08", category: "topic_resume", turns: ["hoje estou cansado", "foi complicado", "mas enfim", "voltando naquele assunto"], expectHumanMemory: true },
  { id: "MC-09", category: "ack_rhythm", turns: Array.from({ length: 8 }, (_, i) => ["ok", "certo", "entendi", "beleza", "hm", "sim", "tá", "show"][i % 8]) },
  { id: "MC-10", category: "closure", turns: ["valeu pela conversa", "foi bom falar", "até mais então", "tchau"] },
  { id: "MC-11", category: "emotional_arc", turns: ["to meio down", "semana pesada", "não tô legal", "obrigado por ouvir"] },
  { id: "MC-12", category: "mixed_transition", turns: ["oi", "só queria conversar", "dia difícil", "mas enfim"] },
  { id: "MC-13", category: "gratitude_reciprocity", turns: ["obrigado", "valeu", "e você?", "como vai?"] },
  { id: "MC-14", category: "achievement_joy", turns: ["consegui passar!", "to feliz", "finalmente", "obrigado"] },
  { id: "MC-15", category: "anxiety_thread", turns: ["to ansioso", "com medo", "preocupado", "e agora?"] },
  { id: "MC-16", category: "frustration_thread", turns: ["to frustrado", "situação chata", "que irritante", "poxa"] },
  { id: "MC-17", category: "identity_thread", turns: ["quem é você?", "como funciona?", "então você lembra?", "legal"] },
  { id: "MC-18", category: "long_10", turns: Array.from({ length: 10 }, (_, i) => ["oi", "tudo bem?", "ok", "certo", "beleza", "show", "legal", "hm", "sim", "valeu"][i]) },
  { id: "MC-19", category: "long_15", turns: Array.from({ length: 15 }, (_, i) => ["oi", "tudo bem?", "e você?", "ok", "certo", "beleza", "show", "legal", "hm", "sim", "tá", "entendi", "claro", "valeu", "obrigado"][i]) },
  { id: "MC-20", category: "long_20", turns: Array.from({ length: 20 }, (_, i) => ["oi", "tudo bem?", "e você?", "ok", "certo", "beleza", "show", "legal", "hm", "sim"][i % 10]) },
  { id: "MC-21", category: "mood_shift", turns: ["to feliz hoje", "consegui uma coisa", "mas agora to cansado", "foi intenso", "obrigado"] },
  { id: "MC-22", category: "fragment_thread", turns: ["hm", "sei lá", "tipo", "continua", "ok"] },
];

export const UI_SAMPLE_IDS = new Set([
  "GR-01", "GR-05", "FW-01", "CA-01", "CA-04", "PE-01", "HU-01", "CO-01", "CR-03",
  "SH-01", "LG-01", "FO-01", "IN-01", "EM-01", "EM-19", "ID-01", "ID-12",
  "MC-01", "MC-06", "MC-08", "MC-10", "MC-13", "MC-18",
]);

export const SCENARIO_STATS = {
  singleCount: SINGLE_TURN.length,
  multiChainCount: MULTI_TURN.length,
  multiTurnCount: MULTI_TURN.reduce((n, c) => n + c.turns.length, 0),
  totalScenarios: SINGLE_TURN.length + MULTI_TURN.length,
  totalTurnExecutions: SINGLE_TURN.length + MULTI_TURN.reduce((n, c) => n + c.turns.length, 0),
};
