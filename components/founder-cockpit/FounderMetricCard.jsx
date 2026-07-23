import { formatFounderMetricValue } from "../../lib/miaFounderCockpitDisplay.js";

export default function FounderMetricCard({ metric }) {
  const displayValue = formatFounderMetricValue(metric);
  return (
    <article className="founder-metric-card" aria-labelledby={`founder-metric-${metric.id}`}>
      <p className="founder-metric-card-value" aria-label={`${metric.label}: ${displayValue}`}>
        {displayValue}
      </p>
      <h3 className="founder-metric-card-label" id={`founder-metric-${metric.id}`}>
        {metric.label}
      </h3>
      {metric.hint ? <p className="founder-metric-card-hint">{metric.hint}</p> : null}
    </article>
  );
}
