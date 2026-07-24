# MVP Architecture Audit Report

**Projeto:** MIA / Teilor  
**Patch:** 12.1 — Auditoria Arquitetural Geral  
**Fase:** 12 — MVP Release Candidate  
**Status:** 🟢 Aprovado  
**Data:** 2026-07-24  
**Ambiente:** Produção `https://economia-ai.vercel.app`  
**Evidência:** `docs/analytics/PATCH_12_1_ARCHITECTURE_AUDIT_EVIDENCE.json`

---

# 1. Visão geral

Este relatório consolida a auditoria arquitetural completa da plataforma Teilor/MIA antes do processo de Release Candidate. O objetivo foi validar que todas as camadas construídas ao longo das Fases 1–11 e do Bloco 12 funcionam como **um único sistema coeso**, sem novas funcionalidades.

## Escopo auditado

- Frontend, API, Decision Engine, Cognitive Router, Contracts, Data Layer, Supabase, Analytics, Adapters, Executive Metrics, Segurança, Performance, Documentação
- **58 rotas API** catalogadas
- **~226 módulos** em `lib/`
- **11 migrations** Supabase no repositório
- **18+ catálogos** analytics + **16 classificadores**

## Veredito executivo

A arquitetura está **coesa, documentada e pronta para RC**, com riscos conhecidos catalogados (nenhum crítico bloqueador para MVP). Dívida técnica principal concentra-se no monólito cognitivo e em acoplamentos históricos — aceitáveis para RC, endereçáveis pós-MVP.

---

# 2. Arquitetura geral

