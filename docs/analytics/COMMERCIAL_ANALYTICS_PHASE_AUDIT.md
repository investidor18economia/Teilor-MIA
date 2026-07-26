# PATCH 8.0 — Auditoria da Fase 8 (Commercial Analytics)

**Data:** 2026-07-23  
**Status:** 🟢 **PATCH 8.0 — APROVADO**  
**Veredito:** A arquitetura comercial atual está **pronta para receber Commercial Analytics**, desde que os novos patches respeitem fronteiras já estabelecidas (Fases 4–7) e não dupliquem eventos existentes.

**Escopo:** auditoria apenas — nenhuma implementação, nenhuma alteração de runtime.

---

## 1. Veredito técnico

| Pergunta | Resposta |
|----------|----------|
| Arquitetura comercial mapeável? | **Sim** — componentes identificados, fluxos documentados |
| Pronta para instrumentação observacional? | **Sim** — hooks ALS em `chat-gpt4o.js`, padrão fire-and-forget validado na Fase 7 |
| Risco de duplicação? | **Moderado** — `data_layer_resolution` (6.4) e eventos 7.x cobrem parte do pipeline; Fase 8 deve definir deltas explícitos |
| Risco de acoplamento? | **Baixo** — princípio observacional consolidado; registry de providers já separado |
| Bloqueadores para PATCH 8.1? | **Nenhum** |

---

## 2. Arquitetura comercial (Etapa 1)

### 2.1 Fluxo end-to-end

```text
Usuário (MIAChat.jsx)
    ↓ POST /api/mia-chat
miaPerimeterChatProxy.js
    ↓
pages/api/chat-gpt4o.js  ← orquestrador central (~37k linhas)
    │
    ├─ [Router] classifyMiaTurn · recognizeMiaIntent · buildRoutingDecision
    │       lib/miaCognitiveRouter.js
    │       lib/miaIntentRecognitionLayer.js
    │       lib/miaIntentAuthority.js
    │       lib/miaCognitiveBridge.js
    │       lib/miaRoutingDecisionContract.js
    │       lib/miaCommercialEntryGate.js
    │
    ├─ [Query Extraction] segmentMixedIntent · validateCommercialSearchQuery
    │       lib/miaMixedIntentSegmentation.js
    │       lib/miaCommercialConstraintRefinement.js
    │       lib/productSourceAdapter/commercialQueryProductAlignmentLayer.js
    │
    ├─ [Decision Engine] resolveDecisionEngineWinners · buildDecisionEngineReply
    │       lib/miaDecisionConsistencyFixes.js (explica winner já fixado)
    │
    ├─ [Search Pipeline]
    │       searchUniversalDataLayer()  ← Data Layer (Supabase product_specs)
    │       → [miss] safeFetchSerpPrices / fetchCommercialProductsFromProviders
    │       → [controlled] runCommercialShadowPipeline
    │       lib/productSourceAdapter/commercialRuntimeShadow.js
    │       lib/commercial/conditionalProviderFetch.js
    │
    ├─ [Provider Router] — duas stacks coexistem (ver §3)
    │       Legacy: Mercado Livre → Supabase cache → SerpAPI (first-win)
    │       Controlled: buildMultiProviderPriorityPlan → progressive fetch
    │
    ├─ [Ranking] rankProductsUnderContract · pickWinnerUnderContract
    │       lib/miaRoutingGuardrails.js
    │       lib/productSourceAdapter/commercialSelectionEngine.js
    │
    ├─ [Offer Pipeline] merge → dedupe → select → activate
    │       lib/productSourceAdapter/commercialOfferMergeLayer.js
    │       lib/productSourceAdapter/commercialDeduplicationLayer.js
    │       lib/productSourceAdapter/commercialRuntimeActivation.js
    │       lib/commercial/governedFallbackPayloadBuilder.js
    │
    └─ [Response Builder] respondWithContract → applyFirstAnswerResponseContract
            lib/miaFirstAnswerResponseContract.js
            lib/miaCommercialExplanationVerbalizer.js
            → MIAChat.jsx (reply + prices[])
```

