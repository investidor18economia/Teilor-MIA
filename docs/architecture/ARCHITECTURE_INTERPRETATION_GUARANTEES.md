# Architecture Interpretation Guarantees
## (Fase 4A)

# Objetivo

Descrever quais garantias a arquitetura da MIA oferece após a conclusão da Fase 4A.

Este documento serve como referência permanente para futuras evoluções da arquitetura.

Nenhum PATCH futuro poderá violar estas garantias sem justificativa arquitetural explícita.

---

# 1. Garantias Arquiteturais

## 1.1 Decisões pertencem à arquitetura

- **Descrição:** Winner, ranking, tradeoffs e hierarquia de evidências são produzidos antes da verbalização.
- **Componente responsável:** Decision Engine, Structured Decision Facts, Contextual Decision Synthesis.
- **Evidências arquiteturais:** `lib/miaStructuredDecisionFacts.js`, `lib/miaContextualDecisionSynthesis.js`, PATCH 4A.2–4A.3 audits.

## 1.2 Interpretação pertence à arquitetura

- **Descrição:** Tokens do Data Layer são traduzidos em consequências práticas e unidades semânticas estruturadas — nunca delegados à LLM.
- **Componente responsável:** Consequence Translation Layer, Practical Consequence Engine, Semantic Decision Contract.
- **Evidências arquiteturais:** `lib/miaConsequenceTranslationLayer.js`, `lib/miaPracticalConsequenceEngine.js`, `lib/miaSemanticDecisionContract.js`, PATCH 4A.7.

## 1.3 Consequências práticas são estruturadas

- **Descrição:** Toda consequência prática possui categoria, significado interpretado, confiança e limitações rastreáveis.
- **Componente responsável:** Practical Consequence Engine.
- **Evidências arquiteturais:** `practicalConsequencesToTrace`, PATCH 4A.7 production evidence.

## 1.4 Prioridades são calculadas deterministicamente

- **Descrição:** Pesos de critério (bateria, câmera, valor, etc.) são inferidos por regras explícitas a partir de query, sessão e sinais — nunca pela LLM.
- **Componente responsável:** Contextual Priority Engine, User Priority Weighting Engine.
- **Evidências arquiteturais:** `lib/miaContextualPriorityEngine.js`, `contextualPriorityToTrace`, PATCH 4A.8/4A.10.

## 1.5 Domínio permanece desacoplado

- **Descrição:** Conhecimento especializado (mobile, futuros domínios) entra via Domain Knowledge Adapter sem acoplar o núcleo cognitivo.
- **Componente responsável:** Domain Knowledge Adapter, `lib/domains/*`.
- **Evidências arquiteturais:** `lib/miaDomainKnowledgeAdapter.js`, PATCH 4A.9.

## 1.6 Confiança governa a narrativa

- **Descrição:** Níveis de confiança das consequências influenciam hedge, limitações e alinhamento da superfície final.
- **Componente responsável:** Absolute Claim Governance, Confidence Evaluation.
- **Evidências arquiteturais:** `lib/miaAbsoluteClaimGovernance.js`, `validateConfidenceReplyAlignment`, PATCH 4A.7V.

## 1.7 Narrativa deriva de fatos estruturados

- **Descrição:** NarrativePlan organiza seções a partir de StructuredDecisionFacts — não cria inteligência nem conclusões inéditas.
- **Componente responsável:** Narrative Planner.
- **Evidências arquiteturais:** `lib/miaNarrativePlanner.js`, PATCH 4A.4.

## 1.8 Verbalização apenas organiza linguagem

- **Descrição:** VerbalizationPlan mapeia slots narrativos para texto ordenado — não reinterpreta evidências.
- **Componente responsável:** Semantic Verbalizer.
- **Evidências arquiteturais:** `lib/miaSemanticVerbalizer.js`, PATCH 4A.5.

## 1.9 Composition Guard governa a superfície final

- **Descrição:** Claims absolutos, repetição, gramática quebrada e perda de limitações são detectados e corrigidos antes da entrega.
- **Componente responsável:** Verbalization Composition Guard.
- **Evidências arquiteturais:** `lib/miaVerbalizationCompositionGuard.js`, PATCH 4A.6V/4A.7V.

## 1.10 Interpretation Trace é rastreável

- **Descrição:** Toda afirmação relevante pode ser mapeada em Claim → Evidence → Interpreter → Consequence → Confidence → Narrative → Surface.
- **Componente responsável:** Interpretation Trace (`lib/miaInterpretationTrace.js`), traces `*ToTrace` em cada camada.
- **Evidências arquiteturais:** PATCH 4A.11 semantic interpretation audit.

## 1.11 LLM apenas verbaliza

- **Descrição:** A LLM recebe plano estruturado e produz texto natural — nunca interpreta, decide, infere prioridade ou cria conhecimento.
- **Componente responsável:** Surface Renderer (LLM), precedido por toda a cadeia cognitiva.
- **Evidências arquiteturais:** `contextualSynthesisToTrace`, PATCH 4A.11 LLM audit.

---

# 2. O que NÃO é garantido

- **Data Layer incompleto** gera respostas com cobertura limitada e confiança reduzida — não é defeito arquitetural.
- **Conhecimento de mercado** (preços, disponibilidade) pode envelhecer; Domain Adapter marca validade (`stable`, `versioned`, `market_dependent`).
- **Categorias além de mobile** dependem de novos Domain Adapters registrados em `lib/domains/`.
- **Catálogo comercial** pode não conter determinado produto — a arquitetura declara limitação em vez de inventar specs.
- **Queries vagas sem orçamento** podem receber clarificação honesta em vez de recomendação forçada.
- **Equivalência semântica LOCAL × REAL** depende de deploy sincronizado e catálogo disponível no ambiente.

