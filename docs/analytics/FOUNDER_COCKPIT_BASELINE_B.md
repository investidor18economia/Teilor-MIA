# Founder Cockpit — Baseline B

## 1. Status Oficial

| Campo | Valor |
|-------|-------|
| **Fase** | B — Dashboard Executivo |
| **Status** | OFFICIALLY_COMPLETED |
| **Baseline** | FROZEN |
| **Veredito** | PHASE_B_OFFICIALLY_CLOSED |
| **Conclusão** | 2026-07-29 (PATCH B.9) |
| **Commit oficial** | `91b636b4bcb64ef552da5a12a2f057b26fcd5341` |
| **Baseline anterior** | [FOUNDER_COCKPIT_BASELINE_A.md](./FOUNDER_COCKPIT_BASELINE_A.md) (FROZEN · preservada) |
| **Relatório completo** | [FOUNDER_COCKPIT_PHASE_B_FINAL_REPORT.md](./FOUNDER_COCKPIT_PHASE_B_FINAL_REPORT.md) |
| **Auditoria relacionada** | [PHASE_B_CLOSURE_REPORT.json](./PHASE_B_CLOSURE_REPORT.json) |

---

## 2. Objetivo da Baseline

Esta baseline representa o **contrato congelado da Fase B** do Founder Cockpit (`/cockpit-fundador`).

Ela define a **camada executiva estratégica** entregue nos PATCHes B.1–B.9 e estabelece as regras permanentes para qualquer evolução futura do cockpit.

Toda evolução posterior à Fase B **deve respeitar integralmente**:

- a Baseline A (FROZEN);
- esta Baseline B (FROZEN);
- os contratos, layout e garantias aqui documentados.

Nenhuma alteração arquitetural, de contrato ou de layout executivo poderá ocorrer sem **PATCH versionado**, regressão completa, evidências de encerramento e validação em produção.

---

## 3. Escopo congelado

| PATCH | Escopo congelado |
|-------|------------------|
| **B.1** | Arquitetura executiva — camadas, responsabilidades, roadmap |
| **B.2** | KPIs estratégicos — 10 KPIs, badges, tendências |
| **B.3** | Crescimento da plataforma — 8 indicadores, comparativos temporais |
| **B.4** | Saúde do produto — índice de saúde, 8 indicadores |
| **B.5** | Performance comercial — índice comercial, funil, 10 indicadores |
| **B.6** | Indicadores operacionais — índice operacional, 9 indicadores |
| **B.7** | Resumo executivo — síntese B.2–B.6, prioridades, riscos, confiança |
| **B.8** | Polimento executivo — UX/UI, disclaimers, acessibilidade, responsividade |
| **B.9** | Garantias validadas — arquitetura, regressões, browser, produção, Git |

A Fase B **não remove** módulos da Baseline A. Adiciona camada executiva **acima** dos módulos operacionais existentes.

---

## 4. Arquitetura Oficial (Fase B)

```text
Dados e contratos existentes (APIs / RPCs — Baseline A)
        ↓
Catalog Layer (SSOT — thresholds, badges, labels)
        ↓
Display / Mapper Layer (formatação e composição)
        ↓
Componentes React render-only
        ↓
FounderExecutiveModuleViewsContext (registro de views B.2–B.6)
        ↓
Resumo Executivo (B.7)
```

| Camada | Responsabilidade | Proibido |
|--------|------------------|----------|
| **Interface Executiva** | Renderizar módulos B, estados UI, fetch client-side apenas onde já aprovado (B.2–B.6) | SQL, agregação, lógica de negócio |
| **Catalog Layer** | SSOT de thresholds, badges, ordem de seções, copy executivo | Acesso a DB, fetch |
| **Mapper Executivo** | Formatação, composição, narrativas determinísticas | SQL, Supabase, fetch, novas agregações |
| **API / Serviço / RPC** | Herdados da Baseline A — inalterados pela Fase B | — |

**Regra absoluta:** B.7 **nunca** recalcula métricas dos módulos B.2–B.6 — consome views prontas.

---

## 5. Contratos arquiteturais obrigatórios

As regras abaixo são **permanentes** para o Founder Cockpit enquanto a Baseline B estiver em vigor:

