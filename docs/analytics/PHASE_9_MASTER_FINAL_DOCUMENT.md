# PHASE_9_MASTER_DOCUMENT.md

> Documento mestre consolidado da Fase 9, baseado nas implementações, auditorias, testes e evidências de produção registradas nos PATCHES 9.0 a 9.5. 

---

# FASE 9 — DECISION ANALYTICS

## Documento Mestre Final

**Projeto:** MIA / Teilor
**Fase:** 9 — Decision Analytics
**Status:** 🟢 Encerrada e aprovada
**Último patch:** PATCH 9.5 — Auditoria Final da Fase 9
**Ambiente validado:** Produção
**URL:** `https://economia-ai.vercel.app`
**Health final:** `200`
**Build final auditado:** `70f7e3399ee1`

---

# 1. Visão geral

A Fase 9 implementou a camada de Analytics responsável por observar a jornada completa de decisão comercial da MIA.

Antes desta fase, a arquitetura já conseguia observar:

* entrada comercial;
* execução da busca;
* tentativas de providers;
* pipeline de ofertas;
* resultados, erros, latência e saúde operacional.

A Fase 9 passou a responder o que acontece depois que a MIA consolida uma decisão:

```text
decisão
→ renderização da recomendação
→ sinais de aceitação
→ rejeição ou refinamento
→ solicitação de alternativas
→ interação com runner-up
→ substituição do winner
→ recuperação do fluxo
```

A fase foi construída de forma estritamente observacional.

Nenhum patch da Fase 9 passou a controlar:

* ranking;
* seleção;
* winner;
* runner-up;
* filtros;
* constraints;
* routing;
* providers;
* cards;
* Response Builder;
* conteúdo verbal da resposta.

A inteligência permaneceu pertencendo à arquitetura da MIA.

O Analytics apenas observa e registra os contratos já produzidos pela inteligência existente.

---

# 2. Roadmap executado

```text
🟢 PATCH 9.0 — Auditoria da Arquitetura de Decisão
🟢 PATCH 9.1 — Recommendation Decision Outcomes
🟢 PATCH 9.2 — Recommendation Acceptance Signals
🟢 PATCH 9.3 — Recommendation Rejection and Abandonment Signals
🟢 PATCH 9.4 — Runner-up and Alternative Analytics
🟢 PATCH 9.5 — Auditoria Final da Fase 9
```

Todos os patches foram:

```text
implementados
→ auditados
→ testados
→ integrados
→ implantados
→ validados em produção
→ verificados por SQL
→ submetidos a regressões
→ documentados
→ aprovados
```

---

# 3. Princípios arquiteturais preservados

A Fase 9 respeitou integralmente os princípios centrais do projeto:

```text
MIA owns the intelligence.
LLM verbalizes.
Analytics observes.
```

Regras preservadas:

* não recalcular ranking dentro do Analytics;
* não recalcular winner;
* não recalcular runner-up;
* não alterar decisões;
* não inferir comportamento sem evidência;
* não usar ausência de clique como rejeição;
* não usar silêncio como abandono;
* não tratar alternativa solicitada como alternativa selecionada;
* não tratar segundo card como runner-up cognitivo;
* não tratar segunda oferta como runner-up;
* não transformar sinal analítico em regra de produto;
* manter as emissões fire-and-forget;
* preservar privacidade;
* utilizar taxonomias fechadas;
* correlacionar eventos por IDs seguros;
* não persistir conteúdo textual sensível.

---

# 4. Arquitetura geral da Fase 9

```text
Decision Engine
chat-gpt4o.js

        ↓

observeDecisionAnalyticsForStabilizedContext()

        ↓

PATCH 9.1
mia_recommendation_decision
versão 9.1.0

        ↓
inline recommendation_decision_analytics
        ↓
MIAChat.jsx

        ├────────────────────────────────────────┐
        ↓                                        ↓
PATCH 9.2                                PATCH 9.3
Acceptance Signals                      Rejection Signals
mia_recommendation_                     mia_recommendation_
acceptance_signal                       rejection_signal
9.2.0                                   9.3.0

        └──────────────────┬─────────────────────┘
                           ↓

PATCH 9.4
Runner-up and Alternative Analytics
camada derivada 9.4.0

                           ↓

SQL, métricas, auditoria,
dashboards e evidências
```

---

# 5. Unidade central de correlação

A unidade central da Fase 9 é:

```text
decision_request_id
```

Esse identificador representa a decisão comercial original à qual os sinais posteriores pertencem.

Outros IDs utilizados:

```text
request_id
decision_request_id
previous_decision_request_id
replacement_decision_request_id
signal_request_id
session_id
source_event_id
acceptance_signal_id
```

## 5.1 Significado dos IDs

### `request_id`

Identifica uma requisição ou turno específico.

No evento 9.1, também representa o identificador da decisão estabilizada.

### `decision_request_id`

Identifica a decisão comercial à qual um sinal posterior está associado.

É o principal hub de correlação entre:

* decisão;
* renderização;
* clique;
* favorito;
* alerta;
* follow-up;
* rejeição;
* refinamento;
* alternativa;
* replacement;
* recovery.

### `previous_decision_request_id`

Identifica a decisão anterior em uma transição entre decisões.

### `replacement_decision_request_id`

Identifica a decisão que substituiu a decisão anterior.

### `source_event_id`

Identifica o evento de origem que gerou determinado sinal analítico.

Ajuda a preservar múltiplas interações legítimas sem duplicação acidental.

### `session_id`

Permite analisar continuidade dentro da mesma sessão.

Não substitui `decision_request_id`.

---

# 6. Matriz de responsabilidades

