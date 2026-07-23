# Price Alert Lifecycle Analytics

PATCH 10.3 — observabilidade oficial do ciclo de vida dos alertas de preço.

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_price_alert_lifecycle` |
| `event_version` | `10.3.0` |
| `category` | `price_alert_lifecycle` |

## Arquitetura auditada

```text
MIAChat.jsx → POST /api/create-price-alert → Supabase price_alerts
Cron pages/api/cron/price-alerts-daily-check.js
  → lib/miaPriceAlertDryRun.js (CHECKED)
  → lib/miaPriceAlertSendGate.js (NOTIFICATION_*)
Resend via lib/email.js (funcional, inalterado)
Cliente: price_alert_created (mantido, complementar)
```

**Hooks (fire-and-forget):**

| Estágio | Hook |
|---------|------|
| REQUESTED / CREATED / ACTIVE / FAILED | `instrumentPriceAlertLifecycleFromCreation` em `create-price-alert.js` |
| CHECKED / TARGET_REACHED | `instrumentPriceAlertLifecycleFromCheck` em dry run + send gate |
| NOTIFICATION_PREPARED / SENT / FAILED | `instrumentPriceAlertLifecycleFromNotification` em send gate |

**Dedup:** `alert_id + event_name + event_version + lifecycle_stage + lifecycle_occurrence_key`

## Lifecycle stages

### Emitidos (comprovados)

| Stage | Quando |
|-------|--------|
| `REQUESTED` | POST create-price-alert recebido |
| `CREATED` | Insert OK ou duplicate detectado |
| `ACTIVE` | Alerta novo persistido (`is_active=true`) |
| `CHECKED` | Dry run / send gate executou `evaluatePriceAlertDryRun` |
| `TARGET_REACHED` | `eligible_for_email=true` (preço observado ≤ alvo) |
| `NOTIFICATION_PREPARED` | Antes de `sendPriceDropEmail` |
| `NOTIFICATION_SENT` | Resend retornou sucesso |
| `NOTIFICATION_FAILED` | Falha no envio |
| `FAILED` | Validação ou persistência falhou na criação |

### Reservados (não emitir)

`NOTIFICATION_DELIVERED` · `USER_RETURNED` · `OFFER_OPENED` · `PAUSED` · `REACTIVATED` · `CANCELLED` · `EXPIRED`

## Status funcional (`alert_status`)

Separado de `lifecycle_stage`: `PENDING` · `ACTIVE` · `COMPLETED` · `FAILED` · `UNKNOWN`

Cancelamento/pausa/expiração não existem no servidor hoje — UI remove apenas de `localStorage`.

## Origem (`alert_source`)

Inferida no create API (sem alterar frontend):

| Valor | Critério |
|-------|----------|
| `PRICE_ALERT_PAGE` | `target_price` explícito ≠ `current_price` |
| `OFFER_CARD` | `product_url` presente |
| `UNKNOWN` | demais casos |

## Target realism (observacional)

| Classe | Δ% abaixo do atual |
|--------|-------------------|
| `TARGET_NEAR_CURRENT` | ≤ 2% |
| `TARGET_MODERATE` | ≤ 10% |
| `TARGET_AGGRESSIVE` | ≤ 25% |
| `TARGET_EXTREME` | > 25% |
| `TARGET_ALREADY_REACHED` | alvo = atual |
| `INVALID` | alvo > atual |

Não bloqueia criação.

## Preços e savings

- `current_price` / `target_price` / `observed_price` — BRL, finitos
- `potential_savings_*` — natureza `ALERT_OPPORTUNITY` apenas
- `purchase_confirmed: false` sempre
- Nunca `VERIFIED` / economia realizada

## Matriz de transições (suportadas)

```text
REQUESTED → CREATED | FAILED
CREATED → ACTIVE (novo alerta)
ACTIVE → CHECKED
CHECKED → CHECKED | TARGET_REACHED
TARGET_REACHED → NOTIFICATION_PREPARED → NOTIFICATION_SENT | NOTIFICATION_FAILED
```

## SQL

`docs/analytics/sql/patch-103-query*.sql` (Q1–Q30)

Grão principal: `alert_id`. Q19/Q21/Q22 documentam stages reservados.

## Privacidade

Proibido: email, product_name, url, tokens, payload bruto.  
Permitido: IDs, taxonomias, valores monetários, hashes aprovados.

## Limitações

- Dedup in-memory (serverless) — mesma limitação 10.1/10.2
- `time_to_target_seconds` reservado até timestamp de criação confiável no check path
- Remove UI não altera `is_active` no banco
- Sem webhook Resend → sem `NOTIFICATION_DELIVERED`
- Sem correlação alerta ↔ offer_click → sem `USER_RETURNED` / `OFFER_OPENED`

## Implementação

| Módulo | Caminho |
|--------|---------|
| Catálogo | `lib/miaPriceAlertLifecycleCatalog.js` |
| Classificador | `lib/miaPriceAlertLifecycleClassifier.js` |
| Analytics | `lib/miaPriceAlertLifecycleAnalytics.js` |
| Create hook | `pages/api/create-price-alert.js` |
| Check hook | `lib/miaPriceAlertDryRun.js` · `lib/miaPriceAlertSendGate.js` |

## Testes

```bash
node scripts/test-mia-analytics-patch-103-price-alert-lifecycle.js
node scripts/patch-103-production-smoke.mjs
```
