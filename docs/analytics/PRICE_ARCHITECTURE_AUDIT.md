# PRICE ARCHITECTURE AUDIT
## PATCH 10.0 — Auditoria da Arquitetura de Preços, Economia e Alertas

Versão: 1.0  
Status: 🟢 **APROVADO**  
Data: Julho/2026  
Escopo: auditoria exclusivamente arquitetural — **nenhum Analytics novo implementado**

---

# 1. Mapa da arquitetura de preços

```text
User
  ↓
Intent / Cognitive Router (budget extraction, anti-regret intent)
  ↓
Commercial Gate
  ↓
Data Layer (product_specs — price: null)
  ↓
Providers (SerpAPI, DataForSEO, Mercado Livre, Apify)
  ↓
Normalization (normalizeProduct.js / normalizeProviderProduct)
  ↓
Merge → Dedupe → Commercial Selection (40% price weight)
  ↓
Cognitive Ranking (rankLocalFallbackProducts — price secondary)
  ↓
Winner (selectedBestProduct) + displayProducts[top 3]
  ↓
Runtime Activation (controlled — may overwrite prices[0])
  ↓
Response Builder → body.prices[]
  ↓
First-Answer Contract + Fallback Display
  ↓
Frontend (MIAChat.jsx → formatPrice(offerCard.price))
  ↓
Favoritos (wishes) / Alertas (price_alerts + localStorage)
  ↓
Cron monitoramento (price-alerts-daily-check)
```

## Onde nasce o preço

| Estágio | Arquivo | Comportamento |
|---------|---------|---------------|
| Provider fetch | `lib/prices.js`, `lib/productSourceAdapter/adapters/*` | Raw: `extracted_price`, `price`, `old_price`, `currency_id` |
| Data Layer | `pages/api/chat-gpt4o.js` | `price: null` até enrichment comercial |
| Enrichment DL | `enrichDataLayerProductsWithCommercialOffers()` | Menor preço entre ofertas matching |
| Normalização | `lib/productSourceAdapter/normalizeProduct.js` | `price` (string BRL), `numericPrice`, `currency: BRL` |
| Offer pipeline | `commercialOfferMergeLayer.js` → `commercialSelectionEngine.js` | Score comercial 40% preço |
| Ranking cognitivo | `calculateTrustedSpecsRankingScore()` | +25 presença; budget ±80/±25/−120 |
| Winner | `resolveCommercialPresentationWinner()` | Identidade cognitiva — **não escolhe só por preço** |
| Delivery | `applyCommercialRuntimeActivationToResponsePrices()` | **Última mutação numérica autorizada** |
| UI | `MIAChat.jsx` | `body.prices[0].price` |

## Onde pode ser alterado ou descartado

- **Descartado:** oferta sem preço > 0 (`isBrokenCommercialOffer`), indisponível, non-BRL (DataForSEO)
- **Alterado:** runtime activation substitui `prices[0]` sem mudar `selectedBestProduct`
- **Múltiplos preços:** batch de ofertas merged; sample ≤6 para analytics 8.3

---

# 2. Inventário de fontes de preço

| Provider | Preço | Promocional | Frete | Moeda | Loja | Timestamp | Limitações |
|----------|-------|-------------|-------|-------|------|-----------|------------|
| **SerpAPI (Google Shopping)** | ✅ `extracted_price` | ❌ | ❌ | BRL implícito | source label | fetch-time | Legacy production path |
| **DataForSEO** | ✅ `price` | ✅ `old_price` | ❌ | BRL only (reject other) | seller | fetch-time | `original_price` não exibido |
| **Mercado Livre API** | ✅ `price` | ❌ | ✅ `free_shipping` | `currency_id: BRL` | seller | fetch-time | shipping não no card |
| **Apify ML** | ✅ via merge layer | ❌ | parcial | BRL | seller | fetch-time | Shadow/conditional |
| **Data Layer** | ❌ nativo | ❌ | ❌ | — | — | — | Enriquecido por providers |

**Confiabilidade:** pipeline comercial com gates (`isUsableLocalCommercialProduct`, `validateSelectedOfferForActivation`). Sem histórico temporal persistido por provider.

---

# 3. Conceitos de preço encontrados (realidade atual)

