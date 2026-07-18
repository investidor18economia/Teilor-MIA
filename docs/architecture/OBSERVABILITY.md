# Observabilidade

Documentação da infraestrutura de observabilidade operacional (PATCH 12E).

---

## Visão geral

A observabilidade da MIA fornece:

- **Rastreio** — requestId e correlationId em toda request
- **Logs estruturados** — JSON com redação automática
- **Métricas MVP** — in-memory por endpoint
- **Probes** — health (liveness) e ready (readiness)
- **Propagação** — IDs propagados do perímetro ao core

Sem dependência externa (Redis, Prometheus, Datadog) no MVP.

---

## requestId e correlationId

### Geração

**Arquivo:** `lib/miaObservabilityContext.js`

```
Entrada: header x-request-id (se presente) → usa valor
         ausente → crypto.randomUUID()

Entrada: header x-correlation-id (se presente) → usa valor
         ausente → usa requestId
```

### Armazenamento

AsyncLocalStorage (`miaObservabilityStorage`):

```javascript
{
  requestId,
  correlationId,
  endpoint,
  operation,
  startedAtMs,
  provider
}
```

### Headers de resposta

Toda rota wrapped com `withMiaObservability` retorna:

```
x-request-id: <id>
x-correlation-id: <id>
```

### Propagação interna

`lib/miaPerimeterChatProxy.js` propaga IDs do perímetro para o core:

```
mia-chat (ALS) → forwardChatRequestToCore → chat-gpt4o (ALS nested)
```

No core (12F), `createInitialSharedRequestState` recebe os IDs de observabilidade e alinha o commercial dedup.

---

## AsyncLocalStorage

### Store de observabilidade

| Função | Propósito |
|---|---|
| `initObservabilityContext(req, options)` | Cria contexto |
| `runWithObservabilityContext(ctx, fn)` | Executa dentro do ALS |
| `getObservabilityContext()` | Lê store atual |
| `getPropagationHeaders()` | Headers para forward |

### Nested ALS

Observability ALS envolve Shared State ALS no core:

```
withMiaObservability
  └─ runWithObservabilityContext
       └─ runWithSharedRequestState (12F)
            └─ enterCommercialRequestDedupContext (05C)
```

Node.js suporta ALS aninhado — cada store é independente.

---

## Logger

**Arquivo:** `lib/miaLogger.js`

### Níveis

| Nível | Stream | Uso |
|---|---|---|
| `info` | stdout | Eventos normais |
| `warn` | stdout | Alertas |
| `error` | stderr | Erros |
| `audit` | stdout | Eventos de segurança/OAuth |
| `metric` | stdout | Métricas pontuais |

### Formato

JSON estruturado por linha:

```json
{
  "timestamp": "2026-07-18T21:00:00.000Z",
  "level": "info",
  "requestId": "abc-123",
  "correlationId": "abc-123",
  "endpoint": "/api/mia-chat",
  "event": "request_start",
  "reasonCode": null,
  "durationMs": null,
  "status": null
}
```

### Eventos padrão

| Event | Quando |
|---|---|
| `request_start` | Início da request |
| `request_complete` | Fim da request (com durationMs, status) |
| `rate_limit` | Rate limit acionado |
| `unexpected_error` | Exceção não tratada |
| `oauth_start` | Início OAuth ML |

---

## Redaction

**Arquivo:** `lib/miaLogRedaction.js`

Redação automática antes de emitir log:

| Tipo | Tratamento |
|---|---|
| Bearer tokens | `Bearer ****` |
| Emails | `[REDACTED]` |
| JWT | `[REDACTED]` |
| Keys sensíveis | `authorization`, `session_token`, `api_key` → `[REDACTED]` |

Campos preservados: `reasonCode`, `endpoint`, `status`, `event`.

---

## Métricas

**Arquivo:** `lib/miaMetrics.js`

MVP in-memory (application-scoped):

```javascript
{
  requests, errors, status4xx, status5xx,
  totalDurationMs, avgLatencyMs,
  cacheHit, cacheMiss,
  byEndpoint: { ... }
}
```

Registradas automaticamente em `logRequestComplete()`.

**Limitação:** não persistem entre cold starts nem compartilham entre instâncias. Aceito no MVP.

---

## Health e Ready

### `/api/health` — Liveness

Retorna **200** se o processo está vivo:

```json
{
  "status": "ok",
  "version": "<MIA_OBSERVABILITY_VERSION>",
  "timestamp": "...",
  "build": "<git commit>"
}
```

### `/api/ready` — Readiness

Retorna **200** se config mínima presente, **503** caso contrário:

```json
{
  "status": "ready" | "not_ready",
  "version": "...",
  "timestamp": "..."
}
```

Readiness verifica: `NEXT_PUBLIC_SUPABASE_URL` + (`SUPABASE_SERVICE_ROLE_KEY` ou `API_SHARED_KEY`).

---

## Wrapper `withMiaObservability`

**Arquivo:** `lib/miaObservability.js`

```javascript
export default withMiaObservability(handler, { endpoint: "/api/..." });
```

Responsabilidades:

1. `beginMiaObservedRequest` — cria contexto, headers, log start
2. `runWithObservabilityContext` — ALS
3. Executa handler
4. Catch: log error + 500 JSON se headers não enviados
5. Finally: `finishMiaObservedRequest` — log complete + métricas

---

## Endpoints instrumentados

| Endpoint | Observability |
|---|---|
| `/api/mia-chat` | ✅ |
| `/api/mia-cognitive-loading` | ✅ |
| `/api/chat-gpt4o` | ✅ |
| `/api/health` | ✅ |
| `/api/ready` | ✅ |
| `/api/analytics/track` | ✅ |
| `/api/register-user` | ✅ |
| `/api/auth/mercadolivre/start` | ✅ |
| `/api/auth/mercadolivre/callback` | ✅ |
| `/api/check-prices` (cron) | ✅ |
| `/api/cron/price-alerts-daily-check` | ✅ |
| `/api/save-wish` | ❌ (dívida conhecida) |
| `/api/delete-wish` | ❌ |
| `/api/list-wish` | ❌ |
| `/api/create-price-alert` | ❌ |

---

## Troubleshooting

### Encontrar logs de uma request

1. Copie `x-request-id` da resposta HTTP ou do browser DevTools
2. Filtre logs Vercel por `"requestId":"<id>"`

### Request sem correlationId distinto

Comportamento normal quando o cliente não envia `x-correlation-id` — defaults para `requestId`.

### 500 sem detalhes no browser

Intencional (12C sanitization). Detalhes estão nos logs server-side com `reasonCode`.

### Métricas zeradas após deploy

Esperado — métricas são in-memory por instância. Cold start reseta contadores.

### Wish endpoints sem x-request-id

Endpoints de wish/alerts não usam `withMiaObservability` ainda. Ver [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

---

## Testes

```bash
npm run test:mia:12e:observability   # 20 testes
npm run test:mia:12f:shared-state    # inclui alinhamento requestId
```

---

## Arquivos de referência

| Arquivo | Responsabilidade |
|---|---|
| `lib/miaObservabilityContext.js` | ALS + ID generation |
| `lib/miaObservability.js` | Wrapper + headers |
| `lib/miaLogger.js` | Structured logging |
| `lib/miaLogRedaction.js` | Secret redaction |
| `lib/miaMetrics.js` | In-memory metrics |
| `lib/miaBuildInfo.js` | Build/commit metadata |
| `pages/api/health.js` | Liveness |
| `pages/api/ready.js` | Readiness |
