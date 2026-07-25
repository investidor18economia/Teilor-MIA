#!/usr/bin/env node
/**
 * PATCH 3.3 — Product Resolution Audit
 *
 * Validates:
 * - Product Identity Resolution (aliases, abbreviations, typos-friendly keys)
 * - Specific Product Lock
 * - Query mention extraction (product vs constraint)
 * - Comparison parser isolation
 *
 * Usage: node scripts/test-mia-patch-33-product-resolution-audit.js
 */

import {
  PRODUCT_IDENTITY_RESOLUTION_VERSION,
  resolveProductIdentityFromQuery,
  extractProductMentionFromQuery,
  buildProductResolutionKeys,
} from "../lib/miaProductIdentityResolution.js";
import {
  SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
  resolveSpecificProductLock,
  bootstrapSpecificProductLock,
  validateSpecificProductLockCandidate,
  enforceSpecificProductLockWinner,
  isGenericProductSearchQuery,
  scoreStrongSpecificProductMatch,
} from "../lib/miaSpecificProductResolutionLock.js";
import {
  extractComparisonTermsFromQuery,
  isDirectComparisonQuery,
} from "../lib/miaComparisonFlowCrashGuard.js";

let total = 0;
let passed = 0;
const failures = [];

function test(label, fn) {
  total++;
  try {
    const ok = fn();
    if (ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failures.push(label);
      console.log(`  ✗ ${label}`);
    }
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
    console.log(`  ✗ ${label} — ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

function product(name, extra = {}) {
  return {
    product_name: name,
    familyKey: extra.familyKey || name.toLowerCase(),
    trustedSpecs: {
      official_name: name,
      aliases: extra.aliases || [],
      category: extra.category || "celular",
    },
  };
}

console.log(`\nPATCH 3.3 — Product Resolution Audit`);
console.log(`  Identity: ${PRODUCT_IDENTITY_RESOLUTION_VERSION}`);
console.log(`  Lock: ${SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION}`);

section("3.3a — Alias & abbreviation resolution");
const aliasCases = [
  ["S24", "Galaxy S24"],
  ["Galaxy S24", "Galaxy S24"],
  ["Samsung S24", "Galaxy S24"],
  ["iPhone 13", "iPhone 13"],
  ["13 da Apple", "iPhone 13"],
  ["Moto G84", "Moto G84"],
  ["G84", "Moto G84"],
  ["Redmi Note 13", "Redmi Note 13"],
  ["Note 13", "Redmi Note 13"],
  ["ROG 8", "ROG Phone 8"],
  ["Zenfone", "Zenfone"],
];

for (const [input, expected] of aliasCases) {
  test(`${input} → ${expected}`, () => {
    const id = resolveProductIdentityFromQuery(input);
    return id.officialName === expected || id.displayName === expected;
  });
}

section("3.3b — Product mention extraction (CONV-P-C02)");
test("S24 com boa bateria isolates S24", () => {
  return extractProductMentionFromQuery("S24 com boa bateria") === "S24";
});
test("Galaxy S24 Ultra com camera boa isolates product", () => {
  const mention = extractProductMentionFromQuery("Galaxy S24 Ultra com camera boa");
  return /galaxy s24 ultra/i.test(mention);
});
test("constraint tail stripped from lock query", () => {
  const lock = resolveSpecificProductLock({
    query: "S24 com boa bateria",
    products: [product("Samsung Galaxy S24", { familyKey: "samsung galaxy s24" })],
  });
  return lock.active && /galaxy s24/i.test(lock.lockedProduct?.product_name || "");
});

section("3.3c — Specific Product Lock (CONV-P-C04)");
const iphone15 = product("iPhone 15", { familyKey: "iphone 15" });
const galaxyM35 = product("Samsung Galaxy M35", { familyKey: "galaxy m35" });
const galaxyS24Fe = product("Samsung Galaxy S24 FE", { familyKey: "samsung galaxy s24 fe" });

test("iPhone 15 exact lock active", () => {
  const lock = resolveSpecificProductLock({
    query: "iPhone 15",
    products: [iphone15, galaxyM35],
  });
  return lock.active && lock.lockedProduct?.product_name === "iPhone 15";
});
test("validateSpecificProductLockCandidate accepts catalog exact match", () => {
  const lock = resolveSpecificProductLock({ query: "iPhone 15", products: [iphone15] });
  const v = validateSpecificProductLockCandidate({ query: "iPhone 15", lock });
  return v.eligible && v.reasonCodes.includes("lock_candidate_valid");
});
test("generic query does not lock", () => {
  return !resolveSpecificProductLock({ query: "celular até 2000", products: [iphone15] }).active;
});
test("bootstrap anchors resolved identity without catalog", () => {
  const lock = bootstrapSpecificProductLock({
    query: "S24",
    products: [galaxyM35],
    resolveIdentity: () => ({ officialName: "Galaxy S24" }),
  });
  return lock.active && /galaxy s24/i.test(lock.lockedProduct?.product_name || "");
});
test("winner enforcement keeps locked product", () => {
  const lock = resolveSpecificProductLock({ query: "iPhone 15", products: [iphone15, galaxyM35] });
  const enforced = enforceSpecificProductLockWinner({
    lock,
    selectedBestProduct: galaxyM35,
    products: [iphone15, galaxyM35],
  });
  return enforced.preventedReplacement && enforced.selectedBestProduct?.product_name === "iPhone 15";
});

section("3.3d — Alias scoring from trustedSpecs");
test("alias exact match locks product", () => {
  const p = product("Samsung Galaxy S24", {
    familyKey: "samsung galaxy s24",
    aliases: ["S24", "Galaxy S24"],
  });
  const lock = resolveSpecificProductLock({ query: "S24", products: [p, galaxyM35] });
  return lock.active && lock.matchSource === "alias_exact";
});

section("3.3e — Comparison parser");
test("iPhone 15 vs Galaxy S24 extracts two terms", () => {
  const terms = extractComparisonTermsFromQuery("iPhone 15 vs Galaxy S24");
  return terms.length >= 2 && /iphone 15/i.test(terms[0]) && /galaxy s24/i.test(terms[1]);
});
test("qual é melhor, iPhone 13 ou Galaxy A54? cleans terms", () => {
  const terms = extractComparisonTermsFromQuery("qual é melhor, iPhone 13 ou Galaxy A54?");
  return terms.every((t) => !/^é\b/i.test(t)) && terms.length >= 2;
});
test("direct comparison detected", () => isDirectComparisonQuery("iPhone 15 vs Galaxy S24"));
test("S24 FE ou M35 comparison", () => {
  return extractComparisonTermsFromQuery("Galaxy S24 FE ou Galaxy M35?").length >= 2;
});

section("3.3f — Resolution keys");
test("buildProductResolutionKeys includes canonical forms", () => {
  const keys = buildProductResolutionKeys("G84");
  return keys.keys.some((k) => k.includes("moto g84") || k.includes("g84"));
});

section("3.3g — Regression guards");
test("isGenericProductSearchQuery still blocks generic", () =>
  isGenericProductSearchQuery("melhor celular custo benefício"));
test("scoreStrongSpecificProductMatch rejects cross-family", () =>
  scoreStrongSpecificProductMatch(galaxyM35, "iPhone 15").score < 700);

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.3 AUDIT: ${passed}/${total} passed`);
if (failures.length) {
  console.log("Failures:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log(failures.length === 0 ? "\nVeredito: APROVADO\n" : "\nVeredito: REPROVADO\n");
process.exit(failures.length > 0 ? 1 : 0);
