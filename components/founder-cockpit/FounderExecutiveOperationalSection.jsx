import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FounderMetricCard from "./FounderMetricCard.jsx";
import FounderSkeleton from "./FounderSkeleton.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { mapExecutiveOperationalToFounderDisplay } from "../../lib/miaFounderExecutiveOperationalDisplay.js";

function OperationalIndicatorCard({ indicator }) {
  const displayValue = indicator.valueFormatted ?? "—";

  return (
    <div role="listitem" className="founder-executive-operational-item">
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
      {indicator.detail ? (
        <p className="founder-executive-operational-detail">{indicator.detail}</p>
      ) : null}
    </div>
  );
}

/**
 * @param {{ executiveMetrics?: Record<string, unknown>|null }} props
 */
export default function FounderExecutiveOperationalSection({ executiveMetrics = null }) {
  const { buildTemporalQueryString } = useFounderCockpitFilters();
  const [state, setState] = useState({ status: "loading", view: null, error: null });
  const requestSeq = useRef(0);

  const initialView = useMemo(
    () => mapExecutiveOperationalToFounderDisplay(executiveMetrics, null),
    [executiveMetrics]
  );

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, error: null });

    let temporal = null;
    try {
      const res = await fetch(`/api/temporal-metrics?${buildTemporalQueryString("growth")}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (res.ok) temporal = await res.json();
    } catch {
      temporal = null;
    }

    if (seq !== requestSeq.current) return;

    const view = mapExecutiveOperationalToFounderDisplay(executiveMetrics, temporal);
    setState({
      status: view.meta.status === "error" ? "error" : view.meta.status,
      view,
      error: null,
    });
  }, [buildTemporalQueryString, executiveMetrics]);

  useEffect(() => {
    if (!executiveMetrics) {
      setState({ status: "error", view: null, error: "executive_metrics_unavailable" });
      return;
    }
    load();
  }, [executiveMetrics, load]);

  const view = state.view ?? (state.status === "loading" ? initialView : null);

  return (
    <section
      className="founder-executive-operational"
      id="mod-indicadores-operacionais"
      aria-labelledby="heading-indicadores-operacionais"
    >
      <div className="founder-executive-operational-header">
        <div>
          <h2 className="founder-executive-operational-title" id="heading-indicadores-operacionais">
            Indicadores Operacionais
          </h2>
          <p className="founder-module-disclaimer" role="note">
            Saúde operacional executiva · Fontes: snapshot system/performance + probe temporal
            (consistência).
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <FounderSkeleton variant="grid" count={9} label="Carregando indicadores operacionais…" />
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-sessions-state founder-sessions-state--error" role="alert">
          Indicadores operacionais indisponíveis ({state.error}).
        </p>
      ) : null}

      {view ? (
        <>
          {view.meta.status === "partial" ? (
            <p className="founder-sessions-state founder-sessions-state--partial" role="status">
              Alguns sinais operacionais retornaram parcialmente
              {view.meta.partial_errors?.length ? ` (${view.meta.partial_errors.length} avisos).` : "."}
            </p>
          ) : null}

          <div className="founder-executive-operational-narrative">
            {view.narrative.badge ? (
              <span
                className={`founder-executive-badge founder-executive-badge--${view.narrative.badge.id}`}
              >
                {view.narrative.badge.label}
              </span>
            ) : null}
            <p className="founder-executive-operational-headline">{view.narrative.headline}</p>
            {view.operational_index.formatted !== "—" ? (
              <p className="founder-executive-operational-meta">
                Índice executivo operacional: {view.operational_index.formatted}
              </p>
            ) : null}
          </div>

          <div className="founder-executive-operational-grid" role="list">
            {view.indicators.map((indicator) => (
              <OperationalIndicatorCard key={indicator.id} indicator={indicator} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
