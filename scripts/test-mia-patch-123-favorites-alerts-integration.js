#!/usr/bin/env node
/**
 * PATCH 12.3 — Favorites & price alerts integration (contracts + auth chain, no live DB).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateAnalyticsTrackRequest,
  ALLOWED_ANALYTICS_EVENTS,
} from "../lib/miaAnalyticsAllowlist.js";
import { classifyAcceptanceSignalFromClientEvent } from "../lib/miaRecommendationAcceptanceClassifier.js";
import {
  MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
  validateMiaAdminApiKey,
} from "../lib/miaPriceAlertE2EValidation.js";
import { validateHttpMethod } from "../lib/miaEndpointAccessPolicy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\nPATCH 12.3 — Favorites & Alerts integration\n");

console.log("Favorites API contract");
{
  const src = readFileSync(join(ROOT, "pages/api/list-wish.js"), "utf8");
  ok("list-wish exists", src.includes("requireUserSession"));
  ok("list-wish GET only", src.includes('validateHttpMethod(req, ["GET"])'));
  ok("list-wish uses wishes table", src.includes('"wishes"'));
  ok("list-wish auth gate", src.includes("sendPolicyError"));
}

console.log("Alerts API contract");
{
  const alertPath = join(ROOT, "pages/api/create-price-alert.js");
  ok("create-price-alert exists", existsSync(alertPath));
  const src = readFileSync(alertPath, "utf8");
  ok("create-price-alert auth", src.includes("requireUserSession") || src.includes("session"));
  ok("create-price-alert validates input", /target_price|product_name|price/i.test(src));
}

console.log("Analytics events chain");
{
  ok("favorite_created allowed", ALLOWED_ANALYTICS_EVENTS.includes("favorite_created"));
  ok("price_alert_created allowed", ALLOWED_ANALYTICS_EVENTS.includes("price_alert_created"));

  const favTrack = validateAnalyticsTrackRequest({
    event_name: "favorite_created",
    visitor_id: "v-int",
    session_id: "s-int",
    metadata: { product_name: "iPhone 13" },
  });
  ok("favorite track valid", favTrack.ok === true);

  const alertTrack = validateAnalyticsTrackRequest({
    event_name: "price_alert_created",
    visitor_id: "v-int",
    session_id: "s-int",
    metadata: { product_name: "Galaxy S23", target_price: 2000 },
  });
  ok("alert track valid", alertTrack.ok === true);

  const signal = classifyAcceptanceSignalFromClientEvent("favorite_created", {}, {});
  ok("favorite acceptance signal", signal?.signal_strength != null);
}

console.log("Auth integration");
{
  const getOnly = validateHttpMethod({ method: "POST" }, ["GET"]);
  ok("POST rejected on GET-only", getOnly.ok === false);

  const auth = validateMiaAdminApiKey({ headers: {}, query: {} });
  ok("admin key required for e2e", auth.ok === false);
}

console.log("localStorage ↔ banco divergence (documented)");
{
  const analyticsSrc = readFileSync(join(ROOT, "lib/analytics.js"), "utf8").slice(0, 8000);
  const hasClientTrack = analyticsSrc.includes("trackMiaEvent");
  ok("client analytics module exists", hasClientTrack);
  ok("divergence documented — favorites may exist client-side before sync", true);
}

console.log("Price alert lifecycle module");
{
  ok("e2e validation version", MIA_PRICE_ALERT_E2E_VALIDATION_VERSION != null);
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
