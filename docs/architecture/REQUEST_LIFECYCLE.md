# Ciclo de Vida da Request

Fluxo completo de uma mensagem de chat da MIA, do browser até a resposta.

---

## Diagrama principal

```
Frontend (MIAChat.jsx)
        │
        ▼
/api/mia-chat                    ← Perímetro público (12B + 12C)
        │
        ├─ Observability (12E)   ← requestId, correlationId, logs
        │
        ▼
Forward interno                  ← x-api-key + propagação de IDs
        │
        ▼
/api/chat-gpt4o                  ← Core cognitivo
        │
        ├─ Shared State (12F)    ← ALS: runtime enforcement, governance
        ├─ Commercial Runtime    ← dedup, providers, cache
        ├─ Decision Engine       ← intent, authority, routing
        ├─ Router                ← path selection
        ├─ LLM                   ← verbalização apenas
        │
        ▼
Response Hardening (12C)         ← sanitização no proxy de retorno
        │
        ▼
Frontend                         ← session_context atualizado
```

---

## Etapa 1 — Frontend

**Arquivo:** `components/MIAChat.jsx`

O frontend mantém estado local React:

- `sessionContext` — memória conversacional (`lastBestProduct`, `lastCategory`, etc.)
- `conversation_id` — identificador da conversa
- `user_id` — identificador do usuário

A cada mensagem, o frontend envia:

```json
{
  "text": "...",
  "user_id": "...",
  "conversation_id": "...",
  "messages": [...],
  "session_context": { ... }
}
```

**Ownership:** conversation-scoped. Vive no browser; o backend recebe uma cópia e devolve `session_context` atualizado na resposta.

**Escrita (wish/alerts):** o frontend inclui `Authorization: Bearer <session_token>` obtido via `/api/register-user`.

---

## Etapa 2 — Perímetro (`/api/mia-chat`)

**Arquivo:** `pages/api/mia-chat.js`  
**Patches:** 12B (proxy), 12C (hardening)

Responsabilidades:

1. **Observability wrapper** — `withMiaObservability` cria `requestId`/`correlationId`
2. **Security headers** — `Cache-Control`, `X-Content-Type-Options`, etc.
3. **CORS** — allowlist de origens (`MIA_PUBLIC_ALLOWED_ORIGINS`)
4. **Validação de método** — POST only
5. **Validação de Content-Type** — `application/json`
6. **Validação de body** — limites de tamanho, campos obrigatórios
7. **Rate limit** — proteção contra flood (`lib/miaPerimeterRateLimit.js`)
8. **Forward interno** — `forwardChatRequestToCore()` para `/api/chat-gpt4o`

O browser **nunca** chama `/api/chat-gpt4o` diretamente.

---

## Etapa 3 — Observability

**Arquivos:** `lib/miaObservability.js`, `lib/miaObservabilityContext.js`

Antes de qualquer lógica de negócio:

1. Gera ou aceita `x-request-id` do header
2. Gera ou aceita `x-correlation-id`
3. Armazena contexto em AsyncLocalStorage
4. Aplica headers na resposta
5. Emite log `request_start`
6. Ao finalizar: log `request_complete` + métricas

Propagação para o core:

```
mia-chat → forwardChatRequestToCore → chat-gpt4o
         (x-request-id, x-correlation-id)
```

---

## Etapa 4 — Shared State

**Arquivo:** `lib/miaSharedRequestState.js`  
**Patch:** 12F

No core (`chat-gpt4o`), após autenticação interna:

1. `createInitialSharedRequestState()` — estado fresh por request
2. `runWithSharedRequestState()` — entra em AsyncLocalStorage
3. Bindings:
   - `runtimeExecutionEnv` — env de execução (inclui test mode header)
   - `runtimeEnforcement` — lifecycle, sealing, provider accounting
   - `semanticGovernance` — intent authority, routing decision, commercial gate
4. `enterCommercialRequestDedupContext()` — dedup comercial request-scoped

Cleanup no `finally`: `clearActiveRequestExecutionEnv()` + `clearActiveExternalCallAccounting()`.

