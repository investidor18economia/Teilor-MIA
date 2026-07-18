/**
 * PATCH 12C — Public API hardening tests (no external calls).
 */
import {
  PUBLIC_API_REASON_CODES,
  applyPublicCorsHeaders,
  isJsonContentType,
  isPublicDebugEnabled,
  resolveAllowedOrigins,
  sanitizePublicChatResponsePayload,
  sanitizePublicUpstreamResponse,
  validatePublicChatRequestBody,
  validatePublicContentType,
  validatePublicHttpMethod,
  validatePublicLoadingRequestBody,
} from "../lib/miaPublicApiHardening.js";

let passed = 0;
let failed = 0;

function expectTrue(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

function expectEqual(label, actual, expected) {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label} expected=${expected} actual=${actual}`);
}

function mockRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
  };
}

{
  const post = validatePublicHttpMethod({ method: "POST" });
  const get = validatePublicHttpMethod({ method: "GET" });
  expectTrue("POST allowed", post.ok === true);
  expectTrue("GET rejected", get.ok === false);
  expectEqual("GET status", get.response.statusCode, 405);
  expectEqual("GET reason", get.response.payload.reasonCode, PUBLIC_API_REASON_CODES.METHOD_NOT_ALLOWED);
}

{
  expectTrue("json content type", isJsonContentType("application/json"));
  expectTrue("json charset content type", isJsonContentType("application/json; charset=utf-8"));
  expectTrue("text rejected", !isJsonContentType("text/plain"));

  const invalid = validatePublicContentType({
    headers: { "content-type": "text/plain" },
  });
  expectTrue("415 for text/plain", invalid.ok === false && invalid.response.statusCode === 415);
}

{
  const valid = validatePublicChatRequestBody({
    text: "iphone 13",
    messages: [{ role: "user", content: "oi" }],
    conversation_id: "conv-1",
    user_id: "guest",
    image_base64: "",
    session_context: { lastQuery: "iphone" },
  });
  expectTrue("valid chat body", valid.ok === true);
}

{
  const notObject = validatePublicChatRequestBody([]);
  expectTrue("non-object body rejected", notObject.ok === false && notObject.response.statusCode === 400);

  const badText = validatePublicChatRequestBody({ text: 123 });
  expectTrue("non-string text rejected", badText.ok === false);

  const badMessages = validatePublicChatRequestBody({ messages: "nope" });
  expectTrue("non-array messages rejected", badMessages.ok === false);

  const pollution = validatePublicChatRequestBody(
    JSON.parse('{"text":"oi","__proto__":{"polluted":true}}')
  );
  expectTrue("prototype pollution rejected", pollution.ok === false);
}

{
  const env = {
    MIA_PUBLIC_MAX_TEXT_CHARS: "10",
    MIA_PUBLIC_MAX_MESSAGES: "2",
    MIA_PUBLIC_MAX_MESSAGE_CHARS: "5",
    MIA_PUBLIC_MAX_IMAGE_BASE64_CHARS: "20",
  };

  const longText = validatePublicChatRequestBody({ text: "x".repeat(20) }, env);
  expectTrue("long text rejected", longText.response.statusCode === 413);

  const manyMessages = validatePublicChatRequestBody(
    {
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
    },
    env
  );
  expectTrue("too many messages rejected", manyMessages.response.statusCode === 413);

  const longMessage = validatePublicChatRequestBody(
    { messages: [{ role: "user", content: "123456" }] },
    env
  );
  expectTrue("long message rejected", longMessage.response.statusCode === 400);

  const longImage = validatePublicChatRequestBody({ image_base64: "a".repeat(30) }, env);
  expectTrue("long image rejected", longImage.response.statusCode === 413);
}

{
  const loading = validatePublicLoadingRequestBody({ text: "oi", session_context: {} });
  expectTrue("loading body valid", loading.ok === true);
}

{
  const res = mockRes();
  const allowed = applyPublicCorsHeaders(
    { headers: { origin: "https://economia-ai.vercel.app" } },
    res
  );
  expectTrue("approved origin allowed", allowed.originAllowed === true);
  expectEqual(
    "approved origin header",
    res.headers["access-control-allow-origin"],
    "https://economia-ai.vercel.app"
  );
  expectEqual("cache control no-store", res.headers["cache-control"], "no-store, max-age=0");
}

{
  const res = mockRes();
  const blocked = applyPublicCorsHeaders(
    { headers: { origin: "https://evil.example" } },
    res
  );
  expectTrue("evil origin blocked", blocked.originAllowed === false);
  expectTrue("no wildcard header", res.headers["access-control-allow-origin"] == null);
}

{
  const res = mockRes();
  const local = applyPublicCorsHeaders({ headers: { origin: "http://localhost:3000" } }, res);
  expectTrue("localhost allowed", local.originAllowed === true);
}

{
  const origins = resolveAllowedOrigins({
    MIA_PUBLIC_ALLOWED_ORIGINS: "https://teilor.com.br,https://www.teilor.com.br",
  });
  expectTrue("custom origin included", origins.has("https://teilor.com.br"));
  expectTrue("default origin included", origins.has("https://economia-ai.vercel.app"));
}

{
  const payload = sanitizePublicChatResponsePayload({
    reply: "ok",
    prices: [{ product_name: "iPhone 13" }],
    products: [{ product_name: "iPhone 13" }],
    session_context: { lastQuery: "iphone" },
    knowledgeMetadata: { transparencyRequired: true, knowledgeSource: "data_layer" },
    mia_debug: { runtime_precedence: { path: "secret-path" }, stack: "Error: x" },
    runtime_precedence: { hidden: true },
    runtime_enforcement: { hidden: true },
  });

  expectEqual("reply preserved", payload.reply, "ok");
  expectEqual("prices preserved", payload.prices.length, 1);
  expectEqual("knowledgeMetadata preserved", payload.knowledgeMetadata.knowledgeSource, "data_layer");
  expectTrue("mia_debug removed", payload.mia_debug == null);
  expectTrue("runtime_precedence removed", payload.runtime_precedence == null);
  expectTrue("runtime_enforcement removed", payload.runtime_enforcement == null);
}

{
  const debugPayload = sanitizePublicChatResponsePayload(
    { reply: "ok", mia_debug: { trace: true } },
    { MIA_PUBLIC_DEBUG_ENABLED: "true" }
  );
  expectTrue("debug enabled keeps mia_debug", debugPayload.mia_debug?.trace === true);
  expectTrue("debug disabled by default", isPublicDebugEnabled({}) === false);
}

{
  const upstream = sanitizePublicUpstreamResponse({
    status: 200,
    bodyText: JSON.stringify({
      reply: "ok",
      mia_debug: { winner: "secret" },
      knowledgeMetadata: { transparencyRequired: true },
    }),
  });
  const parsed = JSON.parse(upstream.bodyText);
  expectEqual("upstream status preserved", upstream.status, 200);
  expectTrue("upstream mia_debug stripped", parsed.mia_debug == null);
  expectTrue("upstream knowledgeMetadata kept", parsed.knowledgeMetadata?.transparencyRequired === true);
}

{
  const upstream500 = sanitizePublicUpstreamResponse({
    status: 500,
    bodyText: JSON.stringify({
      reply: "fail",
      stack: "Error at Object.<anonymous>",
      internalError: "provider exploded",
      mia_debug: { providerDiagnostics: "secret" },
    }),
  });
  const parsed500 = JSON.parse(upstream500.bodyText);
  expectEqual("500 stays 500", upstream500.status, 500);
  expectTrue("500 stack removed", parsed500.stack == null);
  expectTrue("500 internalError removed", parsed500.internalError == null);
  expectTrue("500 mia_debug removed", parsed500.mia_debug == null);
  expectTrue("500 reply preserved", typeof parsed500.reply === "string");
}

{
  const secretLeak = sanitizePublicUpstreamResponse({
    status: 200,
    bodyText: JSON.stringify({
      reply: "Bearer abcdef123456",
      mia_debug: { key: "API_SHARED_KEY=hidden" },
    }),
  });
  expectTrue(
    "secret patterns redacted",
    !/Bearer abcdef123456|API_SHARED_KEY=hidden/.test(secretLeak.bodyText)
  );
}

console.log(`\nPublic API hardening tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
