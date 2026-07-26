/**
 * PATCH 4A.1 — Semantic Decision Legacy Adapter (TEMPORARY)
 *
 * Explicit bridge from structured SemanticDecisionUnits to legacy string consumers.
 * REMOVAL TARGET: PATCH 4A.6 — do not treat this as canonical architecture.
 */

import { createSemanticLegacySurface } from "./miaSemanticDecisionContract.js";

export const LEGACY_ADAPTER_VERSION = "4A.1.0-legacy";

/**
 * Returns legacy gain string for downstream consumers that still expect plain text.
 * Structured units remain the source of truth; compacted text is explicitly marked legacy.
 *
 * @param {import("./miaSemanticDecisionContract.js").SemanticDecisionUnit} unit
 * @param {(text: string, family: string) => string} compactFn
 */
export function toLegacyGainString(unit, compactFn) {
  if (!unit?.evidence) return "";

  const interpretedText = unit.evidence.interpretedText || "";
  const family = unit.evidence.dimension || "generic_fit";
  const compactedText =
    typeof compactFn === "function"
      ? compactFn(interpretedText, family) || interpretedText
      : interpretedText;

  unit.legacy = createSemanticLegacySurface({
    compactedText,
    isPrimaryTruth: false,
    adapterVersion: LEGACY_ADAPTER_VERSION,
  });

  return compactedText;
}

/**
 * @param {import("./miaSemanticDecisionContract.js").SemanticDecisionUnit[]} units
 * @param {(text: string, family: string) => string} compactFn
 */
export function toLegacyGainStrings(units = [], compactFn) {
  return units.map((unit) => toLegacyGainString(unit, compactFn)).filter(Boolean);
}

export function isLegacyAdapterSurface(unit) {
  return (
    unit?.legacy?.adapterVersion === LEGACY_ADAPTER_VERSION &&
    unit.legacy.isPrimaryTruth === false
  );
}
