# MIA_DESIGN_SYSTEM.md

# MIA / EconomIA — Official Design System

---

## 1. Identificação

| Campo | Valor |
|---|---|
| **Documento** | `MIA_DESIGN_SYSTEM.md` |
| **Status** | **Oficial** — fonte permanente da camada visual |
| **Versão** | 1.1.0 (Fundação técnica — Patch UI 3) |
| **Data** | 2026-07-30 |
| **Escopo** | Camada de apresentação visual do ecossistema MIA / Teilor |
| **Objetivo** | Registrar, de forma permanente e auditável, como a interface da MIA está construída hoje e quais regras visuais governam sua evolução futura |
| **Source of Truth** | Este documento, complementado por [`MIA_DESIGN_SYSTEM_AUDIT.md`](MIA_DESIGN_SYSTEM_AUDIT.md) |
| **Relacionados** | [`../architecture/MIA_ARCHITECTURE.md`](../architecture/MIA_ARCHITECTURE.md) · [`../rules/MIA_ENGINEERING_RULES.md`](../rules/MIA_ENGINEERING_RULES.md) |

### Histórico

| Versão | Patch | Descrição |
|---|---|---|
| 1.1.0 | UI 3 | Fundação técnica em `styles/design-system/`. Tokens oficiais consolidados; CSS legado preservado; sem migração de hardcodes. |
| 1.0.0 | UI 2 | Fundação documental oficial. Baseada na Auditoria Fase 1 (investigativa). Nenhuma alteração de CSS, componentes ou tokens. |

### O que este documento é

- A referência oficial da **camada visual** do projeto.
- Um registro do **estado real** da interface, conforme auditado.
- Um guia de **governança** para futuras alterações visuais.

### O que este documento não é

- Um plano de migração ou refatoração CSS (documento futuro).
- O Design System do Founder Cockpit (domínio especializado — ver §3).
- Uma especificação de componentes React implementável (não substitui o código).
- Uma proposta de novos tokens ou padrões ainda não existentes no repositório.

### Lacunas explicitamente não auditadas na Fase 1

- Comportamento visual detalhado de **cada rota API** (sem UI).
- Página `/mia-test` além de registro como domínio dev com inline styles.
- Inventário exaustivo linha a linha de **todas** as declarações `box-shadow` e `gradient` (volume > 500 entradas únicas em `mia-chat.css`).
- Testes visuais automatizados (snapshots) — não existem no repositório auditado.
- Favicon e ícones em `public/brand/favicon/` e `public/brand/icons/` — pastas placeholder (`.gitkeep` apenas).

---

## 2. Filosofia de Design da MIA

A identidade visual auditada reflete os seguintes princípios **observados no código e copy existentes**, não inventados:

### Personalidade visual

- **Dark-first:** fundos navy profundos (`#050d1f`, `#07112b`, `#071733`) em toda a app consumer.
- **Accent ciano:** `#00c6ff` como cor de ação, foco e energia — presente em 7 dos 11 arquivos CSS.
- **Glass surfaces:** camadas semi-transparentes com `rgba(255,255,255,0.04–0.14)` e `backdrop-filter: blur(6–8px)` em overlays, drawer e panels.
- **Secondary purple:** `rgb(123,97,255)` em inputs, focus alternativo e glow — complemento ao ciano.
- **Premium discreto:** gradientes suaves, inset highlights, sombras profundas — sem flat design.

### Princípios da interface (evidenciados)

| Princípio | Evidência auditada |
|---|---|
| **Clareza** | Escala tipográfica formal em `mia-typography.css` (PATCH 3.5): hierarquia conversa > input/CTA > suporte > caption > meta > whisper |
| **Confiança** | Trust block em `TeilorBrandHero` (“Sem comissão por indicação”); transparência comercial em componentes dedicados |
| **Premium** | Gradientes em CTAs, cards com inset shadow, animações de entrada (`fadeIn`, `miaOpeningArrive`) |
| **Simplicidade** | Composer centralizado; hub panels com padrão repetido (`mia-hub-panel`) |
| **Honestidade** | Estados disabled/loading explícitos; disclaimers em cockpit e métricas públicas |

### Experiência desejada (inferida do produto, não do marketing)

- O usuário interage com **MIΛ** como assistente/produto.
- **Teilor** aparece como empresa/marca responsável (hero, hub eyebrows, cockpit, emails).
- A interface prioriza **decisão de compra assistida** sobre densidade informacional.

### Filosofia de evolução futura

- Padronização **documental primeiro**, implementação depois (este documento precede qualquer migração de tokens).
- Preservar comportamento e arquitetura cognitiva — alterações visuais não movem inteligência para prompts ou UI (ver Engineering Rules).
- Domínios visuais especializados (Cockpit) mantêm autonomia documental dentro do ecossistema.

---

## 3. Escopo

### 3.1 Domínios visuais existentes

