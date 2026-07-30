# MIA_DESIGN_SYSTEM_AUDIT.md

# Auditoria Oficial — Design System da MIA (Fase 1)

**Documento:** Relatório técnico permanente  
**Patch:** UI 2 — Fundação documental  
**Data da auditoria original:** 2026-07-30  
**Status:** Registro histórico congelado — não reescrever; complementar em auditorias futuras  
**Design System oficial:** [`MIA_DESIGN_SYSTEM.md`](MIA_DESIGN_SYSTEM.md)

---

## Metodologia

Auditoria **exclusivamente investigativa** — nenhum arquivo de código, CSS ou componente foi alterado durante a Fase 1.

**Referências obrigatórias consultadas:**

- [`../architecture/MIA_ARCHITECTURE.md`](../architecture/MIA_ARCHITECTURE.md)
- [`../rules/MIA_ENGINEERING_RULES.md`](../rules/MIA_ENGINEERING_RULES.md)

**Escopo da varredura:**

- 11 arquivos CSS em `styles/` (~11.511 linhas)
- 52 componentes visuais em `components/`
- 6 páginas UI em `pages/`
- Documentação existente em `docs/`
- Assets em `public/brand/` e `lib/brandAssets.js`

**Ferramentas:** leitura estática de código, grep, contagem automatizada de hex/rgba/breakpoints/tokens.

---

## 1. Resumo Executivo

A interface da MIA é construída com **CSS global plano** carregado integralmente via `pages/_app.js`. **Não há** Tailwind, CSS Modules, styled-components, Emotion ou Theme Provider.

Existem **quatro domínios visuais** com graus distintos de formalização:

| Domínio | Rota | CSS principal | Formalização tokens |
|---|---|---|---|
| **Consumer App** | `/app-mia` | `mia-chat.css` (49% do CSS total) | Parcial (`--mia-*`) |
| **Founder Cockpit** | `/cockpit-fundador` | `founder-cockpit.css` | Formal (`--fc-*`) |
| **Public Metrics** | `/teilor-em-numeros` | `public-metrics.css` | Quase nenhuma |
| **Emails** | lib templates | Inline HTML | Separado |

**Conclusão principal:** Não existia, na data da auditoria, Design System oficial para a app consumer. O documento mais próximo era `FOUNDER_COCKPIT_DESIGN_SYSTEM.md`, escopado ao cockpit executivo.

**Números-chave:**

- 133 hex únicos
- 329 rgba únicos
- 80 custom properties (`--*`) em 4 arquivos
- 545 classes prefixo `mia-`
- 212 classes prefixo `founder-`
- 14 breakpoints `@media` distintos
- 52 componentes visuais mapeados

**Patch UI 1 (pós-auditoria Fase 1, pré-documentação UI 2):** alteração visual cirúrgica em CTA disabled (`#f4e8d4`) e branding sidebar (MIΛ / Powered by Teilor). Registrado no Design System oficial v1.0.0 — **não altera conclusões estruturais desta auditoria**.

---

## 2. Arquitetura Visual

### 2.1 Diagrama de dependências

```txt
pages/_app.js
    │
    ├── styles/mia-chat.css          (5694 linhas — 49%)
    ├── styles/mia-brand.css         (161)
    ├── styles/mia-avatar.css        (100)
    ├── styles/mia-feed.css          (1592)
    ├── styles/mia-landing.css       (383)
    ├── styles/teilor-brand.css      (253)
    ├── styles/mia-typography.css    (299)
    ├── styles/mia-home-polish.css   (424)
    ├── styles/app-mia.css           (144)
    ├── styles/public-metrics.css    (217)
    └── styles/founder-cockpit.css   (2244)
         │
         ▼
    TODAS as rotas carregam TODOS os CSS (sem code-splitting por rota)
```

### 2.2 Tecnologias ausentes (confirmado)

| Tecnologia | Presente |
|---|---|
| Tailwind CSS | Não |
| CSS Modules | Não |
| styled-components | Não |
| Emotion | Não |
| Theme Provider | Não |
| MUI / Chakra | Não |