| Camada    | Responsabilidade principal                                     | O que não faz                              | Execução        |
| --------- | -------------------------------------------------------------- | ------------------------------------------ | --------------- |
| PATCH 9.1 | Observar a decisão consolidada                                 | Não observa interação do usuário           | Server          |
| PATCH 9.2 | Observar sinais positivos posteriores                          | Não registra rejeição                      | Client + Server |
| PATCH 9.3 | Observar rejeição, refinamento, substituição e saída explícita | Não infere abandono por silêncio           | Server          |
| PATCH 9.4 | Interpretar runner-up e alternativas sobre 9.1–9.3             | Não cria novo ranking ou evento redundante | Server + SQL    |
| PATCH 9.5 | Auditar e consolidar a fase                                    | Não cria funcionalidades                   | Auditoria       |

---

# 7. PATCH 9.0 — Auditoria da Arquitetura de Decisão

## 7.1 Objetivo

Mapear como a MIA consolida uma decisão antes de criar Analytics sobre ela.

## 7.2 Descobertas principais

A decisão não existe em um único ponto isolado.

Ela é resultado da composição entre:

* routing;
* Data Layer;
* providers;
* candidatos;
* ranking;
* filtros;
* constraints;
* selected best product;
* display products;
* Response Builder.

A auditoria confirmou que:

* a MIA possui a inteligência da decisão;
* o LLM não é a autoridade do ranking;
* o Response Builder é downstream;
* o Analytics deveria observar a decisão somente após sua estabilização;
* o winner não poderia ser recalculado pela camada analítica;
* runner-up, ranking e display precisavam ser tratados como conceitos distintos.

## 7.3 Resultado

Foi definida a base arquitetural para o evento:

```text
mia_recommendation_decision
```

---

# 8. PATCH 9.1 — Recommendation Decision Outcomes

## 8.1 Objetivo

Observar a decisão final estabilizada da MIA.

## 8.2 Evento

```text
event_name: mia_recommendation_decision
event_version: 9.1.0
category: recommendation_decision
```

## 8.3 Responsabilidade

Registrar:

* existência de decisão válida;
* winner;
* runner-up quando observável;
* origem da decisão;
* ranking agregado;
* score;
* score gap;
* constraints;
* routing;
* runtime mode;
* quantidade de candidatos;
* estado da decisão.

## 8.4 Fontes de decisão

Taxonomia implementada:

```text
COGNITIVE_PRIMARY
COMMERCIAL_ONLY_FALLBACK
NO_RESULT
LEGACY_LLM
```

## 8.5 Helper central

```text
observeDecisionAnalyticsForStabilizedContext()
```

Esse helper observa o contexto somente após a decisão estar estabilizada.

## 8.6 Deduplicação

```text
request_id + event_name + event_version
```

## 8.7 Fire-and-forget

A emissão analítica não bloqueia:

* HTTP;
* resposta;
* ranking;
* routing;
* seleção;
* frontend.

## 8.8 Privacidade

Não são persistidos:

* query;
* mensagem;
* resposta;
* título;
* URL;
* lista de ranking;
* payload bruto;
* PII.

## 8.9 Correção realizada durante o patch

O campo:

```text
winner_present
```

deixou de depender obrigatoriamente da existência de `familyKey`.

Uma decisão pode possuir winner válido mesmo quando determinada forma de identidade não está disponível.

## 8.10 Produção

Commits:

```text
implementação: 2585c8e
evidência: c60b4df
```

Validação:

```text
health: 200
smoke: 15/15
SQL: 5/5
unitários: 54/54
regressões 8.x: 210/210
```

---

# 9. PATCH 9.2 — Recommendation Acceptance Signals

## 9.1 Objetivo

Observar sinais positivos posteriores à decisão.

## 9.2 Arquitetura escolhida

Modelo híbrido.

Os eventos existentes de frontend foram preservados:

```text
mia_recommendation_shown
offer_click
favorite_created
price_alert_created
```

Foi criada uma camada agregada específica:

```text
mia_recommendation_acceptance_signal
```

## 9.3 Evento

```text
event_name: mia_recommendation_acceptance_signal
event_version: 9.2.0
category: recommendation_acceptance_signal
```

## 9.4 Responsabilidade

Interpretar eventos existentes como sinais de aceitação relacionados a uma decisão específica.

## 9.5 Tipos de sinal

```text
RECOMMENDATION_RENDERED
WINNER_OFFER_CLICKED
ALTERNATIVE_OFFER_CLICKED
PRODUCT_FAVORITED
PRICE_ALERT_CREATED
WINNER_FOLLOW_UP
PRICE_REQUESTED
STORE_REQUESTED
PRODUCT_DETAIL_REQUESTED
COMPARISON_REQUESTED
RECOMMENDATION_REVISITED
RUNNER_UP_FOLLOW_UP
```

Tipos reservados ou deliberadamente não emitidos:

```text
PURCHASE_CONFIRMED
```

A MIA não deve registrar compra confirmada sem evidência real de compra.

## 9.6 Força do sinal

```text
WEAK
MEDIUM
STRONG
CONFIRMED
```

`CONFIRMED` permanece reservado.

## 9.7 Alvo

```text
WINNER
RUNNER_UP
ALTERNATIVE
OFFER_ONLY
DECISION_GENERIC
UNKNOWN
```

## 9.8 Correlação

Método principal:

```text
REQUEST_ID → HIGH
```

Métodos reservados:

```text
SESSION_PRODUCT_WINDOW
SESSION_SEQUENCE
UNRESOLVED
```

Nos fluxos comerciais testados em produção, a correlação observada foi:

```text
HIGH
```

## 9.9 Janelas temporais

```text
same_turn
up_to_1_min
up_to_5_min
up_to_30_min
same_session
later
```