1. **Inteligência de negócio não pode ser adicionada ao React** — classificação, índices e thresholds vivem em catálogos e mappers.
2. **Thresholds centralizados em catálogos** — proibido duplicar limites em componentes.
3. **Mappers não acessam SQL, Supabase ou banco** — apenas transformam contratos HTTP existentes.
4. **B.7 não recalcula métricas** dos módulos anteriores — consome `FounderExecutiveModuleViewsContext`.
5. **Novas métricas nascem em contratos versionados** (RPC/API) — nunca inventadas no frontend.
6. **Ausência de dados ≠ queda** — estados vazios/indisponíveis não implicam tendência negativa.
7. **Percentuais exigem denominador objetivo** no contrato — sem denominador, exibir `—` ou estado documentado.
8. **Clique, favorito e alerta ≠ compra** — sem evento comprovado, não declarar receita ou conversão final.
9. **Nenhuma causalidade inventada** — narrativas derivam de sinais explícitos nos mappers.
10. **Módulos futuros preservam SSR, autenticação e responsividade** — gate, cookie, layout adaptativo.
11. **Nenhuma evolução pode quebrar B.1–B.8** sem PATCH versionado e auditoria formal.

---

## 6. Contratos e versões preservados

### Baseline A (herdados — FROZEN)

| Domínio | Versão | Referência |
|---------|--------|------------|
| Cockpit snapshot display | A.2.0 | `lib/miaFounderCockpitDisplay.js` |
| Executive API | 11.1.0 | `pages/api/executive-metrics.js` |
| Temporal catalog / API | A.7.0 | `lib/miaTemporalSeriesCatalog.js` |
| Filters catalog | A.7.0 | `lib/miaFounderFiltersCatalog.js` |
| Charts display | A.8.0 | `lib/miaFounderChartsDisplay.js` |
| Growth display (A.4) | A.4.0 | `lib/miaFounderGrowthDisplay.js` |
| Products display (A.5) | A.5.0 | `lib/miaFounderProductsDisplay.js` |
| Performance display (A.6) | A.6.0 | `lib/miaFounderPerformanceDisplay.js` |

### Fase B (congelados)

| Domínio | Versão | Referência |
|---------|--------|------------|
| Executive KPIs catalog | B.2.0 | `lib/miaFounderExecutiveCatalog.js` |
| Executive KPIs display | B.2.0 | `lib/miaFounderExecutiveDisplay.js` |
| Growth catalog | B.3.0 | `lib/miaFounderExecutiveGrowthCatalog.js` |
| Growth display | B.3.0 | `lib/miaFounderExecutiveGrowthDisplay.js` |
| Product health catalog | B.4.0 | `lib/miaFounderExecutiveProductHealthCatalog.js` |
| Product health display | B.4.0 | `lib/miaFounderExecutiveProductHealthDisplay.js` |
| Commercial catalog | B.5.0 | `lib/miaFounderExecutiveCommercialPerformanceCatalog.js` |
| Commercial display | B.5.0 | `lib/miaFounderExecutiveCommercialPerformanceDisplay.js` |
| Operational catalog | B.6.0 | `lib/miaFounderExecutiveOperationalCatalog.js` |
| Operational display | B.6.0 | `lib/miaFounderExecutiveOperationalDisplay.js` |
| Summary catalog | B.7.0 | `lib/miaFounderExecutiveSummaryCatalog.js` |
| Summary display | B.7.0 | `lib/miaFounderExecutiveSummaryDisplay.js` |
| Polish catalog | B.8.0 | `lib/miaFounderExecutivePolishCatalog.js` |

Alteração de qualquer versão exige PATCH documentado, regressão B.1–B.8 + A.10 + A.2 + A.9 e evidências de encerramento.

---

## 7. Estrutura oficial

### Catálogos executivos

```
lib/miaFounderExecutiveCatalog.js                    # B.2
lib/miaFounderExecutiveGrowthCatalog.js              # B.3
lib/miaFounderExecutiveProductHealthCatalog.js       # B.4
lib/miaFounderExecutiveCommercialPerformanceCatalog.js # B.5
lib/miaFounderExecutiveOperationalCatalog.js         # B.6
lib/miaFounderExecutiveSummaryCatalog.js             # B.7
lib/miaFounderExecutivePolishCatalog.js              # B.8
```

### Mappers / displays executivos

```
lib/miaFounderExecutiveDisplay.js
lib/miaFounderExecutiveGrowthDisplay.js
lib/miaFounderExecutiveProductHealthDisplay.js
lib/miaFounderExecutiveCommercialPerformanceDisplay.js
lib/miaFounderExecutiveOperationalDisplay.js
lib/miaFounderExecutiveSummaryDisplay.js
```

