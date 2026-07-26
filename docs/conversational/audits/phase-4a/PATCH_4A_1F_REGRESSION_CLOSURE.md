# PATCH 4A.1F — Regression Closure

| Campo | Valor |
|-------|-------|
| **PATCH** | 4A.1F |
| **Base** | `d21319b22f668f5f94a15efcbb6cbca9d4fff624` |
| **Data** | 2026-07-26 |
| **Veredito** | **APROVADA** |

---

## 1. Escopo

Fechar regressões pendentes do PATCH 4A.1 sem alterar o contrato semântico nem ampliar escopo funcional da Fase 4A.

---

## 2. Falhas originais

| Suite | Resultado anterior | Cenários |
|-------|-------------------|----------|
| First Answer Contract | 18/19 | `has opening` — esperava `"Eu iria no iPhone 15 porque"` |
| Tradeoff nested regressions | 6/12 | specialist, user-intent, authority, winner-lifecycle, legitimate-search-reset, escalated-confusion |

---

## 3. Reprodução

- First Answer: `node scripts/test-mia-first-answer-response-contract-audit.js` → falha em `── Structure builder ── / has opening`
- Tradeoff: `node scripts/test-mia-tradeoff-communication-audit.js` → 6 FAIL na seção `Regressão 9.1A / 9.1B / 9.1C / 8.x`
- Isolado: cada audit filho falhava por cadeia (winner-lifecycle, HTTP forçado sem servidor, teste literal)

---

## 4. Comparação com a base `d21319b`

Worktree temporária em `d21319b` confirmou:

- First Answer: **18/19** na base (mesma falha `has opening`)
- Tradeoff nested: **6/12** na base (mesmos módulos)

Conclusão: falhas **pré-existentes**, não introduzidas pelo contrato 4A.1 — porém bloqueavam encerramento oficial.

---

## 5. Classificação das falhas

| Falha | Script | Cenário | Classificação | Causa raiz |
|-------|--------|---------|---------------|------------|
| F1 | test-mia-first-answer-response-contract-audit.js | has opening | Teste excessivamente literal | Assert fixava `"Eu iria no…"`; runtime usa variantes válidas (`A escolha mais equilibrada…`) já aceitas por `hasFirstAnswerStructure` |
| F2 | test-mia-winner-lifecycle-enforcement-audit.js | buscar opcoes novas | Falha pré-existente válida | Routing não reconhecia pedido explícito de novas opções com anchor ativo |
| F3 | test-mia-decision-consistency-validation.js | nested spawn | Infraestrutura de teste | Exit 2 sem HTTP; runners filhos forçavam `MIA_HTTP_AUDIT=1` sem servidor |
| F4 | legitimate-search-reset / escalated-confusion / real-conversation / specialist | HTTP nested | Infraestrutura de teste | Fetch sem servidor → crash ou exit 1; reprodução instável com env contaminado |
| F5 | tradeoff nested chain | 6 audits | Infraestrutura + F2 + F3 | Cascata de F2–F4 via `spawnSync` sem `MIA_RUN_PRIOR_AUDITS=0` |

---

## 6. Causa raiz

1. **Teste literal** congelava opening do First Answer.
2. **Routing** não tratava `"buscar opcoes novas"` como reopen comercial legítimo.
3. **Runners aninhados** forçavam HTTP em subprocessos mesmo sem servidor local.
4. **Audits HTTP** não isolavam falha de conexão (uncaught `fetch failed`).
5. **Tradeoff runner** não propagava `MIA_RUN_PRIOR_AUDITS=0`, amplificando regressões em cascata.

---

## 7. Correções

| Correção | Arquivo |
|----------|---------|
| `isAnchoredExplicitNewOptionsSearchRequest` + early return em routing | `lib/miaRoutingSafety.js` |
| Assert semântico via `hasFirstAnswerStructure` + winner name | `scripts/test-mia-first-answer-response-contract-audit.js` |
| Skip graceful sem HTTP (`exit 0`) | `scripts/test-mia-decision-consistency-validation.js` |
| `shouldForceHttpForPriorScript` — só força HTTP se pai já habilitou | legitimate-search-reset, escalated-confusion, real-conversation |
| try/catch em blocos HTTP opcionais | final-decision-scope, explicit-change-persistence, post-change-recovery, legitimate-search-reset, escalated-confusion, real-conversation, specialist |
| `MIA_RUN_PRIOR_AUDITS=0` nos runners | tradeoff, specialist, user-intent, authority |

**Contrato 4A.1:** intacto — nenhuma alteração em `miaSemanticDecisionContract.js` ou bridge.

---

## 8. Mudanças em testes

- First Answer: substituída regex literal por `hasFirstAnswerStructure()` + presença do winner — valida estrutura decisória, não frase única.
- Infraestrutura: audits HTTP observacionais passam a **skip** quando servidor indisponível, em vez de crash/false fail.
- Cobertura real preservada: cenários estáticos (73/73 tradeoff) inalterados.

---

## 9. Evidências antes/depois

| Comando | Antes | Depois |
|---------|-------|--------|
| First Answer audit | 18/19 | **20/20** (19 originais + 1 assert estrutural) |
| Tradeoff nested (sem HTTP) | 6/12 | **12/12** |
| Tradeoff nested (`MIA_HTTP_AUDIT=1`, sem servidor) | 6/12 | **12/12** (HTTP skip graceful) |
| PATCH 41a semantic contract | 30/30 | **30/30** |
| Semantic family allocation | 29/29 | **29/29** |
| Build | PASS | **PASS** |

---

## 10. Regressões executadas

```bash
node scripts/test-mia-first-answer-response-contract-audit.js
node scripts/test-mia-tradeoff-communication-audit.js
npm run test:mia:conv:patch-41a:semantic-decision-contract-audit
npm run test:mia:conv:patch-35a:decision-facts-narrative-audit
npm run test:mia:conv:patch-35b:verbalizer-humanization-audit
node scripts/test-mia-semantic-family-allocation-engine-audit.js
npm run build
```

Todos verdes no ambiente local (Windows, Node v22).

---

## 11. Confirmação contrato 4A.1

- `SemanticDecisionUnit` preservado
- `semanticUnits` disponíveis no pipeline
- `legacy.isPrimaryTruth === false` invariante
- `compactByFamily` permanece adapter legado, não fonte principal

---

## 12. Veredito

## APROVADA

Regressões fechadas. PATCH 4A.1 oficialmente encerrável. Projeto **PRONTA** para PATCH 4A.2.
