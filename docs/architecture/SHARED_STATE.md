# Shared State

Documentação do modelo de estado compartilhado da MIA (PATCH 12F).

---

## Problema resolvido

Em ambiente serverless (Vercel), múltiplas requests podem executar concorrentemente na mesma instância warm. Antes do 12F, refs module-level mutáveis (`runtimeEnforcementRef`, `semanticGovernanceRef`, `activeRequestExecutionEnv`) podiam **vazar estado entre requests**.

O 12F isolou todo estado mutável por request via **AsyncLocalStorage**.

---

## Classificação de escopos

| Escopo | Definição | Exemplos |
|---|---|---|
| **Request** | Vive apenas durante uma HTTP request | runtimeEnforcement, semanticGovernance, commercial dedup, observability |
| **Conversation** | Pertence a um par user/conversation | session_context, conversation_id |
| **Application** | Compartilhado na instância do processo | rate limit store, commercial cache, metrics |
| **Persistent** | Sobrevive entre requests e instâncias | Supabase (wish, alerts, analytics) |

Constantes exportadas em `lib/miaSharedRequestState.js`:

```javascript
SHARED_STATE_SCOPE = {
  REQUEST: "request",
  CONVERSATION: "conversation",
  APPLICATION: "application",
  PERSISTENT: "persistent"
}
```

---

## Request Scoped

### Hub central

**Arquivo:** `lib/miaSharedRequestState.js`  
**Store:** `miaSharedRequestStorage` (AsyncLocalStorage)

Estado criado por request:

```javascript
{
  requestId, correlationId,
  runtimeExecutionEnv: { env },
  semanticGovernance: { ctx, finalRoutingDecision, commercialEntryGate, legacyIntentSignal },
  runtimeEnforcement: <createRuntimeEnforcementContext()>,
  activeRequestExecutionEnv,
  activeExternalCallAccounting,
  conversationContext: { conversationId, userId },
  sessionContextInbound,
  analyticsContext, providerContext, cacheContext, commercialContext
}
```

### Proxies estáveis

Para evitar refactor do monólito `chat-gpt4o.js`, refs module-level foram convertidos em **proxies** que delegam para o bucket ALS quando ativo:

```javascript
const runtimeEnforcementRef = createSharedStateAccessor("runtimeEnforcement", fallback);
const semanticGovernanceRef = createSharedStateAccessor("semanticGovernance", fallback);
const runtimeExecutionEnvRef = createSharedStateAccessor("runtimeExecutionEnv", fallback);
```

Código existente continua usando `runtimeEnforcementRef.prop = value` — o proxy redireciona para o store da request.

### Provider execution env

**Arquivo:** `lib/commercial/externalProviderExecutionPolicy.js`

Migrado de `let activeRequestExecutionEnv` (module-level) para ALS:

```
bindActiveRequestExecutionEnv(env)
  → getSharedRequestState() ? ALS : fallback module var (testes legados)
```

### Commercial request dedup

**Arquivo:** `lib/commercial/commercialRequestDeduplication.js`  
**Store:** `commercialRequestDedupStorage` (ALS separado)

Memória efêmera por request para evitar chamadas comerciais duplicadas. Desde 12F, `requestId` alinhado ao observability context.

---

## Conversation Scoped

### session_context

**Ownership:** Frontend (`MIAChat.jsx` useState) + payload HTTP

Fluxo:

1. Frontend envia `session_context` no body
2. Core processa e pode mutar durante a request
3. Resposta devolve `session_context` atualizado
4. Frontend faz `setSessionContext(data.session_context)`

Sem estado global server-side para session_context. Backend legacy (`economia`) persistia em Supabase — desativado por padrão.

### conversation_id / user_id

Capturados em `sharedState.conversationContext` para rastreio. Não são mutáveis server-side durante a request.

---

## Application Scoped

Caches e stores intencionalmente compartilhados entre requests **na mesma instância**:

