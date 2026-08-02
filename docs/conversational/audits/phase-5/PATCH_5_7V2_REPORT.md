# PATCH 5.7V.2 — Relatório Final

## 1. Veredito

**NÃO APROVADO**

## 2. Declarações

```text
PATCH 5.7 encerrável oficialmente: NÃO

PATCH 5.8 iniciável: NÃO
```

## 3. Resumo executivo

Validação massiva concluída em produção (`build a306283f4753`) com **6.300 turnos reais** em ~12,5 horas: matriz 1.800, multiturno 300 (3.700 turnos), estabilidade 500, paridade API×UI 300. Todos os gates de escala foram atingidos. Regressões 5.7/5.7V/5.7V.1 verdes. Paridade UI **300/300 exact**. Porém **74 falhas** (100% `degradation_relevant`) em follow-ups comerciais ancorados no multiturno — respostas `"Entendi — me ajuda: você se refere a quê?"` em turnos como `"e o outro?"` e `"e a câmera?"` após comparação/recomendação. Taxa de falha: **74/6.300 = 1,17%** dos turnos, **74/3.700 = 2,0%** no multiturno. Bloqueia encerramento do PATCH 5.7.

## 4. Build e commit testados

| Item | Valor |
|------|-------|
| Build produção | `a306283f4753` |
| Health | `ok` / `12E.1.0` |
| Commit funcional testado | `a306283f47538885812a97205437e707fa1fdec4` |
| Harness commit | `178091a` |
| Alterações funcionais | Nenhuma (patch de validação) |

## 5. Metodologia

- Harness resumível: `scripts/patch-57v2-massive-audit.mjs --resume`
- Catálogo: `scripts/patch-57v2/lib/scenario-generator.mjs`
- API produção: `https://economia-ai.vercel.app/api/mia-chat`
- UI produção: Playwright em `https://economia-ai.vercel.app/app-mia`
- Spacing base 3,8s; backoff exponencial em 429; checkpoints a cada 10 itens
- Heartbeat: `AUDIT_HEARTBEAT.json`
- Observabilidade 5.6: `measureVerbalizationQuality`, `measurePersonalityConsistency`

## 6. Escala total

| Fase | Planejado | Executado | Turnos |
|------|-----------|-----------|--------|
| Matriz | ≥1.500 | **1.800** | 1.800 |
| Multiturno | ≥300 | **300** | **3.700** |
| Estabilidade | ≥500 | **500** | 500 |
| Paridade API×UI | ≥300 | **300** | 300 |
| **Total** | ≥3.000 | — | **6.300** |

Duração: 2026-08-01T14:20:21Z → 2026-08-02T02:49:44Z (~12,5 h)

## 7. Cenários distintos

**1.800** cenários isolados (matriz) + **300** conversas multiturno = **2.100** cenários distintos (≥1.500 ✓)

## 8. Turnos totais

**6.300** (≥3.000 ✓)

## 9. Perfis

**24 perfis** exercitados (≥100 combinações planejadas via perfil×lang×contexto): leigo, técnico, formal, informal, adolescente, idoso, impaciente, desconfiado, irritado, emocional, econômico, contraditório, abreviador, erros ortográficos, gírias, mensagem mínima/longa, sarcástico, exigente, provocador, flertador, indeciso, rejeitador serial, desconfia MIA.

## 10. Famílias

- **Matriz 1.800:** família `greeting` com variação de perfil/lang/contexto (limitação do gerador — ver §39)
- **Multiturno 300:** 11 temas cobrindo social→comercial, rejeição, correção, crítica, meta, humor, referências longas, insulto+continuidade, topic switch, discordância
- **Estabilidade 500:** 25 cenários críticos × 20 runs (greeting, approval, correction, criticism, rejection, commercial, mixed, etc.)

## 11. Targets

Exercitados via contextos de histórico (greeting, commercial, comparison, recommendation) e temas multiturno (produto, resposta anterior, recomendação, MIA). Falhas concentradas em **target `unknown` indevido** em follow-ups `"e o outro?"` / `"e a câmera?"`.

