# Data Layer Quality Analytics — PATCH 6.2

**Operacional:** [DATA_QUALITY_DASHBOARD.md](./DATA_QUALITY_DASHBOARD.md) (PATCH 4.5 — **domínio diferente**: instrumentação Analytics)

**Cobertura:** [COVERAGE_ANALYTICS.md](./COVERAGE_ANALYTICS.md) (PATCH 6.1 — **domínio diferente**: o que o catálogo cobre)

---

## 1. Objetivo

Responder: **"Os dados que já existem no Data Layer são completos, consistentes, válidos, rastreáveis e seguros para serem utilizados pela MIA?"**

Mede exclusivamente **qualidade do catálogo** — **NÃO reimplementa** cobertura (6.1), estatísticas gerais (6.3) nem uso em runtime (6.4).

| Camada | Pergunta | Patch |
|--------|----------|-------|
| **Instrumentação Analytics** | Os eventos estão bem preenchidos? | 4.5 Data Quality Dashboard |
| **Cobertura Data Layer** | O catálogo cobre o necessário? | 6.1 Coverage Analytics |
| **Qualidade Data Layer** | Os dados existentes são confiáveis? | **6.2 Data Quality Analytics** |
| **Estatísticas Data Layer** | Como o inventário se distribui? | 6.3 (futuro) |
| **Uso Data Layer** | A MIA usa essa cobertura? | 6.4 (futuro) |

---

## 2. Regra permanente da Fase 6 (absoluto + relativo)

Toda métrica deve apresentar, quando tecnicamente possível:

| Coluna | Significado |
|--------|-------------|
| `registros_afetados` | Quantidade absoluta do problema ou preenchimento |
| `registros_total` | Denominador rastreável |
| `pct_registros_afetados` | Proporção relativa (`registros_afetados / registros_total`) |
| `referencia_denominador` | Texto explícito do denominador |

Quando não existir denominador válido: retornar `NULL` e documentar a limitação. **Nunca** criar percentuais artificiais.

**Sem score único arbitrário.** Consolidação via painel dimensional (`painel_dimensional`) — dimensões separadas, nunca média ponderada inventada.

---

## 3. Delta em relação aos outros patches

### PATCH 4.5 (não duplicar)

- Domínio: `analytics_events`, payloads, identidade, contratos de instrumentação
- Aliases: `cobertura_visitor_id`, volume de eventos, catálogo de eventos

### PATCH 6.1 (não duplicar)

- Domínio: cobertura por categoria, marca, família, lacunas comerciais, prioridade de expansão
- Aliases proibidos neste patch: `status_cobertura`, `prioridade_expansao`, `pct_exposicao_runtime_sobre_detail`, `referencia_comercial`
- Dados do 6.1 podem ser usados apenas como **denominador ou contexto**

### PATCH 6.3 (não invadir)

- Inventário geral, distribuições, evolução temporal, concentração, estatísticas consolidadas

### PATCH 6.4 (não invadir)

- Uso real, fallback, efetividade, comportamento em runtime — requer instrumentação futura

---

## 4. Tabelas auditadas

Conforme runtime (`searchUniversalDataLayer()`, `getProductDetailSpecsFromSupabase()`):

| Tabela | Papel |
|--------|-------|
| `product_specs` | Catálogo central (runtime) |
| `phone_specs` | Detail — categoria `phone` |
| `notebook_specs` | Detail — categoria `notebook` |

**Aliases:** coluna JSON `aliases` em `product_specs` e `phone_specs` — não existe tabela separada de aliases.

**Read-only:** nenhuma migration, alteração de runtime ou correção de dados neste patch.

---

## 5. Classificação de campos

| Classe | Critério |
|--------|----------|
| `obrigatorio_runtime` | Necessário para identificação ou exposição via `searchUniversalDataLayer()` |
| `importante` | Essencial para qualidade de recomendação (specs técnicas, vínculo detail) |
| `opcional` | Melhora busca/rastreabilidade; ausência não quebra runtime |

