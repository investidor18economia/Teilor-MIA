# Cockpit Executivo do Fundador — PATCH 11.3

Painel privado autenticado para acompanhamento executivo da plataforma Teilor/MIA.

**Rota:** `/cockpit-fundador`  
**Fonte única:** `GET /api/executive-metrics?days={7|30|90|365}`  
**Versão:** 11.3.0

---

## Arquitetura

```
/cockpit-fundador (SSR — getServerSideProps)
        │
        ├─ requireFounderGate(cookie)
        │     └─ não autorizado → FounderLoginGate
        │
        └─ fetch /api/executive-metrics?days=N
               └─ mapExecutiveMetricsToFounderCockpit()
                      └─ FounderCockpitPage (módulos + KPIs)
```

**Autenticação:**

| Método | Endpoint | Resultado |
|--------|----------|-----------|
| Chave admin | `POST /api/founder/authenticate` `{ admin_key }` | Cookie `mia_founder_gate` |
| Sessão MIA | `{ session_token }` + email em `MIA_FOUNDER_ALLOWED_EMAILS` | Cookie assinado |
| Logout | `POST /api/founder/logout` | Limpa cookie |

**Env:** `MIA_FOUNDER_ALLOWED_EMAILS` (emails separados por vírgula)

---

## Módulos

0. **KPIs Estratégicos** (PATCH B.2) — visão executiva superior para decisão rápida  
0.1 **Crescimento da Plataforma** (PATCH B.3) — evolução, velocidade, aceleração e comparativo de período  
0.2 **Saúde do Produto** (PATCH B.4) — qualidade, aceitação, confiança e índice executivo de saúde  
1. **Executive AI Insights** (PATCH 11.4) — resumo executivo e insights determinísticos  
2. **Visão geral** — 10 KPIs executivos (PATCH A.2)  
3. **Sessões e Usuários** (PATCH A.4) — DAU/WAU/MAU, composição, tendências, atividade diária  
4. **Produtos e Categorias** (PATCH A.5) — ranking, distribuição, inteligência por categoria  
5. **Performance e Conversão** (PATCH A.6) — funil, CTR, gargalos, eficiência do período  
6. **Plataforma** — sessões, visitantes, conversas, perguntas (snapshot)  
7. **Conversação** — perguntas enviadas, recomendações exibidas, conversas com perguntas (PATCH A.2)  
8. **Recomendações** — geradas, runner-up, sinais, taxas  
9. **Comercial** — conjuntos de ofertas, ofertas retornadas, provedores, cliques, favoritos  
10. **Alertas de preço** — criados, ativos, metas atingidas, notificações (PATCH A.2)  
11. **Price Intelligence** — qualidade média + barras de confiança  
12. **Economia** — potencial total, média, oportunidades (disclaimer)  
13. **Anti-Regret** — score médio + distribuição  
14. **User Value** — score médio, valores verificados + distribuição  
15. **Sistema** — versão, build, ambiente, latência API, status

---

## KPIs Estratégicos (PATCH B.2)

**Mapper:** `lib/miaFounderExecutiveDisplay.js` (B.2.0)  
**Catálogo:** `lib/miaFounderExecutiveCatalog.js` (B.2.0)  
**Componente:** `FounderExecutiveKpisSection.jsx` (client fetch)  
**Posição:** acima de Executive Insights e Visão geral A.2

**Fontes (contratos existentes — sem alteração de API/RPC):**

| KPI | Fonte | Campo oficial |
|-----|-------|---------------|
| Usuários Ativos | temporal `growth` | `dau_visitors` (fallback: `platform.unique_visitors`) |
| Crescimento de Usuários | temporal `growth` | `crescimento_dau_visitors_pct` |
| Crescimento de Sessões | executive snapshot | `platform.total_sessions` (volume período — pct detalhado em B.3) |
| Crescimento de Perguntas | executive snapshot | `platform.questions` (volume período — pct detalhado em B.3) |
| Recomendações Emitidas | executive snapshot | `recommendation.recommendations_generated` |
| CTR | temporal `conversion.summary` | `taxa_clique_recomendacao` |
| Conversão | temporal `conversion.summary` | `conversao_acumulada_visitante` |
| Produtos Ativos | temporal `products.summary` | `distinct_products` |
| Categorias Ativas | temporal `categories.summary` | `distinct_categories` |
| Tendência Geral | temporal `growth` | `crescimento_dau_visitors_pct` |

**Badges (determinísticas — sem IA):**

