# PHASE 10 — Savings & Price Intelligence Analytics

## Documento Mestre Final

**Projeto:** MIA / Teilor  
**Fase:** 10 — Savings & Price Intelligence Analytics  
**Status:** 🟢 Concluída e aprovada  
**Último patch:** PATCH 10.6 — Auditoria Final da Fase 10  
**Ambiente validado:** Produção  
**URL:** `https://economia-ai.vercel.app`  
**Build final auditado:** ver `PATCH_10_6_FINAL_AUDIT_EVIDENCE.json`

---

# 1. Visão executiva

## Objetivo

Tornar observáveis — sem alterar comportamento funcional — qualidade de preços, estimativas de economia, lifecycle de alertas, sinais anti-regret e valor entregue ao usuário.

## Valor empresarial

A Fase 10 permite responder:

- A qualidade dos preços entregues é confiável?
- Existe economia potencial observável?
- Os alertas progridem corretamente no lifecycle?
- Quais padrões anti-regret aparecem nas decisões?
- Quanto valor potencial vs observado a MIA gera?

## O que foi entregue

| Patch | Entrega |
|-------|---------|
| 10.0 | Auditoria arquitetural (documental) |
| 10.1 | `mia_price_intelligence` |
| 10.2 | `mia_savings_estimation` |
| 10.3 | `mia_price_alert_lifecycle` |
| 10.4 | `mia_anti_regret_foundation` |
| 10.5 | `mia_user_value_outcome` |
| 10.6 | Auditoria final cruzada |

## O que ainda não pode ser afirmado

- Economia **verificada** ou **realizada**
- Compra confirmada
- ROI ou satisfação do usuário
- Arrependimento confirmado
- Entrega de e-mail de alerta (estágio reservado)
- Minutos exatos economizados pelo usuário

---

# 2. Arquitetura final

## Cadeia comercial (await — serverless-safe)

```text
Decision / Offer Set (8.3)
        ↓ await
Price Intelligence (10.1)
        ↓ await
Savings Estimation (10.2) — pode emitir 2 eventos por decisão
        ↓ await
Anti-Regret Foundation (10.4)
        ↓ await
User Value Outcome (10.5)
```

Implementação: `instrumentOfferSetAnalyticsForDelivery()` em `lib/miaOfferSetAnalytics.js`, invocado com `await` em `pages/api/chat-gpt4o.js`.

## Fluxo paralelo de alertas

```text
Price Alert Creation API
        ↓ await (create path)
REQUESTED → CREATED → ACTIVE
        ↓ cron/check path
CHECKED → TARGET_REACHED (quando aplicável)
        ↓
NOTIFICATION_PREPARED → NOTIFICATION_SENT
```

Estágios reservados (não emitidos): `NOTIFICATION_DELIVERED`, `USER_RETURNED`, `OFFER_OPENED`, `PAUSED`, `REACTIVATED`, `CANCELLED`, `EXPIRED`.

## Enriquecimento pós-decisão (async)

Acceptance/rejection signals podem disparar:

- `scheduleAntiRegretFoundationFromPostDecisionSignal`
- `scheduleUserValueOutcomeFromPostDecisionSignal`

Se o evento 10.4/10.5 já foi emitido na entrega, o hook tenta backfill via DB — **não reescreve** eventos existentes (dedup).

## Correlação

| ID | Uso |
|----|-----|
| `request_id` | Hub HTTP + offer_set + cadeia 10.x |
| `decision_request_id` | Hub decisão comercial (10.4, 10.5, 9.x) |
| `session_id` | Sessão analytics |
| `conversation_id` | Conversa chat |
| `visitor_id` | Visitante anônimo |
| `user_id` | Usuário autenticado |
| `alert_id` | Lifecycle 10.3 |

## Serverless

Correção crítica (commit `5e103f2`): cadeia offer_set delivery usa **await** em todos os inserts 8.3→10.5.

Alert lifecycle: paths de criação usam `awaitInsert: true`; scheduler opcional usa fire-and-forget com `.catch()`.

---

# 3. Patches concluídos

## PATCH 10.1 — Price Intelligence

- **Evento:** `mia_price_intelligence` · `10.1.0`
- **Campos-chave:** `price_quality`, `price_confidence`, `winner_price_position`, `price_dispersion`
- **SQL:** Q1–Q10

