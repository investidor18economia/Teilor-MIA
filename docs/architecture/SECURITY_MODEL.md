# Modelo de Segurança

Documentação do modelo de segurança da MIA após o Bloco 12.

**Princípio:** fail-closed. Rotas não explicitamente aprovadas retornam 404 ou 401.

---

## Camadas de segurança

```
┌─────────────────────────────────────────┐
│ 1. Middleware (Next.js)                 │  dev/test/debug → 404
├─────────────────────────────────────────┤
│ 2. Perímetro público (12B/12C)          │  CORS · rate limit · validação
├─────────────────────────────────────────┤
│ 3. Proxy interno                        │  x-api-key para core
├─────────────────────────────────────────┤
│ 4. Endpoint access policy (12D)         │  cron · admin · legacy · write
├─────────────────────────────────────────┤
│ 5. Response sanitization (12C)          │  strip internal fields
└─────────────────────────────────────────┘
```

---

## Perímetro público

### Rotas aprovadas (browser)

| Rota | Auth | Descrição |
|---|---|---|
| `POST /api/mia-chat` | Nenhuma (rate limited) | Chat principal |
| `POST /api/mia-cognitive-loading` | Nenhuma | Preview loading |
| `POST /api/analytics/track` | Nenhuma (allowlist) | Analytics |
| `GET /api/health` | Nenhuma | Liveness |
| `GET /api/ready` | Nenhuma | Readiness |
| `POST /api/register-user` | Nenhuma | Registro + token |

### Proteções do perímetro

| Proteção | Implementação | Env |
|---|---|---|
| CORS | Allowlist de origens | `MIA_PUBLIC_ALLOWED_ORIGINS` |
| Rate limit | In-memory por IP hash + conversation | `MIA_PERIMETER_RATE_LIMIT_*` |
| Body size | Max 6MB (Next.js bodyParser) | — |
| Text limits | Max chars configurável | `MIA_PUBLIC_MAX_*` |
| Method guard | POST only (chat) | — |
| Content-Type | `application/json` required | — |

**Reason codes públicos:** prefixo `public_api_*` e `perimeter_*` (ver `lib/miaPublicApiHardening.js`).

---

## Endpoints internos

### Core cognitivo

| Rota | Auth | Comportamento sem auth |
|---|---|---|
| `POST /api/chat-gpt4o` | `x-api-key: API_SHARED_KEY` | **401** `internal_api_auth_invalid` |

Chamado exclusivamente pelo proxy interno (`miaPerimeterChatProxy.js`). Headers de segurança aplicados no handler:

- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- Sem CORS `*` (12D)

---

## API Keys

| Secret | Uso | Header |
|---|---|---|
| `API_SHARED_KEY` | Auth interna core + fallback session secret | `x-api-key` |
| `MIA_ADMIN_API_KEY` | Endpoints admin (price alerts) | `x-admin-api-key` ou query |
| `MIA_CRON_SECRET` | Jobs cron (check-prices) | Header ou query |
| `DEV_API_SECRET` | Rotas dev em production runtime | `x-dev-api-secret` |
| `MIA_USER_SESSION_SECRET` | Assinatura HMAC session token | — (server-side) |

**Regra:** secrets nunca aparecem em respostas públicas. Redação automática em logs (12E).

---

## Cron

Endpoints protegidos por `MIA_CRON_SECRET`:

| Rota | Sem secret |
|---|---|
| `/api/check-prices` | **401** |
| `/api/cron/price-alerts-daily-check` | **401** |

Validação via `requireCronAuthorization()` em `miaEndpointAccessPolicy.js`.

**Reason codes:** `cron_auth_required`, `cron_auth_invalid`

---

## OAuth

**Arquivos:** `pages/api/auth/mercadolivre/start.js`, `callback.js`

- Fluxo OAuth Mercado Livre com state-protected redirect
- Instrumentado com `withMiaObservability`
- Credenciais via provider credential vault (decrypt-on-demand, sem cache module-level)
- Em produção pode retornar 403/503 se credenciais não configuradas — comportamento operacional, não falha de segurança

Ver também: `docs/mercadolivre-oauth-security.md`

---

## HMAC Session Token

**Arquivo:** `lib/miaUserSessionToken.js`  
**Patch:** 12D

### Emissão

1. Usuário chama `POST /api/register-user` com email
2. Servidor emite token HMAC: `{uid, iat, exp}.signature`
3. TTL: 30 dias (`MIA_USER_SESSION_TTL_MS`)

### Verificação

Endpoints de escrita validam:

```
Authorization: Bearer <token>
```

ou header `x-mia-session-token`.

