import { useState } from "react";
import { useRouter } from "next/router";
import { FOUNDER_COCKPIT_PERIOD_OPTIONS } from "../../lib/miaFounderCockpitDisplay.js";

export default function FounderPeriodFilter({ selectedDays = 30, disabled = false }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSelect(days) {
    if (disabled || pending || days === selectedDays) return;
    setPending(true);
    try {
      await router.push({ pathname: "/cockpit-fundador", query: { days: String(days) } }, undefined, {
        scroll: false,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="founder-period-filter" role="group" aria-label="Período de análise">
      {FOUNDER_COCKPIT_PERIOD_OPTIONS.map((option) => {
        const active = option.days === selectedDays;
        return (
          <button
            key={option.days}
            type="button"
            className={`founder-period-btn${active ? " founder-period-btn--active" : ""}`}
            aria-pressed={active}
            disabled={disabled || pending}
            onClick={() => onSelect(option.days)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