### Componentes executivos

```
components/founder-cockpit/
├── FounderExecutiveKpisSection.jsx              # B.2
├── FounderExecutiveGrowthSection.jsx            # B.3
├── FounderExecutiveProductHealthSection.jsx     # B.4
├── FounderExecutiveCommercialPerformanceSection.jsx # B.5
├── FounderExecutiveOperationalSection.jsx       # B.6
├── FounderExecutiveSummarySection.jsx         # B.7
├── FounderExecutiveModuleViewsContext.jsx     # B.7 bridge
└── FounderExecutiveInsights.jsx               # PATCH 11.4 (Baseline A)
```

### Página e layout

- `components/founder-cockpit/FounderCockpitPage.jsx` — ordem oficial das seções
- `pages/cockpit-fundador.jsx` — SSR gate + fetch snapshot
- `styles/founder-cockpit.css` — tokens `--fc-*`, bloco PATCH B.8

### APIs utilizadas (Baseline A — inalteradas)

| Endpoint | Uso na Fase B |
|----------|---------------|
| `GET /api/executive-metrics` | SSR + módulos B.2, B.4, B.5, B.6 |
| `GET /api/temporal-metrics` | B.2, B.3, B.5 (séries oficiais) |
| `GET /api/founder/executive-insights` | Insights Executivos |
| `POST /api/founder/authenticate` | Gate |

### Scripts de testes e auditoria

```bash
# Regressão por patch
npm run test:mia:analytics:patch-b2:executive-kpis
npm run test:mia:analytics:patch-b3:executive-growth
npm run test:mia:analytics:patch-b4:executive-product-health
npm run test:mia:analytics:patch-b5:executive-commercial-performance
npm run test:mia:analytics:patch-b6:executive-operational
npm run test:mia:analytics:patch-b7:executive-summary
npm run test:mia:analytics:patch-b8:executive-polish

# Auditoria e encerramento Fase B
npm run test:mia:analytics:patch-b9:phase-b-final-audit
npm run test:mia:analytics:patch-b9:browser
npm run test:mia:analytics:patch-b9:production
npm run test:mia:analytics:patch-b9:closure
```

---

## 8. Layout congelado

Ordem oficial das seções executivas:

| Ordem | Seção | ID | PATCH |
|-------|-------|-----|-------|
| 1 | KPIs Estratégicos | `mod-kpis-estrategicos` | B.2 |
| 2 | Crescimento da Plataforma | `mod-crescimento-plataforma` | B.3 |
| 3 | Saúde do Produto | `mod-saude-produto` | B.4 |
| 4 | Performance Comercial | `mod-performance-comercial` | B.5 |
| 5 | Indicadores Operacionais | `mod-indicadores-operacionais` | B.6 |
| 6 | Resumo Executivo | `mod-resumo-executivo` | B.7 |
| 7 | Insights Executivos | `executive-ai-insights` | 11.4 |

Qualquer mudança futura de ordem, inclusão ou remoção de seção executiva deverá ser:

- **justificada** documentalmente;
- **versionada** em PATCH formal;
- **testada** com regressão B.1–B.8 + Baseline A;
- **validada** em browser desktop/tablet/mobile e produção;
- **documentada** em evidências de encerramento.

---

## 9. Gates obrigatórios para futuras alterações

Todo PATCH que toque o Founder Cockpit deve executar, no mínimo:

| Gate | Comando / referência |
|------|----------------------|
| Testes do módulo alterado | `test:mia:analytics:patch-bX:*` |
| Regressões B.1–B.8 | scripts `test-mia-analytics-patch-b1` … `b8` |
| Baseline A.10 | `test:mia:analytics:patch-a10:final-audit` |
| Regressão A.2 | `test-mia-analytics-patch-a2-founder-snapshot-complete.js` |
| Regressão A.9 | `test-mia-analytics-patch-a9-ui-polish.js` |
| Build | `npm run build` |
| Browser desktop/tablet/mobile | `patch-b9-browser-validation.mjs` |
| Produção | `patch-b9-production-validation.mjs` |
| Documentação | atualização de docs oficiais |
| Git | working tree limpo · `origin/master` sincronizado |

**Suíte recomendada de regressão contínua:** `npm run test:mia:analytics:patch-b9:closure`