## PATCH 10.2 — Savings Estimation

- **Evento:** `mia_savings_estimation` · `10.2.0`
- **Campos-chave:** `savings_type`, `savings_nature`, `savings_confidence`, `potential_savings_amount`
- **Regra:** `UNVERIFIED` ≠ economia confirmada
- **SQL:** Q1–Q15

## PATCH 10.3 — Price Alert Lifecycle

- **Evento:** `mia_price_alert_lifecycle` · `10.3.0`
- **Campos-chave:** `lifecycle_stage`, `alert_id`, `target_realism`, `purchase_confirmed: false`
- **SQL:** Q1–Q30

## PATCH 10.4 — Anti-Regret Foundation

- **Evento:** `mia_anti_regret_foundation` · `10.4.0`
- **Score interno:** `anti_regret_score` 0–100 (não exibido ao usuário)
- **SQL:** Q1–Q15

## PATCH 10.5 — User Value Outcome

- **Evento:** `mia_user_value_outcome` · `10.5.0`
- **Camadas:** POTENTIAL / OBSERVED / VERIFIED (`NOT_AVAILABLE`)
- **Score interno:** `user_value_score` 0–100
- **SQL:** Q1–Q20

---

# 4. Taxonomias oficiais

## Price Quality (10.1)

`HIGH` · `MEDIUM` · `LOW` · `INVALID` · `UNKNOWN`

## Price Confidence (10.1)

`HIGH` · `MEDIUM` · `LOW` · `UNKNOWN`

## Savings (10.2)

- **Type:** `OBSERVED` · `UNVERIFIED` · `VERIFIED` (reservado)
- **Nature:** `OFFER_DIFFERENCE` · `UI_ASSUMPTION` · `NONE` · etc.
- **Confidence:** `HIGH` · `MEDIUM` · `LOW` · `UNKNOWN`

## Alert Lifecycle (10.3)

`REQUESTED` · `CREATED` · `ACTIVE` · `CHECKED` · `TARGET_REACHED` · `NOTIFICATION_PREPARED` · `NOTIFICATION_SENT` · `NOTIFICATION_FAILED` · (+ reservados)

## Anti-Regret (10.4)

- **Pattern:** `DIRECT_ACCEPTANCE` · `COMPARISON_BEFORE_ACCEPTANCE` · `PRICE_WAITING` · etc.
- **Confidence:** `HIGH` · `MEDIUM` · `LOW` · `UNKNOWN`

## User Value (10.5)

- **Status:** `POTENTIAL` · `OBSERVED` · `VERIFIED` · `UNKNOWN`
- **Type:** `PRICE_OPPORTUNITY` · `ALERT_SUCCESS` · `DECISION_SUPPORT` · etc.
- **Time saved bucket:** `VERY_LOW` · `LOW` · `MEDIUM` · `HIGH` · `UNKNOWN`

---

# 5. Regras semânticas

```text
PRICE DIFFERENCE ≠ SAVINGS REALIZED
POTENTIAL SAVINGS ≠ VERIFIED SAVINGS
TARGET REACHED ≠ PURCHASE
NOTIFICATION SENT ≠ DELIVERED
OFFER CLICK ≠ PURCHASE
FAVORITE ≠ PURCHASE
ACCEPTANCE SIGNAL ≠ SATISFACTION
ANTI-REGRET SCORE ≠ REGRET
USER VALUE SCORE ≠ ROI
TIME SAVED BUCKET ≠ MINUTES SAVED
```

Flags de segurança obrigatórias em eventos 10.x:

```text
purchase_confirmed: false
value_verified: false        (10.5)
roi_assumed: false            (10.5)
regret_confirmed: false       (10.4)
satisfaction_assumed: false  (10.4/10.5)
verified_value_amount: null   (10.5)
```

---

# 6. Eventos e contratos

| event_name | version | category | dedup |
|------------|---------|----------|-------|
| `mia_price_intelligence` | 10.1.0 | price_intelligence | request_id + event + version |
| `mia_savings_estimation` | 10.2.0 | savings_estimation | request_id + savings_type + version |
| `mia_price_alert_lifecycle` | 10.3.0 | price_alert_lifecycle | alert_id + stage + occurrence_key |
| `mia_anti_regret_foundation` | 10.4.0 | anti_regret | request_id + decision_request_id + event + version |
| `mia_user_value_outcome` | 10.5.0 | user_value | request_id + decision_request_id + event + version |

