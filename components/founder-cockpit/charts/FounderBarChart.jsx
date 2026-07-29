import FounderEmptyChart from "./FounderEmptyChart.jsx";

/**
 * @param {{
 *   title: string,
 *   items: Array<{ label: string, value: number, formatted?: string, percent?: number }>,
 *   ariaLabel?: string,
 * }} props
 */
export default function FounderBarChart({ title, items = [], ariaLabel }) {
  if (!items.length) {
    return <FounderEmptyChart title={title} />;
  }

  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);

  return (
    <figure className="founder-chart founder-chart--bar" aria-label={ariaLabel || title}>
      <figcaption className="founder-chart-caption">{title}</figcaption>
      <ul className="founder-bar-chart-list" role="list">
        {items.map((item) => {
          const width = Math.max(0, Math.min(100, (Number(item.value) / max) * 100));
          return (
            <li key={item.label} className="founder-bar-chart-row" role="listitem">
              <div className="founder-bar-chart-meta">
                <span className="founder-bar-chart-label">{item.label}</span>
                <span className="founder-bar-chart-value">{item.formatted ?? item.value}</span>
              </div>
              <div className="founder-bar-chart-track" aria-hidden="true">
                <div className="founder-bar-chart-fill" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
