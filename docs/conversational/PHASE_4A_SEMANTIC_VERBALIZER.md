# PATCH 4A.5 — Semantic Verbalizer

## Objetivo

Transformar `NarrativePlan` em `VerbalizationPlan` antes da geração textual pelo LLM, com linguagem conversacional natural e variação contextual — sem criar inteligência nem alterar fatos.

```text
NarrativePlan
        ↓
  Semantic Verbalizer
        ↓
  VerbalizationPlan
        ↓
       LLM
```

## Princípio

```text
MIA owns the intelligence.
The LLM only verbalizes.
```

O Verbalizer **não decide**, **não altera ranking**, **não inventa consequências**, **não interpreta specs**, **não muta** `StructuredDecisionFacts` nem `NarrativePlan`.

## Módulo central

`lib/miaSemanticVerbalizer.js` (`4A.5.0`)

| Função | Papel |
|--------|-------|
| `buildVerbalizationPlan` | Converte NarrativePlan → VerbalizationPlan |
| `resolveVerbalizationProfile` | Seleciona perfil contextual (direct, exploratory, reassuring, conversational) |
| `validateVerbalizationPlan` | Garante preservação factual vs NarrativePlan |
| `verbalizationPlanToOrderedLegacyStrings` | Adapter ordenado para consumidores legados |
| `verbalizationPlanToLlmContract` | Contrato explícito para o LLM |
| `buildSemanticVerbalizationPayload` | Payload completo com validação |

## VerbalizationPlan

```text
opening { intent, connector, seed }
mainMessage
supportingMessages[]
tradeoffs[]
caveats[]
closingIntent { type, reason }
tone { profile, pace }
variationProfile { id, directness, explanationDepth, reason }
sections[] (slots ordenados)
llmContract { llmCanOnlyVerbalize, mustPreserveFacts, forbiddenInvention, sectionOrder }
```

### Perfis de variação

| Perfil | Quando | Efeito na forma |
|--------|--------|-----------------|
| `direct` | Pergunta curta / product lock | Conciso, confiante |
| `exploratory` | Descoberta / query longa | Explicativo, conectores suaves |
| `reassuring` | Sinais de insegurança / antiregret | Calmo, contextualizador |
| `conversational` | Default | Equilibrado, natural |

Tradeoffs e caveats são mapeados diretamente de `narrativePlan.tradeoffs` / `caveats` (não apenas de `sections` deduplicadas).

## Integrações

- `miaContextualDecisionSynthesis` — anexa `verbalizationPlan` e `llmVerbalizationContract`
- `miaFirstAnswerResponseContract` — prefere verbalizationPlan sobre narrativePlan
- `miaDecisionFactsNarrative` — recovery com `lastVerbalizationPlan`
- `miaSpecialistPresentationContract` — tradeoff carrega verbalizationPlan
- `miaSessionContextTransport` — campo `lastVerbalizationPlan`
- `chat-gpt4o.js` — persiste plano e passa contexto (query, signals, product lock)

## Testes

```bash
npm run test:mia:conv:patch-45:semantic-verbalizer-audit
```

## Próximo passo

PATCH 4A.6 — Controle de Literalidade, Repetição e Frases Interpretativas Cristalizadas (consome `VerbalizationPlan`).
