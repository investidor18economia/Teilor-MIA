#!/usr/bin/env node
/**
 * PATCH 5.8.8.1 — LLM provider error classification tests
 */
import assert from "node:assert/strict";
import {
  classifyOpenAIHttpFailure,
  buildMiaLlmProviderErrorFromUnknown,
  LLM_PROVIDER_REASON_CODES,
} from "../lib/miaLlmProviderError.js";

function testQuota429() {
  const body = JSON.stringify({
    error: {
      message: "You have no credits remaining. Add credits to continue using the API.",
      type: "insufficient_quota",
      code: "credit_balance_exhausted",
    },
  });
  const c = classifyOpenAIHttpFailure(429, body);
  assert.equal(c.reasonCode, LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_QUOTA_EXHAUSTED);
  assert.equal(c.recoverable, true);
}

function testRateLimit429() {
  const body = JSON.stringify({ error: { message: "Rate limit reached", type: "rate_limit" } });
  const c = classifyOpenAIHttpFailure(429, body);
  assert.equal(c.reasonCode, LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_RATE_LIMITED);
}

function testFromUnknownMessage() {
  const err = buildMiaLlmProviderErrorFromUnknown(
    new Error('OpenAI error 429 {"error":{"code":"credit_balance_exhausted"}}')
  );
  assert.ok(err);
  assert.equal(err.reasonCode, LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_QUOTA_EXHAUSTED);
}

function testTimeoutMessage() {
  const err = buildMiaLlmProviderErrorFromUnknown(new Error("OpenAI request timed out after 30000ms"));
  assert.ok(err);
  assert.equal(err.reasonCode, LLM_PROVIDER_REASON_CODES.LLM_PROVIDER_TIMEOUT);
}

const tests = [testQuota429, testRateLimit429, testFromUnknownMessage, testTimeoutMessage];
let pass = 0;
for (const t of tests) {
  t();
  pass += 1;
}
console.log(`PATCH 5.8.8.1 llm provider error tests: ${pass}/${tests.length} PASS`);
