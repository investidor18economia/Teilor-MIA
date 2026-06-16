/**
 * PATCH Comercial 1.1 — Google Shopping Adapter Alignment Audit
 *
 * Usage: node scripts/test-mia-google-shopping-adapter-alignment-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  PRODUCT_SOURCE_IDS,
  bootstrapDefaultProductSourceRegistry,
  clearProductSourceRegistry,
  dedupeProducts,
  getEnabledProductSourceAdapters,
  getProductSourceAdapter,
  isNormalizedProductShape,
  isNormalizedProductUsable,
  validateProductSourceAdapter,
} from "../lib/productSourceAdapter/index.js";
import {
  GOOGLE_SHOPPING_LEGACY_PROVIDER,
  fetchGoogleShoppingAdapterResult,
  fetchGoogleShoppingLegacyResult,
  googleShoppingAdapter,
  mapNormalizedProductsToLegacy,
  toLegacyCommercialProduct,
} from "../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const MOCK_SERP = [
  {
    product_name: "Notebook Acer Nitro V15",
    price: "R$ 4.999,00",
    link: "https://loja.example/notebook",
    thumbnail: "https://img.example/nb.jpg",
    source: "Magalu",
  },
  {
    product_name: "Notebook Acer Nitro V15",
    price: "R$ 4.899,00",
    link: "https://loja.example/notebook",
    thumbnail: "https://img.example/nb2.jpg",
    source: "Amazon",
  },
  {
    product_name: "x",
    price: null,
    link: null,
  },
];

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaConversationalTone.js",
  "lib/miaToneComplianceGuard.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("adapter contract is valid", () => {
  const validation = validateProductSourceAdapter(googleShoppingAdapter);
  assert(validation.ok, validation.errors.join(","));
  assert(googleShoppingAdapter.enabled === true, "google shopping must be enabled");
  assert(googleShoppingAdapter.id === PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING, "adapter id");
});

test("registry registers google shopping adapter", () => {
  clearProductSourceRegistry();
  const registered = bootstrapDefaultProductSourceRegistry();
  const gs = getProductSourceAdapter(PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING);
  assert(gs, "google_shopping missing from registry");
  assert(
    getEnabledProductSourceAdapters().some((a) => a.id === PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING),
    "enabled adapter missing"
  );
  assert(registered.some((a) => a.id === PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING), "bootstrap list");
});

test("adapter normalizes serp payload to NormalizedProduct", async () => {
  const result = await fetchGoogleShoppingAdapterResult({
    query: "notebook gamer",
    limit: 5,
    fetcher: async () => MOCK_SERP,
  });
  assert(result.ok, "adapter fetch failed");
  assert(result.provider === GOOGLE_SHOPPING_LEGACY_PROVIDER, "legacy provider id preserved");
  assert(result.products.length === 2, "invalid item should be filtered");
  for (const product of result.products) {
    assert(isNormalizedProductShape(product), "invalid normalized shape");
    assert(isNormalizedProductUsable(product), "unusable normalized product");
    assert(product.provider === PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING, "normalized provider");
    assert(product.rawSource === GOOGLE_SHOPPING_LEGACY_PROVIDER, "rawSource");
  }
});

test("legacy mapping preserves production shape", async () => {
  const legacy = await fetchGoogleShoppingLegacyResult("notebook gamer", 5, {
    fetcher: async () => MOCK_SERP,
  });
  assert(legacy.provider === "serpapi", "legacy provider must stay serpapi");
  assert(legacy.ok, "legacy result not ok");
  assert(Array.isArray(legacy.products) && legacy.products.length === 2, "legacy count");
  const first = legacy.products[0];
  assert(first.product_name, "product_name");
  assert(first.normalizedName, "normalizedName");
  assert(first.familyKey, "familyKey");
  assert(first.provider === "serpapi", "product.provider");
  assert(first.link.startsWith("http"), "link");
  assert(first.price, "price");
  assert(Object.prototype.hasOwnProperty.call(first, "trustedSpecs"), "trustedSpecs");
  assert(Object.prototype.hasOwnProperty.call(first, "scoreEngine"), "scoreEngine");
});

test("legacy usability filter matches production rules", () => {
  const normalized = mapNormalizedProductsToLegacy(
    [
      {
        product_name: "Mouse sem link",
        normalizedName: "mouse sem link",
        familyKey: "mouse sem link",
        price: "R$ 10,00",
        numericPrice: 10,
        link: null,
        thumbnail: null,
        source: "Loja",
        provider: PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING,
        category: "",
        currency: "BRL",
        externalId: null,
        adapterVersion: "1.0.0",
        rawSource: "serpapi",
      },
    ],
    "serpapi"
  );
  assert(normalized.length === 0, "item without http link must be rejected");
});

test("dedupe keeps richest google shopping product", () => {
  const legacyProducts = mapNormalizedProductsToLegacy(
    [
      {
        product_name: "Samsung Galaxy A55",
        normalizedName: "samsung galaxy a55",
        familyKey: "samsung galaxy a55",
        price: "R$ 1.799,00",
        numericPrice: 1799,
        link: "https://loja.example/a55",
        thumbnail: null,
        source: "Loja A",
        provider: PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING,
        category: "",
        currency: "BRL",
        externalId: null,
        adapterVersion: "1.0.0",
        rawSource: "serpapi",
      },
      {
        product_name: "Samsung Galaxy A55",
        normalizedName: "samsung galaxy a55",
        familyKey: "samsung galaxy a55",
        price: "R$ 1.799,00",
        numericPrice: 1799,
        link: "https://loja.example/a55",
        thumbnail: "https://img.example/a55.jpg",
        source: "Loja B",
        provider: PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING,
        category: "",
        currency: "BRL",
        externalId: null,
        adapterVersion: "1.0.0",
        rawSource: "serpapi",
      },
    ],
    "serpapi"
  );
  const deduped = dedupeProducts(legacyProducts, { limit: 5 });
  assert(deduped.length === 1, "dedupe failed");
  assert(deduped[0].thumbnail, "richest duplicate should win");
});

test("chat-gpt4o provider delegates to adapter legacy wrapper", () => {
  const source = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  assert(
    source.includes("fetchGoogleShoppingLegacyResult"),
    "chat-gpt4o must delegate serp provider to adapter wrapper"
  );
  assert(
    /async function fetchFromSerpApiProvider[\s\S]*return fetchGoogleShoppingLegacyResult\(query, limit\);/.test(
      source
    ),
    "fetchFromSerpApiProvider must remain thin wrapper"
  );
  assert(source.includes('name: "serpapi"'), "commercial provider name preserved");
});

test("cognitive files untouched in this patch scope", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("googleShoppingAdapter"), `${relativePath} should not import adapter`);
  }
});

console.log("PATCH Comercial 1.1 — Google Shopping Adapter Alignment Audit\n");

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    const maybePromise = spec.fn();
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
    pass += 1;
    console.log(`✓ ${spec.name}`);
  } catch (err) {
    fail += 1;
    console.log(`✗ ${spec.name} → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${((pass / total) * 100).toFixed(1)}%)`);
const verdict =
  fail === 0
    ? "A) GOOGLE SHOPPING ADAPTER ALIGNMENT ROBUST"
    : "B) GOOGLE SHOPPING ADAPTER ALIGNMENT GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