### 2.3 Estilização imperativa

| Mecanismo | Arquivo | Variáveis / classes |
|---|---|---|
| CSS vars runtime | `MIAChat.jsx` | `--mia-keyboard-offset`, `--mia-footer-height` |
| Body classes | `MIAChat.jsx` | `mia-app-intro`, `mia-app-conversation`, `mia-app-drawer-open` |

### 2.4 Inline styles (produção)

| Arquivo | Uso |
|---|---|
| `MIAChat.jsx` | Animation delays, hidden inputs, live region, bottom offset |
| `OfferImageLightbox.jsx` | transform pan/zoom |
| `FounderSkeleton.jsx` | Skeleton line widths |
| `FounderDistributionBar.jsx` | Bar width % |
| `FounderBarChart.jsx` | Bar fill width % |
| `FounderLegend.jsx` | Color swatches |
| `FounderTooltip.jsx` | Tooltip position |
| `pages/index.js` | Placeholder |
| `pages/mia-test.js` | Dev UI completa (~50+ blocos) |

### 2.5 Fluxo Consumer App

```txt
/app-mia
  ├── TeilorBrandHero (colapsável)
  ├── MIAChat (hub central)
  │     ├── Header
  │     ├── Messages + offer cards
  │     ├── Composer
  │     ├── Drawer
  │     └── Hub panels (portal)
  └── MIALanding
```

---

## 3. Inventário de Arquivos CSS

| Arquivo | Linhas | Escopo | Tokens `--*` | Prefixo |
|---|---:|---|---|---|
| `mia-chat.css` | 5.694 | Chat, drawer, login, cards, toasts, panels | 15 `:root` | `mia-*`, legado |
| `founder-cockpit.css` | 2.244 | Cockpit completo | 32 `.founder-cockpit-page` | `founder-*` |
| `mia-feed.css` | 1.592 | Feed | 0 | `mia-feed-*` |
| `mia-home-polish.css` | 424 | Intro polish | 0 | body modifiers |
| `mia-landing.css` | 383 | Landing | 0 | `mia-landing-*` |
| `teilor-brand.css` | 253 | Hero/trust | 1 | `teilor-brand-*` |
| `mia-typography.css` | 299 | Type scale | 24 `:root` | semântico |
| `public-metrics.css` | 217 | Métricas públicas | 0 | `public-metrics-*` |
| `mia-brand.css` | 161 | Wordmark | 0 | `mia-wordmark-*` |
| `app-mia.css` | 144 | Shell layout | 0 | `app-mia-*` |
| `mia-avatar.css` | 100 | Avatar | 0 | `mia-avatar-*` |

**Classes legadas sem prefixo `mia-`:** `send-btn`, `suggestion-btn`, `product-card-hover`, `typing-dot`, `fade-in`

**Classe CSS definida mas não usada no JSX:** `.mia-drawer-powered-mia` (legado)

---

## 4. Inventário de Componentes

### 4.1 Consumer (24 arquivos)

