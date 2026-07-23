import FounderExecutiveInsights from "./FounderExecutiveInsights.jsx";
import FounderKpiStrip from "./FounderKpiStrip.jsx";
import FounderModuleSection from "./FounderModuleSection.jsx";
import FounderPeriodFilter from "./FounderPeriodFilter.jsx";

export default function FounderCockpitPage({ cockpit, subject }) {
  const { meta, overview, modules } = cockpit;
  const moduleList = [
    modules.platform,
    modules.recommendation,
    modules.commerce,
    modules.priceIntelligence,
    modules.savings,
    modules.antiRegret,
    modules.userValue,
    modules.system,
  ];

  async function logout() {
    await fetch("/api/founder/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="founder-cockpit-page">
      <header className="founder-cockpit-header">
        <div className="founder-cockpit-header-row">
          <div>
            <img src="/teilor-logo.svg" alt="Teilor" width={140} height={32} />
            <h1>Cockpit Executivo</h1>
            <p className="founder-cockpit-subtitle">
              Indicadores consolidados para decisão — fonte única: API Executiva de Métricas.
            </p>
          </div>
          <div className="founder-cockpit-header-actions">
            <FounderPeriodFilter selectedDays={meta.reference_period_days} />
            <button type="button" className="founder-logout-btn" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
        <p className="founder-cockpit-meta">
          Período: {meta.reference_period_days} dias
          {meta.computed_at
            ? ` · Atualizado ${new Date(meta.computed_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
          {subject ? ` · Sessão: ${subject === "admin" ? "administrativa" : "fundador"}` : ""}
        </p>
        {meta.partial_errors?.length ? (
          <p className="founder-cockpit-partial" role="status">
            Alguns módulos retornaram parcialmente ({meta.partial_errors.length} avisos).
          </p>
        ) : null}
      </header>

      <main className="founder-cockpit-main">
        <FounderExecutiveInsights selectedDays={meta.reference_period_days} />
        <FounderKpiStrip overview={overview} />
        {moduleList.map((module) => (
          <FounderModuleSection key={module.id} module={module} />
        ))}
      </main>

      <footer className="founder-cockpit-footer">
        <p>
          Somente leitura · Métricas v{meta.metrics_version || "11.1.0"} ·{" "}
          <a href="/teilor-em-numeros">Teilor em Números (público)</a>
        </p>
      </footer>
    </div>
  );
}
