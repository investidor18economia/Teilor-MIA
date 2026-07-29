# Founder Cockpit — Baseline A

## 1. Status Oficial

| Campo | Valor |
|-------|-------|
| **Fase** | A — Dashboard do Fundador |
| **Status** | OFFICIALLY_COMPLETED |
| **Baseline** | FROZEN |
| **Conclusão** | 2026-07-29 (PATCH A.10) |
| **Commit oficial** | `a0c346c88b9f0c3c840eb6e477d002b6545660e6` |
| **Relatório completo** | [FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md](./FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md) |

---

## 2. Objetivo da Baseline

Esta baseline representa a **arquitetura oficial congelada** do Founder Cockpit (`/cockpit-fundador`).

Toda evolução futura (Fases B, C, D…) **deve respeitar este documento**.

Nenhuma alteração arquitetural poderá ocorrer sem **PATCH versionado**, regressão completa e evidências de encerramento.

---

## 3. Arquitetura Oficial

```text
Interface
    ↓
Mapper
    ↓
API
    ↓
Serviço
    ↓
RPC
    ↓
Analytics
```

| Camada | Responsabilidade | Proibido |
|--------|------------------|----------|
| **Interface** | Renderização, estados UI, interação, filtros visuais | SQL, agregação, Analytics |
| **Mapper** | Formatação, labels, estrutura de exibição | Recalcular métricas, acesso a DB |
| **API** | Contrato HTTP, cache, observabilidade, parse de params | Regra de apresentação, SQL |
| **Serviço** | Orquestração de RPCs, resiliência parcial, cache keys | SQL direto, lógica de UI |
| **RPC** | Agregações SQL canônicas, filtros de escopo | Formatação de UI |
| **Analytics** | Fonte única de eventos (`analytics_events`, escopo produção) | — |

**Regra absoluta:** nenhuma camada assume responsabilidade de outra.

---

## 4. Princípios Arquiteturais

1. Frontend **nunca** gera Analytics
2. Frontend **nunca** recalcula métricas
3. Mappers **apenas** transformam contratos (formatação, labels, estrutura)
4. APIs **não** possuem regra de apresentação
5. RPCs concentram **agregações oficiais**
6. Analytics são a **fonte única da verdade**
7. Cache **centralizado** (`lib/miaExecutiveMetricsCache.js`)
8. Gráficos utilizam **somente séries oficiais** da API temporal
9. Filtros **sempre** aplicados pelo backend (RPC + window resolver)
10. **Nenhum SQL direto** em componentes React

---

## 5. Contratos Congelados

| Domínio | Versão | Referência |
|---------|--------|------------|
| **Cockpit (snapshot display)** | A.2.0 | `lib/miaFounderCockpitDisplay.js` |
| **Executive API** | 11.1.0 | `lib/miaExecutiveMetricsCatalog.js` |
| **Temporal API** | A.7.0 | `lib/miaTemporalSeriesCatalog.js` |
| **Sessões (display)** | A.4.0 | `lib/miaFounderGrowthDisplay.js` |
| **Produtos (display)** | A.5.0 | `lib/miaFounderProductsDisplay.js` |
| **Conversão (display)** | A.6.0 | `lib/miaFounderPerformanceDisplay.js` |
| **Filters (catalog + display)** | A.7.0 | `lib/miaFounderFiltersCatalog.js` |
| **Charts (display)** | A.8.0 | `lib/miaFounderChartsDisplay.js` |
| **UI / Design System** | A.9 | `styles/founder-cockpit.css`, `--fc-*` tokens |

Alteração de versão exige PATCH documentado e regressão A.2–A.10.

---

## 6. Componentes Estruturais

### Página e layout

- `pages/cockpit-fundador.jsx`
- `components/founder-cockpit/FounderCockpitPage.jsx`
- `components/founder-cockpit/FounderModuleSection.jsx`
- `components/founder-cockpit/FounderKpiStrip.jsx`
- `components/founder-cockpit/FounderMetricCard.jsx`
- `components/founder-cockpit/FounderLoginGate.jsx`

### Módulos temporais (A.4–A.6)

- `FounderSessionsUsersSection.jsx`
- `FounderProductsCategoriesSection.jsx`
- `FounderPerformanceConversionSection.jsx`
- `FounderExecutiveInsights.jsx`

### Filtros (A.7)

- `FounderCockpitFilters.jsx`
- `FounderCockpitFiltersContext.jsx`

### Gráficos (A.8)

- `FounderChartPanel.jsx`
- `FounderLineChart.jsx`
- `FounderBarChart.jsx`
- `FounderLegend.jsx`
- `FounderTooltip.jsx`
- `FounderEmptyChart.jsx`

### UI base (A.9)

- `FounderSkeleton.jsx`
- `FounderDistributionBar.jsx`
- `styles/founder-cockpit.css`

### Mappers

- `lib/miaFounderCockpitDisplay.js`
- `lib/miaFounderGrowthDisplay.js`
- `lib/miaFounderProductsDisplay.js`
- `lib/miaFounderPerformanceDisplay.js`
- `lib/miaFounderChartsDisplay.js`
- `lib/miaFounderFiltersDisplay.js`
- `lib/miaAnalyticsFilterParams.js`

### Serviços e cache

