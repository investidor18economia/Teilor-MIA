export default function FounderLegend({ series = [] }) {
  if (!series.length) return null;
  return (
    <ul className="founder-chart-legend" aria-label="Legenda do gráfico">
      {series.map((s) => (
        <li key={s.id} className="founder-chart-legend-item">
          <span className="founder-chart-legend-swatch" style={{ backgroundColor: s.color }} aria-hidden="true" />
          <span>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
