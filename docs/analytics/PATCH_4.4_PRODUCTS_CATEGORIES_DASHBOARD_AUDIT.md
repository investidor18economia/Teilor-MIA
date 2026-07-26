# PATCH 4.4 — Dashboard de Produtos e Categorias

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**SQL:** [analytics-products-categories-dashboard.sql](./analytics-products-categories-dashboard.sql)

---

## 1. Resumo executivo

PATCH 4.4 entrega consultas SQL de **inteligência de produtos e categorias** derivadas exclusivamente de colunas existentes em `analytics_events`.

**Nenhum evento novo**, contrato alterado ou mudança de runtime.

Consolida e expande `analytics-products.sql` e `analytics-categories.sql` (PATCH 1.3).

---

## 2. Etapa 1 — Auditoria

### Dimensões existentes

| Dimensão | Coluna | Status |
|----------|--------|--------|
| Produto | `product_name` | ✅ Event Contract v1 |
| ID produto | `product_id` | ✅ Atributo (nullable) |
| Marca | `product_brand` | ✅ Atributo (nullable) |
| Categoria | `category` | ✅ `detectAnalyticsCategory()` |

### Métricas do escopo

| Pergunta | Derivável? | Query |
|----------|------------|-------|
| Produtos mais frequentes | ✅ | 1 (`total_aparicoes`) |
| Mais recomendações / cliques / favoritos / alertas | ✅ | 1 |
| Categorias com maior interesse | ✅ | 2 (`total_perguntas`) |
| Conversão por categoria | ✅ | 2 (taxas reutilizadas 4.3) |
| CTR por produto | ✅ | 1, 4 |
| Intenção de compra | ✅ | 1, 2 (`sinais_intencao_compra`) |
| Distribuição por categoria | ✅ | 2 |
| Evolução diária categoria/produto | ✅ | 3, 4 |

### Limitações (não bloqueantes)

- `product_name` / `category` nullable — documentado
- CTR agregado (não pareado por sessão) — idem `analytics-ctr.sql`
- Sem dimensão de produto em `mia_question_sent` — interesse por categoria via `category` na pergunta

**Veredito:** ✅ Sem bloqueios — implementação autorizada.

---

## 3. Entregas

| Artefato | Descrição |
|----------|-----------|
| [analytics-products-categories-dashboard.sql](./analytics-products-categories-dashboard.sql) | 4 queries |
| [PRODUCTS_CATEGORIES_DASHBOARD.md](./PRODUCTS_CATEGORIES_DASHBOARD.md) | Documentação |
| `sql/patch-44-query1-product-ranking.sql` | Ranking produtos |
| `sql/patch-44-query2-category-intelligence.sql` | Categorias |
| `sql/patch-44-query3-daily-category.sql` | Evolução diária categoria |
| `sql/patch-44-query4-daily-product.sql` | Evolução diária produto |
| `scripts/test-mia-analytics-patch-44-products-categories-dashboard.js` | Auditoria local |
| `scripts/patch-44-production-validation.mjs` | Validação produção |

---

## 4. Validação

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-44:products-categories-dashboard` | **56/56** ✅ |
| `test:mia:analytics:sql-dashboards` | **170/170** ✅ |
| Regressões 4.1–4.3 | **159/159** ✅ |
| `test:mia:analytics:patch-44:prod-validation` | **11/11** ✅ |

### Produção (2026-07-22 UTC)

**Query 1 — top produto:** `iPhone 13` — 56 recomendações, 4 cliques, CTR 7,14%  
**Query 2 — top categoria:** `smartphones` — 120 perguntas, taxa pergunta→recomendação **59,17%**  
**Queries 3–4:** 34 linhas categoria / 33 linhas produto (evolução diária) ✅

---

## 5. Conformidade

| Requisito | Status |
|-----------|--------|
| `analytics_events` fonte única | ✅ |
| Dimensões Event Contract v1 | ✅ |
| Sem alteração arquitetural | ✅ |

---

## 6. Próximo passo

**PATCH 4.5 — Dashboard de Qualidade dos Dados** (após aprovação formal do 4.4)

---

*PATCH 4.4 — Dashboard de Produtos e Categorias · Relatório de auditoria*
