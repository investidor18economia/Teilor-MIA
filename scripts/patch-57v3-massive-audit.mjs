#!/usr/bin/env node
/**
 * PATCH 5.7V.3 — Re-validation harness (wraps 5.7V.2 audit with new evidence dir)
 * Usage: node scripts/patch-57v3-massive-audit.mjs [--resume] [--phase=...]
 */
process.env.MIA_AUDIT_OUT = "docs/conversational/audits/phase-5/evidence/patch-57v3";
await import("./patch-57v2-massive-audit.mjs");