Posteriormente compartilhadas com 9.3 e 9.4:

```text
next_session
unknown
```

## 9.10 Deduplicação

```text
decision_request_id
+ signal_type
+ signal_target
+ source_event_id
+ event_version
```

Cada interação legítima recebe seu próprio identificador.

Cliques repetidos não são necessariamente colapsados se representam eventos reais diferentes.

## 9.11 Propagação frontend

O PATCH 9.2 implementou a propagação determinística de:

```text
request_id
decision_request_id
```

entre:

* resposta HTTP;
* metadata inline;
* contexto do frontend;
* eventos client-side.

## 9.12 Produção

Commits:

```text
implementação: cc72675
evidência: 4da680d
```

Resultados:

```text
health: 200
smoke: 17/17
SQL: 8/8
unitários: 51/51 inicialmente
suite final atualizada: 52/52
regressões: aprovadas
```

---

# 10. PATCH 9.3 — Recommendation Rejection and Abandonment Signals

## 10.1 Objetivo

Observar sinais negativos ou de mudança de direção sem inferências artificiais.

O patch distingue:

* rejeição;
* refinamento;
* substituição;
* solicitação de alternativa;
* postergação;
* abandono explícito;
* saída do fluxo;
* casos inconclusivos.

## 10.2 Evento

```text
event_name: mia_recommendation_rejection_signal
event_version: 9.3.0
category: recommendation_rejection_signal
```

## 10.3 Arquitetura

Modelo híbrido com:

* emissão server-side em turnos conversacionais;
* observação de transição entre decisões;
* métricas derivadas por SQL;
* nenhuma infraestrutura de abandono por silêncio.

## 10.4 Classes principais

```text
REJECTION
REFINEMENT
SUBSTITUTION
ABANDONMENT
FLOW_EXIT
INCONCLUSIVE
UNKNOWN
```

## 10.5 Evidência

```text
EXPLICIT
STRONG
MODERATE
WEAK
INCONCLUSIVE
UNKNOWN
```

Regra crítica:

```text
ausência de interação nunca gera rejeição
```

## 10.6 Rejeição explícita

Exemplos:

```text
EXPLICIT_REJECTION
PRICE_REJECTION
PURCHASE_ABANDONED_EXPLICITLY
```

Flags:

```text
rejection_explicit: true
```

## 10.7 Refinamento

Exemplos:

```text
BUDGET_REFINEMENT
BRAND_REFINEMENT
FEATURE_REFINEMENT
CATEGORY_REFINEMENT
```

Flags:

```text
rejection_explicit: false
refinement_present: true
```

Um refinamento não é automaticamente uma rejeição.

## 10.8 Alternativa solicitada

```text
ALTERNATIVE_REQUESTED
RUNNER_UP_FOLLOW_UP
ALTERNATIVE_FOLLOW_UP
```

Solicitação de alternativa é classificada como:

```text
INCONCLUSIVE
```

Ela não entra automaticamente na taxa oficial de rejeição.

## 10.9 Substituição

O PATCH 9.3 observa a sequência:

```text
decisão anterior
→ nova decisão
→ winner substituído
```

Sinal:

```text
WINNER_REPLACED
```

Helper:

```text
observeRejectionSignalFromDecisionTransition()
```

## 10.10 Alvos

```text
WINNER
RUNNER_UP
ALTERNATIVE
OFFER
DECISION_GENERIC
COMMERCIAL_FLOW
UNKNOWN
```

## 10.11 Correlação

```text
REQUEST_ID → HIGH
DECISION_TRANSITION → HIGH
SESSION_LIFECYCLE → MEDIUM
UNRESOLVED → fora das métricas oficiais
```

## 10.12 Abandono

Implementado:

```text
PURCHASE_ABANDONED_EXPLICITLY
COMMERCIAL_FLOW_EXITED
PURCHASE_POSTPONED
```

Não implementado:

```text
abandono por silêncio
abandono por no-click
session timeout
beforeunload
```

## 10.13 Deduplicação

```text
decision_request_id
| request_id
| signal_type
| signal_target
| source_event_id
| event_version
```

Sinais distintos são preservados.

Exemplo:

```text
price rejection
→ budget refinement
→ winner replaced
```

## 10.14 Correção de session context

Foi identificado que:

```text
buildSessionContext
```

descartava:

```text
lastRecommendationDecisionRequestId
```

Isso impedia correlação confiável nos follow-ups.

Correção aplicada no commit:

```text
bbd9328
```

## 10.15 Produção

Commits:

```text
implementação: e117854
session context fix: bbd9328
evidências: 755590c
```

Resultados:

```text
build: bbd93286c96d
health: 200
smoke: 17/17
SQL: 10/10
unitários: 58/58
regressões: aprovadas
```

---

# 11. PATCH 9.4 — Runner-up and Alternative Analytics

## 11.1 Objetivo

Interpretar o papel do runner-up e das alternativas dentro da jornada de decisão.

## 11.2 Decisão arquitetural

Nenhum evento novo foi criado.

Foi adotado o:

```text
Modelo híbrido derivado
```

Composição:

1. enriquecimento additive do evento 9.1;
2. interpretação dos sinais 9.2;
3. interpretação dos sinais 9.3;
4. outcomes derivados por SQL;
5. propagação mínima de identidade no frontend e sessão.

## 11.3 Autoridade oficial do runner-up

```text
resolveWinnerAndRunnerUpRanks(
  rankedProducts,
  selectedBestProduct
)
```

Arquivo:

```text
lib/miaRecommendationDecisionClassifier.js
```

Fonte:

```text
RANKED_PRODUCTS_SCAN
```

O runner-up é o segundo candidato elegível family-aware do ranking consolidado.

Não são usados como fallback silencioso:

