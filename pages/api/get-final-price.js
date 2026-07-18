import {
  applyInternalSecurityHeaders,
  gateLegacyInternalEndpoint,
  sendPolicyError,
  validateHttpMethod,
} from "../../lib/miaEndpointAccessPolicy.js";

export default async function handler(req, res) {
  applyInternalSecurityHeaders(res);

  const gate = gateLegacyInternalEndpoint(process.env);
  if (gate.blocked) {
    return sendPolicyError(res, gate.response);
  }

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  return res.status(404).json({
    error: "not_found",
    reasonCode: "endpoint_not_found",
  });
}
