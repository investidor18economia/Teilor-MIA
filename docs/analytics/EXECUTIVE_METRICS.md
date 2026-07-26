# Executive Metrics — Definições Canônicas (PATCH 4.1)

**Status:** Oficial — governança de métricas da Fase 4  
**Escopo:** métricas executivas derivadas de `public.analytics_events`  
**SQL:** [analytics-executive-dashboard.sql](./analytics-executive-dashboard.sql)  
**Fonte da verdade:** append-only · Event Contract v1 · Identity Layer · ADR-013

Este documento é a **referência única** para definições de métricas executivas. Nenhum dashboard SQL futuro (PATCH 4.2–4.6) pode utilizar definições divergentes.

---

## 1. Princípios permanentes

| Princípio | Regra |
|-----------|-------|
| Fonte única | `analytics_events` — sem tabelas auxiliares, snapshots, MVs ou cache |
| Escopo produção | Predicado de [analytics-production-scope.sql](./analytics-production-scope.sql) |
| Escopo MIA | Apenas os **7 eventos públicos** da allowlist (§2) |
| Fuso horário | **UTC** — `(created_at AT TIME ZONE 'UTC')::date` |
| Janelas WAU/MAU | **Rolling** — 7 e 30 dias inclusive no dia de referência |
| `session_id` | Nunca representa visitante, usuário, DAU, WAU ou MAU |
| Nomenclatura DAU | Sempre **`dau_visitors`** ou **`dau_users`** — nunca `dau` isolado |

---

## 2. Eventos qualificantes (atividade MIA)

Conjunto oficial — espelha `RETENTION_IDENTITY_EVENTS` em `lib/miaAnalyticsRetentionFoundation.js`:

| event_name | Papel |
|------------|-------|
| `session_started` | Abertura de aba MIA |
| `user_authenticated` | Login OTP verificado |
| `mia_question_sent` | Pergunta enviada |
| `mia_recommendation_shown` | Recomendação exibida |
| `offer_click` | Clique em oferta |
| `favorite_created` | Favorito criado |
| `price_alert_created` | Alerta de preço criado |

Eventos server-side (`price_drop_email_*`) **não** entram em métricas executivas MIA (decisão D7).

---

## 3. Métricas de alcance — Visitors

### 3.1 Active Visitor

| Campo | Valor |
|-------|-------|
| **Objetivo** | Medir visitantes distintos com atividade MIA em um período |
| **Definição oficial** | `visitor_id` com ≥1 evento qualificante no período, escopo produção |
| **Entidade** | `visitor_id` |
| **Fórmula** | `COUNT(DISTINCT visitor_id)` WHERE evento qualificante |
| **Limitações** | Pré-PATCH 3.1 sem `visitor_id`; multi-dispositivo = visitantes distintos; limpar storage = novo visitante |
| **Justificativa** | Identidade anônima persistente — base correta para alcance real (ADR-013, PATCH 3.6) |

### 3.2 DAU Visitors

| Campo | Valor |
|-------|-------|
| **Objetivo** | Visitantes ativos por dia civil UTC |
| **Definição oficial** | Active Visitors no dia de referência |
| **Entidade** | `visitor_id` |
| **Fórmula** | `COUNT(DISTINCT visitor_id)` WHERE `activity_day = ref_day` |
| **Alias SQL** | `dau_visitors` |
| **Limitações** | Mesmas de Active Visitor |
| **Justificativa** | Métrica diária padrão de produto — elimina inflação multi-aba de `session_id` |

### 3.3 WAU Visitors

| Campo | Valor |
|-------|-------|
| **Objetivo** | Visitantes ativos na janela rolling de 7 dias |
| **Definição oficial** | Active Visitors entre `ref_day - 6` e `ref_day` (inclusive) |
| **Entidade** | `visitor_id` |
| **Fórmula** | `COUNT(DISTINCT visitor_id)` WHERE `activity_day BETWEEN ref_day - 6 AND ref_day` |
| **Alias SQL** | `wau_visitors` |
| **Limitações** | Janela rolling, não semana calendário |
| **Justificativa** | Comparabilidade contínua dia a dia |

### 3.4 MAU Visitors

