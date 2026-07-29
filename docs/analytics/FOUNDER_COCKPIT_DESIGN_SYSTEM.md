# Founder Cockpit — Design System (PATCH A.9)

Visual tokens and component conventions for `/cockpit-fundador`. **UI only** — no data or API changes.

## Tokens (`styles/founder-cockpit.css`)

Defined on `.founder-cockpit-page`:

| Token | Usage |
|-------|--------|
| `--fc-bg-*` | Page, panels, elevated surfaces |
| `--fc-accent` | Primary accent `#00c6ff` |
| `--fc-text-*` | Text hierarchy |
| `--fc-radius-*` | 8 / 12 / 16 / pill |
| `--fc-space-*` | 6 / 10 / 16 / 24 / 32 px |
| `--fc-shadow-*` | Cards default & hover |
| `--fc-max-width` | 1200px content |

## Components

| Component | Role |
|-----------|------|
| `FounderMetricCard` | KPI / metric display |
| `FounderSkeleton` | Loading shimmer (card, grid, chart, table) |
| `FounderChartPanel` | Chart wrapper + states |
| `FounderLineChart` / `FounderBarChart` | A.8 visualizations |
| `FounderCockpitFilters` | A.7 filter bar |

## States

- **Loading:** `FounderSkeleton` (aria-busy / aria-label)
- **Error:** `.founder-ui-state--error` or module-specific `--error`
- **Partial:** `.founder-ui-state--partial`
- **Empty:** `.founder-ui-state--empty` / chart empty

## Accessibility

- `:focus-visible` rings on interactive controls
- `prefers-reduced-motion` disables shimmer and card transitions
- Tabular nums on metrics and tables

## Responsive

- Desktop: max-width 1200px centered
- Tablet: 768–1024px grid adjustments
- Mobile: single-column filters, compact tables

## Evidence

- `PATCH_A_9_UI_POLISH_EVIDENCE.json`
- `PATCH_A_9_BROWSER_UI_EVIDENCE.json`
- `PATCH_A_9_CLOSURE_EVIDENCE.json`
