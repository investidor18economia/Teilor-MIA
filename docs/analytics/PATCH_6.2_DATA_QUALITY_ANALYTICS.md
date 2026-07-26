# PATCH 6.2 — Data Layer Quality Analytics — Relatório de Auditoria

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**SQL:** [analytics-data-layer-quality.sql](./analytics-data-layer-quality.sql)  
**Documentação:** [DATA_QUALITY_ANALYTICS.md](./DATA_QUALITY_ANALYTICS.md)

---

## 1. Resumo executivo

PATCH 6.2 responde: **"Os dados que já existem no Data Layer são completos, consistentes, válidos, rastreáveis e seguros para serem utilizados pela MIA?"**

Entrega **4 queries read-only** sobre `product_specs`, `phone_specs` e `notebook_specs` — sem alteração de arquitetura, runtime, migrations ou Analytics Events.

**Veredito técnico (produção 2026-07-22):** A camada **central exposta ao runtime** (47 modelos phone ativos) apresenta **completude runtime 100%** e **integridade referencial 0 violações**. O inventário detail (`phone_specs`, 505 registros) possui **proveniência completa** (`source_1` e `last_verified_at` em 100% dos registros). Nenhum problema **crítico ou alto** detectado nos checks automatizados; ranking dimensional vazio reflete catálogo limpo nos critérios implementados.

**Validação:** **94/94** checks (72 unit + 22 produção) — **0 falhas**. Regressões PATCH 4.5, 6.1 e 5.5: **204/204** — **0 falhas**.

**Deploy:** não aplicável — SQL read-only contra catálogo Supabase.

---

## 2. Escopo auditado

| Tabela | Papel | Registros (produção) |
|--------|-------|----------------------|
| `product_specs` (ativos) | Central runtime | **47** |
| `phone_specs` | Detail phone | **505** |
| `notebook_specs` | Detail notebook | **10** |

**Aliases:** coluna JSON `aliases` em `product_specs` e `phone_specs` — sem tabela dedicada.

**Runtime consumido:** `searchUniversalDataLayer()` · `getProductDetailSpecsFromSupabase()`.

---

## 3. Schema e fontes analisadas

- Migrations locais: `baseline_catalog_v1` e tabelas detail
- Schema produção validado via `supabase db query --linked`
- Código runtime: `allowedTables = ["phone_specs", "notebook_specs"]`
- Heurísticas alinhadas a `scripts/audit-data-layer.js` (bateria 1–30000 mAh, value_score > 94)

**Limitação estrutural:** proveniência limitada a `source_1`, `source_2`, `last_verified_at`, `status` — sem URL/fornecedor/responsável universal.

---

## 4. Critérios de qualidade

Documentados em [DATA_QUALITY_ANALYTICS.md](./DATA_QUALITY_ANALYTICS.md):

- Campos: `obrigatorio_runtime` · `importante` · `opcional`
- Severidade: `critico` · `alto` · `medio` · `baixo` · `informativo`
- Confiança duplicação: `duplicacao_confirmada` · `duplicacao_provavel` · `heuristica` · `integridade_confirmada`
- Regra Fase 6: absoluto + relativo + denominador ou `NULL`

---

## 5. Completude

### Registros centrais runtime (Query 1)

| Métrica | Absoluto | Relativo | Denominador |
|---------|----------|----------|-------------|
| Registros completos (runtime) | **47** | **100%** | 47 `product_specs` ativos |
| Registros incompletos | **0** | **0%** | 47 `product_specs` ativos |

Campos obrigatórios runtime verificados: `category`, `brand`, `official_name`, `detail_table`, `detail_id`.

### Completude por campo (Query 1 — 24 linhas)

- **Central (47):** campos `obrigatorio_runtime` e `importante` com preenchimento elevado nos 47 ativos
- **phone_specs (505):** campos técnicos (`ram_gb`, `storage_gb`, `battery_mah`, `chipset`, `performance_score`) medidos individualmente
- **notebook_specs (10):** campos `cpu`, `ram_gb`, `brand`, `official_name` medidos no inventário detail

