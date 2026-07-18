/**
 * PATCH 12E — Internal build metadata (never expose secrets).
 */

export const MIA_OBSERVABILITY_VERSION = "12E.1.0";

export function resolveBuildInfo(env = process.env) {
  return {
    version: MIA_OBSERVABILITY_VERSION,
    commit: String(env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT || "local").slice(0, 12),
    buildId: String(env.VERCEL_DEPLOYMENT_ID || env.BUILD_ID || "local").slice(0, 24),
    environment: String(env.VERCEL_ENV || env.NODE_ENV || "development"),
    deployTimestamp: env.VERCEL_DEPLOYMENT_CREATED_AT || null,
  };
}