| Conceito | Existe? | Campo / local |
|----------|---------|---------------|
| Preço atual / oferta | ✅ | `price`, `numericPrice` |
| Menor preço (batch) | ✅ | `pickCommercialOfferForDataLayerProduct`, 8.3 `minimum_price` |
| Maior preço (sample) | ✅ | 8.3 `maximum_price` |
| Média / mediana | ✅ | 8.3 `average_price`, `median_price` |
| Preço promocional vs original | ⚠️ parcial | DataForSEO `old_price` → `original_price` raw; **não exibido** |
| Preço parcelado | ⚠️ analytics only | ML `installments` — contagem em 8.3, não no card |
| Preço PIX / à vista | ❌ | — |
| Preço com cupom | ❌ | — |
| Preço com frete | ❌ no card | ML raw tem shipping; card mostra preço produto |
| Preço indisponível | ✅ | `displayStatus: "Preço temporariamente indisponível"` |
| Target alerta | ✅ | `target_price`, `current_price` |
| Economia estimada UI | ✅ | `miaEstimatedSavings.js` — **percepção, não real** |
| Winner vs minimum delta | ✅ | 8.3 `winner_vs_minimum_delta(_percent)` |

**Não inventados:** PIX, cupom, histórico temporal, baseline confiável global.

---

# 4. Normalização

**Canônico:** `lib/productSourceAdapter/normalizeProduct.js`

- `parseNumericPrice()` — formatos BR `1.234,56` e `1234.56`
- `formatBrlPrice()` — `R$ X,XX` (2 decimais)
- Moeda única: **BRL** (sem conversão FX)
- Rejeição: `/indispon/i`, `price <= 0`, non-BRL (DataForSEO)

**Risco:** parsers paralelos — `parsePrice()` em `chat-gpt4o.js`, `parseOfferPrice()` em `miaOfferIdentity.js`, `formatPrice()` client-side — podem divergir em edge cases.

**Validação:** NaN/Infinity filtrados via gates; strings inválidas → null.

---

# 5. Papel do preço no ranking

Filosofia explícita no código: **scores técnicos não dependem de preço**; apenas `value_score` pode considerar preço.

| Mecanismo | Peso / efeito |
|-----------|---------------|
| `calculateTrustedSpecsRankingScore` | +25 presença; budget +80/+25/−120 |
| `scorePriceCoherence` | Penalidades + viés soft para menor preço |
| `selectCommercialOffers` | **40/100** componente preço (min-max batch) |
| `pickCommercialOfferForDataLayerProduct` | **Menor preço** entre matches |
| Winner selection | **Não** é lowest-price-only |

**Conclusão:** preço influencia ranking e seleção comercial, mas **não é a autoridade cognitiva final**.

---

# 6. Autoridade do preço exibido

## Hierarquia de autoridade

```text
1. body.prices[0].price          ← AUTORIDADE FINAL EXIBIDA
2. applyCommercialRuntimeActivationToResponsePrices()  ← última mutação numérica
3. selectedBestProduct.price     ← identidade cognitiva (pode divergir de prices[0])
4. displayProducts[0].price      ← input para prices[]
5. offers (merge pipeline)       ← interno, não enviado ao client
```

## Diferença entre objetos

| Objeto | Natureza | Enviado ao client? |
|--------|----------|-------------------|
| **offers** | Pipeline multi-provider interno | ❌ |
| **rankedProducts** | Lista cognitiva completa | ❌ |
| **displayProducts** | Top 3 para snapshot/analytics | ❌ (metadados inline) |
| **selectedBestProduct / winner** | Decisão cognitiva 9.1 | Metadados hashed |
| **body.prices** | Cards comerciais | ✅ |
| **body.prices[0]** | Card principal | ✅ renderizado |

**Controlled mode:** `commercialRuntimeActivation.js` pode substituir `prices[0].price/link/source` sem alterar winner cognitivo.

**Client:** `MIAChat.jsx` → `formatPrice(offerCard.price)` ou texto fallback se `priceUnavailable`.

---

# 7. Estado atual dos alertas

## O que EXISTE

| Componente | Status |
|------------|--------|
| Criação UI | ✅ `MIAChat.handleMonitor()`, `MIAAlertsPanel` |
| API create | ✅ `POST /api/create-price-alert` |
| Persistência DB | ✅ `public.price_alerts` (SQL manual, não em migrations) |
| Dedup DB | ✅ por `user_id` + `normalized_product_key` |
| Lifecycle fields | ✅ `last_checked_at`, `check_count`, `email_send_count`, `is_active` |
| Scheduler | ✅ `vercel.json` cron `0 12 * * *` → `price-alerts-daily-check` |
| Monitoramento | ✅ `miaPriceAlertDryRun.js` → shadow pipeline |
| Comparação automática | ✅ `evaluatePriceAlertEligibility()` (price ≤ target) |
| Disparo email | ✅ gated (`MIA_PRICE_DROP_EMAIL_SEND_ENABLED=false` default) |
| Delivery logs | ✅ `price_alert_delivery_logs` |
| Analytics email | ✅ `price_drop_email_*` events |
| Client analytics | ✅ `price_alert_created` |

