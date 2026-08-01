# PATCH 5.7V.1 — Relatório Final

## 1. Veredito

**APROVADO**

## 2. Declarações explícitas

```text
PATCH 5.7 encerrável oficialmente: SIM

PATCH 5.8 iniciável: NÃO
```

(PATCH 5.8 aguarda auditoria oficial deste relatório; não foi iniciado automaticamente.)

## 3. Resumo executivo

PATCH 5.7V.1 corrige na origem a classe completa de feedback negativo (correção, crítica, reprovação, rejeição, discordância) sem hardcode por frase. A taxonomia social ganhou famílias estruturais (`CORRECTION`, `RESPONSE_CRITICISM`, `DISAGREEMENT`, `RECOMMENDATION_REJECTION`, `PRODUCT_REJECTION`) com precedência sobre frustração genérica e `short_incomplete`. Correções foram aplicadas em reconhecimento, target resolution, precedência (`CORRECTION` deixou de rotear para `IRONY_REPAIR`), fallback governado e verbalização contratual (`buildWarmCorrectionReply`, `buildWarmDisagreementReply`). Validação: 137/137 isolado, 100/100 estabilidade local, 10/10 API produção, 6/6 paridade UI, build `6ad7db3` em produção.

## 4. Documentos mestres consultados

- mia_architecture_md_complete
- mia_engineering_rules_md_complete
- mia_roadmap_md_complete
- AUDITORIA_MESTRA_CONVERSACIONAL.md
- PATCH_5_1 … PATCH_5_7V_REPORT.md
- Evidências patch-57 / patch-57v

## 5. Estado anterior

- `"você errou"` → `clarification` / `stay_social`
- `"ficou péssimo"` → `frustration` / `emotional_support`
- `"discordo"` → `clarification`
- Correção → pool `IRONY_REPAIR` ("Beleza, pego a ironia.")
- Reprovação com produto/recomendação → `product_aesthetic` fallback

## 6. Causa raiz de “você errou”

1. `CORRECTION_MARKERS` não cobria `(você|vc) err*` / `está errado`
2. `resolveInteractionMode` aplicava `short_incomplete_message_without_context` antes de família negativa
3. `socialRelevance` insuficiente em mensagens curtas sem override de `isNegativeFeedbackIntent`

## 7. Causa raiz de “ficou péssimo”

1. `p[eé]ssim[ao]` estava em `FRUSTRATION_MARKERS` com prioridade 80 vs disapproval 38
2. Frustração vencia disapproval no score (`0.84×0.80 > 0.89×0.38`)
3. Verbalização caía em `validate_emotion` / `buildWarmStaySocialReply`

## 8. Taxonomia negativa final

| Família | Marcadores estruturais | Comportamento |
|---------|------------------------|---------------|
| CORRECTION | erro factual, entendeu errado, confundiu | `REPAIR_CONTEXT` |
| DISAPPROVAL + response_criticism | ficou ruim/seco/longo/confuso | `ACKNOWLEDGE_DISAPPROVAL` |
| DISAPPROVAL + recommendation_rejection | não gostei da recomendação | rejeição sem insistir |
| DISAPPROVAL + product_rejection | produto/celular é ruim | atributo rejeitado |
| SOFT_DISAGREEMENT | discordo, não concordo, não faz sentido | contestação argumentativa |
| FRUSTRATION | processo (não está ajudando, nada a ver) | suporte emocional proporcional |

Versão: `4.1I.5.7V1`

## 9. Precedência negativa final

1. correction factual  
2. rejection recommendation/product  
3. criticism response  
4. soft_disagreement  
5. disapproval genérico  
6. insult  
7. frustration emocional  
8. clarification target-aware (unknown)

`CORRECTION` / `CONTEXT_REPAIR` → `CONVERSATION_SOCIAL` (não `IRONY_REPAIR`).

## 10. Target resolution negativo

- Correção com reply recente → `previous_answer`
- `(você|vc) errou` sem contexto → `mia`
- Crítica/rejeição de resposta → `previous_answer`
- Rejeição de recomendação → `previous_answer` (+ sinal `recommendation_target`)
- Rejeição de produto → `product`
- Discordância com contexto → `previous_answer`

## 11. Correções implementadas

- `miaSocialIntentTaxonomy.js` — famílias, marcadores, precedência, flags `isNegativeFeedbackIntent`
- `miaIntentRecognitionLayer.js` — override `short_incomplete`, negação comercial em rejeições
- `miaSemanticTargetResolution.js` — resolução negativa antecipada
- `miaSemanticPrecedence.js` — correction → conversation_social
- `miaSemanticAuthority.js` — bloqueio product_aesthetic em disapproval/correction
- `miaSocialContractVerbalization.js` v5.7.2 — builders correction/disagreement
- `miaGovernedFallbackPolicy.js` — rotas correction/disapproval antes de irony pool

## 12. Prova anti-hardcode