### 2.2 Matriz de responsabilidades

| Componente | Arquivo(s) principal(is) | Responsabilidade | Entrada | Saída |
|------------|-------------------------|------------------|---------|-------|
| **Router** | `miaCognitiveRouter.js`, `miaRoutingDecisionContract.js`, `chat-gpt4o.js` | Classificar intent, permissões de rota | query, session, history | `routingDecision`, `contextAction` |
| **Commercial Entry Gate** | `miaCommercialEntryGate.js` | Bloquear providers/ranking quando commerce negado | authority + routing | `{ allowed, reasonCode }` |
| **Query Extraction** | `miaMixedIntentSegmentation.js` | Extrair query comercial de mixed intent | raw message, intent | `commercialPipelineQuery` |
| **Decision Engine** | `miaDecisionConsistencyFixes.js` | Verbalizar winner ancorado | ranked products, anchor | explanation string |
| **Data Layer** | `chat-gpt4o.js` (searchUniversalDataLayer) | Catálogo interno specs | query, category | products c/ trustedSpecs |
| **Provider Router (legacy)** | `chat-gpt4o.js` | First-win entre ML/cache/SerpAPI | commercialQuery | normalized products |
| **Provider Router (controlled)** | `multiProviderPriorityEngine.js`, `conditionalProviderFetch.js` | Multi-provider progressive | query, plan | merged offers + trace |
| **Ranking** | `chat-gpt4o.js`, `miaRoutingGuardrails.js` | Ordenar e fixar winner | products, anchor, routing | ranked list + winner |
| **Offer Pipeline** | `commercialRuntimeActivation.js` | Merge/dedupe/select/enrich cards | provider results | `prices[]` enriquecidos |
| **Response Builder** | `miaFirstAnswerResponseContract.js`, `chat-gpt4o.js` | Montar resposta HTTP | reply, prices, session | JSON response |

### 2.3 Dependências críticas

- **Orquestrador único:** quase todo fluxo comercial passa por `pages/api/chat-gpt4o.js`
- **Dois modos de runtime:** `legacy` (default produção) vs `controlled` (`COMMERCIAL_RUNTIME_MODE`)
- **Dois routers de provider:** legacy inline (first-win) vs registry-driven (shadow/controlled)
- **Decision Engine não escolhe winner inicial** — apenas explica winner já fixado por ranking + anchor
- **Data Layer é fonte primária** — providers são fallback/enriquecimento

### 2.4 Paths comerciais emitidos (runtime)

Catálogo: `lib/miaResponsePathCatalog.js` — paths com `providersAllowed: true`:

| Path | Categoria |
|------|-----------|
| `return_seguro` | commercial (principal DL) |
| `commercial_only_fallback` | commercial (provider-only) |
| `legacy_llm_search` | commercial |
| `final_decision_scope_reply` | commercial |
| `comparison_*` (vários) | commercial/comparison |
| `context_decision_no_search` | commercial (decision sem search) |
| `commercial_resolution_incomplete` | clarification (NO_RESULT) |

---

## 3. Providers (Etapa 2)

### 3.1 Registry oficial

Fonte: `lib/productSourceAdapter/commercialProviderRegistry.js` (v4B.4)

| ID | Nome | Tipo | Enabled default | Auth | Timeout | Billing | Modos |
|----|------|------|-----------------|------|---------|---------|-------|
| `google_shopping` | Google Shopping (SerpAPI) | search | **true** | `SERPAPI_KEY` | 12s | paid_external | legacy + controlled + shadow |
| `google_shopping_dataforseo` | Google Shopping (DataForSEO) | search | false | `DATAFORSEO_LOGIN/PASSWORD` | 30s | paid_external | controlled + shadow |
| `mercadolivre_public` | Mercado Livre Public | search | false | OAuth opcional | 10s | free_external | legacy + controlled |
| `apify_mercadolivre` | Apify ML Actor | search | **true** | `APIFY_API_TOKEN` | 120s | paid_external | controlled + shadow |
| `amazon` | Amazon (planned) | search | false | — | — | — | stub only |

