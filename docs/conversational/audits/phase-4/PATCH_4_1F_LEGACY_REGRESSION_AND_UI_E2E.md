# PATCH 4.1F — Saneamento das Regressões Legadas e Validação E2E pela Interface

**Phase:** 4 — Validação Conversacional  
**Status:** Aprovado (LOCAL browser 23/23; produção pendente pós-deploy)

## Objetivos

1. Sanear regressões legadas (`3.5b`, `conversation-polish`)
2. Validar fluxo E2E pela interface real (`/app-mia`) com Playwright

## Regressões legadas

| Teste | Classificação | Correção |
|-------|---------------|----------|
| `test-mia-patch-35b-verbalizer-humanization-audit.js` | Tipo 2 — teste obsoleto | Versão atualizada para `3.5b.1` |
| `test-mia-conversation-polish.js` | Tipo 1 + Tipo 3 | Sacrifícios sem rewrite de ganho; contrato strict alinhado ao Composition Guard |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/patch-41f-legacy-regression-audit.mjs` | Auditoria forense 35b + polish |
| `scripts/patch-41f-browser-e2e-scenarios.mjs` | Cenários UI + helpers Playwright |
| `scripts/patch-41f-browser-local-validation.mjs` | Browser E2E LOCAL |
| `scripts/patch-41f-browser-production-validation.mjs` | Browser E2E REAL |
| `scripts/patch-41f-browser-local-real-parity.mjs` | Paridade LOCAL × REAL (browser) |
| `scripts/patch-41f-regression-runner.mjs` | Regressões legadas + 3.6 + 3.7 + 4A + 4.1 audit |

## npm

```bash
npm run test:mia:conv:patch-41f:legacy-regression-audit
npm run test:mia:conv:patch-41f:regression-runner
npm run test:mia:conv:patch-41f:local-browser-validation
npm run test:mia:conv:patch-41f:production-browser-validation
npm run test:mia:conv:patch-41f:local-real-browser-parity
```

## Evidências

- `docs/conversational/audits/phase-4/evidence/PATCH_4_1F_LEGACY_REGRESSION_EVIDENCE.json`
- `docs/conversational/audits/phase-4/evidence/PATCH_4_1F_LOCAL_BROWSER_E2E_EVIDENCE.json`
- `docs/conversational/audits/phase-4/evidence/PATCH_4_1F_PRODUCTION_BROWSER_E2E_EVIDENCE.json`
- `docs/conversational/audits/phase-4/evidence/PATCH_4_1F_LOCAL_REAL_BROWSER_PARITY_EVIDENCE.json`
- Screenshots: `docs/conversational/audits/phase-4/evidence/patch-4-1f/local/` e `production/`

## Notas de infraestrutura browser

- Fluxos isolados (`long-conversation` e `ui-scenarios`) em instâncias separadas do Chromium para evitar rate limit acumulado
- Validadores alinhados ao contrato PATCH 4.1 (`analyzeBrowserTurn`)
- Retry automático em rate limit (35s cooldown)

## Impacto arquitetural

Nenhum componente cognitivo novo. Correções restritas à camada de apresentação/contrato da primeira resposta e testes.
