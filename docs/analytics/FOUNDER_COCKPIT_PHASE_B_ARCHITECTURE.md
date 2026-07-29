# FASE B — Dashboard Executivo — Arquitetura Oficial

**Documento:** `FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md`  
**Patch:** B.1 — Arquitetura Executiva  
**Rota base:** `/cockpit-fundador`  
**Baseline obrigatória:** [FOUNDER_COCKPIT_BASELINE_A.md](./FOUNDER_COCKPIT_BASELINE_A.md)  
**Status Fase A:** OFFICIALLY_COMPLETED · FROZEN

---

## 1. Visão geral da Fase B

A **Fase B — Dashboard Executivo** reorganiza e amplia a experiência do Founder Cockpit para uma **visão executiva estratégica**, agrupando indicadores existentes e futuros em módulos de decisão de alto nível.

A Fase B **não substitui** a Fase A. Ela **evolui sobre** a arquitetura congelada, adicionando camada executiva de apresentação, mappers dedicados e módulos UI — sem quebrar contratos, métricas ou componentes estruturais da Baseline A.

**Princípio:** composição sobre reutilização, nunca duplicação de agregação.

---

## 2. Auditoria da Baseline A (Etapa 1)

### 2.1 O que pode ser reutilizado

| Domínio | Reutilização na Fase B |
|---------|------------------------|
| **APIs** | `GET /api/executive-metrics`, `GET /api/temporal-metrics`, `GET /api/founder/executive-insights` |
| **Serviços** | `miaExecutiveMetricsApi.js`, `miaTemporalSeriesApi.js`, `miaExecutiveMetricsCache.js` |
| **Filtros** | `FounderCockpitFilters`, `miaAnalyticsFilterParams.js`, `miaFounderFiltersCatalog.js` |
| **Gráficos** | `FounderChartPanel`, `FounderLineChart`, `FounderBarChart`, `miaFounderChartsDisplay.js` |
| **UI base** | `FounderModuleSection`, `FounderMetricCard`, `FounderSkeleton`, tokens `--fc-*` |
| **Auth** | Gate cookie, `FounderLoginGate`, rotas `/api/founder/*` |
| **Mappers A.2–A.8** | Snapshot, growth, products, performance, charts, filters |
| **RPCs existentes** | 9 executive + 5 temporal + `mia_analytics_resolve_window` |

### 2.2 O que deverá ser expandido (Fase B)

| Expansão | PATCH previsto | Natureza |
|----------|----------------|----------|
| Camada **Mapper Executivo** | B.2–B.7 | Novos `lib/miaFounderExecutive*Display.js` — formatação apenas |
| **Seções executivas** | B.2–B.7 | Novos `FounderExecutive*Section.jsx` — composição UI |
| **Agrupamento de KPIs** | B.2 | Visão estratégica consolidada |
| **Resumo executivo** | B.7 | Síntese determinística + insights existentes |
| **Polimento executivo** | B.8 | UX/UI dos módulos B — sem alterar dados |
| **Catálogo executivo** | B.2 | `lib/miaFounderExecutiveCatalog.js` — metadados de KPIs |

### 2.3 O que permanece congelado (Baseline A)

- Contratos e versões: Cockpit A.2.0, Temporal A.7.0, Filters A.7.0, Charts A.8.0, Executive API 11.1.0
- APIs existentes (`executive-metrics`, `temporal-metrics`) — payloads inalterados
- RPCs existentes — sem alteração de SQL ou campos
- Componentes estruturais listados em `FOUNDER_COCKPIT_BASELINE_A.md` §6
- Regras de cache, filtros, timezone UTC, privacidade
- Módulos A.4–A.6 (sessões, produtos, conversão) — permanecem como referência operacional

---

## 3. Escopo oficial da Fase B (Etapa 2)

| Módulo | PATCH | Objetivo executivo |
|--------|-------|-------------------|
| **KPIs Estratégicos** | B.2 | Painel superior de indicadores-chave para decisão rápida |
| **Crescimento da Plataforma** | B.3 | DAU/WAU/MAU, aquisição, retenção, tendências |
| **Saúde do Produto** | B.4 | Qualidade de conversa, anti-regret, user value, price intelligence |
| **Performance Comercial** | B.5 | Recomendações, conversão, funil, produtos, categorias |
| **Indicadores Operacionais** | B.6 | Sistema, alertas, latência, disponibilidade parcial |
| **Resumo Executivo** | B.7 | Síntese narrativa + insights determinísticos |
| **Polimento Executivo** | B.8 | Consistência visual dos módulos B |
| **Auditoria Final** | B.9 | Encerramento e congelamento da Fase B |

**Ajuste justificado:** os módulos A.4–A.6 (sessões, produtos, conversão) **permanecem** no cockpit como camada operacional. A Fase B adiciona **visão executiva agregada** acima deles — não os remove.

