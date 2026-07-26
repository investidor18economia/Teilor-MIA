# PATCH 4A.4 — Category-Agnostic Narrative Planner

## Objetivo

Organizar `StructuredDecisionFacts` em um `NarrativePlan` antes da verbalização, sem criar inteligência nem alterar ranking/winner.

```text
StructuredDecisionFacts
        ↓
  Narrative Planner
        ↓
    NarrativePlan
        ↓
   Verbalizer (4A.5)
```

## Princípio

```text
MIA owns the intelligence.
The LLM only verbalizes.
```

O Narrative Planner **não decide**, **não interpreta specs**, **não inventa fatos**.

## Módulo central

`lib/miaNarrativePlanner.js` (`4A.4.0`)

| Função | Papel |
|--------|-------|
| `buildNarrativePlan` | Converte StructuredDecisionFacts → NarrativePlan |
| `resolveRecommendedClosing` | Seleciona tipo de fechamento (não gera texto) |
| `narrativePlanToOrderedLegacyStrings` | Adapter ordenado para consumidores legados |
| `narrativePlanToVerbalizationOrder` | Contrato para verbalizador (4A.5) |
| `validateNarrativePlan` | Validação de schema e ordem |

## NarrativePlan

```text
primaryNarrative
supportingArguments[]
tradeoffs[]
caveats[]
sections[] (ordenadas por hierarchyRank)
recommendedClosing { type, reason }
legacy { gains, sacrifices, caveats, isPrimaryTruth: false }
```

### Tipos de fechamento

- `recommendation`
- `clarification`
- `confidence`
- `neutral`
- `exploratory`

## Integrações

- `miaContextualDecisionSynthesis` — anexa `narrativePlan` ao payload
- `miaTradeoffCommunicationLayer` — gains/sacrifices ordenados pelo plano
- `miaSpecialistPresentationContract` — tradeoff consome plano
- `miaFirstAnswerResponseContract` — primary gain e ordem via plano
- `miaDecisionFactsNarrative` — session recovery com plano persistido
- `chat-gpt4o.js` — persiste `lastNarrativePlan`

## Testes

```bash
npm run test:mia:conv:patch-44:narrative-planner-audit
```

## Próximo passo

PATCH 4A.5 — Verbalizer Semântico (consumo do NarrativePlan na verbalização).
