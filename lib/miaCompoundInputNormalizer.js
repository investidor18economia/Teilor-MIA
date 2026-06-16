/**
 * PATCH 8.0E — Compound Input Normalization
 *
 * Orquestra typo → abbreviation → informal com guards para entradas compostas
 * (gíria + abrev + typo + risada + palavrão). Não decide intenção — só expõe
 * normalizedMessage estável ao Router.
 */

import { applyTypoNormalization } from "./miaTypoNormalizer.js";
import { applyAbbreviationNormalization } from "./miaAbbreviationNormalizer.js";
import { applyInformalLanguageNormalization } from "./miaInformalLanguageNormalization.js";

function baseNormalize(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Risada — strip antes do typo (evita collapseRepeatedLetters em kkkk). */
const LAUGHTER_PREFIX = /^(?:(?:k{2,})|(?:(?:rs)+)|(?:(?:ha)+)|(?:(?:he)+)|(?:(?:hue)+))(?:\s+|$)/i;
const LAUGHTER_SUFFIX = /(?:\s+)(?:(?:k{2,})|(?:(?:rs)+)|(?:(?:ha)+)|(?:(?:he)+))$/i;

/** Palavrão inicial — remove ruído, preserva intenção. */
const PROFANITY_PREFIX = /^(?:crl|krl|krll|pqp|carai|caralho|cacete|porra|fdp|bct|pnc)(?:\s+|$)/i;

/** Frases pós-camadas — conectores que as camadas isoladas não cobrem bem. */
const COMPOUND_PHRASE_FIXES = [
  [/(\b|^)mas e bateria(\b|$)/g, "mas e de bateria", "compound:mas_e_bateria"],
  [/(\b|^)mas e camera(\b|$)/g, "mas e de camera", "compound:mas_e_camera"],
  [/(\b|^)mas e preco(\b|$)/g, "mas e de preco", "compound:mas_e_preco"],
  [/(\b|^)mas e valor(\b|$)/g, "mas e de valor", "compound:mas_e_valor"],
  [/(\b|^)mas e desempenho(\b|$)/g, "mas e de desempenho", "compound:mas_e_desempenho"],
];

function stripPatternLoop(text, pattern, tag, applied) {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    const next = out.replace(pattern, "").replace(/\s+/g, " ").trim();
    if (next !== out) {
      out = next;
      applied.push(tag);
      changed = true;
    }
  }
  return out;
}

function stripPreTypoNoise(text, applied) {
  let out = text;
  out = stripPatternLoop(out, LAUGHTER_PREFIX, "compound:laughter_pre", applied);
  out = stripPatternLoop(out, PROFANITY_PREFIX, "compound:profanity_pre", applied);
  return out;
}

function stripPostNoise(text, applied) {
  let out = text;
  out = stripPatternLoop(out, LAUGHTER_PREFIX, "compound:laughter_post", applied);
  out = stripPatternLoop(out, LAUGHTER_SUFFIX, "compound:laughter_suffix", applied);
  out = stripPatternLoop(out, PROFANITY_PREFIX, "compound:profanity_post", applied);
  return out;
}

function applyCompoundPhraseFixes(text, applied) {
  let out = text;
  for (const [pattern, replacement, tag] of COMPOUND_PHRASE_FIXES) {
    if (pattern.test(out)) {
      out = out.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      applied.push(tag);
      pattern.lastIndex = 0;
    }
  }
  return out;
}

function fixDoubleReplace(text, warnings) {
  let out = text;
  const before = out;
  out = out.replace(/\bvoce voce\b/g, "voce");
  out = out.replace(/\bvoces voces\b/g, "voces");
  out = out.replace(/\bnao nao\b/g, "nao");
  if (out !== before) warnings.push("double_replace");
  return out;
}

/**
 * @param {{ originalMessage?: string }} input
 * @returns {{
 *   originalMessage: string,
 *   normalizedMessage: string,
 *   stages: {
 *     preTypo: { text: string, applied: string[] },
 *     typo: ReturnType<typeof applyTypoNormalization>,
 *     abbreviation: ReturnType<typeof applyAbbreviationNormalization>,
 *     informal: ReturnType<typeof applyInformalLanguageNormalization>
 *   },
 *   appliedNormalizations: string[],
 *   hasCompoundNormalization: boolean,
 *   warnings: string[]
 * }}
 */
export function normalizeCompoundInput({ originalMessage = "" } = {}) {
  const original = String(originalMessage || "");
  const appliedNormalizations = [];
  const warnings = [];

  if (!original.trim()) {
    return {
      originalMessage: original,
      normalizedMessage: "",
      stages: {
        preTypo: { text: "", applied: [] },
        typo: applyTypoNormalization(""),
        abbreviation: applyAbbreviationNormalization(""),
        informal: applyInformalLanguageNormalization(""),
      },
      appliedNormalizations,
      hasCompoundNormalization: false,
      warnings,
    };
  }

  if (/https?:\/\//i.test(original)) {
    return {
      originalMessage: original,
      normalizedMessage: original.trim(),
      stages: {
        preTypo: { text: original.trim(), applied: [] },
        typo: applyTypoNormalization(original),
        abbreviation: applyAbbreviationNormalization(original),
        informal: applyInformalLanguageNormalization(original),
      },
      appliedNormalizations,
      hasCompoundNormalization: false,
      warnings,
    };
  }

  const baseline = baseNormalize(original);
  const preApplied = [];
  let preTypoText = stripPreTypoNoise(baseline, preApplied);

  const typo = applyTypoNormalization(preTypoText);
  const abbreviation = applyAbbreviationNormalization(typo.typoNormalizedMessage);
  const informal = applyInformalLanguageNormalization(abbreviation.normalizedMessage);

  let text = informal.text;
  text = applyCompoundPhraseFixes(text, appliedNormalizations);
  text = fixDoubleReplace(text, warnings);
  text = stripPostNoise(text, appliedNormalizations);
  text = text.replace(/\s+/g, " ").trim();

  const allApplied = [
    ...preApplied,
    ...typo.appliedTypoCorrections.map((c) => `typo:${c}`),
    ...abbreviation.appliedNormalizations.map((c) => `abbrev:${c}`),
    ...informal.hints.map((h) => `informal:${h}`),
    ...appliedNormalizations,
  ];

  return {
    originalMessage: original,
    normalizedMessage: text,
    stages: {
      preTypo: { text: preTypoText, applied: preApplied },
      typo,
      abbreviation,
      informal,
    },
    appliedNormalizations: [...new Set(allApplied)],
    hasCompoundNormalization: text !== baseline,
    warnings: [...new Set(warnings)],
  };
}

export function normalizeWithCompoundLayer(message = "") {
  return normalizeCompoundInput({ originalMessage: message }).normalizedMessage;
}
