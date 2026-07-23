# Runner-up and Alternative Analytics

Documentação analítica PATCH 9.4 — camada derivada sobre decisões 9.1 e sinais 9.2/9.3.

## Definições

| Conceito | Autoridade |
|----------|------------|
| Winner cognitivo | `selectedBestProduct` → 9.1 |
| Runner-up cognitivo | `resolveWinnerAndRunnerUpRanks` → 9.1 |
| Alternativa exibida | `displayProducts` / delivery |
| Alternativa solicitada | 9.3 `ALTERNATIVE_REQUESTED` / 9.2 follow-up |
| Alternativa selecionada | 9.2 clique/favorito/alerta ou replacement |

## Match runner-up ↔ alternativa

`EXACT_FAMILY_MATCH` (HIGH) quando hashes compatíveis.

## Métricas oficiais

- Runner-up availability rate
- Runner-up display / render / interaction / selection / replacement rates
- Alternative recovery rate (por runner-up, outra alternativa, nova busca)

## SQL

`docs/analytics/sql/patch-94-query*.sql` (Q1–Q12)

## Implementação

| Módulo | Caminho |
|--------|---------|
| Catálogo | `lib/miaRecommendationAlternativeCatalog.js` |
| Classificador | `lib/miaRecommendationAlternativeClassifier.js` |
| Facade | `lib/miaRecommendationAlternativeAnalytics.js` |
| Enriquecimento 9.1 | `lib/miaRecommendationDecisionClassifier.js` |
| Propagação frontend | `components/MIAChat.jsx` |