| Componente | Arquivo | Prefixo CSS | Estados-chave |
|---|---|---|---|
| MIAChat | `MIAChat.jsx` | `mia-chat-*` | intro, conversation, drawer, loading, listening |
| TeilorBrandHero | `TeilorBrandHero.jsx` | `teilor-brand-*` | tagline rotation |
| MIALanding | `MIALanding.jsx` | `mia-landing-*` | static |
| MIAWordmark | `MIAWordmark.jsx` | `mia-wordmark-*` | xs–xl, beta |
| MIAAvatar | `MIAAvatar.jsx` | `mia-avatar-*` | size variants |
| MIAMenuSymbol | `MIAMenuSymbol.jsx` | `mia-menu-symbol-*` | static |
| ChatImageAttachment | `ChatImageAttachment.jsx` | `mia-chat-image-attachment-*` | disabled |
| OfferImageLightbox | `OfferImageLightbox.jsx` | `mia-image-lightbox-*` | zoomed |
| MIAEstimatedSavingsNotice | `MIAEstimatedSavingsNotice.jsx` | `mia-estimated-savings*` | phase animation |
| MIACommercialTransparencyNotice | `MIACommercialTransparencyNotice.jsx` | `mia-commercial-transparency-*` | static |
| MIAProfilePanel | `MIAProfilePanel.jsx` | `mia-profile-hub-*` | guest/logged |
| MIAProfileEditPanel | `MIAProfileEditPanel.jsx` | `mia-profile-edit-*` | saving |
| MIAFavoritesPanel | `MIAFavoritesPanel.jsx` | `mia-favorites-hub-*` | empty/populated |
| MIAAlertsPanel | `MIAAlertsPanel.jsx` | `mia-alerts-hub-*` | form, empty/active |
| MIASettingsPanel | `MIASettingsPanel.jsx` | `mia-settings-hub-*` | toggles, chips |
| MIAHelpPanel | `MIAHelpPanel.jsx` | `mia-help-hub-*` | FAQ accordion |
| MIAHowItWorksPanel | `MIAHowItWorksPanel.jsx` | `mia-how-hub-*` | audit status |
| FeedPanel | `FeedPanel.jsx` | `mia-feed-hub-*` | slides, onboarding |
| FeedCard | `FeedCard.jsx` | `mia-feed-card-*` | disabled |
| FeedEmptyState | `FeedEmptyState.jsx` | `mia-feed-empty-*` | static |
| FeedEducationSection | `FeedEducationSection.jsx` | `mia-feed-edu-*` | static |
| FeedSwipeOnboarding | `FeedSwipeOnboarding.jsx` | `mia-feed-onboarding-*` | leaving |

### 4.2 Public Metrics (2 arquivos)

| Componente | Prefixo |
|---|---|
| PublicMetricsPage | `public-metrics-*` |
| PublicMetricCard | `public-metrics-card-*` |

### 4.3 Founder Cockpit (26 arquivos)

**Shell:** FounderCockpitPage, FounderLoginGate, FounderCockpitFilters, FounderKpiStrip, FounderMetricCard, FounderModuleSection, FounderSkeleton, FounderDistributionBar

**Executive modules:** FounderExecutiveKpisSection, FounderExecutiveGrowthSection, FounderExecutiveProductHealthSection, FounderExecutiveCommercialPerformanceSection, FounderExecutiveOperationalSection, FounderExecutiveSummarySection, FounderExecutiveInsights

**Analytics A:** FounderSessionsUsersSection, FounderProductsCategoriesSection, FounderPerformanceConversionSection

**Charts:** FounderBarChart, FounderLineChart, FounderChartPanel, FounderEmptyChart, FounderLegend, FounderTooltip

**Contexts (sem DOM):** FounderCockpitFiltersContext, FounderExecutiveModuleViewsContext

**Total:** 52 componentes visuais

---

## 5. Inventário de Tokens

### 5.1 `:root` consumer — `mia-typography.css` (24 tokens)

```
--mia-font-sans
--mia-type-conversation-{size,lh,weight}
--mia-type-input-{size,lh,weight}
--mia-type-action-{size,lh,weight}
--mia-type-support-{size,lh,weight}
--mia-type-caption-{size,lh,weight}
--mia-type-meta-{size,lh,weight}
--mia-type-whisper-{size,lh,weight}
--mia-color-{conversation,support,meta,whisper,placeholder}
```

Mobile override @640px: conversation 14.5px, input 16px, support 12px, action 14px.

### 5.2 `:root` consumer — `mia-chat.css` (15 tokens)

```
--mia-footer-height, --mia-keyboard-offset
--mia-estimated-savings-lift, --mia-estimated-savings-stack-gap, --mia-estimated-savings-card-estimate
--mia-surface-panel, --mia-surface-card
--mia-border-subtle, --mia-text-muted, --mia-text-soft
--mia-toast-radius, --mia-toast-shadow
--mia-focus-ring, --mia-focus-ring-purple
--mia-touch-min
```

