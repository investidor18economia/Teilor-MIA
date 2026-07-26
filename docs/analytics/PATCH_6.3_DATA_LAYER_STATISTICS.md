# PATCH 6.3 — Data Layer Statistics — Relatório de Auditoria

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**SQL:** [analytics-data-layer-statistics.sql](./analytics-data-layer-statistics.sql)  
**Documentação:** [DATA_LAYER_STATISTICS.md](./DATA_LAYER_STATISTICS.md)

---

## 1. Resumo executivo

PATCH 6.3 responde: **"Qual é o tamanho, a composição, a distribuição, a concentração e a evolução determinável do Data Layer atualmente?"**

Entrega **4 queries read-only** sobre `product_specs`, `phone_specs` e `notebook_specs` — sem alteração de arquitetura, runtime ou Analytics Events.

**Veredito técnico (produção 2026-07-22):** O Data Layer phone concentra **85,11%** do central em uma única marca; **90,69%** do inventário detail phone não está exposto ao runtime. Capacidade histórica classificada como **`apenas_timestamps_estado_atual`** — sem `created_at`/`updated_at` no catálogo.

**Validação:** **92/92** checks (66 unit + 26 produção) — **0 falhas**. Regressões 6.1, 6.2, 4.5, 5.5: **276/276** — **0 falhas**.

**Deploy:** não aplicável — SQL read-only.

---

## 2. Escopo analisado

| Camada | Registros (produção) |
|--------|----------------------|
| `product_specs` (total) | **47** (100% ativos) |
| `phone_specs` (detail) | **505** |
| `notebook_specs` (detail) | **10** |
| Central phone exposto | **47** |
| Detail phone ligado | **47** (9,31%) |
| Detail phone não ligado | **458** (90,69%) |

---

## 3. Inventário consolidado

| Métrica | Absoluto | Denominador |
|---------|----------|-------------|
| Categorias presentes (central) | **1** (phone) | 47 ativos |
| Marcas distintas (central) | **5** | 47 |
| Famílias distintas (central) | **16** | 47 |
| Modelos distintos (central) | **47** | 47 |
| Notebook detail | **10** | — (0 central) |

**Limitação:** Totais apresentados **por tabela** — sem deduplicação cross-table artificial.

---

## 4. Distribuição e concentração (phone · central)

| Métrica | Valor |
|---------|-------|
| Top 1 marca | **40 de 47** (**85,11%**) |
| Top 3 marcas | **44 de 47** (**93,62%**) |
| Marcas para 50% | **1** |
| Marcas para 80% | **1** |

> Participação no Data Layer **≠ market share**.

---

## 5. Atributos técnicos

Query 3 retornou **109 linhas** — estatísticas por atributo (`amostra`, `minimo`, `maximo`, `media`, `mediana`, `p25`, `p75`), faixas RAM/armazenamento e resumo de variantes por `official_name` em `phone_specs`.

Notebook: estatísticas sobre **10 registros** em `notebook_specs`.

---

## 6. Temporalidade e capacidade histórica

| Classificação | Valor |
|---------------|-------|
| Capacidade histórica | **`apenas_timestamps_estado_atual`** |
| Proxies | `last_verified_at`, `release_year` (phone) |
| `created_at` / `updated_at` | **Ausentes** no catálogo |

Query 4: **506 linhas** (distribuição mensal de verificação + release_year + proveniência por `source_1`).

---

## 7. Central versus detail (insight estatístico)

| Métrica | Absoluto | Relativo | Denominador |
|---------|----------|----------|-------------|
| Central phone ativo | **47** | **9,31%** | 505 phone_specs |
| Detail não exposto | **458** | **90,69%** | 505 phone_specs |

Objetivo: **estrutura quantitativa** — não ranking de expansão (PATCH 6.1).

---

## 8. Auditoria arquitetural

| Item | Status |
|------|--------|
| Read-only | ✅ |
| Migrations / runtime | ❌ Não alterados |
| analytics_events | ❌ Não consultado |
| Score agregado arbitrário | ❌ Não criado |

---

## 9. Testes e regressões

| Suite | Resultado |
|-------|-----------|
| PATCH 6.3 unit | **66/66** |
| PATCH 6.3 produção | **26/26** |
| Regressões | **276/276** |
| **Total** | **368/368** |

---

## 10. Limitações

1. Sem histórico real — apenas timestamps do estado atual  
2. Notebook sem camada central  
3. Variantes = registros detail — duplicação ≠ variante (PATCH 6.2)  
4. Composição interna ≠ participação de mercado  
5. DDL catálogo ausente no repo — schema inferido de runtime + analytics  

---

## 11. Próximos passos

1. Aprovação formal PATCH 6.3  
2. **PATCH 6.4 — Data Layer Usage & Effectiveness** (requer instrumentação)  

---

## Artefatos

| Artefato | Caminho |
|----------|---------|
| SQL principal | `docs/analytics/analytics-data-layer-statistics.sql` |
| Splits | `docs/analytics/sql/patch-63-query1..4-*.sql` |
| Doc | `docs/analytics/DATA_LAYER_STATISTICS.md` |
| Testes | `scripts/test-mia-analytics-patch-63-data-layer-statistics.js` |
| Prod | `scripts/patch-63-production-validation.mjs` |

```bash
npm run test:mia:analytics:patch-63:data-layer-statistics
npm run test:mia:analytics:patch-63:prod-validation
```

---

*PATCH 6.3 — aguardando aprovação formal · não iniciar PATCH 6.4 automaticamente*
