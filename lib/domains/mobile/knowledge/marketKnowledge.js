/**
 * PATCH 4A.9 — Mobile market behavior knowledge (domain-only)
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

export const MOBILE_MARKET_RULES = Object.freeze([
  {
    id: "samsung_market",
    brandPattern: /\bsamsung\b|\bgalaxy\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.MARKET_BEHAVIOR,
        DOMAIN_KNOWLEDGE_BUCKET.MARKET_NOTE,
        "Samsung costuma ter ampla rede de assistência e boa disponibilidade de acessórios no Brasil",
        "mobile:market:samsung",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["varia por cidade", "modelos antigos podem ter peças mais difíceis"],
        ["brand:samsung"]
      ),
      item(
        DOMAIN_KNOWLEDGE_TYPE.MARKET_BEHAVIOR,
        DOMAIN_KNOWLEDGE_BUCKET.MARKET_NOTE,
        "Galaxy intermediários e premium costumam ter liquidez relativamente alta no mercado usado",
        "mobile:market:samsung_resale",
        "low",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["depende de geração e condição", "não garante valor de revenda"],
        ["brand:samsung"]
      ),
    ],
  },
  {
    id: "apple_market",
    brandPattern: /\biphone\b|\bapple\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.MARKET_BEHAVIOR,
        DOMAIN_KNOWLEDGE_BUCKET.MARKET_NOTE,
        "iPhone costuma manter liquidez e comunidade de acessórios ampla, especialmente em modelos recentes",
        "mobile:market:iphone",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["modelos muito antigos perdem suporte", "preço de usado varia por geração"],
        ["brand:apple"]
      ),
    ],
  },
]);
