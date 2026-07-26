# PATCH 4.1 — Governança das Métricas e Dashboard Executivo

**Data:** 2026-07-22  
**Tipo:** Documentação canônica + consultas SQL read-only  
**Status:** 🟡 EM ANDAMENTO — validação produção concluída · aguardando aprovação formal  
**Relatório produção:** [PATCH_4.1_PRODUCTION_REPORT.md](./PATCH_4.1_PRODUCTION_REPORT.md)  
**Documento canônico de métricas:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md)

---

## 1. Resumo executivo

PATCH 4.1 inaugura oficialmente a Fase 4 do Analytics com:

1. **Governança canônica** de métricas executivas (DAU/WAU/MAU Visitors + Users)
2. **Dashboard Executivo SQL** derivado exclusivamente de `analytics_events`
3. **Correção DT-01** oportunística nos dashboards PATCH 1.3 (7 eventos públicos)

**Nenhuma alteração** em código runtime, contratos de eventos, payloads, migrations ou arquitetura da MIA.

---

## 2. Decisões arquiteturais aprovadas

| ID | Decisão |
|----|---------|
| D1 | Dual DAU — `dau_visitors` + `dau_users` (e WAU/MAU simétricos) |
| D2 | Fuso **UTC** para `activity_day` |
| D3 | Janelas **rolling** — WAU 7 dias, MAU 30 dias |
| D4 | **7 eventos** qualificantes (`RETENTION_IDENTITY_EVENTS`) |
| D5 | Anonymous Visitor = nunca autenticou (`user_id` histórico) |
| D6 | Taxa autenticação = `user_authenticated` distintos / `dau_visitors` |
| D7 | Escopo MIA — sem `price_drop_email_*` no dashboard executivo |

---

## 3. Entregas

| Artefato | Descrição |
|----------|-----------|
| [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) | Definições canônicas — referência única Fase 4 |
| [analytics-executive-dashboard.sql](./analytics-executive-dashboard.sql) | Query 1 snapshot + Query 2 evolução diária |
| [DASHBOARDS.md](./DASHBOARDS.md) | Índice atualizado |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | PATCH 4.1 renomeado |
| [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) | Registro PATCH 4.1 |
| DT-01 parcial | `analytics-overview.sql`, `analytics-daily-sessions.sql`, `analytics-production-scope.sql`, `ANALYTICS_SCHEMA.md` |

---

## 4. Métricas canonizadas

### Alcance — Visitors

| Métrica | Alias SQL |
|---------|-----------|
| DAU Visitors | `dau_visitors` |
| WAU Visitors | `wau_visitors` |
| MAU Visitors | `mau_visitors` |
| New Visitor | `new_visitors` |
| Returning Visitor | `returning_visitors` |
| Anonymous Visitor | `anonymous_visitors` |

### Alcance — Users

| Métrica | Alias SQL |
|---------|-----------|
| DAU Users | `dau_users` |
| WAU Users | `wau_users` |
| MAU Users | `mau_users` |
| Authenticated User (período) | `authenticated_users` |

### Operacionais

| Métrica | Alias SQL |
|---------|-----------|
| Taxa de autenticação | `taxa_autenticacao` |
| Sessões únicas | `sessoes_unicas` |
| Conversas únicas | `conversas_unicas` |

---

## 5. Validação

### Testes automatizados

| Suite | Resultado |
|-------|-----------|
| `npm run test:mia:analytics:patch-41:executive-dashboard` | **60/60** ✅ |
| `npm run test:mia:analytics:sql-dashboards` | **127/127** ✅ |
| `npm run test:mia:analytics:retention-foundation` | **16/16** ✅ |
| `npm run test:mia:analytics:identity-layer-docs` | **43/43** ✅ |
| `npm run build` | ✅ |

### Pré-existente (não introduzido por 4.1)

| Suite | Resultado | Nota |
|-------|-----------|------|
| `npm run test:mia:analytics:storage-schema` | ❌ ENOENT | Migrations `53000`/`53001` ausentes no working tree local (DT-02) |

### Checklist fluxo oficial

| # | Etapa | Status |
|---|-------|--------|
| 1 | Auditoria prévia | ✅ Concluída e aprovada |
| 2 | Implementação | ✅ Documentação + SQL |
| 3 | Auditoria pós-implementação | ✅ Este documento |
| 4 | Testes unitários | ✅ Suite PATCH 4.1 (60 checks) |
| 5 | Testes de integração | ✅ Regressões analytics (186 checks) |
| 6 | Endpoint local | ⏸ N/A — patch SQL-only |
| 7 | Regressões | ✅ Build OK |
| 8 | Deploy | ✅ Produção verificada (SQL-only — sem redeploy runtime) |
| 9 | Validação em produção | ✅ SQL remoto + 17/17 checks |
| 10 | Conversa real pela interface da MIA | ⏸ App acessível; analytics inalterado |
| 11 | Aprovação final | ⏸ Aguardando |

---

## 6. Conformidade arquitetural

| Requisito | Status |
|-----------|--------|
| `analytics_events` fonte única | ✅ |
| Sem tabelas auxiliares / snapshots / MVs | ✅ |
| Event Contract v1 inalterado | ✅ |
| Identity Layer / ADR-013 preservados | ✅ |
| Sem alteração de payloads/eventos/migrations | ✅ |
| Filtro produção determinístico | ✅ |
| Nomenclatura dual DAU (Visitors + Users) | ✅ |

---

## 7. Limitações documentadas

Consolidadas em [EXECUTIVE_METRICS.md §7](./EXECUTIVE_METRICS.md):

- Pré-PATCH 3.1 sem `visitor_id`
- Pré-PATCH 3.4 sem `user_authenticated`
- `offer_click` sem `user_id`
- `conversation_id` não sobrevive reload
- Logout local sem evento
- Sem coluna `environment`

---

## 8. Validação SQL em produção (pendente)

Após aprovação, executar no Supabase remoto:

```sql
-- Query 1 — snapshot (analytics-executive-dashboard.sql)
-- Query 2 — evolução diária
```

Validar:

- [ ] Query 1 retorna linha com `dia_referencia` preenchido
- [ ] `dau_visitors >= dau_users` (esperado na maioria dos dias)
- [ ] `new_visitors + returning_visitors = dau_visitors`
- [ ] EXPLAIN confirma uso de `idx_analytics_events_visitor_id_created_at`

---

## 9. Próximos passos

| Item | Responsável |
|------|-------------|
| Aprovação formal PATCH 4.1 | Product owner |
| Validação SQL produção | Operador |
| Conversa real MIA | QA |
| PATCH 4.2 — Dashboard de Crescimento | Após aprovação 4.1 |

---

## 10. Veredito

PATCH 4.1 **implementado** em documentação e SQL, **validado localmente** (246 checks analytics + build).

Aguardando:

1. Aprovação formal deste relatório
2. Validação SQL em produção
3. Conversa real pela interface da MIA

---

*PATCH 4.1 — Governança das Métricas e Dashboard Executivo · Relatório de auditoria pós-implementação*
