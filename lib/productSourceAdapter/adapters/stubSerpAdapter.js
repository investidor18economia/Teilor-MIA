/**
 * Stub Serp / Google Shopping — foundation only, sem integração/API.
 */

import {
  ADAPTER_CONTRACT_VERSION,
  createNotIntegratedFetchResult,
} from "../adapterContract.js";
import { normalizeRawProductBase } from "../normalizeProduct.js";
import { PRODUCT_SOURCE_IDS } from "../normalizedProduct.js";

export const serpAdapterStub = Object.freeze({
  id: PRODUCT_SOURCE_IDS.SERP,
  displayName: "Serp / Google Shopping",
  version: ADAPTER_CONTRACT_VERSION,
  enabled: false,
  async fetchProducts() {
    return createNotIntegratedFetchResult(PRODUCT_SOURCE_IDS.SERP);
  },
  normalizeItem(raw = {}, context = {}) {
    return normalizeRawProductBase(raw, {
      ...context,
      provider: PRODUCT_SOURCE_IDS.SERP,
      rawSource: PRODUCT_SOURCE_IDS.SERP,
    });
  },
});