## Diagrama lógico

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                                │
│  MIAChat.jsx · app-mia.jsx · teilor-em-numeros · cockpit-fundador       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │ POST /api/mia-chat    │ GET /api/executive-metrics              │
        │ POST /api/analytics/track │ GET /api/founder/* (gate)           │
        ▼                       ▼                       ▼
┌───────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ PERÍMETRO 12B │    │ EXECUTIVE METRICS 11 │    │ FOUNDER GATE 11.3   │
│ rate limit    │    │ 9 RPCs + cache       │    │ insights 11.4       │
│ CORS/hardening│    └──────────┬───────────┘    └─────────────────────┘
└───────┬───────┘               │
        │ forward               │ Supabase RPCs
        ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CORE COGNITIVO — pages/api/chat-gpt4o.js                               │
│  Observability (12E) · Shared State ALS (12F)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Intent Recognition → Cognitive Router → Intent Authority               │
│  Decision Engine → Data Layer → Prompt Builder → LLM                    │
│  Post Processing → Commercial Runtime → Adapters                        │
│  Analytics emit* chain (Phases 8–10)                                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ ADAPTERS      │    │ COMMERCIAL RUNTIME   │    │ SUPABASE            │
│ Google Shop   │    │ merge · select ·     │    │ analytics_events    │
│ Mercado Livre │    │ dedupe · activation  │    │ auth · wishes       │
│ DataForSEO    │    └──────────────────────┘    │ price_alerts · RPCs │
└───────────────┘                                └─────────────────────┘
```

## Pontos fortes

1. **Perímetro de produção explícito** (Bloco 12B–12D) — proxy público, fail-closed em rotas dev
2. **Single Source of Truth** para Executive Metrics (Fase 11) — validado em PATCH 11.5
3. **Pipeline analytics modular** — catalog/classifier/emit por domínio
4. **Adapter registry** extensível para novos marketplaces
5. **Observabilidade operacional** — health, ready, logs redacted, requestId
6. **Contratos versionados** — Event Contract v1, adapter 1.0.0, executive 11.1.0/11.4.0

---

# 3. Fluxo da MIA

## Cadeia validada

```text
Usuário (MIAChat.jsx)
    ↓ POST /api/mia-chat (perímetro)
    ↓ forward interno → chat-gpt4o.js
Intent Recognition (miaIntentRecognitionLayer.js)
    ↓
Cognitive Router (miaCognitiveRouter.js)
    ↓
Intent Authority (miaIntentAuthority.js)
    ↓
Decision Engine (buildDecisionEngineReply, resolveDecisionEngineWinners)
    ↓
Data Layer (classifyDataLayerResponse, semantic normalizer)
    ↓
Commercial Runtime (providers → merge → select → activation)
    ↓
Prompt Builder + LLM
    ↓
Post Processing + Analytics emit*
    ↓
Resposta sanitizada → Frontend
```

**Responsabilidade única:** confirmada por auditoria estática — nenhum componente frontend importa Decision Engine ou seleção comercial.

---

# 4. Responsabilidades por camada

| Camada | Responsabilidade | Local principal |
|--------|------------------|-----------------|
| Frontend | UI, IDs de sessão, renderização | `components/MIAChat.jsx` |
| Perímetro API | Rate limit, validação, proxy | `pages/api/mia-chat.js` |
| Core API | Orquestração cognitiva | `pages/api/chat-gpt4o.js` |
| Decision Engine | Winner, escopo, consistência | `lib/miaDecisionConsistencyFixes.js` + core |
| Cognitive Router | Classificação de turno | `lib/miaCognitiveRouter.js` |
| Data Layer | Resolução, normalização, evidências | `lib/miaDataLayer*.js` |
| Commercial | Fetch, merge, seleção, preço display | `lib/commercial/`, `lib/productSourceAdapter/` |
| Contracts | Versionamento, campos permitidos | `docs/analytics/contracts/` |
| Analytics | Emissão server-side de eventos | `lib/mia*Analytics.js` |
| Executive Metrics | Agregados executivos | `lib/miaExecutiveMetricsApi.js` |
| Adapters | Normalização por marketplace | `lib/productSourceAdapter/adapters/` |
| Banco | Persistência, RPCs, auth | Supabase |

---

# 5. Single Source of Truth

| Domínio | Fonte oficial | Consumidores |
|---------|---------------|--------------|
| Executive Metrics | `buildExecutiveMetricsResponse()` | API, página pública, cockpit, insights |
| Analytics payload | `assembleAnalyticsInsertRow()` | Todos os `emit*` |
| Produto normalizado | `normalizeProduct.js` v1.0.0 | Adapters, merge, selection |
| Providers comerciais | `commercialProviderRegistry.js` v4B.4 | Runtime, env gating |
| Eventos client-side | `ALLOWED_ANALYTICS_EVENTS` | `/api/analytics/track` |
| Favoritos | Supabase `wishes` + APIs save/list/delete | UI |
| Alertas | Supabase `price_alerts` + create API | UI (localStorage espelho) |

**Violações detectadas:** nenhuma crítica. Página pública e cockpit não consultam banco diretamente.

---

# 6. Decision Engine

## Estado

- Centralizado no core (`chat-gpt4o.js`) com libs de suporte desacopladas
- `resolveDecisionEngineWinners()` — resolução de winner com anchor
- `buildDecisionEngineReply()` — narrativa determinística
- Guards: `miaRecommendationStabilityGuard`, `miaFinalDecisionScopeGuard`
- Audits: `miaDecisionConsistencyAudit`, `miaCognitiveAudit`

## Validações

✅ Nenhuma decisão comercial no frontend  
✅ Nenhuma decisão no prompt como fonte autoritativa  
✅ LLM verbaliza — não decide winner  
✅ Seleção comercial separada (`selectCommercialOffers`) com contrato próprio v4D.2

## Risco conhecido (não crítico)

**Dual winner:** `selectedBestProduct` (cognitivo) pode divergir de `body.prices[0]` (comercial) em modo controlado — documentado desde PATCH 10.0.

---

# 7. Data Layer

## Componentes

- `miaDataLayerResolutionClassifier.js` — classificação de resposta
- `miaDataLayerSemanticNormalizer.js` — normalização semântica
- `miaDataLayerEvidenceInjectionLayer.js` — injeção de evidências
- `miaDataLayerHumanizationGuard.js` — guard contra invenção
- `miaDataLayerUsageAnalytics.js` — telemetria de uso

## Princípio

**A MIA nunca inventa informações** — Data Layer nativo não possui preço; enriquecimento vem de providers com normalização canônica.

---

# 8. Contracts

| Contrato | Versão | Status |
|----------|--------|--------|
| Event Contract | v1 | ✅ Ativo |
| Adapter Contract | 1.0.0 | ✅ Ativo |
| NormalizedProduct | 1.0.0 | ✅ Ativo |
| Executive Metrics API | 11.1.0 | ✅ Ativo |
| Executive AI Insights | 11.4.0 | ✅ Ativo |
| Intent Authority | 11A.2 | ✅ Ativo |
| Runtime Precedence | 11A.9.1 | ✅ Ativo |
| Commercial Selection | 4D.2 | ✅ Ativo |

**Contratos mortos:** nenhum detectado como breaking. Rotas dev usam contratos de teste isolados (middleware-blocked).

---

# 9. APIs

## Inventário: 58 rotas

### Produção (públicas aprovadas)

| Rota | Método | Auth |
|------|--------|------|
| `/api/mia-chat` | POST | Perímetro |
| `/api/executive-metrics` | GET | Público (agregados) |
| `/api/analytics/track` | POST | Allowlist |
| `/api/health`, `/api/ready` | GET | Público |
| `/api/create-price-alert` | POST | Session token |
| `/api/save-wish`, `/api/list-wish`, `/api/delete-wish` | * | Session token |
| `/api/auth/*` | * | Auth flow |

### Privadas

| Rota | Gate |
|------|------|
| `/api/founder/*` | Founder cookie / admin key |
| `/api/admin/*` | Admin |
| `/api/chat-gpt4o` | Internal x-api-key (via proxy) |

### Dev/Legacy (bloqueadas em prod)

- `/api/dev/*` (22 rotas)
- `/api/test-mia`, `/api/test-economia`, `/api/test-serp`, `/api/env`
- `/api/pages/api/test-economia` — **órfã**

## Consistência HTTP

✅ GET-only onde aplicável (executive-metrics, insights)  
✅ POST-only para chat perimeter  
✅ 404 fail-closed para dev routes  
✅ Headers de segurança via `miaPublicApiHardening.js`

---

# 10. Frontend

## Páginas

| Rota | Tipo | Propósito |
|------|------|-----------|
| `/` | Static | Landing |
| `/app-mia` | SPA-like | App principal MIA |
| `/teilor-em-numeros` | ISR 300s | Métricas públicas |
| `/cockpit-fundador` | SSR + gate | Painel executivo |
| `/mia-test` | Dev | Bloqueado em prod |

## Componentes (33)

- `MIAChat.jsx` — chat principal + analytics client IDs
- `public-metrics/*` — página pública Phase 11.2
- `founder-cockpit/*` — cockpit + insights Phase 11.3/11.4

## Validações

✅ Sem fetch direto a Supabase nos consumidores executivos  
✅ Sem lógica de decisão no frontend  
✅ Loading/erro tratados nos fluxos principais

---

# 11. Banco (Supabase)

## Migrations no repo: 11

| Área | Migrations |
|------|------------|
| Analytics identity | visitor_id, conversation_id, user_id index |
| Auth | challenges, rate limits, email normalize |
| Retention | indexes foundation |
| Executive Metrics | 9 RPCs + period offset + drop overloads |

## Tabelas-chave

- `analytics_events` — hub analytics
- `mia_auth_challenges`, `mia_auth_rate_limits` — auth OTP
- `wishes`, `price_alerts` — produto (DDL pode existir fora do repo)

## RPCs executivos (9 categorias)

Todas suportam `p_days` + `p_offset_days` — validado em PATCH 11.4 complement.

---

# 12. Analytics

## Pipeline

```text
Client (7 eventos allowlisted)
    ↓ POST /api/analytics/track
Server emit* (15+ domínios)
    ↓ assembleAnalyticsInsertRow
Supabase analytics_events
    ↓ RPCs
Executive Metrics API
    ↓
Pública / Cockpit / Insights
```

## Fases validadas

- Fase 8: offer_set, commercial search
- Fase 9: decision, acceptance, rejection
- Fase 10: price intelligence, savings, alerts, anti-regret, user value
- Fase 11: executive aggregation

## Integridade

✅ Sem eventos órfãos críticos  
✅ Dedup documentado por evento  
✅ Semantic guards (purchase_confirmed: false, etc.)  
✅ Executive Metrics como única fonte de KPIs executivos

---

# 13. Adapters

## Registry dual (governança intencional)

1. **`sourceRegistry.js`** — plug-in adapters (extensibilidade)
2. **`commercialProviderRegistry.js`** — providers de produção (env gating)

## Adapters ativos

| Provider | Arquivo | Preço |
|----------|---------|-------|
| Google Shopping (SERP) | `googleShoppingAdapter.js` | ✅ |
| Google Shopping (DataForSEO) | `dataForSeoGoogleShoppingAdapter.js` | ✅ + promocional |
| Mercado Livre | `mercadoLivreAdapter.js` | ✅ + frete |
| Apify ML | `apifyMercadoLivreClient.js` | ✅ fallback |

## Pipeline comercial

`fetch → normalize → merge → dedupe → select → runtime activation → body.prices[0]`

**Escalabilidade:** stubs Amazon/SERP existem para novos marketplaces.

---

# 14. Segurança

| Controle | Status |
|----------|--------|
| Perímetro rate limit | ✅ |
| Dev routes fail-closed | ✅ (middleware) |
| Founder gate | ✅ |
| Session HMAC (escrita) | ✅ |
| Log redaction | ✅ |
| CORS allowlist | ✅ |
| Analytics allowlist | ✅ |
| Cookies HttpOnly (founder) | ✅ |

**Produção validada:** dev routes retornam 404; insights retorna 401 sem auth.

---

# 15. Performance

| Camada | Observação |
|--------|------------|
| Executive Metrics API | ~600–900ms (cache + RPC paralelo) |
| Página pública ISR | ~20–30ms (cached) |
| Chat | Variável (LLM + providers) — não bloqueador RC |
| Cache in-memory | Limitação serverless — documentada |

**Gargalos estruturais:** monólito `chat-gpt4o.js` — impacto em cold start, não em correctness.

---

# 16. Documentação

## Consistente

- `docs/architecture/BLOCK_12_ARCHITECTURE.md`
- `docs/analytics/PHASE_*_FINAL_MASTER_DOCUMENT.md` (Fases 6–11)
- `docs/analytics/contracts/EVENT_CONTRACT.md`
- `docs/analytics/02_analytics_roadmap.md`

## Este relatório

Complementa PATCH 10.0 (price/savings) e PATCH 11.5 (executive layer) com visão full-stack MVP.

**Contradições críticas:** nenhuma detectada.

---

# 17. Código morto (catalogado — não removido)

| Arquivo | Motivo |
|---------|--------|
| `pages/api/pages/api/test-economia.js` | Rota órfã aninhada |
| `pages/api/test-mia.js` | Legacy test |
| `pages/api/test-economia.js` | Legacy test |
| `pages/api/test-serp.js` | Legacy test |
| `pages/api/env.js` | Debug env |

Todos bloqueados por middleware em produção.

---

# 18. Dívida técnica

## Pré-MVP (endereçável antes do go-live)

| Severidade | Item |
|------------|------|
| Baixa | Remover rota órfã `pages/api/pages/api/test-economia.js` |
| Baixa | Sincronizar alert UI localStorage ↔ DB |

## Pós-MVP

| Severidade | Item |
|------------|------|
| Média | Decompor monólito `chat-gpt4o.js` |
| Média | Unificar dual winner cognitive/commercial |
| Média | Edge cache para executive-metrics |
| Baixa | Cache compartilhado (Redis/KV) serverless |
| Baixa | RBAC multi-papel no cockpit |
| Baixa | Dedup server-side favoritos |

## Crítica

**Nenhuma** identificada como bloqueadora para RC.

---

# 19. Produção

**URL:** `https://economia-ai.vercel.app`  
**Build auditado:** ver evidência JSON  
**Validado:** health, ready, perimeter, executive metrics, public page, cockpit gate, analytics allowlist, dev lockdown

---

# 20. Recomendações

1. **PATCH 12.2** — Testes unitários gerais (expandir cobertura além de analytics patches)
2. **PATCH 12.3** — Testes de integração E2E (fluxo MIA completo)
3. **PATCH 12.4** — Regressão completa automatizada
4. Remover rota órfã no patch de limpeza pré-RC
5. Configurar `MIA_ADMIN_API_KEY` local = prod para E2E authed completo

---

# 21. Conclusão

A plataforma Teilor/MIA possui arquitetura **validada, coesa e documentada** para iniciar o processo Release Candidate. O Decision Engine permanece centralizado, o Data Layer é fonte de conhecimento, Executive Metrics é Single Source of Truth para KPIs, e o perímetro de produção (Bloco 12) protege endpoints sensíveis.

🟢 **PATCH 12.1 APROVADO**
