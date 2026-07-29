import { useCallback, useEffect, useRef, useState } from "react";
import FounderMetricCard from "./FounderMetricCard.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { getModuleFilterCompatibility } from "../../lib/miaFounderFiltersDisplay.js";
import {
  mapTemporalMetricsToFounderSessionsUsers,
} from "../../lib/miaFounderGrowthDisplay.js";
import { mapTemporalToSessionsUsersCharts } from "../../lib/miaFounderChartsDisplay.js";
import FounderChartPanel from "./charts/FounderChartPanel.jsx";
import FounderLineChart from "./charts/FounderLineChart.jsx";

function TrendCard({ trend }) {
  return (
    <article
      className={`founder-trend-card founder-trend-card--${trend.direction}`}
      aria-label={`${trend.label}: ${trend.pctFormatted} (${trend.directionLabel})`}
    >
      <p className="founder-trend-card-value">{trend.pctFormatted}</p>
      <h4 className="founder-trend-card-label">{trend.label}</h4>
      <p className="founder-trend-card-direction">{trend.directionLabel}</p>
    </article>
  );
}

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

export default function FounderSessionsUsersSection({
  snapshotPlatform = null,
  snapshotConversation = null,
}) {
  const { appliedFilters, buildTemporalQueryString } = useFounderCockpitFilters();
  const compatibility = getModuleFilterCompatibility("sessions", appliedFilters);
  const [state, setState] = useState({ status: "loading", view: null, charts: null, error: null });
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, charts: null, error: null });
    try {
      const res = await fetch(`/api/temporal-metrics?${buildTemporalQueryString("growth,platform_activity")}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setState({ status: "error", view: null, charts: null, error: `http_${res.status}` });
        return;
      }
      const temporal = await res.json();
      const view = mapTemporalMetricsToFounderSessionsUsers(temporal, {
        snapshotPlatform,
        snapshotConversation,
      });
      const charts = mapTemporalToSessionsUsersCharts(temporal);
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
  }, [buildTemporalQueryString, snapshotPlatform, snapshotConversation]);

  useEffect(() => {
    load();
  }, [load]);

  const { view } = state;

  return (
    <section className="founder-module founder-sessions-users" id="mod-sessoes-usuarios" aria-labelledby="heading-sessoes-usuarios">
      <div className="founder-sessions-users-header">
        <div>
          <h2 className="founder-module-title" id="heading-sessoes-usuarios">
            Sessões e Usuários
          </h2>
          <p className="founder-module-disclaimer" role="note">
            Fonte: API Temporal de Métricas · DAU/WAU/MAU e atividade diária conforme EXECUTIVE_METRICS.md.
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <p className="founder-sessions-state" role="status">
          Carregando métricas temporais…
        </p>
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-sessions-state founder-sessions-state--error" role="alert">
          Métricas temporais indisponíveis. O snapshot executivo permanece disponível abaixo.
        </p>
      ) : null}

      {view ? (
        <>
          {view.meta.status === "partial" ? (
            <p className="founder-sessions-state founder-sessions-state--partial" role="status">
              Alguns grupos temporais retornaram parcialmente
              {view.meta.partial_errors?.length ? ` (${view.meta.partial_errors.length} avisos)` : ""}.
            </p>
          ) : null}

          {!compatibility.compatible ? (
            <p className="founder-sessions-state founder-sessions-state--partial" role="status">
              Filtro parcial neste módulo: {compatibility.limitations.join("; ")}.
            </p>
          ) : null}

          {view.meta.status === "empty" ? (
            <p className="founder-sessions-state" role="status">
              Sem atividade registrada no período selecionado.
            </p>
          ) : null}

          {view.meta.reference_day_label ? (
            <p className="founder-sessions-meta">
              Referência: {view.meta.reference_day_label}
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
              <div className="founder-sessions-subsection">
                <h3 className="founder-sessions-subtitle">Alcance rolling (último dia)</h3>
                <MetricGrid metrics={view.rollingMetrics} />
              </div>

              <div className="founder-sessions-subsection">
                <h3 className="founder-sessions-subtitle">Composição de visitantes (último dia)</h3>
                <MetricGrid metrics={view.audienceMetrics} />
              </div>

              <div className="founder-sessions-subsection">
                <h3 className="founder-sessions-subtitle">Atividade da plataforma (último dia)</h3>
                <MetricGrid metrics={view.activityMetrics} />
              </div>

              <div className="founder-sessions-subsection">
                <h3 className="founder-sessions-subtitle">Tendências observadas</h3>
                <div className="founder-trend-grid" role="list">
                  {view.trends.map((trend) => (
                    <div key={trend.id} role="listitem">
                      <TrendCard trend={trend} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="founder-sessions-subsection founder-sessions-charts">
                <FounderChartPanel
                  title={state.charts?.activeUsers?.title ?? "Usuários ativos (DAU)"}
                  question={state.charts?.activeUsers?.question}
                  status={
                    state.status === "loading"
                      ? "loading"
                      : state.status === "error"
                        ? "error"
                        : state.charts?.activeUsers
                          ? "ready"
                          : "empty"
                  }
                  onRetry={load}
                  partialNote={view.meta.status === "partial" ? "Série parcial — grupos temporais incompletos." : undefined}
                >
                  {state.charts?.activeUsers ? (
                    <FounderLineChart
                      title={state.charts.activeUsers.title}
                      xLabels={state.charts.activeUsers.xLabels}
                      series={state.charts.activeUsers.series}
                    />
                  ) : null}
                </FounderChartPanel>
                <FounderChartPanel
                  title={state.charts?.sessionsActivity?.title ?? "Sessões e perguntas"}
                  question={state.charts?.sessionsActivity?.question}
                  status={
                    state.status === "loading"
                      ? "loading"
                      : state.status === "error"
                        ? "error"
                        : state.charts?.sessionsActivity
                          ? "ready"
                          : "empty"
                  }
                  onRetry={load}
                >
                  {state.charts?.sessionsActivity ? (
                    <FounderLineChart
                      title={state.charts.sessionsActivity.title}
                      xLabels={state.charts.sessionsActivity.xLabels}
                      series={state.charts.sessionsActivity.series}
                    />
                  ) : null}
                </FounderChartPanel>
              </div>

              {view.recentDays?.length ? (
                <div className="founder-sessions-subsection">
                  <h3 className="founder-sessions-subtitle">Atividade diária recente</h3>
                  <div className="founder-recent-table-wrap">
                    <table className="founder-recent-table">
                      <thead>
                        <tr>
                          <th scope="col">Dia</th>
                          <th scope="col">DAU</th>
                          <th scope="col">WAU</th>
                          <th scope="col">MAU</th>
                          <th scope="col">Sessões</th>
                          <th scope="col">Perguntas</th>
                          <th scope="col">Δ DAU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.recentDays.map((row) => (
                          <tr key={row.activity_day}>
                            <td>{row.activity_day_label}</td>
                            <td>{row.dau_visitors_formatted}</td>
                            <td>{row.wau_visitors_formatted}</td>
                            <td>{row.mau_visitors_formatted}</td>
                            <td>{row.total_sessions_formatted}</td>
                            <td>{row.questions_formatted}</td>
                            <td>{row.crescimento_dau_formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {view.snapshotReference?.length ? (
                <div className="founder-sessions-subsection founder-sessions-snapshot-ref">
                  <h3 className="founder-sessions-subtitle">Referência snapshot (período completo)</h3>
                  <p className="founder-module-disclaimer" role="note">
                    Totais acumulados na janela de {appliedFilters.window_days} dias via API Executiva — complementar à visão
                    diária temporal.
                  </p>
                  <MetricGrid metrics={view.snapshotReference} className="founder-module-grid founder-module-grid--compact" />
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