Campos opcionais **não** são automaticamente classificados como erro.

---

## 6. Dimensões de qualidade

| Dimensão | `dimensao_qualidade` | Query |
|----------|---------------------|-------|
| Completude | `completude` | 1 |
| Unicidade (duplicações + aliases) | `unicidade` | 2 |
| Integridade referencial | `integridade` | 3 |
| Validade | `validade` | 3 |
| Consistência (conflitos) | `consistencia` | 3 |
| Proveniência | `proveniencia` | 4 |
| Atualidade determinável | `atualidade` | 4 |
| Painel dimensional | `painel_dimensional` | 4 |
| Ranking de correção | `ranking_problema` | 4 |

---

## 7. Critérios de severidade

| Severidade | Critério |
|------------|----------|
| `critico` | Pode quebrar identificação, detail incorreto ou recomendação errada |
| `alto` | Reduz significativamente confiabilidade ou afeta campos essenciais |
| `medio` | Prejudica qualidade; impacto limitado no runtime |
| `baixo` | Cosmético, padronização, campos secundários |
| `informativo` | Métrica descritiva (ex.: cobertura de proveniência) |

Heurísticas (bateria, value_score, staleness 180d) são marcadas com `confianca = 'heuristica'` — **não** são erro confirmado automaticamente.

---

## 8. Confiança de duplicação

| Valor | Significado |
|-------|-------------|
| `duplicacao_confirmada` | Mesma chave lógica repetida (GROUP BY + HAVING count > 1) |
| `duplicacao_provavel` | Conflito de atributos sugerindo duplicata lógica |
| `nao_conclusiva` | Alias vazio — limitação de identificação, não duplicata confirmada |
| `integridade_confirmada` | FK ou divergência central/detail verificável |
| `validacao_confirmada` | Violação de constraint ou intervalo documentado |
| `heuristica` | Limite derivado de domínio ou script existente (`audit-data-layer.js`) |

---

## 9. Consultas SQL

| Arquivo | Conteúdo |
|---------|----------|
| [analytics-data-layer-quality.sql](./analytics-data-layer-quality.sql) | Arquivo completo (4 queries) |
| [sql/patch-62-query1-completeness.sql](./sql/patch-62-query1-completeness.sql) | Completude por campo e registro |
| [sql/patch-62-query2-duplications-aliases.sql](./sql/patch-62-query2-duplications-aliases.sql) | Duplicações e aliases |
| [sql/patch-62-query3-integrity-invalid-conflicts.sql](./sql/patch-62-query3-integrity-invalid-conflicts.sql) | Integridade · valores inválidos · conflitos |
| [sql/patch-62-query4-provenance-panel-ranking.sql](./sql/patch-62-query4-provenance-panel-ranking.sql) | Proveniência · atualidade · painel · ranking |

**Execução produção:**

```bash
npm run test:mia:analytics:patch-62:prod-validation
```

---

## 10. Limitações conhecidas

1. **Notebook central ausente** — integridade central/detail para notebook limitada a inventário detail (contexto 6.1).
2. **Details órfãos** — medidos como cobertura no 6.1; aqui analisados apenas como integridade de FK quando há vínculo central.
3. **Proveniência parcial** — schema suporta `source_1`, `source_2`, `last_verified_at`; não há URL/fornecedor/responsável em todas as tabelas.
4. **Atualidade** — heurística de 180 dias apenas quando `last_verified_at` é parseável (`YYYY-MM-DD`); idade isolada não implica desatualização comprovada.
5. **Sem pesquisa externa** — não valida specs contra fontes comerciais externas neste patch.

---

## 11. Testes

```bash
npm run test:mia:analytics:patch-62:data-quality-analytics
npm run test:mia:analytics:patch-62:prod-validation
```

Regressões relacionadas: PATCH 4.5, 6.1, 5.5.

---

*PATCH 6.2 — Data Layer Quality Analytics — read-only · Fase 6*
