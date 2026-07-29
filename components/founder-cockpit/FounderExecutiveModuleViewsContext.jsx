import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** @typedef {"kpis"|"growth"|"health"|"commercial"|"operational"} ExecutiveModuleId */

const FounderExecutiveModuleViewsContext = createContext(null);

/**
 * @param {{ children: import("react").ReactNode }} props
 */
export function FounderExecutiveModuleViewsProvider({ children }) {
  const [views, setViews] = useState(
    /** @type {Record<ExecutiveModuleId, Record<string, unknown>|null>} */ ({
      kpis: null,
      growth: null,
      health: null,
      commercial: null,
      operational: null,
    })
  );

  const registerModuleView = useCallback(
    /** @param {ExecutiveModuleId} moduleId @param {Record<string, unknown>|null} view */ (
      moduleId,
      view
    ) => {
      setViews((prev) => {
        if (prev[moduleId] === view) return prev;
        return { ...prev, [moduleId]: view };
      });
    },
    []
  );

  const value = useMemo(() => ({ views, registerModuleView }), [views, registerModuleView]);

  return (
    <FounderExecutiveModuleViewsContext.Provider value={value}>
      {children}
    </FounderExecutiveModuleViewsContext.Provider>
  );
}

export function useExecutiveModuleViews() {
  const ctx = useContext(FounderExecutiveModuleViewsContext);
  if (!ctx) {
    return {
      views: { kpis: null, growth: null, health: null, commercial: null, operational: null },
      registerModuleView: () => {},
    };
  }
  return ctx;
}

/**
 * @param {ExecutiveModuleId} moduleId
 * @param {Record<string, unknown>|null|undefined} view
 */
export function useRegisterExecutiveModuleView(moduleId, view) {
  const { registerModuleView } = useExecutiveModuleViews();
  useEffect(() => {
    registerModuleView(moduleId, view ?? null);
  }, [moduleId, view, registerModuleView]);
}
