/**
 * PATCH 3.3A — Auth challenge persistence helpers.
 */

import crypto from "crypto";
import {
  buildAuthChallengeExpiry,
  generateAuthOtpCode,
  hashAuthOtpCode,
  isAuthChallengeExpired,
  MIA_AUTH_CHALLENGE_PURPOSE,
  MIA_AUTH_MAX_ATTEMPTS,
  verifyAuthOtpCode,
} from "./miaAuthChallengeCrypto.js";

export const AUTH_CHALLENGE_SENT_MESSAGE =
  "Se o endereço puder receber mensagens, enviaremos um código de verificação.";

export async function invalidateActiveAuthChallenges(supabase, emailNormalized, now = new Date().toISOString()) {
  const { error } = await supabase
    .from("mia_auth_challenges")
    .update({ consumed_at: now })
    .eq("email_normalized", emailNormalized)
    .eq("purpose", MIA_AUTH_CHALLENGE_PURPOSE)
    .is("consumed_at", null);

  if (error) throw error;
}

export async function createAuthChallenge(
  supabase,
  { emailNormalized, pendingName = "" } = {},
  env = process.env,
  now = Date.now()
) {
  const challengeId = crypto.randomUUID();
  const code = generateAuthOtpCode();
  const tokenHash = hashAuthOtpCode(challengeId, code, env);
  const expiresAt = buildAuthChallengeExpiry(now);

  const { data, error } = await supabase
    .from("mia_auth_challenges")
    .insert([
      {
        id: challengeId,
        email_normalized: emailNormalized,
        token_hash: tokenHash,
        purpose: MIA_AUTH_CHALLENGE_PURPOSE,
        expires_at: expiresAt,
        attempt_count: 0,
        max_attempts: MIA_AUTH_MAX_ATTEMPTS,
        pending_name: pendingName || null,
      },
    ])
    .select()
    .limit(1);

  if (error) throw error;

  return {
    challenge: data?.[0] || null,
    code,
  };
}

export async function loadAuthChallengeById(supabase, challengeId) {
  const { data, error } = await supabase
    .from("mia_auth_challenges")
    .select("*")
    .eq("id", challengeId)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export function evaluateAuthChallengeState(challenge, now = Date.now()) {
  if (!challenge) {
    return { ok: false, reasonCode: "auth_challenge_not_found" };
  }
  if (challenge.consumed_at) {
    return { ok: false, reasonCode: "auth_challenge_consumed" };
  }
  if (isAuthChallengeExpired(challenge.expires_at, now)) {
    return { ok: false, reasonCode: "auth_challenge_expired" };
  }
  if (Number(challenge.attempt_count) >= Number(challenge.max_attempts || MIA_AUTH_MAX_ATTEMPTS)) {
    return { ok: false, reasonCode: "auth_challenge_attempts_exceeded" };
  }
  return { ok: true };
}

export async function incrementAuthChallengeAttempt(supabase, challengeId, attemptCount) {
  const { error } = await supabase
    .from("mia_auth_challenges")
    .update({ attempt_count: attemptCount + 1 })
    .eq("id", challengeId);

  if (error) throw error;
}

export async function consumeAuthChallenge(supabase, challengeId, now = new Date().toISOString()) {
  const { error } = await supabase
    .from("mia_auth_challenges")
    .update({ consumed_at: now })
    .eq("id", challengeId);

  if (error) throw error;
}

export function verifyAuthChallengeCode(challenge, code, env = process.env) {
  return verifyAuthOtpCode(challenge.id, code, challenge.token_hash, env);
}
