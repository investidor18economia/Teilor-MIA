/**
 * PATCH A.9 — Reusable loading skeleton (visual only).
 * @param {{ variant?: 'card'|'chart'|'table'|'grid', count?: number, className?: string, label?: string }} props
 */
export default function FounderSkeleton({ variant = "card", count = 3, className = "", label = "Carregando…" }) {
  if (variant === "chart") {
    return (
      <div className={`founder-skeleton founder-skeleton--chart ${className}`.trim()} role="status" aria-label={label}>
        <div className="founder-skeleton-chart-area" aria-hidden="true" />
        <div className="founder-skeleton-chart-axis" aria-hidden="true" />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={`founder-skeleton founder-skeleton--table ${className}`.trim()} role="status" aria-label={label}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="founder-skeleton-table-row" aria-hidden="true">
            <span className="founder-skeleton-line" style={{ width: "18%" }} />
            <span className="founder-skeleton-line" style={{ width: "32%" }} />
            <span className="founder-skeleton-line" style={{ width: "14%" }} />
            <span className="founder-skeleton-line" style={{ width: "14%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div
        className={`founder-skeleton-grid ${className}`.trim()}
        role="status"
        aria-label={label}
        aria-busy="true"
      >
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="founder-skeleton founder-skeleton--card" aria-hidden="true">
            <div className="founder-skeleton-line founder-skeleton-line--value" />
            <div className="founder-skeleton-line founder-skeleton-line--label" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`founder-skeleton founder-skeleton--card ${className}`.trim()} role="status" aria-label={label}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="founder-skeleton-line"
          style={{ width: `${Math.max(40, 88 - i * 12)}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
