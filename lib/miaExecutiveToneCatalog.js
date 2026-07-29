/**
 * PATCH C.8 — Executive Tone Catalog (C.8.0).
 * Deterministic tone profiles for humanization — no LLM · no fetch.
 */

export const MIA_EXECUTIVE_TONE_CATALOG_VERSION = "C.8.0";

export const EXECUTIVE_TONE_PROFILES = Object.freeze({
  EXECUTIVE: "executive",
  CONSULTATIVE: "consultative",
  INFORMATIVE: "informative",
  WARNING: "warning",
  POSITIVE: "positive",
  NEUTRAL: "neutral",
});

export const EXECUTIVE_TONE_PROFILE_LIST = Object.freeze(Object.values(EXECUTIVE_TONE_PROFILES));

export const EXECUTIVE_TONE_PROFILE_DEFINITIONS = Object.freeze({
  [EXECUTIVE_TONE_PROFILES.EXECUTIVE]: Object.freeze({
    label: "Executive",
    traits: ["objetivo", "direto", "profissional"],
    message_opener: "Resumo executivo do período",
  }),
  [EXECUTIVE_TONE_PROFILES.CONSULTATIVE]: Object.freeze({
    label: "Consultative",
    traits: ["orientativo", "claro", "próximo"],
    message_opener: "Análise orientativa para o período",
  }),
  [EXECUTIVE_TONE_PROFILES.INFORMATIVE]: Object.freeze({
    label: "Informative",
    traits: ["informativo", "estruturado", "neutro"],
    message_opener: "Panorama informativo do período",
  }),
  [EXECUTIVE_TONE_PROFILES.WARNING]: Object.freeze({
    label: "Warning",
    traits: ["objetivo", "cauteloso", "prioritário"],
    message_opener: "Pontos que merecem atenção imediata",
  }),
  [EXECUTIVE_TONE_PROFILES.POSITIVE]: Object.freeze({
    label: "Positive",
    traits: ["otimista", "baseado_em_evidências", "construtivo"],
    message_opener: "Sinais positivos identificados no período",
  }),
  [EXECUTIVE_TONE_PROFILES.NEUTRAL]: Object.freeze({
    label: "Neutral",
    traits: ["informativo", "equilibrado", "factual"],
    message_opener: "Situação geral do período",
  }),
});

export const EXECUTIVE_TONE_SEVERITY_TRIGGERS = Object.freeze(["critical", "high"]);
export const EXECUTIVE_TONE_POSITIVE_KEYWORDS = Object.freeze(["crescimento", "positivo", "expansão", "expand", "stable", "estável"]);

export const EXECUTIVE_TONE_PRIORITY_RANK = Object.freeze({
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
});
