# PATCH 4.1I.3.V.2.1 — Relatório Final Pós-Deploy

## Veredito: **NÃO APROVADO**

## Declarações explícitas

| Pergunta | Resposta |
|----------|----------|
| PATCH 4.1I.3 pode ser encerrado oficialmente? | **NÃO** |
| PATCH 4.1J pode ser iniciado? | **NÃO** |

---

## Builds e deploy

| Item | Valor |
|------|-------|
| Commit | `a2f26ae` |
| Build produção confirmado | `a2f26aebd442` |
| Health final | `GET /api/health` → `status: ok`, `build: a2f26aebd442` |
| Push | `origin/master` — concluído |
| Deploy | Confirmado via health |
| Git sincronizado | SIM |

---

## Causa raiz (comprovada)

**Âncora de produto stale na sessão degradava o contrato antes do fallback.**

Em `scanConversationForProductContext()` (`lib/miaSemanticTargetResolution.js`), `sessionContext.lastBestProduct` era promovido incondicionalmente a `hasRecentProductDiscussion` e `hasCommercialContext`, mesmo sem discussão de produto nas mensagens.

**Execução incorreta (B2 turno 2):**

| Campo | Valor incorreto |
|-------|-----------------|
| Taxonomia | `complimentToMia: true`, signals `["compliment","mia_target"]` |
| `resolvedSemanticTarget` | `product` (deveria ser `mia`) |
| `governedSocialRoutingKey` | `product_aesthetic_opinion` |
| reasonCodes | `short_aesthetic_with_product_context` |
| Função selecionada | `selectGovernedFallback` → `buildProductAestheticFallback` |

**Auditoria de call sites:**

| Pergunta | Resposta |
|----------|----------|
| Early return antes de `finalizeHumanConversationReply`? | **NÃO** |
| Fallback construído antes da resolução final de alvo? | **SIM** — alvo degradado na resolução |
| Validator ignorado? | **NÃO** — validator correto para contrato degradado |
| `resolvedSemanticTarget` ausente em algum estágio? | **NÃO** — presente como `product` (errado) |
| Caminho depende de entity frame legado? | **NÃO** — único call site: `miaGovernedFallbackPolicy.js` |
| Replacement trace não interceptou? | **N/A** — resposta válida para contrato `product` degradado |

**Por que intermitente (~20%):** ocorria somente quando `session_context` carregava `lastBestProduct` residual de turno comercial anterior, sem discussão de produto na conversa atual.

Evidência: `docs/conversational/audits/phase-4/evidence/patch-41i3v21/ROOT_CAUSE.json`

---

## Correção implementada

### Estágio corrigido

1. **`lib/miaSemanticTargetResolution.js`** — separação `hasConversationProductDiscussion` vs `hasSessionProductAnchor`; precedência MIA greeting + sinais taxonomy antes de âncora session-only
2. **`lib/miaSemanticAuthority.js`** — `isMiaComplimentGovernedContract()`, `isProductAestheticFallbackPermitted()`; routing key taxonomy respeita `target !== PRODUCT`
3. **`lib/miaGovernedFallbackPolicy.js`** — invariante estrutural: família `product_aesthetic` bloqueada sob contrato `mia_compliment` (reason: `mia_compliment_blocks_product_aesthetic`)
4. **`pages/api/chat-gpt4o.js`** — rebuild de contrato passa `sessionContext` (estava ausente)

### Call site responsável

`lib/miaGovernedFallbackPolicy.js` → `selectGovernedFallback` → `buildProductAestheticFallback` (único call site em produção)

### Prova: correção NÃO usa texto hardcoded

A decisão usa exclusivamente objetos governados:

- `contract.governedSocialRoutingKey`
- `contract.resolvedSemanticTarget`
- `contract.primarySocialIntent`
- `contract.socialIntentSignals`
- `isMiaComplimentGovernedContract(contract, targetResolution)`
- `isProductAestheticFallbackPermitted(contract, targetResolution)`

Nenhum regex, prefixo ou lista de frases sobre a resposta final.

Testes: `scripts/test-mia-patch-41i3v21-product-frame-invariant.js` (12/12 contract-based)

---

## Testes locais

| Suite | Resultado |
|-------|-----------|
| V.2.1 product frame invariant | 12/12 |
| V.2 mia compliment invariant | 20/20 |
| 4.1I.3 semantic fallback audit | 40/40 |
| Build local | OK |

---

## Validação produção (build `a2f26aebd442`)

### Gates principais — APROVADOS

| Gate | Resultado |
|------|-----------|
| **B2** `Oi, MIA` → `Linda` | **10/10** |
| **B1** produto → `Linda` | **10/10** |
| **Críticos** (5 × 3) | **15/15** |
| **Regressão social** | **10/10** |
| **Regressão comercial** | **10/10** |

Zero product frame em B2. Zero elogio MIA em B1. Zero clarificação neutra indevida em B2. Zero legacy hit. Zero falha técnica omitida.

### Gates secundários — REPROVADOS

| Gate | Resultado | Motivo |
|------|-----------|--------|
| **Linda isolado** | **2/5** semântico | 3/5 retornaram `"O Celular tem um visual bem marcante."` em sessão nova — vazamento fora do escopo B2 (provável poluição server-side ou fallback default em alvo unknown) |
| **Variações elogio MIA** | **11/15** | Clarificação em palavras curtas (`Incrível`, `Sensacional`); `MIA oi` gera clarificação; `Bonita demais` classificado como `response_approval` |
| **Variações elogio produto** | **10/15** | Primeira mensagem vaga perde contexto; clarificação indevida; respostas de aprovação genérica |

Evidências: `docs/conversational/audits/phase-4/evidence/patch-41i3v21/`

---

## Comparação V.2 → V.2.1

| Métrica | V.2 (`f5ad55b`) | V.2.1 (`a2f26ae`) |
|---------|-----------------|-------------------|
| B2 | 8/10 (2× product frame) | **10/10** |
| B1 | 5/5 | **10/10** |
| Clarificação neutra B2 | 0 | 0 |
| Product frame B2 | 2 | **0** |

---

## Conclusão

A correção estrutural do PATCH 4.1I.3.V.2.1 **resolve comprovadamente** o vazamento de `product_aesthetic_opinion` sob contrato `mia_compliment` no caminho B2 (incluindo âncora stale). Gates principais passam 100%.

Porém os gates secundários (Linda isolado, variantes MIA/produto) não atingiram 100%, impedindo encerramento oficial do PATCH 4.1I.3.

---

## Evidências

- `docs/conversational/audits/phase-4/evidence/patch-41i3v21/ROOT_CAUSE.json`
- `docs/conversational/audits/phase-4/evidence/patch-41i3v21/LOCAL_REPRO_TRACE.json`
- `docs/conversational/audits/phase-4/evidence/patch-41i3v21/PROD_B2_STABILITY.json`
- `docs/conversational/audits/phase-4/evidence/patch-41i3v21/PRODUCT_CONTEXT_REGRESSION.json`
- `docs/conversational/audits/phase-4/evidence/patch-41i3v21/FINAL_SUMMARY.json`
- `docs/conversational/audits/phase-4/evidence/patch-41i3v21/HEALTH_FINAL.json`
