/**
 * PATCH 7.9Z — Conversational Stress Test (15+ turns)
 * PATCH 7.9Z.2 — family routing harness aligned with flow audits
 *
 * Validates cognitive continuity across long conversations without HTTP.
 * Tracks winner, anchor, constraints, and family intent turn-by-turn.
 *
 * Usage: node scripts/test-mia-conversational-stress-15-turns.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAnchoredShortFollowUpQuery,
  isAntiRegretFamilyQuery,
  isConstraintChangeFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isAcknowledgementFamilyQuery,
  isGreetingFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { detectGenericConversationalFallback } from "../lib/miaConversationalFamilyClosureStandard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const WINNER = "Smartphone Alpha 35";
const RUNNER_UP = "Smartphone Beta 22";
const THIRD = "Smartphone Gamma 18";

const RANKING_SNAPSHOT = [
  { product_name: WINNER, rank: 1, price: "R$ 2.399" },
  { product_name: RUNNER_UP, rank: 2, price: "R$ 2.199" },
  { product_name: THIRD, rank: 3, price: "R$ 1.899" },
];

const GENERIC_WELCOME =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const FAMILY_PATH = {
  ANTI_REGRET: "anti_regret_flow",
  CONSTRAINT_CHANGE: "constraint_change_flow",
  CONFIDENCE_CHALLENGE: "confidence_challenge_flow",
  SOCIAL_VALIDATION: "social_validation_flow",
  SOFT_DISAGREEMENT: "soft_disagreement_flow",
  ALTERNATIVE_EXPLORATION: "alternative_exploration_flow",
  SECOND_BEST_DISCOVERY: "second_best_discovery_flow",
  DECISION_CONFIRMATION: "decision_confirmation_flow",
  COMPREHENSION: "comprehension_flow",
  ACKNOWLEDGEMENT: "acknowledgement_flow",
  GREETING: "greeting_flow",
  COMMERCIAL_SEARCH: "default_product_search",
  EXPLANATION: "explanation_flow",
};

function t(msg, family, opts = {}) {
  return { msg, family, ...opts };
}

/** 20 conversas — tipos A–E, 15–20 turnos cada */
const CONVERSATIONS = [
  // ── TIPO A (4) — fluxo clássico busca → hesitação → recalibração ──
  {
    id: "A1",
    type: "A",
    name: "Busca + hesitação + recalibração clássica",
    turns: [
      t("quero celular ate 2500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2500 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("e bateria?", "COMMERCIAL_SEARCH", { preserveWinner: true, axis: "bateria" }),
      t("tem outra opcao?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("gostei", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["DECISION_CONFIRMATION"] }),
      t("mas tenho medo de me arrepender", "ANTI_REGRET", { preserveWinner: true }),
      t("o pessoal fala bem?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("voce continua recomendando?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2200 }),
      t("tem segunda opcao?", "SECOND_BEST_DISCOVERY", { preserveWinner: true, a: ["ALTERNATIVE_EXPLORATION"] }),
      t("entendi", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("faz sentido", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("mas nao me convenceu totalmente", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("explica melhor", "COMPREHENSION", { preserveWinner: true }),
      t("agora entendi", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "A2",
    type: "A",
    name: "Busca notebook + hesitação emocional",
    turns: [
      t("preciso de notebook ate 4000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 4000 }),
      t("qual voce indica?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("e desempenho?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("tem alternativa?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("curti", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("mas fiquei com receio", "ANTI_REGRET", { preserveWinner: true }),
      t("a galera recomenda?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("voce mantem essa escolha?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("quero algo mais em conta", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3500 }),
      t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("ok", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("faz sentido agora", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("mas ainda to na duvida", "SOFT_DISAGREEMENT", { preserveWinner: true, a: ["ANTI_REGRET"] }),
      t("me explica de novo", "COMPREHENSION", { preserveWinner: true }),
      t("saquei", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "A3",
    type: "A",
    name: "Busca genérica + eixo bateria + plano B",
    turns: [
      t("busco smartphone ate 2000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2000 }),
      t("me recomenda um", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("prioriza bateria", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "bateria" }),
      t("tem outro?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("show", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("mas tenho medo de errar", "ANTI_REGRET", { preserveWinner: true }),
      t("quem comprou gostou?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("tem certeza?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("prefiro gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1800 }),
      t("plano b mais barato?", "SECOND_BEST_DISCOVERY", { preserveWinner: true, a: ["ALTERNATIVE_EXPLORATION"] }),
      t("entendi", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("faz sentido", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("mas nao me ganhou totalmente", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("detalha melhor", "COMPREHENSION", { preserveWinner: true }),
      t("beleza agora ficou claro", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "A4",
    type: "A",
    name: "Orçamento + câmera + resistência leve",
    turns: [
      t("quero celular ate 3000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 3000 }),
      t("qual o melhor?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("e camera?", "COMMERCIAL_SEARCH", { preserveWinner: true, axis: "camera" }),
      t("quero ver outra opcao", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("perfeito", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("mas nao quero me arrepender", "ANTI_REGRET", { preserveWinner: true }),
      t("o povo fala bem?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("voce sustenta?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("pensei melhor no orcamento", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2600 }),
      t("segunda opcao se eu gastar menos?", "SECOND_BEST_DISCOVERY", { preserveWinner: true, a: ["CONSTRAINT_CHANGE"] }),
      t("captei", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("faz sentido sim", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("mas nao to 100 por cento", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("explica melhor o porque", "COMPREHENSION", { preserveWinner: true }),
      t("agora sim", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("to mais tranquilo", "ANTI_REGRET", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },

  // ── TIPO B (4) — CC + SV + CC + SD na mesma conversa ──
  {
    id: "B1",
    type: "B",
    name: "CC/SV/CC/SD intercalados",
    turns: [
      t("celular ate 2500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2500 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2200 }),
      t("o pessoal costuma se arrepender?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("voce tem certeza?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("agora bateria importa mais", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "bateria" }),
      t("a galera recomenda?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("ainda recomenda?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("to meio na duvida", "SOFT_DISAGREEMENT", { preserveWinner: true, a: ["ANTI_REGRET"] }),
      t("quero economizar um pouco", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2000 }),
      t("quem comprou gostou?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("nao bateu comigo", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("ficou caro demais", "CONSTRAINT_CHANGE", { preserveWinner: true, a: ["SOFT_DISAGREEMENT"] }),
      t("voce manteria?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("entendi o raciocinio", "COMPREHENSION", { preserveWinner: true }),
    ],
  },
  {
    id: "B2",
    type: "B",
    name: "Validação social + desafio + constraint",
    turns: [
      t("notebook ate 5000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 5000 }),
      t("me indica", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("quem usa no dia a dia aprova?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("voce compraria mesmo?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("quero pagar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 4200 }),
      t("nao curti muito", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("o povo fala bem ou da problema?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("sustenta essa escolha?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("e se eu baixar o orcamento?", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3800 }),
      t("nao me desceu bem", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("muita gente reclama?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("continua valendo?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("preciso gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3500 }),
      t("parece meio forcado", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("faz sentido mas fiquei na duvida", "SOFT_DISAGREEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
    ],
  },
  {
    id: "B3",
    type: "B",
    name: "Preço + prova social + resistência",
    turns: [
      t("smartphone ate 1800", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 1800 }),
      t("qual escolher?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("ficou caro", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1600 }),
      t("sera que muita gente se arrepende?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("nao estou convencido", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("quero algo mais barato", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1500 }),
      t("quem comprou se arrepende?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("voce crava isso?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("nao me passou confianca", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("e se eu quiser economizar?", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1400 }),
      t("a maioria aprova?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("ainda acha que e o melhor?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("to meio assim", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("baixei o orcamento na cabeca", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1300 }),
      t("o pessoal gosta?", "SOCIAL_VALIDATION", { preserveWinner: true }),
    ],
  },
  {
    id: "B4",
    type: "B",
    name: "Mix CC/SV/CC/SD denso",
    turns: [
      t("quero celular ate 2200", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2200 }),
      t("recomenda", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("quero gastar menos, tem outro?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true, a: ["CONSTRAINT_CHANGE"], setBudget: 2000 }),
      t("o pessoal fala bem?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("nao me convenceu, voce tem certeza?", "CONFIDENCE_CHALLENGE", { preserveWinner: true, a: ["SOFT_DISAGREEMENT"] }),
      t("agora camera pesa mais", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "camera" }),
      t("quem tem passa dor de cabeca?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("nao bateu comigo", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("prefiro gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1900 }),
      t("voce sustenta?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("nao sei se e isso", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("quero recalibrar o orcamento", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1800 }),
      t("a galera curte?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("fiquei com pe atras", "SOFT_DISAGREEMENT", { preserveWinner: true, a: ["ANTI_REGRET"] }),
      t("voce manteria essa escolha?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("entendi mas ainda to na duvida", "SOFT_DISAGREEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("faz sentido", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
    ],
  },

  // ── TIPO C (4) — GREET/ACK/COMP/AR/CC misturados ──
  {
    id: "C1",
    type: "C",
    name: "Saudação + ack + comprehension + AR",
    turns: [
      t("oi, quero celular ate 2500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2500 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("ok", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("entendi", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("bom dia, tenho medo de errar", "ANTI_REGRET", { preserveWinner: true, a: ["GREETING"] }),
      t("faz sentido", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("beleza", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("saquei", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("salve, quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, a: ["GREETING"], setBudget: 2200 }),
      t("show", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("nao ficou claro", "COMPREHENSION", { preserveWinner: true }),
      t("entendi, mas tenho medo de errar", "ANTI_REGRET", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("perfeito", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("explica de outro jeito", "COMPREHENSION", { preserveWinner: true }),
      t("agora saquei", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "C2",
    type: "C",
    name: "Prefixos conversacionais densos",
    turns: [
      t("celular ate 2000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2000 }),
      t("me recomenda", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("oi, e bateria?", "COMMERCIAL_SEARCH", { preserveWinner: true, a: ["GREETING"] }),
      t("certo", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("nao entendi direito", "COMPREHENSION", { preserveWinner: true }),
      t("fala mia, voce tem certeza?", "CONFIDENCE_CHALLENGE", { preserveWinner: true, a: ["GREETING"] }),
      t("beleza entao", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("faz sentido mas tenho receio", "ANTI_REGRET", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("combinado", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("entendi, mas quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, a: ["COMPREHENSION"], setBudget: 1800 }),
      t("show, continua", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("como assim?", "COMPREHENSION", { preserveWinner: true }),
      t("salve, tem outro?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true, a: ["GREETING"] }),
      t("fechado", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("agora ficou claro", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "C3",
    type: "C",
    name: "Ack/comp loop + constraint",
    turns: [
      t("notebook ate 3500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 3500 }),
      t("qual voce indica?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("entendi", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("faz sentido", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("ok", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("nao peguei a parte do preco", "COMPREHENSION", { preserveWinner: true }),
      t("saquei", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("bom dia, quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, a: ["GREETING"], setBudget: 3000 }),
      t("perfeito", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("tenho medo de errar", "ANTI_REGRET", { preserveWinner: true }),
      t("entendi, mas o povo fala bem?", "SOCIAL_VALIDATION", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("beleza", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("explica melhor", "COMPREHENSION", { preserveWinner: true }),
      t("faz sentido agora", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("quero recalibrar", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2800 }),
    ],
  },
  {
    id: "C4",
    type: "C",
    name: "Greeting-heavy + AR tail",
    turns: [
      t("e ai, celular ate 2500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2500 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("salve", "GREETING", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("entendi", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("oi, nao me convenceu", "SOFT_DISAGREEMENT", { preserveWinner: true, a: ["GREETING"] }),
      t("faz sentido", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("bom dia, tenho medo de errar", "ANTI_REGRET", { preserveWinner: true, a: ["GREETING"] }),
      t("ok", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("nao ficou claro ainda", "COMPREHENSION", { preserveWinner: true }),
      t("mia, me explica de novo", "COMPREHENSION", { preserveWinner: true, a: ["GREETING"] }),
      t("beleza", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("entendi, mas quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, a: ["COMPREHENSION"], setBudget: 2200 }),
      t("show", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("faz sentido mas fiquei cabreiro", "ANTI_REGRET", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("captei", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("agora to tranquilo", "ANTI_REGRET", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },

  // ── TIPO D (4) — escada de orçamento + eixos ──
  {
    id: "D1",
    type: "D",
    name: "2500→2200→1800 + bateria + segunda opção",
    turns: [
      t("celular ate 2500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2500 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2200 }),
      t("e agora ate 1800", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1800 }),
      t("prioriza bateria", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "bateria" }),
      t("camera importa menos", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "camera", deprioritize: true }),
      t("qual seria a segunda opcao?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("se eu baixar o orcamento quem fica melhor?", "SECOND_BEST_DISCOVERY", { preserveWinner: true, a: ["CONSTRAINT_CHANGE"] }),
      t("tem outro parecido mais barato?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("quero algo mais barato sem perder muito", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1700 }),
      t("plano b mais barato?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("agora bateria virou prioridade", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "bateria" }),
      t("e se eu quiser economizar um pouco?", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1600 }),
      t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("ok entendi a recalibracao", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "D2",
    type: "D",
    name: "Escada agressiva de preço",
    turns: [
      t("smartphone ate 3000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 3000 }),
      t("recomenda", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("ta puxado", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2600 }),
      t("quero pagar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2400 }),
      t("preciso baixar mais", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2100 }),
      t("meu orcamento diminuiu", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1900 }),
      t("quero focar em durabilidade", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "durabilidade" }),
      t("desempenho importa menos", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "desempenho", deprioritize: true }),
      t("qual a proxima escolha mais em conta?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("tem alternativa?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("e se eu gastar menos?", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1700 }),
      t("segunda opcao se eu gastar menos?", "SECOND_BEST_DISCOVERY", { preserveWinner: true, a: ["CONSTRAINT_CHANGE"] }),
      t("agora autonomia pesa mais", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "bateria" }),
      t("quero algo mais em conta", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1600 }),
      t("plano b?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("ficou claro", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "D3",
    type: "D",
    name: "Uso + orçamento + runner-up",
    turns: [
      t("celular ate 2500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2500 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("vou jogar mais", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "jogos" }),
      t("quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2200 }),
      t("camera virou prioridade", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "camera" }),
      t("agora ate 2000", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2000 }),
      t("bateria pesa mais", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "bateria" }),
      t("quero economizar", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1800 }),
      t("qual seria o plano b?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("tem outro?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("se eu nao pegar esse qual voce indicaria?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("pensei melhor no orcamento", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1700 }),
      t("quero priorizar custo beneficio", "CONSTRAINT_CHANGE", { preserveWinner: true }),
      t("segundo colocado?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("entendi", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
    ],
  },
  {
    id: "D4",
    type: "D",
    name: "Recalibração contínua sem reset",
    turns: [
      t("notebook ate 4500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 4500 }),
      t("indica um", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("ficou caro", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 4000 }),
      t("quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3800 }),
      t("trabalho virou foco", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "trabalho" }),
      t("ate 3500 agora", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3500 }),
      t("durabilidade importa mais", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "durabilidade" }),
      t("quero algo mais barato", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3200 }),
      t("qual seria a segunda opcao se eu gastar menos?", "SECOND_BEST_DISCOVERY", { preserveWinner: true, a: ["CONSTRAINT_CHANGE"] }),
      t("tem outro parecido?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("baixar o orcamento", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3000 }),
      t("proxima escolha mais em conta?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("nao ligo tanto pra camera", "CONSTRAINT_CHANGE", { preserveWinner: true, axis: "camera", deprioritize: true }),
      t("quero recalibrar", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2800 }),
      t("plano b mais barato?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("saquei a logica", "COMPREHENSION", { preserveWinner: true }),
      t("faz sentido", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("beleza", "ACKNOWLEDGEMENT", { preserveWinner: true }),
    ],
  },

  // ── TIPO E (4) — usuário difícil ──
  {
    id: "E1",
    type: "E",
    name: "Discorda → concorda → desafia",
    turns: [
      t("celular ate 2500", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2500 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("nao me convenceu", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("explica melhor", "COMPREHENSION", { preserveWinner: true }),
      t("faz sentido", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("mas voce tem certeza?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("nao to convencido ainda", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("detalha de novo", "COMPREHENSION", { preserveWinner: true }),
      t("ok agora entendi", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("acho que vou nele", "DECISION_CONFIRMATION", { preserveWinner: true }),
      t("espera, quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2200 }),
      t("nao, ainda to na duvida", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("voce sustenta?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("tenho medo de errar", "ANTI_REGRET", { preserveWinner: true }),
      t("beleza, to mais calmo", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["ANTI_REGRET"] }),
    ],
  },
  {
    id: "E2",
    type: "E",
    name: "Oscilação decisão + explicação",
    turns: [
      t("smartphone ate 2000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2000 }),
      t("me recomenda", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("parece bom", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["DECISION_CONFIRMATION"] }),
      t("nao sei", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("por que esse?", "COMPREHENSION", { preserveWinner: true, a: ["COMMERCIAL_SEARCH"] }),
      t("nao ficou claro", "COMPREHENSION", { preserveWinner: true }),
      t("faz sentido agora", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("mas nao me ganhou", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("voce compraria?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("vou nele", "DECISION_CONFIRMATION", { preserveWinner: true }),
      t("nao, perai", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("quero ver alternativas", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("ficou caro", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 1800 }),
      t("explica de outro jeito", "COMPREHENSION", { preserveWinner: true }),
      t("entendi", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("to mais seguro agora", "ANTI_REGRET", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "E3",
    type: "E",
    name: "Desafio constante da recomendação",
    turns: [
      t("celular ate 2800", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 2800 }),
      t("qual recomenda?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("tem certeza?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("voce manteria?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("o povo fala bem?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("ainda recomenda?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("nao bateu comigo", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("sera que vou me arrepender?", "ANTI_REGRET", { preserveWinner: true, a: ["CONFIDENCE_CHALLENGE"] }),
      t("voce sustenta ou eu erro?", "CONFIDENCE_CHALLENGE", { preserveWinner: true, a: ["ANTI_REGRET"] }),
      t("explica melhor", "COMPREHENSION", { preserveWinner: true }),
      t("faz sentido mas fiquei na duvida", "SOFT_DISAGREEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 2400 }),
      t("nao estou convencido", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("voce crava?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("ok vou confiar", "DECISION_CONFIRMATION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
  {
    id: "E4",
    type: "E",
    name: "Muda ideia + pede prova + recalibra",
    turns: [
      t("notebook ate 5000", "COMMERCIAL_SEARCH", { newSearch: true, setAnchor: true, setBudget: 5000 }),
      t("qual voce indica?", "COMMERCIAL_SEARCH", { preserveWinner: true }),
      t("gostei", "ACKNOWLEDGEMENT", { preserveWinner: true }),
      t("nao, espera", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("quero gastar menos", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 4200 }),
      t("tem outro?", "ALTERNATIVE_EXPLORATION", { preserveWinner: true }),
      t("nao curti", "SOFT_DISAGREEMENT", { preserveWinner: true }),
      t("quem comprou gostou?", "SOCIAL_VALIDATION", { preserveWinner: true }),
      t("voce tem certeza?", "CONFIDENCE_CHALLENGE", { preserveWinner: true }),
      t("parece que e esse", "DECISION_CONFIRMATION", { preserveWinner: true }),
      t("mas nao quero dor de cabeca", "ANTI_REGRET", { preserveWinner: true, a: ["DECISION_CONFIRMATION"] }),
      t("explica melhor", "COMPREHENSION", { preserveWinner: true }),
      t("faz sentido", "ACKNOWLEDGEMENT", { preserveWinner: true, a: ["COMPREHENSION"] }),
      t("pensei melhor no orcamento", "CONSTRAINT_CHANGE", { preserveWinner: true, setBudget: 3800 }),
      t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", { preserveWinner: true }),
      t("entendi agora", "COMPREHENSION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
      t("fechou", "DECISION_CONFIRMATION", { preserveWinner: true, a: ["ACKNOWLEDGEMENT"] }),
    ],
  },
];

function buildSessionContext(state) {
  if (!state.hasAnchor) return {};
  return {
    lastBestProduct: { product_name: state.winner, price: "R$ 2.399" },
    lastRecommendation: { winner: state.winner },
    lastProductMentioned: state.winner,
    lastProducts: RANKING_SNAPSHOT,
    lastRankingSnapshot: RANKING_SNAPSHOT,
    budgetMax: state.budgetMax,
    priorityAxis: state.priorityAxis,
  };
}

function inferDominantFromSignals(signals = {}, turnType = "", message = "") {
  if (signals.isAlternativeExploration || isAlternativeExplorationFamilyQuery(message)) {
    return "ALTERNATIVE_EXPLORATION";
  }
  if (signals.isSecondBestDiscovery || isSecondBestDiscoveryFamilyQuery(message)) {
    return "SECOND_BEST_DISCOVERY";
  }
  if (signals.isAntiRegret || isAntiRegretFamilyQuery(message)) return "ANTI_REGRET";
  if (signals.isConfidenceChallenge || isConfidenceChallengeFamilyQuery(message)) {
    return "CONFIDENCE_CHALLENGE";
  }
  if (signals.isSocialValidation || isSocialValidationFamilyQuery(message)) {
    return "SOCIAL_VALIDATION";
  }
  if (signals.isSoftDisagreement || isSoftDisagreementFamilyQuery(message)) {
    return "SOFT_DISAGREEMENT";
  }
  if (signals.isConstraintChange || isConstraintChangeFamilyQuery(message)) {
    return "CONSTRAINT_CHANGE";
  }
  if (signals.isDecisionConfirmation || isDecisionConfirmationFamilyQuery(message)) {
    return "DECISION_CONFIRMATION";
  }
  if (signals.isComprehension || isComprehensionFamilyQuery(message) || isComprehensionSemanticFamilyQuery(message)) {
    return "COMPREHENSION";
  }
  if (signals.isAcknowledgement || isAcknowledgementFamilyQuery(message)) return "ACKNOWLEDGEMENT";
  if (signals.isGreeting || isGreetingFamilyQuery(message)) return "GREETING";
  if (signals.isAnchoredShortFollowUp || isAnchoredShortFollowUpQuery(message, { hasActiveAnchor: true })) {
    return "COMMERCIAL_SEARCH";
  }
  if (turnType === MIA_TURN_TYPES.NEW_SEARCH || turnType === "NEW_SEARCH") return "COMMERCIAL_SEARCH";
  if (turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST && isConfidenceChallengeFamilyQuery(message)) {
    return "CONFIDENCE_CHALLENGE";
  }
  if (turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) return "COMPREHENSION";
  if (turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) return "CONSTRAINT_CHANGE";
  if (turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST) {
    return signals.isSecondBestDiscovery ? "SECOND_BEST_DISCOVERY" : "ALTERNATIVE_EXPLORATION";
  }
  return null;
}

const ROUTING_HINT_TO_PATH = {
  acknowledgement_anchored: "acknowledgement_flow",
  acknowledgement_reply: "acknowledgement_flow",
  confidence_challenge_anchored: "confidence_challenge_flow",
  confidence_challenge_reply: "confidence_challenge_flow",
  anti_regret_anchored: "anti_regret_flow",
  anti_regret_reply: "anti_regret_flow",
  social_validation_anchored: "social_validation_flow",
  social_validation_reply: "social_validation_flow",
  soft_disagreement_anchored: "soft_disagreement_flow",
  soft_disagreement_reply: "soft_disagreement_flow",
  comprehension_anchored: "comprehension_flow",
  comprehension_reply: "comprehension_flow",
  constraint_change_anchored: "constraint_change_flow",
  constraint_change_reply: "constraint_change_flow",
  second_best_discovery_anchored: "second_best_discovery_flow",
  second_best_discovery_reply: "second_best_discovery_flow",
  alternative_exploration_anchored: "alternative_exploration_flow",
  alternative_exploration_reply: "alternative_exploration_flow",
  decision_confirmation_anchored: "decision_confirmation_flow",
  decision_confirmation_reply: "decision_confirmation_flow",
  greeting_anchored: "greeting_flow",
  greeting_open: "greeting_flow",
  anchored_contextual_follow_up: "anchored_contextual_follow_up",
};

function buildConversationalPathFlags(message, cognitiveTurn, routingDecision, clearNewSearch) {
  const sig = cognitiveTurn.signals || {};
  return {
    ANTI_REGRET:
      !clearNewSearch &&
      (sig.isAntiRegret ||
        isAntiRegretFamilyQuery(message) ||
        routingDecision.conversationAct === "anti_regret"),
    CONSTRAINT_CHANGE:
      !clearNewSearch &&
      (sig.isConstraintChange ||
        isConstraintChangeFamilyQuery(message) ||
        routingDecision.conversationAct === "constraint_change" ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT),
    CONFIDENCE_CHALLENGE:
      !clearNewSearch &&
      (sig.isConfidenceChallenge ||
        isConfidenceChallengeFamilyQuery(message) ||
        routingDecision.conversationAct === "confidence_challenge"),
    SOCIAL_VALIDATION:
      sig.isSocialValidation ||
      isSocialValidationFamilyQuery(message) ||
      routingDecision.conversationAct === "social_validation",
    SECOND_BEST_DISCOVERY:
      sig.isSecondBestDiscovery ||
      isSecondBestDiscoveryFamilyQuery(message) ||
      routingDecision.conversationAct === "second_best_discovery",
    ALTERNATIVE_EXPLORATION:
      sig.isAlternativeExploration ||
      isAlternativeExplorationFamilyQuery(message) ||
      routingDecision.conversationAct === "alternative_exploration",
    SOFT_DISAGREEMENT:
      !clearNewSearch &&
      (sig.isSoftDisagreement ||
        isSoftDisagreementFamilyQuery(message) ||
        routingDecision.conversationAct === "soft_disagreement"),
    COMPREHENSION:
      sig.isComprehension ||
      isComprehensionFamilyQuery(message) ||
      isComprehensionSemanticFamilyQuery(message) ||
      routingDecision.conversationAct === "comprehension",
    ACKNOWLEDGEMENT:
      !clearNewSearch &&
      (sig.isAcknowledgement ||
        isAcknowledgementFamilyQuery(message) ||
        routingDecision.conversationAct === "acknowledgement"),
    GREETING:
      sig.isGreeting ||
      isGreetingFamilyQuery(message) ||
      routingDecision.conversationAct === "greeting",
    DECISION_CONFIRMATION:
      !clearNewSearch &&
      (sig.isDecisionConfirmation ||
        isDecisionConfirmationFamilyQuery(message) ||
        routingDecision.conversationAct === "decision_confirmation"),
  };
}

function familyFromPath(path) {
  for (const [family, flow] of Object.entries(FAMILY_PATH)) {
    if (path === flow) return family;
  }
  if (path === "context_resolution_direct_reply_early_return") return "GREETING";
  return null;
}

function simulateTurn(message, state) {
  const sessionContext = buildSessionContext(state);
  const hasActiveAnchor = !!state.hasAnchor;

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, "search");
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: "search",
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
  });

  const anchoredShortFollowUp = isAnchoredShortFollowUpQuery(message, { hasActiveAnchor });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: hasActiveAnchor,
    looksLikeShortPriorityFollowUp: anchoredShortFollowUp,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: {
      mode: hasActiveAnchor ? "general_answer" : "general_answer",
      shouldSkipProductSearch: false,
      directReply: GENERIC_WELCOME,
      clearContext: !hasActiveAnchor,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isAnchoredShortFollowUp: !!cognitiveTurn.signals?.isAnchoredShortFollowUp,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: anchoredShortFollowUp,
      isAnchoredShortFollowUp: anchoredShortFollowUp,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    (routingDecision.allowNewSearch === true &&
      routingDecision.mode !== "context_hold" &&
      routingDecision.mode !== "conversational" &&
      routingDecision.mode !== "anchored_reaction");

  const pathFlags = buildConversationalPathFlags(
    message,
    cognitiveTurn,
    routingDecision,
    clearNewSearch
  );

  const priority = [
    "ANTI_REGRET",
    "DECISION_CONFIRMATION",
    "CONFIDENCE_CHALLENGE",
    "SOCIAL_VALIDATION",
    "SECOND_BEST_DISCOVERY",
    "ALTERNATIVE_EXPLORATION",
    "SOFT_DISAGREEMENT",
    "COMPREHENSION",
    "ACKNOWLEDGEMENT",
    "GREETING",
    "CONSTRAINT_CHANGE",
  ];

  let responsePathFinal = "unknown";
  const hasConversationalPath = priority.some((f) => pathFlags[f]);

  if (ROUTING_HINT_TO_PATH[routingDecision.responsePathHint]) {
    responsePathFinal = ROUTING_HINT_TO_PATH[routingDecision.responsePathHint];
  } else if (openedNewSearch && !hasConversationalPath && !pathFlags.CONSTRAINT_CHANGE) {
    responsePathFinal = "default_product_search";
  } else {
    for (const family of priority) {
      if (pathFlags[family]) {
        responsePathFinal = FAMILY_PATH[family] || `${family.toLowerCase()}_path`;
        break;
      }
    }
    if (responsePathFinal === "unknown" && pathFlags.CONSTRAINT_CHANGE) {
      responsePathFinal = "constraint_change_flow";
    }
    if (responsePathFinal === "unknown" && cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH) {
      responsePathFinal = "default_product_search";
    }
    if (responsePathFinal === "unknown" && cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
      responsePathFinal = "comprehension_flow";
    }
    if (responsePathFinal === "unknown") {
      responsePathFinal = "context_resolution_direct_reply_early_return";
    }
  }

  const actualFamily =
    inferDominantFromSignals(cognitiveTurn.signals, cognitiveTurn.turnType, message) ||
    familyFromPath(responsePathFinal) ||
    (openedNewSearch ? "COMMERCIAL_SEARCH" : "UNKNOWN");

  const genericFallback = detectGenericConversationalFallback(
    responsePathFinal === "context_resolution_direct_reply_early_return" ? GENERIC_WELCOME : ""
  );

  return {
    message,
    cognitiveTurn,
    bridge: {
      active: bridgeAudit.active,
      toIntent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
      contextAction: guardResult.contextAction,
    },
    routing: {
      mode: routingDecision.mode,
      conversationAct: routingDecision.conversationAct,
      responsePathHint: routingDecision.responsePathHint,
      clearNewSearch,
      openedNewSearch,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
      allowReplaceWinner: routingDecision.allowReplaceWinner,
    },
    responsePathFinal,
    actualFamily,
    genericFallback,
    hasActiveAnchor,
  };
}

function applyTurnToState(state, turnSpec, trace) {
  const next = { ...state };
  if (turnSpec.setAnchor || trace.cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    next.hasAnchor = true;
    next.winner = WINNER;
    next.runnerUp = RUNNER_UP;
  }
  if (turnSpec.setBudget != null) next.budgetMax = turnSpec.setBudget;
  if (turnSpec.axis) next.priorityAxis = turnSpec.axis;
  if (turnSpec.deprioritize && turnSpec.axis) {
    next.deprioritized = next.deprioritized || [];
    if (!next.deprioritized.includes(turnSpec.axis)) next.deprioritized.push(turnSpec.axis);
  }
  return next;
}

function familyMatches(actual, expected, acceptable = []) {
  return actual === expected || acceptable.includes(actual);
}

function evaluateTurn(turnIndex, turnSpec, trace, state, convState) {
  const leaks = [];
  const acceptable = turnSpec.a || [];
  const familyOk = familyMatches(trace.actualFamily, turnSpec.family, acceptable);

  if (!familyOk) {
    leaks.push({
      type: "FAMILY_LOSS",
      detail: `T${turnIndex + 1} expect=${turnSpec.family} got=${trace.actualFamily}`,
    });
  }

  const routerOk = familyOk;

  const routingOk =
    !(trace.routing.openedNewSearch && turnSpec.preserveWinner && !turnSpec.newSearch) &&
    !(trace.routing.clearNewSearch && state.hasAnchor && turnSpec.preserveWinner && !turnSpec.newSearch);

  if (trace.routing.openedNewSearch && turnSpec.preserveWinner && !turnSpec.newSearch) {
    leaks.push({ type: "UNNECESSARY_NEW_SEARCH", detail: `T${turnIndex + 1} opened search mid-conversation` });
  }
  if (trace.routing.clearNewSearch && state.hasAnchor && turnSpec.preserveWinner && !turnSpec.newSearch) {
    leaks.push({ type: "CONTEXT_RESET", detail: `T${turnIndex + 1} clearNewCommercialSearch with anchor` });
  }

  const anchorOk =
    !state.hasAnchor ||
    !turnSpec.preserveWinner ||
    trace.routing.shouldPreserveAnchor !== false;

  if (state.hasAnchor && turnSpec.preserveWinner && trace.routing.shouldPreserveAnchor === false) {
    leaks.push({ type: "ANCHOR_LOSS", detail: `T${turnIndex + 1} shouldPreserveAnchor=false` });
  }

  const winnerOk =
    !state.hasAnchor ||
    !turnSpec.preserveWinner ||
    trace.routing.allowReplaceWinner !== true;

  if (state.hasAnchor && turnSpec.preserveWinner && trace.routing.allowReplaceWinner === true) {
    leaks.push({ type: "WINNER_LOSS", detail: `T${turnIndex + 1} allowReplaceWinner=true` });
    convState.winnerDrift = true;
  }

  let constraintOk = true;
  if (turnSpec.setBudget != null && state.budgetMax != null && turnSpec.setBudget !== state.budgetMax) {
    constraintOk = true;
  } else if (state.hasAnchor && state.budgetMax && turnSpec.preserveWinner && trace.routing.openedNewSearch) {
    constraintOk = false;
    leaks.push({ type: "CONSTRAINT_LOSS", detail: `T${turnIndex + 1} budget context lost via new search` });
  }

  const pathOk =
    turnSpec.newSearch
      ? trace.responsePathFinal === "default_product_search" || trace.cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH
      : trace.responsePathFinal !== "default_product_search" || familyOk;

  if (!pathOk && !turnSpec.newSearch) {
    leaks.push({ type: "INTENT_DRIFT", detail: `T${turnIndex + 1} path=${trace.responsePathFinal}` });
  }

  if (trace.genericFallback && state.hasAnchor) {
    leaks.push({ type: "CONTEXT_RESET", detail: `T${turnIndex + 1} generic fallback with anchor` });
  }

  const bridgeOk =
    trace.bridge.active ||
    !state.hasAnchor ||
    turnSpec.family !== "COMMERCIAL_SEARCH" ||
    !!trace.cognitiveTurn.signals?.isAnchoredShortFollowUp ||
    !trace.routing.openedNewSearch;
  if (state.hasAnchor && !bridgeOk && turnSpec.preserveWinner) {
    leaks.push({ type: "DECISION_DRIFT", detail: `T${turnIndex + 1} bridge inactive unexpectedly` });
  }

  let userPerception = "SIM";
  if (!familyOk || leaks.some((l) => ["ANCHOR_LOSS", "WINNER_LOSS", "UNNECESSARY_NEW_SEARCH"].includes(l.type))) {
    userPerception = "NÃO";
  } else if (leaks.length) {
    userPerception = "PARCIAL";
  }

  if (convState.establishedWinner && trace.routing.allowReplaceWinner) {
    leaks.push({ type: "RANDOM_PRODUCT_SWITCH", detail: `T${turnIndex + 1} winner switch without explicit recalibration` });
  }

  return {
    turnIndex: turnIndex + 1,
    msg: turnSpec.msg,
    expectedFamily: turnSpec.family,
    actualFamily: trace.actualFamily,
    turnType: trace.cognitiveTurn.turnType,
    responsePath: trace.responsePathFinal,
    routerOk,
    routingOk,
    pathOk,
    anchorOk,
    winnerOk,
    constraintOk,
    bridgeOk,
    userPerception,
    leaks,
    ok: leaks.length === 0,
  };
}

function runConversation(conv) {
  let state = {
    hasAnchor: false,
    winner: null,
    runnerUp: null,
    budgetMax: null,
    priorityAxis: null,
    deprioritized: [],
  };
  const convState = { establishedWinner: null, winnerDrift: false };
  const turnResults = [];

  for (let i = 0; i < conv.turns.length; i++) {
    const turnSpec = conv.turns[i];
    const trace = simulateTurn(turnSpec.msg, state);
    const result = evaluateTurn(i, turnSpec, trace, state, convState);
    turnResults.push(result);
    state = applyTurnToState(state, turnSpec, trace);
    if (state.hasAnchor && state.winner) {
      convState.establishedWinner = state.winner;
    }
  }

  const total = turnResults.length;
  const okTurns = turnResults.filter((r) => r.ok).length;
  const routerAcc = turnResults.filter((r) => r.routerOk).length / total;
  const routingAcc = turnResults.filter((r) => r.routingOk).length / total;
  const pathAcc = turnResults.filter((r) => r.pathOk).length / total;
  const anchorAcc = turnResults.filter((r) => r.anchorOk).length / total;
  const winnerAcc = turnResults.filter((r) => r.winnerOk).length / total;
  const constraintAcc = turnResults.filter((r) => r.constraintOk).length / total;
  const familyAcc = turnResults.filter((r) => r.routerOk).length / total;
  const perceptionSim = turnResults.filter((r) => r.userPerception === "SIM").length / total;

  const allLeaks = turnResults.flatMap((r) => r.leaks.map((l) => ({ ...l, conv: conv.id, turn: r.turnIndex, msg: r.msg })));

  const finalWinnerOk = !convState.establishedWinner || state.winner === convState.establishedWinner;

  return {
    ...conv,
    turnResults,
    okTurns,
    total,
    passRate: okTurns / total,
    routerAcc,
    routingAcc,
    pathAcc,
    anchorAcc,
    winnerAcc,
    constraintAcc,
    familyAcc,
    perceptionSim,
    leaks: allLeaks,
    winnerPreservedEnd: finalWinnerOk,
    finalWinner: state.winner,
  };
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function runRegressions() {
  const scripts = [
    "test-mia-semantic-robustness-audit.js",
    "test-mia-conversational-family-closure-standard.js",
    "test-mia-cross-family-collision-audit.js",
    "test-mia-confidence-challenge-flow-robustness-audit.js",
    "test-mia-social-validation-flow-robustness-audit.js",
    "test-mia-soft-disagreement-flow-robustness-audit.js",
    "test-mia-comprehension-flow-robustness-audit.js",
    "test-mia-greeting-flow-robustness-audit.js",
    "test-mia-acknowledgement-flow-robustness-audit.js",
    "test-mia-antiregret-flow-robustness-revalidation.js",
    "test-mia-constraint-change-flow-robustness-audit.js",
  ];
  const results = [];
  for (const s of scripts) {
    const p = join(ROOT, "scripts", s);
    try {
      const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
      results.push({ script: s, exit: r.status ?? 1, exists: true });
    } catch {
      results.push({ script: s, exit: -1, exists: false });
    }
  }
  return results;
}

export {
  CONVERSATIONS,
  simulateTurn,
  evaluateTurn,
  applyTurnToState,
  runConversation,
};

const __stressMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (__stressMain) {
// ── EXECUTION ──

console.log("PATCH 7.9Z — Conversational Stress Test (15+ turns) — AUDIT ONLY\n");
console.log("HTTP usage: false | Production changes: NONE\n");

const results = CONVERSATIONS.map(runConversation);
const totalTurns = results.reduce((s, r) => s + r.total, 0);
const totalOk = results.reduce((s, r) => s + r.okTurns, 0);
const allLeaks = results.flatMap((r) => r.leaks);

const avg = (key) => results.reduce((s, r) => s + r[key], 0) / results.length;

console.log(`── Suite: ${CONVERSATIONS.length} conversas | ${totalTurns} turns auditados ──\n`);

console.log("── Mapa por tipo ──\n");
for (const type of ["A", "B", "C", "D", "E"]) {
  const rows = results.filter((r) => r.type === type);
  const turns = rows.reduce((s, r) => s + r.total, 0);
  const ok = rows.reduce((s, r) => s + r.okTurns, 0);
  console.log(`  Tipo ${type}: ${rows.length} conversas | ${ok}/${turns} turns ok (${pct(ok, turns)}%)`);
}

console.log("\n── Tabela por camada (média global) ──\n");
console.log(`  Router Accuracy:          ${pct(avg("routerAcc") * 100, 100)}%`);
console.log(`  Routing Accuracy:         ${pct(avg("routingAcc") * 100, 100)}%`);
console.log(`  Response Path Accuracy:   ${pct(avg("pathAcc") * 100, 100)}%`);
console.log(`  Winner Preservation:      ${pct(avg("winnerAcc") * 100, 100)}%`);
console.log(`  Anchor Preservation:      ${pct(avg("anchorAcc") * 100, 100)}%`);
console.log(`  Constraint Preservation:  ${pct(avg("constraintAcc") * 100, 100)}%`);
console.log(`  Family Preservation:      ${pct(avg("familyAcc") * 100, 100)}%`);
console.log(`  User Perception (SIM):    ${pct(avg("perceptionSim") * 100, 100)}%`);

console.log("\n── Amostra de falhas ──\n");
for (const leak of allLeaks.slice(0, 10)) {
  console.log(`  [${leak.conv}/T${leak.turn}] ${leak.type}: ${leak.detail}`);
}

const leakCounts = {};
for (const leak of allLeaks) {
  leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
}

console.log("\n── Leaks por tipo ──\n");
for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}

const clusters = new Map();
for (const leak of allLeaks) {
  const key = `${leak.type}::${leak.detail.split(" got=")[0] || leak.detail}`;
  if (!clusters.has(key)) clusters.set(key, []);
  clusters.get(key).push(`[${leak.conv}/T${leak.turn}]`);
}

console.log("\n── Causa raiz por cluster ──\n");
for (const [key, ex] of [...clusters.entries()].slice(0, 8)) {
  console.log(`  ${key}`);
  console.log(`    Ex.: ${ex.slice(0, 2).join("; ")}`);
}

console.log("\n── Regressões ──\n");
const regressions = runRegressions();
for (const r of regressions) {
  console.log(`  ${r.script}: exit ${r.exit}${r.exists ? "" : " (missing)"}`);
}

const globalPassRate = totalOk / totalTurns;
const winnerEndRate = results.filter((r) => r.winnerPreservedEnd).length / results.length;
const robustThreshold = 0.88;

console.log("\n── Métricas globais ──\n");
console.log(`Turns ok: ${totalOk}/${totalTurns} (${pct(totalOk, totalTurns)}%)`);
console.log(`Conversas com winner preservado no fim: ${results.filter((r) => r.winnerPreservedEnd).length}/${results.length} (${pct(winnerEndRate * results.length, results.length)}%)`);

console.log("\n── Veredito ──\n");
let verdict;
if (globalPassRate >= robustThreshold && avg("anchorAcc") >= 0.92 && avg("winnerAcc") >= 0.92) {
  verdict = "A) CONVERSATIONAL STRESS ROBUST";
  console.log(verdict);
} else {
  verdict = "B) CONVERSATIONAL STRESS POSSUI GAP";
  console.log(verdict);
  console.log(`  Turn pass rate: ${pct(totalOk, totalTurns)}% (meta ≥88%)`);
  console.log(`  Anchor avg: ${pct(avg("anchorAcc") * 100, 100)}% | Winner avg: ${pct(avg("winnerAcc") * 100, 100)}%`);
}

console.log("\n── Próximo patch recomendado ──\n");
if (verdict.startsWith("A")) {
  console.log("PATCH 7.9Z.3 — Conversational Stress Test (30+ mensagens)");
} else {
  const topLeak = Object.entries(leakCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "FAMILY_LOSS";
  console.log(`PATCH 7.9Z.2 — residual cluster: ${topLeak}`);
}

console.log("\nPATCH 7.9Z audit COMPLETE — AUDIT ONLY\n");
process.exit(verdict.startsWith("A") ? 0 : 1);
}