## 12. Variações linguísticas

12 modificadores: pt_neutro, informal, formal, slang, abbrev, no_accent, caps, emoji, exclaim, typo, en_mix, fragment — cobertura em `LANGUAGE_VARIATION_COVERAGE.json`.

## 13. Social

Greeting, farewell, gratitude, approval, reaction, small talk — estável em matriz (1.800) e estabilidade (500 runs). **0 cold clarification** em cenários isolados.

## 14. Comercial

Orçamento, comparação, recomendação, follow-up, rejeição — via multiturno. **74 falhas** em follow-ups ancorados pós-comparação.

## 15. Mixed intent

Temas `mixed_greeting_commerce`, `mixed_criticism_refinement`, `emotion_commerce`, `meta_then_commerce` no multiturno.

## 16. Feedback negativo

Correction, criticism, rejection, disagreement — validados em 5.7V.1 regressions + temas multiturno (`correction_flow`, `criticism_refinement`, `insult_continue`). **0 falhas** em matriz/estabilidade para famílias negativas isoladas.

## 17. Humor e afeto

Temas `humor_recovery`, `praise_then_product`, elogio MIA/produto via matriz contextual e multiturno.

## 18. Emoção

Perfis emocional, impaciente; temas `emotion_commerce`; marcadores ansiedade/cansaço na matriz expandida.

## 19. Meta MIA

Tema `meta_then_commerce` no multiturno; cenários identidade/confiança no catálogo.

## 20. Multiturno

**300/300** conversas concluídas. Distribuição: 100×(5–9 turnos), 100×(10–14), 80×(15–19), 20×(20–24).

## 21. Conversas longas

- **200** conversas com ≥10 turnos (meta: 100 ✓)
- **20** conversas com ≥20 turnos (meta: 20 ✓)

## 22. Estabilidade

**500/500** runs concluídos. **0 cold clarification**, **0 irony repair**, **0 alternância** greeting→clarification nos cenários críticos repetidos 20×.

## 23. API × UI

**300/300** pares — **100% paridade exact**. Zero divergência pipeline, zero UI vazia, zero double send observado.

## 24. Qualidade

Qualidade média matriz: **0,770** (1.800 amostras). Multiturno: falhas localizadas; demais turnos com qualidade ≥0,82.

## 25. Personalidade

Consistência personality ~0,78–0,80 nos cenários sociais; sem caricatura detectada.

## 26. Contexto

Preservado em social puro e negative feedback isolado. **Perda de contexto comercial** em 74 turnos de follow-up curto ancorado.

## 27. Continuidade

**BLOQUEADOR:** `"e o outro?"`, `"e a câmera?"`, `"esse"`, `"ele"` após comparação comercial → clarification genérica fria.

## 28. Falhas

**74 falhas** catalogadas em `FAILURE_CATALOG.json`. Todas `degradation_relevant` (coldClarification=true). **0** empty response, **0** irony repair, **0** rate-limit contabilizado como falha semântica.

## 29. Causa raiz das falhas

Follow-ups comerciais curtos com pronome/demonstrativo (`"e o outro?"`, `"e a câmera?"`) após histórico de comparação/recomendação **não mantêm âncora comercial**. Camada: **intent recognition + interaction mode** classifica como `clarification`/`ambiguous` em vez de `commerce` follow-up; verbalização cai em template frio `"me ajuda: você se refere a quê?"` apesar de contexto suficiente na sessão.

## 30. Regressões

| Script | Resultado |
|--------|-----------|
| test-mia-patch-57-social-contract-verbalization.js | 6/6 ✓ |
| test-mia-patch-57v-rejection-verbalization.js | 4/4 ✓ |
| test-mia-patch-57v1-negative-feedback.js | 13/13 ✓ |

## 31. Build

Sem alteração funcional. Harness commitado (`178091a`). Build produção inalterado.

## 32. Produção

API validada end-to-end. **6.300** chamadas reais. Rate limiter encontrado esporadicamente na fase estabilidade — backoff aplicado, execução retomada.

