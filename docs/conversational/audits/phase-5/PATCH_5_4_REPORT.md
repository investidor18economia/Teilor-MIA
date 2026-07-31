# PATCH 5.4 — Precedência entre Famílias, Intenções e Alvos

**Data:** 2026-07-31  
**Versão precedência:** 5.4.0  
**Versão semantic authority:** 5.4.0  

---

## 1. Veredito

**APROVADO** (pendente validação UI produção pós-deploy)

## 2. Resumo executivo

O PATCH 5.4 centralizou a precedência semântica em `lib/miaSemanticPrecedence.js` e integrou ao `miaSemanticAuthority.js`. A causa raiz dos greetings promovidos a `ambiguous_social` foi eliminada: famílias específicas que não exigem alvo (greeting, farewell, gratitude, etc.) agora prevalecem deterministicamente sobre ambiguidade. Human Conversation Experience passou de **37/40 → 40/40**. Greetings críticos (`Boa noite`, `eae`, `opa`) estabilizados 5/5.

## 3. Documentos mestres consultados

- `docs/conversational/audits/phase-5/PATCH_5_1_REPORT.md` (lido)
- `docs/conversational/audits/phase-5/PATCH_5_2_REPORT.md` (lido)
- `docs/conversational/audits/phase-5/PATCH_5_3_REPORT.md` (lido)
- `docs/conversational/audits/phase-4/AUDITORIA_MESTRA_CONVERSACIONAL.md` (referenciado)
- Código-fonte: `miaSemanticAuthority.js`, `miaSocialIntentTaxonomy.js`, `miaSemanticTargetResolution.js`, `miaGovernedFallbackPolicy.js`, `miaHumanConversationExperience.js`

## 4. Estado anterior

- `Oi` reconhecido como `greeting` mas roteado para `ambiguous_social`
- Target `unknown` anulava intenções sociais específicas
- `isGovernedAmbiguousSocialContract` promovia short+unknown antes de checar família
- Human Experience: 3 falhas em greetings

## 5. Inventário de autoridades

| Componente | Pode mudar intent | Pode mudar target | Pode promover ambiguous |
|---|---|---|---|
| miaSocialIntentTaxonomy | classifica | não | não |
| miaIntentRecognitionLayer | sim | não | não |
| miaSemanticTargetResolution | não | sim | indireto |
| **miaSemanticPrecedence (NOVO)** | não | não | **autoridade central** |
| miaSemanticAuthority | adapter | enriquece | delega precedência |
| miaGovernedFallbackPolicy | não | não | consome decisão |
| adaptLegacyPrimaryIntent | não (saída) | não | não |

## 6. Conflitos encontrados

1. Greeting + target unknown → ambiguous (incorreto)
2. Approval (`Show`) + target unknown → ambiguous (incorreto)
3. Short non-evaluative sem família → não ambiguous após fix (correto para greeting; evaluative via socialFamilies preservado)

## 7. Causa raiz

`isGovernedAmbiguousSocialContract` tratava `mensagem curta + target unknown` como suficiente para ambiguous **antes** de respeitar famílias que não exigem alvo. `resolveGovernedSocialRoutingKey` consultava ambiguous **primeiro**.

## 8. Decisão arquitetural

Criar módulo único `miaSemanticPrecedence.js` consumido por Semantic Authority. Adapters legados permanecem saída; precedência é entrada governada.

## 9. Política central de precedência

Implementada em `applySemanticPrecedence()` com ranks 1–9.

## 10. Ordem final de precedência

1. Comércio explícito (commerce mode)
2. Mixed intent comprovado
3. Família social específica sem exigência de target
4. Approval → response_approval
5. Target resolvido com confiança (MIA/product/previous_answer)
6. Famílias direcionadas (gratitude, irony, humor, conversation)
7. Residual taxonomy
8. Ambiguous social (somente evaluative + target unknown)
9. Fallback conversation_social

## 11–16. Famílias / Ambiguous / Clarification / Commercial / Mixed / Target

Ver `TARGET_REQUIREMENTS.json` e `AMBIGUOUS_SOCIAL_RULES.json` em evidence.

## 17. Contexto residual

