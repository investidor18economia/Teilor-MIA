import FounderMetricCard from "./FounderMetricCard.jsx";
import FounderDistributionBar from "./FounderDistributionBar.jsx";

export default function FounderModuleSection({ module }) {
  return (
    <section className="founder-module" id={module.id} aria-labelledby={`heading-${module.id}`}>
      <h2 className="founder-module-title" id={`heading-${module.id}`}>
        {module.title}
      </h2>
      {module.disclaimer ? (
        <p className="founder-module-disclaimer" role="note">
          {module.disclaimer}
        </p>
      ) : null}
      <div className="founder-module-grid" role="list">
        {module.metrics.map((metric) => (
          <div key={metric.id} role="listitem">
            <FounderMetricCard metric={metric} />
          </div>
        ))}
      </div>
      {module.distribution?.length ? (
        <FounderDistributionBar title={module.distributionTitle} bars={module.distribution} />
      ) : null}
      {module.status ? (
        <p className={`founder-system-status founder-system-status--${module.status}`}>
          Status geral: {module.status === "ok" ? "Operacional" : "Parcial — ver erros na API"}
        </p>
      ) : null}
    </section>
  );
}