---

## 4. Arquitetura executiva (Etapa 3)

```text
Interface Executiva (React — seções B.2–B.7)
        ↓
Mapper Executivo (lib/miaFounderExecutive*Display.js — B.x.0)
        ↓
API Executiva (executive-metrics · temporal-metrics · executive-insights)
        ↓
Serviço (miaExecutiveMetricsApi · miaTemporalSeriesApi)
        ↓
RPC (mia_executive_metrics_* · mia_temporal_series_*)
        ↓
Analytics (analytics_events — escopo produção)
```

### Responsabilidades por camada

| Camada | Responsabilidade Fase B | Proibido |
|--------|-------------------------|----------|
| **Interface Executiva** | Renderizar módulos B, estados UI, navegação executiva | SQL, agregação, recalcular KPIs |
| **Mapper Executivo** | Agrupar, rotular, formatar contratos existentes para visão executiva | Novas agregações, acesso DB |
| **API Executiva** | Entregar contratos HTTP existentes (sem breaking changes) | Lógica de apresentação |
| **Serviço** | Orquestrar RPCs, cache, resiliência parcial | SQL direto |
| **RPC** | Agregações canônicas (existentes ou **novas versionadas**) | Formatação UI |
| **Analytics** | Fonte única de eventos | — |

**Regra:** Mapper Executivo consome **apenas** respostas oficiais das APIs. Se um KPI executivo não existir no contrato, o PATCH correspondente deverá estender RPC/API — nunca calcular no frontend.

---

## 5. Reutilização da Fase A (Etapa 4)

### Componentes UI reutilizáveis (sem alteração de responsabilidade)

```
FounderCockpitPage          → layout container (composição B)
FounderModuleSection        → shell de módulo executivo
FounderMetricCard           → KPI individual
FounderKpiStrip             → referência para B.2 (não duplicar)
FounderChartPanel           → wrapper de gráfico
FounderLineChart            → séries temporais
FounderBarChart             → distribuições / funil
FounderLegend / Tooltip     → acessórios de gráfico
FounderEmptyChart           → estado vazio
FounderSkeleton             → loading
FounderCockpitFilters       → filtros globais (A.7)
FounderDistributionBar      → barras de distribuição
styles/founder-cockpit.css  → tokens --fc-*
```

### Infraestrutura reutilizável

- `lib/miaExecutiveMetricsCache.js` — cache centralizado
- `lib/miaAnalyticsFilterParams.js` — normalização de filtros
- `lib/miaFounderAccess.js` — autenticação gate
- Padrões de fetch client-side (A.4–A.6) — replicar para seções B quando temporal

### Componentes futuros (Fase B — a criar)

| Componente | PATCH | Função |
|------------|-------|--------|
| `FounderExecutiveKpiStrip.jsx` | B.2 | KPIs estratégicos agrupados |
| `FounderExecutiveGrowthSection.jsx` | B.3 | Crescimento executivo |
| `FounderExecutiveProductHealthSection.jsx` | B.4 | Saúde do produto |
| `FounderExecutiveCommercialSection.jsx` | B.5 | Performance comercial |
| `FounderExecutiveOperationalSection.jsx` | B.6 | Indicadores operacionais |
| `FounderExecutiveSummarySection.jsx` | B.7 | Resumo executivo |
| `lib/miaFounderExecutiveCatalog.js` | B.2 | Catálogo de KPIs executivos |
| `lib/miaFounderExecutiveDisplay.js` | B.2+ | Mappers executivos |

---

## 6. Contratos executivos (Etapa 5)

### 6.1 Dados disponíveis nas APIs existentes (sem nova RPC)

| Módulo B | Fonte API | Grupos / séries |
|----------|-----------|-----------------|
| KPIs Estratégicos | `executive-metrics` | overview 10 KPIs + platform + recommendation + commerce |
| Crescimento | `temporal-metrics` | `growth`, `platform_activity` |
| Saúde do Produto | `executive-metrics` | conversation, anti_regret, user_value, price_intelligence |
| Performance Comercial | `executive-metrics` + `temporal-metrics` | recommendation, commerce, `products`, `categories`, `conversion` |
| Operacionais | `executive-metrics` | system, alerts |
| Resumo Executivo | `executive-insights` + snapshot | insights determinísticos + meta |

### 6.2 Dados que **podem** exigir novas APIs (avaliar por PATCH)

| Necessidade | PATCH candidato | Decisão B.1 |
|-------------|-----------------|-------------|
| Comparativo período anterior (delta %) | B.2 ou B.3 | Preferir `offset_days` existente na API temporal antes de nova API |
| Score composto de saúde do produto | B.4 | Se inexistente no RPC → nova RPC versionada B.4.x |
| Índice executivo único | B.7 | Preferir composição de mappers sobre nova métrica |

