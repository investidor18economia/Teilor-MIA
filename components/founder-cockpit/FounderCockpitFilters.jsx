import { useEffect, useState } from "react";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS } from "../../lib/miaFounderFiltersCatalog.js";

export default function FounderCockpitFilters() {
  const {
    display,
    draft,
    pending,
    appliedFilters,
    setDraftField,
    syncDraftFromApplied,
    applyFilters,
    clearFilters,
  } = useFounderCockpitFilters();
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    syncDraftFromApplied();
  }, [appliedFilters.range, appliedFilters.category, appliedFilters.product_id, syncDraftFromApplied]);

  async function onApply() {
    setLocalError(null);
    const result = await applyFilters();
    if (!result.ok) {
      setLocalError(result.errors?.[0]?.code ?? "invalid_filters");
    }
  }

  return (
    <section className="founder-cockpit-filters" aria-labelledby="heading-founder-filters">
      <div className="founder-cockpit-filters-row">
        <div>
          <h2 className="founder-cockpit-filters-title" id="heading-founder-filters">
            Filtros
          </h2>
          <p className="founder-cockpit-filters-summary" role="status">
            {display.periodSummary}
            {display.meta.is_applied ? " · filtros ativos" : " · padrão"}
          </p>
        </div>
        <div className="founder-cockpit-filters-actions">
          <button type="button" className="founder-retry-btn" onClick={onApply} disabled={pending}>
            {pending ? "Aplicando…" : "Aplicar"}
          </button>
          <button
            type="button"
            className="founder-cockpit-filters-clear"
            onClick={clearFilters}
            disabled={pending || display.meta.is_default}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="founder-cockpit-filters-grid">
        <fieldset className="founder-cockpit-filter-fieldset">
          <legend>Período</legend>
          <div className="founder-period-filter" role="group" aria-label="Período de análise">
            {display.periodPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`founder-period-btn${draft.range === preset.id ? " founder-period-btn--active" : ""}`}
                aria-pressed={draft.range === preset.id}
                disabled={pending}
                onClick={() => setDraftField("range", preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </fieldset>

        {draft.range === "custom" ? (
          <div className="founder-cockpit-filter-dates">
            <label className="founder-cockpit-filter-label">
              Início (UTC)
              <input
                type="date"
                className="founder-cockpit-filter-input"
                value={draft.start}
                max={display.todayUtc}
                onChange={(e) => setDraftField("start", e.target.value)}
                disabled={pending}
              />
            </label>
            <label className="founder-cockpit-filter-label">
              Fim (UTC)
              <input
                type="date"
                className="founder-cockpit-filter-input"
                value={draft.end}
                max={display.todayUtc}
                onChange={(e) => setDraftField("end", e.target.value)}
                disabled={pending}
              />
            </label>
            <p className="founder-cockpit-filter-hint">
              Máximo {MIA_FOUNDER_FILTERS_MAX_CUSTOM_DAYS} dias · timezone {display.meta.timezone}
            </p>
          </div>
        ) : null}

        <label className="founder-cockpit-filter-label">
          Categoria
          <select
            className="founder-cockpit-filter-select"
            value={draft.category}
            onChange={(e) => setDraftField("category", e.target.value)}
            disabled={pending}
          >
            {display.categoryOptions.map((opt) => (
              <option key={opt.id || "all"} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="founder-cockpit-filter-label">
          Produto (ID oficial)
          <input
            type="text"
            className="founder-cockpit-filter-input"
            placeholder="Opcional — product_id"
            value={draft.product_id}
            onChange={(e) => setDraftField("product_id", e.target.value.trim())}
            disabled={pending}
            maxLength={128}
            autoComplete="off"
          />
        </label>
      </div>

      {display.activeChips.length ? (
        <ul className="founder-cockpit-filter-chips" aria-label="Filtros ativos">
          {display.activeChips.map((chip) => (
            <li key={chip.id}>{chip.label}</li>
          ))}
        </ul>
      ) : null}

      {localError ? (
        <p className="founder-cockpit-filters-error" role="alert">
          Filtro inválido ({localError}). Corrija e aplique novamente.
        </p>
      ) : null}

      <details className="founder-cockpit-filters-unavailable">
        <summary>Compatibilidade e filtros indisponíveis</summary>
        <ul>
          {display.moduleHints
            .filter((m) => !m.fully_compatible)
            .map((m) => (
              <li key={m.module}>
                <strong>{m.module}</strong> — {m.limitations.join("; ")}
              </li>
            ))}
          {display.unavailableFilters.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong> — {item.reason}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
