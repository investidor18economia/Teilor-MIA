import { useId, useMemo, useState } from "react";
import FounderLegend from "./FounderLegend.jsx";
import { FounderTooltip } from "./FounderTooltip.jsx";
import FounderEmptyChart from "./FounderEmptyChart.jsx";

const PAD = { top: 16, right: 12, bottom: 28, left: 40 };
const W = 640;
const H = 220;

/** @param {Array<number|null>} values */
function finiteValues(values) {
  return values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
}

/**
 * @param {{
 *   title: string,
 *   xLabels: string[],
 *   series: Array<{ id: string, label: string, color: string, values: Array<number|null>, formatted?: string[], format?: string }>,
 *   ariaLabel?: string,
 * }} props
 */
export default function FounderLineChart({ title, xLabels = [], series = [], ariaLabel }) {
  const [hover, setHover] = useState(null);
  const chartId = useId();

  const hasData = series.some((s) => finiteValues(s.values).length > 0);

  const layout = useMemo(() => {
    if (!hasData) return null;
    const all = series.flatMap((s) => finiteValues(s.values));
    const min = Math.min(...all, 0);
    const max = Math.max(...all, 1);
    const range = max - min || 1;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = xLabels.length || 1;

    const xAt = (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v) => PAD.top + innerH - ((v - min) / range) * innerH;

    const paths = series.map((s) => {
      const pts = s.values
        .map((v, i) => (v != null && Number.isFinite(Number(v)) ? `${xAt(i)},${yAt(Number(v))}` : null))
        .filter(Boolean);
      return { ...s, d: pts.join(" "), points: s.values.map((v, i) => ({ v, i, x: xAt(i), y: v != null ? yAt(Number(v)) : null })) };
    });

    const yTicks = [min, min + range / 2, max];
    return { paths, yTicks, innerH, min, max, xAt, yAt };
  }, [hasData, series, xLabels.length]);

  if (!hasData || !layout) {
    return <FounderEmptyChart title={title} />;
  }

  return (
    <figure className="founder-chart founder-chart--line" aria-labelledby={chartId}>
      <figcaption id={chartId} className="founder-chart-caption">
        {title}
      </figcaption>
      <div className="founder-chart-body" role="img" aria-label={ariaLabel || title}>
        <svg viewBox={`0 0 ${W} ${H}`} className="founder-chart-svg" preserveAspectRatio="xMidYMid meet">
          {layout.yTicks.map((tick, idx) => {
            const y = layout.yAt(tick);
            return (
              <g key={idx}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className="founder-chart-grid-line" />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="founder-chart-axis-label">
                  {tick >= 0 && tick < 1 ? `${Math.round(tick * 1000) / 10}%` : Math.round(tick).toLocaleString("pt-BR")}
                </text>
              </g>
            );
          })}
          {layout.paths.map((s) =>
            s.d ? (
              <polyline
                key={s.id}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={s.d}
              />
            ) : null
          )}
          {layout.paths.flatMap((s) =>
            s.points
              .filter((p) => p.y != null)
              .map((p) => (
                <circle
                  key={`${s.id}-${p.i}`}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill={s.color}
                  className="founder-chart-point"
                  onMouseEnter={() =>
                    setHover({
                      label: `${xLabels[p.i] ?? ""} · ${s.label}`,
                      value: s.formatted?.[p.i] ?? String(p.v),
                      x: (p.x / W) * 100,
                      y: (p.y / H) * 100,
                    })
                  }
                  onMouseLeave={() => setHover(null)}
                  onFocus={() =>
                    setHover({
                      label: `${xLabels[p.i] ?? ""} · ${s.label}`,
                      value: s.formatted?.[p.i] ?? String(p.v),
                      x: (p.x / W) * 100,
                      y: (p.y / H) * 100,
                    })
                  }
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${s.label} ${xLabels[p.i]}: ${s.formatted?.[p.i] ?? p.v}`}
                />
              ))
          )}
          {xLabels.map((label, i) => {
            if (xLabels.length > 14 && i % 2 !== 0 && i !== xLabels.length - 1) return null;
            const x = layout.xAt(i);
            return (
              <text key={label + i} x={x} y={H - 6} textAnchor="middle" className="founder-chart-axis-label">
                {label}
              </text>
            );
          })}
        </svg>
        <FounderTooltip {...(hover || {})} visible={Boolean(hover)} />
      </div>
      <FounderLegend series={series} />
    </figure>
  );
}
