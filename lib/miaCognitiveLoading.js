/**
 * PATCH UX-1 — Cognitive Loading States (read-only, deterministic, zero LLM)
 *
 * Observa sinais cognitivos já produzidos pela arquitetura e deriva copy visual.
 * Não altera routing, winner, ranking ou resposta.
 */

const LOADING_COPY = Object.freeze({
  ALTERNATIVE_EXPLORATION: [
    "Vou abrir um pouco as possibilidades...",
    "Deixa eu ver outras opções também...",
    "Procurando outra opção boa...",
    "Analisando alternativas...",
  ],
  SECOND_BEST_DISCOVERY: [
    "Vou conferir qual seria o plano B...",
    "Deixa eu ver quem ficou logo atrás...",
    "Vou conferir a outra melhor opção...",
    "Deixa eu ver outra melhor escolha...",
  ],
  SOCIAL_VALIDATION: [
    "Vou ver como essa escolha costuma ser recebida...",
    "Vou conferir o que a galera acha...",
    "Deixa eu ver o que acham...",
    "Analisando como a galera enxerga...",
  ],
  ANTI_REGRET: [
    "Vou olhar os riscos antes de cravar...",
    "Deixa eu conferir onde você poderia se arrepender...",
    "Pensando onde você pode se arrepender...",
    "Deixa eu ver onde estão os riscos...",
  ],
  CONFIDENCE_CHALLENGE: [
    "Vou revisar se essa escolha continua fazendo sentido...",
    "Deixa eu conferir se eu manteria essa recomendação...",
    "Pensando melhor se ainda vale a pena mesmo...",
    "Pensando se ainda compensa...",
  ],
  DECISION_CONFIRMATION: [
    "Vou revisar os pontos antes de fechar...",
    "Deixa eu confirmar se tudo está alinhado...",
    "Confirmando se está tudo certo mesmo...",
    "Revisando se essa escolha ainda faz sentido...",
  ],
  CONSTRAINT_CHANGE: [
    "Vou ver o que muda com isso...",
    "Deixa eu recalcular com essa nova prioridade...",
    "Pensando bem o que muda...",
    "Analisando seu caso e pensando o que muda...",
  ],
  COMPARISON: [
    "Vou colocar as opções lado a lado...",
    "Deixa eu ver o que realmente muda entre essas opções...",
    "Deixa eu ver o que diferencia mesmo...",
    "Analisando bem as diferenças...",
  ],
  COMPREHENSION: [
    "Vou explicar isso de um jeito mais claro...",
    "Deixa eu reorganizar a explicação...",
    "Pensando em como deixar isso mais claro...",
    "Analisando o melhor jeito de explicar...",
  ],
  SOFT_DISAGREEMENT: [
    "Vou revisar os pontos com calma...",
    "Deixa eu olhar isso de outro ângulo...",
    "Pensando no que ainda não fechou pra você...",
    "Analisando o que ainda pode estar em aberto...",
  ],
  ACKNOWLEDGEMENT: [
    "Certo, vou seguir daqui...",
    "Entendi, vou continuar no contexto...",
    "Beleza, mantendo a linha da conversa...",
    "Ok, seguindo com a recomendação...",
  ],
  NEW_SEARCH: [
    "Vou entender melhor o que você precisa...",
    "Vou analisar melhor olhando seu caso...",
    "Organizando os critérios da busca...",
    "Vou organizar as opções antes de começar...",
  ],
  FALLBACK: [
    "Analisando sua mensagem...",
    "Pensando na melhor resposta...",
    "Analisando bem antes de responder...",
    "Deixa eu pensar...",
  ],
});

export const COGNITIVE_LOADING_FALLBACK = LOADING_COPY.FALLBACK[0];

const PATH_HINT_PREFIX_MAP = [
  ["alternative_exploration", "ALTERNATIVE_EXPLORATION"],
  ["second_best_discovery", "SECOND_BEST_DISCOVERY"],
  ["social_validation", "SOCIAL_VALIDATION"],
  ["anti_regret", "ANTI_REGRET"],
  ["confidence_challenge", "CONFIDENCE_CHALLENGE"],
  ["decision_confirmation", "DECISION_CONFIRMATION"],
  ["constraint_change", "CONSTRAINT_CHANGE"],
  ["comprehension", "COMPREHENSION"],
  ["soft_disagreement", "SOFT_DISAGREEMENT"],
  ["acknowledgement", "ACKNOWLEDGEMENT"],
  ["new_commercial_search", "NEW_SEARCH"],
  ["comparison", "COMPARISON"],
  ["refinement_search", "CONSTRAINT_CHANGE"],
];

