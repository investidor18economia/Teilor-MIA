import { useCallback, useEffect, useRef, useState } from "react";
import FounderMetricCard from "./FounderMetricCard.jsx";
import FounderSkeleton from "./FounderSkeleton.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { mapExecutiveMetricsToFounderExecutiveKpis } from "../../lib/miaFounderExecutiveDisplay.js";
import { useRegisterExecutiveModuleView } from "./FounderExecutiveModuleViewsContext.jsx";
import { EXECUTIVE_MODULE_DISCLAIMERS } from "../../lib/miaFounderExecutivePolishCatalog.js";

function ExecutiveKpiCard({ kpi }) {
  return (
    <div role="listitem" className="founder-executive-kpi-item">
      <FounderMetricCard
        metric={kpi}
        variant={kpi.highlight ? "highlight" : "executive"}
      />
      {kpi.badge ? (
        <span
          className={`founder-executive-badge founder-executive-badge--${kpi.badge.id}`}
          aria-label={`Status: ${kpi.badge.label}`}
        >
          {kpi.badge.label}
        </span>
      ) : null}
      {kpi.trend ? (
        <span
          className={`founder-executive-trend founder-executive-trend--${kpi.trend.direction}`}
          aria-label={`Tendência: ${kpi.trend.directionLabel}`}
        >
          <span className="founder-executive-trend-icon" aria-hidden="true">
            {kpi.trend.direction === "up" ? "↑" : kpi.trend.direction === "down" ? "↓" : "→"}
          </span>
          <span className="founder-executive-trend-pct">{kpi.trend.pctFormatted}</span>
          <span className="founder-executive-trend-label">{kpi.trend.directionLabel}</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * @param {{ executiveMetrics?: Record<string, unknown>|null }} props
 */
export default function FounderExecutiveKpisSection({ executiveMetrics = null }) {
  const { buildTemporalQueryString } = useFounderCockpitFilters();
  const [state, setState] = useState({ status: "loading", view: null, error: null });
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, error: null });
    try {
      const series = "growth,platform_activity,products,categories,conversion";
      const res = await fetch(`/api/temporal-metrics?${buildTemporalQueryString(series)}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setState({ status: "error", view: null, error: `http_${res.status}` });
        return;
      }
      const temporal = await res.json();
      const view = mapExecutiveMetricsToFounderExecutiveKpis(executiveMetrics, temporal);
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
  }, [buildTemporalQueryString, executiveMetrics]);

  useEffect(() => {
    load();
  }, [load]);

  useRegisterExecutiveModuleView("kpis", state.view);

  const { view } = state;
  const kpiById = new Map((view?.kpis ?? []).map((kpi) => [kpi.id, kpi]));

  return (
    <section
      className="founder-executive-kpis founder-executive-module"
      id="mod-kpis-estrategicos"
      aria-labelledby="heading-kpis-estrategicos"
    >
      <div className="founder-executive-kpis-header">
        <div>
          <h2 className="founder-executive-kpis-title" id="heading-kpis-estrategicos">
            KPIs Estratégicos
          </h2>
          <p className="founder-module-disclaimer" role="note">
            {EXECUTIVE_MODULE_DISCLAIMERS.kpis}
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <FounderSkeleton variant="grid" count={10} label="Carregando KPIs estratégicos…" />
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-sessions-state founder-sessions-state--error" role="alert">
          KPIs estratégicos indisponíveis ({state.error}). Snapshot executivo permanece abaixo.
        </p>
      ) : null}

      {view ? (
        <>
          {view.meta.status === "partial" ? (
            <p className="founder-sessions-state founder-sessions-state--partial" role="status">
              Alguns KPIs retornaram parcialmente
              {view.meta.partial_errors?.length ? ` (${view.meta.partial_errors.length} avisos)` : ""}.
            </p>
          ) : null}

          {view.groups.map((group) => {
            const groupKpis = group.kpiIds.map((id) => kpiById.get(id)).filter(Boolean);
            if (!groupKpis.length) return null;
            return (
              <div key={group.id} className="founder-executive-kpi-group">
                <h3 className="founder-executive-kpi-group-title">{group.title}</h3>
                <div className="founder-executive-kpi-grid" role="list">
                  {groupKpis.map((kpi) => (
                    <ExecutiveKpiCard key={kpi.id} kpi={kpi} />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </section>
  );
}
