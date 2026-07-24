# MVP Production Validation — PATCH 12.6

**Patch:** 12.6 — Validação em Produção  
**Fase:** 12 — MVP Release Candidate  
**Status:** 🟡 **AGUARDANDO VALIDAÇÃO MANUAL** (automação produção: 64/72 checks, 0 P0/P1)  
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

| Grupo | Cobertura |
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

## Manual Checklist {#manual-checklist}

**Obrigatório para aprovação final do PATCH 12.6.** O runner automatiza API/HTML probe; estes itens exigem navegador real.

### Desktop (`/app-mia`)

- [ ] Página carrega sem erro visual
- [ ] Campo de pergunta visível e funcional
- [ ] Envio dispara loading e retorna resposta
- [ ] Cards comerciais (quando existirem) renderizam preço/loja/link/imagem
- [ ] Runner-up visível quando aplicável
- [ ] Scroll funciona sem quebra de layout
- [ ] Links externos abrem corretamente
- [ ] Console DevTools: sem erros JS críticos
- [ ] Network: sem 5xx inesperados durante conversa normal

### Mobile (viewport ~390px)

- [ ] Sem overflow horizontal
- [ ] Campo de texto e teclado utilizáveis
- [ ] Botões e cards legíveis
- [ ] Loaders visíveis
- [ ] Scroll natural

### Conversação manual (amostra)

- [ ] Saudação → resposta social
- [ ] Pergunta comercial → resposta coerente
- [ ] Comparação → vencedor claro
- [ ] Contestação → resposta argumentativa (não só social genérica)

**Registro:** marcar data, build (`/api/health`), observações.

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
