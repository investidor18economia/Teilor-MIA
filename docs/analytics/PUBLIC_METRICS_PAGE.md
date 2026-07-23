# Página Pública — Teilor em Números (PATCH 11.2)

Página institucional de métricas agregadas da plataforma Teilor/MIA.

**Rota:** `/teilor-em-numeros`  
**Fonte única:** `GET /api/executive-metrics` (PATCH 11.1)  
**Versão:** 11.2.0

---

## Arquitetura

```
GET /teilor-em-numeros (ISR, revalidate 300s)
        │
        ▼
getStaticProps → fetch /api/executive-metrics
        │
        ▼
mapExecutiveMetricsToPublicPage()  ← formatação/exibição apenas
        │
        ▼
PublicMetricsPage → PublicMetricCard
```

**Regras:**

- Nenhuma consulta direta a Supabase, SQL ou eventos Analytics na página.
- Nenhuma agregação ou regra de negócio no frontend público.
- Cache ISR alinhado ao TTL da API (~5 min).

### Arquivos

| Arquivo | Função |
|---------|--------|
| `pages/teilor-em-numeros.jsx` | Rota Next.js, SEO, ISR, fetch da API |
| `lib/miaPublicMetricsDisplay.js` | Mapeamento e formatação pt-BR |
| `components/public-metrics/PublicMetricsPage.jsx` | Layout e seções |
| `components/public-metrics/PublicMetricCard.jsx` | Card de métrica |
| `styles/public-metrics.css` | Identidade visual Teilor |

---

## Layout e seções

1. **Hero** — título, subtítulo, período de referência
2. **Plataforma** — conversas, perguntas, sessões, visitantes
3. **Recomendações** — geradas, runner-up, taxas (nunca “satisfação”)
4. **Inteligência comercial** — ofertas, cliques, favoritos, alertas ativos
5. **Economia** — economia potencial + oportunidades (com disclaimer explícito)
6. **Sistema** — versão analytics, última atualização, build
7. **Transparência** — “Como calculamos estes números?”

---

## Métricas públicas (critérios)

**Exibidas:** agregados de uso, recomendação, comércio, alertas, economia potencial observacional, metadados de sistema.

**Nunca exibidas:** PII, IDs, queries, produtos individuais, receita, lucro, CAC, LTV, margem, custos, logs, eventos granulares.

---

## SEO

- `<title>`, `<meta description>`, canonical
- Open Graph (`og:title`, `og:description`, `og:url`)
- Twitter Card (`summary_large_image`)
- Schema.org `Organization` (JSON-LD)

---

## Acessibilidade

- Hierarquia `h1` → `h2` → `h3`
- `aria-labelledby` nas seções
- `aria-label` nos valores numéricos
- Contraste dark/light via `prefers-color-scheme`
- `prefers-reduced-motion` desativa hover transform

---

## Performance

- ISR `revalidate: 300` (env `PUBLIC_METRICS_REVALIDATE_SECONDS`)
- Uma requisição server-side por rebuild de página
- CSS dedicado leve (~4 KB)
- Sem client-side fetch adicional

---

## Privacidade

`scanPublicMetricsForbiddenContent()` bloqueia padrões como `visitor_id`, `conversation_id`, emails, URLs em auditorias.

---

## Limitações

- Disponibilidade da plataforma (% uptime) reservada para implementação futura na API.
- Durante indisponibilidade da API, a página exibe estado de erro amigável (sem dados inventados).
- Build local sem API em execução gera página de fallback até primeiro deploy com API ativa.

---

## Testes

```bash
npm run test:mia:analytics:patch-112:public-metrics-page
npm run test:mia:analytics:patch-112:prod-smoke
npm run test:mia:analytics:patch-111:executive-metrics-api  # regressão API
```

---

## Referências

- [EXECUTIVE_METRICS_API.md](./EXECUTIVE_METRICS_API.md) — contrato PATCH 11.1
- [02_analytics_roadmap.md](./02_analytics_roadmap.md) — FASE 11
