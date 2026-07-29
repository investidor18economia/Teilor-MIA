# FASE C — MIA como Analista da Empresa — Arquitetura Oficial

**Documento:** `MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md`  
**Patch:** C.1 — Arquitetura da Analista Executiva · **C.2** — Resumos Executivos Automáticos  
**Versão:** C.1.0 (contratos) · C.2.0 (summary builder)  
**Status:** C.1 architecture defined · **C.2 summary behavior implemented**  
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
| **C.3** | Insights & trends |
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

*Documento atualizado no PATCH C.2 — Resumos Executivos Automáticos.*