```txt
Ecossistema visual Teilor / MIA
├── Consumer App          → /app-mia
├── Founder Cockpit       → /cockpit-fundador
├── Public Metrics        → /teilor-em-numeros
├── Emails transacionais  → lib/*Email*.js (HTML inline)
├── Landing index         → / (placeholder inline)
└── Dev test UI           → /mia-test (inline styles)
```

### 3.2 Consumer App (`/app-mia`)

**Rota:** `pages/app-mia.jsx`

**Componentes principais:** `MIAChat`, `TeilorBrandHero`, `MIALanding`

**CSS dominante:** `mia-chat.css` (49% de todo o CSS do projeto), `mia-typography.css`, `mia-home-polish.css`, `teilor-brand.css`, `mia-brand.css`, `mia-feed.css`, `app-mia.css`

**Container:** `max-width: 780px` (`.app-mia-column`)

**Tokens:** parcial (`--mia-*` em `:root`)

### 3.3 Founder Cockpit (`/cockpit-fundador`)

**Rota:** `pages/cockpit-fundador.jsx`

**Domínio visual especializado** com documentação própria em `docs/analytics/`:

| Documento | Finalidade |
|---|---|
| [`FOUNDER_COCKPIT_DESIGN_SYSTEM.md`](../../analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md) | Tokens `--fc-*`, componentes A.9 |
| [`FOUNDER_COCKPIT_UI_GUIDELINES.md`](../../analytics/FOUNDER_COCKPIT_UI_GUIDELINES.md) | Regras UI Fase D (Analista Executiva) |
| [`FOUNDER_COCKPIT_COMPONENT_MAP.md`](../../analytics/FOUNDER_COCKPIT_COMPONENT_MAP.md) | Mapa lógico de componentes Fase D |
| [`FOUNDER_COCKPIT_PHASE_D_ARCHITECTURE.md`](../../analytics/FOUNDER_COCKPIT_PHASE_D_ARCHITECTURE.md) | Arquitetura Fase D |

**CSS:** `founder-cockpit.css` — único domínio com sistema de tokens **formal e completo** (`--fc-*` scoped a `.founder-cockpit-page`).

**Container:** `max-width: 1200px` (`--fc-max-width`)

**Nota:** Este Design System **não absorve** os documentos do Cockpit. Referencia-os como subdomínio executivo.

### 3.4 Public Metrics (`/teilor-em-numeros`)

**Rota:** `pages/teilor-em-numeros.jsx`

**CSS:** `public-metrics.css` (217 linhas)

**Tokens:** praticamente nenhum — cores hardcoded

**Único breakpoint especial:** `@media (prefers-color-scheme: light)` — única superfície consumer com regras light scheme auditadas

### 3.5 Emails transacionais

**Arquivos:** `lib/miaPriceDropEmailTemplate.js`, `lib/miaAuthLoginEmail.js`

**Implementação:** HTML com estilos **inline** — paleta independente do CSS da app

**Branding:** “MIA da Teilor”, assinatura institucional

**Status:** domínio visual separado; **não auditado** em profundidade na Fase 1 além de registro de existência.

### 3.6 Outros

| Superfície | Estado visual |
|---|---|
| `/` (`pages/index.js`) | Placeholder com inline styles — fora do escopo consumer |
| `/mia-test` | UI de debug com ~50+ blocos inline — dev only |

---

## 4. Arquitetura Visual

### 4.1 Modelo geral

```txt
pages/_app.js
    │
    ├── import styles/design-system/index.css (Patch UI 3 — tokens oficiais)
    ├── import global legacy (11 stylesheets — TODAS as rotas)
    │
    ├── /app-mia ──→ components/ + classes mia-*, teilor-*, app-mia-*
    ├── /cockpit-fundador ──→ founder-cockpit/* + .founder-cockpit-page + --fc-*
    ├── /teilor-em-numeros ──→ public-metrics/* + .public-metrics-*
    └── demais rotas ──→ herdam CSS global sem isolamento
```

### 4.2 Entry point — `pages/_app.js`

Ordem de import (relevante para cascata):

1. **`styles/design-system/index.css`** — entrada única do Design System (Patch UI 3)
2. `styles/mia-chat.css`
3. `styles/mia-brand.css`
4. `styles/mia-avatar.css`
5. `styles/mia-feed.css`
6. `styles/mia-landing.css`
7. `styles/teilor-brand.css`
8. `styles/mia-typography.css`
9. `styles/mia-home-polish.css`
10. `styles/app-mia.css`
11. `styles/public-metrics.css`
12. `styles/founder-cockpit.css`

**Estratégia de compatibilidade (UI 3):** o Design System carrega **primeiro**. Declarações `:root` idênticas nos CSS legados permanecem como ponte temporária; valores computados inalterados. Hardcodes em regras de componente **não** foram migrados.

### 4.2.1 Infraestrutura técnica — `styles/design-system/`

