/**
 * PATCH 7.6O-B — Explanation Anchored Winner Pinning Hardening
 *
 * Valida que o contrato explanation_anchored agora cita o winner autorizado
 * em todos os cenários de escolha final, simplificação e explicação.
 *
 * Baseline (PATCH 7.6O-B-AUDIT):  2/4 = 50%
 * Meta:                           ≥ 4/4 = 100%
 *
 * Cenários:
 *   A — "se você tivesse que escolher um só"
 *   B — "qual sobreviveria ao corte"
 *   C — "fala simples"
 *   D — "simplifica pra mim"
 *   E — "me explica sem linguagem técnica"
 *
 * Usage:
 *   MIA_STATE_AUDIT=true node scripts/test-mia-explanation-anchored-winner-hardening.js
 *   node scripts/test-mia-explanation-anchored-winner-hardening.js  (HTTP desativado)
 */

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

const API_BASE     = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const HTTP_ENABLED = !!(process.env.MIA_STATE_AUDIT);

async function httpTurn(query, session_context, msgs, convId) {
  const messages = [...msgs, { role: "user", content: query }];
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "minha_chave_181199" },
    body: JSON.stringify({
      text: query, image_base64: "", user_id: "hardening-audit-766ob",
      conversation_id: convId, messages, session_context,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runTurns(queries) {
  const convId = `hardening-${Date.now()}`;
  let sc = {}, msgs = [];
  const results = [];
  for (const q of queries) {
    const data = await httpTurn(q, sc, msgs, convId);
    msgs = [...msgs, { role: "user", content: q }, { role: "assistant", content: data.reply || "" }];
    sc   = data.session_context || {};
    results.push({ query: q, data, sc });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// Text helpers
// ─────────────────────────────────────────────────────────────

function normalizeText(s = "") {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function nameInText(text = "", name = "") {
  if (!name || !text) return false;
  const normText = normalizeText(text);
  const normName = normalizeText(name);
  if (normText.includes(normName)) return true;
  const words = normName.split(" ");
  for (let i = 0; i <= words.length - 3; i++) {
    const w = words.slice(i, i + 3).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  for (let i = 0; i <= words.length - 2; i++) {
    const w = words.slice(i, i + 2).join(" ");
    if (w.length > 5 && normText.includes(w)) return true;
  }
  return false;
}

// Detect if LLM promoted a different product as main recommendation
function detectAlternativeRecommendation(reply = "", authorizedWinner = "") {
  const recs = [
    /eu\s+(recomendaria|compraria|iria\s+n[o|a]|ficaria\s+com|escolheria)\s+(?:o\s+|a\s+)?([^\n.,!?]{3,60})/gi,
    /(?:a\s+melhor\s+op[cç][aã]o\s+[eé]|eu\s+escolheria)\s+(?:o\s+|a\s+)?([^\n.,!?]{3,60})/gi,
  ];
  for (const re of recs) {
    let m;
    while ((m = re.exec(reply)) !== null) {
      const prod = (m[2] || m[1] || "").trim().replace(/[.,!?]+$/, "");
      if (prod.length > 3 && !nameInText(prod, authorizedWinner)) {
        return prod;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Scenario runner
// ─────────────────────────────────────────────────────────────

const results = [];
let pass = 0, fail = 0;

async function runScenario(id, label, contextualQuery) {
  if (!HTTP_ENABLED) {
    console.log(`  ○ ${id} — ${label} [HTTP desativado]`);
    results.push({ id, label, skipped: true });
    return;
  }

  try {
    const turns = await runTurns(["celular ate 2500", contextualQuery]);
    const turn0   = turns[0];
    const turn1   = turns[1];

    const winner     = turn0.sc?.lastBestProduct?.product_name || null;
    const anchor     = turn1.sc?.lastBestProduct?.product_name || null;
    const reply      = turn1.data.reply || "";
    const inReply    = nameInText(reply, winner);
    const altRec     = detectAlternativeRecommendation(reply, winner);
    const compliant  = inReply && !altRec;

    if (compliant) { pass++; } else { fail++; }

    results.push({ id, label, winner, anchor, reply, inReply, altRec, compliant });

    const icon = compliant ? "✓" : "✗";
    console.log(`  ${icon} ${id} — ${label}`);
    console.log(`      winner autorizado : ${winner}`);
    console.log(`      anchor preservada : ${anchor === winner}`);
    console.log(`      winner na reply   : ${inReply ? "YES" : "NO"}`);
    if (altRec) console.log(`      alternativa rec  : "${altRec}"`);
    console.log(`      reply preview     : "${reply.replace(/\n/g, " ").slice(0, 120)}"`);
  } catch (err) {
    fail++;
    results.push({ id, label, error: err.message });
    console.log(`  ✗ ${id} — ${label}  [HTTP ERROR: ${err.message}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// Test execution
// ─────────────────────────────────────────────────────────────

function section(title) {
  console.log(`\n  ${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`  ${"─".repeat(60)}`);
}

section("PATCH 7.6O-B — Explanation Anchored Winner Hardening");
if (!HTTP_ENABLED) {
  console.log(`\n  ⚠  HTTP desativado.`);
  console.log(`     Execute: MIA_STATE_AUDIT=true node scripts/test-mia-explanation-anchored-winner-hardening.js`);
}

await runScenario("A", "se você tivesse que escolher um só",        "se voce tivesse que escolher um so");
await runScenario("B", "qual sobreviveria ao corte",                 "qual sobreviveria ao corte");
await runScenario("C", "fala simples",                               "fala simples");
await runScenario("D", "simplifica pra mim",                         "simplifica pra mim");
await runScenario("E", "me explica sem linguagem técnica",           "me explica sem linguagem tecnica");

// ─────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────

const ran = results.filter(r => !r.skipped && !r.error);
const total = ran.length;

console.log(`\n  ${"═".repeat(60)}`);
console.log(`  PATCH 7.6O-B — Winner Hardening Results`);
console.log(`  ${"═".repeat(60)}`);

if (HTTP_ENABLED && total > 0) {
  const complianceRate = Math.round(pass/total*100);
  const bar = "█".repeat(Math.round(complianceRate/10)).padEnd(10);
  console.log(`\n  Cenários executados      : ${total}`);
  console.log(`  Winner compliance (após) : ${pass}/${total}  ${bar}  ${complianceRate}%`);
  console.log(`  Baseline (antes)         : 2/4  ████████             50%`);
  console.log(`  Meta                     : ≥ 4/4  ████████████████  100%`);

  if (fail > 0) {
    console.log(`\n  FALHAS:`);
    results.filter(r => !r.skipped && !r.error && !r.compliant).forEach(r => {
      console.log(`    ✗ ${r.id} — ${r.label}`);
      console.log(`        winner: ${r.winner}`);
      console.log(`        inReply: ${r.inReply}`);
      if (r.altRec) console.log(`        altRec: "${r.altRec}"`);
      console.log(`        reply: "${(r.reply || "").replace(/\n/g, " ").slice(0, 100)}"`);
    });
  }

  const status = fail === 0 ? "✓ ALL PASS" : `✗ ${fail} FAILURE(S)`;
  console.log(`\n  ${status}`);
} else {
  console.log(`\n  HTTP: desativado — nenhum cenário executado`);
}

console.log(`  ${"═".repeat(60)}\n`);

process.exit(HTTP_ENABLED && fail > 0 ? 1 : 0);