### Endpoints protegidos

| Endpoint | Reason code (sem token) |
|---|---|
| `/api/save-wish` | `user_session_required` |
| `/api/delete-wish` | `user_session_required` |
| `/api/list-wish` | `user_session_required` |
| `/api/create-price-alert` | `user_session_required` |

Token inválido/expirado → `user_session_invalid`  
User mismatch → `user_session_forbidden`

### Limitações MVP

- Token emitido sem verificação de email (ver [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md))
- Replayable até expiração
- Bearer credential, não identidade forte

---

## Allowlists

### Analytics events

**Arquivo:** `lib/miaAnalyticsAllowlist.js`

Eventos permitidos:

```
session_started
mia_question_sent
mia_recommendation_shown
favorite_created
price_alert_created
offer_click
```

Evento não listado → **400** `analytics_event_not_allowed`

Limites de payload: metadata max 4000 chars JSON, strings max 512 chars.

---

## Reason codes

### Endpoint policy (12D)

| Code | HTTP | Significado |
|---|---|---|
| `endpoint_not_found` | 404 | Rota bloqueada/inexistente |
| `endpoint_method_not_allowed` | 405 | Método HTTP inválido |
| `internal_api_auth_required` | 503 | API_SHARED_KEY não configurada |
| `internal_api_auth_invalid` | 401 | x-api-key inválida |
| `cron_auth_required` | 401 | Secret cron ausente |
| `cron_auth_invalid` | 401 | Secret cron inválido |
| `admin_auth_required` | 401 | Admin key ausente |
| `admin_auth_invalid` | 401 | Admin key inválida |
| `legacy_endpoint_disabled` | 404 | Endpoint legado desativado |
| `user_session_required` | 401 | Token de sessão ausente |
| `user_session_invalid` | 401 | Token inválido/expirado |
| `user_session_forbidden` | 403 | Token não pertence ao user |

### Perímetro (12B/12C)

| Code | HTTP | Significado |
|---|---|---|
| `perimeter_rate_limited` | 429 | Rate limit excedido |
| `public_api_origin_not_allowed` | 403 | CORS origin rejeitada |
| `public_api_invalid_request` | 400 | Body inválido |
| `public_api_payload_too_large` | 413 | Payload excede limite |

---

## Headers de segurança

### Respostas públicas (12C)

```
Cache-Control: no-store, max-age=0
Pragma: no-cache
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

### Respostas internas (12D)

Mesmos headers via `applyInternalSecurityHeaders()`.

### Observability (12E)

```
x-request-id: <uuid>
x-correlation-id: <uuid>
```

---

## Sanitização de resposta (12C)

Chaves removidas antes de enviar ao browser:

```
mia_debug, runtime_precedence, runtime_enforcement, pipelineTrace,
stack, errorStack, internalError, rawError, rawResponse,
providerRawResponse, providerDiagnostics, internalDiagnostics,
prompt, systemPrompt, developerPrompt, upstream, upstreamHeaders, upstreamBody
```

Padrões de segredo detectados e redigidos:

- API keys, Bearer tokens, JWT, private keys, service role keys

---

## Rotas bloqueadas

### Middleware (fail-closed 404)

Ativo quando `MIA_DEV_ROUTES_ENABLED=false` (default produção):

```
/mia-test
/api/dev/*
/api/debug/*
/api/test/*
/api/test-mia
/api/test-economia
/api/test-serp
/api/env
/api/pages/api/test-economia
```

### Legacy desativado

```
/api/economia          (MIA_LEGACY_ECONOMIA_ENABLED=false)
/api/get-final-price   (404 permanente)
```

---

## Limitações do MVP

| Limitação | Impacto | Status |
|---|---|---|
| Rate limit in-memory | Não compartilhado entre instâncias Vercel | Aceito MVP |
| HMAC sem verificação de email | Token emitido a qualquer email | Aceito MVP |
| Session token replayable | Válido até TTL 30 dias | Aceito MVP |
| OAuth depende de credenciais ML | 403/503 se não configurado | Operacional |

Detalhes completos: [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)

---

## Arquivos de referência

| Arquivo | Responsabilidade |
|---|---|
| `lib/miaEndpointAccessPolicy.js` | Política central |
| `middleware.js` | Gate dev/test |
| `lib/miaPublicApiHardening.js` | Hardening público |
| `lib/miaUserSessionToken.js` | Session HMAC |
| `lib/miaAnalyticsAllowlist.js` | Allowlist analytics |
| `lib/miaPerimeterRateLimit.js` | Rate limit |
| `lib/miaClientSession.js` | Helper frontend |
