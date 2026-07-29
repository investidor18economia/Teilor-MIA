# FASE C — MIA como Analista da Empresa — Arquitetura Oficial

**Documento:** `MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md`  
**Patch:** C.1 — Arquitetura · **C.2** — Resumos · **C.3** — Insights Inteligentes  
**Versão:** C.1.0 (contratos) · C.2.0 (summary) · C.3.0 (insights)  
**Status:** C.1 architecture · C.2 summaries · **C.3 insights implemented**  
**Baselines preservadas:** [FOUNDER_COCKPIT_BASELINE_A.md](./FOUNDER_COCKPIT_BASELINE_A.md) · [FOUNDER_COCKPIT_BASELINE_B.md](./FOUNDER_COCKPIT_BASELINE_B.md)

---

## 1. Visão geral

A **Fase C — MIA como Analista da Empresa** introduz um segundo papel da MIA, distinto da Especialista em Compras (usuário final):

| Papel | Destinatário | Escopo |
|-------|--------------|--------|
| **Especialista em Compras** | Usuário final | Recomendações, ofertas, economia |
| **Analista Executiva** | Founder | Interpretação determinística dos dados executivos |

Ambos compartilham o mesmo princípio arquitetural:

```text
Dados oficiais
      ↓
Decision / Analysis Layer (determinístico)
      ↓
Display / Interpretation / Narrative
      ↓
LLM apenas verbaliza
```

**A LLM nunca é a fonte da verdade.** Toda conclusão nasce de dados e regras oficiais rastreáveis.

O PATCH **C.1** define exclusivamente arquitetura, contratos, limites e documentação. **Nenhuma inteligência analítica definitiva** é implementada neste patch.

---

## 2. Objetivo da Fase C

Permitir que a MIA atue como **analista da empresa** para o Founder — interpretando KPIs, crescimento, saúde, performance comercial e indicadores operacionais já entregues pela Baseline B — com:

- determinismo;
- rastreabilidade;
- explicabilidade;
- ausência de alucinação;
- separação clara entre fatos e interpretação.

---

## 3. Pipeline oficial

```text
Executive Metrics          (APIs/RPCs — fatos oficiais)
        ↓
Executive Views            (Baseline B mappers B.2–B.6 + ModuleViewsContext)
        ↓
Executive Analysis Layer   (interpretação determinística — C.2+)
        ↓
Executive Narrative Layer  (organização narrativa — C.5+)
        ↓
LLM Verbalizer             (linguagem natural apenas — C.6+)
```

Implementação: `lib/miaExecutiveAnalysisArchitecture.js`

---

## 4. Separação de responsabilidades

| Camada | Responsabilidade | Proibido |
|--------|------------------|----------|
| **Executive Metrics** | Fatos oficiais (`executive-metrics`, `temporal-metrics`, RPCs) | Interpretação, UI, LLM |
| **Executive Views** | Preparação via mappers Baseline B + `FounderExecutiveModuleViewsContext` | Agregação nova, SQL, LLM |
| **Executive Analysis** | Interpretação determinística (insights, trends, alerts — futuro) | fetch, SQL, Supabase, LLM, métricas inventadas |
| **Executive Narrative** | Organização de fatos + interpretações em slots estruturados | LLM, novos fatos, causalidade sem evidência |
| **LLM Verbalizer** | Fraseologia em linguagem natural | Fonte da verdade, cálculos, thresholds |

Nenhuma camada assume responsabilidade de outra.

---

## 5. Narrativa (Fatos → Interpretação → Resumo → Linguagem)

Pipeline narrativo: `lib/miaExecutiveNarrativeArchitecture.js`

| Estágio | Conteúdo | Proibido |
|---------|----------|----------|
| **Fatos** | Valores imutáveis rastreados a métricas/views | Interpretação, LLM |
| **Interpretação** | Regras determinísticas sobre fatos | Novos fatos, LLM |
| **Resumo** | Síntese estruturada (headline, prioridades, riscos) | LLM, mistura com verbalização |
| **Linguagem Natural** | LLM verbaliza slots pré-computados | Alterar números, esconder limitações |

---

## 6. Fonte da verdade

A Analista Executiva **nunca** consulta dados arbitrários.

Fontes permitidas (C.1):

