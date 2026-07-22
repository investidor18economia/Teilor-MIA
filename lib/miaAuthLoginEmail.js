/**
 * PATCH 3.3A — Send login OTP email via Resend.
 */

import { Resend } from "resend";
import { MIA_EMAIL_FROM } from "./miaPriceDropEmailTemplate.js";
import { logAudit } from "./miaLogger.js";

export const MIA_AUTH_LOGIN_EMAIL_SUBJECT = "Seu código de acesso — MIA da Teilor";

function getResendClient(env = process.env) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function isAuthEmailDeliveryConfigured(env = process.env) {
  return Boolean(String(env.RESEND_API_KEY || "").trim());
}

function buildLoginOtpEmailHtml(code) {
  const safeCode = String(code || "").replace(/[^\d]/g, "").slice(0, 8);
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <body style="font-family:Arial,sans-serif;background:#f7f7f8;padding:24px;color:#111;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#666;">MIA da Teilor</p>
      <h1 style="margin:0 0 16px;font-size:22px;">Seu código de acesso</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        Use o código abaixo para entrar na sua conta. Ele expira em 10 minutos.
      </p>
      <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:6px;">${safeCode}</p>
      <p style="margin:0;font-size:13px;color:#666;">
        Se você não solicitou este código, ignore este e-mail.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * @returns {Promise<{ ok: boolean, code?: string, error?: string, id?: string|null }>}
 */
export async function sendAuthLoginOtpEmail(to, code, env = process.env) {
  const recipient = String(to || "").trim();
  const otp = String(code || "").trim();
  if (!recipient || !otp) {
    return { ok: false, code: "invalid_recipient", error: "invalid_recipient" };
  }

  if (!isAuthEmailDeliveryConfigured(env)) {
    return { ok: false, code: "missing_api_key", error: "RESEND_API_KEY não configurada" };
  }

  const resend = getResendClient(env);
  if (!resend) {
    return { ok: false, code: "missing_api_key", error: "RESEND_API_KEY não configurada" };
  }

  const startedAt = Date.now();
  try {
    const result = await resend.emails.send({
      from: MIA_EMAIL_FROM,
      to: [recipient],
      subject: MIA_AUTH_LOGIN_EMAIL_SUBJECT,
      html: buildLoginOtpEmailHtml(otp),
    });

    logAudit({
      event: "auth_email_sent",
      provider: "resend",
      reasonCode: "auth_email_sent_ok",
      operation: "auth_login_otp",
      durationMs: Date.now() - startedAt,
      status: 200,
    });

    return { ok: true, id: result?.data?.id || null };
  } catch (error) {
    logAudit({
      event: "auth_email_failed",
      provider: "resend",
      reasonCode: "auth_email_send_failed",
      operation: "auth_login_otp",
      durationMs: Date.now() - startedAt,
      status: 500,
      message: error?.message || "unknown_error",
    });
    return {
      ok: false,
      code: "auth_email_send_failed",
      error: String(error?.message || "Erro ao enviar e-mail"),
    };
  }
}
