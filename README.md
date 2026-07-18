# Teilor MIA

Assistente de compras inteligente — MIA (Mercado Inteligente de Assessoria).

**Produção:** [economia-ai.vercel.app](https://economia-ai.vercel.app)

---

## Stack

- **Framework:** Next.js 14 (Pages Router)
- **Runtime:** Node.js 22.x (Vercel Serverless)
- **Frontend:** React 18
- **Database:** Supabase (PostgreSQL)
- **Deploy:** Vercel

---

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de produção
npm start          # servir build
```

Requer `.env.local` com variáveis de ambiente (ver documentação de segurança).

---

## Testes

```bash
# Bloco 12 — infraestrutura de produção
npm run test:mia:12b:perimeter      # 59 testes — perímetro e proxy
npm run test:mia:12c:hardening      # 43 testes — hardening público
npm run test:mia:12d:lockdown       # 33 testes — lockdown de endpoints
npm run test:mia:12e:observability  # 20 testes — observabilidade
npm run test:mia:12f:shared-state   # 29 testes — shared state

# Conversação e polish
npm run test:mia:11c:polish         # 22 testes
npm run test:mia:11b4:runner        # 27 testes
```

Suíte completa validada: **233/233**.

---

## Arquitetura

A MIA opera em camadas de produção definidas no **Bloco 12**:

```
Browser → Perímetro (mia-chat) → Core (chat-gpt4o) → Resposta sanitizada → Browser
```

Componentes principais:

- **Perímetro público** — proxy, rate limit, CORS, validação
- **Core cognitivo** — Decision Engine, Router, Commercial Runtime, LLM
- **Segurança** — lockdown de endpoints, HMAC session, API keys internas
- **Observabilidade** — requestId, logs estruturados, health/ready
- **Shared state** — AsyncLocalStorage request-scoped (serverless-safe)

---

## Documentação Técnica

Documentação oficial consolidada do Bloco 12:

| Documento | Conteúdo |
|---|---|
| [BLOCK_12_ARCHITECTURE.md](docs/architecture/BLOCK_12_ARCHITECTURE.md) | Visão geral, componentes, rotas, ownership |
| [REQUEST_LIFECYCLE.md](docs/architecture/REQUEST_LIFECYCLE.md) | Fluxo completo da request (frontend → core → resposta) |
| [SECURITY_MODEL.md](docs/architecture/SECURITY_MODEL.md) | Perímetro, auth, HMAC, cron, allowlists, sanitização |
| [OBSERVABILITY.md](docs/architecture/OBSERVABILITY.md) | requestId, logger, métricas, health, troubleshooting |
| [SHARED_STATE.md](docs/architecture/SHARED_STATE.md) | Escopos, ALS, caches, lifecycle |
| [KNOWN_LIMITATIONS.md](docs/architecture/KNOWN_LIMITATIONS.md) | Limitações MVP vs pós-MVP |

Diretório: [`docs/architecture/`](docs/architecture/)

---

## Endpoints públicos

| Rota | Descrição |
|---|---|
| `POST /api/mia-chat` | Chat principal |
| `POST /api/mia-cognitive-loading` | Preview cognitivo |
| `POST /api/analytics/track` | Analytics (allowlist) |
| `GET /api/health` | Liveness probe |
| `GET /api/ready` | Readiness probe |

O core (`/api/chat-gpt4o`) é **interno** — acessível apenas via proxy com `API_SHARED_KEY`.

---

## Outros documentos

- [Routing contract](docs/mia-routing-contract.md)
- [Provider credential vault](docs/provider-credential-vault.md)
- [Mercado Livre OAuth security](docs/mercadolivre-oauth-security.md)
- [Price alerts production readiness](docs/alerts/price-alert-production-readiness.md)
