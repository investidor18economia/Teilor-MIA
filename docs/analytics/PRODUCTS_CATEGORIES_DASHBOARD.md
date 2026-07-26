# Products & Categories Dashboard — PATCH 4.4

**Status:** Oficial — Dashboard de Produtos e Categorias (Fase 4)  
**SQL:** [analytics-products-categories-dashboard.sql](./analytics-products-categories-dashboard.sql)  
**Métricas base:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) · [CONVERSION_DASHBOARD.md](./CONVERSION_DASHBOARD.md)

---

## 1. Objetivo

Fornecer inteligência sobre **produtos**, **categorias** e **intenção de compra** utilizando exclusivamente colunas existentes em `analytics_events` (Event Contract v1).

Este dashboard **não** introduz novos eventos, dimensões ou alterações arquiteturais.

---

## 2. Dimensões existentes (EVENT_FIELD_SPECIFICATION)

| Dimensão | Coluna | Eventos com dado |
|----------|--------|------------------|
| Produto | `product_name` | `mia_recommendation_shown`, `offer_click`, `favorite_created`, `price_alert_created` |
| Produto (ID) | `product_id` | Idem (quando disponível — exibido como atributo, não chave de agrupamento) |
| Marca | `product_brand` | Idem (atributo) |
| Categoria | `category` | `mia_question_sent` + eventos de produto (via `detectAnalyticsCategory`) |

**Categorias excluídas:** `price_alert_email`, `price_alert_email_test`, `price_alert_e2e_test` (server-side / QA).

---

## 3. Métricas reutilizadas

| Métrica / padrão | Origem | Uso |
|------------------|--------|-----|
| Filtro produção | analytics-production-scope | Todas as queries |
| 7 eventos MIA (subset produto) | EXECUTIVE_METRICS §2 | Escopo |
| Fuso UTC | EXECUTIVE_METRICS §6 | `activity_day` |
| `sinais_intencao_compra` | analytics-buying-intent.sql | `offer_click` + `favorite_created` + `price_alert_created` |
| `taxa_clique_recomendacao` | analytics-ctr.sql / CONVERSION_DASHBOARD | `cliques / recomendacoes` |
| `taxa_conversao_pergunta_recomendacao` | CONVERSION_DASHBOARD Query 2 | Por categoria |
| `taxa_conversao_recomendacao_clique` | CONVERSION_DASHBOARD Query 2 | Por categoria |

---

## 4. Métricas derivadas (PATCH 4.4)

| Alias | Fórmula | Query |
|-------|---------|-------|
| `total_aparicoes` | `COUNT(*)` em eventos com `product_name` | 1 |
| `total_recomendacoes` / `total_cliques` / etc. | `COUNT(*) FILTER` por `event_name` | 1, 2 |
| `total_eventos_categoria` | Distribuição de eventos por `category` | 2 |
| `taxa_intencao_pos_recomendacao` | `sinais_intencao_compra / total_recomendacoes` | 2 |
| Evolução diária | Agregação por `activity_day` | 3, 4 |

---

## 5. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| **1** | `sql/patch-44-query1-product-ranking.sql` | Ranking de produtos (top 50) |
| **2** | `sql/patch-44-query2-category-intelligence.sql` | Inteligência por categoria |
| **3** | `sql/patch-44-query3-daily-category.sql` | Evolução diária por categoria |
| **4** | `sql/patch-44-query4-daily-product.sql` | Evolução diária por produto |

Arquivo completo: `analytics-products-categories-dashboard.sql`

---

## 6. Premissas

- Agrupamento por **`product_name`** (espelha PATCH 1.3 `analytics-products.sql`)
- Agrupamento por **`category`** frontend (espelha PATCH 1.3 `analytics-categories.sql`)
- Eventos sem `product_name` ou `category` excluídos das queries respectivas

---

## 7. Limitações

- Herda [EXECUTIVE_METRICS.md §7](./EXECUTIVE_METRICS.md)
- `product_name` / `category` podem ser **NULL** — subcontagem inevitável
- `category` em eventos de produto pode divergir da categoria inferida na pergunta
- CTR por produto é **agregado** (não pareado sessão-a-sessão) — mesma limitação de `analytics-ctr.sql`
- `product_id` nem sempre populado — ranking usa `product_name`
- `offer_click` pode omitir `product_name` em alguns registros históricos
- Categorias `unknown` incluídas quando presentes

---

## 8. Relação com PATCH 1.3

| PATCH 1.3 | PATCH 4.4 |
|-----------|-----------|
| `analytics-products.sql` (2 queries separadas) | Query 1 unificada + métricas de intenção |
| `analytics-categories.sql` (perguntas) | Query 2 expandida + conversão |
| — | Evolução diária (Queries 3–4) |

---

*PATCH 4.4 — Dashboard de Produtos e Categorias*