### 5.3 `teilor-brand.css` (1 token)

```
--mia-landing-title-blue: #00C6FF
```

### 5.4 `.founder-cockpit-page` — `founder-cockpit.css` (32 tokens)

```
--fc-bg-{base,elevated,panel,glass}
--fc-accent, --fc-accent-soft, --fc-accent-muted
--fc-gold
--fc-text, --fc-text-primary, --fc-text-secondary, --fc-text-muted, --fc-text-inverse
--fc-success, --fc-warning, --fc-error
--fc-border, --fc-border-accent
--fc-radius-{sm,md,lg,pill}
--fc-space-{xs,sm,md,lg,xl}
--fc-shadow-{card,hover}
--fc-max-width, --fc-font, --fc-transition
```

### 5.5 Arquivos sem tokens

`app-mia.css`, `mia-avatar.css`, `mia-brand.css`, `mia-feed.css`, `mia-home-polish.css`, `mia-landing.css`, `public-metrics.css`

### 5.6 Duplicações token / hardcode

| Valor | Tokens | Hardcode |
|---|---|---|
| `#7a9bb8` | `--mia-text-muted`, `--fc-text-muted` | dezenas de regras |
| `#00c6ff` | `--fc-accent`, `--mia-landing-title-blue` | 61 ocorrências |
| `#f4faff` | `--mia-color-conversation` | 52 ocorrências |
| `#e8d5a3` | `--fc-gold` | landing |
| `#f4e8d4` | nenhum token | trust, CTA disabled |

---

## 6. Inventário de Cores

### 6.1 Estatísticas

- **133** hex únicos (normalizados `#RRGGBB`)
- **329** rgba únicos
- **64** hex com count = 1 (majoritariamente em `mia-chat.css`)

### 6.2 Top 15 hex

| Count | Hex | Função observada |
|---:|---|---|
| 61 | `#00c6ff` | Accent universal |
| 52 | `#f4faff` | Texto conversa |
| 34 | `#7a9bb8` | Muted |
| 20 | `#eaf6ff` | Texto claro alt |
| 18 | `#8aa8c4` | Drawer secondary |
| 18 | `#9bb8d4` | Meta alt |
| 17 | `#dcefff` | Texto claro |
| 15 | `#e8f4fc` | Text primary alt |
| 11 | `#eaf4ff` | — |
| 10 | `#d8eafa` | — |
| 10 | `#b8d4ec` | — |
| 10 | `#9fe8ff` | Trust secondary |
| 8 | `#b8d9ef` | Cockpit secondary |
| 7 | `#050d1f` | Background |
| 5 | `#f4e8d4` | Gold trust consumer |

### 6.3 Top 15 rgba

| Count | Pattern |
|---:|---|
| 33 | `rgba(255, 255, 255, 0.06)` |
| 25 | `rgba(255, 255, 255, 0.04)` |
| 23 | `rgba(0, 198, 255, 0.22)` |
| 22 | `rgba(255, 255, 255, 0.08)` |
| 22 | `rgba(255, 255, 255, 0.1)` |
| 22 | `rgba(0, 198, 255, 0.28)` |
| 21 | `rgba(0, 198, 255, 0.08)` |
| 19 | `rgba(0, 198, 255, 0.45)` |
| 17 | `rgba(0, 198, 255, 0.12)` |
| 17 | `rgba(0, 198, 255, 0.06)` |
| 16 | `rgba(255, 255, 255, 0.03)` |
| 15 | `rgba(0, 198, 255, 0.18)` |
| 15 | `rgba(255,255,255,0.06)` |
| 14 | `rgba(0, 198, 255, 0.2)` |
| 13 | `rgba(255,255,255,0.05)` |

### 6.4 Agrupamento semântico

