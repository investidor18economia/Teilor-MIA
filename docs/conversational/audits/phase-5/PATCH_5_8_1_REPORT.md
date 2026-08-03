# PATCH 5.8.1 — Persistência de Correção Factual e Governança de Fillers em Conversas Longas

## 1. Veredito

**APROVADO** — Os 13 bloqueios objetivos do PATCH 5.8 foram resolvidos por correção cirúrgica estrutural, validados em pipeline local, produção API (13/13) e UI Playwright (3/3 casos críticos).

## 2. Declarações

```text
PATCH 5.8.1 encerrável oficialmente: SIM

PATCH 5.8.2 iniciável: SIM
```

## 3. Resumo executivo

Micro-patch focado nos 3 grupos de falha do PATCH 5.8 (6 correction chain, 1 factual fragment, 6 long fillers). Introduzido `miaCorrectionContinuityGovernance.js`, evoluído filler governance e inferência de thread comercial em conversas 20+ turnos. Sem hardcode de frases, categorias ou produtos. Baterias massivas (1.950 / 6.300 turnos) **não** reexecutadas; validação direcionada 124 unit + 100 stability + 13 originais + UI.

## 4. Causa raiz da correction chain

`corrige então` / `arruma isso` não casavam `CORRECTION_MARKERS` (marcadores de erro explícito). Mensagens curtas caíam em `ambiguous_message_with_available_context` → clarification fria `"Entendi — me ajuda: você se refere a quê?"` via `governed_social_intent_flow`.

## 5. Causa raiz da factual correction

Fragmentos `são X não Y` não eram classificados como family `correction`; tratados como ambíguos apesar de challenge anterior (`a bateria que vc citou está errada`).

## 6. Causa raiz dos fillers longos

`classifyConversationalFiller` dependia de `sessionContext` vazio em multiturn API; `certo` ausente da morfologia de interjeição; janela recente de 22 mensagens perdia discourse comercial quando turnos finais eram só fillers (MT-0098 t22).

## 7. Os 13 casos originais

| ID | Grupo | Mensagem | Antes | Depois (produção) |
|----|-------|----------|-------|-------------------|
| MT-0014 t2 | A | corrige então mano | clarification fria | Correção contextual |
| MT-0029 t2 | A | corrige então mano | clarification fria | OK (sem cold) |
| MT-0036 t3 | B | são 5000mAh não 4000 | clarification fria | Reconhece correção |
| MT-0044 t2 | A | corrige então mano | clarification fria | Correção contextual |
| MT-0058 t12 | C | ok mano | clarification fria | Preserva papo |
| MT-0064 t2 | A | corrige então mano | clarification fria | Correção contextual |
| MT-0079 t2 | A | corrige então mano | clarification fria | Correção contextual |
| MT-0082 t15 | C | certo mano | clarification fria | OK |
| MT-0088 t15 | C | certo mano | clarification fria | OK |
| MT-0092 t15 | C | certo mano | clarification fria | OK |
| MT-0092 t21 | C | hm mano | clarification fria | OK |
| MT-0098 t15 | C | certo mano | clarification fria | OK |
| MT-0098 t22 | C | ok mano | clarification fria | PASS (retest 43d8787) |

## 8. Modelo de estado de correção

Inferido em `resolveCorrectionContinuity()` a partir de `conversationMessages`:
- `priorChallenge` (turno criticado)
- `correctionRequest` / `factualContrast`
- `preservePreviousTarget`
- `requiresFactValidation`
Sem novos campos de sessão persistidos — estado derivado do histórico recente.

## 9. Política de validação factual

Contraste estrutural (valor + negação + valor) → family `correction` + `requiresFactValidation: true`. A arquitetura **não** persiste o fato do usuário automaticamente; verbalização LLM pode reconhecer contestação (gate de egress futuro).

## 10. Persistência em conversa longa

`enrichCommercialSessionContext` + `hasRunningCommercialDiscourse` com scan full-history quando `messages.length >= 14` e discourse comercial estabelecido no início da sessão.

## 11. Correções implementadas