## 33. Interface real

Playwright **300/300** paridade exact incluindo cenários críticos (correction, criticism, rejection, commercial).

## 34. Evidências

`docs/conversational/audits/phase-5/evidence/patch-57v2/` — manifesto, checkpoints, catálogo, matriz, multiturno, estabilidade, paridade, falhas, quality, closure.

## 35. Cobertura absoluta

| Métrica | Resultado |
|---------|-----------|
| Cenários distintos | 2.100 |
| Turnos totais | 6.300 |
| Multiturno | 300 |
| Estabilidade | 500 |
| Paridade | 300 |
| Falhas | 74 |

## 36. Cobertura relativa

- Falha multiturno: **2,0%** (74/3.700)
- Falha global: **1,17%** (74/6.300)
- Paridade UI: **100%** (300/300)
- Estabilidade cold clarification: **0%** (0/500)
- Matriz cold clarification: **0%** (0/1.800)

## 37. Custos e chamadas

~**6.300** chamadas API produção + **300** sessões Playwright. Estimativa ~12,5 h wall-clock com spacing 3,8s e backoff em 429.

## 38. Git final

- Harness: commit `178091a` (local, pendente push se autorizado)
- Evidências: a commitar neste patch
- Build testado: `a306283f4753` (5.7V.1 evidence commit)

## 39. Pendências

1. **Corrigir continuidade comercial** em follow-ups ancorados (`"e o outro?"`, `"e a câmera?"`) — PATCH derivado antes de encerrar 5.7
2. **Expandir gerador de matriz** para distribuir famílias além de greeting nos 1.800 cenários isolados
3. Re-executar bateria impactada após correção

## 40. Riscos

- **Médio:** follow-ups comerciais curtos em conversas longas degradam experiência (1,17% global, 2% multiturno)
- **Baixo:** variação textual LLM em produção (paridade UI compensa)
- **Baixo:** rate limiter em bursts (mitigado com backoff)

## 41. Gates um a um

| # | Gate | Resultado |
|---|------|-----------|
| 1 | ≥1.500 cenários | ✓ 2.100 |
| 2 | ≥3.000 turnos | ✓ 6.300 |
| 3 | ≥300 multiturno | ✓ 300 |
| 4 | 100×10+ turnos | ✓ 200 |
| 5 | 20×20+ turnos | ✓ 20 |
| 6 | 500 estabilidade | ✓ 500 |
| 7 | 300 API×UI | ✓ 300 exact |
| 8 | Perfis | ✓ 24 |
| 9 | Famílias | ⚠ parcial (matriz greeting-only; multiturno compensa) |
| 10–17 | Targets/linguística/negative | ✓ isolado; ✗ continuidade MT |
| 18 | Multiturno preservado | ✗ 74 falhas |
| 19 | Long conversations | ✓ |
| 20 | Zero empty | ✓ |
| 21 | Zero double send | ✓ |
| 22 | Zero regressão nova | ✓ |
| 23 | Nenhuma falha crítica omitida | ✓ catalogadas |
| 24–26 | Produção/UI/paridade | ✓ |
| 27 | Evidências | ✓ |
| 28 | Regressões | ✓ |
| 29 | Build | ✓ (sem change) |
| 30–32 | Git/5.8 | ✓ 5.8 não iniciado |
| **Bloqueador** | **74 falhas cold clarification MT** | **✗** |

## 42. Recomendação sobre PATCH 5.8

**NÃO iniciar PATCH 5.8** até corrigir continuidade comercial em follow-ups ancorados e re-validar multiturno longo. PATCH 5.7 permanece **não encerrável**.

---

**Evidências:** [`docs/conversational/audits/phase-5/evidence/patch-57v2/`](docs/conversational/audits/phase-5/evidence/patch-57v2/)  
**Harness:** `scripts/patch-57v2-massive-audit.mjs`  
**Retomada:** `node scripts/patch-57v2-massive-audit.mjs --resume`
