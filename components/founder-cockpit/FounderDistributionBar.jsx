export default function FounderDistributionBar({ title, bars = [] }) {
  if (!bars.length) {
    return (
      <div className="founder-distribution" aria-label={title}>
        <h4 className="founder-distribution-title">{title}</h4>
        <p className="founder-distribution-empty">Sem dados no período.</p>
      </div>
    );
  }

  return (
    <div className="founder-distribution" aria-label={title}>
      <h4 className="founder-distribution-title">{title}</h4>
      <ul className="founder-distribution-list" role="list">
        {bars.map((bar) => (
          <li key={bar.label} className="founder-distribution-row" role="listitem">
            <div className="founder-distribution-meta">
              <span className="founder-distribution-label">{bar.label}</span>
              <span className="founder-distribution-count">
                {bar.value.toLocaleString("pt-BR")} · {bar.percent}%
              </span>
            </div>
            <div className="founder-distribution-track" aria-hidden="true">
              <div className="founder-distribution-fill" style={{ width: `${bar.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
