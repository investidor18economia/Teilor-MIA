# PHASE 4A — Structured Decision Facts

| Campo | Valor |
|-------|-------|
| **PATCH** | 4A.2 |
| **Versão** | `4A.2.0` |
| **Data** | 2026-07-26 |
| **Depende de** | [`PHASE_4A_SEMANTIC_CONTRACT.md`](./PHASE_4A_SEMANTIC_CONTRACT.md) |

---

## 1. Objetivo

Fazer com que Decision Facts transportem **inteligência organizada** (`SemanticDecisionUnit[]` + hierarquia + papéis decisórios), em vez de depender principalmente de strings como `mainConsequence` e `advantages[]`.

---

## 2. Problema anterior

```text
Decision Facts → advantages[] / mainConsequence → strings → verbalização
```

O significado estruturado produzido pelo contrato 4A.1 não chegava aos Decision Facts. Camadas posteriores liam frases legadas.

---

## 3. Estrutura nova

```text
SemanticDecisionUnit[] (fonte principal)
        ↓
StructuredDecisionFacts
        ↓
Primary Gain / Secondary Gains / Tradeoffs / Caveats
        ↓
Legacy adapter (strings temporárias)
        ↓
Decision Facts consumidores legados
```

Implementação: `lib/miaStructuredDecisionFacts.js`

---

## 4. Hierarquia

Ordem explícita em `hierarchy[]`:

1. Primary Gain
2. Secondary Gains
3. Tradeoffs
4. Caveats

Cada entrada possui `rank`, `layer`, `unitId`, `decisionRole`, `effectKey`.

---

## 5. Decision Roles

Reutiliza `SEMANTIC_DECISION_ROLE`:

- `primary_gain`
- `secondary_gain`
- `tradeoff`
- `caveat`
- `supporting_evidence`
- `tie_breaker`
- `risk`
- `uncertainty`

Sem texto livre para papéis.

---

## 6. Primary Gain

Objeto `primaryGain`:

- `unit` — SemanticDecisionUnit completa
- `hierarchyRank`
- `decisionRole`
- `effectKey`, `evidenceId`, `implicationId`
- `confidence`

Único por conjunto de facts (quando há unidades de ganho).

---

## 7. Secondary Gains

Array `secondaryGains[]` — múltiplos ganhos complementares, deduplicados por `effectKey + dimension`, ordenados na hierarquia após o primary.

---

## 8. Tradeoffs

Array `tradeoffs[]` — unidades com papel `tradeoff` ou implicação negativa, construídas a partir de weaknesses via `buildSemanticDecisionUnitFromWeaknessPoolItem`.

Não são frases fixas; preservam evidência + implicação.

---

## 9. Caveats

Array `caveats[]` — ressalvas estruturadas separadas de weaknesses. Weaknesses alimentam tradeoffs; caveats permanecem extensíveis para patches futuros.

---

## 10. Compatibilidade legada

`legacy` em StructuredDecisionFacts:

```javascript
{
  mainConsequence,
  advantages[],
  sacrifices[],
  adapterVersion: "4A.2.0-legacy",
  isPrimaryTruth: false
}
```

`collectDecisionFactsFromSession` enriquece facts quando `lastSemanticDecisionUnits` / `lastSemanticSacrificeUnits` existem na session.

Sem unidades semânticas, comportamento legado intacto.

---

## 11. Pipeline

| Camada | Função |
|--------|--------|
| `miaSemanticFamilyAllocationEngine` | `selectTradeoffGainsWithSemantics`, `selectTradeoffSacrificesWithSemantics` |
| `miaTradeoffCommunicationLayer` | expõe `structuredDecisionFacts` |
| `miaStructuredDecisionFacts` | `buildStructuredDecisionFacts`, `enrichDecisionFactsWithStructure` |
| `miaDecisionFactsNarrative` | `collectDecisionFactsFromSession` consome unidades |

Ranking, winner e runner-up **não alterados**.

---

## 12. Limitações atuais

- Narrative Planner (4A.4) ainda não consome hierarquia diretamente
- Verbalizador continua usando strings legadas via adapter
- Priorização contextual completa reservada ao 4A.8
- Caveats automáticos limitados — estrutura pronta, geração parcial
- Session persistence de `lastSemanticDecisionUnits` depende de integração no endpoint (campos prontos)

---

## 13. Próximo PATCH

**PATCH 4A.3** — integração ampliada da hierarquia decisória com consumidores narrativos e observabilidade de session.

---

*PATCH 4A.2 — Decision Facts com Significado Prático · 2026-07-26*
