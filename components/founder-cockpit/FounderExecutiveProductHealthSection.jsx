import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FounderMetricCard from "./FounderMetricCard.jsx";
import FounderSkeleton from "./FounderSkeleton.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { mapExecutiveProductHealthToFounderDisplay } from "../../lib/miaFounderExecutiveProductHealthDisplay.js";
import { useRegisterExecutiveModuleView } from "./FounderExecutiveModuleViewsContext.jsx";

function HealthIndicatorCard({ indicator }) {
  const displayValue = indicator.valueFormatted ?? "—";

  return (
    <div role="listitem" className="founder-executive-product-health-item">
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
        <p className="founder-executive-product-health-detail">{indicator.detail}</p>
      ) : null}
      {indicator.periodDeltaFormatted && indicator.periodDeltaFormatted !== "—" ? (
        <span className="founder-executive-product-health-delta">
          vs período anterior: {indicator.periodDeltaFormatted}
        </span>
      ) : null}
    </div>
  );
}

/**
 * @param {{ executiveMetrics?: Record<string, unknown>|null }} props
 */
export default function FounderExecutiveProductHealthSection({ executiveMetrics = null }) {
  const { appliedFilters, buildExecutiveQueryString } = useFounderCockpitFilters();
  const [state, setState] = useState({ status: "loading", view: null, error: null });
  const requestSeq = useRef(0);

  const initialView = useMemo(
    () => mapExecutiveProductHealthToFounderDisplay(executiveMetrics, null),
    [executiveMetrics]
  );

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, error: null });

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

    if (seq !== requestSeq.current) return;

    const view = mapExecutiveProductHealthToFounderDisplay(executiveMetrics, executivePrevious);
    setState({
      status: view.meta.status === "error" ? "error" : view.meta.status,
      view,
      error: null,
    });
  }, [appliedFilters.window_days, buildExecutiveQueryString, executiveMetrics]);

  useEffect(() => {
    if (!executiveMetrics) {
      setState({ status: "error", view: null, error: "executive_metrics_unavailable" });
      return;
    }
    load();
  }, [executiveMetrics, load]);

  const view = state.view ?? (state.status === "loading" ? initialView : null);
  useRegisterExecutiveModuleView("health", view);

  return (
    <section
      className="founder-executive-product-health"
      id="mod-saude-produto"
      aria-labelledby="heading-saude-produto"
    >
      <div className="founder-executive-product-health-header">
        <div>
          <h2 className="founder-executive-product-health-title" id="heading-saude-produto">
            Saúde do Produto
          </h2>
          <p className="founder-module-disclaimer" role="note">
            Qualidade e confiança executiva · Fontes: snapshot oficial (recommendation, conversation,
            user_value, anti_regret, price_intelligence, savings, commerce).
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <FounderSkeleton variant="grid" count={8} label="Carregando saúde do produto…" />
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-sessions-state founder-sessions-state--error" role="alert">
          Saúde executiva indisponível ({state.error}).
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

          <div className="founder-executive-product-health-narrative">
            {view.narrative.badge ? (
              <span
                className={`founder-executive-badge founder-executive-badge--${view.narrative.badge.id}`}
              >
                {view.narrative.badge.label}
              </span>
            ) : null}
            <p className="founder-executive-product-health-headline">{view.narrative.headline}</p>
            {view.health_index.formatted !== "—" ? (
              <p className="founder-executive-product-health-meta">
                Índice executivo de saúde: {view.health_index.formatted}
              </p>
            ) : null}
          </div>

          <div className="founder-executive-product-health-grid" role="list">
            {view.indicators.map((indicator) => (
              <HealthIndicatorCard key={indicator.id} indicator={indicator} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
