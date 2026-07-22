import {
  applyInternalSecurityHeaders,
  sendPolicyError,
  validateHttpMethod,
} from "../../lib/miaEndpointAccessPolicy.js";
import { withMiaObservability } from "../../lib/miaObservability.js";

async function registerUserHandler(req, res) {
  applyInternalSecurityHeaders(res);

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  return res.status(403).json({
    success: false,
    error: "verification_required",
    reasonCode: "auth_verification_required",
    message: "Use /api/auth/request-code and /api/auth/verify-code to authenticate.",
  });
}

export default withMiaObservability(registerUserHandler, { endpoint: "/api/register-user" });
