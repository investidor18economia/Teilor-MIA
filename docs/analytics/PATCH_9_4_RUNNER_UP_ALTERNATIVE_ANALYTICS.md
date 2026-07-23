# PATCH 9.4 — Runner-up and Alternative Analytics

**Camada:** derivada (9.1 enriquecido + SQL Q1–Q12) · **Versão catálogo:** `9.4.0`  
**Status:** 🟡 **IMPLEMENTADO** (aguardando produção)

## Decisão arquitetural — Modelo Híbrido Derivado (Alternativa D)

| Camada | Responsabilidade |
|--------|------------------|
| `mia_recommendation_decision` (9.1) | Enriquecido com identidade e estado do runner-up |
| `mia_recommendation_acceptance_signal` (9.2) | Interações — interpretadas por target RUNNER_UP/ALTERNATIVE |
| `mia_recommendation_rejection_signal` (9.3) | Solicitação/substituição/recovery |
| SQL Q1–Q12 | Métricas oficiais sem evento novo |

**Evento novo:** não criado — 9.1–9.3 bastam após enriquecimento de identidade.

## Autoridade do runner-up cognitivo

```text
resolveWinnerAndRunnerUpRanks(rankedProducts, selectedBestProduct)
```

- Fonte: scan family-aware em `rankedProducts` (PATCH 9.1)
- **Não** usar `displayProducts[1]` como autoridade
- **Não** recalcular ranking ou scores

Campos adicionados ao evento 9.1 (additive):

- `runner_up_product_family`
- `runner_up_provider`
- `runner_up_valid`, `runner_up_identity_available`
- `runner_up_in_ranking`, `runner_up_in_display_products`, `runner_up_in_delivery`
- `display_second_card_is_cognitive_runner_up`
- `score_gap_bucket`, `runner_up_competitiveness`
- `same_family`, `same_brand`, `same_category`, `same_provider`, `alternative_diversity_class`

## Score gap buckets (escala observada PATCH 9.1)

| Bucket | Limite |
|--------|--------|
| TIE | ≤ 0 |
| VERY_CLOSE | ≤ 2 |
| CLOSE | ≤ 5 |
| MODERATE | ≤ 10 |
| WIDE | > 10 |

## Produção

```bash
npm run test:mia:analytics:patch-94:runner-up-alternative
npm run test:mia:analytics:patch-94:prod-smoke
npm run test:mia:analytics:patch-94:prod-validation
```

## Limitações

- `lastRankingSnapshot` (SBD) usa top-3 display — pode divergir do runner-up cognitivo
- SECOND_BEST_DISCOVERY não emite 9.1 — observado via sessão
- Match UNRESOLVED não entra em runner-up selection rate oficial
