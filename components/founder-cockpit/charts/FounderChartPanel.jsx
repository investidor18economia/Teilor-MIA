import FounderEmptyChart from "./FounderEmptyChart.jsx";

/**
 * @param {{
 *   title: string,
 *   question?: string,
 *   status: 'loading'|'error'|'empty'|'ready',
 *   onRetry?: () => void,
 *   partialNote?: string,
 *   children: React.ReactNode,
 * }} props
 */
export default function FounderChartPanel({
  title,
  question,
  status,
  onRetry,
  partialNote,
  children,
}) {
  return (
    <div className="founder-chart-panel">
      <div className="founder-chart-panel-header">
        <div>
          <h3 className="founder-chart-panel-title">{title}</h3>
          {question ? <p className="founder-chart-panel-question">{question}</p> : null}
        </div>
        {status === "error" && onRetry ? (
          <button type="button" className="founder-retry-btn" onClick={onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      {partialNote ? (
        <p className="founder-chart-panel-note" role="status">
          {partialNote}
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="founder-chart-panel-state" role="status">
          Carregando gráfico…
        </p>
      ) : null}

      {status === "error" ? (
        <p className="founder-chart-panel-state founder-chart-panel-state--error" role="alert">
          Gráfico indisponível. As demais métricas permanecem visíveis.
        </p>
      ) : null}

      {status === "empty" ? <FounderEmptyChart title={title} /> : null}

      {status === "ready" ? children : null}
    </div>
  );
}
