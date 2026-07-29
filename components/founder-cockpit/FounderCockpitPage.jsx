import FounderExecutiveInsights from "./FounderExecutiveInsights.jsx";
import FounderExecutiveKpisSection from "./FounderExecutiveKpisSection.jsx";
import FounderExecutiveGrowthSection from "./FounderExecutiveGrowthSection.jsx";
import FounderExecutiveProductHealthSection from "./FounderExecutiveProductHealthSection.jsx";
import FounderExecutiveCommercialPerformanceSection from "./FounderExecutiveCommercialPerformanceSection.jsx";
import FounderKpiStrip from "./FounderKpiStrip.jsx";
import FounderModuleSection from "./FounderModuleSection.jsx";
import FounderCockpitFilters from "./FounderCockpitFilters.jsx";
import { FounderCockpitFiltersProvider } from "./FounderCockpitFiltersContext.jsx";
import FounderSessionsUsersSection from "./FounderSessionsUsersSection.jsx";
import FounderProductsCategoriesSection from "./FounderProductsCategoriesSection.jsx";
import FounderPerformanceConversionSection from "./FounderPerformanceConversionSection.jsx";
import { formatPeriodSummary } from "../../lib/miaFounderFiltersDisplay.js";
import { TEILOR_LOGO_ALT, TEILOR_LOGO_PRIMARY_SRC } from "../../lib/brandAssets";

function FounderCockpitPageInner({ cockpit, subject, executiveMetrics = null }) {
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
            <button type="button" className="founder-logout-btn" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
        <p className="founder-cockpit-meta">
          {meta.filters_applied
            ? formatPeriodSummary({
                range: meta.filters_applied.range,
                period_mode: meta.filters_applied.period_mode,
                start_date: meta.filters_applied.start_date,
                end_date: meta.filters_applied.end_date,
                window_days: meta.reference_period_days,
              })
            : `Período: ${meta.reference_period_days} dias`}
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
        <FounderCockpitFilters />
        <FounderExecutiveKpisSection executiveMetrics={executiveMetrics} />
        <FounderExecutiveGrowthSection executiveMetrics={executiveMetrics} />
        <FounderExecutiveProductHealthSection executiveMetrics={executiveMetrics} />
        <FounderExecutiveCommercialPerformanceSection executiveMetrics={executiveMetrics} />
        <FounderExecutiveInsights />
        <FounderKpiStrip overview={overview} />
        <FounderSessionsUsersSection
          snapshotPlatform={modules.platform}
          snapshotConversation={modules.conversation}
        />
        <FounderProductsCategoriesSection
          snapshotRecommendation={modules.recommendation}
          snapshotCommerce={modules.commerce}
        />
        <FounderPerformanceConversionSection
          snapshotRecommendation={modules.recommendation}
          snapshotCommerce={modules.commerce}
          snapshotConversation={modules.conversation}
          snapshotAlerts={modules.alerts}
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

export default function FounderCockpitPage({ cockpit, subject, initialFilters, executiveMetrics = null }) {
  return (
    <FounderCockpitFiltersProvider initialFilters={initialFilters}>
      <FounderCockpitPageInner cockpit={cockpit} subject={subject} executiveMetrics={executiveMetrics} />
    </FounderCockpitFiltersProvider>
  );
}
