# PATCH 4.3 — Dashboard de Conversão

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**Métricas:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) (reutilização obrigatória)  
**SQL:** [analytics-conversion-dashboard.sql](./analytics-conversion-dashboard.sql)

---

## 1. Resumo executivo

PATCH 4.3 entrega consultas SQL de **conversão e funil de utilização** derivadas exclusivamente de `analytics_events`, reutilizando volumes e escopo do PATCH 4.1.

**Nenhum evento novo**, contrato alterado, migration ou mudança de runtime.

Taxas de conversão, abandono e conversão acumulada são **métricas derivadas** sobre funil sequencial ordenado por `created_at`.

---

## 2. Etapa 1 — Auditoria

### Métricas pertencentes ao Dashboard de Conversão

| Indicador | Derivável? | Implementação |
|-----------|------------|---------------|
| Sessões iniciadas | ✅ | `session_started` — Query 1/2 |
| Perguntas enviadas | ✅ | `mia_question_sent` |
| Recomendações exibidas | ✅ | `mia_recommendation_shown` |
| Cliques em ofertas | ✅ | `offer_click` |
| Favoritos criados | ✅ | `favorite_created` |
| Alertas de preço | ✅ | `price_alert_created` |
| Taxa conversão entre etapas | ✅ | Funil sequencial (timestamp) |
| Conversão acumulada | ✅ | Etapa N / etapa 1 |
| Abandono entre etapas | ✅ | `1 - taxa_conversao` |
| Conversão diária | ✅ | Query 2 por `activity_day` |
| Conversão por visitante | ✅ | `visitantes_sequenciais` |
| Conversão por usuário autenticado | ✅ | Query 3 (`user_id IS NOT NULL`) |

### Derivação arquitetural

| Pergunta | Resposta |
|----------|----------|
| Derivável da arquitetura atual? | ✅ Sim — `visitor_id`, `session_id`, `user_id`, `created_at` |
| Limitações estruturais? | `offer_click` sem `user_id`; ramificações pós-recomendação |
| Inconsistências documentais? | ❌ Nenhuma bloqueante |
| Reutilização PATCH 4.1/4.2? | ✅ Volumes `eventos_*`, filtro produção, UTC |

### Decisões de funil (sem bloqueio)

| Decisão | Escolha |
|---------|---------|
| Ordem do funil | EVENT_CONTRACT v1: sessão → pergunta → recomendação → clique → favorito → alerta |
| Taxas de conversão | Funil **sequencial** (primeira ocorrência ordenada por entidade) |
| Volumes paralelos | **Reach** (`visitantes`, `sessoes`, `eventos`) por etapa |
| `user_authenticated` | Fora do funil linear — segmento autenticado (Query 3) |
| CTR recomendação→clique | `eventos_cliques / eventos_recomendacoes` (espelha analytics-ctr.sql) |

**Veredito auditoria:** ✅ Sem bloqueios — implementação autorizada.

---

## 3. Entregas

| Artefato | Descrição |
|----------|-----------|
| [analytics-conversion-dashboard.sql](./analytics-conversion-dashboard.sql) | 3 queries (snapshot, diária, segmentos) |
| [CONVERSION_DASHBOARD.md](./CONVERSION_DASHBOARD.md) | Documentação do patch |
| `sql/patch-43-query1-funnel-snapshot.sql` | Query 1 split (produção) |
| `sql/patch-43-query2-daily-funnel.sql` | Query 2 split |
| `sql/patch-43-query3-segment-comparison.sql` | Query 3 split |
| `scripts/test-mia-analytics-patch-43-conversion-dashboard.js` | Auditoria local |
| `scripts/patch-43-production-validation.mjs` | Validação produção |

---

## 4. Consultas SQL

### Query 1 — Funil snapshot (dia de referência)

6 etapas com volumes reach + sequenciais + taxas + abandono + conversão acumulada.

### Query 2 — Evolução diária

Volumes por etapa + taxas sequenciais + `conversao_acumulada_visitante` + `taxa_clique_recomendacao`.

### Query 3 — Segmentos

`visitante` vs `usuario_autenticado` — alcance por etapa + taxas de conversão.

---

## 5. Validação

### Testes locais

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-43:conversion-dashboard` | **61/61** ✅ |
| `test:mia:analytics:sql-dashboards` | **155/155** ✅ |
| `test:mia:analytics:patch-41:executive-dashboard` | **60/60** ✅ (regressão) |
| `test:mia:analytics:patch-42:growth-dashboard` | **38/38** ✅ (regressão) |

### Produção (Supabase remoto · 2026-07-22 UTC)

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-43:prod-validation` | **12/12** ✅ |

**Query 1 — funil snapshot:** 6 etapas; `visitantes_pergunta=12`, `visitantes_recomendacao=7`, taxa pergunta→recomendação segmento visitante **58,33%**; `session_started=0` no dia ref (limitação documentada).

**Query 2 — evolução diária:** `visitantes_pergunta=12` ≤ `dau_visitors=14` (cross-check 4.1) ✅

**Query 3 — segmentos:** visitante vs `usuario_autenticado` — 2 linhas ✅

---

## 6. Conformidade

| Requisito | Status |
|-----------|--------|
| `analytics_events` fonte única | ✅ |
| EXECUTIVE_METRICS reutilizado | ✅ |
| Sem alteração arquitetural | ✅ |
| Documentação atualizada | ✅ |

---

## 7. Próximo passo

**PATCH 4.4 — Dashboard de Produtos e Categorias** (após aprovação formal do 4.3)

---

*PATCH 4.3 — Dashboard de Conversão · Relatório de auditoria*
