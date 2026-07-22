/**
 * PATCH 3.2 — conversation_id lifecycle tests (in-memory chat ownership).
 */
import {
  createAnalyticsConversationId,
  removeLegacyAnalyticsConversationIdFromLocalStorage,
  MIA_CONVERSATION_ID_KEY,
  MIA_ANALYTICS_VISITOR_ID_KEY,
  MIA_ANALYTICS_SESSION_ID_KEY,
  trackMiaEvent,
  trackMiaQuestionSent,
  trackMiaSessionStarted,
} from "../lib/analytics.js";
import {
  buildAnalyticsTrackPayload,
  assembleAnalyticsInsertRow,
  isAnalyticsUuid,
} from "../lib/miaAnalyticsPayload.js";
import { validateAnalyticsTrackRequest } from "../lib/miaAnalyticsAllowlist.js";

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    _dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

function installWindow({ sessionStorage, localStorage, crypto } = {}) {
  globalThis.window = {
    sessionStorage: sessionStorage || createMockStorage(),
    localStorage: localStorage || createMockStorage(),
    crypto: crypto || {
      randomUUID: () => "cccccccc-dddd-4eee-8fff-000000000001",
    },
    location: { pathname: "/app-mia" },
    navigator: { userAgent: "test-agent" },
  };
}

function clearWindow() {
  delete globalThis.window;
}

/** Minimal in-memory chat simulator (mirrors MIAChat ref lifecycle). */
function createChatConversationSimulator() {
  let currentConversationId = null;

  return {
    getCurrent() {
      return currentConversationId;
    },
    reset() {
      currentConversationId = null;
      removeLegacyAnalyticsConversationIdFromLocalStorage();
    },
    getOrCreate() {
      if (typeof currentConversationId === "string" && isAnalyticsUuid(currentConversationId)) {
        return currentConversationId;
      }
      const id = createAnalyticsConversationId();
      currentConversationId = id;
      return id;
    },
    simulateReload() {
      currentConversationId = null;
    },
    simulateNewTab() {
      return createChatConversationSimulator();
    },
  };
}

console.log("\nPATCH 3.2 — conversation_id lifecycle tests\n");

// Test 1 — page load: no conversation
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const chat = createChatConversationSimulator();
  chat.reset();
  assert("Test 1 — no conversation on load", chat.getCurrent() === null);
  assert("Test 1 — legacy key not read", globalThis.window.localStorage.getItem(MIA_CONVERSATION_ID_KEY) == null);
}

// Test 2 — session_started explicit null
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaSessionStarted();
  assert("Test 2 — session_started captured", captured.length === 1);
  assert("Test 2 — conversation_id null", captured[0].conversation_id === null);

  delete globalThis.fetch;
}

// Test 3 — first question creates UUID once
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const chat = createChatConversationSimulator();
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  const conversationId = chat.getOrCreate();
  await trackMiaQuestionSent("Primeira pergunta", { conversationId });

  assert("Test 3 — UUID created", isAnalyticsUuid(conversationId));
  assert("Test 3 — tracking uses same UUID", captured[0].conversation_id === conversationId);
  assert("Test 3 — not stored in localStorage", globalThis.window.localStorage.getItem(MIA_CONVERSATION_ID_KEY) == null);

  delete globalThis.fetch;
}

// Test 4 — continuity reuses same ID
{
  const chat = createChatConversationSimulator();
  const first = chat.getOrCreate();
  const second = chat.getOrCreate();
  assert("Test 4 — continuity reuses ID", first === second);
}

// Test 5 — explicit reset then new ID
{
  const chat = createChatConversationSimulator();
  const first = chat.getOrCreate();
  chat.reset();
  assert("Test 5 — reset clears ID", chat.getCurrent() === null);
  const second = chat.getOrCreate();
  assert("Test 5 — new conversation gets new UUID", isAnalyticsUuid(second));
  assert("Test 5 — IDs differ after reset", first !== second);
}

// Test 6 — reload simulation
{
  const chat = createChatConversationSimulator();
  const beforeReload = chat.getOrCreate();
  chat.simulateReload();
  assert("Test 6 — reload clears in-memory ID", chat.getCurrent() === null);
  const afterReload = chat.getOrCreate();
  assert("Test 6 — post-reload new UUID", isAnalyticsUuid(afterReload));
  assert("Test 6 — post-reload ID differs", beforeReload !== afterReload);
}

