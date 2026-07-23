# Commercial Search Analytics — PATCH 8.1

**Fase 8 · Commercial Analytics**  
**Evento:** `mia_commercial_search` · `event_version: 8.1.0`  
**SQL:** [analytics-commercial-search.sql](./analytics-commercial-search.sql)

---

## 1. Objetivo

Responder:

- A requisição entrou no pipeline comercial?
- Qual query foi processada (sanitizada)?
- Qual caminho de busca foi utilizado?
- A busca foi executada?
- Houve resultados utilizáveis?

---

## 2. Delta vs fases anteriores

| Evento | Escopo |
|--------|--------|
| `mia_question_sent` | Frontend — intenção declarada |
| `data_layer_resolution` (6.4) | Efetividade Data Layer |
| `mia_response_outcome` (7.1) | Outcome HTTP final |
| **`mia_commercial_search` (8.1)** | **Pipeline de busca comercial server-side** |

Correlação: `request_id`.

---

## 3. Privacidade

- Queries sanitizadas (máx. **280 caracteres**)
- Mascaramento: email, telefone, CPF, URL
- Sem headers, tokens, cookies, corpo completo da conversa

---

## 4. Taxonomias

Centralizadas em `lib/miaCommercialSearchCatalog.js`.

---

## 5. SQL

| Query | Objetivo |
|-------|----------|
| Q1 | Volume e taxa de execução |
| Q2 | Extração e transformação de query |
| Q3 | Caminhos da busca |
| Q4 | Resultado da busca |
| Q5 | Correlação diagnóstica (audit) |

---

## 6. Limitações

- Amostra inicial pequena
- `results_count` = produtos/candidatos comerciais pós-ranking (não ofertas individuais)
- Sem detalhes de provider (PATCH 8.2)
- Queries truncadas/sanitizadas — dashboards agregados apenas
- Diferença **search success** vs **response success** (7.1)

---

*PATCH 8.1 — Commercial Search Analytics*
