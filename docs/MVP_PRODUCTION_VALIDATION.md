# MVP Production Validation — PATCH 12.6

**Patch:** 12.6 — Validação em Produção  
**Fase:** 12 — MVP Release Candidate  
**Status:** 🟡 **AGUARDANDO APENAS VALIDAÇÃO MANUAL RESIDUAL** (API: 64/72 · Browser: 196/196 · 0 P0/P1)  
**RC validado:** MVP RC1 · `v1.0.0-rc1`  
**Commit RC (runtime):** `d6cccb9b143b45a7b1060edf8db241849281df27`  
**Build produção (live):** `33464830ad8a` (docs-only delta pós-tag — runtime inalterado)  
**URL:** https://economia-ai.vercel.app  
**Feature freeze:** ✅ ativo

---

## Objetivo

Validar o Release Candidate em produção de forma aprofundada e rastreável — infraestrutura, APIs, conversação, Data Layer, Commercial Runtime, analytics, métricas, favoritos, alertas, segurança, estabilidade e desempenho percebido (via latência HTTP).

---

## Ambiente

| Campo | Valor |
|-------|-------|
| Plataforma | Vercel |
| Domínio | `economia-ai.vercel.app` |
| HTTPS | ✅ |
| Supabase (ready) | ✅ configurado |
| RC tag | `v1.0.0-rc1` → commit `d6cccb9` |
| Divergência runtime pós-RC | Nenhuma (`git diff d6cccb9..HEAD` = docs only) |

---

## Runner de Produção

```bash
PATCH126_RC_COMMIT=d6cccb9 npm run test:mia:patch-126:production-validation
```

**Script:** `scripts/test-mia-patch-126-production-validation-runner.mjs`

Características:
- Aponta exclusivamente para produção
- Timeout 90s por request
- Retry em 429 (rate limit)
- Delay 4.5s entre turnos + 6s entre grupos conversacionais
- 3 passes health/ready (estabilidade)
- Evidência: `docs/analytics/PATCH_12_6_PRODUCTION_VALIDATION_EVIDENCE.json`

---

## Resultados Automatizados (2026-07-24)

| Métrica | Resultado |
|---------|-----------|
| Checks | 64/72 pass, 3 fail (P2), 5 skip (manual) |
| Conversation flows | 57 |
| 10 turnos | 10/10 |
| 15 turnos | 15/15 |
| Analytics eventos | 6/6 |
| Health/Ready ×3 | estável |
| Latência p95 | ~6079ms |
| P0/P1 | 0 |
| Duração runner | ~537s |

**Falhas P2 revalidadas:** priority social fallback (P2-126-001), Moto G84 catálogo, x-powered-by Next.js.

---

## Validação automatizada de navegador (PATCH 12.6 complemento)

```bash
npm run test:mia:patch-126:browser-validation
```

**Script:** `scripts/test-mia-patch-126-browser-validation.mjs`  
**Ferramenta:** Playwright 1.61.1 (Chromium headless)  
**URL:** https://economia-ai.vercel.app/app-mia  
**Execuções:** 3 × ~5 min (~866s total)

| Métrica | Resultado |
|---------|-----------|
| Checks browser | **196/196** |
| Viewports | 6 (3 desktop + 3 mobile) |
| Fluxos UI | 6 + conversa 10 turnos (primary viewports) |
| P0/P1/P2 browser | 0 / 0 / 0 |
| Console errors relevantes | 0 |
| Network failures | 1 (`/api/mia-cognitive-loading` ERR_ABORTED — não bloqueante) |
| Screenshots | 16 em `docs/evidence/patch-12-6/browser/` |

### Viewports

| ID | Tamanho | Escopo |
|----|---------|--------|
| desktop-1366 | 1366×768 | smoke |
| desktop-1440 | 1440×900 | **full** (6 fluxos + 10 turnos) |
| desktop-1920 | 1920×1080 | smoke |
| mobile-360 | 360×800 | smoke |
| mobile-390 | 390×844 | **full** |
| mobile-412 | 412×915 | smoke |

### Validado automaticamente

- Carregamento, input, botão envio, loading, resposta, cards, scroll, overflow horizontal
- Conversação UI: saudação, genérica, produto, comparação, mista, 10 turnos
- Console limpo (sem TypeError/hydration/React errors)
- Network sem 5xx em `/api/mia-chat`
- A11y básica (nome acessível send/input — P2)

### Não executado

- Lighthouse / axe (opcional P2)
- Puppeteer (Playwright preferido)

**Relatório:** `docs/evidence/patch-12-6/browser/browser-validation-report.json`

---