```text
displayProducts[1]
body.prices[1]
lastRankingSnapshot[1]
```

## 11.4 Definições

### Winner cognitivo

Produto consolidado como decisão principal.

Fonte:

```text
selectedBestProduct
```

### Runner-up cognitivo

Segundo candidato elegível no ranking consolidado, respeitando identidade de família.

### Segundo card exibido

Segundo produto em `displayProducts`.

Pode divergir do runner-up cognitivo.

### Segunda oferta

Segunda oferta presente em `body.prices`.

Não representa automaticamente um segundo produto.

### Alternativa solicitada

Opção pedida pelo usuário.

Não representa seleção.

### Alternativa selecionada

Alternativa que recebe evidência confiável de interesse.

Exemplos:

* clique;
* favorito;
* alerta;
* follow-up direcionado;
* replacement.

### Runner-up selecionado

Alternativa selecionada cuja identidade corresponde com confiança alta ao runner-up da decisão original.

## 11.5 Campos adicionados ao evento 9.1

```text
runner_up_product_family
runner_up_provider
runner_up_valid
runner_up_identity_available
runner_up_in_ranking
runner_up_in_display_products
runner_up_in_delivery
display_second_card_is_cognitive_runner_up
score_gap_bucket
runner_up_competitiveness
same_family
same_brand
same_category
same_provider
alternative_diversity_class
```

## 11.6 Identidade segura

Identidades reutilizadas:

```text
winner_product_family
runner_up_product_family
product_family_hash
offer_fingerprint
product_id
provider_id
category
```

Helpers:

```text
lib/miaRecommendationAlternativeClassifier.js
lib/miaOfferIdentity.js
```

## 11.7 Match entre alternativa e runner-up

Métodos:

```text
EXACT_FAMILY_MATCH
SAFE_PRODUCT_ID_MATCH
OFFER_TO_PRODUCT_MATCH
PROVIDER_CATEGORY_MATCH
PARTIAL_MATCH
NO_MATCH
UNRESOLVED
```

Confiança:

```text
HIGH
MEDIUM
LOW
UNRESOLVED
```

Regras:

* family hash compatível → HIGH;
* product ID seguro → HIGH;
* offer ligado a produto → HIGH ou MEDIUM;
* provider + categoria → LOW;
* posição visual isolada → não determinística;
* identidade insuficiente → UNRESOLVED.

## 11.8 Score gap

O score gap é reutilizado do 9.1.

Não é recalculado.

Buckets:

```text
TIE          ≤ 0
VERY_CLOSE   ≤ 2
CLOSE        ≤ 5
MODERATE     ≤ 10
WIDE         > 10
UNKNOWN      sem score comparável
```

## 11.9 Competitividade

```text
EQUIVALENT
HIGHLY_COMPETITIVE
COMPETITIVE
DISTANT
NOT_COMPARABLE
UNKNOWN
```

## 11.10 Diversidade

Flags observáveis:

```text
same_family
same_brand
same_category
same_provider
```

Classes:

```text
SAME_FAMILY_VARIANT
SAME_BRAND_DIFFERENT_FAMILY
DIFFERENT_BRAND_SAME_CATEGORY
DIFFERENT_PRICE_TIER
DIFFERENT_FEATURE_PROFILE
OFFER_ONLY
UNKNOWN
```

## 11.11 Funil do runner-up

```text
runner-up exists
→ runner-up in display
→ runner-up in delivery
→ runner-up rendered
→ runner-up interacted
→ runner-up selected
→ runner-up became winner
```

Cada etapa possui evidência independente.

## 11.12 Runner-up que se torna winner

Sequência:

```text
decision A
winner A
runner-up A

        ↓

decision B
winner B = runner-up A
```

Somente classificada quando:

* decisões correlacionadas;
* identidade segura;
* match confiável;
* transição observável.

## 11.13 Alternativa não runner-up

Quando:

```text
winner B ≠ runner-up A
```

mas a nova decisão pertence à continuidade do fluxo, o outcome pode ser:

```text
NON_RUNNER_UP_REPLACEMENT
```

Isso não significa automaticamente falha do runner-up.

Pode representar mudança de necessidade.

## 11.14 Recuperação

Classificações:

```text
RECOVERED_BY_RUNNER_UP
RECOVERED_BY_OTHER_ALTERNATIVE
RECOVERED_BY_NEW_SEARCH
NOT_RECOVERED
UNRESOLVED
```

## 11.15 Produção

Commits:

```text
implementação: 1a73a05
SQL fix: 55f784d
evidências: ba7883c / 70f7e33
```

Resultados:

```text
build: 1a73a053dc28
health: 200
smoke: 8/8
SQL: 12/12
unitários: 47/47
```

---

# 12. PATCH 9.5 — Auditoria Final da Fase 9

## 12.1 Objetivo

Auditar:

* arquitetura;
* contratos;
* taxonomias;
* correlação;
* SQL;
* privacidade;
* performance;
* produção;
* regressões;
* documentação;
* backlog.

## 12.2 Resultado arquitetural

A Fase 9 observa a jornada completa:

```text
Decision
→ Recommendation Render
→ Acceptance
→ Rejection / Refinement
→ Alternative Request
→ Runner-up
→ Replacement
→ Recovery
```

## 12.3 Correção bloqueante

Foi identificado um erro na query:

```text
patch-94-query8-recovery.sql
```

A query relacionava aceitação posterior à:

```text
prior_decision
```

quando deveria relacioná-la à:

```text
replacement_decision
```

Isso poderia produzir métricas incorretas de recuperação.

A correção foi aplicada e validada.

## 12.4 Resultado final da auditoria

