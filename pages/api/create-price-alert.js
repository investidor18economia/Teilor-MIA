import { supabase } from "../../lib/supabaseClient";
import {
  buildPriceAlertInsertRow,
  normalizePriceAlertProductKey,
} from "../../lib/miaPriceAlertsSafety.js";
import {
  applyInternalSecurityHeaders,
  sendPolicyError,
  validateHttpMethod,
} from "../../lib/miaEndpointAccessPolicy.js";
import { requireUserSession } from "../../lib/miaUserSessionToken.js";

export default async function handler(req, res) {
  applyInternalSecurityHeaders(res);

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  try {
    const {
      user_id,
      user_email,
      product_name,
      product_url,
      product_thumbnail,
      source,
      current_price,
      target_price,
    } = req.body || {};

    const session = requireUserSession(req, process.env, user_id);
    if (!session.ok) {
      return sendPolicyError(res, session.response);
    }

    if (!session.userId || !product_name) {
      return res.status(400).json({ error: "Missing required fields", reasonCode: "invalid_request" });
    }

    const normalizedProductKey = normalizePriceAlertProductKey(product_name);
    const insertRow = buildPriceAlertInsertRow({
      user_id: session.userId,
      user_email,
      product_name,
      product_url,
      product_thumbnail,
      source,
      current_price,
      target_price,
    });

    if (normalizedProductKey) {
      const { data: existingAlerts, error: lookupError } = await supabase
        .from("price_alerts")
        .select("*")
        .eq("user_id", session.userId)
        .eq("normalized_product_key", normalizedProductKey)
        .eq("is_active", true)
        .limit(1);

      if (lookupError) {
        console.error("create-price-alert lookup error:", lookupError);
        return res.status(500).json({ error: "Failed to lookup alert", reasonCode: "internal_error" });
      }

      if (Array.isArray(existingAlerts) && existingAlerts.length > 0) {
        return res.status(200).json({
          success: true,
          already_exists: true,
          data: existingAlerts,
        });
      }
    }

    const { data, error } = await supabase.from("price_alerts").insert([insertRow]).select();

    if (error) {
      console.error("create-price-alert error:", error);
      return res.status(500).json({ error: "Failed to create alert", reasonCode: "internal_error" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("create-price-alert unexpected error:", err);
    return res.status(500).json({ error: "Internal server error", reasonCode: "internal_error" });
  }
}
