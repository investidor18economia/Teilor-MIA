# PATCH 6.1 — Data Layer Coverage Analytics — Relatório de Auditoria

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**SQL:** [analytics-data-layer-coverage.sql](./analytics-data-layer-coverage.sql)  
**Documentação:** [COVERAGE_ANALYTICS.md](./COVERAGE_ANALYTICS.md)

---

## 1. Resumo executivo

PATCH 6.1 responde: **"O que o Data Layer realmente cobre hoje e quais são suas maiores lacunas?"**

Entrega **4 queries read-only** sobre `product_specs`, `phone_specs` e `notebook_specs` — sem alteração de arquitetura, runtime ou Analytics Events.

**Validação:** **74/74** checks (57 unit + 17 produção) — **0 falhas**. Regressões PATCH 4.5 e 5.5: **146/146** — **0 falhas**.

**Deploy:** não aplicável — SQL read-only contra catálogo Supabase.

---

## 2. Cobertura por categoria (Produção 2026-07-22)

| Categoria | Status | Central ativo | Detail total | Detail órfãos | Exposição runtime |
|-----------|--------|---------------|--------------|---------------|-------------------|
| **phone** | presente | 47 | 505 | 458 | **9,31%** |
| **notebook** | latente_sem_central | 0 | 10 | 10 | **0%** |
| **12 categorias** (computer, tv, …) | ausente | 0 | — | — | — |

**Interpretação:** `searchUniversalDataLayer()` só enxerga `product_specs`. Há **458 smartphones** em `phone_specs` não expostos ao runtime. **Notebook** possui inventário detail (10) mas zero registros centrais.

---

## 3. Cobertura por marca (phone · central ativo)

| Marca | Modelos | Famílias | Share categoria |
|-------|---------|----------|-----------------|
| Samsung | 35 | 12 | 74,5% |
| Apple | 2 | 1 | 4,3% |
| Motorola | 2 | 1 | 4,3% |
| Xiaomi | 2 | 1 | 4,3% |
| Realme | 1 | 1 | 2,1% |

**Concentração:** Samsung concentra ~3/4 dos modelos ativos no catálogo central.

---

## 4. Cobertura por família (destaques)

Famílias Samsung com maior volume central: Galaxy A5x (5), Galaxy S24/S25/S20/S21/S (4 cada).

Famílias com **referência comercial ausente** no central: Galaxy Z, Galaxy M, Motorola Edge (detail existe — 19 modelos Edge em `phone_specs` — mas 0 no central).

---

## 5. Cobertura de atributos (phone · runtime)

Atributos técnicos monitorados (12): RAM, storage, bateria, chipset, tela, refresh, câmera, 5G, NFC, scores.

**Produção:** 100% de preenchimento nos 47 modelos ativos phone (join central+detail completo).

Notebooks: cobertura medida no inventário `notebook_specs` (10 registros) — central ausente.

---

## 6. Cobertura comercial

Linhas de referência declaradas na Query 4 (`referencia_comercial`):

| Linha | Status | Central | Detail compatível |
|-------|--------|---------|-------------------|
| Samsung Galaxy S/A/M/Z | S/A presentes · M/Z ausentes | parcial | variável |
| Motorola Moto G | presente | 2 | — |
| Motorola Edge | latente | 0 | 19 |
| Apple iPhone | presente | 2 | — |
| Xiaomi Redmi | presente | 2 | — |
| Xiaomi POCO | ausente | 0 | 0 |
| Notebook (5 marcas BR) | latente_sem_central | 0 | 10 total |

---

## 7. Lacunas encontradas

1. **Notebook inteiro** — runtime detecta categoria; detail existe; `product_specs` vazio.
2. **458 phone_specs órfãos** — 90,7% do inventário phone não exposto ao runtime.
3. **Galaxy Z / Galaxy M / POCO** — linhas comerciais de referência sem central.
4. **Motorola Edge** — inventário detail substancial sem entrada central.
5. **12 categorias detectadas** (tv, console, …) — sem catálogo.

---

## 8. Ranking de prioridades (Query 4)

| Prioridade | Itens (amostra) | Justificativa |
|------------|-----------------|---------------|
| **Alta** | Notebook (categoria + 5 marcas) | Detail latente — zero exposição runtime |
| **Alta** | Motorola Edge | 19 modelos detail · 0 central |
| **Alta** | Samsung Galaxy Z | Linha referência ausente |
| **Média** | Linhas phone parcialmente expostas | central < inventário detail |
| **Baixa** | Linhas presentes (Moto G, iPhone, Redmi) | Monitorar expansão |

---

## 9. Auditoria arquitetural

| Critério | Status |
|----------|--------|
| Read-only | ✅ |
| Sem migrations | ✅ |
| Sem alteração runtime | ✅ |
| Sem novos eventos Analytics | ✅ |
| Sem alteração de contratos | ✅ |
| Fonte: catálogo Supabase (não analytics_events) | ✅ |

---

## 10. Testes e regressões

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-61:coverage-analytics` | **57/57** ✅ |
| `test:mia:analytics:patch-61:prod-validation` | **17/17** ✅ |
| `test:mia:analytics:patch-45:data-quality-dashboard` | **54/54** ✅ |
| `test:mia:analytics:patch-55:phase5-final-audit` | **92/92** ✅ |

---

## 11. Limitações

- Referência comercial explícita na CTE — não exaustiva do mercado BR.
- Cobertura relativa = ratio técnico central/detail — não share de mercado.
- Categorias além de phone/notebook: apenas detecção runtime, sem tabela.
- Snapshot do dia — evolução temporal é escopo PATCH 6.3.

---

## 12. Próximo passo

**PATCH 6.2 — Data Quality Analytics** (duplicatas, conflitos, consistência — não cobertura).

---

*PATCH 6.1 — Data Layer Coverage Analytics · Relatório de auditoria*
