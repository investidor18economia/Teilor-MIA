import {
  applyInternalSecurityHeaders,
  gateLegacyEconomiaEndpoint,
  sendPolicyError,
} from "../../lib/miaEndpointAccessPolicy.js";

export default async function handler(req, res) {
  applyInternalSecurityHeaders(res);

  const legacyGate = gateLegacyEconomiaEndpoint(process.env);
  if (legacyGate.blocked) {
    return sendPolicyError(res, legacyGate.response);
  }

  const { default: legacyHandler } = await import("../../lib/economiaLegacyHandler.js");
  return legacyHandler(req, res);
}
