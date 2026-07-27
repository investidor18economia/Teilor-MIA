/**
 * PATCH 4A.9 — Mobile update policy knowledge (domain-only)
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

export const MOBILE_UPDATE_POLICY_RULES = Object.freeze([
  {
    id: "samsung_updates",
    brandPattern: /\bsamsung\b|\bgalaxy\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.UPDATE_POLICY,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Samsung costuma oferecer janela estendida de atualizações em linhas recentes, mas a duração varia por modelo e região",
        "mobile:policy:samsung_updates",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["política muda ao longo do tempo", "nem todo modelo recebe o mesmo prazo", "não é promessa absoluta"],
        ["brand:samsung"]
      ),
    ],
  },
  {
    id: "google_pixel_updates",
    brandPattern: /\bpixel\b|\bgoogle\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.UPDATE_POLICY,
        DOMAIN_KNOWLEDGE_BUCKET.STRATEGIC_NOTE,
        "Pixel costuma receber atualizações Android por período prolongado em relação à média do mercado",
        "mobile:policy:pixel_updates",
        "medium",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["prazo exato varia por geração", "recursos de IA podem depender de hardware"],
        ["brand:google_pixel"]
      ),
    ],
  },
  {
    id: "motorola_updates",
    brandPattern: /\bmotorola\b|\bmoto\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.UPDATE_POLICY,
        DOMAIN_KNOWLEDGE_BUCKET.RISK_NOTE,
        "Motorola costuma ter política de updates mais curta que flagships premium em várias linhas",
        "mobile:policy:motorola_updates",
        "low",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["varia por linha e região", "verificar geração específica"],
        ["brand:motorola"]
      ),
    ],
  },
  {
    id: "xiaomi_updates",
    brandPattern: /\bxiaomi\b|\bredmi\b|\bpoco\b/i,
    items: [
      item(
        DOMAIN_KNOWLEDGE_TYPE.UPDATE_POLICY,
        DOMAIN_KNOWLEDGE_BUCKET.RISK_NOTE,
        "Xiaomi/Redmi/Poco podem ter ritmo de updates desigual entre linhas e mercados",
        "mobile:policy:xiaomi_updates",
        "low",
        DOMAIN_KNOWLEDGE_VALIDITY.MARKET_DEPENDENT,
        ["MIUI/HyperOS varia por região", "linha e ano alteram suporte"],
        ["brand:xiaomi"]
      ),
    ],
  },
]);
