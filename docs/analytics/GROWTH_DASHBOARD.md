# Growth Dashboard — PATCH 4.2

**Status:** Oficial — Dashboard de Crescimento (Fase 4)  
**SQL:** [analytics-growth-dashboard.sql](./analytics-growth-dashboard.sql)  
**Métricas:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) — **reutilização obrigatória, sem novas definições**

---

## 1. Objetivo

Medir **crescimento da plataforma ao longo do tempo** utilizando exclusivamente métricas canonizadas no PATCH 4.1.

Este dashboard **não** introduz novas definições de métricas — apenas agregações temporais e comparações derivadas.

---

## 2. Métricas reutilizadas (PATCH 4.1)

| Métrica | Seção EXECUTIVE_METRICS | Uso no Growth Dashboard |
|---------|----------------------|-------------------------|
| `dau_visitors` | §3.2 | Evolução diária, comparação períodos |
| `dau_users` | §4.2 | Evolução diária, comparação períodos |
| `wau_visitors` | §3.3 | Série rolling 7 dias (evolução semanal) |
| `wau_users` | §4.3 | Série rolling 7 dias |
| `mau_visitors` | §3.4 | Série rolling 30 dias (evolução mensal) |
| `mau_users` | §4.4 | Série rolling 30 dias |
| `new_visitors` | §3.5 | Por dia + aquisição acumulada |
| `returning_visitors` | §3.6 | Por dia |
| `anonymous_visitors` | §3.7 | Por dia |
| `authenticated_users` | §4.5 | Por dia |
| `taxa_autenticacao` | §5.3 | Por dia |

### Decisão de agregação temporal (sem ambiguidade)

| Termo no roadmap | Implementação oficial |
|------------------|----------------------|
| Evolução diária | Série `activity_day` UTC com métricas diárias |
| Evolução semanal | Série **`wau_visitors` / `wau_users`** (rolling 7 dias por dia) — §3.3/§4.3 |
| Evolução mensal | Série **`mau_visitors` / `mau_users`** (rolling 30 dias por dia) — §3.4/§4.4 |
| Comparação entre períodos | Dia de referência **atual** vs **dia anterior** (Query 2) |

**Não utilizado:** semanas/meses calendário ISO — não definidos em EXECUTIVE_METRICS.

---

## 3. Métricas derivadas (crescimento — não alteram definições base)

| Alias SQL | Fórmula | Escopo |
|-----------|---------|--------|
| `crescimento_dau_visitors_pct` | `(dau_t - dau_t-1) / dau_t-1` | Dia sobre dia |
| `crescimento_dau_users_pct` | Idem para `dau_users` | Dia sobre dia |
| `crescimento_wau_visitors_pct` | Idem para `wau_visitors` | Rolling WAU dia sobre dia |
| `crescimento_wau_users_pct` | Idem para `wau_users` | Rolling WAU dia sobre dia |
| `crescimento_mau_visitors_pct` | Idem para `mau_visitors` | Rolling MAU dia sobre dia |
| `crescimento_mau_users_pct` | Idem para `mau_users` | Rolling MAU dia sobre dia |
| `new_visitors_acumulado` | `SUM(new_visitors)` por `first_active_day` | Curva de aquisição |

---

## 4. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| **1** | `sql/patch-42-query1-daily-growth.sql` | Evolução diária + rolling WAU/MAU + % crescimento |
| **2** | `sql/patch-42-query2-period-comparison.sql` | Comparação atual vs dia anterior |
| **3** | `sql/patch-42-query3-acquisition.sql` | Novos visitantes por dia + acumulado |

Arquivo completo: `analytics-growth-dashboard.sql`

---

## 5. Premissas

- Filtro produção: [analytics-production-scope.sql](./analytics-production-scope.sql)
- 7 eventos qualificantes: EXECUTIVE_METRICS §2
- Fuso: UTC
- Fonte: `analytics_events` append-only

---

## 6. Limitações

- Herda limitações de [EXECUTIVE_METRICS.md §7](./EXECUTIVE_METRICS.md)
- `% crescimento` = `NULL` quando denominador = 0 (primeiro dia da série)
- Comparação `dia_anterior` requer atividade no dia `ref_day - 1`
- Base jovem pós-PATCH 3.1 — séries curtas em produção inicial

---

## 7. Relação com PATCH 4.1

| PATCH 4.1 | PATCH 4.2 |
|-----------|-----------|
| Snapshot executivo (Query 1) | — |
| Evolução diária básica (Query 2) | Expandida com WAU/MAU rolling + % crescimento |
| — | Comparação entre períodos (Query 2) |
| — | Aquisição acumulada (Query 3) |

---

*PATCH 4.2 — Dashboard de Crescimento*