## O que NÃO EXISTE / GAPS

| Gap | Impacto |
|-----|---------|
| `GET/DELETE/PATCH` alert APIs | UI remove só localStorage |
| Sync DB → frontend | Alertas criados no DB não listados em novo device |
| `price_alert_deleted` analytics | Sem observabilidade de remoção |
| Unique DB constraint | Sugerido em SQL, não aplicado |
| Analytics lifecycle PATCH 10.3 | Roadmap — não implementado |

**Default target:** 5% abaixo (`miaPriceAlertsSafety.js`) quando monitora do card.

---

# 8. Estado atual dos favoritos

| Componente | Status |
|------------|--------|
| UI | ✅ `MIAFavoritesPanel`, `handleFavorite()` |
| Create | ✅ `POST /api/save-wish` → `wishes` |
| List | ✅ `GET /api/list-wish` |
| Delete | ✅ `POST /api/delete-wish` |
| Auth | ✅ `requireUserSession` |
| Dedup | ⚠️ client-only (`findProductByIdentity`) |
| Analytics | ✅ `favorite_created` — ❌ `favorite_removed` |
| Legacy cron | ⚠️ `check-prices.js` (wishes, stub email) |

**Relação com alertas:** fluxos paralelos; favorito pode originar monitoramento via painel.

---

# 9. Ofertas vs produtos

| Conceito | Definição |
|----------|-----------|
| **Produto cognitivo** | Entidade rankeada (Data Layer ou commercial) com identidade família |
| **Oferta** | Listing comercial `{ title, price, url, provider }` no merge pipeline |
| **Winner** | Decisão cognitiva — pode ser Data Layer sem preço até enrichment |
| **Provider** | Fonte fetch (SerpAPI, ML, etc.) |
| **Loja / source** | Label sanitizado exibido no card (`source` field) |

Múltiplas ofertas: merge + dedupe → selection → sample analytics (≤6). Múltiplos preços convivem no batch; **um preço exibido** por card (`prices[i].price`).

---

# 10. Estado atual da economia

## Cálculos EXISTENTES

| Tipo | Onde | Natureza |
|------|------|----------|
| **Economia estimada UI** | `lib/miaEstimatedSavings.js` | 4–6% do preço principal; **percepção, não verificável** |
| **Delta winner vs min** | `miaOfferSetTracker` → 8.3 analytics | Observacional no sample |
| **Target alerta %** | `MIAAlertsPanel` + default 5% | Configuração alerta |
| **Email old/new price** | `miaPriceDropEmailTemplate.js` | Display email |
| **Legacy economia API** | `pages/api/economia.js` | Gated legacy |

## NÃO EXISTE

- Economia real verificada pós-compra
- Baseline histórico confiável
- Menor histórico / volatilidade persistida
- Savings analytics eventos (`savings_*`)
- Comparação percentual entre decisões correlacionadas

---

# 11. Estado atual do anti-regret

| Mecanismo | Existe? | Escopo |
|-----------|---------|--------|
| Intent anti-regret chat | ✅ | `miaCognitiveRouter.isAntiRegretFamilyQuery()` |
| Tone guard | ✅ | `ANXIOUS_ANTI_REGRET` |
| Price alert drop | ✅ | Email quando price ≤ target |
| Anti-spam email | ✅ | cooldown, max sends |
| Preço caiu/subiu tracking | ❌ | Sem histórico temporal analytics |
| Winner deixou de ser competitivo | ❌ | — |
| Usuário voltou / re-pesquisou | ⚠️ | 9.3 `NEW_SEARCH_STARTED` — não price-specific |
| Anti-regret + alertas integrado | ❌ | — |

**Conclusão:** anti-regret conversacional existe; **infraestrutura analítica anti-regret não existe** (PATCH 10.4).

---

# 12. Correlação com Fases 8 e 9

## IDs reutilizáveis (não criar novos)

| ID | Uso Fase 10 |
|----|-------------|
| `request_id` | Hub same-turn: 8.1 → 8.2 → 8.3 → 9.1 |
| `decision_request_id` | = `request_id` da decisão; hub 9.2/9.3 |
| `session_id` | Client events, alertas, favoritos |
| `visitor_id`, `conversation_id`, `user_id` | Segmentação |

