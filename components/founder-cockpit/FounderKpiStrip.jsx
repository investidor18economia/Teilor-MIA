import FounderMetricCard from "./FounderMetricCard.jsx";

export default function FounderKpiStrip({ overview = [] }) {
  return (
    <section className="founder-kpi-strip" aria-labelledby="founder-kpi-heading">
      <h2 className="founder-kpi-heading" id="founder-kpi-heading">
        Visão geral
      </h2>
      <div className="founder-kpi-grid" role="list">
        {overview.map((metric) => (
          <div key={metric.id} role="listitem">
            <FounderMetricCard metric={metric} />
          </div>
        ))}
      </div>
    </section>
  );
}
