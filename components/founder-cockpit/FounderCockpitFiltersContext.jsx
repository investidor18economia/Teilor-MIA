import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  normalizeFounderFiltersFromQuery,
  buildFounderFiltersQueryObject,
  buildFounderFiltersQueryString,
} from "../../lib/miaAnalyticsFilterParams.js";
import { mapFounderFiltersToDisplay } from "../../lib/miaFounderFiltersDisplay.js";

const FounderCockpitFiltersContext = createContext(null);

/**
 * @param {{ children: React.ReactNode, initialFilters?: ReturnType<typeof normalizeFounderFiltersFromQuery> }} props
 */
export function FounderCockpitFiltersProvider({ children, initialFilters }) {
  const router = useRouter();
  const appliedFilters = useMemo(
    () => initialFilters ?? normalizeFounderFiltersFromQuery(router.query),
    [initialFilters, router.query]
  );
  const display = useMemo(() => mapFounderFiltersToDisplay(appliedFilters), [appliedFilters]);

  const [draft, setDraft] = useState(() => ({
    range: appliedFilters.range,
    start: appliedFilters.start_date ?? "",
    end: appliedFilters.end_date ?? "",
    category: appliedFilters.category ?? "",
    product_id: appliedFilters.product_id ?? "",
  }));
  const [pending, setPending] = useState(false);

  const syncDraftFromApplied = useCallback(() => {
    setDraft({
      range: appliedFilters.range,
      start: appliedFilters.start_date ?? "",
      end: appliedFilters.end_date ?? "",
      category: appliedFilters.category ?? "",
      product_id: appliedFilters.product_id ?? "",
    });
  }, [appliedFilters]);

  const setDraftField = useCallback((field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const buildQueryFromDraft = useCallback(() => {
    /** @type {Record<string, string>} */
    const raw = { range: draft.range };
    if (draft.range === "custom") {
      if (draft.start) raw.start = draft.start;
      if (draft.end) raw.end = draft.end;
    }
    if (draft.category) raw.category = draft.category;
    if (draft.product_id) raw.product_id = draft.product_id;
    return normalizeFounderFiltersFromQuery(raw);
  }, [draft]);

  const applyFilters = useCallback(async () => {
    const normalized = buildQueryFromDraft();
    if (!normalized.valid) return { ok: false, errors: normalized.errors };
    setPending(true);
    try {
      const query = buildFounderFiltersQueryObject(normalized);
      await router.push({ pathname: "/cockpit-fundador", query }, undefined, { scroll: false });
      return { ok: true, errors: [] };
    } finally {
      setPending(false);
    }
  }, [buildQueryFromDraft, router]);

  const clearFilters = useCallback(async () => {
    setPending(true);
    try {
      setDraft({ range: "30d", start: "", end: "", category: "", product_id: "" });
      await router.push({ pathname: "/cockpit-fundador", query: { range: "30d" } }, undefined, {
        scroll: false,
      });
    } finally {
      setPending(false);
    }
  }, [router]);

  const buildTemporalQueryString = useCallback(
    (series) => {
      const base = buildFounderFiltersQueryString(appliedFilters);
      const parts = [`series=${encodeURIComponent(series)}`];
      if (base) parts.unshift(base);
      return parts.join("&");
    },
    [appliedFilters]
  );

  const value = useMemo(
    () => ({
      appliedFilters,
      display,
      draft,
      pending,
      setDraftField,
      syncDraftFromApplied,
      applyFilters,
      clearFilters,
      buildTemporalQueryString,
      buildExecutiveQueryString: () => buildFounderFiltersQueryString(appliedFilters),
    }),
    [
      appliedFilters,
      display,
      draft,
      pending,
      setDraftField,
      syncDraftFromApplied,
      applyFilters,
      clearFilters,
      buildTemporalQueryString,
    ]
  );

  return (
    <FounderCockpitFiltersContext.Provider value={value}>{children}</FounderCockpitFiltersContext.Provider>
  );
}

export function useFounderCockpitFilters() {
  const ctx = useContext(FounderCockpitFiltersContext);
  if (!ctx) {
    throw new Error("useFounderCockpitFilters must be used within FounderCockpitFiltersProvider");
  }
  return ctx;
}
