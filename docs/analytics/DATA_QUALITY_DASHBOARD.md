# Data Quality Dashboard — PATCH 4.5

**Status:** Oficial — Dashboard de Qualidade dos Dados (Fase 4)  
**SQL:** [analytics-data-quality-dashboard.sql](./analytics-data-quality-dashboard.sql)  
**Contrato:** [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) · [EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md)

---

## 1. Objetivo

Monitorar a **saúde dos dados** coletados pelo Analytics — inconsistências, campos ausentes, degradação de tracking e regressões de instrumentação.

Este dashboard **não** mede comportamento do usuário. Mede qualidade do **sistema de Analytics**.

---

## 2. Princípio de cobertura (não violação)

Campos documentados como **opcionais** em EVENT_FIELD_SPECIFICATION **não** são tratados como erros quando ausentes.

| Termo SQL | Significado |
|-----------|-------------|
| `cobertura_*` | Percentual de preenchimento observado |
| `ocorrencias` (Query 4) | Contagem de anomalias semânticas documentadas |

**Único campo obrigatório do writer:** `event_name` (+ `id`/`created_at` gerados pelo banco).

---

## 3. Catálogo oficial (17 eventos)

Espelha EVENT_CONTRACT §7:

| Grupo | Eventos |
|-------|---------|
| MIA público (7) | `session_started`, `user_authenticated`, `mia_question_sent`, `mia_recommendation_shown`, `offer_click`, `favorite_created`, `price_alert_created` |
| E-mail produção (4) | `price_drop_email_attempted`, `_sent`, `_failed`, `_skipped` |
| E-mail teste (3) | `price_drop_email_test_*` |
| E-mail E2E (3) | `price_drop_email_e2e_*` |

`eventos_fora_catalogo` = `event_name` não listado acima.

---

## 4. Campos típicos — escopo de cobertura (Query 2)

| Campo | Eventos medidos | Referência |
|-------|-----------------|------------|
| `visitor_id` | Todos MIA produção (7) | Campos típicos §7.1 |
| `session_id` | Todos MIA produção | Idem |
| `conversation_id` | Conversacionais (5) | §7.5 — NULL em `session_started` |
| `query_text` | `mia_question_sent`, `mia_recommendation_shown` | Campos típicos |
| `category` | Eventos com vertical (5) | Não em `session_started` |
| `product_name` | Eventos de produto (4) | Não em `mia_question_sent` |
| `user_id` | Apenas `user_authenticated` | §4.5 EXECUTIVE_METRICS — `offer_click` não envia |
| `created_at` | Todos | Válido se ∈ [2020-01-01, now()+1d] |

---

## 5. Verificações de integridade (Query 4)

| Verificação | Regra |
|-------------|-------|
| `eventos_fora_catalogo` | `event_name` ∉ catálogo §7 |
| `session_started_duplicado_por_sessao` | >1 `session_started` por `session_id` |
| `session_started_com_conversation_id` | Viola §7.5 (deve ser NULL) |
| `timestamps_invalidos` | `created_at` nulo, anterior a 2020 ou futuro >1 dia |
| `event_name_nulo` | Viola obrigatoriedade do contrato |

**Duplicatas gerais:** não inferidas — apenas `session_started` duplicado (regra explícita no contrato).

---

## 6. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| **1** | `sql/patch-45-query1-volume-snapshot.sql` | Volume por evento + QA/produção + fora do catálogo |
| **2** | `sql/patch-45-query2-field-coverage.sql` | Cobertura de campos típicos por evento |
| **3** | `sql/patch-45-query3-daily-evolution.sql` | Evolução diária + `variacao_volume_pct` |
| **4** | `sql/patch-45-query4-integrity-anomalies.sql` | Anomalias de integridade |

---

## 7. Limitações

- Cobertura baixa em dados **pré-PATCH 3.1** (`visitor_id`) — esperado
- `offer_click` sem `user_id` — **comportamento documentado**, não defeito
- `category`/`product_name` nullable por contrato — cobertura <100% não implica bug
- Detecção de queda brusca via `variacao_volume_pct` — heurística dia-a-dia (denominador 0 → NULL)
- QA identificado pelo predicado PATCH 1.3 — sem coluna `environment`
- Eventos server-side sem `session_id`/`visitor_id` — **por design**

---

## 8. Relação com PATCH 1.3

| PATCH 1.3 | PATCH 4.5 |
|-----------|-----------|
| `analytics-qa-overview.sql` | Query 1 inclui split QA/produção |
| Filtro produção determinístico | Reutilizado em Queries 2–4 |

---

*PATCH 4.5 — Dashboard de Qualidade dos Dados*
