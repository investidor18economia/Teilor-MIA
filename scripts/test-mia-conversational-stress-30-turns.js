/**
 * PATCH 7.9Z.1 — Conversational Stress Test (30+ turns)
 *
 * Deep audit of long anchored conversations without HTTP or production changes.
 * Reuses the 15+ turn simulation harness; extends metrics and leak taxonomy.
 *
 * Usage: node scripts/test-mia-conversational-stress-30-turns.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  simulateTurn,
  evaluateTurn,
  applyTurnToState,
} from "./test-mia-conversational-stress-15-turns.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function t(msg, family, opts = {}) {
  return { msg, family, ...opts };
}

/** Short-hand for anchored continuity turns */
const P = { preserveWinner: true };
const NS = { newSearch: true, setAnchor: true };

function conv(id, type, name, turns) {
  return { id, type, name, turns };
}

/**
 * 20 conversas × 30+ turnos — linguagem humana, famílias misturadas.
 * Mínimo 600 turns totais.
 */
const CONVERSATIONS = [
  conv("L01", "A", "Celular clássico longo — hesitação e recalibração", [
    t("quero celular ate 2500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2500 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("e bateria?", "COMMERCIAL_SEARCH", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("mostra outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("o pessoal reclama?", "SOCIAL_VALIDATION", P),
    t("agora fiquei na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["ANTI_REGRET"] }),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("agora ate 1800", "CONSTRAINT_CHANGE", { ...P, setBudget: 1800 }),
    t("e se camera importar mais?", "CONSTRAINT_CHANGE", { ...P, axis: "camera" }),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", P),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("detalha melhor", "COMPREHENSION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas ainda to na duvida", "SOFT_DISAGREEMENT", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("prioriza bateria", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("faz sentido agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("acho que vou nele", "DECISION_CONFIRMATION", P),
    t("ok vou confiar", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
  ]),
  conv("L02", "A", "Notebook — prova social densa", [
    t("preciso notebook ate 4000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 4000 }),
    t("me indica", "COMMERCIAL_SEARCH", P),
    t("e desempenho?", "COMMERCIAL_SEARCH", P),
    t("qual vale mais?", "COMMERCIAL_SEARCH", P),
    t("o povo fala bem?", "SOCIAL_VALIDATION", P),
    t("sera que muita gente se arrepende?", "SOCIAL_VALIDATION", P),
    t("voce continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("nao estou convencido", "SOFT_DISAGREEMENT", P),
    t("explica melhor o porque", "COMPREHENSION", P),
    t("entendi agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("quero algo mais em conta", "CONSTRAINT_CHANGE", { ...P, setBudget: 3500 }),
    t("baixar o orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 3200 }),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("tem alternativa?", "ALTERNATIVE_EXPLORATION", P),
    t("gostei", "ACKNOWLEDGEMENT", P),
    t("mas tenho medo de errar", "ANTI_REGRET", P),
    t("da pra ficar tranquilo?", "ANTI_REGRET", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("nao curti muito", "SOFT_DISAGREEMENT", P),
    t("mostra possibilidades parecidas", "ALTERNATIVE_EXPLORATION", P),
    t("pensei melhor no orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 3000 }),
    t("camera importa menos", "CONSTRAINT_CHANGE", { ...P, deprioritize: true, axis: "camera" }),
    t("faz sentido sim", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("voce crava isso?", "CONFIDENCE_CHALLENGE", P),
    t("nao bateu comigo", "SOFT_DISAGREEMENT", P),
    t("me explica de novo", "COMPREHENSION", P),
    t("agora ficou claro", "COMPREHENSION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("vou nesse", "DECISION_CONFIRMATION", P),
    t("beleza", "ACKNOWLEDGEMENT", P),
    t("combinado", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L03", "A", "Smartphone — oscilação decisão longa", [
    t("busco smartphone ate 2000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2000 }),
    t("qual voce indica?", "COMMERCIAL_SEARCH", P),
    t("prioriza bateria", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("tem outra opcao?", "ALTERNATIVE_EXPLORATION", P),
    t("show", "ACKNOWLEDGEMENT", P),
    t("mas nao quero me arrepender", "ANTI_REGRET", P),
    t("quem comprou gostou?", "SOCIAL_VALIDATION", P),
    t("tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("prefiro gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 1800 }),
    t("plano b?", "SECOND_BEST_DISCOVERY", P),
    t("nao sei", "SOFT_DISAGREEMENT", P),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi melhor", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas nao to 100 por cento", "SOFT_DISAGREEMENT", P),
    t("o povo fala bem ou da problema?", "SOCIAL_VALIDATION", P),
    t("voce manteria?", "CONFIDENCE_CHALLENGE", P),
    t("quero ver outro", "ALTERNATIVE_EXPLORATION", P),
    t("ficou caro", "CONSTRAINT_CHANGE", { ...P, setBudget: 1700 }),
    t("preciso baixar mais", "CONSTRAINT_CHANGE", { ...P, setBudget: 1600 }),
    t("qual escolher?", "COMMERCIAL_SEARCH", P),
    t("continua nesse mesmo?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("nao curti", "SOFT_DISAGREEMENT", P),
    t("detalha de novo", "COMPREHENSION", P),
    t("ok entendi a recalibracao", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais seguro agora", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("entao mantem esse?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("blz continua", "ACKNOWLEDGEMENT", P),
    t("fechado", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L04", "A", "TV — eixo câmera/preço longo", [
    t("quero tv ate 3000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 3000 }),
    t("qual o melhor?", "COMMERCIAL_SEARCH", P),
    t("e a tela?", "COMMERCIAL_SEARCH", P),
    t("quero ver outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("perfeito", "ACKNOWLEDGEMENT", P),
    t("tenho medo de errar", "ANTI_REGRET", P),
    t("a maioria aprova?", "SOCIAL_VALIDATION", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("pensei melhor no orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 2600 }),
    t("segunda opcao?", "SECOND_BEST_DISCOVERY", P),
    t("captei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas nao me passou confianca", "SOFT_DISAGREEMENT", P),
    t("explica de outro jeito", "COMPREHENSION", P),
    t("agora sim", "ACKNOWLEDGEMENT", P),
    t("quero gastar menos, mas sem perder muito", "CONSTRAINT_CHANGE", { ...P, setBudget: 2400 }),
    t("desempenho importa menos", "CONSTRAINT_CHANGE", P),
    t("tem outro parecido?", "ALTERNATIVE_EXPLORATION", P),
    t("quem tem passa dor de cabeca?", "SOCIAL_VALIDATION", P),
    t("ainda recomenda?", "CONFIDENCE_CHALLENGE", P),
    t("to meio assim", "SOFT_DISAGREEMENT", P),
    t("baixei o orcamento na cabeca", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("entendi a logica", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("voce compraria?", "CONFIDENCE_CHALLENGE", P),
    t("nao concordo totalmente", "SOFT_DISAGREEMENT", P),
    t("fala mais desse motivo", "COMPREHENSION", P),
    t("saquei a logica", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais calmo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("acho que fechou", "DECISION_CONFIRMATION", P),
    t("manda ver nesse", "DECISION_CONFIRMATION", P),
  ]),
  conv("L05", "B", "CC/SV/CC/SD — maratona intercalada", [
    t("celular ate 2500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2500 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("o pessoal costuma se arrepender?", "SOCIAL_VALIDATION", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", P),
    t("agora bateria importa mais", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("ainda recomenda?", "CONFIDENCE_CHALLENGE", P),
    t("to meio na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["ANTI_REGRET"] }),
    t("quero economizar um pouco", "CONSTRAINT_CHANGE", { ...P, setBudget: 2000 }),
    t("quem comprou gostou?", "SOCIAL_VALIDATION", P),
    t("nao bateu comigo", "SOFT_DISAGREEMENT", P),
    t("ficou caro demais", "CONSTRAINT_CHANGE", { ...P, a: ["SOFT_DISAGREEMENT"], setBudget: 1900 }),
    t("voce manteria?", "CONFIDENCE_CHALLENGE", P),
    t("entendi o raciocinio", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas ainda nao to convencido", "SOFT_DISAGREEMENT", P),
    t("muita gente indica?", "SOCIAL_VALIDATION", P),
    t("continua achando?", "CONFIDENCE_CHALLENGE", P),
    t("e se eu quiser gastar menos sem abrir mao disso?", "CONSTRAINT_CHANGE", { ...P, setBudget: 1850 }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("nao gostei muito", "SOFT_DISAGREEMENT", P),
    t("explica melhor", "COMPREHENSION", P),
    t("faz sentido mas fiquei na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("o povo reclama muito?", "SOCIAL_VALIDATION", P),
    t("crava mesmo?", "CONFIDENCE_CHALLENGE", P),
    t("agora ate 2000", "CONSTRAINT_CHANGE", { ...P, setBudget: 2000 }),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("ok", "ACKNOWLEDGEMENT", P),
    t("beleza entao", "ACKNOWLEDGEMENT", P),
    t("fechou vou pegar", "DECISION_CONFIRMATION", P),
  ]),
  conv("L06", "B", "Notebook — validação + constraint longo", [
    t("notebook ate 5000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 5000 }),
    t("me indica", "COMMERCIAL_SEARCH", P),
    t("quem usa no dia a dia aprova?", "SOCIAL_VALIDATION", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("nao me convenceu", "SOFT_DISAGREEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 4500 }),
    t("tem boa fama?", "SOCIAL_VALIDATION", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("to meio dividido", "SOFT_DISAGREEMENT", P),
    t("e se eu baixar o orcamento?", "CONSTRAINT_CHANGE", { ...P, setBudget: 4200 }),
    t("quem comprou se arrepende?", "SOCIAL_VALIDATION", P),
    t("voce crava?", "CONFIDENCE_CHALLENGE", P),
    t("nao senti firmeza", "SOFT_DISAGREEMENT", P),
    t("trabalho virou foco", "CONSTRAINT_CHANGE", P),
    t("tem outra opcao?", "ALTERNATIVE_EXPLORATION", P),
    t("a galera gosta?", "SOCIAL_VALIDATION", P),
    t("sustenta essa escolha?", "CONFIDENCE_CHALLENGE", P),
    t("pe atras", "SOFT_DISAGREEMENT", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas nao to 100 por cento", "SOFT_DISAGREEMENT", P),
    t("o pessoal fala bem?", "SOCIAL_VALIDATION", P),
    t("voce iria nele?", "CONFIDENCE_CHALLENGE", P),
    t("quero algo mais barato", "CONSTRAINT_CHANGE", { ...P, setBudget: 4000 }),
    t("plano b mais barato?", "SECOND_BEST_DISCOVERY", P),
    t("faz sentido agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("nao quero dor de cabeca", "ANTI_REGRET", P),
    t("parece ser esse", "DECISION_CONFIRMATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("entao vou nesse", "DECISION_CONFIRMATION", P),
    t("certo", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L07", "B", "Mouse gamer — CC denso", [
    t("quero mouse gamer ate 300", "COMMERCIAL_SEARCH", { ...NS, setBudget: 300 }),
    t("recomenda", "COMMERCIAL_SEARCH", P),
    t("ficou caro", "CONSTRAINT_CHANGE", { ...P, setBudget: 250 }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("o pessoal gosta?", "SOCIAL_VALIDATION", P),
    t("voce mantem?", "CONFIDENCE_CHALLENGE", P),
    t("nao me ganhou", "SOFT_DISAGREEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 220 }),
    t("quem comprou gostou?", "SOCIAL_VALIDATION", P),
    t("tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("to meio assim", "SOFT_DISAGREEMENT", P),
    t("ate 200 agora", "CONSTRAINT_CHANGE", { ...P, setBudget: 200 }),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas ainda to na duvida", "SOFT_DISAGREEMENT", P),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("nao curti muito", "SOFT_DISAGREEMENT", P),
    t("mostra alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("quero economizar", "CONSTRAINT_CHANGE", { ...P, setBudget: 180 }),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("tenho medo de errar", "ANTI_REGRET", P),
    t("voce sustenta ou eu erro?", "CONFIDENCE_CHALLENGE", { ...P, a: ["ANTI_REGRET"] }),
    t("detalha melhor", "COMPREHENSION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("vou ficar com esse", "DECISION_CONFIRMATION", P),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("fechou", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L08", "B", "Monitor — SV/CC alternado", [
    t("monitor ate 1500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 1500 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("o povo fala bem?", "SOCIAL_VALIDATION", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 1300 }),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", P),
    t("agora qualidade pesa mais", "CONSTRAINT_CHANGE", P),
    t("quem tem costuma gostar?", "SOCIAL_VALIDATION", P),
    t("ainda acha melhor?", "CONFIDENCE_CHALLENGE", P),
    t("to na duvida", "SOFT_DISAGREEMENT", P),
    t("e agora ate 1200", "CONSTRAINT_CHANGE", { ...P, setBudget: 1200 }),
    t("tem alternativa?", "ALTERNATIVE_EXPLORATION", P),
    t("muita gente reclama?", "SOCIAL_VALIDATION", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("nao bateu comigo", "SOFT_DISAGREEMENT", P),
    t("explica melhor o porque", "COMPREHENSION", P),
    t("entendi agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas nao to convencido", "SOFT_DISAGREEMENT", P),
    t("a galera indica?", "SOCIAL_VALIDATION", P),
    t("voce crava isso?", "CONFIDENCE_CHALLENGE", P),
    t("preciso baixar mais", "CONSTRAINT_CHANGE", { ...P, setBudget: 1100 }),
    t("segundo colocado?", "SECOND_BEST_DISCOVERY", P),
    t("faz sentido sim", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    t("me explica melhor esse ponto", "COMPREHENSION", P),
    t("agora ficou claro", "COMPREHENSION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("ok vou confiar", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("show", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L09", "C", "Prefixos conversacionais — maratona", [
    t("celular ate 2000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2000 }),
    t("me recomenda", "COMMERCIAL_SEARCH", P),
    t("oi, e bateria?", "COMMERCIAL_SEARCH", { ...P, a: ["GREETING"] }),
    t("certo", "ACKNOWLEDGEMENT", P),
    t("nao entendi direito", "COMPREHENSION", P),
    t("fala mia, voce tem certeza?", "CONFIDENCE_CHALLENGE", { ...P, a: ["GREETING"] }),
    t("beleza entao", "ACKNOWLEDGEMENT", P),
    t("faz sentido mas tenho receio", "ANTI_REGRET", { ...P, a: ["COMPREHENSION"] }),
    t("combinado", "ACKNOWLEDGEMENT", P),
    t("entendi, mas quero gastar menos", "CONSTRAINT_CHANGE", { ...P, a: ["COMPREHENSION"], setBudget: 1800 }),
    t("show, continua", "ACKNOWLEDGEMENT", P),
    t("como assim?", "COMPREHENSION", P),
    t("salve, tem outro?", "ALTERNATIVE_EXPLORATION", { ...P, a: ["GREETING"] }),
    t("fechado", "ACKNOWLEDGEMENT", P),
    t("agora ficou claro", "COMPREHENSION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("bom dia, o pessoal gosta?", "SOCIAL_VALIDATION", { ...P, a: ["GREETING"] }),
    t("ta", "ACKNOWLEDGEMENT", P),
    t("explica de novo", "COMPREHENSION", P),
    t("saquei agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("entendi, mas ainda to na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("o povo fala bem?", "SOCIAL_VALIDATION", P),
    t("detalha de novo", "COMPREHENSION", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("valeu", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L10", "C", "Ack/comp loop extenso", [
    t("notebook ate 3500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 3500 }),
    t("qual voce indica?", "COMMERCIAL_SEARCH", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("ok", "ACKNOWLEDGEMENT", P),
    t("nao peguei a parte do preco", "COMPREHENSION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("bom dia, quero gastar menos", "CONSTRAINT_CHANGE", { ...P, a: ["GREETING"], setBudget: 3000 }),
    t("perfeito", "ACKNOWLEDGEMENT", P),
    t("entendi, mas o povo fala bem?", "SOCIAL_VALIDATION", { ...P, a: ["COMPREHENSION"] }),
    t("beleza", "ACKNOWLEDGEMENT", P),
    t("explica melhor", "COMPREHENSION", P),
    t("captei", "ACKNOWLEDGEMENT", P),
    t("mas nao me convenceu", "SOFT_DISAGREEMENT", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("entendi melhor agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("quero algo mais barato", "CONSTRAINT_CHANGE", { ...P, setBudget: 2800 }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("nao entendi direito", "COMPREHENSION", P),
    t("agora entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("to meio na duvida", "SOFT_DISAGREEMENT", P),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("me explica de novo", "COMPREHENSION", P),
    t("faz sentido agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("nao quero errar", "ANTI_REGRET", P),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("blz continua", "ACKNOWLEDGEMENT", P),
    t("fechou nele", "DECISION_CONFIRMATION", P),
    t("otimo", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L11", "C", "Greeting + follow-up longo", [
    t("oi, quero celular ate 2500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2500, a: ["GREETING"] }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("e ai, e camera?", "COMMERCIAL_SEARCH", { ...P, a: ["GREETING"] }),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("nao entendi", "COMPREHENSION", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("salve, tem outro?", "ALTERNATIVE_EXPLORATION", { ...P, a: ["GREETING"] }),
    t("show", "ACKNOWLEDGEMENT", P),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("o pessoal gosta?", "SOCIAL_VALIDATION", P),
    t("voce continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("nao curti", "SOFT_DISAGREEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("agora ate 2000", "CONSTRAINT_CHANGE", { ...P, setBudget: 2000 }),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas nao to convencido", "SOFT_DISAGREEMENT", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("detalha melhor", "COMPREHENSION", P),
    t("saquei a logica", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("e se camera importar mais?", "CONSTRAINT_CHANGE", P),
    t("tem alternativa?", "ALTERNATIVE_EXPLORATION", P),
    t("a galera gosta?", "SOCIAL_VALIDATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("to mais seguro", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("ok vou confiar", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("fechado", "ACKNOWLEDGEMENT", P),
    t("demorou", "ACKNOWLEDGEMENT", P),
    t("valeu", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L12", "C", "Compostos cross-family densos", [
    t("smartphone ate 2800", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2800 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("gostei, mas ainda to na duvida", "SOFT_DISAGREEMENT", P),
    t("faz sentido mas tenho receio", "ANTI_REGRET", { ...P, a: ["COMPREHENSION"] }),
    t("entendi, mas quero gastar menos", "CONSTRAINT_CHANGE", { ...P, a: ["COMPREHENSION"], setBudget: 2500 }),
    t("nao me convenceu, voce tem certeza?", "CONFIDENCE_CHALLENGE", { ...P, a: ["SOFT_DISAGREEMENT"] }),
    t("faz sentido mas fiquei na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("entendi, mas o povo fala bem?", "SOCIAL_VALIDATION", { ...P, a: ["COMPREHENSION"] }),
    t("beleza, to mais calmo", "ACKNOWLEDGEMENT", { ...P, a: ["ANTI_REGRET"] }),
    t("parece bom mas nao to 100 por cento", "SOFT_DISAGREEMENT", P),
    t("explica melhor o porque", "COMPREHENSION", P),
    t("ok entendi a recalibracao", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("quero gastar menos, tem outro?", "ALTERNATIVE_EXPLORATION", { ...P, a: ["CONSTRAINT_CHANGE"], setBudget: 2300 }),
    t("o povo fala bem ou da problema?", "SOCIAL_VALIDATION", P),
    t("voce sustenta ou eu erro?", "CONFIDENCE_CHALLENGE", { ...P, a: ["ANTI_REGRET"] }),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("se eu baixar o orcamento quem fica melhor?", "SECOND_BEST_DISCOVERY", { ...P, a: ["CONSTRAINT_CHANGE"] }),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("nao curti muito", "SOFT_DISAGREEMENT", P),
    t("mostra outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("agora bateria pesa mais", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("quem comprou gostou?", "SOCIAL_VALIDATION", P),
    t("detalha de novo", "COMPREHENSION", P),
    t("faz sentido sim", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("entao mantem esse?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("certo", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L13", "D", "Anti-regret + CC alternado longo", [
    t("celular ate 2500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2500 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("tenho medo de errar", "ANTI_REGRET", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("e agora ate 2000", "CONSTRAINT_CHANGE", { ...P, setBudget: 2000 }),
    t("sera que vou me arrepender?", "ANTI_REGRET", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("quero evitar dor de cabeca", "ANTI_REGRET", P),
    t("preciso baixar mais", "CONSTRAINT_CHANGE", { ...P, setBudget: 1800 }),
    t("to cabreiro", "ANTI_REGRET", P),
    t("o pessoal reclama?", "SOCIAL_VALIDATION", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("nao to convencido", "SOFT_DISAGREEMENT", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas ainda to na duvida", "SOFT_DISAGREEMENT", P),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("nao quero fazer besteira", "ANTI_REGRET", P),
    t("quero algo mais barato", "CONSTRAINT_CHANGE", { ...P, setBudget: 1700 }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("faz sentido agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("me explica de novo", "COMPREHENSION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("acho que vou nele", "DECISION_CONFIRMATION", P),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
  ]),
  conv("L14", "D", "Second best + AE maratona", [
    t("notebook ate 4500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 4500 }),
    t("indica um", "COMMERCIAL_SEARCH", P),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("plano b?", "SECOND_BEST_DISCOVERY", P),
    t("mostra alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 4000 }),
    t("segunda opcao mais barata?", "SECOND_BEST_DISCOVERY", P),
    t("nao me convenceu", "SOFT_DISAGREEMENT", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("se eu nao pegar esse qual voce indicaria?", "ALTERNATIVE_EXPLORATION", P),
    t("o povo fala bem?", "SOCIAL_VALIDATION", P),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("baixar o orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 3800 }),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("tem algum parecido?", "ALTERNATIVE_EXPLORATION", P),
    t("nao curti", "SOFT_DISAGREEMENT", P),
    t("a galera gosta?", "SOCIAL_VALIDATION", P),
    t("voce crava?", "CONFIDENCE_CHALLENGE", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("tenho medo de errar", "ANTI_REGRET", P),
    t("agora ate 3500", "CONSTRAINT_CHANGE", { ...P, setBudget: 3500 }),
    t("qual escolher?", "COMMERCIAL_SEARCH", P),
    t("continua nesse mesmo?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("parece ser esse", "DECISION_CONFIRMATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("to mais seguro agora", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("vou nele", "DECISION_CONFIRMATION", P),
    t("blz", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L15", "D", "Decision confirmation oscilante", [
    t("celular ate 2500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2500 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("nao sei", "SOFT_DISAGREEMENT", P),
    t("vou nele", "DECISION_CONFIRMATION", P),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("acho que vou nele", "DECISION_CONFIRMATION", P),
    t("mas nao to convencido", "SOFT_DISAGREEMENT", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("o pessoal gosta?", "SOCIAL_VALIDATION", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("faz sentido agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to inclinado a pegar esse", "DECISION_CONFIRMATION", P),
    t("nao curti muito", "SOFT_DISAGREEMENT", P),
    t("detalha melhor", "COMPREHENSION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("entao vou nesse", "DECISION_CONFIRMATION", P),
    t("espera ai", "SOFT_DISAGREEMENT", P),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("faz sentido sim", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("ok vou confiar", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("fechou nele", "DECISION_CONFIRMATION", P),
    t("perfeito", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L16", "D", "Constraint recalibração profunda", [
    t("smartphone ate 3000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 3000 }),
    t("recomenda", "COMMERCIAL_SEARCH", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2700 }),
    t("prioriza bateria", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("agora camera pesa mais", "CONSTRAINT_CHANGE", { ...P, axis: "camera" }),
    t("e agora ate 2500", "CONSTRAINT_CHANGE", { ...P, setBudget: 2500 }),
    t("camera importa menos", "CONSTRAINT_CHANGE", { ...P, deprioritize: true, axis: "camera" }),
    t("trabalho virou foco", "CONSTRAINT_CHANGE", P),
    t("quero algo mais barato, mas ainda bom", "CONSTRAINT_CHANGE", { ...P, setBudget: 2300 }),
    t("baixei o orcamento na cabeca", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("e se eu quiser mais autonomia?", "CONSTRAINT_CHANGE", P),
    t("ate 2000 agora", "CONSTRAINT_CHANGE", { ...P, setBudget: 2000 }),
    t("voce continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("nao me convenceu", "SOFT_DISAGREEMENT", P),
    t("o povo fala bem?", "SOCIAL_VALIDATION", P),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("nao quero errar", "ANTI_REGRET", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("entao mantem esse?", "CONFIDENCE_CHALLENGE", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("show", "ACKNOWLEDGEMENT", P),
    t("certo", "ACKNOWLEDGEMENT", P),
    t("combinado", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L17", "E", "Oscilação emocional longa", [
    t("smartphone ate 2000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2000 }),
    t("me recomenda", "COMMERCIAL_SEARCH", P),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("nao sei", "SOFT_DISAGREEMENT", P),
    t("por que esse?", "COMPREHENSION", { ...P, a: ["COMMERCIAL_SEARCH"] }),
    t("nao ficou claro", "COMPREHENSION", P),
    t("faz sentido agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas nao me ganhou", "SOFT_DISAGREEMENT", P),
    t("voce compraria?", "CONFIDENCE_CHALLENGE", P),
    t("vou nele", "DECISION_CONFIRMATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("quero ver alternativas", "ALTERNATIVE_EXPLORATION", P),
    t("ficou caro", "CONSTRAINT_CHANGE", { ...P, setBudget: 1800 }),
    t("explica de outro jeito", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais seguro agora", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("o pessoal gosta?", "SOCIAL_VALIDATION", P),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("nao curti", "SOFT_DISAGREEMENT", P),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 1700 }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("voce crava?", "CONFIDENCE_CHALLENGE", P),
    t("faz sentido sim", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("detalha de novo", "COMPREHENSION", P),
    t("ok vou confiar", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
  ]),
  conv("L18", "E", "Muda ideia + prova + recalibra longo", [
    t("notebook ate 5000", "COMMERCIAL_SEARCH", { ...NS, setBudget: 5000 }),
    t("qual voce indica?", "COMMERCIAL_SEARCH", P),
    t("gostei", "ACKNOWLEDGEMENT", P),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 4200 }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("nao curti", "SOFT_DISAGREEMENT", P),
    t("quem comprou gostou?", "SOCIAL_VALIDATION", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("mas nao quero dor de cabeca", "ANTI_REGRET", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("explica melhor", "COMPREHENSION", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("pensei melhor no orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 3800 }),
    t("qual ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("entendi agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("nao to convencido", "SOFT_DISAGREEMENT", P),
    t("o povo fala bem?", "SOCIAL_VALIDATION", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("baixar o orcamento", "CONSTRAINT_CHANGE", { ...P, setBudget: 3500 }),
    t("tem alternativa?", "ALTERNATIVE_EXPLORATION", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("detalha melhor", "COMPREHENSION", P),
    t("saquei a logica", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece bom", "ACKNOWLEDGEMENT", { ...P, a: ["DECISION_CONFIRMATION"] }),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("entao vou nesse", "DECISION_CONFIRMATION", P),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("certo", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L19", "E", "Cross-family extremo 32 turnos", [
    t("celular ate 2800", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2800 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("oi, e bateria?", "COMMERCIAL_SEARCH", { ...P, a: ["GREETING"] }),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("o pessoal reclama?", "SOCIAL_VALIDATION", P),
    t("agora fiquei na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["ANTI_REGRET"] }),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2500 }),
    t("agora ate 1800", "CONSTRAINT_CHANGE", { ...P, setBudget: 1800 }),
    t("mostra outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", P),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("e se camera importar mais?", "CONSTRAINT_CHANGE", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas nao to 100 por cento", "SOFT_DISAGREEMENT", P),
    t("voce sustenta ou eu erro?", "CONFIDENCE_CHALLENGE", { ...P, a: ["ANTI_REGRET"] }),
    t("detalha de novo", "COMPREHENSION", P),
    t("ok entendi a recalibracao", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("parece que e esse", "DECISION_CONFIRMATION", P),
    t("nao, espera", "SOFT_DISAGREEMENT", P),
    t("se eu nao pegar esse qual voce indicaria?", "ALTERNATIVE_EXPLORATION", P),
    t("continua valendo?", "CONFIDENCE_CHALLENGE", P),
    t("faz sentido sim", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("ok vou confiar", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("fechou nele", "DECISION_CONFIRMATION", P),
    t("valeu", "ACKNOWLEDGEMENT", P),
  ]),
  conv("L20", "E", "Maratona final — todas famílias", [
    t("quero celular ate 2500", "COMMERCIAL_SEARCH", { ...NS, setBudget: 2500 }),
    t("qual recomenda?", "COMMERCIAL_SEARCH", P),
    t("e bateria?", "COMMERCIAL_SEARCH", P),
    t("faz sentido", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("continua recomendando?", "CONFIDENCE_CHALLENGE", P),
    t("mostra outra opcao", "ALTERNATIVE_EXPLORATION", P),
    t("nao quero me arrepender", "ANTI_REGRET", P),
    t("o pessoal reclama?", "SOCIAL_VALIDATION", P),
    t("agora fiquei na duvida", "SOFT_DISAGREEMENT", { ...P, a: ["ANTI_REGRET"] }),
    t("explica melhor", "COMPREHENSION", P),
    t("entendi", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("blz", "ACKNOWLEDGEMENT", P),
    t("quero gastar menos", "CONSTRAINT_CHANGE", { ...P, setBudget: 2200 }),
    t("agora ate 1800", "CONSTRAINT_CHANGE", { ...P, setBudget: 1800 }),
    t("e se camera importar mais?", "CONSTRAINT_CHANGE", P),
    t("quem ficou em segundo?", "SECOND_BEST_DISCOVERY", P),
    t("voce tem certeza?", "CONFIDENCE_CHALLENGE", P),
    t("nao me convenceu totalmente", "SOFT_DISAGREEMENT", P),
    t("a galera recomenda?", "SOCIAL_VALIDATION", P),
    t("detalha melhor", "COMPREHENSION", P),
    t("saquei", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("mas ainda to na duvida", "SOFT_DISAGREEMENT", P),
    t("voce sustenta?", "CONFIDENCE_CHALLENGE", P),
    t("prioriza bateria", "CONSTRAINT_CHANGE", { ...P, axis: "bateria" }),
    t("tem outro?", "ALTERNATIVE_EXPLORATION", P),
    t("nao, perai", "SOFT_DISAGREEMENT", P),
    t("faz sentido agora", "ACKNOWLEDGEMENT", { ...P, a: ["COMPREHENSION"] }),
    t("to mais tranquilo", "ANTI_REGRET", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("acho que vou nele", "DECISION_CONFIRMATION", P),
    t("ok vou confiar", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("fechou", "DECISION_CONFIRMATION", { ...P, a: ["ACKNOWLEDGEMENT"] }),
    t("perfeito", "ACKNOWLEDGEMENT", P),
    t("demorou", "ACKNOWLEDGEMENT", P),
  ]),
];

function evaluateTurnExtended(turnIndex, turnSpec, trace, state, convState) {
  const base = evaluateTurn(turnIndex, turnSpec, trace, state, convState);
  const leaks = [...base.leaks];
  const tNum = turnIndex + 1;

  if (!base.routerOk && base.routingOk) {
    leaks.push({ type: "ROUTER_LEAK", detail: `T${tNum} router miss routing pass` });
  }
  if (base.routerOk && !base.routingOk) {
    leaks.push({ type: "ROUTING_LEAK", detail: `T${tNum} router ok routing fail` });
  }
  if (!base.pathOk && !leaks.some((l) => l.type === "INTENT_DRIFT")) {
    leaks.push({ type: "RESPONSE_PATH_LEAK", detail: `T${tNum} path=${trace.responsePathFinal}` });
  }
  if (
    trace.genericFallback &&
    state.hasAnchor &&
    turnSpec.preserveWinner &&
    !leaks.some((l) => l.type === "CONTEXT_RESET")
  ) {
    leaks.push({ type: "VERBALIZATION_LEAK", detail: `T${tNum} generic fallback verbalization` });
  }

  const contextOk =
    !leaks.some((l) => ["CONTEXT_RESET", "ANCHOR_LOSS", "CONSTRAINT_LOSS"].includes(l.type)) &&
    base.anchorOk &&
    base.constraintOk;

  const continuityOk =
    contextOk &&
    !leaks.some((l) => l.type === "UNNECESSARY_NEW_SEARCH") &&
    base.bridgeOk;

  let contractOk = base.routingOk && base.pathOk && trace.routing.shouldPreserveAnchor !== false;
  if (turnSpec.preserveWinner && trace.routing.mode === "new_search") contractOk = false;

  let responseBuilderOk = base.pathOk && !trace.genericFallback;
  if (turnSpec.newSearch) responseBuilderOk = trace.responsePathFinal === "default_product_search";

  let userPerception = base.userPerception;
  if (leaks.some((l) => ["ANCHOR_LOSS", "WINNER_LOSS", "UNNECESSARY_NEW_SEARCH", "VERBALIZATION_LEAK"].includes(l.type))) {
    userPerception = "NÃO";
  } else if (leaks.length) {
    userPerception = "PARCIAL";
  }

  const fullStackOk =
    base.routerOk &&
    base.routingOk &&
    contractOk &&
    responseBuilderOk &&
    continuityOk &&
    userPerception === "SIM";

  return {
    ...base,
    leaks,
    contextOk,
    continuityOk,
    contractOk,
    responseBuilderOk,
    fullStackOk,
    userPerception,
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
    const result = evaluateTurnExtended(i, turnSpec, trace, state, convState);
    turnResults.push(result);
    state = applyTurnToState(state, turnSpec, trace);
    if (state.hasAnchor && state.winner) convState.establishedWinner = state.winner;
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
  const contextAcc = turnResults.filter((r) => r.contextOk).length / total;
  const continuityAcc = turnResults.filter((r) => r.continuityOk).length / total;
  const contractAcc = turnResults.filter((r) => r.contractOk).length / total;
  const responseBuilderAcc = turnResults.filter((r) => r.responseBuilderOk).length / total;
  const fullStackAcc = turnResults.filter((r) => r.fullStackOk).length / total;
  const perceptionSim = turnResults.filter((r) => r.userPerception === "SIM").length / total;
  const perceptionParcial = turnResults.filter((r) => r.userPerception === "PARCIAL").length / total;
  const perceptionNao = turnResults.filter((r) => r.userPerception === "NÃO").length / total;

  const allLeaks = turnResults.flatMap((r) =>
    r.leaks.map((l) => ({ ...l, conv: conv.id, turn: r.turnIndex, msg: r.msg }))
  );

  let convPerception = "SIM";
  if (perceptionNao > 0 || !turnResults.every((r) => r.winnerOk && r.anchorOk)) {
    convPerception = "NÃO";
  } else if (perceptionParcial > 0 || okTurns < total) {
    convPerception = "PARCIAL";
  }

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
    contextAcc,
    continuityAcc,
    contractAcc,
    responseBuilderAcc,
    fullStackAcc,
    perceptionSim,
    perceptionParcial,
    perceptionNao,
    convPerception,
    leaks: allLeaks,
    winnerPreservedEnd: !convState.establishedWinner || state.winner === convState.establishedWinner,
    finalWinner: state.winner,
  };
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function runRegressions() {
  const scripts = [
    "test-mia-conversational-stress-15-turns.js",
    "test-mia-conversational-stress-residual-cleanup.js",
    "test-mia-conversational-continuity-fix.js",
    "test-mia-conversational-family-routing-stress-harness.js",
    "test-mia-cross-family-collision-audit.js",
    "test-mia-semantic-robustness-audit.js",
    "test-mia-conversational-family-closure-standard.js",
  ];
  const results = [];
  for (const s of scripts) {
    const p = join(ROOT, "scripts", s);
    try {
      const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
      results.push({ script: s, exit: r.status ?? 1, exists: true });
    } catch {
      results.push({ script: s, exit: -1, exists: false });
    }
  }
  return results;
}

// ── EXECUTION ──

console.log("PATCH 7.9Z.1 — Conversational Stress Test (30+ turns) — AUDIT ONLY\n");
console.log("HTTP usage: false | Production changes: NONE\n");

const minTurns = CONVERSATIONS.reduce((s, c) => s + c.turns.length, 0);
const minPerConv = Math.min(...CONVERSATIONS.map((c) => c.turns.length));
if (CONVERSATIONS.length < 20 || minTurns < 600 || minPerConv < 30) {
  console.error(`Suite inválida: ${CONVERSATIONS.length} conversas, ${minTurns} turns, min/conv=${minPerConv}`);
  process.exit(2);
}

const results = CONVERSATIONS.map(runConversation);
const totalTurns = results.reduce((s, r) => s + r.total, 0);
const totalOk = results.reduce((s, r) => s + r.okTurns, 0);
const allLeaks = results.flatMap((r) => r.leaks);
const avg = (key) => results.reduce((s, r) => s + r[key], 0) / results.length;

console.log("── 1. Arquivos criados ──\n");
console.log("  scripts/test-mia-conversational-stress-30-turns.js (este audit)\n");

console.log("── 2. Mapa real do fluxo ──\n");
console.log("  Router → Bridge → Routing Safety → Routing Contract → Response Path → Percepção");
console.log(`  ${CONVERSATIONS.length} conversas | ${totalTurns} turns | ${minPerConv}–${Math.max(...CONVERSATIONS.map((c) => c.turns.length))} turnos/conversa\n`);

console.log("── 3. Métricas por camada (média global) ──\n");
console.log(`  Router Accuracy:            ${pct(avg("routerAcc") * 100, 100)}%`);
console.log(`  Routing Accuracy:           ${pct(avg("routingAcc") * 100, 100)}%`);
console.log(`  Response Path Accuracy:     ${pct(avg("pathAcc") * 100, 100)}%`);
console.log(`  Family Preservation:        ${pct(avg("familyAcc") * 100, 100)}%`);
console.log(`  Constraint Preservation:    ${pct(avg("constraintAcc") * 100, 100)}%`);
console.log(`  Context Preservation:       ${pct(avg("contextAcc") * 100, 100)}%`);
console.log(`  Winner Preservation:        ${pct(avg("winnerAcc") * 100, 100)}%`);
console.log(`  Anchor Preservation:        ${pct(avg("anchorAcc") * 100, 100)}%`);
console.log(`  Continuity Preservation:    ${pct(avg("continuityAcc") * 100, 100)}%`);
console.log(`  Contract (routing hold):    ${pct(avg("contractAcc") * 100, 100)}%`);
console.log(`  Response Builder:           ${pct(avg("responseBuilderAcc") * 100, 100)}%`);
console.log(`  Full Stack (Regra 17):      ${pct(avg("fullStackAcc") * 100, 100)}%`);
console.log(`  User Perception SIM:        ${pct(avg("perceptionSim") * 100, 100)}%`);

console.log("\n── 4. Métricas por conversa ──\n");
for (const r of results) {
  console.log(
    `  [${r.id}] ${r.name}: ${r.okTurns}/${r.total} (${pct(r.okTurns, r.total)}%) | percepção=${r.convPerception} | winnerFim=${r.winnerPreservedEnd ? "ok" : "LOSS"}`
  );
}

console.log("\n── 5–7. Preservação global ──\n");
console.log(`  Winner Preservation:     ${pct(avg("winnerAcc") * 100, 100)}%`);
console.log(`  Anchor Preservation:     ${pct(avg("anchorAcc") * 100, 100)}%`);
console.log(`  Constraint Preservation: ${pct(avg("constraintAcc") * 100, 100)}%`);
console.log(`  Turns ok:                ${totalOk}/${totalTurns} (${pct(totalOk, totalTurns)}%)`);

const leakCounts = {};
for (const leak of allLeaks) {
  leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
}

console.log("\n── 8. Lista completa de leaks ──\n");
if (!allLeaks.length) {
  console.log("  (nenhum leak detectado)");
} else {
  for (const leak of allLeaks) {
    console.log(`  [${leak.conv}/T${leak.turn}] ${leak.type}: ${leak.detail} | "${leak.msg}"`);
  }
}

console.log("\n── Leaks por tipo ──\n");
if (!Object.keys(leakCounts).length) {
  console.log("  (nenhum)");
} else {
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

const clusters = new Map();
for (const leak of allLeaks) {
  const key = `${leak.type}::${leak.detail.split(" got=")[0] || leak.detail}`;
  if (!clusters.has(key)) clusters.set(key, []);
  clusters.get(key).push(`[${leak.conv}/T${leak.turn}]`);
}

console.log("\n── 9. Causa raiz por cluster ──\n");
if (!clusters.size) {
  console.log("  (nenhum cluster — suite limpa)");
} else {
  for (const [key, ex] of clusters.entries()) {
    console.log(`  ${key}`);
    console.log(`    Ex.: ${ex.slice(0, 3).join("; ")}${ex.length > 3 ? ` (+${ex.length - 3})` : ""}`);
  }
}

console.log("\n── 10. Regressões ──\n");
const regressions = runRegressions();
for (const r of regressions) {
  console.log(`  ${r.script}: exit ${r.exit}${r.exists ? "" : " (missing)"}`);
}

const simConvs = results.filter((r) => r.convPerception === "SIM").length;
const parcialConvs = results.filter((r) => r.convPerception === "PARCIAL").length;
const naoConvs = results.filter((r) => r.convPerception === "NÃO").length;

console.log("\n── Percepção por conversa (Regra 17) ──\n");
console.log(`  SIM: ${simConvs}/${results.length} | PARCIAL: ${parcialConvs} | NÃO: ${naoConvs}`);

console.log("\n── 11. Veredito final ──\n");
const robustThreshold = 0.92;
const globalPassRate = totalOk / totalTurns;
let verdict;

if (
  globalPassRate >= robustThreshold &&
  avg("anchorAcc") >= 0.95 &&
  avg("winnerAcc") >= 0.95 &&
  avg("fullStackAcc") >= 0.90 &&
  naoConvs === 0
) {
  verdict = "A) CONVERSATIONAL STRESS 30+ FULL STACK ROBUST";
} else {
  verdict = "B) CONVERSATIONAL STRESS 30+ POSSUI GAP";
}

console.log(verdict);
if (verdict.startsWith("B")) {
  console.log(`  Turn pass: ${pct(totalOk, totalTurns)}% | Full stack: ${pct(avg("fullStackAcc") * 100, 100)}%`);
  console.log(`  Conversas NÃO: ${naoConvs} | PARCIAL: ${parcialConvs}`);
}

console.log("\nPATCH 7.9Z.1 audit COMPLETE — AUDIT ONLY\n");
process.exit(verdict.startsWith("A") ? 0 : 1);
