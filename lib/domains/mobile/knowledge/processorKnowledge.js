/**
 * PATCH 4A.9 — Mobile processor ecosystem knowledge (domain-only)
 */

import {
  DOMAIN_KNOWLEDGE_BUCKET,
  DOMAIN_KNOWLEDGE_TYPE,
  DOMAIN_KNOWLEDGE_VALIDITY,
} from "../../domainKnowledgeContract.js";

const MOBILE_DOMAIN = "mobile";

function item(type, bucket, text, origin, confidence, validity, limitations = [], evidence = []) {
  return {
    type,
    bucket,
    text,
    origin,
    confidence,
    validity,
    limitations,
    evidence,
    domain: MOBILE_DOMAIN,
    category: "mobile",
  };
}

export const MOBILE_PROCESSOR_RULES = Object.freeze([
  {
    id: "snapdragon",
    pattern: /\bsnapdragon\b|\bqualcomm\b|\b8\s*gen\s*\d+/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.PROCESSOR_ECOSYSTEM,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Plataformas Snapdragon costumam ter ecossistema amplo de otimização em jogos e apps populares",
        "mobile:processor:snapdragon",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED,
        ["desempenho varia por geração e SKU", "nem todo app aproveita igual"],
        ["pattern:snapdragon"]
      ),
    ],
  },
  {
    id: "exynos",
    pattern: /\bexynos\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.PROCESSOR_ECOSYSTEM,
        DOMAIN_KNOWLEDGE_BUCKET.RISK_NOTE,
        "Variantes Exynos podem ter desempenho e eficiência diferentes das versões Snapdragon equivalentes, dependendo da geração",
        "mobile:processor:exynos",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED,
        ["diferença não é absoluta", "varia por modelo e região", "mercado e software influenciam"],
        ["pattern:exynos"]
      ),
    ],
  },
  {
    id: "tensor",
    pattern: /\btensor\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.PROCESSOR_ECOSYSTEM,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Tensor costuma priorizar integração com recursos de IA e câmera do ecossistema Pixel",
        "mobile:processor:tensor",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED,
        ["desempenho bruto varia por geração", "ecossistema Google é parte da proposta"],
        ["pattern:tensor"]
      ),
    ],
  },
  {
    id: "dimensity",
    pattern: /\bdimensity\b|\bmediatek\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.PROCESSOR_ECOSYSTEM,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Dimensity costuma aparecer em intermediários com foco em custo e eficiência, com variação forte por geração",
        "mobile:processor:dimensity",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED,
        ["desempenho varia por SKU", "suporte de software depende do fabricante"],
        ["pattern:dimensity"]
      ),
    ],
  },
  {
    id: "apple_silicon",
    pattern: /\ba\d+\s*(pro|max|bionic)?\b|\bapple\s+silicon\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.PROCESSOR_ECOSYSTEM,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Apple Silicon costuma manter desempenho sustentado e longevidade de suporte no ecossistema iOS",
        "mobile:processor:apple_silicon",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED,
        ["varia por geração", "experiência depende do modelo completo"],
        ["pattern:apple_silicon"]
      ),
    ],
  },
]);