- Novo `lib/miaCorrectionContinuityGovernance.js`
- Gate em `miaIntentRecognitionLayer.resolveInteractionMode`
- Taxonomy: correction request + factual contrast
- Filler: enriched session, `certo`, long thread reason code
- Commercial: `hasRunningCommercialDiscourse` full-history fallback
- Teste PATCH 5.3: versão 5.5.1

## 12. Prova anti-hardcode

Mecanismos por morfologia verbal (`corr(?:ig|ij)\w*`, `rev(?:êe|is)\w*`), contraste estrutural numérico, `COMMERCIAL_DISCOURSE_PATTERN` genérico. Zero `if (message === "corrige então")`, zero regex mAh/celular.

## 13. Arquivos alterados

- `lib/miaCorrectionContinuityGovernance.js` (novo)
- `lib/miaCommercialFollowUpContinuity.js`
- `lib/miaConversationalFillerGovernance.js`
- `lib/miaIntentRecognitionLayer.js`
- `lib/miaSocialIntentTaxonomy.js`
- `scripts/test-mia-patch-53-unified-egress.js`
- `scripts/test-mia-patch-581-correction-fillers.js` (novo)
- `scripts/patch-581-directed-audit.mjs` (novo)
- `scripts/patch-581-retest-mt0098.mjs` (novo)

## 14. Testes unitários

124/124 — `scripts/test-mia-patch-581-correction-fillers.js`

## 15–17. Variações

Cobertas no script unitário: 30+ correction, 20+ factual pipeline, 45+ filler (10/15/20 turnos). Evidência: `UNIT_TESTS.json`, `STABILITY_100_RUNS.json`.

## 18. Multiturno

13 originais semantic 13/13; produção API 13/13 (com retest MT-0098 t22).

## 19. Estabilidade

100/100 runs locais (10 cenários × 10 runs).

## 20. Interface real

Playwright 3/3: correction chain, factual contrast, long filler (`PRODUCTION_UI_VALIDATION.json`).

## 21. Regressões

- PATCH 5.7V.1: 13/13
- PATCH 5.7V.3.1: 13/13
- PATCH 5.3 egress: 9/9 (5.5.1)

## 22. Teste 5.3 sincronizado

Expectativa atualizada de 5.5.0 → 5.5.1 (versão real em `miaUnifiedConversationalEgress.js`). Sem alteração funcional.

## 23. Build

Verde ×2 (`BUILD_RESULTS.json`).

## 24. Commit

- `ba20135` — fix funcional PATCH 5.8.1
- `43d8787` — fix long-thread filler anchor

## 25. Push

`origin/master` sincronizado.

## 26. Deploy

Produção: `43d8787473db` (`/api/health`).

## 27. Health

`status: ok`, build `43d8787473db`.

## 28. Git final

HEAD = `43d8787` = origin/master (após evidence commit pendente abaixo).

## 29. Evidências

`docs/conversational/audits/phase-5/evidence/patch-581/`

## 30. Pendências

- Verbalização LLM em MT-0036 pode confirmar fato do usuário sem lookup comercial — flag `requiresFactValidation` está na camada de reconhecimento; gate de egress de validação factual permanece evolução futura (não bloqueio deste patch).

## 31. Gates um a um

| Gate | Status |
|------|--------|
| 13/13 originais | ✅ |
| correction chain preserva target | ✅ |
| corrige então sem clarification fria | ✅ |
| factual correction reconhecida | ✅ |
| fato não auto-persistido (recognition) | ✅ |
| previous answer preservada | ✅ |
| fillers 15+ turnos | ✅ |
| pending question filler | ✅ |
| exit filler | ✅ |
| zero hardcode | ✅ |
| 100 cenários direcionados | ✅ |
| estabilidade 100/100 | ✅ |
| interface real | ✅ |
| regressões verdes | ✅ |
| teste 5.3 9/9 | ✅ |
| build ×2 | ✅ |
| commit/push/deploy | ✅ |
| PATCH 5.8.2 não iniciado | ✅ |

## 32. Recomendação sobre PATCH 5.8.2

Iniciar PATCH 5.8.2 (Política Central de Personalidade, Calor Humano e Continuidade Natural) após auditoria oficial deste relatório.