### 3.2 Fontes internas (não no registry externo)

| Fonte | ID legado | Tipo | Papel | Limitações |
|-------|-----------|------|-------|------------|
| **Data Layer MIA** | — | Supabase `product_specs` | Fonte primária specs | Sem price/link nativo |
| **Supabase Commercial Cache** | `supabasecache` | DB cache | Legacy priority 2 | Stale risk |
| **In-memory cache** | `commercial_search_cache` | Process TTL 10min | Short-circuit | Não compartilhado entre instâncias |

### 3.3 LLM / Governed Fallback (não é provider de busca)

| Camada | Arquivos | Papel |
|--------|----------|-------|
| OpenAI LLM | `chat-gpt4o.js`, `lib/openai.js` | Verbalização — não busca produtos |
| Governed Fallback | `governedFallbackPayloadBuilder.js`, `universalGovernedFallbackReasoning.js` | Contrato conservador quando sem produtos |
| Selection Engine | `commercialSelectionEngine.js` | Score ofertas normalizadas |

### 3.4 Ordem legacy (first-win)

`chat-gpt4o.js` → Mercado Livre (1) → Supabase cache (2) → SerpAPI (3)

Para na **primeira resposta com resultados**.

### 3.5 Governança transversal

| Mecanismo | Arquivo |
|-----------|---------|
| Execution policy | `lib/commercial/externalProviderExecutionPolicy.js` |
| Cost guard | `lib/commercial/providerCostGuard.js` |
| Budget circuit breaker | `lib/commercial/providerBudgetCircuitBreaker.js` |
| Credential vault | `lib/server/providerCredentialVault.js` |
| Runtime modes | `lib/productSourceAdapter/commercialRuntimeMode.js` |
| Request dedup | `lib/commercial/commercialRequestDeduplication.js` |
| Universal cache | `lib/commercial/universalCommercialCache.js` |

### 3.6 Trace comercial (não persistido hoje)

O pipeline controlled/shadow produz `trace` rico em memória:

- `lib/productSourceAdapter/commercialRuntimeShadow.js` → `trace.googleResult`, `trace.apifyResult`, `trace.merge`, `trace.dedupe`, `trace.selection`
- `lib/productSourceAdapter/commercialShadowDiagnosticSummary.js` → summaries para debug

**Gap crítico para 8.2:** trace existe em runtime mas **não é INSERT em analytics_events**.

---

## 4. Eventos existentes (Etapa 3)

### 4.1 Inventário comercial (21 event_name distintos)

**Fonte:** `docs/analytics/contracts/EVENT_CONTRACT.md`

#### Frontend (7 públicos)

| Evento | Relação comercial | O que captura |
|--------|-------------------|---------------|
| `session_started` | Indireta | Denominador funil |
| `user_authenticated` | Indireta | Segmentação auth |
| `mia_question_sent` | **Direta** | Top-of-funnel: query, category, conversation_id |
| `mia_recommendation_shown` | **Direta** | Impressão card: product, has_offer_card, products_count |
| `offer_click` | **Direta** | Clique outbound: offer_url, store, price |
| `favorite_created` | **Direta** | Sinal forte: product + offer |
| `price_alert_created` | **Direta** | Sinal mais forte: target_price, current_price |

#### Server-side comercial

| Evento | Patch | Relação comercial | O que captura |
|--------|-------|-------------------|---------------|
| `data_layer_resolution` | 6.4 | **Direta** | DL hit/fallback/hybrid, final_provider, winner_source, query_duration_ms |
| `mia_response_outcome` | 7.1 | Indireta | Outcome HTTP, response_path, products_in_response |
| `mia_error_event` | 7.2 | Indireta | Erros técnicos pipeline |
| `mia_latency_event` | 7.3 | Indireta | Latência E2E + stages |
| `price_drop_email_*` | 5.x | Downstream | Pipeline alerta pós-conversão |