- Baseline B Executive Views (B.2–B.6);
- `GET /api/executive-metrics`;
- `GET /api/temporal-metrics`;
- Catálogos e displays executivos oficiais;
- Snapshots e métricas já expostos nos contratos congelados.

Nenhum dado pode ser **criado** pela LLM.

---

## 7. Contratos oficiais (C.1.0)

Arquivo: `lib/miaExecutiveAnalysisContracts.js`

| Contrato | Função |
|----------|--------|
| `ExecutiveAnalysisInput` | Entrada da camada de análise (views + período + evidências) |
| `ExecutiveAnalysisOutput` | Saída envelope com confidence + slots |
| `ExecutiveInsight` | Slot de insight (comportamento C.2+) |
| `ExecutiveRecommendation` | Slot de recomendação |
| `ExecutiveAlert` | Slot de alerta |
| `ExecutiveTrend` | Slot de tendência |
| `ExecutiveSummary` | Slot de resumo analítico |
| `ExecutiveEvidence` | Rastreabilidade por campo oficial |
| `ExecutiveConfidence` | Nível + fatores + limitações + módulos |

Templates vazios: `EXECUTIVE_ANALYSIS_INPUT_TEMPLATE`, `EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE` (status `pending`).

---

## 8. Confiança e explicabilidade (obrigatório na Fase C)

Toda análise futura deverá incluir:

- **nível de confiança** (`high` | `moderate` | `low` | `insufficient_data`);
- **evidências** (`ExecutiveEvidence[]`);
- **limitações** explícitas;
- **dados utilizados** (field paths oficiais);
- **período analisado**;
- **módulos participantes** (B.2–B.6).

Checklist de explicabilidade: `EXECUTIVE_NARRATIVE_EXPLAINABILITY_CHECKLIST`

---

## 9. Limitações permanentes

A Analista Executiva **nunca** poderá:

- inventar causalidade;
- inventar receita ou compra;
- criar tendências sem evidência oficial;
- extrapolar estatísticas;
- esconder ausência de dados;
- transformar hipótese em fato;
- usar LLM como fonte da verdade.

Lista completa: `EXECUTIVE_ANALYST_PROHIBITIONS`

---

## 10. Integração com Baseline B

| Integração | Referência |
|------------|------------|
| Executive Views bridge | `FounderExecutiveModuleViewsContext.jsx` |
| Module ids | `kpis`, `growth`, `health`, `commercial`, `operational` |
| Mappers congelados | `miaFounderExecutive*Display.js` (B.2.0–B.7.0) |
| Resumo determinístico B.7 | `miaFounderExecutiveSummaryDisplay.js` — **não substituído** em C.1 |
| Insights 11.4 | `miaExecutiveInsightsEngine.js` — **coexistência** documentada |

C.1 **não modifica** mappers, componentes, APIs ou layout da Baseline B.

---

## 11. Fronteira com sistemas existentes

| Sistema | PATCH | Papel |
|---------|-------|-------|
| Insights determinísticos | 11.4 | Baseline A — comparação período anterior |
| Resumo executivo UI | B.7 | Baseline B — síntese views B.2–B.6 |
| Analista Executiva | C.1+ | Nova pipeline Phase C — interpretação ampliada |

C.1 prepara a arquitetura sem alterar 11.4 ou B.7.

---

## 12. Roadmap da Fase C

| PATCH | Escopo |
|-------|--------|
| **C.1** | Arquitetura, contratos, docs ✅ |
| **C.2** | Resumos Executivos Automáticos ✅ |
| **C.3** | Insights Inteligentes ✅ |
| **C.4** | Alerts & recommendations |
| **C.5** | Narrative assembly |
| **C.6** | LLM verbalizer |
| **C.7** | UI analista no Cockpit |
| **C.8** | Polimento |
| **C.9** | Auditoria final Fase C |

---

## 13. Arquivos C.1

| Arquivo | Responsabilidade |
|---------|------------------|
| `lib/miaExecutiveAnalysisContracts.js` | Contratos e templates |
| `lib/miaExecutiveAnalysisArchitecture.js` | Pipeline e prohibitions |
| `lib/miaExecutiveNarrativeArchitecture.js` | Pipeline narrativo |
| `docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md` | Este documento |

---

## 14. Garantias C.1

