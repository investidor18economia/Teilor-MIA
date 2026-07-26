# PATCH 4A.3 — Contextual Decision Synthesis

## Objetivo

Unificar todas as origens de informação decisória em um único pipeline semântico antes dos consumidores:

```text
Data Layer | Commercial | Specs | Fallback | Session
                    ↓
         SemanticDecisionUnit
                    ↓
         StructuredDecisionFacts
                    ↓
    Primary Gain → Secondary Gains → Tradeoffs → Caveats
                    ↓
              Consumidores únicos
```

## Princípio

```text
MIA owns the intelligence.
The LLM only verbalizes.
```

A origem dos dados muda. A estrutura da decisão permanece a mesma.

## Módulo central

`lib/miaContextualDecisionSynthesis.js`

| Função | Papel |
|--------|-------|
| `synthesizeContextualDecisionFacts` | Converge qualquer origem para StructuredDecisionFacts |
| `buildSemanticUnitsFromConsequenceStrings` | Strings comerciais/fallback → units |
| `buildSemanticUnitsFromTrustedSpecs` | Specs → units |
| `finalizeTradeoffSourcesWithSynthesis` | Tradeoff layer sempre anexa structured facts |
| `buildContextualDecisionSynthesisPayload` | Payload de session + legacy adapter |
| `deriveSessionFieldsFromStructuredFacts` | Campos legacy derivados (nunca primary truth) |

## Integrações

- **Tradeoff layer** — fallback e semantic path anexam `structuredDecisionFacts`
- **Presentation contract** — preserva structured facts no `tradeoff`
- **Session transport** — `lastSemanticDecisionUnits`, `lastSemanticSacrificeUnits`, `lastStructuredDecisionFacts`
- **Endpoint** — persiste síntese após recomendação comercial
- **Decision Facts narrative** — prioriza `lastStructuredDecisionFacts`
- **First Answer** — prefere `presentation.tradeoff.structuredDecisionFacts`

## Adapter legado

`legacy.isPrimaryTruth === false` permanece obrigatório. Legacy strings são compatibilidade, não fonte principal.

## Testes

```bash
npm run test:mia:conv:patch-43:contextual-synthesis-audit
```

## Próximo passo

PATCH 4A.4 — Narrative Planner (consumo unificado na verbalização).
