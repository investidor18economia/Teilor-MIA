# BASELINE RC1

Este documento registra a **primeira baseline técnica oficial** do projeto Teilor / MIA (EconomIA).

Ele representa o estado **validado e publicado** do repositório imediatamente antes da continuidade dos novos roadmaps — em especial o Roadmap Conversacional e as validações pós-lançamento do MVP.

Esta baseline deve ser tratada como **ponto de referência histórico e comparativo** para auditorias futuras, regressões, novos roadmaps e validações de produção.

---

## 1. Identificação

| Campo | Valor |
|-------|-------|
| **Data de criação** | 2026-07-26 |
| **Branch** | `master` |
| **HEAD (curto)** | `c311a6b` |
| **Hash completo** | `c311a6b2546d80c8bbe5d7ee139764d7ec357115` |
| **Último commit** | `feat(ui): implementa Home Intro State` |
| **Tag** | `v1.0.0-rc1` |
| **Sincronização remota** | `master` = `origin/master` (0 ahead / 0 behind no momento da baseline) |

### Status do repositório

- **Código de produção (`lib/`, `pages/`, `components/`):** limpo — nenhuma alteração pendente.
- **Working tree:** contém pendências de **housekeeping** (evidências regeneradas, scripts de debug, artefatos temporários) documentadas na seção 5. Essas pendências **não alteram** o estado técnico commitado desta baseline.

---

## 2. Estado do Projeto

Registro objetivo do estado validado nesta baseline:

| Item | Status |
|------|--------|
| Build | 🟢 Verde (reproduzível após limpeza de `.next/`) |
| Testes principais | 🟢 Verdes |
| Home Intro | 🟢 Concluído (`c311a6b`) |
| PATCH 12C — API Public Hardening | 🟢 Concluído (`88b4938`) |
| Roadmap Analytics | 🟢 Tecnicamente concluído (PATCH 1.1 → 12.6) |
| Produção | 🟢 Validada (PATCH 12.6 encerrado — `0b7d2bb`) |
| `master` × `origin/master` | 🟢 Sincronizadas |

### Evidências de testes (amostra oficial)

| Suíte | Resultado |
|-------|-----------|
| `test:mia:patch-124:full-regression:once` | 1314/1314 (26/26 suites P0) |
| `test:mia:12b:perimeter` | 59/59 |
| `test:mia:12c:hardening` | 48/48 |
| `test:mia:home-intro:audit` | 7/7 |
| `test:mia:analytics:patch-75:phase7-final-audit` | 47/47 |
| `test:mia:analytics:patch-95:phase9-final-audit` | 46/46 |

---

## 3. Escopo Concluído

Resumo dos blocos entregues e publicados na `master` até esta baseline:

### Analytics

Roadmap Analytics **tecnicamente encerrado** — PATCH 1.1 até PATCH 12.6:

- Fases 1–3: identidade, contratos, schema, dashboards fundacionais
- Fases 4–6: dashboards SQL, analytics estratégico, Data Layer analytics
- Fases 7–9: reliability, commercial analytics, decision analytics
- Fases 10–11: price intelligence, savings, Teilor em Números
- Fase 12 (desenvolvimento): auditoria arquitetural, testes unitários/integração, regressão MVP, RC (`v1.0.0-rc1`), validação em produção (12.6)

Documentação mestre: [`../analytics/02_analytics_roadmap.md`](../analytics/02_analytics_roadmap.md) · [`../analytics/ANALYTICS_CHANGELOG.md`](../analytics/ANALYTICS_CHANGELOG.md)

### Conversational

Fase 3 conversacional encerrada — PATCH 3.1 até PATCH 3.7, incluindo refinamentos 3.5a/3.5b, regressão 3.6 e encerramento formal (`c770a2e`).

Documentação: [`../conversational/CONV_PHASE_3_CLOSURE.md`](../conversational/CONV_PHASE_3_CLOSURE.md)

### Branding

Identidade visual MIA/Teilor oficializada (`a2c940d`), incluindo assets e validação de template de e-mail (`ce3b23e`).

### Core Docs

Documentos mestres reorganizados em `docs/core/` (`d0f1d7f`):

- [`architecture/MIA_ARCHITECTURE.md`](architecture/MIA_ARCHITECTURE.md)
- [`rules/MIA_ENGINEERING_RULES.md`](rules/MIA_ENGINEERING_RULES.md)
- [`roadmap/MIA_ROADMAP.md`](roadmap/MIA_ROADMAP.md)
- [`operations/PROJECT_RECOVERY.md`](operations/PROJECT_RECOVERY.md)

### API Hardening