**Nota:** `buying_intent` **não é evento** — métrica SQL derivada (PATCH 5.4).

### 4.2 O que já respondemos com eventos existentes

| Pergunta | Fonte | Limitação |
|----------|-------|-----------|
| Quantas perguntas comerciais? | `mia_question_sent` (category) | Category regex — não intent authority |
| Quantos cliques? | `offer_click` | Requer card renderizado |
| Quantos favoritos/alertas? | `favorite_created`, `price_alert_created` | Volume depende de UX |
| DL usado vs fallback? | `data_layer_resolution` | Por request comercial instrumentado |
| Provider final do winner? | `data_layer_resolution.final_provider` | Apenas winner — não tentativas |
| Produtos retornados? | `mia_response_outcome.products_in_response` | Count only — não detalhe |
| Taxa sucesso comercial? | `mia_response_outcome` + 7.4 health | Reliability — não performance provider |
| CTR recomendação → clique? | `analytics-ctr.sql` | Impressão vs clique |
| Funil conversão? | PATCH 4.3 dashboards | Operacional |
| Buying intent estratégico? | PATCH 5.4 | Derivado — não reimplementar |

### 4.3 O que NÃO conseguimos responder hoje

| Pergunta | Gap |
|----------|-----|
| Quais providers foram **tentados**? | Trace shadow não persistido |
| Qual provider **falhou** e por quê? | Sem evento por attempt |
| Qual provider **venceu** no controlled merge? | Só `final_provider` do winner |
| Quantos produtos por provider antes dedupe? | Não instrumentado |
| Qual ranking profile foi aplicado? | Snapshot em session_context — não analytics |
| Custo por provider call? | Cost guard runtime — não analytics |
| Query extraída vs query original? | Não persistido |
| Ofertas alternativas mostradas? | `products_count` parcial |
| Qual offer card específico clicado vs runner-up? | offer_click sem rank position |
| Provider latency individual? | 7.3 stage PROVIDER often `measurement_available: false` |
| Controlled vs legacy path? | Não distinguido em eventos |

### 4.4 Eventos — reutilizar, correlacionar ou NÃO reutilizar

| Evento | Decisão Fase 8 | Motivo |
|--------|----------------|--------|
| `mia_question_sent` | **Correlacionar** | Top funnel — não estender |
| `data_layer_resolution` | **Correlacionar via request_id** | Escopo 6.4 = efetividade DL — não absorver provider attempts |
| `mia_response_outcome` | **Correlacionar** | Escopo 7.1 = reliability outcome |
| `mia_error_event` | **Correlacionar** | Escopo 7.2 = erros técnicos |
| `mia_latency_event` | **Correlacionar** | Escopo 7.3 = latência E2E |
| `mia_recommendation_shown` | **Reutilizar** | Impressão — base para 8.3 |
| `offer_click`, `favorite_created`, `price_alert_created` | **Reutilizar** | Downstream — base para 8.3 |
| Health 7.4 | **Não estender** | SQL-derived reliability |

**Proibido:** estender metadata de 6.4/7.x para campos comerciais de provider — criar eventos Fase 8 com delta explícito.

---

## 5. Jornada comercial (Etapa 4)