| Badge | Regra |
|-------|-------|
| Excelente | trend pct ≥ 10% **ou** CTR ≥ 5% **ou** conversão ≥ 3% |
| Crescendo | trend pct > 2% |
| Em evolução | trend pct > 0% e ≤ 2% |
| Estável | trend pct entre −2% e +2% **ou** CTR intermediário |
| Atenção | trend pct < −2% **ou** CTR < 1% **ou** conversão < 0,5% |

Threshold de tendência reutiliza `FOUNDER_GROWTH_TREND_THRESHOLD` (A.4) = ±2%.

**Tendências visuais:** setas ↑ ↓ → + pct formatado — apenas quando campo `crescimento_*_pct` oficial existe.

**Responsabilidades:**

- **Interface:** renderizar grupos Plataforma + Comercial, skeleton, retry
- **Mapper B.2.0:** resolver catálogo, badges, tendências, formatação
- **Proibido:** agregação, SQL, alteração de contratos Baseline A

---

## Crescimento da Plataforma (PATCH B.3)

**Mapper:** `lib/miaFounderExecutiveGrowthDisplay.js` (B.3.0)  
**Catálogo:** `lib/miaFounderExecutiveGrowthCatalog.js` (B.3.0)  
**Componente:** `FounderExecutiveGrowthSection.jsx` (client fetch)  
**Posição:** abaixo de KPIs Estratégicos (B.2) e acima de Executive Insights

**Fontes (contratos existentes — sem alteração de API/RPC):**

| Indicador | Fonte | Campo oficial |
|-----------|-------|---------------|
| Crescimento de usuários | temporal `growth` | `crescimento_dau_visitors_pct` |
| Crescimento de sessões | executive snapshot + offset | `platform.total_sessions` (período vs anterior) |
| Crescimento de perguntas | executive snapshot + offset | `platform.questions` |
| Crescimento de conversas | executive snapshot + offset | `platform.conversations` |
| Tendência geral | temporal `growth` | síntese DAU + WAU + MAU pct |
| Velocidade de crescimento | temporal `growth` | magnitud `crescimento_dau_visitors_pct` |
| Aceleração | temporal `growth.series` | Δ pct DAU último vs penúltimo dia |
| Engajamento diário | temporal `platform_activity` | sessões/perguntas último vs penúltimo dia |

**Comparativo de período:** `GET /api/executive-metrics?...&offset_days={window_days}` (filtro oficial A.7).

**Narrativa executiva (determinística — sem IA):**

| Regra | Mensagem |
|-------|----------|
| DAU ↑ e WAU ↑ | Crescimento consistente nas últimas semanas. |
| Aceleração positiva | A plataforma acelerou neste período. |
| Desaceleração | O ritmo caiu em relação ao período anterior. |
| DAU ↑ + engajamento estável | Usuários continuam aumentando, mas o engajamento estabilizou. |
| DAU ↓ ou período ↓ | Sinais de desaceleração merecem atenção executiva. |

**Badges:** Crescendo · Estável · Atenção · Acelerando · Desacelerando · Saudável

**Responsabilidades:**

- **Interface:** renderizar narrativa, trends DAU/WAU/MAU, grid de indicadores, skeleton, retry
- **Mapper B.3.0:** interpretação temporal, comparativo, velocidade, aceleração, badges, narrativa
- **Proibido:** agregação, SQL, fetch, alteração de contratos Baseline A ou B.2