PATCH 12C — hardening de APIs públicas (`88b4938`): origem, rate limit, contratos de proxy, testes 48/48.

### Home Intro

Estado de intro da home implementado (`c311a6b`): `lib/miaHomeIntroState.js`, integração em `MIAChat.jsx`, testes audit 7/7.

### Demais blocos concluídos

- Segurança perimetral (PATCH 12B) — rate limit e proxy contract
- MVP Release Candidate — tag `v1.0.0-rc1`, evidências PATCH 12.4/12.5/12.6
- Arquitetura Bloco 12 — auditoria MVP (PATCH 12.1)

---

## 4. Baseline Técnica

Critérios técnicos satisfeitos nesta baseline:

| Critério | Evidência |
|----------|-----------|
| Nenhuma implementação de produção pendente | `git status` sem alterações em `lib/`, `pages/`, `components/` |
| Build reproduzível | `npm run build` — exit 0 (validado com limpeza prévia de `.next/`) |
| Regressões principais aprovadas | PATCH 12.4 — 1314/1314 casos P0 |
| Arquitetura consolidada | Documentos em `docs/core/`, `docs/architecture/`, contratos Analytics |
| Commits publicados | HEAD = `origin/master` |

---

## 5. Pendências Conhecidas

As pendências abaixo **não invalidam** esta baseline. Separadas por natureza:

### Housekeeping

Itens presentes no working tree local, sem impacto no código commitado:

- Limpeza do working tree (evidências regeneradas, duplicatas, scratch)
- Evidências opcionais fora do Git (ex.: `docs/evidence/home-intro/browser/`)
- Deltas documentais locais (SQL analytics, JSON de evidência regenerados)
- Links quebrados para `docs/infrastructure/` em README e docs Analytics (diretório ausente no repositório)

### Pós-lançamento

| Patch | Descrição | Motivo da pendência |
|-------|-----------|---------------------|
| **PATCH 12.7** | Validação com Usuários Reais | Depende exclusivamente de utilização real pós-lançamento público do MVP |
| **PATCH 12.8** | Go / No-Go do MVP | Depende dos resultados da validação 12.7 e decisão de lançamento |

Estes patches **não representam desenvolvimento técnico pendente**. Não há código, API, migration ou script de produção faltando no repositório para executá-los — aguardam usuários reais e decisão operacional.

Referência: [`../analytics/02_analytics_roadmap.md`](../analytics/02_analytics_roadmap.md) (Fase 12, PATCH 12.7 e 12.8).

---

## 6. Roadmaps Futuros

Continuidade prevista após esta baseline:

```txt
Roadmap Conversacional
        ↓
melhorar qualidade da MIA
        ↓
lançamento MVP
        ↓
PATCH 12.7 — Validação com Usuários Reais
        ↓
PATCH 12.8 — Go / No-Go do MVP
```

O Roadmap Conversacional inicia **sem dependência técnica** dos PATCHES 12.7/12.8, que permanecem planejados para execução após o lançamento público.

---

## 7. Objetivo desta Baseline

Esta baseline deve servir como **ponto oficial de comparação** para:

- **Regressões futuras** — detectar desvios em relação ao RC1 validado
- **Auditorias** — verificar integridade arquitetural e documental
- **Novos roadmaps** — ancorar evolução a partir de estado conhecido
- **Validações de produção** — correlacionar deploys e evidências ao hash `c311a6b`
- **Comparação de desempenho** — latência, taxas de erro e métricas operacionais pós-RC1

---

## 8. Critérios desta Baseline

Esta baseline foi considerada **válida** porque:

1. **Build verde** — compilação de produção reproduzível
2. **Testes verdes** — regressão P0 1314/1314 e suítes críticas aprovadas
3. **Commits publicados** — todo escopo descrito está na `master`
4. **`master` sincronizada** — HEAD alinhado com `origin/master`
5. **Produção validada** — PATCH 12.6 encerrado com evidência commitada
6. **Arquitetura consolidada** — documentos mestres em `docs/core/` e contratos Analytics versionados

---

## 9. Observações

- O **Roadmap Analytics** foi considerado **tecnicamente encerrado** nesta baseline (PATCH 1.1 → 12.6).
- Os **PATCHES 12.7** (Validação com Usuários Reais) e **12.8** (Go / No-Go) permanecem **planejados** para execução após o lançamento público do MVP, por dependerem exclusivamente de utilização real do sistema — não de implementação técnica pendente.
- A tag `v1.0.0-rc1` identifica o Release Candidate validado; este documento (`BASELINE_RC1.md`) registra formalmente o estado técnico de referência associado.

---

*Documento oficial — Baseline RC1 · Teilor / MIA · 2026-07-26*
