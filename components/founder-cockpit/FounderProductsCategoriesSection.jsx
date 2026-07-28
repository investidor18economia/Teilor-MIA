import { useCallback, useEffect, useRef, useState } from "react";
import FounderDistributionBar from "./FounderDistributionBar.jsx";
import FounderMetricCard from "./FounderMetricCard.jsx";
import { useFounderCockpitFilters } from "./FounderCockpitFiltersContext.jsx";
import { mapTemporalMetricsToFounderProductsCategories } from "../../lib/miaFounderProductsDisplay.js";

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

export default function FounderProductsCategoriesSection({
  snapshotRecommendation = null,
  snapshotCommerce = null,
}) {
  const { buildTemporalQueryString } = useFounderCockpitFilters();
  const [state, setState] = useState({ status: "loading", view: null, error: null });
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ status: "loading", view: null, error: null });
    try {
      const res = await fetch(`/api/temporal-metrics?${buildTemporalQueryString("products,categories")}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setState({ status: "error", view: null, error: `http_${res.status}` });
        return;
      }
      const temporal = await res.json();
      const view = mapTemporalMetricsToFounderProductsCategories(temporal, {
        snapshotRecommendation,
        snapshotCommerce,
      });
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
  }, [buildTemporalQueryString, snapshotRecommendation, snapshotCommerce]);

  useEffect(() => {
    load();
  }, [load]);

  const { view } = state;

  return (
    <section
      className="founder-module founder-products-categories"
      id="mod-produtos-categorias"
      aria-labelledby="heading-produtos-categorias"
    >
      <div className="founder-products-header">
        <div>
          <h2 className="founder-module-title" id="heading-produtos-categorias">
            Produtos e Categorias
          </h2>
          <p className="founder-module-disclaimer" role="note">
            Fonte: API Temporal · PATCH 4.4 PRODUCTS_CATEGORIES_DASHBOARD.md · ranking e distribuição
            do período.
          </p>
        </div>
        {state.status === "error" || state.status === "partial" ? (
          <button type="button" className="founder-retry-btn" onClick={load}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <p className="founder-products-state" role="status">
          Carregando inteligência de produtos e categorias…
        </p>
      ) : null}

      {state.status === "error" && !view ? (
        <p className="founder-products-state founder-products-state--error" role="alert">
          Métricas de produtos e categorias indisponíveis. O snapshot executivo permanece disponível.
        </p>
      ) : null}

      {view ? (
        <>
          {view.meta.status === "partial" ? (
            <p className="founder-products-state founder-products-state--partial" role="status">
              Alguns grupos temporais retornaram parcialmente
              {view.meta.partial_errors?.length ? ` (${view.meta.partial_errors.length} avisos)` : ""}.
            </p>
          ) : null}

          {view.meta.status === "empty" ? (
            <p className="founder-products-state" role="status">
              Sem eventos de produto ou categoria no período selecionado.
            </p>
          ) : null}

          {view.meta.computed_at ? (
            <p className="founder-products-meta">
              Período: {view.meta.reference_period_days} dias
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
              <div className="founder-products-subsection">
                <h3 className="founder-products-subtitle">Produtos — visão do período</h3>
                <MetricGrid metrics={view.productSummaryMetrics} />
              </div>

              {view.topProducts?.length ? (
                <div className="founder-products-subsection">
                  <h3 className="founder-products-subtitle">Produtos com maior interação</h3>
                  <div className="founder-recent-table-wrap">
                    <table className="founder-recent-table founder-ranking-table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Produto</th>
                          <th scope="col">Aparições</th>
                          <th scope="col">Rec.</th>
                          <th scope="col">Cliques</th>
                          <th scope="col">Favoritos</th>
                          <th scope="col">Taxa clique</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.topProducts.map((row) => (
                          <tr key={`${row.rank}-${row.product_label}`}>
                            <td>{row.rank}</td>
                            <td>
                              {row.product_label}
                              {row.product_brand ? (
                                <span className="founder-ranking-meta"> · {row.product_brand}</span>
                              ) : null}
                            </td>
                            <td>{row.total_aparicoes_formatted}</td>
                            <td>{row.total_recomendacoes_formatted}</td>
                            <td>{row.total_cliques_formatted}</td>
                            <td>{formatCell(row.total_favoritos)}</td>
                            <td>{row.taxa_clique_formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="founder-products-subsection">
                <h3 className="founder-products-subtitle">Categorias — visão do período</h3>
                <MetricGrid metrics={view.categorySummaryMetrics} />
              </div>

              {view.categoryDistribution?.length ? (
                <div className="founder-products-subsection">
                  <FounderDistributionBar
                    title="Participação relativa entre categorias (eventos)"
                    bars={view.categoryDistribution}
                  />
                </div>
              ) : null}

              {view.topCategories?.length ? (
                <div className="founder-products-subsection">
                  <h3 className="founder-products-subtitle">Categorias com maior interação</h3>
                  <div className="founder-recent-table-wrap">
                    <table className="founder-recent-table founder-ranking-table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Categoria</th>
                          <th scope="col">Perguntas</th>
                          <th scope="col">Rec.</th>
                          <th scope="col">Eventos</th>
                          <th scope="col">Perg. → Rec.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.topCategories.map((row) => (
                          <tr key={`${row.rank}-${row.category}`}>
                            <td>{row.rank}</td>
                            <td>{row.category}</td>
                            <td>{row.total_perguntas_formatted}</td>
                            <td>{row.total_recomendacoes_formatted}</td>
                            <td>{row.total_eventos_formatted}</td>
                            <td>{row.taxa_pergunta_rec_formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {view.recentCategoryDays?.length ? (
                <div className="founder-products-subsection">
                  <h3 className="founder-products-subtitle">Atividade recente por categoria</h3>
                  <div className="founder-recent-table-wrap">
                    <table className="founder-recent-table">
                      <thead>
                        <tr>
                          <th scope="col">Dia</th>
                          <th scope="col">Categoria</th>
                          <th scope="col">Eventos</th>
                          <th scope="col">Perguntas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.recentCategoryDays.map((row) => (
                          <tr key={`${row.activity_day}-${row.category}`}>
                            <td>{row.activity_day_label}</td>
                            <td>{row.category}</td>
                            <td>{row.total_eventos_formatted}</td>
                            <td>{row.eventos_perguntas_formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {view.snapshotReference?.length ? (
                <div className="founder-products-subsection founder-products-snapshot-ref">
                  <h3 className="founder-products-subtitle">Referência snapshot (período completo)</h3>
                  <MetricGrid
                    metrics={view.snapshotReference}
                    className="founder-module-grid founder-module-grid--compact"
                  />
                </div>
              ) : null}

              {view.unavailableMetrics?.length ? (
                <details className="founder-products-unavailable">
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

function formatCell(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("pt-BR");
}