| Store | Arquivo | Propósito |
|---|---|---|
| Rate limit | `lib/miaPerimeterRateLimit.js` | Flood protection por IP |
| Universal commercial cache | `lib/commercial/universalCommercialCache.js` | Reutilizar resultados comerciais recentes |
| Commercial search cache | `pages/api/chat-gpt4o.js` (`COMMERCIAL_SEARCH_CACHE`) | Cache de busca inline |
| Provider cooldowns | `pages/api/chat-gpt4o.js` (`PROVIDER_COOLDOWNS`) | Cooldown entre chamadas |
| Provider circuit breaker | `lib/commercial/providerBudgetCircuitBreaker.js` | Budget protection |
| Metrics | `lib/miaMetrics.js` | Agregação de latência/erros |

**Comportamento:** aceito no MVP. Não compartilham entre instâncias Vercel (cold start = store vazio).

---

## Persistent

| Store | Tecnologia | Dados |
|---|---|---|
| Supabase | PostgreSQL | Wish list, price alerts, analytics events |
| OAuth tokens | Vault + DB | Credenciais ML (encrypt-at-rest) |

Sem estado mutável in-process para dados persistentes.

---

## Ownership

| Estado | Dono | Mecanismo |
|---|---|---|
| Request lifecycle | `miaSharedRequestState.js` | ALS |
| Observability IDs | `miaObservabilityContext.js` | ALS (nested) |
| Commercial dedup | `commercialRequestDeduplication.js` | ALS (nested) |
| Provider env/accounting | `externalProviderExecutionPolicy.js` | ALS via shared state |
| session_context | Frontend + HTTP payload | Conversation |
| Application caches | Respective lib modules | Module-level Map |
| Persistent data | Supabase | Database |

---

## Lifecycle

```
1. withMiaObservability(req)
     └─ initObservabilityContext → ALS observability

2. chat-gpt4o auth OK
     └─ createInitialSharedRequestState(observability IDs)
     └─ runWithSharedRequestState(state)
          ├─ bindSharedRuntimeEnforcement(fresh context)
          ├─ bindActiveRequestExecutionEnv(env)
          ├─ bindActiveExternalCallAccounting(enforcement)
          ├─ reset semanticGovernance
          ├─ enterCommercialRequestDedupContext
          │
          ├─ [handler core — decision, router, LLM]
          │
          └─ finally:
               ├─ clearActiveRequestExecutionEnv()
               └─ clearActiveExternalCallAccounting()
```

ALS stores são automaticamente descartados ao sair de `runWithSharedRequestState` / `runWithObservabilityContext`.

---

## AsyncLocalStorage — 3 stores

| Store | Arquivo | Escopo |
|---|---|---|
| `miaObservabilityStorage` | `miaObservabilityContext.js` | requestId, correlationId |
| `miaSharedRequestStorage` | `miaSharedRequestState.js` | runtime state |
| `commercialRequestDedupStorage` | `commercialRequestDeduplication.js` | dedup entries |

Testes de concorrência (12F) confirmam que requests paralelas não compartilham env nem accounting.

---

## Fallbacks module-level

Existem fallbacks (`_fallbackRuntimeEnforcementRef`, `fallbackActiveRequestExecutionEnv`) para testes/scripts que não entram em ALS.

**Produção:** handler sempre executa dentro de `runWithSharedRequestState` — fallbacks não são usados no caminho real.

---

## Frontend

`MIAChat.jsx`:

- `sessionContext` em `useState` — isolado por instância React
- Sem Context API global compartilhado
- Session token em memória local para write endpoints

---

## Testes

```bash
npm run test:mia:12f:shared-state   # 29 testes
```

Cobertura:

- ALS read/write via proxy
- Isolamento paralelo env + accounting
- Alinhamento requestId observability ↔ shared state
- Cleanup após request
- Source code assertions (chat-gpt4o usa ALS)

---

## Arquivos de referência

| Arquivo | Responsabilidade |
|---|---|
| `lib/miaSharedRequestState.js` | Hub ALS + proxies + bindings |
| `lib/commercial/externalProviderExecutionPolicy.js` | Env/accounting ALS |
| `lib/commercial/commercialRequestDeduplication.js` | Dedup ALS |
| `lib/miaObservabilityContext.js` | Observability ALS |
| `pages/api/chat-gpt4o.js` | Handler wrapper + proxy refs |
