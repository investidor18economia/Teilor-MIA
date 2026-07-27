# PATCH 4A.9 — Domain Knowledge Adapter Closure

**Date:** 2026-07-27  
**Version:** `4A.9.0`  
**Orchestrator:** `lib/miaDomainKnowledgeAdapter.js`  
**Mobile domain:** `lib/domains/mobile/`

---

## 1. Veredito

**APROVADA (LOCAL)** — Domain Knowledge Adapter implementado, mobile domain isolado, pipeline reordenado (Priority → Domain → PCE), 7/7 cenários LOCAL. Produção pendente de push/deploy.

---

## 2. Objetivo

Separar definitivamente **Arquitetura Cognitiva** de **Conhecimento de Domínio**. Celulares passam a ser um módulo especializado; o núcleo permanece agnóstico.

---

## 3. Arquitetura implementada

```text
StructuredDecisionFacts
        ↓
Contextual Priority Engine (4A.8)
        ↓
Domain Knowledge Adapter (4A.9)  ← NOVO
        ↓
Practical Consequence Engine (4A.7)
        ↓
Confidence / NarrativePlan / VerbalizationPlan
        ↓
Composition Guard → LLM
```

---

## 4. Domain Knowledge Adapter

| Responsabilidade | Implementação |
|------------------|---------------|
| Resolver domínio | `lib/domains/index.js` → `resolveDomainAdapter()` |
| Enriquecer fatos | `applyDomainKnowledgeAdapter()` → overlay `translatedKnowledge` |
| Governança | `validateDomainKnowledgeItem()` — tipo, origem, confidence, limitações, validade |
| Validade temporal | `stable` \| `versioned` \| `market_dependent` |
| Neutro se insuficiente | `neutral: true`, sem impacto no pipeline |
| Nunca alterar winner | Sem mutação de ranking |
| Nunca gerar texto | Apenas itens estruturados |

---

## 5. Estrutura de domínios

```text
lib/domains/
  domainKnowledgeContract.js   # contrato + validação + merge overlay
  index.js                     # registry extensível
  default/domainAdapter.js     # no-op neutro
  mobile/
    knowledge/                 # line, processor, updatePolicy, market
    reasoners/mobileProductReasoner.js
    adapters/mobileDomainAdapter.js
```

---

## 6. Mobile Domain

Conhecimentos implementados:

| Categoria | Exemplos |
|-----------|----------|
| Linhas | Galaxy FE/A/S, Redmi Note, Moto Edge, Pixel, iPhone usado |
| Processadores | Snapdragon, Exynos, Tensor, Dimensity, Apple Silicon |
| Políticas de update | Samsung, Pixel, Motorola, Xiaomi |
| Mercado | Samsung liquidez/assistência, iPhone revenda |

Cada item registra: `type`, `origin`, `confidence`, `limitations`, `category`, `evidence`, `validity`.

---

## 7. Integração

| Arquivo | Papel |
|---------|-------|
| `lib/miaDomainKnowledgeAdapter.js` | Orquestrador core |
| `lib/miaContextualDecisionSynthesis.js` | PCE deferido; Domain antes de PCE |
| `lib/miaSessionContextTransport.js` | `lastDomainKnowledgeModel`, `lastDomainKnowledgeTrace` |
| `pages/api/chat-gpt4o.js` | Persistência em `return_seguro` |

---

## 8. Auditoria de acoplamento

| Área | Estado |
|------|--------|
| `miaContextualPriorityEngine.js` | Sem strings mobile |
| `miaPracticalConsequenceEngine.js` | Sem strings mobile |
| `miaContextualDecisionSynthesis.js` | Importa apenas orchestrator genérico |
| `miaProductIdentityResolution.js` | **Resíduo mobile** — Class B (migração incremental) |
| `miaComparisonFlowCrashGuard.js` | **Resíduo mobile** — Class B |

---

## 9. Regressões

| Suite | Resultado |
|-------|-----------|
| PATCH 4A.3 (43) | 21/21 |
| PATCH 4A.7 (47) | 32/32 |
| PATCH 4A.8 (48) | 26/26 |
| PATCH 4A.9 (49) | 30/30 |
| Build | OK |

---

## 10. Validação conversacional LOCAL

| Cenário | Resultado |
|---------|-----------|
| Galaxy FE | PASS |
| Snapdragon vs Exynos | PASS |
| Pixel | PASS |
| Redmi Note | PASS |
| Samsung updates | PASS |
| Produto desconhecido | PASS |
| Categoria sem domínio | PASS |

Evidência: `docs/conversational/audits/phase-4a/evidence/PATCH_4A_9_LOCAL_DOMAIN_EVIDENCE.json`

---

## 11. Classificação

### Classe A (este PATCH)
- Domain Knowledge Adapter + registry extensível
- Mobile domain module (knowledge, reasoner, adapter)
- Pipeline reorder: Priority → Domain → PCE
- Atributo `validity` (stable/versioned/market_dependent)
- Session transport + persistência chat
- Testes 49 + validação LOCAL 7/7

### Classe B (próximos PATCHs)
- Migração de resíduos mobile em `miaProductIdentityResolution.js`
- Domínios notebook, TV, monitor, automotive
- Reasoners/heuristics/rules avançados por linha/geração

### Classe C (fora do roadmap)
- Nenhum item identificado neste PATCH
