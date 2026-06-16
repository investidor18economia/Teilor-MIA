/**
 * PATCH ProductSourceAdapter V1 — Foundation Audit
 *
 * Usage: node scripts/test-mia-product-source-adapter-foundation-audit.js
 */

import {
  ADAPTER_REQUIRED_FIELDS,
  PRODUCT_SOURCE_IDS,
  amazonAdapterStub,
  bootstrapDefaultProductSourceRegistry,
  clearProductSourceRegistry,
  dedupeProducts,
  getEnabledProductSourceAdapters,
  getProductSourceAdapter,
  googleShoppingAdapter,
  isNormalizedProductShape,
  isNormalizedProductUsable,
  mercadoLivreAdapterStub,
  normalizeRawProductBase,
  normalizeRawProductsBase,
  registerProductSourceAdapter,
  serpAdapterStub,
  validateProductSourceAdapter,
} from "../lib/productSourceAdapter/index.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("contract: required fields documented", () => {
  assert(ADAPTER_REQUIRED_FIELDS.includes("fetchProducts"), "fetchProducts required");
  assert(ADAPTER_REQUIRED_FIELDS.length >= 5, "contract fields");
});

test("contract: stub adapters valid", () => {
  for (const adapter of [googleShoppingAdapter, mercadoLivreAdapterStub, amazonAdapterStub, serpAdapterStub]) {
    const result = validateProductSourceAdapter(adapter);
    assert(result.ok, `${adapter.id} invalid: ${result.errors.join(",")}`);
  }
  assert(googleShoppingAdapter.enabled === true, "google shopping enabled");
  assert(mercadoLivreAdapterStub.enabled === false, "mercado livre stub disabled");
});

test("registry: bootstrap registers future sources", () => {
  clearProductSourceRegistry();
  const registered = bootstrapDefaultProductSourceRegistry();
  assert(registered.length === 3, "expected 3 default adapters");
  assert(getProductSourceAdapter(PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING), "google_shopping missing");
  assert(getProductSourceAdapter(PRODUCT_SOURCE_IDS.MERCADO_LIVRE), "mercado_livre missing");
  assert(getProductSourceAdapter(PRODUCT_SOURCE_IDS.AMAZON), "amazon missing");
  assert(getEnabledProductSourceAdapters().length === 1, "only google shopping enabled in V1");
});

test("registry: duplicate register rejected when invalid", () => {
  clearProductSourceRegistry();
  let failed = false;
  try {
    registerProductSourceAdapter({ id: "x" });
  } catch {
    failed = true;
  }
  assert(failed, "invalid adapter should throw");
});

test("normalize: mercado livre-like payload", () => {
  const item = normalizeRawProductBase(
    {
      id: "MLB123",
      title: "Notebook Gamer Acer Nitro 5",
      permalink: "https://produto.mercadolivre.com.br/MLB123",
      thumbnail: "https://img.example/mlb.jpg",
      price: 4999.9,
    },
    { provider: PRODUCT_SOURCE_IDS.MERCADO_LIVRE, categoryHint: "notebook" }
  );
  assert(item, "normalized item missing");
  assert(isNormalizedProductShape(item), "shape invalid");
  assert(item.provider === PRODUCT_SOURCE_IDS.MERCADO_LIVRE, "provider mismatch");
  assert(item.externalId === "MLB123", "externalId missing");
  assert(item.numericPrice === 4999.9, "numericPrice mismatch");
});

test("normalize: amazon-like payload", () => {
  const item = normalizeRawProductBase(
    {
      ASIN: "B0TEST123",
      title: "Monitor LG UltraGear 27 IPS",
      detail_page_url: "https://www.amazon.com.br/dp/B0TEST123",
      image: "https://img.example/amz.jpg",
      price_amount: 1899,
      currency: "BRL",
    },
    { provider: PRODUCT_SOURCE_IDS.AMAZON, externalId: "B0TEST123" }
  );
  assert(item?.provider === PRODUCT_SOURCE_IDS.AMAZON, "amazon provider");
  assert(item?.price?.startsWith("R$"), "price formatting");
});

test("normalize: serp-like payload", () => {
  const items = normalizeRawProductsBase(
    [
      {
        title: "Fone Bluetooth JBL Tune 520",
        extracted_price: 249.9,
        link: "https://loja.example/fone",
        thumbnail: "https://img.example/fone.jpg",
        source: "Magalu",
      },
      { title: "x", price: null },
    ],
    { provider: PRODUCT_SOURCE_IDS.SERP, query: "fone bluetooth" },
    { limit: 5 }
  );
  assert(items.length === 1, "should filter unusable item");
  assert(items[0].source === "Magalu", "source preserved");
});

test("normalize: brazilian price string", () => {
  const item = normalizeRawProductBase({
    product_name: "Mouse Logitech M185",
    price: "R$ 79,90",
    link: "https://loja.example/mouse",
  });
  assert(item?.numericPrice === 79.9, "parsed BRL price");
});

test("dedupe: keeps richest duplicate", () => {
  const deduped = dedupeProducts(
    [
      {
        product_name: "Samsung Galaxy A55 128GB",
        familyKey: "samsung galaxy a55 128gb",
        price: "R$ 1.799,00",
        link: "https://loja.example/a",
      },
      {
        product_name: "Samsung Galaxy A55 128GB",
        familyKey: "samsung galaxy a55 128gb",
        price: "R$ 1.799,00",
        link: "https://loja.example/a",
        thumbnail: "https://img.example/a.jpg",
        numericPrice: 1799,
      },
    ],
    { limit: 5 }
  );
  assert(deduped.length === 1, "expected single deduped item");
  assert(deduped[0].thumbnail, "richest item should win");
});

test("adapter stub: fetch not integrated", async () => {
  const result = await mercadoLivreAdapterStub.fetchProducts({ query: "iphone", limit: 3 });
  assert(result.ok === false, "stub fetch must not succeed in V1");
  assert(result.error === "not_integrated", "expected not_integrated");
  assert(Array.isArray(result.products) && result.products.length === 0, "no products");
});

test("adapter stub: normalizeItem works", () => {
  const item = mercadoLivreAdapterStub.normalizeItem(
    { title: "iPhone 15 128GB", price: 4999, permalink: "https://ml.example/item" },
    { categoryHint: "celular" }
  );
  assert(isNormalizedProductUsable(item), "stub normalizeItem usable");
});

console.log("PATCH ProductSourceAdapter V1 — Foundation Audit\n");

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
const rate = ((pass / total) * 100).toFixed(1);
console.log(`\nResultado: ${pass}/${total} (${rate}%)`);
console.log(
  `\nRegistry preview: ${bootstrapDefaultProductSourceRegistry()
    .map((a) => `${a.id}:${a.enabled ? "on" : "off"}`)
    .join(", ")}`
);

const verdict =
  fail === 0 ? "A) PRODUCT SOURCE ADAPTER FOUNDATION ROBUST" : "B) PRODUCT SOURCE ADAPTER FOUNDATION GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
