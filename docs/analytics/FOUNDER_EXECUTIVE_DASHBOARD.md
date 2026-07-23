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

1. **Visão geral** — 8 KPIs executivos  
2. **Plataforma** — sessões, visitantes, conversas, perguntas  
3. **Recomendações** — geradas, runner-up, taxas  
4. **Comercial** — ofertas, cliques, favoritos, alertas  
5. **Price Intelligence** — qualidade média + barras de confiança  
6. **Economia** — potencial + oportunidades (disclaimer)  
7. **Anti-Regret** — score médio + distribuição  
8. **User Value** — score médio + distribuição  
9. **Sistema** — versão, build, latência API, status

---

## Filtros de período

7 · 30 · 90 · 365 dias — alteração via query `?days=` recarrega SSR com nova chamada à API.

---

## Performance

- SSR por request (dados frescos por período)
- Cache da API executiva (TTL ~5 min)
- Sem fetch client-side adicional além de auth/logout

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
MIA_ADMIN_API_KEY=... npm run test:mia:analytics:patch-113:prod-smoke
```

---

## Referências

- [EXECUTIVE_METRICS_API.md](./EXECUTIVE_METRICS_API.md)
- [PUBLIC_METRICS_PAGE.md](./PUBLIC_METRICS_PAGE.md)