### Encerramento (PATCH B.3)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_B_3_EXECUTIVE_GROWTH_EVIDENCE.json` | Catálogo + mapper + layout + regressões |
| `PATCH_B_3_BROWSER_EVIDENCE.json` | Desktop/tablet/mobile autenticado |
| `PATCH_B_3_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Saúde do Produto (PATCH B.4)

**Mapper:** `lib/miaFounderExecutiveProductHealthDisplay.js` (B.4.0)  
**Catálogo:** `lib/miaFounderExecutiveProductHealthCatalog.js` (B.4.0)  
**Componente:** `FounderExecutiveProductHealthSection.jsx` (client fetch offset)  
**Posição:** abaixo de Crescimento da Plataforma (B.3) e acima de Executive Insights

**Fontes (contratos existentes — sem alteração de API/RPC):**

| Indicador | Fonte | Campo oficial |
|-----------|-------|---------------|
| Qualidade das recomendações | executive snapshot | `price_intelligence.average_price_quality_score` |
| Aceitação das recomendações | executive snapshot | `recommendation.recommendation_acceptance_rate` |
| Rejeição | executive snapshot | `recommendation.rejection_rate` |
| Confiança do usuário | executive snapshot | `user_value.average_user_value` + `anti_regret.average_score` |
| Uso de runner-up | executive snapshot | `recommendation.runner_up_usage` |
| Saúde das conversas | executive snapshot | `conversation.conversations_with_questions / platform.conversations` |
| Qualidade geral do produto | derivado (mapper) | média normalizada qualidade + aceitação + confiança |
| Índice executivo de saúde | derivado (mapper) | índice 0–100 dos sinais oficiais disponíveis |

**Comparativo de período:** `GET /api/executive-metrics?...&offset_days={window_days}` para detectar degradação em aceitação/rejeição.

**Narrativa executiva (determinística — sem IA):**

| Regra | Mensagem |
|-------|----------|
| Qualidade excelente + aceitação saudável | O produto mantém excelente qualidade de recomendações. |
| Queda na aceitação (período) | Há sinais leves de queda na aceitação. |
| Rejeição elevada | Sinais de rejeição merecem atenção executiva. |
| Conversas com baixo engajamento | Existe um ponto de atenção nas conversas. |
| Confiança elevada | A confiança permanece elevada. |
| Sinais de valor | Usuários continuam encontrando valor. |

**Badges:** Excelente · Saudável · Estável · Atenção · Degradando

**Responsabilidades:**

- **Interface:** renderizar narrativa, índice de saúde, grid de indicadores, skeleton, retry
- **Mapper B.4.0:** classificação, índices, comparativo, badges, narrativa
- **Proibido:** agregação SQL, fetch, alteração de contratos Baseline A, B.2 ou B.3

### Encerramento (PATCH B.4)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_B_4_EXECUTIVE_PRODUCT_HEALTH_EVIDENCE.json` | Catálogo + mapper + layout + regressões |
| `PATCH_B_4_BROWSER_EVIDENCE.json` | Desktop/tablet/mobile autenticado |
| `PATCH_B_4_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Performance e Conversão (PATCH A.6)

**Fonte temporal:** `GET /api/temporal-metrics?days=N&series=conversion`  
**Mapper:** `lib/miaFounderPerformanceDisplay.js`  
**Componente:** `FounderPerformanceConversionSection.jsx` (client fetch independente)  
**SQL canônico:** PATCH 4.3 `CONVERSION_DASHBOARD.md` + PATCH 5.3 bottleneck

| Bloco | Origem | Métricas |
|-------|--------|----------|
| Resumo período | `conversion.summary` | recomendações, cliques, CTR, taxa favoritos, taxa alertas, conversão acumulada |
| Funil | `conversion.funnel_stages[]` | 6 etapas — eventos, visitantes seq., taxa conv., abandono, acumulada |
| Gargalo principal | `conversion.bottlenecks[]` | transição com maior abandono (`is_gargalo_principal`) |
| Transições | `conversion.bottlenecks[]` | abandono e conversão por transição |
| Evolução diária | `conversion.daily[]` | recomendações, cliques, CTR (7 dias) |
| Referência snapshot | `executive-metrics` | geradas, runner-up, cliques, favoritos, alertas |

**Métricas indisponíveis (documentadas na UI):** cliques distintos por recomendação, abandono global único, funil por cohort.

**Reservado:** ~~gráficos (A.8)~~ → implementado no PATCH A.8 (`FounderLineChart`, `FounderBarChart`).

### Encerramento (PATCH A.6.1)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_6_FOUNDER_PERFORMANCE_CONVERSION_EVIDENCE.json` | API prod + RPC + bundle |
| `PATCH_A_6_BROWSER_UI_EVIDENCE.json` | Interface autenticada + paridade API |
| `PATCH_A_6_1_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Produtos e Categorias (PATCH A.5)

**Fonte temporal:** `GET /api/temporal-metrics?days=N&series=products,categories`  
**Mapper:** `lib/miaFounderProductsDisplay.js`  
**Componente:** `FounderProductsCategoriesSection.jsx` (client fetch independente)  
**SQL canônico:** PATCH 4.4 `PRODUCTS_CATEGORIES_DASHBOARD.md`

| Bloco | Origem | Métricas |
|-------|--------|----------|
| Resumo produtos | `products.summary` | distintos, aparições, recomendações, cliques, favoritos, alertas, taxa clique |
| Ranking produtos | `products.ranking[]` | top 10 por aparições — campo `product_label` (privacidade API) |
| Resumo categorias | `categories.summary` | distintas, perguntas, recomendações, cliques, eventos, taxas conversão |
| Distribuição | `categories.ranking[]` + summary total | barras de participação relativa |
| Ranking categorias | `categories.ranking[]` | top 10 por eventos |
| Atividade recente | `categories.daily[]` / `products.daily[]` | tabelas compactas |
| Referência snapshot | `executive-metrics` | recomendações/comercial agregados |

**Métricas indisponíveis (documentadas na UI):** produtos pesquisados por termo, produtos comparados, product_view.

**Privacidade:** API usa `product_label` em vez de `product_name` (chave proibida no catálogo público). Cockpit fundador é privado (`noindex`).

**Reservado:** ~~gráficos (A.8)~~ → implementado no PATCH A.8 (`FounderLineChart`, `FounderBarChart`).

### Encerramento (PATCH A.5.1)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_5_FOUNDER_PRODUCTS_CATEGORIES_EVIDENCE.json` | API prod + RPC + bundle |
| `PATCH_A_5_BROWSER_UI_EVIDENCE.json` | Interface autenticada + paridade API |
| `PATCH_A_5_1_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Sessões e Usuários (PATCH A.4)

**Fonte temporal:** `GET /api/temporal-metrics?days=N&series=growth,platform_activity`  
**Mapper:** `lib/miaFounderGrowthDisplay.js`  
**Componente:** `FounderSessionsUsersSection.jsx` (client fetch independente)

| Bloco | Origem | Métricas |
|-------|--------|----------|
| Alcance rolling | `growth.series[0]` | DAU/WAU/MAU visitantes e usuários |
| Composição | `growth.series[0]` | novos, recorrentes, anônimos, autenticados, taxa autenticação |
| Atividade último dia | `platform_activity.series[0]` | sessões, conversas, perguntas, recomendações exibidas |
| Tendências | `growth.series[0]` pct fields | crescimento DAU/WAU/MAU (sem gráficos) |
| Tabela recente | join por `activity_day` | últimos 7 dias — valores da API, sem soma |
| Referência snapshot | `executive-metrics` | totais do período (complementar) |

**Snapshot vs temporal:** snapshot = janela rolling acumulada; temporal = visão diária e rolling por dia de referência.

**Resiliência:** falha temporal não quebra snapshot SSR. `partial_errors` exibidos quando um grupo falha.

**Reservado:** ~~gráficos (A.8)~~ → implementado no PATCH A.8 (`FounderLineChart`, `FounderBarChart`).

### Encerramento (PATCH A.4.1)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_4_FOUNDER_SESSIONS_USERS_EVIDENCE.json` | API temporal + mapper + bundle em produção |
| `PATCH_A_4_BROWSER_UI_EVIDENCE.json` | Interface autenticada (build local produção, dados reais) |
| `PATCH_A_4_1_CLOSURE_EVIDENCE.json` | Encerramento oficial |

