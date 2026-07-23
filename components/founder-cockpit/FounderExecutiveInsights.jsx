import { useEffect, useState } from "react";

const SEVERITY_CLASS = {
  critical: "founder-insight--critical",
  warning: "founder-insight--warning",
  opportunity: "founder-insight--opportunity",
  info: "founder-insight--info",
};

function InsightCard({ insight }) {
  const [expanded, setExpanded] = useState(false);
  const severityClass = SEVERITY_CLASS[insight.severity] || SEVERITY_CLASS.info;

  return (
    <article className={`founder-insight-card ${severityClass}`} aria-labelledby={`insight-${insight.insight_id}`}>
      <div className="founder-insight-header">
        <span className="founder-insight-badge">{insight.severity}</span>
        <span className="founder-insight-category">{insight.category}</span>
        <span className="founder-insight-confidence">confiança: {insight.confidence}</span>
      </div>
      <h3 className="founder-insight-title" id={`insight-${insight.insight_id}`}>
        {insight.title}
      </h3>
      {insight.hypothesis ? (
        <p className="founder-insight-hypothesis" role="note">
          Hipótese para investigação. Não representa causalidade comprovada.
        </p>
      ) : null}
      {insight.disclaimers?.length ? (
        <ul className="founder-insight-disclaimers">
          {insight.disclaimers.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="founder-insight-expand"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Ocultar evidências" : "Ver evidências"}
      </button>
      {expanded && insight.evidence?.length ? (
        <ul className="founder-insight-evidence" role="list">
          {insight.evidence.map((ev, idx) => (
            <li key={`${ev.metric}-${ev.period}-${idx}`} role="listitem">
              {ev.metric} ({ev.period}): {ev.value != null ? String(ev.value) : "—"}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default function FounderExecutiveInsights({ selectedDays = 30 }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ status: "loading", data: null, error: null });
      try {
        const res = await fetch(`/api/founder/executive-insights?days=${selectedDays}`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (res.status === 401) {
          if (!cancelled) setState({ status: "auth_required", data: null, error: null });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ status: "api_unavailable", data: null, error: `http_${res.status}` });
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          const partial = data.data_quality?.status === "partial" || data.data_quality?.status === "degraded";
          setState({
            status: partial ? "partial" : "success",
            data,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "api_unavailable",
            data: null,
            error: String(err?.message || "fetch_failed"),
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDays]);

  return (
    <section className="founder-insights-section" id="executive-ai-insights" aria-labelledby="founder-insights-heading">
      <h2 className="founder-module-title" id="founder-insights-heading">
        Executive AI Insights
      </h2>
      <p className="founder-insights-notice">
        Os insights são produzidos a partir de métricas agregadas da Teilor. Variações indicam padrões
        observados, não causas comprovadas.
      </p>

      {state.status === "loading" ? (
        <p className="founder-insights-state" role="status">
          Analisando métricas do período…
        </p>
      ) : null}

      {state.status === "auth_required" ? (
        <p className="founder-insights-state" role="alert">
          Autenticação necessária para carregar insights.
        </p>
      ) : null}

      {state.status === "api_unavailable" ? (
        <p className="founder-insights-state" role="alert">
          Insights temporariamente indisponíveis.
        </p>
      ) : null}

      {state.data ? (
        <>
          <div className="founder-insights-summary">
            <h3>{state.data.executive_summary?.headline}</h3>
            <p>{state.data.executive_summary?.overview}</p>
            <p className="founder-insights-meta">
              Fonte do resumo: {state.data.executive_summary?.source === "llm" ? "IA (verbalização)" : "determinístico"}
              {state.data.performance?.llm?.attempted && !state.data.performance?.llm?.ok
                ? " · LLM indisponível — fallback determinístico"
                : ""}
              {" · "}
              Atualizado{" "}
              {new Date(state.data.computed_at).toLocaleString("pt-BR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          {state.data.insights?.length ? (
            <div className="founder-insights-list" role="list">
              {state.data.insights.slice(0, 15).map((insight) => (
                <div key={insight.insight_id} role="listitem">
                  <InsightCard insight={insight} />
                </div>
              ))}
            </div>
          ) : (
            <p className="founder-insights-state">Nenhum insight relevante acima dos limiares neste período.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
