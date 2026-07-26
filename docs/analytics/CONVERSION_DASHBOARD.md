# Conversion Dashboard — PATCH 4.3



**Status:** Oficial — Dashboard de Conversão (Fase 4)  

**SQL:** [analytics-conversion-dashboard.sql](./analytics-conversion-dashboard.sql)  

**Métricas base:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) — reutilização obrigatória



---



## 1. Objetivo



Medir a **jornada de conversão** do usuário na plataforma MIA — da chegada às ações de intenção de compra — utilizando exclusivamente os 7 eventos públicos em `analytics_events`.



Este dashboard **não** introduz novos eventos, contratos ou definições arquiteturais. Taxas de conversão e abandono são **métricas derivadas** sobre volumes oficiais.



---



## 2. Funil oficial (ordem EVENT_CONTRACT v1)



| Ordem | Etapa SQL | `event_name` | Papel |

|-------|-----------|--------------|-------|

| 1 | `sessoes_iniciadas` | `session_started` | Abertura de aba MIA |

| 2 | `perguntas_enviadas` | `mia_question_sent` | Pergunta enviada |

| 3 | `recomendacoes_exibidas` | `mia_recommendation_shown` | Recomendação exibida |

| 4 | `cliques_em_oferta` | `offer_click` | Clique em oferta |

| 5 | `favoritos_criados` | `favorite_created` | Favorito criado |

| 6 | `alertas_preco_criados` | `price_alert_created` | Alerta de preço criado |



`user_authenticated` não faz parte do funil linear — medido via segmento autenticado (Query 3) e `taxa_autenticacao` (EXECUTIVE_METRICS §5.3).



---



## 3. Métricas reutilizadas (PATCH 4.1)



| Métrica / padrão | Seção | Uso |

|------------------|-------|-----|

| Filtro produção | analytics-production-scope | Todas as queries |

| 7 eventos qualificantes | §2 | Escopo MIA |

| Fuso UTC | §6 | `activity_day` |

| `sessoes_iniciadas` | §5.1 (variante) | `COUNT(DISTINCT session_id)` em `session_started` |

| `eventos_perguntas` / `eventos_recomendacoes` / etc. | Executive Query 1 | Volumes por evento |

| `authenticated_users` | §4.5 | Query 3 |

| `taxa_autenticacao` | §5.3 | Derivável de Query 3 |



**Distinção:** `sessoes_unicas` (§5.1) conta sessões com **qualquer** evento qualificante. `sessoes_iniciadas` conta apenas `session_started` — adequado ao topo do funil.



---



## 4. Métricas derivadas (conversão — não alteram definições base)



### 4.1 Volumes de alcance (reach)



Por dia ou dia de referência:



| Alias | Fórmula |

|-------|---------|

| `visitantes` | `COUNT(DISTINCT visitor_id)` com evento da etapa |

| `sessoes` | `COUNT(DISTINCT session_id)` com evento da etapa |

| `eventos` | `COUNT(*)` do evento (espelha `eventos_*` do executive dashboard) |



### 4.2 Funil sequencial (jornada ordenada)



Primeira ocorrência de cada evento por `visitor_id` ou `session_id`; etapa N exige etapa N-1 com `created_at` anterior ou igual.



| Alias | Fórmula |

|-------|---------|

| `visitantes_sequenciais` | Visitantes que completaram etapa N na ordem |

| `sessoes_sequenciais` | Sessões que completaram etapa N na ordem |

| `taxa_conversao_visitante` | `visitantes_sequenciais(N) / visitantes_sequenciais(N-1)` |

| `taxa_conversao_sessao` | `sessoes_sequenciais(N) / sessoes_sequenciais(N-1)` |

| `abandono_visitante` | `1 - taxa_conversao_visitante` |

| `abandono_sessao` | `1 - taxa_conversao_sessao` |

| `conversao_acumulada_visitante` | `visitantes_sequenciais(N) / visitantes_sequenciais(1)` |

| `conversao_acumulada_sessao` | `sessoes_sequenciais(N) / sessoes_sequenciais(1)` |



### 4.3 CTR recomendação → clique (Query 2)



| Alias | Fórmula | Relação |

|-------|---------|---------|

| `taxa_clique_recomendacao` | `eventos_cliques_oferta / eventos_recomendacoes` | Espelha [analytics-ctr.sql](./analytics-ctr.sql) |



### 4.4 Segmentos (Query 3)



| Segmento | Entidade | Filtro |

|----------|----------|--------|

| `visitante` | `visitor_id` | Todos os visitantes |

| `usuario_autenticado` | `user_id` | `user_id IS NOT NULL` |



Taxas de conversão entre etapas usam alcance (reach) por segmento — não exigem ordenação temporal cross-segmento.



---



## 5. Consultas SQL



| Query | Arquivo split | Conteúdo |

|-------|---------------|----------|

| **1** | `sql/patch-43-query1-funnel-snapshot.sql` | Funil snapshot (dia ref) — reach + sequencial + taxas |

| **2** | `sql/patch-43-query2-daily-funnel.sql` | Evolução diária do funil + conversão acumulada |

| **3** | `sql/patch-43-query3-segment-comparison.sql` | Visitante vs usuário autenticado |



Arquivo completo: `analytics-conversion-dashboard.sql`



---



## 6. Premissas



- Filtro produção: [analytics-production-scope.sql](./analytics-production-scope.sql)

- Funil **linear** pós-recomendação: clique → favorito → alerta (ordem documentada; etapas 4–6 são ramificações de intenção em sequência analítica)

- Ordenação intra-entidade via `MIN(created_at)` por evento

- Dia de referência: último dia UTC com `visitor_id` qualificante



---



## 7. Limitações



- Herda [EXECUTIVE_METRICS.md §7](./EXECUTIVE_METRICS.md)

- `offer_click` sem `user_id` — segmento `usuario_autenticado` subestima cliques (§4.1 Active User)

- Funil sequencial strict não modela ramificações paralelas (favorito/alerta sem clique)

- Volumes reach incluem visitantes que pularam etapas intermediárias

- Base jovem pós-PATCH 3.1 — séries curtas em produção inicial

- **`session_started` ausente no dia de referência:** funil sequencial inicia em 0 enquanto outras etapas podem ter volume (sessão iniciada em dia anterior ou dados pré-tracking)

- `user_authenticated` pode ocorrer em qualquer ponto da jornada — fora do funil linear



---



## 8. Relação com patches anteriores



| PATCH 4.1 | PATCH 4.3 |

|-----------|-----------|

| Volumes de evento no snapshot | Reutilizados como `eventos_*` |

| `sessoes_unicas` | Distinto de `sessoes_iniciadas` |

| — | Funil sequencial + taxas de conversão |



| PATCH 4.2 | PATCH 4.3 |

|-----------|-----------|

| Crescimento temporal (DAU/WAU/MAU) | Conversão temporal (funil por dia) |



---



*PATCH 4.3 — Dashboard de Conversão*

