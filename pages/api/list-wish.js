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

  const methodCheck = validateHttpMethod(req, ["GET"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  try {
    const user_id = req.query.user_id || req.headers["x-user-id"];
    const session = requireUserSession(req, process.env, user_id);
    if (!session.ok) {
      return sendPolicyError(res, session.response);
    }

    const { data, error } = await supabase
      .from("wishes")
      .select("*")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("list-wish select error:", error);
      return res.status(500).json({ error: "db_error", reasonCode: "internal_error" });
    }

    return res.status(200).json({ success: true, wishes: data || [] });
  } catch (err) {
    console.error("ERROR /api/list-wish:", err);
    return res.status(500).json({ error: "internal_error", reasonCode: "internal_error" });
  }
}
