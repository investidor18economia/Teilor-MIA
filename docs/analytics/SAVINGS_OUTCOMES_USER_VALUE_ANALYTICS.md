# Savings Outcomes & User Value Analytics — PATCH 10.5

Mede **valor entregue observacionalmente** — sem fabricar ROI, economia confirmada ou satisfação.

## Separação obrigatória

| Camada | Significado |
|--------|-------------|
| **POTENTIAL_VALUE** | Oportunidade encontrada (ex.: diferença de preço observada) |
| **OBSERVED_VALUE** | Resultado objetivo (click, favorito, alerta atingido) |
| **VERIFIED_VALUE** | `NOT_AVAILABLE` hoje — requer evidência transacional futura |
| **UNKNOWN_VALUE** | Evidência insuficiente |

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
  → 10.5 user value outcome   ← novo
```

## Score (`user_value_score`)

- Faixa 0–100, base 40
- Componentes ponderados: Price (15), Savings (20), Alerts (15), Decision (10), Favorites (8), Offer Clicks (8), Anti-Regret (12), Confidence (7)
- **Interno** — nunca exibido ao usuário, nunca usado no ranking

## Campos monetários

- `potential_value_amount` — de savings OBSERVED/UNVERIFIED
- `observed_value_amount` — quando há sinais pós-decisão
- `verified_value_amount` — **sempre null** até integração checkout/marketplace

## Time saved

Buckets observacionais: `VERY_LOW`, `LOW`, `MEDIUM`, `HIGH`, `UNKNOWN` — baseados em profundidade de comparação, não cronômetro.

## SQL

Q1–Q20 em `docs/analytics/sql/patch-105-query*.sql`

## Casos proibidos

- `"roi_percent": 42`
- `"purchase_confirmed": true` sem evidência
- `"verified_value_amount": 150` sem checkout
- Misturar POTENTIAL com VERIFIED em dashboards
