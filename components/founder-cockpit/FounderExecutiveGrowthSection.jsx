import { useCallback, useEffect, useRef, useState } from "react";
import FounderMetricCard from "./FounderMetricCard.jsx";
import FounderSkeleton from "./FounderSkeleton.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { mapExecutiveGrowthToFounderDisplay } from "../../lib/miaFounderExecutiveGrowthDisplay.js";
import { useRegisterExecutiveModuleView } from "./FounderExecutiveModuleViewsContext.jsx";

function GrowthIndicatorCard({ indicator }) {
  const displayValue =
    indicator.pctFormatted ??
    indicator.velocityLabel ??
    indicator.accelerationLabel ??
    indicator.valueFormatted ??
    indicator.detail ??
    "—";

  return (
    <div role="listitem" className="founder-executive-growth-item">
      <FounderMetricCard
        metric={{
          id: indicator.id,
          label: indicator.title,
          value: displayValue,
          format: "text",
          hint: indicator.hint ?? indicator.description,
        }}
        variant="executive"
      />
      {indicator.badge ? (
        <span className={`founder-executive-badge founder-executive-badge--${indicator.badge.id}`}>
          {indicator.badge.label}
        </span>
      ) : null}
      {indicator.direction && indicator.direction !== "unknown" ? (
        <span className={`founder-executive-trend founder-executive-trend--${indicator.direction}`}>
          <span className="founder-executive-trend-icon" aria-hidden="true">
            {indicator.direction === "up" ? "↑" : indicator.direction === "down" ? "↓" : "→"}
          </span>
          <span className="founder-executive-trend-label">{indicator.directionLabel}</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * @param {{ executiveMetrics?: Record<string, unknown>|null }} props
 */
export default function FounderExecutiveGrowthSection({ executiveMetrics = null }) {
  const { appliedFilters, buildTemporalQueryString, buildExecutiveQueryString } =
    useFounderCockpitFilters();
  const [state, setState] = useState({ status: "loading", view: null, error: null });
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, error: null });
    try {
      const temporalRes = await fetch(
        `/api/temporal-metrics?${buildTemporalQueryString("growth,platform_activity")}`,
        { headers: { Accept: "application/json" }, credentials: "same-origin" }
      );
      if (seq !== requestSeq.current) return;

      let executivePrevious = null;
      const offsetDays = appliedFilters.window_days ?? 30;
      const prevQs = `${buildExecutiveQueryString()}${buildExecutiveQueryString() ? "&" : ""}offset_days=${offsetDays}`;
      try {
        const prevRes = await fetch(`/api/executive-metrics?${prevQs}`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (prevRes.ok) executivePrevious = await prevRes.json();
      } catch {
        executivePrevious = null;
      }

      if (!temporalRes.ok) {
        setState({ status: "error", view: null, error: `http_${temporalRes.status}` });
        return;
      }
      const temporal = await temporalRes.json();
      const view = mapExecutiveGrowthToFounderDisplay(
        executiveMetrics,
        executivePrevious,
        temporal
      );
      setState({
        status: view.meta.status === "error" ? "error" : view.meta.status,
        view,
        error: null,
      });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setState({
        status: "error",
        view: null,
        error: String(err?.message || "fetch_failed"),
      });
    }
  }, [
    appliedFilters.window_days,
    buildExecutiveQueryString,
    buildTemporalQueryString,
    executiveMetrics,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useRegisterExecutiveModuleView("growth", state.view);

  const { view } = state;

  return (
    <section
      className="founder-executive-growth"
      id="mod-crescimento-plataforma"
      aria-labelledby="heading-crescimento-plataforma"
    >
      <div className="founder-executive-growth-header">
        <div>
          <h2 className="founder-executive-growth-title" id="heading-crescimento-plataforma">
            Crescimento da Plataforma
          </h2>
          <p className="founder-module-disclaimer" role="note">
            Evolução executiva · Fontes: API Temporal (growth + platform_activity) + comparativo
            executivo (offset oficial).
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <FounderSkeleton variant="grid" count={8} label="Carregando crescimento da plataforma…" />
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-sessions-state founder-sessions-state--error" role="alert">
          Crescimento executivo indisponível ({state.error}).
        </p>
      ) : null}

      {view ? (
        <>
          {view.meta.status === "partial" ? (
            <p className="founder-sessions-state founder-sessions-state--partial" role="status">
              Alguns comparativos retornaram parcialmente
              {!view.meta.period_compare_available ? " (período anterior indisponível)" : ""}.
            </p>
          ) : null}

          <div className="founder-executive-growth-narrative">
            {view.narrative.badge ? (
              <span
                className={`founder-executive-badge founder-executive-badge--${view.narrative.badge.id}`}
              >
                {view.narrative.badge.label}
              </span>
            ) : null}
            <p className="founder-executive-growth-headline">{view.narrative.headline}</p>
            {view.meta.reference_day_label ? (
              <p className="founder-executive-growth-meta">
                Referência temporal: {view.meta.reference_day_label}
              </p>
            ) : null}
          </div>

          <div className="founder-executive-growth-trends" role="list" aria-label="Tendências rolling">
            {["dau", "wau", "mau"].map((key) => (
              <div key={key} role="listitem" className={`founder-executive-growth-trend founder-executive-growth-trend--${view.trends[key].direction}`}>
                <span className="founder-executive-growth-trend-label">{key.toUpperCase()}</span>
                <span className="founder-executive-growth-trend-value">{view.trends[key].pctFormatted}</span>
              </div>
            ))}
          </div>

          <div className="founder-executive-growth-grid" role="list">
            {view.indicators.map((indicator) => (
              <GrowthIndicatorCard key={indicator.id} indicator={indicator} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
