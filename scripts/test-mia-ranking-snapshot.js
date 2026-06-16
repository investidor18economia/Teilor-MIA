/**
 * PATCH 7.4 — Formal Ranking Snapshot Persistence
 * Structural tests for buildRankingSnapshot and its governance in
 * applyContractToSessionContext.
 *
 * Groups:
 *   1 — Snapshot básico (serialização, rank, score, winner flag)
 *   2 — Preservação (turns contextuais não substituem snapshot)
 *   3 — Atualização autorizada (nova busca / allowReplaceWinner)
 *   4 — Invariantes (sem rank duplicado, winner único, snapshot vazio ok)
 *   5 — Top N (slice correto, sem invenção quando lista curta)
 *
 * Usage: node scripts/test-mia-ranking-snapshot.js
 */

import {
  buildRankingSnapshot,
  applyContractToSessionContext,
} from "../lib/miaRoutingGuardrails.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (!condition) {
    console.error("FAIL:", label);
    failed++;
  } else {
    console.log("OK  :", label);
    passed++;
  }
}

function section(title) {
  console.log("\n──", title, "──");
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const P1 = {
  product_name: "Galaxy S24 FE",
  price: "R$ 2.499",
  link: "https://example.com/s24fe",
  thumbnail: "https://img.example.com/s24fe.jpg",
  source: "Magalu",
  finalScoreEngineScore: 823.4
};

const P2 = {
  product_name: "Poco F4 GT",
  price: "R$ 1.799",
  link: "https://example.com/f4gt",
  thumbnail: null,
  source: "KaBuM",
  finalScoreEngineScore: 802.1
};

const P3 = {
  product_name: "Motorola Edge 50 Neo",
  price: "R$ 1.599",
  link: "https://example.com/edge50",
  thumbnail: null,
  source: "Amazon",
  score: 775.5   // uses generic score field (no finalScoreEngineScore)
};

const P4 = {
  product_name: "Moto G85",
  price: "R$ 1.299",
  link: null,
  thumbnail: null,
  source: null
  // no score field at all
};

const WINNER = P1;
const NEW_WINNER = P2;

// ─────────────────────────────────────────────────────────────
// Grupo 1 — Snapshot básico
// ─────────────────────────────────────────────────────────────

section("Grupo 1 — Snapshot básico");

const snap3 = buildRankingSnapshot([P1, P2, P3], WINNER);

assert(
  "3 produtos geram ranks 1, 2, 3",
  snap3.length === 3 &&
    snap3[0].rank === 1 &&
    snap3[1].rank === 2 &&
    snap3[2].rank === 3
);

assert(
  "winner fica em rank 1",
  snap3[0].product_name === "Galaxy S24 FE" && snap3[0].isWinner === true
);

assert(
  "runner-up fica em rank 2 sem isWinner",
  snap3[1].product_name === "Poco F4 GT" && snap3[1].isWinner === false
);

assert(
  "terceiro lugar fica em rank 3 sem isWinner",
  snap3[2].product_name === "Motorola Edge 50 Neo" && snap3[2].isWinner === false
);

assert(
  "score preservado via finalScoreEngineScore (P1)",
  snap3[0].score === 823.4
);

assert(
  "score preservado via finalScoreEngineScore (P2)",
  snap3[1].score === 802.1
);

assert(
  "score preservado via campo score genérico (P3)",
  snap3[2].score === 775.5
);

assert(
  "score vira null quando não existe (P4)",
  buildRankingSnapshot([P4], P4)[0].score === null
);

assert(
  "preço preservado",
  snap3[0].price === "R$ 2.499"
);

assert(
  "fonte preservada",
  snap3[0].source === "Magalu"
);

assert(
  "link preservado",
  snap3[0].link === "https://example.com/s24fe"
);

assert(
  "thumbnail preservado",
  snap3[0].thumbnail === "https://img.example.com/s24fe.jpg"
);

assert(
  "thumbnail null preservado (P2)",
  snap3[1].thumbnail === null
);

assert(
  "lista vazia retorna array vazio",
  buildRankingSnapshot([], null).length === 0
);

assert(
  "lista nula retorna array vazio",
  buildRankingSnapshot(null, null).length === 0
);

assert(
  "winner null → nenhum item marcado isWinner",
  buildRankingSnapshot([P1, P2], null).every(i => i.isWinner === false)
);

assert(
  "não mutua o array de entrada",
  (() => {
    const original = [P1, P2, P3];
    buildRankingSnapshot(original, WINNER);
    return original[0] === P1 && original.length === 3;
  })()
);

// ─────────────────────────────────────────────────────────────
// Grupo 2 — Preservação (turns contextuais não substituem snapshot)
// ─────────────────────────────────────────────────────────────

section("Grupo 2 — Preservação em turns contextuais");

const existingSnapshot = buildRankingSnapshot([P1, P2, P3], WINNER);

const rdExplanation = {
  mode: "context_decision",
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
  anchorProduct: WINNER,
};

const afterExplanation = applyContractToSessionContext(
  {
    lastBestProduct: WINNER,
    lastProducts: [P1, P2, P3],
    lastProductMentioned: "Galaxy S24 FE",
    lastRankingSnapshot: existingSnapshot
  },
  rdExplanation,
  { proposedBestProduct: P2, proposedProducts: [P1, P2, P3] }
);

assert(
  "EXPLANATION_REQUEST preserva snapshot intacto",
  Array.isArray(afterExplanation.lastRankingSnapshot) &&
    afterExplanation.lastRankingSnapshot.length === 3 &&
    afterExplanation.lastRankingSnapshot[0].product_name === "Galaxy S24 FE"
);

assert(
  "EXPLANATION_REQUEST preserva rank 2 intacto",
  afterExplanation.lastRankingSnapshot[1].product_name === "Poco F4 GT"
);

const rdObjection = {
  mode: "anchored_reaction",
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
  anchorProduct: WINNER,
};

const afterObjection = applyContractToSessionContext(
  {
    lastBestProduct: WINNER,
    lastProducts: [P1, P2, P3],
    lastProductMentioned: "Galaxy S24 FE",
    lastRankingSnapshot: existingSnapshot
  },
  rdObjection,
  { proposedBestProduct: P3 }
);

assert(
  "OBJECTION com anchor preserva snapshot (rank 1 = winner)",
  afterObjection.lastRankingSnapshot?.[0]?.product_name === "Galaxy S24 FE"
);

const rdRefinement = {
  mode: "context_hold",
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
  anchorProduct: WINNER,
};

const afterRefinement = applyContractToSessionContext(
  {
    lastBestProduct: WINNER,
    lastProducts: [P1, P2, P3],
    lastProductMentioned: "Galaxy S24 FE",
    lastRankingSnapshot: existingSnapshot
  },
  rdRefinement,
  { proposedBestProduct: P2, proposedProducts: [P1, P2, P3] }
);

assert(
  "REFINEMENT com anchor preserva snapshot intacto",
  afterRefinement.lastRankingSnapshot?.[0]?.isWinner === true &&
    afterRefinement.lastRankingSnapshot?.[1]?.product_name === "Poco F4 GT"
);

assert(
  "ACKNOWLEDGEMENT (context_hold) preserva snapshot",
  (() => {
    const out = applyContractToSessionContext(
      { lastBestProduct: WINNER, lastRankingSnapshot: existingSnapshot },
      rdRefinement,
      {}
    );
    return out.lastRankingSnapshot?.[0]?.product_name === "Galaxy S24 FE";
  })()
);

// ─────────────────────────────────────────────────────────────
// Grupo 3 — Atualização autorizada (new_search / allowReplaceWinner)
// ─────────────────────────────────────────────────────────────

section("Grupo 3 — Atualização autorizada");

const rdNewSearch = {
  mode: "new_search",
  allowReplaceWinner: true,
  allowRerank: true,
  shouldPreserveAnchor: false,
  anchorProduct: null,
};

const afterNewSearch = applyContractToSessionContext(
  {
    lastBestProduct: WINNER,
    lastProducts: [P1, P2, P3],
    lastProductMentioned: "Galaxy S24 FE",
    lastRankingSnapshot: existingSnapshot
  },
  rdNewSearch,
  {
    proposedBestProduct: NEW_WINNER,
    proposedProducts: [P2, P1, P3]
  }
);

assert(
  "new_search substitui winner no snapshot (novo rank 1)",
  afterNewSearch.lastRankingSnapshot?.[0]?.product_name === "Poco F4 GT"
);

assert(
  "new_search — antigo winner vira rank 2 no novo snapshot",
  afterNewSearch.lastRankingSnapshot?.[1]?.product_name === "Galaxy S24 FE"
);

assert(
  "new_search — novo rank 1 marcado isWinner",
  afterNewSearch.lastRankingSnapshot?.[0]?.isWinner === true
);

assert(
  "new_search — rank 2 não marcado isWinner",
  afterNewSearch.lastRankingSnapshot?.[1]?.isWinner === false
);

assert(
  "allowReplaceWinner=true cria snapshot com 1 produto",
  (() => {
    const out = applyContractToSessionContext(
      { lastBestProduct: WINNER, lastRankingSnapshot: existingSnapshot },
      rdNewSearch,
      { proposedBestProduct: P4, proposedProducts: [P4] }
    );
    return out.lastRankingSnapshot?.length === 1 &&
      out.lastRankingSnapshot[0].isWinner === true;
  })()
);

// ─────────────────────────────────────────────────────────────
// Grupo 4 — Invariantes estruturais
// ─────────────────────────────────────────────────────────────

section("Grupo 4 — Invariantes");

const snap4 = buildRankingSnapshot([P1, P2, P3, P4], WINNER);

assert(
  "sem rank duplicado (4 produtos → ranks 1,2,3,4 únicos)",
  new Set(snap4.map(i => i.rank)).size === 4
);

assert(
  "rank começa em 1",
  snap4[0].rank === 1
);

assert(
  "winner não aparece duas vezes no snapshot",
  snap4.filter(i => i.isWinner).length === 1
);

assert(
  "snapshot vazio permitido quando lista vazia",
  buildRankingSnapshot([], WINNER).length === 0
);

assert(
  "runner-up não pode ser igual ao winner por isWinner",
  snap4[1].isWinner === false
);

assert(
  "produto null no array é ignorado",
  (() => {
    const s = buildRankingSnapshot([P1, null, P3], WINNER);
    return s.length === 2 && s[0].rank === 1 && s[1].rank === 2;
  })()
);

assert(
  "função é pura — não mutua os objetos de entrada",
  (() => {
    const before = { ...P1 };
    buildRankingSnapshot([P1], WINNER);
    return P1.product_name === before.product_name;
  })()
);

// ─────────────────────────────────────────────────────────────
// Grupo 5 — Top N
// ─────────────────────────────────────────────────────────────

section("Grupo 5 — Top N (via slice do snapshot)");

const snap5 = buildRankingSnapshot([P1, P2, P3, P4], WINNER);

assert(
  "top 1 retorna apenas o winner",
  snap5.slice(0, 1).length === 1 &&
    snap5.slice(0, 1)[0].isWinner === true
);

assert(
  "top 3 retorna exatamente 3 itens",
  snap5.slice(0, 3).length === 3
);

assert(
  "top 5 com 4 disponíveis retorna 4 (sem inventar)",
  snap5.slice(0, 5).length === 4
);

assert(
  "top 10 com 4 disponíveis retorna 4 (sem inventar)",
  snap5.slice(0, 10).length === 4
);

assert(
  "top 2 contém winner em [0] e runner-up em [1]",
  snap5.slice(0, 2)[0].isWinner === true &&
    snap5.slice(0, 2)[1].isWinner === false
);

assert(
  "top 3 preserva ordem do ranking (P1, P2, P3)",
  snap5.slice(0, 3).map(i => i.product_name).join(",") ===
    "Galaxy S24 FE,Poco F4 GT,Motorola Edge 50 Neo"
);

assert(
  "runner-up = snapshot[1] (determinístico, não via LLM)",
  snap5[1].product_name === "Poco F4 GT"
);

// ─────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────

console.log(`\n── RESULT: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
