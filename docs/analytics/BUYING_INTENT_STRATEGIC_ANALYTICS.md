# Buying Intent Analytics Estratégico — PATCH 5.4

**Status:** Oficial — Analytics Estratégico (Fase 5)  
**SQL:** [analytics-buying-intent-strategic.sql](./analytics-buying-intent-strategic.sql)  
**Operacional:** [PRODUCTS_CATEGORIES_DASHBOARD.md](./PRODUCTS_CATEGORIES_DASHBOARD.md) (PATCH 4.4 — **não substituído**)  
**Métricas base:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md)

---

## 1. Objetivo

Transformar eventos isolados de intenção em **indicadores estratégicos de comportamento** — quem demonstra intenção, o que antecede e como evolui.

| Camada | Pergunta | Patch |
|--------|----------|-------|
| **Operacional** | Quais produtos receberam mais interações? | 4.4 Products Dashboard |
| **Estratégica** | Quais comportamentos indicam intenção real? | **5.4 Buying Intent Analytics** |

---

## 2. Delta em relação à Fase 4 (obrigatório)

### O que já foi entregue na Fase 4

| Patch | Conteúdo |
|-------|----------|
| **4.4 Q1** | Ranking de produtos por volume (`total_aparicoes`, CTR) |
| **4.4 Q2** | Inteligência por categoria — volumes e `taxa_intencao_pos_recomendacao` (eventos) |
| **4.4 Q3/Q4** | Evolução diária por categoria/produto |
| **1.3** | `sinais_fortes_de_compra` — totais agregados |

### O que NÃO será reimplementado (PATCH 5.4)

- Ranking operacional top 50 produtos por volume
- `total_aparicoes`, `total_perguntas`, `total_eventos_categoria`
- Séries diárias `eventos_*` por categoria/produto
- `taxa_clique_recomendacao` operacional (PATCH 4.4 / analytics-ctr.sql)
- `taxa_intencao_pos_recomendacao` baseada em contagem de eventos (4.4 Q2)
- `sinais_fortes_de_compra` agregado único

### O que passa a existir apenas na Fase 5 (PATCH 5.4)

| Análise | Query |
|---------|-------|
| Ranking de sinais por **visitante** (não volume de eventos) | 1 |
| Combinações de sinais por visitante | 1 |
| Antecedentes comportamentais antes do primeiro sinal | 2 |
| Intenção por segmento (auth/anon) com antecedentes | 2 |
| Força de intenção por categoria (**visitantes** distintos) | 3 |
| Produtos com intenção consistente (visitantes × dias) | 3 |
| Intenção por cohort de aquisição | 4 |
| Tendência de intenção entre janelas 7d | 4 |

---

## 3. Sinais de intenção (Event Contract v1)

| Evento | Papel |
|--------|-------|
| `offer_click` | Clique em oferta |
| `favorite_created` | Favorito |
| `price_alert_created` | Alerta de preço |

Antecedentes analisados: `mia_recommendation_shown`, `mia_question_sent`, `metadata.has_image`, autenticação, profundidade conversacional.

---

## 4. Métricas estratégicas derivadas (Fase 5)

| Alias SQL | Definição |
|-----------|-----------|
| `visitantes_com_sinal` | Visitantes distintos com tipo/combo de sinal |
| `combinacao_sinais` | Padrão de sinais por visitante |
| `pct_visitantes_intencao` | Participação do sinal/combo no universo de intenção |
| `media_perguntas_antes_intencao` | Perguntas antes do primeiro sinal |
| `pct_com_recomendacao_antes_intencao` | Visitantes com recomendação prévia ao primeiro sinal |
| `pct_conversa_profunda_antes_intencao` | ≥2 perguntas antes do primeiro sinal |
| `taxa_visitantes_intencao_pos_recomendacao` | Visitantes com intenção / visitantes com recomendação (categoria) |
| `rank_intencao` | Ranking estratégico por taxa ou consistência |
| `taxa_intencao_cohort` | Visitantes com intenção / cohort |
| `sinal_tendencia_intencao` | `aumentando` / `diminuindo` / `estavel` |

---

## 5. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| **1** | `sql/patch-54-query1-signal-ranking.sql` | Ranking e combinações de sinais |
| **2** | `sql/patch-54-query2-behavioral-antecedents.sql` | Antecedentes do primeiro sinal |
| **3** | `sql/patch-54-query3-intent-strength.sql` | Força por categoria/produto |
| **4** | `sql/patch-54-query4-intent-trends-cohort.sql` | Cohort + tendência janelas |

Arquivo completo: `analytics-buying-intent-strategic.sql`

---

## 6. Premissas

- Filtro produção: [analytics-production-scope.sql](./analytics-production-scope.sql)
- Primeiro sinal = `MIN(created_at)` por `visitor_id` nos eventos de intenção
- Cohort = `first_active_day` (EXECUTIVE_METRICS §3.5)
- Sem modelos estatísticos — métricas rastreáveis a eventos reais

---

## 7. Limitações

| Limitação | Impacto |
|-----------|---------|
| `offer_click` sem `user_id` / `product_name` | Segmento autenticado e produto subestimados |
| Correlação ≠ causalidade | Antecedentes são observacionais, não experimentais |
| Poucos visitantes com intenção | Amostras pequenas em produção inicial |
| Profundidade via contagem de perguntas | Proxy — não exige `conversation_id` |
| Query 4 janela anterior vazia | Base jovem (<14 dias) |

---

## 8. Relação com PATCH 4.4

| PATCH 4.4 | PATCH 5.4 |
|-----------|-----------|
| Volume por produto/categoria | Comportamento e taxa por visitante |
| CTR operacional | Antecedentes e combinações de sinais |
| Evolução diária de eventos | Tendência e cohort de intenção |

---

*PATCH 5.4 — Buying Intent Analytics Estratégico*