| Arquivo | Responsabilidade |
|---|---|
| `index.css` | **Entrada pública única** — importa categorias nesta ordem: tokens → colors → typography → spacing → radius → shadows → motion |
| `mia-tokens.css` | Registro central; **Runtime Layout Variables** (`--mia-footer-height`, `--mia-keyboard-offset`) |
| `mia-colors.css` | Tokens oficiais de cor (`--mia-surface-*`, `--mia-color-*`, focus rings, `--mia-landing-title-blue`) |
| `mia-typography.css` | Tokens tipográficos (`--mia-font-sans`, `--mia-type-*`) + override mobile @640px — **sem regras de componente** |
| `mia-spacing.css` | `--mia-touch-min`, tokens estimated-savings layout |
| `mia-radius.css` | `--mia-toast-radius` |
| `mia-shadows.css` | `--mia-toast-shadow` |
| `mia-motion.css` | Placeholder — sem tokens consumer formais; keyframes permanecem no CSS legado |

**Coexistência legada:**

| Legado | Papel até migração futura |
|---|---|
| `styles/mia-typography.css` | Regras de componente + duplicata de tokens |
| `styles/mia-chat.css` | Regras + duplicata de tokens layout/surface |
| `styles/teilor-brand.css` | Regras hero + duplicata `--mia-landing-title-blue` |

**Proibido sem patch dedicado:** inventar tokens; remover duplicatas legadas; converter hardcodes para `var()`.

**Import em aplicação:** apenas `import "../styles/design-system/index.css"` em `_app.js` — nunca importar arquivos de categoria individualmente.

### 4.3 Inventário de arquivos CSS

| Arquivo | Linhas | Responsabilidade | Prefixo classes |
|---|---:|---|---|
| `mia-chat.css` | 5.694 | Chat, composer, drawer, login, offer cards, toasts, hub panels | `mia-*`, `send-btn`, `suggestion-btn` |
| `founder-cockpit.css` | 2.244 | Cockpit executivo completo | `founder-*` |
| `mia-feed.css` | 1.592 | Feed panel, cards, onboarding | `mia-feed-*` |
| `mia-home-polish.css` | 424 | Polish intro/home (`body.mia-app-intro`) | body modifiers |
| `mia-landing.css` | 383 | Landing marketing | `mia-landing-*` |
| `teilor-brand.css` | 253 | Hero Teilor, trust block | `teilor-brand-*` |
| `mia-typography.css` | 299 | Escala tipográfica consumer | selectors semânticos |
| `public-metrics.css` | 217 | Teilor em Números | `public-metrics-*` |
| `mia-brand.css` | 161 | MIAWordmark | `mia-wordmark-*` |
| `app-mia.css` | 144 | Layout shell `/app-mia` | `app-mia-*` |
| `mia-avatar.css` | 100 | MIAAvatar sizes | `mia-avatar-*` |

**Total:** ~11.511 linhas

### 4.4 Tecnologias **não** utilizadas (auditado)

- Tailwind CSS
- CSS Modules (`.module.css`)
- styled-components / Emotion
- Theme Provider React
- Bibliotecas de componentes UI (MUI, Chakra, etc.)

### 4.5 Estilização imperativa (runtime)

`MIAChat.jsx` altera via JavaScript:

- `--mia-keyboard-offset`
- `--mia-footer-height`

`document.body` recebe classes toggled:

- `mia-app-intro`
- `mia-app-conversation`
- `mia-app-drawer-open`

### 4.6 Fluxo visual Consumer App

```txt
/app-mia
  ├── TeilorBrandHero (colapsável → body.mia-app-conversation)
  ├── MIAChat
  │     ├── Header (MIAWordmark + avatar)
  │     ├── Messages + offer cards
  │     ├── Composer (input + send-btn + mic)
  │     ├── Drawer (sidebar menu)
  │     └── Hub panels (portal)
  └── MIALanding (scroll below)
```

### 4.7 Assets de marca

**Configuração:** `lib/brandAssets.js`

```
public/brand/
├── avatars/mia-avatar-primary.png
├── logos/teilor-logo-primary.png
├── favicon/.gitkeep
└── icons/.gitkeep
```

---

## 5. Design Tokens

Tokens **existentes hoje** — nenhum token novo deve ser criado nesta fase documental.

### 5.1 Consumer — `:root` (`mia-typography.css`)

| Token | Valor | Finalidade |
|---|---|---|
| `--mia-font-sans` | system-ui stack | Família base consumer |
| `--mia-type-conversation-{size,lh,weight}` | 15px / 1.56 / 500 | Mensagens MIA |
| `--mia-type-input-{size,lh,weight}` | 15px / 1.48 / 400 | Composer input |
| `--mia-type-action-{size,lh,weight}` | 14px / 1.36 / 600 | CTAs, header title |
| `--mia-type-support-{size,lh,weight}` | 13px / 1.42 / 500 | Chips, placeholder |
| `--mia-type-caption-{size,lh,weight}` | 12px / 1.38 / 500 | Hints, taglines |
| `--mia-type-meta-{size,lh,weight}` | 11px / 1.34 / 500 | Meta UI |
| `--mia-type-whisper-{size,lh,weight}` | 10px / 1.32 / 500 | Trust block |
| `--mia-color-conversation` | `#f4faff` | Texto conversa |
| `--mia-color-support` | `rgba(204,222,238,0.9)` | Texto suporte |
| `--mia-color-meta` | `rgba(176,200,222,0.82)` | Meta |
| `--mia-color-whisper` | `rgba(158,186,210,0.72)` | Whisper |
| `--mia-color-placeholder` | `rgba(168,196,220,0.68)` | Placeholder |

