# PATCH 5.8.1.1 — Validação Governada de Correções Factuais Antes da Verbalização

## 1. Veredito

**APROVADO** — O único bloqueio restante do PATCH 5.8.1 foi fechado: a MIA não confirma mais automaticamente fatos assertados pelo usuário sem validação.

## 2. Causa raiz comprovada

`requiresFactValidation=true` era definido em `miaCorrectionContinuityGovernance.js` e anexado a `modeResolution.correctionContinuity`, mas:

1. **Não era exportado** no objeto final de `recognizeMiaIntent()` — perdido antes do contrato.
2. **`buildSocialConversationBehaviorContract`** nunca recebia estado de validação factual.
3. **`runGovernedSocialIntentFlow`** (`pages/api/chat-gpt4o.js`) chamava o LLM livremente com `socialVerbalizationOnly: true`.
4. **`finalizeHumanConversationReply`** não auditava confirmação automática de claims.

**Call stack da falha:** `recognizeMiaIntent` → `buildSocialConversationBehaviorContract` → `runGovernedSocialIntentFlow` → LLM → `finalizeHumanConversationReply` → egress sem gate.

## 3. Local exato do pipeline

| Camada | Arquivo | Função |
|--------|---------|--------|
| Detecção | `lib/miaCorrectionContinuityGovernance.js` | `resolveCorrectionContinuity` |
| Perda | `lib/miaIntentRecognitionLayer.js` | `recognizeMiaIntent` (correctionContinuity não exportado) |
| Verbalização LLM | `pages/api/chat-gpt4o.js` | `runGovernedSocialIntentFlow` |
| Finalização | `lib/miaHumanConversationExperience.js` | `finalizeHumanConversationReply` |

## 4. Política implementada

Novo `lib/miaFactValidationGovernance.js`:

| Estado | Significado |
|--------|-------------|
| `pending_validation` | user_claim detectado; bloqueia confirmação |
| `confirmed_claim` | fonte autoritativa disponível confirma |
| `not_verifiable` | admite limitação |
| `none` | fora do escopo factual-contrast |

Reason codes: `user_claim_requires_validation`, `claim_validation_pending`, `claim_confirmed_by_authoritative_source`, `claim_not_verifiable`, `unvalidated_user_claim_confirmation`.

## 5. Antes × Depois

**MT-0036 — `são 5000mAh não 4000`**

| | Antes | Depois |
|---|-------|--------|
| API | "Você está certo! A capacidade é de 5000mAh..." | "Entendi. Você está dizendo que sao 5000mah, não 4000. Vou considerar essa correção apenas após validar a informação." |
| UI | Confirmação automática | Mesma resposta governada |

## 6. Prova anti-hardcode

- Detecção reusa `factualContrast` estrutural de 5.8.1 (contraste valor + negação + valor).
- Audit de confirmação por padrões morfológicos (`você está certo`, `isso mesmo`) + tokens do claim assertido.
- Templates ecoam segmentos do usuário dinamicamente, sem listas mAh/GB/Hz.
- Confirmação autoritativa consulta `collectDecisionFactsFromSession` + produto + última resposta assistant.

## 7. Testes

- `scripts/test-mia-patch-5811-fact-validation.js`: **88/88**
- Regressões: 5.8.1 (124/124), 5.3 (9/9) — verdes

## 8. Produção

- Build: `4f0655275f7e`
- API MT-0036: **PASS**
- Health: `status: ok`

## 9. Interface

- Playwright MT-0036: **PASS** (paridade API/UI)

## 10. Build

Verde ×2 (segunda execução após clean `.next`).

## 11. Git

- Funcional: `4f06552`
- HEAD = origin/master

## 12. Evidências

`docs/conversational/audits/phase-5/evidence/patch-5811/`

## 13. Gates

| Gate | Status |
|------|--------|
| requiresFactValidation impede confirmação | ✅ |
| claim não adotado sem validação | ✅ |
| resposta natural | ✅ |
| zero regressão direcionada | ✅ |
| build verde | ✅ |
| produção + UI | ✅ |
| commit + push + deploy | ✅ |

## 14. Declarações finais

```text
PATCH 5.8.1.1 encerrável oficialmente: SIM

PATCH 5.8.2 iniciável: SIM
```
