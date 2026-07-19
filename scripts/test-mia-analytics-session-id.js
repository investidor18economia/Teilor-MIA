/**
 * PATCH Analytics 1.1 — session_id semantics (sessionStorage, legacy cleanup).
 */
import {
  getMiaSessionId,
  removeLegacyAnalyticsSessionIdFromLocalStorage,
  isMiaAnalyticsSessionIdFormatValid,
  MIA_ANALYTICS_SESSION_ID_KEY,
  trackMiaEvent,
} from "../lib/analytics.js";

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
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    },
    location: { pathname: "/app-mia" },
    navigator: { userAgent: "test-agent" },
  };
}

function clearWindow() {
  delete globalThis.window;
}

console.log("\nPATCH Analytics 1.1 — session_id tests\n");

// Test 1 — first session
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const id = getMiaSessionId();
  assert("Test 1 — generates valid session id", isMiaAnalyticsSessionIdFormatValid(id));
  assert(
    "Test 1 — persists in sessionStorage",
    globalThis.window.sessionStorage.getItem(MIA_ANALYTICS_SESSION_ID_KEY) === id
  );
}

// Test 2 — reuse same session
{
  clearWindow();
  const sessionStorage = createMockStorage({
    [MIA_ANALYTICS_SESSION_ID_KEY]: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  });
  installWindow({ sessionStorage, localStorage: createMockStorage() });
  const id = getMiaSessionId();
  assert("Test 2 — reuses existing sessionStorage id", id === "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
}

// Test 3 — do not reuse legacy localStorage
{
  clearWindow();
  const sessionStorage = createMockStorage();
  const localStorage = createMockStorage({
    [MIA_ANALYTICS_SESSION_ID_KEY]: "legacy-local-id-should-not-be-used",
  });
  installWindow({ sessionStorage, localStorage });
  const id = getMiaSessionId();
  assert("Test 3 — ignores legacy localStorage value", id !== "legacy-local-id-should-not-be-used");
  assert(
    "Test 3 — creates new sessionStorage id",
    sessionStorage.getItem(MIA_ANALYTICS_SESSION_ID_KEY) === id
  );
}

// Test 4 — legacy cleanup safe
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_ANALYTICS_SESSION_ID_KEY]: "legacy-local-id-should-not-be-used",
  });
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  getMiaSessionId();
  assert("Test 4 — removes legacy localStorage key", localStorage.getItem(MIA_ANALYTICS_SESSION_ID_KEY) === null);

  let threw = false;
  const brokenStorage = {
    removeItem() {
      throw new Error("storage blocked");
    },
  };
  try {
    removeLegacyAnalyticsSessionIdFromLocalStorage(brokenStorage);
  } catch {
    threw = true;
  }
  assert("Test 4 — legacy cleanup failure does not throw", threw === false);
}

// Test 5 — new tab simulated (empty sessionStorage)
{
  clearWindow();
  installWindow({
    sessionStorage: createMockStorage(),
    localStorage: createMockStorage(),
    crypto: { randomUUID: () => "tab-a-11111111-2222-4333-8444-555555555555" },
  });
  const tabA = getMiaSessionId();

  clearWindow();
  installWindow({
    sessionStorage: createMockStorage(),
    localStorage: createMockStorage(),
    crypto: { randomUUID: () => "tab-b-22222222-3333-4333-8444-555555555555" },
  });
  const tabB = getMiaSessionId();
  assert("Test 5 — new tab gets different session_id", tabA !== tabB);
}

// Test 6 — SSR / no window
{
  clearWindow();
  let threw = false;
  let id = null;
  try {
    id = getMiaSessionId();
  } catch {
    threw = true;
  }
  assert("Test 6 — SSR returns null without throwing", threw === false && id === null);
}

// Test 7 — reload preserves session_id
{
  clearWindow();
  const sessionStorage = createMockStorage({
    [MIA_ANALYTICS_SESSION_ID_KEY]: "reload-preserved-id-12345",
  });
  installWindow({ sessionStorage, localStorage: createMockStorage() });
  const first = getMiaSessionId();
  const second = getMiaSessionId();
  assert("Test 7 — reload keeps same session_id", first === second && first === "reload-preserved-id-12345");
}

// Test 8 — events include session_id
{
  clearWindow();
  const sessionStorage = createMockStorage();
  installWindow({ sessionStorage, localStorage: createMockStorage() });

  const captured = [];
  globalThis.fetch = async (_url, options) => {
    captured.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };

  await trackMiaEvent("mia_question_sent", { query_text: "teste", user_id: null });
  await trackMiaEvent("session_started", { metadata: { page: "/app-mia" } });
  await trackMiaEvent("mia_recommendation_shown", { product_name: "Produto" });
  await trackMiaEvent("offer_click", { offer_url: "https://example.test" });
  await trackMiaEvent("favorite_created", { product_name: "Produto" });
  await trackMiaEvent("price_alert_created", { product_name: "Produto" });

  const sessionId = sessionStorage.getItem(MIA_ANALYTICS_SESSION_ID_KEY);
  assert("Test 8 — six events captured", captured.length === 6);
  assert(
    "Test 8 — all events include session_id",
    captured.every((row) => row.session_id === sessionId && row.session_id)
  );
  assert(
    "Test 8 — event names preserved",
    captured.map((row) => row.event_name).join(",") ===
      "mia_question_sent,session_started,mia_recommendation_shown,offer_click,favorite_created,price_alert_created"
  );

  delete globalThis.fetch;
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
