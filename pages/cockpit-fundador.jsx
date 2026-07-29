import Head from "next/head";
import FounderCockpitPage from "../components/founder-cockpit/FounderCockpitPage.jsx";
import FounderLoginGate from "../components/founder-cockpit/FounderLoginGate.jsx";
import { mapExecutiveMetricsToFounderCockpit } from "../lib/miaFounderCockpitDisplay.js";
import { requireFounderGate } from "../lib/miaFounderAccess.js";
import {
  normalizeFounderFiltersFromQuery,
  buildFounderFiltersQueryString,
} from "../lib/miaAnalyticsFilterParams.js";

/**
 * @param {import("next").GetServerSidePropsContext} context
 */
export async function getServerSideProps(context) {
  const gate = requireFounderGate(context.req);
  const filters = normalizeFounderFiltersFromQuery(context.query ?? {});

  if (!gate.ok) {
    return {
      props: {
        authorized: false,
        cockpit: null,
        fetchError: null,
        subject: null,
        filters,
        filterError: filters.valid ? null : filters.errors[0]?.code ?? "invalid_filters",
      },
    };
  }

  let metrics = null;
  let fetchError = null;
  let filterError = null;

  if (!filters.valid) {
    filterError = filters.errors[0]?.code ?? "invalid_filters";
  } else {
    try {
      const base =
        process.env.PUBLIC_METRICS_API_BASE_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const qs = buildFounderFiltersQueryString(filters);
      const res = await fetch(`${base.replace(/\/$/, "")}/api/executive-metrics?${qs}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        fetchError = `http_${res.status}`;
      } else {
        metrics = await res.json();
      }
    } catch (err) {
      fetchError = String(err?.message || "fetch_failed").slice(0, 120);
    }
  }

  return {
    props: {
      authorized: true,
      cockpit: mapExecutiveMetricsToFounderCockpit(metrics),
      executiveMetrics: metrics,
      fetchError,
      subject: gate.subject,
      filters,
      filterError,
    },
  };
}

/**
 * @param {{
 *   authorized: boolean,
 *   cockpit: object|null,
 *   fetchError: string|null,
 *   subject: string|null,
 *   filters: object,
 *   filterError: string|null,
 *   executiveMetrics: object|null,
 * }} props
 */
export default function CockpitFundadorPage({
  authorized,
  cockpit,
  fetchError,
  subject,
  filters,
  filterError,
  executiveMetrics = null,
}) {
  return (
    <>
      <Head>
        <title>Cockpit Executivo — Teilor</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Painel executivo privado da Teilor." />
      </Head>
      {!authorized ? (
        <FounderLoginGate />
      ) : filterError ? (
        <div className="founder-cockpit-page" role="alert">
          <header className="founder-cockpit-header">
            <h1>Cockpit Executivo</h1>
            <p>Filtros inválidos na URL ({filterError}).</p>
          </header>
        </div>
      ) : fetchError ? (
        <div className="founder-cockpit-page" role="alert">
          <header className="founder-cockpit-header">
            <h1>Cockpit Executivo</h1>
            <p>Métricas temporariamente indisponíveis ({fetchError}).</p>
          </header>
        </div>
      ) : (
        <FounderCockpitPage
          cockpit={cockpit}
          subject={subject}
          initialFilters={filters}
          executiveMetrics={executiveMetrics}
        />
      )}
    </>
  );
}
