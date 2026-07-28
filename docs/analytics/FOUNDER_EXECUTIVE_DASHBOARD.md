# Cockpit Executivo do Fundador — PATCH 11.3

Painel privado autenticado para acompanhamento executivo da plataforma Teilor/MIA.

**Rota:** `/cockpit-fundador`  
**Fonte única:** `GET /api/executive-metrics?days={7|30|90|365}`  
**Versão:** 11.3.0

---

## Arquitetura

```
/cockpit-fundador (SSR — getServerSideProps)
        │
        ├─ requireFounderGate(cookie)
        │     └─ não autorizado → FounderLoginGate
        │
        └─ fetch /api/executive-metrics?days=N
               └─ mapExecutiveMetricsToFounderCockpit()
                      └─ FounderCockpitPage (módulos + KPIs)
```

**Autenticação:**

| Método | Endpoint | Resultado |
|--------|----------|-----------|
| Chave admin | `POST /api/founder/authenticate` `{ admin_key }` | Cookie `mia_founder_gate` |
| Sessão MIA | `{ session_token }` + email em `MIA_FOUNDER_ALLOWED_EMAILS` | Cookie assinado |
| Logout | `POST /api/founder/logout` | Limpa cookie |

**Env:** `MIA_FOUNDER_ALLOWED_EMAILS` (emails separados por vírgula)

---

## Módulos

1. **Executive AI Insights** (PATCH 11.4) — resumo executivo e insights determinísticos  
2. **Visão geral** — 10 KPIs executivos (PATCH A.2)  
3. **Sessões e Usuários** (PATCH A.4) — DAU/WAU/MAU, composição, tendências, atividade diária  
4. **Produtos e Categorias** (PATCH A.5) — ranking, distribuição, inteligência por categoria  
5. **Plataforma** — sessões, visitantes, conversas, perguntas (snapshot)  
6. **Conversação** — perguntas enviadas, recomendações exibidas, conversas com perguntas (PATCH A.2)  
7. **Recomendações** — geradas, runner-up, sinais, taxas  
8. **Comercial** — conjuntos de ofertas, ofertas retornadas, provedores, cliques, favoritos  
9. **Alertas de preço** — criados, ativos, metas atingidas, notificações (PATCH A.2)  
10. **Price Intelligence** — qualidade média + barras de confiança  
11. **Economia** — potencial total, média, oportunidades (disclaimer)  
12. **Anti-Regret** — score médio + distribuição  
13. **User Value** — score médio, valores verificados + distribuição  
14. **Sistema** — versão, build, ambiente, latência API, status

---

## Produtos e Categorias (PATCH A.5)

**Fonte temporal:** `GET /api/temporal-metrics?days=N&series=products,categories`  
**Mapper:** `lib/miaFounderProductsDisplay.js`  
**Componente:** `FounderProductsCategoriesSection.jsx` (client fetch independente)  
**SQL canônico:** PATCH 4.4 `PRODUCTS_CATEGORIES_DASHBOARD.md`

| Bloco | Origem | Métricas |
|-------|--------|----------|
| Resumo produtos | `products.summary` | distintos, aparições, recomendações, cliques, favoritos, alertas, taxa clique |
| Ranking produtos | `products.ranking[]` | top 10 por aparições — campo `product_label` (privacidade API) |
| Resumo categorias | `categories.summary` | distintas, perguntas, recomendações, cliques, eventos, taxas conversão |
| Distribuição | `categories.ranking[]` + summary total | barras de participação relativa |
| Ranking categorias | `categories.ranking[]` | top 10 por eventos |
| Atividade recente | `categories.daily[]` / `products.daily[]` | tabelas compactas |
| Referência snapshot | `executive-metrics` | recomendações/comercial agregados |

**Métricas indisponíveis (documentadas na UI):** produtos pesquisados por termo, produtos comparados, product_view.

**Privacidade:** API usa `product_label` em vez de `product_name` (chave proibida no catálogo público). Cockpit fundador é privado (`noindex`).

