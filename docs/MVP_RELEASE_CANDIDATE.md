# MVP Release Candidate — Teilor/MIA

**Versão RC:** MVP RC1 (`v1.0.0-rc1`)  
**Fase:** 12 — MVP Release Candidate  
**Patch:** 12.5 — Deploy Release Candidate  
**Production URL:** https://economia-ai.vercel.app  
**Repositório:** https://github.com/investidor18economia/Teilor-MIA

---

## Objetivo

Gerar o primeiro **Release Candidate (RC)** oficial, reproduzível e rastreável, após aprovação completa dos patches 12.1–12.4. Este RC prepara o sistema para **PATCH 12.6 — Validação em Produção**.

---

## Feature Freeze

**Status:** ✅ **ATIVO desde PATCH 12.5**

| Regra | Status |
|-------|--------|
| Nenhuma nova funcionalidade | ✅ |
| Nenhuma mudança arquitetural | ✅ |
| Nenhuma melhoria estética sem bug | ✅ |
| Somente bugs críticos (P0/P1) com regressão | ✅ |
| Backlog separado do RC | ✅ |
| Melhorias pós-MVP adiadas | ✅ |

**Exceções permitidas:** correções críticas descobertas durante RC, cada uma com teste de regressão e revalidação de baseline afetada.

---

## Pré-RC — Patches Aprovados

| Patch | Commit | Build (prod ref) | Evidência | Status |
|-------|--------|------------------|-----------|--------|
| 12.1 Arquitetura | `bf96549` | `513ed81753fe` | `PATCH_12_1_ARCHITECTURE_AUDIT_EVIDENCE.json` | ✅ APROVADO |
| 12.2 Unitários | `0b6a912` | `0b6a912b2f4c` | `PATCH_12_2_GENERAL_UNIT_TESTS_EVIDENCE.json` | ✅ APROVADO |
| 12.3 Integração | `c36361e` | (sem runtime) | `PATCH_12_3_GENERAL_INTEGRATION_TESTS_EVIDENCE.json` | ✅ APROVADO |
| 12.4 Regressão | `d679b7f` / docs `bb02961` | `d679b7fc99ec` | `PATCH_12_4_FULL_MVP_REGRESSION_EVIDENCE.json` | ✅ APROVADO |

**Bloqueadores P0/P1 abertos:** nenhum.

---

## Versionamento RC

| Campo | Valor |
|-------|-------|
| Versão semântica | `1.0.0-rc1` |
| Nome RC | MVP RC1 |
| Tag Git | `v1.0.0-rc1` |
| Branch | `master` |
| package.json | `1.0.0-rc1` |

---

## Commit e Tag RC

| Campo | Valor |
|-------|-------|
| **Commit RC (tagged)** | `d6cccb9b143b45a7b1060edf8db241849281df27` |
| **Tag** | `v1.0.0-rc1` |
| **Branch** | `master` |
| **Deploy live** | `288d04fbf98575d7f9084c13d8e5faf79b0e4131` (docs-only delta pós-tag) |
| **Build ID (prod)** | `288d04fbf985` |
| **Data** | 2026-07-24 |

---

## Baselines Congeladas

Alteração proibida sem abrir novo patch formal.

| Baseline | Referência | Casos | Runner |
|----------|------------|-------|--------|
| Arquitetural | PATCH 12.1 | 112 checks | `test-mia-analytics-patch-121-mvp-architecture-audit.js` |
| Unitária | PATCH 12.2 | 888/888 × 3 | `npm run test:mia:patch-122:mvp-unit-tests` |
| Integração | PATCH 12.3 | 896/896 × 3 | `npm run test:mia:patch-123:mvp-integration-tests` |
| Regressão MVP | PATCH 12.4 | 1309/1309 × 3 (26 suítes) | `npm run test:mia:patch-124:full-regression` |

Documentação: `docs/MVP_FULL_REGRESSION_BASELINE.md`, `docs/MVP_UNIT_TEST_BASELINE.md`, `docs/MVP_INTEGRATION_TEST_BASELINE.md`.

---

## Checklist RC

