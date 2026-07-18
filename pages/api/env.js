import { applyInternalSecurityHeaders, sendNotFound } from "../../lib/miaEndpointAccessPolicy.js";

export default async function handler(req, res) {
  applyInternalSecurityHeaders(res);
  return sendNotFound(res);
}
