# Growth Analytics Estratégico — PATCH 5.1

**Status:** Oficial — Analytics Estratégico (Fase 5)  
**SQL:** [analytics-growth-strategic.sql](./analytics-growth-strategic.sql)  
**Métricas base:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) — reutilização obrigatória  
**Dashboard operacional:** [GROWTH_DASHBOARD.md](./GROWTH_DASHBOARD.md) (PATCH 4.2) — **não substituído**

---

## 1. Objetivo

Transformar métricas operacionais de crescimento em **inteligência estratégica** para tomada de decisão.

| Camada | Pergunta | Patch |
|--------|----------|-------|
| **Operacional** | O que aconteceu? | 4.2 Growth Dashboard |
| **Estratégica** | O que isso significa para o crescimento? | **5.1 Growth Analytics Estratégico** |

---

## 2. Delta em relação ao PATCH 4.2 (obrigatório)

### O que já foi entregue na Fase 4 (PATCH 4.2)

| Query | Conteúdo |
|-------|----------|
| **1** | Evolução diária — `dau_*`, rolling `wau_*`/`mau_*`, `new_visitors`, `returning_visitors`, `% crescimento` dia sobre dia |
| **2** | Comparação de período — dia de referência **atual** vs **dia anterior** |
| **3** | Aquisição — `new_visitors` por `first_active_day` + `new_visitors_acumulado` |

Fonte operacional oficial: [analytics-growth-dashboard.sql](./analytics-growth-dashboard.sql)

### O que NÃO será reimplementado (PATCH 5.1)

- Séries diárias completas de DAU/WAU/MAU
- `% crescimento` rolling WAU/MAU dia sobre dia (`crescimento_wau_*`, `crescimento_mau_*`)
- Comparação `atual` vs `dia_anterior` (Query 2 do 4.2)
- Curva de aquisição acumulada (`new_visitors_acumulado`)
- Redefinição de métricas canônicas

### O que passa a existir apenas na Fase 5 (PATCH 5.1)

| Análise | Query | Descrição |
|---------|-------|-----------|
| **Retenção por cohort (visitantes)** | 1 | D1, D7, D30 por `first_active_day` |
| **Retenção por cohort (usuários)** | 2 | D1, D7, D30 por primeiro dia de atividade autenticada |
| **Saúde estratégica do crescimento** | 3 | Stickiness, mix novos/recorrentes, aceleração, tendência |
| **Tendências e segmentos de retenção** | 4 | Comparação entre janelas de cohorts + segmento autenticado vs anônimo |

---

## 3. Métricas reutilizadas (EXECUTIVE_METRICS — PATCH 4.1)

| Métrica canônica | Uso estratégico |
|------------------|-----------------|
| `new_visitors` (§3.5) | Denominador de cohort + `participacao_novos_visitantes` |
| `returning_visitors` (§3.6) | `participacao_recorrentes` |
| `dau_visitors` / `dau_users` (§3.2 / §4.2) | Snapshot + stickiness |
| `wau_*` / `mau_*` (§3.3–§4.4) | Snapshot de referência |
| `first_active_day` | Definição de cohort (§3.5 · RETENTION_FOUNDATION) |

---

## 4. Métricas estratégicas derivadas (Fase 5 — não canônicas)

Estas métricas **não** alteram EXECUTIVE_METRICS. São indicadores estratégicos exclusivos da Fase 5.

| Alias SQL | Fórmula | Interpretação |
|-----------|---------|---------------|
| `retention_dN_pct` | `retained_dN / cohort_size` | Retenção calendário UTC no dia N pós-aquisição |
| `stickiness_dau_mau_visitors` | `dau_visitors / mau_visitors` | Engajamento relativo (DAU/MAU) |
| `stickiness_dau_mau_users` | `dau_users / mau_users` | Idem para usuários autenticados |
| `participacao_novos_visitantes` | `new_visitors / dau_visitors` | Mix de aquisição vs recorrência |
| `participacao_recorrentes` | `returning_visitors / dau_visitors` | Complemento do mix diário |
| `media_retention_d7_cohorts_maduros_pct` | Média D7 dos cohorts maduros (últimos 38 dias) | Retenção agregada recente |
| `aceleracao_crescimento_dau_pct` | Δ do `% crescimento DAU` dia sobre dia | Segunda derivada do crescimento |
| `delta_tendencia_crescimento_7d_pct` | Média 7d atual − média 7d anterior | Tendência de aceleração/desaceleração |
| `sinal_tendencia_crescimento` | `acelerando` / `desacelerando` / `estavel` | Sinal qualitativo |
| `retention_d7_agregada_pct` | Retenção D7 agregada por janela de cohorts | Comparação entre períodos |
| `retention_d7_segmento_autenticou_pct` | D7 para visitantes que autenticaram em D7 | Segmento de maior valor |
| `retention_d7_segmento_anonimo_pct` | D7 para visitantes que permaneceram anônimos | Segmento ocasional |
| `delta_retention_d7_janelas_pct` | Δ retenção entre janelas recente vs anterior | Retenção melhorando? |