```text
Usuário abre /app-mia
    → session_started (visitor_id, session_id)
    ↓
Usuário envia pergunta
    → mia_question_sent (query_text, category, conversation_id)
    ↓
Intent Recognition + Routing Decision
    → [gate] miaCommercialEntryGate
    ↓
Commercial Query Extraction (mixed intent → commercialPipelineQuery)
    ↓
Decision Engine path? → context_decision_no_search (sem nova search)
    ↓
Search Pipeline
    → Data Layer searchUniversalDataLayer
    → [hit] rankProductsUnderContract
    → [miss] Provider Router (legacy OR controlled)
    ↓
Offer Pipeline (merge/dedupe/select/enrich)
    ↓
Response Builder → respondWithContract
    → mia_response_outcome (7.1)
    → data_layer_resolution (6.4) [paths comerciais]
    → mia_latency_event (7.3)
    ↓
UI renderiza cards
    → mia_recommendation_shown
    ↓
Usuário clica "Ver oferta"
    → offer_click
    ↓
Usuário favorita
    → favorite_created
    ↓
Usuário cria alerta
    → price_alert_created
    ↓
[Async] Price drop detectado
    → price_drop_email_* → Resend
```

**Correlação:** `request_id` (server 6.4/7.x) + `conversation_id` + `visitor_id` (frontend downstream).

---

## 6. Cobertura analítica atual (Etapa 5)

### 6.1 SQL dashboards existentes

| Fase | Dashboard | Relevância comercial |
|------|-----------|-------------------|
| 1.3 | `analytics-buying-intent.sql`, `analytics-ctr.sql`, `analytics-products.sql` | Funil básico |
| 4.x | Conversion, Products/Categories dashboards | Funil operacional |
| 5.x | Buying intent, conversion strategic | Comportamento estratégico |
| 6.x | Data layer usage/coverage/quality/statistics | Catálogo + runtime DL |
| 7.x | Reliability response/error/latency/health | Qualidade pipeline |

### 6.2 Matriz cobertura

| Dimensão | Coberto | Parcial | Não coberto |
|----------|---------|---------|-------------|
| Perguntas comerciais | ✅ mia_question_sent | | |
| Impressões | ✅ mia_recommendation_shown | | |
| Cliques/favoritos/alertas | ✅ | | |
| DL effectiveness | ✅ data_layer_resolution | | |
| Provider final (winner) | | ✅ final_provider | |
| Provider attempts/failures | | | ❌ |
| Search query extraction | | | ❌ |
| Ranking utilizado | | | ❌ |
| Ofertas alternativas | | ✅ products_count | |
| Custo provider | | | ❌ |
| Controlled vs legacy | | | ❌ |

---

## 7. Auditoria de dados (Etapa 6)

### 7.1 Consistência de identidade

| Campo | Frontend | Server 6.4/7.x | Consistente |
|-------|----------|----------------|-------------|
| `session_id` | ✅ | ✅ | ✅ |
| `visitor_id` | ✅ | ✅ | ✅ |
| `conversation_id` | ✅ (chat flow) | ✅ (when commercial) | ✅ |
| `request_id` | — | ✅ metadata | ✅ (correlação server) |
| `analytics_context` | ✅ propagado | ✅ origem | ✅ |
| `event_version` | parcial frontend | ✅ 6.4.0/7.x | ✅ server |

### 7.2 Produção atual (referência Fase 7)

| event_name | count (ref.) |
|------------|--------------|
| `data_layer_resolution` | 20 |
| `mia_response_outcome` | 11 |
| `mia_error_event` | 2 |
| `mia_latency_event` | 1 |

### 7.3 Retrocompatibilidade

- Eventos sem `event_version` → SQL trata como `legacy_sem_versao`
- Novos eventos Fase 8 devem seguir padrão semver + fire-and-forget
- Sem migration estrutural necessária — `analytics_events` suporta metadata JSON

### 7.4 Ausência de conflitos

- Nenhum event_name comercial duplicado proposto no roadmap
- `data_layer_resolution` e futuro `commercial_search_*` devem ter escopos distintos documentados

---

## 8. Gaps (Etapa 7)

### 8.1 Cobertura

| Gap | Severidade |
|-----|------------|
| Provider attempts não persistidos | **Não bloqueante** (8.2) |
| Query extraction não observada | **Não bloqueante** (8.1) |
| Ranking profile não em analytics | **Não bloqueante** |
| Amostra produção pequena | **Não bloqueante** |

