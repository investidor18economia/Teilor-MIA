import FounderExecutiveInsights from "./FounderExecutiveInsights.jsx";
import FounderKpiStrip from "./FounderKpiStrip.jsx";
import FounderModuleSection from "./FounderModuleSection.jsx";
import FounderPeriodFilter from "./FounderPeriodFilter.jsx";
import FounderSessionsUsersSection from "./FounderSessionsUsersSection.jsx";
import FounderProductsCategoriesSection from "./FounderProductsCategoriesSection.jsx";
import { TEILOR_LOGO_ALT, TEILOR_LOGO_PRIMARY_SRC } from "../../lib/brandAssets";

export default function FounderCockpitPage({ cockpit, subject }) {
  const { meta, overview, modules } = cockpit;
  const moduleList = [
    modules.platform,
    modules.conversation,
    modules.recommendation,
    modules.commerce,
    modules.alerts,
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
            <img src={TEILOR_LOGO_PRIMARY_SRC} alt={TEILOR_LOGO_ALT} width={56} height={56} />
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
        <FounderSessionsUsersSection
          selectedDays={meta.reference_period_days}
          snapshotPlatform={modules.platform}
          snapshotConversation={modules.conversation}
        />
        <FounderProductsCategoriesSection
          selectedDays={meta.reference_period_days}
          snapshotRecommendation={modules.recommendation}
          snapshotCommerce={modules.commerce}
        />
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