| Campo | Valor |
|-------|-------|
| **Objetivo** | Visitantes ativos na janela rolling de 30 dias |
| **Definição oficial** | Active Visitors entre `ref_day - 29` e `ref_day` (inclusive) |
| **Entidade** | `visitor_id` |
| **Fórmula** | `COUNT(DISTINCT visitor_id)` WHERE `activity_day BETWEEN ref_day - 29 AND ref_day` |
| **Alias SQL** | `mau_visitors` |
| **Limitações** | Janela rolling, não mês calendário |
| **Justificativa** | Idem WAU |

### 3.5 New Visitor

| Campo | Valor |
|-------|-------|
| **Objetivo** | Visitantes em seu primeiro dia de atividade |
| **Definição oficial** | `visitor_id` cujo `first_active_day = activity_day` |
| **Entidade** | `visitor_id` |
| **Fórmula** | `first_active_day = MIN((created_at AT TIME ZONE 'UTC')::date)` por `visitor_id` |
| **Alias SQL** | `new_visitors` |
| **Limitações** | Alinhado a `classifyVisitorLifecycle()` — estado `new` |
| **Justificativa** | Consistente com Retention Foundation PATCH 3.4 |

### 3.6 Returning Visitor

| Campo | Valor |
|-------|-------|
| **Objetivo** | Visitantes que retornam após o primeiro dia |
| **Definição oficial** | Active Visitors no dia com `first_active_day < activity_day` |
| **Entidade** | `visitor_id` |
| **Fórmula** | `dau_visitors - new_visitors` no dia |
| **Alias SQL** | `returning_visitors` |
| **Limitações** | Não distingue reativação pós-gap (Fase 5+) |
| **Justificativa** | Derivação sem persistir estado |

### 3.7 Anonymous Visitor

| Campo | Valor |
|-------|-------|
| **Objetivo** | Visitantes ativos que nunca autenticaram |
| **Definição oficial** | Active Visitor no período cujo `visitor_id` **nunca** possuiu evento com `user_id IS NOT NULL` em todo o histórico (escopo produção) |
| **Entidade** | `visitor_id` |
| **Fórmula** | Active Visitors EXCLUINDO visitantes presentes em `authenticated_visitors` |
| **Alias SQL** | `anonymous_visitors` |
| **Limitações** | Logout local não gera evento — visitante autenticado previamente pode voltar a aparecer como anônimo em atividade posterior |
| **Justificativa** | Separa alcance anônimo de autenticado (decisão D5-A) |

---

## 4. Métricas de alcance — Users

### 4.1 Active User

| Campo | Valor |
|-------|-------|
| **Objetivo** | Usuários autenticados distintos com atividade MIA |
| **Definição oficial** | `user_id` com ≥1 evento qualificante no período, escopo produção |
| **Entidade** | `user_id` |
| **Fórmula** | `COUNT(DISTINCT user_id)` WHERE `user_id IS NOT NULL` AND evento qualificante |
| **Limitações** | `offer_click` não envia `user_id` hoje — subcontagem possível |
| **Justificativa** | Identidade autenticada separada de visitante anônimo |

### 4.2 DAU Users

| Campo | Valor |
|-------|-------|
| **Objetivo** | Usuários autenticados ativos por dia civil UTC |
| **Definição oficial** | Active Users no dia de referência |
| **Entidade** | `user_id` |
| **Fórmula** | `COUNT(DISTINCT user_id)` WHERE `activity_day = ref_day` |
| **Alias SQL** | `dau_users` |
| **Limitações** | Mesmas de Active User |
| **Justificativa** | Par simétrico de `dau_visitors` (decisão D1-C) |

### 4.3 WAU Users

| Campo | Valor |
|-------|-------|
| **Objetivo** | Usuários autenticados na janela rolling de 7 dias |
| **Definição oficial** | Active Users entre `ref_day - 6` e `ref_day` (inclusive) |
| **Entidade** | `user_id` |
| **Fórmula** | `COUNT(DISTINCT user_id)` WHERE `activity_day BETWEEN ref_day - 6 AND ref_day` |
| **Alias SQL** | `wau_users` |
| **Limitações** | Idem WAU Visitors |
| **Justificativa** | Par simétrico de `wau_visitors` |

### 4.4 MAU Users