```text
SQL total executado: 38/38
Regressões totais: 421/421
Privacy scan: 0 leaks em 300 eventos
Smoke: 17/17
Health: 200
```

## 12.5 Commits finais

```text
auditoria: 1a29ac9
evidência: 8e081a9
```

## 12.6 Build final

```text
70f7e3399ee1
```

---

# 13. Contratos oficiais

## 13.1 `mia_recommendation_decision`

```text
event_name: mia_recommendation_decision
event_version: 9.1.0
category: recommendation_decision
```

Responsabilidade:

* registrar decisão estabilizada;
* winner;
* runner-up;
* scores;
* constraints;
* decision source;
* routing/runtime;
* enrichment 9.4.

Dedup:

```text
request_id + event_name + event_version
```

Execução:

```text
server-side
```

## 13.2 `mia_recommendation_acceptance_signal`

```text
event_name: mia_recommendation_acceptance_signal
event_version: 9.2.0
category: recommendation_acceptance_signal
```

Responsabilidade:

* sinais positivos;
* interações;
* follow-ups;
* interesse em winner, runner-up ou alternativa.

Dedup:

```text
decision_request_id
+ signal_type
+ signal_target
+ source_event_id
+ event_version
```

Execução:

```text
client + server
```

## 13.3 `mia_recommendation_rejection_signal`

```text
event_name: mia_recommendation_rejection_signal
event_version: 9.3.0
category: recommendation_rejection_signal
```

Responsabilidade:

* rejeição;
* refinamento;
* substituição;
* postergação;
* saída explícita;
* abandono observável;
* transição entre decisões.

Dedup:

```text
decision_request_id
+ request_id
+ signal_type
+ signal_target
+ source_event_id
+ event_version
```

Execução:

```text
server-side
```

## 13.4 Camada 9.4

Versão conceitual:

```text
9.4.0
```

Não possui evento próprio.

Utiliza:

* campos additive no 9.1;
* sinais existentes no 9.2;
* sinais existentes no 9.3;
* SQL derivado.

---

# 14. Taxonomias consolidadas

## 14.1 Decision source

```text
COGNITIVE_PRIMARY
COMMERCIAL_ONLY_FALLBACK
NO_RESULT
LEGACY_LLM
```

## 14.2 Acceptance strength

```text
WEAK
MEDIUM
STRONG
CONFIRMED
```

## 14.3 Rejection evidence

```text
EXPLICIT
STRONG
MODERATE
WEAK
INCONCLUSIVE
UNKNOWN
```

## 14.4 Signal targets

```text
WINNER
RUNNER_UP
ALTERNATIVE
OFFER
OFFER_ONLY
DECISION_GENERIC
COMMERCIAL_FLOW
UNKNOWN
```

## 14.5 Time buckets

```text
same_turn
up_to_1_min
up_to_5_min
up_to_30_min
same_session
next_session
later
unknown
```

## 14.6 Score gap

```text
TIE
VERY_CLOSE
CLOSE
MODERATE
WIDE
UNKNOWN
```

## 14.7 Runner-up competitiveness

```text
EQUIVALENT
HIGHLY_COMPETITIVE
COMPETITIVE
DISTANT
NOT_COMPARABLE
UNKNOWN
```

## 14.8 Alternative relationship

```text
COGNITIVE_RUNNER_UP
DISPLAYED_RUNNER_UP
DISPLAYED_ALTERNATIVE
OFFER_ALTERNATIVE
REQUESTED_ALTERNATIVE
SELECTED_RUNNER_UP
SELECTED_ALTERNATIVE
REPLACEMENT_WINNER
NON_RUNNER_UP_REPLACEMENT
UNRESOLVED_ALTERNATIVE
NO_ALTERNATIVE
UNKNOWN
```

## 14.9 Recovery

```text
RECOVERED_BY_RUNNER_UP
RECOVERED_BY_OTHER_ALTERNATIVE
RECOVERED_BY_NEW_SEARCH
NOT_RECOVERED
UNRESOLVED
```

---

# 15. Métricas oficiais

## 15.1 Decision validity rate

```text
decisões válidas
/
eventos de decisão elegíveis
```

## 15.2 Acceptance rate

```text
decisões com sinal positivo elegível
/
decisões entregues elegíveis
```

A métrica deve ser segmentada por força e alvo.

## 15.3 Explicit rejection rate

```text
decisões com rejeição explícita
/
decisões válidas elegíveis
```

## 15.4 Refinement rate

```text
decisões com refinamento
/
decisões válidas elegíveis
```

## 15.5 Replacement rate

```text
decisões substituídas
/
decisões válidas com continuidade observável
```

## 15.6 Observed abandonment rate

```text
decisões com abandono explícito ou lifecycle observável
/
decisões elegíveis para lifecycle observável
```

Não inclui silêncio.

## 15.7 Price rejection rate

```text
decisões com PRICE_REJECTION
/
decisões válidas elegíveis
```

Separada de:

```text
BUDGET_REFINEMENT
```

## 15.8 Runner-up availability rate

```text
decisões elegíveis com runner-up válido
/
decisões elegíveis
```

## 15.9 Runner-up display rate

```text
decisões com runner-up preparado para exibição
/
decisões com runner-up válido
```

## 15.10 Runner-up render rate

```text
decisões com runner-up renderizado
/
decisões com runner-up entregue
```

## 15.11 Runner-up interaction rate

```text
decisões com sinal válido no runner-up
/
decisões com runner-up renderizado
```

## 15.12 Runner-up selection rate

```text
decisões com sinal forte ou replacement pelo runner-up
/
decisões com runner-up válido e observável
```

## 15.13 Runner-up replacement rate

```text
decisões em que o runner-up virou winner posterior
/
decisões substituídas com runner-up identificável
```

## 15.14 Alternative request rate