const CONVERSATION_ACT_MAP = Object.freeze({
  alternative_exploration: "ALTERNATIVE_EXPLORATION",
  second_best_discovery: "SECOND_BEST_DISCOVERY",
  social_validation: "SOCIAL_VALIDATION",
  anti_regret: "ANTI_REGRET",
  confidence_challenge: "CONFIDENCE_CHALLENGE",
  decision_confirmation: "DECISION_CONFIRMATION",
  constraint_refinement: "CONSTRAINT_CHANGE",
  constraint_change: "CONSTRAINT_CHANGE",
  explicit_new_search: "NEW_SEARCH",
  comparison: "COMPARISON",
  comparison_followup: "COMPARISON",
  comprehension: "COMPREHENSION",
  soft_disagreement: "SOFT_DISAGREEMENT",
  acknowledgement: "ACKNOWLEDGEMENT",
  greeting: "ACKNOWLEDGEMENT",
  search: "NEW_SEARCH",
});

const TURN_TYPE_MAP = Object.freeze({
  NEW_SEARCH: "NEW_SEARCH",
  COMPARISON: "COMPARISON",
  COMPARISON_FOLLOWUP: "COMPARISON",
  PRIORITY_SHIFT: "CONSTRAINT_CHANGE",
  REFINEMENT: "CONSTRAINT_CHANGE",
  ALTERNATIVE_REQUEST: "ALTERNATIVE_EXPLORATION",
  EXPLANATION_REQUEST: "COMPREHENSION",
  VALUE_QUESTION: "CONFIDENCE_CHALLENGE",
  OBJECTION: "SOFT_DISAGREEMENT",
  REACTION: "ACKNOWLEDGEMENT",
  CONVERSATIONAL: "FALLBACK",
});

const INTENT_MAP = Object.freeze({
  comparison: "COMPARISON",
  search: "NEW_SEARCH",
  greeting: "ACKNOWLEDGEMENT",
  decision: "CONFIDENCE_CHALLENGE",
});

function simpleStableHash(input = "") {
  let hash = 0;
  const str = String(input);
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickStablePhrase(phrases, seed = "") {
  const list = Array.isArray(phrases) && phrases.length ? phrases : LOADING_COPY.FALLBACK;
  const idx = simpleStableHash(seed) % list.length;
  return list[idx];
}

function normalizeToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function resolveLoadingKey({
  intent = "",
  conversationAct = "",
  turnType = "",
  responsePathHint = "",
} = {}) {
  const act = normalizeToken(conversationAct);
  if (act && CONVERSATION_ACT_MAP[act]) {
    return CONVERSATION_ACT_MAP[act];
  }

  const hint = String(responsePathHint || "").toLowerCase();
  for (const [prefix, key] of PATH_HINT_PREFIX_MAP) {
    if (hint.startsWith(prefix)) return key;
  }

  const turn = String(turnType || "").toUpperCase();
  if (turn && TURN_TYPE_MAP[turn]) {
    return TURN_TYPE_MAP[turn];
  }

  const intentNorm = normalizeToken(intent);
  if (intentNorm && INTENT_MAP[intentNorm]) {
    return INTENT_MAP[intentNorm];
  }

  return "FALLBACK";
}

/**
 * Deriva estado visual de loading a partir de sinais cognitivos existentes.
 * Read-only — não consulta LLM, não altera decisões.
 */
export function deriveCognitiveLoadingState(input = {}) {
  const {
    intent = "",
    conversationAct = "",
    turnType = "",
    responsePathHint = "",
    anchor = null,
    budget = null,
    vertical = "",
    seed = "",
  } = input;

  const key = resolveLoadingKey({
    intent,
    conversationAct,
    turnType,
    responsePathHint,
  });

  const phraseSeed = [
    seed,
    key,
    conversationAct,
    turnType,
    responsePathHint,
    anchor ? "anchored" : "cold",
    budget || "",
    vertical || "",
  ]
    .filter(Boolean)
    .join("|");

  const description = pickStablePhrase(LOADING_COPY[key] || LOADING_COPY.FALLBACK, phraseSeed);
  const title = description.replace(/\.\.\.$/, "").trim() || COGNITIVE_LOADING_FALLBACK.replace(/\.\.\.$/, "");

  return {
    key,
    title,
    description: description || COGNITIVE_LOADING_FALLBACK,
    meta: {
      intent: intent || null,
      conversationAct: conversationAct || null,
      turnType: turnType || null,
      responsePathHint: responsePathHint || null,
      anchor: anchor || null,
      budget: budget ?? null,
      vertical: vertical || null,
    },
  };
}

export function getCognitiveLoadingFallbackState(seed = "") {
  return deriveCognitiveLoadingState({ seed });
}
