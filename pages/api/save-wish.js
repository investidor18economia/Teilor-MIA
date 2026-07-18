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
    const { user_id, product_name, product_url, price, query } = req.body || {};
    const session = requireUserSession(req, process.env, user_id);
    if (!session.ok) {
      return sendPolicyError(res, session.response);
    }

    if (!session.userId) {
      return res.status(400).json({ error: "user_id is required", reasonCode: "invalid_request" });
    }
    if (!product_name && !query && !product_url) {
      return res.status(400).json({
        error: "Provide product_name or query or product_url",
        reasonCode: "invalid_request",
      });
    }

    const payload = {
      user_id: session.userId,
      query: query || null,
      product_name: product_name || null,
      product_url: product_url || null,
      price: price != null ? parseFloat(price) : null,
      last_price: price != null ? parseFloat(price) : null,
      last_checked: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("wishes").insert([payload]).select();

    if (error) {
      console.error("save-wish insert error:", error);
      return res.status(500).json({ error: "db_error", reasonCode: "internal_error" });
    }

    return res.status(201).json({ success: true, wish: data?.[0] || null });
  } catch (err) {
    console.error("ERROR /api/save-wish:", err);
    return res.status(500).json({ error: "internal_error", reasonCode: "internal_error" });
  }
}
