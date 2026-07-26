# PATCH 4.5 — Dashboard de Qualidade dos Dados

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**SQL:** [analytics-data-quality-dashboard.sql](./analytics-data-quality-dashboard.sql)

---

## 1. Resumo executivo

PATCH 4.5 entrega consultas SQL de **qualidade dos dados** derivadas exclusivamente de `analytics_events`, alinhadas ao Event Contract v1.

Mede cobertura de campos típicos (não violação de opcionais), conformidade de catálogo, evolução diária e anomalias de integridade.

---

## 2. Etapa 1 — Auditoria

| Indicador | Derivável? | Query |
|-----------|------------|-------|
| Volume por tipo de evento | ✅ | 1 |
| Eventos fora da allowlist/catálogo | ✅ | 1, 4 |
| Cobertura `visitor_id` / `session_id` | ✅ | 2, 3 |
| Cobertura `category` / `product_name` quando típico | ✅ | 2 |
| Timestamps válidos | ✅ | 2, 4 |
| Duplicatas `session_started` | ✅ | 4 (regra contrato) |
| Quedas de volume | ✅ | 3 (`variacao_volume_pct`) |
| Degradação temporal | ✅ | 3 |

**Veredito:** ✅ Sem bloqueios.

---

## 3. Entregas

| Artefato | Descrição |
|----------|-----------|
| [analytics-data-quality-dashboard.sql](./analytics-data-quality-dashboard.sql) | 4 queries |
| [DATA_QUALITY_DASHBOARD.md](./DATA_QUALITY_DASHBOARD.md) | Documentação |
| `sql/patch-45-query1-volume-snapshot.sql` | Volume + catálogo |
| `sql/patch-45-query2-field-coverage.sql` | Cobertura por evento |
| `sql/patch-45-query3-daily-evolution.sql` | Evolução diária |
| `sql/patch-45-query4-integrity-anomalies.sql` | Anomalias |

---

## 4. Validação

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-45:data-quality-dashboard` | **54/54** ✅ |
| `test:mia:analytics:sql-dashboards` | **183/183** ✅ |
| Regressão PATCH 4.4 | **56/56** ✅ |
| `test:mia:analytics:patch-45:prod-validation` | **11/11** ✅ |

### Produção (2026-07-22 UTC)

- **522 eventos** totais · **320 produção** · **3 QA**
- **1 evento fora do catálogo:** `analytics_test` (Query 4)
- **Cobertura `visitor_id`:** ~15% em `mia_question_sent` (dados pré-PATCH 3.1 — esperado)
- **Timestamps válidos:** 100% nos eventos MIA produção
- **Anomalias semânticas:** 0 duplicatas `session_started`, 0 `conversation_id` inválido

---

## 5. Próximo passo

**PATCH 4.6 — Auditoria Final da Fase 4**

---

*PATCH 4.5 — Dashboard de Qualidade dos Dados · Relatório de auditoria*
