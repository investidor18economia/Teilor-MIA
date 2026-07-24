# MVP Integration Test Baseline

**Patch:** 12.3 — Testes de Integração Gerais  
**Fase:** 12 — MVP Release Candidate  
**Status:** 🟢 Aprovado  
**Evidência:** `docs/analytics/PATCH_12_3_GENERAL_INTEGRATION_TESTS_EVIDENCE.json`

---

# 1. Inventário

| Métrica | Valor |
|---------|-------|
| Scripts de teste (`scripts/test-*`) | ~398 |
| Runner oficial P0 integração | **22 suítes** |
| Casos P0 (1 execução) | **~870+** |
| Execuções determinísticas | 3/3 idênticas ✅ |
| Suítes HTTP local (P1) | 5 (skip se sem servidor) |
| Regressões P1 | 4 (12.2 P0 + Fases 10/11/12.1) |
| Novos testes PATCH 12.3 | 2 arquivos (54 casos consolidados) |

---

# 2. Estratégia P0 / P1 / P2

## P0 — Críticos MVP (22 suítes integração)

| Domínio | Suítes |
|---------|--------|
| Cadeia integrada | `123-p0-smoke`, `123-favorites-alerts` |
| Perímetro → Core | `mia-chat-proxy` |
| Intent → Router → Decision | `intent-authority`, `routing-guardrails`, `e2e-state-trace` |
| Commercial Runtime | `commercial-selection`, `dedup`, `merge` |
| Analytics + Persistência | `analytics-session`, `analytics-schema`, `price-alert-e2e` |
| Valor + Executivo | `patch-101`–`105`, `patch-111`, `patch-114` |
| Segurança | `public-hardening`, `endpoint-lockdown`, `auth-trust` |

## P1 — HTTP local + extended

| Suíte | Condição |
|-------|----------|
| `real-e2e-endpoint`, runtime endpoints | `localhost:3000` ativo |
| `api-handler-contract` | informational — drift monólito `withMiaObservability` |

## P2 — ~350+ scripts de domínio

Conversacional, browser, produção operacional — sob demanda.

---

# 3. Arquitetura integrada testada

```text
POST /api/mia-chat (proxy)
    → /api/chat-gpt4o (core)
    → Intent Recognition → Intent Authority
    → Cognitive Router → Decision Engine
    → Data Layer → Commercial Runtime (mock fetch)
    → Pós-processamento → Resposta

Analytics: Ação → Allowlist → Track API → Supabase schema
Executivo: Eventos → RPCs → Executive Metrics → Insights
Favoritos/Alertas: API → Auth → Persistência (contrato)
```

Mocks **somente** na fronteira externa (fetch comercial, upstream core no proxy).

---

# 4. Testes adicionados (PATCH 12.3)

| Arquivo | Casos | Cobertura |
|---------|-------|-----------|
| `test-mia-patch-123-mvp-integration-p0-smoke.js` | 37 | Cadeia Intent→Router→Decision→DL→Commercial→Analytics→Insights→Proxy |
| `test-mia-patch-123-favorites-alerts-integration.js` | 17 | Favoritos, alertas, auth, analytics events |

Runner: `test-mia-patch-123-mvp-integration-tests-runner.js`

Comando: `npm run test:mia:patch-123:mvp-integration-tests`

---

# 5. Falhas encontradas e correções

| ID | Descrição | Correção |
|----|-----------|----------|
| `migrations-missing` | Migrations analytics v1 ausentes no repo | Adicionadas `20260719153000/01_*.sql` + `supabase/README.md` |
| `bridge-allowlist-gap` | Testes G.2/G.3 desatualizados (OBJECTION/PRIORITY_SHIFT) | Atualizados — gap fechado |
| `dual-winner` | Winner cognitivo ≠ `prices[0]` | Documentado — sem alteração arquitetural |
| `favorites-sync` | localStorage ↔ banco | Documentado — sem alteração neste patch |
| `api-handler-drift` | Audit 4E-B.5 parcial vs monólito | Movido para P1 extended |

---

# 6. Flakiness

Runner executa **3 vezes consecutivas** todas as suítes P0. Critério: mesmo número de casos passando nas 3 execuções.

---

# 7. Produção

**Sem deploy necessário** — patch altera testes, migrations de referência e documentação.

Validação prod existente: `npm run test:mia:patch-122:prod-validation` (21/21 checks em `0b6a912`).

---

# 8. Limitações

1. HTTP local (`chat-gpt4o`) requer servidor dev — P1 skip automático
2. Conversa real pela interface — manual ou PATCH 12.4 browser E2E
3. `api-handler-contract` regex parcial no monólito 38k linhas
4. Dual winner cognitive/commercial permanece documentado (pré/pós-MVP)

---

# 9. Recomendações para PATCH 12.4

1. Regressão completa do MVP (todas as suítes P0 unit + integração)
2. E2E browser + conversa real interface
3. Atualizar `api-handler-contract` para `miaChatCoreHandler` + `withMiaObservability`
4. HTTP integration CI com spawn Next.js automático

---

# 10. Veredito

Baseline de integração MVP **estabelecida e aprovada**.

🟢 **PATCH 12.3 APROVADO**
