import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FounderMetricCard from "./FounderMetricCard.jsx";
import FounderSkeleton from "./FounderSkeleton.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { mapExecutiveCommercialPerformanceToFounderDisplay } from "../../lib/miaFounderExecutiveCommercialPerformanceDisplay.js";
import { useRegisterExecutiveModuleView } from "./FounderExecutiveModuleViewsContext.jsx";

function CommercialIndicatorCard({ indicator }) {
  const displayValue = indicator.valueFormatted ?? "—";

  return (
    <div role="listitem" className="founder-executive-commercial-item">
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
      {indicator.detail ? (
        <p className="founder-executive-commercial-detail">{indicator.detail}</p>
      ) : null}
    </div>
  );
}

/**
 * @param {{ executiveMetrics?: Record<string, unknown>|null }} props
 */
export default function FounderExecutiveCommercialPerformanceSection({
  executiveMetrics = null,
}) {
  const { appliedFilters, buildTemporalQueryString, buildExecutiveQueryString } =
    useFounderCockpitFilters();
  const [state, setState] = useState({ status: "loading", view: null, error: null });
  const requestSeq = useRef(0);

  const initialView = useMemo(
    () => mapExecutiveCommercialPerformanceToFounderDisplay(executiveMetrics, null, null),
    [executiveMetrics]
  );

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, error: null });

    let executivePrevious = null;
    let temporal = null;
    const offsetDays = appliedFilters.window_days ?? 30;
    const prevQs = `${buildExecutiveQueryString()}${buildExecutiveQueryString() ? "&" : ""}offset_days=${offsetDays}`;

    try {
      const [temporalRes, prevRes] = await Promise.all([
        fetch(`/api/temporal-metrics?${buildTemporalQueryString("conversion")}`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        }),
        fetch(`/api/executive-metrics?${prevQs}`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        }),
      ]);

      if (temporalRes.ok) temporal = await temporalRes.json();
      if (prevRes.ok) executivePrevious = await prevRes.json();
    } catch {
      /* partial load handled by mapper */
    }

    if (seq !== requestSeq.current) return;

    const view = mapExecutiveCommercialPerformanceToFounderDisplay(
      executiveMetrics,
      executivePrevious,
      temporal
    );
    setState({
      status: view.meta.status === "error" ? "error" : view.meta.status,
      view,
      error: null,
    });
  }, [
    appliedFilters.window_days,
    buildExecutiveQueryString,
    buildTemporalQueryString,
    executiveMetrics,
  ]);

  useEffect(() => {
    if (!executiveMetrics) {
      setState({ status: "error", view: null, error: "executive_metrics_unavailable" });
      return;
    }
    load();
  }, [executiveMetrics, load]);

  const view = state.view ?? (state.status === "loading" ? initialView : null);
  useRegisterExecutiveModuleView("commercial", view);

  return (
    <section
      className="founder-executive-commercial"
      id="mod-performance-comercial"
      aria-labelledby="heading-performance-comercial"
    >
      <div className="founder-executive-commercial-header">
        <div>
          <h2 className="founder-executive-commercial-title" id="heading-performance-comercial">
            Performance Comercial
          </h2>
          <p className="founder-module-disclaimer" role="note">
            Eficiência comercial executiva · Fontes: snapshot executivo + temporal conversion.
            {view?.meta?.disclaimer ? ` ${view.meta.disclaimer}` : ""}
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <FounderSkeleton variant="grid" count={10} label="Carregando performance comercial…" />
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-sessions-state founder-sessions-state--error" role="alert">
          Performance comercial indisponível ({state.error}).
        </p>
      ) : null}

      {view ? (
        <>
          {view.meta.status === "partial" ? (
            <p className="founder-sessions-state founder-sessions-state--partial" role="status">
              Alguns comparativos retornaram parcialmente
              {!view.meta.period_compare_available ? " (período anterior indisponível)" : ""}
              {view.meta.volume_confidence === "insufficient" ? " · volume comercial baixo" : ""}.
            </p>
          ) : null}

          <div className="founder-executive-commercial-narrative">
            {view.narrative.badge ? (
              <span
                className={`founder-executive-badge founder-executive-badge--${view.narrative.badge.id}`}
              >
                {view.narrative.badge.label}
              </span>
            ) : null}
            <p className="founder-executive-commercial-headline">{view.narrative.headline}</p>
            {view.commercial_index.formatted !== "—" ? (
              <p className="founder-executive-commercial-meta">
                Índice executivo comercial: {view.commercial_index.formatted}
              </p>
            ) : null}
          </div>

          {view.funnel.stages.length > 0 ? (
            <div className="founder-executive-commercial-funnel" role="list" aria-label="Funil comercial">
              {view.funnel.stages.map((stage, idx) => (
                <div
                  key={stage.id}
                  role="listitem"
                  className={`founder-executive-commercial-funnel-stage${stage.hasEvents ? "" : " founder-executive-commercial-funnel-stage--empty"}`}
                >
                  <span className="founder-executive-commercial-funnel-label">{stage.label}</span>
                  <span className="founder-executive-commercial-funnel-value">{stage.valueFormatted}</span>
                  {idx < view.funnel.stages.length - 1 ? (
                    <span className="founder-executive-commercial-funnel-arrow" aria-hidden="true">
                      ↓
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {view.funnel.main_bottleneck ? (
            <p className="founder-executive-commercial-bottleneck" role="note">
              Gargalo principal: {view.funnel.main_bottleneck.label} · abandono{" "}
              {view.funnel.main_bottleneck.abandonmentFormatted}
            </p>
          ) : null}

          <div className="founder-executive-commercial-grid" role="list">
            {view.indicators.map((indicator) => (
              <CommercialIndicatorCard key={indicator.id} indicator={indicator} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