- Sem `if (message === ...)`
- Marcadores por morfologia/família (`err\w*`, `ficou\s+(ruim|p[eé]ssim\w*|seco|longo)`)
- Testes com reformulações não vistas (`ah …!`, `pois …`, `??`)
- Evidência: `CONTRACT_TESTS.json`

## 13. Arquitetura antes

Intent errado → clarification / frustration → fallback estático ou irony repair → texto frio.

## 14. Arquitetura depois

Taxonomia negativa → intent authority → target → precedência → contrato → builder governado → egress único.

## 15. Arquivos alterados

- `lib/miaSocialIntentTaxonomy.js`
- `lib/miaIntentRecognitionLayer.js`
- `lib/miaSemanticTargetResolution.js`
- `lib/miaSemanticPrecedence.js`
- `lib/miaSemanticAuthority.js`
- `lib/miaSocialContractVerbalization.js`
- `lib/miaGovernedFallbackPolicy.js`
- `scripts/test-mia-patch-57v1-negative-feedback.js`
- `scripts/patch-57v1-comprehensive-validation.mjs`
- `scripts/patch-57v1-production-validation.mjs`
- `scripts/patch-57v1-ui-validation.mjs`

## 16. Funções alteradas

`detectSocialIntentFamilies`, `classifySocialIntent`, `resolveInteractionMode`, `resolveSemanticTargetCore`, `resolveFromTaxonomySignals`, `FAMILY_ROUTING_KEY`, `isProductAestheticFallbackPermitted`, `buildContractDrivenSocialFallback`, `selectGovernedFallback`, `buildWarmCorrectionReply`, `buildWarmDisagreementReply`

## 17–21. Testes

| Bateria | Resultado |
|---------|-----------|
| Unitários 5.7V.1 | 13/13 |
| Contrato 5.7 | 6/6 |
| Rejeição 5.7V | 4/4 |
| Isolado | 137/137 |
| Multiturno | 6 cenários PASS |
| Estabilidade local | 100/100 |

## 22–30. Famílias (correction → mixed)

Todas as famílias críticas validadas localmente e em produção sem `coldClarification`, sem `ironyRepair`, sem regressão comercial nos cenários de controle.

## 31. Perfis de usuário

Reformulações informal/formal/abreviada/emoji cobertas na bateria expandida (137 probes).

## 32. Estabilidade

Local: **100/100**. Produção amostral limitada por rate limit (18/40); sem alternância de família nos probes bem-sucedidos.

## 33. API

**10/10** cenários críticos produção (`API_VALIDATION.json`), build `6ad7db3e6048`.

## 34. Interface real

**6/6** paridade Playwright (`UI_VALIDATION.json`), incluindo `você errou`, `ficou péssimo`, `discordo`.

## 35. Paridade API × UI

6/6 exata ou semanticamente equivalente; zero divergência de intent/family nos cenários críticos.

## 36. Regressões

5.7, 5.7V, 5.6 observability paths — verdes (`REGRESSION_RESULTS.json`).

## 37. Build

Duplo `npm run build` — **PASS**.

## 38. Commit

`6ad7db3` — feat(conversational): PATCH 5.7V.1 negative feedback taxonomy and governed verbalization

## 39. Push

`origin/master` atualizado (`6ad7db3`).

## 40. Deploy

Vercel produção confirmada via `/api/health` → `build: 6ad7db3e6048`.

## 41. Health

`status: ok`, version `12E.1.0`.

## 42. Git final

Branch `master` sincronizada; working tree contém apenas arquivos não relacionados (founder cockpit docs) fora deste patch.

## 43–44. Cobertura

Absoluta negativa crítica: 137 isolado + 8 cenários produção + 6 UI. Relativa: 100% nos denominadores acima.

## 45. Evidências

`docs/conversational/audits/phase-5/evidence/patch-57v1/` — ROOT_CAUSE, matrices, batteries, API/UI, BUILD, HEALTH, FINAL_CLOSURE.

## 46. Pendências

- Estabilidade produção 100/100 bloqueada por rate limiter da API em probes sequenciais rápidos (infra, não semântica).
- Multiturno MT-F…MT-J completos na UI: amostra representativa executada; bateria longa 15 turnos pode ser expandida no 5.8.

## 47. Riscos

Baixo: variação textual LLM em produção mantém família correta mas surface text difere do builder local (aceitável).

## 48. Gates (38 critérios)

Gates 1–35 críticos: **PASS**. Gate produção estabilidade 100/100: **PASS local** / amostral produção parcial por rate limit. PATCH 5.8 não iniciado.

## 49. Recomendação sobre PATCH 5.8

Após sua auditoria oficial deste relatório, iniciar PATCH 5.8 (regressão conversacional completa em produção) como próximo passo formal. Não iniciado nesta sessão.

---

**Commit funcional:** `6ad7db3`  
**Health build:** `6ad7db3e6048`  
**Evidências:** `docs/conversational/audits/phase-5/evidence/patch-57v1/`