### 6.3 RPCs — política Fase B

| Ação | Permitido | Condição |
|------|-----------|----------|
| Reutilizar RPC existente | ✅ | Métrica já no contrato |
| Nova RPC | ✅ | Métrica inexistente + PATCH versionado + migration |
| Alterar RPC existente | ✘ | Proibido — quebra Baseline A |
| Nova API | ✅ | Apenas se contrato existente insuficiente + versionamento |

**Decisão B.1:** Fase B inicia **100% sobre contratos existentes**. Novas RPCs/APIs só após justificativa documentada no PATCH de implementação correspondente.

---

## 7. Classificação oficial de KPIs (Etapa 6)

### Estratégicos (B.2)

- Sessões totais, visitantes únicos, conversas, perguntas
- Recomendações geradas, taxa de aceitação
- Potencial de economia total
- Eventos de user value

### Crescimento (B.3)

- DAU / WAU / MAU (visitantes e usuários)
- Novos vs recorrentes vs autenticados
- Tendências pct (growth series)
- Sessões e atividade diária (platform_activity)

### Produto (B.4)

- Perguntas enviadas, conversas com perguntas
- Anti-regret score médio e distribuição
- User value score e status
- Price intelligence score e confiança

### Comerciais (B.5)

- Recomendações, cliques, CTR, funil de conversão
- Produtos distintos, ranking, categorias
- Ofertas geradas, favoritos, alertas de preço
- Taxas de conversão por etapa

### Operacionais (B.6)

- Versão analytics, build, ambiente
- Latência API (`api_duration`)
- Alertas criados, ativos, notificações
- Partial errors, status de cache

### Executivos (B.7 — síntese)

- Insights determinísticos (severidade, confiança)
- Destaques de período (top movers)
- Alertas executivos derivados de thresholds

---

## 8. Roadmap técnico (Etapa 7)

### PATCH B.2 — KPIs Estratégicos

| Campo | Valor |
|-------|-------|
| **Objetivo** | Painel executivo superior com KPIs estratégicos agrupados |
| **Escopo** | `FounderExecutiveKpiStrip`, `miaFounderExecutiveCatalog.js`, mapper B.2.0 |
| **Dependências** | Baseline A, B.1 |
| **Conclusão** | KPIs renderizados de APIs existentes, zero agregação frontend, testes + browser · **OFFICIALLY_CLOSED** |

### PATCH B.3 — Crescimento da Plataforma

| Campo | Valor |
|-------|-------|
| **Objetivo** | Módulo executivo de crescimento (DAU/WAU/MAU, tendências, comparativo de período) |
| **Escopo** | `FounderExecutiveGrowthSection`, `miaFounderExecutiveGrowthCatalog.js`, `miaFounderExecutiveGrowthDisplay.js` (B.3.0) |
| **Dependências** | B.2, temporal API A.7.0, executive-metrics offset |
| **Conclusão** | Séries growth/platform_activity + comparativo offset mapeados, narrativa executiva determinística, filtros A.7 aplicados · **OFFICIALLY_CLOSED** |

### PATCH B.4 — Saúde do Produto

| Campo | Valor |
|-------|-------|
| **Objetivo** | Visão executiva de qualidade, aceitação, confiança e degradação |
| **Escopo** | `FounderExecutiveProductHealthSection`, `miaFounderExecutiveProductHealthCatalog.js`, `miaFounderExecutiveProductHealthDisplay.js` (B.4.0) |
| **Dependências** | B.2, B.3, executive-metrics groups (recommendation, conversation, user_value, anti_regret, price_intelligence) |
| **Conclusão** | 8 indicadores + índice de saúde + narrativa determinística, comparativo offset, zero alteração de API · **OFFICIALLY_CLOSED** |

### PATCH B.5 — Performance Comercial

| Campo | Valor |
|-------|-------|
| **Objetivo** | Eficiência comercial executiva — funil, CTR, intenção, gargalos e tendência |
| **Escopo** | `FounderExecutiveCommercialPerformanceSection`, `miaFounderExecutiveCommercialPerformanceCatalog.js`, `miaFounderExecutiveCommercialPerformanceDisplay.js` (B.5.0) |
| **Dependências** | B.2–B.4, executive-metrics (recommendation, commerce, alerts, platform, conversation), temporal conversion |
| **Conclusão** | 10 indicadores + funil snapshot + gargalo temporal + narrativa determinística, offset oficial, zero alteração de API |

### PATCH B.6 — Indicadores Operacionais

| Campo | Valor |
|-------|-------|
| **Objetivo** | Saúde operacional da plataforma e alertas |
| **Escopo** | Seção operacional (system, alerts, meta) |
| **Dependências** | B.2, executive-metrics system/alerts |
| **Conclusão** | Status sistema visível, sem métricas inventadas |

