/**
 * Stub Mercado Livre — foundation only, sem integração/API.
 */

import {
  ADAPTER_CONTRACT_VERSION,
  createNotIntegratedFetchResult,
} from "../adapterContract.js";
import { normalizeRawProductBase } from "../normalizeProduct.js";
import { PRODUCT_SOURCE_IDS } from "../normalizedProduct.js";

export const mercadoLivreAdapterStub = Object.freeze({
  id: PRODUCT_SOURCE_IDS.MERCADO_LIVRE,
  displayName: "Mercado Livre",
  version: ADAPTER_CONTRACT_VERSION,
  enabled: false,
  async fetchProducts() {
    return createNotIntegratedFetchResult(PRODUCT_SOURCE_IDS.MERCADO_LIVRE);
  },
  normalizeItem(raw = {}, context = {}) {
    return normalizeRawProductBase(raw, {
      ...context,
      provider: PRODUCT_SOURCE_IDS.MERCADO_LIVRE,
      rawSource: PRODUCT_SOURCE_IDS.MERCADO_LIVRE,
    });
  },
});