| Campo | Valor |
|-------|-------|
| **Objetivo** | Usuários autenticados na janela rolling de 30 dias |
| **Definição oficial** | Active Users entre `ref_day - 29` e `ref_day` (inclusive) |
| **Entidade** | `user_id` |
| **Fórmula** | `COUNT(DISTINCT user_id)` WHERE `activity_day BETWEEN ref_day - 29 AND ref_day` |
| **Alias SQL** | `mau_users` |
| **Limitações** | Idem MAU Visitors |
| **Justificativa** | Par simétrico de `mau_visitors` |

### 4.5 Authenticated User (marco)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Identificar marco de autenticação OTP |
| **Definição oficial** | Primeiro `user_authenticated` por `user_id`; fallback histórico: `MIN(created_at) WHERE user_id IS NOT NULL` |
| **Entidade** | `user_id` |
| **Fórmula** | `COUNT(DISTINCT user_id)` WHERE `event_name = 'user_authenticated'` no período |
| **Alias SQL** | `authenticated_users` (contagem de logins distintos no período) |
| **Limitações** | Histórico pré-PATCH 3.4 sem `user_authenticated` |
| **Justificativa** | Marco explícito PATCH 3.4 |

---

## 5. Métricas operacionais complementares

### 5.1 Sessões únicas

| Campo | Valor |
|-------|-------|
| **Objetivo** | Contar abas/sessões distintas — **não** visitantes |
| **Definição oficial** | `COUNT(DISTINCT session_id)` com evento qualificante |
| **Entidade** | `session_id` |
| **Alias SQL** | `sessoes_unicas` |
| **Limitações** | Multi-aba inflaciona; não substitui DAU |
| **Justificativa** | PATCH 1.1 — semântica preservada |

### 5.2 Conversas únicas

| Campo | Valor |
|-------|-------|
| **Objetivo** | Contar threads conversacionais distintas |
| **Definição oficial** | `COUNT(DISTINCT conversation_id)` WHERE `conversation_id IS NOT NULL` |
| **Entidade** | `conversation_id` |
| **Alias SQL** | `conversas_unicas` |
| **Limitações** | `conversation_id` não sobrevive reload |
| **Justificativa** | PATCH 3.2 |

### 5.3 Taxa de autenticação

| Campo | Valor |
|-------|-------|
| **Objetivo** | Proporção de visitantes ativos que autenticaram no período |
| **Definição oficial** | `COUNT(DISTINCT user_id WHERE event_name = 'user_authenticated') / dau_visitors` (ou equivalente no período) |
| **Entidade** | `user_id` / `visitor_id` |
| **Alias SQL** | `taxa_autenticacao` |
| **Limitações** | Denominador = visitantes; numerador = logins distintos — não implica 1:1 visitor→user |
| **Justificativa** | Decisão D6-A |

---

## 6. Dia de referência

| Conceito | Regra |
|----------|-------|
| **Dia de referência (snapshot)** | Último dia UTC com ≥1 evento qualificante com `visitor_id` |
| **activity_day** | `(created_at AT TIME ZONE 'UTC')::date` |
| **first_active_day** | `MIN(activity_day)` por `visitor_id` em eventos qualificantes |

---

## 7. Limitações consolidadas

- Dados históricos sem `visitor_id` (pré-3.1) excluídos de métricas de visitante.
- Dados históricos sem `user_authenticated` (pré-3.4) — fallback documentado em [RETENTION_FOUNDATION.md](./RETENTION_FOUNDATION.md).
- Sem coluna `environment` — filtro produção por exclusão determinística.
- `offer_click` sem `user_id` — Active User pode subestimar usuários que só clicaram oferta.
- Logout local sem evento analítico.
- Cross-device identity graph fora de escopo.

Lista ampliada: [KNOWN_LIMITATIONS.md](../architecture/KNOWN_LIMITATIONS.md).

---

## 8. Referências

| Documento | Conteúdo |
|-----------|----------|
| [IDENTITY_LAYER.md](./IDENTITY_LAYER.md) | Hierarquia de identidade |
| [RETENTION_FOUNDATION.md](./RETENTION_FOUNDATION.md) | Timelines deriváveis |
| [DASHBOARDS.md](./DASHBOARDS.md) | Índice SQL |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Catálogo de eventos |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap Fase 4 |

---

*PATCH 4.1 — Governança das Métricas e Dashboard Executivo · Definições canônicas*