**Override mobile** (`@media max-width: 640px`): `--mia-type-conversation-size: 14.5px`, `--mia-type-input-size: 16px` (anti-zoom iOS).

### 5.2 Consumer — `:root` (`mia-chat.css`)

| Token | Valor | Finalidade |
|---|---|---|
| `--mia-footer-height` | `118px` (runtime) | Layout footer composer |
| `--mia-keyboard-offset` | `0px` (runtime) | Teclado mobile |
| `--mia-estimated-savings-lift` | `96px` | Toast economia |
| `--mia-estimated-savings-stack-gap` | `12px` | Stack toast |
| `--mia-estimated-savings-card-estimate` | `60px` | Card estimate |
| `--mia-surface-panel` | `#04132A` | Painéis |
| `--mia-surface-card` | linear-gradient(...) | Cards |
| `--mia-border-subtle` | `rgba(255,255,255,0.08)` | Bordas |
| `--mia-text-muted` | `#7A9BB8` | Texto muted |
| `--mia-text-soft` | `#9FD8FF` | Texto soft |
| `--mia-toast-radius` | `14px` | Toast |
| `--mia-toast-shadow` | `0 6px 28px rgba(0,0,0,0.5)` | Toast |
| `--mia-focus-ring` | `rgba(0,198,255,0.45)` | Focus ciano |
| `--mia-focus-ring-purple` | `rgba(123,97,255,0.45)` | Focus roxo |
| `--mia-touch-min` | `44px` | Alvo touch |

### 5.3 Consumer — misc (`teilor-brand.css`)

| Token | Valor |
|---|---|
| `--mia-landing-title-blue` | `#00C6FF` |

### 5.4 Founder Cockpit — `.founder-cockpit-page` (`founder-cockpit.css`)

Ver [`FOUNDER_COCKPIT_DESIGN_SYSTEM.md`](../../analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md) para detalhes completos.

Resumo: 32 tokens `--fc-*` cobrindo background, accent, text, semantic colors, radius, space, shadow, layout, font, transition.

### 5.5 Tokens duplicados (sem unificação formal)

| Valor | Ocorrências token/hardcode |
|---|---|
| `#7a9bb8` | `--mia-text-muted`, `--fc-text-muted`, hardcoded |
| `#00c6ff` | `--fc-accent`, `--mia-landing-title-blue`, hardcoded 61× |
| `#f4faff` | `--mia-color-conversation`, hardcoded 52× |
| `#e8d5a3` | `--fc-gold`, `.mia-landing-trust-featured-gold` |
| `#f4e8d4` | hardcoded only (trust consumer, CTA disabled pós Patch UI 1) |

### 5.6 O que não possui token (estado auditado)

- ~90% das cores (133 hex únicos, 329 rgba únicos)
- Border-radius (10+ valores)
- Spacing consumer (sem escala `--mia-space-*`)
- z-index (ad hoc)
- Transitions (durations variadas)
- Box-shadows (centenas de declarações únicas)

---

## 6. Sistema de Cores

### 6.1 Paleta por função semântica (observada)

#### Background

| Cor | Uso |
|---|---|
| `#050d1f`, `#07112b`, `#071733` | Page backgrounds consumer |
| `#030b18`, `#061428`, `#0a1f3d` | Cockpit gradients |
| `linear-gradient(135deg, #050d1f 0%, #07112b 100%)` | `.app-mia-page` |

#### Surface

| Cor / padrão | Uso |
|---|---|
| `#04132a` (`--mia-surface-panel`) | Painéis |
| `--mia-surface-card` gradient | Cards |
| `rgba(6,17,42,0.96)` – `rgba(11,30,62,0.92)` | Glass cards |

#### Accent primary (ciano)

| Cor | Uso |
|---|---|
| `#00c6ff` | Universal — CTAs, borders, glow, beta badge |
| `#00d8ff`, `#00c2ea`, `#24e0ff`, `#00d0f0` | Gradientes CTA, hover |

#### Accent secondary (roxo)

| Cor | Uso |
|---|---|
| `#7b61ff`, `rgba(123,97,255,*)` | Input borders, focus purple, glow pulse |

#### Brand gold (3 famílias — inconsistência documentada)

| Hex | Contexto auditado |
|---|---|
| `#f4e8d4` | Trust block primary (`teilor-brand-trust-line--primary`), CTA disabled |
| `#e8d5a3` | Landing featured gold, `--fc-gold` |
| `#f2e4bc` | Landing `<strong>` emphasis |

#### Text