---

# 3. Papel da LLM

## Permitido

- Organizar linguagem a partir do VerbalizationPlan.
- Ajustar fluidez e conectores naturais.
- Produzir texto natural em português.
- Adaptar estilo dentro das políticas do Style Governor.

## Proibido

- Decidir winner ou ranking.
- Interpretar evidências do Data Layer.
- Inferir prioridades do usuário.
- Criar conhecimento ou specs inexistentes.
- Gerar consequências práticas não estruturadas.
- Alterar níveis de confiança.
- Remover limitações ou caveats.
- Introduir claims absolutos não governados.

Registro oficial: em Interpretation Trace, a LLM aparece **somente** como `LLM_SurfaceRenderer` no campo `renderedSentence`.

---

# 4. Cadeia Cognitiva Oficial

```
Intent Recognition
        ↓
Decision Engine
        ↓
Priority Engine
        ↓
Domain Knowledge Adapter
        ↓
Practical Consequence Engine
        ↓
Confidence Evaluation
        ↓
NarrativePlan
        ↓
VerbalizationPlan
        ↓
Composition Guard
        ↓
LLM (Surface Renderer)
```

| Componente | Responsabilidade | Transporta | Decide | Verbaliza |
|------------|------------------|----------|--------|-----------|
| Intent Recognition | Classifica intenção e sinais de query | ✓ | ✓ | — |
| Decision Engine | Produz Structured Decision Facts | ✓ | ✓ | — |
| Priority Engine | Pesa critérios contextuais | ✓ | ✓ | — |
| Domain Adapter | Enriquece conhecimento de domínio | ✓ | ✓ (enriquecimento) | — |
| Practical Consequence Engine | Interpreta specs → consequências | ✓ | ✓ | — |
| Confidence Evaluation | Alinha assertividade à confiança | ✓ | ✓ | — |
| NarrativePlan | Organiza hierarquia narrativa | ✓ | — | — |
| VerbalizationPlan | Organiza slots de linguagem | ✓ | — | — |
| Composition Guard | Valida/corrige superfície | ✓ | ✓ (governança) | — |
| LLM | Renderiza texto final | — | — | ✓ |

---

# 5. Invariantes Arquiteturais

1. **Winner nunca decidido pela LLM.**
2. **Ranking nunca manipulado diretamente pela narrativa ou verbalização.**
3. **Domínio nunca acoplado ao núcleo cognitivo** — sempre via adapter registrado.
4. **Consequência prática sempre rastreável** via Practical Consequence Engine ou Semantic Decision Unit.
5. **Toda afirmação relevante possui evidência** registrada em Interpretation Trace ou Semantic Decision Contract.
6. **Confiança sempre influencia narrativa** via closing type, hedge e governance.
7. **Composition Guard sempre executa** após plano narrativo/verbalização.
8. **Narrativa nunca cria fatos inéditos** — apenas reorganiza unidades existentes.
9. **Legacy strings nunca são primary truth** quando Structured Decision Facts estão disponíveis.
10. **Alteração de garantia exige atualização deste documento** e registro no relatório do PATCH.

---

# 6. Dependências

| Camada | Responsabilidade |
|--------|------------------|
| **Arquitetura** | Interpretação, priorização, consequências, narrativa estruturada, governança de confiança |
| **Data Layer** | Specs, strengths, weaknesses, tokens traduzíveis |
| **Catálogo** | Disponibilidade comercial, preços, produtos existentes |
| **Modelo de linguagem** | Fluência final — exclusivamente surface rendering |

A qualidade das respostas é **produto conjunto**, mas a **inteligência interpretativa** é propriedade exclusiva da arquitetura.

---

# 7. Limitações conhecidas

- Categorias além de **mobile** ainda dependem de expansão de Domain Adapters.
- Parte do conhecimento histórico depende de evolução contínua do Data Layer.
- Follow-ups altamente específicos podem ser enriquecidos em fases futuras (Class B).
- `compactByFamily` permanece como caminho legacy — Structured Decision Facts são primary truth.
- Interpretation Trace offline cobre cadeia arquitetural; amostra de fidelidade em produção usa 20+ respostas reais por PATCH de auditoria.

---

# 8. Critérios para futuros PATCHs

Todo novo componente deve:

1. Ser **determinístico** quando aplicável.
2. Possuir **rastreabilidade** (`*ToTrace` ou equivalente).
3. Registrar **confiança** quando interpretar evidências.
4. Preservar **desacoplamento** de domínio e núcleo.
5. Passar por **regressão LOCAL e REAL** quando afetar conversação.
6. **Nunca mover inteligência para a LLM.**
7. Atualizar este documento se alterar qualquer invariante.

---

# 9. Conclusão

**Preparação para novos domínios:** Domain Knowledge Adapter + Priority Engine agnósticos permitem registrar novos domínios sem alterar o núcleo.

**Inteligência permanece na arquitetura:** Interpretation Trace e Semantic Decision Contract garantem que interpretação, prioridade e consequências são estruturadas antes da LLM.

**Auditorias futuras simplificadas:** Cada camada expõe trace; PATCH 4A.11 estabelece o contrato de auditoria semântica replicável em fases posteriores.

---

*Documento constitucional — Fase 4A. Última revisão: PATCH 4A.11.*