---

## 5. Definições de retenção (PATCH 5.1)

### Cohort de visitante

- **Cohort day:** `first_active_day = MIN(activity_day)` por `visitor_id` — idêntico a EXECUTIVE_METRICS §3.5 e PATCH 4.2 Query 3.
- **Retido no dia N:** visitante com ≥1 evento qualificante em `cohort_day + N` (dia civil UTC).
- **Maturidade:** `retention_dN_pct` é `NULL` quando `cohort_day + N > dia_referencia` — evita métricas parciais enganosas.

### Cohort de usuário autenticado

- **Cohort day:** primeiro dia com evento qualificante e `user_id IS NOT NULL`.
- **Limitação:** `offer_click` não envia `user_id` — subcontagem documentada (EXECUTIVE_METRICS §4.1).

### Segmento autenticou_em_d7

- Visitante com ≥1 evento com `user_id` entre `first_active_day` e `first_active_day + 7`.
- Complemento: `permaneceu_anonimo` nos primeiros 7 dias.

---

## 6. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| **1** | `sql/patch-51-query1-visitor-cohort-retention.sql` | Retenção D1/D7/D30 por cohort de visitante |
| **2** | `sql/patch-51-query2-user-cohort-retention.sql` | Retenção D1/D7/D30 por cohort de usuário |
| **3** | `sql/patch-51-query3-strategic-health-snapshot.sql` | Snapshot estratégico no dia de referência |
| **4** | `sql/patch-51-query4-retention-trends-comparison.sql` | Tendências e comparação entre janelas/segmentos |

Arquivo completo: `analytics-growth-strategic.sql`

---

## 7. Premissas

- Filtro produção: [analytics-production-scope.sql](./analytics-production-scope.sql)
- 7 eventos qualificantes: EXECUTIVE_METRICS §2
- Fuso: UTC — dias civis
- Fonte: `analytics_events` append-only
- Dia de referência: último dia UTC com atividade de visitante qualificante

---

## 8. Limitações

| Limitação | Impacto |
|-----------|---------|
| Base jovem pós-PATCH 3.1 | Poucos cohorts maduros para D30 |
| `visitor_id` ausente em dados históricos | Cohorts subestimados no passado |
| `offer_click` sem `user_id` | Retenção de usuários autenticados subestimada |
| Retenção calendário (não rolling) | D7 = exatamente 7 dias após aquisição, não janela rolling |
| Sem coluna `environment` | Filtro produção por exclusão (PATCH 1.3) |
| Reativação pós-gap longo | Não distingue returning de reativado (EXECUTIVE_METRICS §3.6) |
| Query 4 requer ≥28 dias de cohorts maduros | Janelas vazias em produção inicial |

---

## 9. Relação com PATCH 4.2

| PATCH 4.2 (operacional) | PATCH 5.1 (estratégico) |
|-------------------------|-------------------------|
| Volume diário de visitantes | Retenção por cohort |
| % crescimento dia sobre dia | Aceleração e tendência de crescimento |
| Aquisição acumulada | Comparação entre cohorts e segmentos |
| Comparação atual vs ontem | Saúde estratégica (stickiness, mix, retenção média) |

**Regra:** consultas operacionais continuam em `analytics-growth-dashboard.sql`. Consultas estratégicas vivem em `analytics-growth-strategic.sql`.

---

*PATCH 5.1 — Growth Analytics Estratégico*