| Grupo | Cores representativas |
|---|---|
| Background page | `#050d1f`, `#07112b`, `#071733`, `#030b18` |
| Surface | `#04132a`, gradientes navy rgba |
| Accent ciano | `#00c6ff`, `#00d8ff`, `#00c2ea`, `#24e0ff` |
| Accent roxo | `#7b61ff`, `rgba(123,97,255,*)` |
| Gold (3 famílias) | `#f4e8d4`, `#e8d5a3`, `#f2e4bc` |
| Text primary | `#f4faff`, `#f0f8ff`, `#edf2f7` |
| Text muted | `#7a9bb8`, `#8aa8c4` |
| Success | `#72d4a8`, `#22c55e`, `#6ee7a0` |
| Error | `#ffb4b4`, `#ff6b6b` |
| User bubble | `#0f4a8a` → `#0b3568` gradient |
| On accent text | `#041428`, `#041028` |

### 6.5 Inconsistências de cor

1. Três famílias gold sem semântica documentada
2. `#7a9bb8` tokenizado e hardcoded simultaneamente
3. Dezenas de blues claros quase idênticos (`#eaf6ff`, `#eaf4ff`, `#e8f4fc`, `#dcefff`)
4. Email templates com paleta inline separada

---

## 7. Tipografia

### 7.1 Escala formal (PATCH 3.5 — `mia-typography.css`)

| Nível | Desktop | Mobile @640px |
|---|---|---|
| Conversation | 15px / 1.56 / 500 | 14.5px |
| Input | 15px / 1.48 / 400 | **16px** |
| Action/CTA | 14px / 1.36 / 600 | 14px |
| Support | 13px / 1.42 / 500 | 12px |
| Caption | 12px / 1.38 / 500 | — |
| Meta | 11px / 1.34 / 500 | — |
| Whisper | 10px / 1.32 / 500 | — |

### 7.2 Famílias

| Uso | font-family |
|---|---|
| Consumer | system-ui stack |
| Wordmark | Inter + system-ui |
| Cockpit | Segoe UI + system-ui |

### 7.3 Cobertura da escala

| Superfície | Usa `--mia-type-*` |
|---|---|
| Chat messages | Sim |
| Composer | Sim |
| send-btn | Sim |
| Trust block | Parcial (hardcode color) |
| Landing | **Não** |
| Offer cards | **Não** |
| Hub panels | **Não** |
| Cockpit | `--fc-*` próprio |

---

## 8. Branding

### 8.1 Assets

```
lib/brandAssets.js
public/brand/avatars/mia-avatar-primary.png
public/brand/logos/teilor-logo-primary.png
public/brand/favicon/.gitkeep  (vazio)
public/brand/icons/.gitkeep    (vazio)
```

### 8.2 Componentes

| Componente | Constante | Renderização |
|---|---|---|
| MIAWordmark | `MIA_BRAND = "MIΛ"` | Texto Inter uppercase |
| MIAAvatar | `MIA_AVATAR_PRIMARY_SRC` | PNG |
| Teilor logo | `TEILOR_LOGO_PRIMARY_SRC` | PNG |

### 8.3 Hierarquia por superfície (auditada)

| Superfície | Hierarquia | Nota |
|---|---|---|
| Chat header | MIΛ primário | Referência produto |
| Sidebar drawer | MIΛ + Powered by Teilor | Patch UI 1 |
| MIALanding | Teilor · Powered by MIΛ | **Inconsistente** |
| Hub panels | "Central Teilor" | Contexto empresa |
| TeilorBrandHero | Logo Teilor + trust | Institucional |
| Cockpit | Logo Teilor PNG | Executivo |

### 8.4 Copy institucional (não visual, referência)

`lib/miaCompanyKnowledge.js` — Teilor como empresa, MIΛ como produto.

---

## 9. Responsividade

### 9.1 Breakpoints