| Nível | Cores principais |
|---|---|
| Primary | `#f4faff`, `#f0f8ff`, `#edf2f7`, `#e8f4fc` |
| Secondary | `#eaf6ff`, `#dcefff`, `#eaf4ff` |
| Muted | `#7a9bb8`, `#8aa8c4`, `#9bb8d4` |
| On accent | `#041428`, `#041028` |

#### Semantic

| Estado | Consumer | Cockpit token |
|---|---|---|
| Success | `#72d4a8`, `#22c55e` | `--fc-success` `#6ee7a0` |
| Warning | — | `--fc-warning` `#ffe08a` |
| Error | `#ffb4b4`, `#ff6b6b` | `--fc-error` `#ffb4b4` |

#### Borders

- `rgba(255,255,255,0.06–0.14)` — glass dividers
- `rgba(0,198,255,0.18–0.46)` — accent borders
- `rgba(123,97,255,0.22)` — input borders

#### Overlay / glass

- `backdrop-filter: blur(6–8px)`
- `rgba(0,0,0,0.42–0.6)` overlays

#### Disabled / loading

- CTA disabled: fundo ciano 22% opacity, texto `#f4e8d4` (Patch UI 1)
- Loading: `.send-btn--loading`, pulse animations

### 6.2 Top 10 hex por frequência

| Count | Hex |
|---:|---|
| 61 | `#00c6ff` |
| 52 | `#f4faff` |
| 34 | `#7a9bb8` |
| 20 | `#eaf6ff` |
| 18 | `#8aa8c4` |
| 18 | `#9bb8d4` |
| 17 | `#dcefff` |
| 15 | `#e8f4fc` |
| 10 | `#9fe8ff` |
| 5 | `#f4e8d4` |

---

## 7. Tipografia

### 7.1 Famílias

| Contexto | font-family |
|---|---|
| Consumer | `--mia-font-sans`: system-ui, Segoe UI, Roboto… |
| MIAWordmark | Inter, Segoe UI, system-ui (override) |
| Cockpit | `--fc-font`: Segoe UI, system-ui |

### 7.2 Escala consumer (`mia-typography.css`)

Documentada inline como PATCH 3.5:

```txt
conversa (15px/500) > input (15px/400) > action/CTA (14px/600)
> support (13px/500) > caption (12px/500) > meta (11px/500) > whisper (10px/500)
```

### 7.3 Aplicação por superfície

| Superfície | Implementação |
|---|---|
| Chat messages | `--mia-type-conversation-*`, `--mia-color-conversation` |
| Composer input | `--mia-type-input-*`; mobile 16px |
| send-btn | `--mia-type-action-*` + rules em `mia-chat.css` |
| Header | MIAWordmark md + tagline caption `#72d4a8` |
| Trust block | whisper scale + `#f4e8d4` / `#9fe8ff` |
| Landing | **hardcoded** — fora da escala token |
| Offer cards | **hardcoded** 11–22px |
| Hub panels | ~14–20px hardcoded |
| Cockpit | `--fc-*` text hierarchy |

### 7.4 Inconsistências documentadas

- Landing e offer cards não usam `--mia-type-*`.
- MIAWordmark usa Inter; resto usa system stack.
- Cockpit tem hierarquia própria via `--fc-*`.

---

## 8. Espaçamentos

### 8.1 Consumer — sem escala formal

Padrões empíricos auditados:

| Valor | Uso |
|---:|---|
| 4–6px | Micro gaps intro |
| 8–10px | Turn gaps, send-row |
| 12–14px | Card/input padding |
| 16–18px | Shell padding |
| 24–32px | Landing sections |
| 44px | `--mia-touch-min`, mobile button min-height |

### 8.2 Cockpit — escala formal

`--fc-space-xs` (6) → `--fc-space-xl` (32)

### 8.3 Containers

| Domínio | max-width |
|---|---|
| Consumer | 780px (`.app-mia-column`) |
| Cockpit | 1200px (`--fc-max-width`) |
| Drawer | `min(320px, 38vw)` @901px |

---

## 9. Radius

### 9.1 Valores observados (sem escala consumer)

| px | Uso típico |
|---:|---|
| 8 | Cockpit sm (`--fc-radius-sm`) |
| 10–11 | Small buttons, badges |
| 12 | Cards, inputs mobile, cockpit md |
| 14 | CTAs, toasts (`--mia-toast-radius`), panels |
| 16 | Cards grandes, landing sections |
| 18–20 | Offer cards, bubbles |
| 999px | Pills, chips, avatars circulares |

### 9.2 Cockpit formal

`--fc-radius-sm` 8 · `--fc-radius-md` 12 · `--fc-radius-lg` 16 · `--fc-radius-pill` 999

---

## 10. Sombras

### 10.1 Padrões recorrentes

| Padrão | Contexto |
|---|---|
| `0 6px 28px rgba(0,0,0,0.5)` | Toast (`--mia-toast-shadow`) |
| `0 8px 32px rgba(0,0,0,0.28)` | Cockpit card (`--fc-shadow-card`) |
| `0 12px 40px rgba(0,0,0,0.35)` | Cockpit hover |
| `inset 0 1px 0 rgba(255,255,255,0.05–0.28)` | Glass highlight |
| `0 0 20px rgba(0,198,255,0.14–0.32)` | Cyan glow hover |
| `0 0 20px rgba(123,97,255,0.7)` | Purple glow pulse |