| Garantia | Status |
|----------|--------|
| Baseline A preservada | ✅ |
| Baseline B preservada | ✅ |
| Sem SQL/Supabase/fetch nos arquivos C.1 | ✅ |
| Sem comportamento analítico implementado | ✅ |
| Contratos congelados C.1.0 | ✅ |
| Cockpit UI inalterado | ✅ |

---

## 15. Testes oficiais

```bash
npm run test:mia:analytics:patch-c1:executive-analyst-architecture
npm run test:mia:analytics:patch-c1:closure
```

---

## 16. PATCH C.2 — Summary Pipeline

**Patch:** C.2 — Resumos Executivos Automáticos  
**Versão:** C.2.0  
**Escopo:** Primeiro comportamento real da Analista Executiva — resumos determinísticos.

### 16.1 Princípio

O resumo **nunca é inventado**. Todo texto nasce exclusivamente dos dados presentes nas Executive Views da Baseline B. A LLM não conclui fatos — apenas verbalizará (C.6+) uma estrutura produzida pelo Analysis Layer.

**Fora de escopo C.2:** insights, tendências, alertas, recomendações.

### 16.2 Pipeline do resumo

```text
Executive Views (Baseline B)
        ↓
collectExecutiveSummaryInput      — normalização das views
        ↓
organizeExecutiveSummaryFacts     — sinais e fatos observáveis
        ↓
buildExecutiveSummarySections     — estrutura fixa (6 seções)
        ↓
buildExecutiveSummaryNarrative    — entrada da Narrative Layer (stage: summary)
        ↓
generateExecutiveAnalysisSummary  — ExecutiveAnalysisOutput (summary only)
        ↓
LLM Verbalizer                    — C.6+ (não implementado)
```

Implementação: `lib/miaExecutiveSummaryBuilder.js`  
Catálogo: `lib/miaExecutiveSummaryCatalog.js`

### 16.3 Estrutura fixa do resumo

| # | Seção | Conteúdo |
|---|-------|----------|
| 1 | Visão Geral | Estado geral da plataforma |
| 2 | Principais Destaques | Até 3 pontos positivos observados |
| 3 | Pontos de Atenção | Até 3 itens de acompanhamento |
| 4 | Situação Comercial | Performance comercial (fatos) |
| 5 | Situação Operacional | Operação (fatos) |
| 6 | Conclusão Geral | Estado consolidado do período |

Sem interpretações profundas, causas ou ações sugeridas.

### 16.4 Determinismo e confiança

- Mesmo conjunto de views → mesmo resumo estrutural (JSON idêntico).
- Sem aleatoriedade, criatividade ou temperatura de modelo.
- Todo resumo inclui internamente: `confidence`, `evidence`, módulos utilizados, período, limitações.

Estados sem dados: mensagem padronizada — *"Dados insuficientes para gerar um resumo confiável deste módulo."*

### 16.5 Responsabilidades

| Etapa | Função | Proibido |
|-------|--------|----------|
| **Collect** | Normalizar `ExecutiveAnalysisInput` | fetch, SQL, Supabase |
| **Organize** | Extrair sinais de views oficiais | Novos fatos, LLM |
| **Structure** | Montar 6 seções fixas | Tendências, recomendações |
| **Narrative** | Preparar slots para verbalização | LLM, mistura de camadas |

### 16.6 Integração com contratos C.1

`generateExecutiveAnalysisSummary()` retorna `ExecutiveAnalysisOutput` com:

- `summary` preenchido (mapeado para `ExecutiveSummary`);
- `insights`, `trends`, `alerts`, `recommendations` vazios;
- `status`: `summary_ready` ou `insufficient_data`;
- contratos C.1.0 **inalterados**.

### 16.7 Limitações C.2

- Não acessa banco, SQL, Supabase ou APIs externas.
- Não substitui o resumo B.7 no Cockpit (`miaFounderExecutiveSummaryDisplay.js`).
- Não expõe UI analista (reservado a C.7).
- Não gera insights, tendências, alertas ou recomendações.

### 16.8 Garantias C.2

| Garantia | Status |
|----------|--------|
| Baseline A preservada | ✅ |
| Baseline B preservada | ✅ |
| Contratos C.1.0 preservados | ✅ |
| Resumos determinísticos | ✅ |
| Confidence + evidence obrigatórios | ✅ |
| Cockpit UI inalterado | ✅ |

### 16.9 Arquivos C.2