## Matriz API (automática)
|-------|-----------|
| RC confirmation | health, build lineage, runtime delta |
| Environment | HTTPS, headers, app-mia, cockpit noindex |
| Health/Ready ×3 | estabilidade |
| HTTP contracts | métodos, auth, payloads inválidos, XSS básico |
| Analytics | 6 eventos allowlist |
| Conversação | 16 grupos + 10 turnos + 15 turnos |
| Data Layer | amostras Samsung/Apple/Motorola + baseline local P0 |
| Commercial | resposta comercial |
| Favoritos/Alertas | paths não autenticados seguros |
| Executive Metrics/Insights | 200 / 401 |

---

## Data Layer

- **Produção:** amostras via `/api/mia-chat` (marcas variadas)
- **Baseline local:** `test-mia-patch-122-data-layer-p0-smoke.js` — 7/7 (frozen PATCH 12.4 P0)
- **Full audit:** congelado na baseline 12.4 — não reexecutado neste patch (sem ambiente prod direto)

---

## Baselines Congeladas (referência)

| Patch | Casos |
|-------|-------|
| 12.1 | 112/112 |
| 12.2 | 888/888 × 3 |
| 12.3 | 896/896 × 3 |
| 12.4 | 1309/1309 × 3 |

---

## Manual Checklist Residual {#manual-checklist-residual}

Itens **não** validáveis automaticamente. O browser runner já aprovou layout, envio, loading, cards, scroll, console e network.

- [ ] **Fluidez subjetiva** — sensação de velocidade/responsividade em uso real
- [ ] **Teclado virtual real** — comportamento em dispositivo físico (iOS/Android)
- [ ] **Toque e gestos** — alvos de toque percebidos em hardware real
- [ ] **Links externos** — experiência ao abrir oferta/affiliate em nova aba
- [ ] **Julgamento humano** — continuidade conversacional e qualidade copy
- [ ] **Inspeção visual final** — polish estético subjetivo pós-RC

**Registro:** data, build (`/api/health`), observações breves.

---

## Manual Checklist (legado — substituído pelo residual) {#manual-checklist}

> A maior parte desta seção foi **automatizada** pelo browser runner (196/196). Use apenas `#manual-checklist-residual` acima.

### Desktop (`/app-mia`)

- [x] ~~Página carrega~~ (automático)
- [x] ~~Campo de pergunta visível~~ (automático)
- [x] ~~Envio/loading/resposta~~ (automático)
- [x] ~~Cards comerciais~~ (automático quando presentes)
- [ ] Runner-up visível quando aplicável (inspeção humana)
- [x] ~~Scroll/overflow~~ (automático)
- [ ] Links externos abrem corretamente (residual)
- [x] ~~Console sem erros críticos~~ (automático)
- [x] ~~Network sem 5xx~~ (automático)

### Mobile (viewport ~390px)

- [x] ~~Sem overflow horizontal~~ (automático 360/390/412)
- [ ] Teclado virtual real (residual)
- [x] ~~Cards legíveis~~ (automático mobile-390)
- [x] ~~Loaders~~ (automático)
- [x] ~~Scroll~~ (automático)

### Conversação manual (amostra)

- [x] ~~Saudação~~ (automático)
- [x] ~~Pergunta comercial~~ (automático)
- [x] ~~Comparação~~ (automático)
- [ ] Contestação argumentativa (julgmento humano — API P2-126-001)

---

## Rollback (referência)

Procedimento documentado em `docs/MVP_RELEASE_CANDIDATE.md`. Não executado neste patch.

---

## Riscos Conhecidos Reavaliados

| ID | Resultado PATCH 12.6 |
|----|----------------------|
| P2-124-007 | Contest → resposta social genérica (revalidar manualmente) |
| P2-124-008 | Galaxy S23 / iPhone 13 drift (runner automático) |
| P2-124-009 | Multiturn câmera perde contexto (runner 15-turn) |
| RC-02 | Favoritos CRUD completo requer auth — unauth paths seguros (401) |
| RC-03 | Analytics WIP untracked local — fora do RC |

---

## Limitações

- Logs Vercel runtime não acessíveis pelo runner — inferência via HTTP apenas
- Interface visual/console/network dependem de checklist manual
- Rate limit de produção ativo — runner usa delays e retry (comportamento esperado de segurança)
- Favoritos/alertas CRUD completo não testado sem sessão autenticada

---

## Evidência

`docs/analytics/PATCH_12_6_PRODUCTION_VALIDATION_EVIDENCE.json`

---

## Próximo Patch

**PATCH 12.7 — Validação com Usuários Reais** (após aprovação formal do 12.6)
