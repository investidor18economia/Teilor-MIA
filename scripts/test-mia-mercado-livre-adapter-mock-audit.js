/**
 * PATCH Comercial 2A — Mercado Livre Adapter Mock Audit
 *
 * Usage: node scripts/test-mia-mercado-livre-adapter-mock-audit.js
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
  MERCADO_LIVRE_PROVIDER,
  dedupeMercadoLivreProducts,
  fetchMercadoLivreAdapterResult,
  fetchMercadoLivreMockSearch,
  mercadoLivreAdapter,
  normalizeMercadoLivreItem,
} from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const MOCK_ML_ITEM = {
  id: "MLB5555",
  title: "Fone Bluetooth JBL Tune 520 Preto",
  price: 249.9,
  currency_id: "BRL",
  permalink: "https://produto.mercadolivre.com.br/MLB5555-jbl-tune-520",
  thumbnail: "https://http2.mlstatic.com/jbl-tune-520.jpg",
  condition: "new",
  available_quantity: 40,
  seller: { id: 12345, nickname: "AUDIO_STORE" },
  shipping: { free_shipping: true, mode: "me2" },
  attributes: [
    { id: "BRAND", name: "Marca", value_name: "JBL" },
    { id: "COLOR", name: "Cor", value_name: "Preto" },
  ],
  category_id: "MLB1000",
};

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaConversationalTone.js",
  "lib/miaToneComplianceGuard.js",
  "pages/api/chat-gpt4o.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("adapter respects ProductSourceAdapter contract", () => {
  const validation = validateProductSourceAdapter(mercadoLivreAdapter);
  assert(validation.ok, validation.errors.join(","));
  assert(mercadoLivreAdapter.id === PRODUCT_SOURCE_IDS.MERCADO_LIVRE, "registry id");
  assert(mercadoLivreAdapter.displayName === "Mercado Livre", "displayName");
  assert(mercadoLivreAdapter.version, "version");
  assert(typeof mercadoLivreAdapter.fetchProducts === "function", "fetchProducts");
  assert(typeof mercadoLivreAdapter.normalizeItem === "function", "normalizeItem");
});

test("adapter is registered and disabled by default", () => {
  clearProductSourceRegistry();
  bootstrapDefaultProductSourceRegistry();
  const registered = getProductSourceAdapter(PRODUCT_SOURCE_IDS.MERCADO_LIVRE);
  assert(registered, "mercado_livre missing from registry");
  assert(registered === mercadoLivreAdapter, "registry must use mercadoLivreAdapter");
  assert(registered.enabled === false, "adapter must stay disabled");
  assert(
    !getEnabledProductSourceAdapters().some((a) => a.id === PRODUCT_SOURCE_IDS.MERCADO_LIVRE),
    "must not be enabled in production bootstrap"
  );
});

test("normalizeItem maps Mercado Livre shape to NormalizedProduct", () => {
  const item = normalizeMercadoLivreItem(MOCK_ML_ITEM, { categoryHint: "fone" });
  assert(item, "normalized item missing");
  assert(isNormalizedProductShape(item), "invalid normalized shape");
  assert(isNormalizedProductUsable(item), "unusable normalized product");
  assert(item.product_name.includes("JBL"), "product_name");
  assert(item.normalizedName, "normalizedName");
  assert(item.familyKey, "familyKey");
  assert(item.price?.startsWith("R$"), "price");
  assert(item.numericPrice === 249.9, "numericPrice");
  assert(item.currency === "BRL", "currency");
  assert(item.link?.startsWith("http"), "link");
  assert(item.thumbnail?.startsWith("http"), "thumbnail");
  assert(item.source === MERCADO_LIVRE_PROVIDER, "source");
  assert(item.provider === MERCADO_LIVRE_PROVIDER, "provider");
  assert(item.externalId === "MLB5555", "externalId");
  assert(item.category === "MLB1000", "category");
  assert(item.adapterVersion, "adapterVersion");
  assert(item.rawSource === MERCADO_LIVRE_PROVIDER, "rawSource");
});

test("mock fetchProducts returns normalized products", async () => {
  const result = await fetchMercadoLivreAdapterResult({
    query: "samsung",
    limit: 5,
    fetcher: fetchMercadoLivreMockSearch,
  });
  assert(result.ok, "mock fetch failed");
  assert(result.provider === MERCADO_LIVRE_PROVIDER, "provider");
  assert(result.products.length >= 1, "expected products");
  for (const product of result.products) {
    assert(isNormalizedProductShape(product), "shape");
    assert(isNormalizedProductUsable(product), "usable");
    assert(product.provider === MERCADO_LIVRE_PROVIDER, "normalized provider");
  }
});

test("adapter fetchProducts uses mock without external API", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalled = true;
    return originalFetch(...args);
  };

  try {
    const result = await mercadoLivreAdapter.fetchProducts({ query: "notebook", limit: 3 });
    assert(result.ok, "adapter fetchProducts failed");
    assert(result.products.length >= 1, "expected mock products");
    assert(fetchCalled === false, "external fetch must not be called");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dedupeProducts collapses Mercado Livre duplicates", () => {
  const duplicatePair = [
    normalizeMercadoLivreItem({
      id: "MLB2001",
      title: "Mouse Logitech M185 Sem Fio Preto",
      price: 79.9,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB2001",
      thumbnail: null,
    }),
    normalizeMercadoLivreItem({
      id: "MLB2001B",
      title: "Mouse Logitech M185 Sem Fio Preto",
      price: 79.9,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB2001",
      thumbnail: "https://http2.mlstatic.com/m185.jpg",
      attributes: [{ id: "BRAND", name: "Marca", value_name: "Logitech" }],
    }),
  ];
  assert(duplicatePair.length === 2, "fixture setup");
  const deduped = dedupeMercadoLivreProducts(duplicatePair, 5);
  assert(deduped.length === 1, "dedupe failed");
  assert(deduped[0].thumbnail, "richest duplicate should win");
});

test("mock catalog dedupe keeps richest Mercado Livre product", async () => {
  const result = await fetchMercadoLivreAdapterResult({
    query: "samsung",
    limit: 10,
    fetcher: fetchMercadoLivreMockSearch,
  });
  const deduped = dedupeProducts(result.products, { limit: 10 });
  const galaxyItems = deduped.filter((p) => /galaxy a55/i.test(p.product_name || ""));
  assert(galaxyItems.length === 1, "galaxy duplicates should collapse");
  assert(galaxyItems[0].thumbnail, "richest galaxy item should win");
});

test("cognitive and production commercial flow untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("mercadoLivreAdapter"), `${relativePath} must not import ML adapter`);
    assert(!content.includes("fetchMercadoLivreAdapterResult"), `${relativePath} must not call ML adapter`);
  }
});

console.log("PATCH Comercial 2A — Mercado Livre Adapter Mock Audit\n");

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
    ? "A) MERCADO LIVRE ADAPTER MOCK ROBUST"
    : "B) MERCADO LIVRE ADAPTER MOCK GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