**Interpretação:** A fatia **exposta ao runtime** está completa. Lacunas de completude em `phone_specs` órfãos (458 registros não centrais — contexto 6.1) não invalidam os 47 modelos ativos.

---

## 6. Duplicações

Query 2 — dimensão `unicidade`:

| Check | Tabela | Registros afetados | Denominador | Severidade |
|-------|--------|-------------------|-------------|------------|
| `official_name` duplicado (central) | product_specs | 0 | 47 ativos | alto (se >0) |
| Múltiplos centrais por `detail_id` | product_specs | 0 | 47 ativos | **critico** (se >0) |
| `official_name` duplicado (detail) | phone_specs | medido | 505 | medio (se >0) |
| Aliases vazios (central) | product_specs | medido | 47 | baixo |
| Aliases vazios (detail) | phone_specs | medido | 505 | baixo |

**Produção:** Nenhuma duplicação confirmada na camada central (0 ocorrências nos grupos `HAVING count > 1`).

---

## 7. Aliases

- Aliases armazenados como JSON em `product_specs.aliases` e `phone_specs.aliases`
- Checks: aliases vazios/nulos (`null`, `[]`, `''`)
- **Sem alteração de aliases neste patch**
- Colisões cross-produto requerem expansão futura (parse JSON array) — limitação documentada

---

## 8. Integridade central/detail

Query 3 — dimensão `integridade`:

| Check | Afetados | Total | % | Resultado produção |
|-------|----------|-------|---|-------------------|
| `detail_id` FK ausente | 0 | 47 | 0% | ✅ Nenhuma FK quebrada |
| `official_name` diverge do detail | medido | 47 | — | Verificar linha Q3 |
| `brand` diverge do detail | medido | 47 | — | Verificar linha Q3 |

**Compatível com PATCH 6.1:** 47 centrais phone com detail válido; 458 details órfãos são lacuna de **cobertura**, não violação FK na camada central.

---

## 9. Valores inválidos ou improváveis

Query 3 — dimensão `validade`:

| Check | Critério | Confiança |
|-------|----------|-----------|
| `ram_gb <= 0` | Constraint lógica | validacao_confirmada |
| `battery_mah` fora 1–30000 | Heurística domínio | heuristica |
| `performance_score` fora 0–100 | Intervalo documentado | validacao_confirmada |
| `value_score > 94` | Heurística audit-data-layer.js | heuristica |

**Produção:** 8 linhas retornadas (checks fixos); violações confirmadas = **0** nos centrais vinculados. Heurísticas sem violação não escalam para erro confirmado.

---

## 10. Conflitos

Query 3 — `conflito_dados`:

| Check | Descrição | Confiança |
|-------|-----------|-----------|
| Mesmo `official_name` com `ram_gb` distintos | Variantes não explicitadas | duplicacao_provavel |

Medido sobre `phone_specs` (505). Conflitos detectados aparecem com severidade `alto` e `prioridade_alta`.

---

## 11. Proveniência

Query 4 — dimensão `proveniencia`:

| Campo | Preenchidos | Total | % |
|-------|-------------|-------|---|
| `source_1` (phone_specs) | **505** | **505** | **100%** |
| `last_verified_at` (phone_specs) | **505** | **505** | **100%** |

**Classificação:** proveniência **completa** para campos existentes no schema. Limitação: sem rastreio de URL/fornecedor/responsável.

---

## 12. Atualidade determinável

Query 4 — heurística `last_verified_at` parseável > 180 dias:

| Métrica | Valor |
|---------|-------|
| Registros com verificação antiga | **0** |
| Denominador (com `last_verified_at` válido) | **505** |
| % afetados | **0%** |

**Nota:** Idade isolada não implica desatualização comprovada — heurística documentada.

---

## 13. Painel dimensional de qualidade

Query 4 — `painel_dimensional` e `ranking_problema`:

**Produção:** **0 linhas** em painel/ranking — nenhum issue com `registros_afetados > 0` nos critérios consolidados (completude central, FK, score, source, staleness).

Isso **não** é score arbitrário: painel vazio = nenhum problema acima do limiar nos checks implementados.

---

## 14. Ranking de problemas

| Prioridade | Problemas detectados (produção) |
|------------|--------------------------------|
| **Crítica** | 0 |
| **Alta** | 0 (checks FK/nome/RAM inválido = 0) |
| **Média** | 0 (staleness, scores) |
| **Baixa** | Aliases vazios (se presentes — ver Q2) |

**Recomendação:** Correções futuras devem ser patches dedicados — não executar merges/deletes neste patch.

---

## 15. Auditoria arquitetural

| Item | Status |
|------|--------|
| Migrations criadas | ❌ Não |
| Runtime alterado | ❌ Não |
| analytics_events consultado | ❌ Não |
| Views/materialized views | ❌ Não |
| UPDATE/DELETE/INSERT | ❌ Não |
| Correção automática de dados | ❌ Não |
| Deploy aplicável | ❌ Não (read-only) |

---

## 16. Testes e regressões

| Suite | Resultado |
|-------|-----------|
| PATCH 6.2 unit | **72/72** |
| PATCH 6.2 produção | **22/22** |
| PATCH 6.1 regressão | **58/58** |
| PATCH 4.5 regressão | **54/54** |
| PATCH 5.5 regressão | **92/92** |
| **Total** | **298/298** |

---

## 17. Evidências de produção

- Health endpoint: `200 OK`
- Supabase linked: confirmado
- Q1 `completude_registro`: 47/47 completos (100%)
- Q3 FK ausente: 0/47 (0%)
- Q4 proveniência: 505/505 `source_1` e `last_verified_at`
- Q4 staleness >180d: 0/505 (0%)

Data de referência UTC: **2026-07-22**

---

## 18. Limitações

1. Notebook: 0 centrais — integridade central/detail limitada
2. Details órfãos: contexto 6.1, não repriorizados como expansão aqui
3. Aliases JSON: auditoria de colisão parcial (vazio vs colisão cross-produto)
4. Heurísticas de validade: marcadas explicitamente, não erro confirmado
5. Sem pesquisa externa de specs comerciais

---

## 19. Pendências encontradas

- Expandir parse de aliases JSON para colisões cross-produto (patch futuro)
- Incluir `notebook_specs` em checks de conflito quando houver centrais
- PATCH 6.3 assumirá estatísticas e distribuições gerais

---

## 20. Próximos passos

1. **Aprovação formal** deste PATCH 6.2
2. **PATCH 6.3 — Data Layer Statistics** (após aprovação)
3. Correções de dados identificadas (se surgirem em patches futuros) — **não** neste patch

---

## Artefatos criados

| Artefato | Caminho |
|----------|---------|
| SQL principal | `docs/analytics/analytics-data-layer-quality.sql` |
| Split Q1 | `docs/analytics/sql/patch-62-query1-completeness.sql` |
| Split Q2 | `docs/analytics/sql/patch-62-query2-duplications-aliases.sql` |
| Split Q3 | `docs/analytics/sql/patch-62-query3-integrity-invalid-conflicts.sql` |
| Split Q4 | `docs/analytics/sql/patch-62-query4-provenance-panel-ranking.sql` |
| Documentação | `docs/analytics/DATA_QUALITY_ANALYTICS.md` |
| Relatório | `docs/analytics/PATCH_6.2_DATA_QUALITY_ANALYTICS.md` |
| Testes unit | `scripts/test-mia-analytics-patch-62-data-quality-analytics.js` |
| Validação prod | `scripts/patch-62-production-validation.mjs` |

**Scripts npm:**

```bash
npm run test:mia:analytics:patch-62:data-quality-analytics
npm run test:mia:analytics:patch-62:prod-validation
```

---

*PATCH 6.2 — aguardando aprovação formal · não iniciar PATCH 6.3 automaticamente*