### PATCH B.7 — Resumo Executivo

| Campo | Valor |
|-------|-------|
| **Objetivo** | Síntese executiva consolidada para decisão rápida |
| **Escopo** | `FounderExecutiveSummarySection`, integração executive-insights |
| **Dependências** | B.2–B.6, `/api/founder/executive-insights` |
| **Conclusão** | Resumo determinístico, insights linkados a evidências |

### PATCH B.8 — Polimento Executivo

| Campo | Valor |
|-------|-------|
| **Objetivo** | UX/UI premium dos módulos B — sem alterar dados |
| **Escopo** | CSS, skeletons, responsividade, a11y |
| **Dependências** | B.2–B.7, Design System A.9 |
| **Conclusão** | Desktop/tablet/mobile aprovados, zero regressão numérica |

### PATCH B.9 — Auditoria Final da Fase B

| Campo | Valor |
|-------|-------|
| **Objetivo** | Validar, documentar e congelar Fase B |
| **Escopo** | Regressão B.2–B.8 + Baseline A, master report, evidências |
| **Dependências** | B.1–B.8 |
| **Conclusão** | OFFICIALLY_COMPLETED, baseline B frozen |

---

## 9. Riscos e mitigações (Etapa 8)

| Risco | Mitigação |
|-------|-----------|
| Duplicação de métricas (A.4 vs B.3) | B.3 = visão executiva; A.4 permanece operacional. Mappers distintos, mesma API |
| KPIs inconsistentes entre módulos | Catálogo único `miaFounderExecutiveCatalog.js` (B.2) como SSOT de labels |
| Múltiplas fontes da verdade | Proibir agregação frontend; toda métrica traceável a RPC |
| Lógica no frontend | Code review + audit scripts por PATCH |
| Regressão Fase A | Regressão A.2–A.10 obrigatória em todo PATCH B |
| APIs redundantes | Avaliar `offset_days` e filtros existentes antes de nova API |
| RPCs redundantes | Migration versionada + catálogo documentado |
| Performance (múltiplos fetches) | Cache existente; batch via APIs já paralelas no serviço |

---

## 10. Princípios arquiteturais Fase B

1. **Baseline A inviolável** — contratos congelados permanecem intactos
2. **Composição sobre duplicação** — reutilizar componentes A.9/A.8
3. **Mapper Executivo separado** — não alterar mappers A.2–A.8 existentes
4. **Um KPI, uma origem RPC** — rastreabilidade documentada no catálogo
5. **Filtros globais** — A.7 aplicado a todos os módulos B temporais
6. **Versionamento explícito** — `B.x.0` em todo mapper novo
7. **PATCH incremental** — um módulo por PATCH (B.2–B.7)
8. **Encerramento com evidências** — JSON + regressão + browser

---

## 11. Dependências

| Dependência | Status |
|-------------|--------|
| Fase A OFFICIALLY_COMPLETED | ✅ |
| Baseline A documentada | ✅ |
| APIs executive + temporal | ✅ Produção |
| Design System A.9 | ✅ |
| Filtros A.7 | ✅ |
| Gráficos A.8 | ✅ |
| Auth gate | ✅ |

---

## 12. Critérios de aprovação (PATCH B.1)

- [x] Arquitetura Fase B documentada neste arquivo
- [x] Baseline A auditada — reutilização/expansão/congelamento definidos
- [x] Módulos B.2–B.9 com objetivo, escopo, dependências
- [x] Contratos mapeados — sem implementação
- [x] KPIs classificados por categoria
- [x] Riscos documentados
- [x] Nenhuma alteração de código funcional
- [x] Nenhuma regressão da Fase A

---

## 13. Documentos oficiais relacionados

| Documento | Função |
|-----------|--------|
| [FOUNDER_COCKPIT_BASELINE_A.md](./FOUNDER_COCKPIT_BASELINE_A.md) | Constituição arquitetural (Fase A) |
| [FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md](./FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md) | Relatório completo Fase A |
| [FOUNDER_EXECUTIVE_DASHBOARD.md](./FOUNDER_EXECUTIVE_DASHBOARD.md) | Referência operacional cockpit |
| [FOUNDER_COCKPIT_DESIGN_SYSTEM.md](./FOUNDER_COCKPIT_DESIGN_SYSTEM.md) | Design System |
| [EXECUTIVE_METRICS_API.md](./EXECUTIVE_METRICS_API.md) | Contrato API snapshot |
| [TEMPORAL_METRICS_API.md](./TEMPORAL_METRICS_API.md) | Contrato API temporal |

---

*Documento criado no PATCH B.1 — Arquitetura Executiva. Nenhuma implementação funcional incluída.*