- `lib/miaExecutiveMetricsApi.js`
- `lib/miaTemporalSeriesApi.js`
- `lib/miaExecutiveMetricsCache.js`
- `lib/miaFounderAccess.js`

---

## 7. APIs Oficiais

| Endpoint | Responsabilidade |
|----------|------------------|
| `GET /api/executive-metrics` | Snapshot executivo — 10 grupos de métricas, SSR do cockpit |
| `GET /api/temporal-metrics` | Séries temporais — growth, platform_activity, products, categories, conversion |
| `POST /api/founder/authenticate` | Gate de acesso — cookie `mia_founder_gate` |
| `POST /api/founder/logout` | Encerramento de sessão do cockpit |
| `GET /api/founder/executive-insights` | Insights determinísticos (PATCH 11.4) |

**Params oficiais (filtros):** `range`, `start`, `end`, `category`, `product_id`, `granularity`, `series`, `fresh=1`  
**Timezone:** UTC · **Cache TTL:** ~300s (centralizado)

---

## 8. RPCs Oficiais

### Executive (snapshot)

- `mia_executive_metrics_platform`
- `mia_executive_metrics_conversation`
- `mia_executive_metrics_recommendation`
- `mia_executive_metrics_commerce`
- `mia_executive_metrics_alerts`
- `mia_executive_metrics_price_intelligence`
- `mia_executive_metrics_savings`
- `mia_executive_metrics_anti_regret`
- `mia_executive_metrics_user_value`

### Temporal (séries)

- `mia_temporal_series_growth`
- `mia_temporal_series_platform_activity`
- `mia_temporal_series_products`
- `mia_temporal_series_categories`
- `mia_temporal_series_conversion`

### Filtros

- `mia_analytics_resolve_window`

Nenhuma RPC acima pode ser alterada sem PATCH versionado e migração documentada.

---

## 9. Design System

**Documento oficial:** [FOUNDER_COCKPIT_DESIGN_SYSTEM.md](./FOUNDER_COCKPIT_DESIGN_SYSTEM.md) (PATCH A.9)

| Elemento | Padrão |
|----------|--------|
| **Tokens CSS** | `--fc-*` em `.founder-cockpit-page` |
| **Espaçamentos** | `--fc-space-xs` (6px) → `--fc-space-xl` (32px) |
| **Radius** | `--fc-radius-sm/md/lg/pill` (8 / 12 / 16 / 999px) |
| **Sombras** | `--fc-shadow-card`, `--fc-shadow-hover` |
| **Tipografia** | `--fc-font`, hierarquia `--fc-text-*` |
| **Cores** | Dark theme — accent `#00c6ff`, `--fc-bg-*`, `--fc-success/warning/error` |
| **Responsividade** | Desktop (max 1200px) · Tablet 768–1024px · Mobile ≤640px |
| **Estados** | Skeleton shimmer · erro · parcial · vazio · `prefers-reduced-motion` |

---

## 10. Regras para Novos PATCHes

### Pode

- ✔ Adicionar módulos
- ✔ Adicionar gráficos (séries oficiais)
- ✔ Adicionar APIs
- ✔ Adicionar RPCs
- ✔ Adicionar filtros
- ✔ Adicionar exportações
- ✔ Adicionar comparativos

### Não pode

- ✘ Quebrar contratos existentes
- ✘ Alterar métricas existentes sem versionamento
- ✘ Recalcular Analytics no frontend
- ✘ Mover lógica de agregação para componentes React
- ✘ Alterar payloads sem versionamento
- ✘ Remover componentes da baseline

---

## 11. Processo Obrigatório

Todo PATCH futuro deverá seguir:

```text
Arquitetura
    ↓
Implementação
    ↓
Testes Unitários
    ↓
Integração
    ↓
Browser
    ↓
Produção
    ↓
Auditoria
    ↓
Evidências
    ↓
Git
    ↓
Encerramento Oficial
```

Comando de revalidação da baseline: `npm run test:mia:analytics:patch-a10:closure`

---

## 12. Compatibilidade

Toda **Fase B** deverá permanecer **100% compatível** com a Baseline A.

Mudanças incompatíveis exigem:

- novo PATCH versionado;
- migração SQL (se RPC);
- documentação atualizada;
- regressão completa (A.2–A.10 + novo PATCH).

---

## 13. Documentos Oficiais

| Documento | Função |
|-----------|--------|
| [FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md](./FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md) | Relatório completo da Fase A |
| [FOUNDER_EXECUTIVE_DASHBOARD.md](./FOUNDER_EXECUTIVE_DASHBOARD.md) | Referência operacional do cockpit |
| [FOUNDER_COCKPIT_DESIGN_SYSTEM.md](./FOUNDER_COCKPIT_DESIGN_SYSTEM.md) | Design System (A.9) |
| [PATCH_A_10_CLOSURE_EVIDENCE.json](./PATCH_A_10_CLOSURE_EVIDENCE.json) | Encerramento oficial da Fase A |

---

## 14. Encerramento

Este documento representa a **arquitetura oficial congelada** do Founder Cockpit após a conclusão da Fase A.

Qualquer evolução futura deverá preservar integralmente esta baseline, garantindo compatibilidade arquitetural, estabilidade dos contratos e rastreabilidade através de PATCHES versionados.
