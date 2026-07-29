import { useMemo } from "react";
import { mapExecutiveSummaryToFounderDisplay } from "../../lib/miaFounderExecutiveSummaryDisplay.js";
import { useExecutiveModuleViews } from "./FounderExecutiveModuleViewsContext.jsx";
import { EXECUTIVE_MODULE_DISCLAIMERS } from "../../lib/miaFounderExecutivePolishCatalog.js";

function SummaryList({ title, items, emptyLabel, className }) {
  return (
    <div className={`founder-executive-summary-block ${className ?? ""}`}>
      <h3 className="founder-executive-summary-block-title">{title}</h3>
      {items.length ? (
        <ul className="founder-executive-summary-list">
          {items.map((item) => (
            <li key={item.id} className="founder-executive-summary-list-item">
              {item.rank != null ? (
                <span className="founder-executive-summary-priority-rank">{item.rank}.</span>
              ) : null}
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="founder-executive-summary-empty">{emptyLabel}</p>
      )}
    </div>
  );
}

export default function FounderExecutiveSummarySection() {
  const { views } = useExecutiveModuleViews();

  const display = useMemo(() => mapExecutiveSummaryToFounderDisplay(views), [views]);

  const anyModuleLoading = display.meta.modules_available < display.meta.modules_total;

  return (
    <section
      className="founder-executive-summary founder-executive-module"
      id="mod-resumo-executivo"
      aria-labelledby="heading-resumo-executivo"
    >
      <div className="founder-executive-summary-header">
        <div>
          <h2 className="founder-executive-summary-title" id="heading-resumo-executivo">
            Resumo Executivo
          </h2>
          <p className="founder-module-disclaimer" role="note">
            {EXECUTIVE_MODULE_DISCLAIMERS.summary}
          </p>
        </div>
        <span
          className={`founder-executive-badge founder-executive-badge--${display.headline.overall_level.id}`}
        >
          {display.headline.overall_level.label}
        </span>
      </div>

      {anyModuleLoading ? (
        <p className="founder-sessions-state founder-sessions-state--partial" role="status">
          Aguardando conclusão dos módulos executivos para síntese completa…
        </p>
      ) : null}

      {display.meta.status === "error" ? (
        <p className="founder-sessions-state founder-sessions-state--error" role="alert">
          Resumo executivo indisponível — nenhum módulo B.2–B.6 carregado.
        </p>
      ) : null}

      <div className="founder-executive-summary-narrative">
        <p className="founder-executive-summary-headline">{display.headline.text}</p>
        <p className="founder-executive-summary-body">{display.summary.text}</p>
        <p className="founder-executive-summary-confidence">
          {display.confidence.label}
          {display.confidence.note ? ` · ${display.confidence.note}` : ""}
        </p>
      </div>

      <div className="founder-executive-summary-grid">
        <SummaryList
          title="Prioridades"
          items={display.priorities}
          emptyLabel="Nenhuma prioridade crítica identificada no período."
          className="founder-executive-summary-block--priorities"
        />
        <SummaryList
          title="Oportunidades"
          items={display.opportunities}
          emptyLabel="Oportunidades em consolidação — aguardando mais sinais."
          className="founder-executive-summary-block--opportunities"
        />
        <SummaryList
          title="Riscos"
          items={display.risks}
          emptyLabel="Nenhum risco material identificado com os dados disponíveis."
          className="founder-executive-summary-block--risks"
        />
      </div>
    </section>
  );
}
