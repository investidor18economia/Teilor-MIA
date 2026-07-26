# PHASE 8 — Commercial Intelligence Analytics

Versão: 1.0
Status: ✅ CONCLUÍDA
Data de encerramento: Julho de 2026

---

# Objetivo da Fase

A Fase 8 teve como objetivo tornar todo o pipeline comercial da MIA observável sem alterar qualquer comportamento funcional.

Princípio fundamental:

> Analytics observa.
>
> A MIA continua sendo a única responsável pelas decisões.

Nenhuma métrica criada nesta fase participa da lógica comercial.

Toda instrumentação é exclusivamente observacional.

---

# Problema resolvido

Antes da Fase 8 era possível saber apenas:

- que uma conversa ocorreu;
- que uma resposta foi enviada;
- alguns eventos isolados.

Não era possível responder perguntas como:

- houve busca comercial?
- o Data Layer resolveu?
- quais providers foram tentados?
- quais providers realmente contribuíram?
- quantas ofertas sobreviveram?
- qual oferta venceu?
- onde o pipeline perdeu ofertas?
- houve fallback?
- qual caminho comercial foi utilizado?

Após a Fase 8 todo esse fluxo tornou-se observável.

---

# Arquitetura final

```
Usuário
        │
        ▼
Intent Recognition
        │
        ▼
Commercial Entry
        │
        ▼
Query Extraction
        │
        ▼
Data Layer
        │
        ▼
Commercial Search Analytics (8.1)
        │
        ▼
Provider Router
        │
        ▼
Provider Attempts (8.2)
        │
        ▼
Normalização
        │
Merge
        │
Deduplicação
        │
Ranking
        │
Seleção
        │
Offer Pipeline
        │
Offer Analytics (8.3)
        │
Response Builder
        │
Frontend
        │
Eventos Frontend
```

Todos os eventos são correlacionados por:

```
request_id
```

---

# Patches implementados

## PATCH 8.0

### Auditoria da arquitetura comercial

Objetivo

- mapear todo o pipeline comercial;
- identificar pontos corretos de instrumentação;
- impedir duplicação de responsabilidades.

Resultado

✅ aprovado.

---

## PATCH 8.1

Commercial Search Analytics

Evento

```
mia_commercial_search
```

Versão

```
8.1.0
```

Responsabilidade

Observar:

- busca comercial;
- search path;
- Data Layer;
- necessidade de continuação;
- resultado geral da busca.

Não observa providers.

Não observa ofertas.

---

## PATCH 8.2

Provider Analytics

Evento

```
mia_provider_attempt
```

Versão

```
8.2.0
```

Responsabilidade

Observar cada tentativa real de provider.

Inclui:

- provider;
- runtime;
- status;
- fallback;
- shadow;
- retries;
- latência;
- contribuição.

Não observa ranking.

Não observa winner.

Não observa ofertas finais.

---

## PATCH 8.3

Offer Analytics

Evento

```
mia_offer_set
```

Versão

```
8.3.0
```

Responsabilidade

Observar:

- funil das ofertas;
- winner;
- preços agregados;
- diversidade;
- delivery;
- qualidade do conjunto.

Um único evento por request.

---

## PATCH 8.4

Auditoria Final

Objetivos

- revisar arquitetura;
- revisar SQL;
- revisar contratos;
- revisar documentação;
- validar produção;
- consolidar documentação.

Resultado

✅ aprovado.

---

# Eventos oficiais da Fase 8

## mia_commercial_search

Versão

```
8.1.0
```

Pergunta respondida

"Houve busca comercial?"

---

## mia_provider_attempt

Versão

```
8.2.0
```

Pergunta respondida

"Quais providers foram tentados?"

---

## mia_offer_set

Versão

```
8.3.0
```

Pergunta respondida

"O que aconteceu com as ofertas?"

---

# Eventos relacionados

A Fase 8 utiliza também:

```
data_layer_resolution
mia_response_outcome
mia_error_event
mia_latency_event
mia_recommendation_shown
offer_click
favorite_created
price_alert_created
```

Esses eventos permanecem responsáveis pelos seus próprios domínios.

Não houve duplicação.

---

# Matriz oficial de responsabilidades

| Pergunta | Evento |
|----------|--------|
| Houve busca? | mia_commercial_search |
| Qual search path? | mia_commercial_search |
| Data Layer resolveu? | data_layer_resolution |
| Houve provider? | mia_provider_attempt |
| Houve fallback? | mia_provider_attempt |
| Provider falhou? | mia_provider_attempt |
| Quantas ofertas sobreviveram? | mia_offer_set |
| Qual winner? | mia_offer_set |
| Qual resposta foi enviada? | mia_response_outcome |
| Houve erro? | mia_error_event |
| Qual latência? | mia_latency_event |
| Usuário viu? | mia_recommendation_shown |
| Usuário clicou? | offer_click |
| Favoritou? | favorite_created |
| Criou alerta? | price_alert_created |

