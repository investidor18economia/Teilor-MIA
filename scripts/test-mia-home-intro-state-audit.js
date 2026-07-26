/**
 * Home intro state — evita regressão ao navegar menu/drawer.
 *
 * Usage: node scripts/test-mia-home-intro-state-audit.js
 */

import {
  computeMiaHomeIntroState,
  handleMiaOverlayDismiss,
} from "../lib/miaHomeIntroState.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const opening = {
  isMiaOpening: true,
  resposta: "Olá! Sou a MIA.",
  pergunta: null,
  offerCard: null,
};

const assistantTemp = {
  assistantTemp: true,
  resposta: null,
  pergunta: null,
  offerCard: null,
};

const userTurn = {
  pergunta: "Notebook",
  resposta: "Encontrei opções.",
  offerCard: null,
};

let pass = 0;

function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.log(`✗ ${name} → ${error.message}`);
    process.exitCode = 1;
  }
}

test("intro ativo com mensagem de abertura isolada", () => {
  const state = computeMiaHomeIntroState({
    hasMounted: true,
    greetingShown: true,
    history: [opening],
  });
  assert(state.isIntroState === true, "intro");
  assert(state.isConversationMode === false, "conversation");
});

test("intro permanece com abertura + assistantTemp (loading)", () => {
  const state = computeMiaHomeIntroState({
    hasMounted: true,
    greetingShown: true,
    history: [opening, assistantTemp],
  });
  assert(state.isIntroState === true, "intro during loading");
  assert(state.isConversationMode === false, "not conversation");
});

test("intro desliga após pergunta do usuário", () => {
  const state = computeMiaHomeIntroState({
    hasMounted: true,
    greetingShown: true,
    history: [opening, userTurn],
  });
  assert(state.isIntroState === false, "intro off");
  assert(state.isConversationMode === true, "conversation on");
});

test("sem greeting ainda não entra em intro", () => {
  const state = computeMiaHomeIntroState({
    hasMounted: true,
    greetingShown: false,
    history: [],
  });
  assert(state.isIntroState === false, "intro off before greeting");
});

test("intro não reaparece após segunda pergunta", () => {
  const state = computeMiaHomeIntroState({
    hasMounted: true,
    greetingShown: true,
    history: [opening, userTurn, { pergunta: "Outro", resposta: "Ok.", offerCard: null }],
  });
  assert(state.isIntroState === false, "intro stays off");
  assert(state.isConversationMode === true, "conversation stays on");
});

test("offerCard encerra intro mesmo sem pergunta explícita", () => {
  const state = computeMiaHomeIntroState({
    hasMounted: true,
    greetingShown: true,
    history: [opening, { offerCard: { title: "iPhone" }, resposta: "Aqui.", pergunta: null }],
  });
  assert(state.isIntroState === false, "intro off on offer");
  assert(state.isConversationMode === true, "conversation on");
});

test("overlay dismiss bloqueia propagação do clique", () => {
  let dismissed = false;
  const event = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  handleMiaOverlayDismiss(event, () => {
    dismissed = true;
  });
  assert(dismissed === true, "dismiss called");
  assert(event.defaultPrevented === true, "default prevented");
});

const total = 7;
console.log(`\nResultado: ${pass}/${total}`);
process.exit(process.exitCode || (pass === total ? 0 : 1));
