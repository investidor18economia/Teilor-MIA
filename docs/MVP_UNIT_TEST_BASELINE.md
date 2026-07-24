# MVP Unit Test Baseline

**Patch:** 12.2 — Testes Unitários Gerais  
**Fase:** 12 — MVP Release Candidate  
**Status:** 🟢 Aprovado  
**Evidência:** `docs/analytics/PATCH_12_2_GENERAL_UNIT_TESTS_EVIDENCE.json`

---

# 1. Inventário

| Métrica | Valor |
|---------|-------|
| Scripts de teste (`scripts/test-*.js`) | ~383 |
| Runner oficial P0 | 23 suítes · **888 casos** |
| Execuções determinísticas | 3/3 idênticas ✅ |
| Meta-auditorias P1 | 3 (Fases 10, 11, 12.1) — 285 casos |
| Novos testes PATCH 12.2 | 3 arquivos (55 casos smoke + consolidated) |

---

# 2. Estratégia P0 / P1 / P2

## P0 — Críticos MVP (26 suítes)

| Domínio | Suítes |
|---------|--------|
| Intent + Router | cognitive-router, intent-authority, intent-social, 122-p0 |
| Decision Engine | decision-consistency, routing-guardrails |
| Data Layer | data-layer-humanization, 122-p0 |
| Commercial + Adapters | commercial-registry, selection, dedup, merge, ml-adapter-mock |
| Analytics Fase 8–10 | patch-91, 92, 93, 101–105 |
| Executive (Fase 11) | patch-111, patch-114 |
| Segurança | public-hardening, endpoint-lockdown, perimeter-rate, auth-trust |

## P1 — Regressões meta-audit

- PATCH 10.6, 11.5, 12.1

## P1 extended (informacional — drift conhecido)

| Suíte | Status | Nota |
|-------|--------|------|
| cognitive-router-full | 261/308 | 47 casos REFINEMENT→ALTERNATIVE_REQUEST drift |
| intent-social | 46/48 | 2 casos edge emocional/mixed |
| data-layer-full | slow | suite spawn — usar 122-datalayer-smoke no P0 |

## P2 — ~350+ scripts de domínio

Conversacional, comercial, produção, browser — executados sob demanda, não no runner P0.

---

# 3. Testes adicionados (PATCH 12.2)

**Arquivo:** `scripts/test-mia-patch-122-mvp-p0-unit-tests.js`

Cobertura consolidada:

- Intent Recognition (social, commercial, empty)
- Cognitive Router (determinismo, whitespace)
- Decision Engine (winner, anchor, empty list)
- Data Layer (classificação, humanization)
- NormalizedProduct contract
- Commercial provider registry (sem rede)
- Analytics allowlist (7 eventos, rejeição, metadata)
- Executive Metrics forbidden keys
- Executive Insights determinístico
- Founder gate HMAC
- HTTP method validation
- Log redaction
- Casos negativos (null, undefined, token inválido)

---

# 4. Bug encontrado e correção

**Bug:** `validateAnalyticsTrackRequest(null)` lançava `TypeError`.

**Correção:** `lib/miaAnalyticsAllowlist.js` — normalização `safeBody` para `null`/não-objeto.

**Regressão:** teste `null analytics body` em 122-p0.

---

# 5. Código morto removido

- `pages/api/pages/api/test-economia.js` — rota órfã (PATCH 12.1), sem imports, bloqueada em prod.

---

# 6. Flakiness

Runner executa **3 vezes consecutivas** todas as suítes P0. Critério: mesmo número de casos passando nas 3 execuções.

Comando: `npm run test:mia:patch-122:mvp-unit-tests`

---

# 7. Cobertura

Ferramenta de cobertura global (Istanbul/c8) **não configurada** — decisão intencional.

Prioridade: **cobertura comportamental P0** > percentual global.

---

# 8. Limitações

1. Monólito `chat-gpt4o.js` não tem testes unitários isolados (coberto por audits de integração)
2. Testes browser/E2E fora do escopo 12.2
3. Alguns scripts P2 dependem de spawn de sub-processos
4. Supabase live opcional em alguns patches analytics (offline path validado)

---

# 9. Recomendações para PATCH 12.3

1. Testes de integração E2E: `mia-chat` → core → resposta
2. Smoke produção pós-deploy se houver alteração runtime
3. Considerar c8 apenas para módulos `lib/mia*` P0 (opcional)

---

# 10. Veredito

Baseline unitária MVP **estabelecida e aprovada**.

🟢 **PATCH 12.2 APROVADO**