### 10.2 Lacuna

Inventário exaustivo de todas as declarações `box-shadow` **não realizado** na Fase 1 (volume > 500 entradas em `mia-chat.css`).

---

## 11. Gradientes

### 11.1 Signature gradients (auditados)

| Gradiente | Uso |
|---|---|
| `#050d1f → #07112b` | App page background |
| `#00D8FF → #00C2EA → rgba(0,198,255,0.28)` | send-btn enabled |
| `#0F4A8A → #0B3568` | User message bubble |
| `rgba(0,198,255,0.18) → rgba(123,97,255,0.14)` | Drawer primary button |
| `rgba(8,22,52,0.94) → rgba(6,16,38,0.98)` | Trust block |
| `#030b18 → #061428 → #0a1f3d` | Cockpit page |

### 11.2 Lacuna

Dezenas de gradientes únicos em offer cards e panels — não catalogados individualmente na Fase 1.

---

## 12. Motion

### 12.1 Keyframes existentes

**`mia-chat.css` (21):** `typing`, `fadeIn`, `glowPulse`, `pulseStar`, `confettiPop`, `slideIn`, `toastSlideUp`, `miaEstimatedSavingsEnter/Exit`, `miaThinkingScan`, `miaOverlayFade`, `miaDrawerSlideIn`, `miaHubPanelSlideIn`, `miaOpeningArrive`, `miaOpeningPresenceBreath/Dot`, `miaPlaceholderCursorBlink`, `miaLoadingPulse/Mobile`

**`mia-feed.css` (5):** `miaFeedHintBounce`, `miaFeedSwipeHand`, `miaFeedSwipeDot`, `miaFeedOnboardingIn/Out`

**`founder-cockpit.css` (1):** `founder-shimmer`

**`teilor-brand.css`:** tagline swap via JS (320ms fade) + CSS transition

### 12.2 Transitions

- CTAs: `0.15–0.18s ease`
- Hero collapse: `0.34–0.46s cubic-bezier`
- Cockpit: `--fc-transition: 160ms ease`

### 12.3 Reduced motion

`@media (prefers-reduced-motion: reduce)` presente em 9 arquivos — desativa animações.

---

## 13. Responsividade

### 13.1 Breakpoints auditados

| Query | Usos | Domínio |
|---|---:|---|
| `max-width: 640px` | 19 | **Principal** — consumer mobile |
| `min-width: 641px` | 3 | Desktop typography/hero |
| `min-width: 901px` | 3 | Drawer width, feed, landing |
| `max-width: 900px` | 1 | Chat layout |
| `max-width: 768px` | 1 | Cockpit |
| `max-width: 480px` | 1 | Cockpit |
| `max-width: 380px` | 1 | Chat ultra-narrow |
| `768–1024px` | 1 | Cockpit tablet range |
| `(hover: hover) and (pointer: fine)` | 17 | Hover desktop only |
| `(hover: none)` | 1 | Touch |
| `prefers-reduced-motion` | 9 | A11y |
| `prefers-contrast: more` | 1 | Wordmark |
| `prefers-color-scheme: light` | 1 | Public metrics |

### 13.2 Ladder de largura

```txt
380px → 480px → 640px (primary) → 768px → 900/901px → 1024px
```

---

## 14. Acessibilidade

### 14.1 Padrões implementados (auditados)

| Recurso | Implementação |
|---|---|
| Focus visible | `outline: 2px solid var(--mia-focus-ring*)` em buttons, inputs, cards |
| Touch targets | `--mia-touch-min: 44px` |
| Reduced motion | Desativa animações em 9 arquivos |
| High contrast | Wordmark `#F8FAFC` em `prefers-contrast: more` |
| ARIA | Drawer `role="dialog"`, login modal, hub panels |
| Screen reader | `aria-label` em composer, menu, wordmark |

### 14.2 Lacunas documentadas

- Contraste não auditado sistematicamente (WCAG AA) na Fase 1.
- z-index extremos (100000) sem layer system documentado.

---

## 15. Branding

### 15.1 Entidades

| Entidade | Representação | Papel |
|---|---|---|
| **MIΛ (MIA)** | `MIAWordmark` componente, `MIA_BRAND = "MIΛ"` | Produto / assistente |
| **Teilor** | Logo PNG, texto hardcoded | Empresa / marca |

### 15.2 Componentes oficiais

| Componente | Arquivo | Asset |
|---|---|---|
| MIAWordmark | `components/MIAWordmark.jsx` | Texto tipográfico |
| MIAAvatar | `components/MIAAvatar.jsx` | `/brand/avatars/mia-avatar-primary.png` |
| Teilor logo | `TeilorBrandHero`, cockpit, metrics | `/brand/logos/teilor-logo-primary.png` |
| MIAMenuSymbol | `components/MIAMenuSymbol.jsx` | Símbolo pequeno |

