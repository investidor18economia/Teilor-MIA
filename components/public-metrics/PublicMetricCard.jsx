import {
  formatPublicMetricNumber,
  formatPublicMetricCurrency,
  formatPublicMetricRate,
} from "../../lib/miaPublicMetricsDisplay.js";

/**
 * @param {{ id: string, title: string, value: unknown, description: string, format?: string }} card
 */
function formatCardValue(card) {
  if (card.format === "rate") return formatPublicMetricRate(card.value);
  if (card.format === "currency") return formatPublicMetricCurrency(card.value);
  if (card.format === "datetime" && card.value) {
    try {
      return new Date(String(card.value)).toLocaleString("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return String(card.value);
    }
  }
  if (card.format === "text") return card.value != null ? String(card.value) : "—";
  const n = Number(card.value);
  const useCompact = Number.isFinite(n) && n >= 10_000;
  const useSuffix = Number.isFinite(n) && n >= 1_000;
  return formatPublicMetricNumber(card.value, { compact: useCompact, suffix: useSuffix ? "+" : "" });
}

export default function PublicMetricCard({ card }) {
  const displayValue = formatCardValue(card);
  return (
    <article className="public-metrics-card" aria-labelledby={`metric-${card.id}`}>
      <p className="public-metrics-card-value" aria-label={`${card.title}: ${displayValue}`}>
        {displayValue}
      </p>
      <h3 className="public-metrics-card-title" id={`metric-${card.id}`}>
        {card.title}
      </h3>
      <p className="public-metrics-card-desc">{card.description}</p>
      <p className="public-metrics-card-source">
        Fonte: <span>API Executiva de Métricas</span>
      </p>
    </article>
  );
}
