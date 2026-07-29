import { formatFounderMetricValue } from "../../lib/miaFounderCockpitDisplay.js";

export default function FounderMetricCard({ metric, variant = "default" }) {
  const displayValue = metric.displayValue ?? formatFounderMetricValue(metric);
  const className = [
    "founder-metric-card",
    variant === "highlight" ? "founder-metric-card--highlight" : "",
    variant === "executive" ? "founder-metric-card--executive" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={className} aria-labelledby={`founder-metric-${metric.id}`}>
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
