# PATCH 5.4 — Buying Intent Analytics Estratégico — Relatório de Auditoria

**Data:** 2026-07-22  
**Status:** 🟡 EM ANDAMENTO — aguardando aprovação formal  
**SQL:** [analytics-buying-intent-strategic.sql](./analytics-buying-intent-strategic.sql)  
**Documentação:** [BUYING_INTENT_STRATEGIC_ANALYTICS.md](./BUYING_INTENT_STRATEGIC_ANALYTICS.md)

---

## 1. Resumo executivo

PATCH 5.4 entrega **Buying Intent Analytics Estratégico** — ranking de sinais por visitante, combinações comportamentais, antecedentes antes do primeiro sinal, força de intenção por categoria/produto e tendência/cohort de intenção.

**Não duplica** o Products & Categories Dashboard operacional (PATCH 4.4) nem o agregado `sinais_fortes_de_compra` (PATCH 1.3).

**Validação:** **65/65** checks (54 unit + 11 produção) — **0 falhas**. Regressões 4.4, 5.3 e sql-dashboards: **299/299** — **0 falhas**.

---

## 2. Etapa 1 — Auditoria pré-implementação

| Análise | Implementável? | Query |
|---------|----------------|-------|
| Ranking de sinais por visitante (não volume) | ✅ | 1 |
| Combinações de sinais recorrentes | ✅ | 1 |
| Antecedentes antes do primeiro sinal (recomendação, imagem, conversa profunda, auth) | ✅ | 2 |
| Antecedentes por segmento autenticado/anônimo | ✅ | 2 |
| Força de intenção por categoria (visitantes distintos) | ✅ | 3 |
| Produtos com intenção consistente (visitantes × dias) | ✅ | 3 |
| Intenção por cohort de aquisição | ✅ | 4 |
| Tendência de intenção entre janelas 7d | ✅ | 4 |
| Score preditivo / ML de intenção | ❌ | Fora de escopo — proibido |
| Atribuição causal de antecedentes | ❌ | Limitação — observacional apenas |
| Intenção cross-device unificada | ❌ | Limitação Identity Layer |

**Veredito:** ✅ Sem bloqueios estruturais. Nenhum novo evento, tabela ou migration.

**Delta vs Fase 4 documentado** em [BUYING_INTENT_STRATEGIC_ANALYTICS.md §2](./BUYING_INTENT_STRATEGIC_ANALYTICS.md#2-delta-em-relação-à-fase-4-obrigatório).

---

## 3. Entregas

| Artefato | Descrição |
|----------|-----------|
| [analytics-buying-intent-strategic.sql](./analytics-buying-intent-strategic.sql) | 4 queries estratégicas |
| [BUYING_INTENT_STRATEGIC_ANALYTICS.md](./BUYING_INTENT_STRATEGIC_ANALYTICS.md) | Delta Fase 4/5, métricas, limitações |
| `sql/patch-54-query1-signal-ranking.sql` | Split Q1 — ranking e combinações |
| `sql/patch-54-query2-behavioral-antecedents.sql` | Split Q2 — antecedentes |
| `sql/patch-54-query3-intent-strength.sql` | Split Q3 — força categoria/produto |
| `sql/patch-54-query4-intent-trends-cohort.sql` | Split Q4 — cohort + tendência |
| `scripts/test-mia-analytics-patch-54-buying-intent-strategic.js` | Auditoria unitária |
| `scripts/patch-54-production-validation.mjs` | Validação produção |

---

## 4. Validação

| Suite | Resultado |
|-------|-----------|
| `test:mia:analytics:patch-54:buying-intent-strategic` | **54/54** ✅ |
| `test:mia:analytics:patch-44:products-categories-dashboard` (regressão) | **56/56** ✅ |
| `test:mia:analytics:patch-53:conversion-strategic` (regressão) | **56/56** ✅ |
| `test:mia:analytics:sql-dashboards` | **187/187** ✅ |
| `test:mia:analytics:patch-54:prod-validation` | **11/11** ✅ |

### Produção (2026-07-22 UTC)

- **Query 1:** 0 linhas — nenhum visitante com sinal de intenção na base atual (esperado em produção inicial).
- **Query 2:** `visitantes_com_intencao = 0` — antecedentes gerais retornam estrutura válida com métricas nulas.
- **Query 3:** categoria `smartphones` — 7 visitantes engajados, 0 com intenção; `rank_intencao` e `taxa_visitantes_intencao_pos_recomendacao` calculados corretamente.
- **Query 4:** cohort `2026-07-22` — 14 visitantes ativos, 0 com intenção; tendência `estavel` na janela recente (base jovem).

Queries executam sem erro SQL; aliases estratégicos distintos dos operacionais PATCH 4.4 confirmados.

---

## 5. Critérios de aprovação

| Critério | Status |
|----------|--------|
| Não duplica Fase 4 (4.4 / 1.3) | ✅ |
| Análises estratégicas inéditas (visitante, antecedentes, cohort) | ✅ |
| Métricas canônicas preservadas (EXECUTIVE_METRICS, Event Contract v1) | ✅ |
| Arquitetura intacta (append-only, sem migrations) | ✅ |
| Sem regressões (4.4, 5.3, dashboards) | ✅ |
| Documentação completa (delta + limitações + SQL) | ✅ |
| Produção validada | ✅ |

---

## 6. Limitações registradas

| Limitação | Documentada em |
|-----------|----------------|
| `offer_click` sem `user_id` / `product_name` | BUYING_INTENT §7 |
| Antecedentes observacionais (não causais) | BUYING_INTENT §7 |
| Amostra pequena de intenção em produção | BUYING_INTENT §7 |
| Janela anterior vazia (base <14 dias) | BUYING_INTENT §7 |

Nenhuma aproximação ou workaround foi implementado além do escopo suportado.

---

## 7. Próximo passo

**PATCH 5.5 — Auditoria Final da Fase 5**

---

*PATCH 5.4 — Buying Intent Analytics Estratégico · Relatório de auditoria*
