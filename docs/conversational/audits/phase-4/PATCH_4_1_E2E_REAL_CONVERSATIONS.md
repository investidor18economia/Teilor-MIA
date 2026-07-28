# PATCH 4.1 — Testes End-to-End das Conversas Reais

**Phase:** 4 — Validação Conversacional  
**Status:** Em validação

## Escopo

Simulação de usuários reais via bateria E2E em `/api/mia-chat` — perfis, linguagens, comercial, casual, humor, insultos, elogios, flerte e robustez.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/patch-41-e2e-conversation-battery.mjs` | Bateria LOCAL/REAL |
| `scripts/patch-41-e2e-conversation-scenarios.mjs` | Cenários e perfis |
| `scripts/test-mia-patch-41-e2e-conversation-audit.js` | Unit audit |
| `scripts/patch-41-regression-runner.mjs` | Regressões Phase 3 + 4A |
| `scripts/patch-41-local-real-parity.mjs` | Paridade LOCAL × REAL |

## Famílias descobertas (audit)

- `meta_commercial_redirect` — perguntas sobre identidade da MIA redirecionadas para ajuda comercial
- `short_social_ack` — respostas sociais ultra-curtas válidas ("Opa!", "Imagina.")

## npm

```bash
npm run test:mia:conv:patch-41:e2e-audit
npm run test:mia:conv:patch-41:regression-runner
npm run test:mia:conv:patch-41:local-validation
npm run test:mia:conv:patch-41:production-validation
npm run test:mia:conv:patch-41:local-real-parity
```
