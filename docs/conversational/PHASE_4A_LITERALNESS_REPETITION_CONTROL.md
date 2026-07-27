# PATCH 4A.6 — Literalness, Repetition & Crystallized Frame Control

## Objetivo

Governar a **forma** de expressão sobre `VerbalizationPlan`, impedindo cópia literal de fragmentos internos, repetição mecânica e frames cristalizados — sem alterar fatos, ranking ou winner.

```text
VerbalizationPlan
        ↓
Style & Variation Governance
        ↓
LLM
```

## Princípio

```text
MIA owns the intelligence.
The LLM only verbalizes.
```

A camada de estilo **não cria evidências**, **não altera tradeoffs**, **não muda NarrativePlan** nem **VerbalizationPlan**.

## Módulo central

`lib/miaVerbalizationStyleGovernor.js` (`4A.6.0`)

| Função | Papel |
|--------|-------|
| `detectLiteralFragment` | Identifica fragmentos nominais / labels internos |
| `detectCrystallizedFrame` | Detecta frames interpretativos rígidos |
| `buildVerbalizationStylePolicy` | Política de estilo sobre slots semânticos |
| `buildVariationConstraints` | Anti-repetição contextual |
| `extractRecentPatternContext` | Memória curta de forma (session) |
| `styleGovernanceToLlmContract` | Contrato estruturado para o LLM |
| `surfaceRewriteFragment` | Rewrite determinístico para paths não-LLM |
| `updateRecentVerbalizationPatterns` | Atualiza memória de padrões recentes |

## Contrato LLM

Separa explicitamente:

- `semanticMeaning` — significado a preservar
- `sourceFragment` — evidência interna, **não copiar**
- `rewriteRequired` — flag de reconstrução gramatical
- `variationConstraints.avoidSentenceFrames` — anti-repetição

## Integrações

- `miaContextualDecisionSynthesis` — anexa `verbalizationStyleGovernance`, `llmStyleContract`
- `miaFirstAnswerResponseContract` — `surfaceRewriteFragment` em gains/sacrifices
- `miaSpecialistPresentationContract` — tradeoff carrega style governance
- `miaDecisionFactsNarrative` — recovery via session
- `miaSessionContextTransport` — `lastVerbalizationStyleGovernance`, `lastVerbalizationPatterns`
- `chat-gpt4o.js` — prompt PATCH 4A.6 + persistência de padrões

## Testes

```bash
npm run test:mia:conv:patch-46:literalness-repetition-audit
```

## Próximo passo

PATCH 4A.7 — Tradução de especificações em consequências práticas com confiança governada.