**Validação de interface:** Playwright autenticado em build local (`npm run start`) com mesma base Supabase. HTML autenticado em Vercel requer `MIA_ADMIN_API_KEY` de produção — mitigado por bundle deployado + browser E2E + API produção.

---

## Filtros Avançados (PATCH A.7)

**Catálogo:** `lib/miaFounderFiltersCatalog.js`  
**Normalização:** `lib/miaAnalyticsFilterParams.js`  
**UI:** `FounderCockpitFilters.jsx` + `FounderCockpitFiltersContext.jsx`

| Filtro | URL | Backend |
|--------|-----|---------|
| Período (hoje, 7d, 30d, 90d, custom) | `range`, `start`, `end` | `mia_analytics_resolve_window()` |
| Categoria | `category` | `p_category` em RPCs |
| Produto | `product_id` | `p_product_id` em RPCs |

**Timezone:** UTC · **Custom max:** 365 dias · **Cache:** sufixo por filtro em executive/temporal APIs

**Indisponíveis:** environment, channel, product_label (documentados na UI)

**Compatibilidade parcial:** Sessões (sem product_id) · Insights (sem category/product)

### Encerramento (PATCH A.7)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_7_ADVANCED_FILTERS_EVIDENCE.json` | Produção + RPC + bundle |
| `PATCH_A_7_BROWSER_UI_EVIDENCE.json` | Interface + URL |
| `PATCH_A_7_1_REAL_UI_VALIDATION_EVIDENCE.json` | Validação real A.7.1 |
| `PATCH_A_7_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Gráficos e Evolução Temporal (PATCH A.8)

**Mapper:** `lib/miaFounderChartsDisplay.js` (A.8.0)  
**Componentes:** `components/founder-cockpit/charts/*` (SVG nativo — sem biblioteca externa)  
**Fonte:** mesmas APIs temporais dos PATCHes A.4–A.6 · **sem novas métricas**

| Módulo | Gráfico | Série oficial |
|--------|---------|---------------|
| Sessões e Usuários | DAU + novos visitantes | `growth.series` |
| Sessões e Usuários | Sessões + perguntas | `platform_activity.series` |
| Produtos e Categorias | Perguntas por categoria | `categories.daily` |
| Produtos e Categorias | Recomendações por categoria | `categories.daily` |
| Produtos e Categorias | Participação entre categorias | `categories.ranking` (barras) |
| Produtos e Categorias | Aparições e recomendações | `products.daily` |
| Performance e Conversão | CTR diária | `conversion.daily` |
| Performance e Conversão | Recomendações e cliques | `conversion.daily` |
| Performance e Conversão | Funil do período | `conversion.funnel_stages` (barras) |

**Filtros:** PATCH A.7 aplicado integralmente (período, categoria, produto).  
**Timezone:** UTC · **Estados:** loading, vazio, erro, partial — por painel (falha isolada).  
**Limitação:** funil não possui evolução diária no contrato RPC — exibido como snapshot do período.

### Encerramento (PATCH A.8)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_8_CHARTS_EVIDENCE.json` | Produção + bundle |
| `PATCH_A_8_BROWSER_UI_EVIDENCE.json` | Interface + filtros |
| `PATCH_A_8_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Polimento da Interface (PATCH A.9)

**Escopo:** UX/UI exclusivamente — sem alteração de APIs, RPCs, métricas ou filtros.

**Design System:** `docs/analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md`  
**Tokens CSS:** `--fc-*` em `styles/founder-cockpit.css`  
**Loading:** `FounderSkeleton` (shimmer, reduced-motion safe)  
**Melhorias:** cards, tabelas (zebra/hover), filtros, focus-visible, module shells, responsividade tablet/mobile

### Encerramento (PATCH A.9)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_9_UI_POLISH_EVIDENCE.json` | Auditoria + produção |
| `PATCH_A_9_BROWSER_UI_EVIDENCE.json` | Desktop/tablet/mobile + paridade |
| `PATCH_A_9_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Auditoria Final da Fase A (PATCH A.10)

**Escopo:** validação, consolidação, documentação e congelamento — sem novas funcionalidades.

**Documento master:** `docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md`  
**Status Fase A:** OFFICIALLY_COMPLETED · **Baseline:** FROZEN

### Encerramento (PATCH A.10)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_10_FINAL_AUDIT_EVIDENCE.json` | Arquitetura + inventário A.1–A.9 |
| `PATCH_A_10_BROWSER_EVIDENCE.json` | Cenários funcionais completos |
| `PATCH_A_10_PRODUCTION_EVIDENCE.json` | Deploy + APIs + bundle |
| `PATCH_A_10_CLOSURE_EVIDENCE.json` | Encerramento oficial da Fase A |

---

## Filtros de período (legado)

Compatibilidade: `?days=30` mapeia para `?range=30d`. Preferir `range` a partir do PATCH A.7.

---

## Performance

- SSR por request (dados frescos por período)
- Cache da API executiva (TTL ~5 min)
- Sessões e Usuários: fetch client-side independente à API temporal (PATCH A.4)
- Produtos e Categorias: fetch client-side independente à API temporal (PATCH A.5)
- Performance e Conversão: fetch client-side independente à API temporal (PATCH A.6)
- Filtros avançados: estado centralizado + URL + backend RPC (PATCH A.7)

---

## Privacidade

- `robots: noindex, nofollow`
- Apenas agregados da API
- Scan de conteúdo proibido em auditorias
- Sem PII, IDs ou eventos individuais

---

## Limitações

- Autenticação requer `MIA_ADMIN_API_KEY` ou email na allowlist + sessão OTP
- Disponibilidade % uptime reservada para evolução da API
- Distribuições vazias exibem estado “Sem dados no período”

---

## Testes

```bash
npm run test:mia:analytics:patch-113:founder-executive-cockpit
npm run test:mia:analytics:patch-113:prod-smoke
npm run test:mia:analytics:patch-a4:founder-sessions-users
npm run test:mia:analytics:patch-a4:prod-validation
MIA_ADMIN_API_KEY=... npm run test:mia:analytics:patch-a4:prod-validation
```

---

## Referências

- [EXECUTIVE_METRICS_API.md](./EXECUTIVE_METRICS_API.md)
- [TEMPORAL_METRICS_API.md](./TEMPORAL_METRICS_API.md)
- [PUBLIC_METRICS_PAGE.md](./PUBLIC_METRICS_PAGE.md)