Encerramento de PATCH **não** é válido somente com testes locais — browser e produção são obrigatórios quando `MIA_ADMIN_API_KEY` estiver disponível.

---

## 10. Proibições

- ✘ Alterar silenciosamente contratos de API, RPC ou versões de catálogo/display
- ✘ Recalcular métricas, índices ou scores no frontend
- ✘ Duplicar thresholds fora dos catálogos
- ✘ Criar percentuais sem denominador objetivo no contrato
- ✘ Declarar receita, compra ou causalidade sem evento comprovado
- ✘ Encerrar PATCH apenas com testes unitários locais
- ✘ Modificar layout executivo ou arquitetura sem nova auditoria formal
- ✘ Quebrar compatibilidade com Baseline A
- ✘ Adicionar SQL, Supabase ou fetch indevido em mappers executivos
- ✘ Fazer B.7 buscar dados diretamente — deve consumir views do context

---

## 11. Procedimento de extensão

Novas funcionalidades do Founder Cockpit devem seguir:

```text
1. Objetivo próprio documentado
        ↓
2. Arquitetura auditada (compatível com Baseline A + B)
        ↓
3. Roadmap aprovado explicitamente
        ↓
4. Contratos versionados (RPC/API/catalog/display)
        ↓
5. Implementação preservando Baseline B
        ↓
6. Regressão completa (B.1–B.8 + A.10 + A.2 + A.9)
        ↓
7. Build + browser + produção
        ↓
8. Evidências JSON + screenshots
        ↓
9. Documentação atualizada
        ↓
10. Git limpo · push origin/master
        ↓
11. Aprovação explícita de encerramento
```

Extensões que alterem contratos congelados exigem **nova auditoria formal** equivalente à B.9.

---

## 12. Compatibilidade

| Baseline | Regra |
|----------|-------|
| **Baseline A** | 100% preservada — FROZEN |
| **Baseline B** | Camada executiva congelada — FROZEN |
| **Fase C+** | Deve compor sobre A + B sem breaking changes |

Mudanças incompatíveis exigem PATCH versionado, migração documentada (se RPC), regressão completa e nova baseline formal.

---

## 13. Documentos oficiais

| Documento | Função |
|-----------|--------|
| [FOUNDER_COCKPIT_PHASE_B_FINAL_REPORT.md](./FOUNDER_COCKPIT_PHASE_B_FINAL_REPORT.md) | Relatório humano completo da Fase B |
| [FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md](./FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md) | Arquitetura detalhada (B.1) |
| [FOUNDER_COCKPIT_BASELINE_A.md](./FOUNDER_COCKPIT_BASELINE_A.md) | Baseline A congelada |
| [FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md](./FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md) | Relatório da Fase A |
| [FOUNDER_EXECUTIVE_DASHBOARD.md](./FOUNDER_EXECUTIVE_DASHBOARD.md) | Referência operacional módulo a módulo |
| [FOUNDER_COCKPIT_DESIGN_SYSTEM.md](./FOUNDER_COCKPIT_DESIGN_SYSTEM.md) | Design System (A.9 + B.8) |
| [PHASE_B_CLOSURE_REPORT.json](./PHASE_B_CLOSURE_REPORT.json) | Encerramento machine-readable B.9 |
| [PHASE_B_FINAL_AUDIT_EVIDENCE.json](./PHASE_B_FINAL_AUDIT_EVIDENCE.json) | Auditoria arquitetural B.9 |
| [PHASE_B_BROWSER_FINAL_EVIDENCE.json](./PHASE_B_BROWSER_FINAL_EVIDENCE.json) | Browser final B.9 |
| [PHASE_B_PRODUCTION_FINAL_EVIDENCE.json](./PHASE_B_PRODUCTION_FINAL_EVIDENCE.json) | Produção final B.9 |

---

## 14. Encerramento

```text
FOUNDER_COCKPIT_BASELINE_B — FROZEN
```

Esta baseline representa o **contrato permanente da Fase B** do Founder Cockpit após o veredito **PHASE_B_OFFICIALLY_CLOSED** (commit `91b636b`).

Qualquer alteração futura passa a ser uma **extensão posterior à Fase B**, sujeita aos gates, proibições e procedimentos deste documento.

A Fase B é a **baseline oficial atual** do Founder Cockpit. A Baseline A permanece congelada como fundação infraestrutural.

---

*Documento normativo gerado na documentação pós-Fase B — commit de referência `91b636b`.*