| Query | Usos | Arquivos |
|---|---:|---|
| `max-width: 640px` | 19 | 10 arquivos — **principal** |
| `(hover: hover) and (pointer: fine)` | 17 | chat, feed, landing |
| `prefers-reduced-motion: reduce` | 9 | multi |
| `min-width: 641px` | 3 | landing, typography, teilor |
| `min-width: 901px` | 3 | chat, feed, landing |
| `max-width: 900px` | 1 | chat |
| `max-width: 768px` | 1 | cockpit |
| `max-width: 480px` | 1 | cockpit |
| `max-width: 380px` | 1 | chat |
| `768–1024px` | 1 | cockpit tablet |
| `prefers-contrast: more` | 1 | wordmark |
| `prefers-color-scheme: light` | 1 | public-metrics |

### 9.2 Containers

| Domínio | max-width |
|---|---|
| Consumer | 780px |
| Cockpit | 1200px |
| Drawer | min(320px, 38vw) @901px |

### 9.3 Diferenças mobile específicas

- Input 16px (anti-zoom iOS)
- send-btn min-height 42px
- Hover desabilitado via media query
- Enter vs click no E2E (mobile Enter, desktop click send)

---

## 10. Estados Visuais

### 10.1 Interação

| Estado | Padrão |
|---|---|
| Hover | `(hover: hover) and (pointer: fine)` — 17 blocos |
| Focus-visible | `--mia-focus-ring` / `--mia-focus-ring-purple` |
| Active | `:active`, `scale(0.98)` |
| Disabled | `:disabled`, opacity 0.72–0.78 |

### 10.2 Funcionais

| Estado | Implementação |
|---|---|
| Loading | `send-btn--loading`, pulse, skeleton |
| Selected | `--active` modifier |
| Expanded | FAQ, insights |
| Empty | feed, favorites, alerts |
| Error/partial | cockpit `--error`, `--partial` |

### 10.3 Modo app

| Classe | Trigger |
|---|---|
| `body.mia-app-intro` | Intro state |
| `body.mia-app-conversation` | Pós-primeira mensagem |
| `body.mia-app-drawer-open` | Drawer aberto |
| `.mia-chat-root--keyboard-open` | Teclado mobile |

### 10.4 Animações (@keyframes)

**mia-chat.css:** 21 keyframes  
**mia-feed.css:** 5 keyframes  
**founder-cockpit.css:** 1 keyframe (`founder-shimmer`)

---

## 11. Hardcodes

| Categoria | Volume | Arquivo principal |
|---|---|---|
| Hex colors | 133 únicos | `mia-chat.css` (~47 exclusivos) |
| rgba() | 329 únicos | `mia-chat.css` |
| border-radius | 10+ valores | todos |
| box-shadow | centenas | `mia-chat.css` |
| padding/margin | sem escala | `mia-chat.css` |
| z-index | 15+ valores (20–100000) | `mia-chat.css` |
| transitions | 0.15s–0.46s variados | multi |
| gradients | dezenas únicos | chat cards, CTAs |

**Valores mais repetidos (candidatos futuros a tokenização — não implementado):**

- `#00c6ff`, `#f4faff`, `#7a9bb8`
- `rgba(0,198,255,0.22)`, `rgba(255,255,255,0.06)`
- `border-radius: 14px`
- `padding: 12–14px`

---

## 12. Inconsistências

1. **Quatro sistemas visuais paralelos** sem documento unificador (pré UI 2)
2. **Gold em 3 hex** sem semântica
3. **Branding hierarchy** diverge landing vs header/drawer
4. **133 hex + 329 rgba** — manutenção manual impossível
5. **Prefixos mistos** — `mia-*` vs legado
6. **CSS global não isolado** — cockpit carrega chat CSS
7. **Tipografia formal** cobre ~40% consumer
8. **border-radius** sem escala consumer
9. **z-index** extremos sem layer system
10. **Spacing** — cockpit tem escala; consumer não
11. **Inter só na wordmark**
12. **`.mia-drawer-powered-mia`** — CSS morto
13. **Emails** — paleta separada

---

## 13. Oportunidades de Padronização Futura

*(Registradas na auditoria — nenhuma implementada na Fase 1 ou UI 2)*