### 8.2 Instrumentação

| Gap | Severidade |
|-----|------------|
| Shadow trace só em memória | **Não bloqueante** — hook point identificado |
| Legacy router sem per-provider telemetry | **Não bloqueante** |
| Dual router (legacy/controlled) | **Não bloqueante** — documentar modo no evento |
| PROVIDER stage 7.3 incompleto | **Não bloqueante** — 8.2 complementa |

### 8.3 SQL

| Gap | Severidade |
|-----|------------|
| Sem dashboard provider performance | **Não bloqueante** (8.2) |
| Sem dashboard commercial search funnel server-side | **Não bloqueante** (8.1) |
| Sem dashboard offer-level detail | **Não bloqueante** (8.3) |

### 8.4 Dashboards

Funil frontend (4.x/5.x) existe; **server-side commercial pipeline** não tem dashboard dedicado.

### 8.5 Produção

| Gap | Severidade |
|-----|------------|
| Controlled mode raro em prod | **Não bloqueante** |
| Mercado Livre disabled no registry | **Não bloqueante** — legacy ainda ativo |

### 8.6 Documentação

| Gap | Severidade |
|-----|------------|
| Arquitetura comercial dispersa em headers de módulo | **Resolvido neste PATCH 8.0** |
| `docs/commercial/` mínimo (4 arquivos) | **Não bloqueante** |

### 8.7 Bloqueantes

**Nenhum** identificado para iniciar PATCH 8.1.

---

## 9. Roadmap Fase 8 validado (Etapa 8)

### 9.1 Ordem proposta — **CONFIRMADA**

```text
PATCH 8.1 Commercial Search Analytics  → pipeline de busca (upstream)
PATCH 8.2 Provider Analytics           → performance por provider (mid)
PATCH 8.3 Offer Analytics              → ofertas e interação (downstream)
PATCH 8.4 Auditoria Final              → encerramento fase
```

**Justificativa:** segue fluxo natural da jornada comercial; cada patch adiciona observabilidade sem alterar decisões upstream.

### 9.2 Escopo recomendado por patch

#### PATCH 8.1 — Commercial Search Analytics

**Objetivo:** observar a **pesquisa comercial** como unidade — extração, path (DL/legacy/controlled), produtos retornados, classificação search.

**Delta vs existentes:**

| Existente | Delta 8.1 |
|-----------|-----------|
| `data_layer_resolution` (6.4) | 6.4 = efetividade DL; 8.1 = search pipeline completo |
| `mia_question_sent` | frontend intent proxy; 8.1 = server-side extraction result |

**Campos candidatos (não implementar agora):** `extracted_query`, `raw_query`, `search_path`, `runtime_mode`, `providers_planned`, `products_returned`, `ranking_profile`, `response_path`

**Hook point:** pós-search, pré-response em `chat-gpt4o.js` (adjacente a 6.4, evento distinto).

#### PATCH 8.2 — Provider Analytics

**Objetivo:** observar **cada provider** — attempt, success, latency, skip reason, cost signal.

**Delta vs existentes:**

| Existente | Delta 8.2 |
|-----------|-----------|
| `data_layer_resolution.final_provider` | apenas winner final |
| `mia_latency_event` PROVIDER stage | often unavailable |
| shadow `trace` | memória only |

**Campos candidatos:** `provider_id`, `attempt_status`, `products_count`, `latency_ms`, `skip_reason`, `cache_hit`, `cost_guard_blocked`

**Hook points:** `fetchCommercialProductsFromProviders`, `executeConditionalProviderFetch`, adapters.

#### PATCH 8.3 — Offer Analytics

**Objetivo:** observar **ofertas** — winner vs alternatives, card composition, seleção.

**Delta vs existentes:**

| Existente | Delta 8.3 |
|-----------|-----------|
| `mia_recommendation_shown` | impressão frontend |
| `offer_click` | ação downstream |
| 8.3 | server-side offer snapshot no momento da resposta |

