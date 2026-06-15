"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken } from "./invite-tokens";

type InviteValidation =
  | { ok: true }
  | { ok: false; reason: "invalid" | "used" | "expired" };

type SetPasswordResult = { ok: true } | { ok: false; error: string };

/// Verifica un token di invito (chiamata dalla pagina set-password al
/// caricamento, per mostrare subito "scaduto/usato" invece di farlo scoprire
/// dopo aver digitato la password).
export async function validateInviteToken(rawToken: string): Promise<InviteValidation> {
  if (!rawToken) return { ok: false, reason: "invalid" };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("invite_tokens")
    .select("used_at, expires_at")
    .eq("token_hash", hashInviteToken(rawToken))
    .maybeSingle();
  if (!data) return { ok: false, reason: "invalid" };
  if (data.used_at) return { ok: false, reason: "used" };
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

/// Imposta la password dell'utente associato al token e attiva l'account.
/// Service-role: valida il token, setta password + conferma email, porta lo
/// status a 'attivo', poi segna il token come usato (single-use).
export async function setPasswordFromInvite(
  rawToken: string,
  password: string,
): Promise<SetPasswordResult> {
  if (!rawToken) return { ok: false, error: "Link non valido" };
  if (!password || password.length < 8) {
    return { ok: false, error: "La password deve avere almeno 8 caratteri" };
  }

  const supabase = createAdminClient();
  const { data: tok } = await supabase
    .from("invite_tokens")
    .select("id, user_id, used_at, expires_at")
    .eq("token_hash", hashInviteToken(rawToken))
    .maybeSingle();

  if (!tok) return { ok: false, error: "Link non valido" };
  if (tok.used_at) return { ok: false, error: "Questo link e' gia' stato usato" };
  if (new Date(tok.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: "Link scaduto. Chiedi un nuovo invito all'amministratore." };
  }

  const userId = tok.user_id as string;

  // Imposta la password e conferma l'email (l'utente invitato non e' confermato).
  const { error: upErr } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (upErr) return { ok: false, error: upErr.message };

  // Attiva l'account: invitato -> attivo (cosi' puo' subito usare l'app).
  await supabase.from("profiles").update({ status: "attivo" }).eq("id", userId);

  // Single-use: segna il token come consumato.
  await supabase
    .from("invite_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tok.id);

  return { ok: true };
}
