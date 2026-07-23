import Head from "next/head";
import PublicMetricsPage from "../components/public-metrics/PublicMetricsPage.jsx";
import { mapExecutiveMetricsToPublicPage } from "../lib/miaPublicMetricsDisplay.js";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://economia-ai.vercel.app";
const PAGE_PATH = "/teilor-em-numeros";
const REVALIDATE_SECONDS = Number(process.env.PUBLIC_METRICS_REVALIDATE_SECONDS || 300);

/**
 * @param {import("next").GetStaticPropsContext} _context
 */
export async function getStaticProps() {
  let metrics = null;
  let fetchError = null;

  try {
    const base =
      process.env.PUBLIC_METRICS_API_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const res = await fetch(`${base.replace(/\/$/, "")}/api/executive-metrics`, {
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

  const page = mapExecutiveMetricsToPublicPage(metrics);

  return {
    props: {
      page: JSON.parse(JSON.stringify(page, (_k, v) => (v === undefined ? null : v))),
      fetchError,
      fetchedAt: new Date().toISOString(),
    },
    revalidate: REVALIDATE_SECONDS,
  };
}

/**
 * @param {{ page: object, fetchError: string|null, fetchedAt: string }} props
 */
export default function TeilorEmNumerosPage({ page, fetchError, fetchedAt }) {
  const title = "Teilor em Números — Métricas públicas da plataforma";
  const description =
    "Métricas agregadas e transparentes da Teilor e da MIA: conversas, recomendações, inteligência comercial e economia potencial identificada.";
  const canonical = `${SITE_URL}${PAGE_PATH}`;

  const schemaOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Teilor",
    url: SITE_URL,
    description,
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="Teilor" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="robots" content="index, follow" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
        />
      </Head>
      {fetchError ? (
        <div className="public-metrics-page" role="alert">
          <header className="public-metrics-hero">
            <h1 className="public-metrics-hero-title">Teilor em Números</h1>
            <p className="public-metrics-hero-subtitle">
              Métricas temporariamente indisponíveis. Tente novamente em alguns minutos.
            </p>
          </header>
        </div>
      ) : (
        <PublicMetricsPage page={page} />
      )}
      {/* SSR timestamp for audit — not displayed */}
      <span hidden data-fetched-at={fetchedAt} />
    </>
  );
}