**Reservado:** filtros avançados (A.7), gráficos (A.8).

### Encerramento (PATCH A.5.1)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_5_FOUNDER_PRODUCTS_CATEGORIES_EVIDENCE.json` | API prod + RPC + bundle |
| `PATCH_A_5_BROWSER_UI_EVIDENCE.json` | Interface autenticada + paridade API |
| `PATCH_A_5_1_CLOSURE_EVIDENCE.json` | Encerramento oficial |

---

## Sessões e Usuários (PATCH A.4)

**Fonte temporal:** `GET /api/temporal-metrics?days=N&series=growth,platform_activity`  
**Mapper:** `lib/miaFounderGrowthDisplay.js`  
**Componente:** `FounderSessionsUsersSection.jsx` (client fetch independente)

| Bloco | Origem | Métricas |
|-------|--------|----------|
| Alcance rolling | `growth.series[0]` | DAU/WAU/MAU visitantes e usuários |
| Composição | `growth.series[0]` | novos, recorrentes, anônimos, autenticados, taxa autenticação |
| Atividade último dia | `platform_activity.series[0]` | sessões, conversas, perguntas, recomendações exibidas |
| Tendências | `growth.series[0]` pct fields | crescimento DAU/WAU/MAU (sem gráficos) |
| Tabela recente | join por `activity_day` | últimos 7 dias — valores da API, sem soma |
| Referência snapshot | `executive-metrics` | totais do período (complementar) |

**Snapshot vs temporal:** snapshot = janela rolling acumulada; temporal = visão diária e rolling por dia de referência.

**Resiliência:** falha temporal não quebra snapshot SSR. `partial_errors` exibidos quando um grupo falha.

**Reservado:** filtros avançados (A.7), gráficos (A.8).

### Encerramento (PATCH A.4.1)

| Evidência | Descrição |
|-----------|-----------|
| `PATCH_A_4_FOUNDER_SESSIONS_USERS_EVIDENCE.json` | API temporal + mapper + bundle em produção |
| `PATCH_A_4_BROWSER_UI_EVIDENCE.json` | Interface autenticada (build local produção, dados reais) |
| `PATCH_A_4_1_CLOSURE_EVIDENCE.json` | Encerramento oficial |

**Validação de interface:** Playwright autenticado em build local (`npm run start`) com mesma base Supabase. HTML autenticado em Vercel requer `MIA_ADMIN_API_KEY` de produção — mitigado por bundle deployado + browser E2E + API produção.

---

## Filtros de período

7 · 30 · 90 · 365 dias — alteração via query `?days=` recarrega SSR com nova chamada à API.

---

## Performance

- SSR por request (dados frescos por período)
- Cache da API executiva (TTL ~5 min)
- Sessões e Usuários: fetch client-side independente à API temporal (PATCH A.4)
- Produtos e Categorias: fetch client-side independente à API temporal (PATCH A.5)

---

## Privacidade

- `robots: noindex, nofollow`
- Apenas agregados da API
- Scan de conteúdo proibido em auditorias
- Sem PII, IDs ou eventos individuais

---

## Limitações

- Autenticação requer `MIA_ADMIN_API_KEY` ou email na allowlist + sessão OTP
- Disponibilidade % uptime reservada para evolução da API
- Distribuições vazias exibem estado “Sem dados no período”

---

## Testes

```bash
npm run test:mia:analytics:patch-113:founder-executive-cockpit
npm run test:mia:analytics:patch-113:prod-smoke
npm run test:mia:analytics:patch-a4:founder-sessions-users
npm run test:mia:analytics:patch-a4:prod-validation
MIA_ADMIN_API_KEY=... npm run test:mia:analytics:patch-a4:prod-validation
```

---

## Referências

- [EXECUTIVE_METRICS_API.md](./EXECUTIVE_METRICS_API.md)
- [TEMPORAL_METRICS_API.md](./TEMPORAL_METRICS_API.md)
- [PUBLIC_METRICS_PAGE.md](./PUBLIC_METRICS_PAGE.md)
