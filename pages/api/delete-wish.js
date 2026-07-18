import { createClient } from "@supabase/supabase-js";
import {
  applyInternalSecurityHeaders,
  sendPolicyError,
  validateHttpMethod,
} from "../../lib/miaEndpointAccessPolicy.js";
import { requireUserSession } from "../../lib/miaUserSessionToken.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  applyInternalSecurityHeaders(res);

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  try {
    const { id, user_id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required", reasonCode: "invalid_request" });

    const session = requireUserSession(req, process.env, user_id);
    if (!session.ok) {
      return sendPolicyError(res, session.response);
    }

    const query = supabase.from("wishes").delete().eq("id", id).eq("user_id", session.userId);
    const { data, error } = await query.select();

    if (error) {
      console.error("delete-wish error:", error);
      return res.status(500).json({ error: "db_error", reasonCode: "internal_error" });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "not_found", reasonCode: "resource_not_found" });
    }

    return res.status(200).json({ success: true, deleted: data });
  } catch (err) {
    console.error("ERROR /api/delete-wish:", err);
    return res.status(500).json({ error: "internal_error", reasonCode: "internal_error" });
  }
}
