import PublicMetricCard from "./PublicMetricCard.jsx";

/**
 * @param {{ id: string, title: string, cards: object[], disclaimer?: string }} section
 */
function MetricsSection({ section }) {
  return (
    <section className="public-metrics-section" id={section.id} aria-labelledby={`heading-${section.id}`}>
      <h2 className="public-metrics-section-title" id={`heading-${section.id}`}>
        {section.title}
      </h2>
      {section.disclaimer ? (
        <p className="public-metrics-disclaimer" role="note">
          {section.disclaimer}
        </p>
      ) : null}
      <div className="public-metrics-grid" role="list">
        {section.cards.map((card) => (
          <div key={card.id} role="listitem">
            <PublicMetricCard card={card} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * @param {{ page: ReturnType<import("../../lib/miaPublicMetricsDisplay.js").mapExecutiveMetricsToPublicPage> }} props
 */
export default function PublicMetricsPage({ page }) {
  const { hero, sections, meta } = page;
  const sectionList = [
    sections.platform,
    sections.recommendation,
    sections.commerce,
    sections.savings,
    sections.system,
  ];

  return (
    <div className="public-metrics-page">
      <header className="public-metrics-hero">
        <img src="/teilor-logo.svg" alt="Teilor" className="public-metrics-logo" width={160} height={36} />
        <h1 className="public-metrics-hero-title">{hero.title}</h1>
        <p className="public-metrics-hero-subtitle">{hero.subtitle}</p>
        {meta.reference_period_days ? (
          <p className="public-metrics-hero-meta">
            Período de referência: últimos {meta.reference_period_days} dias
            {meta.computed_at
              ? ` · Atualizado em ${new Date(meta.computed_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}`
              : ""}
          </p>
        ) : null}
      </header>

      <main className="public-metrics-main">
        {sectionList.map((section) => (
          <MetricsSection key={section.id} section={section} />
        ))}

        <section className="public-metrics-transparency" id="transparencia" aria-labelledby="heading-transparencia">
          <h2 className="public-metrics-section-title" id="heading-transparencia">
            Como calculamos estes números?
          </h2>
          <ul className="public-metrics-transparency-list">
            <li>Todas as métricas são agregadas pela API Executiva de Métricas — sem consulta direta a eventos.</li>
            <li>Os dados são atualizados automaticamente em intervalos regulares.</li>
            <li>Não exibimos dados pessoais, identificadores ou conteúdo de conversas.</li>
            <li>Economia potencial não representa economia realizada ou compras confirmadas.</li>
            <li>Taxas de aceitação observam sinais — não medem satisfação do usuário.</li>
          </ul>
        </section>
      </main>

      <footer className="public-metrics-footer">
        <p>
          © {new Date().getFullYear()} Teilor · Métricas v{meta.metrics_version || "11.1.0"}
        </p>
        <p>
          <a href="/app-mia" className="public-metrics-footer-link">
            Conversar com a MIA
          </a>
        </p>
      </footer>
    </div>
  );
}
