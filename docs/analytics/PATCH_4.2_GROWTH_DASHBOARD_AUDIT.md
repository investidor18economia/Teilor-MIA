# PATCH 4.2 — Dashboard de Crescimento

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**Métricas:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) (reutilização obrigatória)  
**SQL:** [analytics-growth-dashboard.sql](./analytics-growth-dashboard.sql)

---

## 1. Resumo executivo

PATCH 4.2 entrega consultas SQL de **crescimento da plataforma** derivadas exclusivamente de `analytics_events`, reutilizando definições canonizadas no PATCH 4.1.

**Nenhuma nova definição de métrica** foi introduzida. Evolução semanal/mensal implementada via séries **rolling WAU/MAU** (EXECUTIVE_METRICS §3.3–§4.4).

**Nenhuma alteração** de runtime, contratos, payloads, migrations ou arquitetura.

---

## 2. Etapa 1 — Auditoria

### Métricas pertencentes ao Dashboard de Crescimento

| Métrica / derivada | Fonte EXECUTIVE_METRICS | Incluída |
|--------------------|-------------------------|----------|
| Evolução diária (`dau_visitors`, `dau_users`) | §3.2, §4.2 | ✅ Query 1 |
| Evolução semanal (rolling `wau_*`) | §3.3, §4.3 | ✅ Query 1 |
| Evolução mensal (rolling `mau_*`) | §3.4, §4.4 | ✅ Query 1 |
| `new_visitors` / `returning_visitors` | §3.5, §3.6 | ✅ Query 1 |
| `anonymous_visitors`, `taxa_autenticacao` | §3.7, §5.3 | ✅ Query 1 |
| Comparação entre períodos | Derivada de métricas oficiais | ✅ Query 2 |
| Aquisição acumulada | `new_visitors` por `first_active_day` | ✅ Query 3 |
| `% crescimento` dia-a-dia | Derivada (não altera definição base) | ✅ Query 1 |

### Derivação arquitetural

| Pergunta | Resposta |
|----------|----------|
| Derivável da arquitetura atual? | ✅ Sim |
| Limitações estruturais? | Herda EXECUTIVE_METRICS §7 — base jovem, sem `environment` |
| Inconsistências documentais? | ❌ Nenhuma bloqueante |
| Reutilização PATCH 4.1? | ✅ Explícita — GROWTH_DASHBOARD.md |

### Decisão de agregação (sem bloqueio)

| Termo roadmap | Decisão |
|---------------|---------|
| Evolução semanal | Série **`wau_visitors` / `wau_users`** por dia (rolling 7d) |
| Evolução mensal | Série **`mau_visitors` / `mau_users`** por dia (rolling 30d) |
| Semanas/meses calendário | **Não utilizados** — não definidos em EXECUTIVE_METRICS |

**Veredito auditoria:** ✅ Sem bloqueios — implementação autorizada.

---

## 3. Entregas

| Artefato | Descrição |
|----------|-----------|
| [analytics-growth-dashboard.sql](./analytics-growth-dashboard.sql) | 3 queries (diária, comparação, aquisição) |
| [GROWTH_DASHBOARD.md](./GROWTH_DASHBOARD.md) | Documentação do patch |
| `sql/patch-42-query1-daily-growth.sql` | Query 1 split (produção) |
| `sql/patch-42-query2-period-comparison.sql` | Query 2 split |
| `sql/patch-42-query3-acquisition.sql` | Query 3 split |
| `scripts/test-mia-analytics-patch-42-growth-dashboard.js` | 38 checks |
| `scripts/patch-42-production-validation.mjs` | 10 checks produção |

---

## 4. Consultas SQL

### Query 1 — Evolução diária + rolling WAU/MAU + % crescimento

Métricas por `activity_day` UTC + `crescimento_*_pct` (LAG dia anterior).

### Query 2 — Comparação de períodos

`periodo = 'atual'` (dia ref) vs `'dia_anterior'` (ref - 1) para DAU/WAU/MAU.

### Query 3 — Aquisição

`new_visitors` por `first_active_day` + `new_visitors_acumulado`.

---

## 5. Validação

### Testes locais

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-42:growth-dashboard` | **38/38** ✅ |
| `test:mia:analytics:sql-dashboards` | **141/141** ✅ |
| `test:mia:analytics:patch-41:executive-dashboard` | **60/60** ✅ (regressão 4.1) |

### Produção (Supabase remoto)

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-42:prod-validation` | **10/10** ✅ |

#### Snapshot produção — Query 1 (2026-07-22 UTC)

| Métrica | Valor |
|---------|-------|
| `dau_visitors` | 14 |
| `dau_users` | 1 |
| `wau_visitors` / `mau_visitors` | 14 / 14 |
| `new_visitors` + `returning_visitors` | 14 + 0 = **14** ✅ |
| `% crescimento` | `NULL` (primeiro dia — esperado) |

#### Query 2 — Comparação

- `atual`: dau_visitors=14, wau_visitors=14  
- `dia_anterior`: zeros (sem atividade em 2026-07-21 — coerente com base jovem)

#### Query 3 — Aquisição

- `new_visitors_acumulado = 14` — monotônico ✅

**Cross-check PATCH 4.1:** `dau_visitors = 14` alinhado com executive dashboard produção.

---

## 6. Conformidade arquitetural

| Requisito | Status |
|-----------|--------|
| `analytics_events` fonte única | ✅ |
| EXECUTIVE_METRICS reutilizado | ✅ |
| Sem novas definições de métrica | ✅ |
| Sem tabelas / snapshots / MVs | ✅ |
| Event Contract inalterado | ✅ |
| Runtime inalterado | ✅ |

---

## 7. Fluxo oficial

| # | Etapa | Status |
|---|-------|--------|
| 1 | Auditoria prévia | ✅ |
| 2 | Implementação | ✅ |
| 3 | Auditoria pós-implementação | ✅ |
| 4 | Testes unitários | ✅ 38 checks |
| 5 | Testes integração / regressão | ✅ 201 checks |
| 6 | Endpoint local | N/A (SQL-only) |
| 7 | Deploy | N/A (SQL-only — produção verificada) |
| 8 | Validação SQL produção | ✅ 10/10 |
| 9 | Conversa real MIA | N/A (sem alteração runtime) |
| 10 | Aprovação formal | ⏸ Aguardando |

---

## 8. Próximo passo

**PATCH 4.3 — Dashboard de Conversão** (após aprovação formal do 4.2)

---

*PATCH 4.2 — Dashboard de Crescimento · Relatório de auditoria*
