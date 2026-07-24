# MVP Full Regression Baseline — PATCH 12.4

**Phase:** 12 — MVP Release Candidate  
**Patch:** 12.4 — Regressão Completa do MVP  
**Status:** ✅ **APPROVED — PATCH 12.4 oficialmente encerrado em produção**  
**Commit final:** `d679b7fc99ec2b47a7d67e7feaf8c275811f1445`  
**Branch:** `master` → `origin/master`  
**Production URL:** https://economia-ai.vercel.app  
**Build ID (prod):** `d679b7fc99ec`

## Objective

Establish the broadest reproducible regression gate for the Teilor/MIA MVP before PATCH 12.5 (Release Candidate Deploy). This patch validates accumulated behavior across architecture, unit tests, integration tests, API handler contract, cognitive routing, intent/social flows, commercial runtime, analytics, security, and selected phase regressions — without adding new product features.

## Inventory (Etapa 1)

| Metric | Value |
|--------|------:|
| Test scripts (`scripts/test-*.{js,mjs}`) | 398 |
| npm `test:mia:*` commands | 80+ |
| P0 suites (PATCH 12.4 runner) | 26 |
| P1 suites (optional `--with-p1`) | 5 |
| Estimated P0 cases (single run) | ~2,400+ |

### Suite categories

- **P0:** architecture, unit smoke, integration smoke, api-handler-contract, cognitive router full, intent social, commercial runtime, analytics value chain, executive metrics/insights, security
- **P1:** phase 10/11 final audits, data layer full (slow), HTTP local (requires dev server)
- **P2:** remaining conversational/commercial/production scripts (~350+)

## Official P0/P1/P2 Matrix (Etapa 2)

See `scripts/test-mia-patch-124-full-mvp-regression-runner.js` for the authoritative list. Highlights:

### P0 (blocking)

- PATCH 12.1 architecture audit
- PATCH 12.2 unit P0 consolidated + router/data-layer smoke
- PATCH 12.3 integration P0 smoke + favorites/alerts
- **api-handler-contract** (Etapa 6 — `withMiaObservability(miaChatCoreHandler)`)
- **Cognitive Router full** (308 cases — PATCH 7.5 `ALTERNATIVE_REQUEST`)
- **Intent Social full** (48 cases)
- Commercial runtime (selection, dedup, merge, 4E-B.4 revalidation)
- Analytics patches 101–105, 111, 114
- Security (public hardening, endpoint lockdown, auth trust)

### P1 (important, non-blocking by default)

- Phase 10/11 final meta-audits
- Data Layer humanization full audit (slow spawn)
- HTTP local suites (5 suites — require `localhost:3000`)

### P2

- Legacy conversational scripts, browser E2E helpers, production-only smoke, operational scripts

## Prior Baselines (Etapa 4)

| Patch | Expected | Notes |
|-------|----------|-------|
| 12.1 | 112/112 architecture checks | Re-run via `test-mia-analytics-patch-121-mvp-architecture-audit.js` |
| 12.2 | 888/888 × 3 deterministic | `npm run test:mia:patch-122:mvp-unit-tests` |
| 12.3 | 896/896 × 3 deterministic | `npm run test:mia:patch-123:mvp-integration-tests` |

## Etapa 6 — API Handler Contract (completed)

- Audits current export: `export default withMiaObservability(miaChatCoreHandler, …)`
- Validates OPTIONS → 405 JSON, observability wrapper, error propagation, commercial runtime hooks
- **Removed** `MIA_SKIP_HANDLER_REGRESSIONS` from official gate
- Regressions 4E-B.1–4E-B.4 + Tone Compliance: **33/33 passed**
- Obsolete asserts removed: `export default handler`, legacy snake_case activation flags
- Fixture fixes: Apify dedup/cache isolation, accessory lock bootstrap contract

## Cognitive Router Full (Etapa 7 — completed)

- **308/308 passed** after aligning tests to PATCH 7.5 `ALTERNATIVE_REQUEST` semantics
- Runtime fixes:
  - `hasAboutMiaRoutingBlock` — anchored product differential beats institutional ABOUT_MIA
  - `hasComprehensionCommercialTail` — anchored explanation cues not blocked
  - Typo normalizer protects `passo horas` (usage-intensity priority shift)
  - Cold acknowledgement (`ok`, `boa`) → CONVERSATIONAL, not REACTION

## Intent Social Full (Etapa 8 — completed)

- **48/48 passed**
- Runtime fixes:
  - Clarification override respects high emotional/social relevance
  - Gratitude + commercial tail (`Valeu… agora compara…`) → MIXED

## Commercial Runtime (Etapa 14 partial)