```text
decisões com pedido válido de alternativa
/
decisões entregues elegíveis
```

## 15.15 Alternative recovery rate

```text
decisões rejeitadas ou refinadas recuperadas
/
decisões rejeitadas ou refinadas com continuidade observável
```

Segmentações:

```text
recovery por runner-up
recovery por outra alternativa
recovery por nova busca
```

---

# 16. SQL da Fase 9

## 16.1 PATCH 9.1

```text
Q1–Q5
```

Objetivos:

* decisões;
* validade;
* winner;
* runner-up;
* score;
* decision source;
* constraints;
* routing/runtime.

## 16.2 PATCH 9.2

```text
Q1–Q8
```

Objetivos:

* acceptance signals;
* força;
* target;
* renderização;
* clique;
* favorito;
* alerta;
* follow-up;
* correlação;
* tempo até interação.

## 16.3 PATCH 9.3

```text
Q1–Q10
```

Objetivos:

* rejeição explícita;
* refinamento;
* substituição;
* abandono observável;
* alternativa solicitada;
* recovery;
* motivos;
* targets;
* confiança;
* qualidade.

## 16.4 PATCH 9.4

```text
Q1 — runner-up availability
Q2 — score gap e competitividade
Q3 — ranking, display e delivery
Q4 — interações
Q5 — solicitações de alternativa
Q6 — seleção de runner-up
Q7 — alternativa não runner-up
Q8 — recuperação
Q9 — diversidade
Q10 — decision source e runtime
Q11 — qualidade do runner-up
Q12 — fan-out, órfãos e qualidade
```

## 16.5 Auditoria final

Total executado no PATCH 9.5:

```text
38/38 queries aprovadas
```

Composição:

```text
35 queries da Fase 9
+ 3 queries de amostra da Fase 8
```

---

# 17. Regras SQL

Todas as métricas oficiais devem:

* usar CTEs;
* pré-agregar sinais;
* trabalhar no nível de decisão;
* deduplicar por `decision_request_id`;
* preservar múltiplos `source_event_id`;
* evitar joins muitos-para-muitos;
* separar event count de decision count;
* aplicar `distinct` conscientemente;
* excluir `UNRESOLVED` quando necessário;
* usar denominadores elegíveis;
* não misturar escalas incompatíveis;
* possuir guards contra fan-out.

---

# 18. Privacidade

## 18.1 Dados proibidos na metadata da Fase 9

```text
query
prompt
mensagem
resposta
URL
título
imagem
descrição
ranking completo
lista de candidatos
payload bruto
cookie
token
header
PII
```

## 18.2 Dados permitidos

```text
UUIDs
hashes
family hashes
offer fingerprints
taxonomias
flags
scores aprovados
score gaps
categorias
providers
timestamps
correlation methods
confidence levels
counts
```

## 18.3 Auditoria final

Foram verificados:

```text
300 eventos
```

Resultado:

```text
0 leaks em metadata Phase 9
```

## 18.4 Residual conhecido

O allowlist legado do client ainda pode persistir:

```text
product_name
```

em colunas antigas do evento-base.

Esse ponto não pertence à metadata dos contratos 9.x e foi registrado como backlog.

---

# 19. Fire-and-forget

Todas as emissões analíticas seguem o princípio:

```javascript
void emitAnalytics(...).catch(() => {});
```

Falhas de Analytics não podem:

* alterar resposta;
* bloquear HTTP;
* alterar ranking;
* alterar winner;
* alterar runner-up;
* alterar routing;
* impedir cards;
* impedir cliques;
* impedir favoritos;
* impedir alertas;
* quebrar session context;
* modificar o Response Builder.

---

# 20. Deduplicação

## 20.1 9.1

```text
request_id + event_name + event_version
```

## 20.2 9.2

```text
decision_request_id
+ signal_type
+ signal_target
+ source_event_id
+ event_version
```

## 20.3 9.3

```text
decision_request_id
+ request_id
+ signal_type
+ signal_target
+ source_event_id
+ event_version
```

## 20.4 Limitação atual

O dedup de 9.2 e 9.3 utiliza armazenamento em memória no módulo.

Isso significa que ele não é necessariamente compartilhado entre:

* múltiplas instâncias;
* múltiplos processos;
* cold starts;
* execuções serverless diferentes.

Backlog recomendado:

```text
deduplicação DB-level
```

---

# 21. Testes consolidados

## 21.1 PATCH 9.1

```text
54/54
```

## 21.2 PATCH 9.2

```text
52/52
```

## 21.3 PATCH 9.3

```text
58/58
```

## 21.4 PATCH 9.4

```text
47/47
```

## 21.5 PATCH 9.5

```text
46/46
```

## 21.6 Regressões finais

```text
PATCH 8.1: 60/60
PATCH 8.2: 45/45
PATCH 8.3: 39/39
PATCH 8.4: 66/66
PATCH 9.1: 54/54
PATCH 9.2: 52/52
PATCH 9.3: 58/58
PATCH 9.4: 47/47
```

Total final:

```text
421/421
```

Nenhuma regressão permaneceu.

---

# 22. Produção final

## 22.1 Ambiente

```text
https://economia-ai.vercel.app
```

## 22.2 Health

```text
200
```

## 22.3 Build final

```text
70f7e3399ee1
```

## 22.4 Smoke final

```text
17/17
```

## 22.5 SQL final

```text
38/38
```

## 22.6 Cenários validados

* decisão comercial;
* decisão com winner;
* decisão com runner-up;
* metadata inline;
* persistência server-side;
* renderização;
* interação;
* refinamento;
* alternativa;
* follow-up;
* rejection signal;
* replacement;
* recovery;
* conversa social;
* domain gate;
* privacy scan;
* deduplicação;
* SQL;
* ausência de fan-out relevante.