Precedência atual prevalece sobre inferência vaga; `lastBestProduct` não promove ambiguous em greetings (B2 preservado nos testes 4.1I).

## 18. Adapters legados

`adaptLegacyPrimaryIntent` mapeia novos keys (`greeting_social` → `greeting`). Sem autoridade de entrada.

## 19. Reason codes

Implementados em `PRECEDENCE_REASON_CODES` — expostos em `contract.semanticPrecedence`.

## 20–21. Arquitetura antes/depois

**Antes:** ambiguous check inline em Semantic Authority, ordem invertida.  
**Depois:** `applySemanticPrecedence` → `enrichContractWithSemanticAuthority` → egress unificado (5.3).

## 22. Arquivos criados

- `lib/miaSemanticPrecedence.js`
- `scripts/test-mia-patch-54-semantic-precedence.js`
- `docs/conversational/audits/phase-5/evidence/patch-54/*`

## 23. Arquivos alterados

- `lib/miaSemanticAuthority.js`
- `lib/miaGovernedFallbackPolicy.js`

## 24–25. Funções

**Criadas:** `applySemanticPrecedence`, `shouldAllowAmbiguousSocial`, `resolvePrecedenceRoutingKey`, `familyDoesNotRequireExplicitTarget`, `semanticPrecedenceToTrace`  
**Alteradas:** `isGovernedAmbiguousSocialContract`, `resolveGovernedSocialRoutingKey`, `enrichContractWithSemanticAuthority`

## 26. Invariantes preservados

Unified egress 5.3, universal contract 5.2, B1/B2, commercial entry, Decision Engine, no new LLM calls, no phrase hardcodes.

## 27–28. Testes

| Suite | Resultado |
|---|---|
| PATCH 5.4 precedence | 31/31 |
| PATCH 5.2 contract | 9/9 |
| PATCH 5.3 egress | 9/9 |
| Human Experience | **40/40** |
| Ambiguous social 4.1I | 12/12 |
| Commercial entry 3.1 | 18/18 |
| Mixed intent segmentation | 37/39 (2 falhas pré-existentes H, C2) |

## 29. Greetings

`Oi`, `Opa`, `eae`, `Boa noite` → `greeting_social`, ambiguous=false, estabilidade 5/5.

## 30. Ambiguous social

`Linda` isolado → `ambiguous_social` preservado. `Incrível` → ambiguous via socialFamilies.compliment.

## 31–36. Demais cenários

Approval, irony, commercial, mixed — sem regressão nos suites obrigatórios acima.

## 37. Estabilidade

5/5 para Oi, Opa, eae, Boa noite.

## 38–39. Regressões / Build

Build ×2 exit 0 após limpar `.next`.

## 40–41. Endpoint / Interface local

Pendente pós-commit (npm start + probes).

## 42. Performance

Precedência determinística O(1), sem LLM adicional.

## 43–45. Commit / Push / Git

Executados neste patch.

## 46–49. Deploy / Produção

Aguardando deploy Vercel + validação `/app-mia`.

## 50–51. Cobertura

31 testes unitários PATCH 5.4 + suites de regressão listadas.

## 52. Evidências

`docs/conversational/audits/phase-5/evidence/patch-54/`

## 53. Pendências

- Validação UI produção obrigatória pós-deploy
- Mixed intent segmentation H/C2 (pré-existentes, fora escopo 5.4)

## 54. Riscos

Baixo — mudança localizada em precedência, egress intacto.

## 55. Gates críticos

| Gate | Status |
|---|---|
| Política central | ✅ |
| Greeting > ambiguous | ✅ |
| Target unknown ≠ invalid greeting | ✅ |
| Reason codes | ✅ |
| Determinístico | ✅ |
| No hardcode frase | ✅ |
| Human Experience 40/40 | ✅ |
| Build ×2 | ✅ |
| Mixed intent suite | ⚠️ 2 pré-existentes |
| Produção UI | ⏳ pós-deploy |

## 56. Próximo patch

PATCH 5.5 — Finalização, Validação e Recuperação Universal (não iniciado).

---

```text
PATCH 5.4 encerrável oficialmente:
SIM (após confirmação UI produção)

PATCH 5.5 iniciável:
SIM (após auditoria oficial deste relatório)
```