| Arquivo | Responsabilidade |
|---------|------------------|
| `lib/miaExecutiveSummaryCatalog.js` | Seções, templates, regras highlight/attention |
| `lib/miaExecutiveSummaryBuilder.js` | Pipeline collect → organize → structure → narrative |

### 16.10 Testes oficiais C.2

```bash
npm run test:mia:analytics:patch-c2:executive-summary
npm run test:mia:analytics:patch-c2:closure
```

---

## 17. PATCH C.3 — Executive Insight Generator

**Patch:** C.3 — Geração de Insights Inteligentes  
**Versão:** C.3.0  
**Escopo:** Insights determinísticos a partir da combinação de Executive Views.

### 17.1 Princípio

Todo insight nasce exclusivamente dos dados existentes nas Executive Views. A LLM não inventa relações, causalidades ou oportunidades — apenas verbalizará (C.6+) insights pré-computados.

**Fora de escopo C.3:** tendências, alertas, recomendações.

### 17.2 Pipeline de insights

```text
Executive Views (Baseline B)
        ↓
collectExecutiveInsightInput       — normalização (reutiliza C.2)
        ↓
analyzeExecutiveInsightSignals   — sinais cross-module
        ↓
evaluateExecutiveInsightRules    — regras determinísticas
        ↓
deduplicateExecutiveInsights     — consolidação por dedup_group
        ↓
buildExecutiveInsightNarrative   — entrada Narrative Layer (stage: interpretation)
        ↓
generateExecutiveAnalysisInsights — ExecutiveAnalysisOutput (insights only)
        ↓
LLM Verbalizer                   — C.6+ (não implementado)
```

Implementação: `lib/miaExecutiveInsightBuilder.js`  
Catálogo/regras: `lib/miaExecutiveInsightCatalog.js`

### 17.3 Classificação e prioridade

| Categoria | Exemplos de observação |
|-----------|------------------------|
| **Growth** | Crescimento de audiência registrado |
| **Product** | Saúde excelente, queda de aceitação |
| **Commercial** | Tração, gargalo, volume insuficiente |
| **Operational** | Degradação ou estabilidade operacional |
| **Cross Module** | Alinhamento ou desacoplamento entre módulos |
| **General** | Estabilidade ampla, KPIs positivos |

Prioridade objetiva: **High** · **Medium** · **Low** — baseada em regras do catálogo, nunca em LLM.

### 17.4 Deduplicação

- Cada regra possui `dedup_group`.
- Apenas um insight por grupo — vence maior prioridade, depois menor `rule_priority`.
- Deduplicação secundária por título normalizado.

### 17.5 Confiança e limitações

Todo insight inclui:

- `confidence` (nível + fatores + limitações);
- `evidence[]` rastreável a field paths oficiais;
- `modules_involved`;
- `period`;
- `limitations`.

Insights **não são emitidos** quando: módulos ausentes, confiança abaixo do mínimo da regra, ou dados insuficientes.

### 17.6 Proibição de causalidade

Textos descrevem fatos observados — nunca `"porque"`, `"causado por"` ou explicações sem regra objetiva.

### 17.7 Integração com contratos C.1 e C.2

- `generateExecutiveAnalysisInsights()` → `ExecutiveInsight[]` com `stage: "interpretation"`.
- `generateExecutiveAnalysisWithSummaryAndInsights()` combina C.2 + C.3.
- Category/priority em `meta.insight_records` (contratos C.1.0 inalterados).
- `trends`, `alerts`, `recommendations` permanecem vazios.

### 17.8 Garantias C.3

| Garantia | Status |
|----------|--------|
| Baseline A/B preservadas | ✅ |
| Contratos C.1.0 preservados | ✅ |
| Summary Builder C.2 preservado | ✅ |
| Insights determinísticos | ✅ |
| Deduplicação validada | ✅ |
| Cockpit UI inalterado | ✅ |

### 17.9 Arquivos C.3

| Arquivo | Responsabilidade |
|---------|------------------|
| `lib/miaExecutiveInsightCatalog.js` | Categorias, prioridades, regras, dedup |
| `lib/miaExecutiveInsightBuilder.js` | Pipeline analyze → evaluate → deduplicate |

### 17.10 Testes oficiais C.3

```bash
npm run test:mia:analytics:patch-c3:executive-insights
npm run test:mia:analytics:patch-c3:closure
```

---

*Documento atualizado no PATCH C.3 — Geração de Insights Inteligentes.*