**Campos candidatos:** `winner_offer`, `alternative_count`, `offer_sources[]`, `selection_score`, `dedupe_removed_count`

**Correlacionar:** `mia_recommendation_shown` + `offer_click` via product/offer fields — não duplicar funil 4.3/5.4.

### 9.3 Dependências

```text
8.1 (search event + request_id)
    ↓ correlaciona
8.2 (provider events · mesmo request_id)
    ↓ correlaciona
8.3 (offer snapshot · mesmo request_id)
    ↓ correlaciona
Frontend (mia_recommendation_shown → offer_click)
```

**Pré-requisitos satisfeitos:** Fase 7 (reliability baseline), Fase 6 (DL analytics), infra analytics_events operacional.

### 9.4 Recomendação arquitetural

- **Um evento parametrizado por patch** (padrão 6.4/7.x) — evitar explosão de event_names
- **`event_version` semver** por patch (8.1.0, 8.2.0, 8.3.0)
- **Fire-and-forget** — zero impacto Decision Engine/Ranking/Providers
- **Documentar delta explícito** vs 6.4 em cada patch

---

## 10. Dívida técnica arquitetural (contexto)

| Item | Impacto em Fase 8 |
|------|-------------------|
| Dual provider router (legacy + controlled) | Instrumentação deve capturar `runtime_mode` |
| Shadow trace não persistido | 8.2 deve materializar trace essencial |
| Orquestrador monolítico (`chat-gpt4o.js`) | Hook points concentrados — facilita instrumentação |
| DL ~5.8s comercial (Fase 7) | Baseline performance — não confundir com analytics overhead |
| `PATCH_FUNC_64` fixes pendentes | Funcional — não bloqueia analytics |

---

## 11. Critérios de aprovação PATCH 8.0 (Etapa 10)

| Critério | Status |
|----------|--------|
| Arquitetura comercial mapeada | ✅ |
| Providers documentados | ✅ |
| Jornada comercial documentada | ✅ |
| Eventos existentes auditados | ✅ |
| Gaps identificados | ✅ |
| Roadmap validado | ✅ |
| Documentação concluída | ✅ |
| Implementação ocorrida | ❌ (conforme escopo) |

---

## 12. Recomendações

1. **PATCH 8.1 primeiro** — estabelece `request_id` como hub comercial server-side
2. **Não estender 6.4/7.x** — novos eventos com escopo documentado
3. **Capturar `runtime_mode`** (legacy/controlled/shadow) em todos eventos 8.x
4. **Reutilizar dashboards 4.x/5.x** para downstream — 8.3 correlaciona, não reimplementa buying intent
5. **Persistir subset do shadow trace** em 8.2 — não serializar trace completo (custo/tamanho)
6. **Manter MIA owns intelligence** — analytics observam, nunca alteram ranking/winner

---

## 13. Referências

| Documento | Conteúdo |
|-----------|----------|
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap Fase 8 |
| [DATA_LAYER_USAGE_ANALYTICS.md](./DATA_LAYER_USAGE_ANALYTICS.md) | PATCH 6.4 — fronteira DL |
| [PHASE_7_FINAL_AUDIT.md](./PHASE_7_FINAL_AUDIT.md) | Reliability baseline |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Catálogo eventos |
| [DASHBOARDS.md](./DASHBOARDS.md) | Índice SQL |
| [BUYING_INTENT_STRATEGIC_ANALYTICS.md](./BUYING_INTENT_STRATEGIC_ANALYTICS.md) | Fronteira Fase 5 |
| `lib/productSourceAdapter/commercialProviderRegistry.js` | Registry providers |
| `pages/api/chat-gpt4o.js` | Orquestrador comercial |

---

## 14. Próximo passo

**PATCH 8.1 — Commercial Search Analytics** — aguarda kickoff explícito. Não iniciado automaticamente.