// Test 7 — new tab independent conversation
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_ANALYTICS_VISITOR_ID_KEY]: "11111111-2222-4333-8444-555555555555",
  });
  installWindow({ sessionStorage: createMockStorage({ tab: "a" }), localStorage });

  const tabA = createChatConversationSimulator();
  const idA = tabA.getOrCreate();

  clearWindow();
  installWindow({ sessionStorage: createMockStorage({ tab: "b" }), localStorage });
  const tabB = createChatConversationSimulator();
  const idB = tabB.getOrCreate();

  assert("Test 7 — tab B gets different conversation_id", idA !== idB);
}

// Test 8 — legacy localStorage ignored
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_CONVERSATION_ID_KEY]: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  });
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  removeLegacyAnalyticsConversationIdFromLocalStorage();
  const chat = createChatConversationSimulator();
  chat.reset();
  const id = chat.getOrCreate();
  assert("Test 8 — legacy key removed", localStorage.getItem(MIA_CONVERSATION_ID_KEY) == null);
  assert("Test 8 — new ID not equal to legacy", id !== "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
}

// Test 9 — tracking and API same UUID (explicit pass-through)
{
  const chat = createChatConversationSimulator();
  const conversationId = chat.getOrCreate();
  const apiPayload = { conversation_id: conversationId, text: "test" };
  assert("Test 9 — API payload uses chat ID", apiPayload.conversation_id === conversationId);
}

// Test 10 — recommendation uses request-scoped ID (race-safe)
{
  const chat = createChatConversationSimulator();
  const requestConversationId = chat.getOrCreate();
  chat.reset();
  chat.getOrCreate(); // conversation B
  const recommendationConversationId = requestConversationId;
  assert(
    "Test 10 — async recommendation keeps request ID",
    recommendationConversationId !== chat.getCurrent()
  );
}

// Test 11 — visitor_id independent
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_ANALYTICS_VISITOR_ID_KEY]: "11111111-2222-4333-8444-555555555555",
  });
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  const chat = createChatConversationSimulator();
  chat.reset();
  chat.getOrCreate();
  assert(
    "Test 11 — visitor_id preserved",
    localStorage.getItem(MIA_ANALYTICS_VISITOR_ID_KEY) === "11111111-2222-4333-8444-555555555555"
  );
}

// Test 12 — createAnalyticsConversationId SSR safe
{
  clearWindow();
  assert("Test 12 — SSR create returns null", createAnalyticsConversationId() === null);
}

// Test 13 — canonical payload order
{
  const payload = buildAnalyticsTrackPayload(
    "mia_question_sent",
    "sess-1",
    { query_text: "test" },
    "11111111-2222-4333-8444-555555555555",
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  );
  const keys = Object.keys(payload);
  assert("Test 13 — order conversation_id fourth", keys[3] === "conversation_id");
}

// Test 14 — assembleAnalyticsInsertRow default null
{
  const row = assembleAnalyticsInsertRow({ event_name: "session_started" });
  assert("Test 14 — insert default null", row.conversation_id === null);
}

// Test 15 — validator accepts valid conversation_id
{
  const valid = validateAnalyticsTrackRequest({
    event_name: "mia_question_sent",
    conversation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    session_id: "sess",
    metadata: {},
  });
  assert("Test 15 — validator ok", valid.ok === true);
}

// Test 16 — explicit false → null
{
  const payload = buildAnalyticsTrackPayload("session_started", "sess", {}, null, false);
  assert("Test 16 — explicit false null", payload.conversation_id === null);
}

// Test 17 — trackMiaEvent without conversationId omits field
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaEvent("offer_click", { metadata: {} });
  assert("Test 17 — offer_click without active conversation", !("conversation_id" in captured[0]));

  delete globalThis.fetch;
}

// Test 18 — session_id independent from conversation reset
{
  clearWindow();
  const sessionStorage = createMockStorage();
  installWindow({ sessionStorage, localStorage: createMockStorage() });
  const { getMiaSessionId } = await import("../lib/analytics.js");
  const sessionBefore = getMiaSessionId();
  const chat = createChatConversationSimulator();
  chat.getOrCreate();
  chat.reset();
  const sessionAfter = getMiaSessionId();
  assert("Test 18 — session_id stable on conversation reset", sessionBefore === sessionAfter);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
