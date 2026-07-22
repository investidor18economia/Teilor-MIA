/**
 * PATCH 3.3A — Verified user resolution after OTP success.
 */

export async function findUserByEmail(supabase, emailNormalized) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", emailNormalized)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export async function resolveVerifiedUser(
  supabase,
  { emailNormalized, pendingName = "" } = {},
  now = new Date().toISOString()
) {
  const existing = await findUserByEmail(supabase, emailNormalized);
  const trimmedName = String(pendingName || "").trim();

  if (existing) {
    const updates = {
      email_verified_at: existing.email_verified_at || now,
    };

    if (trimmedName && !String(existing.name || "").trim()) {
      updates.name = trimmedName;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .limit(1);

    if (error) throw error;
    return { user: data?.[0] || existing, created: false };
  }

  const insertPayload = {
    email: emailNormalized,
    name: trimmedName || null,
    email_verified_at: now,
    created_at: now,
  };

  const { data, error } = await supabase.from("users").insert([insertPayload]).select().limit(1);
  if (error) throw error;

  return { user: data?.[0] || null, created: true };
}