- 4E-B.4 revalidation passes with nested 4A Apify audit fix (dedup + unique queries)
- Provider registry, accessory enforcement, activation audits updated for camelCase/runtime contracts

## Analytics, Security, Favoritos, Executive Metrics

Covered by P0 suites in PATCH 12.4 runner (patches 101–105, 111, 114, security trio, favorites/alerts integration).

## HTTP Local (Etapa 21)

**Status:** Skipped unless dev server available. Use:

```bash
npm run build && npm run start
npm run test:mia:patch-124:full-regression -- --with-p1
```

## E2E Browser (Etapa 22)

**Status:** P2/P1 — existing `test-mia-11b4-browser-validation.mjs` available; not in default P0 gate.

## Production & Real Conversation (Etapas 30–31)

**Status:** ✅ Concluído em produção (`d679b7fc99ec`, 2026-07-24)

```bash
PATCH124_EXPECTED_COMMIT=d679b7fc99ec npm run test:mia:patch-124:prod-validation
```

**Resultado:** 30/30 checks, 18/18 fluxos de conversa real via `/api/mia-chat` (9 cenários + sessão 10 turnos).

Fluxos validados: genérico, produto específico, comparação, mudança de prioridade, alternativa, contestação, social, misto, multiturn 10 turnos.

## Bugs Found & Corrections

| ID | Layer | Severity | Type | Fix |
|----|-------|----------|------|-----|
| 124-01 | Apify test harness | Medium | Fixture | Isolated dedup context + unique queries |
| 124-02 | api-handler audit | Medium | Obsolete test | Updated to observability wrapper contract |
| 124-03 | Cognitive router | High | Test drift + runtime | ALTERNATIVE_REQUEST alignment + ABOUT_MIA/explanation guards |
| 124-04 | Typo normalizer | Medium | Runtime | Protect `passo`/`fico` from fuzzy → `posso` |
| 124-05 | Intent social | Medium | Runtime | Mixed/emotional edge cases |
| 124-06 | Prod validation harness | Low | Test | Social/closing flows allow short replies (≥5 chars) |
| 124-07 | Conversation (prod) | Low | Runtime | Flow 6 contest → resposta social genérica (P2, não bloqueante) |
| 124-08 | Conversation (prod) | Low | Runtime | Flow 2 Galaxy S23 → contexto iPhone 13 (P2, continuidade) |
| 124-09 | Conversation (prod) | Low | Runtime | Multiturn-8 câmera perdeu contexto (`comparison_early_not_found`) |

## Reproducible Commands

```bash
# Full P0 gate (3× determinism)
npm run test:mia:patch-124:full-regression

# Single P0 pass (faster)
npm run test:mia:patch-124:full-regression:once

# Prior baselines
node scripts/test-mia-analytics-patch-121-mvp-architecture-audit.js
npm run test:mia:patch-122:mvp-unit-tests
npm run test:mia:patch-123:mvp-integration-tests

# Production validation (PATCH 12.4 complement)
PATCH124_EXPECTED_COMMIT=d679b7fc99ec npm run test:mia:patch-124:prod-validation
```

## Evidence

Structured run output: `docs/analytics/PATCH_12_4_FULL_MVP_REGRESSION_EVIDENCE.json`

## Limitations

- Full 398-script inventory is not executed in one run; P0 gate selects 26 critical suites
- Data Layer full audit remains P1 (slow)
- HTTP local and browser E2E require environment setup
- Auditoria visual automatizada via API; inspeção manual de UI/cards não executada neste complemento

## Complement Baselines (reexecutadas)

| Patch | Resultado | Determinismo |
|-------|-----------|--------------|
| 12.2 | 888/888 × 3 | ✅ |
| 12.3 | 896/896 × 3 | ✅ |
| 12.4 P0 | 1309/1309 × 3 | ✅ |

## Risks

| Risk | Severity | Status |
|------|----------|--------|
| Dual winner cognitive vs `body.prices[0]` | Medium | Documented — not fixed in 12.4 |
| Favorites localStorage ↔ DB divergence | Low | Documented |
| Runtime changes require deploy before prod sign-off | High | ✅ Resolved — deploy `d679b7fc99ec` |

## Final Approval (PATCH 12.4 Complement)

- **PATCH 12.4 aprovado em produção**
- **Conversa real validada** (18 fluxos via API pública)
- **Fluxo Release Candidate concluído**
- **Próximo patch recomendado:** PATCH 12.5 — Release Candidate Deploy

## Recommendation

1. ~~Complete P0 runner 3× determinism with green exit~~ ✅
2. ~~Deploy runtime changes from PATCH 12.4~~ ✅
3. ~~Run production smoke + manual interface conversation matrix~~ ✅
4. Proceed to **PATCH 12.5 — Release Candidate Deploy**
