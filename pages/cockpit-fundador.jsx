import Head from "next/head";
import FounderCockpitPage from "../components/founder-cockpit/FounderCockpitPage.jsx";
import FounderLoginGate from "../components/founder-cockpit/FounderLoginGate.jsx";
import { mapExecutiveMetricsToFounderCockpit } from "../lib/miaFounderCockpitDisplay.js";
import { requireFounderGate } from "../lib/miaFounderAccess.js";

const VALID_DAYS = new Set([7, 30, 90, 365]);

function parseDays(raw) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return VALID_DAYS.has(n) ? n : 30;
}

/**
 * @param {import("next").GetServerSidePropsContext} context
 */
export async function getServerSideProps(context) {
  const gate = requireFounderGate(context.req);
  if (!gate.ok) {
    return {
      props: {
        authorized: false,
        cockpit: null,
        fetchError: null,
        subject: null,
        selectedDays: parseDays(context.query?.days),
      },
    };
  }

  const selectedDays = parseDays(context.query?.days);
  let metrics = null;
  let fetchError = null;

  try {
    const base =
      process.env.PUBLIC_METRICS_API_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const res = await fetch(
      `${base.replace(/\/$/, "")}/api/executive-metrics?days=${selectedDays}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      fetchError = `http_${res.status}`;
    } else {
      metrics = await res.json();
    }
  } catch (err) {
    fetchError = String(err?.message || "fetch_failed").slice(0, 120);
  }

  return {
    props: {
      authorized: true,
      cockpit: mapExecutiveMetricsToFounderCockpit(metrics),
      fetchError,
      subject: gate.subject,
      selectedDays,
    },
  };
}

/**
 * @param {{
 *   authorized: boolean,
 *   cockpit: object|null,
 *   fetchError: string|null,
 *   subject: string|null,
 *   selectedDays: number,
 * }} props
 */
export default function CockpitFundadorPage({ authorized, cockpit, fetchError, subject }) {
  return (
    <>
      <Head>
        <title>Cockpit Executivo — Teilor</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Painel executivo privado da Teilor." />
      </Head>
      {!authorized ? (
        <FounderLoginGate />
      ) : fetchError ? (
        <div className="founder-cockpit-page" role="alert">
          <header className="founder-cockpit-header">
            <h1>Cockpit Executivo</h1>
            <p>Métricas temporariamente indisponíveis ({fetchError}).</p>
          </header>
        </div>
      ) : (
        <FounderCockpitPage cockpit={cockpit} subject={subject} />
      )}
    </>
  );
}
