# Conversion Funnel Analytics Estratégico — PATCH 5.3

**Status:** Oficial — Analytics Estratégico (Fase 5)  
**SQL:** [analytics-conversion-strategic.sql](./analytics-conversion-strategic.sql)  
**Funil operacional:** [CONVERSION_DASHBOARD.md](./CONVERSION_DASHBOARD.md) (PATCH 4.3 — **não substituído**)  
**Métricas base:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md)

---

## 1. Objetivo

Transformar o funil operacional em **inteligência estratégica de conversão** — gargalos, cohorts, segmentos e tendências.

| Camada | Pergunta | Patch |
|--------|----------|-------|
| **Operacional** | Qual é a taxa de conversão do funil? | 4.3 Conversion Dashboard |
| **Estratégica** | Por que alguns convertem mais e onde estão os gargalos? | **5.3 Conversion Funnel Analytics** |

---

## 2. Delta em relação ao PATCH 4.3 (obrigatório)

### O que já foi entregue na Fase 4

| Query 4.3 | Conteúdo |
|-----------|----------|
| **1** | Snapshot — reach (`visitantes`/`sessoes`/`eventos`) + funil sequencial + taxas por etapa |
| **2** | Evolução diária — volumes de reach + taxas de conversão |
| **3** | Segmento visitante vs autenticado — **alcance (reach)**, não sequencial |

### O que NÃO será reimplementado (PATCH 5.3)

- Tabela completa de funil com colunas `visitantes`, `sessoes`, `eventos` por etapa
- `visitantes_sequenciais` / `sessoes_sequenciais` como output principal
- `taxa_conversao_sessao` / `abandono_sessao` operacionais
- Série diária de volumes de reach (`visitantes_sessao`, `eventos_perguntas`, etc.)
- Comparação de segmento por `entidades_*` (reach — PATCH 4.3 Q3)
- `taxa_clique_recomendacao` (CTR operacional — PATCH 4.3 Q2 / analytics-ctr.sql)

### O que passa a existir apenas na Fase 5 (PATCH 5.3)

| Análise | Query |
|---------|-------|
| Ranking de abandono e gargalo principal | 1 |
| Perda absoluta de visitantes por transição | 1 |
| Funil sequencial por cohort de aquisição | 2 |
| Funil sequencial por segmento (anonimo vs autenticado) | 3 |
| Influência da profundidade conversacional na conversão | 3 |
| Influência de imagem vs texto na conversão | 3 |
| Comparação de tendência do funil entre janelas | 4 |
| Sinal qualitativo de melhora/piora do funil | 4 |

---

## 3. Funil sequencial reutilizado (PATCH 4.3)

Ordem oficial inalterada:

1. `session_started` → 2. `mia_question_sent` → 3. `mia_recommendation_shown` → 4. `offer_click` → 5. `favorite_created` → 6. `price_alert_created`

Ordenação intra-visitante via `MIN(created_at)` — mesma premissa do PATCH 4.3.

---

## 4. Métricas estratégicas derivadas (Fase 5)

| Alias SQL | Definição |
|-----------|-----------|
| `perda_absoluta_visitantes` | Visitantes perdidos entre transições sequenciais |
| `rank_abandono` | Ranking da transição por taxa de abandono (1 = pior) |
| `is_gargalo_principal` | Transição com maior abandono no dia de referência |
| `conversao_acumulada_intencao_cohort` | Cohort que completa alerta / topo sessão |
| `conversao_acumulada_intencao` | Intenção final (alerta) / topo sessão por subsegmento |
| `abandono_topo_pergunta` | 1 − taxa sessão→pergunta |
| `delta_conversao_acumulada_intencao` | Δ entre janelas recente vs anterior |
| `sinal_tendencia_funil` | `melhorando` / `piorando` / `estavel` |

---

## 5. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| **1** | `sql/patch-53-query1-dropoff-bottleneck.sql` | Drop-off · ranking · gargalo |
| **2** | `sql/patch-53-query2-cohort-funnel.sql` | Funil por cohort de aquisição |
| **3** | `sql/patch-53-query3-segment-modifiers.sql` | Segmento · profundidade · imagem |
| **4** | `sql/patch-53-query4-funnel-trend-comparison.sql` | Tendência entre janelas 7d |

Arquivo completo: `analytics-conversion-strategic.sql`

---

## 6. Premissas

- Filtro produção: [analytics-production-scope.sql](./analytics-production-scope.sql)
- Cohort = `first_active_day` do visitante (EXECUTIVE_METRICS §3.5)
- Query 2 usa jornada **lifetime** do visitante no cohort (não limitada ao dia de aquisição)
- Query 3 classifica profundidade/imagem pelo comportamento no **dia de referência**
- Query 4 agrega funil por janelas de 7 dias (recente vs anterior)

---

## 7. Limitações

| Limitação | Impacto |
|-----------|---------|
| Funil linear strict (4.3) | Não modela ramificações paralelas favorito/alerta sem clique |
| `offer_click` sem `user_id` | Segmento autenticado subestima cliques |
| `session_started` ausente no dia ref | Funil sequencial pode iniciar em 0 (documentado 4.3) |
| Cohorts com 1 dia de dados | Poucos cohorts comparáveis |
| Query 4 vazia com <14 dias | Janela anterior sem dados |
| Profundidade no dia ref | Não captura profundidade lifetime cross-day |

---

## 8. Relação com PATCH 4.3 e 5.2

| PATCH | Escopo |
|-------|--------|
| **4.3** | Taxas operacionais e volumes de reach |
| **5.2** | Comportamento conversacional (profundidade isolada) |
| **5.3** | Conversão do funil × cohort × segmento × tendência |

---

*PATCH 5.3 — Conversion Funnel Analytics Estratégico*
