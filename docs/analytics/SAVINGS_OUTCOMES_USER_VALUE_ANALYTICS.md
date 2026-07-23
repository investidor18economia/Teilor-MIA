# Savings Outcomes & User Value Analytics — PATCH 10.5

Mede **valor entregue observacionalmente** — sem fabricar ROI, economia confirmada ou satisfação.

## Separação obrigatória

| Camada | Significado | Disponível hoje |
|--------|-------------|-----------------|
| **POTENTIAL_VALUE** | Oportunidade encontrada (ex.: diferença de preço observada) | Sim |
| **OBSERVED_VALUE** | Resultado objetivo (click, favorito, alerta atingido) | Sim |
| **VERIFIED_VALUE** | Comprovação transacional | `NOT_AVAILABLE` |
| **UNKNOWN_VALUE** | Evidência insuficiente | Sim |

**Nunca** converter automaticamente OBSERVED → VERIFIED.

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_user_value_outcome` |
| `event_version` | `10.5.0` |
| `category` | `user_value` |

## Arquitetura

```
offer_set delivery (await chain)
  → 10.1 price intelligence
  → 10.2 savings estimation
  → 10.4 anti-regret foundation
  → 10.5 user value outcome
```

Writers: `emitUserValueOutcomeAnalytics` · `scheduleUserValueOutcomeFromPostDecisionSignal`

Deduplicação: `request_id + decision_request_id + event_name + event_version`

## Outcome Status

`POTENTIAL` · `OBSERVED` · `VERIFIED` · `UNKNOWN`

Na entrega comercial típica: `POTENTIAL`. Com sinais pós-decisão ou alerta `TARGET_REACHED`: `OBSERVED`.

## Value Types

`PRICE_OPPORTUNITY` · `PRICE_DROP` · `TIME_SAVED` · `DECISION_SUPPORT` · `ALERT_SUCCESS` · `PRODUCT_DISCOVERY` · `CONFIDENCE_GAIN` · `UNKNOWN`

Somente observação — sem interpretação de intenção de compra.

## Score (`user_value_score`)

- Faixa 0–100, base 40
- Componentes ponderados (documentados em `miaUserValueOutcomeCatalog.js`):

| Componente | Peso |
|------------|------|
| Price | 15 |
| Savings | 20 |
| Alerts | 15 |
| Decision | 10 |
| Favorites | 8 |
| Offer Clicks | 8 |
| Anti-Regret | 12 |
| Confidence | 7 |

- **Interno** — nunca exibido ao usuário, nunca usado no ranking

## Value Confidence

`HIGH` · `MEDIUM` · `LOW` · `UNKNOWN` — baseado em quantidade, qualidade, diversidade e consistência das evidências.

## Value Evidence

`PRICE_INTELLIGENCE` · `SAVINGS_ESTIMATION` · `ALERT_TARGET_REACHED` · `ACCEPTANCE_SIGNAL` · `REJECTION_SIGNAL` · `RUNNER_UP` · `FAVORITE` · `OFFER_CLICK` · `PRICE_ALERT` · `ANTI_REGRET` · `DECISION_CONTEXT` · `UNKNOWN`

## Campos monetários

| Campo | Regra |
|-------|-------|
| `potential_value_amount` | De savings observados/não verificados |
| `observed_value_amount` | Quando há sinais pós-decisão |
| `verified_value_amount` | **Sempre null** até integração checkout |

## Time saved

Buckets: `VERY_LOW` · `LOW` · `MEDIUM` · `HIGH` · `UNKNOWN`

Baseados em profundidade de comparação e alternativas — **não** cronômetro.

## SQL (Q1–Q20)

| Q | Pergunta |
|---|----------|
| 1 | Valor potencial médio |
| 2 | Valor observado médio |
| 3 | Valor por layer |
| 4 | Distribuição do score |
| 5 | Distribuição confidence |
| 6 | Value type |
| 7 | Outcome status |
| 8 | Time saved bucket |
| 9 | Componentes do score |
| 10 | Correlação price intelligence |
| 11 | Correlação savings |
| 12 | Correlação anti-regret |
| 13 | Correlação acceptance |
| 14 | Correlação rejection |
| 15 | Correlação alerts |
| 16 | Score vs confidence |
| 17 | Evolução temporal |
| 18 | Search path |
| 19 | Provider |
| 20 | Taxa VERIFIED (esperado ~0) |

Arquivos: `docs/analytics/sql/patch-105-query*.sql`

## Privacidade

Nunca registrar: query, prompt, response, product_name, email, url, PII.

## Casos proibidos

- `"purchase_confirmed": true` sem evidência
- `"value_verified": true` sem checkout
- `"verified_value_amount": 150` sem comprovação
- `"roi_assumed": true`
- Misturar POTENTIAL com VERIFIED em dashboards ou comunicação externa

## Limitações

- Sem integração checkout — VERIFIED permanece indisponível
- Score observacional ≠ ROI ou economia confirmada
- Enriquecimento pós-decisão é assíncrono quando evento ainda não emitido

## Testes

```bash
npm run test:mia:analytics:patch-105:user-value-outcome
npm run test:mia:analytics:patch-105:prod-smoke
npm run test:mia:analytics:patch-105:prod-validation
```
