/**
 * Stub Amazon — foundation only, sem integração/API.
 */

import {
  ADAPTER_CONTRACT_VERSION,
  createNotIntegratedFetchResult,
} from "../adapterContract.js";
import { normalizeRawProductBase } from "../normalizeProduct.js";
import { PRODUCT_SOURCE_IDS } from "../normalizedProduct.js";

export const amazonAdapterStub = Object.freeze({
  id: PRODUCT_SOURCE_IDS.AMAZON,
  displayName: "Amazon",
  version: ADAPTER_CONTRACT_VERSION,
  enabled: false,
  async fetchProducts() {
    return createNotIntegratedFetchResult(PRODUCT_SOURCE_IDS.AMAZON);
  },
  normalizeItem(raw = {}, context = {}) {
    return normalizeRawProductBase(raw, {
      ...context,
      provider: PRODUCT_SOURCE_IDS.AMAZON,
      rawSource: PRODUCT_SOURCE_IDS.AMAZON,
    });
  },
});
