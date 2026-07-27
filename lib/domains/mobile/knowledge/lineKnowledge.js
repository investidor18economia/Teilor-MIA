/**
 * PATCH 4A.9 — Mobile line knowledge (domain-only)
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

export const MOBILE_LINE_RULES = Object.freeze([
  {
    id: "galaxy_fe",
    pattern: /\bgalaxy\s+s\d+\s*fe\b|\bgalaxy\s+fe\b|\bs\d+\s*fe\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.LINE_POSITIONING,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Linhas FE costumam buscar equilíbrio entre desempenho e preço, trazendo recursos de topo de linha com concessões pontuais",
        "mobile:line:galaxy_fe",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.STABLE,
        ["não é regra absoluta", "varia por geração e região"],
        ["pattern:galaxy_fe"]
      ),
    ],
  },
  {
    id: "galaxy_a",
    pattern: /\bgalaxy\s+a\d+/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.LINE_POSITIONING,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "A linha Galaxy A tende a priorizar equilíbrio geral e custo-benefício no intermediário",
        "mobile:line:galaxy_a",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.STABLE,
        ["varia por geração", "configuração regional altera o conjunto"],
        ["pattern:galaxy_a"]
      ),
    ],
  },
  {
    id: "galaxy_s",
    pattern: /\bgalaxy\s+s\d+(?!.*\bfe\b)/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.LINE_POSITIONING,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "A linha Galaxy S costuma concentrar os recursos mais avançados da Samsung no segmento premium",
        "mobile:line:galaxy_s",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED,
        ["posicionamento muda entre gerações", "nem todo mercado recebe o mesmo pacote"],
        ["pattern:galaxy_s"]
      ),
    ],
  },
  {
    id: "redmi_note",
    pattern: /\bredmi\s+note\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.VALUE_POSITIONING,
        DOMAIN_KNOWLEDGE_BUCKET.MARKET_NOTE,
        "Redmi Note costuma competir forte em custo-benefício no intermediário, com foco em bateria e tela",
        "mobile:line:redmi_note",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["varia por geração", "disponibilidade e software regional influenciam"],
        ["pattern:redmi_note"]
      ),
    ],
  },
  {
    id: "moto_edge",
    pattern: /\bmoto\s*edge\b|\bmotorola\s+edge\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.LINE_POSITIONING,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "A linha Edge da Motorola costuma equilibrar tela fluida e autonomia no intermediário premium",
        "mobile:line:moto_edge",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["varia por geração", "software próximo influencia a experiência"],
        ["pattern:moto_edge"]
      ),
    ],
  },
  {
    id: "pixel",
    pattern: /\bpixel\s*\d+/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.UPDATE_POLICY,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Pixel costuma se destacar por integração software-câmera e ciclo de atualizações prolongado para Android",
        "mobile:line:pixel",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.VERSIONED,
        ["política de updates pode mudar por geração", "disponibilidade regional limitada"],
        ["pattern:pixel"]
      ),
    ],
  },
  {
    id: "iphone_used",
    pattern: /\biphone\b/i,
    usedOnly: true,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.MARKET_BEHAVIOR,
        DOMAIN_KNOWLEDGE_BUCKET.MARKET_NOTE,
        "iPhone usado costuma manter liquidez e acesso amplo a assistência, mas autonomia e suporte dependem da geração",
        "mobile:market:iphone_used",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["estado da bateria varia", "suporte de SO depende do modelo", "não garante desempenho atual"],
        ["pattern:iphone", "signal:used_market"]
      ),
    ],
  },
]);