---

# Correlação

Hub oficial

```
request_id
```

Server

```
mia_commercial_search
↓

data_layer_resolution
↓

mia_provider_attempt
↓

mia_offer_set
↓

mia_response_outcome
↓

mia_latency_event
```

Client

```
mia_recommendation_shown

↓

offer_click

↓

favorite_created

↓

price_alert_created
```

---

# Taxonomias oficiais

Runtime

- LEGACY
- CONTROLLED
- SHADOW
- UNKNOWN

Search Path

- DATA_LAYER_ONLY
- PROVIDER_ONLY
- HYBRID
- FALLBACK
- UNKNOWN

Offer Pipeline Status

- SUCCESS
- PARTIAL
- EMPTY
- FAILED
- NOT_EXECUTED
- UNKNOWN

Termination Stage

- RAW
- NORMALIZATION
- MERGE
- DEDUP
- RANKING
- SELECTION
- DELIVERY
- UNKNOWN
- NOT_APPLICABLE

---

# Regras permanentes

A Fase 8 estabelece as seguintes regras permanentes para Analytics Comercial.

## Analytics nunca decide

Analytics nunca influencia:

- ranking;
- providers;
- Data Layer;
- winner;
- fallback;
- merge;
- deduplicação.

---

## Fire-and-forget obrigatório

Persistência nunca bloqueia:

- resposta;
- frontend;
- API.

Falhas analíticas nunca quebram a experiência do usuário.

---

## Winner apenas observado

Analytics nunca recalcula:

- score;
- ranking;
- winner.

Sempre utiliza a decisão já tomada pela MIA.

---

## Um domínio por evento

8.1

Busca Comercial

8.2

Providers

8.3

Ofertas

7.x

Outcome

Frontend

Interações

Nunca duplicar responsabilidades.

---

## Privacidade

Nunca persistir:

- prompts;
- conversa;
- payload bruto;
- URLs completas;
- tokens;
- API Keys;
- Access Tokens;
- Refresh Tokens;
- cookies;
- headers;
- dados pessoais;
- listas completas de ofertas.

---

# SQL oficiais

Commercial Search

Dashboards de busca.

Provider Analytics

Q1–Q6

Offer Analytics

Q1–Q7

Todos validados em produção.

---

# Produção

Todos os patches foram:

- implementados;
- auditados;
- testados;
- integrados;
- publicados;
- validados em produção;
- documentados.

Health

```
200
```

Deploy

```
Ready
```

---

# Testes executados

PATCH 8.1

60/60

PATCH 8.2

45/45

PATCH 8.3

39/39

PATCH 8.4

66/66

SQL

49/49

Produção

15/15

Todas as regressões aprovadas.

---

# Overhead

A arquitetura foi desenhada para produzir baixo impacto.

Social

0 eventos comerciais.

Busca Data Layer

1 evento de busca.

N providers

N eventos de provider.

Resposta comercial

1 Offer Set.

Volume considerado adequado para produção.

---

# Limitações conhecidas

Não bloqueantes.

- delay aproximado do fire-and-forget;
- ausência de request_id em eventos frontend;
- selected_offers_count indisponível em alguns paths;
- alguns providers sem frete ou parcelamento;
- provenance parcial após merge;
- impressão depende do frontend.

Nenhuma dessas limitações altera a lógica comercial.

---

# Operação futura

Ao adicionar um novo provider:

1. atualizar Provider Registry;
2. atualizar catálogos;
3. atualizar SQL;
4. atualizar documentação.

Ao adicionar novos Analytics:

- nunca duplicar responsabilidades;
- manter request_id;
- manter fire-and-forget;
- atualizar EVENT_CONTRACT;
- atualizar CHANGELOG;
- validar produção.

---

# Resultado da Fase 8

A MIA agora possui observabilidade completa do pipeline comercial.

É possível reconstruir analiticamente:

- busca;
- Data Layer;
- providers;
- fallback;
- ofertas;
- winner;
- resposta;
- erro;
- latência;
- interação.

Tudo isso sem alterar qualquer decisão tomada pela MIA.

---

# Veredito Final

Status

🟢 FASE 8 — CONCLUÍDA

A Commercial Intelligence Analytics encontra-se estável, validada em produção, documentada e pronta para servir de base às próximas fases do Analytics da MIA.