### 15.3 Hierarquia por superfície (estado auditado pós Patch UI 1)

| Superfície | Hierarquia | Status |
|---|---|---|
| Chat header | **MIΛ** primário | Alinhado |
| Sidebar drawer | **MIΛ** + Powered by Teilor | Alinhado (Patch UI 1) |
| MIALanding eyebrow | Teilor · Powered by **MIΛ** | **Inconsistente** com header/drawer |
| Hub panels eyebrow | "Central Teilor" | Contexto empresa |
| TeilorBrandHero | Logo Teilor + trust | Institucional |

### 15.4 Princípios (observados, não prescritivos de migração)

- MIΛ é a face do produto na experiência de chat.
- Teilor é a empresa por trás — presente em hero, hubs, cockpit, emails.
- Hierarquia visual **não unificada** em todas as superfícies — ver inconsistências.

---

## 16. Catálogo de Componentes

### 16.1 Consumer — Core

| Componente | Arquivo | CSS prefix | Variações / estados |
|---|---|---|---|
| MIAChat | `MIAChat.jsx` | `mia-chat-*` | intro, conversation, drawer, modal, keyboard |
| TeilorBrandHero | `TeilorBrandHero.jsx` | `teilor-brand-*` | tagline rotation |
| MIALanding | `MIALanding.jsx` | `mia-landing-*` | static |
| MIAWordmark | `MIAWordmark.jsx` | `mia-wordmark-*` | xs–xl, beta |
| MIAAvatar | `MIAAvatar.jsx` | `mia-avatar-*` | header/compact/chat/feed… |
| send-btn | inline in MIAChat | `send-btn` | enabled, disabled, loading |
| suggestion-btn | inline in MIAChat | `suggestion-btn*` | primary, secondary |

### 16.2 Hub Panels

| Componente | Prefix |
|---|---|
| MIAProfilePanel | `mia-profile-hub-*` |
| MIAProfileEditPanel | `mia-profile-edit-*` |
| MIAFavoritesPanel | `mia-favorites-hub-*` |
| MIAAlertsPanel | `mia-alerts-hub-*` |
| MIASettingsPanel | `mia-settings-hub-*` |
| MIAHelpPanel | `mia-help-hub-*` |
| MIAHowItWorksPanel | `mia-how-hub-*` |
| FeedPanel | `mia-feed-hub-*` |

### 16.3 Feed

| Componente | Prefix |
|---|---|
| FeedCard | `mia-feed-card-*` |
| FeedEmptyState | `mia-feed-empty-*` |
| FeedEducationSection | `mia-feed-edu-*` |
| FeedSwipeOnboarding | `mia-feed-onboarding-*` |

### 16.4 Cards & media

| Componente | Prefix |
|---|---|
| Offer cards (in MIAChat) | `mia-offer-card-*` |
| OfferImageLightbox | `mia-image-lightbox-*` |
| ChatImageAttachment | `mia-chat-image-attachment-*` |

### 16.5 Notices & toasts

| Componente | Prefix |
|---|---|
| MIAEstimatedSavingsNotice | `mia-estimated-savings*` |
| MIACommercialTransparencyNotice | `mia-commercial-transparency-*` |
| Toasts (in MIAChat) | `mia-toast*`, `mia-action-toast*` |

### 16.6 Drawer & login

| Elemento | Prefix |
|---|---|
| Side drawer | `mia-drawer-*` |
| Login sheet | `mia-login-*` |

### 16.7 Public Metrics

| Componente | Prefix |
|---|---|
| PublicMetricsPage | `public-metrics-*` |
| PublicMetricCard | `public-metrics-card-*` |

### 16.8 Founder Cockpit (26 componentes)

Ver [`FOUNDER_COCKPIT_DESIGN_SYSTEM.md`](../../analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md) e [`FOUNDER_COCKPIT_COMPONENT_MAP.md`](../../analytics/FOUNDER_COCKPIT_COMPONENT_MAP.md).

Principais: `FounderCockpitPage`, `FounderMetricCard`, `FounderSkeleton`, `FounderModuleSection`, charts (`FounderBarChart`, `FounderLineChart`), executive modules.

**Total componentes visuais mapeados:** 52

---

## 17. Estados Visuais

### 17.1 Interação

| Estado | Implementação típica |
|---|---|
| Default | classe base |
| Hover | `@media (hover: hover) and (pointer: fine)` — 17 blocos |
| Focus-visible | `--mia-focus-ring` / `--mia-focus-ring-purple` |
| Active/pressed | `:active`, `scale(0.98)` |
| Disabled | `:disabled`, opacity 0.72–0.78 |

### 17.2 Funcionais

| Estado | Implementação |
|---|---|
| Loading | `--loading`, pulse, skeleton, cognitive loading text |
| Selected | `--active` BEM modifier (settings, filters) |
| Expanded | FAQ accordion, insight cards |
| Empty | `--empty` states (feed, favorites, alerts) |
| Error/partial | `--error`, `--partial` (cockpit) |