Detalhamento: `docs/analytics/contracts/EVENT_CONTRACT.md` §7.19–7.23

---

# 7. IDs e correlação

## Matriz evento × identificador

| Evento | request_id | decision_request_id | alert_id | session_id |
|--------|------------|---------------------|----------|------------|
| 10.1 | obrigatório | opcional | — | sim |
| 10.2 | obrigatório | opcional | — | sim |
| 10.3 | opcional | opcional | obrigatório* | sim |
| 10.4 | sim | obrigatório | — | sim |
| 10.5 | sim | obrigatório | — | sim |

\* exceto REQUESTED pré-criação

## Queries cruzadas de auditoria

30 consultas em `docs/analytics/sql/patch-106-query*.sql` — funil, duplicação, órfãos, PII, VERIFIED indevido, transições inválidas.

---

# 8. SQL e dashboards

## Total de consultas

| Patch | Queries |
|-------|---------|
| 10.1 | 10 |
| 10.2 | 15 |
| 10.3 | 30 |
| 10.4 | 15 |
| 10.5 | 20 |
| 10.6 cross-audit | 30 |
| **Total** | **120** |

## Grãos e denominadores

- **Evento:** contagem de linhas `analytics_events`
- **Decisão:** `decision_request_id` distinto
- **Alerta:** `alert_id` distinto (lifecycle)
- **Request:** `request_id` distinto

## Métricas permitidas

- Distribuições de qualidade, confidence, stages
- Médias de scores **observacionais**
- Funil de cadeia 10.1→10.5
- Taxa de TARGET_REACHED (≠ compra)

## Métricas proibidas

- ROI percentual
- Economia verificada total
- Taxa de compra inferida de clicks
- Satisfação inferida de acceptance
- Soma de POTENTIAL como economia realizada

---

# 9. Privacidade

## Permitido

IDs, taxonomias, scores, buckets, contadores, valores monetários observacionais, versões.

## Proibido

query, prompt, response, product_name, url, email, PII, tokens.

Scanner: regex em metadata produção — ver PATCH 10.6 evidence.

---

# 10. Produção

Evidências por patch:

- `PATCH_10_0_ARCHITECTURE_AUDIT_EVIDENCE.json`
- `PATCH_10_1_PRICE_INTELLIGENCE_EVIDENCE.json`
- `PATCH_10_2_SAVINGS_ESTIMATION_EVIDENCE.json`
- `PATCH_10_3_PRICE_ALERT_LIFECYCLE_EVIDENCE.json`
- `PATCH_10_4_ANTI_REGRET_FOUNDATION_EVIDENCE.json`
- `PATCH_10_5_SAVINGS_OUTCOMES_EVIDENCE.json`
- `PATCH_10_6_FINAL_AUDIT_EVIDENCE.json`

---

# 11. Limitações conhecidas

1. `verified_value_amount` permanece null — sem checkout
2. Enriquecimento pós-decisão 10.5 é assíncrono; evento inicial pode permanecer `POTENTIAL`
3. `time_saved_bucket` é proxy de profundidade, não minutos
4. Estágios reservados de alerta não emitidos
5. Scores internos não refletem emoção ou satisfação
6. Dedup in-memory limitado em cold start serverless (alert lifecycle)

---

# 12. Backlog

- Integração checkout/marketplace para VERIFIED
- DB-level dedup para hooks pós-decisão
- Índices JSONB em `decision_request_id`, `alert_id`
- Dashboard executivo Fase 11
- Wire stages reservados quando infra existir

---

# 13. Próximos passos

**Fase 11 — Teilor em Números:** exposição de métricas para fundadores, investidores e usuários, com grãos e denominadores explícitos.

---

# 14. Veredito final

A Fase 10 está **consistente, semanticamente correta, persistindo em produção e pronta para evolução empresarial**, desde que métricas proibidas não sejam comunicadas externamente.

🟢 **FASE 10 CONCLUÍDA E APROVADA**
