# Data Layer Statistics — PATCH 6.3

**Cobertura:** [COVERAGE_ANALYTICS.md](./COVERAGE_ANALYTICS.md) (PATCH 6.1 — o que está coberto)  
**Qualidade:** [DATA_QUALITY_ANALYTICS.md](./DATA_QUALITY_ANALYTICS.md) (PATCH 6.2 — confiabilidade)

---

## 1. Objetivo

Responder: **"Qual é o tamanho, a composição, a distribuição, a concentração e a evolução determinável do Data Layer atualmente?"**

Mede exclusivamente **estatísticas do catálogo** — **NÃO reimplementa** cobertura (6.1), qualidade (6.2) nem uso em runtime (6.4).

| Camada | Pergunta | Patch |
|--------|----------|-------|
| **Cobertura** | O catálogo cobre o necessário? | 6.1 |
| **Qualidade** | Os dados existentes são confiáveis? | 6.2 |
| **Estatísticas** | Como o inventário está estruturado? | **6.3 Data Layer Statistics** |
| **Uso** | A MIA usa essa cobertura? | 6.4 (futuro) |

---

## 2. Regra permanente da Fase 6 (absoluto + relativo)

| Coluna | Significado |
|--------|-------------|
| `valor_absoluto` | Quantidade ou valor da métrica |
| `valor_relativo` | Proporção (`valor_absoluto / registros_total`) quando aplicável |
| `registros_total` | Denominador rastreável |
| `referencia_denominador` | Texto explícito do denominador |
| `amostra_analisavel` | Tamanho da amostra para estatísticas técnicas |

Quando não existir denominador válido: retornar `NULL` e documentar em `limitacao`.

**Sem score agregado arbitrário** — painel por dimensões separadas.

> **Participação no Data Layer ≠ market share.** Composição interna do catálogo não equivale a participação de mercado.

---

## 3. Delta em relação aos outros patches

### PATCH 6.1 (não duplicar)

- Não usar: `status_cobertura`, `prioridade_expansao`, `referencia_comercial`, ranking de expansão
- Pode reutilizar denominadores (47 central, 505 phone detail) como contexto estatístico

### PATCH 6.2 (não duplicar)

- Não reauditar duplicações, conflitos, integridade como diagnóstico
- Proveniência aqui = **distribuição composicional**, não classificação de qualidade

### PATCH 6.4 (não invadir)

- Sem consultas de usuário, fallback, efetividade ou instrumentação runtime

---

## 4. Definições

| Termo | Definição |
|-------|-----------|
| **Registro** | Linha em `product_specs`, `phone_specs` ou `notebook_specs` |
| **Central** | `product_specs` — única fonte de `searchUniversalDataLayer()` |
| **Detail** | `phone_specs` / `notebook_specs` — hidratação via `detail_id` |
| **Modelo canônico** | `official_name` distinto em `phone_specs` |
| **Variante** | Registros detail com mesmo `official_name` e RAM/storage distintos |
| **Exposição** | Detail ligado a central ativo — métrica estatística, não prioridade comercial |

**Limitação:** Não somar registros entre tabelas como “total de produtos únicos” sem chave lógica confiável.

---

## 5. Tabelas analisadas

| Tabela | Papel |
|--------|-------|
| `product_specs` | Central · runtime |
| `phone_specs` | Detail phone |
| `notebook_specs` | Detail notebook |

**Read-only** — sem migrations, runtime ou correções.

---

## 6. Consultas SQL

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| 1 | `patch-63-query1-inventory-category.sql` | Inventário · categoria · exposição central/detail |
| 2 | `patch-63-query2-brand-family-concentration.sql` | Marca · família · concentração · diversidade |
| 3 | `patch-63-query3-technical-attributes.sql` | Atributos técnicos · faixas · variantes |
| 4 | `patch-63-query4-temporal-panel-insights.sql` | Temporal · proveniência · painel · insights |

Arquivo completo: [analytics-data-layer-statistics.sql](./analytics-data-layer-statistics.sql)

---

## 7. Faixas técnicas (phone)

Definidas após auditoria dos formatos reais (`ram_gb`, `storage_gb` numéricos):

**RAM:** até 4 GB · acima de 4 até 8 · acima de 8 até 12 · acima de 12 GB  
**Armazenamento:** até 64 · 64–128 · 128–256 · 256–512 · acima de 512 GB

Registros sem valor → faixa `(sem valor)`.

---

## 8. Concentração

Métricas calculadas sobre marcas no central ativo por categoria:

- `top1_participacao` · `top3_participacao`
- `entidades_para_50pct` · `entidades_para_80pct`

Quando universo < 3 entidades: `limitacao` documentada.

---

## 9. Capacidade histórica

Classificação: **`apenas_timestamps_estado_atual`**

- Catálogo **não possui** `created_at` / `updated_at`
- Proxies temporais: `last_verified_at`, `release_year` (phone)
- Não reconstruir snapshots passados neste patch

---

## 10. Estatísticas técnicas

Para atributos numéricos: `amostra`, `minimo`, `maximo`, `media`, `mediana`, `p25`, `p75`.

Sempre apresentar amostra junto à média — mediana incluída para distribuições assimétricas.

---

## 11. Testes

```bash
npm run test:mia:analytics:patch-63:data-layer-statistics
npm run test:mia:analytics:patch-63:prod-validation
```

Regressões: PATCH 6.1, 6.2, 4.5, 5.5.

---

*PATCH 6.3 — Data Layer Statistics — read-only · Fase 6*
