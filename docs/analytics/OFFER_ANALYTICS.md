# Offer Analytics — PATCH 8.3

Observabilidade agregada do pipeline de ofertas comerciais.

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_offer_set` |
| `event_version` | `8.3.0` |
| Emissão | máx. 1 por `request_id` |
| Writer | `lib/miaOfferSetAnalytics.js` |

## Unidade de oferta

Uma **oferta** = item comercial utilizável nos cards (`product_name`, `price`, `link`, `source`), equivalente a uma entrada em `body.prices`.

## Metadata principal

Counts do funil: `raw_offers_count` → `delivered_offers_count`

Winner observado (nunca recalculado): `winner_provider_id`, `winner_merchant_key`, `winner_price`

Preços agregados: `minimum_price`, `median_price`, `winner_price`, `winner_vs_minimum_delta`

## Correlação

| Evento | Papel |
|--------|-------|
| `mia_commercial_search` (8.1) | hub da busca |
| `mia_provider_attempt` (8.2) | tentativas |
| `mia_offer_set` (8.3) | funil de ofertas |
| `mia_recommendation_shown` | impressão client |

## Referências

- [PATCH_8_3_OFFER_ANALYTICS.md](./PATCH_8_3_OFFER_ANALYTICS.md)