1. Expandir `:root` consumer espelhando `--fc-*`
2. Unificar gold em token semântico
3. Escala radius: 8/12/14/16/999
4. Escala space: 4/6/8/10/12/16/24/32
5. Layer/z-index system
6. Isolar CSS por rota (code-split)
7. Renomear classes legadas (`send-btn` → `mia-send-btn`)
8. Documentar branding hierarchy por superfície
9. Estender `--mia-type-*` a landing e offer cards
10. Pattern library hub panels

**Documento futuro:** `MIA_DESIGN_SYSTEM_MIGRATION_PLAN.md` (não criado neste patch)

---

## 14. Riscos de Padronização Futura

| Risco | Severidade | Detalhe |
|---|---|---|
| Regressão visual massiva | Alta | 5694 linhas mia-chat.css |
| Especificidade CSS | Alta | Overrides `mia-home-polish`, `!important` |
| Runtime CSS vars | Média | keyboard-offset, footer-height |
| Cross-domain bleed | Média | CSS global |
| Email divergence | Baixa | Templates inline |
| Cockpit isolation | Média | Unificar `--fc-*` com `--mia-*` |
| Mobile input 16px | Alta | Regra intencional iOS |
| E2E selectors | Média | `.send-btn`, `.mia-input` |
| Visual tests | Média | Sem snapshots |

---

## 15. Documentação Existente (pré UI 2)

| Documento | Local | Escopo | Conflito |
|---|---|---|---|
| FOUNDER_COCKPIT_DESIGN_SYSTEM.md | docs/analytics/ | Cockpit `--fc-*` | Não cobre consumer |
| FOUNDER_COCKPIT_UI_GUIDELINES.md | docs/analytics/ | Fase D UI rules | Cockpit only |
| FOUNDER_COCKPIT_COMPONENT_MAP.md | docs/analytics/ | Mapa Fase D | Cockpit only |
| FOUNDER_COCKPIT_PHASE_D_ARCHITECTURE.md | docs/analytics/ | Arquitetura D | Referencia UI Guidelines |
| PATCH 3.5 comment | mia-typography.css | Escala tipográfica | Parcial, inline |
| PATCH A.9 evidence JSONs | docs/analytics/ | Evidências cockpit | Histórico |

**Conclusão:** Nenhum documento cobria consumer `/app-mia` como Design System oficial antes de [`MIA_DESIGN_SYSTEM.md`](MIA_DESIGN_SYSTEM.md).

---

## 16. Conclusões

1. A MIA possui **identidade visual coerente na prática** (dark + ciano + glass) mas **sem formalização documental consumer** até este patch UI 2.
2. O Founder Cockpit é o **único domínio com tokens completos** (`--fc-*`).
3. `mia-chat.css` concentra **complexidade e dívida visual** — 49% do CSS total.
4. A escala tipográfica PATCH 3.5 é o **token consumer mais maduro**.
5. Branding Teilor/MIΛ **não unificado** em todas as superfícies.
6. Padronização futura exige **migração faseada** com alto risco de regressão.
7. Este relatório permanece como **evidência congelada** da Fase 1 investigativa.
8. O Design System oficial [`MIA_DESIGN_SYSTEM.md`](MIA_DESIGN_SYSTEM.md) deriva **exclusivamente** desta auditoria.

---

## Lacunas não auditadas

- Inventário exaustivo de cada `box-shadow` e `gradient` individual
- Auditoria WCAG/contraste sistemática
- Comportamento visual completo de email templates
- Página `/mia-test` além de registro como dev inline UI
- Favicon/icons (pastas vazias)
- Testes visuais automatizados (inexistentes)

---

## Validação da auditoria Fase 1

- Nenhum arquivo alterado durante a auditoria investigativa original
- Nenhum CSS modificado
- Nenhum componente alterado
- Nenhum patch aplicado na Fase 1
- Nenhum commit criado na Fase 1
- Working tree intacta na conclusão da Fase 1

---

**Referência oficial derivada:** [`MIA_DESIGN_SYSTEM.md`](MIA_DESIGN_SYSTEM.md) v1.0.0