### 17.3 Modo

| Estado | Trigger |
|---|---|
| Intro | `body.mia-app-intro`, `.mia-chat-root--intro` |
| Conversation | `body.mia-app-conversation` |
| Drawer open | `body.mia-app-drawer-open`, `--drawer-open` |
| Keyboard open | `--keyboard-open`, `--mia-keyboard-offset` |

---

## 18. Boas práticas

Baseadas no que **já funciona** no codebase auditado:

1. **Usar tokens existentes** quando disponíveis (`--mia-type-*`, `--mia-focus-ring`, `--fc-*` no cockpit).
2. **Respeitar escala tipográfica** PATCH 3.5 para novos textos no chat/intro.
3. **Prefixo `mia-`** para novos componentes consumer — evitar classes legadas sem prefixo.
4. **Touch min 44px** via `--mia-touch-min` em controles interativos.
5. **Hover condicional** — usar `@media (hover: hover) and (pointer: fine)`.
6. **Reduced motion** — incluir fallback em novas animações.
7. **Focus-visible** — nunca remover outlines sem substituto.
8. **Reutilizar componentes de marca** — `MIAWordmark`, `MIAAvatar` — não duplicar MIΛ como texto solto.
9. **Alterações visuais cirúrgicas** — escopo mínimo, sem refatoração oportunista (Engineering Rules).
10. **Consultar este documento** antes de introduzir novas cores ou breakpoints.

---

## 19. Anti-patterns

Documentados do estado auditado — **evitar em novas implementações:**

1. **Hardcode de cores** quando token equivalente existe (`#7a9bb8` vs `--mia-text-muted`).
2. **Classes sem prefixo** (`send-btn`, `suggestion-btn`, `fade-in`) — legado.
3. **Novo hex gold** sem mapear às 3 famílias existentes (`#f4e8d4`, `#e8d5a3`, `#f2e4bc`).
4. **z-index arbitrário** (100000) sem layer system.
5. **CSS global não isolado** — adicionar regras broad que afetam cockpit/metrics.
6. **Inline styles** em produção (exceto dinâmico: transform, width %, animation delay).
7. **Duplicar hierarquia de branding** inconsistente (Teilor primário onde MIΛ deveria ser produto).
8. **Ignorar mobile 640px** — breakpoint principal consumer.
9. **Input mobile < 16px** — causa zoom iOS (escala formal usa 16px).
10. **Inventar tokens** sem patch de migração documentado.
11. **Absorver docs do Cockpit** neste documento — manter domínios separados.
12. **Mover cognição para UI** — Design System é apresentação; inteligência permanece na arquitetura.

---

## 20. Governança

### 20.1 Hierarquia documental

```txt
docs/core/design/MIA_DESIGN_SYSTEM.md        ← este documento (oficial consumer + visão global)
docs/core/design/MIA_DESIGN_SYSTEM_AUDIT.md  ← registro técnico Fase 1
docs/analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md ← cockpit especializado
docs/core/architecture/MIA_ARCHITECTURE.md   ← arquitetura cognitiva (prioridade sobre UI)
docs/core/rules/MIA_ENGINEERING_RULES.md     ← regras de engenharia
```

### 20.2 Processo para alterações visuais

1. Verificar se alteração está no escopo de um domínio (consumer vs cockpit vs metrics).
2. Consultar tokens e padrões existentes neste documento.
3. Preferir patch cirúrgico (ex.: Patch UI 1) — CSS/JSX mínimo.
4. Não criar tokens novos sem patch de migração futuro (`MIA_DESIGN_SYSTEM_MIGRATION_PLAN.md` — a criar).
5. Atualizar este documento quando padrões oficiais mudarem.
6. Preservar [`MIA_DESIGN_SYSTEM_AUDIT.md`](MIA_DESIGN_SYSTEM_AUDIT.md) como registro histórico — não reescrever.

### 20.3 Relação com Engineering Rules

- Design System governa **apresentação**.
- Architecture governa **inteligência**.
- UI nunca decide, ranqueia ou inventa conclusões.

### 20.4 Versionamento

- Incrementar versão deste documento em alterações estruturais.
- Patch UI N = alteração visual; documentação correspondente registra versão.

---

## Referências cruzadas

| Documento | Relação |
|---|---|
| [`MIA_DESIGN_SYSTEM_AUDIT.md`](MIA_DESIGN_SYSTEM_AUDIT.md) | Evidência técnica Fase 1 |
| [`../architecture/MIA_ARCHITECTURE.md`](../architecture/MIA_ARCHITECTURE.md) | Arquitetura proprietária |
| [`../rules/MIA_ENGINEERING_RULES.md`](../rules/MIA_ENGINEERING_RULES.md) | Regras de engenharia |
| [`../../analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md`](../../analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md) | Subdomínio cockpit |

---

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

A camada visual serve a experiência — não substitui a arquitetura cognitiva.