## Contratos com preço já persistidos

**Fase 8.3 `mia_offer_set` (autoridade numérica server-side):**
`winner_price`, `minimum_price`, `maximum_price`, `average_price`, `median_price`, `winner_is_lowest_price`, `winner_vs_minimum_delta`, `winner_vs_minimum_delta_percent`, `price_currency`, `offers_with_previous_price_count`

**Fase 9 (sem preços numéricos):**
`budget_constraint` (boolean), `PRICE_REJECTION`, `PRICE_ALERT_CREATED`, `PRICE_REQUESTED`

**Client:**
`price_alert_created`: `target_price`, `current_price`; `offer_click`: `offer_price`

## Join recipe Fase 10

```sql
-- Decisão + preços same-turn
JOIN mia_offer_set ON offer.request_id = decision.request_id

-- Sinal pós-decisão + preços da decisão original
JOIN mia_offer_set ON offer.request_id = signal.decision_request_id
```

---

# 13. Riscos arquiteturais

| Risco | Classificação |
|-------|---------------|
| Economia falsa (estimated savings UI) | **Bloqueante** para métricas oficiais — marcar como UNVERIFIED |
| Desconto sem baseline (`old_price` não exibido) | **Importante** |
| Dual winner (cognitive vs commercial activation) | **Importante** |
| Parsers de preço divergentes | **Importante** |
| Alert UI/DB split (localStorage vs Supabase) | **Importante** |
| Frete desconhecido no preço exibido | **Backlog** |
| Cache desatualizado provider | **Backlog** |
| Sample ≤6 bias em 8.3 | **Backlog** |
| `price_alert_created` on already_exists | **Backlog** analytics dedup |

**Nenhum risco bloqueante impede continuidade da Fase 10** — desde que métricas distingam verificado vs estimado.

---

# 14. Oportunidades Fase 10 (não implementadas)

| Patch | Oportunidade |
|-------|--------------|
| **10.1** Price Intelligence & Quality | Dispersão, winner vs min, sample quality, currency coverage, indisponível rate |
| **10.2** Savings Estimation & Confidence | Verificado (8.3 delta) vs estimado (UI) vs alert outcome |
| **10.3** Price Alert Lifecycle | create → check → eligible → sent → skipped; DB↔UI gap |
| **10.4** Anti-Regret Foundation | Correlação alert + rejection + replacement + price delta |
| **10.5** Savings Outcomes & User Value | Email savings, alert-triggered value, funnel economia |
| **10.6** Auditoria Final | Consolidação Fase 10 |

---

# 15. Recomendações para patches 10.1–10.6

1. **10.1:** Reutilizar `mia_offer_set` como fonte numérica; não recalcular preços
2. **10.2:** Taxonomia `VERIFIED | ESTIMATED | UNVERIFIED | UNKNOWN` para savings
3. **10.3:** Observar lifecycle existente (`price_alerts`, `price_alert_delivery_logs`, `price_drop_email_*`) — evento novo só se gap comprovado
4. **10.4:** Join 9.3 PRICE_REJECTION + 8.3 prices; não duplicar anti-regret chat intent
5. **10.5:** Medir valor quando email sent + best_found_price vs target
6. **Correlação:** Propagar `decision_request_id` em `offer_click` antes de analytics avançados
7. **Privacidade:** Manter agregados; nunca persistir listas completas de preços
8. **Não alterar:** ranking, winner, Response Builder, alert send gate

---

# Referências

| Artefato | Caminho |
|----------|---------|
| Normalização | `lib/productSourceAdapter/normalizeProduct.js` |
| Offer analytics | `lib/miaOfferSetTracker.js` |
| Runtime activation | `lib/productSourceAdapter/commercialRuntimeActivation.js` |
| Fallback display | `lib/miaCommercialFallbackDisplay.js` |
| Estimated savings | `lib/miaEstimatedSavings.js` |
| Price alerts | `lib/miaPriceAlertsSafety.js`, `pages/api/create-price-alert.js` |
| Alert cron | `pages/api/cron/price-alerts-daily-check.js` |
| Favorites | `pages/api/save-wish.js` |
| UI | `components/MIAChat.jsx` |
| Phase 8 master | `docs/analytics/PHASE_8_MASTER_DOCUMENT.md` |
| Phase 9 master | `docs/analytics/PHASE_9_MASTER_DOCUMENT.md` |
| Alert readiness | `docs/alerts/price-alert-production-readiness.md` |