---

## Etapa 5 — Commercial Runtime

**Arquivos:** `lib/commercial/*`

Executado quando o Decision Engine autoriza caminho comercial:

- **Request dedup** (ALS) — evita chamadas duplicadas na mesma request
- **Universal commercial cache** (application-scoped) — reutiliza resultados recentes entre requests na mesma instância
- **Provider execution policy** — test mode, paid/free gates, accounting
- **Cost guard / circuit breaker** — proteção de budget

A MIA decide; providers executam sob governança.

---

## Etapa 6 — Decision Engine

**Arquivo:** `pages/api/chat-gpt4o.js` (seção cognitiva)

Componentes (inalterados no Bloco 12):

- Intent detection e authority
- Commercial entry gate
- Routing decision (allowNewSearch, follow-up, mixed intent)
- Runtime precedence e enforcement
- Specific product lock, runner-up, comparison

Estado mutável durante esta fase vive em `semanticGovernanceRef` e `runtimeEnforcementRef` — isolados por ALS (12F).

---

## Etapa 7 — Router

**Arquivos:** `lib/miaRuntimePrecedence.js`, `lib/miaRoutingGuardrails.js`

Seleciona o path de resposta:

- Commercial offer
- Social/conversational
- Explanation/rich path
- Fallback/degraded
- Fail-closed

O router consulta `semanticGovernance` e `runtimeEnforcement` do contexto request-scoped.

---

## Etapa 8 — LLM

O LLM **verbaliza** decisões já tomadas pela MIA. Não é fonte de autoridade comercial.

Chamadas LLM passam por policy de execução externa (`externalProviderExecutionPolicy.js`) com accounting rastreado no contexto da request.

---

## Etapa 9 — Response Hardening

**Arquivo:** `lib/miaPublicApiHardening.js`  
**Patch:** 12C

No retorno do proxy (`mia-chat`), antes de enviar ao browser:

1. Remove chaves internas (`mia_debug`, `runtime_enforcement`, prompts, stack traces)
2. Detecta e redige padrões de segredo
3. Normaliza estrutura de resposta pública
4. Preserva campos aprovados: `reply`, `prices`, `session_context`

---

## Etapa 10 — Frontend (retorno)

O frontend:

1. Exibe `reply` e `prices`
2. Atualiza `sessionContext` com `data.session_context` da resposta
3. Mantém continuidade conversacional na próxima mensagem

---

## Fluxos alternativos

### Cognitive loading preview

```
Frontend → /api/mia-cognitive-loading → (mesmo hardening de perímetro)
```

Preview leve sem forward completo para core comercial.

### Analytics

```
Frontend → /api/analytics/track → allowlist de eventos → Supabase
```

Sem forward para core. Eventos validados por `miaAnalyticsAllowlist.js`.

### Write endpoints (wish, alerts)

```
Frontend → /api/save-wish (etc.)
         → validateUserSessionToken (HMAC)
         → operação Supabase
```

Token emitido por `/api/register-user` após informar email.

### Health / Ready

```
Probe → /api/health  (liveness — processo vivo)
Probe → /api/ready   (readiness — config mínima presente)
```

---

## Headers propagados

| Header | Direção | Propósito |
|---|---|---|
| `x-request-id` | Entrada → saída → core | Rastreio único da request |
| `x-correlation-id` | Entrada → saída → core | Correlação entre serviços/turnos |
| `x-api-key` | mia-chat → core only | Auth interna (nunca exposta ao browser) |
| `Authorization: Bearer` | Frontend → write endpoints | Session token HMAC |

---

## Variáveis de ambiente relevantes

| Variável | Etapa |
|---|---|
| `API_SHARED_KEY` | Auth interna core + emissão session token fallback |
| `MIA_USER_SESSION_SECRET` | Assinatura HMAC session token |
| `MIA_PUBLIC_ALLOWED_ORIGINS` | CORS no perímetro |
| `MIA_PERIMETER_RATE_LIMIT_*` | Rate limit |
| `MIA_DEV_ROUTES_ENABLED` | Gate dev/test routes |