| Área | Item | Status |
|------|------|--------|
| Arquitetura | PATCH 12.1 aprovado | ✅ |
| Build | Clean build sem erros | ✅ |
| Deploy | Vercel prod alinhado ao commit RC | ✅ |
| Produção | Smoke RC 15/15 | ✅ |
| Segurança | APIs privadas 401, hardening ativo | ✅ |
| Analytics | Allowlist + track operacional | ✅ |
| Executive Metrics | `/api/executive-metrics` 200 | ✅ |
| Insights | `/api/founder/executive-insights` 401 | ✅ |
| Commercial Runtime | Baseline 12.4 P0 inclui runtime comercial | ✅ |
| Data Layer | Baseline 12.4 P0 inclui DL smoke | ✅ |
| Conversação | Smoke MIA Chat + PATCH 12.4 conversa real | ✅ |
| Documentação | Este documento + evidência JSON | ✅ |
| Backups | GitHub remoto + migrations Supabase | ✅ |
| Git | Tag `v1.0.0-rc1` no commit RC | ✅ |
| Rollback | Procedimento documentado abaixo | ✅ |
| Observabilidade | health, ready, analytics, metrics | ✅ |

---

## Rollback

**Não executar em PATCH 12.5 — apenas validar procedimento.**

1. Identificar commit anterior estável (ex.: `bb02961` pré-RC ou tag anterior).
2. Reverter deploy Vercel para build do commit alvo (Dashboard → Deployments → Promote).
3. Confirmar `/api/health` retorna build esperado.
4. Executar `PATCH125_EXPECTED_COMMIT=<hash> npm run test:mia:patch-125:rc-smoke`.
5. Se rollback incluir runtime: reexecutar baseline afetada (12.2/12.3/12.4).

**Commit de referência pré-RC:** `bb02961` (PATCH 12.4 closure).

---

## Backups e Recuperação

| Artefato | Local | Status |
|----------|-------|--------|
| Código | GitHub `origin/master` + tag `v1.0.0-rc1` | ✅ |
| Migrations | `supabase/migrations/` (13 arquivos) | ✅ |
| Evidências | `docs/analytics/PATCH_12_*_EVIDENCE.json` | ✅ |
| Documentação RC | `docs/MVP_RELEASE_CANDIDATE.md` | ✅ |
| Baselines | `docs/MVP_*_BASELINE.md` | ✅ |

**Recuperação RC:** clone repo → checkout `v1.0.0-rc1` → `npm ci` → `npm run build` → deploy Vercel.

---

## Riscos Conhecidos (P2 — não bloqueantes)

| ID | Descrição | Severidade |
|----|-----------|------------|
| P2-124-007 | Flow contestação → resposta social genérica | P2 |
| P2-124-008 | Continuidade Galaxy S23 / iPhone 13 em sessão | P2 |
| P2-124-009 | Multiturn perde contexto em pergunta de câmera | P2 |
| RC-01 | Dual winner cognitive vs `body.prices[0]` | P2 |
| RC-02 | Favorites localStorage ↔ DB divergence | P2 |
| RC-03 | ~100 arquivos analytics untracked no working tree (WIP local) | P2 |

---

## Backlog (pós-MVP / pós-RC)

- PATCH 12.6 — Validação em Produção
- PATCH 12.7 — Validação com Usuários Reais
- PATCH 12.8 — Go / No-Go do MVP
- Melhorias conversacionais P2 (124-007/008/009)
- HTTP local E2E browser (P1)
- Data Layer full audit (P1)

---

## Comandos Reproduzíveis

```bash
# Smoke RC em produção
PATCH125_EXPECTED_COMMIT=<rc-commit> npm run test:mia:patch-125:rc-smoke

# Baselines congeladas (não alterar sem novo patch)
npm run test:mia:patch-124:full-regression
npm run test:mia:patch-122:mvp-unit-tests
npm run test:mia:patch-123:mvp-integration-tests

# Build RC local
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
```

---

## Próximos Passos

1. **PATCH 12.6 — Validação em Produção** (monitoramento estendido, métricas, logs)
2. PATCH 12.7 — Validação com Usuários Reais
3. PATCH 12.8 — Go / No-Go do MVP

---

## Evidência

Artefato estruturado: `docs/analytics/PATCH_12_5_RELEASE_CANDIDATE_EVIDENCE.json`

**Veredito:** 🟢 **PATCH 12.5 APROVADO — RELEASE CANDIDATE GERADO**