---

# 23. Invariância funcional

A Fase 9 não alterou:

* candidate list;
* ranking;
* scores;
* score gap original;
* winner;
* runner-up;
* quantidade de cards;
* ordem de produtos;
* filtros;
* locks;
* constraints;
* Data Layer;
* providers;
* provider routing;
* session reset;
* conversation anchor;
* preços;
* links;
* favoritos;
* alertas;
* follow-ups;
* SECOND_BEST_DISCOVERY;
* nova busca;
* Response Builder;
* conteúdo verbal;
* frontend funcional.

A camada é observacional.

---

# 24. Problemas encontrados e corrigidos

## 24.1 Session context do PATCH 9.3

Problema:

```text
lastRecommendationDecisionRequestId
```

não era preservado corretamente.

Consequência:

follow-ups podiam perder correlação com a decisão anterior.

Correção:

```text
commit bbd9328
```

## 24.2 SQL do PATCH 9.4

Problemas corrigidos:

```text
percentile_cont exigia cast ::numeric
reference_day dependia de CTE sem created_at
Q6 possuía UNION sem GROUP BY adequado
```

Correção:

```text
commit 55f784d
```

## 24.3 Recovery Q8 no PATCH 9.5

Problema:

```text
acceptance_after
```

era associada à decisão anterior em vez da decisão substituta.

Correção:

```text
acceptance_after
→ replacement_decision
```

A métrica de recovery passou a representar a cadeia correta.

---

# 25. Limitações não bloqueantes

## 25.1 Abandono por silêncio

Não implementado por design.

A ausência de interação não é evidência suficiente de abandono.

## 25.2 Session lifecycle

Não existe infraestrutura completa para:

* timeout analítico;
* beforeunload;
* fim real de sessão;
* abandono operacional derivado.

## 25.3 SECOND_BEST_DISCOVERY

O fluxo utiliza:

```text
lastRankingSnapshot
```

com top-3 de display.

Pode divergir do runner-up cognitivo.

Também não emite evento 9.1 dedicado.

## 25.4 `recovered_after_rejection`

Campo atualmente não computado de forma completa.

Permanece:

```text
false
```

ou reservado.

Recovery oficial é derivado por SQL.

## 25.5 Taxonomias reservadas

Algumas categorias estão catalogadas, mas ainda não são emitidas.

Exemplos:

```text
BRAND_REJECTION
SESSION_ABANDONED_OBSERVED
PURCHASE_CONFIRMED
NEXT_SESSION
```

## 25.6 Ambiguidade client-side

No caminho client do 9.2:

```text
metadata.request_id
```

pode representar o `decision_request_id`.

A correlação funciona, mas a nomenclatura deve ser revisada futuramente.

## 25.7 Dedup cross-instance

Não existe deduplication persistente compartilhada entre instâncias.

## 25.8 Índices JSONB

As queries dependem de filtros em JSONB sem índice dedicado para todos os campos da Fase 9.

Aceitável no volume atual.

---

# 26. Limpeza recomendada

## 26.1 Helper no-op

```text
instrumentRecommendationDecisionAnalyticsForDelivery
```

Arquivo:

```text
lib/miaRecommendationDecisionAnalytics.js
```

Ação recomendada:

* documentar;
* renomear;
* ou remover em patch específico de limpeza.

## 26.2 Stub de renderização

```text
clientEventNameIsRender()
```

Arquivo:

```text
lib/miaRecommendationAcceptanceClassifier.js
```

Ação recomendada:

* implementar;
* ou remover caso não seja necessário.

## 26.3 CTE não utilizada

```text
dup_runner_up
```

Arquivo:

```text
patch-94-query12-quality-fanout.sql
```

Ação recomendada:

* conectar à query;
* ou remover.

## 26.4 Alias duplicado no frontend

```text
runnerUpProductFamilyHash
```

Arquivo:

```text
MIAChat.jsx
```

Ação recomendada:

* consolidar alias;
* preservar compatibilidade.

## 26.5 Documentação do PATCH 9.2

Atualizar referência ao:

```text
RUNNER_UP_FOLLOW_UP
```

que passou a ser observado após o PATCH 9.4.

## 26.6 Catálogos órfãos

Auditar categorias:

* nunca emitidas;
* apenas reservadas;
* utilizadas somente em testes;
* planejadas para SQL futuro.

Não removê-las sem auditoria de compatibilidade.

---

# 27. Backlog recomendado

## Prioridade 1 — Integridade analítica

### Dedup DB-level

Implementar proteção persistente para 9.2 e 9.3.

Possível base:

```text
event_name
event_version
dedup_key
```

com índice único ou mecanismo equivalente.

### Índices JSONB

Avaliar índices para:

```text
event_name
metadata->>'decision_request_id'
metadata->>'request_id'
metadata->>'replacement_decision_request_id'
metadata->>'signal_type'
metadata->>'signal_target'
```

## Prioridade 2 — Contratos

### `recovered_after_rejection`

Escolher entre:

* computar corretamente;
* remover em próxima versão de contrato;
* manter apenas como campo reservado documentado.

### Nomenclatura `request_id`

Eliminar ambiguidade entre:

* request do turno;
* decision request;
* source request.

## Prioridade 3 — Taxonomias

* emitir categorias realmente necessárias;
* remover categorias sem plano;
* documentar categorias reservadas;
* evitar catálogo maior que a capacidade observável.

## Prioridade 4 — SECOND_BEST_DISCOVERY

Avaliar:

* alinhamento ao runner-up cognitivo;
* snapshot próprio;
* decisão 9.1 dedicada;
* correlação com a decisão original.

