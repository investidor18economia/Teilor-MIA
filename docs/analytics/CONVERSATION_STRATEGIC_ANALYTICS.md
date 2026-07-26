# Conversation Analytics Estratégico — PATCH 5.2

**Status:** Oficial — Analytics Estratégico (Fase 5)  
**SQL:** [analytics-conversation-strategic.sql](./analytics-conversation-strategic.sql)  
**Identidade:** [CONVERSATION_ID.md](./CONVERSATION_ID.md) · [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md)  
**Métricas operacionais:** [analytics-executive-dashboard.sql](./analytics-executive-dashboard.sql) (PATCH 4.1 — **não substituído**)

---

## 1. Objetivo

Transformar eventos conversacionais em **inteligência sobre comportamento** — profundidade, recorrência, modalidade (texto/imagem) e evolução para recomendações.

| Camada | Pergunta | Patch |
|--------|----------|-------|
| **Operacional** | Quantas conversas aconteceram? | 4.1 Executive Dashboard |
| **Estratégica** | Como os usuários conversam com a MIA? | **5.2 Conversation Analytics** |

---

## 2. Delta em relação à Fase 4 (obrigatório)

### O que já foi entregue na Fase 4

| Patch | Métrica / análise | Onde |
|-------|-------------------|------|
| **4.1** | `conversas_unicas` — volume de threads | Executive Dashboard |
| **4.1** | `perguntas` / volume diário | Executive Query 2 |
| **4.1** | Snapshot operacional (sessões, conversas, taxa autenticação) | Query 1 |
| **4.3** | Funil por segmento visitante vs autenticado | Conversion Dashboard Q3 |
| **1.3** | `perguntas_recebidas` totais | `analytics-overview.sql` |
| **4.4** | Perguntas por categoria (volume) | Products Dashboard Q3 |

### O que NÃO será reimplementado (PATCH 5.2)

- `conversas_unicas` (COUNT DISTINCT `conversation_id`)
- Contagem bruta de `mia_question_sent` / `perguntas_recebidas`
- Funil de conversão por segmento (PATCH 4.3)
- Ranking de categorias por volume (PATCH 4.4)
- Redefinição de métricas canônicas

### O que passa a existir apenas na Fase 5 (PATCH 5.2)

| Análise | Query |
|---------|-------|
| Profundidade média/mediana de conversas | 1 |
| Distribuição de perguntas por conversa | 2 |
| % conversas profundas (≥2 perguntas) | 1, 4 |
| % conversas que evoluem para recomendação / intenção | 1, 4 |
| % perguntas com imagem vs texto | 1, 3, 4 |
| Intervalo médio entre perguntas (segundos) | 1, 4 |
| Recorrência de conversas por visitante/usuário | 3 |
| Comparação comportamental anonimo vs autenticado | 3 |
| Tendências diárias de engajamento conversacional | 4 |

---

## 3. Métricas reutilizadas

| Conceito | Fonte | Uso no PATCH 5.2 |
|----------|-------|------------------|
| `conversation_id` | CONVERSATION_ID · EXECUTIVE_METRICS §5.2 | Agrupamento de threads |
| `mia_question_sent` | Event Contract §7 | Profundidade · imagem |
| `mia_recommendation_shown` | Event Contract | Evolução para recomendação |
| Eventos de intenção | `offer_click`, `favorite_created`, `price_alert_created` | Conversas com intenção |
| `metadata.has_image` | EVENT_FIELD_SPECIFICATION | Texto vs imagem |
| `visitor_id` / `user_id` | Identity Layer | Recorrência · segmentos |

---

## 4. Métricas estratégicas derivadas (Fase 5)

| Alias SQL | Definição |
|-----------|-----------|
| `media_perguntas_por_conversa` | Média de `mia_question_sent` por `conversation_id` |
| `mediana_perguntas_por_conversa` | Mediana de perguntas por conversa |
| `pct_conversas_profundas` | Conversas com ≥2 perguntas |
| `pct_conversas_com_recomendacao` | Conversas com ≥1 `mia_recommendation_shown` |
| `pct_conversas_com_intencao_compra` | Conversas com ≥1 evento de intenção |
| `pct_perguntas_com_imagem` | Perguntas com `metadata.has_image = true` |
| `media_intervalo_segundos_entre_perguntas` | Média de Δt entre perguntas consecutivas na mesma conversa |
| `faixa_profundidade` | Bucket: `1_pergunta` · `2_a_3_perguntas` · `4_ou_mais_perguntas` |
| `media_conversas_por_entidade` | Média de conversas por visitante ou usuário |
| `pct_entidades_multiplas_conversas` | % visitantes/usuários com ≥2 conversas |
| `delta_media_perguntas_dia_anterior` | Variação diária da profundidade média |

`amostra_conversas` em Query 1 é **tamanho amostral para interpretação estatística** — não substitui `conversas_unicas` operacional.

---

## 5. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| **1** | `sql/patch-52-query1-depth-snapshot.sql` | Perfil comportamental agregado |
| **2** | `sql/patch-52-query2-depth-distribution.sql` | Distribuição por faixa de profundidade |
| **3** | `sql/patch-52-query3-recurrence-segments.sql` | Recorrência + segmento anonimo/autenticado |
| **4** | `sql/patch-52-query4-daily-engagement-trends.sql` | Tendências diárias comportamentais |

Arquivo completo: `analytics-conversation-strategic.sql`

---

## 6. Premissas

- Apenas eventos com `conversation_id IS NOT NULL` entram nas análises conversacionais
- Eventos analisados: `mia_question_sent`, `mia_recommendation_shown`, `offer_click`, `favorite_created`, `price_alert_created`
- Filtro produção: [analytics-production-scope.sql](./analytics-production-scope.sql)
- Fuso: UTC
- Segmento autenticado: conversa com ≥1 evento com `user_id IS NOT NULL`

---

## 7. Limitações

| Limitação | Impacto |
|-----------|---------|
| `conversation_id` ausente em dados pré-PATCH 3.2 | Conversas históricas excluídas |
| `conversation_id` não sobrevive reload | Recorrência subestima continuidade real |
| Sem `turn_id` | Não distingue turnos individuais dentro da conversa |
| Intervalo entre perguntas | Proxy via timestamps — não inclui tempo de resposta da MIA isoladamente |
| Query 4 por `dia_inicio_conversa` | Conversas iniciadas no dia — profundidade final pode evoluir no mesmo dia |
| `offer_click` sem `user_id` | Segmento autenticado pode subcontar intenção |
| Base jovem | Amostras pequenas — interpretação cautelosa |

---

## 8. Relação com PATCH 4.1 / 4.3

| PATCH 4.x | PATCH 5.2 |
|-----------|-----------|
| `conversas_unicas` (volume) | Profundidade e distribuição |
| Perguntas no funil (volume) | Profundidade média e recorrência |
| Segmento no funil de conversão | Comportamento conversacional por segmento |

**Regra:** volume operacional permanece no Executive/Conversion Dashboard. Comportamento conversacional vive em `analytics-conversation-strategic.sql`.

---

*PATCH 5.2 — Conversation Analytics Estratégico*
