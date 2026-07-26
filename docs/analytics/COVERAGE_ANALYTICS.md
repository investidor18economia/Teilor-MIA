# Data Layer Coverage Analytics — PATCH 6.1

**Operacional:** [DATA_QUALITY_DASHBOARD.md](./DATA_QUALITY_DASHBOARD.md) (PATCH 4.5 — **não substituído**)

---

## 1. Objetivo

Responder: **"O que o Data Layer realmente cobre hoje e quais são suas maiores lacunas?"**

Mede exclusivamente **cobertura** do catálogo — **NÃO reimplementa** qualidade (6.2), estatísticas gerais (6.3) nem uso em runtime (6.4).

| Camada | Pergunta | Patch |
|--------|----------|-------|
| **Instrumentação Analytics** | Os eventos estão bem preenchidos? | 4.5 Data Quality Dashboard |
| **Cobertura Data Layer** | O catálogo cobre o necessário? | **6.1 Coverage Analytics** |
| **Qualidade Data Layer** | Os dados existentes são consistentes? | **6.2 Data Quality Analytics** |
| **Uso Data Layer** | A MIA usa essa cobertura? | 6.4 (futuro) |

---

## 2. Delta em relação às fases anteriores (obrigatório)

### O que PATCH 4.5 já entrega

- Cobertura de **campos em `analytics_events`** (`cobertura_visitor_id`, etc.)
- Catálogo de 17 eventos de instrumentação
- Integridade de tracking (duplicatas de sessão, timestamps)

### O que NÃO será reimplementado (PATCH 6.1)

- Qualquer query sobre `analytics_events`
- Aliases `cobertura_*` sobre colunas de eventos
- Duplicatas, conflitos, valores inválidos (6.2)
- Distribuições temporais / evolução (6.3)
- Data Layer vs fallback (6.4)

### O que existe apenas no PATCH 6.1

| Análise | Query |
|---------|-------|
| Cobertura por categoria (runtime vs central vs detail) | 1 |
| Cobertura por marca e família | 2 |
| Concentração de modelos + cobertura de atributos | 3 |
| Lacunas comerciais + cobertura relativa + priorização | 4 |

**Prefixo canônico:** métricas deste patch usam `modelos_*`, `pct_hidratacao_*`, `pct_detail_exposto_*`, `status_cobertura`, `prioridade_expansao` — nunca `cobertura_visitor_id` ou aliases do PATCH 4.5.

---

## 3. Tabelas utilizadas (descoberta automática)

Conforme `getProductDetailSpecsFromSupabase()` — `allowedTables = ["phone_specs", "notebook_specs"]`:

| Tabela | Papel |
|--------|-------|
| `product_specs` | Catálogo central — **única fonte de `searchUniversalDataLayer()`** |
| `phone_specs` | Detail table — categoria `phone` |
| `notebook_specs` | Detail table — categoria `notebook` |

Categorias detectadas pelo runtime (`detectProductCategory`) sem tabela detail aparecem em Query 1 com status `ausente`.

---

## 4. Métricas

| Alias | Definição |
|-------|-----------|
| `modelos_ativos` | Registros ativos em `product_specs` |
| `registros_detail` | Total na tabela detail da categoria |
| `registros_detail_orfaos` | Detail sem vínculo ativo em `product_specs` |
| `pct_hidratacao_detail_central` | Modelos central com `detail_id` / modelos ativos |
| `pct_detail_exposto_ao_runtime` | Detail vinculado / total detail |
| `status_cobertura` | `presente` · `parcial` · `latente_sem_central` · `ausente` |
| `pct_exposicao_runtime_sobre_detail` | Modelos central / inventário detail compatível (referência explícita) |
| `prioridade_expansao` | `prioridade_alta` · `prioridade_media` · `prioridade_baixa` (regras ordinais) |

---

## 5. Consultas SQL

| Query | Split | Conteúdo |
|-------|-------|----------|
| **1** | `sql/patch-61-query1-category-coverage.sql` | Categoria · runtime · detail |
| **2** | `sql/patch-61-query2-brand-family-coverage.sql` | Marca · família |
| **3** | `sql/patch-61-query3-model-attribute-coverage.sql` | Modelo · atributos |
| **4** | `sql/patch-61-query4-commercial-gaps-priority.sql` | Lacunas · relativa · priorização |

Arquivo completo: `analytics-data-layer-coverage.sql`

---

## 6. Cobertura relativa (Etapa 8.5)

Calculada **somente** quando existe referência objetiva:

- **Referência comercial:** linhas declaradas explicitamente na CTE `referencia_comercial` (Query 4) — não estimativa de mercado.
- **Exposição runtime:** `modelos_central / modelos_detail` para o mesmo padrão marca+família no inventário detail.

Quando `modelos_detail = 0`, `pct_exposicao_runtime_sobre_detail` é **NULL** — nunca percentual artificial.

---

## 7. Priorização (sem pesos arbitrários)

Regras ordinais em Query 4:

| Prioridade | Condição |
|------------|----------|
| **Alta** | Linha comercial ausente · detail latente sem central · notebook sem `product_specs` |
| **Média** | Cobertura parcial central vs detail |
| **Baixa** | Monitoramento — cobertura presente |

---

## 8. Limitações

| Limitação | Impacto |
|-----------|---------|
| Apenas tabelas existentes no Supabase | Categorias detectadas sem detail = `ausente` |
| Referência comercial explícita, não exaustiva | Linhas fora da CTE não aparecem em lacunas comerciais |
| Cobertura relativa ≠ share de mercado | Ratio técnico central/detail apenas |
| Atributos phone via join central+detail | Notebooks medidos no inventário detail (central pode estar vazio) |
| Read-only | Snapshot do dia — evolução é escopo 6.3 |

---

## 9. Arquitetura

- **100% read-only** — sem migrations, runtime, eventos ou contratos alterados
- Fonte: catálogo Supabase, não `analytics_events`

---

*PATCH 6.1 — Data Layer Coverage Analytics*
