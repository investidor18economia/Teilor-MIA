/**
 * PATCH ProductSourceAdapter V1 — source registry
 */

import { validateProductSourceAdapter } from "./adapterContract.js";

const registry = new Map();

export function registerProductSourceAdapter(adapter) {
  const validation = validateProductSourceAdapter(adapter);
  if (!validation.ok) {
    throw new Error(
      `Invalid ProductSourceAdapter (${adapter?.id || "unknown"}): ${validation.errors.join(", ")}`
    );
  }
  registry.set(adapter.id, adapter);
  return adapter;
}

export function unregisterProductSourceAdapter(id = "") {
  registry.delete(String(id || "").trim());
}

export function getProductSourceAdapter(id = "") {
  return registry.get(String(id || "").trim()) || null;
}

export function hasProductSourceAdapter(id = "") {
  return registry.has(String(id || "").trim());
}

export function listProductSourceAdapters() {
  return Array.from(registry.values()).map((adapter) => ({
    id: adapter.id,
    displayName: adapter.displayName,
    version: adapter.version,
    enabled: !!adapter.enabled,
  }));
}

export function getEnabledProductSourceAdapters() {
  return Array.from(registry.values()).filter((adapter) => adapter.enabled === true);
}

export function clearProductSourceRegistry() {
  registry.clear();
}

export function getProductSourceRegistrySize() {
  return registry.size;
}
