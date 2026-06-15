import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/// Durata del link di invito: 7 giorni (168 ore).
export const INVITE_TTL_HOURS = 168;

/// Hash con cui il token viene conservato in DB (mai in chiaro).
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/// Crea un token di invito per l'utente: genera un valore casuale a 256 bit,
/// ne salva l'HASH in invite_tokens con scadenza, e ritorna il token in chiaro
/// (da mettere nel link dell'email). Single-use, validato server-side.
export async function createInviteToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const supabase = createAdminClient();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();
  const { error } = await supabase.from("invite_tokens").insert({
    user_id: userId,
    token_hash: hashInviteToken(raw),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return raw;
}
