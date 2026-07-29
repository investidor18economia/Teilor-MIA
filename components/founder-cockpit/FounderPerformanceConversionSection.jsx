import { useCallback, useEffect, useRef, useState } from "react";
import FounderMetricCard from "./FounderMetricCard.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { mapTemporalMetricsToFounderPerformanceConversion } from "../../lib/miaFounderPerformanceDisplay.js";
import { mapTemporalToPerformanceConversionCharts } from "../../lib/miaFounderChartsDisplay.js";
import FounderChartPanel from "./charts/FounderChartPanel.jsx";
import FounderLineChart from "./charts/FounderLineChart.jsx";
import FounderBarChart from "./charts/FounderBarChart.jsx";
import FounderSkeleton from "./FounderSkeleton.jsx";

function MetricGrid({ metrics, className = "founder-module-grid" }) {
  if (!metrics?.length) return null;
  return (
    <div className={className} role="list">
      {metrics.map((metric) => (
        <div key={metric.id} role="listitem">
          <FounderMetricCard metric={metric} />
        </div>
      ))}
    </div>
  );
}

export default function FounderPerformanceConversionSection({
  snapshotRecommendation = null,
  snapshotCommerce = null,
  snapshotConversation = null,
  snapshotAlerts = null,
}) {
  const { buildTemporalQueryString } = useFounderCockpitFilters();
  const [state, setState] = useState({ status: "loading", view: null, charts: null, error: null });
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, charts: null, error: null });
    try {
      const res = await fetch(`/api/temporal-metrics?${buildTemporalQueryString("conversion")}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setState({ status: "error", view: null, charts: null, error: `http_${res.status}` });
        return;
      }
      const temporal = await res.json();
      const view = mapTemporalMetricsToFounderPerformanceConversion(temporal, {
        snapshotRecommendation,
        snapshotCommerce,
        snapshotConversation,
        snapshotAlerts,
      });
      const charts = mapTemporalToPerformanceConversionCharts(temporal);
      setState({
        status: view.meta.status === "error" ? "error" : view.meta.status,
        view,
        charts,
        error: null,
      });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setState({
        status: "error",
        view: null,
        charts: null,
        error: String(err?.message || "fetch_failed"),
      });
    }
  }, [
    buildTemporalQueryString,
    snapshotRecommendation,
    snapshotCommerce,
    snapshotConversation,
    snapshotAlerts,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const { view } = state;

  return (
    <section
      className="founder-module founder-performance-conversion"
      id="mod-performance-conversao"
      aria-labelledby="heading-performance-conversao"
    >
      <div className="founder-performance-header">
        <div>
          <h2 className="founder-module-title" id="heading-performance-conversao">
            Performance e Conversão
          </h2>
          <p className="founder-module-disclaimer" role="note">
            Fonte: API Temporal · PATCH 4.3 CONVERSION_DASHBOARD · funil de recomendação e eficiência do
            período.
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <FounderSkeleton variant="grid" count={6} label="Carregando performance e conversão…" />
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-performance-state founder-performance-state--error" role="alert">
          Métricas de performance e conversão indisponíveis. O snapshot executivo permanece disponível.
        </p>
      ) : null}

      {view ? (
        <>
          {view.meta.status === "partial" ? (
            <p className="founder-performance-state founder-performance-state--partial" role="status">
              Alguns grupos temporais retornaram parcialmente
              {view.meta.partial_errors?.length ? ` (${view.meta.partial_errors.length} avisos)` : ""}.
            </p>
          ) : null}

          {view.meta.status === "empty" ? (
            <p className="founder-performance-state" role="status">
              Sem eventos de funil no período selecionado.
            </p>
          ) : null}

          {view.meta.computed_at ? (
            <p className="founder-performance-meta">
              Período: {view.meta.reference_period_days} dias
              {view.meta.reference_day_label ? ` · Referência ${view.meta.reference_day_label}` : ""}
              {view.meta.computed_at
                ? ` · Atualizado ${new Date(view.meta.computed_at).toLocaleString("pt-BR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}`
                : ""}
            </p>
          ) : null}

          {view.meta.status !== "empty" ? (
            <>
              <div className="founder-performance-subsection">
                <h3 className="founder-performance-subtitle">Resumo do período</h3>
                <MetricGrid metrics={view.summaryMetrics} />
              </div>

              <div className="founder-performance-subsection founder-performance-charts">
                <FounderChartPanel
                  title={state.charts?.ctrDaily?.title ?? "CTR diária"}
                  question={state.charts?.ctrDaily?.question}
                  status={
                    state.status === "loading"
                      ? "loading"
                      : state.status === "error"
                        ? "error"
                        : state.charts?.ctrDaily
                          ? "ready"
                          : "empty"
                  }
                  onRetry={load}
                  partialNote={view.meta.status === "partial" ? "Série de conversão parcial." : undefined}
                >
                  {state.charts?.ctrDaily ? (
                    <FounderLineChart
                      title={state.charts.ctrDaily.title}
                      xLabels={state.charts.ctrDaily.xLabels}
                      series={state.charts.ctrDaily.series}
                    />
                  ) : null}
                </FounderChartPanel>
                <FounderChartPanel
                  title={state.charts?.engagementDaily?.title ?? "Recomendações e cliques"}
                  question={state.charts?.engagementDaily?.question}
                  status={
                    state.status === "loading"
                      ? "loading"
                      : state.status === "error"
                        ? "error"
                        : state.charts?.engagementDaily
                          ? "ready"
                          : "empty"
                  }
                  onRetry={load}
                >
                  {state.charts?.engagementDaily ? (
                    <FounderLineChart
                      title={state.charts.engagementDaily.title}
                      xLabels={state.charts.engagementDaily.xLabels}
                      series={state.charts.engagementDaily.series}
                    />
                  ) : null}
                </FounderChartPanel>
                <FounderChartPanel
                  title={state.charts?.funnelStages?.title ?? "Funil de conversão (período)"}
                  question={state.charts?.funnelStages?.question}
                  status={
                    state.status === "loading"
                      ? "loading"
                      : state.status === "error"
                        ? "error"
                        : state.charts?.funnelStages
                          ? "ready"
                          : "empty"
                  }
                  onRetry={load}
                  partialNote={state.charts?.meta?.funnel_note}
                >
                  {state.charts?.funnelStages ? (
                    <FounderBarChart title={state.charts.funnelStages.title} items={state.charts.funnelStages.items} />
                  ) : null}
                </FounderChartPanel>
              </div>

              {view.funnelTable?.length ? (
                <div className="founder-performance-subsection">
                  <h3 className="founder-performance-subtitle">Funil de conversão</h3>
                  <div className="founder-recent-table-wrap">
                    <table className="founder-recent-table founder-funnel-table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Etapa</th>
                          <th scope="col">Eventos</th>
                          <th scope="col">Visitantes seq.</th>
                          <th scope="col">Taxa conv.</th>
                          <th scope="col">Abandono</th>
                          <th scope="col">Acumulada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.funnelTable.map((row) => (
                          <tr key={row.ordem}>
                            <td>{row.ordem}</td>
                            <td>{row.etapa}</td>
                            <td>{row.eventos_formatted}</td>
                            <td>{row.visitantes_formatted}</td>
                            <td>{row.taxa_formatted}</td>
                            <td>{row.abandono_formatted}</td>
                            <td>{row.acumulada_formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {view.mainBottleneck ? (
                <div className="founder-performance-subsection founder-performance-bottleneck">
                  <h3 className="founder-performance-subtitle">Gargalo principal</h3>
                  <p className="founder-performance-bottleneck-text">
                    <strong>{view.mainBottleneck.transicao}</strong> — abandono{" "}
                    {view.mainBottleneck.taxa_abandono_formatted}
                  </p>
                </div>
              ) : null}

              {view.bottleneckCards?.length ? (
                <div className="founder-performance-subsection">
                  <h3 className="founder-performance-subtitle">Transições do funil</h3>
                  <div className="founder-module-grid founder-module-grid--compact">
                    {view.bottleneckCards.map((card) => (
                      <article
                        key={card.id}
                        className={`founder-metric-card${card.is_gargalo ? " founder-metric-card--highlight" : ""}`}
                      >
                        <p className="founder-metric-card-value">{card.taxa_abandono_formatted}</p>
                        <h4 className="founder-metric-card-label">{card.label}</h4>
                        <p className="founder-metric-card-hint">
                          Conversão: {card.taxa_conversao_formatted}
                          {card.is_gargalo ? " · gargalo principal" : ""}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {view.recentDays?.length ? (
                <div className="founder-performance-subsection">
                  <h3 className="founder-performance-subtitle">Evolução diária recente</h3>
                  <div className="founder-recent-table-wrap">
                    <table className="founder-recent-table">
                      <thead>
                        <tr>
                          <th scope="col">Dia</th>
                          <th scope="col">Recomendações</th>
                          <th scope="col">Cliques</th>
                          <th scope="col">CTR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.recentDays.map((row) => (
                          <tr key={row.activity_day}>
                            <td>{row.activity_day_label}</td>
                            <td>{row.eventos_recomendacoes_formatted}</td>
                            <td>{row.eventos_cliques_formatted}</td>
                            <td>{row.ctr_formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {view.snapshotReference?.length ? (
                <div className="founder-performance-subsection founder-performance-snapshot-ref">
                  <h3 className="founder-performance-subtitle">Referência snapshot (período completo)</h3>
                  <MetricGrid
                    metrics={view.snapshotReference}
                    className="founder-module-grid founder-module-grid--compact"
                  />
                </div>
              ) : null}

              {view.unavailableMetrics?.length ? (
                <details className="founder-performance-unavailable">
                  <summary>Métricas indisponíveis no contrato atual</summary>
                  <ul>
                    {view.unavailableMetrics.map((item) => (
                      <li key={item.id}>
                        <strong>{item.label}</strong> — {item.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