Isso deve ser tratado como feature ou evolução arquitetural, não como correção de Analytics isolada.

## Prioridade 5 — Dashboards

Criar visualizações para:

* decision validity;
* acceptance;
* rejection;
* refinement;
* replacement;
* recovery;
* runner-up availability;
* score gap;
* competitiveness;
* runner-up uptake;
* alternative recovery;
* quality/fan-out.

---

# 28. Arquivos principais da Fase 9

## 28.1 Documentação

```text
docs/analytics/PHASE_9_MASTER_DOCUMENT.md
docs/analytics/PATCH_9_1_RECOMMENDATION_DECISION_OUTCOMES.md
docs/analytics/PATCH_9_2_RECOMMENDATION_ACCEPTANCE_SIGNALS.md
docs/analytics/PATCH_9_3_RECOMMENDATION_REJECTION_ABANDONMENT_SIGNALS.md
docs/analytics/PATCH_9_4_RUNNER_UP_ALTERNATIVE_ANALYTICS.md
docs/analytics/RECOMMENDATION_REJECTION_ABANDONMENT_ANALYTICS.md
docs/analytics/RUNNER_UP_ALTERNATIVE_ANALYTICS.md
docs/analytics/EVENT_CONTRACT.md
docs/analytics/ANALYTICS_CHANGELOG.md
docs/analytics/02_analytics_roadmap.md
```

## 28.2 Evidências

```text
docs/analytics/PATCH_9_3_PRODUCTION_EVIDENCE.json
docs/analytics/PATCH_9_4_PRODUCTION_EVIDENCE.json
docs/analytics/PATCH_9_5_FINAL_AUDIT_EVIDENCE.json
```

## 28.3 Bibliotecas principais

```text
lib/miaRecommendationDecisionClassifier.js
lib/miaRecommendationDecisionAnalytics.js
lib/miaRecommendationAcceptanceClassifier.js
lib/miaRecommendationRejectionCatalog.js
lib/miaRecommendationRejectionClassifier.js
lib/miaRecommendationRejectionCorrelation.js
lib/miaRecommendationRejectionTracker.js
lib/miaRecommendationRejectionAnalytics.js
lib/miaRecommendationAlternativeCatalog.js
lib/miaRecommendationAlternativeClassifier.js
lib/miaOfferIdentity.js
```

## 28.4 Frontend

```text
MIAChat.jsx
```

## 28.5 Pipeline principal

```text
chat-gpt4o.js
```

---

# 29. Commits consolidados

## PATCH 9.1

```text
2585c8e — implementação
c60b4df — evidência
```

## PATCH 9.2

```text
cc72675 — implementação
4da680d — evidência
```

## PATCH 9.3

```text
e117854 — implementação
bbd9328 — session context fix
755590c — evidência
```

## PATCH 9.4

```text
1a73a05 — implementação
55f784d — SQL fixes
ba7883c / 70f7e33 — evidências
```

## PATCH 9.5

```text
1a29ac9 — auditoria final
8e081a9 — evidência final
```

---

# 30. Critérios finais de aprovação

A Fase 9 foi considerada aprovada porque:

* a arquitetura foi auditada;
* as responsabilidades estão separadas;
* os eventos não possuem redundância indevida;
* a correlação está íntegra;
* o winner não é recalculado;
* o runner-up não é inferido pela posição visual;
* rejeição e refinamento são distintos;
* silêncio não é tratado como abandono;
* alternativa solicitada não é tratada como seleção;
* sinais 9.2 e 9.3 não são duplicados pelo 9.4;
* o SQL utiliza denominadores elegíveis;
* fan-out foi auditado;
* uma falha bloqueante em recovery foi corrigida;
* privacidade foi validada;
* produção foi validada;
* regressões foram aprovadas;
* documentação foi consolidada;
* evidência final foi criada.

---

# 31. Resumo operacional final

| Item             |              Resultado |
| ---------------- | ---------------------: |
| Fase             | 9 — Decision Analytics |
| Status           |           🟢 Encerrada |
| Eventos novos    |                      3 |
| Camada derivada  |                      1 |
| SQL final        |                  38/38 |
| Smoke final      |                  17/17 |
| Regressões       |                421/421 |
| Privacy scan     | 0 leaks em 300 eventos |
| Health           |                    200 |
| Build final      |         `70f7e3399ee1` |
| Commit auditoria |              `1a29ac9` |
| Commit evidência |              `8e081a9` |
| Documento mestre |                 Criado |
| Evidência final  |                 Criada |

---

# 32. Veredito técnico

A Fase 9 estabeleceu uma camada completa de Decision Analytics para a MIA.

A arquitetura agora consegue observar:

```text
o que a MIA decidiu;
qual produto venceu;
qual era o runner-up;
qual era a distância entre os candidatos;
se a recomendação foi entregue;
se o usuário demonstrou interesse;
se houve rejeição;
se houve refinamento;
se outra opção foi solicitada;
se o runner-up foi utilizado;
se o winner foi substituído;
se o fluxo foi recuperado;
e qual tipo de alternativa produziu essa recuperação.
```

Essa observabilidade foi adicionada sem transformar o Analytics em uma segunda inteligência de decisão.

O sistema continua seguindo:

```text
Decision Engine decide.
Analytics observes.
SQL measures.
Dashboards communicate.
```

As limitações restantes estão documentadas e não comprometem a integridade da fase.

---

# ENCERRAMENTO

```text
PATCH 9.0 — APROVADO
PATCH 9.1 — APROVADO
PATCH 9.2 — APROVADO
PATCH 9.3 — APROVADO
PATCH 9.4 — APROVADO
PATCH 9.5 — APROVADO
```

# 🟢 FASE 9 ENCERRADA E APROVADA
